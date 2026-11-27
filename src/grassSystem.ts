import * as THREE from 'three';
import { ModelLoader } from './modelLoader.ts';
import { extractPackIslands, extractNamedSubNodes } from './packExtractor.ts';

export interface ExclusionRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface GrassChunk {
  meshes: THREE.InstancedMesh[];
  centerX: number;
  centerZ: number;
}

interface PrototypeMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  scale: number;
}

/**
 * Replaces procedural grass with instanced meshes extracted directly from
 * `grass.glb` and `stones_and_grass.glb` across all non-road, non-sidewalk,
 * non-building ground. Uses chunked InstancedMesh with 65m distance culling
 * and zero shadows for integrated-GPU & mobile performance.
 */
export class GrassWorldSystem {
  private chunks: GrassChunk[] = [];
  private exclusions: ExclusionRect[] = [];

  constructor(buildingExclusions: ExclusionRect[] = []) {
    this.exclusions = [
      { minX: -12.0, maxX: 12.0, minZ: -210, maxZ: 210 },
      { minX: -210, maxX: 210, minZ: -12.0, maxZ: 12.0 },
      { minX: 60.0, maxX: 80.0, minZ: -145, maxZ: 145 },
      { minX: -70.0, maxX: -50.0, minZ: -145, maxZ: 145 },
      { minX: -135, maxX: 135, minZ: -120.0, maxZ: -100.0 },
      { minX: -210, maxX: 210, minZ: 126.0, maxZ: 154.0 },
      // 5 Main Buildings + Exterior Aprons & Plaza
      { minX: -18, maxX: 18, minZ: -18, maxZ: 18 },
      { minX: 79, maxX: 128, minZ: 17, maxZ: 53 },
      { minX: -27, maxX: 27, minZ: -160, maxZ: -118 },
      { minX: 80, maxX: 125, minZ: -51, maxZ: -19 },
      { minX: -96, maxX: -74, minZ: 51, maxZ: 72 },
      // GLB Interior Houses & Suite
      { minX: -123, maxX: -109, minZ: 51, maxZ: 65 },
      { minX: -92, maxX: -78, minZ: 19, maxZ: 33 },
      { minX: -136, maxX: -112, minZ: 12, maxZ: 36 },
      { minX: -123, maxX: -107, minZ: 88, maxZ: 102 },
      ...buildingExclusions
    ];
  }

  async init(scene: THREE.Scene, loader: ModelLoader) {
    const grassProtos: PrototypeMesh[] = [];
    const stoneProtos: PrototypeMesh[] = [];

    // 1. Extract lightweight grass tufts from grass.glb
    const grassRaw = await loader.loadRaw('nature_grass');
    if (grassRaw) {
      const items = extractNamedSubNodes(grassRaw.object);
      for (const item of items) {
        if (item.tris > 850) continue; // Keep fast low-poly tufts for instancing
        item.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.geometry) {
            const g = c.geometry.clone();
            const mat = this.toFastLambert(c.material, true);
            const targetH = 0.72;
            const s = targetH / Math.max(item.size.y, 0.15);
            g.applyMatrix4(c.matrixWorld);
            const b = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
            const ctr = b.getCenter(new THREE.Vector3());
            g.translate(-ctr.x, -b.min.y, -ctr.z);
            grassProtos.push({ geometry: g, material: mat, scale: s });
          }
        });
      }
    }

    // 2. Extract stones + foliage/grass from stones_and_grass.glb
    const stonesRaw = await loader.loadRaw('nature_stones_and_grass');
    if (stonesRaw) {
      const items = extractPackIslands(stonesRaw.object, { weldTolerance: 0.05, minTris: 12 });
      for (const item of items.slice(0, 3)) {
        item.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.geometry) {
            const g = c.geometry.clone();
            const mat = this.toFastLambert(c.material, false);
            const s = 0.95 / Math.max(item.size.y, item.size.x, 0.2);
            stoneProtos.push({ geometry: g, material: mat, scale: Math.min(s, 1.8) });
          }
        });
      }
    }

    // Blend BOTH grass.glb and stones_and_grass.glb (2 grass + 2 stones/fern variants = 4 draw calls/chunk)
    const activeProtos: PrototypeMesh[] = [
      ...grassProtos.slice(0, 2),
      ...stoneProtos.slice(0, 2)
    ];
    if (activeProtos.length === 0) return;

    // 10x10 spatial chunks of 38.4x38.4m across -192..+192 with 5x grass density (580 tries/chunk -> ~0.39/m2)
    const gridCount = 10;
    const chunkSize = 38.4;
    const startCoord = -(gridCount * chunkSize) / 2;
    const dummy = new THREE.Object3D();

    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let gx = 0; gx < gridCount; gx++) {
      for (let gz = 0; gz < gridCount; gz++) {
        const minX = startCoord + gx * chunkSize;
        const minZ = startCoord + gz * chunkSize;
        const centerX = minX + chunkSize / 2;
        const centerZ = minZ + chunkSize / 2;

        const buckets: { x: number; z: number; s: number; r: number }[][] = activeProtos.map(() => []);

        // 5x Grass Density (580 placements per 38.4x38.4m chunk vs old 180 per 48x48m)
        for (let i = 0; i < 580; i++) {
          const x = minX + rand() * chunkSize;
          const z = minZ + rand() * chunkSize;
          if (!this.isExcluded(x, z)) {
            // 75% lush grass tufts (protos 0,1) & 25% stones/foliage (protos 2,3)
            const pIdx = rand() < 0.78
              ? Math.floor(rand() * Math.min(2, activeProtos.length))
              : Math.min(activeProtos.length - 1, 2 + Math.floor(rand() * Math.max(1, activeProtos.length - 2)));
            buckets[pIdx].push({
              x,
              z,
              s: 0.75 + rand() * 0.85,
              r: rand() * Math.PI * 2
            });
          }
        }

        const chunkMeshes: THREE.InstancedMesh[] = [];
        for (let pIdx = 0; pIdx < activeProtos.length; pIdx++) {
          const list = buckets[pIdx];
          if (list.length === 0) continue;

          const proto = activeProtos[pIdx];
          const inst = new THREE.InstancedMesh(proto.geometry, proto.material, list.length);
          inst.castShadow = false;
          inst.receiveShadow = false;

          for (let k = 0; k < list.length; k++) {
            const it = list[k];
            dummy.position.set(it.x, 0.19, it.z);
            dummy.rotation.set(0, it.r, 0);
            dummy.scale.setScalar(proto.scale * it.s);
            dummy.updateMatrix();
            inst.setMatrixAt(k, dummy.matrix);
          }
          inst.instanceMatrix.needsUpdate = true;
          scene.add(inst);
          chunkMeshes.push(inst);
        }

        if (chunkMeshes.length > 0) {
          this.chunks.push({ meshes: chunkMeshes, centerX, centerZ });
        }
      }
    }
  }

  private toFastLambert(src: THREE.Material | THREE.Material[], doubleSide: boolean): THREE.MeshLambertMaterial {
    const m = (Array.isArray(src) ? src[0] : src) as THREE.MeshStandardMaterial;
    return new THREE.MeshLambertMaterial({
      map: m.map ?? null,
      color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
      alphaTest: m.alphaTest > 0 ? m.alphaTest : 0.35,
      transparent: false,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
    });
  }

  isExcluded(x: number, z: number): boolean {
    for (const r of this.exclusions) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        return true;
      }
    }
    return false;
  }

  update(playerPos: THREE.Vector3) {
    // 68m radius culling keeps only ~4 chunks visible at any time on mobile/low-spec PCs
    const maxDistSq = 68 * 68;
    for (const c of this.chunks) {
      const dx = c.centerX - playerPos.x;
      const dz = c.centerZ - playerPos.z;
      const vis = (dx * dx + dz * dz) < maxDistSq;
      for (const m of c.meshes) m.visible = vis;
    }
  }
}
