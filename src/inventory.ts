import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ModelLoader } from './modelLoader.ts';
import { extractNamedSubNodes } from './packExtractor.ts';
import { WeaponGripPose } from './soldierRig.ts';

export type ItemKind = 'weapon' | 'melee' | 'grenade' | 'food' | 'ammo';
export type CaliberId = '45_acp' | '9mm_para' | '12_gauge' | '556_nato' | '30_06';

export interface CaliberInfo {
  id: CaliberId;
  label: string;
  shortName: string;
  packAmount: number;
  icon: string;
}

export const CALIBERS: Record<CaliberId, CaliberInfo> = {
  '45_acp': { id: '45_acp', label: '.45 ACP Rounds', shortName: '.45 ACP', packAmount: 30, icon: '🔶' },
  '9mm_para': { id: '9mm_para', label: '9mm Parabellum', shortName: '9mm', packAmount: 36, icon: '🔹' },
  '12_gauge': { id: '12_gauge', label: '12-Gauge Shells', shortName: '12G', packAmount: 12, icon: '🟥' },
  '556_nato': { id: '556_nato', label: '5.56 / 7.92 Rifle', shortName: '5.56mm', packAmount: 30, icon: '🟨' },
  '30_06': { id: '30_06', label: '.30-06 Springfield', shortName: '.30-06', packAmount: 16, icon: '🟫' }
};

export interface ItemTemplate {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  kind: ItemKind;
  grip: WeaponGripPose;
  caliber?: CaliberId;
  maxClip?: number;
  fireRate?: number; // rounds per sec (melee/throw uses cooldown)
  automatic?: boolean;
  pellets?: number;
  spread?: number;
  damage?: number;
  healHealth?: number;
  healEnergy?: number;
  maxStack: number;
  modelType: 'registry' | 'classic_pack' | 'food_pack';
  modelKey: string;
  magazineKey?: string;
  worldLength: number;
  handScale: number;
  fpvScale: number;
}

export interface InventoryItem {
  templateId: string;
  name: string;
  shortName: string;
  icon: string;
  kind: ItemKind;
  grip: WeaponGripPose;
  caliber?: CaliberId;
  clip: number;
  maxClip: number;
  count: number;
  maxStack: number;
}

export interface WorldPickupEntry {
  id: string;
  templateId: string;
  amount: number;
  clipOverride?: number;
  position: THREE.Vector3;
  baseY: number;
  mesh: THREE.Object3D;
  collected: boolean;
  respawnDelay: number; // <= 0 means one-time dropped item (no respawn)
  respawnTimer: number;
  pickupCooldown: number;
  bobPhase: number;
}

export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  // === 2 MAJOR STORY WEAPONS ===
  thompson_smg: {
    id: 'thompson_smg',
    name: 'Thompson M1 SMG',
    shortName: 'SMG',
    icon: '🔫',
    kind: 'weapon',
    grip: 'smg',
    caliber: '45_acp',
    maxClip: 30,
    fireRate: 10,
    automatic: true,
    pellets: 1,
    spread: 0.022,
    damage: 24,
    maxStack: 1,
    modelType: 'classic_pack',
    modelKey: 'Thompson M1_33',
    worldLength: 0.86,
    handScale: 0.82,
    fpvScale: 0.92
  },
  kabar_knife: {
    id: 'kabar_knife',
    name: 'KA-BAR Combat Knife',
    shortName: 'Knife',
    icon: '🔪',
    kind: 'melee',
    grip: 'knife',
    damage: 45,
    maxStack: 1,
    modelType: 'classic_pack',
    modelKey: 'KA BAR_5',
    worldLength: 0.38,
    handScale: 0.42,
    fpvScale: 0.45
  },

  // === ADDITIONAL FIREARMS & KNIVES ===
  ppsh_smg: {
    id: 'ppsh_smg',
    name: 'PPSh-41 SMG',
    shortName: 'PPSh-41',
    icon: '🔫',
    kind: 'weapon',
    grip: 'smg',
    caliber: '9mm_para',
    maxClip: 45,
    fireRate: 12.5,
    automatic: true,
    pellets: 1,
    spread: 0.028,
    damage: 20,
    maxStack: 1,
    modelType: 'classic_pack',
    modelKey: 'PPSH 41_23',
    worldLength: 0.84,
    handScale: 0.80,
    fpvScale: 0.90
  },
  pump_shotgun: {
    id: 'pump_shotgun',
    name: '12G Pump Shotgun',
    shortName: 'Shotgun',
    icon: '💥',
    kind: 'weapon',
    grip: 'shotgun',
    caliber: '12_gauge',
    maxClip: 6,
    fireRate: 1.4,
    automatic: false,
    pellets: 8,
    spread: 0.068,
    damage: 18,
    maxStack: 1,
    modelType: 'registry',
    modelKey: 'weapon_shotgun',
    worldLength: 1.02,
    handScale: 0.92,
    fpvScale: 0.96
  },
  assault_rifle: {
    id: 'assault_rifle',
    name: 'Tactical M4 Rifle',
    shortName: 'M4 Rifle',
    icon: '🪖',
    kind: 'weapon',
    grip: 'rifle',
    caliber: '556_nato',
    maxClip: 30,
    fireRate: 8.5,
    automatic: true,
    pellets: 1,
    spread: 0.014,
    damage: 28,
    maxStack: 1,
    modelType: 'registry',
    modelKey: 'weapon_assault_rifle',
    worldLength: 0.92,
    handScale: 0.88,
    fpvScale: 0.95
  },
  stg44_rifle: {
    id: 'stg44_rifle',
    name: 'StG-44 Assault Rifle',
    shortName: 'StG-44',
    icon: '🪖',
    kind: 'weapon',
    grip: 'rifle',
    caliber: '556_nato',
    maxClip: 30,
    fireRate: 8.0,
    automatic: true,
    pellets: 1,
    spread: 0.017,
    damage: 27,
    maxStack: 1,
    modelType: 'classic_pack',
    modelKey: 'STG 44_28',
    worldLength: 0.92,
    handScale: 0.86,
    fpvScale: 0.94
  },
  m1_garand: {
    id: 'm1_garand',
    name: 'M1 Garand Rifle',
    shortName: 'Garand',
    icon: '🎯',
    kind: 'weapon',
    grip: 'rifle',
    caliber: '30_06',
    maxClip: 8,
    fireRate: 3.2,
    automatic: false,
    pellets: 1,
    spread: 0.008,
    damage: 48,
    maxStack: 1,
    modelType: 'classic_pack',
    modelKey: 'M1 Garand_8',
    worldLength: 1.06,
    handScale: 0.92,
    fpvScale: 0.95
  },
  pistol_9mm: {
    id: 'pistol_9mm',
    name: '9mm Tactical Pistol',
    shortName: '9mm Pistol',
    icon: '🔫',
    kind: 'weapon',
    grip: 'pistol',
    caliber: '9mm_para',
    maxClip: 15,
    fireRate: 4.5,
    automatic: false,
    pellets: 1,
    spread: 0.016,
    damage: 24,
    maxStack: 1,
    modelType: 'registry',
    modelKey: 'weapon_pistol_9mm',
    worldLength: 0.25,
    handScale: 0.26,
    fpvScale: 0.30
  },
  m1911_pistol: {
    id: 'm1911_pistol',
    name: 'Colt M1911 .45',
    shortName: 'M1911',
    icon: '🔫',
    kind: 'weapon',
    grip: 'pistol',
    caliber: '45_acp',
    maxClip: 8,
    fireRate: 4.0,
    automatic: false,
    pellets: 1,
    spread: 0.014,
    damage: 30,
    maxStack: 1,
    modelType: 'classic_pack',
    modelKey: 'M1911_13',
    worldLength: 0.25,
    handScale: 0.26,
    fpvScale: 0.30
  },
  nr40_knife: {
    id: 'nr40_knife',
    name: 'NR-40 Scout Knife',
    shortName: 'NR-40',
    icon: '🗡️',
    kind: 'melee',
    grip: 'knife',
    damage: 42,
    maxStack: 1,
    modelType: 'classic_pack',
    modelKey: 'NR 40_6',
    worldLength: 0.36,
    handScale: 0.40,
    fpvScale: 0.43
  },

  // === GRENADES (From user-provided classic_weapons_pack.glb) ===
  mk2_grenade: {
    id: 'mk2_grenade',
    name: 'MK2 Frag Grenade',
    shortName: 'MK2 Frag',
    icon: '💣',
    kind: 'grenade',
    grip: 'grenade',
    damage: 95,
    maxStack: 5,
    modelType: 'classic_pack',
    modelKey: 'MK2 Grenade_2',
    worldLength: 0.16,
    handScale: 0.17,
    fpvScale: 0.19
  },
  f1_grenade: {
    id: 'f1_grenade',
    name: 'F1 Frag Grenade',
    shortName: 'F1 Frag',
    icon: '💣',
    kind: 'grenade',
    grip: 'grenade',
    damage: 95,
    maxStack: 5,
    modelType: 'classic_pack',
    modelKey: 'F1 Grenade_4',
    worldLength: 0.16,
    handScale: 0.17,
    fpvScale: 0.19
  },
  stick_grenade: {
    id: 'stick_grenade',
    name: 'M24 Stick Grenade',
    shortName: 'Stick Bom',
    icon: '🧨',
    kind: 'grenade',
    grip: 'grenade',
    damage: 95,
    maxStack: 5,
    modelType: 'classic_pack',
    modelKey: 'German Stick Grenade_3',
    worldLength: 0.34,
    handScale: 0.34,
    fpvScale: 0.36
  },

  // === DISTINCT AMMO TYPES (Separate per firearm caliber!) ===
  ammo_45_acp: {
    id: 'ammo_45_acp',
    name: '.45 ACP Rounds',
    shortName: '.45 ACP',
    icon: '🔶',
    kind: 'ammo',
    grip: 'none',
    caliber: '45_acp',
    maxStack: 180,
    modelType: 'classic_pack',
    modelKey: '45 ACP_14',
    worldLength: 0.24,
    handScale: 0.16,
    fpvScale: 0.16
  },
  ammo_9mm_para: {
    id: 'ammo_9mm_para',
    name: '9mm Parabellum',
    shortName: '9mm',
    icon: '🔹',
    kind: 'ammo',
    grip: 'none',
    caliber: '9mm_para',
    maxStack: 210,
    modelType: 'classic_pack',
    modelKey: '9x19mm Parabellum _20',
    worldLength: 0.24,
    handScale: 0.16,
    fpvScale: 0.16
  },
  ammo_12_gauge: {
    id: 'ammo_12_gauge',
    name: '12-Gauge Shells',
    shortName: '12G',
    icon: '🟥',
    kind: 'ammo',
    grip: 'none',
    caliber: '12_gauge',
    maxStack: 60,
    modelType: 'classic_pack',
    modelKey: '762x25mm Tokarev _26',
    worldLength: 0.26,
    handScale: 0.18,
    fpvScale: 0.18
  },
  ammo_556_nato: {
    id: 'ammo_556_nato',
    name: '5.56 / 7.92 Rifle Ammo',
    shortName: '5.56mm',
    icon: '🟨',
    kind: 'ammo',
    grip: 'none',
    caliber: '556_nato',
    maxStack: 180,
    modelType: 'classic_pack',
    modelKey: '792x33mm Kurz _30',
    worldLength: 0.26,
    handScale: 0.16,
    fpvScale: 0.16
  },
  ammo_30_06: {
    id: 'ammo_30_06',
    name: '.30-06 Springfield Clips',
    shortName: '.30-06',
    icon: '🟫',
    kind: 'ammo',
    grip: 'none',
    caliber: '30_06',
    maxStack: 80,
    modelType: 'classic_pack',
    modelKey: 'M1 Garand Clip_12',
    worldLength: 0.26,
    handScale: 0.16,
    fpvScale: 0.16
  },

  // === FOOD RATIONS ===
  food_fried_meat: {
    id: 'food_fried_meat',
    name: 'Roasted Meat',
    shortName: 'Meat',
    icon: '🥩',
    kind: 'food',
    grip: 'food',
    healHealth: 24,
    healEnergy: 32,
    maxStack: 8,
    modelType: 'food_pack',
    modelKey: 'fried_meat',
    worldLength: 0.34,
    handScale: 0.24,
    fpvScale: 0.24
  },
  food_meat: {
    id: 'food_meat',
    name: 'Cured Steak',
    shortName: 'Steak',
    icon: '🍖',
    kind: 'food',
    grip: 'food',
    healHealth: 18,
    healEnergy: 26,
    maxStack: 8,
    modelType: 'food_pack',
    modelKey: 'meat',
    worldLength: 0.34,
    handScale: 0.24,
    fpvScale: 0.24
  },
  food_ham: {
    id: 'food_ham',
    name: 'Smoked Ham',
    shortName: 'Ham',
    icon: '🍗',
    kind: 'food',
    grip: 'food',
    healHealth: 22,
    healEnergy: 30,
    maxStack: 8,
    modelType: 'food_pack',
    modelKey: 'ham',
    worldLength: 0.34,
    handScale: 0.24,
    fpvScale: 0.24
  },
  food_fried_ham: {
    id: 'food_fried_ham',
    name: 'Seared Ham Ration',
    shortName: 'Seared Ham',
    icon: '🥓',
    kind: 'food',
    grip: 'food',
    healHealth: 26,
    healEnergy: 35,
    maxStack: 8,
    modelType: 'food_pack',
    modelKey: 'fried_ham',
    worldLength: 0.34,
    handScale: 0.24,
    fpvScale: 0.24
  },
  food_fish: {
    id: 'food_fish',
    name: 'Grilled Fish Fillet',
    shortName: 'Fish',
    icon: '🐟',
    kind: 'food',
    grip: 'food',
    healHealth: 20,
    healEnergy: 28,
    maxStack: 8,
    modelType: 'food_pack',
    modelKey: 'fried_fish',
    worldLength: 0.34,
    handScale: 0.24,
    fpvScale: 0.24
  }
};

export const CALIBER_TO_AMMO_TEMPLATE: Record<CaliberId, string> = {
  '45_acp': 'ammo_45_acp',
  '9mm_para': 'ammo_9mm_para',
  '12_gauge': 'ammo_12_gauge',
  '556_nato': 'ammo_556_nato',
  '30_06': 'ammo_30_06'
};

/**
 * Manages the strictly 10-slot hotbar (Keys 1..9 & 0), distinct weapon calibers,
 * proximity pickups with timed crate respawning, KeyQ weapon dropping,
 * Health/Stamina/Energy vitals, and cached normalized 3D item meshes.
 */
export class InventorySystem {
  readonly maxSlots = 10;
  slots: (InventoryItem | null)[] = new Array(10).fill(null);
  activeSlot = 0;

  // Player Vitals (0..100, rendered without numeric clutter on HUD)
  health = 100;
  stamina = 68;
  energy = 90;

  // World Pickups (respawning army crates, police ammo, office/house food, dropped weapons)
  pickups: WorldPickupEntry[] = [];

  private scene: THREE.Scene;
  private loader: ModelLoader;
  private templateMeshCache = new Map<string, THREE.Group>();
  private templateInFlight = new Map<string, Promise<THREE.Group | null>>();
  private thumbnailUrls = new Map<string, string>();
  private classicPackRaw: THREE.Object3D | null = null;
  private foodPackRaw: THREE.Object3D | null = null;

  private slotChangeCallbacks: Array<() => void> = [];
  private onDeathCallback: (() => void) | null = null;

  constructor(scene: THREE.Scene, loader: ModelLoader) {
    this.scene = scene;
    this.loader = loader;

    // Seed Slot 1 (Thompson M1 SMG), Slot 2 (KA-BAR Knife) & Slot 3 (60 spare .45 ACP rounds for reloading)
    this.slots[0] = this.createItemFromTemplate('thompson_smg', 1);
    this.slots[1] = this.createItemFromTemplate('kabar_knife', 1);
    this.slots[2] = this.createItemFromTemplate('ammo_45_acp', 60);

    this.buildHotbarDom();
    this.refreshHud();
  }

  onSelectionChanged(cb: () => void) {
    this.slotChangeCallbacks.push(cb);
  }

  onPlayerDeath(cb: () => void) {
    this.onDeathCallback = cb;
  }

  async preloadAssets() {
    const [classic, food] = await Promise.all([
      this.loader.loadRaw('classic_weapons_pack'),
      this.loader.loadRaw('food_pack')
    ]);
    // Fallback check for prop_food_pack ID in modelRegistry
    const foodAlt = food ?? (await this.loader.loadRaw('prop_food_pack'));
    this.classicPackRaw = classic?.object ?? null;
    this.foodPackRaw = foodAlt?.object ?? null;

    await Promise.all(
      Object.keys(ITEM_TEMPLATES).map((id) => this.prepareTemplateMesh(id))
    );
    this.generateAllModelThumbnails();
    this.refreshHud();
    this.notifySelectionChanged();
  }

  private generateAllModelThumbnails() {
    try {
      const thumbRenderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
      });
      thumbRenderer.setSize(72, 72);
      thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
      thumbRenderer.setClearColor(0x000000, 0);

      const thumbScene = new THREE.Scene();
      thumbScene.add(new THREE.AmbientLight(0xffffff, 2.3));
      const keyLight = new THREE.DirectionalLight(0xfff6e8, 2.2);
      keyLight.position.set(2.5, 3.0, 2.6);
      thumbScene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xcbe0ff, 1.4);
      fillLight.position.set(-2.5, -1.5, 2.0);
      thumbScene.add(fillLight);

      const thumbCam = new THREE.PerspectiveCamera(34, 1, 0.01, 20);

      for (const id of Object.keys(ITEM_TEMPLATES)) {
        const tplMesh = this.templateMeshCache.get(id);
        if (!tplMesh) continue;

        const preview = cloneSkinned(tplMesh);
        preview.rotation.set(0.20, Math.PI * 0.45, 0);
        preview.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(preview);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        preview.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z, 0.05);
        const dist = (maxDim * 0.68) / Math.tan(THREE.MathUtils.degToRad(17));
        thumbCam.position.set(0, 0, Math.max(0.15, dist));
        thumbCam.lookAt(0, 0, 0);

        thumbScene.add(preview);
        thumbRenderer.render(thumbScene, thumbCam);
        this.thumbnailUrls.set(id, thumbRenderer.domElement.toDataURL('image/png'));
        thumbScene.remove(preview);
      }

      thumbRenderer.dispose();
    } catch (err) {
      console.warn('Thumbnail generation skipped:', err);
    }
  }

  private createItemFromTemplate(templateId: string, count = 1, clipOverride?: number): InventoryItem {
    const tpl = ITEM_TEMPLATES[templateId];
    return {
      templateId,
      name: tpl.name,
      shortName: tpl.shortName,
      icon: tpl.icon,
      kind: tpl.kind,
      grip: tpl.grip,
      caliber: tpl.caliber,
      clip: clipOverride !== undefined ? clipOverride : (tpl.maxClip ?? 0),
      maxClip: tpl.maxClip ?? 0,
      count: Math.min(tpl.maxStack, count),
      maxStack: tpl.maxStack
    };
  }

  get activeItem(): InventoryItem | null {
    return this.slots[this.activeSlot] ?? null;
  }

  get activeTemplate(): ItemTemplate | null {
    const item = this.activeItem;
    return item ? ITEM_TEMPLATES[item.templateId] ?? null : null;
  }

  getFilledCount(): number {
    return this.slots.filter((s) => s !== null).length;
  }

  selectSlot(idx: number) {
    if (idx < 0 || idx >= this.maxSlots) return;
    if (this.activeSlot !== idx) {
      this.activeSlot = idx;
      this.refreshHud();
      this.notifySelectionChanged();
    }
  }

  private notifySelectionChanged() {
    for (const cb of this.slotChangeCallbacks) cb();
  }

  /**
   * Returns total reserve bullets for a SPECIFIC caliber only (no shared universal ammo!).
   */
  getCaliberReserve(caliber: CaliberId): number {
    const targetTpl = CALIBER_TO_AMMO_TEMPLATE[caliber];
    let total = 0;
    for (const s of this.slots) {
      if (s && s.templateId === targetTpl) {
        total += s.count;
      }
    }
    return total;
  }

  consumeCaliberAmmo(caliber: CaliberId, needed: number): number {
    const targetTpl = CALIBER_TO_AMMO_TEMPLATE[caliber];
    let taken = 0;
    for (let i = this.slots.length - 1; i >= 0 && taken < needed; i--) {
      const s = this.slots[i];
      if (!s || s.templateId !== targetTpl) continue;
      const takeHere = Math.min(s.count, needed - taken);
      s.count -= takeHere;
      taken += takeHere;
      if (s.count <= 0) {
        this.slots[i] = null;
      }
    }
    this.sortSlotsPreservingSelection();
    this.refreshHud();
    return taken;
  }

  private getCategoryOrder(kind: ItemKind): number {
    if (kind === 'weapon' || kind === 'melee' || kind === 'grenade') return 0;
    if (kind === 'food') return 1;
    return 2; // 'ammo' last
  }

  /**
   * Orders non-empty inventory slots strictly: Weapons -> Food -> Ammo,
   * preserving active item selection.
   */
  private sortSlotsPreservingSelection() {
    const activeObj = this.slots[this.activeSlot];
    const items = this.slots.filter((s): s is InventoryItem => s !== null);
    items.sort((a, b) => this.getCategoryOrder(a.kind) - this.getCategoryOrder(b.kind));

    this.slots.fill(null);
    for (let i = 0; i < items.length && i < this.maxSlots; i++) {
      this.slots[i] = items[i];
    }

    if (activeObj) {
      const movedIdx = this.slots.indexOf(activeObj);
      if (movedIdx !== -1) {
        this.activeSlot = movedIdx;
      }
    }
  }

  addItem(templateId: string, amount = 1, clipOverride?: number): boolean {
    const tpl = ITEM_TEMPLATES[templateId];
    if (!tpl) return false;

    let remaining = amount;

    // 1. Try stacking into an existing matching slot first (for food, grenades, distinct ammo)
    if (tpl.maxStack > 1) {
      for (let i = 0; i < this.maxSlots && remaining > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.templateId === templateId && slot.count < slot.maxStack) {
          const addHere = Math.min(remaining, slot.maxStack - slot.count);
          slot.count += addHere;
          remaining -= addHere;
        }
      }
    }

    // 2. Put remaining into free slots up to strict MAX 10 items
    while (remaining > 0) {
      const emptyIdx = this.slots.findIndex((s) => s === null);
      if (emptyIdx === -1) {
        if (remaining === amount) {
          return false;
        }
        this.sortSlotsPreservingSelection();
        this.refreshHud();
        return true;
      }
      const addHere = Math.min(remaining, tpl.maxStack);
      this.slots[emptyIdx] = this.createItemFromTemplate(templateId, addHere, clipOverride);
      remaining -= addHere;
    }

    this.sortSlotsPreservingSelection();
    this.refreshHud();
    this.notifySelectionChanged();
    return true;
  }

  /**
   * Key Q: Drops the currently held item right onto the ground ~1.2m ahead with pickup immunity.
   */
  async dropActiveItem(playerPos: THREE.Vector3, yaw: number): Promise<boolean> {
    const item = this.slots[this.activeSlot];
    if (!item) {
      return false;
    }

    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const dropPos = new THREE.Vector3(
      playerPos.x + fwdX * 1.25,
      playerPos.y + 0.08,
      playerPos.z + fwdZ * 1.25
    );

    const dropCount = item.kind === 'ammo' ? item.count : 1;
    const savedClip = item.kind === 'weapon' ? item.clip : undefined;

    if (item.count > 1 && item.kind !== 'ammo') {
      item.count -= 1;
    } else {
      this.slots[this.activeSlot] = null;
    }

    await this.registerPickup(
      item.templateId,
      dropPos,
      dropCount,
      0, // Dropped items do not auto-respawn infinitely
      1.8,
      savedClip
    );

    this.sortSlotsPreservingSelection();
    this.refreshHud();
    this.notifySelectionChanged();
    return true;
  }

  consumeFoodInActiveSlot(): boolean {
    const item = this.activeItem;
    const tpl = this.activeTemplate;
    if (!item || !tpl || item.kind !== 'food') return false;

    this.health = Math.min(100, this.health + (tpl.healHealth ?? 20));
    this.energy = Math.min(100, this.energy + (tpl.healEnergy ?? 25));

    item.count -= 1;
    if (item.count <= 0) {
      this.slots[this.activeSlot] = null;
      this.sortSlotsPreservingSelection();
    }
    this.refreshHud();
    this.notifySelectionChanged();
    return true;
  }

  consumeOneGrenade(): ItemTemplate | null {
    const item = this.activeItem;
    const tpl = this.activeTemplate;
    if (!item || !tpl || item.kind !== 'grenade') return null;

    item.count -= 1;
    if (item.count <= 0) {
      this.slots[this.activeSlot] = null;
      this.sortSlotsPreservingSelection();
    }
    this.refreshHud();
    this.notifySelectionChanged();
    return tpl;
  }

  canReloadActiveWeapon(): {
    canReload: boolean;
    reason?: 'no_weapon' | 'full' | 'no_ammo';
    needed: number;
    reserve: number;
  } {
    const item = this.activeItem;
    if (!item || item.kind !== 'weapon' || !item.caliber) {
      return { canReload: false, reason: 'no_weapon', needed: 0, reserve: 0 };
    }
    if (item.clip >= item.maxClip) {
      return { canReload: false, reason: 'full', needed: 0, reserve: this.getCaliberReserve(item.caliber) };
    }
    const needed = item.maxClip - item.clip;
    const reserve = this.getCaliberReserve(item.caliber);
    if (reserve <= 0) {
      return { canReload: false, reason: 'no_ammo', needed, reserve: 0 };
    }
    return { canReload: true, needed, reserve };
  }

  completeReloadActiveWeapon(): { loaded: number; needed: number } {
    const item = this.activeItem;
    if (!item || item.kind !== 'weapon' || !item.caliber) {
      return { loaded: 0, needed: 0 };
    }
    const needed = Math.max(0, item.maxClip - item.clip);
    if (needed === 0) return { loaded: 0, needed: 0 };
    const taken = this.consumeCaliberAmmo(item.caliber, needed);
    item.clip += taken;
    this.refreshHud();
    return { loaded: taken, needed };
  }

  reloadActiveWeapon(): { started: boolean; needed: number; loaded: number } {
    const check = this.canReloadActiveWeapon();
    if (!check.canReload) {
      return { started: false, needed: check.needed, loaded: 0 };
    }
    const res = this.completeReloadActiveWeapon();
    return { started: res.loaded > 0, needed: res.needed, loaded: res.loaded };
  }

  applyDamage(amount: number, _reason = 'Injury') {
    if (amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    const vig = document.getElementById('damage-vignette');
    if (vig) {
      vig.style.boxShadow = 'inset 0 0 110px rgba(255, 35, 55, 0.72)';
      setTimeout(() => {
        vig.style.boxShadow = 'inset 0 0 90px rgba(255, 45, 65, 0)';
      }, 260);
    }

    if (this.health <= 0) {
      // Character died -> respawn with 100% WEAPONS & INVENTORY INTACT
      this.health = 100;
      this.energy = Math.max(70, this.energy);
      this.stamina = Math.max(60, this.stamina);
      if (this.onDeathCallback) this.onDeathCallback();
    }
    this.updateVitalBarsDom();
  }

  /**
   * Vitals progression model:
   * - Eating food increases Health & Energy.
   * - Running improves Stamina slowly while slowly expending Energy.
   * - Standing still regenerates Energy slowly; crouching regenerates Energy at 2x speed.
   * - Health ONLY decreases on explicit damage (zombies / grenade blast radius).
   */
  updateVitals(delta: number, isMoving: boolean, isSprinting: boolean, isCrouching = false) {
    if (isMoving && isSprinting && this.energy > 1) {
      this.stamina = Math.min(100, this.stamina + 4.2 * delta);
      this.energy = Math.max(0, this.energy - 0.90 * delta);
    } else if (isMoving) {
      this.energy = Math.max(0, this.energy - (isCrouching ? 0.06 : 0.14) * delta);
      this.stamina = Math.min(100, this.stamina + 1.0 * delta);
    } else {
      // Resting still recovers energy slowly; crouching recovers at double speed!
      const regenRate = isCrouching ? 3.2 : 1.6;
      this.energy = Math.min(100, this.energy + regenRate * delta);
    }

    this.updateVitalBarsDom();
  }

  /**
   * Registers a collectible 3D pickup in the world (inside army boxes, near police vehicles/stations, or offices).
   */
  async registerPickup(
    templateId: string,
    pos: THREE.Vector3,
    amount = 1,
    respawnDelay = 25,
    pickupCooldown = 0,
    clipOverride?: number
  ): Promise<WorldPickupEntry | null> {
    const mesh = await this.createWeaponOrItemMesh(templateId, 'world');
    if (!mesh) return null;

    const holder = new THREE.Group();
    holder.add(mesh);

    // Subtle colored beacon glow base ring so dropped weapons/ammo/food inside dim boxes/offices read clearly
    const tpl = ITEM_TEMPLATES[templateId];
    const glowColor =
      tpl.kind === 'food' ? 0x2ed573 : tpl.kind === 'ammo' ? 0x54a0ff : tpl.kind === 'grenade' ? 0xff6b6b : 0xffa502;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.24, 16),
      new THREE.MeshBasicMaterial({ color: glowColor, side: THREE.DoubleSide, transparent: true, opacity: 0.72 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    holder.add(ring);

    // Lay long guns nearly flat horizontally for display in crates/tables; upright for knives/food/ammo/grenades
    if (tpl.grip === 'smg' || tpl.grip === 'shotgun' || tpl.grip === 'rifle') {
      mesh.position.y = 0.16;
      mesh.rotation.z = 0.14;
      mesh.rotation.x = 0.08;
    } else {
      mesh.position.y = 0.14;
    }

    holder.position.copy(pos);
    this.scene.add(holder);

    const entry: WorldPickupEntry = {
      id: `pk_${this.pickups.length}_${templateId}`,
      templateId,
      amount,
      clipOverride,
      position: pos.clone(),
      baseY: pos.y,
      mesh: holder,
      collected: false,
      respawnDelay,
      respawnTimer: 0,
      pickupCooldown,
      bobPhase: Math.random() * Math.PI * 2
    };
    this.pickups.push(entry);
    return entry;
  }

  /**
   * Proximity collection loop + timed respawn handler for loot boxes.
   */
  updatePickups(playerPos: THREE.Vector3, delta: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];

      if (p.collected) {
        if (p.respawnDelay > 0) {
          p.respawnTimer -= delta;
          if (p.respawnTimer <= 0) {
            p.collected = false;
            p.mesh.visible = true;
          }
        }
        continue;
      }

      if (p.pickupCooldown > 0) {
        p.pickupCooldown -= delta;
      }

      p.bobPhase += delta * 2.2;
      p.mesh.rotation.y += delta * 1.1;
      p.mesh.position.y = p.baseY + Math.sin(p.bobPhase) * 0.04;

      if (p.pickupCooldown > 0) continue;

      const dx = playerPos.x - p.position.x;
      const dz = playerPos.z - p.position.z;
      const dy = Math.abs(playerPos.y + 0.6 - p.position.y);
      if (dx * dx + dz * dz < 2.15 * 2.15 && dy < 2.2) {
        const added = this.addItem(p.templateId, p.amount, p.clipOverride);
        if (added) {
          const tpl = ITEM_TEMPLATES[p.templateId];
          this.showToast(`Collected: ${tpl.name}${p.amount > 1 ? ` (x${p.amount})` : ''}`, '#7bed9f');
          p.collected = true;
          p.mesh.visible = false;
          if (p.respawnDelay > 0) {
            p.respawnTimer = p.respawnDelay;
          } else {
            this.scene.remove(p.mesh);
            this.pickups.splice(i, 1);
          }
        } else {
          // Wait 2.5s before repeating "Inventory Full" warning
          p.pickupCooldown = 2.5;
        }
      }
    }
  }

  /**
   * Clones a cached, canonical-oriented weapon/food/ammo model (`-Z` forward muzzle/blade, `+Y` up).
   */
  async createWeaponOrItemMesh(
    templateId: string,
    mode: 'world' | 'hand' | 'fpv'
  ): Promise<THREE.Group | null> {
    const tpl = ITEM_TEMPLATES[templateId];
    if (!tpl) return null;

    const template = await this.prepareTemplateMesh(templateId);
    if (!template) return null;

    const clone = cloneSkinned(template);
    const scaleTarget =
      mode === 'world' ? tpl.worldLength : mode === 'fpv' ? tpl.fpvScale : tpl.handScale;

    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const sz = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z, 0.01);
    clone.scale.multiplyScalar(scaleTarget / maxDim);

    const wrap = new THREE.Group();
    wrap.add(clone);
    return wrap;
  }

  private async prepareTemplateMesh(templateId: string): Promise<THREE.Group | null> {
    const existing = this.templateMeshCache.get(templateId);
    if (existing) return existing;
    const pending = this.templateInFlight.get(templateId);
    if (pending) return pending;

    const task = this.buildTemplateMesh(templateId);
    this.templateInFlight.set(templateId, task);
    const res = await task;
    this.templateInFlight.delete(templateId);
    return res;
  }

  private normNodeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private async buildTemplateMesh(templateId: string): Promise<THREE.Group | null> {
    const tpl = ITEM_TEMPLATES[templateId];
    if (!tpl) return null;

    const root = new THREE.Group();

    if (tpl.modelType === 'classic_pack') {
      if (!this.classicPackRaw) {
        const res = await this.loader.loadRaw('classic_weapons_pack');
        this.classicPackRaw = res?.object ?? null;
      }
      if (!this.classicPackRaw) return null;

      // Match sanitized Three.js GLTFLoader node names (spaces/dots become underscores) via alphanumeric normalization
      const targetNames = new Set([this.normNodeName(tpl.modelKey)]);
      if (tpl.magazineKey) targetNames.add(this.normNodeName(tpl.magazineKey));

      const combined = new THREE.Group();
      this.classicPackRaw.updateMatrixWorld(true);
      this.classicPackRaw.traverse((child) => {
        if (child.name && targetNames.has(this.normNodeName(child.name))) {
          const part = child.clone(true);
          if (child.parent) {
            part.applyMatrix4(child.parent.matrixWorld);
          }
          combined.add(part);
        }
      });

      if (combined.children.length === 0) {
        const keyNorm = this.normNodeName(tpl.modelKey);
        const nodes = extractNamedSubNodes(this.classicPackRaw, (n) => this.normNodeName(n) === keyNorm);
        if (nodes.length > 0) combined.add(nodes[0].group);
      }

      if (combined.children.length === 0) {
        console.warn('[Inventory] Missing classic_pack node for:', templateId, tpl.modelKey);
        return null;
      }
      this.stripShadowsAndConvert(combined);

      // Classic pack weapons/knives extend along +X; rotate +PI/2 around Y so muzzle/blade points -Z!
      // Grenades & standing bullets are tall on Y -> leave upright
      combined.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(combined);
      const center = b.getCenter(new THREE.Vector3());
      combined.position.sub(center);

      const orientGroup = new THREE.Group();
      orientGroup.add(combined);
      if (tpl.kind === 'weapon' || tpl.kind === 'melee') {
        orientGroup.rotation.y = Math.PI / 2;
      }

      orientGroup.updateMatrixWorld(true);
      const ob = new THREE.Box3().setFromObject(orientGroup);
      const oCenter = ob.getCenter(new THREE.Vector3());
      orientGroup.position.sub(oCenter);

      // For firearms & knives in hand, shift pivot back toward grip/handle (around +Z back third)
      if (tpl.kind === 'weapon') {
        const lenZ = ob.max.z - ob.min.z;
        orientGroup.position.z -= lenZ * 0.22;
      } else if (tpl.kind === 'melee') {
        const lenZ = ob.max.z - ob.min.z;
        orientGroup.position.z -= lenZ * 0.30;
      }
      root.add(orientGroup);
    } else if (tpl.modelType === 'food_pack') {
      if (!this.foodPackRaw) {
        const res = await this.loader.loadRaw('prop_food_pack');
        this.foodPackRaw = res?.object ?? null;
      }
      if (!this.foodPackRaw) return null;
      const keyNorm = this.normNodeName(tpl.modelKey);
      const items = extractNamedSubNodes(this.foodPackRaw, (n) => this.normNodeName(n) === keyNorm);
      if (items.length === 0) return null;
      const g = items[0].group.clone(true);
      this.stripShadowsAndConvert(g);
      const b = new THREE.Box3().setFromObject(g);
      g.position.sub(b.getCenter(new THREE.Vector3()));
      root.add(g);
    } else {
      const res = await this.loader.loadById(tpl.modelKey);
      if (!res) return null;
      const obj = res.object;
      this.stripShadowsAndConvert(obj);
      obj.updateMatrixWorld(true);

      // Center and orient standalone GLB guns so thin muzzle points toward -Z
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      obj.position.sub(box.getCenter(new THREE.Vector3()));

      const alignWrap = new THREE.Group();
      alignWrap.add(obj);
      if (size.x > size.z) {
        alignWrap.rotation.y = Math.PI / 2;
      }
      alignWrap.updateMatrixWorld(true);

      // Determine which end (-Z vs +Z) is narrower (barrel) vs taller/wider (stock/hammer)
      const ab = new THREE.Box3().setFromObject(alignWrap);
      const zMin = ab.min.z;
      const zMax = ab.max.z;
      const zSpan = Math.max(0.01, zMax - zMin);
      const frontY = this.measureSliceHeight(alignWrap, zMin, zMin + zSpan * 0.22);
      const backY = this.measureSliceHeight(alignWrap, zMax - zSpan * 0.22, zMax);
      // Barrel end is vertically thinner than stock/grip/hammer end!
      if (frontY > backY * 1.15) {
        alignWrap.rotation.y += Math.PI;
      }

      alignWrap.updateMatrixWorld(true);
      const fb = new THREE.Box3().setFromObject(alignWrap);
      alignWrap.position.sub(fb.getCenter(new THREE.Vector3()));
      alignWrap.position.z -= (fb.max.z - fb.min.z) * 0.22;
      root.add(alignWrap);
    }

    // Visual distinction tint for different ammo calibers using classic bullet meshes
    if (tpl.kind === 'ammo') {
      const calColor =
        tpl.caliber === '12_gauge'
          ? 0xd63031
          : tpl.caliber === '9mm_para'
          ? 0x0984e3
          : tpl.caliber === '556_nato'
          ? 0xfdcb6e
          : tpl.caliber === '30_06'
          ? 0x6c5ce7
          : 0xe17055;
      const clipBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, 0.12),
        new THREE.MeshLambertMaterial({ color: calColor })
      );
      clipBox.position.y = -0.02;
      root.add(clipBox);
    }

    this.templateMeshCache.set(templateId, root);
    return root;
  }

  private measureSliceHeight(obj: THREE.Object3D, z0: number, z1: number): number {
    let minY = Infinity;
    let maxY = -Infinity;
    const v = new THREE.Vector3();
    obj.traverse((c) => {
      if (!(c instanceof THREE.Mesh) || !c.geometry) return;
      const pos = c.geometry.attributes.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld);
        if (v.z >= z0 && v.z <= z1) {
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }
      }
    });
    return maxY > minY ? maxY - minY : 0;
  }

  private stripShadowsAndConvert(obj: THREE.Object3D) {
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });
  }

  showToast(_text: string, _color = '#7bed9f') {
    // Prompt toast messages disabled cleanly per user request.
  }

  private buildHotbarDom() {
    const container = document.getElementById('hud-hotbar');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < this.maxSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.id = `hotbar-slot-${i}`;
      const labelKey = i === 9 ? '0' : String(i + 1);
      slot.innerHTML = `<span class="slot-key">${labelKey}</span><div class="slot-icon"></div><div class="slot-name"></div><span class="slot-count"></span>`;
      container.appendChild(slot);
    }
  }

  refreshHud() {
    for (let i = 0; i < this.maxSlots; i++) {
      const el = document.getElementById(`hotbar-slot-${i}`);
      if (!el) continue;
      el.classList.toggle('active', i === this.activeSlot);

      const item = this.slots[i];
      const iconEl = el.querySelector('.slot-icon') as HTMLElement | null;
      const nameEl = el.querySelector('.slot-name') as HTMLElement | null;
      const countEl = el.querySelector('.slot-count') as HTMLElement | null;

      if (!item) {
        if (iconEl) iconEl.innerHTML = '';
        if (nameEl) nameEl.innerText = 'Empty';
        if (countEl) countEl.innerText = '';
        el.style.opacity = i === this.activeSlot ? '1' : '0.62';
      } else {
        el.style.opacity = '1';
        if (iconEl) {
          const thumbUrl = this.thumbnailUrls.get(item.templateId);
          if (thumbUrl) {
            iconEl.innerHTML = `<img class="slot-thumb" src="${thumbUrl}" alt="${item.shortName}" />`;
          } else {
            iconEl.innerText = item.shortName.slice(0, 3).toUpperCase();
          }
        }
        if (nameEl) nameEl.innerText = item.shortName;
        if (countEl) {
          if (item.kind === 'weapon') {
            const reserve = item.caliber ? this.getCaliberReserve(item.caliber) : 0;
            countEl.innerText = `${item.clip}/${reserve}`;
            countEl.style.color = item.clip === 0 && reserve === 0 ? '#ff4757' : item.clip === 0 ? '#ff6b6b' : '#feca57';
          } else if (item.kind === 'melee') {
            countEl.innerText = '∞';
            countEl.style.color = '#70a1ff';
          } else {
            countEl.innerText = `x${item.count}`;
            countEl.style.color = '#7bed9f';
          }
        }
      }
    }

    const pill = document.getElementById('active-weapon-pill');
    if (pill) {
      const active = this.activeItem;
      if (!active) {
        pill.innerText = `Slot ${this.activeSlot === 9 ? '0' : this.activeSlot + 1} • Empty Hands`;
      } else if (active.kind === 'weapon' && active.caliber) {
        const cal = CALIBERS[active.caliber];
        const reserve = this.getCaliberReserve(active.caliber);
        pill.innerText = `${active.name} (${cal.shortName}) • ${active.clip}/${reserve} (Mag ${active.maxClip})`;
      } else if (active.kind === 'ammo' && active.caliber) {
        pill.innerText = `${active.name} (x${active.count}) • Fits ${CALIBERS[active.caliber].shortName} Guns`;
      } else if (active.kind === 'melee') {
        pill.innerText = `${active.name} • Melee Slash [LMB]`;
      } else if (active.kind === 'grenade') {
        pill.innerText = `${active.name} (x${active.count}) • Throw [LMB]`;
      } else if (active.kind === 'food') {
        pill.innerText = `${active.name} (x${active.count}) • Eat [LMB]`;
      }
    }

    this.updateVitalBarsDom();
  }

  private updateVitalBarsDom() {
    const hBar = document.getElementById('health-bar-fill');
    const sBar = document.getElementById('stamina-bar-fill');
    const eBar = document.getElementById('energy-bar-fill');
    if (hBar) hBar.style.width = `${Math.max(0, Math.min(100, this.health)).toFixed(1)}%`;
    if (sBar) sBar.style.width = `${Math.max(0, Math.min(100, this.stamina)).toFixed(1)}%`;
    if (eBar) eBar.style.width = `${Math.max(0, Math.min(100, this.energy)).toFixed(1)}%`;
  }
}
