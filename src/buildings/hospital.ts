import * as THREE from 'three';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { ArchBuilder } from './archBuilder.ts';
import { ProceduralTextures } from '../textures.ts';
import { PooledLightManager } from '../lightPool.ts';

export class HospitalBuilding {
  group = new THREE.Group();
  arch: ArchBuilder;

  posX = 105;
  posZ = 35;
  width = 42;
  depth = 32;
  floorHeight = 4.2;

  constructor(scene: THREE.Scene, player: PlayerController, lightPool: PooledLightManager) {
    this.group.position.set(this.posX, 0.2, this.posZ);
    this.arch = new ArchBuilder(this.group, player, this.posX, 0.2, this.posZ, lightPool);

    this.buildStructure();
    this.buildEmergencyEntrance();
    this.buildFloor1TriageLobby();
    this.buildFloor1Pharmacy();
    this.buildFloor1InpatientWards();
    this.buildFloor2SurgeryAndOffices();
    this.buildStairwells();
    this.buildRoofDetails();
    this.arch.finalizeMergedMeshes();

    scene.add(this.group);
  }

  buildStructure() {
    // Ground Floor Slab
    this.arch.addSolidBox(0, 0.15, 0, this.width, 0.3, this.depth, GameMaterials.hospitalTileFloor, true, false);

    // 2nd Floor Slab (leaving open stairwell hole at X: -6..0, Z: 4..14)
    this.arch.addSolidBox(-13.5, this.floorHeight, 0, 15, 0.3, this.depth, GameMaterials.hospitalTileFloor);
    this.arch.addSolidBox(10.5, this.floorHeight, 0, 21, 0.3, this.depth, GameMaterials.hospitalTileFloor);
    this.arch.addSolidBox(-3, this.floorHeight, -6, 6, 0.3, 20, GameMaterials.hospitalTileFloor);
    this.arch.addSolidBox(-3, this.floorHeight, 15, 6, 0.3, 2, GameMaterials.hospitalTileFloor);

    // Roof Slab (leaving stair exit hole at X: -6..0, Z: 4..12.7 with spacious South landing Z: 12.7..16)
    const roofY = this.floorHeight * 2;
    this.arch.addSolidBox(-13.5, roofY, 0, 15.6, 0.4, this.depth + 0.8, GameMaterials.concreteDark);
    this.arch.addSolidBox(10.5, roofY, 0, 21.6, 0.4, this.depth + 0.8, GameMaterials.concreteDark);
    this.arch.addSolidBox(-3, roofY, -6, 6, 0.4, 20.4, GameMaterials.concreteDark);
    this.arch.addSolidBox(-3, roofY, 14.45, 6, 0.4, 3.5, GameMaterials.concreteDark);

    // Exterior Walls (Floor 1 & Floor 2) with real windows!
    for (let f = 0; f < 2; f++) {
      const baseY = f * this.floorHeight;
      // North Wall (Z = -16)
      this.arch.addWall('x', 0, baseY, -this.depth / 2, this.width, this.floorHeight, 0.4, GameMaterials.hospitalWall, [
        { type: 'window', offset: -14, width: 4.0, height: 1.8, sillHeight: 1.1 },
        { type: 'window', offset: -5, width: 4.0, height: 1.8, sillHeight: 1.1 },
        { type: 'window', offset: 5, width: 4.0, height: 1.8, sillHeight: 1.1 },
        { type: 'window', offset: 14, width: 4.0, height: 1.8, sillHeight: 1.1 }
      ]);

      // South Wall (Z = +16)
      this.arch.addWall('x', 0, baseY, this.depth / 2, this.width, this.floorHeight, 0.4, GameMaterials.hospitalWall, [
        { type: 'window', offset: -14, width: 4.0, height: 1.8, sillHeight: 1.1 },
        { type: 'window', offset: 5, width: 4.0, height: 1.8, sillHeight: 1.1 },
        { type: 'window', offset: 14, width: 4.0, height: 1.8, sillHeight: 1.1 }
      ]);

      // East Wall (X = +21)
      this.arch.addWall('z', this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.4, GameMaterials.hospitalWall, [
        { type: 'window', offset: -9, width: 4.0, height: 1.8, sillHeight: 1.1 },
        { type: 'window', offset: 0, width: 4.0, height: 1.8, sillHeight: 1.1 },
        { type: 'window', offset: 9, width: 4.0, height: 1.8, sillHeight: 1.1 }
      ]);

      // West Wall (Entrance Side X = -21)
      if (f === 0) {
        this.arch.addWall('z', -this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.4, GameMaterials.hospitalWall, [
          { type: 'window', offset: -10, width: 4.0, height: 1.8, sillHeight: 1.1 },
          { type: 'door', offset: 0, width: 4.8, height: 3.0, hasDoorLeaf: false },
          { type: 'window', offset: 10, width: 4.0, height: 1.8, sillHeight: 1.1 }
        ]);
      } else {
        this.arch.addWall('z', -this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.4, GameMaterials.hospitalWall, [
          { type: 'window', offset: -10, width: 4.0, height: 1.8, sillHeight: 1.1 },
          { type: 'window', offset: 0, width: 5.0, height: 1.8, sillHeight: 1.1 },
          { type: 'window', offset: 10, width: 4.0, height: 1.8, sillHeight: 1.1 }
        ]);
      }
    }
  }

  buildEmergencyEntrance() {
    // Solid West ER Entry Threshold Apron flush with Floor 1 (y = 0.50 top) so doors have zero gap
    this.arch.addSolidBox(-this.width / 2 - 0.6, 0.15, 0, 1.4, 0.3, 6.2, GameMaterials.hospitalTileFloor, true, false);
    // Ambulance Bay Canopy & Columns
    this.arch.addSolidBox(-this.width / 2 - 4, 3.5, 0, 8, 0.35, 11, GameMaterials.concreteDark, false);
    this.arch.addSolidBox(-this.width / 2 - 7.8, 3.5, 0, 0.4, 0.5, 11.2, GameMaterials.medicalCrossRed, false);

    const pillarGeo = new THREE.CylinderGeometry(0.22, 0.25, 3.5, 10);
    for (const pz of [-4.8, 4.8]) {
      const p = new THREE.Mesh(pillarGeo, GameMaterials.concreteGrey);
      p.position.set(-this.width / 2 - 7.2, 1.75, pz);
      p.castShadow = false;
      this.group.add(p);
      this.arch.registerBoxCollider(-this.width / 2 - 7.2, 1.75, pz, 0.5, 3.5, 0.5);
    }

    // Illuminated Signage Banner
    const signTex = ProceduralTextures.createSignTexture('METRO GENERAL HOSPITAL', '#1a2026', '#ff4d4d', 'EMERGENCY / TRAUMA CENTER');
    const signMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.2, 7.0),
      new THREE.MeshLambertMaterial({ map: signTex })
    );
    signMesh.position.set(-this.width / 2 - 8.05, 3.6, 0);
    signMesh.rotation.y = -Math.PI / 2;
    // Rotate plane properly to face West (-X)
    const signFace = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 1.1),
      new THREE.MeshLambertMaterial({ map: signTex, emissive: 0x330808, emissiveIntensity: 0.4 })
    );
    signFace.rotation.y = -Math.PI / 2;
    signFace.position.set(-this.width / 2 - 8.02, 3.55, 0);
    this.group.add(signFace);

    // Jammed half-open automatic sliding glass doors (center 2.6m open for walkthrough)
    for (const dz of [-2.0, 2.0]) {
      const glassDoor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 1.4), GameMaterials.glassSmoked);
      glassDoor.position.set(-this.width / 2, 1.45, dz);
      this.group.add(glassDoor);
      this.arch.registerBoxCollider(-this.width / 2, 1.45, dz, 0.14, 2.9, 1.4, 'hospital_door_glass');
    }
  }

  buildFloor1TriageLobby() {
    // Triage Reception Desk
    this.arch.addSolidBox(-12, 0.55, -5.5, 1.0, 1.1, 5.5, GameMaterials.hospitalWall);
    this.arch.addSolidBox(-12, 1.13, -5.5, 1.2, 0.08, 5.7, GameMaterials.marbleCounterTop, false);
    // Glass partition
    const glassGuard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 5.2), GameMaterials.glassClean);
    glassGuard.position.set(-12, 1.65, -5.5);
    this.group.add(glassGuard);
    this.arch.registerBoxCollider(-12, 1.65, -5.5, 0.12, 1.0, 5.2, 'hospital_triage_glass');

    // Triage Desk Monitors
    for (const mz of [-6.8, -4.2]) {
      this.arch.addSolidBox(-11.8, 1.38, mz, 0.1, 0.36, 0.5, GameMaterials.computerMonitor, false);
      this.arch.addSolidBox(-11.86, 1.38, mz, 0.02, 0.3, 0.45, GameMaterials.computerScreenGlow, false);
    }

    // Waiting Room Chairs (2 Rows facing reception)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        this.createWaitingChair(-16.5 + col * 1.1, 0.3, 5.0 + row * 2.2);
      }
    }

    // Lobby Ceiling Lights (CC0 Wheelchairs & Triage Equipment added via WorldDecorator)
    this.arch.addCeilingLight(-15, this.floorHeight, 0, true, 0xe8f4ff, 2.2, 18);
    this.arch.addCeilingLight(-4, this.floorHeight, 0, true, 0xe8f4ff, 1.8, 16);

    // Blood trail near ER door
    const blood = new THREE.Mesh(new THREE.CircleGeometry(1.5, 10), GameMaterials.driedBlood);
    blood.rotation.x = -Math.PI / 2;
    blood.position.set(-16, 0.31, -0.5);
    this.group.add(blood);
  }

  createWaitingChair(x: number, y: number, z: number) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2c4b6e });
    this.arch.addSolidBox(x, y + 0.45, z, 0.55, 0.07, 0.52, mat, false);
    this.arch.addSolidBox(x, y + 0.72, z - 0.23, 0.55, 0.45, 0.06, mat, false);
    for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), GameMaterials.metalDark);
      leg.position.set(x + lx, y + 0.225, z + lz);
      this.group.add(leg);
    }
  }

  createWheelchair(x: number, y: number, z: number) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), GameMaterials.metalDark);
    seat.position.y = 0.5;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.06), GameMaterials.metalDark);
    back.position.set(0, 0.8, -0.25);
    g.add(back);
    for (const sx of [-0.32, 0.32]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 16), GameMaterials.metalDark);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(sx, 0.34, -0.05);
      g.add(wheel);
    }
    g.position.set(x, y, z);
    g.rotation.y = 0.4;
    this.group.add(g);
  }

  buildFloor1Pharmacy() {
    // North Wing Pharmacy (X: -8..+12, Z: -16..-3)
    // West dividing wall
    this.arch.addWall('z', -8, 0, -9.5, 13, this.floorHeight, 0.25, GameMaterials.hospitalWall, [
      { type: 'door', offset: 3.5, width: 1.8, doorMat: GameMaterials.hospitalDoor }
    ]);
    // South corridor wall with open Pharmacy doorway at X = 2!
    this.arch.addWall('x', 2, 0, -3, 20, this.floorHeight, 0.25, GameMaterials.hospitalWall, [
      { type: 'door', offset: -2.0, width: 2.2, doorMat: GameMaterials.hospitalDoor }
    ]);
    // East dividing wall
    this.arch.addWall('z', 12, 0, -9.5, 13, this.floorHeight, 0.25, GameMaterials.hospitalWall);

    // Pharmacy Shelves stocked with colorful medicine bottles
    for (let i = 0; i < 3; i++) {
      this.createMedicineShelf(4.0, 0.3, -6.5 - i * 3.0, 7.5);
    }

    // Dispensing Counter & Medical Refrigerator
    this.arch.addSolidBox(-3.5, 0.55, -8.5, 1.0, 1.1, 4.5, GameMaterials.pharmacyCabinet);
    this.arch.addSolidBox(10.8, 1.05, -13.5, 1.1, 2.1, 1.3, GameMaterials.porcelainWhite);
    const fridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.9), GameMaterials.glassClean);
    fridgeGlass.position.set(10.22, 1.15, -13.5);
    this.group.add(fridgeGlass);

    this.arch.addCeilingLight(2, this.floorHeight, -9, true, 0xd8f0ff, 2.0, 14);
  }

  createMedicineShelf(x: number, y: number, z: number, length: number) {
    const h = 2.3;
    for (const px of [-length / 2, length / 2]) {
      this.arch.addSolidBox(x + px, y + h / 2, z, 0.08, h, 0.65, GameMaterials.pharmacyCabinet, false);
    }
    for (let t = 0; t < 4; t++) {
      const ty = y + 0.35 + t * 0.55;
      this.arch.addSolidBox(x, ty, z, length, 0.05, 0.6, GameMaterials.pharmacyCabinet, false);
      const count = 9;
      for (let b = 0; b < count; b++) {
        const bx = x - length / 2 + 0.4 + b * ((length - 0.8) / count);
        const bottleMat = b % 3 === 0 ? GameMaterials.medicineBottleOrange : (b % 3 === 1 ? GameMaterials.medicineBottleBlue : GameMaterials.porcelainWhite);
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), bottleMat);
        bottle.position.set(bx, ty + 0.11, z + (b % 2 === 0 ? 0.1 : -0.1));
        this.group.add(bottle);
      }
    }
    this.arch.registerBoxCollider(x, y + h / 2, z, length, h, 0.65);
  }

  buildFloor1InpatientWards() {
    // South-East Ward (X: +3..+21, Z: +3..+16)
    // Corridor wall with 2 real open doorways into Ward!
    this.arch.addWall('x', 12, 0, 3, 18, this.floorHeight, 0.25, GameMaterials.hospitalWall, [
      { type: 'door', offset: -5.5, width: 2.2, doorMat: GameMaterials.hospitalDoor },
      { type: 'door', offset: 4.5, width: 2.2, doorMat: GameMaterials.hospitalDoor }
    ]);
    // West divider wall separating Ward from Stairwell
    this.arch.addWall('z', 3, 0, 9.5, 13, this.floorHeight, 0.25, GameMaterials.hospitalWall);

    const beds = [
      { x: 7.5, z: 6.5 },
      { x: 7.5, z: 12.5 },
      { x: 16.5, z: 6.5 },
      { x: 16.5, z: 12.5 }
    ];

    for (const bp of beds) {
      // Realistic CC0 Hospital Beds placed right between IV stands & bedside monitors in WorldDecorator
      this.createIVDripStand(bp.x - 1.1, 0.3, bp.z - 0.7);
      this.createBedsideMonitor(bp.x + 1.1, 0.3, bp.z - 0.7);
      // Privacy Curtain divider
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), GameMaterials.privacyCurtain);
      curtain.position.set(bp.x, 1.9, bp.z + 1.8);
      this.group.add(curtain);
    }

    // Emergency Trauma Bay curtains & IV stands in North-West / South-East Floor 2 bays
    for (const ex of [-16.0, -11.5]) {
      this.createIVDripStand(ex - 0.9, 0.3, 12.2);
      this.createBedsideMonitor(ex + 0.9, 0.3, 12.2);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), GameMaterials.privacyCurtain);
      curtain.rotation.y = Math.PI / 2;
      curtain.position.set(ex + 1.7, 1.9, 13.0);
      this.group.add(curtain);
    }

    // Floor 2 Recovery Ward IV Stands & Bedside Monitors (paired with 3 CC0 beds in WorldDecorator)
    const y2 = this.floorHeight + 0.15;
    for (const rx of [6.0, 12.0, 18.0]) {
      this.createIVDripStand(rx - 0.95, y2, 12.0);
      this.createBedsideMonitor(rx + 0.95, y2, 12.0);
    }

    // Mobile Gurney in Central Corridor
    this.createGurney(5, 0.3, 0);
    this.arch.addCeilingLight(12, this.floorHeight, 9.5, true, 0xe8f4ff, 2.0, 16);
    this.arch.addCeilingLight(12, this.floorHeight * 2, 11.0, true, 0xe8f4ff, 1.8, 16);
  }

  createMedicalBed(x: number, y: number, z: number) {
    this.arch.addSolidBox(x, y + 0.25, z, 1.25, 0.45, 2.25, GameMaterials.medicalBedFrame);
    this.arch.addSolidBox(x, y + 0.6, z - 1.08, 1.25, 0.55, 0.08, GameMaterials.metalDark, false);
    this.arch.addSolidBox(x, y + 0.55, z, 1.15, 0.2, 2.1, GameMaterials.medicalMattress, false);
    this.arch.addSolidBox(x, y + 0.7, z - 0.78, 0.75, 0.12, 0.42, GameMaterials.medicalPillow, false);
  }

  createIVDripStand(x: number, y: number, z: number) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.06, 6), GameMaterials.metalDark);
    base.position.set(x, y + 0.03, z);
    this.group.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 6), GameMaterials.ivPoleMetal);
    pole.position.set(x, y + 1.0, z);
    this.group.add(pole);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.06), GameMaterials.ivBagPlastic);
    bag.position.set(x + 0.1, y + 1.78, z);
    this.group.add(bag);
  }

  createBedsideMonitor(x: number, y: number, z: number) {
    this.arch.addSolidBox(x, y + 0.4, z, 0.48, 0.8, 0.48, GameMaterials.pharmacyCabinet);
    this.arch.addSolidBox(x, y + 0.96, z, 0.36, 0.28, 0.1, GameMaterials.computerMonitor, false);
    this.arch.addSolidBox(x, y + 0.96, z + 0.055, 0.3, 0.2, 0.02, GameMaterials.computerScreenGlow, false);
  }

  createGurney(x: number, y: number, z: number) {
    this.arch.addSolidBox(x, y + 0.55, z, 2.1, 0.14, 0.9, GameMaterials.medicalMattress);
    for (const [dx, dz] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 6), GameMaterials.ivPoleMetal);
      leg.position.set(x + dx, y + 0.24, z + dz);
      this.group.add(leg);
    }
  }

  buildFloor2SurgeryAndOffices() {
    const y2 = this.floorHeight + 0.15;
    // Operating Room Partition (North-East)
    this.arch.addWall('x', 9, this.floorHeight, -2, 24, this.floorHeight, 0.25, GameMaterials.hospitalWall, [
      { type: 'door', offset: -4, width: 2.2, doorMat: GameMaterials.hospitalDoor }
    ]);

    // Operating Table + Overhead Articulated Surgical Lamp
    this.arch.addSolidBox(11, y2 + 0.45, -9, 2.3, 0.9, 1.0, GameMaterials.medicalBedFrame);
    this.arch.addSolidBox(11, y2 + 0.95, -9, 2.1, 0.12, 0.9, GameMaterials.medicalPillow, false);
    const armDown = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), GameMaterials.ivPoleMetal);
    armDown.position.set(11, this.floorHeight * 2 - 0.6, -9);
    this.group.add(armDown);
    const lampRing = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 0.18, 12), GameMaterials.porcelainWhite);
    lampRing.position.set(11, this.floorHeight * 2 - 1.2, -9);
    this.group.add(lampRing);

    // Doctor's Lounge Desk (West wing)
    this.arch.addSolidBox(-14, y2 + 0.4, -8, 2.2, 0.8, 1.0, GameMaterials.teacherDesk);
    this.arch.addSolidBox(-14, y2 + 0.4, 2, 2.4, 0.75, 0.9, GameMaterials.sofaFabric);

    // Safety Guardrail around Floor 2 stairwell hole
    this.arch.addSolidBox(-6.1, y2 + 0.5, 9, 0.12, 1.0, 10, GameMaterials.ivPoleMetal);
    this.arch.addSolidBox(0.1, y2 + 0.5, 9, 0.12, 1.0, 10, GameMaterials.ivPoleMetal);

    this.arch.addCeilingLight(11, this.floorHeight * 2, -9, true, 0xffffff, 2.4, 16);
    this.arch.addCeilingLight(-12, this.floorHeight * 2, -3, true, 0xfff0d4, 1.8, 16);
  }

  buildStairwells() {
    // Stairwell Walls (open at Z = +3 to corridor on Floor 1 & Floor 2!)
    this.arch.addWall('z', -6, 0, 9.5, 13, this.floorHeight * 2, 0.25, GameMaterials.hospitalWall);
    this.arch.addWall('z', 0, 0, 9.5, 13, this.floorHeight * 2, 0.25, GameMaterials.hospitalWall);

    // Flight 1: Floor 1 -> Floor 2
    this.arch.addStairFlight(-3, 0.3, 4.5, 0, 1, this.floorHeight - 0.15, 9.5, 3.6, 14, GameMaterials.concreteDark);

    // Flight 2: Floor 2 -> Roof (stops at Z = 12.7 leaving spacious 1.5m South top landing)
    this.arch.addStairFlight(-3, this.floorHeight + 0.15, 4.5, 0, 1, this.floorHeight - 0.15, 8.2, 3.6, 14, GameMaterials.concreteDark);
  }

  buildRoofDetails() {
    const roofY = this.floorHeight * 2 + 0.2;
    // Roof Perimeter Parapet
    this.arch.addWall('x', 0, roofY, -this.depth / 2, this.width, 1.1, 0.35, GameMaterials.concreteGrey);
    this.arch.addWall('x', 0, roofY, this.depth / 2, this.width, 1.1, 0.35, GameMaterials.concreteGrey);
    this.arch.addWall('z', -this.width / 2, roofY, 0, this.depth, 1.1, 0.35, GameMaterials.concreteGrey);
    this.arch.addWall('z', this.width / 2, roofY, 0, this.depth, 1.1, 0.35, GameMaterials.concreteGrey);

    // Stairwell Roof Bulkhead Shed (open door on West side at South landing Z=13.4!)
    this.arch.addWall('z', -6.2, roofY, 9, 10.4, 2.8, 0.3, GameMaterials.concreteDark, [
      { type: 'door', offset: 4.1, width: 2.0, doorMat: GameMaterials.fireDoorRed }
    ]);
    this.arch.addWall('z', 0.2, roofY, 9, 10.4, 2.8, 0.3, GameMaterials.concreteDark);
    this.arch.addWall('x', -3, roofY, 14.2, 6.4, 2.8, 0.3, GameMaterials.concreteDark);
    this.arch.addWall('x', -3, roofY, 3.8, 6.4, 2.8, 0.3, GameMaterials.concreteDark);
    this.arch.addSolidBox(-3, roofY + 2.9, 9, 6.8, 0.25, 10.8, GameMaterials.concreteDark);

    // Giant Illuminated Red Cross Emblem on Roof Center
    const cx = 0;
    const cy = roofY + 2.6;
    const cz = -6;
    this.arch.addSolidBox(cx, cy, cz, 1.0, 3.6, 1.0, GameMaterials.medicalCrossRed, true);
    this.arch.addSolidBox(cx, cy, cz, 3.6, 1.0, 1.0, GameMaterials.medicalCrossRed, true);

    // Industrial HVAC Units on Roof
    for (const rx of [10, 15]) {
      this.arch.addSolidBox(rx, roofY + 0.85, -8, 2.6, 1.7, 2.2, GameMaterials.metalRusted);
    }
  }
}
