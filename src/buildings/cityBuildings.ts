import * as THREE from 'three';
import { ArchBuilder } from './archBuilder.ts';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { PooledLightManager } from '../lightPool.ts';
import { ExclusionRect } from '../grassSystem.ts';
import { InventorySystem } from '../inventory.ts';

export type CityArchetype = 'storefront' | 'stepped_office' | 'brick_apartment' | 'warehouse' | 'metro_tower';

export interface CityLotSpec {
  id: string;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  floors: number;
  archetype: CityArchetype;
  doorSide: 'north' | 'south' | 'east' | 'west';
}

export interface CityBuildingMeta {
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorHeight: number;
  floors: number;
}

export const CITY_LOT_SPECS: CityLotSpec[] = [
  // Inner Quadrants around Central Spine & Cross Ave
  { id: 'city_0', label: 'Midtown Corner Cafe & Lofts', x: -32, z: -34, width: 15, depth: 13, floors: 4, archetype: 'storefront', doorSide: 'east' },
  { id: 'city_1', label: 'Apex Financial Tower', x: 36, z: -34, width: 16, depth: 14, floors: 6, archetype: 'stepped_office', doorSide: 'west' },
  { id: 'city_2', label: 'Grand Central Pharmacy & Suites', x: -32, z: 34, width: 15, depth: 13, floors: 4, archetype: 'brick_apartment', doorSide: 'east' },
  { id: 'city_3', label: 'Metro Spire Offices', x: 36, z: 34, width: 16, depth: 14, floors: 5, archetype: 'metro_tower', doorSide: 'west' },
  { id: 'city_4', label: 'Northgate Brick Apartments', x: -32, z: -74, width: 15, depth: 13, floors: 4, archetype: 'brick_apartment', doorSide: 'east' },
  { id: 'city_5', label: 'Eastside Commerce Annex', x: 36, z: -74, width: 16, depth: 13, floors: 4, archetype: 'stepped_office', doorSide: 'west' },
  { id: 'city_6', label: 'Southside Hardware & Flats', x: -32, z: 70, width: 15, depth: 13, floors: 3, archetype: 'storefront', doorSide: 'east' },
  { id: 'city_7', label: 'Civic Logistics Warehouse', x: 36, z: 70, width: 16, depth: 13, floors: 3, archetype: 'warehouse', doorSide: 'west' },
  { id: 'city_8', label: 'South Avenue Residences', x: -32, z: 106, width: 15, depth: 13, floors: 4, archetype: 'brick_apartment', doorSide: 'east' },
  { id: 'city_9', label: 'Highway Overlook Tower', x: 36, z: 106, width: 16, depth: 14, floors: 5, archetype: 'metro_tower', doorSide: 'west' },

  // West District
  { id: 'city_10', label: 'Commercial Ave Market', x: -92, z: -34, width: 15, depth: 13, floors: 3, archetype: 'storefront', doorSide: 'east' },
  { id: 'city_11', label: 'Westside Storage Depot', x: -126, z: -34, width: 16, depth: 13, floors: 3, archetype: 'warehouse', doorSide: 'south' },
  { id: 'city_12', label: 'Oakwood Terrace Flats', x: -92, z: -74, width: 15, depth: 13, floors: 3, archetype: 'brick_apartment', doorSide: 'east' },
  { id: 'city_13', label: 'Westgate Business Center', x: -126, z: -74, width: 15, depth: 13, floors: 4, archetype: 'stepped_office', doorSide: 'south' },
  { id: 'city_14', label: 'Suburban Corner Bodega', x: -156, z: 34, width: 14, depth: 13, floors: 3, archetype: 'storefront', doorSide: 'east' },
  { id: 'city_15', label: 'West End Brick Duplex', x: -156, z: 76, width: 14, depth: 13, floors: 3, archetype: 'brick_apartment', doorSide: 'east' },

  // East & Civic Outer Blocks
  { id: 'city_16', label: 'Precinct Overflow Depot', x: 148, z: -35, width: 15, depth: 13, floors: 3, archetype: 'warehouse', doorSide: 'west' },
  { id: 'city_17', label: 'Hospital Medical Labs', x: 148, z: 35, width: 15, depth: 13, floors: 4, archetype: 'stepped_office', doorSide: 'west' },
  { id: 'city_18', label: 'Civic North Offices', x: 105, z: -78, width: 16, depth: 13, floors: 4, archetype: 'metro_tower', doorSide: 'west' },
  { id: 'city_19', label: 'South Civic Apartments', x: 105, z: 86, width: 16, depth: 13, floors: 4, archetype: 'brick_apartment', doorSide: 'west' },

  // North Perimeter Flanking School
  { id: 'city_20', label: 'Campus West Bookstore & Flats', x: -88, z: -142, width: 15, depth: 13, floors: 3, archetype: 'storefront', doorSide: 'south' },
  { id: 'city_21', label: 'Campus East Research Hall', x: 96, z: -142, width: 16, depth: 13, floors: 4, archetype: 'stepped_office', doorSide: 'south' }
];

/**
 * Builds all 22 explorable multi-story city buildings across the map with batched geometry,
 * open street-facing doorways, stairwells up to open rooftops, interior rooms/furniture,
 * pooled lighting, and exact wall/floor/stair colliders matching their 3D shapes.
 */
export class CityBlockBuildings {
  readonly metas: CityBuildingMeta[] = [];
  readonly exclusions: ExclusionRect[] = [];
  readonly groups: { group: THREE.Group; cx: number; cz: number }[] = [];

  private floorHeight = 3.4;

  constructor(
    scene: THREE.Scene,
    player: PlayerController,
    lightPool: PooledLightManager | null,
    inventory?: InventorySystem
  ) {
    for (let i = 0; i < CITY_LOT_SPECS.length; i++) {
      const spec = CITY_LOT_SPECS[i];
      this.buildOne(scene, player, lightPool, spec, i, inventory);
    }
  }

  private getMaterials(archType: CityArchetype) {
    switch (archType) {
      case 'brick_apartment':
        return {
          wall: GameMaterials.brickRed,
          trim: GameMaterials.concreteDark,
          floor: GameMaterials.houseWoodFloor,
          roof: GameMaterials.concreteGrey
        };
      case 'storefront':
        return {
          wall: GameMaterials.schoolBrick,
          trim: GameMaterials.metalDark,
          floor: GameMaterials.schoolFloor,
          roof: GameMaterials.concreteDark
        };
      case 'warehouse':
        return {
          wall: GameMaterials.concreteGrey,
          trim: GameMaterials.metalRusted,
          floor: GameMaterials.concreteDark,
          roof: GameMaterials.concreteDark
        };
      case 'metro_tower':
        return {
          wall: GameMaterials.towerFacadeDark,
          trim: GameMaterials.towerConcreteColumn,
          floor: GameMaterials.officeCarpet,
          roof: GameMaterials.towerHelipadGrey
        };
      case 'stepped_office':
      default:
        return {
          wall: GameMaterials.concreteLight,
          trim: GameMaterials.towerConcreteColumn,
          floor: GameMaterials.officeCarpet,
          roof: GameMaterials.concreteGrey
        };
    }
  }

  private buildOne(
    scene: THREE.Scene,
    player: PlayerController,
    lightPool: PooledLightManager | null,
    spec: CityLotSpec,
    index: number,
    inventory?: InventorySystem
  ) {
    const grp = new THREE.Group();
    grp.position.set(spec.x, 0.2, spec.z);
    const arch = new ArchBuilder(grp, player, spec.x, 0.2, spec.z, lightPool);
    const mats = this.getMaterials(spec.archetype);

    const w = spec.width;
    const d = spec.depth;
    const fh = this.floorHeight;
    const stairW = 2.4;
    // Stairwell bay occupies East strip: X in [w/2 - 3.1 .. w/2 - 0.3], Z in [-3.4 .. +3.4]
    const stairCenterX = w / 2 - 1.7;
    const stairHoleMinX = w / 2 - 3.1;
    const hasSetback = (spec.archetype === 'stepped_office' || spec.archetype === 'metro_tower') && spec.floors >= 4;
    const setbackFloor = hasSetback ? Math.ceil(spec.floors / 2) : spec.floors;
    // Upper setback trims the West wing by 4.2m while keeping East stairwell + core continuous!
    const upperShiftX = 2.1;
    const upperW = w - 4.2;

    // 1. Ground Floor Slab (top at local Y = 0.30 -> world 0.50) + Entry Threshold Step
    arch.addSolidBox(0, 0.15, 0, w, 0.3, d, mats.floor, true, false);
    this.addEntryThreshold(arch, w, d, spec.doorSide);

    // 2. Build Each Floor (0 .. floors - 1)
    for (let f = 0; f < spec.floors; f++) {
      const baseY = f * fh;
      const isUpperSetback = f >= setbackFloor;
      const fw = isUpperSetback ? upperW : w;
      const fCenterX = isUpperSetback ? upperShiftX : 0;
      const slabTopLocal = f === 0 ? 0.30 : baseY + 0.13;

      // Floor Slab for upper levels (f >= 1) leaving open stairwell hole at X:[stairHoleMinX..w/2-0.3], Z:[-3.3..+3.3]
      if (f >= 1) {
        const westSlabW = stairHoleMinX - (fCenterX - fw / 2);
        const westSlabCenterX = (fCenterX - fw / 2) + westSlabW / 2;
        if (westSlabW > 0.2) {
          arch.addSolidBox(westSlabCenterX, baseY, 0, westSlabW, 0.26, d, mats.floor, true, false);
        }
        const stairStripW = (fCenterX + fw / 2) - stairHoleMinX;
        const northStripD = d / 2 - 3.3;
        if (northStripD > 0.2 && stairStripW > 0.2) {
          arch.addSolidBox(stairHoleMinX + stairStripW / 2, baseY, -3.3 - northStripD / 2, stairStripW, 0.26, northStripD, mats.floor, true, false);
          arch.addSolidBox(stairHoleMinX + stairStripW / 2, baseY, 3.3 + northStripD / 2, stairStripW, 0.26, northStripD, mats.floor, true, false);
        }
        // Guardrail along stairwell cutout edge
        arch.addSolidBox(stairHoleMinX, baseY + 0.65, 0.1, 0.1, 1.0, 6.4, GameMaterials.ivPoleMetal);
      }

      // Exterior Perimeter Walls with Windows & Ground-Floor Entrance Doorway(s)
      const doorHeight = 2.75;
      const doorWidth = 2.8;
      const wallThick = 0.32;

      const makeWallOpenings = (side: 'north' | 'south' | 'east' | 'west', spanLen: number) => {
        const ops: { type: 'door' | 'window'; offset: number; width: number; height?: number; sillHeight?: number; hasDoorLeaf?: boolean }[] = [];
        const isDoorWall = f === 0 && spec.doorSide === side;
        if (isDoorWall) {
          // If stairwell is on East (+X), offset East doorway slightly South/North or center?
          // Stairwell climbs from Z=+3.1 to -3.1 along East wall (X=w/2-1.7). Keep East door at offset +4.2 or -4.2, or center on N/S/W!
          const doorOff = side === 'east' ? -4.2 : 0;
          ops.push({ type: 'door', offset: doorOff, width: doorWidth, height: doorHeight, hasDoorLeaf: false });
          if (spanLen >= 13) {
            const winOff = side === 'east' ? 3.5 : (doorOff === 0 ? -4.6 : -4.6);
            ops.push({ type: 'window', offset: winOff, width: 2.6, height: 1.7, sillHeight: f === 0 ? 0.85 : 1.0 });
            if (doorOff === 0) {
              ops.push({ type: 'window', offset: 4.6, width: 2.6, height: 1.7, sillHeight: f === 0 ? 0.85 : 1.0 });
            }
          }
        } else {
          if (spanLen >= 13) {
            ops.push({ type: 'window', offset: -3.8, width: 2.8, height: 1.7, sillHeight: 1.0 });
            ops.push({ type: 'window', offset: 3.8, width: 2.8, height: 1.7, sillHeight: 1.0 });
          } else {
            ops.push({ type: 'window', offset: 0, width: 3.2, height: 1.7, sillHeight: 1.0 });
          }
        }
        return ops;
      };

      // North Wall (-Z) & South Wall (+Z)
      arch.addWall('x', fCenterX, baseY, -d / 2, fw, fh, wallThick, mats.wall, makeWallOpenings('north', fw));
      arch.addWall('x', fCenterX, baseY, d / 2, fw, fh, wallThick, mats.wall, makeWallOpenings('south', fw));
      // West Wall (-X) & East Wall (+X)
      arch.addWall('z', fCenterX - fw / 2, baseY, 0, d, fh, wallThick, mats.wall, makeWallOpenings('west', d));
      arch.addWall('z', fCenterX + fw / 2, baseY, 0, d, fh, wallThick, mats.wall, makeWallOpenings('east', d));

      // Setback outdoor terrace parapet when stepping inward on setbackFloor
      if (hasSetback && f === setbackFloor) {
        const terraceW = w - upperW;
        const terraceCenterX = -w / 2 + terraceW / 2;
        arch.addWall('x', terraceCenterX, baseY + 0.13, -d / 2, terraceW, 1.05, 0.25, mats.trim);
        arch.addWall('x', terraceCenterX, baseY + 0.13, d / 2, terraceW, 1.05, 0.25, mats.trim);
        arch.addWall('z', -w / 2, baseY + 0.13, 0, d, 1.05, 0.25, mats.trim);
      }

      // Interior Partition Wall with Open Doorway + Furniture per floor
      const partX = fCenterX - 1.2;
      arch.addWall('x', partX, baseY, 0, Math.max(4, fw - 6.8), fh, 0.18, GameMaterials.houseWallInterior, [
        { type: 'door', offset: 0, width: 1.8, height: 2.4, hasDoorLeaf: false }
      ]);

      // Simple batched interior props/counters/desks with exact colliders
      if (f === 0 && spec.archetype === 'storefront') {
        arch.addSolidBox(fCenterX - 3.6, slabTopLocal + 0.5, -2.5, 3.2, 1.0, 0.9, GameMaterials.kitchenCounter);
        arch.addSolidBox(fCenterX - 4.2, slabTopLocal + 0.95, 3.5, 0.7, 1.9, 3.2, GameMaterials.pharmacyCabinet);
      } else if (spec.archetype === 'warehouse') {
        arch.addSolidBox(fCenterX - 3.8, slabTopLocal + 1.0, -3.5, 0.8, 2.0, 3.0, GameMaterials.metalRusted);
        arch.addSolidBox(fCenterX - 3.8, slabTopLocal + 0.55, 3.2, 1.4, 1.1, 1.4, GameMaterials.woodPlanks);
      } else {
        arch.addSolidBox(fCenterX - 3.4, slabTopLocal + 0.4, -3.2, 1.8, 0.8, 0.9, GameMaterials.teacherDesk);
        arch.addSolidBox(fCenterX - 3.4, slabTopLocal + 0.4, 3.2, 1.8, 0.8, 0.9, GameMaterials.studentDeskWood);
      }

      // Ceiling light on every floor (pooled light on Ground + alternate floors)
      arch.addCeilingLight(fCenterX - 2.0, baseY + fh - 0.15, 0, f === 0 || f % 2 === 0, 0xffeacc, 1.7, 15);

      // Stair Flight from floor f to f + 1 (climbs North from Z=+3.1 to -3.1 along X=stairCenterX)
      const rise = f === 0 ? fh - 0.17 : fh;
      arch.addStairFlight(stairCenterX, slabTopLocal, 3.1, 0, -1, rise, 6.2, stairW, 12, GameMaterials.stairMetal);
    }

    // 3. Rooftop Deck + Stairwell Bulkhead + Perimeter Parapet + HVAC
    const roofY = spec.floors * fh;
    const roofW = hasSetback ? upperW : w;
    const roofCenterX = hasSetback ? upperShiftX : 0;
    const westRoofW = stairHoleMinX - (roofCenterX - roofW / 2);
    const westRoofCX = (roofCenterX - roofW / 2) + westRoofW / 2;
    if (westRoofW > 0.2) {
      arch.addSolidBox(westRoofCX, roofY, 0, westRoofW + 0.4, 0.34, d + 0.4, mats.roof, true, false);
    }
    const stairStripW = (roofCenterX + roofW / 2) - stairHoleMinX;
    const northStripD = d / 2 - 3.3;
    if (northStripD > 0.2 && stairStripW > 0.2) {
      arch.addSolidBox(stairHoleMinX + stairStripW / 2, roofY, -3.3 - northStripD / 2, stairStripW + 0.2, 0.34, northStripD + 0.2, mats.roof, true, false);
      arch.addSolidBox(stairHoleMinX + stairStripW / 2, roofY, 3.3 + northStripD / 2, stairStripW + 0.2, 0.34, northStripD + 0.2, mats.roof, true, false);
    }

    const roofTopY = roofY + 0.17;
    arch.addWall('x', roofCenterX, roofTopY, -d / 2, roofW, 1.05, 0.3, mats.trim);
    arch.addWall('x', roofCenterX, roofTopY, d / 2, roofW, 1.05, 0.3, mats.trim);
    arch.addWall('z', roofCenterX - roofW / 2, roofTopY, 0, d, 1.05, 0.3, mats.trim);
    arch.addWall('z', roofCenterX + roofW / 2, roofTopY, 0, d, 1.05, 0.3, mats.trim);

    // Rooftop Stairwell Bulkhead Shed covering hole + top landing (Z: -5.6..+3.4) with open West doorway at Z = -4.4
    const shedW = 3.4;
    const shedCenterX = stairCenterX;
    arch.addWall('z', shedCenterX - shedW / 2, roofTopY, -1.1, 9.0, 2.7, 0.25, GameMaterials.concreteDark, [
      { type: 'door', offset: -3.3, width: 2.0, height: 2.35, hasDoorLeaf: false }
    ]);
    arch.addWall('z', shedCenterX + shedW / 2, roofTopY, -1.1, 9.0, 2.7, 0.25, GameMaterials.concreteDark);
    arch.addWall('x', shedCenterX, roofTopY, -5.6, shedW, 2.7, 0.25, GameMaterials.concreteDark);
    arch.addWall('x', shedCenterX, roofTopY, 3.4, shedW, 2.7, 0.25, GameMaterials.concreteDark);
    arch.addSolidBox(shedCenterX, roofTopY + 2.8, -1.1, shedW + 0.4, 0.22, 9.3, GameMaterials.concreteDark);

    // Rooftop HVAC unit
    arch.addSolidBox(roofCenterX - 2.4, roofTopY + 0.65, -2.5, 2.0, 1.3, 1.6, GameMaterials.metalRusted);

    // Occasional loot inside select city buildings (ground & upper floors)
    if (inventory && index % 3 === 0) {
      const lootTpl = index % 2 === 0 ? 'ammo_9mm_para' : 'food_meat';
      const lootAmt = index % 2 === 0 ? 18 : 2;
      void inventory.registerPickup(
        lootTpl,
        new THREE.Vector3(spec.x - 3.4, 0.2 + 0.30 + 0.85, spec.z - 3.2),
        lootAmt,
        35
      );
    }

    arch.finalizeMergedMeshes();
    scene.add(grp);
    this.groups.push({ group: grp, cx: spec.x, cz: spec.z });

    this.metas.push({
      label: spec.label,
      minX: spec.x - w / 2,
      maxX: spec.x + w / 2,
      minZ: spec.z - d / 2,
      maxZ: spec.z + d / 2,
      floorHeight: fh,
      floors: spec.floors
    });

    this.exclusions.push({
      minX: spec.x - w / 2 - 1.2,
      maxX: spec.x + w / 2 + 1.2,
      minZ: spec.z - d / 2 - 1.2,
      maxZ: spec.z + d / 2 + 1.2
    });
  }

  private addEntryThreshold(arch: ArchBuilder, w: number, d: number, side: 'north' | 'south' | 'east' | 'west') {
    const stepMat = GameMaterials.concreteGrey;
    if (side === 'east') {
      arch.addSolidBox(w / 2 + 0.45, 0.08, -4.2, 0.9, 0.16, 3.2, stepMat, true, false);
    } else if (side === 'west') {
      arch.addSolidBox(-w / 2 - 0.45, 0.08, 0, 0.9, 0.16, 3.2, stepMat, true, false);
    } else if (side === 'north') {
      arch.addSolidBox(0, 0.08, -d / 2 - 0.45, 3.2, 0.16, 0.9, stepMat, true, false);
    } else {
      arch.addSolidBox(0, 0.08, d / 2 + 0.45, 3.2, 0.16, 0.9, stepMat, true, false);
    }
  }
}
