import * as THREE from 'three';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { ArchBuilder } from './archBuilder.ts';
import { PooledLightManager } from '../lightPool.ts';

export class Tower10Building {
  group = new THREE.Group();
  arch: ArchBuilder;

  posX = 0;
  posZ = 0;
  width = 24;
  depth = 24;
  totalFloors = 10;
  floorHeight = 3.6; // 36m total height

  constructor(scene: THREE.Scene, player: PlayerController, lightPool: PooledLightManager) {
    this.group.position.set(this.posX, 0.2, this.posZ);
    this.arch = new ArchBuilder(this.group, player, this.posX, 0.2, this.posZ, lightPool);

    this.buildStructuralCore();
    this.buildLobbyFloor();
    this.buildIntermediateFloors();
    this.buildSwitchbackFireStairwell();
    this.buildRooftopHelipad();
    this.arch.finalizeMergedMeshes();

    scene.add(this.group);
  }

  buildStructuralCore() {
    const totalHeight = this.totalFloors * this.floorHeight;

    // 4 Concrete Corner Piers
    const colSize = 1.6;
    for (const cx of [-this.width / 2 + colSize / 2, this.width / 2 - colSize / 2]) {
      for (const cz of [-this.depth / 2 + colSize / 2, this.depth / 2 - colSize / 2]) {
        this.arch.addSolidBox(cx, totalHeight / 2, cz, colSize, totalHeight, colSize, GameMaterials.towerConcreteColumn);
      }
    }

    // Exterior Curtain-Wall Facades across all 10 floors
    for (let f = 0; f < this.totalFloors; f++) {
      const baseY = f * this.floorHeight;
      if (f === 0) {
        // Ground floor: Tall architectural lobby glass + Wide South & West open portals
        this.arch.addWall('x', 0, baseY, -this.depth / 2, this.width - 3.2, this.floorHeight, 0.3, GameMaterials.towerFacadeDark, [
          { type: 'window', offset: -6, width: 6.0, height: 2.8, sillHeight: 0.3 },
          { type: 'window', offset: 6, width: 6.0, height: 2.8, sillHeight: 0.3 }
        ]);
        this.arch.addWall('x', 0, baseY, this.depth / 2, this.width - 3.2, this.floorHeight, 0.3, GameMaterials.towerFacadeDark, [
          { type: 'window', offset: -6.5, width: 4.5, height: 2.8, sillHeight: 0.3 },
          { type: 'door', offset: 0, width: 4.4, height: 3.1, hasDoorLeaf: false },
          { type: 'window', offset: 6.5, width: 4.5, height: 2.8, sillHeight: 0.3 }
        ]);
        this.arch.addWall('z', -this.width / 2, baseY, 0, this.depth - 3.2, this.floorHeight, 0.3, GameMaterials.towerFacadeDark, [
          { type: 'window', offset: -6, width: 5.0, height: 2.8, sillHeight: 0.3 },
          { type: 'door', offset: 0, width: 3.4, height: 3.0, hasDoorLeaf: false },
          { type: 'window', offset: 6, width: 5.0, height: 2.8, sillHeight: 0.3 }
        ]);
        this.arch.addWall('z', this.width / 2, baseY, 0, this.depth - 3.2, this.floorHeight, 0.3, GameMaterials.towerFacadeDark, [
          { type: 'window', offset: -6, width: 6.0, height: 2.8, sillHeight: 0.3 },
          { type: 'window', offset: 6, width: 6.0, height: 2.8, sillHeight: 0.3 }
        ]);
      } else {
        // Upper Floors: Curtain-wall glass strips with spandrel panels
        const winSet = [
          { type: 'window' as const, offset: -5.5, width: 8.5, height: 2.2, sillHeight: 0.85 },
          { type: 'window' as const, offset: 5.5, width: 8.5, height: 2.2, sillHeight: 0.85 }
        ];
        this.arch.addWall('x', 0, baseY, -this.depth / 2, this.width - 3.2, this.floorHeight, 0.25, GameMaterials.towerFacadeDark, winSet);
        this.arch.addWall('x', 0, baseY, this.depth / 2, this.width - 3.2, this.floorHeight, 0.25, GameMaterials.towerFacadeDark, winSet);
        this.arch.addWall('z', -this.width / 2, baseY, 0, this.depth - 3.2, this.floorHeight, 0.25, GameMaterials.towerFacadeDark, winSet);
        this.arch.addWall('z', this.width / 2, baseY, 0, this.depth - 3.2, this.floorHeight, 0.25, GameMaterials.towerFacadeDark, winSet);
      }
    }
  }

  buildLobbyFloor() {
    // Granite Lobby Floor
    this.arch.addSolidBox(0, 0.15, 0, this.width, 0.3, this.depth, GameMaterials.policeGranite, true, false);

    // Architectural Entrance Threshold Steps & Glass Canopy (South & West portals flush with Lobby y=0.50)
    this.arch.addSolidBox(0, 0.15, this.depth / 2 + 0.55, 5.2, 0.3, 1.2, GameMaterials.policeGranite, true, false);
    this.arch.addSolidBox(-this.width / 2 - 0.55, 0.15, 0, 1.2, 0.3, 4.2, GameMaterials.policeGranite, true, false);
    this.arch.addSolidBox(0, 3.35, this.depth / 2 + 2.0, 7.5, 0.25, 4.0, GameMaterials.metalDark, false);
    const canopyGlass = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.06, 3.6), GameMaterials.glassSmoked);
    canopyGlass.position.set(0, 3.35, this.depth / 2 + 2.0);
    this.group.add(canopyGlass);

    // Reception Desk
    this.arch.addSolidBox(-2.5, 0.65, 2.5, 5.2, 1.05, 1.3, GameMaterials.policeGranite);
    this.arch.addSolidBox(-2.5, 1.2, 2.5, 5.4, 0.07, 1.4, GameMaterials.marbleCounterTop, false);

    // Security Turnstiles (CC0 Lobby Sofa & Reception PC added via WorldDecorator)
    for (const tx of [-7.5, 1.8]) {
      this.arch.addSolidBox(tx, 0.65, 2.5, 1.4, 1.0, 0.85, GameMaterials.metalDark);
    }

    // 3 Elevator Bays on North Wall (Z = -11.4)
    for (let i = 0; i < 3; i++) {
      const ex = -6.0 + i * 3.8;
      this.arch.addSolidBox(ex, 1.5, -11.4, 2.2, 2.6, 0.2, GameMaterials.ivPoleMetal);
      // Center seam & Out of Order warning strip
      this.arch.addSolidBox(ex, 1.4, -11.28, 2.0, 0.16, 0.05, GameMaterials.yellowHazard, false);
    }

    this.arch.addCeilingLight(-3, this.floorHeight, 2, true, 0xfff0d4, 2.2, 18);
    this.arch.addCeilingLight(-3, this.floorHeight, -6, true, 0xfff0d4, 1.8, 16);
  }

  buildIntermediateFloors() {
    // Floors 1 through 9
    for (let f = 1; f < this.totalFloors; f++) {
      const y = f * this.floorHeight;

      // Floor Slabs cleanly surrounding Stairwell Core (Core is at X: 4..10, Z: -5..5)
      // West Wing Slab (X: -12..+4)
      this.arch.addSolidBox(-4, y, 0, 16, 0.28, this.depth, GameMaterials.officeCarpet);
      // North Strip (X: +4..+12, Z: -12..-5)
      this.arch.addSolidBox(8, y, -8.5, 8, 0.28, 7, GameMaterials.officeCarpet);
      // South Strip (X: +4..+12, Z: +5..+12)
      this.arch.addSolidBox(8, y, 8.5, 8, 0.28, 7, GameMaterials.officeCarpet);
      // East Strip (X: +10..+12, Z: -5..+5)
      this.arch.addSolidBox(11, y, 0, 2, 0.28, 10, GameMaterials.officeCarpet);

      // Populate floors with authentic office & conference setups
      if (f % 3 === 0) {
        this.buildConferenceFloor(y);
      } else {
        this.buildOfficeFloor(y, f);
      }

      // Practical hallway light near stairwell exit on every floor
      this.arch.addCeilingLight(1.5, y + this.floorHeight, -2.5, f % 2 === 1, 0xffeacc, 1.5, 14);
    }
  }

  buildOfficeFloor(y: number, _floorIdx: number) {
    // Open-plan desks (CC0 monitors, keyboards, laptops & swivel chairs placed cleanly by WorldDecorator)
    const spots = [
      { x: -7, z: -6 },
      { x: -7, z: 0 },
      { x: -7, z: 6 },
      { x: -2, z: 6 }
    ];
    for (const s of spots) {
      this.arch.addSolidBox(s.x, y + 0.52, s.z, 1.8, 0.75, 0.85, GameMaterials.teacherDesk);
    }

    // Filing cabinets / Water cooler
    this.arch.addSolidBox(-10.8, y + 1.0, -8.5, 0.8, 1.8, 1.2, GameMaterials.concreteDark);
    this.arch.addSolidBox(1.5, y + 0.7, 9.0, 0.5, 1.1, 0.5, GameMaterials.porcelainWhite);
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 10), GameMaterials.ivBagPlastic);
    jug.position.set(1.5, y + 1.48, 9.0);
    this.group.add(jug);
  }

  buildConferenceFloor(y: number) {
    // Executive boardroom table (CC0 swivel chairs, books & projector placed cleanly by WorldDecorator)
    this.arch.addSolidBox(-5, y + 0.52, 0, 2.4, 0.78, 6.4, GameMaterials.teacherDesk);
    this.arch.addCeilingLight(-5, y + this.floorHeight, 0, true, 0xffffff, 2.0, 15);
  }

  buildSwitchbackFireStairwell() {
    // Central Stairwell Core: X: +4..+10, Z: -5..+5 (height 36m)
    const totalHeight = this.totalFloors * this.floorHeight;

    // East, North, South solid core walls
    this.arch.addSolidBox(10, totalHeight / 2, 0, 0.3, totalHeight, 10, GameMaterials.concreteDark);
    this.arch.addSolidBox(7, totalHeight / 2, -5, 6, totalHeight, 0.3, GameMaterials.concreteDark);
    this.arch.addSolidBox(7, totalHeight / 2, 5, 6, totalHeight, 0.3, GameMaterials.concreteDark);

    // West Core Wall with REAL OPEN FIRE DOORWAY on EVERY SINGLE FLOOR (f = 0..9)!
    for (let f = 0; f < this.totalFloors; f++) {
      const baseY = f * this.floorHeight;
      this.arch.addWall('z', 4, baseY, 0, 10, this.floorHeight, 0.3, GameMaterials.concreteDark, [
        { type: 'door', offset: -3.2, width: 2.0, height: 2.4, doorMat: GameMaterials.fireDoorRed }
      ]);

      // 1. Floor Landing at North end (X: 4.1..9.9, Z: -4.8..-1.5)
      if (f > 0) {
        this.arch.addSolidBox(7, baseY, -3.15, 5.7, 0.28, 3.3, GameMaterials.concreteDark);
      }

      // 2. Flight A (West Lane X = 5.5): climbs South from Z = -1.5 to +2.8 (+1.8m rise)
      const flightAStartY = f === 0 ? baseY + 0.30 : baseY + 0.14;
      const flightARise = f === 0 ? 1.64 : 1.8;
      this.arch.addStairFlight(5.5, flightAStartY, -1.5, 0, 1, flightARise, 4.3, 2.6, 9, GameMaterials.stairMetal);

      // 3. Mid-Floor Switchback Landing (X: 4.1..9.9, Z: +2.8..+4.85) at baseY + 1.8m
      this.arch.addSolidBox(7, baseY + 1.8, 3.82, 5.7, 0.28, 2.05, GameMaterials.concreteDark);

      // 4. Flight B (East Lane X = 8.5): climbs North from Z = +2.8 to -1.5 (+1.8m rise to next floor!)
      this.arch.addStairFlight(8.5, baseY + 1.94, 2.8, 0, -1, 1.8, 4.3, 2.6, 9, GameMaterials.stairMetal);
    }
  }

  buildRooftopHelipad() {
    const roofY = this.totalFloors * this.floorHeight; // Y = 36m

    // Main Rooftop Deck Slab (leaving stairwell hole at X: 4..10, Z: -1.5..+5)
    this.arch.addSolidBox(-4, roofY, 0, 16.4, 0.45, this.depth + 0.6, GameMaterials.towerHelipadGrey);
    this.arch.addSolidBox(8, roofY, -8.5, 8.4, 0.45, 7.2, GameMaterials.towerHelipadGrey);
    this.arch.addSolidBox(8, roofY, 8.5, 8.4, 0.45, 7.2, GameMaterials.towerHelipadGrey);
    this.arch.addSolidBox(11.1, roofY, 0, 2.2, 0.45, 10, GameMaterials.towerHelipadGrey);
    // Stairwell top landing
    this.arch.addSolidBox(7, roofY, -3.15, 5.7, 0.45, 3.3, GameMaterials.towerHelipadGrey);

    // Rooftop Perimeter Concrete Parapet + Steel Safety Rail
    this.arch.addWall('x', 0, roofY + 0.2, -this.depth / 2, this.width, 1.15, 0.35, GameMaterials.concreteGrey);
    this.arch.addWall('x', 0, roofY + 0.2, this.depth / 2, this.width, 1.15, 0.35, GameMaterials.concreteGrey);
    this.arch.addWall('z', -this.width / 2, roofY + 0.2, 0, this.depth, 1.15, 0.35, GameMaterials.concreteGrey);
    this.arch.addWall('z', this.width / 2, roofY + 0.2, 0, this.depth, 1.15, 0.35, GameMaterials.concreteGrey);

    // Rooftop Stairwell Penthouse Bulkhead with OPEN DOORWAY onto Helipad!
    const shedBaseY = roofY + 0.2;
    this.arch.addWall('z', 4, shedBaseY, 0, 10.2, 3.0, 0.3, GameMaterials.concreteDark, [
      { type: 'door', offset: -3.2, width: 2.0, height: 2.4, doorMat: GameMaterials.fireDoorRed }
    ]);
    this.arch.addWall('z', 10, shedBaseY, 0, 10.2, 3.0, 0.3, GameMaterials.concreteDark);
    this.arch.addWall('x', 7, shedBaseY, -5, 6.2, 3.0, 0.3, GameMaterials.concreteDark);
    this.arch.addWall('x', 7, shedBaseY, 5, 6.2, 3.0, 0.3, GameMaterials.concreteDark);
    this.arch.addSolidBox(7, shedBaseY + 3.1, 0, 6.6, 0.25, 10.6, GameMaterials.concreteDark);

    // High-Res Helipad Pad Decal on Roof West Center
    const helipad = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 11.5), GameMaterials.towerHelipadPad);
    helipad.rotation.x = -Math.PI / 2;
    helipad.position.set(-4.2, roofY + 0.24, 0.5);
    helipad.receiveShadow = false;
    this.group.add(helipad);

    // Rooftop Industrial HVAC Chillers with Steel Casing, Louver Vents & Exhaust Fan
    for (const rz of [-8.0, -3.5]) {
      this.arch.addSolidBox(-8.8, roofY + 1.0, rz, 2.6, 1.5, 1.8, GameMaterials.concreteGrey);
      this.arch.addSolidBox(-8.8, roofY + 1.0, rz + 0.92, 2.0, 1.0, 0.05, GameMaterials.metalDark, false);
      this.arch.addSolidBox(-7.48, roofY + 1.0, rz, 0.05, 1.0, 1.3, GameMaterials.metalDark, false);
      const fanRing = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.22, 14), GameMaterials.metalDark);
      fanRing.position.set(-8.8, roofY + 1.84, rz);
      this.group.add(fanRing);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.14), GameMaterials.ivPoleMetal);
      blade.position.set(-8.8, roofY + 1.88, rz);
      blade.rotation.y = 0.6;
      this.group.add(blade);
    }

    // Subtle Doorway Light on Penthouse Entrance
    this.arch.addCeilingLight(3.2, shedBaseY + 2.6, -3.2, true, 0xffd28a, 3.0, 14);

    // Emergency Supply Crate near Spawn
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x454d32 });
    this.arch.addSolidBox(-1.2, roofY + 0.55, 8.5, 1.2, 0.65, 0.8, crateMat);

    // Tall Steel Radio Communications Mast + Blinking Red Aviation Beacon
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 13.0, 8), GameMaterials.metalDark);
    mast.position.set(7, shedBaseY + 3.2 + 6.5, 0);
    this.group.add(mast);
    this.arch.registerBoxCollider(7, shedBaseY + 3.2 + 6.5, 0, 0.42, 13.0, 0.42, 'tower_mast');

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 2.0 })
    );
    beacon.position.set(7, shedBaseY + 3.2 + 13.0, 0);
    this.group.add(beacon);
  }
}
