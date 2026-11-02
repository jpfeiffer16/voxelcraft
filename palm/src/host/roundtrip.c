/* Save/load round-trip test: edit a world, vc_save, regenerate from the saved seed in a fresh VC, vc_load, compare */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../core/core.c"
static void *slurp(const char *p) { FILE *f = fopen(p, "rb"); long l; void *b; if (!f) { perror(p); exit(1); } fseek(f, 0, 2); l = ftell(f); fseek(f, 0, 0); b = malloc(l); if (fread(b, 1, l, f) != (size_t)l) exit(1); fclose(f); return b; }
static VC *make(const char *res, u32 seed) {
  static const char *names[M_TYPES] = {"zombie", "dog", "cat", "horse", "lion", "wolf", "spider"};
  const u16 *spr[M_TYPES]; char p[512]; int i; VC *g = calloc(1, sizeof(VC));
  for (i = 0; i < M_TYPES; i++) { snprintf(p, sizeof p, "%s/spr_%s.bin", res, names[i]); spr[i] = slurp(p); }
  { const u16 *t0, *t1; snprintf(p, sizeof p, "%s/tiles0.bin", res); t0 = slurp(p); snprintf(p, sizeof p, "%s/tiles1.bin", res); t1 = slurp(p); vc_setup(g, t0, t1, spr, seed); }
  while (vc_gen_step(g) < 100) {}
  return g;
}
int main(int argc, char **argv) {
  const char *res = argc > 1 ? argv[1] : "../../res"; int nedits = argc > 2 ? atoi(argv[2]) : 500, i, bad = 0, fails = 0; u32 len, seed = 777;
  VC *a = make(res, seed), *b; Input in; memset(&in, 0, sizeof in); in.dtMs = 50;
  for (i = 0; i < 40; i++) { in.keys = (i & 1) ? K_BREAK : K_UP; vc_frame(a, &in); }
  srand(1);
  for (i = 0; i < nedits; i++) { u32 pos = (u32)rand() % WSIZE; a->blocks[pos] = (u8)(1 + rand() % 20); a->edited[pos >> 3] |= (u8)(1 << (pos & 7)); }
  a->worldTime = 0x9abcdef0u; a->health = 13; a->sel = 4;
  len = vc_save(a);
  b = make(res, vc_save_seed(a->io));
  memcpy(b->io, a->io, len);
  if (!vc_load(b, len)) { printf("FAIL: vc_load rejected save\n"); return 1; }
  for (i = 0; i < WSIZE; i++) if (a->blocks[i] != b->blocks[i] && !(a->blocks[i] == TNT_LIT && b->blocks[i] == TNT)) bad++;
  if (bad) { printf("FAIL: %d block mismatches\n", bad); fails++; }
  if (a->worldTime != b->worldTime || a->px != b->px || a->py != b->py || a->pz != b->pz || a->health != b->health || a->sel != b->sel) { printf("FAIL: player/time state differs\n"); fails++; }
  { int na = 0, nb = 0; for (i = 0; i < MAXMOBS; i++) { na += a->mobs[i].alive; nb += b->mobs[i].alive; } printf("mobs saved %d restored %d\n", na, nb); if (na != nb) fails++; }
  printf("edits %d, save %u bytes (%u Palm records of <=32000), block mismatches %d -> %s\n", nedits, len, (len + 31999) / 32000, bad, fails ? "FAIL" : "PASS");
  return fails != 0;
}
