import * as THREE from 'three';
import { ArchBuilder } from './archBuilder.ts';
import { GameMaterials } from '../materials.ts';
import { PlayerController } from '../player.ts';
import { PooledLightManager } from '../lightPool.ts';

/**
 * Builds a walkable 2-story hardwood interior with stairwell, dividing wall,
 * entry threshold step, and ceiling lights inside the `abandoned_house.glb` shell
 * at (-124, 0.2, 24) once its opaque BlackBckground/Door meshes are stripped.
 */
export class AbandonedHouseInterior {
  group = new THREE.Group();
  arch: ArchBuilder;

  // Center of the house core in world XZ (House_Wall1_0 spans X:-126.08..-116.17, Z:20.85..27.20)
  readonly originX = -121.12;
  readonly originY = 0.2;
  readonly originZ = 24.02;

  constructor(scene: THREE.Scene, player: PlayerController, lightPool: PooledLightManager | null = null) {
    this.group.position.set(this.originX, this.originY, this.originZ);
    this.arch = new ArchBuilder(this.group, player, this.originX, this.originY, this.originZ, lightPool);

    // 1. Ground Floor Slab (top at local Y = 0.72 -> world Y = 0.92, flush with doorway sill)
    this.arch.addSolidBox(0, 0.62, 0, 9.4, 0.2, 5.9, GameMaterials.houseWoodFloor, true, false);

    // Front entry threshold step outside North doorway (door at world X=-121.31, Z=20.85 -> local X=-0.19, Z=-3.17)
    this.arch.addSolidBox(-0.19, 0.56, -3.55, 1.7, 0.16, 0.85, GameMaterials.concreteGrey, true, false);

    // 2. Ground Floor interior dividing wall (X = -0.3) with open central doorway
    this.arch.addWall('z', -0.3, 0.72, 0, 5.7, 3.1, 0.18, GameMaterials.houseWallInterior, [
      { type: 'door', offset: -0.6, width: 1.5, height: 2.35, hasDoorLeaf: false }
    ]);

    // 3. Second Floor Slab (top at local Y = 3.85 -> world Y = 4.05), leaving stairwell cutout at X: +0.6..+4.6, Z: +0.5..+2.85
    this.arch.addSolidBox(-2.2, 3.73, 0, 5.0, 0.24, 5.9, GameMaterials.houseWoodFloor, true, false);
    this.arch.addSolidBox(2.5, 3.73, -1.25, 4.4, 0.24, 3.4, GameMaterials.houseWoodFloor, true, false);

    // Staircase in South-East corner climbing East from X=+0.5 to X=+4.4 along Z=+1.7
    this.arch.addStairFlight(0.5, 0.72, 1.7, 1, 0, 3.13, 3.8, 1.9, 10, GameMaterials.woodPlanks);

    // Second-floor stairwell safety guardrail
    this.arch.addSolidBox(2.3, 4.35, 0.45, 3.8, 1.0, 0.1, GameMaterials.woodPlanks);

    // Interior ceiling lights
    this.arch.addCeilingLight(-2.4, 3.6, 0, true, 0xffd599, 1.5, 10);
    this.arch.addCeilingLight(2.2, 3.6, -1.0, true, 0xffd599, 1.4, 10);
    this.arch.addCeilingLight(-2.0, 6.8, 0, true, 0xffdfb0, 1.4, 10);

    this.arch.finalizeMergedMeshes();
    scene.add(this.group);
  }
}
