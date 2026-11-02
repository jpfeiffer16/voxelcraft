#define main host_main
#include "host.c"
#undef main
int main(void) {
  static const char *names[M_TYPES] = {"zombie", "dog", "cat", "horse", "lion", "wolf", "spider"};
  const u16 *spr[M_TYPES]; char p[512]; int i, f; VC *g = calloc(1, sizeof(VC)); Input in;
  for (i = 0; i < M_TYPES; i++) { snprintf(p, sizeof p, "../../res/spr_%s.bin", names[i]); spr[i] = slurp(p, 0); }
  vc_setup(g, slurp("../../res/tiles0.bin", 0), slurp("../../res/tiles1.bin", 0), spr, 12345);
  while (vc_gen_step(g) < 100) {}
  memset(&in, 0, sizeof in); in.dtMs = 100;
  vc_frame(g, &in);
for (i = 0; i < MAXMOBS; i++) g->mobs[i].alive = 0;
  for (f = 0; f < 5; f++) { vc_frame(g, &in); for (i = 0; i < MAXMOBS; i++) if (g->mobs[i].alive && g->mobs[i].type == M_DOG) { Mob *m = &g->mobs[i]; int sx, sy; fx d; int ok = project(g, m->x - g->camX, m->y - g->camY, m->z - g->camZ, &sx, &sy, &d); printf("dog %.2f %.2f %.2f proj %d %d %d d %.2f cam %.2f %.2f %.2f f %.2f %.2f %.2f\n", m->x/65536.0, m->y/65536.0, m->z/65536.0, ok, sx, sy, d/65536.0, g->camX/65536.0, g->camY/65536.0, g->camZ/65536.0, g->cfx/65536.0,g->cfy/65536.0,g->cfz/65536.0); } }
  shot(g, "/tmp/vcshots/dog.ppm");
  g->pitch = -100; vc_frame(g, &in);
  { Ray r; raycast(g, g->cfx, g->cfy, g->cfz, FX(5), &r); printf("ray hit %d %d %d %d n %d %d %d id %d\n", r.hit, r.x, r.y, r.z, r.nx, r.ny, r.nz, r.id); }
  g->sel = 1; in.keys = K_PLACE; vc_frame(g, &in); in.keys = 0; vc_frame(g, &in);
  { Ray r; raycast(g, g->cfx, g->cfy, g->cfz, FX(5), &r); printf("ray hit %d %d %d %d id %d\n", r.hit, r.x, r.y, r.z, r.id); }
  g->sel = 0; in.keys = K_PLACE; vc_frame(g, &in); in.keys = 0;
  for (i = 0; i < MAXTNT; i++) if (g->tnt[i].used) printf("tnt %d at %d %d %d fuse %d\n", i, g->tnt[i].x, g->tnt[i].y, g->tnt[i].z, g->tnt[i].fuse);
  for (f = 0; f < 50; f++) { vc_frame(g, &in); if (g->shake) { printf("boom at frame %d shake %d hp %d\n", f, g->shake, g->health); break; } }
  return 0;
}
