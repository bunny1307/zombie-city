import * as THREE from 'three';
import { ModelLoader } from './modelLoader.ts';
import { PlayerController } from './player.ts';
import { extractPackIslands, extractNamedSubNodes, ExtractedAsset } from './packExtractor.ts';
import { ExclusionRect } from './grassSystem.ts';
import { InventorySystem } from './inventory.ts';
import { AbandonedHouseInterior } from './buildings/abandonedInterior.ts';
import { CityBlockBuildings, CityBuildingMeta } from './buildings/cityBuildings.ts';
import { PooledLightManager } from './lightPool.ts';

interface CullRegion {
  group: THREE.Group;
  centerX: number;
  centerZ: number;
  maxDistSq: number;
}

export class WorldDecorator {
  scene: THREE.Scene;
  loader: ModelLoader;
  player: PlayerController;
  inventory?: InventorySystem;
  lightPool?: PooledLightManager;
  cullRegions: CullRegion[] = [];
  buildingExclusions: ExclusionRect[] = [];
  cityBuildingMetas: CityBuildingMeta[] = [];
  private treeChunks: { meshes: THREE.InstancedMesh[]; centerX: number; centerZ: number }[] = [];
  private interiorHouses: { id: string; cx: number; cz: number; group: THREE.Group; bounds: THREE.Box3 }[] = [];
  private solidWallMeshes: THREE.Mesh[] = [];
  private structuralMeshes: THREE.Mesh[] = [];

  constructor(
    scene: THREE.Scene,
    loader: ModelLoader,
    player: PlayerController,
    inventory?: InventorySystem,
    lightPool?: PooledLightManager
  ) {
    this.scene = scene;
    this.loader = loader;
    this.player = player;
    this.inventory = inventory;
    this.lightPool = lightPool;
  }

  private createCullGroup(centerX: number, centerZ: number, maxDist = 72): THREE.Group {
    const g = new THREE.Group();
    this.scene.add(g);
    this.cullRegions.push({ group: g, centerX, centerZ, maxDistSq: maxDist * maxDist });
    return g;
  }

  updateVisibility(playerPos: THREE.Vector3) {
    for (const r of this.cullRegions) {
      const dx = r.centerX - playerPos.x;
      const dz = r.centerZ - playerPos.z;
      r.group.visible = (dx * dx + dz * dz) < r.maxDistSq;
    }
    const maxTreeDistSq = 118 * 118;
    for (const tc of this.treeChunks) {
      const dx = tc.centerX - playerPos.x;
      const dz = tc.centerZ - playerPos.z;
      const vis = (dx * dx + dz * dz) < maxTreeDistSq;
      for (const m of tc.meshes) m.visible = vis;
    }
  }

  private snapshotStructureMeshes() {
    this.solidWallMeshes = [];
    this.structuralMeshes = [];
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    this.scene.updateMatrixWorld(true);
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const hasTransparent = mats.some((m) => m && (m.transparent || m.opacity < 0.99));
      this.structuralMeshes.push(obj);
      if (hasTransparent) return;
      box.setFromObject(obj);
      box.getSize(size);
      // Solid opaque walls / structural facades (never short curbs, floors, or small trim)
      if (size.y >= 1.5) {
        this.solidWallMeshes.push(obj);
      }
    });
  }

  /**
   * Finds the exact millimeter world surface of an opaque vertical structural wall along (dirX, 0, dirZ),
   * verifying horizontal & vertical span so paintings/clocks/alarms never overlap doorways or windows.
   */
  private snapToSolidWall(
    probeX: number,
    y: number,
    probeZ: number,
    dirX: number,
    dirZ: number,
    maxDist = 8.0,
    spanHalf = 0.36,
    customTargets?: THREE.Object3D[]
  ): { point: THREE.Vector3; nx: number; nz: number; rotY: number } | null {
    const targets = customTargets ?? this.solidWallMeshes;
    if (targets.length === 0) return null;

    const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();
    const tanX = dir.z;
    const tanZ = -dir.x;
    const raycaster = new THREE.Raycaster();
    raycaster.far = maxDist;

    const origin = new THREE.Vector3(probeX, y, probeZ);
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(targets, true).filter((h) => h.distance >= 0.15);
    if (hits.length === 0) return null;
    const primary = hits[0];

    // Reject hits on floors/ceilings or steeply slanted geometry
    if (primary.face) {
      const worldNorm = primary.face.normal.clone().transformDirection(primary.object.matrixWorld);
      if (Math.abs(worldNorm.y) > 0.35) return null;
    }

    // Verify wall solidity across horizontal span (+ optional vertical window/door exclusion)
    if (spanHalf > 0.05) {
      for (const side of [-spanHalf, spanHalf]) {
        const sOrig = new THREE.Vector3(probeX + tanX * side, y, probeZ + tanZ * side);
        raycaster.set(sOrig, dir);
        const sHits = raycaster.intersectObjects(targets, true).filter((h) => h.distance >= 0.15);
        if (sHits.length === 0 || Math.abs(sHits[0].distance - primary.distance) > 0.07) {
          return null;
        }
      }
      if (customTargets) {
        for (const dy of [-0.28, 0.28]) {
          for (const side of [-spanHalf, 0, spanHalf]) {
            const cOrig = new THREE.Vector3(probeX + tanX * side, y + dy, probeZ + tanZ * side);
            raycaster.set(cOrig, dir);
            const cHits = raycaster.intersectObjects(customTargets, true).filter((h) => h.distance >= 0.15);
            if (cHits.length === 0 || Math.abs(cHits[0].distance - primary.distance) > 0.07) {
              return null;
            }
          }
        }
      }
    }

    const nx = -dir.x;
    const nz = -dir.z;
    return {
      point: primary.point.clone(),
      nx,
      nz,
      rotY: Math.atan2(nx, nz)
    };
  }

  /**
   * Raycasts straight down from startY to find exact walkable floor slab height at (x, z).
   */
  private raycastFloor(x: number, z: number, startY = 39.0, maxDrop = 40.0, targets?: THREE.Object3D[]): number | null {
    const objs = targets ?? this.structuralMeshes;
    if (objs.length === 0) return null;
    const rc = new THREE.Raycaster(new THREE.Vector3(x, startY, z), new THREE.Vector3(0, -1, 0), 0.05, maxDrop);
    const hits = rc.intersectObjects(objs, true);
    for (const h of hits) {
      if (h.face) {
        const wn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        if (wn.y > 0.7) return h.point.y;
      } else {
        return h.point.y;
      }
    }
    return null;
  }

  /**
   * Detects the primary habitable ground-floor elevation of a GLB house (even on raised foundations like 1.22m or 2.60m).
   */
  private getGLBHouseFloorY(house: { cx: number; cz: number; group: THREE.Group; bounds: THREE.Box3 }): number {
    const mn = house.bounds.min;
    const mx = house.bounds.max;
    const bins = new Map<string, { count: number; sum: number }>();
    const stepX = Math.max(0.8, (mx.x - mn.x) / 8);
    const stepZ = Math.max(0.8, (mx.z - mn.z) / 8);
    for (let x = mn.x + 1.0; x <= mx.x - 1.0; x += stepX) {
      for (let z = mn.z + 1.0; z <= mx.z - 1.0; z += stepZ) {
        for (const startY of [mn.y + 1.5, mn.y + 3.2]) {
          const fy = this.raycastFloor(x, z, startY, startY - mn.y + 0.05, [house.group]);
          if (fy === null || fy <= mn.y + 0.12 || fy > mn.y + 3.1) continue;
          const k = (Math.round(fy * 10) / 10).toFixed(1);
          const entry = bins.get(k) ?? { count: 0, sum: 0 };
          entry.count++;
          entry.sum += fy;
          bins.set(k, entry);
        }
      }
    }
    let bestCount = 0;
    let bestY = mn.y + 0.2;
    for (const v of bins.values()) {
      if (v.count > bestCount) {
        bestCount = v.count;
        bestY = v.sum / v.count;
      }
    }
    return bestY;
  }

  async populateAll(): Promise<ExclusionRect[]> {
    await this.placeInteriorHouses();
    this.snapshotStructureMeshes();
    await Promise.all([
      this.place22CityBuildingsPack(),
      this.placeAllVehicles(),
      this.placeMilitaryCratesAndWeapons(),
      this.placePaintingsPostersAndCeramics(),
      this.placeRoomPropsAndArmchairs(),
      this.placeMedicalAndFoodProps(),
      this.placeCC0DoorsWindowsSteps(),
      this.placeCC0InteriorFurnishings()
    ]);
    return this.buildingExclusions;
  }

  async placeInteriorHouses() {
    const specs = [
      { id: 'realistic_house_with_interior', x: -116, y: 0.2, z: 58, rot: Math.PI / 2 },
      { id: 'house_with_interior', x: -85, y: 0.2, z: 26, rot: Math.PI },
      { id: 'abandoned_house', x: -124, y: 0.2, z: 24, rot: Math.PI / 2 },
      { id: 'living_room_suite', x: -115, y: 0.2, z: 95, rot: 0 }
    ];
    for (const s of specs) {
      const grp = new THREE.Group();
      grp.name = `house_wrap_${s.id}`;
      this.scene.add(grp);
      await this.loader.placeOnMap(s.id, grp, s.x, s.y, s.z, s.rot, this.player, 'walkable');
      grp.updateMatrixWorld(true);
      if (s.id === 'abandoned_house') {
        new AbandonedHouseInterior(this.scene, this.player, this.lightPool ?? null);
        if (this.inventory) {
          await this.inventory.registerPickup('food_fried_meat', new THREE.Vector3(-123.5, 4.08, 23.0), 2, 35);
          await this.inventory.registerPickup('ammo_12_gauge', new THREE.Vector3(-118.5, 0.94, 22.5), 12, 25);
        }
      }
      const bounds = new THREE.Box3().setFromObject(grp);
      this.interiorHouses.push({ id: s.id, cx: s.x, cz: s.z, group: grp, bounds });
      if (!bounds.isEmpty()) {
        this.buildingExclusions.push({
          minX: bounds.min.x - 0.5,
          maxX: bounds.max.x + 0.5,
          minZ: bounds.min.z - 0.5,
          maxZ: bounds.max.z + 0.5
        });
      }
    }
  }

  async place22CityBuildingsPack() {
    // Build all 22 urban buildings as 100% explorable multi-story structures with exact per-wall/floor/stair colliders!
    const cityBlocks = new CityBlockBuildings(this.scene, this.player, this.lightPool ?? null, this.inventory);
    this.cityBuildingMetas.push(...cityBlocks.metas);
    this.buildingExclusions.push(...cityBlocks.exclusions);
    for (const b of cityBlocks.groups) {
      this.cullRegions.push({ group: b.group, centerX: b.cx, centerZ: b.cz, maxDistSq: 155 * 155 });
    }
  }

  async placeAllVehicles() {
    // 1. Military Gunship on Tower Alpha Rooftop Helipad:
    // Tight multi-part OBBs matching fuselage, stub wings, nose turret, raised tail boom & rotor hub
    await this.loader.placeOnMap('military_gunship', this.scene, -4.2, 36.45, -0.5, -0.4, undefined, 'none');
    this.loader.addCompoundOBBs(this.player, -4.2, 36.45, -0.5, -0.4, [
      { center: [0, 1.05, 0.54], size: [1.65, 1.95, 3.33], tag: 'gunship_fuselage' },
      { center: [0, 1.05, 0.55], size: [3.06, 0.55, 1.45], tag: 'gunship_wings' },
      { center: [0, 1.10, 3.26], size: [1.36, 1.75, 2.07], tag: 'gunship_nose' },
      { center: [0, 1.68, -2.84], size: [0.85, 2.10, 3.42], tag: 'gunship_tail' },
      { center: [0, 2.35, 1.48], size: [0.75, 0.50, 0.75], tag: 'gunship_rotor_hub' }
    ]);

    // 2. Police Cruisers (tight compound OBBs: low chassis/hood/trunk + cabin + lightbar!)
    const policeCruiserSpots: [number, number, number, number][] = [
      [79, 0.22, -29, -Math.PI / 2 + 0.18],
      [79, 0.22, -41, -Math.PI / 2 - 0.12],
      [4.2, 0.212, 18.5, 0.55],
      [-5.2, 0.212, -24.0, 0.28],
      [71.0, 0.212, 19.0, -0.32],
      [-61.5, 0.212, 62.0, 0.15],
      [-61.5, 0.212, 24.0, Math.PI - 0.2],
      [-7.5, 0.212, -108.0, Math.PI / 2 + 0.25],
      [32.0, 0.212, 2.8, -Math.PI / 2 + 0.12],
      [-32.0, 0.212, -2.8, Math.PI / 2 - 0.14]
    ];
    for (const [px, py, pz, prot] of policeCruiserSpots) {
      await this.loader.placeOnMap('police_cruiser', this.scene, px, py, pz, prot, undefined, 'none');
      this.loader.addCompoundOBBs(this.player, px, py, pz, prot, [
        { center: [0, 0.44, 0], size: [4.82, 0.88, 1.80], tag: 'police_cruiser_chassis' },
        { center: [-0.28, 1.13, 0], size: [2.24, 0.54, 1.50], tag: 'police_cruiser_cabin' },
        { center: [-0.25, 1.46, 0], size: [0.26, 0.18, 1.06], tag: 'police_cruiser_lightbar' }
      ]);
    }

    // 2b. Bloody Quarantine Barricades (`barrier_bloody.glb`) replacing ALL street/checkpoint/building barricades
    const barricadeSpots: { x: number; y: number; z: number; rot: number }[] = [
      { x: -4.0, y: 0.212, z: 22.0, rot: 0.1 },
      { x: 2.0, y: 0.212, z: 23.0, rot: -0.05 },
      { x: 66.0, y: 0.212, z: 0.0, rot: Math.PI / 2 },
      { x: 66.0, y: 0.212, z: 5.0, rot: Math.PI / 2 + 0.1 },
      { x: -56.0, y: 0.212, z: -22.0, rot: Math.PI / 2 },
      { x: 2.5, y: 0.212, z: 28.0, rot: 0.15 },
      { x: -3.5, y: 0.212, z: 28.0, rot: -0.1 },
      { x: 3.5, y: 0.212, z: -20.0, rot: Math.PI + 0.1 },
      { x: -2.0, y: 0.212, z: -20.0, rot: Math.PI },
      { x: 74.2, y: 0.212, z: -27.2, rot: 0.35 },
      { x: 74.2, y: 0.212, z: -43.0, rot: -0.25 },
      { x: 75.5, y: 0.22, z: -22.5, rot: 0.35 },
      { x: 75.5, y: 0.22, z: -47.0, rot: -0.25 },
      { x: 76.5, y: 0.22, z: 24.0, rot: 0.2 },
      { x: 76.5, y: 0.22, z: 45.0, rot: -0.2 },
      { x: -57.5, y: 0.212, z: 45.0, rot: 0.08 },
      { x: -63.0, y: 0.212, z: 45.0, rot: -0.12 },
      { x: 26.0, y: 0.212, z: -3.5, rot: Math.PI / 2 },
      { x: 26.0, y: 0.212, z: 3.5, rot: Math.PI / 2 + 0.15 },
      { x: -26.0, y: 0.212, z: -3.5, rot: Math.PI / 2 },
      { x: -26.0, y: 0.212, z: 3.5, rot: Math.PI / 2 - 0.1 },
      { x: -4.5, y: 0.212, z: -115.0, rot: 0.2 },
      { x: 4.5, y: 0.212, z: -115.0, rot: -0.2 },
      { x: 12.5, y: 0.225, z: 12.5, rot: -Math.PI / 4 },
      { x: -12.5, y: 0.225, z: 12.5, rot: Math.PI / 4 }
    ];
    const barrierParts: { center: [number, number, number]; size: [number, number, number]; tag: string }[] = [
      { center: [0, 0.165, 0], size: [1.87, 0.33, 0.64], tag: 'barrier_base' },
      { center: [0, 0.79, 0], size: [1.87, 0.92, 0.32], tag: 'barrier_wall' }
    ];
    for (const b of barricadeSpots) {
      await this.loader.placeOnMap('barrier_bloody', this.scene, b.x, b.y, b.z, b.rot, undefined, 'none');
      this.loader.addCompoundOBBs(this.player, b.x, b.y, b.z, b.rot, barrierParts);
    }

    // 3. Armored Tank & Tactical 4x4 (multi-part compound OBBs matching hull, tracks, turret, cannon & humvee hood/cab!)
    await this.loader.placeOnMap('armored_tank', this.scene, -2.5, 0.212, 36, 0.15, undefined, 'none');
    this.loader.addCompoundOBBs(this.player, -2.5, 0.212, 36, 0.15, [
      { center: [0, 0.98, -0.94], size: [3.28, 1.35, 7.00], tag: 'tank_hull' },
      { center: [1.19, 0.60, -0.79], size: [0.54, 1.19, 6.49], tag: 'tank_track_l' },
      { center: [-1.19, 0.60, -0.79], size: [0.54, 1.19, 6.49], tag: 'tank_track_r' },
      { center: [0, 2.06, -0.75], size: [2.58, 1.39, 5.52], tag: 'tank_turret' },
      { center: [0, 1.93, 2.40], size: [0.51, 0.72, 4.07], tag: 'tank_barrel' }
    ]);

    const humveeParts: { center: [number, number, number]; size: [number, number, number]; tag: string }[] = [
      { center: [-1.88, 0.65, -0.15], size: [0.82, 1.30, 2.18], tag: 'humvee_hood' },
      { center: [0.0, 0.90, -0.15], size: [2.98, 1.79, 2.32], tag: 'humvee_cab' },
      { center: [1.90, 0.975, -0.16], size: [0.78, 1.95, 2.20], tag: 'humvee_rear' }
    ];
    await this.loader.placeOnMap('tactical_4x4', this.scene, 5.0, 0.212, 31, -0.35, undefined, 'none');
    this.loader.addCompoundOBBs(this.player, 5.0, 0.212, 31, -0.35, humveeParts);
    await this.loader.placeOnMap('tactical_4x4', this.scene, 69, 0.212, 6, Math.PI - 0.2, undefined, 'none');
    this.loader.addCompoundOBBs(this.player, 69, 0.212, 6, Math.PI - 0.2, humveeParts);

    // 4. Civilian Cars Pack (exact per-car Lower Body + Upper Cabin compound OBBs computed from scaled vertices!)
    const carsRaw = await this.loader.loadRaw('civilian_cars_pack');
    if (carsRaw) {
      const cars = extractNamedSubNodes(carsRaw.object, (n) => /^car[1-4]$/i.test(n));
      const carPartCache = new Map<string, { center: [number, number, number]; size: [number, number, number]; tag: string }[]>();
      const computeCarParts = (carGroup: THREE.Group, scale: number, id: string) => {
        const cached = carPartCache.get(id);
        if (cached) return cached;
        carGroup.updateMatrixWorld(true);
        const fullBox = new THREE.Box3().setFromObject(carGroup);
        const h = fullBox.getSize(new THREE.Vector3()).y * scale;
        const splitY = h * 0.56;
        const lowerBox = new THREE.Box3();
        const upperBox = new THREE.Box3();
        const v = new THREE.Vector3();
        carGroup.traverse((c) => {
          if (c instanceof THREE.Mesh && c.geometry) {
            const pos = c.geometry.getAttribute('position');
            if (!pos) return;
            for (let vi = 0; vi < pos.count; vi++) {
              v.fromBufferAttribute(pos, vi).applyMatrix4(c.matrixWorld).multiplyScalar(scale);
              if (v.y <= splitY + 0.04) lowerBox.expandByPoint(v);
              if (v.y >= splitY - 0.04) upperBox.expandByPoint(v);
            }
          }
        });
        const parts: { center: [number, number, number]; size: [number, number, number]; tag: string }[] = [];
        for (const [b, tag] of [[lowerBox, `${id}_body`], [upperBox, `${id}_cabin`]] as [THREE.Box3, string][]) {
          if (!b.isEmpty()) {
            const sz = b.getSize(new THREE.Vector3());
            const ctr = b.getCenter(new THREE.Vector3());
            if (sz.x > 0.1 && sz.y > 0.06 && sz.z > 0.1) {
              parts.push({ center: [ctr.x, ctr.y, ctr.z], size: [sz.x, sz.y, sz.z], tag });
            }
          }
        }
        carPartCache.set(id, parts);
        return parts;
      };

      const placements = [
        { x: -3.5, z: -26, rot: 0.22 },
        { x: 3.8, z: -55, rot: Math.PI - 0.15 },
        { x: -24, z: 3.2, rot: Math.PI / 2 + 0.3 },
        { x: 26, z: -3.5, rot: -Math.PI / 2 - 0.1 },
        { x: 73, z: 26, rot: 0.4 },
        { x: 74, z: 44, rot: Math.PI - 0.25 },
        { x: -62, z: 42, rot: 0.12 },
        { x: -57, z: -15, rot: Math.PI + 0.3 },
        { x: -12, z: -112, rot: Math.PI / 2 - 0.2 },
        { x: 18, z: 138, rot: -Math.PI / 2 + 0.2 }
      ];

      for (let i = 0; i < placements.length && cars.length > 0; i++) {
        const carSpec = cars[i % cars.length];
        const p = placements[i];
        const carClone = carSpec.group.clone(true);
        const maxSide = Math.max(carSpec.size.x, carSpec.size.z);
        const s = 4.3 / Math.max(maxSide, 0.1);
        carClone.scale.setScalar(s);
        carClone.position.set(p.x, 0.212, p.z);
        carClone.rotation.y = p.rot;
        carClone.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.castShadow = false;
            c.receiveShadow = false;
          }
        });
        this.scene.add(carClone);

        const parts = computeCarParts(carSpec.group, s, carSpec.id);
        this.loader.addCompoundOBBs(this.player, p.x, 0.212, p.z, p.rot, parts);
      }
    }
  }

  async placeMilitaryCratesAndWeapons() {
    // 1. Physical Army Supply Boxes & Wooden Weapon Crates spread across landmarks + street checkpoints
    const crateDrops: { boxId: 'prop_army_supply_box' | 'prop_wooden_weapon_crate'; x: number; y: number; z: number; rot: number; respawn: number; items: { tpl: string; amount: number; dx: number; dz: number }[] }[] = [
      // Ground Spawn South Plaza Supply Box (right next to player starting spot!)
      {
        boxId: 'prop_army_supply_box',
        x: 3.4, y: 0.225, z: 14.5, rot: -0.3, respawn: 24,
        items: [
          { tpl: 'mk2_grenade', amount: 2, dx: -0.15, dz: 0.0 },
          { tpl: 'ammo_45_acp', amount: 30, dx: 0.2, dz: 0.12 }
        ]
      },
      // Tower Alpha Rooftop Helipad (right near player spawn!)
      {
        boxId: 'prop_army_supply_box',
        x: 1.0, y: 36.45, z: 7.6, rot: 0.3, respawn: 24,
        items: [
          { tpl: 'mk2_grenade', amount: 2, dx: -0.15, dz: 0.0 },
          { tpl: 'ammo_45_acp', amount: 30, dx: 0.18, dz: 0.15 }
        ]
      },
      {
        boxId: 'prop_wooden_weapon_crate',
        x: 1.0, y: 36.45, z: 9.2, rot: -0.2, respawn: 25,
        items: [
          { tpl: 'pump_shotgun', amount: 1, dx: 0, dz: 0 },
          { tpl: 'ammo_12_gauge', amount: 12, dx: 0.35, dz: -0.25 }
        ]
      },
      // Central Tank & Armored Checkpoint
      {
        boxId: 'prop_army_supply_box',
        x: 6.2, y: 0.212, z: 34.5, rot: 0.4, respawn: 25,
        items: [
          { tpl: 'assault_rifle', amount: 1, dx: 0, dz: 0 },
          { tpl: 'f1_grenade', amount: 2, dx: 0.3, dz: 0.2 }
        ]
      },
      {
        boxId: 'prop_wooden_weapon_crate',
        x: -5.8, y: 0.212, z: 33.5, rot: 0.1, respawn: 25,
        items: [
          { tpl: 'thompson_smg', amount: 1, dx: 0, dz: 0 },
          { tpl: 'ammo_556_nato', amount: 30, dx: -0.3, dz: 0.2 }
        ]
      },
      // Hospital Ambulance Quarantine Crates
      {
        boxId: 'prop_army_supply_box',
        x: 79, y: 0.22, z: 30, rot: 0.2, respawn: 25,
        items: [
          { tpl: 'pistol_9mm', amount: 1, dx: 0, dz: 0 },
          { tpl: 'stick_grenade', amount: 2, dx: 0.3, dz: -0.15 }
        ]
      },
      {
        boxId: 'prop_wooden_weapon_crate',
        x: 78.5, y: 0.22, z: 40.5, rot: -0.3, respawn: 25,
        items: [
          { tpl: 'kabar_knife', amount: 1, dx: 0, dz: 0 },
          { tpl: 'ammo_9mm_para', amount: 36, dx: 0.3, dz: 0.2 }
        ]
      },
      // Police Armory & Courtyard Supply Crates
      {
        boxId: 'prop_wooden_weapon_crate',
        x: 114.5, y: 0.5, z: -29.5, rot: 0, respawn: 25,
        items: [
          { tpl: 'pump_shotgun', amount: 1, dx: 0, dz: 0 },
          { tpl: 'ammo_12_gauge', amount: 18, dx: -0.3, dz: 0.3 }
        ]
      },
      {
        boxId: 'prop_army_supply_box',
        x: 117.0, y: 0.5, z: -29.5, rot: Math.PI / 2, respawn: 25,
        items: [
          { tpl: 'assault_rifle', amount: 1, dx: 0, dz: 0 },
          { tpl: 'm1911_pistol', amount: 1, dx: 0.25, dz: -0.25 },
          { tpl: 'mk2_grenade', amount: 2, dx: -0.25, dz: 0.2 }
        ]
      },
      {
        boxId: 'prop_army_supply_box',
        x: 81.2, y: 0.22, z: -24.5, rot: 0.25, respawn: 24,
        items: [
          { tpl: 'ppsh_smg', amount: 1, dx: 0, dz: 0 },
          { tpl: 'f1_grenade', amount: 2, dx: 0.28, dz: 0.2 }
        ]
      },
      // School Campus Yard Supply Crate
      {
        boxId: 'prop_army_supply_box',
        x: -14.0, y: 0.22, z: -118.5, rot: 0.15, respawn: 28,
        items: [
          { tpl: 'm1_garand', amount: 1, dx: 0, dz: 0 },
          { tpl: 'ammo_30_06', amount: 24, dx: 0.3, dz: 0.15 },
          { tpl: 'nr40_knife', amount: 1, dx: -0.3, dz: 0.15 }
        ]
      },
      // Spread-out City Street Drop Boxes
      {
        boxId: 'prop_army_supply_box',
        x: -52.5, y: 0.225, z: 22.0, rot: 0.5, respawn: 25,
        items: [
          { tpl: 'stg44_rifle', amount: 1, dx: 0, dz: 0 },
          { tpl: 'stick_grenade', amount: 2, dx: 0.3, dz: 0.2 },
          { tpl: 'ammo_556_nato', amount: 30, dx: -0.3, dz: 0.2 }
        ]
      },
      {
        boxId: 'prop_wooden_weapon_crate',
        x: -52.5, y: 0.225, z: 62.5, rot: -0.4, respawn: 25,
        items: [
          { tpl: 'thompson_smg', amount: 1, dx: 0, dz: 0 },
          { tpl: 'mk2_grenade', amount: 2, dx: 0.25, dz: -0.2 }
        ]
      },
      {
        boxId: 'prop_army_supply_box',
        x: 56.0, y: 0.225, z: -78.0, rot: 0.3, respawn: 25,
        items: [
          { tpl: 'ppsh_smg', amount: 1, dx: 0, dz: 0 },
          { tpl: 'ammo_9mm_para', amount: 36, dx: 0.3, dz: 0.15 }
        ]
      },
      {
        boxId: 'prop_wooden_weapon_crate',
        x: 34.0, y: 0.225, z: 9.5, rot: -0.25, respawn: 25,
        items: [
          { tpl: 'm1_garand', amount: 1, dx: 0, dz: 0 },
          { tpl: 'f1_grenade', amount: 2, dx: -0.25, dz: 0.2 }
        ]
      },
      {
        boxId: 'prop_army_supply_box',
        x: 13.0, y: 0.225, z: -50.0, rot: 0.18, respawn: 25,
        items: [
          { tpl: 'pump_shotgun', amount: 1, dx: 0, dz: 0 },
          { tpl: 'ammo_12_gauge', amount: 12, dx: 0.3, dz: 0.18 }
        ]
      }
    ];

    const dropTasks: Promise<unknown>[] = [];
    for (const drop of crateDrops) {
      dropTasks.push((async () => {
        await this.loader.placeOnMap(drop.boxId, this.scene, drop.x, drop.y, drop.z, drop.rot, this.player, 'obb');
        // Place weapons cleanly inside the open army box tray (~0.36m) or top of wooden weapon crate (~0.38m)
        const topY = drop.boxId === 'prop_army_supply_box' ? drop.y + 0.36 : drop.y + 0.38;
        for (const it of drop.items) {
          if (this.inventory) {
            await this.inventory.registerPickup(
              it.tpl,
              new THREE.Vector3(drop.x + it.dx, topY, drop.z + it.dz),
              it.amount,
              drop.respawn
            );
          }
        }
      })());
    }
    await Promise.all(dropTasks);

    // 2. Distinct Bullets & Ammunition Crates placed specifically around Police Cruisers & Police Station
    const ammoDrops: { tpl: string; x: number; y: number; z: number; amount: number }[] = [
      // Near Police Cruisers across the city
      { tpl: 'ammo_9mm_para', x: 76.8, y: 0.22, z: -29.2, amount: 36 },
      { tpl: 'ammo_45_acp', x: 76.8, y: 0.22, z: -41.0, amount: 30 },
      { tpl: 'ammo_12_gauge', x: 5.8, y: 0.212, z: 19.6, amount: 12 },
      { tpl: 'ammo_45_acp', x: -6.8, y: 0.212, z: -23.5, amount: 30 },
      { tpl: 'ammo_556_nato', x: 69.2, y: 0.212, z: 19.5, amount: 30 },
      { tpl: 'ammo_9mm_para', x: -59.5, y: 0.212, z: 62.4, amount: 36 },
      { tpl: 'ammo_12_gauge', x: -59.5, y: 0.212, z: 24.4, amount: 12 },
      { tpl: 'ammo_30_06', x: -7.5, y: 0.212, z: -105.8, amount: 16 },
      { tpl: 'ammo_45_acp', x: 32.0, y: 0.212, z: 0.8, amount: 30 },
      { tpl: 'ammo_556_nato', x: -32.0, y: 0.212, z: -0.8, amount: 30 },
      // Inside Police Station (+105, -35) Detective Bullpen & Armory (all distinct calibers!)
      { tpl: 'ammo_9mm_para', x: 100.5, y: 1.27, z: -42.5, amount: 36 },
      { tpl: 'ammo_45_acp', x: 100.5, y: 1.27, z: -37.0, amount: 30 },
      { tpl: 'ammo_12_gauge', x: 105.2, y: 1.27, z: -42.5, amount: 12 },
      { tpl: 'ammo_556_nato', x: 112.5, y: 0.52, z: -24.5, amount: 30 },
      { tpl: 'ammo_30_06', x: 113.5, y: 0.52, z: -24.5, amount: 16 },
      { tpl: 'ammo_45_acp', x: 94.5, y: 1.44, z: -35.0, amount: 30 },
      // Near 2BHK Master Nightstand pickup
      { tpl: 'pistol_9mm', x: -93.4, y: 0.98, z: 54.2, amount: 1 }
    ];

    const ammoBoxTpl = await this.loader.loadById('cc0_ammo_box');
    await Promise.all(ammoDrops.map(async (a) => {
      if (ammoBoxTpl) {
        const boxClone = ammoBoxTpl.object.clone(true);
        boxClone.position.set(a.x, a.y, a.z);
        this.scene.add(boxClone);
      }
      if (this.inventory) {
        await this.inventory.registerPickup(
          a.tpl,
          new THREE.Vector3(a.x, a.y + 0.16, a.z),
          a.amount,
          20
        );
      }
    }));
  }

  async placePaintingsPostersAndCeramics() {
    const raw = await this.loader.loadRaw('paintings_and_posters_pack');
    if (!raw) return;

    const pieces = extractPackIslands(raw.object, {
      weldTolerance: 0.03,
      minTris: 6,
      autoStandUpFlatY: true,
      centerY: true
    });

    const wallArt: ExtractedAsset[] = pieces.filter((p) => p.isFlatWallItem && p.size.x < 2.2 && p.size.y < 2.2);
    const ceramicProps: ExtractedAsset[] = pieces.filter((p) => !p.isFlatWallItem && p.tris >= 24);

    const regionMap = new Map<string, THREE.Group>();
    const getRegion = (cx: number, cz: number) => {
      const k = `${cx},${cz}`;
      let g = regionMap.get(k);
      if (!g) { g = this.createCullGroup(cx, cz, 65); regionMap.set(k, g); }
      return g;
    };

    // Room-interior probes cast horizontally toward solid opaque walls (never windows/openings/air!)
    const wallProbes: { px: number; y: number; pz: number; dx: number; dz: number; cx: number; cz: number; maxDist?: number }[] = [
      // 2BHK House (-85, 60) — Living, Kitchen, Hallway, Master Bed & Bed2 solid walls
      { px: -90.5, y: 2.0, pz: 62.5, dx: 0, dz: -1, cx: -85, cz: 60 },
      { px: -90.5, y: 2.0, pz: 63.0, dx: -1, dz: 0, cx: -85, cz: 60 },
      { px: -90.5, y: 2.0, pz: 65.5, dx: -1, dz: 0, cx: -85, cz: 60 },
      { px: -90.5, y: 2.0, pz: 63.5, dx: 0, dz: 1, cx: -85, cz: 60 },
      { px: -90.0, y: 2.0, pz: 56.5, dx: 1, dz: 0, cx: -85, cz: 60 },
      { px: -90.0, y: 2.0, pz: 54.4, dx: 1, dz: 0, cx: -85, cz: 60 },
      { px: -79.5, y: 2.0, pz: 56.5, dx: -1, dz: 0, cx: -85, cz: 60 },
      { px: -80.0, y: 2.0, pz: 64.5, dx: 1, dz: 0, cx: -85, cz: 60 },
      { px: -78.2, y: 2.0, pz: 63.5, dx: 0, dz: 1, cx: -85, cz: 60 },

      // School (0, -140) — Hallway, Classroom 1, Science Lab, Principal, F2 Library
      { px: -0.5, y: 2.1, pz: -135.0, dx: -1, dz: 0, cx: 0, cz: -140 },
      { px: 0.5, y: 2.1, pz: -135.0, dx: 1, dz: 0, cx: 0, cz: -140 },
      { px: -16.0, y: 2.1, pz: -152.0, dx: 0, dz: -1, cx: 0, cz: -140 },
      { px: -20.0, y: 2.1, pz: -134.0, dx: -1, dz: 0, cx: 0, cz: -140 },
      { px: 20.0, y: 2.1, pz: -127.0, dx: 1, dz: 0, cx: 0, cz: -140 },
      { px: -12.0, y: 6.1, pz: -151.0, dx: 0, dz: -1, cx: 0, cz: -140 },

      // Hospital (+105, +35) — F1 Pharmacy wall, F1 Hall, F2 Lounge, F2 Ward
      { px: 100.0, y: 2.1, pz: 35.0, dx: 0, dz: -1, cx: 105, cz: 35 },
      { px: 114.0, y: 2.1, pz: 43.0, dx: 0, dz: -1, cx: 105, cz: 35 },
      { px: 91.5, y: 6.1, pz: 29.0, dx: 0, dz: 1, cx: 105, cz: 35 },
      { px: 114.0, y: 6.1, pz: 44.0, dx: 1, dz: 0, cx: 105, cz: 35 },

      // Police Station (+105, -35) — Lobby South wall, North wall, F2 Briefing/Captain
      { px: 92.5, y: 2.1, pz: -25.0, dx: 0, dz: 1, cx: 105, cz: -35 },
      { px: 102.0, y: 2.1, pz: -45.0, dx: 0, dz: -1, cx: 105, cz: -35 },
      { px: 93.0, y: 6.0, pz: -45.0, dx: 0, dz: -1, cx: 105, cz: -35 },
      { px: 116.0, y: 6.0, pz: -38.0, dx: 1, dz: 0, cx: 105, cz: -35 },

      // Tower Alpha (0, 0) — Ground Lobby, Floors 1, 2, 3, 5, 8
      { px: -2.5, y: 2.2, pz: -8.0, dx: 0, dz: -1, cx: 0, cz: 0 },
      { px: -8.0, y: 2.2, pz: -5.0, dx: -1, dz: 0, cx: 0, cz: 0 },
      { px: -8.0, y: 5.8, pz: -4.0, dx: -1, dz: 0, cx: 0, cz: 0 },
      { px: -8.0, y: 9.4, pz: 0.0, dx: -1, dz: 0, cx: 0, cz: 0 },
      { px: -8.0, y: 13.0, pz: 0.0, dx: -1, dz: 0, cx: 0, cz: 0 },
      { px: -8.0, y: 20.2, pz: 0.0, dx: -1, dz: 0, cx: 0, cz: 0 },
      { px: -8.0, y: 31.0, pz: 0.0, dx: -1, dz: 0, cx: 0, cz: 0 }
    ];

    // Also discover solid opaque walls automatically inside all 4 GLB houses!
    for (const h of this.interiorHouses) {
      const sz = h.bounds.getSize(new THREE.Vector3());
      const floorBase = this.getGLBHouseFloorY(h);
      const yEye = floorBase + 1.65;
      const offsets: [number, number, number, number][] = [
        [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1],
        [-sz.x * 0.18, -sz.z * 0.18, -1, 0], [sz.x * 0.18, sz.z * 0.18, 1, 0],
        [-sz.x * 0.18, sz.z * 0.18, 0, 1], [sz.x * 0.18, -sz.z * 0.18, 0, -1]
      ];
      let added = 0;
      const seenKeys = new Set<string>();
      for (const [ox, oz, dx, dz] of offsets) {
        if (added >= 4) break;
        const hit = this.snapToSolidWall(h.cx + ox, yEye, h.cz + oz, dx, dz, Math.max(sz.x, sz.z) * 0.55, 0.34, [h.group]);
        if (!hit) continue;
        const key = `${Math.round(hit.point.x * 2)},${Math.round(hit.point.z * 2)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        added++;
        // Place immediately using its own GLB group hit (so rotation/flush offset uses exact plane)
        if (wallArt.length > 0) {
          const art = wallArt[(added + Math.round(Math.abs(h.cx))) % wallArt.length];
          const clone = art.group.clone(true);
          clone.traverse((c) => { if (c instanceof THREE.Mesh) c.castShadow = false; });
          const s = 0.88 / Math.max(art.size.y, 0.2);
          clone.scale.setScalar(s);
          const halfDepth = Math.max(0.015, art.size.z * s * 0.5);
          // Wrap in Y-rotated mount so inner art.group rotation.x (autoStandUp) never mixes with Euler XYZ!
          const mount = new THREE.Group();
          mount.add(clone);
          mount.position.set(
            hit.point.x + hit.nx * (halfDepth + 0.014),
            yEye,
            hit.point.z + hit.nz * (halfDepth + 0.014)
          );
          mount.rotation.y = hit.rotY;
          getRegion(h.cx, h.cz).add(mount);
        }
      }
    }

    for (let i = 0; i < wallProbes.length && wallArt.length > 0; i++) {
      const p = wallProbes[i];
      const hit = this.snapToSolidWall(p.px, p.y, p.pz, p.dx, p.dz, p.maxDist ?? 7.5, 0.36);
      if (!hit) continue;
      const art = wallArt[i % wallArt.length];
      const clone = art.group.clone(true);
      clone.traverse((c) => { if (c instanceof THREE.Mesh) c.castShadow = false; });
      const s = 0.92 / Math.max(art.size.y, 0.2);
      clone.scale.setScalar(s);
      const halfDepth = Math.max(0.015, art.size.z * s * 0.5);
      const mount = new THREE.Group();
      mount.add(clone);
      mount.position.set(
        hit.point.x + hit.nx * (halfDepth + 0.014),
        p.y,
        hit.point.z + hit.nz * (halfDepth + 0.014)
      );
      mount.rotation.y = hit.rotY;
      getRegion(p.cx, p.cz).add(mount);
    }

    const ceramicSpots = [
      { x: -90.2, y: 0.82, z: 64.1, cx: -85, cz: 60 },   // Coffee table
      { x: -81.0, y: 1.2, z: 63.8, cx: -85, cz: 60 },    // Dining table
      { x: -93.4, y: 0.96, z: 57.0, cx: -85, cz: 60 },   // Master nightstand
      { x: -80.2, y: 1.2, z: 53.7, cx: -85, cz: 60 },    // Guest study desk
      { x: -76.7, y: 1.38, z: 64.2, cx: -85, cz: 60 },   // Kitchen marble counter
      { x: 93.0, y: 1.38, z: 31.5, cx: 105, cz: 35 },
      { x: 91.0, y: 5.15, z: 27.0, cx: 105, cz: 35 },
      { x: -16.8, y: 1.34, z: -151.0, cx: 0, cz: -140 },
      { x: -1.2, y: 1.44, z: 2.5, cx: 0, cz: 0 },
      { x: -5.0, y: 11.9, z: 0.0, cx: 0, cz: 0 }
    ];

    for (let i = 0; i < ceramicSpots.length && ceramicProps.length > 0; i++) {
      const spot = ceramicSpots[i];
      const prop = ceramicProps[i % ceramicProps.length];
      const clone = prop.group.clone(true);
      clone.traverse((c) => { if (c instanceof THREE.Mesh) c.castShadow = false; });
      const s = 0.36 / Math.max(prop.size.y, prop.size.x, 0.1);
      clone.scale.setScalar(s);
      clone.position.set(spot.x, spot.y, spot.z);
      getRegion(spot.cx, spot.cz).add(clone);
    }
  }

  async placeRoomPropsAndArmchairs() {
    const chairSpots = [
      { x: -87.2, y: 0.45, z: 62.5, rot: -0.7, cx: -85, cz: 60 },
      { x: 92.0, y: 4.55, z: 39.0, rot: Math.PI / 2, cx: 105, cz: 35 },
      { x: -19.5, y: 0.5, z: -151, rot: 0.4, cx: 0, cz: -140 },
      { x: 93.0, y: 4.35, z: -38.0, rot: -0.5, cx: 105, cz: -35 },
      { x: -8.2, y: 0.5, z: -1.5, rot: 0.6, cx: 0, cz: 0 },
      { x: -8.5, y: 7.55, z: 2.0, rot: 0.8, cx: 0, cz: 0 }
    ];
    for (const cs of chairSpots) {
      const grp = this.createCullGroup(cs.cx, cs.cz, 65);
      await this.loader.placeOnMap('prop_armchair', grp, cs.x, cs.y, cs.z, cs.rot, this.player, 'obb');
    }

    // Place solid 3D retro room props (filtering out flat Plane sheets so posters never stand vertically on bare floors)
    const retroRaw = await this.loader.loadRaw('retro_room_props_pack');
    if (retroRaw) {
      const props = extractNamedSubNodes(retroRaw.object, (n) => !/^Plane/i.test(n))
        .filter((p) => !p.isFlatWallItem && p.size.x > 0.14 && p.size.z > 0.14 && p.tris >= 24);
      const retroSpots = [
        // 2BHK House (-85, 60)
        { x: -91.5, y: 0.45, z: 66.2, rot: Math.PI, cx: -85, cz: 60 },
        { x: -78.0, y: 0.45, z: 54.5, rot: -Math.PI / 2, cx: -85, cz: 60 },
        { x: -93.0, y: 0.45, z: 59.5, rot: Math.PI / 2, cx: -85, cz: 60 },
        { x: -87.0, y: 0.45, z: 53.6, rot: 0, cx: -85, cz: 60 },
        // School (0, -140)
        { x: -14.0, y: 0.5, z: -156.0, rot: 0, cx: 0, cz: -140 },
        { x: -20.0, y: 0.5, z: -156.0, rot: 0, cx: 0, cz: -140 },
        { x: -18.0, y: 4.5, z: -134.0, rot: 0, cx: 0, cz: -140 },
        { x: 14.0, y: 4.5, z: -134.0, rot: Math.PI, cx: 0, cz: -140 },
        // Police Station (+105, -35)
        { x: 95.0, y: 0.5, z: -46.0, rot: 0, cx: 105, cz: -35 },
        { x: 98.0, y: 4.35, z: -42.0, rot: 0, cx: 105, cz: -35 },
        // Hospital (+105, +35)
        { x: 91.5, y: 4.55, z: 42.0, rot: 0, cx: 105, cz: 35 },
        { x: 101.0, y: 0.5, z: 22.0, rot: 0, cx: 105, cz: 35 },
        // Tower Alpha (0, 0)
        { x: -8.0, y: 7.55, z: -8.5, rot: 0, cx: 0, cz: 0 },
        { x: -8.0, y: 11.15, z: -8.5, rot: 0, cx: 0, cz: 0 },
        { x: -8.0, y: 18.35, z: -8.5, rot: 0, cx: 0, cz: 0 }
      ];

      for (let i = 0; i < retroSpots.length && props.length > 0; i++) {
        const p = props[i % props.length];
        const spot = retroSpots[i];
        const clone = p.group.clone(true);
        clone.traverse((c) => { if (c instanceof THREE.Mesh) c.castShadow = false; });
        const s = 0.85 / Math.max(p.size.y, 0.2);
        clone.scale.setScalar(Math.min(s, 1.1));
        clone.position.set(spot.x, spot.y, spot.z);
        clone.rotation.y = spot.rot;
        const grp = this.createCullGroup(spot.cx, spot.cz, 65);
        grp.add(clone);
      }
    }
  }

  async placeMedicalAndFoodProps() {
    // 1. Collectible Food Rations in Houses, Outside/Near Hospital, Hospital Offices & Huge Tower Alpha Offices
    const collectibleFoodSpots: { tpl: string; x: number; y: number; z: number }[] = [
      // 2BHK House (-85, +60): Kitchen Countertop, Dining Table & Coffee Table
      { tpl: 'food_fried_meat', x: -76.7, y: 1.38, z: 61.4 },
      { tpl: 'food_ham', x: -81.35, y: 1.22, z: 63.65 },
      { tpl: 'food_fish', x: -90.2, y: 0.84, z: 64.0 },
      // West Residence A (-116, 58) & House B (-85, 26) & Suite (-115, 95)
      { tpl: 'food_fried_ham', x: -115.8, y: 1.32, z: 57.6 },
      { tpl: 'food_meat', x: -85.0, y: 1.98, z: 26.0 },
      { tpl: 'food_fried_meat', x: -115.0, y: 0.76, z: 95.0 },
      // Outside / Near Hospital (+105, +35): Ambulance Bay & Triage Entrance
      { tpl: 'food_fried_ham', x: 80.5, y: 0.25, z: 33.2 },
      { tpl: 'food_meat', x: 80.5, y: 0.25, z: 37.2 },
      // Inside Hospital (+105, +35): Pharmacy, Reception, Floor 2 Doctor's Office Desk & Ward Lounge
      { tpl: 'food_ham', x: 101.5, y: 1.32, z: 26.8 },
      { tpl: 'food_fish', x: 95.5, y: 1.26, z: 35.0 },
      { tpl: 'food_fried_meat', x: 91.0, y: 5.18, z: 27.0 },
      { tpl: 'food_fried_ham', x: 91.0, y: 5.12, z: 37.0 },
      // Inside Huge Building (Tower Alpha 0, 0): Reception Lobby & Multi-Floor Offices + Boardrooms
      { tpl: 'food_fried_meat', x: -2.5, y: 1.46, z: 2.5 },
      { tpl: 'food_ham', x: -7.0, y: 4.72, z: -6.0 },
      { tpl: 'food_fish', x: -7.0, y: 8.32, z: 0.0 },
      { tpl: 'food_fried_ham', x: -5.0, y: 11.94, z: 0.0 },
      { tpl: 'food_meat', x: -2.0, y: 15.52, z: 6.0 },
      { tpl: 'food_fried_meat', x: -7.0, y: 19.12, z: -6.0 },
      { tpl: 'food_fried_ham', x: -5.0, y: 22.74, z: 0.0 },
      { tpl: 'food_ham', x: -7.0, y: 26.32, z: 0.0 },
      { tpl: 'food_fish', x: -2.0, y: 29.92, z: 6.0 },
      { tpl: 'food_fried_meat', x: -5.0, y: 33.54, z: 0.0 },
      // Police Station (-35) Detective Desk Rations
      { tpl: 'food_meat', x: 105.2, y: 1.29, z: -37.0 }
    ];

    await Promise.all(
      collectibleFoodSpots.map((fs, idx) =>
        this.inventory
          ? this.inventory.registerPickup(fs.tpl, new THREE.Vector3(fs.x, fs.y, fs.z), idx % 2 === 0 ? 4 : 3, 35)
          : Promise.resolve(null)
      )
    );

    // 2. First Aid Cabinets (Hospital ER, Pharmacy, Police Precinct, 2BHK Study)
    const cabTemplate = await this.loader.loadById('prop_first_aid_cabinet');
    if (cabTemplate) {
      const cabSpots = [
        { x: 93.0, y: 1.37, z: 27.5, rot: -Math.PI / 2, scale: 0.85, cx: 105, cz: 35 },
        { x: 101.5, y: 1.30, z: 25.0, rot: Math.PI / 2, scale: 0.85, cx: 105, cz: 35 },
        { x: 94.8, y: 1.42, z: -32.6, rot: -Math.PI / 2, scale: 0.85, cx: 105, cz: -35 },
        { x: -80.2, y: 1.20, z: 53.7, rot: 0, scale: 0.72, cx: -85, cz: 60 }
      ];
      for (const s of cabSpots) {
        const clone = cabTemplate.object.clone(true);
        clone.scale.multiplyScalar(s.scale);
        clone.position.set(s.x, s.y, s.z);
        clone.rotation.y = s.rot;
        this.createCullGroup(s.cx, s.cz, 60).add(clone);
      }
    }

    // 3. Medicine Pots (Hospital Counters/Gurney, Police, 2BHK Bathroom & Master)
    const potTemplate = await this.loader.loadById('prop_medicine_pot');
    if (potTemplate) {
      const potSpots = [
        { x: 93.0, y: 1.37, z: 30.8, rot: 0.3, cx: 105, cz: 35 },
        { x: 93.0, y: 1.37, z: 31.3, rot: 1.2, cx: 105, cz: 35 },
        { x: 101.5, y: 1.30, z: 26.5, rot: 0.6, cx: 105, cz: 35 },
        { x: 101.5, y: 1.30, z: 27.0, rot: -0.5, cx: 105, cz: 35 },
        { x: 110.3, y: 1.12, z: 34.9, rot: 0.2, cx: 105, cz: 35 },
        { x: 100.5, y: 1.27, z: -42.5, rot: 0.4, cx: 105, cz: -35 },
        { x: -85.45, y: 1.23, z: 55.9, rot: 0.7, cx: -85, cz: 60 },
        { x: -93.25, y: 0.96, z: 54.4, rot: -0.4, cx: -85, cz: 60 }
      ];
      for (const s of potSpots) {
        const clone = potTemplate.object.clone(true);
        clone.position.set(s.x, s.y, s.z);
        clone.rotation.y = s.rot;
        this.createCullGroup(s.cx, s.cz, 55).add(clone);
      }
    }

    // 4. Medical Syringes (Hospital Counters, Gurney & 2BHK Nightstand)
    const syrTemplate = await this.loader.loadById('prop_medical_syringe');
    if (syrTemplate) {
      const syrSpots = [
        { x: 93.0, y: 1.37, z: 31.8, rot: 0.6, cx: 105, cz: 35 },
        { x: 101.5, y: 1.30, z: 27.6, rot: -0.4, cx: 105, cz: 35 },
        { x: 101.5, y: 1.30, z: 28.0, rot: 0.9, cx: 105, cz: 35 },
        { x: 110.0, y: 1.12, z: 35.1, rot: 1.4, cx: 105, cz: 35 },
        { x: -93.25, y: 0.96, z: 56.8, rot: 0.3, cx: -85, cz: 60 }
      ];
      for (const s of syrSpots) {
        const clone = syrTemplate.object.clone(true);
        clone.position.set(s.x, s.y, s.z);
        clone.rotation.y = s.rot;
        this.createCullGroup(s.cx, s.cz, 50).add(clone);
      }
    }
  }

  /**
   * Instanced placement of ONLY the user-provided GLB tree packs across parks,
   * sidewalks, residential yards, campus lawns, and perimeter greenspace.
   * Chunked into 4x4 InstancedMesh cells with distance culling and zero shadows.
   */
  async placeInstancedGLBTrees(isExcluded: (x: number, z: number) => boolean) {
    interface TreeProtoPart {
      geometry: THREE.BufferGeometry;
      material: THREE.Material;
    }
    interface TreePrototype {
      parts: TreeProtoPart[];
    }

    const toFastTreeMat = (srcMat: THREE.Material, isFoliage: boolean): THREE.MeshLambertMaterial => {
      const src = srcMat as THREE.MeshStandardMaterial;
      return new THREE.MeshLambertMaterial({
        map: src.map ?? null,
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        alphaTest: isFoliage ? 0.35 : (src.alphaTest > 0 ? src.alphaTest : 0),
        transparent: false,
        side: isFoliage ? THREE.DoubleSide : THREE.FrontSide
      });
    };

    const buildPrototype = (obj: THREE.Object3D, targetHeight: number, sinkY = 0): TreePrototype | null => {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return null;
      const size = box.getSize(new THREE.Vector3());
      if (size.y < 0.05) return null;

      const center = box.getCenter(new THREE.Vector3());
      const baseScale = targetHeight / size.y;
      const parts: TreeProtoPart[] = [];

      obj.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.geometry) return;
        const nameLower = (child.name || '').toLowerCase();
        const isFoliage =
          nameLower.includes('leaf') ||
          nameLower.includes('branch') ||
          nameLower.includes('foliage');

        const geo = child.geometry.clone();
        geo.applyMatrix4(child.matrixWorld);
        geo.translate(-center.x, -box.min.y, -center.z);
        geo.scale(baseScale, baseScale, baseScale);
        if (sinkY !== 0) {
          geo.translate(0, -sinkY, 0);
        }

        const srcMat = Array.isArray(child.material) ? child.material[0] : child.material;
        const mat = toFastTreeMat(srcMat, isFoliage || Boolean((srcMat as THREE.MeshStandardMaterial)?.transparent));
        parts.push({ geometry: geo, material: mat });
      });

      return parts.length > 0 ? { parts } : null;
    };

    const [oakRaw, treesRaw, lowPolyRaw] = await Promise.all([
      this.loader.loadRaw('nature_oak_trees'),
      this.loader.loadRaw('nature_trees'),
      this.loader.loadRaw('nature_trees_low_poly')
    ]);

    const prototypes: TreePrototype[] = [];

    if (oakRaw) {
      const p = buildPrototype(oakRaw.object, 7.4, 0);
      if (p) prototypes.push(p);
    }
    if (treesRaw) {
      const items = extractNamedSubNodes(treesRaw.object, (n) => /^tree[123]$/i.test(n));
      const heights = [7.8, 6.8, 8.2];
      for (let i = 0; i < items.length; i++) {
        // Sink exposed roots of brown unleafed trees ~1.05m below ground so roots grow naturally from earth
        const p = buildPrototype(items[i].group, heights[i % heights.length], 1.05);
        if (p) prototypes.push(p);
      }
    }
    if (lowPolyRaw) {
      const items = extractNamedSubNodes(lowPolyRaw.object, (n) => /^tree[46]$/i.test(n));
      const heights = [6.4, 7.3];
      for (let i = 0; i < items.length; i++) {
        const p = buildPrototype(items[i].group, heights[i % heights.length], 0);
        if (p) prototypes.push(p);
      }
    }

    if (prototypes.length === 0) return;

    const isSafeTreePos = (x: number, z: number): boolean => {
      // Keep doorways, driveways, roads, sidewalks & building walls clear
      if (
        isExcluded(x, z) ||
        isExcluded(x + 2.6, z) ||
        isExcluded(x - 2.6, z) ||
        isExcluded(x, z + 2.6) ||
        isExcluded(x, z - 2.6)
      ) {
        return false;
      }
      // Clear front approaches of Hospital, Police, School & 2BHK House
      if (x > 74 && x < 86 && z > 22 && z < 48) return false;
      if (x > 74 && x < 86 && z > -48 && z < -22) return false;
      if (x > -18 && x < 18 && z > -128 && z < -114) return false;
      if (x > -95 && x < -81 && z > 66 && z < 76) return false;
      return true;
    };

    interface PlacedTree {
      x: number;
      z: number;
      protoIdx: number;
      scale: number;
      rot: number;
    }

    const placed: PlacedTree[] = [];
    const minSpacingSq = 6.8 * 6.8;

    let seed = 9001;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const tryAddTree = (x: number, z: number) => {
      if (!isSafeTreePos(x, z)) return false;
      for (const t of placed) {
        const dx = t.x - x;
        const dz = t.z - z;
        if (dx * dx + dz * dz < minSpacingSq) return false;
      }
      placed.push({
        x,
        z,
        protoIdx: Math.floor(rand() * prototypes.length),
        scale: 0.8 + rand() * 0.45,
        rot: rand() * Math.PI * 2
      });
      return true;
    };

    // 1. Curated hero park & avenue trees around central districts & landmarks
    const heroSpots: [number, number][] = [
      // Central Park quadrants around Tower Alpha
      [-22, 22], [-34, 24], [-24, 38], [-38, 42], [-22, -22], [-34, -26], [-24, -40], [-40, -38],
      [22, 22], [35, 24], [24, 40], [42, 36], [22, -22], [36, -25], [24, -42], [44, -38],
      [-26, 68], [-40, 74], [26, 68], [42, 74], [-26, 98], [-40, 106], [26, 98], [42, 108],
      // Hospital perimeter parkland (+105, +35)
      [88, 62], [102, 62], [118, 62], [136, 54], [138, 36], [136, 18],
      // Police Station perimeter (+105, -35)
      [88, -60], [104, -60], [122, -60], [134, -46], [136, -24], [134, -14],
      // School Campus lawn (0, -140)
      [-36, -132], [-44, -148], [-34, -166], [36, -132], [44, -148], [34, -166], [-18, -170], [18, -170],
      // 2BHK Residential West neighborhood (-85, +60)
      [-76, 82], [-96, 80], [-102, 42], [-78, 42], [-146, 58], [-148, 86]
    ];
    for (const [hx, hz] of heroSpots) {
      tryAddTree(hx + (rand() - 0.5) * 2.0, hz + (rand() - 0.5) * 2.0);
    }

    // 2. Dense woodland & city-wide greenery fill across [-186..+186] up to 260 total trees
    let attempts = 0;
    while (placed.length < 260 && attempts < 2400) {
      attempts++;
      const x = -186 + rand() * 372;
      const z = -186 + rand() * 372;
      tryAddTree(x, z);
    }

    // Register compact trunk hitboxes so player collides cleanly with trunks
    for (let i = 0; i < placed.length; i++) {
      const t = placed[i];
      this.player.addCollider(
        new THREE.Box3(
          new THREE.Vector3(t.x - 0.32, 0.2, t.z - 0.32),
          new THREE.Vector3(t.x + 0.32, 3.2, t.z + 0.32)
        ),
        `glb_tree_${i}`
      );
    }

    // Group trees into 4x4 (96m x 96m) instanced spatial chunks for mobile/low-end culling
    const gridCount = 4;
    const chunkSize = 96;
    const startCoord = -(gridCount * chunkSize) / 2;
    const dummy = new THREE.Object3D();

    for (let gx = 0; gx < gridCount; gx++) {
      for (let gz = 0; gz < gridCount; gz++) {
        const minX = startCoord + gx * chunkSize;
        const minZ = startCoord + gz * chunkSize;
        const centerX = minX + chunkSize / 2;
        const centerZ = minZ + chunkSize / 2;

        const buckets: PlacedTree[][] = prototypes.map(() => []);
        for (const t of placed) {
          if (t.x >= minX && t.x < minX + chunkSize && t.z >= minZ && t.z < minZ + chunkSize) {
            buckets[t.protoIdx].push(t);
          }
        }

        const chunkMeshes: THREE.InstancedMesh[] = [];
        for (let pIdx = 0; pIdx < prototypes.length; pIdx++) {
          const list = buckets[pIdx];
          if (list.length === 0) continue;

          for (const part of prototypes[pIdx].parts) {
            const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
            inst.castShadow = false;
            inst.receiveShadow = false;

            for (let k = 0; k < list.length; k++) {
              const t = list[k];
              dummy.position.set(t.x, 0.19, t.z);
              dummy.rotation.set(0, t.rot, 0);
              dummy.scale.setScalar(t.scale);
              dummy.updateMatrix();
              inst.setMatrixAt(k, dummy.matrix);
            }
            inst.instanceMatrix.needsUpdate = true;
            this.scene.add(inst);
            chunkMeshes.push(inst);
          }
        }

        if (chunkMeshes.length > 0) {
          this.treeChunks.push({ meshes: chunkMeshes, centerX, centerZ });
        }
      }
    }
  }

  /**
   * Adds real 3D CC0 open doors & flush entrance porch/portico steps across all buildings and walkable GLB houses.
   */
  async placeCC0DoorsWindowsSteps() {
    const [doorFront, doorWood, stepsStone] = await Promise.all([
      this.loader.loadById('cc0_door_front'),
      this.loader.loadById('cc0_door_wood'),
      this.loader.loadById('cc0_steps_stone')
    ]);

    // 1. Entrance Steps (Flush from sidewalk/ground Y=0.20..0.22 up to building slab Y=0.45..0.50!)
    if (stepsStone) {
      // 2BHK Front Porch Steps (-88.0, 70.1)
      const porchStairs = stepsStone.object.clone(true);
      porchStairs.scale.x *= 2.0;
      porchStairs.scale.y *= 0.6;
      porchStairs.position.set(-88.0, 0.2, 70.1);
      this.scene.add(porchStairs);

      // Police West Portico Steps (+82.4, -35)
      const polStairs = stepsStone.object.clone(true);
      polStairs.scale.x *= 2.4;
      polStairs.scale.y *= 0.72;
      polStairs.rotation.y = Math.PI / 2;
      polStairs.position.set(82.4, 0.2, -35.0);
      this.scene.add(polStairs);

      // Hospital ER West Bay Apron Steps (flush right in front of ER landing edge X=82.2)
      const hospStairs = stepsStone.object.clone(true);
      hospStairs.scale.x *= 2.6;
      hospStairs.scale.y *= 0.72;
      hospStairs.rotation.y = Math.PI / 2;
      hospStairs.position.set(82.0, 0.2, 35.0);
      this.scene.add(hospStairs);

      // School South Entry Steps (0, -121.0)
      const schStairs = stepsStone.object.clone(true);
      schStairs.scale.x *= 2.8;
      schStairs.scale.y *= 0.72;
      schStairs.position.set(0, 0.2, -121.0);
      this.scene.add(schStairs);

      // Tower Alpha South & West Entry Steps flush on Plaza surface (y=0.22)
      const twrSouthStairs = stepsStone.object.clone(true);
      twrSouthStairs.scale.x *= 2.6;
      twrSouthStairs.scale.y *= 0.68;
      twrSouthStairs.position.set(0, 0.22, 13.0);
      this.scene.add(twrSouthStairs);

      const twrWestStairs = stepsStone.object.clone(true);
      twrWestStairs.scale.x *= 2.6;
      twrWestStairs.scale.y *= 0.68;
      twrWestStairs.rotation.y = Math.PI / 2;
      twrWestStairs.position.set(-13.0, 0.22, 0);
      this.scene.add(twrWestStairs);

      // Raised West Porch Access Staircase for house_with_interior (-85, 26 -> West open porch X=-89.9, Z=26.2, y=1.38)
      const stairMat = new THREE.MeshLambertMaterial({ color: 0x6e6a65 });
      for (let i = 0; i < 4; i++) {
        const sx = -92.3 + i * 0.65;
        const h = 0.30 + i * 0.28;
        const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 2.2), stairMat);
        stepMesh.position.set(sx, 0.2 + h / 2, 26.2);
        this.scene.add(stepMesh);
        this.player.addCollider(new THREE.Box3(
          new THREE.Vector3(sx - 0.35, 0.2, 25.1),
          new THREE.Vector3(sx + 0.35, 0.2 + h, 27.3)
        ), 'house_b_steps');
      }

      // North Open-Side Steps for living_room_suite flush against open interior edge (-113.0, 0.2..0.68, 100.8)
      const suiteStairs = stepsStone.object.clone(true);
      suiteStairs.scale.x *= 2.4;
      suiteStairs.scale.y *= 1.1;
      suiteStairs.position.set(-113.0, 0.2, 100.8);
      this.scene.add(suiteStairs);
      this.player.addCollider(new THREE.Box3(
        new THREE.Vector3(-114.5, 0.2, 100.1),
        new THREE.Vector3(-111.5, 0.56, 101.5)
      ), 'suite_steps');
    }

    // 2. Wide-Open Real 3D Exterior Doors (seated 1cm into slab top so thresholds have zero gap!)
    if (doorWood) {
      // 2BHK Front Doorway (-88, 67), slab top 0.45 -> y = 0.44
      const d = doorWood.object.clone(true);
      d.position.set(-88.78, 0.44, 66.4);
      d.rotation.y = 1.45;
      this.createCullGroup(-85, 60, 75).add(d);
      this.addOBBForMesh(d, 'cc0_door');
    }
    if (doorFront) {
      const doorEntries = [
        // Hospital ER Double Glass Doors (X: 84, Z: 35)
        { x: 84.55, y: 0.49, z: 32.65, rot: 0.15, cx: 105, cz: 35 },
        { x: 84.55, y: 0.49, z: 37.35, rot: -0.15, cx: 105, cz: 35 },
        // Police Station West Double Doors (X: 87, Z: -35)
        { x: 87.55, y: 0.49, z: -37.1, rot: 0.12, cx: 105, cz: -35 },
        { x: 87.55, y: 0.49, z: -32.9, rot: -0.12, cx: 105, cz: -35 },
        // School Front Double Doors (X: 0, Z: -122)
        { x: -1.95, y: 0.49, z: -122.55, rot: 1.42, cx: 0, cz: -140 },
        { x: 1.95, y: 0.49, z: -122.55, rot: -1.42, cx: 0, cz: -140 },
        // Tower Alpha Lobby South Double Doors (X: 0, Z: 12)
        { x: -2.05, y: 0.49, z: 11.4, rot: 1.45, cx: 0, cz: 0 },
        { x: 2.05, y: 0.49, z: 11.4, rot: -1.45, cx: 0, cz: 0 },
        // Tower Alpha Lobby West Double Doors (X: -12, Z: 0)
        { x: -11.4, y: 0.49, z: -2.05, rot: 0.12, cx: 0, cz: 0 },
        { x: -11.4, y: 0.49, z: 2.05, rot: -0.12, cx: 0, cz: 0 }
      ];
      for (const e of doorEntries) {
        const d = doorFront.object.clone(true);
        d.scale.multiplyScalar(1.22);
        d.position.set(e.x, e.y, e.z);
        d.rotation.y = e.rot;
        this.createCullGroup(e.cx, e.cz, 85).add(d);
        this.addOBBForMesh(d, 'cc0_door');
      }
    }

    // 2B. Wide-Open Interior Doors across 2BHK, Hospital, Police, School & Tower Alpha (centered inside built frames)
    const interiorDoorSpecs: { swingX: number; y: number; swingZ: number; swingRot: number; cx: number; cz: number }[] = [
      // 2BHK House (-85, 60): Master Bed, Bathroom, Bedroom 2 (floorY = 0.45 -> y = 0.44)
      { y: 0.44, swingX: -88.25, swingZ: 59.35, swingRot: Math.PI / 2 - 0.12, cx: -85, cz: 60 },
      { y: 0.44, swingX: -84.45, swingZ: 59.35, swingRot: Math.PI / 2 - 0.12, cx: -85, cz: 60 },
      { y: 0.44, swingX: -80.85, swingZ: 59.35, swingRot: Math.PI / 2 - 0.12, cx: -85, cz: 60 },
      // Hospital (+105, +35): Pharmacy, F1 Inpatient Ward Doors, F2 OR Door
      { y: 0.49, swingX: 105.7, swingZ: 31.35, swingRot: Math.PI / 2 + 0.12, cx: 105, cz: 35 },
      { y: 0.49, swingX: 112.15, swingZ: 38.65, swingRot: Math.PI / 2 - 0.12, cx: 105, cz: 35 },
      { y: 0.49, swingX: 122.15, swingZ: 38.65, swingRot: Math.PI / 2 - 0.12, cx: 105, cz: 35 },
      { y: 4.54, swingX: 110.65, swingZ: 32.35, swingRot: Math.PI / 2 + 0.12, cx: 105, cz: 35 },
      // Police Station (+105, -35): Armory Door
      { y: 0.49, swingX: 110.65, swingZ: -28.65, swingRot: 0.12, cx: 105, cz: -35 },
      // School (0, -140): Classroom 1 & Science Lab Hall Doors + Principal Door
      { y: 0.49, swingX: -4.15, swingZ: -129.35, swingRot: 0.12, cx: 0, cz: -140 },
      { y: 0.49, swingX: 4.15, swingZ: -129.35, swingRot: -0.12, cx: 0, cz: -140 },
      { y: 0.49, swingX: -8.85, swingZ: -143.65, swingRot: Math.PI / 2 - 0.12, cx: 0, cz: -140 },
      // Tower Alpha (0, 0): Stairwell Fire Doors F0..F3
      { y: 0.49, swingX: 4.65, swingZ: -3.8, swingRot: 0.14, cx: 0, cz: 0 },
      { y: 3.87, swingX: 4.65, swingZ: -3.8, swingRot: 0.14, cx: 0, cz: 0 },
      { y: 7.47, swingX: 4.65, swingZ: -3.8, swingRot: 0.14, cx: 0, cz: 0 },
      { y: 11.07, swingX: 4.65, swingZ: -3.8, swingRot: 0.14, cx: 0, cz: 0 }
    ];
    for (const idoor of interiorDoorSpecs) {
      const grp = this.createCullGroup(idoor.cx, idoor.cz, 75);
      if (doorWood) {
        const leaf = doorWood.object.clone(true);
        leaf.scale.y *= 0.91;
        leaf.position.set(idoor.swingX, idoor.y, idoor.swingZ);
        leaf.rotation.y = idoor.swingRot;
        grp.add(leaf);
        this.addOBBForMesh(leaf, 'cc0_door');
      }
    }

    // Open-side patio cutout at living_room_suite does not have an exterior doorway wall; keep entry clear.
  }

  /**
   * Computes an exact rotated OBB from any placed prop/door mesh (handling hinge pivots cleanly).
   */
  private addOBBForMesh(obj: THREE.Object3D, tag = 'cc0_prop') {
    const savedRotY = obj.rotation.y;
    const savedPos = obj.position.clone();
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const localBox = new THREE.Box3().setFromObject(obj);
    obj.position.copy(savedPos);
    obj.rotation.y = savedRotY;
    obj.updateMatrixWorld(true);
    if (localBox.isEmpty()) return;
    const size = localBox.getSize(new THREE.Vector3());
    const center = localBox
      .getCenter(new THREE.Vector3())
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), savedRotY)
      .add(savedPos);
    this.player.addOBB(
      center,
      new THREE.Vector3(Math.max(0.06, size.x), Math.max(0.06, size.y), Math.max(0.06, size.z)),
      savedRotY,
      tag
    );
  }

  /**
   * Places authentic CC0 furniture, multi-bed hospital wards, wheelchairs, jail gear,
   * office/school desks, computers, swivel chairs, and home furnishings inside all 5 main buildings.
   */
  async placeCC0InteriorFurnishings() {
    const [
      hospBed, wheelchair, medCart, crutches, clipboard,
      jailGate, bedBunk, cellToilet, cellSink, bench,
      screen, keyboard, laptop, officeChair,
      schoolDesk, schoolChair, bookshelf, plant, secCam,
      sofa, lowDesk, tv, fridge, stove,
      bedDouble, bedSingle, bathtub, toilet, sink,
      // Round 2 (all 32 unique CC0-1.0 models)
      trashcan, metalStool, coffeeMachine, toaster, coatRack, ceilingFan, doormat, radio,
      chemistrySet, coffeeCart, projectorScreen, wallClock, fireAlarm, wetFloorSign, steelShelves, ammoBox,
      generator, floodLightsRaw, deskLamp, stationery, notepads, booksSet, alarmClock, microwave,
      plunger, medTape, vase, planterBox, football, gamepad, brassPan, crowbar
    ] = await Promise.all([
      this.loader.loadById('cc0_hospital_bed'),
      this.loader.loadById('cc0_wheelchair'),
      this.loader.loadById('cc0_medical_cart'),
      this.loader.loadById('cc0_crutches'),
      this.loader.loadById('cc0_clipboard'),
      this.loader.loadById('cc0_jail_gate'),
      this.loader.loadById('cc0_bed_bunk'),
      this.loader.loadById('cc0_cell_toilet'),
      this.loader.loadById('cc0_cell_sink'),
      this.loader.loadById('cc0_bench'),
      this.loader.loadById('cc0_computer_screen'),
      this.loader.loadById('cc0_keyboard'),
      this.loader.loadById('cc0_laptop'),
      this.loader.loadById('cc0_office_chair'),
      this.loader.loadById('cc0_school_desk'),
      this.loader.loadById('cc0_school_chair'),
      this.loader.loadById('cc0_bookshelf'),
      this.loader.loadById('cc0_potted_plant'),
      this.loader.loadById('cc0_security_camera'),
      this.loader.loadById('cc0_sofa'),
      this.loader.loadById('cc0_desk'),
      this.loader.loadById('cc0_tv'),
      this.loader.loadById('cc0_kitchen_fridge'),
      this.loader.loadById('cc0_kitchen_stove'),
      this.loader.loadById('cc0_bed_double'),
      this.loader.loadById('cc0_bed_single'),
      this.loader.loadById('cc0_bathtub'),
      this.loader.loadById('cc0_toilet'),
      this.loader.loadById('cc0_sink'),
      this.loader.loadById('cc0_trashcan'),
      this.loader.loadById('cc0_metal_stool'),
      this.loader.loadById('cc0_coffee_machine'),
      this.loader.loadById('cc0_toaster'),
      this.loader.loadById('cc0_coat_rack'),
      this.loader.loadById('cc0_ceiling_fan'),
      this.loader.loadById('cc0_doormat'),
      this.loader.loadById('cc0_radio'),
      this.loader.loadById('cc0_chemistry_set'),
      this.loader.loadById('cc0_coffee_cart'),
      this.loader.loadById('cc0_projector_screen'),
      this.loader.loadById('cc0_wall_clock'),
      this.loader.loadById('cc0_fire_alarm'),
      this.loader.loadById('cc0_wet_floor_sign'),
      this.loader.loadById('cc0_steel_shelves'),
      this.loader.loadById('cc0_ammo_box'),
      this.loader.loadById('cc0_portable_generator'),
      this.loader.loadRaw('cc0_flood_lights'),
      this.loader.loadById('cc0_desk_lamp'),
      this.loader.loadById('cc0_stationery'),
      this.loader.loadById('cc0_notepads'),
      this.loader.loadById('cc0_books_set'),
      this.loader.loadById('cc0_alarm_clock'),
      this.loader.loadById('cc0_microwave'),
      this.loader.loadById('cc0_plunger'),
      this.loader.loadById('cc0_medical_tape'),
      this.loader.loadById('cc0_vase'),
      this.loader.loadById('cc0_planter_box'),
      this.loader.loadById('cc0_football'),
      this.loader.loadById('cc0_gamepad'),
      this.loader.loadById('cc0_brass_pan'),
      this.loader.loadById('cc0_crowbar')
    ]);

    // Extract single grounded standing double floodlight assembly + solid steel tripod base so heads never float!
    let floodLights: { object: THREE.Object3D } | null = null;
    if (floodLightsRaw) {
      const flGroup = new THREE.Group();
      const parts = extractNamedSubNodes(floodLightsRaw.object, (n) => /^flood_lights_standing_double_a_/i.test(n));
      if (parts.length > 0) {
        const subWrap = new THREE.Group();
        floodLightsRaw.object.traverse((n) => {
          if (n.name && /^flood_lights_standing_double_a_/i.test(n.name)) {
            const c = n.clone(true);
            subWrap.add(c);
          }
        });
        subWrap.position.set(2.0, 0, 0);
        flGroup.add(subWrap);
      }
      const steelMat = new THREE.MeshLambertMaterial({ color: 0x22262b });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.42, 8), steelMat);
      pole.position.set(0, 0.71, 0);
      flGroup.add(pole);
      for (const ang of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.72, 6), steelMat);
        leg.position.set(Math.sin(ang) * 0.22, 0.28, Math.cos(ang) * 0.22);
        leg.rotation.z = -Math.sin(ang) * 0.65;
        leg.rotation.x = Math.cos(ang) * 0.65;
        flGroup.add(leg);
      }
      floodLights = { object: flGroup };
    }

    // Refine doormat look: rich charcoal-coir color and low profile so it never looks like a thick tan board
    if (doormat) {
      const matCoir = new THREE.MeshLambertMaterial({ color: 0x3a2e25 });
      doormat.object.traverse((c) => {
        if (c instanceof THREE.Mesh) c.material = matCoir;
      });
      doormat.object.scale.y *= 0.45;
      doormat.object.scale.x *= 0.62;
      doormat.object.scale.z *= 0.62;
    }

    const placeClone = (
      tmpl: { object: THREE.Object3D } | null,
      parent: THREE.Group,
      x: number, y: number, z: number,
      rotY = 0,
      scaleMul = 1.0,
      colliderSize?: [number, number, number]
    ) => {
      if (!tmpl) return null;
      const obj = tmpl.object.clone(true);
      if (scaleMul !== 1.0) obj.scale.multiplyScalar(scaleMul);
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      parent.add(obj);
      if (colliderSize) {
        this.player.addOBB(
          new THREE.Vector3(x, y + colliderSize[1] / 2, z),
          new THREE.Vector3(colliderSize[0], colliderSize[1], colliderSize[2]),
          rotY,
          'cc0_furniture'
        );
      } else if (tmpl !== doormat) {
        this.addOBBForMesh(obj, 'cc0_prop');
      }
      return obj;
    };

    const mountOnWall = (
      tmpl: { object: THREE.Object3D } | null,
      parent: THREE.Group,
      px: number, y: number, pz: number,
      dx: number, dz: number,
      depthOffset = 0.032,
      spanHalf = 0.14,
      scaleMul = 1.0,
      customTargets?: THREE.Object3D[]
    ) => {
      if (!tmpl) return null;
      const hit = this.snapToSolidWall(px, y, pz, dx, dz, 7.5, spanHalf, customTargets);
      if (!hit) return null;
      const obj = tmpl.object.clone(true);
      if (scaleMul !== 1.0) obj.scale.multiplyScalar(scaleMul);
      obj.position.set(hit.point.x + hit.nx * depthOffset, y, hit.point.z + hit.nz * depthOffset);
      obj.rotation.y = hit.rotY;
      parent.add(obj);
      this.addOBBForMesh(obj, 'cc0_wall_prop');
      return obj;
    };

    const mountOnCeiling = (
      tmpl: { object: THREE.Object3D } | null,
      parent: THREE.Group,
      x: number, floorY: number, z: number,
      dropHeight = 0.31
    ) => {
      if (!tmpl || this.structuralMeshes.length === 0) return null;
      const rc = new THREE.Raycaster(new THREE.Vector3(x, floorY + 0.6, z), new THREE.Vector3(0, 1, 0), 0.5, 4.5);
      const hits = rc.intersectObjects(this.structuralMeshes, true);
      const ceilY = hits.length > 0 ? hits[0].point.y : floorY + 3.2;
      return placeClone(tmpl, parent, x, ceilY - dropHeight, z, 0, 1.0);
    };

    const placeComputerRig = (parent: THREE.Group, x: number, deskTopY: number, z: number, rotY: number) => {
      if (screen) {
        const mon = screen.object.clone(true);
        mon.position.set(x, deskTopY, z);
        mon.rotation.y = rotY;
        parent.add(mon);
        this.addOBBForMesh(mon, 'cc0_prop');
      }
      if (keyboard) {
        const kb = keyboard.object.clone(true);
        const fwdX = Math.sin(rotY) * 0.22;
        const fwdZ = Math.cos(rotY) * 0.22;
        kb.position.set(x + fwdX, deskTopY, z + fwdZ);
        kb.rotation.y = rotY;
        parent.add(kb);
        this.addOBBForMesh(kb, 'cc0_prop');
      }
    };

    // ==================== 1. HOSPITAL (+105, +35) ====================
    const hospGrp = this.createCullGroup(105, 35, 70);
    if (hospBed) {
      const mattressMat = new THREE.MeshLambertMaterial({ color: 0xeef2f6 });
      const blanketMat = new THREE.MeshLambertMaterial({ color: 0x3f849c });
      const pillowMat = new THREE.MeshLambertMaterial({ color: 0xf7f9fb });
      const addMattressParts = (parentObj: THREE.Object3D) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 1.92), mattressMat);
        m.position.set(0, 0.56, 0);
        parentObj.add(m);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 1.25), blanketMat);
        b.position.set(0, 0.62, 0.32);
        parentObj.add(b);
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.34), pillowMat);
        p.position.set(0, 0.68, -0.7);
        parentObj.add(p);
      };

      const bedCoords = [
        { x: 112.5, y: 0.5, z: 41.5, rot: 0 },
        { x: 112.5, y: 0.5, z: 47.5, rot: 0 },
        { x: 121.5, y: 0.5, z: 41.5, rot: 0 },
        { x: 121.5, y: 0.5, z: 47.5, rot: 0 },
        { x: 89.0, y: 0.5, z: 47.5, rot: 0 },
        { x: 93.5, y: 0.5, z: 47.5, rot: 0 },
        { x: 111.0, y: 4.55, z: 47.0, rot: 0 },
        { x: 117.0, y: 4.55, z: 47.0, rot: 0 },
        { x: 123.0, y: 4.55, z: 47.0, rot: 0 }
      ];
      for (const bc of bedCoords) {
        const clone = hospBed.object.clone(true);
        const bedGroup = new THREE.Group();
        bedGroup.add(clone);
        addMattressParts(bedGroup);
        bedGroup.position.set(bc.x, bc.y, bc.z);
        bedGroup.rotation.y = bc.rot;
        hospGrp.add(bedGroup);
        this.player.addOBB(new THREE.Vector3(bc.x, bc.y + 0.64, bc.z), new THREE.Vector3(0.98, 1.29, 2.15), bc.rot, 'cc0_hospital_bed');
      }
    }

    for (const wc of [
      { x: 87.2, y: 0.5, z: 31.0, rot: 0.5 },
      { x: 90.0, y: 0.5, z: 42.5, rot: -0.6 },
      { x: 102.0, y: 0.5, z: 35.8, rot: 1.9 },
      { x: 107.0, y: 4.55, z: 41.5, rot: 0.4 }
    ]) {
      placeClone(wheelchair, hospGrp, wc.x, wc.y, wc.z, wc.rot, 1.0, [0.8, 1.0, 1.0]);
    }
    placeClone(medCart, hospGrp, 100.5, 0.5, 30.2, 0, 0.85, [0.85, 1.0, 0.65]);
    placeClone(medCart, hospGrp, 108.5, 0.5, 45.0, Math.PI / 2, 0.85, [0.85, 1.0, 0.65]);
    placeClone(medCart, hospGrp, 114.2, 4.55, 28.0, 0, 0.85, [0.85, 1.0, 0.65]);
    placeClone(crutches, hospGrp, 94.2, 0.5, 31.8, 0.3, 1.0);
    placeClone(crutches, hospGrp, 107.6, 0.5, 43.2, -0.4, 1.0);
    placeClone(clipboard, hospGrp, 93.1, 1.38, 28.4, 0.4, 1.0);
    placeClone(clipboard, hospGrp, 101.6, 1.31, 26.2, -0.2, 1.0);
    placeClone(officeChair, hospGrp, 94.1, 0.5, 29.5, -Math.PI / 2, 1.05);
    placeComputerRig(hospGrp, 93.1, 1.38, 29.5, Math.PI / 2);
    placeClone(laptop, hospGrp, 91.0, 4.55 + 0.82, 27.0, 0.3, 1.0);
    placeClone(officeChair, hospGrp, 91.0, 4.55, 28.0, Math.PI, 1.05);
    placeClone(plant, hospGrp, 85.5, 0.5, 31.2, 0, 1.15);
    placeClone(secCam, hospGrp, 85.0, 3.6, 35.0, Math.PI / 2, 1.0);
    // Round 2 Hospital Props: ER Doormat, Wet Floor Sign, Pharmacy Shelves/Chemistry, OR Flood Light/Stools, Doctor Lounge
    placeClone(doormat, hospGrp, 85.2, 0.502, 35.0, Math.PI / 2, 1.25);
    placeClone(wetFloorSign, hospGrp, 88.2, 0.5, 35.5, 0.3, 1.0);
    placeClone(trashcan, hospGrp, 89.2, 0.5, 31.0, 0, 1.0);
    placeClone(trashcan, hospGrp, 115.0, 0.5, 44.5, 0, 1.0);
    placeClone(trashcan, hospGrp, 119.5, 4.55, 44.5, 0, 1.0);
    placeClone(vase, hospGrp, 93.1, 1.38, 30.8, 0, 1.0);
    placeClone(steelShelves, hospGrp, 114.2, 0.5, 22.0, Math.PI, 1.0, [0.93, 2.05, 0.58]);
    placeClone(steelShelves, hospGrp, 115.6, 0.5, 22.0, Math.PI, 1.0, [0.93, 2.05, 0.58]);
    placeClone(chemistrySet, hospGrp, 101.5, 1.31, 24.0, Math.PI / 2, 0.9);
    placeClone(medTape, hospGrp, 101.6, 1.31, 25.0, 0.2, 1.2);
    placeClone(medTape, hospGrp, 113.5, 0.5, 41.0, 0.1, 1.2);
    // Floor 2 OR & Lounge
    placeClone(chemistrySet, hospGrp, 116.0, 4.55, 25.5, 0, 0.9);
    placeClone(metalStool, hospGrp, 114.5, 4.55, 25.5, Math.PI / 2, 1.0);
    placeClone(metalStool, hospGrp, 117.5, 4.55, 25.5, -Math.PI / 2, 1.0);
    placeClone(floodLights, hospGrp, 119.0, 4.55, 23.0, -Math.PI * 0.75, 0.9, [0.65, 1.9, 0.65]);
    placeClone(coffeeCart, hospGrp, 95.0, 4.55, 21.5, 0, 1.0, [1.2, 1.05, 0.7]);
    placeClone(coffeeMachine, hospGrp, 95.0, 5.45, 21.5, 0, 1.0);
    placeClone(microwave, hospGrp, 91.0, 5.37, 25.5, Math.PI / 2, 0.9);
    placeClone(booksSet, hospGrp, 91.2, 5.37, 28.1, Math.PI / 2, 1.0);
    // Hospital Clocks & Alarms flush on solid walls
    mountOnWall(wallClock, hospGrp, 98.0, 2.6, 35.0, 0, -1, 0.032, 0.16);
    mountOnWall(wallClock, hospGrp, 114.0, 6.7, 45.0, 1, 0, 0.032, 0.16);
    mountOnWall(fireAlarm, hospGrp, 96.0, 1.5, 35.0, 0, -1, 0.025, 0.08);
    // Roof generator
    const hospRoofY = this.raycastFloor(105, 35, 11.0, 5.0) ?? 8.8;
    placeClone(generator, hospGrp, 100.0, hospRoofY, 24.0, 0.2, 1.2, [1.1, 0.85, 0.7]);

    // ==================== 2. POLICE STATION (+105, -35) ====================
    const polGrp = this.createCullGroup(105, -35, 70);
    placeClone(jailGate, polGrp, 108.8, 0.5, -44.9, 1.4, 0.85);
    placeClone(jailGate, polGrp, 108.8, 0.5, -39.4, 1.4, 0.85);
    for (const cz of [-46.0, -40.0]) {
      placeClone(bedBunk, polGrp, 120.2, 0.5, cz, -Math.PI / 2, 1.0, [1.07, 1.59, 2.05]);
      placeClone(cellToilet, polGrp, 121.6, 0.5, cz + 2.0, -Math.PI / 2, 1.0, [0.46, 0.78, 0.65]);
      placeClone(cellSink, polGrp, 121.6, 0.5, cz - 1.6, -Math.PI / 2, 1.0, [0.50, 0.85, 0.45]);
    }
    placeClone(bench, polGrp, 90.5, 0.5, -27.5, Math.PI / 2, 1.1, [0.52, 0.60, 0.26]);
    placeClone(bench, polGrp, 90.5, 0.5, -42.5, Math.PI / 2, 1.1, [0.52, 0.60, 0.26]);
    for (const d of [
      { x: 100.5, z: -42.5 },
      { x: 100.5, z: -37.0 },
      { x: 105.2, z: -42.5 },
      { x: 105.2, z: -37.0 }
    ]) {
      placeComputerRig(polGrp, d.x - 0.35, 1.27, d.z - 0.14, 0);
      placeComputerRig(polGrp, d.x + 0.35, 1.27, d.z - 0.14, 0);
      placeClone(officeChair, polGrp, d.x, 0.5, d.z + 0.78, Math.PI, 1.05);
      placeClone(stationery, polGrp, d.x - 0.65, 1.27, d.z + 0.18, 0.2, 1.0);
      placeClone(notepads, polGrp, d.x + 0.65, 1.27, d.z + 0.15, -0.3, 1.0);
    }
    placeClone(deskLamp, polGrp, 100.8, 1.27, -42.7, 0.4, 1.0);
    placeClone(deskLamp, polGrp, 105.6, 1.27, -37.2, -0.5, 1.0);
    placeClone(radio, polGrp, 94.7, 1.43, -36.1, Math.PI / 2, 1.0);
    placeClone(radio, polGrp, 100.2, 1.27, -37.1, 0.4, 1.0);
    placeComputerRig(polGrp, 94.7, 1.43, -35.0, Math.PI / 2);
    placeClone(clipboard, polGrp, 94.6, 1.43, -34.0, -0.3, 1.0);
    placeClone(officeChair, polGrp, 95.6, 0.5, -35.0, -Math.PI / 2, 1.05);
    placeClone(secCam, polGrp, 88.2, 3.6, -35.0, Math.PI / 2, 1.0);
    placeClone(secCam, polGrp, 108.5, 3.6, -42.5, 0, 1.0);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        placeClone(officeChair, polGrp, 114.5 + row * 2.0, 4.35, -40 + col * 2.0, Math.PI / 2, 1.02, [0.55, 0.95, 0.55]);
      }
    }
    placeClone(laptop, polGrp, 93.0, 4.35 + 0.88, -41.0, 0.1, 1.0);
    placeClone(officeChair, polGrp, 93.0, 4.35, -39.9, Math.PI, 1.05);
    placeClone(bookshelf, polGrp, 90.0, 4.35, -47.2, 0, 1.05, [0.98, 2.15, 0.62]);
    placeClone(plant, polGrp, 89.2, 0.5, -39.5, 0, 1.1);
    // Round 2 Police Props: Lobby Doormat/WetSign/CoatRack/Trashcans, Bullpen Coffee Cart, Armory Gear, F2 Projector
    placeClone(doormat, polGrp, 88.2, 0.502, -35.0, Math.PI / 2, 1.2);
    placeClone(wetFloorSign, polGrp, 91.5, 0.5, -35.0, -0.4, 1.0);
    placeClone(coatRack, polGrp, 89.0, 0.5, -24.5, 0, 1.0);
    placeClone(trashcan, polGrp, 96.2, 0.5, -33.2, 0, 1.0);
    placeClone(trashcan, polGrp, 108.0, 0.5, -47.0, 0, 1.0);
    placeClone(coffeeCart, polGrp, 104.5, 0.5, -29.0, Math.PI, 1.0, [1.2, 1.05, 0.7]);
    placeClone(coffeeMachine, polGrp, 104.5, 1.4, -29.0, Math.PI, 1.0);
    // Armory (X:110..123, Z:-33..-21)
    placeClone(steelShelves, polGrp, 113.5, 0.5, -23.0, 0, 1.0, [0.93, 2.05, 0.58]);
    placeClone(steelShelves, polGrp, 115.0, 0.5, -23.0, 0, 1.0, [0.93, 2.05, 0.58]);
    placeClone(ammoBox, polGrp, 116.7, 1.38, -29.7, 0.3, 1.1);
    placeClone(ammoBox, polGrp, 117.3, 1.38, -29.3, -0.2, 1.1);
    placeClone(crowbar, polGrp, 113.8, 0.5, -29.5, 0.4, 1.0);
    placeClone(generator, polGrp, 120.5, 0.5, -23.2, -0.6, 1.15, [1.0, 0.8, 0.65]);
    // F2 Briefing & Captain Office
    placeClone(projectorScreen, polGrp, 111.5, 4.35, -37.0, Math.PI / 2, 1.1);
    placeClone(coffeeCart, polGrp, 120.5, 4.35, -43.5, -Math.PI / 2, 1.0);
    placeClone(deskLamp, polGrp, 92.4, 4.35 + 0.88, -41.2, 0.3, 1.0);
    placeClone(booksSet, polGrp, 93.6, 4.35 + 0.88, -41.0, 0, 1.0);
    placeClone(coatRack, polGrp, 89.2, 4.35, -45.5, 0, 1.0);
    mountOnWall(wallClock, polGrp, 101.0, 2.5, -45.0, 0, -1, 0.032, 0.16);
    mountOnWall(wallClock, polGrp, 114.0, 6.4, -37.0, 1, 0, 0.032, 0.16);
    mountOnWall(fireAlarm, polGrp, 105.0, 1.5, -45.0, 0, -1, 0.025, 0.08);

    // ==================== 3. SCHOOL (0, -140) ====================
    const schGrp = this.createCullGroup(0, -140, 75);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const dx = -20 + col * 4.2;
        const dz = -135.8 + row * 3.2;
        placeClone(schoolDesk, schGrp, dx, 0.5, dz, 0, 1.15, [0.9, 0.85, 0.65]);
        placeClone(schoolChair, schGrp, dx, 0.5, dz + 0.68, Math.PI, 1.02);
        if ((row + col) % 2 === 0) placeClone(notepads, schGrp, dx - 0.12, 1.28, dz, 0.1, 0.9);
        if (row === 1 && col === 1) placeClone(booksSet, schGrp, dx + 0.14, 1.28, dz, 0, 0.9);
      }
    }
    placeClone(officeChair, schGrp, -14.0, 0.5, -140.5, 0, 1.05);
    placeClone(laptop, schGrp, -14.0, 1.35, -139.6, Math.PI, 1.0);
    placeClone(officeChair, schGrp, -16.0, 0.5, -152.1, 0, 1.05);
    placeComputerRig(schGrp, -16.0, 1.30, -151.0, Math.PI);
    placeClone(bookshelf, schGrp, -23.6, 0.5, -154.0, Math.PI / 2, 1.1, [1.02, 2.25, 0.64]);
    placeClone(bookshelf, schGrp, -14.0, 4.55, -151.5, 0, 1.15, [1.07, 2.35, 0.67]);
    placeClone(bookshelf, schGrp, -11.5, 4.55, -151.5, 0, 1.15, [1.07, 2.35, 0.67]);
    placeClone(plant, schGrp, -2.4, 0.5, -124.2, 0, 1.15);
    placeClone(plant, schGrp, 2.4, 0.5, -124.2, 0, 1.15);
    // Round 2 School Props: Hallway, Classroom, Science Lab (3 lab tables at X=14.5), Principal, F2 Library
    placeClone(doormat, schGrp, 0, 0.502, -123.0, 0, 1.3);
    placeClone(wetFloorSign, schGrp, -1.5, 0.5, -127.0, 0.4, 1.0);
    placeClone(trashcan, schGrp, 2.5, 0.5, -128.0, 0, 1.0);
    placeClone(trashcan, schGrp, -23.8, 0.5, -138.0, 0, 1.0);
    placeClone(bench, schGrp, -2.6, 0.5, -135.0, Math.PI / 2, 1.0);
    placeClone(bench, schGrp, 2.6, 0.5, -135.0, -Math.PI / 2, 1.0);
    placeClone(football, schGrp, -22.2, 0.5, -125.0, 0.3, 1.1);
    // Principal Office
    placeClone(deskLamp, schGrp, -16.8, 1.30, -151.2, 0.5, 1.0);
    placeClone(stationery, schGrp, -15.3, 1.30, -150.8, 0.2, 1.0);
    placeClone(booksSet, schGrp, -15.4, 1.30, -151.4, -0.3, 1.0);
    placeClone(coatRack, schGrp, -23.0, 0.5, -145.0, 0, 1.0);
    // Science Lab (X: +3.5..+25): 3 tables at X=14.5, Z=-137, -132.8, -128.6
    for (const lz of [-137.0, -132.8, -128.6]) {
      const labTopY = this.raycastFloor(14.5, lz, 2.6, 2.2) ?? 1.37;
      placeClone(chemistrySet, schGrp, 14.5, labTopY, lz, 0, 1.05);
      placeClone(notepads, schGrp, 13.4, labTopY, lz + 0.1, 0.2, 0.9);
      placeClone(metalStool, schGrp, 12.6, 0.5, lz, Math.PI / 2, 1.0);
      placeClone(metalStool, schGrp, 16.4, 0.5, lz, -Math.PI / 2, 1.0);
    }
    placeClone(steelShelves, schGrp, 24.0, 0.5, -132.0, -Math.PI / 2, 1.0, [0.93, 2.05, 0.58]);
    placeClone(steelShelves, schGrp, 24.0, 0.5, -133.5, -Math.PI / 2, 1.0, [0.93, 2.05, 0.58]);
    placeClone(trashcan, schGrp, 23.5, 0.5, -124.5, 0, 1.0);
    // F2 Library tables (X=-17.5, -12.5, -7.5, Z=-133)
    for (const tx of [-17.5, -12.5, -7.5]) {
      const libTopY = this.raycastFloor(tx, -133.0, 6.4, 2.2) ?? 5.33;
      placeClone(booksSet, schGrp, tx - 0.3, libTopY, -133.0, 0, 1.05);
      placeClone(deskLamp, schGrp, tx + 0.35, libTopY, -133.1, -0.3, 1.0);
      placeClone(schoolChair, schGrp, tx, 4.55, -131.8, Math.PI, 1.0);
      placeClone(schoolChair, schGrp, tx, 4.55, -134.2, 0, 1.0);
    }
    placeClone(projectorScreen, schGrp, -12.5, 4.55, -141.0, 0, 1.15);
    mountOnWall(wallClock, schGrp, -14.0, 2.8, -138.0, 0, -1, 0.032, 0.16);
    mountOnWall(wallClock, schGrp, 14.5, 2.8, -135.0, 1, 0, 0.032, 0.16);
    mountOnWall(wallClock, schGrp, -12.5, 6.7, -145.0, 0, -1, 0.032, 0.16);
    mountOnWall(fireAlarm, schGrp, -0.5, 1.5, -128.0, -1, 0, 0.025, 0.08);

    // ==================== 4. 2BHK HOUSE (-85, 60) ====================
    const h2Grp = this.createCullGroup(-85, 60, 60);
    placeClone(sofa, h2Grp, -90.2, 0.45, 62.2, 0, 1.0, [2.1, 0.9, 1.0]);
    if (lowDesk) {
      const coffee = lowDesk.object.clone(true);
      coffee.scale.set(coffee.scale.x * 1.1, coffee.scale.y * 0.487, coffee.scale.z * 0.95);
      coffee.position.set(-90.2, 0.45, 64.1);
      h2Grp.add(coffee);
      this.player.addOBB(new THREE.Vector3(-90.2, 0.64, 64.1), new THREE.Vector3(1.5, 0.38, 0.75), 0, 'cc0_coffee_table');
    }
    placeClone(tv, h2Grp, -93.4, 0.95, 63.6, Math.PI / 2, 1.0);
    placeClone(plant, h2Grp, -92.8, 0.45, 65.8, 0, 1.0);
    placeClone(fridge, h2Grp, -76.75, 0.45, 66.0, -Math.PI / 2, 1.0, [0.75, 1.9, 0.9]);
    placeClone(stove, h2Grp, -76.7, 0.45, 60.8, -Math.PI / 2, 1.0, [0.8, 0.95, 0.8]);
    placeClone(schoolChair, h2Grp, -81.0, 0.45, 62.9, 0, 0.95);
    placeClone(schoolChair, h2Grp, -81.0, 0.45, 64.75, Math.PI, 0.95);
    placeClone(bedDouble, h2Grp, -91.6, 0.45, 55.6, Math.PI / 2, 1.0, [2.15, 0.72, 1.85]);
    placeClone(bedSingle, h2Grp, -77.6, 0.45, 55.4, 0, 1.0, [1.05, 0.7, 2.05]);
    placeClone(schoolChair, h2Grp, -80.2, 0.45, 54.5, Math.PI, 0.95);
    placeClone(laptop, h2Grp, -80.7, 1.20, 53.7, 0.2, 1.0);
    placeClone(bathtub, h2Grp, -84.0, 0.45, 53.8, 0, 1.0, [1.75, 0.65, 0.85]);
    placeClone(toilet, h2Grp, -82.6, 0.45, 55.9, -Math.PI / 2, 1.0, [0.48, 0.80, 0.68]);
    placeClone(sink, h2Grp, -85.45, 0.45, 55.9, Math.PI / 2, 1.0, [0.65, 0.88, 0.52]);
    // Round 2 2BHK Porch & Interior Props
    placeClone(doormat, h2Grp, -88.0, 0.452, 67.6, 0, 1.15);
    placeClone(planterBox, h2Grp, -90.4, 0.45, 67.6, 0, 1.0);
    placeClone(planterBox, h2Grp, -85.6, 0.45, 67.6, 0, 1.0);
    mountOnCeiling(ceilingFan, h2Grp, -90.0, 0.45, 63.5);
    mountOnCeiling(ceilingFan, h2Grp, -90.0, 0.45, 56.0);
    placeClone(gamepad, h2Grp, -89.8, 0.82, 64.25, 0.4, 1.0);
    placeClone(radio, h2Grp, -93.4, 0.96, 65.0, Math.PI / 2, 1.0);
    placeClone(vase, h2Grp, -81.0, 1.20, 64.2, 0, 1.0);
    placeClone(coatRack, h2Grp, -86.6, 0.45, 66.2, 0, 1.0);
    placeClone(trashcan, h2Grp, -77.6, 0.45, 65.4, 0, 0.95);
    // Kitchen Countertop & Stove (Marble counter top y=1.36)
    placeClone(microwave, h2Grp, -76.7, 1.36, 62.35, -Math.PI / 2, 0.95);
    placeClone(coffeeMachine, h2Grp, -76.7, 1.36, 65.15, -Math.PI / 2, 1.0);
    placeClone(toaster, h2Grp, -76.7, 1.36, 63.95, -Math.PI / 2, 1.0);
    placeClone(brassPan, h2Grp, -76.7, 1.38, 60.8, 0.3, 1.0);
    // Master Bed, Bed2, Bathroom
    placeClone(alarmClock, h2Grp, -93.4, 0.96, 56.8, Math.PI / 2, 1.0);
    placeClone(alarmClock, h2Grp, -80.2, 1.20, 54.0, 0.2, 1.0);
    placeClone(deskLamp, h2Grp, -80.35, 1.20, 53.55, -0.5, 0.95);
    placeClone(stationery, h2Grp, -79.85, 1.20, 53.75, 0.1, 0.95);
    placeClone(booksSet, h2Grp, -80.0, 1.20, 53.55, 0, 0.95);
    placeClone(bookshelf, h2Grp, -87.0, 0.45, 53.8, 0, 0.95, [0.88, 1.95, 0.55]);
    placeClone(football, h2Grp, -78.6, 0.45, 57.8, 0.2, 1.0);
    placeClone(plunger, h2Grp, -82.6, 0.45, 55.0, 0, 1.0);
    mountOnWall(wallClock, h2Grp, -90.0, 2.25, 63.5, 0, -1, 0.032, 0.16);

    // ==================== 5. TOWER ALPHA (0, 0) — Ground + ALL 9 Upper Floors + Rooftop ====================
    const twrGrp = this.createCullGroup(0, 0, 75);
    placeClone(sofa, twrGrp, -8.0, 0.5, -5.0, Math.PI / 2, 1.15, [2.4, 1.1, 1.2]);
    placeClone(plant, twrGrp, -9.8, 0.5, 9.5, 0, 1.2);
    placeClone(plant, twrGrp, 9.8, 0.5, 9.5, 0, 1.2);
    placeComputerRig(twrGrp, -2.5, 1.44, 2.5, 0);
    placeClone(officeChair, twrGrp, -2.5, 0.5, 1.4, 0, 1.05);
    placeClone(secCam, twrGrp, -10.5, 3.3, 10.5, Math.PI * 0.75, 1.0);
    placeClone(doormat, twrGrp, 0, 0.502, 10.6, 0, 1.35);
    placeClone(doormat, twrGrp, -10.6, 0.502, 0, Math.PI / 2, 1.35);
    placeClone(wetFloorSign, twrGrp, -1.6, 0.5, 7.8, 0.4, 1.0);
    placeClone(trashcan, twrGrp, -3.9, 0.5, 2.5, 0, 1.0);
    placeClone(coatRack, twrGrp, 2.6, 0.5, 9.5, 0, 1.0);
    placeClone(vase, twrGrp, -1.3, 1.44, 2.5, 0, 1.0);
    placeClone(radio, twrGrp, -3.5, 1.44, 2.4, -0.3, 1.0);
    mountOnWall(wallClock, twrGrp, 0, 2.7, -8.0, 0, -1, 0.032, 0.16);
    mountOnWall(fireAlarm, twrGrp, -8.0, 1.5, -5.0, -1, 0, 0.025, 0.08);

    // Populate ALL 9 Upper Floors (F1..F9) using exact raycastFloor slab heights!
    const officeDeskCoords = [
      { x: -7.0, z: -6.0 },
      { x: -7.0, z: 0.0 },
      { x: -7.0, z: 6.0 },
      { x: -2.0, z: 6.0 }
    ];
    for (let f = 1; f <= 9; f++) {
      // Probe open carpet floor (-0.5, -7.5) clear of desks/tables/chairs so fy never snaps onto furniture!
      const fy = this.raycastFloor(-0.5, -7.5, f * 3.6 + 1.2, 1.6) ?? (f * 3.6 + 0.34);
      if (f % 3 === 0) {
        // Executive Conference Floor (F3, F6, F9) — Conference table (-5, 0)
        const tableTopY = this.raycastFloor(-5.0, 0.0, fy + 1.5, 1.5) ?? (fy + 0.77);
        placeClone(projectorScreen, twrGrp, -5.0, fy, -6.5, 0, 1.15, [1.6, 2.05, 0.35]);
        placeClone(coffeeCart, twrGrp, 0.5, fy, -6.5, -Math.PI / 2, 1.0, [1.2, 1.05, 0.7]);
        placeClone(booksSet, twrGrp, -5.0, tableTopY, 0.8, 0, 1.0);
        placeClone(notepads, twrGrp, -5.2, tableTopY, -1.2, 0.2, 1.0);
        placeClone(notepads, twrGrp, -4.8, tableTopY, 1.8, -0.2, 1.0);
        placeClone(plant, twrGrp, -10.2, fy, -9.8, 0, 1.15);
        for (const cz of [-2.0, 0.0, 2.0]) {
          placeClone(officeChair, twrGrp, -6.8, fy, cz, Math.PI / 2, 1.0, [0.55, 0.95, 0.55]);
          placeClone(officeChair, twrGrp, -3.2, fy, cz, -Math.PI / 2, 1.0, [0.55, 0.95, 0.55]);
        }
        mountOnWall(wallClock, twrGrp, -6.0, fy + 2.2, 0.0, -1, 0, 0.032, 0.16);
      } else {
        // Office Workstations (F1, F2, F4, F5, F7, F8) — Desk top sits at fy + 0.755
        for (let di = 0; di < officeDeskCoords.length; di++) {
          const dc = officeDeskCoords[di];
          const deskTop = fy + 0.755;
          if ((f + di) % 2 === 0) {
            placeComputerRig(twrGrp, dc.x, deskTop, dc.z - 0.15, 0);
          } else {
            placeClone(laptop, twrGrp, dc.x, deskTop, dc.z - 0.1, 0.15, 1.0);
          }
          placeClone(officeChair, twrGrp, dc.x, fy, dc.z + 0.78, Math.PI, 1.0, [0.55, 0.95, 0.55]);
          if (di === 0) placeClone(deskLamp, twrGrp, dc.x - 0.45, deskTop, dc.z - 0.18, 0.4, 0.95);
          if (di === 1) placeClone(stationery, twrGrp, dc.x + 0.45, deskTop, dc.z - 0.1, 0.2, 0.95);
          if (di === 2) placeClone(notepads, twrGrp, dc.x - 0.35, deskTop, dc.z, -0.2, 0.95);
          if (di === 3) placeClone(booksSet, twrGrp, dc.x + 0.35, deskTop, dc.z - 0.15, 0, 0.95);
        }
        placeClone(trashcan, twrGrp, -8.5, fy, 6.2, 0, 0.95);
        placeClone(bookshelf, twrGrp, -11.0, fy, -9.0, Math.PI / 2, 1.0, [0.93, 2.05, 0.58]);
        if (f % 2 === 1) mountOnWall(fireAlarm, twrGrp, -6.0, fy + 1.4, -4.0, -1, 0, 0.025, 0.08);
        else mountOnWall(wallClock, twrGrp, -6.0, fy + 2.2, 2.0, -1, 0, 0.032, 0.16);
      }
    }
    // Tower Alpha Rooftop (helipad West + shed East)
    const twrRoofY = this.raycastFloor(5.0, 7.0, 38.5, 4.0) ?? 36.425;
    placeClone(generator, twrGrp, 9.8, twrRoofY, -9.0, -0.5, 1.2, [1.0, 0.8, 0.65]);
    placeClone(floodLights, twrGrp, 2.2, twrRoofY, -6.0, -Math.PI * 0.75, 1.0, [0.65, 1.9, 0.65]);
    placeClone(floodLights, twrGrp, 2.2, twrRoofY, 6.0, -Math.PI * 0.25, 1.0, [0.65, 1.9, 0.65]);
    placeClone(crowbar, twrGrp, 1.0, twrRoofY + 0.36, 9.2, 0.5, 1.0);
    placeClone(ammoBox, twrGrp, 1.4, twrRoofY, 7.8, -0.4, 1.1);

    // ==================== 6. FURNISH ALL 4 GLB INTERIOR HOUSES ====================
    const furnishGLBHouse = (
      house: { id: string; cx: number; cz: number; group: THREE.Group; bounds: THREE.Box3 }
    ) => {
      const grp = this.createCullGroup(house.cx, house.cz, 65);
      const sz = house.bounds.getSize(new THREE.Vector3());
      const baseY = this.getGLBHouseFloorY(house);

      // Scan flat open floor coordinates STRICTLY inside interior core (excluding exterior porches!)
      const spots: { x: number; y: number; z: number; faceRot: number }[] = [];
      const rc = new THREE.Raycaster();
      const dirs = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (-3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4];
      const step = 0.85;
      const minXScan = house.id === 'house_with_interior' ? -85.0 : (house.id === 'abandoned_house' ? -126.5 : house.bounds.min.x + 1.4);
      const maxXScan = house.id === 'house_with_interior' ? -80.8 : (house.id === 'abandoned_house' ? -120.5 : house.bounds.max.x - 1.4);
      const minZScan = house.id === 'abandoned_house' ? 20.5 : house.bounds.min.z + 1.4;
      const maxZScan = house.id === 'abandoned_house' ? 27.5 : house.bounds.max.z - 1.4;
      for (let gx = minXScan; gx <= maxXScan; gx += step) {
        for (let gz = minZScan; gz <= maxZScan; gz += step) {
          const fy = this.raycastFloor(gx, gz, baseY + 1.85, 2.2, [house.group]);
          if (fy === null || Math.abs(fy - baseY) > 0.18) continue;
          let minClear = 99;
          for (const checkH of [0.35, 1.0]) {
            for (const ang of dirs) {
              rc.set(new THREE.Vector3(gx, fy + checkH, gz), new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)));
              rc.far = 1.25;
              const h = rc.intersectObjects([house.group], true);
              if (h.length > 0 && h[0].distance < minClear) minClear = h[0].distance;
            }
          }
          if (minClear < 0.72) continue;
          if (spots.some((s) => (s.x - gx) * (s.x - gx) + (s.z - gz) * (s.z - gz) < 1.85 * 1.85)) continue;
          const faceRot = Math.atan2(house.cx - gx, house.cz - gz);
          spots.push({ x: gx, y: fy, z: gz, faceRot });
        }
      }

      // Mount 1 wall clock per house offset sideways/up cleanly from painting height (never overlapping paintings or windows!)
      const clkY = baseY + 2.18;
      if (!mountOnWall(wallClock, grp, house.cx + 1.35, clkY, house.cz, 0, -1, 0.032, 0.24, 1.0, [house.group])) {
        mountOnWall(wallClock, grp, house.cx, clkY, house.cz + 1.35, -1, 0, 0.032, 0.24, 1.0, [house.group]);
      }

      const safeSpot = (idx: number, fx: number, fz: number) =>
        spots[idx] ?? { x: house.cx + fx, y: baseY, z: house.cz + fz, faceRot: 0 };

      if (house.id === 'house_with_interior') {
        placeClone(doormat, grp, -89.0, 1.882, 26.2, Math.PI / 2, 1.0);
        const s0 = safeSpot(0, -0.5, -1.2);
        placeClone(lowDesk, grp, s0.x, s0.y, s0.z, s0.faceRot, 0.92, [1.3, 0.76, 0.7]);
        placeClone(laptop, grp, s0.x, s0.y + 0.70, s0.z, s0.faceRot, 1.0);
        placeClone(deskLamp, grp, s0.x + 0.35, s0.y + 0.70, s0.z, 0.2, 0.95);
        const s1 = safeSpot(1, 1.6, -1.2);
        placeClone(sofa, grp, s1.x, s1.y, s1.z, s1.faceRot, 0.85, [1.8, 0.85, 0.9]);
        const s2 = safeSpot(2, -0.5, 1.8);
        placeClone(bookshelf, grp, s2.x, s2.y, s2.z, s2.faceRot, 0.92, [0.9, 1.9, 0.4]);
        const s3 = safeSpot(3, 1.6, 1.6);
        placeClone(plant, grp, s3.x, s3.y, s3.z, 0, 1.0);
        placeClone(trashcan, grp, s0.x + 0.85, s0.y, s0.z, 0, 0.95);
        placeClone(radio, grp, s0.x - 0.35, s0.y + 0.70, s0.z, -0.3, 1.0);
      } else if (house.id === 'realistic_house_with_interior') {
        placeClone(doormat, grp, -112.4, 1.222, 57.3, Math.PI / 2, 1.0);
        const s0 = safeSpot(0, -1.4, -1.4);
        placeClone(lowDesk, grp, s0.x, s0.y, s0.z, s0.faceRot, 0.95, [1.3, 0.76, 0.7]);
        placeClone(coffeeMachine, grp, s0.x - 0.25, s0.y + 0.72, s0.z, s0.faceRot, 1.0);
        placeClone(booksSet, grp, s0.x + 0.25, s0.y + 0.72, s0.z, s0.faceRot, 1.0);
        const s1 = safeSpot(1, 1.5, -1.4);
        placeClone(schoolChair, grp, s1.x, s1.y, s1.z, s1.faceRot, 1.0);
        const s2 = safeSpot(2, -1.4, 1.6);
        placeClone(coatRack, grp, s2.x, s2.y, s2.z, 0, 1.0);
        const s3 = safeSpot(3, 1.4, 1.6);
        placeClone(plant, grp, s3.x, s3.y, s3.z, 0, 1.0);
        placeClone(vase, grp, s0.x, s0.y + 0.72, s0.z + 0.15, 0, 1.0);
        placeClone(trashcan, grp, s0.x + 0.85, s0.y, s0.z, 0, 0.95);
      } else if (house.id === 'abandoned_house') {
        const abF1 = 0.92;
        const abF2 = 4.05;
        placeClone(doormat, grp, -121.31, abF1 + 0.004, 21.6, 0, 1.0);
        // Floor 1 West Room & East Room (avoiding central doorway & South-East stairs at X:-120.6..-116.7, Z:24.7..26.7)
        placeClone(steelShelves, grp, -125.1, abF1, 21.9, 0, 0.95, [0.93, 2.05, 0.58]);
        placeClone(generator, grp, -124.8, abF1, 25.8, -0.4, 1.1, [0.95, 0.8, 0.65]);
        placeClone(floodLights, grp, -122.4, abF1, 25.9, 0.6, 0.9, [0.65, 1.9, 0.65]);
        placeClone(ammoBox, grp, -124.2, abF1, 22.8, 0.4, 1.1);
        placeClone(crowbar, grp, -123.6, abF1, 21.9, 0.5, 1.0);
        placeClone(trashcan, grp, -120.5, abF1, 25.9, 0, 0.95);
        // Floor 2 Upstairs Bedroom/Lookout
        placeClone(bedSingle, grp, -124.4, abF2, 22.8, 0, 0.95, [1.05, 0.7, 2.05]);
        placeClone(lowDesk, grp, -122.0, abF2, 26.0, Math.PI, 0.9, [1.25, 0.72, 0.65]);
        placeClone(radio, grp, -122.0, abF2 + 0.68, 26.0, 0.3, 1.0);
        placeClone(booksSet, grp, -122.4, abF2 + 0.68, 26.0, 0, 1.0);
      } else {
        // living_room_suite (-115, 95)
        placeClone(doormat, grp, -113.0, 0.692, 99.6, 0, 1.0);
        const s0 = safeSpot(0, -1.8, -1.0);
        placeClone(lowDesk, grp, s0.x, s0.y, s0.z, s0.faceRot, 0.9, [1.25, 0.72, 0.65]);
        placeClone(gamepad, grp, s0.x - 0.2, s0.y + 0.68, s0.z, 0.4, 1.0);
        placeClone(booksSet, grp, s0.x + 0.25, s0.y + 0.68, s0.z, 0, 1.0);
        const s1 = safeSpot(1, 2.0, 1.0);
        placeClone(plant, grp, s1.x, s1.y, s1.z, 0, 1.05);
        const s2 = safeSpot(2, -2.0, 1.5);
        placeClone(coatRack, grp, s2.x, s2.y, s2.z, 0, 1.0);
        const s3 = safeSpot(3, 2.0, -1.5);
        placeClone(tv, grp, s3.x, s3.y + 0.5, s3.z, s3.faceRot, 0.95);
        placeClone(vase, grp, s0.x, s0.y + 0.68, s0.z - 0.12, 0, 1.0);
        placeClone(trashcan, grp, s1.x + 0.65, s1.y, s1.z, 0, 0.95);
        void sz;
      }
    };

    for (const house of this.interiorHouses) {
      furnishGLBHouse(house);
    }
  }
}
