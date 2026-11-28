import * as THREE from 'three';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { ArchBuilder } from './archBuilder.ts';
import { PooledLightManager } from '../lightPool.ts';

export class House2BHKBuilding {
  group = new THREE.Group();
  arch: ArchBuilder;

  posX = -85;
  posZ = 60;
  width = 18;
  depth = 14;
  wallHeight = 3.4;

  constructor(scene: THREE.Scene, player: PlayerController, lightPool: PooledLightManager) {
    this.group.position.set(this.posX, 0.2, this.posZ);
    this.arch = new ArchBuilder(this.group, player, this.posX, 0.2, this.posZ, lightPool);

    this.buildStructure();
    this.buildFrontPorchAndRoof();
    this.buildLivingRoom();
    this.buildKitchen();
    this.buildMasterBedroom();
    this.buildSecondBedroom();
    this.buildBathroom();
    this.arch.finalizeMergedMeshes();

    scene.add(this.group);
  }

  buildStructure() {
    // Hardwood Plank Floor
    this.arch.addSolidBox(0, 0.125, 0, this.width, 0.25, this.depth, GameMaterials.houseWoodFloor, true, false);

    // Stone Foundation Skirting
    this.arch.addSolidBox(0, 0.1, 0, this.width + 0.3, 0.22, this.depth + 0.3, GameMaterials.concreteDark, false);

    // Interior Ceiling Slab
    this.arch.addSolidBox(0, this.wallHeight, 0, this.width + 0.6, 0.25, this.depth + 0.6, GameMaterials.houseWallInterior);

    // Exterior Walls with Framed Mullioned Windows & Front Entry Door
    // North Back Wall (Z = -7): Windows in Master Bed, Bathroom, Guest Bed
    this.arch.addWall('x', 0, 0, -this.depth / 2, this.width, this.wallHeight, 0.32, GameMaterials.houseWallCream, [
      { type: 'window', offset: -5.5, width: 2.2, height: 1.4, sillHeight: 0.9 },
      { type: 'window', offset: 1.0, width: 1.2, height: 1.0, sillHeight: 1.3 },
      { type: 'window', offset: 6.0, width: 2.0, height: 1.4, sillHeight: 0.9 }
    ]);

    // West Side Wall (X = -9): Window in Living Room & Master Bed
    this.arch.addWall('z', -this.width / 2, 0, 0, this.depth, this.wallHeight, 0.32, GameMaterials.houseWallCream, [
      { type: 'window', offset: -3.5, width: 2.0, height: 1.4, sillHeight: 0.9 },
      { type: 'window', offset: 3.5, width: 2.4, height: 1.4, sillHeight: 0.9 }
    ]);

    // East Side Wall (X = +9): Window in Kitchen & Guest Bed
    this.arch.addWall('z', this.width / 2, 0, 0, this.depth, this.wallHeight, 0.32, GameMaterials.houseWallCream, [
      { type: 'window', offset: -3.5, width: 2.0, height: 1.4, sillHeight: 0.9 },
      { type: 'window', offset: 3.5, width: 2.2, height: 1.3, sillHeight: 1.0 }
    ]);

    // South Front Wall (Z = +7): Front Doorway at X = -3.0 (CC0 Door installed via WorldDecorator)
    this.arch.addWall('x', 0, 0, this.depth / 2, this.width, this.wallHeight, 0.32, GameMaterials.houseWallCream, [
      { type: 'window', offset: -6.4, width: 2.2, height: 1.4, sillHeight: 0.9 },
      { type: 'door', offset: -3.0, width: 1.7, height: 2.45, hasDoorLeaf: false },
      { type: 'window', offset: 4.5, width: 2.4, height: 1.4, sillHeight: 0.9 }
    ]);
  }

  buildFrontPorchAndRoof() {
    // Timber Front Porch Deck raised flush with interior floor (top = 0.45m -> zero door gap!)
    this.arch.addSolidBox(-3.0, 0.125, this.depth / 2 + 1.4, 8.2, 0.25, 2.8, GameMaterials.woodPlanks);
    // Porch Roof Overhang & Posts
    this.arch.addSolidBox(-3.0, 2.85, this.depth / 2 + 1.5, 8.6, 0.22, 3.0, GameMaterials.houseRoofShingle, false);
    for (const px of [-6.8, 0.8]) {
      this.arch.addSolidBox(px, 1.45, this.depth / 2 + 2.6, 0.16, 2.7, 0.16, GameMaterials.porcelainWhite);
    }

    // Authentic Pitched Shingle Gable Roof (True extruded triangular prism strictly above wallHeight!)
    const roofOverhangZ = 0.7;
    const halfD = this.depth / 2 + roofOverhangZ;
    const peakH = 2.9;
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-halfD, 0);
    roofShape.lineTo(0, peakH);
    roofShape.lineTo(halfD, 0);
    roofShape.closePath();

    const extrudeGeo = new THREE.ExtrudeGeometry(roofShape, {
      depth: this.width + 1.2,
      bevelEnabled: false
    });
    // Rotate so extrusion runs along X axis from -(width+1.2)/2 to +(width+1.2)/2
    extrudeGeo.rotateY(Math.PI / 2);
    extrudeGeo.translate(-(this.width + 1.2) / 2, this.wallHeight + 0.12, 0);

    const roofMesh = new THREE.Mesh(extrudeGeo, GameMaterials.houseRoofShingle);
    roofMesh.castShadow = false;
    roofMesh.receiveShadow = false;
    this.group.add(roofMesh);

    // Stepped colliders matching the pitched gable roof slope (for accurate bullet/grenade impacts)
    const roofW = this.width + 1.2;
    this.arch.registerBoxCollider(0, this.wallHeight + 0.55, 0, roofW, 0.85, this.depth + 1.2, 'house_roof');
    this.arch.registerBoxCollider(0, this.wallHeight + 1.45, 0, roofW, 0.95, this.depth * 0.62, 'house_roof');
    this.arch.registerBoxCollider(0, this.wallHeight + 2.35, 0, roofW, 0.9, this.depth * 0.28, 'house_roof');

    // Brick Chimney on West Roof Slope
    this.arch.addSolidBox(-6.5, this.wallHeight + 2.4, -2.0, 1.1, 2.4, 1.1, GameMaterials.brickRed, true);
  }

  buildLivingRoom() {
    // Living Room (South-West: X: -9..0, Z: 0..7)
    // Area Rug
    const rug = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.02, 2.5), new THREE.MeshLambertMaterial({ color: 0x733a24 }));
    rug.position.set(-5.2, 0.26, 3.5);
    this.group.add(rug);

    // TV Stand (Flat-screen CC0 TV mounted via WorldDecorator)
    this.arch.addSolidBox(-8.4, 0.5, 3.6, 0.5, 0.5, 2.2, GameMaterials.teacherDesk);

    // Warm Living Room Ceiling Light
    this.arch.addCeilingLight(-4.5, this.wallHeight, 3.5, true, 0xffdfb0, 1.6, 10);
  }

  buildKitchen() {
    // Kitchen & Dining (South-East: X: 0..+9, Z: 0..+7)
    // Open Hallway Archway partition wall at X = 0 (starts at Z=1.5 so Z=0..1.5 central corridor is wide open!)
    this.arch.addWall('z', 0, 0, 4.3, 5.4, this.wallHeight, 0.2, GameMaterials.houseWallInterior, [
      { type: 'door', offset: -0.3, width: 3.4, height: 2.7, hasDoorLeaf: false }
    ]);

    // Tiled Kitchen Floor Patch
    const kFloor = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.02, 6.6), GameMaterials.hospitalTileFloor);
    kFloor.position.set(4.5, 0.26, 3.5);
    this.group.add(kFloor);

    // Kitchen Counter with Marble Top & Stainless Sink
    this.arch.addSolidBox(8.3, 0.68, 3.2, 0.85, 0.85, 4.4, GameMaterials.kitchenCounter);
    this.arch.addSolidBox(8.3, 1.13, 3.2, 0.9, 0.06, 4.5, GameMaterials.marbleCounterTop, false);
    // Sink basin + faucet
    this.arch.addSolidBox(8.3, 1.15, 2.4, 0.55, 0.05, 0.7, GameMaterials.metalDark, false);
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), GameMaterials.ivPoleMetal);
    faucet.position.set(8.55, 1.28, 2.4);
    this.group.add(faucet);
    this.arch.registerBoxCollider(8.55, 1.28, 2.4, 0.12, 0.28, 0.12, 'house_prop');

    // Overhead Kitchen Wall Cabinets (Fridge & Electric Stove added via CC0 models)
    this.arch.addSolidBox(8.55, 2.45, 3.2, 0.45, 0.75, 4.2, GameMaterials.woodPlanks, false);

    // Wooden Dining Table (Chairs added via CC0 models)
    this.arch.addSolidBox(4.0, 0.62, 3.8, 1.5, 0.75, 1.1, GameMaterials.woodPlanks);

    this.arch.addCeilingLight(4.5, this.wallHeight, 3.5, true, 0xfff0d4, 1.5, 10);
  }

  buildMasterBedroom() {
    // Master Bedroom (North-West: X: -9..-1, Z: -7..0)
    // Wall along Z = 0 with WIDE FRAMED OPEN DOORWAY at X = -2.8! (CC0 interior door placed via WorldDecorator)
    this.arch.addWall('x', -5, 0, 0, 8, this.wallHeight, 0.2, GameMaterials.houseWallInterior, [
      { type: 'door', offset: 2.2, width: 1.75, height: 2.4, hasDoorLeaf: false }
    ]);
    // Dividing wall between Master Bedroom and Bathroom at X = -1
    this.arch.addWall('z', -1, 0, -3.5, 7, this.wallHeight, 0.2, GameMaterials.houseWallInterior);

    // Master Bed (CC0 Double Bed placed cleanly at -6.6, -4.4 via WorldDecorator)
    // Nightstands & Warm Lamps
    for (const nz of [-5.8, -3.0]) {
      this.arch.addSolidBox(-8.4, 0.5, nz, 0.5, 0.52, 0.5, GameMaterials.woodPlanks);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.22, 8), GameMaterials.lightGlowYellow);
      shade.position.set(-8.4, 0.92, nz);
      this.group.add(shade);
      this.arch.registerBoxCollider(-8.4, 0.92, nz, 0.32, 0.22, 0.32, 'house_prop');
    }

    // Tall Wardrobe Closet
    this.arch.addSolidBox(-2.4, 1.25, -6.3, 1.8, 2.05, 0.75, GameMaterials.woodPlanks);

    this.arch.addCeilingLight(-5, this.wallHeight, -3.5, true, 0xffdfb0, 1.2, 9);
  }

  buildSecondBedroom() {
    // Second Bedroom (North-East: X: +3..+9, Z: -7..0)
    // Wall along Z = 0 with WIDE FRAMED OPEN DOORWAY at X = +4.6! (CC0 interior door placed via WorldDecorator)
    this.arch.addWall('x', 6, 0, 0, 6, this.wallHeight, 0.2, GameMaterials.houseWallInterior, [
      { type: 'door', offset: -1.4, width: 1.75, height: 2.4, hasDoorLeaf: false }
    ]);
    // Dividing wall between Bathroom and Second Bedroom at X = +3
    this.arch.addWall('z', 3, 0, -3.5, 7, this.wallHeight, 0.2, GameMaterials.houseWallInterior);

    // Study Desk (CC0 Single Bed & School Chair added via WorldDecorator)
    this.arch.addSolidBox(4.8, 0.62, -6.3, 1.5, 0.75, 0.7, GameMaterials.studentDeskWood);

    this.arch.addCeilingLight(6, this.wallHeight, -3.5, true, 0xffeacc, 1.2, 9);
  }

  buildBathroom() {
    // Center North Bathroom (X: -1..+3, Z: -7..0)
    // Wall along Z = 0 with WIDE FRAMED OPEN DOORWAY at X = +1.0! (CC0 interior door placed via WorldDecorator)
    this.arch.addWall('x', 1, 0, 0, 4, this.wallHeight, 0.2, GameMaterials.houseWallInterior, [
      { type: 'door', offset: 0, width: 1.55, height: 2.4, hasDoorLeaf: false }
    ]);

    // Tiled Bathroom Floor
    const bFloor = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.02, 6.8), GameMaterials.hospitalTileFloor);
    bFloor.position.set(1, 0.26, -3.5);
    this.group.add(bFloor);

    // Vanity Mirror (CC0 Bathtub, Toilet & Vanity Sink placed cleanly via WorldDecorator)
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.6), GameMaterials.glassClean);
    mirror.position.set(-0.86, 1.5, -4.1);
    this.group.add(mirror);
    this.arch.registerBoxCollider(-0.86, 1.5, -4.1, 0.06, 0.85, 0.6, 'house_prop');

    this.arch.addCeilingLight(1, this.wallHeight, -3.5, true, 0xe8f4ff, 1.3, 8);
  }
}
