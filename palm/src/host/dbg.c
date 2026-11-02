#define main host_main
#include "host.c"
#undef main
int main(void) {
  static const char *names[M_TYPES] = {"zombie", "dog", "cat", "horse", "lion", "wolf", "spider"};
  const u16 *spr[M_TYPES]; char p[512]; int i, f; VC *g = calloc(1, sizeof(VC)); Input in;
  for (i = 0; i < M_TYPES; i++) { snprintf(p, sizeof p, "../../res/spr_%s.bin", names[i]); spr[i] = slurp(p, 0); }
  vc_setup(g, slurp("../../res/tiles0.bin", 0), slurp("../../res/tiles1.bin", 0), spr, 12345);
  while (vc_gen_step(g) < 100) {}
  for (i = 0; i < MAXMOBS; i++) if (g->mobs[i].alive) printf("mob %d type %d at %.1f %.1f %.1f wild %d\n", i, g->mobs[i].type, g->mobs[i].x/65536.0, g->mobs[i].y/65536.0, g->mobs[i].z/65536.0, g->mobs[i].wild);
  memset(&in, 0, sizeof in); in.dtMs = 100;
  for (f = 0; f < 100; f++) { int hp = g->health; in.keys = f < 60 ? 0 : f < 68 ? K_RIGHT : K_UP; vc_frame(g, &in);
    if (g->health != hp) printf("f%d hp %d->%d pos %.2f %.2f %.2f lava %d water %d feet %d\n", f, hp, g->health, g->px/65536.0, g->py/65536.0, g->pz/65536.0, g->inLava, g->inWater, getb(g, g->px>>16, (g->py+FX(0.4))>>16, g->pz>>16)); }
  return 0;
}
