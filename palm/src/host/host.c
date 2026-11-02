/* Host test harness: runs the exact core on the PC, scripted input, writes PPM screenshots + timing */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "../core/core.c"
static void *slurp(const char *p, long *n) { FILE *f = fopen(p, "rb"); long l; void *b; if (!f) { perror(p); exit(1); } fseek(f, 0, 2); l = ftell(f); fseek(f, 0, 0); b = malloc(l); if (fread(b, 1, l, f) != (size_t)l) exit(1); fclose(f); if (n) *n = l; return b; }
static void shot(VC *g, const char *path) {
  FILE *f = fopen(path, "wb"); int i; fprintf(f, "P6 %d %d 255\n", SW, SH);
  for (i = 0; i < SW * SH; i++) { u16 c = g->back[i]; unsigned char rgb[3] = {(unsigned char)(((c >> 11) & 31) * 255 / 31), (unsigned char)(((c >> 5) & 63) * 255 / 63), (unsigned char)((c & 31) * 255 / 31)}; fwrite(rgb, 1, 3, f); }
  fclose(f);
}
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec * 1e-9; }
int main(int argc, char **argv) {
  const char *res = argc > 1 ? argv[1] : "../../res", *out = argc > 2 ? argv[2] : "/tmp/vcshots";
  static const char *names[M_TYPES] = {"zombie", "dog", "cat", "horse", "lion", "wolf", "spider"};
  const u16 *spr[M_TYPES]; char p[512]; int i, pct; VC *g = calloc(1, sizeof(VC)); Input in; double t0;
  u32 seed = argc > 3 ? (u32)strtoul(argv[3], 0, 0) : 12345;
  printf("sizeof(VC) = %u\n", (unsigned)sizeof(VC));
  for (i = 0; i < M_TYPES; i++) { snprintf(p, sizeof p, "%s/spr_%s.bin", res, names[i]); spr[i] = slurp(p, 0); }
  snprintf(p, sizeof p, "%s/tiles0.bin", res); { const u16 *t0 = slurp(p, 0); snprintf(p, sizeof p, "%s/tiles1.bin", res); vc_setup(g, t0, slurp(p, 0), spr, seed); }
  vc_progress(g, 30, "Generating world..."); snprintf(p, sizeof p, "%s/loading.ppm", out); shot(g, p);
  t0 = now(); while ((pct = vc_gen_step(g)) < 100) {} printf("gen %.3f s\n", now() - t0);
  memset(&in, 0, sizeof in); in.dtMs = 100;
  #define RUN(n, k) for (i = 0; i < (n); i++) { in.keys = (k); vc_frame(g, &in); }
  #define SHOT(name) do { snprintf(p, sizeof p, "%s/%s.ppm", out, name); shot(g, p); printf("%s: player %.2f %.2f %.2f yaw %d pitch %d hp %d steps/ray %.1f state %d\n", name, g->px / 65536.0, g->py / 65536.0, g->pz / 65536.0, g->yaw, g->pitch, g->health, (double)g->steps / g->rays, g->state); } while (0)
  RUN(10, 0); SHOT("start");
  t0 = now(); RUN(50, 0); printf("host frame %.2f ms\n", (now() - t0) * 1000 / 50);
  RUN(8, K_RIGHT); RUN(20, K_UP); SHOT("walk");
  g->pitch = -120; RUN(2, 0); SHOT("lookdown");
  RUN(1, K_BREAK); RUN(1, 0); RUN(1, K_PLACE); RUN(2, 0); SHOT("place");
  /* find a flat, open grass spot for the mob/egg/TNT scenes */
  {
    int bx = -1, bz = -1, x, z, dx, dz, best = 0;
    for (z = 12; z < WZ - 12 && bx < 0; z++) for (x = 12; x < WX - 12 && bx < 0; x++) {
      int h = g->genH[x + z * WX], ok = g->blocks[IDX(x, h, z)] == GRASS;
      for (dz = -2; dz <= 7 && ok; dz++) for (dx = -4; dx <= 4 && ok; dx++) {
        int y; if (g->genH[(x + dx) + (z + dz) * WX] > h || g->genH[(x + dx) + (z + dz) * WX] < h - 1 || g->genH[(x + dx) + (z + dz) * WX] <= SEA) ok = 0;
        for (y = h + 1; y < h + 9 && ok; y++) if (g->blocks[IDX(x + dx, y, z + dz)] != AIR && !(g->bd[g->blocks[IDX(x + dx, y, z + dz)]].render == R_CROSS)) ok = 0;
      }
      if (ok) { bx = x; bz = z; best = h; }
    }
    printf("flat spot %d %d h %d\n", bx, bz, best);
    if (bx >= 0) { g->px = FX(bx) + FX(0.5); g->pz = FX(bz) + FX(0.5); g->py = FX(best + 1); g->yaw = 512; g->pvy = 0; }
  }
  for (i = 0; i < MAXMOBS; i++) g->mobs[i].alive = 0;
  g->worldTime = 0x30000000u; g->pitch = -25;
  #define FWD(a, d) g->px - fmul(SIN(g, g->yaw + (a)), FX(d)), g->py, g->pz - fmul(COS(g, g->yaw + (a)), FX(d))
  { Mob *m = spawn_mob(g, M_DOG, FWD(-60, 3)); (void)m; }
  { Mob *m = spawn_mob(g, M_CAT, FWD(40, 3)); (void)m; }
  { Mob *m = spawn_mob(g, M_LION, FWD(-25, 5.5)); (void)m; }
  { Mob *m = spawn_mob(g, M_HORSE, FWD(15, 6)); (void)m; }
  for (i = 0; i < MAXMOBS; i++) if (g->mobs[i].alive) { g->mobs[i].yaw = g->yaw + 256 * (i & 3); g->mobs[i].state = 0; }
  { int k; for (k = 0; k < 2; k++) { in.keys = 0; vc_frame(g, &in); } }
  SHOT("mobs");
  for (i = 0; i < MAXMOBS; i++) g->mobs[i].alive = 0;
  /* pink horse egg: aim at ground in front and use it */
  g->sel = 8; g->pitch = -90; RUN(1, 0); { Ray r; raycast(g, g->cfx, g->cfy, g->cfz, FX(5), &r); printf("egg ray hit %d mob %d at %d %d %d n %d %d %d id %d held %d kind %d\n", r.hit, r.mob, r.x, r.y, r.z, r.nx, r.ny, r.nz, r.id, held(g), g->bd[held(g)].kind); } RUN(1, K_PLACE); RUN(1, 0); g->sel = 0; g->pitch = -20; RUN(4, 0); SHOT("horse");
  { int n = 0; for (i = 0; i < MAXMOBS; i++) n += g->mobs[i].alive && g->mobs[i].type == M_HORSE; printf("horses alive %d\n", n); }
  /* hostile night */
  for (i = 0; i < MAXMOBS; i++) g->mobs[i].alive = 0;
  g->worldTime = 0xC8000000u; g->pitch = -10;
  { Mob *m = spawn_mob(g, M_ZOMBIE, FWD(0, 5)); if (m) m->wild = 1; }
  { Mob *m = spawn_mob(g, M_SPIDER, FWD(-50, 6)); if (m) m->wild = 1; }
  { Mob *m = spawn_mob(g, M_WOLF, FWD(45, 6)); if (m) m->wild = 1; }
  RUN(3, 0); SHOT("night_mobs");
  { int hp0 = g->health; RUN(30, 0); printf("night: hp %d -> %d after 3 s (zombie attacks)\n", hp0, g->health); }
  /* sword fight: hit whatever is in the crosshair repeatedly */
  { int k, kills0 = 0; for (k = 0; k < 40; k++) { in.keys = (k & 1) ? K_BREAK : 0; vc_frame(g, &in); } for (i = 0; i < MAXMOBS; i++) kills0 += g->mobs[i].alive; printf("mobs alive after sword: %d hp %d state %d\n", kills0, g->health, g->state); }
  if (g->state == ST_DEAD) { RUN(1, K_CENTER); RUN(2, 0); }
  for (i = 0; i < MAXMOBS; i++) g->mobs[i].alive = 0;
  g->worldTime = 0x80000000u + 137624000u; g->pitch = 10; RUN(2, 0); SHOT("dusk");
  g->worldTime = 0xE0000000u; RUN(2, 0); SHOT("night");
  g->worldTime = 0x30000000u;
  RUN(1, K_INV); RUN(1, 0); SHOT("inventory"); RUN(1, K_INV); RUN(1, 0);
  in.penDown = 1; in.penX = 4; in.penY = 300; vc_frame(g, &in); in.penDown = 0; vc_frame(g, &in); SHOT("menu"); RUN(1, K_INV); RUN(1, 0);
  printf("state after menu close %d\n", g->state);
  /* TNT */
  g->sel = 1; g->pitch = -100; RUN(1, 0); { Ray r; raycast(g, g->cfx, g->cfy, g->cfz, FX(5), &r); printf("tnt ray hit %d mob %d at %d %d %d n %d %d %d id %d held %d\n", r.hit, r.mob, r.x, r.y, r.z, r.nx, r.ny, r.nz, r.id, held(g)); } RUN(1, K_PLACE); RUN(1, 0); g->sel = 0; RUN(1, K_PLACE); RUN(5, 0); SHOT("tnt_lit");
  { int k, n = 0; for (k = 0; k < MAXTNT; k++) n += g->tnt[k].used; printf("primed tnt %d\n", n); }
  RUN(10, K_DOWN); RUN(2, 0); g->pitch = -60;
  for (i = 0; i < 60; i++) { in.keys = 0; vc_frame(g, &in); if (g->shake > 600 && i < 59) { int j = i; SHOT("tnt_boom"); i = j; break; } }
  RUN(15, 0); SHOT("tnt_crater");
  /* underwater: teleport into the sea */
  { u32 n = vc_save(g); printf("save bytes %u\n", n); }
  RUN(10, 0);
  for (i = 0; i < 40; i++) { int h0 = g->health, k; in.keys = K_UP | (i % 10 < 3 ? K_LEFT : 0); vc_frame(g, &in); if (g->health < h0) { printf("  f%d hp %d->%d pos %.1f %.1f %.1f lava %d:", i, h0, g->health, g->px/65536.0, g->py/65536.0, g->pz/65536.0, g->inLava); for (k = 0; k < MAXMOBS; k++) if (g->mobs[k].alive) printf(" m%d(%.1f,%.1f)", g->mobs[k].type, (g->mobs[k].x-g->px)/65536.0, (g->mobs[k].z-g->pz)/65536.0); printf("\n"); } }
  SHOT("explore");
  printf("frames %u sounds-last %d\n", g->frames, g->nsnd);
  return 0;
}
