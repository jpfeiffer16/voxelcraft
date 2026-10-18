// Block registry. render: 'opaque' | 'cutout' (leaves/glass) | 'water' | 'cross' (plants)
window.VC = window.VC || {};
(function () {
  'use strict';
  // Tile indices in the atlas (see textures.js)
  const T = {
    grass_top: 0, grass_side: 1, dirt: 2, stone: 3, sand: 4, water: 5, log_side: 6, log_top: 7,
    leaves: 8, glass: 9, planks: 10, cobble: 11, bedrock: 12, coal: 13, iron: 14, brick: 15,
    snow: 16, snow_side: 17, tallgrass: 18, flower_red: 19, flower_yellow: 20, gravel: 21, gold: 22,
    stone_bricks: 23, bookshelf: 24, sandstone_side: 25, sandstone_top: 26, cactus_side: 27, cactus_top: 28,
    wool_white: 29, wool_red: 30, wool_blue: 31, glowstone: 32, obsidian: 33, birch_side: 34, birch_leaves: 35,
    torch: 36, lantern: 37, craft_top: 38, craft_side: 39, pumpkin_side: 40, pumpkin_top: 41, jack_face: 42,
    wool_yellow: 43, wool_lime: 44, wool_green: 45, wool_orange: 46, wool_purple: 47, wool_cyan: 48, wool_pink: 49,
    wool_black: 50, wool_gray: 51, mossy_cobble: 52, hay_side: 53, hay_top: 54, melon_side: 55, melon_top: 56,
    flower_blue: 57, mushroom: 58, dog_egg: 59, cat_egg: 60, lantern_top: 61, terracotta: 62, flower_tulip: 63,
    tnt_side: 64, tnt_top: 65, tnt_bottom: 66, lion_egg: 67,
    pane: 68, oak_window: 69, stained_blue: 70, stained_amber: 71, lava: 72, door_oak_bottom: 73, door_oak_top: 74,
    door_iron_bottom: 75, door_iron_top: 76, bed_head_top: 77, bed_foot_top: 78, bed_side: 79, bed_end: 80,
    door_item: 81, iron_door_item: 82, bed_item: 83, bucket: 84, water_bucket: 85, lava_bucket: 86,
    wolf_egg: 87, bear_egg: 88, spider_egg: 89, croc_egg: 90, zombie_egg: 91, water_flow: 92, iron_block: 93,
  };
  const B = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, GLASS: 8, PLANKS: 9,
    COBBLE: 10, BEDROCK: 11, COAL: 12, IRON: 13, BRICK: 14, SNOW: 15, TALLGRASS: 16, ROSE: 17, DANDELION: 18,
    GRAVEL: 19, GOLD: 20, STONE_BRICKS: 21, BOOKSHELF: 22, SANDSTONE: 23, CACTUS: 24, WOOL_WHITE: 25,
    WOOL_RED: 26, WOOL_BLUE: 27, GLOWSTONE: 28, OBSIDIAN: 29, BIRCH_LOG: 30, BIRCH_LEAVES: 31,
    TORCH: 32, TORCH_PX: 33, TORCH_NX: 34, TORCH_PZ: 35, TORCH_NZ: 36, LANTERN: 37, CRAFTING_TABLE: 38,
    PUMPKIN: 39, JACK_O_LANTERN: 40, WOOL_YELLOW: 41, WOOL_LIME: 42, WOOL_GREEN: 43, WOOL_ORANGE: 44,
    WOOL_PURPLE: 45, WOOL_CYAN: 46, WOOL_PINK: 47, WOOL_BLACK: 48, WOOL_GRAY: 49, MOSSY_COBBLE: 50, HAY: 51,
    MELON: 52, BLUE_FLOWER: 53, MUSHROOM: 54, TERRACOTTA: 55, TULIP: 56, TNT: 57,
    GLASS_PANE: 58, OAK_WINDOW: 59, STAINED_BLUE: 60, STAINED_AMBER: 61, LAVA: 62,
    WATER_FLOW: 64, // 64..70 = flowing water level 1..7
    LAVA_FLOW: 71,  // 71..77 = flowing lava level 1..7
    OAK_DOOR: 80,   // 80..95  = base + facing*4 + open*2 + upper
    IRON_DOOR: 96,  // 96..111
    BED: 112,       // 112..119 = base + facing*2 + head
    DOG_EGG: 200, CAT_EGG: 201, LION_EGG: 202, OAK_DOOR_ITEM: 203, IRON_DOOR_ITEM: 204, BED_ITEM: 205,
    WATER_BUCKET: 206, LAVA_BUCKET: 207, BUCKET: 208, WOLF_EGG: 209, BEAR_EGG: 210, SPIDER_EGG: 211, CROC_EGG: 212, ZOMBIE_EGG: 213,
  };
  const defs = [];
  function def(id, name, tex, opts = {}) {
    const t = typeof tex === 'number' ? { top: tex, bottom: tex, side: tex } : tex;
    defs[id] = Object.assign({ id, name, top: t.top, bottom: t.bottom, side: t.side, render: 'opaque', solid: true, placeable: true }, opts);
  }
  def(B.AIR, 'Air', 0, { render: 'none', solid: false, placeable: false });
  def(B.GRASS, 'Grass Block', { top: T.grass_top, bottom: T.dirt, side: T.grass_side });
  def(B.DIRT, 'Dirt', T.dirt);
  def(B.STONE, 'Stone', T.stone);
  def(B.SAND, 'Sand', T.sand);
  def(B.WATER, 'Water', T.water, { render: 'water', solid: false, placeable: false, fluid: 1, level: 8, item: B.WATER_BUCKET });
  def(B.LOG, 'Oak Log', { top: T.log_top, bottom: T.log_top, side: T.log_side });
  def(B.LEAVES, 'Oak Leaves', T.leaves, { render: 'cutout' });
  def(B.GLASS, 'Glass', T.glass, { render: 'cutout' });
  def(B.PLANKS, 'Oak Planks', T.planks);
  def(B.COBBLE, 'Cobblestone', T.cobble);
  def(B.BEDROCK, 'Bedrock', T.bedrock, { placeable: false });
  def(B.COAL, 'Coal Ore', T.coal);
  def(B.IRON, 'Iron Ore', T.iron);
  def(B.BRICK, 'Bricks', T.brick);
  def(B.SNOW, 'Snowy Grass', { top: T.snow, bottom: T.dirt, side: T.snow_side });
  def(B.TALLGRASS, 'Tall Grass', T.tallgrass, { render: 'cross', solid: false });
  def(B.ROSE, 'Rose', T.flower_red, { render: 'cross', solid: false });
  def(B.DANDELION, 'Dandelion', T.flower_yellow, { render: 'cross', solid: false });
  def(B.GRAVEL, 'Gravel', T.gravel);
  def(B.GOLD, 'Gold Ore', T.gold);
  def(B.STONE_BRICKS, 'Stone Bricks', T.stone_bricks);
  def(B.BOOKSHELF, 'Bookshelf', { top: T.planks, bottom: T.planks, side: T.bookshelf });
  def(B.SANDSTONE, 'Sandstone', { top: T.sandstone_top, bottom: T.sandstone_top, side: T.sandstone_side });
  def(B.CACTUS, 'Cactus', { top: T.cactus_top, bottom: T.cactus_top, side: T.cactus_side });
  def(B.WOOL_WHITE, 'White Wool', T.wool_white);
  def(B.WOOL_RED, 'Red Wool', T.wool_red);
  def(B.WOOL_BLUE, 'Blue Wool', T.wool_blue);
  def(B.GLOWSTONE, 'Glowstone', T.glowstone, { light: 15 });
  def(B.OBSIDIAN, 'Obsidian', T.obsidian);
  def(B.BIRCH_LOG, 'Birch Log', { top: T.log_top, bottom: T.log_top, side: T.birch_side });
  def(B.BIRCH_LEAVES, 'Birch Leaves', T.birch_leaves, { render: 'cutout' });

  // Torches: one floor variant + 4 wall variants (attached wall is opposite the normal in the name)
  def(B.TORCH, 'Torch', T.torch, { render: 'model', solid: false, light: 14 });
  def(B.TORCH_PX, 'Torch', T.torch, { render: 'model', solid: false, light: 14, placeable: false, item: B.TORCH, wall: [1, 0] });
  def(B.TORCH_NX, 'Torch', T.torch, { render: 'model', solid: false, light: 14, placeable: false, item: B.TORCH, wall: [-1, 0] });
  def(B.TORCH_PZ, 'Torch', T.torch, { render: 'model', solid: false, light: 14, placeable: false, item: B.TORCH, wall: [0, 1] });
  def(B.TORCH_NZ, 'Torch', T.torch, { render: 'model', solid: false, light: 14, placeable: false, item: B.TORCH, wall: [0, -1] });
  def(B.LANTERN, 'Lantern', { top: T.lantern_top, bottom: T.lantern_top, side: T.lantern }, { render: 'model', solid: false, light: 15 });
  def(B.CRAFTING_TABLE, 'Crafting Table', { top: T.craft_top, bottom: T.planks, side: T.craft_side });
  def(B.PUMPKIN, 'Pumpkin', { top: T.pumpkin_top, bottom: T.pumpkin_top, side: T.pumpkin_side });
  def(B.JACK_O_LANTERN, "Jack o'Lantern", { top: T.pumpkin_top, bottom: T.pumpkin_top, side: T.jack_face }, { light: 15 });
  def(B.WOOL_YELLOW, 'Yellow Wool', T.wool_yellow);
  def(B.WOOL_LIME, 'Lime Wool', T.wool_lime);
  def(B.WOOL_GREEN, 'Green Wool', T.wool_green);
  def(B.WOOL_ORANGE, 'Orange Wool', T.wool_orange);
  def(B.WOOL_PURPLE, 'Purple Wool', T.wool_purple);
  def(B.WOOL_CYAN, 'Cyan Wool', T.wool_cyan);
  def(B.WOOL_PINK, 'Pink Wool', T.wool_pink);
  def(B.WOOL_BLACK, 'Black Wool', T.wool_black);
  def(B.WOOL_GRAY, 'Gray Wool', T.wool_gray);
  def(B.MOSSY_COBBLE, 'Mossy Cobblestone', T.mossy_cobble);
  def(B.HAY, 'Hay Bale', { top: T.hay_top, bottom: T.hay_top, side: T.hay_side });
  def(B.MELON, 'Melon', { top: T.melon_top, bottom: T.melon_top, side: T.melon_side });
  def(B.BLUE_FLOWER, 'Blue Orchid', T.flower_blue, { render: 'cross', solid: false });
  def(B.TULIP, 'Pink Tulip', T.flower_tulip, { render: 'cross', solid: false });
  def(B.MUSHROOM, 'Red Mushroom', T.mushroom, { render: 'cross', solid: false, light: 1 });
  def(B.TERRACOTTA, 'Terracotta', T.terracotta);
  // Items (never stored in the world)
  def(B.DOG_EGG, 'Dog Spawn Egg', T.dog_egg, { render: 'item', solid: false, egg: 'dog' });
  def(B.CAT_EGG, 'Cat Spawn Egg', T.cat_egg, { render: 'item', solid: false, egg: 'cat' });
  def(B.LION_EGG, 'Lion Spawn Egg', T.lion_egg, { render: 'item', solid: false, egg: 'lion' });
  def(B.TNT, 'TNT', { top: T.tnt_top, bottom: T.tnt_bottom, side: T.tnt_side });
  // ---- windows
  def(B.GLASS_PANE, 'Glass Pane', T.pane, { render: 'model', shape: 'pane' });
  def(B.OAK_WINDOW, 'Oak Window', T.oak_window, { render: 'cutout' });
  def(B.STAINED_BLUE, 'Blue Stained Glass', T.stained_blue, { render: 'glass' });
  def(B.STAINED_AMBER, 'Amber Stained Glass', T.stained_amber, { render: 'glass' });
  // ---- fluids (source + 7 flowing levels each)
  def(B.LAVA, 'Lava', T.lava, { render: 'lava', solid: false, light: 15, placeable: false, fluid: 2, level: 8 });
  for (let l = 1; l <= 7; l++) {
    def(B.WATER_FLOW + l - 1, 'Water', T.water, { render: 'water', solid: false, placeable: false, fluid: 1, level: l, item: B.WATER_BUCKET });
    def(B.LAVA_FLOW + l - 1, 'Lava', T.lava, { render: 'lava', solid: false, light: 15, placeable: false, fluid: 2, level: l, item: B.LAVA_BUCKET });
  }
  // ---- doors: facing f (0:+z 1:+x 2:-z 3:-x), open, upper half
  for (const [base, name, item, bot, top] of [[B.OAK_DOOR, 'Oak Door', B.OAK_DOOR_ITEM, T.door_oak_bottom, T.door_oak_top], [B.IRON_DOOR, 'Iron Door', B.IRON_DOOR_ITEM, T.door_iron_bottom, T.door_iron_top]])
    for (let f = 0; f < 4; f++) for (let o = 0; o < 2; o++) for (let u = 0; u < 2; u++) {
      const t = u ? top : bot;
      def(base + f * 4 + o * 2 + u, name, { top: T.planks, bottom: T.planks, side: t }, { render: 'model', shape: 'door', door: { base, f, open: o, upper: u }, placeable: false, item, iron: base === B.IRON_DOOR });
    }
  for (let f = 0; f < 4; f++) for (let h = 0; h < 2; h++)
    def(B.BED + f * 2 + h, 'Bed', { top: h ? T.bed_head_top : T.bed_foot_top, bottom: T.planks, side: T.bed_side }, { render: 'model', shape: 'bed', bed: { f, head: h }, placeable: false, item: B.BED_ITEM });
  // ---- items
  def(B.OAK_DOOR_ITEM, 'Oak Door', T.door_item, { render: 'item', solid: false, places: 'door', base: B.OAK_DOOR });
  def(B.IRON_DOOR_ITEM, 'Iron Door', T.iron_door_item, { render: 'item', solid: false, places: 'door', base: B.IRON_DOOR });
  def(B.BED_ITEM, 'Bed', T.bed_item, { render: 'item', solid: false, places: 'bed' });
  def(B.WATER_BUCKET, 'Water Bucket', T.water_bucket, { render: 'item', solid: false, places: 'fluid', fluidBlock: B.WATER });
  def(B.LAVA_BUCKET, 'Lava Bucket', T.lava_bucket, { render: 'item', solid: false, places: 'fluid', fluidBlock: B.LAVA });
  def(B.BUCKET, 'Bucket (scoop up water/lava)', T.bucket, { render: 'item', solid: false, places: 'bucket' });
  def(B.WOLF_EGG, 'Wolf Spawn Egg', T.wolf_egg, { render: 'item', solid: false, egg: 'wolf' });
  def(B.BEAR_EGG, 'Bear Spawn Egg', T.bear_egg, { render: 'item', solid: false, egg: 'bear' });
  def(B.SPIDER_EGG, 'Spider Spawn Egg', T.spider_egg, { render: 'item', solid: false, egg: 'spider' });
  def(B.CROC_EGG, 'Crocodile Spawn Egg', T.croc_egg, { render: 'item', solid: false, egg: 'croc' });
  def(B.ZOMBIE_EGG, 'Zombie Spawn Egg', T.zombie_egg, { render: 'item', solid: false, egg: 'zombie' });

  const N = 256;
  // Fast lookup tables
  const SOLID = new Uint8Array(N), OPAQUE = new Uint8Array(N), RENDER = new Uint8Array(N); // RENDER: 0 none,1 opaque,2 cutout,3 water,4 cross,5 model
  const LIGHT = new Uint8Array(N); // emitted block light 0-15
  const FLUID = new Uint8Array(N), LEVEL = new Uint8Array(N); // FLUID: 1 water, 2 lava; LEVEL 1..8 (8 = source)
  const TEX = new Uint8Array(N * 3); // top, bottom, side
  const rmap = { none: 0, opaque: 1, cutout: 2, water: 3, cross: 4, model: 5, item: 0, glass: 6, lava: 7 };
  for (const d of defs) {
    if (!d) continue;
    SOLID[d.id] = d.solid ? 1 : 0;
    OPAQUE[d.id] = d.render === 'opaque' ? 1 : 0;
    RENDER[d.id] = rmap[d.render];
    LIGHT[d.id] = d.light || 0;
    FLUID[d.id] = d.fluid || 0; LEVEL[d.id] = d.level || 0;
    TEX[d.id * 3] = d.top; TEX[d.id * 3 + 1] = d.bottom; TEX[d.id * 3 + 2] = d.side;
  }
  VC.T = T; VC.B = B; // Order shown in the block menu
  const ORDER = [B.TNT, B.TORCH, B.LANTERN, B.DOG_EGG, B.CAT_EGG, B.LION_EGG, B.GLOWSTONE, B.JACK_O_LANTERN, B.PUMPKIN, B.CRAFTING_TABLE, B.BOOKSHELF,
    B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.MOSSY_COBBLE, B.STONE_BRICKS, B.BRICK, B.PLANKS, B.LOG, B.BIRCH_LOG, B.LEAVES, B.BIRCH_LEAVES,
    B.GLASS, B.SAND, B.SANDSTONE, B.GRAVEL, B.SNOW, B.TERRACOTTA, B.HAY, B.MELON, B.CACTUS, B.OBSIDIAN, B.COAL, B.IRON, B.GOLD,
    B.WOOL_WHITE, B.WOOL_GRAY, B.WOOL_BLACK, B.WOOL_RED, B.WOOL_ORANGE, B.WOOL_YELLOW, B.WOOL_LIME, B.WOOL_GREEN, B.WOOL_CYAN,
    B.WOOL_BLUE, B.WOOL_PURPLE, B.WOOL_PINK, B.TALLGRASS, B.ROSE, B.DANDELION, B.BLUE_FLOWER, B.TULIP, B.MUSHROOM];
  // building / survival items first
  ORDER.splice(1, 0, B.BED_ITEM, B.OAK_DOOR_ITEM, B.IRON_DOOR_ITEM, B.GLASS_PANE, B.OAK_WINDOW, B.STAINED_BLUE, B.STAINED_AMBER,
    B.WATER_BUCKET, B.LAVA_BUCKET, B.BUCKET);
  ORDER.splice(ORDER.indexOf(B.LION_EGG) + 1, 0, B.WOLF_EGG, B.BEAR_EGG, B.SPIDER_EGG, B.CROC_EGG, B.ZOMBIE_EGG);

  // ---- shapes (units of 1/16) for doors, beds, panes: used for rendering and collision ----
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // facing f -> [dx, dz]
  function rotBox(b, f) { // rotate around the cell centre so +z maps onto DIRS[f]
    let [x0, y0, z0, x1, y1, z1] = b;
    for (let i = 0; i < f; i++) { const nx0 = z0, nx1 = z1, nz0 = 16 - x1, nz1 = 16 - x0; x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1; }
    return [x0, y0, z0, x1, y1, z1];
  }
  const shapeCache = new Map();
  // nb(dx, dz) -> neighbour id on the same level (only used by panes)
  function shape(id, nb) {
    const d = defs[id]; if (!d || !d.shape) return null;
    if (d.shape === 'door') {
      const k = id; let r = shapeCache.get(k);
      if (!r) { const { f, open } = d.door; r = [{ b: rotBox(open ? [0, 0, 0, 3, 16, 16] : [0, 0, 0, 16, 16, 3], f) }]; shapeCache.set(k, r); }
      return r;
    }
    if (d.shape === 'bed') {
      let r = shapeCache.get(id);
      if (!r) {
        const { f, head } = d.bed;
        const legs = head ? [[0, 0, 13, 3, 3, 16], [13, 0, 13, 16, 3, 16]] : [[0, 0, 0, 3, 3, 3], [13, 0, 0, 16, 3, 3]];
        r = [{ b: rotBox([0, 3, 0, 16, 9, 16], f), rotTop: f }].concat(legs.map(l => ({ b: rotBox(l, f), legs: true })));
        shapeCache.set(id, r);
      }
      return r;
    }
    if (d.shape === 'pane') {
      const c = (dx, dz) => { const n = nb(dx, dz); return n > 0 && (SOLID[n] && (OPAQUE[n] || defs[n].shape === 'pane' || RENDER[n] === 2 || RENDER[n] === 6)); };
      const px = c(1, 0), nx = c(-1, 0), pz = c(0, 1), nz = c(0, -1);
      const key = 'p' + (+px) + (+nx) + (+pz) + (+nz);
      let r = shapeCache.get(key);
      if (!r) {
        r = [{ b: [7, 0, 7, 9, 16, 9] }];
        if (!px && !nx && !pz && !nz) r = [{ b: [0, 0, 7, 16, 16, 9] }];
        else {
          if (px) r.push({ b: [9, 0, 7, 16, 16, 9] }); if (nx) r.push({ b: [0, 0, 7, 7, 16, 9] });
          if (pz) r.push({ b: [7, 0, 9, 9, 16, 16] }); if (nz) r.push({ b: [7, 0, 0, 9, 16, 7] });
        }
        shapeCache.set(key, r);
      }
      return r;
    }
    return null;
  }
  // Collision boxes in world units for a block, or null = full cube (when SOLID)
  function collisionBoxes(world, x, y, z, id) {
    const sh = shape(id, (dx, dz) => world.getBlock(x + dx, y, z + dz));
    if (!sh) return null;
    const out = [];
    for (const s of sh) { if (s.legs) continue; const b = s.b; out.push([x + b[0] / 16, y + b[1] / 16, z + b[2] / 16, x + b[3] / 16, y + b[4] / 16, z + b[5] / 16]); }
    return out;
  }
  // Does an AABB overlap solid geometry? Returns null, or { top, bottom } of the overlapping boxes (for snapping).
  function aabbHit(world, x0, y0, z0, x1, y1, z1) {
    let hit = null;
    const add = (a, b, c, d, e, f) => {
      if (!hit) hit = { minX: a, minY: b, minZ: c, maxX: d, maxY: e, maxZ: f };
      else { if (a < hit.minX) hit.minX = a; if (b < hit.minY) hit.minY = b; if (c < hit.minZ) hit.minZ = c; if (d > hit.maxX) hit.maxX = d; if (e > hit.maxY) hit.maxY = e; if (f > hit.maxZ) hit.maxZ = f; }
    };
    for (let y = Math.floor(y0); y <= Math.floor(y1 - 1e-7); y++) for (let z = Math.floor(z0); z <= Math.floor(z1 - 1e-7); z++) for (let x = Math.floor(x0); x <= Math.floor(x1 - 1e-7); x++) {
      const id = world.getBlock(x, y, z);
      if (id !== -1 && !SOLID[id]) continue;
      const boxes = id > 0 && defs[id].shape ? collisionBoxes(world, x, y, z, id) : null;
      if (!boxes) { add(x, y, z, x + 1, y + 1, z + 1); continue; }
      for (const b of boxes) if (b[0] < x1 && b[3] > x0 && b[1] < y1 && b[4] > y0 && b[2] < z1 && b[5] > z0) add(b[0], b[1], b[2], b[3], b[4], b[5]);
    }
    if (hit) { hit.top = hit.maxY; hit.bottom = hit.minY; }
    return hit;
  }
  // door / bed helpers
  function doorInfo(id) { const d = defs[id]; return d && d.door; }
  function doorId(base, f, open, upper) { return base + f * 4 + (open ? 2 : 0) + (upper ? 1 : 0); }
  function bedInfo(id) { const d = defs[id]; return d && d.bed; }
  function facingFromYaw(yaw) { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 0 : 2); }
  const isFluid = (id) => id > 0 && FLUID[id] > 0;
  VC.Blocks = { defs, SOLID, OPAQUE, RENDER, TEX, LIGHT, FLUID, LEVEL, ORDER, DIRS, shape, aabbHit, doorInfo, doorId, bedInfo, facingFromYaw, isFluid };
})();
