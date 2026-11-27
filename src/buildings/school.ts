import * as THREE from 'three';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { ArchBuilder } from './archBuilder.ts';
import { ProceduralTextures } from '../textures.ts';
import { PooledLightManager } from '../lightPool.ts';

export class SchoolBuilding {
  group = new THREE.Group();
  arch: ArchBuilder;

  posX = 0;
  posZ = -140;
  width = 50;
  depth = 36;
  floorHeight = 4.0;

  constructor(scene: THREE.Scene, player: PlayerController, lightPool: PooledLightManager) {
    this.group.position.set(this.posX, 0.2, this.posZ);
    this.arch = new ArchBuilder(this.group, player, this.posX, 0.2, this.posZ, lightPool);

    this.buildStructure();
    this.buildEntranceAndClockTower();
    this.buildFloor1HallwayAndLockers();
    this.buildFloor1Classroom1();
    this.buildFloor1ScienceLab();
    this.buildFloor1PrincipalOffice();
    this.buildFloor2LibraryAndRooms();
    this.buildStairs();
    this.arch.finalizeMergedMeshes();

    scene.add(this.group);
  }

  buildStructure() {
    // Ground Floor Slab
    this.arch.addSolidBox(0, 0.15, 0, this.width, 0.3, this.depth, GameMaterials.schoolFloor, true, false);

    // 2nd Floor Slab (leaving clean stairwell cutout at X: -3.5..+3.5, Z: -16..-4)
    this.arch.addSolidBox(-14.25, this.floorHeight, 0, 21.5, 0.3, this.depth, GameMaterials.schoolFloor);
    this.arch.addSolidBox(14.25, this.floorHeight, 0, 21.5, 0.3, this.depth, GameMaterials.schoolFloor);
    this.arch.addSolidBox(0, this.floorHeight, 7, 7, 0.3, 22, GameMaterials.schoolFloor);
    this.arch.addSolidBox(0, this.floorHeight, -17, 7, 0.3, 2, GameMaterials.schoolFloor);

    // Roof Slab (leaving stairwell cutout at X: -3.5..+3.5, Z: -14.3..-4 so roof has spacious North landing!)
    const roofY = this.floorHeight * 2;
    this.arch.addSolidBox(-14.55, roofY, 0, 22.1, 0.45, this.depth + 1.2, GameMaterials.brickBrown);
    this.arch.addSolidBox(14.55, roofY, 0, 22.1, 0.45, this.depth + 1.2, GameMaterials.brickBrown);
    this.arch.addSolidBox(0, roofY, 7.3, 7, 0.45, 22.6, GameMaterials.brickBrown);
    this.arch.addSolidBox(0, roofY, -16.45, 7, 0.45, 4.3, GameMaterials.brickBrown);

    // Roof Perimeter Parapet Walls
    const roofBaseY = roofY + 0.22;
    this.arch.addWall('x', 0, roofBaseY, -this.depth / 2, this.width, 1.05, 0.35, GameMaterials.schoolBrick);
    this.arch.addWall('x', 0, roofBaseY, this.depth / 2, this.width, 1.05, 0.35, GameMaterials.schoolBrick);
    this.arch.addWall('z', -this.width / 2, roofBaseY, 0, this.depth, 1.05, 0.35, GameMaterials.schoolBrick);
    this.arch.addWall('z', this.width / 2, roofBaseY, 0, this.depth, 1.05, 0.35, GameMaterials.schoolBrick);

    // Roof Stairwell Bulkhead Shed with open West doorway at North landing (Z = -15.0)
    this.arch.addWall('z', -3.6, roofBaseY, -10, 12.6, 2.8, 0.28, GameMaterials.concreteDark, [
      { type: 'door', offset: -5.0, width: 2.2, height: 2.35, doorMat: GameMaterials.fireDoorRed }
    ]);
    this.arch.addWall('z', 3.6, roofBaseY, -10, 12.6, 2.8, 0.28, GameMaterials.concreteDark);
    this.arch.addWall('x', 0, roofBaseY, -16.3, 7.2, 2.8, 0.28, GameMaterials.concreteDark);
    this.arch.addWall('x', 0, roofBaseY, -3.7, 7.2, 2.8, 0.28, GameMaterials.concreteDark);
    this.arch.addSolidBox(0, roofBaseY + 2.92, -10, 7.6, 0.25, 13.0, GameMaterials.concreteDark);

    // Exterior Brick Walls across both floors with large classic school windows
    for (let f = 0; f < 2; f++) {
      const baseY = f * this.floorHeight;

      // North Wall (Z = -18)
      this.arch.addWall('x', 0, baseY, -this.depth / 2, this.width, this.floorHeight, 0.45, GameMaterials.schoolBrick, [
        { type: 'window', offset: -18, width: 3.6, height: 1.9, sillHeight: 1.0 },
        { type: 'window', offset: -9, width: 3.6, height: 1.9, sillHeight: 1.0 },
        { type: 'window', offset: 9, width: 3.6, height: 1.9, sillHeight: 1.0 },
        { type: 'window', offset: 18, width: 3.6, height: 1.9, sillHeight: 1.0 }
      ]);

      // East Wall (X = +25)
      this.arch.addWall('z', this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.45, GameMaterials.schoolBrick, [
        { type: 'window', offset: -10, width: 3.6, height: 1.9, sillHeight: 1.0 },
        { type: 'window', offset: 0, width: 3.6, height: 1.9, sillHeight: 1.0 },
        { type: 'window', offset: 10, width: 3.6, height: 1.9, sillHeight: 1.0 }
      ]);

      // West Wall (X = -25)
      this.arch.addWall('z', -this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.45, GameMaterials.schoolBrick, [
        { type: 'window', offset: -10, width: 3.6, height: 1.9, sillHeight: 1.0 },
        { type: 'window', offset: 0, width: 3.6, height: 1.9, sillHeight: 1.0 },
        { type: 'window', offset: 10, width: 3.6, height: 1.9, sillHeight: 1.0 }
      ]);

      // South Front Wall (Z = +18) with wide Entrance Portal on Floor 1
      if (f === 0) {
        this.arch.addWall('x', 0, baseY, this.depth / 2, this.width, this.floorHeight, 0.45, GameMaterials.schoolBrick, [
          { type: 'window', offset: -18, width: 3.6, height: 1.9, sillHeight: 1.0 },
          { type: 'window', offset: -10, width: 3.6, height: 1.9, sillHeight: 1.0 },
          { type: 'door', offset: 0, width: 5.2, height: 3.1, hasDoorLeaf: false },
          { type: 'window', offset: 10, width: 3.6, height: 1.9, sillHeight: 1.0 },
          { type: 'window', offset: 18, width: 3.6, height: 1.9, sillHeight: 1.0 }
        ]);
      } else {
        this.arch.addWall('x', 0, baseY, this.depth / 2, this.width, this.floorHeight, 0.45, GameMaterials.schoolBrick, [
          { type: 'window', offset: -18, width: 3.6, height: 1.9, sillHeight: 1.0 },
          { type: 'window', offset: -10, width: 3.6, height: 1.9, sillHeight: 1.0 },
          { type: 'window', offset: 0, width: 4.4, height: 2.1, sillHeight: 0.9 },
          { type: 'window', offset: 10, width: 3.6, height: 1.9, sillHeight: 1.0 },
          { type: 'window', offset: 18, width: 3.6, height: 1.9, sillHeight: 1.0 }
        ]);
      }
    }
  }

  buildEntranceAndClockTower() {
    // Wide Stone Steps + Flush Upper Threshold Landing (top = 0.50m) so doors never float
    this.arch.addSolidBox(0, 0.15, this.depth / 2 + 0.55, 6.6, 0.3, 1.2, GameMaterials.concreteGrey);
    for (let s = 0; s < 3; s++) {
      this.arch.addSolidBox(0, 0.1 + s * 0.12, this.depth / 2 + 2.2 - s * 0.7, 9 - s * 0.5, 0.16, 0.75, GameMaterials.concreteGrey);
    }

    // Entrance Portico Columns & Pediment
    for (const cx of [-3.2, 3.2]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.6, 10), GameMaterials.concreteLight);
      col.position.set(cx, 1.9, this.depth / 2 + 1.4);
      col.castShadow = false;
      this.group.add(col);
      this.arch.registerBoxCollider(cx, 1.9, this.depth / 2 + 1.4, 0.6, 3.6, 0.6);
    }
    this.arch.addSolidBox(0, 3.85, this.depth / 2 + 1.0, 8.2, 0.5, 2.2, GameMaterials.concreteLight, false);

    // School Sign Banner
    const signTex = ProceduralTextures.createSignTexture('CIVIC CENTRAL ACADEMY', '#5c261c', '#f5e6cc', 'ESTABLISHED 1968');
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 0.95),
      new THREE.MeshLambertMaterial({ map: signTex })
    );
    signMesh.position.set(0, 3.85, this.depth / 2 + 2.12);
    this.group.add(signMesh);

    // Rooftop Clock & Bell Steeple
    const roofY = this.floorHeight * 2 + 0.2;
    this.arch.addSolidBox(0, roofY + 2.2, this.depth / 2 - 4, 6.4, 4.4, 6.4, GameMaterials.schoolBrick, true);
    const clockFace = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 16), GameMaterials.porcelainWhite);
    clockFace.rotation.x = Math.PI / 2;
    clockFace.position.set(0, roofY + 2.5, this.depth / 2 - 0.75);
    this.group.add(clockFace);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.8, 4.2, 4), GameMaterials.houseRoofShingle);
    spire.rotation.y = Math.PI / 4;
    spire.position.set(0, roofY + 6.5, this.depth / 2 - 4);
    this.group.add(spire);
  }

  buildFloor1HallwayAndLockers() {
    // Left Hallway Wall (X = -3.5) with Open Doorways into Classroom 1 (Z = +10) & Principal Office (Z = -6)!
    this.arch.addWall('z', -3.5, 0, 2, 32, this.floorHeight, 0.25, GameMaterials.concreteLight, [
      { type: 'door', offset: -8, width: 2.0, doorMat: GameMaterials.woodLight },
      { type: 'door', offset: 8, width: 2.2, doorMat: GameMaterials.woodLight }
    ]);

    // Right Hallway Wall (X = +3.5) with Open Doorway into Science Lab (Z = +10) & Infirmary/Storage (Z = -6)!
    this.arch.addWall('z', 3.5, 0, 2, 32, this.floorHeight, 0.25, GameMaterials.concreteLight, [
      { type: 'door', offset: -8, width: 2.0, doorMat: GameMaterials.woodLight },
      { type: 'door', offset: 8, width: 2.2, doorMat: GameMaterials.woodLight }
    ]);

    // Rows of Blue Metal Student Lockers (avoiding doorway offsets)
    for (const zPos of [1.0, 2.2, 3.4, 4.6, 5.8, 13.5, 14.7, 15.9]) {
      this.createStudentLocker(-3.1, 0.3, zPos);
      this.createStudentLocker(3.1, 0.3, zPos);
    }

    this.arch.addCeilingLight(0, this.floorHeight, 10, true, 0xfff3d9, 2.0, 16);
    this.arch.addCeilingLight(0, this.floorHeight, -1, true, 0xfff3d9, 1.8, 16);
  }

  createStudentLocker(x: number, y: number, z: number) {
    this.arch.addSolidBox(x, y + 0.95, z, 0.45, 1.9, 0.5, GameMaterials.schoolLockerBlue);
    this.arch.addSolidBox(x + (x < 0 ? 0.23 : -0.23), y + 1.05, z, 0.02, 0.14, 0.04, GameMaterials.ivPoleMetal, false);
  }

  buildFloor1Classroom1() {
    // Classroom 1 (West: X: -25..-3.5, Z: -3..+18)
    this.arch.addWall('x', -14.25, 0, -3, 21.5, this.floorHeight, 0.25, GameMaterials.concreteLight, [
      { type: 'door', offset: 6.0, width: 1.8, doorMat: GameMaterials.woodLight }
    ]);

    // Large Green Chalkboard with Chalk Scrawl & Wooden Frame on North wall (Z = -2.75)
    this.arch.addSolidBox(-14, 1.9, -2.82, 5.4, 1.9, 0.08, GameMaterials.chalkboardWoodFrame, false);
    this.arch.addSolidBox(-14, 1.9, -2.76, 5.1, 1.65, 0.04, GameMaterials.chalkboardGreen, false);

    // Teacher's Desk (CC0 Teacher Chair, 9x School Desks & 9x School Chairs placed via WorldDecorator)
    this.arch.addSolidBox(-14, 0.72, 0.4, 2.2, 0.85, 1.05, GameMaterials.teacherDesk);

    this.arch.addCeilingLight(-14, this.floorHeight, 7, true, 0xfff5e0, 2.0, 16);
  }

  createStudentDeskAndChair(x: number, y: number, z: number) {
    // Desk top
    this.arch.addSolidBox(x, y + 0.76, z, 1.35, 0.06, 0.65, GameMaterials.studentDeskWood, false);
    // Steel frame legs
    for (const [dx, dz] of [[-0.58, -0.25], [0.58, -0.25], [-0.58, 0.25], [0.58, 0.25]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.74, 6), GameMaterials.studentChairLegs);
      leg.position.set(x + dx, y + 0.37, z + dz);
      this.group.add(leg);
    }
    // Book on desk
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.36), GameMaterials.schoolLockerBlue);
    book.position.set(x - 0.2, y + 0.81, z);
    book.rotation.y = 0.2;
    this.group.add(book);

    this.createSchoolChair(x, y, z + 0.68, Math.PI);
    this.arch.registerBoxCollider(x, y + 0.4, z + 0.2, 1.35, 0.8, 1.2);
  }

  createSchoolChair(x: number, y: number, z: number, rotY: number) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.48), GameMaterials.studentDeskWood);
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), GameMaterials.studentDeskWood);
    back.position.set(0, 0.74, -0.21);
    g.add(back);
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.44, 6), GameMaterials.studentChairLegs);
      leg.position.set(lx, 0.22, lz);
      g.add(leg);
    }
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.group.add(g);
  }

  buildFloor1ScienceLab() {
    // Classroom 2: Science Laboratory (East: X: +3.5..+25, Z: -3..+18)
    this.arch.addWall('x', 14.25, 0, -3, 21.5, this.floorHeight, 0.25, GameMaterials.concreteLight, [
      { type: 'door', offset: -6.0, width: 1.8, doorMat: GameMaterials.woodLight }
    ]);

    // Chalkboard on North Wall
    this.arch.addSolidBox(14, 1.9, -2.82, 5.0, 1.8, 0.08, GameMaterials.chalkboardWoodFrame, false);
    this.arch.addSolidBox(14, 1.9, -2.76, 4.7, 1.55, 0.04, GameMaterials.chalkboardGreen, false);

    // 3 Long Slate-Topped Science Lab Tables with Faucets & Beakers
    for (let i = 0; i < 3; i++) {
      const tz = 3.0 + i * 4.2;
      this.arch.addSolidBox(14.5, 0.7, tz, 9.0, 0.8, 1.2, GameMaterials.pharmacyCabinet);
      this.arch.addSolidBox(14.5, 1.13, tz, 9.2, 0.08, 1.3, GameMaterials.metalDark, false);

      // Faucets & Glass Beakers
      for (const fx of [11.5, 17.5]) {
        const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), GameMaterials.ivPoleMetal);
        faucet.position.set(fx, 1.34, tz);
        this.group.add(faucet);

        const flask = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 8), GameMaterials.ivBagPlastic);
        flask.position.set(fx + 0.5, 1.28, tz + 0.2);
        this.group.add(flask);
      }
    }

    this.arch.addCeilingLight(14, this.floorHeight, 7, true, 0xe8f8ff, 2.0, 16);
  }

  buildFloor1PrincipalOffice() {
    // North-West Administration & Principal's Office (CC0 Swivel Chair & PC placed via WorldDecorator)
    this.arch.addSolidBox(-16, 0.7, -11, 2.4, 0.8, 1.2, GameMaterials.teacherDesk);

    // Filing Cabinets & Bookshelf
    for (let i = 0; i < 3; i++) {
      this.arch.addSolidBox(-23.8, 1.2, -7 - i * 1.1, 0.8, 1.8, 0.65, GameMaterials.concreteDark);
    }

    // North-East Infirmary & Supply Storage (X: +3.5..+25, Z: -18..-3)
    this.arch.addSolidBox(15, 0.72, -11, 2.8, 0.85, 1.1, GameMaterials.medicalBedFrame);
    this.arch.addSolidBox(23.5, 1.15, -12, 0.8, 2.0, 2.6, GameMaterials.pharmacyCabinet);

    this.arch.addCeilingLight(-15, this.floorHeight, -10, true, 0xffe4b5, 1.8, 14);
    this.arch.addCeilingLight(15, this.floorHeight, -10, true, 0xe8f4ff, 1.6, 14);
  }

  buildFloor2LibraryAndRooms() {
    const y2 = this.floorHeight + 0.15;
    // Upper Hallway Railing overlooking Stairwell
    this.arch.addSolidBox(-3.5, y2 + 0.5, -10, 0.12, 1.0, 12, GameMaterials.ivPoleMetal);
    this.arch.addSolidBox(3.5, y2 + 0.5, -10, 0.12, 1.0, 12, GameMaterials.ivPoleMetal);

    // School Library (West Wing Floor 2)
    for (let i = 0; i < 3; i++) {
      const bx = -20 + i * 5.0;
      this.arch.addSolidBox(bx, y2 + 1.15, -6, 0.7, 2.3, 6.0, GameMaterials.teacherDesk);
      // Reading Table
      this.arch.addSolidBox(bx + 2.5, y2 + 0.4, 7.0, 2.6, 0.8, 1.2, GameMaterials.studentDeskWood);
    }

    // Floor 2 East Study & Computer Wing (X: +3.5..+25)
    for (let row = 0; row < 2; row++) {
      this.arch.addSolidBox(14.5, y2 + 0.4, -4 + row * 8, 9.0, 0.8, 1.2, GameMaterials.studentDeskWood);
    }

    this.arch.addCeilingLight(-14, this.floorHeight * 2, 0, true, 0xffeacc, 2.0, 18);
    this.arch.addCeilingLight(14, this.floorHeight * 2, 0, true, 0xffeacc, 2.0, 18);
  }

  buildStairs() {
    // Wide Central School Staircase: Floor 1 -> Floor 2 -> Roof (Flight 2 stops at Z = -14.3 for 2m North landing)
    this.arch.addStairFlight(0, 0.3, -4.5, 0, -1, this.floorHeight - 0.15, 11.0, 5.2, 16, GameMaterials.concreteDark);
    this.arch.addStairFlight(0, this.floorHeight + 0.15, -4.5, 0, -1, this.floorHeight - 0.15, 9.8, 5.2, 16, GameMaterials.concreteDark);
  }
}
