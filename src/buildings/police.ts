import * as THREE from 'three';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { ArchBuilder } from './archBuilder.ts';
import { ProceduralTextures } from '../textures.ts';
import { PooledLightManager } from '../lightPool.ts';

export class PoliceStationBuilding {
  group = new THREE.Group();
  arch: ArchBuilder;

  posX = 105;
  posZ = -35;
  width = 36;
  depth = 28;
  floorHeight = 4.0;

  constructor(scene: THREE.Scene, player: PlayerController, lightPool: PooledLightManager) {
    this.group.position.set(this.posX, 0.2, this.posZ);
    this.arch = new ArchBuilder(this.group, player, this.posX, 0.2, this.posZ, lightPool);

    this.buildStructure();
    this.buildEntrance();
    this.buildFloor1LobbyAndDesk();
    this.buildFloor1HoldingCells();
    this.buildFloor1DispatchBullpen();
    this.buildFloor1Armory();
    this.buildFloor2BriefingAndCaptain();
    this.buildStairwell();
    this.arch.finalizeMergedMeshes();

    scene.add(this.group);
  }

  buildStructure() {
    // Ground Floor Slab
    this.arch.addSolidBox(0, 0.15, 0, this.width, 0.3, this.depth, GameMaterials.policeGranite, true, false);

    // 2nd Floor Slab (leaving stairwell hole at X: -6..0, Z: 4..13)
    this.arch.addSolidBox(-12, this.floorHeight, 0, 12, 0.3, this.depth, GameMaterials.policeGranite);
    this.arch.addSolidBox(9, this.floorHeight, 0, 18, 0.3, this.depth, GameMaterials.policeGranite);
    this.arch.addSolidBox(-3, this.floorHeight, -5, 6, 0.3, 18, GameMaterials.policeGranite);
    this.arch.addSolidBox(-3, this.floorHeight, 13.5, 6, 0.3, 1, GameMaterials.policeGranite);

    // Roof Slab (leaving stairwell hole at X: -6..0, Z: 4..12.2 with spacious South landing Z: 12.2..14.5)
    const roofSlabY = this.floorHeight * 2;
    this.arch.addSolidBox(-12.25, roofSlabY, 0, 12.5, 0.45, this.depth + 1.0, GameMaterials.concreteDark);
    this.arch.addSolidBox(9.25, roofSlabY, 0, 18.5, 0.45, this.depth + 1.0, GameMaterials.concreteDark);
    this.arch.addSolidBox(-3, roofSlabY, -5.25, 6, 0.45, 18.5, GameMaterials.concreteDark);
    this.arch.addSolidBox(-3, roofSlabY, 13.35, 6, 0.45, 2.3, GameMaterials.concreteDark);

    // Roof Parapet, Stairwell Bulkhead & Radio Comms Tower
    const roofY = this.floorHeight * 2 + 0.22;
    this.arch.addWall('x', 0, roofY, -this.depth / 2, this.width, 1.0, 0.3, GameMaterials.concreteDark);
    this.arch.addWall('x', 0, roofY, this.depth / 2, this.width, 1.0, 0.3, GameMaterials.concreteDark);
    this.arch.addWall('z', -this.width / 2, roofY, 0, this.depth, 1.0, 0.3, GameMaterials.concreteDark);
    this.arch.addWall('z', this.width / 2, roofY, 0, this.depth, 1.0, 0.3, GameMaterials.concreteDark);

    // Rooftop Stairwell Bulkhead Shed with open West doorway at South landing (Z = 12.8)
    this.arch.addWall('z', -6.1, roofY, 8.6, 10.6, 2.8, 0.28, GameMaterials.concreteDark, [
      { type: 'door', offset: 4.1, width: 2.0, height: 2.35, doorMat: GameMaterials.fireDoorRed }
    ]);
    this.arch.addWall('z', 0.1, roofY, 8.6, 10.6, 2.8, 0.28, GameMaterials.concreteDark);
    this.arch.addWall('x', -3, roofY, 13.8, 6.2, 2.8, 0.28, GameMaterials.concreteDark);
    this.arch.addWall('x', -3, roofY, 3.4, 6.2, 2.8, 0.28, GameMaterials.concreteDark);
    this.arch.addSolidBox(-3, roofY + 2.9, 8.6, 6.6, 0.25, 11.0, GameMaterials.concreteDark);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 8.5, 8), GameMaterials.metalDark);
    mast.position.set(0, roofY + 4.25, 0);
    this.group.add(mast);
    this.arch.registerBoxCollider(0, roofY + 4.25, 0, 0.36, 8.5, 0.36, 'police_mast');

    // Exterior Reinforced Walls with Windows across both floors
    for (let f = 0; f < 2; f++) {
      const baseY = f * this.floorHeight;
      this.arch.addWall('x', 0, baseY, -this.depth / 2, this.width, this.floorHeight, 0.45, GameMaterials.policeBlueWall, [
        { type: 'window', offset: -11, width: 3.2, height: 1.5, sillHeight: 1.3 },
        { type: 'window', offset: -3, width: 3.2, height: 1.5, sillHeight: 1.3 },
        { type: 'window', offset: 11, width: 3.2, height: 1.5, sillHeight: 1.3 }
      ]);

      this.arch.addWall('x', 0, baseY, this.depth / 2, this.width, this.floorHeight, 0.45, GameMaterials.policeBlueWall, [
        { type: 'window', offset: -11, width: 3.2, height: 1.5, sillHeight: 1.3 },
        { type: 'window', offset: -3, width: 3.2, height: 1.5, sillHeight: 1.3 }
      ]);

      this.arch.addWall('z', this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.45, GameMaterials.policeBlueWall, [
        { type: 'window', offset: -8, width: 3.0, height: 1.5, sillHeight: 1.3 },
        { type: 'window', offset: 8, width: 3.0, height: 1.5, sillHeight: 1.3 }
      ]);

      if (f === 0) {
        this.arch.addWall('z', -this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.45, GameMaterials.policeBlueWall, [
          { type: 'window', offset: -8, width: 3.2, height: 1.5, sillHeight: 1.3 },
          { type: 'door', offset: 0, width: 4.4, height: 3.0, hasDoorLeaf: false },
          { type: 'window', offset: 8, width: 3.2, height: 1.5, sillHeight: 1.3 }
        ]);
      } else {
        this.arch.addWall('z', -this.width / 2, baseY, 0, this.depth, this.floorHeight, 0.45, GameMaterials.policeBlueWall, [
          { type: 'window', offset: -8, width: 3.2, height: 1.5, sillHeight: 1.3 },
          { type: 'window', offset: 0, width: 3.8, height: 1.6, sillHeight: 1.2 },
          { type: 'window', offset: 8, width: 3.2, height: 1.5, sillHeight: 1.3 }
        ]);
      }
    }
  }

  buildEntrance() {
    // Concrete Entrance Portico flush with Precinct Floor 1 (top = 0.50m) so doors sit flush
    this.arch.addSolidBox(-this.width / 2 - 2.0, 0.15, 0, 4.0, 0.3, 7.0, GameMaterials.concreteDark);
    this.arch.addSolidBox(-this.width / 2 - 2.0, 3.4, 0, 4.2, 0.35, 7.5, GameMaterials.concreteDark, false);

    // Precinct Sign Banner
    const signTex = ProceduralTextures.createSignTexture('METRO PRECINCT 04', '#0f2238', '#f5c542', 'POLICE DEPARTMENT');
    const signFace = new THREE.Mesh(
      new THREE.PlaneGeometry(6.6, 1.05),
      new THREE.MeshLambertMaterial({ map: signTex })
    );
    signFace.rotation.y = -Math.PI / 2;
    signFace.position.set(-this.width / 2 - 4.12, 3.45, 0);
    this.group.add(signFace);

    // Blue Precinct Beacons flanking door
    const blueBeaconMat = new THREE.MeshLambertMaterial({
      color: 0x2288ff,
      emissive: 0x1155cc,
      emissiveIntensity: 1.8
    });
    for (const bz of [-2.8, 2.8]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), blueBeaconMat);
      lamp.position.set(-this.width / 2 - 0.35, 2.8, bz);
      this.group.add(lamp);
    }
  }

  buildFloor1LobbyAndDesk() {
    // Security Metal Detector Archway inside door
    this.arch.addSolidBox(-15.5, 1.2, -1.0, 0.25, 2.2, 0.25, GameMaterials.metalDark);
    this.arch.addSolidBox(-15.5, 1.2, 1.0, 0.25, 2.2, 0.25, GameMaterials.metalDark);
    this.arch.addSolidBox(-15.5, 2.35, 0, 0.35, 0.25, 2.25, GameMaterials.metalDark, false);

    // Bulletproof Front Reception Counter (with walk-around corridor at North & South!)
    this.arch.addSolidBox(-10.5, 0.65, 0, 1.1, 1.15, 6.2, GameMaterials.policeGranite);
    const glassShield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 6.0), GameMaterials.glassSmoked);
    glassShield.position.set(-10.5, 1.85, 0);
    this.group.add(glassShield);
    this.arch.registerBoxCollider(-10.5, 1.85, 0, 0.14, 1.3, 6.0, 'police_glass');

    // Visitor Waiting Bench
    this.arch.addSolidBox(-14.5, 0.45, 7.5, 0.65, 0.45, 3.4, GameMaterials.woodPlanks);

    this.arch.addCeilingLight(-14, this.floorHeight, 0, true, 0xddeeff, 2.0, 16);
  }

  buildFloor1HoldingCells() {
    // North-East Holding Cell Block (X: +4..+18, Z: -14..-2)
    this.arch.addWall('x', 11, 0, -2, 14, this.floorHeight, 0.25, GameMaterials.concreteDark, [
      { type: 'door', offset: -4, width: 2.0, doorMat: GameMaterials.metalDark }
    ]);
    // Dividing solid concrete wall between Cell A & Cell B
    this.arch.addWall('x', 11, 0, -8, 14, this.floorHeight, 0.25, GameMaterials.concreteDark);

    // Front Steel Jail Bars along X = 4 (with open doorway gaps into BOTH cells!)
    for (let i = 0; i < 20; i++) {
      // Leave wide doorway openings into Cell A (i = 4..6) and Cell B (i = 14..16)
      if ((i >= 4 && i <= 6) || (i >= 14 && i <= 16)) continue;
      const zBar = -13.2 + i * 0.55;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.8, 8), GameMaterials.jailBarSteel);
      bar.position.set(4, 2.0, zBar);
      this.group.add(bar);
      this.arch.registerBoxCollider(4, 2.0, zBar, 0.16, 3.8, 0.16);
    }

    // Cell interiors furnished with CC0 Bunk Beds, Stainless Cell Toilets, Sinks & Jail Gates in WorldDecorator
    this.arch.addCeilingLight(11, this.floorHeight, -11, true, 0xffeedd, 1.5, 12);
    this.arch.addCeilingLight(11, this.floorHeight, -5, true, 0xffeedd, 1.5, 12);
  }

  buildFloor1DispatchBullpen() {
    // 4 Detective Workstations (CC0 Monitors, Keyboards & Swivel Chairs placed via WorldDecorator)
    const desks = [
      { x: -4.5, z: -7.5 },
      { x: -4.5, z: -2.0 },
      { x: 0.2, z: -7.5 },
      { x: 0.2, z: -2.0 }
    ];

    for (const d of desks) {
      this.arch.addSolidBox(d.x, 0.68, d.z, 1.7, 0.78, 0.9, GameMaterials.computerDesk);
    }

    // Crime Investigation Cork Evidence Pinboard mounted on partition wall
    const pinBoard = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.9, 0.1), GameMaterials.evidenceBoard);
    pinBoard.position.set(-2.5, 2.0, -13.6);
    this.group.add(pinBoard);

    this.arch.addCeilingLight(-2, this.floorHeight, -5, true, 0xddeeff, 2.2, 16);
  }

  buildFloor1Armory() {
    // Secure Armory in South-East (X: +5..+18, Z: +2..+14)
    this.arch.addWall('x', 11.5, 0, 2, 13, this.floorHeight, 0.25, GameMaterials.concreteDark);
    // West Wall with Open Reinforced Vault Doorway at Z = +7!
    this.arch.addWall('z', 5, 0, 8, 12, this.floorHeight, 0.25, GameMaterials.concreteDark, [
      { type: 'door', offset: -1, width: 2.2, doorMat: GameMaterials.metalDark }
    ]);

    // Heavy Gun Racks stocked with Tactical Rifles & Shotguns
    for (let i = 0; i < 3; i++) {
      const rx = 8.5 + i * 3.0;
      this.arch.addSolidBox(rx, 1.4, 13.2, 2.0, 2.2, 0.45, GameMaterials.armoryGunRack);

      // Detailed Rifles mounted on rack
      for (let g = 0; g < 4; g++) {
        const gx = rx - 0.6 + g * 0.4;
        // Rifle receiver + barrel + stock
        this.arch.addSolidBox(gx, 1.35, 12.92, 0.08, 1.15, 0.14, GameMaterials.weaponMetal, false);
        this.arch.addSolidBox(gx, 2.0, 12.92, 0.04, 0.45, 0.04, GameMaterials.weaponMetal, false);
      }
    }

    // Olive-Drab Ammo Crates stacked neatly
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x3b442a });
    this.arch.addSolidBox(7.2, 0.55, 4.0, 0.9, 0.5, 0.6, crateMat);
    this.arch.addSolidBox(7.2, 1.05, 4.0, 0.85, 0.5, 0.58, crateMat);
    this.arch.addSolidBox(8.4, 0.55, 4.0, 0.9, 0.5, 0.6, crateMat);

    this.arch.addCeilingLight(11.5, this.floorHeight, 8, true, 0xffd28a, 2.0, 14);
  }

  buildFloor2BriefingAndCaptain() {
    const y2 = this.floorHeight + 0.15;
    // Safety Guardrail around Floor 2 stairwell
    this.arch.addSolidBox(-6.1, y2 + 0.5, 8.5, 0.12, 1.0, 9, GameMaterials.ivPoleMetal);
    this.arch.addSolidBox(0.1, y2 + 0.5, 8.5, 0.12, 1.0, 9, GameMaterials.ivPoleMetal);

    // Tactical Briefing Room Map Board (East Wing Floor 2 — CC0 chairs placed via WorldDecorator)
    this.arch.addSolidBox(16.8, y2 + 1.8, -2, 0.1, 2.2, 4.6, GameMaterials.evidenceBoard, false);

    // Captain's Office Desk (West Wing Floor 2)
    this.arch.addSolidBox(-12, y2 + 0.45, -6, 2.4, 0.85, 1.2, GameMaterials.teacherDesk);

    this.arch.addCeilingLight(11, this.floorHeight * 2, -2, true, 0xe8f4ff, 2.0, 18);
    this.arch.addCeilingLight(-11, this.floorHeight * 2, -4, true, 0xffe8c2, 1.8, 16);
  }

  buildStairwell() {
    // Open at Z = +3 to dispatch floor & F2 -> Roof (Flight 2 stops at Z = 12.2 for spacious top landing)
    this.arch.addWall('z', -6, 0, 8.5, 9, this.floorHeight * 2, 0.25, GameMaterials.concreteDark);
    this.arch.addWall('z', 0, 0, 8.5, 9, this.floorHeight * 2, 0.25, GameMaterials.concreteDark);
    this.arch.addStairFlight(-3, 0.3, 4.2, 0, 1, this.floorHeight - 0.15, 8.8, 3.8, 14, GameMaterials.concreteDark);
    this.arch.addStairFlight(-3, this.floorHeight + 0.15, 4.2, 0, 1, this.floorHeight - 0.15, 8.0, 3.8, 14, GameMaterials.concreteDark);
  }
}
