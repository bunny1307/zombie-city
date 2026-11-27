import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODEL_REGISTRY, ModelSpec } from './modelRegistry.ts';
import { PlayerController } from './player.ts';

export interface LoadedModelResult {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export class ModelLoader {
  private loader: GLTFLoader;
  private cache = new Map<string, GLTF | null>();
  private inFlight = new Map<string, Promise<GLTF | null>>();

  constructor() {
    this.loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');
    this.loader.setDRACOLoader(dracoLoader);
  }

  async loadRaw(modelId: string): Promise<LoadedModelResult | null> {
    const spec = MODEL_REGISTRY[modelId];
    if (!spec) return null;

    const gltf = await this.fetchGLTF(spec.path);
    if (!gltf) return null;

    const cloned = cloneSkinned(gltf.scene);
    this.cleanAndConvertMaterials(cloned, spec);

    return {
      object: cloned,
      animations: gltf.animations ?? []
    };
  }

  async loadById(modelId: string): Promise<LoadedModelResult | null> {
    const spec = MODEL_REGISTRY[modelId];
    if (!spec) return null;

    const raw = await this.loadRaw(modelId);
    if (!raw) return null;

    this.normalizeTransform(raw.object, spec);
    return raw;
  }

  private async fetchGLTF(url: string): Promise<GLTF | null> {
    if (this.cache.has(url)) return this.cache.get(url) ?? null;
    if (this.inFlight.has(url)) return this.inFlight.get(url)!;

    const promise = (async () => {
      try {
        const gltf = await this.loader.loadAsync(url);
        this.cache.set(url, gltf);
        return gltf;
      } catch (err) {
        console.warn('Failed to load GLB:', url, err);
        this.cache.set(url, null);
        return null;
      } finally {
        this.inFlight.delete(url);
      }
    })();

    this.inFlight.set(url, promise);
    return promise;
  }

  /**
   * Strips unwanted studio helper planes, disables ALL shadow rendering,
   * and converts expensive PBR materials into fast MeshLambertMaterial for
   * low-spec integrated GPUs & mobile browsers.
   */
  private cleanAndConvertMaterials(obj: THREE.Object3D, spec: ModelSpec) {
    const toRemove: THREE.Object3D[] = [];

    obj.traverse((child) => {
      if (child.name) {
        if (spec.ignoreMeshNames?.some((ig) => child.name.includes(ig))) {
          toRemove.push(child);
          return;
        }
        if (spec.exactIgnoreMeshNames?.includes(child.name)) {
          toRemove.push(child);
          return;
        }
      }
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;

        const isCityShell = spec.id === 'city_buildings_pack';
        const isHouseModel = spec.category === 'buildings';

        const convertMat = (m: THREE.Material): THREE.Material => {
          const src = m as THREE.MeshStandardMaterial;
          // Solidify hollow perimeter city-block glass & force DoubleSide on buildings so close camera angles never cull walls
          if (isCityShell && src.transparent) {
            return new THREE.MeshLambertMaterial({
              color: new THREE.Color(0x162432),
              transparent: false,
              opacity: 1.0,
              side: THREE.DoubleSide
            });
          }
          return new THREE.MeshLambertMaterial({
            map: src.map ?? null,
            color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
            transparent: src.transparent ?? false,
            opacity: src.opacity ?? 1.0,
            alphaTest: src.alphaTest > 0 ? src.alphaTest : 0,
            side: isHouseModel ? THREE.DoubleSide : (src.side ?? THREE.FrontSide)
          });
        };

        if (Array.isArray(child.material)) {
          child.material = child.material.map(convertMat);
        } else if (child.material) {
          child.material = convertMat(child.material);
        }
      }
    });

    for (const r of toRemove) {
      r.parent?.remove(r);
    }
  }

  private normalizeTransform(obj: THREE.Object3D, spec: ModelSpec) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());

    if (spec.uniformScale) {
      obj.scale.multiplyScalar(spec.uniformScale);
    } else if (spec.targetHeight && size.y > 0.001) {
      obj.scale.multiplyScalar(spec.targetHeight / size.y);
    } else if (spec.targetWidth && size.x > 0.001) {
      obj.scale.multiplyScalar(spec.targetWidth / size.x);
    } else if (spec.targetLength) {
      const horizMax = Math.max(size.x, size.z);
      if (horizMax > 0.001) {
        obj.scale.multiplyScalar(spec.targetLength / horizMax);
      }
    }

    obj.updateMatrixWorld(true);
    const groundedBox = new THREE.Box3().setFromObject(obj);
    const center = groundedBox.getCenter(new THREE.Vector3());
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= groundedBox.min.y;
  }

  /**
   * Registers multiple local-space OBB boxes (e.g. chassis + cabin, hull + turret + barrel)
   * transformed accurately by wrapper placement (x, y, z, rotY).
   */
  addCompoundOBBs(
    player: PlayerController,
    x: number,
    y: number,
    z: number,
    rotY: number,
    parts: { center: [number, number, number]; size: [number, number, number]; tag: string }[]
  ) {
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    for (const part of parts) {
      const [lx, ly, lz] = part.center;
      const wx = x + lx * cosY + lz * sinY;
      const wz = z - lx * sinY + lz * cosY;
      player.addOBB(
        new THREE.Vector3(wx, y + ly, wz),
        new THREE.Vector3(part.size[0], part.size[1], part.size[2]),
        rotY,
        part.tag
      );
    }
  }

  async placeOnMap(
    modelId: string,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    player?: PlayerController,
    collisionMode: 'none' | 'aabb' | 'obb' | 'walkable' = 'none'
  ): Promise<THREE.Group | null> {
    const loaded = await this.loadById(modelId);
    if (!loaded) return null;

    const wrapper = new THREE.Group();
    wrapper.add(loaded.object);
    parent.add(wrapper);

    wrapper.position.set(0, 0, 0);
    wrapper.rotation.set(0, 0, 0);
    wrapper.updateMatrixWorld(true);
    const localBox = new THREE.Box3().setFromObject(wrapper);
    const localSize = localBox.getSize(new THREE.Vector3());
    const localCenter = localBox.getCenter(new THREE.Vector3());

    wrapper.position.set(x, y, z);
    wrapper.rotation.y = rotY;
    wrapper.updateMatrixWorld(true);

    if (player) {
      if (collisionMode === 'walkable') {
        player.addWalkableObject(wrapper);
      } else if (collisionMode === 'obb') {
        const worldCenter = new THREE.Vector3(x, y + localCenter.y, z);
        player.addOBB(worldCenter, localSize, rotY, modelId);
      } else if (collisionMode === 'aabb') {
        const worldBox = new THREE.Box3().setFromObject(wrapper);
        player.addCollider(worldBox, modelId);
      }
    }

    return wrapper;
  }
}
