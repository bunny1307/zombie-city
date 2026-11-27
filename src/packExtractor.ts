import * as THREE from 'three';

export interface ExtractedAsset {
  id: string;
  group: THREE.Group;
  size: THREE.Vector3;
  isFlatWallItem: boolean;
  tris: number;
}

/**
 * Splits a merged THREE.Object3D (such as paintings_and_posters.glb or city_buildings_22_pack.glb)
 * into individual, centered, grounded Three.js Groups using connected-triangle Union-Find
 * followed by optional 2D/3D spatial merging (useful for keeping glass + interior pieces inside each building).
 */
export function extractPackIslands(
  root: THREE.Object3D,
  options: {
    weldTolerance?: number;
    mergeBoxGapXZ?: number;
    minTris?: number;
    autoStandUpFlatY?: boolean;
    centerY?: boolean;
  } = {}
): ExtractedAsset[] {
  const weldTol = options.weldTolerance ?? 0.03;
  const mergeGapXZ = options.mergeBoxGapXZ ?? 0;
  const minTris = options.minTris ?? 6;
  const autoStandUp = options.autoStandUpFlatY ?? false;
  const centerY = options.centerY ?? false;

  root.updateMatrixWorld(true);

  interface RawIsland {
    positions: number[];
    normals: number[];
    uvs: number[];
    material: THREE.Material | THREE.Material[];
    box: THREE.Box3;
    tris: number;
  }

  const rawIslands: RawIsland[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const geo = child.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    if (!posAttr) return;

    const normAttr = geo.getAttribute('normal');
    const uvAttr = geo.getAttribute('uv');
    const idxAttr = geo.getIndex();

    const worldPos = posAttr.clone();
    worldPos.applyMatrix4(child.matrixWorld);

    const normalMat = new THREE.Matrix3().getNormalMatrix(child.matrixWorld);
    const vCount = worldPos.count;

    // Union-Find over quantized positions
    const parent = new Int32Array(vCount);
    for (let i = 0; i < vCount; i++) parent[i] = i;
    const find = (x: number) => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };

    const q = 1 / weldTol;
    const qMap = new Map<string, number>();
    for (let i = 0; i < vCount; i++) {
      const key = `${Math.round(worldPos.getX(i) * q)},${Math.round(worldPos.getY(i) * q)},${Math.round(worldPos.getZ(i) * q)}`;
      const prev = qMap.get(key);
      if (prev !== undefined) union(prev, i);
      else qMap.set(key, i);
    }

    const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(vCount / 3);
    for (let t = 0; t < triCount; t++) {
      const a = idxAttr ? idxAttr.getX(t * 3) : t * 3;
      const b = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
      const c = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;
      union(a, b);
      union(b, c);
    }

    const buckets = new Map<number, RawIsland>();
    const vTmp = new THREE.Vector3();
    const nTmp = new THREE.Vector3();

    for (let t = 0; t < triCount; t++) {
      const a = idxAttr ? idxAttr.getX(t * 3) : t * 3;
      const b = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
      const c = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;
      const r = find(a);

      let isl = buckets.get(r);
      if (!isl) {
        isl = {
          positions: [],
          normals: [],
          uvs: [],
          material: child.material,
          box: new THREE.Box3(),
          tris: 0
        };
        buckets.set(r, isl);
      }

      isl.tris++;
      for (const vi of [a, b, c]) {
        vTmp.fromBufferAttribute(worldPos, vi);
        isl.positions.push(vTmp.x, vTmp.y, vTmp.z);
        isl.box.expandByPoint(vTmp);

        if (normAttr) {
          nTmp.fromBufferAttribute(normAttr, vi).applyMatrix3(normalMat).normalize();
          isl.normals.push(nTmp.x, nTmp.y, nTmp.z);
        }
        if (uvAttr) {
          isl.uvs.push(uvAttr.getX(vi), uvAttr.getY(vi));
        }
      }
    }

    for (const isl of buckets.values()) {
      if (isl.tris >= minTris) rawIslands.push(isl);
    }
  });

  // Group islands together if mergeBoxGapXZ > 0 (e.g., keeping glass & interiors inside each of the 22 buildings)
  const groupCount = rawIslands.length;
  const gParent = new Int32Array(groupCount);
  for (let i = 0; i < groupCount; i++) gParent[i] = i;
  const gFind = (x: number) => {
    while (gParent[x] !== x) {
      gParent[x] = gParent[gParent[x]];
      x = gParent[x];
    }
    return x;
  };
  const gUnion = (a: number, b: number) => {
    const ra = gFind(a);
    const rb = gFind(b);
    if (ra !== rb) gParent[rb] = ra;
  };

  if (mergeGapXZ > 0) {
    for (let i = 0; i < groupCount; i++) {
      const bi = rawIslands[i].box;
      for (let j = i + 1; j < groupCount; j++) {
        const bj = rawIslands[j].box;
        const overlapX = bi.max.x + mergeGapXZ >= bj.min.x && bj.max.x + mergeGapXZ >= bi.min.x;
        const overlapZ = bi.max.z + mergeGapXZ >= bj.min.z && bj.max.z + mergeGapXZ >= bi.min.z;
        if (overlapX && overlapZ) {
          gUnion(i, j);
        }
      }
    }
  }

  // Assemble final Groups
  const finalGroups = new Map<number, RawIsland[]>();
  for (let i = 0; i < groupCount; i++) {
    const r = gFind(i);
    if (!finalGroups.has(r)) finalGroups.set(r, []);
    finalGroups.get(r)!.push(rawIslands[i]);
  }

  const assets: ExtractedAsset[] = [];
  let idx = 0;

  for (const list of finalGroups.values()) {
    const grp = new THREE.Group();
    const totalBox = new THREE.Box3();
    let totalTris = 0;

    for (const isl of list) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(isl.positions, 3));
      if (isl.normals.length > 0) g.setAttribute('normal', new THREE.Float32BufferAttribute(isl.normals, 3));
      else g.computeVertexNormals();
      if (isl.uvs.length > 0) g.setAttribute('uv', new THREE.Float32BufferAttribute(isl.uvs, 2));

      const mesh = new THREE.Mesh(g, isl.material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      grp.add(mesh);
      totalBox.union(isl.box);
      totalTris += isl.tris;
    }

    // Center & ground
    const center = totalBox.getCenter(new THREE.Vector3());
    const size = totalBox.getSize(new THREE.Vector3());

    grp.children.forEach((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry.translate(-center.x, centerY ? -center.y : -totalBox.min.y, -center.z);
      }
    });

    let isFlatWallItem = false;
    if (autoStandUp) {
      // If item was laid flat on XZ plane (thin Y, large X & Z), stand it upright facing +Z
      if (size.y < 0.15 && size.z > 0.25 && size.x > 0.2) {
        grp.rotation.x = Math.PI / 2;
        grp.updateMatrixWorld(true);
        const rotBox = new THREE.Box3().setFromObject(grp);
        const rotSize = rotBox.getSize(new THREE.Vector3());
        size.copy(rotSize);
        isFlatWallItem = true;
      } else if (size.z < 0.15 && size.y > 0.25) {
        isFlatWallItem = true;
      }
    }

    assets.push({
      id: `item_${idx++}`,
      group: grp,
      size,
      isFlatWallItem,
      tris: totalTris
    });
  }

  return assets;
}

/**
 * Extracts top-level named child nodes (e.g., car1..car4 in civilian_cars_pack.glb,
 * or Object_0..Object_17 in retro_room_props.glb, or weapon nodes in classic_weapons_pack.glb),
 * centering and grounding each extracted item cleanly at Y=0.
 */
export function extractNamedSubNodes(
  root: THREE.Object3D,
  nameFilter?: (name: string) => boolean
): ExtractedAsset[] {
  root.updateMatrixWorld(true);
  const assets: ExtractedAsset[] = [];

  // Traverse until finding mesh-containing named groups
  const candidates: THREE.Object3D[] = [];
  const visit = (node: THREE.Object3D) => {
    if (nameFilter && node.name && nameFilter(node.name)) {
      candidates.push(node);
      return;
    }
    if (!nameFilter && node instanceof THREE.Mesh) {
      candidates.push(node);
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);

  let idx = 0;
  for (const node of candidates) {
    const clone = node.clone(true);
    // Reset parent transforms by baking world matrix of node's parent
    if (node.parent) {
      node.parent.updateMatrixWorld(true);
      clone.applyMatrix4(node.parent.matrixWorld);
    }

    const box = new THREE.Box3().setFromObject(clone);
    if (box.isEmpty()) continue;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const wrapper = new THREE.Group();
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    clone.position.y -= box.min.y;

    let tris = 0;
    clone.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = false;
        c.receiveShadow = false;
        const g = c.geometry;
        if (g.index) tris += Math.floor(g.index.count / 3);
        else if (g.attributes.position) tris += Math.floor(g.attributes.position.count / 3);
      }
    });

    wrapper.add(clone);
    assets.push({
      id: node.name || `sub_${idx++}`,
      group: wrapper,
      size,
      isFlatWallItem: size.z < 0.14 && size.y > 0.25,
      tris
    });
  }

  return assets;
}
