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
  };
  const B = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, LOG: 6, LEAVES: 7, GLASS: 8, PLANKS: 9,
    COBBLE: 10, BEDROCK: 11, COAL: 12, IRON: 13, BRICK: 14, SNOW: 15, TALLGRASS: 16, ROSE: 17, DANDELION: 18,
    GRAVEL: 19, GOLD: 20, STONE_BRICKS: 21, BOOKSHELF: 22, SANDSTONE: 23, CACTUS: 24, WOOL_WHITE: 25,
    WOOL_RED: 26, WOOL_BLUE: 27, GLOWSTONE: 28, OBSIDIAN: 29, BIRCH_LOG: 30, BIRCH_LEAVES: 31,
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
  def(B.GLOWSTONE, 'Glowstone', T.glowstone, { glow: true });
  def(B.OBSIDIAN, 'Obsidian', T.obsidian);
  def(B.BIRCH_LOG, 'Birch Log', { top: T.log_top, bottom: T.log_top, side: T.birch_side });
  def(B.BIRCH_LEAVES, 'Birch Leaves', T.birch_leaves, { render: 'cutout' });

  const N = 256;
  // Fast lookup tables
  const SOLID = new Uint8Array(N), OPAQUE = new Uint8Array(N), RENDER = new Uint8Array(N); // RENDER: 0 none,1 opaque,2 cutout,3 water,4 cross
  const TEX = new Uint8Array(N * 3); // top, bottom, side
  const rmap = { none: 0, opaque: 1, cutout: 2, water: 3, cross: 4 };
  for (const d of defs) {
    if (!d) continue;
    SOLID[d.id] = d.solid ? 1 : 0;
    OPAQUE[d.id] = d.render === 'opaque' ? 1 : 0;
    RENDER[d.id] = rmap[d.render];
    TEX[d.id * 3] = d.top; TEX[d.id * 3 + 1] = d.bottom; TEX[d.id * 3 + 2] = d.side;
  }
  VC.T = T; VC.B = B; VC.Blocks = { defs, SOLID, OPAQUE, RENDER, TEX };
})();
