import * as THREE from 'three';
import { ProceduralTextures } from './textures.ts';

const asphaltTex = ProceduralTextures.createAsphalt(14, 14);
const sidewalkTex = ProceduralTextures.createSidewalk(24, 24);
const brickRedTex = ProceduralTextures.createBrick('#7d382d', 6, 3);
const brickSchoolTex = ProceduralTextures.createBrick('#843f2d', 8, 3);
const brickPoliceTex = ProceduralTextures.createBrick('#2a3e54', 6, 3);
const concreteGreyTex = ProceduralTextures.createConcrete('#6e757d', 4, 2);
const concreteDarkTex = ProceduralTextures.createConcrete('#393f47', 4, 2);
const concreteTowerTex = ProceduralTextures.createConcrete('#3c434d', 6, 10);
const hospitalWallTex = ProceduralTextures.createConcrete('#cfd6dc', 6, 2);
const hospitalTileTex = ProceduralTextures.createTileFloor('#d2dae0', '#c2ccd4', 10, 8);
const schoolFloorTex = ProceduralTextures.createTileFloor('#c9b38c', '#bfa67a', 12, 9);
const houseWoodTex = ProceduralTextures.createWoodFloor('#7a4b2a', 5, 4);
const grassTex = ProceduralTextures.createOvergrownGrass(18, 18);

/**
 * Pure MeshLambertMaterial & lightweight material palette optimized for
 * mobile devices and PCs without dedicated GPUs (no PBR specular/bump overhead).
 */
export class GameMaterials {
  static asphalt = new THREE.MeshLambertMaterial({ map: asphaltTex.map });
  static roadMarkingYellow = new THREE.MeshLambertMaterial({ color: 0xd9a724 });
  static roadMarkingWhite = new THREE.MeshLambertMaterial({ color: 0xdadada });
  static sidewalk = new THREE.MeshLambertMaterial({ map: sidewalkTex.map });
  static dirtGround = new THREE.MeshLambertMaterial({ color: 0x302720 });
  static deadGrass = new THREE.MeshLambertMaterial({ map: grassTex.map });
  static curb = new THREE.MeshLambertMaterial({ color: 0x454a52 });

  static concreteGrey = new THREE.MeshLambertMaterial({ map: concreteGreyTex.map });
  static concreteDark = new THREE.MeshLambertMaterial({ map: concreteDarkTex.map });
  static concreteLight = new THREE.MeshLambertMaterial({ color: 0xb0b8bf });
  static brickRed = new THREE.MeshLambertMaterial({ map: brickRedTex.map });
  static brickBrown = new THREE.MeshLambertMaterial({ color: 0x4d3326 });
  static metalDark = new THREE.MeshLambertMaterial({ color: 0x22262c });
  static metalRusted = new THREE.MeshLambertMaterial({ color: 0x5c3c2e });
  static glassSmoked = new THREE.MeshLambertMaterial({ color: 0x2f4354, transparent: true, opacity: 0.45 });
  static glassClean = new THREE.MeshLambertMaterial({ color: 0x99cce6, transparent: true, opacity: 0.38 });
  static woodPlanks = new THREE.MeshLambertMaterial({ color: 0x61412d });
  static woodLight = new THREE.MeshLambertMaterial({ color: 0x96673b });

  static hospitalWall = new THREE.MeshLambertMaterial({ map: hospitalWallTex.map });
  static hospitalTileFloor = new THREE.MeshLambertMaterial({ map: hospitalTileTex.map });
  static hospitalDoor = new THREE.MeshLambertMaterial({ color: 0x5c85b5 });
  static medicalCrossRed = new THREE.MeshLambertMaterial({ color: 0xe84148, emissive: 0x660b0f, emissiveIntensity: 0.6 });
  static medicalBedFrame = new THREE.MeshLambertMaterial({ color: 0xd4d8de });
  static medicalMattress = new THREE.MeshLambertMaterial({ color: 0xeef1f5 });
  static medicalPillow = new THREE.MeshLambertMaterial({ color: 0x4ca683 });
  static privacyCurtain = new THREE.MeshLambertMaterial({ color: 0x58829e, side: THREE.DoubleSide });
  static ivPoleMetal = new THREE.MeshLambertMaterial({ color: 0xc8cfd6 });
  static ivBagPlastic = new THREE.MeshLambertMaterial({ color: 0x82c4ff, transparent: true, opacity: 0.65 });
  static pharmacyCabinet = new THREE.MeshLambertMaterial({ color: 0x2c333d });
  static medicineBottleOrange = new THREE.MeshLambertMaterial({ color: 0xd96b1c });
  static medicineBottleBlue = new THREE.MeshLambertMaterial({ color: 0x1678c2 });

  static schoolBrick = new THREE.MeshLambertMaterial({ map: brickSchoolTex.map });
  static schoolFloor = new THREE.MeshLambertMaterial({ map: schoolFloorTex.map });
  static schoolLockerBlue = new THREE.MeshLambertMaterial({ color: 0x2b6a99 });
  static chalkboardGreen = new THREE.MeshLambertMaterial({ map: ProceduralTextures.createChalkboard() });
  static chalkboardWoodFrame = new THREE.MeshLambertMaterial({ color: 0x5e3c24 });
  static studentDeskWood = new THREE.MeshLambertMaterial({ color: 0xb87e3c });
  static studentChairLegs = new THREE.MeshLambertMaterial({ color: 0x1d232a });
  static teacherDesk = new THREE.MeshLambertMaterial({ color: 0x6b3a1e });

  static policeGranite = new THREE.MeshLambertMaterial({ map: concreteDarkTex.map });
  static policeBlueWall = new THREE.MeshLambertMaterial({ map: brickPoliceTex.map });
  static jailBarSteel = new THREE.MeshLambertMaterial({ color: 0x1a1d21 });
  static jailBench = new THREE.MeshLambertMaterial({ color: 0x454b54 });
  static computerDesk = new THREE.MeshLambertMaterial({ color: 0x333747 });
  static computerMonitor = new THREE.MeshLambertMaterial({ color: 0x121417 });
  static computerScreenGlow = new THREE.MeshLambertMaterial({ color: 0x10a8a4, emissive: 0x0b7572, emissiveIntensity: 0.8 });
  static evidenceBoard = new THREE.MeshLambertMaterial({ map: ProceduralTextures.createEvidenceBoard() });
  static armoryGunRack = new THREE.MeshLambertMaterial({ color: 0x20272e });
  static weaponMetal = new THREE.MeshLambertMaterial({ color: 0x14181d });

  static houseRoofShingle = new THREE.MeshLambertMaterial({ color: 0x313c47 });
  static houseWallCream = new THREE.MeshLambertMaterial({ color: 0xdcdad2 });
  static houseWallInterior = new THREE.MeshLambertMaterial({ color: 0xe6e1d6 });
  static houseWoodFloor = new THREE.MeshLambertMaterial({ map: houseWoodTex.map });
  static sofaFabric = new THREE.MeshLambertMaterial({ color: 0x4c545e });
  static televisionScreen = new THREE.MeshLambertMaterial({ color: 0x0e1012 });
  static kitchenCounter = new THREE.MeshLambertMaterial({ color: 0x4f5b66 });
  static marbleCounterTop = new THREE.MeshLambertMaterial({ color: 0xe4e7ea });
  static bedSheetMaster = new THREE.MeshLambertMaterial({ color: 0x6f4385 });
  static bedSheetGuest = new THREE.MeshLambertMaterial({ color: 0x356c99 });
  static mattressWhite = new THREE.MeshLambertMaterial({ color: 0xeceff1 });
  static porcelainWhite = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });

  static towerConcreteColumn = new THREE.MeshLambertMaterial({ map: concreteTowerTex.map });
  static towerFacadeDark = new THREE.MeshLambertMaterial({ color: 0x252a30 });
  static towerHelipadPad = new THREE.MeshLambertMaterial({ map: ProceduralTextures.createHelipadTexture() });
  static towerHelipadYellow = new THREE.MeshLambertMaterial({ color: 0xe0b128 });
  static towerHelipadGrey = new THREE.MeshLambertMaterial({ map: concreteDarkTex.map });
  static officeCarpet = new THREE.MeshLambertMaterial({ color: 0x404957 });
  static stairMetal = new THREE.MeshLambertMaterial({ color: 0x2d3540 });
  static fireDoorRed = new THREE.MeshLambertMaterial({ color: 0x992b22 });

  static dumpsterGreen = new THREE.MeshLambertMaterial({ color: 0x254231 });
  static driedBlood = new THREE.MeshLambertMaterial({ color: 0x4d0e0e });
  static yellowHazard = new THREE.MeshLambertMaterial({ color: 0xe69c19 });
  static streetlightPole = new THREE.MeshLambertMaterial({ color: 0x2b313a });
  static lightGlowYellow = new THREE.MeshBasicMaterial({ color: 0xffe099 });
}
