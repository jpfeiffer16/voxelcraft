/* World: block table, generation (port of js/world.js Generator), lighting */

static void def(VC *g, int id, int render, int flags, int top, int side, int bottom) {
  BDef *d = &g->bd[id]; d->render = (u8)render; d->flags = (u8)flags; d->top = (u8)top; d->side = (u8)side; d->bottom = (u8)bottom; d->light = 0; d->kind = K_BLOCK; d->arg = 0;
}
#define D1(id, r, f, t) def(g, id, r, f, t, t, t)
#define OP (F_SOLID | F_OPAQUE | F_PLACE)
VC_STATIC void blocks_init(VC *g) {
  int i, f;
  for (i = 0; i < 256; i++) def(g, i, R_NONE, 0, 0, 0, 0);
  def(g, GRASS, R_OPAQUE, OP, T_GRASS_TOP, T_GRASS_SIDE, T_DIRT);
  D1(DIRT, R_OPAQUE, OP, T_DIRT); D1(STONE, R_OPAQUE, OP, T_STONE); D1(SAND, R_OPAQUE, OP, T_SAND);
  D1(WATER, R_WATER, F_PLACE, T_WATER);
  def(g, LOG, R_OPAQUE, OP, T_LOG_TOP, T_LOG_SIDE, T_LOG_TOP);
  D1(LEAVES, R_CUTOUT, F_SOLID | F_PLACE, T_LEAVES); D1(GLASS, R_CUTOUT, F_SOLID | F_PLACE, T_GLASS);
  D1(PLANKS, R_OPAQUE, OP, T_PLANKS); D1(COBBLE, R_OPAQUE, OP, T_COBBLE); D1(BEDROCK, R_OPAQUE, F_SOLID | F_OPAQUE, T_BEDROCK);
  D1(COAL, R_OPAQUE, OP, T_COAL); D1(IRON, R_OPAQUE, OP, T_IRON); D1(BRICK, R_OPAQUE, OP, T_BRICK);
  def(g, SNOW, R_OPAQUE, OP, T_SNOW, T_SNOW_SIDE, T_DIRT);
  D1(TALLGRASS, R_CROSS, F_PLACE, T_TALLGRASS); D1(ROSE, R_CROSS, F_PLACE, T_FLOWER_RED); D1(DANDELION, R_CROSS, F_PLACE, T_FLOWER_YELLOW);
  D1(GRAVEL, R_OPAQUE, OP, T_GRAVEL); D1(GOLD, R_OPAQUE, OP, T_GOLD); D1(STONE_BRICKS, R_OPAQUE, OP, T_STONE_BRICKS);
  def(g, BOOKSHELF, R_OPAQUE, OP, T_PLANKS, T_BOOKSHELF, T_PLANKS);
  def(g, SANDSTONE, R_OPAQUE, OP, T_SANDSTONE_TOP, T_SANDSTONE_SIDE, T_SANDSTONE_TOP);
  def(g, CACTUS, R_OPAQUE, OP, T_CACTUS_TOP, T_CACTUS_SIDE, T_CACTUS_TOP);
  D1(WOOL_WHITE, R_OPAQUE, OP, T_WOOL_WHITE); D1(WOOL_RED, R_OPAQUE, OP, T_WOOL_RED); D1(WOOL_BLUE, R_OPAQUE, OP, T_WOOL_BLUE);
  D1(GLOWSTONE, R_OPAQUE, OP, T_GLOWSTONE); g->bd[GLOWSTONE].light = 15;
  D1(OBSIDIAN, R_OPAQUE, OP, T_OBSIDIAN);
  def(g, BIRCH_LOG, R_OPAQUE, OP, T_LOG_TOP, T_BIRCH_SIDE, T_LOG_TOP);
  D1(BIRCH_LEAVES, R_CUTOUT, F_SOLID | F_PLACE, T_BIRCH_LEAVES);
  D1(TORCH, R_TORCH, F_PLACE, T_TORCH); g->bd[TORCH].light = 14;
  D1(LANTERN, R_TORCH, F_PLACE, T_LANTERN); g->bd[LANTERN].light = 15;
  def(g, CRAFTING_TABLE, R_OPAQUE, OP, T_CRAFT_TOP, T_CRAFT_SIDE, T_PLANKS);
  def(g, PUMPKIN, R_OPAQUE, OP, T_PUMPKIN_TOP, T_PUMPKIN_SIDE, T_PUMPKIN_TOP);
  def(g, JACK_O_LANTERN, R_OPAQUE, OP, T_PUMPKIN_TOP, T_JACK_FACE, T_PUMPKIN_TOP); g->bd[JACK_O_LANTERN].light = 15;
  D1(WOOL_YELLOW, R_OPAQUE, OP, T_WOOL_YELLOW); D1(WOOL_LIME, R_OPAQUE, OP, T_WOOL_LIME); D1(WOOL_GREEN, R_OPAQUE, OP, T_WOOL_GREEN);
  D1(WOOL_ORANGE, R_OPAQUE, OP, T_WOOL_ORANGE); D1(WOOL_PURPLE, R_OPAQUE, OP, T_WOOL_PURPLE); D1(WOOL_CYAN, R_OPAQUE, OP, T_WOOL_CYAN);
  D1(WOOL_PINK, R_OPAQUE, OP, T_WOOL_PINK); D1(WOOL_BLACK, R_OPAQUE, OP, T_WOOL_BLACK); D1(WOOL_GRAY, R_OPAQUE, OP, T_WOOL_GRAY);
  D1(MOSSY_COBBLE, R_OPAQUE, OP, T_MOSSY);
  def(g, HAY, R_OPAQUE, OP, T_HAY_TOP, T_HAY_SIDE, T_HAY_TOP);
  def(g, MELON, R_OPAQUE, OP, T_MELON_TOP, T_MELON_SIDE, T_MELON_TOP);
  D1(BLUE_FLOWER, R_CROSS, F_PLACE, T_FLOWER_BLUE); D1(TULIP, R_CROSS, F_PLACE, T_TULIP);
  D1(MUSHROOM, R_CROSS, F_PLACE, T_MUSHROOM); g->bd[MUSHROOM].light = 1;
  D1(TERRACOTTA, R_OPAQUE, OP, T_TERRACOTTA);
  def(g, TNT, R_OPAQUE, OP, T_TNT_TOP, T_TNT_SIDE, T_TNT_BOTTOM);
  D1(OAK_WINDOW, R_CUTOUT, F_SOLID | F_PLACE, T_OAK_WINDOW);
  D1(STAINED_BLUE, R_GLASS, F_SOLID | F_PLACE, T_STAINED_BLUE); D1(STAINED_AMBER, R_GLASS, F_SOLID | F_PLACE, T_STAINED_AMBER);
  D1(LAVA, R_LAVA, F_PLACE, T_LAVA); g->bd[LAVA].light = 15;
  def(g, 63, R_OPAQUE, F_SOLID | F_OPAQUE, T_TNT_TOP, T_TNT_SIDE, T_TNT_BOTTOM); /* lit TNT */
  for (f = 0; f < 16; f++) { def(g, OAK_DOOR + f, R_DOOR, (f & 2) ? 0 : F_SOLID, (f & 1) ? T_DOOR_TOP : T_DOOR_BOTTOM, (f & 1) ? T_DOOR_TOP : T_DOOR_BOTTOM, T_DOOR_BOTTOM); }
  for (f = 0; f < 8; f++) { def(g, BED + f, R_BED, F_SOLID, (f & 1) ? T_BED_HEAD_TOP : T_BED_FOOT_TOP, T_BED_SIDE, T_PLANKS); }
  /* items */
#define ITEM(id, t, k, a) do { def(g, id, R_NONE, F_ITEM | F_PLACE, t, t, t); g->bd[id].kind = (u8)(k); g->bd[id].arg = (u8)(a); } while (0)
  ITEM(HORSE_EGG, T_HORSE_EGG, K_EGG, M_HORSE); ITEM(DOG_EGG, T_DOG_EGG, K_EGG, M_DOG); ITEM(CAT_EGG, T_CAT_EGG, K_EGG, M_CAT);
  ITEM(LION_EGG, T_LION_EGG, K_EGG, M_LION); ITEM(WOLF_EGG, T_WOLF_EGG, K_EGG, M_WOLF); ITEM(SPIDER_EGG, T_SPIDER_EGG, K_EGG, M_SPIDER);
  ITEM(ZOMBIE_EGG, T_ZOMBIE_EGG, K_EGG, M_ZOMBIE);
  ITEM(WOOD_SWORD, T_WOOD_SWORD, K_SWORD, 4); ITEM(STONE_SWORD, T_STONE_SWORD, K_SWORD, 5); ITEM(IRON_SWORD, T_IRON_SWORD, K_SWORD, 6);
  ITEM(DIAMOND_SWORD, T_DIAMOND_SWORD, K_SWORD, 8); ITEM(IRON_AXE, T_IRON_AXE, K_SWORD, 7);
  ITEM(STEAK, T_STEAK, K_FOOD, 8); ITEM(APPLE, T_APPLE, K_FOOD, 4);
  ITEM(OAK_DOOR_ITEM, T_DOOR_ITEM, K_DOOR, 0); ITEM(BED_ITEM, T_BED_ITEM, K_BED, 0);
  /* light curve (Minecraft-ish 0.8^(15-n)), 0..255 */
  { static const u8 LC[16] = {9, 11, 14, 18, 22, 28, 35, 44, 55, 69, 86, 107, 134, 168, 210, 255}; for (i = 0; i < 16; i++) g->lightCurve[i] = LC[i]; }
}
#define BD(g, id) ((g)->bd[(u8)(id)])
#define SOLIDB(g, id) (BD(g, id).flags & F_SOLID)
#define OPAQUEB(g, id) (BD(g, id).flags & F_OPAQUE)

static inline int getb(const VC *g, int x, int y, int z) {
  if ((unsigned)x >= WX || (unsigned)z >= WZ) return y <= SEA ? WATER : AIR;
  if (y < 0) return BEDROCK; if (y >= WY) return AIR;
  return g->blocks[IDX(x, y, z)];
}

/* ---------------- generation ---------------- */
enum { N_CONT, N_HILL, N_DET, N_MOUNT, N_CAVEA, N_CAVEB, N_CHEESE, N_TEMP, N_FOREST };
/* x / d in 16.16 by a reciprocal multiply (d is a compile-time constant at every call site) */
#define divc(x, d) ((fx)(((s64)(x) * (s64)((0x100000000LL + (d) - 1) / (d))) >> 16))
static HOT int web_height(VC *g, int wx, int wz) { /* js Generator.height (unclamped), web coordinates */
  fx c = fbm2(g->perm[N_CONT], divc(wx, 700), divc(wz, 700), 3);
  fx hills = fbm2(g->perm[N_HILL], divc(wx, 160), divc(wz, 160), 4);
  fx det = fbm2(g->perm[N_DET], divc(wx, 40), divc(wz, 40), 2);
  fx m = fbm2(g->perm[N_MOUNT], divc(wx, 300), divc(wz, 300), 4);
  fx h;
  m -= FX(0.05); if (m < 0) m = 0; m = fmul(fmul(m, m), FX(160));
  h = ((SEA + 3) << 16) + c * 16 + hills * 9 + fmul(det, FX(2.5)) + m;
  return h >> 16;
}
/* island falloff near the edge of our 96x96 slice + mountain compression to fit 64 blocks */
static int palm_height(int h, int x, int z) {
  int e = x < z ? x : z, e2 = (WX - 1 - x) < (WZ - 1 - z) ? (WX - 1 - x) : (WZ - 1 - z);
  if (e2 < e) e = e2;
  if (h > 44) h = 44 + (h - 44) / 4;
  if (e < 10) { int sea = SEA - 6; h = sea + (h - sea) * e / 10; }
  if (h < 3) h = 3; if (h > WY - 7) h = WY - 7;
  return h;
}
static HOT int cave_raw(VC *g, int wx, int y, int wz, int h) {
  fx a = noise3(g->perm[N_CAVEA], divc(wx, 45), divc(y, 28), divc(wz, 45));
  fx b = noise3(g->perm[N_CAVEB], divc(wx, 45), divc(y, 28), divc(wz, 45));
  if (fmul(a, a) + fmul(b, b) < 393) return 1;            /* < 0.006 */
  if (y < h - 8 && noise3(g->perm[N_CHEESE], divc(wx, 70), divc(y, 35), divc(wz, 70)) > FX(0.62)) return 1;
  return 0;
}
static int is_cave(VC *g, int wx, int y, int wz, int h) {
  if (y < 3 || y > h) return 0;
  if (h < SEA + 3 && y > h - 6) return 0;
  if (y >= h - 2) return cave_raw(g, wx, y, wz, h) && cave_raw(g, wx, h - 3, wz, h) && cave_raw(g, wx, h - 4, wz, h);
  return cave_raw(g, wx, y, wz, h);
}
static HOT void gen_column(VC *g, int x, int z) {
  int wx = x - ORIGIN, wz = z - ORIGIN, y, i = x + z * WX;
  u32 seed = g->seed;
  int hw = web_height(g, wx, wz), h;
  if (hw < 3) hw = 3; if (hw > 116) hw = 116;
  h = palm_height(hw, x, z);
  fx temp = fbm2(g->perm[N_TEMP], divc(wx, 500), divc(wz, 500), 2);
  fx forest = fbm2(g->perm[N_FOREST], divc(wx, 120), divc(wz, 120), 2);
  int desert = temp > FX(0.35), beach = h <= SEA + 1 && h >= SEA - 3;
  int snowy = hw > 78 + (int)((hash3u(wx, 0, wz, seed) >> 16) * 6 >> 16);
  int surface, sub, bedrockTop = 1 + (int)(((u64)hash3u(wx, 5, wz, seed) * 3) >> 32);
  g->genH[i] = (s16)h; g->genT[i] = (s8)(temp * 100 >> 16); g->genF[i] = (s8)(forest * 100 >> 16);
  if (h < SEA - 3) { surface = hash3u(wx, 1, wz, seed) < P32(0.3) ? GRAVEL : (h < SEA - 8 ? GRAVEL : SAND); sub = DIRT; if (hash3u(wx, 2, wz, seed) < P32(0.5)) surface = SAND; }
  else if (desert) { surface = SAND; sub = SAND; }
  else if (beach) { surface = SAND; sub = SAND; }
  else if (hw > 95) { surface = STONE; sub = STONE; }
  else if (snowy) { surface = SNOW; sub = DIRT; }
  else { surface = GRASS; sub = DIRT; }
  for (y = 0; y < WY; y++) {
    int id = AIR;
    if (y < bedrockTop) id = BEDROCK;
    else if (y < h - 3) {
      id = STONE;
      if (desert && y >= h - 6) id = SANDSTONE;
      else { u32 r = hash3u(wx, y, wz, seed);
        if (r < P32(0.012) && y < 90) id = COAL; else if (r < P32(0.018) && y < 50) id = IRON; else if (r < P32(0.0195) && y < 24) id = GOLD; }
    } else if (y < h) id = sub;
    else if (y == h) id = surface;
    else if (y <= SEA) id = WATER;
    if (id != AIR && id != WATER && id != BEDROCK && y <= h && is_cave(g, wx, y, wz, h)) id = y < 7 ? LAVA : AIR;
    g->blocks[IDX(x, y, z)] = (u8)id;
  }
  if (surface == GRASS && h > SEA && g->blocks[IDX(x, h, z)] == GRASS && h + 1 < WY) {
    u32 r = hash3u(wx, 13, wz, seed);
    if (r < P32(0.10)) g->blocks[IDX(x, h + 1, z)] = TALLGRASS;
    else if (r < P32(0.108)) g->blocks[IDX(x, h + 1, z)] = ROSE;
    else if (r < P32(0.116)) g->blocks[IDX(x, h + 1, z)] = DANDELION;
  }
}
static void tset(VC *g, int x, int y, int z, int id, int force) {
  int cur;
  if ((unsigned)x >= WX || (unsigned)z >= WZ || (unsigned)y >= WY) return;
  cur = g->blocks[IDX(x, y, z)];
  if (force || cur == AIR || cur == TALLGRASS || cur == ROSE || cur == DANDELION) g->blocks[IDX(x, y, z)] = (u8)id;
}
/* One world row of trees/cacti. tset() clips x/z/y so canopies at the map edge are safe. */
static void gen_trees_row(VC *g, int z) {
  int x; u32 seed = g->seed;
  if ((unsigned)z >= WZ) return;
  for (x = 0; x < WX; x++) {
    int i = x + z * WX, h = g->genH[i], wx = x - ORIGIN, wz = z - ORIGIN, height, base, top, y, dx, dz, birch, logb, leaf;
    u32 r = hash3u(wx, 7, wz, seed);
    fx temp = g->genT[i], forest = g->genF[i];
    if (h <= SEA + 1 || h > 52 || h < 0 || h >= WY) continue;
    if (g->blocks[IDX(x, h, z)] != GRASS && g->blocks[IDX(x, h, z)] != SAND && g->blocks[IDX(x, h, z)] != SNOW) continue;
    if (temp > 35) { /* desert: cactus */
      if (r < P32(0.004) && !is_cave(g, wx, h, wz, h)) { height = 2 + (int)(((u64)hash3u(wx, 9, wz, seed) * 2) >> 32); for (y = 0; y < height; y++) tset(g, x, h + 1 + y, z, CACTUS, 1); }
      continue;
    }
    {
      u32 chance = forest > 15 ? P32(0.045) : forest > -10 ? P32(0.012) : P32(0.003);
      if (r >= chance || is_cave(g, wx, h, wz, h)) continue;
    }
    birch = hash3u(wx, 11, wz, seed) < (forest > 30 ? P32(0.35) : P32(0.15));
    height = 4 + (int)(((u64)hash3u(wx, 3, wz, seed) * 3) >> 32);
    logb = birch ? BIRCH_LOG : LOG; leaf = birch ? BIRCH_LEAVES : LEAVES;
    base = h + 1; top = base + height;
    if (top >= WY - 1) continue;
    for (y = top - 3; y <= top; y++) {
      int rr = y >= top - 1 ? 1 : 2;
      for (dz = -rr; dz <= rr; dz++) for (dx = -rr; dx <= rr; dx++) {
        if (rr == 2 && (dx == 2 || dx == -2) && (dz == 2 || dz == -2) && hash3u(wx + dx, y, wz + dz, seed) < P32(0.6)) continue;
        if (y == top && (dx < 0 ? -dx : dx) + (dz < 0 ? -dz : dz) > 1) continue;
        tset(g, x + dx, y, z + dz, leaf, 0);
      }
    }
    for (y = base; y < top; y++) tset(g, x, y, z, logb, 1);
    if ((unsigned)x < WX && (unsigned)h < WY) g->blocks[IDX(x, h, z)] = DIRT;
  }
}
static void gen_trees(VC *g) {
  int z; for (z = 0; z < WZ; z++) gen_trees_row(g, z);
}

/* ---------------- lighting ---------------- */
#define LQN 65536
static int lightAtten(const VC *g, int id) { return (id == WATER || id == LEAVES || id == BIRCH_LEAVES) ? 2 : 1; }
static int passLight(const VC *g, int id) { return !(g->bd[id].flags & F_OPAQUE); }
/* Pack x/z/y in the BFS queue so we never divide (XScale has no integer-div insn;
 * gcc -Os would otherwise emit a libgcc helper, and a 32-bit % / of the linear index
 * is also easy to get wrong). x and z fit in 8 bits (0..95), y in 8 bits (0..63). */
#define LQPACK(x, y, z) ((u32)(x) | ((u32)(z) << 8) | ((u32)(y) << 16))
#define LQX(p) ((int)((p) & 255u))
#define LQZ(p) ((int)(((p) >> 8) & 255u))
#define LQY(p) ((int)(((p) >> 16) & 255u))
/* BFS over [x0,x1]x[z0,z1] (all y). nib: 0 = block light (low), 4 = sky light (high) */
static HOT void light_bfs(VC *g, u32 qh, u32 qt, int nib, int x0, int x1, int z0, int z1) {
  u8 *L = g->light; const u8 *B = g->blocks;
  while (qh != qt) {
    u32 p = g->lq[qh & (LQN - 1)]; int v, x, y, z, k;
    qh++;
    x = LQX(p); z = LQZ(p); y = LQY(p);
    if ((unsigned)x >= WX || (unsigned)z >= WZ || (unsigned)y >= WY) continue;
    v = (L[IDX(x, y, z)] >> nib) & 15; if (v <= 1) continue;
    for (k = 0; k < 6; k++) {
      int nx = x, ny = y, nz = z; u32 ni; int id, nv;
      if (k == 0) nx--; else if (k == 1) nx++; else if (k == 2) nz--; else if (k == 3) nz++; else if (k == 4) ny--; else ny++;
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || (unsigned)ny >= WY) continue;
      ni = IDX(nx, ny, nz); id = B[ni];
      if (!passLight(g, id)) continue;
      nv = v - lightAtten(g, id);
      if (nv > ((L[ni] >> nib) & 15)) {
        L[ni] = (u8)((L[ni] & ~(15 << nib)) | (nv << nib));
        if (qt - qh < LQN - 1) { g->lq[qt & (LQN - 1)] = LQPACK(nx, ny, nz); qt++; }
      }
    }
  }
}
static void hmap_col(VC *g, int x, int z) {
  int y; for (y = WY - 1; y > 0; y--) { int id = g->blocks[IDX(x, y, z)]; if (g->bd[id].flags & F_OPAQUE || id == WATER || id == LEAVES || id == BIRCH_LEAVES) break; }
  g->hmap[x + z * WX] = (u8)y;
}
/* recompute light in a box (r = radius in x/z, full height); cells outside keep their values and seed the border */
VC_STATIC void light_region(VC *g, int cx, int cz, int r) {
  int x0 = cx - r, x1 = cx + r, z0 = cz - r, z1 = cz + r, x, y, z, pass;
  if (x0 < 0) x0 = 0; if (z0 < 0) z0 = 0; if (x1 > WX - 1) x1 = WX - 1; if (z1 > WZ - 1) z1 = WZ - 1;
  for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) {
    int s = 15;
    hmap_col(g, x, z);
    for (y = WY - 1; y >= 0; y--) {
      u32 i = IDX(x, y, z); int id = g->blocks[i];
      if (!passLight(g, id)) s = 0; else if (id != AIR && s > 0 && id != TORCH && g->bd[id].render != R_CROSS) { s -= lightAtten(g, id); if (s < 0) s = 0; }
      g->light[i] = (u8)((s << 4) | g->bd[id].light);
    }
  }
  for (pass = 0; pass < 2; pass++) {
    int nib = pass ? 0 : 4; u32 qt = 0;
    for (z = z0 - 1; z <= z1 + 1; z++) for (x = x0 - 1; x <= x1 + 1; x++) {
      int border = x < x0 || x > x1 || z < z0 || z > z1;
      if ((unsigned)x >= WX || (unsigned)z >= WZ) continue;
      for (y = 0; y < WY; y++) {
        u32 i = IDX(x, y, z); int v = (g->light[i] >> nib) & 15;
        if (v <= 1) continue;
        if (!border && nib == 4 && v == 15) {
          /* only sky cells next to something darker need spreading */
          int need = 0;
          if (x > 0 && ((g->light[i - 1] >> 4) < 14) && passLight(g, g->blocks[i - 1])) need = 1;
          else if (x < WX - 1 && ((g->light[i + 1] >> 4) < 14) && passLight(g, g->blocks[i + 1])) need = 1;
          else if (z > 0 && ((g->light[i - WX] >> 4) < 14) && passLight(g, g->blocks[i - WX])) need = 1;
          else if (z < WZ - 1 && ((g->light[i + WX] >> 4) < 14) && passLight(g, g->blocks[i + WX])) need = 1;
          if (!need) continue;
        }
        if (border) {
          /* a border cell only matters if it touches the box */
        }
        if (qt < LQN - 1) g->lq[qt++] = LQPACK(x, y, z);
      }
    }
    light_bfs(g, 0, qt, nib, x0, x1, z0, z1);
  }
}
static int light_at(const VC *g, int x, int y, int z) {
  if ((unsigned)x >= WX || (unsigned)z >= WZ || y >= WY) return 0xF0;
  if (y < 0) return 0;
  return g->light[IDX(x, y, z)];
}
