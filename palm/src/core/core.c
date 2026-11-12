/* Unity build of the VoxelCraft core + the frame driver, HUD, menus, save/load */
#include "vc.h"
#include "mathx.c"
#include "world.c"
#include "render.c"
#include "game.c"

static void zero(void *p, u32 n) { u8 *b = (u8 *)p; u32 i; for (i = 0; i < n; i++) b[i] = 0; }
/* no pointer tables (the ARM blob has no relocations): names are one '|'-separated string */
static const u8 NAME_IDS[] = {GRASS, DIRT, STONE, SAND, WATER, LOG, LEAVES, GLASS, PLANKS, COBBLE, BEDROCK, COAL, IRON, BRICK, SNOW, TALLGRASS, ROSE, DANDELION, GRAVEL, GOLD, STONE_BRICKS, BOOKSHELF, SANDSTONE, CACTUS, WOOL_WHITE, WOOL_RED, WOOL_BLUE, GLOWSTONE, OBSIDIAN, BIRCH_LOG, BIRCH_LEAVES, TORCH, LANTERN, CRAFTING_TABLE, PUMPKIN, JACK_O_LANTERN, WOOL_YELLOW, WOOL_LIME, WOOL_GREEN, WOOL_ORANGE, WOOL_PURPLE, WOOL_CYAN, WOOL_PINK, WOOL_BLACK, WOOL_GRAY, MOSSY_COBBLE, HAY, MELON, BLUE_FLOWER, MUSHROOM, TERRACOTTA, TULIP, TNT, OAK_WINDOW, STAINED_BLUE, STAINED_AMBER, LAVA, DOG_EGG, CAT_EGG, LION_EGG, OAK_DOOR_ITEM, BED_ITEM, WOLF_EGG, SPIDER_EGG, ZOMBIE_EGG, HORSE_EGG, WOOD_SWORD, STONE_SWORD, IRON_SWORD, DIAMOND_SWORD, IRON_AXE, STEAK, APPLE, 0};
static const char NAME_BLOB[] = "Grass|Dirt|Stone|Sand|Water|Oak Log|Leaves|Glass|Planks|Cobblestone|Bedrock|Coal Ore|Iron Ore|Bricks|Snowy Grass|Tall Grass|Rose|Dandelion|Gravel|Gold Ore|Stone Bricks|Bookshelf|Sandstone|Cactus|White Wool|Red Wool|Blue Wool|Glowstone|Obsidian|Birch Log|Birch Leaves|Torch|Lantern|Crafting Table|Pumpkin|Jack o'Lantern|Yellow Wool|Lime Wool|Green Wool|Orange Wool|Purple Wool|Cyan Wool|Pink Wool|Black Wool|Gray Wool|Mossy Cobblestone|Hay Bale|Melon|Cornflower|Mushroom|Terracotta|Pink Tulip|TNT|Oak Window|Blue Stained Glass|Amber Stained Glass|Lava|Dog Spawn Egg|Cat Spawn Egg|Lion Spawn Egg|Oak Door|Bed|Wolf Spawn Egg|Spider Spawn Egg|Zombie Spawn Egg|Horse Spawn Egg|Wooden Sword|Stone Sword|Iron Sword|Diamond Sword|Iron Axe|Steak|Apple|";
static const char *bname_r(int id, char *out) {
  int i, k = 0; const char *p = NAME_BLOB;
  for (i = 0; NAME_IDS[i]; i++) { if (NAME_IDS[i] == id) { while (*p != '|' && k < 31) out[k++] = *p++; out[k] = 0; return out; } while (*p != '|') p++; p++; }
  out[0] = '?'; out[1] = 0; return out;
}

static void new_player(VC *g) {
  static const int HB[9] = {IRON_SWORD, TNT, GRASS, PLANKS, COBBLE, TORCH, OAK_DOOR_ITEM, STEAK, HORSE_EGG};
  int i;
  for (i = 0; i < 9; i++) g->hotbar[i] = HB[i];
  g->sel = 0; g->maxHealth = 20; g->health = 20; g->yaw = 0; g->pitch = 0;
  g->worldTime = 214748365u; /* 0.05 like the web (about 07:12) */
  g->hostileOn = 1; g->soundOn = 1; g->hotDirty = 1;
}
void vc_setup(VC *g, const u16 *t0, const u16 *t1, const u16 *const *spr, u32 seed) {
  int i, be = g->pixfmtBE;
  zero(g, sizeof(VC));
  g->magic = 0x56584346; g->size = sizeof(VC); g->pixfmtBE = be;
  g->tiles[0] = t0; g->tiles[1] = t1;
  for (i = 0; i < M_TYPES; i++) g->spr[i] = spr[i];
  math_init(g); blocks_init(g);
  g->seed = seed; g->rng = seed ^ 0x9e3779b9u;
  { static const u32 SX[9] = {0x1234, 0x5678, 0x9abc, 0xdef0, 0x1111, 0x2222, 0x3333, 0x4444, 0x5555}; for (i = 0; i < 9; i++) simplex_init(g->perm[i], seed ^ SX[i]); }
  /* inventory order: horse egg first (like the web), then blocks, then items */
  g->invN = 0; g->invList[g->invN++] = HORSE_EGG;
  for (i = 1; i < 128; i++) if ((g->bd[i].flags & F_PLACE) && g->bd[i].render != R_NONE && i != 63 && !(i >= OAK_DOOR && i < BED + 8)) g->invList[g->invN++] = i;
  { static const int IT[] = {OAK_DOOR_ITEM, BED_ITEM, DOG_EGG, CAT_EGG, LION_EGG, WOLF_EGG, SPIDER_EGG, ZOMBIE_EGG, WOOD_SWORD, STONE_SWORD, IRON_SWORD, DIAMOND_SWORD, IRON_AXE, STEAK, APPLE};
    for (i = 0; i < (int)(sizeof(IT) / sizeof(IT[0])); i++) g->invList[g->invN++] = IT[i]; }
  new_player(g);
  g->genStage = 0; g->genRow = 0;
}
int vc_gen_step(VC *g) {
  int i;
  if (g->genStage == 0) { /* terrain columns: 4 rows per call */
    for (i = 0; i < 4 && g->genRow < WZ; i++, g->genRow++) { int x; for (x = 0; x < WX; x++) gen_column(g, x, g->genRow); }
    if (g->genRow >= WZ) { g->genStage = 1; g->genRow = 0; return 70; }
    return g->genRow * 70 / WZ;
  }
  if (g->genStage == 1) { /* trees: 4 rows per call so we yield back to Palm OS */
    for (i = 0; i < 4 && g->genRow < WZ; i++, g->genRow++) gen_trees_row(g, g->genRow);
    if (g->genRow >= WZ) { g->genStage = 2; g->genRow = 0; return 90; }
    return 70 + g->genRow * 20 / WZ;
  }
  if (g->genStage == 2) { light_region(g, WX / 2, WZ / 2, WX); g->genStage = 3; return 99; }
  if (g->genStage == 3) {
    sky_update(g); find_spawn(g); g->px = g->spawnX; g->py = g->spawnY; g->pz = g->spawnZ;
    { int k; for (k = 0; k < 6; k++) natural_spawn(g); }
    g->genStage = 4; g->state = ST_PLAY; g->spawnTimer = 400;
    if (!g->eggNote) { toast(g, "Pink Horse Spawn Egg in slot 9!"); g->eggNote = 1; }
    camera_update(g);
  }
  return 100;
}

/* ---------------- HUD ---------------- */
static void draw_hotbar(VC *g) {
  int i;
  g->clipH = SH;
  fill(g, 0, HOTY, SW, SH - HOTY, RGB(40, 40, 44));
  fill(g, 0, HOTY, SW, 1, RGB(90, 90, 96));
  /* menu button (left) */
  fill(g, 3, HOTY + 9, 10, 2, RGB(230, 230, 230)); fill(g, 3, HOTY + 15, 10, 2, RGB(230, 230, 230)); fill(g, 3, HOTY + 21, 10, 2, RGB(230, 230, 230));
  /* inventory button (right) */
  for (i = 0; i < 3; i++) fill(g, 306 + i * 4, HOTY + 15, 2, 2, RGB(230, 230, 230));
  for (i = 0; i < 9; i++) {
    int x = 16 + i * 32;
    fill(g, x + 1, HOTY + 2, 30, 29, RGB(70, 70, 76));
    draw_iso(g, x + 3, HOTY + 4, 26, g->hotbar[i]);
    if (i == g->sel) { frame_rect(g, x, HOTY + 1, 32, 31, RGB(255, 255, 255)); frame_rect(g, x + 1, HOTY + 2, 30, 29, RGB(255, 255, 255)); }
    else frame_rect(g, x, HOTY + 1, 32, 31, RGB(20, 20, 22));
  }
  g->hotDirty = 0;
}
static void draw_hud(VC *g) {
  int i; char buf[48], *p;
  g->clipH = HOTY;
  /* hearts */
  for (i = 0; i < 10; i++) { int hp = g->health - i * 2; draw_heart(g, 5 + i * 10, 5, hp >= 2 ? 2 : hp == 1 ? 1 : 0); }
  /* clock HH:MM (0 = 06:00) */
  {
    u32 mins = (u32)(((u64)g->worldTime * 1440) >> 32), hh = (mins / 60 + 6) % 24, mm = mins % 60; u32 t = g->worldTime;
    const char *ph = (t < TW_U32 || t >= (u32)(0u - TW_U32)) ? "Dawn" : t < HALF_U32 - TW_U32 ? "Day" : t < HALF_U32 + TW_U32 ? "Dusk" : "Night";
    p = itoa2(buf, (int)hh, 2); *p++ = ':'; p = itoa2(p, (int)mm, 2); *p++ = ' '; scpy(p, ph);
    draw_text(g, SW - 4 - text_w(buf), 3, buf, RGB(255, 255, 255), 1);
  }
  if (g->riding) draw_text(g, 4, 18, "Riding", RGB(255, 200, 230), 1);
  /* crosshair (inverted) */
  if (g->state == ST_PLAY) {
    for (i = -7; i <= 7; i++) {
      u16 *a = &g->back[(144) * SW + 160 + i], *b = &g->back[(144 + i) * SW + 160];
      *a = (u16)~*a; if (i) *b = (u16)~*b;
      a = &g->back[(143) * SW + 160 + i]; *a = (u16)~*a;
      if (i) { b = &g->back[(144 + i) * SW + 159]; *b = (u16)~*b; }
    }
  }
  /* held item */
  if (g->state == ST_PLAY && !g->riding) {
    int sw = g->swing > 0 ? g->swing : 0, bob = g->bobA ? (int)(SIN(g, g->bob) * 3 >> 16) : 0;
    int hid = g->hotbar[g->sel] & 255; const BDef *d = &g->bd[hid];
    if (d->kind == K_SWORD || (d->flags & F_ITEM) || d->render == R_CROSS || d->render == R_TORCH) draw_tile(g, 236 - sw, 212 + sw + bob, d->side, 64, 26);
    else draw_iso(g, 240 - sw, 222 + sw + bob, 64, hid);
  }
  /* hurt flash */
  if (g->hurtFlash > 0) { fill(g, 0, 0, SW, 3, RGB(220, 20, 20)); fill(g, 0, HOTY - 3, SW, 3, RGB(220, 20, 20)); fill(g, 0, 0, 3, HOTY, RGB(220, 20, 20)); fill(g, SW - 3, 0, 3, HOTY, RGB(220, 20, 20)); }
  /* toast */
  if (g->toastT > 0 && g->toast[0]) { int w = text_w(g->toast) + 12; shade_rect(g, 160 - w / 2, 236, w, 22); draw_text_c(g, 160, 239, g->toast, RGB(255, 255, 255), 0); }
}
#define INV_COLS 9
#define INV_CELL 34
#define INV_X 7
#define INV_Y 24
static void draw_inventory(VC *g) {
  int i;
  shade_rect(g, 0, 0, SW, HOTY); shade_rect(g, 0, 0, SW, HOTY);
  draw_text_c(g, 160, 4, "Inventory - tap an item", RGB(255, 255, 255), 1);
  for (i = 0; i < g->invN && i < INV_COLS * 7; i++) {
    int x = INV_X + (i % INV_COLS) * INV_CELL, y = INV_Y + (i / INV_COLS) * INV_CELL;
    fill(g, x + 1, y + 1, INV_CELL - 2, INV_CELL - 2, RGB(70, 70, 76));
    draw_iso(g, x + 4, y + 4, 26, g->invList[i]);
    if (i == g->invSel) frame_rect(g, x, y, INV_CELL, INV_CELL, RGB(255, 255, 255));
  }
  { char nb[32]; draw_text_c(g, 160, HOTY - 18, bname_r(g->invList[g->invSel], nb), RGB(255, 240, 160), 1); }
}
static const char MENU_BLOB[] = "Resume|Save world|Sound|Hostile mobs|Swap colors|New world|Save & Quit|";
static char *menu_item(int i, char *out) { const char *p = MENU_BLOB; while (i--) { while (*p != '|') p++; p++; } while (*p != '|') *out++ = *p++; *out = 0; return out; }
#define NMENU 7
static void draw_menu(VC *g) {
  int i;
  shade_rect(g, 0, 0, SW, HOTY); shade_rect(g, 0, 0, SW, HOTY);
  draw_text_c(g, 160, 4, "VoxelCraft", RGB(255, 255, 255), 1);
  for (i = 0; i < NMENU; i++) {
    int y = 22 + i * 37; char buf[40], *p = menu_item(i, buf);
    if (i == 2) scpy(p, g->soundOn ? ": On" : ": Off");
    if (i == 3) scpy(p, g->hostileOn ? ": On" : ": Off");
    if (i == 4) scpy(p, g->pixfmtBE ? ": On" : ": Off");
    fill(g, 60, y, 200, 32, i == g->menuSel ? RGB(110, 110, 120) : RGB(70, 70, 76));
    frame_rect(g, 60, y, 200, 32, i == g->menuSel ? RGB(255, 255, 255) : RGB(20, 20, 20));
    draw_text_c(g, 160, y + 8, buf, RGB(255, 255, 255), 1);
  }
}
static void menu_pick(VC *g, int i) {
  if (i == 0) g->state = ST_PLAY;
  else if (i == 1) { g->req |= REQ_SAVE; toast(g, "World saved"); g->state = ST_PLAY; }
  else if (i == 2) { g->soundOn = !g->soundOn; snd(g, 600, 60, 60); }
  else if (i == 3) { g->hostileOn = !g->hostileOn; if (!g->hostileOn) { int k; for (k = 0; k < MAXMOBS; k++) if (g->mobs[k].alive && MT[g->mobs[k].type].hostile) g->mobs[k].alive = 0; } }
  else if (i == 4) { g->pixfmtBE = !g->pixfmtBE; g->req |= REQ_PIXSWAP; toast(g, g->pixfmtBE ? "Colors swapped" : "Colors default"); }
  else if (i == 5) g->req |= REQ_NEWWORLD;
  else if (i == 6) g->req |= REQ_SAVE | REQ_QUIT;
}

/* ---------------- frame ---------------- */
void vc_frame(VC *g, const Input *in) {
  u32 dtMs = in->dtMs < 1 ? 1 : in->dtMs > 100 ? 100 : in->dtMs;
  fx dt = (fx)((dtMs << 16) / 1000); int dtcs = (int)(dtMs + 5) / 10, i;
  u32 keys = in->keys, pressed = keys & ~g->prevKeys;
  int penDown = in->penDown, penX = in->penX, penY = in->penY, penPressed = penDown && !g->penWasDown, penReleased = !penDown && g->penWasDown;
  BTab *bt = (BTab *)g->btab;
  if (dtcs < 1) dtcs = 1;
  /* Clamp anything a bad save or a wild stylus event could have left behind
     before look math, item drawing, or the raycaster run. */
  g->yaw &= 1023;
  if (g->pitch > 240) g->pitch = 240;
  if (g->pitch < -240) g->pitch = -240;
  if ((unsigned)g->sel > 8) g->sel = 0;
  if (penX < -64) penX = -64; if (penX > 384) penX = 384;
  if (penY < -64) penY = -64; if (penY > 384) penY = 384;
  g->nsnd = 0; g->frames++;
  g->timeMs += dtMs;
  if (g->toastT > 0) g->toastT -= (int)dtMs;
  if (g->swing > 0) g->swing -= dtcs * 2;
  if (g->attackCD > 0) g->attackCD -= dtcs;
  if (g->shake > 0) g->shake -= (int)dtMs; if (g->shake < 0) g->shake = 0;
  { int hpBefore = g->health;
  if (g->state == ST_PLAY) {
    int fwd = (keys & K_UP ? 1 : 0) - (keys & K_DOWN ? 1 : 0), turn = (keys & K_RIGHT ? 1 : 0) - (keys & K_LEFT ? 1 : 0);
    int jump = (keys & (K_JUMP | K_CENTER)) != 0;
    if (pressed & K_MENU) { g->state = ST_MENU; g->menuSel = 0; }
    if (pressed & K_INV) { g->state = ST_INV; for (i = 0; i < g->invN; i++) if (g->invList[i] == g->hotbar[g->sel]) g->invSel = i; }
    /* pen */
    if (penPressed) {
      g->penStartX = g->penLastX = penX; g->penStartY = g->penLastY = penY; g->penMoved = 0; g->holdT = 0; g->penHoldFired = 0;
      g->penOnView = penY < HOTY;
      if (penY >= HOTY) {
        if (penX < 16) { g->state = ST_MENU; g->menuSel = 0; }
        else if (penX >= 304) { g->state = ST_INV; for (i = 0; i < g->invN; i++) if (g->invList[i] == g->hotbar[g->sel]) g->invSel = i; }
        else { g->sel = (penX - 16) / 32; g->hotDirty = 1; { char nb[32]; toast(g, bname_r(g->hotbar[g->sel], nb)); } snd(g, 800, 20, 30); }
      }
    } else if (penDown && g->penOnView) {
      int ddx = penX - g->penLastX, ddy = penY - g->penLastY, tx = penX - g->penStartX, ty = penY - g->penStartY;
      if (ddx < -64) ddx = -64; if (ddx > 64) ddx = 64;
      if (ddy < -64) ddy = -64; if (ddy > 64) ddy = 64;
      if (!g->penMoved && ((long)tx * tx + (long)ty * ty) > 64) g->penMoved = 1;
      if (g->penMoved) {
        g->yaw = (g->yaw - ddx * 8 / 5) & 1023; g->pitch -= ddy * 8 / 5;
        if (g->pitch > 240) g->pitch = 240; if (g->pitch < -240) g->pitch = -240;
      } else {
        g->holdT += (int)dtMs;
        if (g->holdT >= 400) { /* hold = break / attack, repeating every 300 ms */
          fx dx, dy, dz; camera_update(g); ray_dir(g, g->penStartX, g->penStartY, &dx, &dy, &dz); do_break(g, dx, dy, dz); g->penHoldFired = 1; g->holdT = 100;
        }
      }
      g->penLastX = penX; g->penLastY = penY;
    }
    if (penReleased && g->penOnView && !g->penMoved && !g->penHoldFired) { fx dx, dy, dz; camera_update(g); ray_dir(g, g->penStartX, g->penStartY, &dx, &dy, &dz); do_use(g, dx, dy, dz); }
    /* hardware buttons act on the crosshair */
    if (pressed & K_BREAK) { g->breakRepeat = 0; do_break(g, g->cfx, g->cfy, g->cfz); }
    else if (keys & K_BREAK) { g->breakRepeat += (int)dtMs; if (g->breakRepeat >= 300) { g->breakRepeat = 0; do_break(g, g->cfx, g->cfy, g->cfz); } }
    if (pressed & K_PLACE) do_use(g, g->cfx, g->cfy, g->cfz);
    player_update(g, dt, dtcs, fwd, turn, jump);
  } else if (g->state == ST_INV) {
    int sel = g->invSel;
    if (pressed & K_LEFT) sel--; if (pressed & K_RIGHT) sel++; if (pressed & K_UP) sel -= INV_COLS; if (pressed & K_DOWN) sel += INV_COLS;
    if (sel < 0) sel = 0; if (sel >= g->invN) sel = g->invN - 1; g->invSel = sel;
    if (pressed & (K_CENTER | K_PLACE)) { g->hotbar[g->sel] = g->invList[sel]; g->hotDirty = 1; { char nb[32]; toast(g, bname_r(g->invList[sel], nb)); } g->state = ST_PLAY; }
    else if (pressed & (K_INV | K_BREAK | K_MENU)) g->state = ST_PLAY;
    if (penPressed) {
      int cx = (penX - INV_X) / INV_CELL, cy = (penY - INV_Y) / INV_CELL, k = cy * INV_COLS + cx;
      if (penY >= HOTY) { if (penX >= 16 && penX < 304) { g->sel = (penX - 16) / 32; g->hotDirty = 1; } else g->state = ST_PLAY; }
      else if (penX >= INV_X && cx < INV_COLS && penY >= INV_Y && k < g->invN) { g->invSel = k; g->hotbar[g->sel] = g->invList[k]; g->hotDirty = 1; { char nb[32]; toast(g, bname_r(g->invList[k], nb)); } g->state = ST_PLAY; snd(g, 800, 20, 30); }
      else g->state = ST_PLAY;
    }
    g->penOnView = 0;
  } else if (g->state == ST_MENU) {
    if (pressed & K_UP) g->menuSel = (g->menuSel + NMENU - 1) % NMENU;
    if (pressed & K_DOWN) g->menuSel = (g->menuSel + 1) % NMENU;
    if (pressed & (K_CENTER | K_PLACE)) menu_pick(g, g->menuSel);
    if (pressed & (K_INV | K_MENU)) g->state = ST_PLAY;
    if (penPressed) {
      int k = (penY - 22) / 37;
      if (penX >= 60 && penX < 260 && penY >= 22 && k < NMENU && (penY - 22) % 37 < 32) { g->menuSel = k; menu_pick(g, k); }
      else if (penY < HOTY) g->state = ST_PLAY;
    }
    g->penOnView = 0;
  } else if (g->state == ST_DEAD) {
    g->deathT += (int)dtMs;
    if (g->deathT > 1000 && ((pressed & (K_CENTER | K_PLACE | K_JUMP)) || penPressed)) respawn(g);
    g->penOnView = 0;
  } else if (g->state == ST_SLEEP) {
    g->sleepT += (int)dtMs;
    if (g->sleepT > 2500) {
      g->worldTime = TW_U32 + 8589935u; /* TW + 0.002: next morning */
      for (i = 0; i < MAXMOBS; i++) if (g->mobs[i].alive && MT[g->mobs[i].type].hostile && dist3(g->mobs[i].x - g->px, 0, g->mobs[i].z - g->pz) < FX(48)) g->mobs[i].alive = 0;
      g->state = ST_PLAY; toast(g, "Good morning!"); snd(g, 660, 120, 50); snd(g, 880, 160, 50);
    }
  }
  g->penWasDown = penDown;
  g->prevKeys = keys;
  /* world simulation keeps running except in the pause menu */
  if (g->state != ST_MENU) {
    if (g->state != ST_SLEEP) clock_advance(g, dtMs); else clock_advance(g, dtMs * 12);
    update_mobs(g, dt, dtcs);
    update_tnt(g, dtcs);
    g->spawnTimer -= dtcs;
    if (g->spawnTimer <= 0) { g->spawnTimer = 400 + rnd(g, 400); natural_spawn(g); }
  }
  if (g->health < hpBefore) g->hurtFlash = 250; }
  if (g->hurtFlash > 0) g->hurtFlash -= (int)dtMs;
  /* render */
  sky_update(g);
  camera_update(g);
  {
    Ray r; raycast(g, g->cfx, g->cfy, g->cfz, FX(5), &r);
    g->tgtValid = r.hit && g->state == ST_PLAY; g->tgtX = r.x; g->tgtY = r.y; g->tgtZ = r.z; g->tgtMob = r.mob;
  }
  make_btab(g, bt);
  render_world(g, bt);
  render_sky(g);
  render_mobs(g, bt);
  if (g->state == ST_SLEEP) { int k, a = g->sleepT * 28 / 2500; if (a > 28) a = 28; for (k = 0; k < VW * VH; k++) g->view[k] = blend(g->view[k], 0, a); }
  if (g->state == ST_DEAD) { int k; for (k = 0; k < VW * VH; k++) g->view[k] = blend(g->view[k], RGB(140, 0, 0), 14); }
  blit_view(g);
  draw_hud(g);
  if (g->state == ST_INV) draw_inventory(g);
  else if (g->state == ST_MENU) draw_menu(g);
  else if (g->state == ST_DEAD) { draw_text_c(g, 160, 110, "You died!", RGB(255, 255, 255), 1); if (g->deathT > 1000) draw_text_c(g, 160, 140, "Tap to respawn", RGB(255, 220, 220), 1); }
  if (g->hotDirty) draw_hotbar(g);
}

/* ---------------- loading screen ---------------- */
void vc_progress(VC *g, int pct, const char *msg) {
  int x, y;
  for (y = 0; y < SH; y++) for (x = 0; x < SW; x++) { const u16 *t = tile(g, T_DIRT); g->back[y * SW + x] = scale565(t[(((y >> 1) & 15) << 4) | ((x >> 1) & 15)], 12); }
  draw_text_c(g, 160, 96, "VoxelCraft", RGB(255, 255, 255), 1);
  draw_text_c(g, 160, 140, msg, RGB(230, 230, 230), 1);
  fill(g, 60, 170, 200, 10, RGB(30, 30, 30)); { int w = (int)pct * 2; if (w < 0) w = 0; if (w > 200) w = 200; fill(g, 60, 170, w, 10, RGB(110, 200, 90)); } frame_rect(g, 59, 169, 202, 12, RGB(200, 200, 200));
  g->hotDirty = 1;
}
HOT void vc_present(VC *g, u16 *dst, int rowPix) {
  int y, x;
  if (!dst || rowPix < SW) return;
  /* 16-bit copies are safe on a 2-aligned 16-bpp bitmap. A 32-bit copy is only
     used when both the back buffer and the destination row are 4-byte aligned
     (XScale faults on unaligned 32-bit accesses). */
  for (y = 0; y < SH; y++) {
    const u16 *s = g->back + y * SW; u16 *d = dst + y * rowPix;
    if (g->pixfmtBE) {
      for (x = 0; x < SW; x++) { u16 v = s[x]; d[x] = (u16)((v << 8) | (v >> 8)); }
    } else if ((((unsigned long)s | (unsigned long)d) & 3) == 0) {
      const u32 *s32 = (const u32 *)s; u32 *d32 = (u32 *)d;
      for (x = 0; x < SW / 2; x++) d32[x] = s32[x];
    } else {
      for (x = 0; x < SW; x++) d[x] = s[x];
    }
  }
}

/* ---------------- save / load (diff against the generated world) ---------------- */
static u8 *put32(u8 *p, u32 v) { p[0] = (u8)v; p[1] = (u8)(v >> 8); p[2] = (u8)(v >> 16); p[3] = (u8)(v >> 24); return p + 4; }
static u32 get32(const u8 *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((u32)p[3] << 24); }
static u8 *putv(u8 *p, u32 v) { while (v >= 128) { *p++ = (u8)(v | 128); v >>= 7; } *p++ = (u8)v; return p; }
static const u8 *getv(const u8 *p, const u8 *end, u32 *v, int *ok) {
  u32 r = 0; int s = 0, n = 0;
  *v = 0;
  if (!p || p >= end) { *ok = 0; return p ? p : end; }
  while (p < end && (*p & 128) && n < 5) { r |= (u32)(*p++ & 127) << s; s += 7; n++; }
  if (p >= end || n >= 5) { *ok = 0; return p; }
  r |= (u32)*p++ << s; *v = r; return p;
}
#define SAVE_MAGIC 0x31535856u /* "VXS1" */
static int fx_in_world(fx v, int lo, int hi) {
  int b = v >> 16;
  return b >= lo && b < hi;
}
static void vc_sanitize(VC *g) {
  int i;
  g->yaw &= 1023;
  if (g->pitch > 240) g->pitch = 240;
  if (g->pitch < -240) g->pitch = -240;
  if ((unsigned)g->sel > 8) g->sel = 0;
  for (i = 0; i < 9; i++) g->hotbar[i] &= 255;
  if (g->maxHealth < 1 || g->maxHealth > 40) g->maxHealth = 20;
  if (g->health > g->maxHealth) g->health = g->maxHealth;
  if (g->health < 0) g->health = 0;
  if (!fx_in_world(g->px, 1, WX - 1)) g->px = g->spawnX;
  if (!fx_in_world(g->pz, 1, WZ - 1)) g->pz = g->spawnZ;
  if (!fx_in_world(g->py, 0, WY + 2)) g->py = g->spawnY;
  if (!fx_in_world(g->px, 1, WX - 1) || !fx_in_world(g->pz, 1, WZ - 1)) {
    g->px = FX(WX / 2) + FX(0.5); g->pz = FX(WZ / 2) + FX(0.5);
  }
  if (!fx_in_world(g->py, 0, WY + 2)) g->py = FX(40);
  if (!fx_in_world(g->spawnX, 1, WX - 1) || !fx_in_world(g->spawnZ, 1, WZ - 1)) {
    g->spawnX = FX(WX / 2) + FX(0.5); g->spawnZ = FX(WZ / 2) + FX(0.5);
  }
  if (!fx_in_world(g->spawnY, 0, WY + 2)) g->spawnY = FX(40);
  if (g->invN < 0 || g->invN > 128) g->invN = 0;
  if (g->invSel < 0 || (g->invN && g->invSel >= g->invN)) g->invSel = 0;
  if (g->state < 0 || g->state > ST_SLEEP) g->state = ST_PLAY;
  for (i = 0; i < MAXMOBS; i++) {
    Mob *m = &g->mobs[i];
    if (!m->alive) continue;
    if (m->type >= M_TYPES) { m->alive = 0; continue; }
    m->yaw = (s16)(m->yaw & 1023);
    if (m->hp <= 0 || m->hp > 200) m->hp = MT[m->type].hp;
    if (!fx_in_world(m->x, -2, WX + 2) || !fx_in_world(m->z, -2, WZ + 2) || !fx_in_world(m->y, -4, WY + 8)) m->alive = 0;
  }
  g->riding = 0; /* a stale riding index after a load is not worth keeping */
}
u32 vc_save(VC *g) {
  u8 *p = g->io, *end = g->io + sizeof(g->io) - 16; int i; u32 pos = 0;
  p = put32(p, SAVE_MAGIC); p = put32(p, g->seed); p = put32(p, g->worldTime);
  p = put32(p, (u32)g->px); p = put32(p, (u32)g->py); p = put32(p, (u32)g->pz); p = put32(p, (u32)g->yaw); p = put32(p, (u32)g->pitch);
  p = put32(p, (u32)g->health); p = put32(p, (u32)g->spawnX); p = put32(p, (u32)g->spawnY); p = put32(p, (u32)g->spawnZ);
  for (i = 0; i < 9; i++) p = put32(p, (u32)g->hotbar[i]);
  p = put32(p, (u32)(g->sel | (g->hostileOn << 8) | (g->soundOn << 9) | (g->eggNote << 10)));
  { int n = 0; for (i = 0; i < MAXMOBS; i++) if (g->mobs[i].alive) n++; p = put32(p, (u32)n); }
  for (i = 0; i < MAXMOBS; i++) {
    Mob *m = &g->mobs[i]; if (!m->alive) continue;
    *p++ = m->type; *p++ = (u8)(m->tamed | (m->wild << 1) | (m->sitting << 2)); p = put32(p, (u32)m->x); p = put32(p, (u32)m->y); p = put32(p, (u32)m->z);
    p = put32(p, (u32)(m->yaw & 1023) | ((u32)(m->hp & 0xFFFF) << 16));
  }
  /* edited cells: (skip, run, ids...) */
  while (pos < WSIZE && p < end) {
    u32 s = pos, run;
    while (pos < WSIZE && !(g->edited[pos >> 3] & (1 << (pos & 7)))) { if (!(pos & 7) && !g->edited[pos >> 3]) { pos += 8; continue; } pos++; }
    if (pos >= WSIZE) break;
    run = 0; while (pos + run < WSIZE && (g->edited[(pos + run) >> 3] & (1 << ((pos + run) & 7))) && run < 4096) run++;
    if (p + 10 + run > end) break;
    p = putv(p, pos - s); p = putv(p, run);
    while (run--) { u8 id = g->blocks[pos++]; *p++ = id == TNT_LIT ? TNT : id; }
  }
  p = putv(p, 0); p = putv(p, 0); /* terminator */
  g->ioLen = (u32)(p - g->io);
  return g->ioLen;
}
u32 vc_save_seed(const u8 *io) { return get32(io) == SAVE_MAGIC ? get32(io + 4) : 0; }
/* call after the world (same seed) has been fully generated */
int vc_load(VC *g, u32 len) {
  const u8 *p = g->io, *end; int i, n, ok = 1; u32 pos = 0;
  fx px, py, pz, spx, spy, spz; s32 yaw, pitch, health; u32 worldTime, f;
  int hot[9];
  if (len < 100 || len > sizeof(g->io) || get32(p) != SAVE_MAGIC || get32(p + 4) != g->seed) return 0;
  end = g->io + len;
  p += 8;
  if (p + 4 * 12 + 4 * 9 + 8 > end) return 0; /* time, pos, angles, health, spawn, hotbar, flags, mob count */
  worldTime = get32(p); p += 4;
  px = (fx)get32(p); p += 4; py = (fx)get32(p); p += 4; pz = (fx)get32(p); p += 4;
  yaw = (s32)get32(p) & 1023; p += 4; pitch = (s32)get32(p); p += 4;
  health = (s32)get32(p); p += 4;
  spx = (fx)get32(p); p += 4; spy = (fx)get32(p); p += 4; spz = (fx)get32(p); p += 4;
  for (i = 0; i < 9; i++) { hot[i] = (int)get32(p) & 255; p += 4; }
  f = get32(p); p += 4;
  n = (int)get32(p); p += 4;
  /* Reject a 1.0.1 save whose header is clearly garbage rather than trying to play it. */
  if (n < 0 || n > MAXMOBS * 4) return 0;
  if ((px >> 16) < -8 || (px >> 16) >= WX + 8) return 0;
  if ((pz >> 16) < -8 || (pz >> 16) >= WZ + 8) return 0;
  if ((py >> 16) < -16 || (py >> 16) >= WY + 16) return 0;
  g->worldTime = worldTime;
  g->px = px; g->py = py; g->pz = pz; g->yaw = yaw; g->pitch = pitch;
  g->health = health; g->spawnX = spx; g->spawnY = spy; g->spawnZ = spz;
  for (i = 0; i < 9; i++) g->hotbar[i] = hot[i];
  g->sel = (int)(f & 15) % 9; g->hostileOn = (f >> 8) & 1; g->soundOn = (f >> 9) & 1; g->eggNote = (f >> 10) & 1;
  for (i = 0; i < MAXMOBS; i++) g->mobs[i].alive = 0;
  g->riding = 0;
  for (i = 0; i < n && i < MAXMOBS && p + 18 <= end; i++) {
    int type = *p++, fl = *p++; Mob *m; fx x = (fx)get32(p), y = (fx)get32(p + 4), z = (fx)get32(p + 8); u32 yh = get32(p + 12); p += 16;
    if ((unsigned)type >= M_TYPES) continue;
    if ((x >> 16) < -2 || (x >> 16) >= WX + 2 || (z >> 16) < -2 || (z >> 16) >= WZ + 2) continue;
    if ((y >> 16) < -4 || (y >> 16) >= WY + 8) continue;
    m = spawn_mob(g, type, x, y, z); if (!m) continue;
    m->tamed = (u8)(fl & 1); m->wild = (u8)((fl >> 1) & 1); m->sitting = (u8)((fl >> 2) & 1);
    m->yaw = (s16)(yh & 1023); m->hp = (s16)(yh >> 16);
    if (m->hp <= 0 || m->hp > 200) m->hp = MT[type].hp;
  }
  while (ok && p < end) {
    u32 skip, run;
    p = getv(p, end, &skip, &ok); if (!ok) break;
    p = getv(p, end, &run, &ok); if (!ok) break;
    if (!skip && !run) break;
    if (skip > WSIZE || run > WSIZE) { ok = 0; break; }
    pos += skip;
    if (pos > WSIZE) { ok = 0; break; }
    while (run-- && pos < WSIZE && p < end) { g->blocks[pos] = *p++; g->edited[pos >> 3] |= (u8)(1 << (pos & 7)); pos++; }
  }
  if (!ok && p >= end) {
    /* truncated tail: keep the prefix of edits that was valid */
  }
  vc_sanitize(g);
  if (g->health <= 0) { g->health = g->maxHealth; g->state = ST_PLAY; }
  light_region(g, WX / 2, WZ / 2, WX);
  g->hotDirty = 1; g->state = ST_PLAY; g->toastT = 0;
  camera_update(g);
  return 1;
}
