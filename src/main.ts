import * as THREE from 'three';
import { PlayerController } from './player.ts';
import { CityEnvironment } from './environment.ts';
import { HospitalBuilding } from './buildings/hospital.ts';
import { SchoolBuilding } from './buildings/school.ts';
import { PoliceStationBuilding } from './buildings/police.ts';
import { House2BHKBuilding } from './buildings/house2bhk.ts';
import { Tower10Building } from './buildings/tower10.ts';
import { ModelLoader } from './modelLoader.ts';
import { WorldDecorator } from './worldDecorator.ts';
import { SpatialCollisionSystem } from './collision.ts';
import { PooledLightManager } from './lightPool.ts';
import { GrassWorldSystem } from './grassSystem.ts';
import { InventorySystem } from './inventory.ts';

class GameApp {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  collision: SpatialCollisionSystem;
  lightPool: PooledLightManager;
  player: PlayerController;
  inventory: InventorySystem;
  environment: CityEnvironment;
  modelLoader: ModelLoader;
  worldDecorator: WorldDecorator;
  grassSystem: GrassWorldSystem | null = null;

  hospital: HospitalBuilding;
  school: SchoolBuilding;
  policeStation: PoliceStationBuilding;
  house2bhk: House2BHKBuilding;
  tower10: Tower10Building;

  // Smooth Uncapped Render Loop & Throttled HUD Metrics
  private lastRenderTime = performance.now();
  private fpsAccum = 0;
  private fpsFrames = 0;
  private auditSummary = 'Validating...';

  locationBanner: HTMLElement | null;
  coordsStatus: HTMLElement | null;
  fpsStatus: HTMLElement | null;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.locationBanner = document.getElementById('hud-location-banner');
    this.coordsStatus = document.getElementById('coords-status');
    this.fpsStatus = document.getElementById('fps-status');

    // 1. Scene & Camera (Tighter 0.06m near plane prevents point-blank wall clipping)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.06, 420);

    // 2. Mobile / Integrated-GPU Friendly Renderer (Zero Shadows, No Tone Mapping Overhead)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      powerPreference: 'default'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 3. Spatial Collision Engine & Pooled Light Manager
    this.collision = new SpatialCollisionSystem(this.scene);
    this.lightPool = new PooledLightManager(this.scene, 6);

    // 4. Asset Loader, Inventory (10 Slots + Pickups + Vitals) & Tactical Army Man Player
    this.modelLoader = new ModelLoader();
    this.player = new PlayerController(this.camera, canvas, this.scene, this.collision);
    this.inventory = new InventorySystem(this.scene, this.modelLoader);
    this.player.setInventory(this.inventory);
    this.inventory.preloadAssets();

    // 5. Environment (Roads, Sidewalks, Grass Ground, Batched Trees, Sky)
    this.environment = new CityEnvironment(this.scene, this.player, this.lightPool);

    // 6. Build All 5 Main Explorable Buildings (Batched Static Meshes + Pooled Lights)
    this.hospital = new HospitalBuilding(this.scene, this.player, this.lightPool);
    this.school = new SchoolBuilding(this.scene, this.player, this.lightPool);
    this.policeStation = new PoliceStationBuilding(this.scene, this.player, this.lightPool);
    this.house2bhk = new House2BHKBuilding(this.scene, this.player, this.lightPool);
    this.tower10 = new Tower10Building(this.scene, this.player, this.lightPool);

    // 7. Populate All GLB Assets + 22 Explorable City Buildings + Instanced GLB Grass + Trees + Hitbox Audit
    this.worldDecorator = new WorldDecorator(this.scene, this.modelLoader, this.player, this.inventory, this.lightPool);
    this.worldDecorator
      .populateAll()
      .then(async (buildingExclusions) => {
        this.grassSystem = new GrassWorldSystem(buildingExclusions);
        await this.grassSystem.init(this.scene, this.modelLoader);
        await this.worldDecorator.placeInstancedGLBTrees((x, z) => this.grassSystem!.isExcluded(x, z));

        const audit = this.collision.runAudit(this.player.position);
        this.auditSummary = `${audit.aabbCount + audit.obbCount} boxes (${audit.invalidCount} invalid)`;
        const hBadge = document.getElementById('hitbox-status');
        if (hBadge) hBadge.innerText = `OFF [H] (${this.auditSummary})`;
        console.log('[Hitbox Audit]', audit);
      })
      .catch((err) => console.error('WorldDecorator error:', err));

    this.setupTestingHotkeys();
    window.addEventListener('resize', () => this.onWindowResize());

    requestAnimationFrame((t) => this.animate(t));
  }

  setupTestingHotkeys() {
    // Number keys 1-9 & 0 are bound to Inventory slots in PlayerController (no teleportation).
  }

  updateHUD(actualFps: number) {
    const x = Math.round(this.player.position.x);
    const y = Math.round(this.player.position.y);
    const z = Math.round(this.player.position.z);

    if (this.coordsStatus) {
      this.coordsStatus.innerText = `X: ${x}, Y: ${y}, Z: ${z}`;
    }
    if (this.fpsStatus) {
      const fps = Math.round(actualFps);
      this.fpsStatus.innerText = `FPS: ${fps} (Uncapped)`;
      this.fpsStatus.style.color = fps >= 50 ? '#7bed9f' : (fps >= 30 ? '#feca57' : '#ff9f43');
    }

    if (this.locationBanner) {
      if (y > 34 && Math.abs(x) < 15 && Math.abs(z) < 15) {
        this.locationBanner.innerText = '🏢 Tower Alpha - Rooftop Helipad & Gunship (Spawn)';
      } else if (y >= 1 && y <= 34 && Math.abs(x) < 15 && Math.abs(z) < 15) {
        const floor = Math.floor(y / 3.6);
        this.locationBanner.innerText = `🏢 Tower Alpha - Floor ${floor} Interior`;
      } else if (Math.abs(x) < 13 && Math.abs(z) < 13 && y < 1) {
        this.locationBanner.innerText = '🏢 Tower Alpha - Ground Lobby';
      } else if (Math.abs(x - 105) < 23 && Math.abs(z - 35) < 18) {
        const hFloor = y > 3.5 ? (y > 7.5 ? 'Rooftop' : 'Floor 2') : 'Ground Floor';
        this.locationBanner.innerText = `🏥 Metro General Hospital (${hFloor})`;
      } else if (Math.abs(x - 0) < 27 && Math.abs(z - (-140)) < 20) {
        const sFloor = y > 7.5 ? 'Rooftop' : (y > 3.5 ? 'Floor 2 (Library & Study Wing)' : 'Ground Floor (Classrooms & Lockers)');
        this.locationBanner.innerText = `🏫 Civic Central Academy (${sFloor})`;
      } else if (Math.abs(x - 105) < 20 && Math.abs(z - (-35)) < 16) {
        const pFloor = y > 7.5 ? 'Rooftop Comms' : (y > 3.5 ? 'Floor 2 (Briefing & Captain Office)' : 'Ground Floor (Cells & Armory)');
        this.locationBanner.innerText = `🚓 Metro District Precinct (${pFloor})`;
      } else if (Math.abs(x - (-85)) < 11 && Math.abs(z - 60) < 9) {
        this.locationBanner.innerText = '🏠 Suburban 2BHK House (Living, Kitchen, 2 Bedrooms, Bath)';
      } else if (Math.abs(x - (-116)) < 8 && Math.abs(z - 58) < 8) {
        this.locationBanner.innerText = '🏡 West Residence A (Walkable GLB Interior House)';
      } else if (Math.abs(x - (-85)) < 8 && Math.abs(z - 26) < 8) {
        this.locationBanner.innerText = '🏡 West Residence B (2-Story GLB Interior House)';
      } else if (Math.abs(x - (-124)) < 16 && Math.abs(z - 24) < 15) {
        const abFloor = y > 3.5 ? 'Floor 2' : 'Ground Floor & Yard';
        this.locationBanner.innerText = `🏚️ Abandoned 2-Story House (${abFloor})`;
      } else if (Math.abs(x - (-115)) < 8 && Math.abs(z - 95) < 8) {
        this.locationBanner.innerText = '🛋️ Furnished Living / Kitchen / Bedroom Suite';
      } else if (Math.abs(x) < 12 && Math.abs(z - 36) < 12) {
        this.locationBanner.innerText = '🪖 Military Quarantine Checkpoint (Tank & Tactical 4x4)';
      } else {
        const cityMatch = this.worldDecorator.cityBuildingMetas.find(
          (m) => x >= m.minX && x <= m.maxX && z >= m.minZ && z <= m.maxZ
        );
        if (cityMatch) {
          const cFloor = Math.floor(Math.max(0, y - 0.3) / cityMatch.floorHeight);
          const floorText = cFloor >= cityMatch.floors ? 'Rooftop' : (cFloor === 0 ? 'Ground Floor' : `Floor ${cFloor + 1}`);
          this.locationBanner.innerText = `🏢 ${cityMatch.label} (${floorText})`;
        } else {
          this.locationBanner.innerText = '🏙️ City Quarantine Sector (Open Streets)';
        }
      }
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate(now: number) {
    requestAnimationFrame((t) => this.animate(t));

    const elapsedMs = now - this.lastRenderTime;
    this.lastRenderTime = now;
    const delta = Math.min(Math.max(elapsedMs / 1000, 0.001), 0.08);

    this.player.update(delta);
    this.inventory.updatePickups(this.player.position, delta);
    this.lightPool.update(this.player.position, this.environment.isNight, delta);
    this.worldDecorator.updateVisibility(this.player.position);
    if (this.grassSystem) {
      this.grassSystem.update(this.player.position);
    }

    this.renderer.render(this.scene, this.camera);

    // Update HUD at 4 Hz to avoid per-frame DOM layout churn on low-end CPUs & mobile
    this.fpsAccum += Math.max(elapsedMs, 1);
    this.fpsFrames++;
    if (this.fpsAccum >= 250) {
      this.updateHUD((this.fpsFrames * 1000) / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}

(window as unknown as { __gameApp?: GameApp }).__gameApp = new GameApp();
