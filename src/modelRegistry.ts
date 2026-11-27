export interface ModelSpec {
  id: string;
  path: string;
  category: 'buildings' | 'characters' | 'props' | 'weapons' | 'vehicles' | 'nature';
  targetHeight?: number;
  targetWidth?: number;
  targetLength?: number;
  uniformScale?: number;
  ignoreMeshNames?: string[];
  exactIgnoreMeshNames?: string[];
}

export const MODEL_REGISTRY: Record<string, ModelSpec> = {
  // --- Main Character ---
  player_army_soldier: {
    id: 'player_army_soldier',
    path: '/models/characters/military_man_army_man_soldier.glb',
    category: 'characters',
    targetHeight: 1.78
  },

  // --- Explorable Houses & Interior Suites ---
  house_with_interior: {
    id: 'house_with_interior',
    path: '/models/buildings/house_with_interior.glb',
    category: 'buildings',
    uniformScale: 1.32
  },
  realistic_house_with_interior: {
    id: 'realistic_house_with_interior',
    path: '/models/buildings/realistic_house_with_interior.glb',
    category: 'buildings',
    uniformScale: 1.25,
    exactIgnoreMeshNames: [
      // Closed front & interior door panels + their glass inserts & attached handles (frames stay intact)
      'Object_27', 'Object_28', 'Object_30', 'Object_31', 'Object_33', 'Object_49', 'Object_51',
      'Object_93', 'Object_95', 'Object_97', 'Object_113', 'Object_115',
      'Object_125', 'Object_127', 'Object_129', 'Object_145', 'Object_147'
    ]
  },
  abandoned_house: {
    id: 'abandoned_house',
    path: '/models/buildings/abandoned_house.glb',
    category: 'buildings',
    uniformScale: 0.42,
    ignoreMeshNames: ['House_BlackBckground', 'House_Door']
  },
  living_room_suite: {
    id: 'living_room_suite',
    path: '/models/buildings/living_room_kitchen_bedroom.glb',
    category: 'buildings',
    uniformScale: 0.0185
  },
  city_buildings_pack: {
    id: 'city_buildings_pack',
    path: '/models/buildings/city_buildings_22_pack.glb',
    category: 'buildings'
  },

  // --- Vehicles ---
  civilian_cars_pack: {
    id: 'civilian_cars_pack',
    path: '/models/vehicles/civilian_cars_pack.glb',
    category: 'vehicles'
  },
  police_cruiser: {
    id: 'police_cruiser',
    path: '/models/vehicles/police_cruiser.glb',
    category: 'vehicles',
    targetHeight: 1.55
  },
  tactical_4x4: {
    id: 'tactical_4x4',
    path: '/models/vehicles/tactical_4x4.glb',
    category: 'vehicles',
    targetHeight: 1.95
  },
  armored_tank: {
    id: 'armored_tank',
    path: '/models/vehicles/armored_tank.glb',
    category: 'vehicles',
    targetHeight: 2.75
  },
  military_gunship: {
    id: 'military_gunship',
    path: '/models/vehicles/military_gunship.glb',
    category: 'vehicles',
    targetHeight: 2.9
  },

  // --- Weapons ---
  weapon_shotgun: {
    id: 'weapon_shotgun',
    path: '/models/weapons/pump_shotgun.glb',
    category: 'weapons',
    targetLength: 1.05
  },
  weapon_pistol_9mm: {
    id: 'weapon_pistol_9mm',
    path: '/models/weapons/tactical_pistol_9mm.glb',
    category: 'weapons',
    targetLength: 0.25,
    ignoreMeshNames: ['Plane001']
  },
  weapon_assault_rifle: {
    id: 'weapon_assault_rifle',
    path: '/models/weapons/assault_rifle.glb',
    category: 'weapons',
    targetLength: 0.94
  },
  classic_weapons_pack: {
    id: 'classic_weapons_pack',
    path: '/models/weapons/classic_weapons_pack.glb',
    category: 'weapons'
  },

  // --- Props, Medical, Food & Decorations ---
  prop_army_supply_box: {
    id: 'prop_army_supply_box',
    path: '/models/props/army_supply_box.glb',
    category: 'props',
    targetHeight: 0.85
  },
  prop_wooden_weapon_crate: {
    id: 'prop_wooden_weapon_crate',
    path: '/models/props/wooden_weapon_crate.glb',
    category: 'props',
    targetHeight: 0.36
  },
  prop_armchair: {
    id: 'prop_armchair',
    path: '/models/props/residential_commercial_props.glb',
    category: 'props',
    targetHeight: 0.98
  },
  paintings_and_posters_pack: {
    id: 'paintings_and_posters_pack',
    path: '/models/props/paintings_and_posters.glb',
    category: 'props'
  },
  retro_room_props_pack: {
    id: 'retro_room_props_pack',
    path: '/models/props/retro_room_props.glb',
    category: 'props'
  },
  prop_food_pack: {
    id: 'prop_food_pack',
    path: '/models/props/food_pack.glb',
    category: 'props'
  },
  prop_medical_syringe: {
    id: 'prop_medical_syringe',
    path: '/models/props/medical_syringe.glb',
    category: 'props',
    targetLength: 0.22
  },
  prop_medicine_pot: {
    id: 'prop_medicine_pot',
    path: '/models/props/medicine_pot.glb',
    category: 'props',
    targetHeight: 0.22
  },
  prop_first_aid_cabinet: {
    id: 'prop_first_aid_cabinet',
    path: '/models/props/first_aid_cabinet.glb',
    category: 'props',
    targetHeight: 0.65
  },

  // --- Nature (Grass, Stones & Trees) ---
  nature_grass: {
    id: 'nature_grass',
    path: '/models/nature/grass.glb',
    category: 'nature'
  },
  nature_stones_and_grass: {
    id: 'nature_stones_and_grass',
    path: '/models/nature/stones_and_grass.glb',
    category: 'nature'
  },
  nature_oak_trees: {
    id: 'nature_oak_trees',
    path: '/models/nature/oak_trees.glb',
    category: 'nature'
  },
  nature_trees: {
    id: 'nature_trees',
    path: '/models/nature/trees.glb',
    category: 'nature'
  },
  nature_trees_low_poly: {
    id: 'nature_trees_low_poly',
    path: '/models/nature/trees_low_poly.glb',
    category: 'nature'
  },

  // --- CC0 Architectural Elements (Doors, Windows, Steps) ---
  cc0_door_front: { id: 'cc0_door_front', path: '/models/props/cc0_door_front.glb', category: 'props', targetHeight: 2.35 },
  cc0_door_wood: { id: 'cc0_door_wood', path: '/models/props/cc0_door_wood.glb', category: 'props', targetHeight: 2.3 },
  cc0_door_interior: { id: 'cc0_door_interior', path: '/models/props/cc0_door_interior.glb', category: 'props', targetHeight: 2.3 },
  cc0_window_white: { id: 'cc0_window_white', path: '/models/props/cc0_window_white.glb', category: 'props', targetHeight: 1.38 },
  cc0_window_brown: { id: 'cc0_window_brown', path: '/models/props/cc0_window_brown.glb', category: 'props', targetHeight: 1.45 },
  cc0_steps_stone: { id: 'cc0_steps_stone', path: '/models/props/cc0_steps_stone.glb', category: 'props', targetHeight: 0.42 },
  cc0_steps_wood: { id: 'cc0_steps_wood', path: '/models/props/cc0_steps_wood.glb', category: 'props', targetHeight: 0.35 },

  // --- CC0 Hospital, Police, School & House Interior Props ---
  cc0_wheelchair: { id: 'cc0_wheelchair', path: '/models/props/cc0_wheelchair.glb', category: 'props', targetHeight: 0.98 },
  cc0_hospital_bed: { id: 'cc0_hospital_bed', path: '/models/props/cc0_hospital_bed.glb', category: 'props', targetLength: 2.15 },
  cc0_medical_cart: { id: 'cc0_medical_cart', path: '/models/props/cc0_medical_cart.glb', category: 'props', targetHeight: 1.05 },
  cc0_crutches: { id: 'cc0_crutches', path: '/models/props/cc0_crutches.glb', category: 'props', targetHeight: 1.28 },
  cc0_clipboard: { id: 'cc0_clipboard', path: '/models/props/cc0_clipboard.glb', category: 'props', targetLength: 0.32 },
  cc0_bed_single: { id: 'cc0_bed_single', path: '/models/props/cc0_bed_single.glb', category: 'props', targetLength: 2.05 },
  cc0_bed_double: { id: 'cc0_bed_double', path: '/models/props/cc0_bed_double.glb', category: 'props', targetLength: 2.15 },
  cc0_bed_bunk: { id: 'cc0_bed_bunk', path: '/models/props/cc0_bed_bunk.glb', category: 'props', targetLength: 2.05 },
  cc0_jail_gate: { id: 'cc0_jail_gate', path: '/models/props/cc0_jail_gate.glb', category: 'props', targetHeight: 2.45 },
  cc0_cell_toilet: { id: 'cc0_cell_toilet', path: '/models/props/cc0_cell_toilet.glb', category: 'props', targetHeight: 0.78 },
  cc0_cell_sink: { id: 'cc0_cell_sink', path: '/models/props/cc0_cell_sink.glb', category: 'props', targetHeight: 0.85 },
  cc0_bench: { id: 'cc0_bench', path: '/models/props/cc0_bench.glb', category: 'props', targetHeight: 0.55 },
  cc0_computer_screen: { id: 'cc0_computer_screen', path: '/models/props/cc0_computer_screen.glb', category: 'props', targetHeight: 0.42 },
  cc0_keyboard: { id: 'cc0_keyboard', path: '/models/props/cc0_keyboard.glb', category: 'props', targetWidth: 0.44 },
  cc0_laptop: { id: 'cc0_laptop', path: '/models/props/cc0_laptop.glb', category: 'props', targetWidth: 0.42 },
  cc0_office_chair: { id: 'cc0_office_chair', path: '/models/props/cc0_office_chair.glb', category: 'props', targetHeight: 0.95 },
  cc0_desk: { id: 'cc0_desk', path: '/models/props/cc0_desk.glb', category: 'props', targetHeight: 0.76 },
  cc0_security_camera: { id: 'cc0_security_camera', path: '/models/props/cc0_security_camera.glb', category: 'props', targetLength: 0.4 },
  cc0_school_desk: { id: 'cc0_school_desk', path: '/models/props/cc0_school_desk.glb', category: 'props', targetHeight: 0.78 },
  cc0_school_chair: { id: 'cc0_school_chair', path: '/models/props/cc0_school_chair.glb', category: 'props', targetHeight: 0.84 },
  cc0_bookshelf: { id: 'cc0_bookshelf', path: '/models/props/cc0_bookshelf.glb', category: 'props', targetHeight: 2.05 },
  cc0_sofa: { id: 'cc0_sofa', path: '/models/props/cc0_sofa.glb', category: 'props', targetLength: 2.2 },
  cc0_tv: { id: 'cc0_tv', path: '/models/props/cc0_tv.glb', category: 'props', targetWidth: 1.45 },
  cc0_kitchen_stove: { id: 'cc0_kitchen_stove', path: '/models/props/cc0_kitchen_stove.glb', category: 'props', targetHeight: 0.92 },
  cc0_kitchen_fridge: { id: 'cc0_kitchen_fridge', path: '/models/props/cc0_kitchen_fridge.glb', category: 'props', targetHeight: 1.92 },
  cc0_bathtub: { id: 'cc0_bathtub', path: '/models/props/cc0_bathtub.glb', category: 'props', targetLength: 1.75 },
  cc0_toilet: { id: 'cc0_toilet', path: '/models/props/cc0_toilet.glb', category: 'props', targetHeight: 0.8 },
  cc0_sink: { id: 'cc0_sink', path: '/models/props/cc0_sink.glb', category: 'props', targetHeight: 0.88 },
  cc0_potted_plant: { id: 'cc0_potted_plant', path: '/models/props/cc0_potted_plant.glb', category: 'props', targetHeight: 0.95 },

  // --- Round 2 Unique CC0 Props per Building & House ---
  cc0_trashcan: { id: 'cc0_trashcan', path: '/models/props/cc0_trashcan.glb', category: 'props', targetHeight: 0.46 },
  cc0_metal_stool: { id: 'cc0_metal_stool', path: '/models/props/cc0_metal_stool.glb', category: 'props', targetHeight: 0.72 },
  cc0_coffee_machine: { id: 'cc0_coffee_machine', path: '/models/props/cc0_coffee_machine.glb', category: 'props', targetHeight: 0.34 },
  cc0_toaster: { id: 'cc0_toaster', path: '/models/props/cc0_toaster.glb', category: 'props', targetHeight: 0.2 },
  cc0_coat_rack: { id: 'cc0_coat_rack', path: '/models/props/cc0_coat_rack.glb', category: 'props', targetHeight: 1.72 },
  cc0_ceiling_fan: { id: 'cc0_ceiling_fan', path: '/models/props/cc0_ceiling_fan.glb', category: 'props', targetLength: 1.25 },
  cc0_doormat: { id: 'cc0_doormat', path: '/models/props/cc0_doormat.glb', category: 'props', targetWidth: 1.15 },
  cc0_radio: { id: 'cc0_radio', path: '/models/props/cc0_radio.glb', category: 'props', targetWidth: 0.36 },
  cc0_chemistry_set: { id: 'cc0_chemistry_set', path: '/models/props/cc0_chemistry_set.glb', category: 'props', targetWidth: 0.95 },
  cc0_coffee_cart: { id: 'cc0_coffee_cart', path: '/models/props/cc0_coffee_cart.glb', category: 'props', targetHeight: 1.05 },
  cc0_projector_screen: { id: 'cc0_projector_screen', path: '/models/props/cc0_projector_screen.glb', category: 'props', targetHeight: 2.05 },
  cc0_wall_clock: { id: 'cc0_wall_clock', path: '/models/props/cc0_wall_clock.glb', category: 'props', targetHeight: 0.42 },
  cc0_fire_alarm: { id: 'cc0_fire_alarm', path: '/models/props/cc0_fire_alarm.glb', category: 'props', targetHeight: 0.22 },
  cc0_wet_floor_sign: { id: 'cc0_wet_floor_sign', path: '/models/props/cc0_wet_floor_sign.glb', category: 'props', targetHeight: 0.68 },
  cc0_steel_shelves: { id: 'cc0_steel_shelves', path: '/models/props/cc0_steel_shelves.glb', category: 'props', targetHeight: 2.1 },
  cc0_ammo_box: { id: 'cc0_ammo_box', path: '/models/props/cc0_ammo_box.glb', category: 'props', targetLength: 0.36 },
  cc0_portable_generator: { id: 'cc0_portable_generator', path: '/models/props/cc0_portable_generator.glb', category: 'props', targetHeight: 0.68 },
  cc0_flood_lights: { id: 'cc0_flood_lights', path: '/models/props/cc0_flood_lights.glb', category: 'props', targetHeight: 1.95 },
  cc0_desk_lamp: { id: 'cc0_desk_lamp', path: '/models/props/cc0_desk_lamp.glb', category: 'props', targetHeight: 0.48 },
  cc0_stationery: { id: 'cc0_stationery', path: '/models/props/cc0_stationery.glb', category: 'props', targetWidth: 0.32 },
  cc0_notepads: { id: 'cc0_notepads', path: '/models/props/cc0_notepads.glb', category: 'props', targetWidth: 0.36 },
  cc0_books_set: { id: 'cc0_books_set', path: '/models/props/cc0_books_set.glb', category: 'props', targetWidth: 0.48 },
  cc0_alarm_clock: { id: 'cc0_alarm_clock', path: '/models/props/cc0_alarm_clock.glb', category: 'props', targetHeight: 0.16 },
  cc0_microwave: { id: 'cc0_microwave', path: '/models/props/cc0_microwave.glb', category: 'props', targetWidth: 0.58 },
  cc0_plunger: { id: 'cc0_plunger', path: '/models/props/cc0_plunger.glb', category: 'props', targetHeight: 0.52 },
  cc0_medical_tape: { id: 'cc0_medical_tape', path: '/models/props/cc0_medical_tape.glb', category: 'props', targetWidth: 0.11 },
  cc0_vase: { id: 'cc0_vase', path: '/models/props/cc0_vase.glb', category: 'props', targetHeight: 0.36 },
  cc0_planter_box: { id: 'cc0_planter_box', path: '/models/props/cc0_planter_box.glb', category: 'props', targetWidth: 1.05 },
  cc0_football: { id: 'cc0_football', path: '/models/props/cc0_football.glb', category: 'props', targetHeight: 0.24 },
  cc0_gamepad: { id: 'cc0_gamepad', path: '/models/props/cc0_gamepad.glb', category: 'props', targetWidth: 0.22 },
  cc0_brass_pan: { id: 'cc0_brass_pan', path: '/models/props/cc0_brass_pan.glb', category: 'props', targetLength: 0.38 },
  cc0_crowbar: { id: 'cc0_crowbar', path: '/models/props/cc0_crowbar.glb', category: 'props', targetHeight: 0.68 },
  cc0_barricade_fixed: { id: 'cc0_barricade_fixed', path: '/models/props/cc0_barricade_fixed.glb', category: 'props', targetHeight: 1.05 },
  cc0_barricade_road: { id: 'cc0_barricade_road', path: '/models/props/cc0_barricade_road.glb', category: 'props', targetHeight: 1.12 },
  barrier_bloody: { id: 'barrier_bloody', path: '/models/props/barrier_bloody.glb', category: 'props', targetHeight: 1.25 }
};
