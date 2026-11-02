/* ARM PNOlet entry: called by PceNativeCall from the 68K shell. One self-contained position-independent blob:
 * no writable globals, no relocations; all state lives in the VC block allocated by the shell. */
#include "../core/core.c"
#include "../shared.h"

/* gcc may emit these for struct copies / clears */
__attribute__((used, visibility("hidden"))) void *memset(void *d, int c, unsigned long n) { u8 *p = (u8 *)d; while (n--) *p++ = (u8)c; return d; }
__attribute__((used, visibility("hidden"))) void *memcpy(void *d, const void *s, unsigned long n) { u8 *p = (u8 *)d; const u8 *q = (const u8 *)s; while (n--) *p++ = *q++; return d; }

static inline u32 sw32(u32 v) { return (v >> 24) | ((v >> 8) & 0xFF00) | ((v << 8) & 0xFF0000) | (v << 24); }
#define A(f) sw32(a->f)
#define SETA(f, v) (a->f = sw32((u32)(v)))

__attribute__((section(".text.entry"), used))
unsigned long entry(const void *emul, void *userData, void *call68k) {
  ArmArgs *a = (ArmArgs *)userData; VC *g = (VC *)A(vc); u32 cmd = A(cmd);
  (void)emul; (void)call68k;
  switch (cmd) {
  case CMD_SIZE: SETA(ret, sizeof(VC)); break;
  case CMD_SETUP: {
    const u16 *spr[M_TYPES]; int i;
    for (i = 0; i < M_TYPES; i++) spr[i] = (const u16 *)A(spr[i]);
    g->pixfmtBE = (int)A(pixBE);
    vc_setup(g, (const u16 *)A(t0), (const u16 *)A(t1), spr, A(seed));
    SETA(ret, 1); break;
  }
  case CMD_GEN: SETA(ret, vc_gen_step(g)); break;
  case CMD_FRAME: {
    Input in; int i;
    in.keys = A(keys); in.penX = (s32)A(penX); in.penY = (s32)A(penY); in.penDown = (s32)A(penDown); in.dtMs = A(dtMs);
    g->req = 0;
    vc_frame(g, &in);
    SETA(nsnd, g->nsnd);
    for (i = 0; i < g->nsnd && i < 4; i++) { SETA(snd[i][0], g->snd[i].freq); SETA(snd[i][1], g->snd[i].ms); SETA(snd[i][2], g->snd[i].amp); }
    SETA(req, g->req); SETA(frames, g->frames); SETA(steps, g->steps); SETA(rays, g->rays);
    SETA(ret, g->state);
    break;
  }
  case CMD_SAVE: SETA(ret, vc_save(g)); break;
  case CMD_LOAD: SETA(ret, vc_load(g, A(len))); break;
  case CMD_PRESENT: vc_present(g, (u16 *)A(dst), (int)A(rowPix)); break;
  case CMD_PROGRESS: vc_progress(g, (int)A(pct), (const char *)A(msg)); break;
  case CMD_IOPTR: SETA(ret, (u32)(unsigned long)g->io); break;
  case CMD_SAVESEED: SETA(ret, vc_save_seed((const u8 *)A(msg))); break;
  }
  return 0;
}
