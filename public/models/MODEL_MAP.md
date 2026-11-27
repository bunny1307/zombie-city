# Zombie City — Sorted & Optimized 3D Model Registry (`.glb`)

All **97** `.glb` assets (`29` base + `68` strictly CC0-1.0 props) have been sorted into category folders, stripped of unused metadata, polygon-simplified (`Meshopt`), texture-resized & WebP-compressed, and Draco-encoded for ultra-low memory and integrated-GPU/mobile performance.

## Sorted Folder Structure (`public/models/`)

### 1. `public/models/characters/`
* `military_man_army_man_soldier.glb` — Main playable character converted into a GPU-skinned 7-bone animated soldier rig (`0.29 MB`, `5,845 tris`)

### 2. `public/models/nature/`
* `grass.glb` — Instanced turf & autumn grass clusters scattered across all non-road ground (`0.08 MB`)
* `stones_and_grass.glb` — Instanced rocks & foliage tufts blended across open turf (`83.8 KB`)
* `oak_trees.glb` — Instanced oak tree variant scattered across parks and blocks (`105.7 KB`)
* `trees.glb` — 3 instanced tree silhouettes scattered across residential, campus & park zones (`0.12 MB`)
* `trees_low_poly.glb` — 2 instanced stylized low-poly trees filling out perimeter woodlands (`0.12 MB`)

### 3. `public/models/buildings/`
* `house_with_interior.glb` — Walkable 2-story interior residence (`X: -85, Z: +26`)
* `realistic_house_with_interior.glb` — Walkable realistic furnished house (`X: -116, Z: +58`)
* `abandoned_house.glb` — Fenced abandoned house & yard (`X: -124, Z: +24`)
* `living_room_kitchen_bedroom.glb` — Furnished living/kitchen/bedroom suite (`X: -115, Z: +95`)
* `city_buildings_22_pack.glb` — 22 distinct urban buildings extracted & placed across city perimeter blocks

### 4. `public/models/vehicles/`
* `military_gunship.glb` — Parked on Tower Alpha Rooftop Helipad (`X: -4.2, Y: 36.45, Z: -0.5`)
* `police_cruiser.glb` — Outside Police Precinct 4 & Central Intersection roadblock
* `armored_tank.glb` — Military Quarantine Roadblock (`X: -2.5, Z: +36`)
* `tactical_4x4.glb` — Military Roadblocks on Grand Central Ave & Civic Parkway
* `civilian_cars_pack.glb` — 4 civilian car models extracted & scattered across avenues

### 5. `public/models/weapons/`
* `pump_shotgun.glb` — Tower Alpha Rooftop crate & Police Armory
* `tactical_pistol_9mm.glb` — Police Armory & 2BHK Master Bedroom nightstand
* `assault_rifle.glb` — Police Armory crate
* `classic_weapons_pack.glb` — Extracted rifles, pistols, knives & grenades displayed in Police Armory

### 6. `public/models/props/`
* `paintings_and_posters.glb` — Split into framed wall paintings/posters (hung across all 5 main buildings) & ceramic props (placed on tables, desks & counters)
* `retro_room_props.glb` — 18 room props placed across houses, school offices & Tower Alpha rooms
* `residential_commercial_props.glb` — Armchairs placed across lounges, living rooms & offices
* `army_supply_box.glb` — Military supply boxes at Rooftop Helipad, Hospital ER, Tank Checkpoint & Armory
* `wooden_weapon_crate.glb` — Weapon crates at Rooftop Helipad, Tank Checkpoint & Police Armory
* `food_pack.glb` — Extracted meat, ham & fish platters inside the 2BHK House Kitchen & Dining area (`0.05 MB`)
* `first_aid_cabinet.glb` — First-aid cabinets at Hospital ER/Pharmacy, Police Precinct & 2BHK House (`0.01 MB`)
* `medicine_pot.glb` — Medicine jars placed across Hospital Pharmacy, Ward Gurney & 2BHK House (`<5 KB`)
* `medical_syringe.glb` — Medical syringes on Hospital Triage/Pharmacy counters & 2BHK nightstand (`0.01 MB`)

### 7. `public/models/props/cc0_*.glb` (68 Strictly CC0-1.0 Public Domain Props — No Attribution Required)
* **Doors, Windows & Steps (7)**: `cc0_door_front.glb`, `cc0_door_wood.glb`, `cc0_door_interior.glb`, `cc0_window_white.glb`, `cc0_window_brown.glb`, `cc0_steps_stone.glb`, `cc0_steps_wood.glb` (open entrance/interior doors, transparent-glazed 3D window frames & flush entrance steps across 2BHK, Hospital, Police, School, Tower Alpha & GLB houses)
* **Hospital Equipment (6)**: `cc0_hospital_bed.glb` (9 multi-ward beds with mattresses & pillows), `cc0_wheelchair.glb` (4 wheelchairs), `cc0_medical_cart.glb`, `cc0_crutches.glb`, `cc0_clipboard.glb`, `cc0_medical_tape.glb`
* **Police, Office & Industrial Gear (21)**: `cc0_jail_gate.glb`, `cc0_bed_bunk.glb`, `cc0_cell_toilet.glb`, `cc0_cell_sink.glb`, `cc0_bench.glb`, `cc0_computer_screen.glb`, `cc0_keyboard.glb`, `cc0_laptop.glb`, `cc0_office_chair.glb`, `cc0_security_camera.glb`, `cc0_coffee_cart.glb`, `cc0_projector_screen.glb`, `cc0_wall_clock.glb`, `cc0_fire_alarm.glb`, `cc0_wet_floor_sign.glb`, `cc0_steel_shelves.glb`, `cc0_ammo_box.glb`, `cc0_portable_generator.glb`, `cc0_flood_lights.glb`, `cc0_desk_lamp.glb`, `cc0_stationery.glb`, `cc0_notepads.glb`, `cc0_crowbar.glb`
* **School, Laboratory & Residential Furnishings (34)**: `cc0_school_desk.glb`, `cc0_school_chair.glb`, `cc0_chemistry_set.glb`, `cc0_metal_stool.glb`, `cc0_bookshelf.glb`, `cc0_books_set.glb`, `cc0_sofa.glb`, `cc0_desk.glb`, `cc0_tv.glb`, `cc0_kitchen_stove.glb`, `cc0_kitchen_fridge.glb`, `cc0_coffee_machine.glb`, `cc0_toaster.glb`, `cc0_microwave.glb`, `cc0_brass_pan.glb`, `cc0_bed_double.glb`, `cc0_bed_single.glb`, `cc0_bathtub.glb`, `cc0_toilet.glb`, `cc0_sink.glb`, `cc0_plunger.glb`, `cc0_potted_plant.glb`, `cc0_planter_box.glb`, `cc0_vase.glb`, `cc0_trashcan.glb`, `cc0_coat_rack.glb`, `cc0_ceiling_fan.glb`, `cc0_doormat.glb`, `cc0_radio.glb`, `cc0_alarm_clock.glb`, `cc0_football.glb`, `cc0_gamepad.glb`
