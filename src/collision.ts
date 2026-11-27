import * as THREE from 'three';

export interface AABBCollider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  tag: string;
}

export interface OBBCollider {
  center: THREE.Vector3;
  halfExtents: THREE.Vector3;
  rotY: number;
  cosY: number;
  sinY: number;
  minY: number;
  maxY: number;
  tag: string;
}

export interface WalkableMeshEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

export interface WalkableGroupEntry {
  obj: THREE.Object3D;
  bounds: THREE.Box3;
  entries: WalkableMeshEntry[];
}

export interface HitboxAuditReport {
  aabbCount: number;
  obbCount: number;
  walkableGroups: number;
  invalidCount: number;
  spawnClear: boolean;
}

/**
 * Spatial-hashed collision engine supporting exact AABBs, rotated OBBs (vehicles/barriers),
 * sub-mesh-culled walkable GLB interiors, and visual wireframe hitbox debugging ([H]).
 */
export class SpatialCollisionSystem {
  private cellSize = 16;
  private aabbGrid = new Map<string, AABBCollider[]>();
  private obbGrid = new Map<string, OBBCollider[]>();

  allAABBs: AABBCollider[] = [];
  allOBBs: OBBCollider[] = [];
  walkableGroups: WalkableGroupEntry[] = [];

  private debugGroup = new THREE.Group();
  private debugVisible = false;
  private debugBuilt = false;
  private raycaster = new THREE.Raycaster();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.debugGroup.visible = false;
    this.scene.add(this.debugGroup);
  }

  private getCellsForBounds(minX: number, maxX: number, minZ: number, maxZ: number): string[] {
    const cx0 = Math.floor(minX / this.cellSize);
    const cx1 = Math.floor(maxX / this.cellSize);
    const cz0 = Math.floor(minZ / this.cellSize);
    const cz1 = Math.floor(maxZ / this.cellSize);
    const keys: string[] = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        keys.push(`${cx},${cz}`);
      }
    }
    return keys;
  }

  addAABB(box: THREE.Box3, tag = 'structure') {
    if (
      !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x) ||
      box.max.x - box.min.x < 0.01 || box.max.y - box.min.y < 0.01 || box.max.z - box.min.z < 0.01
    ) {
      return;
    }
    const entry: AABBCollider = { min: box.min.clone(), max: box.max.clone(), tag };
    this.allAABBs.push(entry);

    const cells = this.getCellsForBounds(entry.min.x, entry.max.x, entry.min.z, entry.max.z);
    for (const k of cells) {
      let arr = this.aabbGrid.get(k);
      if (!arr) { arr = []; this.aabbGrid.set(k, arr); }
      arr.push(entry);
    }
    this.debugBuilt = false;
  }

  /**
   * Registers a tight rotated bounding box (Oriented Bounding Box) so diagonal cars,
   * cruisers, tanks, and barriers have zero invisible corner air pockets.
   */
  addOBB(center: THREE.Vector3, size: THREE.Vector3, rotY: number, tag = 'vehicle') {
    const half = size.clone().multiplyScalar(0.5);
    if (half.x < 0.01 || half.y < 0.01 || half.z < 0.01) return;

    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const entry: OBBCollider = {
      center: center.clone(),
      halfExtents: half,
      rotY,
      cosY,
      sinY,
      minY: center.y - half.y,
      maxY: center.y + half.y,
      tag
    };
    this.allOBBs.push(entry);

    // Conservative world XZ AABB for spatial grid indexing
    const extX = Math.abs(half.x * cosY) + Math.abs(half.z * sinY);
    const extZ = Math.abs(half.x * sinY) + Math.abs(half.z * cosY);
    const cells = this.getCellsForBounds(center.x - extX, center.x + extX, center.z - extZ, center.z + extZ);
    for (const k of cells) {
      let arr = this.obbGrid.get(k);
      if (!arr) { arr = []; this.obbGrid.set(k, arr); }
      arr.push(entry);
    }
    this.debugBuilt = false;
  }

  addWalkableObject(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(obj);
    bounds.expandByScalar(1.0);
    const entries: WalkableMeshEntry[] = [];

    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const lower = child.name.toLowerCase();
        if (lower.includes('door') && !lower.includes('frame')) {
          child.visible = false; // Open interior doors cleanly
          return;
        }
        const meshBox = new THREE.Box3().setFromObject(child);
        meshBox.expandByScalar(0.15);
        entries.push({ mesh: child, box: meshBox });
      }
    });

    this.walkableGroups.push({ obj, bounds, entries });
    this.debugBuilt = false;
  }

  queryNearby(x: number, z: number, radius: number): { aabbs: AABBCollider[]; obbs: OBBCollider[] } {
    const cells = this.getCellsForBounds(x - radius, x + radius, z - radius, z + radius);
    const aabbSet = new Set<AABBCollider>();
    const obbSet = new Set<OBBCollider>();

    for (const k of cells) {
      const a = this.aabbGrid.get(k);
      if (a) for (const item of a) aabbSet.add(item);
      const o = this.obbGrid.get(k);
      if (o) for (const item of o) obbSet.add(item);
    }

    return { aabbs: Array.from(aabbSet), obbs: Array.from(obbSet) };
  }

  private intersectsOBB(px: number, minY: number, maxY: number, pz: number, radius: number, obb: OBBCollider): boolean {
    if (maxY <= obb.minY || minY >= obb.maxY) return false;
    // Rotate player point around OBB center by -rotY
    const dx = px - obb.center.x;
    const dz = pz - obb.center.z;
    const localX = dx * obb.cosY - dz * obb.sinY;
    const localZ = dx * obb.sinY + dz * obb.cosY;

    // Closest point on local AABB to circle center
    const clampedX = Math.max(-obb.halfExtents.x, Math.min(obb.halfExtents.x, localX));
    const clampedZ = Math.max(-obb.halfExtents.z, Math.min(obb.halfExtents.z, localZ));
    const distSq = (localX - clampedX) ** 2 + (localZ - clampedZ) ** 2;
    return distSq < radius * radius;
  }

  tryHorizontalMove(
    curX: number,
    curY: number,
    curZ: number,
    nextX: number,
    nextZ: number,
    radius: number,
    height: number,
    stepUpHeight: number,
    isGrounded: boolean
  ): number | null {
    const { aabbs, obbs } = this.queryNearby(nextX, nextZ, radius + 0.5);
    const minY = curY + 0.1;
    const maxY = curY + height - 0.05;
    let highestStepY = curY;

    // 1. Check AABBs
    for (const c of aabbs) {
      if (
        nextX + radius > c.min.x && nextX - radius < c.max.x &&
        maxY > c.min.y && minY < c.max.y &&
        nextZ + radius > c.min.z && nextZ - radius < c.max.z
      ) {
        const stepDiff = c.max.y - curY;
        if (stepDiff > 0 && stepDiff <= stepUpHeight && isGrounded) {
          highestStepY = Math.max(highestStepY, c.max.y);
        } else {
          return null;
        }
      }
    }

    // 2. Check OBBs (Vehicles & Angled Barriers)
    for (const obb of obbs) {
      if (this.intersectsOBB(nextX, minY, maxY, nextZ, radius, obb)) {
        const stepDiff = obb.maxY - curY;
        if (stepDiff > 0 && stepDiff <= stepUpHeight && isGrounded) {
          highestStepY = Math.max(highestStepY, obb.maxY);
        } else {
          return null;
        }
      }
    }

    // 3. Re-check standing clearance if stepping up onto a stair or curb
    if (highestStepY > curY) {
      const clearMinY = highestStepY + 0.1;
      const clearMaxY = highestStepY + height - 0.05;
      for (const c of aabbs) {
        if (
          nextX + radius > c.min.x && nextX - radius < c.max.x &&
          clearMaxY > c.min.y && clearMinY < c.max.y &&
          nextZ + radius > c.min.z && nextZ - radius < c.max.z
        ) {
          return null;
        }
      }
      for (const obb of obbs) {
        if (this.intersectsOBB(nextX, clearMinY, clearMaxY, nextZ, radius, obb)) {
          return null;
        }
      }
    }

    // 4. Sub-mesh-culled raycast check inside Walkable GLB houses (center + shoulder feelers)
    const probePoint = new THREE.Vector3(nextX, curY + 0.8, nextZ);
    const moveVec = new THREE.Vector3(nextX - curX, 0, nextZ - curZ);
    const moveLen = moveVec.length();
    if (moveLen > 0.0005) {
      const dir = moveVec.normalize();
      const perpX = -dir.z;
      const perpZ = dir.x;
      for (const wg of this.walkableGroups) {
        if (!wg.bounds.containsPoint(probePoint)) continue;

        const playerBox = new THREE.Box3(
          new THREE.Vector3(nextX - radius - 0.2, curY + 0.3, nextZ - radius - 0.2),
          new THREE.Vector3(nextX + radius + 0.2, curY + height, nextZ + radius + 0.2)
        );
        const nearbyMeshes: THREE.Mesh[] = [];
        for (const e of wg.entries) {
          if (e.box.intersectsBox(playerBox)) nearbyMeshes.push(e.mesh);
        }
        if (nearbyMeshes.length === 0) continue;

        const feelerOffsets = [0, -radius * 0.62, radius * 0.62];
        for (const cy of [curY + 0.52, curY + 1.15, curY + 1.55]) {
          for (const lat of feelerOffsets) {
            const ox = curX + perpX * lat;
            const oz = curZ + perpZ * lat;
            const rayDist = (lat === 0 ? radius : radius * 0.82) + moveLen + 0.04;
            this.raycaster.set(new THREE.Vector3(ox, cy, oz), dir);
            this.raycaster.near = 0;
            this.raycaster.far = rayDist;
            const hits = this.raycaster.intersectObjects(nearbyMeshes, false);
            if (hits.length > 0 && hits[0].face) {
              const worldNormal = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld);
              if (Math.abs(worldNormal.y) < 0.45) {
                return null;
              }
            }
          }
        }
      }
    }

    return highestStepY;
  }

  resolveVertical(pos: THREE.Vector3, velocityY: number, radius: number, height: number): { y: number; velY: number; grounded: boolean } {
    const { aabbs, obbs } = this.queryNearby(pos.x, pos.z, radius + 0.3);
    let y = pos.y;
    let velY = velocityY;
    let grounded = false;

    const headY = y + height;

    for (const c of aabbs) {
      if (pos.x + radius <= c.min.x || pos.x - radius >= c.max.x || pos.z + radius <= c.min.z || pos.z - radius >= c.max.z) {
        continue;
      }
      if (y <= c.max.y && y >= c.max.y - 0.48 && velY <= 0) {
        y = c.max.y;
        velY = 0;
        grounded = true;
      } else if (headY >= c.min.y && headY <= c.min.y + 0.4 && velY > 0) {
        y = c.min.y - height;
        velY = 0;
      }
    }

    for (const obb of obbs) {
      if (!this.intersectsOBB(pos.x, y - 0.1, headY, pos.z, radius, obb)) continue;
      if (y <= obb.maxY && y >= obb.maxY - 0.48 && velY <= 0) {
        y = obb.maxY;
        velY = 0;
        grounded = true;
      }
    }

    // Sub-mesh-culled floor support for Walkable GLB houses (center + radial foot probes)
    const probePos = new THREE.Vector3(pos.x, y + 0.7, pos.z);
    for (const wg of this.walkableGroups) {
      if (!wg.bounds.containsPoint(probePos)) continue;
      const footColBox = new THREE.Box3(
        new THREE.Vector3(pos.x - 0.35, y - 0.25, pos.z - 0.35),
        new THREE.Vector3(pos.x + 0.35, y + 0.8, pos.z + 0.35)
      );
      const nearbyMeshes: THREE.Mesh[] = [];
      for (const e of wg.entries) {
        if (e.box.intersectsBox(footColBox)) nearbyMeshes.push(e.mesh);
      }
      if (nearbyMeshes.length === 0) continue;

      const footProbes: [number, number][] = [
        [pos.x, pos.z],
        [pos.x + 0.18, pos.z],
        [pos.x - 0.18, pos.z],
        [pos.x, pos.z + 0.18],
        [pos.x, pos.z - 0.18]
      ];
      let bestHitY: number | null = null;
      for (const [fx, fz] of footProbes) {
        this.raycaster.set(new THREE.Vector3(fx, y + 0.7, fz), new THREE.Vector3(0, -1, 0));
        this.raycaster.near = 0;
        this.raycaster.far = 0.88;
        const hits = this.raycaster.intersectObjects(nearbyMeshes, false);
        if (hits.length > 0) {
          const hitY = hits[0].point.y;
          if (y <= hitY + 0.16 && (bestHitY === null || hitY > bestHitY)) {
            bestHitY = hitY;
          }
        }
      }
      if (bestHitY !== null && velY <= 0) {
        y = bestHitY;
        velY = 0;
        grounded = true;
      }
    }

    const groundY = this.getGroundFloorY(pos.x, pos.z);
    if (y < groundY) {
      y = groundY;
      velY = 0;
      grounded = true;
    }

    return { y, velY, grounded };
  }

  /**
   * Probes highest walkable support directly below feet within `maxDrop` meters,
   * used to smoothly clamp walking down steps/stairs instead of airborne sliding.
   */
  findGroundHeightBelow(pos: THREE.Vector3, radius: number, maxDrop = 0.45): number | null {
    const { aabbs, obbs } = this.queryNearby(pos.x, pos.z, radius + 0.35);
    let bestY: number | null = null;
    const minValid = pos.y - maxDrop;
    const maxValid = pos.y + 0.05;

    for (const c of aabbs) {
      if (pos.x + radius <= c.min.x || pos.x - radius >= c.max.x || pos.z + radius <= c.min.z || pos.z - radius >= c.max.z) {
        continue;
      }
      if (c.max.y >= minValid && c.max.y <= maxValid) {
        if (bestY === null || c.max.y > bestY) bestY = c.max.y;
      }
    }

    for (const obb of obbs) {
      if (!this.intersectsOBB(pos.x, minValid, maxValid, pos.z, radius, obb)) continue;
      if (obb.maxY >= minValid && obb.maxY <= maxValid) {
        if (bestY === null || obb.maxY > bestY) bestY = obb.maxY;
      }
    }

    const probePos = new THREE.Vector3(pos.x, pos.y + 0.35, pos.z);
    for (const wg of this.walkableGroups) {
      if (!wg.bounds.containsPoint(probePos)) continue;
      const footBox = new THREE.Box3(
        new THREE.Vector3(pos.x - 0.3, minValid - 0.1, pos.z - 0.3),
        new THREE.Vector3(pos.x + 0.3, maxValid + 0.4, pos.z + 0.3)
      );
      const nearbyMeshes: THREE.Mesh[] = [];
      for (const e of wg.entries) {
        if (e.box.intersectsBox(footBox)) nearbyMeshes.push(e.mesh);
      }
      if (nearbyMeshes.length === 0) continue;
      this.raycaster.set(probePos, new THREE.Vector3(0, -1, 0));
      this.raycaster.near = 0;
      this.raycaster.far = 0.35 + maxDrop;
      const hits = this.raycaster.intersectObjects(nearbyMeshes, false);
      if (hits.length > 0) {
        const hitY = hits[0].point.y;
        if (hitY >= minValid && hitY <= maxValid && (bestY === null || hitY > bestY)) {
          bestY = hitY;
        }
      }
    }

    const groundY = this.getGroundFloorY(pos.x, pos.z);
    if (groundY >= minValid && groundY <= maxValid) {
      if (bestY === null || groundY > bestY) bestY = groundY;
    }

    return bestY;
  }

  /**
   * General solid raycast for bullets, knife strikes, and grenade bounces.
   */
  raycastWorld(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number
  ): { point: THREE.Vector3; distance: number; normal: THREE.Vector3; tag: string } | null {
    const end = origin.clone().addScaledVector(dir, maxDist);
    const mid = origin.clone().addScaledVector(dir, maxDist * 0.5);
    const { aabbs, obbs } = this.queryNearby(mid.x, mid.z, maxDist * 0.5 + 2.0);

    let minDist = maxDist + 1;
    let bestTag = '';
    const bestNormal = new THREE.Vector3(0, 1, 0);

    for (const c of aabbs) {
      const hit = this.rayIntersectsBox(
        origin.x, origin.y, origin.z,
        dir.x, dir.y, dir.z,
        Math.min(maxDist, minDist),
        c.min.x, c.min.y, c.min.z,
        c.max.x, c.max.y, c.max.z
      );
      if (hit !== null && hit < minDist) {
        minDist = hit;
        bestTag = c.tag;
        const p = origin.clone().addScaledVector(dir, hit);
        const eps = 0.02;
        if (Math.abs(p.y - c.max.y) < eps) bestNormal.set(0, 1, 0);
        else if (Math.abs(p.y - c.min.y) < eps) bestNormal.set(0, -1, 0);
        else if (Math.abs(p.x - c.min.x) < eps) bestNormal.set(-1, 0, 0);
        else if (Math.abs(p.x - c.max.x) < eps) bestNormal.set(1, 0, 0);
        else if (Math.abs(p.z - c.min.z) < eps) bestNormal.set(0, 0, -1);
        else bestNormal.set(0, 0, 1);
      }
    }

    for (const obb of obbs) {
      const relX = origin.x - obb.center.x;
      const relZ = origin.z - obb.center.z;
      const lox = relX * obb.cosY - relZ * obb.sinY;
      const loz = relX * obb.sinY + relZ * obb.cosY;
      const ldx = dir.x * obb.cosY - dir.z * obb.sinY;
      const ldz = dir.x * obb.sinY + dir.z * obb.cosY;
      const hit = this.rayIntersectsBox(
        lox, origin.y - obb.center.y, loz,
        ldx, dir.y, ldz,
        Math.min(maxDist, minDist),
        -obb.halfExtents.x, -obb.halfExtents.y, -obb.halfExtents.z,
        obb.halfExtents.x, obb.halfExtents.y, obb.halfExtents.z
      );
      if (hit !== null && hit < minDist) {
        minDist = hit;
        bestTag = obb.tag;
        bestNormal.set(-dir.x, Math.abs(dir.y) > 0.7 ? 1 : 0, -dir.z).normalize();
      }
    }

    const segBox = new THREE.Box3().setFromPoints([origin, end]).expandByScalar(0.5);
    const walkableMeshes: THREE.Mesh[] = [];
    for (const wg of this.walkableGroups) {
      if (!wg.bounds.intersectsBox(segBox)) continue;
      for (const e of wg.entries) {
        if (e.mesh.visible && e.box.intersectsBox(segBox)) walkableMeshes.push(e.mesh);
      }
    }
    if (walkableMeshes.length > 0) {
      this.raycaster.set(origin, dir);
      this.raycaster.near = 0.05;
      this.raycaster.far = Math.min(maxDist, minDist);
      const hits = this.raycaster.intersectObjects(walkableMeshes, false);
      if (hits.length > 0 && hits[0].distance < minDist) {
        minDist = hits[0].distance;
        bestTag = 'interior_mesh';
        if (hits[0].face) {
          bestNormal.copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld).normalize();
        }
      }
    }

    if (dir.y < -0.001) {
      const gY = this.getGroundFloorY(origin.x + dir.x * Math.min(maxDist, 20), origin.z + dir.z * Math.min(maxDist, 20));
      const tFloor = (gY - origin.y) / dir.y;
      if (tFloor >= 0 && tFloor < minDist && tFloor <= maxDist) {
        minDist = tFloor;
        bestTag = 'ground';
        bestNormal.set(0, 1, 0);
      }
    }

    if (minDist <= maxDist) {
      return {
        point: origin.clone().addScaledVector(dir, minDist),
        distance: minDist,
        normal: bestNormal,
        tag: bestTag
      };
    }
    return null;
  }

  /**
   * Returns exact surface elevation for grass (0.20m), asphalt roads/markings (0.212m),
   * and raised sidewalks/plaza (0.225m) so player feet never sink below road geometry.
   */
  private getGroundFloorY(x: number, z: number): number {
    // Central Plaza
    if (Math.abs(x) <= 18 && Math.abs(z) <= 18) return 0.225;
    // Road asphalt lanes (+ markings)
    const onNSRoad =
      (Math.abs(x) <= 8.0 && Math.abs(z) <= 200) ||
      (x >= 64.0 && x <= 76.0 && Math.abs(z) <= 140) ||
      (x >= -66.0 && x <= -54.0 && Math.abs(z) <= 140);
    const onEWRoad =
      (Math.abs(z) <= 8.0 && Math.abs(x) <= 200) ||
      (z >= -116.0 && z <= -104.0 && Math.abs(x) <= 130) ||
      (z >= 130.0 && z <= 150.0 && Math.abs(x) <= 200);
    if (onNSRoad || onEWRoad) return 0.212;

    // Sidewalks flanking roads
    const onSidewalk =
      (Math.abs(x) <= 11.5 && Math.abs(z) <= 200) ||
      (Math.abs(z) <= 11.5 && Math.abs(x) <= 200) ||
      (x >= 60.5 && x <= 79.5 && Math.abs(z) <= 143.5) ||
      (x >= -69.5 && x <= -50.5 && Math.abs(z) <= 143.5) ||
      (z >= -119.5 && z <= -100.5 && Math.abs(x) <= 133.5) ||
      (z >= 126.5 && z <= 153.5 && Math.abs(x) <= 200);
    if (onSidewalk) return 0.225;

    return 0.2;
  }

  /**
   * Returns current walkable surface category for realistic ground-aware footstep audio.
   */
  getSurfaceType(pos: THREE.Vector3): 'grass' | 'road' | 'interior' {
    if (pos.y > 0.36) return 'interior';
    const base = this.getGroundFloorY(pos.x, pos.z);
    if (base > 0.205) return 'road';
    return 'grass';
  }

  private rayIntersectsBox(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number,
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number
  ): number | null {
    let tmin = 0;
    let tmax = maxDist;

    const invX = Math.abs(dx) > 1e-6 ? 1 / dx : 1e6;
    let t1 = (minX - ox) * invX;
    let t2 = (maxX - ox) * invX;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;

    const invY = Math.abs(dy) > 1e-6 ? 1 / dy : 1e6;
    t1 = (minY - oy) * invY;
    t2 = (maxY - oy) * invY;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;

    const invZ = Math.abs(dz) > 1e-6 ? 1 / dz : 1e6;
    t1 = (minZ - oz) * invZ;
    t2 = (maxZ - oz) * invZ;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax || tmin <= 0.001) return null;

    return tmin;
  }

  resolveCameraCollision(origin: THREE.Vector3, desired: THREE.Vector3): THREE.Vector3 {
    const delta = desired.clone().sub(origin);
    const maxDist = delta.length();
    if (maxDist < 0.02) return desired;
    const dir = delta.divideScalar(maxDist);

    // Midpoint query covers full segment origin->desired against AABBs, OBBs & walkable GLB houses
    const midX = (origin.x + desired.x) * 0.5;
    const midZ = (origin.z + desired.z) * 0.5;
    const { aabbs, obbs } = this.queryNearby(midX, midZ, maxDist * 0.5 + 1.5);

    const segBox = new THREE.Box3().setFromPoints([origin, desired]).expandByScalar(0.6);
    const walkableMeshes: THREE.Mesh[] = [];
    for (const wg of this.walkableGroups) {
      if (!wg.bounds.intersectsBox(segBox)) continue;
      for (const e of wg.entries) {
        if (e.mesh.visible && e.box.intersectsBox(segBox)) {
          walkableMeshes.push(e.mesh);
        }
      }
    }

    // 5-ray near-plane frustum sweep (all probe origins stay <= 0.18m < playerRadius 0.36m from center)
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    else right.normalize();
    const camUp = new THREE.Vector3().crossVectors(right, dir).normalize();

    const probeStarts = [
      origin,
      origin.clone().addScaledVector(right, 0.15).addScaledVector(camUp, 0.11),
      origin.clone().addScaledVector(right, -0.15).addScaledVector(camUp, 0.11),
      origin.clone().addScaledVector(right, 0.15).addScaledVector(camUp, -0.11),
      origin.clone().addScaledVector(right, -0.15).addScaledVector(camUp, -0.11)
    ];

    let minHitDist = maxDist;

    for (const pStart of probeStarts) {
      // 1. Continuous analytical ray-AABB test across all walls/buildings
      for (const c of aabbs) {
        const hit = this.rayIntersectsBox(
          pStart.x, pStart.y, pStart.z,
          dir.x, dir.y, dir.z,
          minHitDist,
          c.min.x, c.min.y, c.min.z,
          c.max.x, c.max.y, c.max.z
        );
        if (hit !== null && hit < minHitDist) {
          minHitDist = hit;
        }
      }

      // 2. Continuous rotated-OBB test for vehicles & barriers
      for (const obb of obbs) {
        const relX = pStart.x - obb.center.x;
        const relZ = pStart.z - obb.center.z;
        const lox = relX * obb.cosY - relZ * obb.sinY;
        const loz = relX * obb.sinY + relZ * obb.cosY;
        const ldx = dir.x * obb.cosY - dir.z * obb.sinY;
        const ldz = dir.x * obb.sinY + dir.z * obb.cosY;
        const hit = this.rayIntersectsBox(
          lox, pStart.y - obb.center.y, loz,
          ldx, dir.y, ldz,
          minHitDist,
          -obb.halfExtents.x, -obb.halfExtents.y, -obb.halfExtents.z,
          obb.halfExtents.x, obb.halfExtents.y, obb.halfExtents.z
        );
        if (hit !== null && hit < minHitDist) {
          minHitDist = hit;
        }
      }

      // 3. Walkable GLB interior house walls/roofs
      if (walkableMeshes.length > 0) {
        this.raycaster.set(pStart, dir);
        this.raycaster.near = 0.01;
        this.raycaster.far = minHitDist;
        const hits = this.raycaster.intersectObjects(walkableMeshes, false);
        if (hits.length > 0 && hits[0].distance < minHitDist) {
          minHitDist = hits[0].distance;
        }
      }
    }

    if (minHitDist < maxDist) {
      // Strictly stay OUTSIDE the hit wall surface (never push past minHitDist into wall)
      const safeDist = Math.max(0.05, minHitDist - 0.24);
      return origin.clone().addScaledVector(dir, safeDist);
    }
    return desired;
  }

  toggleDebugWireframes(): boolean {
    this.debugVisible = !this.debugVisible;
    if (this.debugVisible && !this.debugBuilt) {
      this.rebuildDebugWireframes();
    }
    this.debugGroup.visible = this.debugVisible;
    return this.debugVisible;
  }

  private rebuildDebugWireframes() {
    while (this.debugGroup.children.length > 0) {
      const c = this.debugGroup.children[0];
      this.debugGroup.remove(c);
      if (c instanceof THREE.InstancedMesh || c instanceof THREE.Mesh) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    }

    const wallMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, wireframe: true });
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x34c759, wireframe: true });
    const obbMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, wireframe: true });
    const walkableMat = new THREE.MeshBasicMaterial({ color: 0xff9f43, wireframe: true });
    const unitGeo = new THREE.BoxGeometry(1, 1, 1);

    const wallBoxes: AABBCollider[] = [];
    const floorBoxes: AABBCollider[] = [];
    for (const c of this.allAABBs) {
      const sx = c.max.x - c.min.x;
      const sy = c.max.y - c.min.y;
      const sz = c.max.z - c.min.z;
      const isFloor = sy < 0.55 && (sx > 2 || sz > 2);
      if (isFloor) floorBoxes.push(c);
      else wallBoxes.push(c);
    }

    const dummy = new THREE.Object3D();
    const buildInstancedAABBs = (list: AABBCollider[], mat: THREE.MeshBasicMaterial) => {
      if (list.length === 0) return;
      const inst = new THREE.InstancedMesh(unitGeo.clone(), mat, list.length);
      inst.frustumCulled = false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        dummy.position.set((c.min.x + c.max.x) / 2, (c.min.y + c.max.y) / 2, (c.min.z + c.max.z) / 2);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(c.max.x - c.min.x, c.max.y - c.min.y, c.max.z - c.min.z);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      this.debugGroup.add(inst);
    };

    buildInstancedAABBs(wallBoxes, wallMat);
    buildInstancedAABBs(floorBoxes, floorMat);

    if (this.allOBBs.length > 0) {
      const obbInst = new THREE.InstancedMesh(unitGeo.clone(), obbMat, this.allOBBs.length);
      obbInst.frustumCulled = false;
      for (let i = 0; i < this.allOBBs.length; i++) {
        const obb = this.allOBBs[i];
        dummy.position.copy(obb.center);
        dummy.rotation.set(0, obb.rotY, 0);
        dummy.scale.set(obb.halfExtents.x * 2, obb.halfExtents.y * 2, obb.halfExtents.z * 2);
        dummy.updateMatrix();
        obbInst.setMatrixAt(i, dummy.matrix);
      }
      obbInst.instanceMatrix.needsUpdate = true;
      this.debugGroup.add(obbInst);
    }

    const walkableBoxes: THREE.Box3[] = [];
    for (const wg of this.walkableGroups) {
      for (const e of wg.entries) {
        if (e.mesh.visible) walkableBoxes.push(e.box);
      }
    }
    if (walkableBoxes.length > 0) {
      const walkInst = new THREE.InstancedMesh(unitGeo.clone(), walkableMat, walkableBoxes.length);
      walkInst.frustumCulled = false;
      for (let i = 0; i < walkableBoxes.length; i++) {
        const b = walkableBoxes[i];
        dummy.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
        dummy.updateMatrix();
        walkInst.setMatrixAt(i, dummy.matrix);
      }
      walkInst.instanceMatrix.needsUpdate = true;
      this.debugGroup.add(walkInst);
    }

    unitGeo.dispose();
    this.debugBuilt = true;
  }

  runAudit(spawnPos: THREE.Vector3): HitboxAuditReport {
    let invalidCount = 0;
    for (const c of this.allAABBs) {
      if (!Number.isFinite(c.min.x) || !Number.isFinite(c.max.x) || c.min.x >= c.max.x || c.min.y >= c.max.y || c.min.z >= c.max.z) {
        invalidCount++;
      }
    }
    const clearCheck = this.tryHorizontalMove(spawnPos.x, spawnPos.y, spawnPos.z, spawnPos.x, spawnPos.z, 0.36, 1.78, 0.44, true);
    return {
      aabbCount: this.allAABBs.length,
      obbCount: this.allOBBs.length,
      walkableGroups: this.walkableGroups.length,
      invalidCount,
      spawnClear: clearCheck !== null
    };
  }
}
