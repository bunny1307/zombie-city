import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export type WeaponGripPose =
  | 'none'
  | 'smg'
  | 'knife'
  | 'shotgun'
  | 'rifle'
  | 'pistol'
  | 'grenade'
  | 'food';

export interface SoldierAnimState {
  speed: number;
  forwardSpeed?: number; // + forward, - backward
  strafeSpeed?: number;  // + right, - left
  isSprinting: boolean;
  isGrounded: boolean;
  isOnStairs: boolean;
  stairDirection: number; // +1 walking up steps, -1 walking down steps, 0 flat
  isCrouching: boolean;
  flashlightOn: boolean;
  pitch: number;
  grip: WeaponGripPose;
  isAiming: boolean;
  attackProgress: number; // 0 = idle, (0..1] across strike/shot/throw/eat
  isReloading: boolean;
  reloadProgress?: number; // 0..1 across reload phases
  aimTarget?: THREE.Vector3; // 3D world position where the crosshair is aiming
}

/**
 * Loads `military_man_army_man_soldier.glb` and converts its static T-pose meshes
 * into an 11-bone anatomical GPU-skinned character rig (pelvis, torso, head,
 * bilateral shoulders + elbows, bilateral hips + knees).
 *
 * Coordinate convention: Soldier faces `+Z`, `+Y` is up, `-X` is the soldier's RIGHT arm/leg,
 * and `+X` is the soldier's LEFT arm/leg (so in TPV after Y-rotation PI, `-X` sits on the screen's RIGHT!).
 */
export class AnimatedSoldierRig {
  root = new THREE.Group();
  loaded = false;

  private rootPelvis!: THREE.Bone;
  private torsoBone!: THREE.Bone;
  private headBone!: THREE.Bone;
  private leftShoulder!: THREE.Bone;
  private leftElbow!: THREE.Bone;
  private rightShoulder!: THREE.Bone;
  private rightElbow!: THREE.Bone;
  private leftHip!: THREE.Bone;
  private leftKnee!: THREE.Bone;
  private rightHip!: THREE.Bone;
  private rightKnee!: THREE.Bone;

  private rightHandMount = new THREE.Group();
  private equippedHandObj: THREE.Object3D | null = null;

  private idlePhase = 0;
  private walkCycle = 0;
  private moveBlend = 0;
  private sprintBlend = 0;
  private crouchBlend = 0;
  private airTime = 0;

  async load(): Promise<boolean> {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    loader.setDRACOLoader(draco);

    try {
      const gltf = await loader.loadAsync('/models/characters/military_man_army_man_soldier.glb');
      const raw = gltf.scene;
      raw.updateMatrixWorld(true);

      const rawBox = new THREE.Box3().setFromObject(raw);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const rawCenter = rawBox.getCenter(new THREE.Vector3());
      const targetHeight = 1.78;
      const scale = targetHeight / Math.max(rawSize.y, 0.01);

      // Build 11-bone anatomical skeleton facing +Z: -X = RIGHT side, +X = LEFT side
      this.rootPelvis = new THREE.Bone();
      this.rootPelvis.position.set(0, 0.88, 0);

      this.torsoBone = new THREE.Bone();
      this.torsoBone.position.set(0, 0, 0);
      this.rootPelvis.add(this.torsoBone);

      this.headBone = new THREE.Bone();
      this.headBone.position.set(0, 0.64, 0);
      this.torsoBone.add(this.headBone);

      // Anatomical LEFT arm (+X)
      this.leftShoulder = new THREE.Bone();
      this.leftShoulder.rotation.order = 'YXZ';
      this.leftShoulder.position.set(0.21, 0.50, 0);
      this.torsoBone.add(this.leftShoulder);

      this.leftElbow = new THREE.Bone();
      this.leftElbow.position.set(0.24, 0, 0);
      this.leftShoulder.add(this.leftElbow);

      // Anatomical RIGHT arm (-X) — matches right hand in FPV and screen right in TPV!
      this.rightShoulder = new THREE.Bone();
      this.rightShoulder.rotation.order = 'YXZ';
      this.rightShoulder.position.set(-0.21, 0.50, 0);
      this.torsoBone.add(this.rightShoulder);

      this.rightElbow = new THREE.Bone();
      this.rightElbow.position.set(-0.24, 0, 0);
      this.rightShoulder.add(this.rightElbow);

      // Anatomical LEFT leg (+X) & RIGHT leg (-X)
      this.leftHip = new THREE.Bone();
      this.leftHip.position.set(0.10, 0, 0);
      this.rootPelvis.add(this.leftHip);

      this.leftKnee = new THREE.Bone();
      this.leftKnee.position.set(0, -0.43, 0);
      this.leftHip.add(this.leftKnee);

      this.rightHip = new THREE.Bone();
      this.rightHip.position.set(-0.10, 0, 0);
      this.rootPelvis.add(this.rightHip);

      this.rightKnee = new THREE.Bone();
      this.rightKnee.position.set(0, -0.43, 0);
      this.rightHip.add(this.rightKnee);

      // Right hand socket attaches at anatomical RIGHT palm (-0.26m distal from -X elbow)
      this.rightHandMount.position.set(-0.26, -0.015, 0.015);
      this.rightHandMount.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      this.rightElbow.add(this.rightHandMount);
      if (this.equippedHandObj) {
        this.rightHandMount.add(this.equippedHandObj);
      }

      const bones = [
        this.rootPelvis,    // 0
        this.torsoBone,     // 1
        this.headBone,      // 2
        this.leftShoulder,  // 3 (+X)
        this.leftElbow,     // 4 (+X)
        this.rightShoulder, // 5 (-X)
        this.rightElbow,    // 6 (-X)
        this.leftHip,       // 7 (+X)
        this.leftKnee,      // 8 (+X)
        this.rightHip,      // 9 (-X)
        this.rightKnee      // 10 (-X)
      ];

      this.root.add(this.rootPelvis);

      const normMatrix = new THREE.Matrix4()
        .makeScale(scale, scale, scale)
        .multiply(new THREE.Matrix4().makeTranslation(-rawCenter.x, -rawBox.min.y, -rawCenter.z));

      raw.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;

        const geo = child.geometry.clone();
        const combined = new THREE.Matrix4().multiplyMatrices(normMatrix, child.matrixWorld);
        geo.applyMatrix4(combined);

        const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
        const std = srcMat as THREE.MeshStandardMaterial;

        const pos = geo.getAttribute('position');
        if ((std?.name || '').toLowerCase() === 'body' && pos.count > 400) {
          const idx = geo.getIndex();
          if (idx) {
            const keepIdx: number[] = [];
            for (let t = 0; t < idx.count; t += 3) {
              const a = idx.getX(t);
              const b = idx.getX(t + 1);
              const c = idx.getX(t + 2);
              const avgY = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
              const avgX = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
              if (avgY < 1.46 && Math.abs(avgX) < 0.79) continue;
              keepIdx.push(a, b, c);
            }
            geo.setIndex(keepIdx);
          }
        }

        const vCount = pos.count;
        const skinIndices = new Uint16Array(vCount * 4);
        const skinWeights = new Float32Array(vCount * 4);

        for (let i = 0; i < vCount; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);

          let b0 = 1;
          let b1 = 1;
          let w0 = 1.0;
          let w1 = 0.0;

          if (y < 0.89) {
            // +X -> left leg (7, 8), -X -> right leg (9, 10)
            const hipBone = x >= 0 ? 7 : 9;
            const kneeBone = x >= 0 ? 8 : 10;
            if (y > 0.78) {
              const t = (0.89 - y) / 0.11;
              b0 = hipBone; w0 = t;
              b1 = 0; w1 = 1 - t;
            } else if (y > 0.49) {
              b0 = hipBone; w0 = 1;
            } else if (y > 0.40) {
              const t = (0.49 - y) / 0.09;
              b0 = kneeBone; w0 = t;
              b1 = hipBone; w1 = 1 - t;
            } else {
              b0 = kneeBone; w0 = 1;
            }
          } else if (y >= 1.20 && y <= 1.56 && x > 0.17) {
            // Anatomical LEFT arm (+X -> bones 3 & 4)
            if (x < 0.26) {
              const t = (x - 0.17) / 0.09;
              b0 = 3; w0 = t;
              b1 = 1; w1 = 1 - t;
            } else if (x < 0.41) {
              b0 = 3; w0 = 1;
            } else if (x < 0.49) {
              const t = (x - 0.41) / 0.08;
              b0 = 4; w0 = t;
              b1 = 3; w1 = 1 - t;
            } else {
              b0 = 4; w0 = 1;
            }
          } else if (y >= 1.20 && y <= 1.56 && x < -0.17) {
            // Anatomical RIGHT arm (-X -> bones 5 & 6)
            if (x > -0.26) {
              const t = (-0.17 - x) / 0.09;
              b0 = 5; w0 = t;
              b1 = 1; w1 = 1 - t;
            } else if (x > -0.41) {
              b0 = 5; w0 = 1;
            } else if (x > -0.49) {
              const t = (-0.41 - x) / 0.08;
              b0 = 6; w0 = t;
              b1 = 5; w1 = 1 - t;
            } else {
              b0 = 6; w0 = 1;
            }
          } else if (y > 1.49) {
            if (y < 1.56) {
              const t = (y - 1.49) / 0.07;
              b0 = 2; w0 = t;
              b1 = 1; w1 = 1 - t;
            } else {
              b0 = 2; w0 = 1;
            }
          }

          skinIndices[i * 4] = b0;
          skinIndices[i * 4 + 1] = b1;
          skinWeights[i * 4] = w0;
          skinWeights[i * 4 + 1] = w1;
        }

        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

        const fastMat = new THREE.MeshLambertMaterial({
          map: std.map ?? null,
          color: std.color ? std.color.clone() : new THREE.Color(0xffffff)
        });

        const skinned = new THREE.SkinnedMesh(geo, fastMat);
        skinned.castShadow = false;
        skinned.receiveShadow = false;
        skinned.frustumCulled = false;
        this.root.add(skinned);
      });

      this.root.parent?.updateMatrixWorld(true);
      this.root.updateMatrixWorld(true);
      const skeleton = new THREE.Skeleton(bones);
      for (const child of this.root.children) {
        if (child instanceof THREE.SkinnedMesh) {
          child.bind(skeleton, child.matrixWorld);
        }
      }

      // Drop both arms naturally along body sides (+X drops with -1.36; -X drops with +1.36)
      this.leftShoulder.rotation.z = -1.36;
      this.rightShoulder.rotation.z = 1.36;
      this.leftElbow.rotation.y = -0.36;
      this.rightElbow.rotation.y = 0.36;

      this.loaded = true;
      return true;
    } catch (err) {
      console.warn('Could not load military_man_army_man_soldier.glb:', err);
      return false;
    }
  }

  /** Returns barrel-tip world position for the right-hand weapon. */
  getRightHandWorldPos(barrelOffset = 0.45): THREE.Vector3 {
    const wp = new THREE.Vector3();
    this.rightHandMount.updateWorldMatrix(true, false);
    this.rightHandMount.getWorldPosition(wp);
    // Offset forward along barrel direction (local -Z of mount, transformed to world)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.rightHandMount.getWorldQuaternion(new THREE.Quaternion()));
    wp.addScaledVector(fwd, barrelOffset);
    return wp;
  }

  attachRightHandItem(obj: THREE.Object3D | null) {
    if (this.equippedHandObj && this.equippedHandObj.parent === this.rightHandMount) {
      this.rightHandMount.remove(this.equippedHandObj);
    }
    this.equippedHandObj = obj;
    if (obj) {
      this.rightHandMount.add(obj);
    }
  }

  animate(delta: number, state: SoldierAnimState) {
    if (!this.loaded) return;

    this.idlePhase += delta * 2.2;
    const armDrop = 1.36;

    const targetCrouch = state.isCrouching ? 1 : 0;
    this.crouchBlend += (targetCrouch - this.crouchBlend) * Math.min(delta * 11, 1);

    if (state.isGrounded || state.isOnStairs) {
      this.airTime = 0;
    } else {
      this.airTime += delta;
    }

    const trueJumpAir = !state.isGrounded && !state.isOnStairs && this.airTime > 0.14;
    const isMoving = state.speed > 0.3;
    const fwdSpeed = state.forwardSpeed ?? state.speed;
    const strafeSpeed = state.strafeSpeed ?? 0;
    const targetMove = isMoving ? Math.min(1, state.speed / 4.2) : 0;
    const targetSprint = isMoving && state.isSprinting && fwdSpeed > 1.0 && !state.isAiming ? 1 : 0;
    this.moveBlend += (targetMove - this.moveBlend) * Math.min(delta * 10, 1);
    this.sprintBlend += (targetSprint - this.sprintBlend) * Math.min(delta * 8, 1);

    // 1. LOWER BODY (Anatomical Swing/Stance Gait + Hip/Shoulder Counter-Rotation)
    const idleSway = Math.sin(this.idlePhase * 0.8);
    const idleShift = Math.cos(this.idlePhase * 0.45);
    let leftHipRx = -0.04 + idleSway * 0.03;
    let rightHipRx = 0.04 - idleSway * 0.03;
    let leftKneeRx = 0.10 + Math.max(0, idleShift) * 0.07;
    let rightKneeRx = 0.10 + Math.max(0, -idleShift) * 0.07;
    let leftHipRz = 0.025;
    let rightHipRz = -0.025;
    let pelvisRy = 0;
    let pelvisRz = 0;
    let torsoRx = 0.02 + Math.sin(this.idlePhase) * 0.015;
    let torsoRy = Math.sin(this.idlePhase * 0.52) * 0.035;
    let bobY = Math.sin(this.idlePhase) * 0.006;

    if (trueJumpAir) {
      leftHipRx = -0.45;
      leftKneeRx = 0.72;
      rightHipRx = 0.24;
      rightKneeRx = 0.42;
      torsoRx = 0.12;
    } else if (this.moveBlend > 0.01) {
      const dirSign = fwdSpeed < -0.35 ? -1 : 1;
      const speedRatio = Math.min(1.4, state.speed / 4.8);
      const freq = state.isOnStairs ? 9.8 : 7.6 + 4.4 * this.sprintBlend * speedRatio;
      this.walkCycle += delta * freq * dirSign;

      const s = Math.sin(this.walkCycle);
      const c = Math.cos(this.walkCycle);
      const mb = this.moveBlend;
      const sb = this.sprintBlend;
      const strafeRatio = Math.max(-1, Math.min(1, strafeSpeed / 4.8));

      let mLeftHipRx = 0;
      let mRightHipRx = 0;
      let mLeftKneeRx = 0.12;
      let mRightKneeRx = 0.12;
      let mTorsoRx = 0.04;
      let mTorsoRy = 0;
      let mBobY = 0;

      if (state.isOnStairs && state.stairDirection < 0) {
        const stepSwing = 0.50;
        mLeftHipRx = -s * stepSwing - 0.10;
        mRightHipRx = s * stepSwing - 0.10;
        mLeftKneeRx = 0.34 + Math.max(0, c) * 0.52;
        mRightKneeRx = 0.34 + Math.max(0, -c) * 0.52;
        mBobY = Math.abs(c) * 0.03;
        mTorsoRx = 0.08;
        mTorsoRy = s * 0.06;
      } else if (state.isOnStairs && state.stairDirection > 0) {
        const stepSwing = 0.62;
        mLeftHipRx = -s * stepSwing - 0.18;
        mRightHipRx = s * stepSwing - 0.18;
        mLeftKneeRx = 0.22 + Math.max(0, c) * 0.85;
        mRightKneeRx = 0.22 + Math.max(0, -c) * 0.85;
        mBobY = Math.abs(c) * 0.035;
        mTorsoRx = 0.16;
        mTorsoRy = s * 0.06;
      } else {
        // True human gait: -sin(θ) swings leg FORWARD while cos(θ) > 0 (swing phase -> high knee tuck);
        // when cos(θ) < 0 (stance phase -> foot planted pushing back), knee stays mostly extended!
        const isBack = dirSign < 0;
        const swing = isBack ? 0.36 : 0.44 + 0.38 * sb;
        mLeftHipRx = -s * swing;
        mRightHipRx = s * swing;

        const swingKnee = isBack ? 0.38 : 0.52 + 0.62 * sb;
        const stanceFlex = 0.10 + 0.14 * sb;
        mLeftKneeRx = 0.08 + Math.max(0, c) * swingKnee + Math.max(0, -c) * stanceFlex;
        mRightKneeRx = 0.08 + Math.max(0, -c) * swingKnee + Math.max(0, c) * stanceFlex;

        mBobY = Math.abs(c) * (0.022 + 0.028 * sb) - (0.015 * sb);
        mTorsoRx = isBack ? -0.04 : 0.06 + 0.20 * sb;
        pelvisRy = s * (0.055 + 0.045 * sb) * mb;
        mTorsoRy = -s * (0.08 + 0.08 * sb);
        pelvisRz = (-strafeRatio * 0.05 + c * 0.025) * mb;
        leftHipRz = 0.025 + Math.abs(strafeRatio) * (0.06 + 0.08 * Math.max(0, s)) * mb;
        rightHipRz = -0.025 - Math.abs(strafeRatio) * (0.06 + 0.08 * Math.max(0, -s)) * mb;
      }

      leftHipRx = leftHipRx * (1 - mb) + mLeftHipRx * mb;
      rightHipRx = rightHipRx * (1 - mb) + mRightHipRx * mb;
      leftKneeRx = leftKneeRx * (1 - mb) + mLeftKneeRx * mb;
      rightKneeRx = rightKneeRx * (1 - mb) + mRightKneeRx * mb;
      torsoRx = torsoRx * (1 - mb) + mTorsoRx * mb;
      torsoRy = torsoRy * (1 - mb) + mTorsoRy * mb;
      bobY = bobY * (1 - mb) + mBobY * mb;
    }

    if (this.crouchBlend > 0.001) {
      const cb = this.crouchBlend;
      const crouchHipL = -0.94 - (isMoving ? Math.sin(this.walkCycle) * 0.22 * this.moveBlend : 0);
      const crouchHipR = -1.06 + (isMoving ? Math.sin(this.walkCycle) * 0.22 * this.moveBlend : 0);
      const crouchKneeL = 1.56 + (isMoving ? Math.max(0, Math.cos(this.walkCycle)) * 0.28 * this.moveBlend : 0);
      const crouchKneeR = 1.70 + (isMoving ? Math.max(0, -Math.cos(this.walkCycle)) * 0.28 * this.moveBlend : 0);

      leftHipRx = leftHipRx * (1 - cb) + crouchHipL * cb;
      rightHipRx = rightHipRx * (1 - cb) + crouchHipR * cb;
      leftKneeRx = leftKneeRx * (1 - cb) + crouchKneeL * cb;
      rightKneeRx = rightKneeRx * (1 - cb) + crouchKneeR * cb;
      leftHipRz = leftHipRz * (1 - cb) + 0.07 * cb;
      rightHipRz = rightHipRz * (1 - cb) - 0.07 * cb;
      torsoRx = torsoRx * (1 - cb) + 0.26 * cb;
    }

    this.leftHip.rotation.set(leftHipRx, 0, leftHipRz);
    this.rightHip.rotation.set(rightHipRx, 0, rightHipRz);
    this.leftKnee.rotation.set(leftKneeRx, 0, 0);
    this.rightKnee.rotation.set(rightKneeRx, 0, 0);

    const thighLen = 0.43;
    const shinLen = 0.45;
    const leftY = thighLen * Math.cos(Math.min(1.4, Math.abs(leftHipRx))) +
      shinLen * Math.cos(Math.min(1.4, Math.abs(leftHipRx + leftKneeRx)));
    const rightY = thighLen * Math.cos(Math.min(1.4, Math.abs(rightHipRx))) +
      shinLen * Math.cos(Math.min(1.4, Math.abs(rightHipRx + rightKneeRx)));
    this.rootPelvis.position.y = Math.max(0.48, Math.min(leftY, rightY)) + bobY;
    this.rootPelvis.rotation.set(0, pelvisRy, pelvisRz);

    const isGunGrip = state.grip === 'smg' || state.grip === 'shotgun' || state.grip === 'rifle' || state.grip === 'pistol';
    if (isGunGrip) {
      torsoRx += -state.pitch * 0.28;
    }
    this.torsoBone.rotation.set(torsoRx, torsoRy, 0);
    this.headBone.rotation.x = -state.pitch * 0.45 - this.crouchBlend * 0.18;
    this.headBone.rotation.y = isMoving ? -torsoRy * 0.4 : Math.sin(this.idlePhase * 0.42) * 0.07;

    // 2. UPPER BODY:
    // Anatomical RIGHT arm (-X): rz = +armDrop (down), rx < 0 (forward), ry > 0 (inward), elbow y > 0 (bend forward)
    // Anatomical LEFT arm (+X): rz = -armDrop (down), rx < 0 (forward), ry < 0 (inward), elbow y < 0 (bend forward)
    const sWalk = isMoving ? Math.sin(this.walkCycle) : 0;
    const breath = Math.sin(this.idlePhase);
    const atk = state.attackProgress;

    let lShX = -0.08;
    let lShY = 0;
    let lShZ = -armDrop;
    let lElY = -0.36;

    let rShX = -0.10;
    let rShY = 0;
    let rShZ = armDrop;
    let rElY = 0.36;

    const aimLift = state.isAiming ? -0.20 : 0;
    const gunArmPitch = isGunGrip ? -state.pitch * 0.48 : 0;

    switch (state.grip) {
      case 'smg': {
        rShX = -0.58 + aimLift + gunArmPitch + sWalk * 0.04;
        rShY = 0.14;
        rShZ = armDrop - 0.16;
        rElY = 1.24;
        lShX = -0.72 + aimLift + gunArmPitch * 0.8 - sWalk * 0.04;
        lShY = -0.46;
        lShZ = -armDrop + 0.18;
        lElY = -1.32;
        if (atk > 0) {
          const kick = Math.sin(atk * Math.PI) * 0.18;
          rShX -= kick;
          lShX -= kick * 0.7;
        }
        break;
      }
      case 'shotgun': {
        rShX = -0.62 + aimLift + gunArmPitch + sWalk * 0.03;
        rShY = 0.12;
        rShZ = armDrop - 0.24;
        rElY = 1.16;
        lShX = -0.84 + aimLift + gunArmPitch * 0.8;
        lShY = -0.42;
        lShZ = -armDrop + 0.22;
        lElY = -0.94;
        if (atk > 0) {
          const recoil = Math.sin(Math.min(1, atk * 2.2) * Math.PI) * 0.34;
          rShX -= recoil;
          lShX -= recoil * 0.8 + (atk > 0.35 ? Math.sin((atk - 0.35) * Math.PI * 1.5) * 0.28 : 0);
        }
        break;
      }
      case 'rifle': {
        rShX = -0.72 + aimLift + gunArmPitch + sWalk * 0.03;
        rShY = 0.14;
        rShZ = armDrop - 0.20;
        rElY = 1.32;
        lShX = -0.90 + aimLift + gunArmPitch * 0.8;
        lShY = -0.38;
        lShZ = -armDrop + 0.22;
        lElY = -0.78;
        if (atk > 0) {
          const kick = Math.sin(atk * Math.PI) * 0.22;
          rShX -= kick;
          lShX -= kick * 0.75;
        }
        break;
      }
      case 'pistol': {
        rShX = -1.16 + aimLift * 0.7 + gunArmPitch;
        rShY = 0.18;
        rShZ = armDrop - 0.08;
        rElY = 0.44;
        lShX = -1.14 + aimLift * 0.7 + gunArmPitch * 0.8;
        lShY = -0.24;
        lShZ = -armDrop + 0.08;
        lElY = -0.50;
        if (atk > 0) {
          const kick = Math.sin(atk * Math.PI) * 0.28;
          rShX -= kick;
          lShX -= kick * 0.85;
        }
        break;
      }
      case 'knife': {
        rShX = -0.44 + sWalk * 0.22;
        rShY = -0.06;
        rShZ = armDrop - 0.20;
        rElY = 1.42;
        lShX = -0.42 - sWalk * 0.30;
        lShY = -0.16;
        lShZ = -armDrop + 0.12;
        lElY = -0.96;
        if (atk > 0) {
          const swingWave = Math.sin(atk * Math.PI);
          rShX = -1.35 + swingWave * 0.95;
          rShY = 0.45 - atk * 1.1;
          rElY = 1.05 - swingWave * 0.5;
          torsoRy -= (0.5 - atk) * 0.32;
        }
        break;
      }
      case 'grenade': {
        rShX = -0.78;
        rShY = 0.08;
        rShZ = armDrop - 0.32;
        rElY = 1.78;
        lShX = -0.52 - sWalk * 0.25;
        lShY = -0.22;
        lShZ = -armDrop + 0.12;
        lElY = -1.05;
        if (atk > 0) {
          if (atk < 0.35) {
            rShX = -0.78 + (atk / 0.35) * 1.15;
            rElY = 1.85;
          } else {
            const rel = (atk - 0.35) / 0.65;
            rShX = 0.37 - rel * 2.15;
            rElY = 1.85 - rel * 1.35;
          }
        }
        break;
      }
      case 'food': {
        rShX = -0.46 + (isMoving ? sWalk * 0.24 : breath * 0.05);
        rElY = 1.05;
        lShX = isMoving ? -0.10 - sWalk * 0.56 : -0.10 + breath * 0.06;
        lElY = isMoving ? -0.55 + sWalk * 0.25 : -0.42 - Math.sin(this.idlePhase * 1.1) * 0.08;
        if (atk > 0) {
          const bite = Math.abs(Math.sin(atk * Math.PI * 2));
          rShX = -0.65 - bite * 0.72;
          rShY = -0.26;
          rElY = 1.45 + bite * 0.65;
        }
        break;
      }
      case 'none':
      default: {
        // Natural arm counter-swing: right arm swings forward (-rx) when left leg swings forward (sWalk > 0)!
        const armSwing = (0.48 + 0.42 * this.sprintBlend) * this.moveBlend;
        const swingWave = sWalk * armSwing;
        lShX = -0.10 + breath * 0.05 * (1 - this.moveBlend) + swingWave;
        lElY = -0.36 - 0.48 * this.sprintBlend - Math.max(0, -swingWave) * 0.52;
        rShX = state.flashlightOn
          ? -1.22 + (isMoving ? sWalk * 0.08 : breath * 0.03)
          : -0.10 - breath * 0.05 * (1 - this.moveBlend) - swingWave;
        rElY = state.flashlightOn
          ? 0.28
          : 0.36 + 0.48 * this.sprintBlend + Math.max(0, swingWave) * 0.52;
        lShZ = -armDrop + (0.04 * this.moveBlend + Math.sin(this.idlePhase * 0.6) * 0.025 * (1 - this.moveBlend));
        rShZ = armDrop - (0.04 * this.moveBlend + Math.cos(this.idlePhase * 0.6) * 0.025 * (1 - this.moveBlend));
        break;
      }
    }

    // Tactical across-chest sprint carry for long guns when sprinting & not aiming/shooting/reloading
    if (
      this.sprintBlend > 0.05 &&
      !state.isAiming &&
      atk <= 0 &&
      !state.isReloading &&
      (state.grip === 'smg' || state.grip === 'shotgun' || state.grip === 'rifle')
    ) {
      const sb = this.sprintBlend;
      const pump = sWalk * 0.16;
      rShX = rShX * (1 - sb) + (-0.42 + pump) * sb;
      rShY = rShY * (1 - sb) + 0.46 * sb;
      rElY = rElY * (1 - sb) + 1.48 * sb;
      lShX = lShX * (1 - sb) + (-0.64 - pump) * sb;
      lShY = lShY * (1 - sb) + (-0.62) * sb;
      lElY = lElY * (1 - sb) + (-1.45) * sb;
    }

    if (state.isReloading && state.grip !== 'none' && state.grip !== 'knife' && state.grip !== 'food' && state.grip !== 'grenade') {
      const p = state.reloadProgress ?? 0.5;
      if (p < 0.35) {
        // Stage 1: Tilt weapon & drop spent magazine
        const t = p / 0.35;
        rShX += 0.22 * t;
        rShY = 0.25 * t;
        rElY = 1.48;
        lShX = -0.35 - 0.15 * t;
        lShY = -0.35;
        lElY = -0.95;
      } else if (p < 0.75) {
        // Stage 2: Bring fresh magazine from pouch up into receiver
        const t = (p - 0.35) / 0.4;
        const thrust = Math.sin(t * Math.PI);
        rShX += 0.22;
        rShY = 0.25;
        rElY = 1.52;
        lShX = -0.50 - 0.42 * thrust;
        lShY = -0.55;
        lElY = -1.35 - 0.45 * thrust;
      } else {
        // Stage 3: Rack charging handle & return to ready
        const t = (p - 0.75) / 0.25;
        const rack = Math.sin(t * Math.PI);
        rShX += 0.22 * (1 - t);
        rShY = 0.25 * (1 - t);
        rElY = 1.48 - 0.2 * t;
        lShX = -0.78 + 0.25 * rack;
        lShY = -0.46;
        lElY = -1.55 + 0.25 * rack;
      }
    }

    if (state.grip !== 'none' && state.flashlightOn) {
      rShX -= state.pitch * 0.45;
    }

    this.leftShoulder.rotation.set(lShX, lShY, lShZ);
    this.leftElbow.rotation.set(0, lElY, 0);
    this.rightShoulder.rotation.set(rShX, rShY, rShZ);
    this.rightElbow.rotation.set(0, rElY, 0);

    // 3. DYNAMIC GUN AIMING: Align weapon barrel to point directly at crosshair target in world space
    const isGun = state.grip === 'smg' || state.grip === 'shotgun' || state.grip === 'rifle' || state.grip === 'pistol';
    const isSprintCarry = this.sprintBlend > 0.35 && !state.isAiming && atk <= 0 && state.grip !== 'pistol';
    if (isGun && state.aimTarget && !state.isReloading && !isSprintCarry) {
      // Ensure right elbow world matrix is computed with latest bone rotations
      this.rightElbow.updateWorldMatrix(true, false);

      const handWorldPos = new THREE.Vector3();
      this.rightHandMount.getWorldPosition(handWorldPos);

      const aimDir = state.aimTarget.clone().sub(handWorldPos).normalize();
      if (aimDir.lengthSq() > 0.001) {
        // Construct desired world orientation where local -Z points directly along aimDir
        const targetPt = handWorldPos.clone().add(aimDir);
        const lookMat = new THREE.Matrix4().lookAt(handWorldPos, targetPt, new THREE.Vector3(0, 1, 0));
        const desiredWorldQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);

        // Convert desired world quaternion to rightHandMount local space (relative to rightElbow)
        const elbowWorldQuat = new THREE.Quaternion();
        this.rightElbow.getWorldQuaternion(elbowWorldQuat);
        const localQuat = elbowWorldQuat.clone().invert().multiply(desiredWorldQuat);

        this.rightHandMount.quaternion.copy(localQuat);
        this.rightHandMount.updateWorldMatrix(true, false);
      }
    } else {
      // Default resting holding pose
      this.rightHandMount.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    }
  }
}
