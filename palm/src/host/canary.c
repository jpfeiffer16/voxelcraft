/* Generate several worlds and assert the VC object never writes past its bounds.
 * This is the host stand-in for an XScale data abort caused by a tree or leaf
 * written off the 96x96x64 island, or a light-queue overflow. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../core/core.c"
static void *slurp(const char *p) {
  FILE *f = fopen(p, "rb"); long l; void *b;
  if (!f) { perror(p); exit(1); }
  fseek(f, 0, 2); l = ftell(f); fseek(f, 0, 0); b = malloc(l);
  if (fread(b, 1, l, f) != (size_t)l) exit(1); fclose(f); return b;
}
#define PAD 4096
static VC *make(const char *res, u32 seed, u8 **raw) {
  static const char *names[M_TYPES] = {"zombie","dog","cat","horse","lion","wolf","spider"};
  const u16 *spr[M_TYPES]; char p[512]; int i;
  u8 *block = malloc(sizeof(VC) + 2 * PAD);
  if (!block) exit(1);
  memset(block, 0xA5, PAD);
  memset(block + PAD + sizeof(VC), 0xA5, PAD);
  memset(block + PAD, 0, sizeof(VC));
  *raw = block;
  { VC *g = (VC *)(block + PAD);
    for (i = 0; i < M_TYPES; i++) { snprintf(p, sizeof p, "%s/spr_%s.bin", res, names[i]); spr[i] = slurp(p); }
    { const u16 *t0, *t1; snprintf(p, sizeof p, "%s/tiles0.bin", res); t0 = slurp(p); snprintf(p, sizeof p, "%s/tiles1.bin", res); t1 = slurp(p); vc_setup(g, t0, t1, spr, seed); }
    return g;
  }
}
static int smashed(u8 *raw) {
  int i; for (i = 0; i < PAD; i++) if (raw[i] != 0xA5 || raw[PAD + sizeof(VC) + i] != 0xA5) return 1;
  return 0;
}
int main(int argc, char **argv) {
  const char *res = argc > 1 ? argv[1] : "../../res";
  static const u32 seeds[] = {1, 12345, 777, 0x12345678u, 99, 2026, 0xFFFFFFFFu, 42};
  int s, fails = 0;
  for (s = 0; s < (int)(sizeof seeds / sizeof seeds[0]); s++) {
    u8 *raw; VC *g = make(res, seeds[s], &raw); int pct = 0, steps = 0, trees = 0, lit = 0, x, y, z;
    while (pct < 100) {
      int prev = g->genStage;
      pct = vc_gen_step(g);
      if (prev == 1) trees++;
      if (prev == 2) lit++;
      if (smashed(raw)) { printf("FAIL seed %u: canary smashed at stage %d pct %d\n", seeds[s], g->genStage, pct); fails++; break; }
      if (++steps > 500) { printf("FAIL seed %u: gen did not finish\n", seeds[s]); fails++; break; }
    }
    /* every stored block id must be in range; walk a border slice */
    for (z = 0; z < WZ && !fails; z++) for (x = 0; x < WX; x++) for (y = 0; y < WY; y++) {
      int id = g->blocks[IDX(x, y, z)];
      if (id < 0 || id > 255) { printf("FAIL seed %u: junk block %d at %d,%d,%d\n", seeds[s], id, x, y, z); fails++; break; }
    }
    printf("seed %u: steps %d trees-steps %d light-steps %d canary %s\n",
           seeds[s], steps, trees, lit, smashed(raw) ? "SMASHED" : "ok");
    free(raw);
  }
  printf(fails ? "FAIL\n" : "PASS\n");
  return fails != 0;
}
