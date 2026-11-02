/* Renderer equivalence check: fast DDA vs the generic DDA over many random camera poses */
#define VC_HOST
#define main host_main
#include "host.c"
#undef main
int main(void) {
  static const char *names[M_TYPES] = {"zombie", "dog", "cat", "horse", "lion", "wolf", "spider"};
  const u16 *spr[M_TYPES]; char p[256]; int i, n, bad = 0, worst = 0; long diffpx = 0; VC *g = calloc(1, sizeof(VC)); BTab bt;
  static u16 ref[VW * VH];
  for (i = 0; i < M_TYPES; i++) { snprintf(p, sizeof p, "../../res/spr_%s.bin", names[i]); spr[i] = slurp(p, 0); }
  vc_setup(g, slurp("../../res/tiles0.bin", 0), slurp("../../res/tiles1.bin", 0), spr, 777);
  while (vc_gen_step(g) < 100) {}
  srand(5);
  for (n = 0; n < 400; n++) {
    int x = 2 + rand() % (WX - 4), z = 2 + rand() % (WZ - 4), y = surface_y(g, x, z) + 1 + rand() % 6, d = 0;
    if (y >= WY - 2) y = WY - 3;
    if (n % 5 == 0) y = SEA - 2 + rand() % 3; /* sometimes underwater / at sea level */
    g->px = FX(x) + rand() % 65536; g->pz = FX(z) + rand() % 65536; g->py = FX(y);
    g->yaw = rand() & 1023; g->pitch = rand() % 481 - 240; g->worldTime = rand() * 7919u;
    g->tgtValid = 0;
    camera_update(g); sky_update(g);
    g->headInWater = g->blocks[IDX(g->camX >> 16, g->camY >> 16, g->camZ >> 16)] == WATER;
    make_btab(g, &bt);
    vc_force_generic = 1; render_world(g, &bt); memcpy(ref, g->view, sizeof ref);
    vc_force_generic = 0; render_world(g, &bt);
    for (i = 0; i < VW * VH; i++) if (ref[i] != g->view[i]) d++;
    diffpx += d; if (d) bad++; if (d > worst) worst = d;
  }
  printf("poses 400, poses with any diff %d, worst %d px of %d, total diff px %ld\n", bad, worst, VW * VH, diffpx);
  return 0;
}
