import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { PooledLightManager } from '../lightPool.ts';

export type WallAxis = 'x' | 'z';

export interface WallOpening {
  type: 'door' | 'window';
  offset: number;
  width: number;
  height?: number;
  sillHeight?: number;
  hasDoorLeaf?: boolean;
  doorOpenAngle?: number;
  doorMat?: THREE.Material;
}

/**
 * Architectural builder with automatic static geometry batching (mergeGeometries)
 * and pooled lighting so buildings render in ~10–15 draw calls instead of 400+.
 */
export class ArchBuilder {
  group: THREE.Group;
  player: PlayerController;
  lightPool: PooledLightManager | null;
  originX: number;
  originY: number;
  originZ: number;

  private shadowBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private noShadowBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  constructor(
    group: THREE.Group,
    player: PlayerController,
    originX: number,
    originY: number,
    originZ: number,
    lightPool: PooledLightManager | null = null
  ) {
    this.group = group;
    this.player = player;
    this.originX = originX;
    this.originY = originY;
    this.originZ = originZ;
    this.lightPool = lightPool;
  }

  registerBoxCollider(lx: number, ly: number, lz: number, w: number, h: number, d: number, tag = 'building') {
    const wx = this.originX + lx;
    const wy = this.originY + ly;
    const wz = this.originZ + lz;
    this.player.addCollider(
      new THREE.Box3(
        new THREE.Vector3(wx - w / 2, wy - h / 2, wz - d / 2),
        new THREE.Vector3(wx + w / 2, wy + h / 2, wz + d / 2)
      ),
      tag
    );
  }

  private queueBoxGeometry(
    lx: number,
    ly: number,
    lz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    castShadow: boolean
  ) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(lx, ly, lz);
    const map = castShadow ? this.shadowBuckets : this.noShadowBuckets;
    let list = map.get(mat);
    if (!list) {
      list = [];
      map.set(mat, list);
    }
    list.push(geo);
  }

  addSolidBox(
    lx: number,
    ly: number,
    lz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    collide = true,
    castShadow = true
  ) {
    this.queueBoxGeometry(lx, ly, lz, w, h, d, mat, castShadow);
    if (collide) {
      this.registerBoxCollider(lx, ly, lz, w, h, d);
    }
  }

  /**
   * Call once after building geometry is queued to merge all same-material boxes
   * into single draw calls, drastically cutting CPU & GPU overhead.
   */
  finalizeMergedMeshes() {
    for (const [mat, geos] of this.shadowBuckets.entries()) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        const m = new THREE.Mesh(merged, mat);
        m.castShadow = false;
        m.receiveShadow = false;
        this.group.add(m);
      }
    }
    this.shadowBuckets.clear();

    for (const [mat, geos] of this.noShadowBuckets.entries()) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        const m = new THREE.Mesh(merged, mat);
        m.castShadow = false;
        m.receiveShadow = false;
        this.group.add(m);
      }
    }
    this.noShadowBuckets.clear();
  }

  addWall(
    axis: WallAxis,
    centerX: number,
    baseY: number,
    centerZ: number,
    length: number,
    height: number,
    thickness: number,
    mat: THREE.Material,
    openings: WallOpening[] = []
  ) {
    const sorted = [...openings].sort((a, b) => a.offset - b.offset);
    let cursor = -length / 2;

    const placeSegment = (segOffset: number, segLen: number, segBaseY: number, segH: number, collide = true, useMat = mat) => {
      if (segLen <= 0.02 || segH <= 0.02) return;
      const lx = axis === 'x' ? centerX + segOffset : centerX;
      const lz = axis === 'z' ? centerZ + segOffset : centerZ;
      const w = axis === 'x' ? segLen : thickness;
      const d = axis === 'z' ? segLen : thickness;
      this.addSolidBox(lx, segBaseY + segH / 2, lz, w, segH, d, useMat, collide, true);
    };

    for (const op of sorted) {
      const start = op.offset - op.width / 2;
      const end = op.offset + op.width / 2;

      if (start > cursor) {
        placeSegment((cursor + start) / 2, start - cursor, baseY, height);
      }

      if (op.type === 'door') {
        const doorH = op.height ?? Math.min(2.4, height - 0.3);
        if (height > doorH) {
          placeSegment(op.offset, op.width, baseY + doorH, height - doorH);
        }

        // Architectural Door Frame (batched, non-shadow-casting for performance)
        const frameThick = 0.08;
        const frameDepth = thickness + 0.06;
        const frameMat = GameMaterials.metalDark;

        for (const jOff of [start + frameThick / 2, end - frameThick / 2]) {
          const jx = axis === 'x' ? centerX + jOff : centerX;
          const jz = axis === 'z' ? centerZ + jOff : centerZ;
          this.queueBoxGeometry(
            jx,
            baseY + doorH / 2,
            jz,
            axis === 'x' ? frameThick : frameDepth,
            doorH,
            axis === 'z' ? frameThick : frameDepth,
            frameMat,
            false
          );
        }

        const tx = axis === 'x' ? centerX + op.offset : centerX;
        const tz = axis === 'z' ? centerZ + op.offset : centerZ;
        this.queueBoxGeometry(
          tx,
          baseY + doorH - frameThick / 2,
          tz,
          axis === 'x' ? op.width : frameDepth,
          frameThick,
          axis === 'z' ? op.width : frameDepth,
          frameMat,
          false
        );

        // Wide-open Door Leaf (visual only, player walks smoothly through doorway)
        if (op.hasDoorLeaf !== false) {
          const leafWidth = Math.min(op.width - 0.14, 1.15);
          const leafGroup = new THREE.Group();
          const hingeX = axis === 'x' ? centerX + start + 0.08 : centerX;
          const hingeZ = axis === 'z' ? centerZ + start + 0.08 : centerZ;
          leafGroup.position.set(hingeX, baseY, hingeZ);
          leafGroup.rotation.y = op.doorOpenAngle ?? 1.52;

          const leafGeo = axis === 'x'
            ? new THREE.BoxGeometry(leafWidth, doorH - 0.06, 0.06)
            : new THREE.BoxGeometry(0.06, doorH - 0.06, leafWidth);
          const leafMesh = new THREE.Mesh(leafGeo, op.doorMat ?? GameMaterials.woodPlanks);
          leafMesh.position.set(
            axis === 'x' ? leafWidth / 2 : 0,
            (doorH - 0.06) / 2,
            axis === 'z' ? leafWidth / 2 : 0
          );
          leafGroup.add(leafMesh);

          const knob = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.14), GameMaterials.ivPoleMetal);
          knob.position.set(
            axis === 'x' ? leafWidth - 0.12 : 0,
            1.0,
            axis === 'z' ? leafWidth - 0.12 : 0
          );
          leafGroup.add(knob);
          this.group.add(leafGroup);
        }
      } else if (op.type === 'window') {
        const sillH = op.sillHeight ?? 0.9;
        const winH = op.height ?? Math.min(1.6, height - sillH - 0.3);

        placeSegment(op.offset, op.width, baseY, sillH);
        if (height > sillH + winH) {
          placeSegment(op.offset, op.width, baseY + sillH + winH, height - (sillH + winH));
        }

        const wx = axis === 'x' ? centerX + op.offset : centerX;
        const wz = axis === 'z' ? centerZ + op.offset : centerZ;
        this.registerBoxCollider(
          wx,
          baseY + sillH + winH / 2,
          wz,
          axis === 'x' ? op.width : thickness,
          winH,
          axis === 'z' ? op.width : thickness,
          'window'
        );

        // Sill & Mullions (batched)
        this.queueBoxGeometry(
          wx,
          baseY + sillH + 0.04,
          wz,
          axis === 'x' ? op.width + 0.16 : thickness + 0.16,
          0.08,
          axis === 'z' ? op.width + 0.16 : thickness + 0.16,
          GameMaterials.concreteDark,
          false
        );

        // Glass Pane (batched non-shadow)
        this.queueBoxGeometry(
          wx,
          baseY + sillH + winH / 2,
          wz,
          axis === 'x' ? op.width - 0.1 : 0.04,
          winH - 0.1,
          axis === 'z' ? op.width - 0.1 : 0.04,
          GameMaterials.glassSmoked,
          false
        );

        // Center mullions
        this.queueBoxGeometry(
          wx,
          baseY + sillH + winH / 2,
          wz,
          axis === 'x' ? 0.05 : thickness * 0.6,
          winH,
          axis === 'z' ? 0.05 : thickness * 0.6,
          GameMaterials.metalDark,
          false
        );
        this.queueBoxGeometry(
          wx,
          baseY + sillH + winH / 2,
          wz,
          axis === 'x' ? op.width : thickness * 0.6,
          0.05,
          axis === 'z' ? op.width : thickness * 0.6,
          GameMaterials.metalDark,
          false
        );
      }

      cursor = end;
    }

    if (cursor < length / 2) {
      placeSegment((cursor + length / 2) / 2, length / 2 - cursor, baseY, height);
    }
  }

  addStairFlight(
    startX: number,
    startY: number,
    startZ: number,
    dirX: number,
    dirZ: number,
    totalRise: number,
    totalRun: number,
    stairWidth: number,
    steps = 12,
    stepMat: THREE.Material = GameMaterials.concreteDark
  ) {
    const stepRise = totalRise / steps;
    const stepRun = totalRun / steps;

    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const sx = startX + dirX * totalRun * t;
      const sz = startZ + dirZ * totalRun * t;
      const sy = startY + stepRise * (i + 0.5);

      const w = Math.abs(dirZ) > 0.5 ? stairWidth : stepRun + 0.06;
      const d = Math.abs(dirX) > 0.5 ? stairWidth : stepRun + 0.06;

      this.addSolidBox(sx, sy, sz, w, stepRise, d, stepMat, true, false);
    }

    // Steel Handrails, Balustrade Posts & Stepped Side Railing Border Colliders on both sides
    const railLength = Math.hypot(totalRun, totalRise);
    const angle = Math.atan2(totalRise, totalRun);
    const midX = startX + dirX * (totalRun / 2);
    const midZ = startZ + dirZ * (totalRun / 2);
    const midY = startY + totalRise / 2 + 0.95;

    for (const side of [-1, 1]) {
      const offsetX = Math.abs(dirZ) > 0.5 ? side * (stairWidth / 2 - 0.05) : 0;
      const offsetZ = Math.abs(dirX) > 0.5 ? side * (stairWidth / 2 - 0.05) : 0;

      // Top & mid sloped steel handrail bars
      for (const railDrop of [0, 0.42]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, railLength), GameMaterials.ivPoleMetal);
        rail.position.set(midX + offsetX, midY - railDrop, midZ + offsetZ);

        if (dirZ < -0.5) rail.rotation.x = angle;
        else if (dirZ > 0.5) rail.rotation.x = -angle;
        else if (dirX > 0.5) {
          rail.rotation.y = Math.PI / 2;
          rail.rotation.x = -angle;
        } else if (dirX < -0.5) {
          rail.rotation.y = Math.PI / 2;
          rail.rotation.x = angle;
        }
        this.group.add(rail);
      }

      // Batched vertical balustrade support posts
      const postCount = 5;
      for (let p = 0; p < postCount; p++) {
        const t = p / (postCount - 1);
        const px = startX + dirX * totalRun * t + offsetX;
        const pz = startZ + dirZ * totalRun * t + offsetZ;
        const py = startY + totalRise * t + 0.48;
        this.queueBoxGeometry(px, py, pz, 0.06, 0.96, 0.06, GameMaterials.metalDark, false);
      }

      // Stepped side-railing border colliders matching the stair slope so players & bullets never pass through railings
      const segs = 5;
      const segRun = totalRun / segs;
      const segRise = totalRise / segs;
      const bw = Math.abs(dirZ) > 0.5 ? 0.12 : segRun + 0.04;
      const bd = Math.abs(dirX) > 0.5 ? 0.12 : segRun + 0.04;
      for (let s = 0; s < segs; s++) {
        const t = (s + 0.5) / segs;
        const bx = startX + dirX * totalRun * t + offsetX;
        const bz = startZ + dirZ * totalRun * t + offsetZ;
        const by = startY + totalRise * t + 0.52;
        this.registerBoxCollider(bx, by, bz, bw, 1.04 + segRise * 0.35, bd, 'stair_railing');
      }
    }
  }

  addCeilingLight(lx: number, ly: number, lz: number, addLight = false, color = 0xfff0d4, intensity = 1.6, range = 14) {
    this.queueBoxGeometry(lx, ly - 0.04, lz, 0.36, 0.08, 1.4, GameMaterials.metalDark, false);
    this.queueBoxGeometry(lx, ly - 0.08, lz, 0.24, 0.04, 1.25, GameMaterials.lightGlowYellow, false);

    if (addLight && this.lightPool) {
      this.lightPool.registerLight(this.originX + lx, this.originY + ly - 0.45, this.originZ + lz, color, intensity, range, false);
    }
  }
}
