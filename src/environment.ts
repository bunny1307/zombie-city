import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GameMaterials } from './materials.ts';
import { PlayerController } from './player.ts';
import { PooledLightManager } from './lightPool.ts';

export class CityEnvironment {
  scene: THREE.Scene;
  player: PlayerController;
  lightPool: PooledLightManager;

  dirLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fog: THREE.FogExp2;
  skyMesh!: THREE.Mesh;
  nightSkyGroup = new THREE.Group();
  skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
    uNightMix: { value: number };
  };

  isNight = false;

  private roadGeos: THREE.BufferGeometry[] = [];
  private sidewalkGeos: THREE.BufferGeometry[] = [];
  private curbGeos: THREE.BufferGeometry[] = [];
  private yellowMarkGeos: THREE.BufferGeometry[] = [];
  private whiteMarkGeos: THREE.BufferGeometry[] = [];
  private poleGeos: THREE.BufferGeometry[] = [];
  private bulbGeos: THREE.BufferGeometry[] = [];

  constructor(scene: THREE.Scene, player: PlayerController, lightPool: PooledLightManager) {
    this.scene = scene;
    this.player = player;
    this.lightPool = lightPool;

    this.fog = new THREE.FogExp2(0x8896a3, 0.0065);
    this.scene.fog = this.fog;

    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x4b657d) },
      uHorizonColor: { value: new THREE.Color(0xa6b2bd) },
      uNightMix: { value: 0.0 }
    };
    this.createSkyDome();

    this.hemiLight = new THREE.HemisphereLight(0xd8e6f3, 0x3b352e, 1.0);
    this.scene.add(this.hemiLight);

    // Directional Sun/Moon Light — NO shadows for mobile & low-spec PC speed
    this.dirLight = new THREE.DirectionalLight(0xfff1dc, 1.45);
    this.dirLight.position.set(60, 95, 45);
    this.dirLight.castShadow = false;
    this.scene.add(this.dirLight);

    this.buildCityGroundAndRoads();
    this.buildStreetFurnitureAndProps();
    this.flushBatchedEnvironmentGeometry();
    this.setupNightToggle();
  }

  private createSkyDome() {
    const skyGeo = new THREE.SphereGeometry(250, 16, 10);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform float uNightMix;
        varying vec3 vWorldPos;
        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.55));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    this.createNightMoonAndStars();
  }

  private createNightMoonAndStars() {
    this.nightSkyGroup.visible = false;
    this.scene.add(this.nightSkyGroup);

    // 1. Realistic Moon with dark lunar maria patches on procedural CanvasTexture
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 256;
    moonCanvas.height = 256;
    const ctx = moonCanvas.getContext('2d')!;
    const baseGrad = ctx.createRadialGradient(108, 102, 16, 128, 128, 130);
    baseGrad.addColorStop(0, '#f4f1e6');
    baseGrad.addColorStop(0.65, '#dcd9cb');
    baseGrad.addColorStop(1, '#9d9b90');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 256, 256);

    // Realistic basaltic maria & crater shading patches
    const mariaPatches = [
      { x: 95, y: 92, r: 38, a: 0.28 },
      { x: 142, y: 84, r: 30, a: 0.24 },
      { x: 162, y: 122, r: 26, a: 0.26 },
      { x: 118, y: 148, r: 34, a: 0.22 },
      { x: 74, y: 132, r: 22, a: 0.20 },
      { x: 146, y: 162, r: 24, a: 0.18 },
      { x: 112, y: 62, r: 20, a: 0.19 }
    ];
    for (const m of mariaPatches) {
      const g = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, m.r);
      g.addColorStop(0, `rgba(68, 70, 74, ${m.a})`);
      g.addColorStop(0.6, `rgba(82, 84, 88, ${m.a * 0.65})`);
      g.addColorStop(1, 'rgba(82, 84, 88, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp subtle crater rings & highland highlights
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 42; i++) {
      const cx = 36 + rand() * 184;
      const cy = 36 + rand() * 184;
      const cr = 3 + rand() * 9;
      ctx.strokeStyle = 'rgba(255, 255, 245, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(70, 72, 76, 0.15)';
      ctx.beginPath();
      ctx.arc(cx + 1, cy + 1, cr * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    const moonTex = new THREE.CanvasTexture(moonCanvas);
    moonTex.colorSpace = THREE.SRGBColorSpace;
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(14.5, 24, 18),
      new THREE.MeshBasicMaterial({ map: moonTex, fog: false })
    );
    moonMesh.position.set(-58, 96, -160);
    moonMesh.rotation.y = 0.5;
    this.nightSkyGroup.add(moonMesh);

    // 2. Sparse 26 Stars evenly spread across all sky quadrants (clean, never overcrowded)
    const starCount = 26;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < starCount; i++) {
      const frac = (i + 0.5) / starCount;
      const elevAngle = 0.22 + frac * 1.18 + (rand() - 0.5) * 0.12;
      const azimAngle = i * goldenAngle + (rand() - 0.5) * 0.35;
      const r = 225;
      positions[i * 3] = r * Math.cos(elevAngle) * Math.cos(azimAngle);
      positions[i * 3 + 1] = r * Math.sin(elevAngle);
      positions[i * 3 + 2] = r * Math.cos(elevAngle) * Math.sin(azimAngle);

      const tint = 0.8 + rand() * 0.2;
      colors[i * 3] = tint;
      colors[i * 3 + 1] = tint;
      colors[i * 3 + 2] = Math.min(1.0, tint + 0.08);
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 3.2,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      fog: false
    });
    this.nightSkyGroup.add(new THREE.Points(starGeo, starMat));
  }

  private pushBox(arr: THREE.BufferGeometry[], x: number, y: number, z: number, w: number, h: number, d: number) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    arr.push(g);
  }

  private buildCityGroundAndRoads() {
    // Full-world Grassy Ground Terrain everywhere there is no road
    const groundGeo = new THREE.PlaneGeometry(460, 460);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, GameMaterials.deadGrass);
    ground.position.y = 0.2;
    this.scene.add(ground);

    this.createRoadSegment(0, 0, 16, 400, true);      // Grand Central Ave
    this.createRoadSegment(0, 0, 400, 16, false);     // Central Metro St
    this.createRoadSegment(70, 0, 12, 280, true);     // Civic Parkway
    this.createRoadSegment(-60, 0, 12, 280, true);    // Commercial Ave
    this.createRoadSegment(0, -110, 260, 12, false);  // School Campus Drive
    this.createRoadSegment(0, 140, 400, 20, false);   // South Highway Blvd

    this.pushBox(this.sidewalkGeos, 0, 0.12, 0, 36, 0.2, 36);

    this.createCrosswalk(0, 14, 12, 3.6, false);
    this.createCrosswalk(0, -14, 12, 3.6, false);
    this.createCrosswalk(14, 0, 3.6, 12, true);
    this.createCrosswalk(-14, 0, 3.6, 12, true);

    this.createTrafficLightPole(10, 10, -Math.PI / 4);
    this.createTrafficLightPole(-10, -10, (3 * Math.PI) / 4);

    // Subtle Nighttime Exterior Entrance & Facade Sconce Lights (6-light pool keeps mobile FPS high)
    const nightEntrances: [number, number, number, number][] = [
      [0, 3.6, 14.5, 0xffe4b5],       // Tower Alpha South Entrance
      [-14.5, 3.6, 0, 0xffe4b5],      // Tower Alpha West Entrance
      [81.5, 3.5, 35.0, 0xdff2ff],    // Hospital Ambulance Bay
      [84.5, 3.5, -35.0, 0xcce5ff],   // Police Precinct Portico
      [0, 4.0, -120.5, 0xffe8c2],     // School Front Steps
      [-88.0, 3.0, 68.5, 0xffd9a8],   // 2BHK Front Porch
      [-113.0, 3.0, 58.0, 0xffd9a8],  // West House A Porch
      [-85.0, 3.0, 31.0, 0xffd9a8],   // West House B Porch
      [-115.0, 3.0, 89.0, 0xffd9a8]   // Suite Porch
    ];
    for (const [lx, ly, lz, col] of nightEntrances) {
      this.lightPool.registerLight(lx, ly, lz, col, 6.5, 22, true);
    }
  }

  private createRoadSegment(x: number, z: number, width: number, length: number, isNorthSouth: boolean) {
    if (isNorthSouth) {
      // Top of asphalt = 0.205, markings = 0.211, sidewalk = 0.22 (matches Collision.getGroundFloorY)
      this.pushBox(this.roadGeos, x, 0.105, z, width, 0.2, length);
      this.pushBox(this.sidewalkGeos, x - width / 2 - 1.75, 0.12, z, 3.5, 0.2, length);
      this.pushBox(this.sidewalkGeos, x + width / 2 + 1.75, 0.12, z, 3.5, 0.2, length);
      this.pushBox(this.curbGeos, x - width / 2 + 0.18, 0.16, z, 0.36, 0.16, length);
      this.pushBox(this.curbGeos, x + width / 2 - 0.18, 0.16, z, 0.36, 0.16, length);
      this.pushBox(this.whiteMarkGeos, x - width / 2 + 0.8, 0.209, z, 0.14, 0.015, length);
      this.pushBox(this.whiteMarkGeos, x + width / 2 - 0.8, 0.209, z, 0.14, 0.015, length);

      const step = 8.0;
      const total = Math.floor(length / step);
      const startZ = z - length / 2 + step / 2;
      for (let i = 0; i < total; i++) {
        this.pushBox(this.yellowMarkGeos, x, 0.211, startZ + i * step, 0.18, 0.015, 3.8);
      }
    } else {
      this.pushBox(this.roadGeos, x, 0.105, z, width, 0.2, length);
      this.pushBox(this.sidewalkGeos, x, 0.12, z - length / 2 - 1.75, width, 0.2, 3.5);
      this.pushBox(this.sidewalkGeos, x, 0.12, z + length / 2 + 1.75, width, 0.2, 3.5);
      this.pushBox(this.curbGeos, x, 0.16, z - length / 2 + 0.18, width, 0.16, 0.36);
      this.pushBox(this.curbGeos, x, 0.16, z + length / 2 - 0.18, width, 0.16, 0.36);
      this.pushBox(this.whiteMarkGeos, x, 0.209, z - length / 2 + 0.8, width, 0.015, 0.14);
      this.pushBox(this.whiteMarkGeos, x, 0.209, z + length / 2 - 0.8, width, 0.015, 0.14);

      const step = 8.0;
      const total = Math.floor(width / step);
      const startX = x - width / 2 + step / 2;
      for (let i = 0; i < total; i++) {
        this.pushBox(this.yellowMarkGeos, startX + i * step, 0.211, z, 3.8, 0.015, 0.18);
      }
    }

    this.placeStreetlightsAlongAvenue(x, z, width, length, isNorthSouth);
  }

  private createCrosswalk(x: number, z: number, w: number, l: number, isVerticalBars: boolean) {
    const barCount = 6;
    if (isVerticalBars) {
      const step = w / (barCount + 1);
      for (let i = 1; i <= barCount; i++) {
        this.pushBox(this.whiteMarkGeos, x - w / 2 + i * step, 0.211, z, 0.45, 0.015, l);
      }
    } else {
      const step = l / (barCount + 1);
      for (let i = 1; i <= barCount; i++) {
        this.pushBox(this.whiteMarkGeos, x, 0.211, z - l / 2 + i * step, w, 0.015, 0.45);
      }
    }
  }

  private isStreetlightBlockedByBuilding(x: number, z: number): boolean {
    // Exclude Tower Alpha plaza, Hospital ER canopy, Police Portico, School entrance & houses
    if (Math.abs(x) < 16 && Math.abs(z) < 16) return true;
    if (x > 74 && x < 129 && z > 16 && z < 54) return true;      // Hospital + Canopy
    if (x > 80 && x < 126 && z > -52 && z < -18) return true;    // Police + Portico
    if (x > -28 && x < 28 && z > -160 && z < -118) return true;  // School
    if (x > -96 && x < -73 && z > 50 && z < 71) return true;     // 2BHK House
    return false;
  }

  private placeStreetlightsAlongAvenue(x: number, z: number, width: number, length: number, isNorthSouth: boolean) {
    // Periodic 24m streetlamp spacing along every road, cleanly clear of cross-streets & buildings
    const spacing = 24;
    if (isNorthSouth) {
      const count = Math.floor(length / spacing);
      for (let i = 0; i < count; i++) {
        const zPos = z - length / 2 + i * spacing + spacing / 2;
        if (Math.abs(zPos) < 15 || Math.abs(zPos + 110) < 13 || Math.abs(zPos - 140) < 16) continue;
        const leftX = x - width / 2 - 1.2;
        const rightX = x + width / 2 + 1.2;
        if (!this.isStreetlightBlockedByBuilding(leftX, zPos)) {
          this.createStreetlight(leftX, zPos, Math.PI / 2);
        }
        if (!this.isStreetlightBlockedByBuilding(rightX, zPos)) {
          this.createStreetlight(rightX, zPos, -Math.PI / 2);
        }
      }
    } else {
      const count = Math.floor(width / spacing);
      for (let i = 0; i < count; i++) {
        const xPos = x - width / 2 + i * spacing + spacing / 2;
        if (Math.abs(xPos) < 15 || Math.abs(xPos - 70) < 13 || Math.abs(xPos + 60) < 13) continue;
        const topZ = z - length / 2 - 1.2;
        const botZ = z + length / 2 + 1.2;
        if (!this.isStreetlightBlockedByBuilding(xPos, topZ)) {
          this.createStreetlight(xPos, topZ, 0);
        }
        if (!this.isStreetlightBlockedByBuilding(xPos, botZ)) {
          this.createStreetlight(xPos, botZ, Math.PI);
        }
      }
    }
  }

  private createStreetlight(x: number, z: number, rotY: number) {
    const mat4 = new THREE.Matrix4().makeTranslation(x, 0.2, z).multiply(new THREE.Matrix4().makeRotationY(rotY));

    const post = new THREE.CylinderGeometry(0.08, 0.14, 5.8, 6);
    post.translate(0, 2.9, 0);
    post.applyMatrix4(mat4);
    this.poleGeos.push(post);

    const arm = new THREE.BoxGeometry(0.08, 0.08, 1.9);
    arm.rotateX(-0.15);
    arm.translate(0, 5.85, 0.9);
    arm.applyMatrix4(mat4);
    this.poleGeos.push(arm);

    const lamp = new THREE.BoxGeometry(0.32, 0.16, 0.56);
    lamp.translate(0, 5.95, 1.8);
    lamp.applyMatrix4(mat4);
    this.poleGeos.push(lamp);

    const bulb = new THREE.BoxGeometry(0.24, 0.05, 0.42);
    bulb.translate(0, 5.85, 1.8);
    bulb.applyMatrix4(mat4);
    this.bulbGeos.push(bulb);

    const worldLight = new THREE.Vector3(0, 5.7, 1.8).applyMatrix4(mat4);
    this.lightPool.registerLight(worldLight.x, worldLight.y, worldLight.z, 0xffddb3, 10.0, 24, true);

    this.player.addCollider(new THREE.Box3(
      new THREE.Vector3(x - 0.18, 0.2, z - 0.18),
      new THREE.Vector3(x + 0.18, 6.0, z + 0.18)
    ), 'streetlight');
  }

  private createTrafficLightPole(x: number, z: number, rotY: number) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.4, 7), GameMaterials.streetlightPole);
    pole.position.y = 3.2;
    g.add(pole);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.2, 6), GameMaterials.streetlightPole);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-2.5, 6.0, 0);
    g.add(arm);

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.25, 0.42), GameMaterials.metalDark);
    box.position.set(-4.2, 5.6, 0);
    g.add(box);

    const amberMat = new THREE.MeshLambertMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 1.5 });
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), amberMat);
    l.rotation.x = Math.PI / 2;
    l.position.set(-4.2, 5.6, 0.22);
    g.add(l);

    g.position.set(x, 0.2, z);
    g.rotation.y = rotY;
    this.scene.add(g);

    this.player.addCollider(new THREE.Box3(
      new THREE.Vector3(x - 0.22, 0.2, z - 0.22),
      new THREE.Vector3(x + 0.22, 6.4, z + 0.22)
    ), 'traffic_light');
  }

  private buildStreetFurnitureAndProps() {
    // Note: ALL trees are now placed via real GLB models (`oak_trees.glb`, `trees.glb`, `trees_low_poly.glb`) in WorldDecorator,
    // and ALL barricades use `barrier_bloody.glb` in WorldDecorator!
    this.createParkBench(-93.5, -75, -Math.PI / 2);
    this.createParkBench(-93.5, -85, -Math.PI / 2);
    this.createParkBench(-12, -120, 0);
    this.createParkBench(12, -120, 0);

    this.createDumpster(18, -8, Math.PI / 2);
    this.createDumpster(128, 30, 0);
    this.createDumpster(-68, 65, 0);

    this.createFireHydrant(10, -10);
    this.createFireHydrant(63, 22);
    this.createFireHydrant(-53, 55);
  }

  private createParkBench(x: number, z: number, rotY: number) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.55), GameMaterials.woodPlanks);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 0.07), GameMaterials.woodPlanks);
    back.position.set(0, 0.72, -0.24);
    back.rotation.x = -0.15;
    g.add(back);
    for (const lx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.5), GameMaterials.metalDark);
      leg.position.set(lx, 0.225, 0);
      g.add(leg);
    }
    g.position.set(x, 0.2, z);
    g.rotation.y = rotY;
    this.scene.add(g);

    this.player.addOBB(new THREE.Vector3(x, 0.6, z), new THREE.Vector3(2.0, 0.8, 0.65), rotY, 'bench');
  }

  private createDumpster(x: number, z: number, rotY: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.25, 1.3), GameMaterials.dumpsterGreen);
    body.position.y = 0.68;
    g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.08, 1.36), GameMaterials.metalDark);
    lid.position.set(0, 1.34, -0.1);
    lid.rotation.x = -0.25;
    g.add(lid);
    g.position.set(x, 0.2, z);
    g.rotation.y = rotY;
    this.scene.add(g);

    this.player.addOBB(new THREE.Vector3(x, 0.9, z), new THREE.Vector3(2.1, 1.4, 1.35), rotY, 'dumpster');
  }

  private createFireHydrant(x: number, z: number) {
    const g = new THREE.Group();
    const redMat = new THREE.MeshLambertMaterial({ color: 0xa62626 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.65, 7), redMat);
    body.position.y = 0.325;
    g.add(body);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), redMat);
    cap.position.y = 0.68;
    g.add(cap);
    g.position.set(x, 0.2, z);
    this.scene.add(g);

    this.player.addCollider(new THREE.Box3(
      new THREE.Vector3(x - 0.2, 0.2, z - 0.2),
      new THREE.Vector3(x + 0.2, 1.0, z + 0.2)
    ), 'hydrant');
  }

  private flushBatchedEnvironmentGeometry() {
    const flush = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (geos.length === 0) return;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) {
        const m = new THREE.Mesh(merged, mat);
        m.castShadow = false;
        m.receiveShadow = false;
        this.scene.add(m);
      }
    };

    flush(this.roadGeos, GameMaterials.asphalt);
    flush(this.sidewalkGeos, GameMaterials.sidewalk);
    flush(this.curbGeos, GameMaterials.curb);
    flush(this.yellowMarkGeos, GameMaterials.roadMarkingYellow);
    flush(this.whiteMarkGeos, GameMaterials.roadMarkingWhite);
    flush(this.poleGeos, GameMaterials.streetlightPole);
    flush(this.bulbGeos, GameMaterials.lightGlowYellow);
  }

  setupNightToggle() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyT') {
        this.toggleDayNight();
      }
    });
  }

  toggleDayNight() {
    this.isNight = !this.isNight;
    const timeStatus = document.getElementById('time-status');

    if (this.isNight) {
      this.nightSkyGroup.visible = true;
      this.fog.color.setHex(0x060910);
      this.fog.density = 0.015;
      this.skyUniforms.uTopColor.value.setHex(0x03050c);
      this.skyUniforms.uHorizonColor.value.setHex(0x0c1320);
      this.skyUniforms.uNightMix.value = 1.0;

      this.hemiLight.color.setHex(0x162238);
      this.hemiLight.groundColor.setHex(0x08090c);
      this.hemiLight.intensity = 0.22;

      this.dirLight.color.setHex(0x4a6999);
      this.dirLight.intensity = 0.35;

      // Illuminate building windows softly at night
      GameMaterials.glassSmoked.emissive.setHex(0x284058);
      GameMaterials.glassSmoked.emissiveIntensity = 0.85;
      GameMaterials.glassClean.emissive.setHex(0x4a6c8c);
      GameMaterials.glassClean.emissiveIntensity = 0.9;

      if (timeStatus) {
        timeStatus.innerText = 'Nighttime (Infected Hunting by Sound)';
        timeStatus.style.color = '#ff4757';
      }
    } else {
      this.nightSkyGroup.visible = false;
      this.fog.color.setHex(0x8896a3);
      this.fog.density = 0.0065;
      this.skyUniforms.uTopColor.value.setHex(0x4b657d);
      this.skyUniforms.uHorizonColor.value.setHex(0xa6b2bd);
      this.skyUniforms.uNightMix.value = 0.0;

      this.hemiLight.color.setHex(0xd8e6f3);
      this.hemiLight.groundColor.setHex(0x3b352e);
      this.hemiLight.intensity = 1.0;

      this.dirLight.color.setHex(0xfff1dc);
      this.dirLight.intensity = 1.45;

      GameMaterials.glassSmoked.emissive.setHex(0x000000);
      GameMaterials.glassClean.emissive.setHex(0x000000);

      if (timeStatus) {
        timeStatus.innerText = 'Daytime';
        timeStatus.style.color = '#feca57';
      }
    }
  }
}
