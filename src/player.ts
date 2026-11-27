import * as THREE from 'three';
import { SpatialCollisionSystem } from './collision.ts';
import { AnimatedSoldierRig, WeaponGripPose } from './soldierRig.ts';
import { InventorySystem } from './inventory.ts';
import { ReloadSystem, ReloadStateSnapshot } from './reloadSystem.ts';
import { ControlsSettingsManager } from './controlsSettings.ts';

interface TracerEffect {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface BulletDecal {
  mesh: THREE.Mesh;
  life: number;
}

interface ThrownGrenade {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  fuse: number;
  damage: number;
}

interface ExplosionEffect {
  sphere: THREE.Mesh;
  light: THREE.PointLight;
  sparks: { mesh: THREE.Mesh; vel: THREE.Vector3 }[];
  life: number;
  maxLife: number;
}

export class PlayerController {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  scene: THREE.Scene;
  collision: SpatialCollisionSystem;
  inventory: InventorySystem | null = null;

  // Position & Physics
  position: THREE.Vector3;
  velocity = new THREE.Vector3();
  isGrounded = false;
  playerRadius = 0.36;
  standingHeight = 1.78;
  crouchingHeight = 1.24;
  playerHeight = 1.78;
  eyeHeight = 1.62;
  stepUpHeight = 0.45;
  private stairSlopeBlend = 0;
  private isOnStairs = false;
  private justJumpedTimer = 0;

  // Camera Settings
  isFirstPerson = false;
  isCrouching = false;
  tpDistance = 3.6;
  tpHeightOffset = 1.48;
  tpSideOffset = 0.55;
  yaw = 0;
  pitch = 0;
  private screenShake = 0;
  private recoilPitch = 0;

  // Aim Down Sights (ADS)
  isAiming = false;
  currentFov = 72;
  targetFov = 72;

  // Controls input
  keys: { [key: string]: boolean } = {};
  isPointerLocked = false;
  private isLeftMouseDown = false;
  private fireCooldown = 0;
  private actionTimer = 0;
  private actionDuration = 0.2;
  private reloadSystem: ReloadSystem | null = null;
  private reloadSnapshot: ReloadStateSnapshot = {
    isReloading: false,
    progress: 0,
    stage: 'none',
    remainingSec: 0,
    durationSec: 0
  };
  private controlsSettings!: ControlsSettingsManager;
  private pendingGrenadeThrow = false;
  private grenadeThrownInSwing = false;

  // Main Soldier Character Rig
  avatarGroup = new THREE.Group();
  soldierRig = new AnimatedSoldierRig();
  walkCycle = 0;

  // Flashlight (No shadow casting)
  flashlight: THREE.SpotLight;
  flashlightTarget = new THREE.Object3D();
  flashlightOn = false;

  // FPV Rig & Equipped Item
  fpvHandGroup = new THREE.Group();
  private fpvPivot = new THREE.Group();
  private fpvItemMount = new THREE.Group();
  private fpvTorchGroup = new THREE.Group();
  private fpvMuzzleFlash: THREE.Mesh;
  private tpvMuzzleFlash: THREE.Mesh;
  private muzzleFlashTimer = 0;
  private equippedSyncId = '';

  // Active FX & Projectiles
  private tracers: TracerEffect[] = [];
  private grenades: ThrownGrenade[] = [];
  private explosions: ExplosionEffect[] = [];
  private decals: BulletDecal[] = [];
  private static readonly MAX_DECALS = 50;
  private static bulletDecalTex: THREE.CanvasTexture | null = null;
  private audioCtx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastStepIndex = -1;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    scene: THREE.Scene,
    collision: SpatialCollisionSystem
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.collision = collision;

    // Ground Spawn at Tower Alpha South Plaza beside Army Crate, Patrol Cruiser & Roadblock
    this.position = new THREE.Vector3(-2.5, 0.25, 16.5);

    this.flashlight = new THREE.SpotLight(0xfff4dc, 0, 50, Math.PI / 5.2, 0.5, 1.1);
    this.flashlight.castShadow = false;
    this.scene.add(this.flashlight);
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Attach Skinned Soldier Model (`military_man_army_man_soldier.glb`)
    this.avatarGroup.add(this.soldierRig.root);
    this.scene.add(this.avatarGroup);
    this.soldierRig.load();

    // Shared Muzzle Flash meshes
    const flashGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.92 });
    this.fpvMuzzleFlash = new THREE.Mesh(flashGeo, flashMat);
    this.fpvMuzzleFlash.visible = false;
    this.tpvMuzzleFlash = new THREE.Mesh(flashGeo.clone(), flashMat.clone());
    this.tpvMuzzleFlash.visible = false;
    this.scene.add(this.tpvMuzzleFlash);

    this.createFpvViewmodel();
    this.controlsSettings = new ControlsSettingsManager(this.domElement, {
      onFireStart: () => {
        if (this.controlsSettings.isSettingsOpen) return;
        this.isLeftMouseDown = true;
        this.triggerPrimaryUse();
      },
      onFireEnd: () => {
        this.isLeftMouseDown = false;
      },
      onAimToggle: () => {
        this.isAiming = !this.isAiming;
        this.targetFov = this.isAiming ? 46 : 62;
      },
      onReload: () => this.tryStartReload(),
      onJump: () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        window.setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })), 80);
      },
      onCrouchToggle: () => {
        this.isCrouching = !this.isCrouching;
      },
      onCameraToggle: () => this.toggleCameraMode(),
      onFlashlightToggle: () => {
        this.flashlightOn = !this.flashlightOn;
        this.flashlight.intensity = this.flashlightOn ? 18.0 : 0;
      },
      onLookDelta: (dx, dy) => {
        if (this.controlsSettings.isSettingsOpen) return;
        const sensitivity = this.controlsSettings.getEffectiveTouchSensitivity(this.isAiming);
        this.yaw -= dx * sensitivity;
        this.pitch -= dy * sensitivity * this.controlsSettings.getYSign();
        const maxPitch = Math.PI / 2 - 0.05;
        this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
      }
    });
    this.setupEventListeners();
  }

  setInventory(inventory: InventorySystem) {
    this.inventory = inventory;
    this.reloadSystem = new ReloadSystem(inventory, (stage) => this.playProceduralTone(stage));
    this.inventory.onSelectionChanged(() => {
      this.reloadSystem?.cancelReload();
      this.syncEquippedWeapon();
    });
    this.inventory.onPlayerDeath(() => {
      // Respawn cleanly on Ground Plaza with all weapons preserved in 10-slot inventory!
      this.teleport(-2.5, 0.25, 16.5, 0);
      this.isCrouching = false;
      this.reloadSystem?.cancelReload();
    });
    this.syncEquippedWeapon();
  }

  async syncEquippedWeapon() {
    if (!this.inventory) return;
    const item = this.inventory.activeItem;
    const syncKey = item ? `${this.inventory.activeSlot}:${item.templateId}:${item.kind}` : `empty:${this.inventory.activeSlot}`;
    if (syncKey === this.equippedSyncId && this.fpvItemMount.children.length > 0) return;
    this.equippedSyncId = syncKey;

    while (this.fpvItemMount.children.length > 0) {
      this.fpvItemMount.remove(this.fpvItemMount.children[0]);
    }
    this.soldierRig.attachRightHandItem(null);

    if (!item || item.kind === 'ammo') {
      this.fpvTorchGroup.visible = true;
      return;
    }

    this.fpvTorchGroup.visible = false;
    const [fpvMesh, tpvMesh] = await Promise.all([
      this.inventory.createWeaponOrItemMesh(item.templateId, 'fpv'),
      this.inventory.createWeaponOrItemMesh(item.templateId, 'hand')
    ]);

    // Guard against async race if user pressed another number key mid-load
    const current = this.inventory.activeItem;
    const nowKey = current ? `${this.inventory.activeSlot}:${current.templateId}:${current.kind}` : `empty:${this.inventory.activeSlot}`;
    if (nowKey !== syncKey) return;

    if (fpvMesh) {
      this.fpvItemMount.add(fpvMesh);
      if (item.grip === 'knife') {
        fpvMesh.rotation.set(-0.35, -0.18, 0.28);
      } else if (item.grip === 'grenade' || item.grip === 'food') {
        fpvMesh.position.set(0.0, 0.03, -0.06);
      }
    }
    if (tpvMesh) {
      this.soldierRig.attachRightHandItem(tpvMesh);
    }
  }

  private createFpvViewmodel() {
    const sleeveMat = new THREE.MeshLambertMaterial({ color: 0x3b482c });
    const gloveMat = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x1a1e24 });

    this.fpvPivot.position.set(0.24, -0.22, -0.42);
    this.fpvPivot.rotation.set(0.06, 0.10, 0.03);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.42, 7), sleeveMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0.02, -0.05, 0.22);
    this.fpvPivot.add(arm);

    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.072, 0.095), gloveMat);
    glove.position.set(0, -0.015, 0.0);
    this.fpvPivot.add(glove);

    this.fpvItemMount.position.set(0, 0.025, -0.05);
    this.fpvPivot.add(this.fpvItemMount);

    this.fpvMuzzleFlash.position.set(0, 0.07, -0.62);
    this.fpvPivot.add(this.fpvMuzzleFlash);

    const torchHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.19, 8), metalMat);
    torchHandle.rotation.x = Math.PI / 2;
    torchHandle.position.set(0, 0.01, -0.08);
    this.fpvTorchGroup.add(torchHandle);

    const torchHead = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.055, 8), metalMat);
    torchHead.rotation.x = Math.PI / 2;
    torchHead.position.set(0, 0.01, -0.19);
    this.fpvTorchGroup.add(torchHead);

    const torchLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.01, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff5d6 })
    );
    torchLens.rotation.x = Math.PI / 2;
    torchLens.position.set(0, 0.01, -0.22);
    this.fpvTorchGroup.add(torchLens);

    this.fpvPivot.add(this.fpvTorchGroup);
    this.fpvHandGroup.add(this.fpvPivot);
    this.camera.add(this.fpvHandGroup);
    this.scene.add(this.camera);
  }

  private setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Keys 1..9 & 0 strictly select inventory hotbar slots (NEVER teleport!)
      if (this.inventory) {
        if (e.code >= 'Digit1' && e.code <= 'Digit9') {
          this.inventory.selectSlot(Number(e.code.replace('Digit', '')) - 1);
          this.reloadSystem?.cancelReload();
          return;
        }
        if (e.code === 'Digit0') {
          this.inventory.selectSlot(9);
          this.reloadSystem?.cancelReload();
          return;
        }
      }

      if (e.code === 'KeyO') {
        this.controlsSettings?.toggleSettingsPanel();
      } else if (e.code === 'KeyV') {
        this.toggleCameraMode();
      } else if (e.code === 'KeyF') {
        this.flashlightOn = !this.flashlightOn;
        this.flashlight.intensity = this.flashlightOn ? 18.0 : 0;
      } else if (e.code === 'KeyC' || e.code === 'ControlLeft') {
        this.isCrouching = !this.isCrouching;
      } else if (e.code === 'KeyR') {
        this.tryStartReload();
      } else if (e.code === 'KeyQ') {
        if (this.inventory) {
          this.inventory.dropActiveItem(this.position, this.yaw);
        }
      } else if (e.code === 'KeyH') {
        const shown = this.collision.toggleDebugWireframes();
        const badge = document.getElementById('hitbox-status');
        if (badge) {
          const total = this.collision.allAABBs.length + this.collision.allOBBs.length;
          badge.innerText = `${shown ? 'ON' : 'OFF'} [H] (${total} boxes)`;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.inventory || this.controlsSettings?.isSettingsOpen) return;
        const dir = e.deltaY > 0 ? 1 : -1;
        const next = (this.inventory.activeSlot + dir + 10) % 10;
        this.inventory.selectSlot(next);
        this.reloadSystem?.cancelReload();
      },
      { passive: true }
    );

    let isDraggingLook = false;
    this.domElement.addEventListener('mousedown', (e) => {
      if (this.controlsSettings?.isSettingsOpen) return;
      if (e.button === 0) {
        this.isLeftMouseDown = true;
        if (!this.isPointerLocked) {
          isDraggingLook = true;
          try {
            const promise = this.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
            if (promise && typeof promise.catch === 'function') promise.catch(() => {});
          } catch {
            // Ignore in embedded preview contexts
          }
        }
        this.triggerPrimaryUse();
      } else if (e.button === 2) {
        this.isAiming = true;
        this.targetFov = 46;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isLeftMouseDown = false;
        isDraggingLook = false;
      } else if (e.button === 2) {
        this.isAiming = false;
        this.targetFov = 72;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if ((!this.isPointerLocked && !isDraggingLook) || this.controlsSettings?.isSettingsOpen) return;
      const sensitivity = this.controlsSettings.getEffectiveMouseSensitivity(this.isAiming);
      // Clamp pointer-lock delta spikes on focus regain so the camera never snaps violently
      const dx = Math.max(-120, Math.min(120, e.movementX));
      const dy = Math.max(-120, Math.min(120, e.movementY));
      this.yaw -= dx * sensitivity;
      this.pitch -= dy * sensitivity * this.controlsSettings.getYSign();
      const maxPitch = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  tryStartReload() {
    if (!this.reloadSystem) return;
    this.reloadSystem.tryStartReload();
  }

  triggerPrimaryUse() {
    if (!this.inventory || this.fireCooldown > 0 || this.reloadSystem?.reloading) return;
    const item = this.inventory.activeItem;
    const tpl = this.inventory.activeTemplate;
    if (!item || !tpl) return;

    if (item.kind === 'weapon') {
      if (item.clip <= 0) {
        this.tryStartReload();
        return;
      }
      item.clip -= 1;
      this.inventory.refreshHud();
      this.fireCooldown = 1 / Math.max(1, tpl.fireRate ?? 4);
      this.actionDuration = Math.min(0.26, this.fireCooldown);
      this.actionTimer = this.actionDuration;

      this.fireWeaponRays(tpl.pellets ?? 1, tpl.spread ?? 0.015, tpl.grip === 'shotgun' ? 0.036 : 0.012);
      this.playProceduralTone(
        tpl.grip === 'shotgun' ? 'shotgun' : tpl.grip === 'rifle' ? 'rifle' : tpl.grip === 'pistol' ? 'pistol' : 'smg'
      );
    } else if (item.kind === 'melee') {
      this.fireCooldown = 0.42;
      this.actionDuration = 0.36;
      this.actionTimer = 0.36;
      this.inventory.energy = Math.max(0, this.inventory.energy - 0.3);
      this.performMeleeStrike();
      this.playProceduralTone('knife');
    } else if (item.kind === 'grenade') {
      if (this.pendingGrenadeThrow) return;
      this.fireCooldown = 0.65;
      this.actionDuration = 0.46;
      this.actionTimer = 0.46;
      this.pendingGrenadeThrow = true;
      this.grenadeThrownInSwing = false;
    } else if (item.kind === 'food') {
      this.fireCooldown = 0.72;
      this.actionDuration = 0.64;
      this.actionTimer = 0.64;
      this.inventory.consumeFoodInActiveSlot();
      this.playProceduralTone('eat');
    }
  }

  private getLookDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  /**
   * Casts a ray from the camera center (screen crosshair) to find the exact 3D point in the world
   * that the crosshair is currently aiming at.
   */
  getCrosshairTarget(maxDist = 120): { point: THREE.Vector3; hit: boolean; normal: THREE.Vector3; distance: number } {
    const camDir = this.camera.getWorldDirection(new THREE.Vector3());
    const camOrigin = this.camera.position.clone();
    const hit = this.collision.raycastWorld(camOrigin, camDir, maxDist);
    if (hit) {
      return { point: hit.point, hit: true, normal: hit.normal, distance: hit.distance };
    }
    return {
      point: camOrigin.addScaledVector(camDir, maxDist),
      hit: false,
      normal: new THREE.Vector3(0, 1, 0),
      distance: maxDist
    };
  }

  private fireWeaponRays(pellets: number, spread: number, kick: number) {
    // 1. Point of impact: exact spot the crosshair is aiming at in the world
    const crosshair = this.getCrosshairTarget(120);
    const targetBase = crosshair.point;

    // 2. Muzzle origin: barrel tip of the actual weapon mesh in world space
    let muzzleOrigin: THREE.Vector3;
    if (this.isFirstPerson) {
      // FPV: get fpvMuzzleFlash world position (placed at gun barrel tip)
      this.fpvMuzzleFlash.updateWorldMatrix(true, false);
      muzzleOrigin = new THREE.Vector3();
      this.fpvMuzzleFlash.getWorldPosition(muzzleOrigin);
    } else {
      // TPV: get barrel tip from soldier rig right-hand mount
      muzzleOrigin = this.soldierRig.getRightHandWorldPos(0.45);
    }

    this.muzzleFlashTimer = 0.06;
    this.recoilPitch = Math.min(0.14, this.recoilPitch + kick);
    this.screenShake = Math.max(this.screenShake, kick * 0.4);

    if (!this.isFirstPerson) {
      this.tpvMuzzleFlash.position.copy(muzzleOrigin);
      this.tpvMuzzleFlash.visible = true;
    } else {
      this.fpvMuzzleFlash.visible = true;
    }

    for (let p = 0; p < pellets; p++) {
      let targetPt = targetBase.clone();
      if (p > 0 || (!this.isAiming && spread > 0)) {
        // Spread slightly around crosshair target point
        const dist = Math.max(1, muzzleOrigin.distanceTo(targetBase));
        const spreadScale = dist * spread * (this.isAiming ? 0.35 : 1.0);
        const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        targetPt.addScaledVector(camRight, (Math.random() - 0.5) * spreadScale);
        targetPt.addScaledVector(camUp, (Math.random() - 0.5) * spreadScale);
      }

      // Raycast from gun barrel tip towards targetPt
      const shotDir = targetPt.clone().sub(muzzleOrigin);
      const shotDist = shotDir.length();
      shotDir.normalize();

      const hit = this.collision.raycastWorld(muzzleOrigin, shotDir, shotDist + 0.5);
      const hitPoint = hit && hit.distance <= shotDist + 0.2 ? hit.point : targetPt;
      const hitNormal = hit ? hit.normal : (crosshair.hit ? crosshair.normal : new THREE.Vector3(0, 1, 0));

      // Visual tracer line originates from the tip of the gun and hits the crosshair spot
      this.spawnTracer(muzzleOrigin, hitPoint);

      if (hit || crosshair.hit) {
        this.spawnImpactSpark(hitPoint, 0xffd25a);
        this.spawnBulletDecal(hitPoint, hitNormal);
      }
    }
  }

  private performMeleeStrike() {
    const dir = this.getLookDirection();
    const origin = this.position.clone().add(new THREE.Vector3(0, this.isCrouching ? 1.0 : 1.4, 0));
    const hit = this.collision.raycastWorld(origin, dir, 2.2);
    if (hit) {
      this.spawnImpactSpark(hit.point, 0xdfe6e9);
    }
  }

  private async launchGrenadeFromHand() {
    if (!this.inventory) return;
    const tpl = this.inventory.consumeOneGrenade();
    if (!tpl) return;

    const dir = this.getLookDirection();
    const startPos = this.position.clone().add(new THREE.Vector3(0, this.isCrouching ? 1.08 : 1.44, 0)).addScaledVector(dir, 0.45);
    const mesh = await this.inventory.createWeaponOrItemMesh(tpl.id, 'world');
    const obj = mesh ?? new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3b482c }));

    // Add small visible red blinking fuse glow so thrown grenade stays easy to track
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4757 })
    );
    spark.position.y = 0.08;
    obj.add(spark);
    obj.position.copy(startPos);
    this.scene.add(obj);

    const vel = dir.clone().multiplyScalar(15.5);
    vel.y += 4.2;
    this.grenades.push({
      mesh: obj,
      velocity: vel,
      fuse: 2.1,
      damage: tpl.damage ?? 95
    });
    this.playProceduralTone('throw');
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3) {
    const delta = end.clone().sub(start);
    const dist = Math.max(0.2, Math.min(delta.length(), 110));
    const mid = start.clone().addScaledVector(delta.normalize(), dist * 0.5);
    const geo = new THREE.CylinderGeometry(0.008, 0.014, dist, 4);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffeaa7, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.lookAt(end);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.09, maxLife: 0.09 });
  }

  private spawnImpactSpark(pos: THREE.Vector3, color: number) {
    const geo = new THREE.SphereGeometry(0.05, 5, 5);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.16, maxLife: 0.16 });
  }

  private static getBulletDecalTexture(): THREE.CanvasTexture {
    if (PlayerController.bulletDecalTex) return PlayerController.bulletDecalTex;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, 64, 64);

    // Chipped concrete / charred damage ring
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 28);
    grad.addColorStop(0, 'rgba(15, 15, 15, 0.96)');
    grad.addColorStop(0.35, 'rgba(30, 30, 30, 0.88)');
    grad.addColorStop(0.68, 'rgba(65, 65, 65, 0.50)');
    grad.addColorStop(0.92, 'rgba(110, 110, 110, 0.18)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();

    // Radial impact fractures
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.78)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const r1 = 6 + Math.random() * 4;
      const r2 = 20 + Math.random() * 8;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(ang) * r1, 32 + Math.sin(ang) * r1);
      ctx.lineTo(32 + Math.cos(ang) * r2, 32 + Math.sin(ang) * r2);
      ctx.stroke();
    }

    // Deep penetration bullet core
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(32, 32, 7.5, 0, Math.PI * 2);
    ctx.fill();

    PlayerController.bulletDecalTex = new THREE.CanvasTexture(canvas);
    return PlayerController.bulletDecalTex;
  }

  /** Spawn a realistic bullet-hole damage decal on the hit surface. */
  private spawnBulletDecal(pos: THREE.Vector3, normal: THREE.Vector3) {
    const size = 0.10 + Math.random() * 0.05;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      map: PlayerController.getBulletDecalTexture(),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Position slightly off surface to prevent z-fighting
    mesh.position.copy(pos).addScaledVector(normal, 0.006);
    // Orient the plane to face along the hit normal
    mesh.lookAt(pos.clone().add(normal));
    // Random rotation around normal for variety
    mesh.rotateZ(Math.random() * Math.PI * 2);
    this.scene.add(mesh);
    this.decals.push({ mesh, life: 25.0 }); // persist ~25 seconds

    // Pool limit: remove oldest decals when over budget
    while (this.decals.length > PlayerController.MAX_DECALS) {
      const old = this.decals.shift()!;
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      (old.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
  }

  private detonateGrenade(pos: THREE.Vector3, maxDmg: number) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7f24, transparent: true, opacity: 0.92 })
    );
    sphere.position.copy(pos);
    this.scene.add(sphere);

    const light = new THREE.PointLight(0xff8c32, 12, 22, 1.5);
    light.castShadow = false;
    light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(light);

    const sparks: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff4757 : 0xffd32a })
      );
      m.position.copy(pos);
      this.scene.add(m);
      sparks.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 14, 3 + Math.random() * 9, (Math.random() - 0.5) * 14)
      });
    }

    this.explosions.push({ sphere, light, sparks, life: 0.55, maxLife: 0.55 });
    this.playProceduralTone('explosion');

    // Camera shake & splash damage if standing close to explosion
    const dist = this.position.distanceTo(pos);
    if (dist < 18) {
      this.screenShake = Math.max(this.screenShake, (1 - dist / 18) * 0.25);
    }
    if (this.inventory && dist < 5.5) {
      const falloff = Math.max(0, 1 - dist / 5.5);
      this.inventory.applyDamage(Math.round(maxDmg * 0.6 * falloff), 'Explosion Blast');
    }
  }

  private updateCombatAndProjectiles(delta: number) {
    if (this.fireCooldown > 0) this.fireCooldown -= delta;
    if (this.reloadSystem) {
      this.reloadSnapshot = this.reloadSystem.update(delta);
    }
    if (this.actionTimer > 0) {
      this.actionTimer -= delta;
      if (this.pendingGrenadeThrow && !this.grenadeThrownInSwing && this.actionTimer <= this.actionDuration * 0.45) {
        this.grenadeThrownInSwing = true;
        this.pendingGrenadeThrow = false;
        this.launchGrenadeFromHand();
      }
      if (this.actionTimer < 0) this.actionTimer = 0;
    }

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= delta;
      if (this.muzzleFlashTimer <= 0) {
        this.fpvMuzzleFlash.visible = false;
        this.tpvMuzzleFlash.visible = false;
      }
    }

    // Continuous full-auto trigger when holding LMB with an automatic gun
    if (this.isLeftMouseDown && this.inventory && this.fireCooldown <= 0 && !this.reloadSystem?.reloading) {
      const tpl = this.inventory.activeTemplate;
      if (tpl?.kind === 'weapon' && tpl.automatic) {
        this.triggerPrimaryUse();
      }
    }

    // Tracers & impact sparks fadeout
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= delta;
      const mat = t.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, t.life / t.maxLife);
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        mat.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Bullet decal fadeout
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= delta;
      // Start fading in the last 5 seconds
      if (d.life < 5.0) {
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (d.life / 5.0) * 0.72);
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.decals.splice(i, 1);
      }
    }

    // Physical bouncing grenades
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= delta;
      g.velocity.y -= 18.5 * delta;

      const stepDist = g.velocity.length() * delta;
      if (stepDist > 0.005) {
        const moveDir = g.velocity.clone().normalize();
        const hit = this.collision.raycastWorld(g.mesh.position, moveDir, stepDist + 0.14);
        if (hit && hit.distance <= stepDist + 0.12) {
          g.mesh.position.copy(hit.point).addScaledVector(hit.normal, 0.1);
          const vn = g.velocity.dot(hit.normal);
          if (vn < 0) {
            g.velocity.addScaledVector(hit.normal, -1.38 * vn);
            g.velocity.multiplyScalar(0.66);
          }
        } else {
          g.mesh.position.addScaledVector(g.velocity, delta);
        }
      }

      const floorBelow = this.collision.findGroundHeightBelow(g.mesh.position, 0.1, 0.25);
      if (floorBelow !== null && g.mesh.position.y <= floorBelow + 0.06 && g.velocity.y < 0) {
        g.mesh.position.y = floorBelow + 0.06;
        g.velocity.y = Math.abs(g.velocity.y) > 1.2 ? -g.velocity.y * 0.35 : 0;
        g.velocity.x *= 0.78;
        g.velocity.z *= 0.78;
      }

      g.mesh.rotation.x += g.velocity.length() * delta * 1.4;
      g.mesh.rotation.z += delta * 4.5;

      if (g.fuse <= 0) {
        const blastPos = g.mesh.position.clone();
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
        this.detonateGrenade(blastPos, g.damage);
      }
    }

    // Explosion expansions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.life -= delta;
      const p = 1 - Math.max(0, ex.life / ex.maxLife);
      const scale = 1 + p * 6.5;
      ex.sphere.scale.setScalar(scale);
      (ex.sphere.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.85;
      ex.light.intensity = (1 - p) * 14;

      for (const s of ex.sparks) {
        s.vel.y -= 16 * delta;
        s.mesh.position.addScaledVector(s.vel, delta);
      }

      if (ex.life <= 0) {
        this.scene.remove(ex.sphere);
        this.scene.remove(ex.light);
        for (const s of ex.sparks) this.scene.remove(s.mesh);
        this.explosions.splice(i, 1);
      }
    }

    this.recoilPitch *= Math.pow(0.001, delta);
    this.screenShake *= Math.pow(0.002, delta);
  }

  private ensureAudioContext(): AudioContext | null {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      if (!this.audioCtx) this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (!this.noiseBuffer) {
        const len = Math.floor(this.audioCtx.sampleRate * 1.5);
        this.noiseBuffer = this.audioCtx.createBuffer(1, len, this.audioCtx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Realistic percussive acoustic synthesis for real-world gunfire transients, blasts, knife slashes & foley.
   */
  private playProceduralTone(kind: 'smg' | 'shotgun' | 'rifle' | 'pistol' | 'knife' | 'reload' | 'mag_out' | 'mag_in' | 'bolt_rack' | 'throw' | 'explosion' | 'eat') {
    const ctx = this.ensureAudioContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const triggerNoiseBurst = (startOffset: number, dur: number, filterType: BiquadFilterType, freqStart: number, freqEnd: number, gainPeak: number, q = 0.8) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(freqStart, now + startOffset);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + startOffset + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainPeak, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now + startOffset);
      src.stop(now + startOffset + dur + 0.02);
    };

    const triggerPunch = (freqStart: number, freqEnd: number, dur: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, freqEnd), now + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainPeak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.01);
    };

    if (kind === 'smg') {
      triggerPunch(155, 42, 0.045, 0.24);
      triggerNoiseBurst(0, 0.075, 'bandpass', 2200, 520, 0.28, 0.7);
      triggerNoiseBurst(0.01, 0.14, 'lowpass', 950, 220, 0.14, 0.6);
    } else if (kind === 'pistol') {
      triggerPunch(190, 48, 0.04, 0.22);
      triggerNoiseBurst(0, 0.065, 'highpass', 1400, 620, 0.26, 0.6);
      triggerNoiseBurst(0.005, 0.12, 'bandpass', 1600, 380, 0.16, 0.9);
    } else if (kind === 'rifle') {
      triggerPunch(170, 38, 0.065, 0.30);
      triggerNoiseBurst(0, 0.095, 'bandpass', 2600, 650, 0.34, 0.65);
      triggerNoiseBurst(0.012, 0.22, 'lowpass', 1100, 240, 0.20, 0.5);
    } else if (kind === 'shotgun') {
      triggerPunch(115, 28, 0.13, 0.42);
      triggerNoiseBurst(0, 0.24, 'lowpass', 2400, 260, 0.40, 0.55);
      triggerNoiseBurst(0.015, 0.34, 'bandpass', 850, 210, 0.24, 0.7);
      // Crisp metallic pump-rack click ~0.26s after blast
      triggerNoiseBurst(0.25, 0.04, 'bandpass', 2800, 1400, 0.09, 2.2);
    } else if (kind === 'explosion') {
      triggerPunch(92, 22, 0.42, 0.55);
      triggerNoiseBurst(0, 0.85, 'lowpass', 1400, 120, 0.48, 0.6);
      triggerNoiseBurst(0.04, 0.65, 'bandpass', 520, 160, 0.26, 0.7);
    } else if (kind === 'knife' || kind === 'throw') {
      triggerNoiseBurst(0, 0.11, 'bandpass', 1800, 520, 0.09, 1.5);
    } else if (kind === 'reload') {
      triggerNoiseBurst(0, 0.035, 'bandpass', 2400, 1600, 0.09, 3.0);
      triggerNoiseBurst(0.14, 0.04, 'bandpass', 3200, 1800, 0.11, 2.8);
    } else if (kind === 'mag_out') {
      triggerNoiseBurst(0, 0.04, 'bandpass', 2100, 1300, 0.11, 3.2);
    } else if (kind === 'mag_in') {
      triggerNoiseBurst(0, 0.045, 'bandpass', 1650, 2400, 0.13, 3.0);
    } else if (kind === 'bolt_rack') {
      triggerNoiseBurst(0, 0.035, 'bandpass', 3400, 2100, 0.12, 3.2);
      triggerNoiseBurst(0.06, 0.04, 'bandpass', 4000, 2500, 0.14, 3.4);
    } else if (kind === 'eat') {
      triggerNoiseBurst(0, 0.09, 'bandpass', 900, 420, 0.06, 1.4);
      triggerNoiseBurst(0.16, 0.08, 'bandpass', 850, 380, 0.055, 1.4);
    }
  }

  private playFootstepAudio(surface: 'grass' | 'road' | 'interior', isSprinting: boolean, isOnStairs: boolean) {
    const ctx = this.ensureAudioContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const volScale = isSprinting ? 1.2 : 0.8;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (surface === 'grass') {
      filter.type = 'bandpass';
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(480 + Math.random() * 90, now);
      gain.gain.setValueAtTime(0.026 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    } else if (surface === 'interior') {
      filter.type = 'bandpass';
      filter.Q.value = isOnStairs ? 2.4 : 1.5;
      filter.frequency.setValueAtTime(isOnStairs ? 680 : 280 + Math.random() * 50, now);
      gain.gain.setValueAtTime(0.032 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    } else {
      // Road asphalt / concrete sidewalk crisp subtle heel tap
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(840 + Math.random() * 140, now);
      gain.gain.setValueAtTime(0.028 * volScale, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
    }

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now, Math.random() * 0.4, 0.08);
  }

  toggleCameraMode() {
    this.isFirstPerson = !this.isFirstPerson;
    const badge = document.getElementById('camera-mode-badge');
    const status = document.getElementById('cam-status');
    if (badge && status) {
      if (this.isFirstPerson) {
        badge.innerText = 'FPV';
        badge.style.color = '#ff9f43';
        status.innerText = 'First-Person View [V to switch]';
      } else {
        badge.innerText = 'TPV';
        badge.style.color = '#7bed9f';
        status.innerText = 'Third-Person View [V to switch]';
      }
    }
  }

  addCollider(box: THREE.Box3, tag = 'structure') {
    this.collision.addAABB(box, tag);
  }

  addOBB(center: THREE.Vector3, size: THREE.Vector3, rotY: number, tag = 'vehicle') {
    this.collision.addOBB(center, size, rotY, tag);
  }

  addWalkableObject(obj: THREE.Object3D) {
    this.collision.addWalkableObject(obj);
  }

  teleport(x: number, y: number, z: number, yaw = 0) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
  }

  update(delta: number) {
    const prevY = this.position.y;
    const wasGrounded = this.isGrounded;

    const targetH = this.isCrouching ? this.crouchingHeight : this.standingHeight;
    this.playerHeight += (targetH - this.playerHeight) * Math.min(delta * 10, 1);
    const targetEye = this.isCrouching ? 1.18 : 1.62;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(delta * 10, 1);

    this.currentFov += (this.targetFov - this.currentFov) * Math.min(delta * 12, 1);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // Keyboard camera look fallback
    const maxPitch = Math.PI / 2 - 0.05;
    const yawRate = this.controlsSettings.getKeyboardYawSpeed();
    const pitchRate = this.controlsSettings.getKeyboardPitchSpeed() * this.controlsSettings.getYSign();
    if (this.keys['ArrowLeft']) this.yaw += yawRate * delta;
    if (this.keys['ArrowRight']) this.yaw -= yawRate * delta;
    if (this.keys['ArrowUp']) this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + pitchRate * delta));
    if (this.keys['ArrowDown']) this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch - pitchRate * delta));

    const hasEnergyForSprint = !this.inventory || this.inventory.energy > 4;
    const isSprinting =
      (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.controlsSettings.touchSprint) &&
      !this.isCrouching &&
      hasEnergyForSprint;
    const baseSpeed = this.isCrouching ? 2.7 : isSprinting ? 8.4 : 4.8;
    const moveSpeed = this.isAiming ? baseSpeed * 0.55 : baseSpeed;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    const inputDirection = new THREE.Vector3();
    const keyFwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const keyStrafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    const fwdAxis = Math.max(-1, Math.min(1, keyFwd + this.controlsSettings.moveZ));
    const strafeAxis = Math.max(-1, Math.min(1, keyStrafe + this.controlsSettings.moveX));
    if (Math.abs(fwdAxis) > 0.02) inputDirection.addScaledVector(forward, fwdAxis);
    if (Math.abs(strafeAxis) > 0.02) inputDirection.addScaledVector(right, strafeAxis);

    if (inputDirection.lengthSq() > 0.01) {
      inputDirection.normalize();
      this.velocity.x = inputDirection.x * moveSpeed;
      this.velocity.z = inputDirection.z * moveSpeed;
    } else {
      this.velocity.x *= 0.6;
      this.velocity.z *= 0.6;
    }

    if (this.justJumpedTimer > 0) this.justJumpedTimer -= delta;
    if (this.keys['Space'] && this.isGrounded) {
      this.velocity.y = 6.2;
      this.isGrounded = false;
      this.justJumpedTimer = 0.25;
      if (this.inventory) {
        this.inventory.energy = Math.max(0, this.inventory.energy - 0.25);
      }
    }

    this.velocity.y -= 19.6 * delta;

    const nextX = this.position.x + this.velocity.x * delta;
    const stepX = this.collision.tryHorizontalMove(
      this.position.x, this.position.y, this.position.z,
      nextX, this.position.z,
      this.playerRadius, this.playerHeight, this.stepUpHeight, this.isGrounded
    );
    if (stepX !== null) {
      this.position.x = nextX;
      this.position.y = Math.max(this.position.y, stepX);
    } else {
      this.velocity.x = 0;
    }

    const nextZ = this.position.z + this.velocity.z * delta;
    const stepZ = this.collision.tryHorizontalMove(
      this.position.x, this.position.y, this.position.z,
      this.position.x, nextZ,
      this.playerRadius, this.playerHeight, this.stepUpHeight, this.isGrounded
    );
    if (stepZ !== null) {
      this.position.z = nextZ;
      this.position.y = Math.max(this.position.y, stepZ);
    } else {
      this.velocity.z = 0;
    }

    this.position.y += this.velocity.y * delta;
    const vRes = this.collision.resolveVertical(this.position, this.velocity.y, this.playerRadius, this.playerHeight);
    this.position.y = vRes.y;
    this.velocity.y = vRes.velY;
    this.isGrounded = vRes.grounded;

    // Smooth stair step-down snapping when walking down steps so legs animate cleanly instead of sliding
    if (!this.isGrounded && wasGrounded && this.justJumpedTimer <= 0 && this.velocity.y <= 0) {
      const stepDownY = this.collision.findGroundHeightBelow(this.position, this.playerRadius, 0.42);
      if (stepDownY !== null) {
        this.position.y = stepDownY;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const dyFrame = this.position.y - prevY;
    if (horizontalSpeed > 0.35 && Math.abs(dyFrame) > 0.004 && this.isGrounded) {
      const targetSlope = dyFrame > 0 ? 1 : -1;
      this.stairSlopeBlend += (targetSlope - this.stairSlopeBlend) * Math.min(delta * 14, 1);
      this.isOnStairs = true;
    } else {
      this.stairSlopeBlend *= Math.pow(0.01, delta);
      if (Math.abs(this.stairSlopeBlend) < 0.12) this.isOnStairs = false;
    }

    if (horizontalSpeed > 0.4 && this.isGrounded) {
      this.walkCycle += delta * (isSprinting ? 14.0 : 9.2);
      const stepIdx = Math.floor(this.walkCycle / Math.PI);
      if (stepIdx !== this.lastStepIndex) {
        this.lastStepIndex = stepIdx;
        this.playFootstepAudio(this.collision.getSurfaceType(this.position), isSprinting, this.isOnStairs);
      }
    } else {
      this.lastStepIndex = Math.floor(this.walkCycle / Math.PI);
    }

    // Update combat timers, tracers, grenades, explosions & vitals
    this.updateCombatAndProjectiles(delta);
    if (this.inventory) {
      this.inventory.updateVitals(delta, horizontalSpeed > 0.4, isSprinting, this.isCrouching);
    }

    const grip: WeaponGripPose = this.inventory?.activeItem?.grip ?? 'none';
    const actionProgress = this.actionTimer > 0 ? 1 - this.actionTimer / Math.max(0.05, this.actionDuration) : 0;

    const effectivePitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + this.recoilPitch));
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(effectivePitch),
      Math.sin(effectivePitch),
      -Math.cos(this.yaw) * Math.cos(effectivePitch)
    );

    if (this.isFirstPerson) {
      const bob =
        this.isGrounded && horizontalSpeed > 0.5
          ? Math.sin(this.walkCycle) * (isSprinting ? 0.045 : 0.024)
          : 0;
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      const eyePos = this.position.clone();
      eyePos.x += shakeX;
      eyePos.y += this.eyeHeight + bob + shakeY;
      this.camera.position.copy(eyePos);
      this.camera.lookAt(eyePos.clone().add(lookDir));
    } else {
      const targetY = this.isCrouching ? 1.16 : this.tpHeightOffset;
      const eyeTarget = this.position.clone().add(new THREE.Vector3(0, targetY, 0));

      const desiredDist = this.isAiming ? 1.75 : this.tpDistance;
      const camOffset = new THREE.Vector3(
        this.tpSideOffset * Math.cos(this.yaw) + desiredDist * Math.sin(this.yaw) * Math.cos(effectivePitch),
        desiredDist * -Math.sin(effectivePitch) + 0.35,
        this.tpSideOffset * -Math.sin(this.yaw) + desiredDist * Math.cos(this.yaw) * Math.cos(effectivePitch)
      );

      const safePos = this.collision.resolveCameraCollision(eyeTarget, eyeTarget.clone().add(camOffset));
      // Keep third-person orbit camera above walkable floor when player looks steep upward toward night sky
      const minCamY = this.position.y + 0.32;
      if (safePos.y < minCamY) safePos.y = minCamY;
      this.camera.position.copy(safePos);
      if (safePos.distanceTo(eyeTarget) < 0.55) {
        this.avatarGroup.visible = false;
      }
      this.camera.lookAt(eyeTarget.clone().add(lookDir.clone().multiplyScalar(12)));
    }
    this.camera.updateMatrixWorld(true);

    this.avatarGroup.position.copy(this.position);
    this.avatarGroup.rotation.y = this.yaw + Math.PI;
    this.avatarGroup.visible = !this.isFirstPerson;
    this.avatarGroup.updateMatrixWorld(true);
    this.fpvHandGroup.visible = this.isFirstPerson;

    // Crosshair target in world space
    const crosshair = this.getCrosshairTarget(120);

    // Animate 11-bone soldier skeleton with crosshair aim target
    const axisNorm = Math.hypot(fwdAxis, strafeAxis);
    const normFwd = axisNorm > 1e-3 ? fwdAxis / Math.max(1, axisNorm) : 0;
    const normStrafe = axisNorm > 1e-3 ? strafeAxis / Math.max(1, axisNorm) : 0;

    this.soldierRig.animate(delta, {
      speed: horizontalSpeed,
      forwardSpeed: horizontalSpeed * normFwd,
      strafeSpeed: horizontalSpeed * normStrafe,
      isSprinting,
      isGrounded: this.isGrounded,
      isOnStairs: this.isOnStairs,
      stairDirection: this.stairSlopeBlend > 0.15 ? 1 : this.stairSlopeBlend < -0.15 ? -1 : 0,
      isCrouching: this.isCrouching,
      flashlightOn: this.flashlightOn,
      grip,
      isAiming: this.isAiming,
      attackProgress: actionProgress,
      isReloading: this.reloadSnapshot.isReloading,
      reloadProgress: this.reloadSnapshot.progress,
      pitch: this.pitch,
      aimTarget: crosshair.point
    });

    // Position FPV weapon/knife/grenade/food rig with dynamic angle convergence to crosshair
    this.updateFpvViewmodelPose(grip, actionProgress, horizontalSpeed, isSprinting, crosshair.point);

    const lightOrigin = this.position.clone().add(new THREE.Vector3(0, this.eyeHeight - 0.12, 0));
    this.flashlight.position.copy(lightOrigin);
    this.flashlightTarget.position.copy(lightOrigin.clone().add(lookDir.clone().multiplyScalar(15)));
  }

  private updateFpvViewmodelPose(
    grip: WeaponGripPose,
    actionProgress: number,
    horizontalSpeed: number,
    isSprinting: boolean,
    crosshairTargetPoint?: THREE.Vector3
  ) {
    const bobY = this.isGrounded && horizontalSpeed > 0.4 ? Math.sin(this.walkCycle) * (isSprinting ? 0.022 : 0.012) : Math.sin(performance.now() * 0.0025) * 0.004;
    const bobX = this.isGrounded && horizontalSpeed > 0.4 ? Math.cos(this.walkCycle * 0.5) * 0.014 : 0;

    let px = 0.24;
    let py = -0.22;
    let pz = -0.44;
    let rx = 0.04;
    let ry = 0.08;
    let rz = 0.02;

    if (this.isAiming && (grip === 'smg' || grip === 'shotgun' || grip === 'rifle' || grip === 'pistol')) {
      px = 0.02;
      py = -0.145;
      pz = -0.34;
      rx = 0.0;
      ry = 0.0;
      rz = 0.0;
    }

    if (this.reloadSnapshot.isReloading) {
      const rp = this.reloadSnapshot.progress;
      if (rp < 0.35) {
        const k = rp / 0.35;
        rx = -0.32 * k;
        rz = 0.28 * k;
        py -= 0.045 * k;
      } else if (rp < 0.72) {
        const k = Math.sin(((rp - 0.35) / 0.37) * Math.PI);
        rx = -0.28;
        rz = 0.26;
        py -= 0.04 - k * 0.025;
      } else {
        const k = Math.sin(((rp - 0.72) / 0.28) * Math.PI);
        rx = -0.18 * (1 - k * 0.5);
        rz = 0.18 * (1 - k * 0.6);
        py -= 0.02 * (1 - k);
      }
    } else if (actionProgress > 0) {
      if (grip === 'knife') {
        const arc = Math.sin(actionProgress * Math.PI);
        px -= arc * 0.24;
        py += arc * 0.06;
        pz -= arc * 0.16;
        rx -= arc * 0.45;
        ry += arc * 0.95;
        rz += arc * 0.8;
      } else if (grip === 'grenade') {
        pz += actionProgress < 0.4 ? actionProgress * 0.35 : -((actionProgress - 0.4) * 0.45);
        rx += actionProgress < 0.4 ? 0.4 : -0.7;
      } else if (grip === 'food') {
        const bite = Math.abs(Math.sin(actionProgress * Math.PI * 2));
        px -= bite * 0.14;
        py += bite * 0.14;
        pz += bite * 0.18;
      } else {
        // Gun firing recoil
        const kick = Math.sin(actionProgress * Math.PI);
        pz += kick * 0.06;
        rx += kick * 0.14;
      }
    }

    const isGun = grip === 'smg' || grip === 'shotgun' || grip === 'rifle' || grip === 'pistol';
    // Dynamically angle gun barrel to point directly along line to crosshair target
    if (isGun && crosshairTargetPoint && !this.reloadSnapshot.isReloading) {
      const gunCamPos = new THREE.Vector3(px + bobX, py + bobY, pz);
      const targetCam = this.camera.worldToLocal(crosshairTargetPoint.clone());
      const aimVec = targetCam.clone().sub(gunCamPos);

      if (-aimVec.z > 0.2) {
        const convPitch = Math.atan2(aimVec.y, -aimVec.z);
        const convYaw = Math.atan2(-aimVec.x, -aimVec.z);

        if (this.isAiming) {
          rx = convPitch;
          ry = convYaw;
        } else {
          rx += convPitch * 0.85;
          ry += convYaw * 0.85;
        }
      }
    }

    this.fpvPivot.position.set(px + bobX, py + bobY, pz);
    this.fpvPivot.rotation.set(rx, ry, rz);
  }
}
