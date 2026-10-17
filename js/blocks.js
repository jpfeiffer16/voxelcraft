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
  };
  const B = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, GLASS: 8, PLANKS: 9,
    COBBLE: 10, BEDROCK: 11, COAL: 12, IRON: 13, BRICK: 14, SNOW: 15, TALLGRASS: 16, ROSE: 17, DANDELION: 18,
    GRAVEL: 19, GOLD: 20, STONE_BRICKS: 21, BOOKSHELF: 22, SANDSTONE: 23, CACTUS: 24, WOOL_WHITE: 25,
    WOOL_RED: 26, WOOL_BLUE: 27, GLOWSTONE: 28, OBSIDIAN: 29, BIRCH_LOG: 30, BIRCH_LEAVES: 31,
    TORCH: 32, TORCH_PX: 33, TORCH_NX: 34, TORCH_PZ: 35, TORCH_NZ: 36, LANTERN: 37, CRAFTING_TABLE: 38,
    PUMPKIN: 39, JACK_O_LANTERN: 40, WOOL_YELLOW: 41, WOOL_LIME: 42, WOOL_GREEN: 43, WOOL_ORANGE: 44,
    WOOL_PURPLE: 45, WOOL_CYAN: 46, WOOL_PINK: 47, WOOL_BLACK: 48, WOOL_GRAY: 49, MOSSY_COBBLE: 50, HAY: 51,
    MELON: 52, BLUE_FLOWER: 53, MUSHROOM: 54, TERRACOTTA: 55, TULIP: 56,
    DOG_EGG: 200, CAT_EGG: 201,
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
  def(B.WATER, 'Water', T.water, { render: 'water', solid: false });
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

  const N = 256;
  // Fast lookup tables
  const SOLID = new Uint8Array(N), OPAQUE = new Uint8Array(N), RENDER = new Uint8Array(N); // RENDER: 0 none,1 opaque,2 cutout,3 water,4 cross,5 model
  const LIGHT = new Uint8Array(N); // emitted block light 0-15
  const TEX = new Uint8Array(N * 3); // top, bottom, side
  const rmap = { none: 0, opaque: 1, cutout: 2, water: 3, cross: 4, model: 5, item: 0 };
  for (const d of defs) {
    if (!d) continue;
    SOLID[d.id] = d.solid ? 1 : 0;
    OPAQUE[d.id] = d.render === 'opaque' ? 1 : 0;
    RENDER[d.id] = rmap[d.render];
    LIGHT[d.id] = d.light || 0;
    TEX[d.id * 3] = d.top; TEX[d.id * 3 + 1] = d.bottom; TEX[d.id * 3 + 2] = d.side;
  }
  VC.T = T; VC.B = B; // Order shown in the block menu
  const ORDER = [B.TORCH, B.LANTERN, B.DOG_EGG, B.CAT_EGG, B.GLOWSTONE, B.JACK_O_LANTERN, B.PUMPKIN, B.CRAFTING_TABLE, B.BOOKSHELF,
    B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.MOSSY_COBBLE, B.STONE_BRICKS, B.BRICK, B.PLANKS, B.LOG, B.BIRCH_LOG, B.LEAVES, B.BIRCH_LEAVES,
    B.GLASS, B.SAND, B.SANDSTONE, B.GRAVEL, B.SNOW, B.TERRACOTTA, B.HAY, B.MELON, B.CACTUS, B.OBSIDIAN, B.COAL, B.IRON, B.GOLD,
    B.WOOL_WHITE, B.WOOL_GRAY, B.WOOL_BLACK, B.WOOL_RED, B.WOOL_ORANGE, B.WOOL_YELLOW, B.WOOL_LIME, B.WOOL_GREEN, B.WOOL_CYAN,
    B.WOOL_BLUE, B.WOOL_PURPLE, B.WOOL_PINK, B.TALLGRASS, B.ROSE, B.DANDELION, B.BLUE_FLOWER, B.TULIP, B.MUSHROOM, B.WATER];
  VC.Blocks = { defs, SOLID, OPAQUE, RENDER, TEX, LIGHT, ORDER };
})();
