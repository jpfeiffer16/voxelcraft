/* ARM PNOlet entry: called by PceNativeCall from the 68K shell. One self-contained position-independent blob:
 * no writable globals, no relocations; all state lives in the VC block allocated by the shell.
 *
 * Official Palm OS 5 docs: PACE already byte-swaps the userData68KP *pointer* so we can
 * dereference it directly. The *contents* of the ArmArgs block are still 68K big-endian, and
 * the block itself may only be 2-byte aligned, so every 32-bit field is read and written
 * byte-wise (safe on XScale, which faults on unaligned 32-bit accesses). */
#include "../core/core.c"
#include "../shared.h"

__attribute__((used, visibility("hidden"))) void *memset(void *d, int c, unsigned long n) { u8 *p = (u8 *)d; while (n--) *p++ = (u8)c; return d; }
__attribute__((used, visibility("hidden"))) void *memcpy(void *d, const void *s, unsigned long n) { u8 *p = (u8 *)d; const u8 *q = (const u8 *)s; while (n--) *p++ = *q++; return d; }

/* Read/write a 68K big-endian 32-bit field at an address that may be 2-byte aligned. */
static inline u32 rd32(const void *p) {
  const u8 *b = (const u8 *)p;
  return ((u32)b[0] << 24) | ((u32)b[1] << 16) | ((u32)b[2] << 8) | (u32)b[3];
}
static inline void wr32(void *p, u32 v) {
  u8 *b = (u8 *)p;
  b[0] = (u8)(v >> 24); b[1] = (u8)(v >> 16); b[2] = (u8)(v >> 8); b[3] = (u8)v;
}
#define A(f) rd32(&a->f)
#define SETA(f, v) wr32(&a->f, (u32)(v))

__attribute__((section(".text.entry"), used))
unsigned long entry(const void *emulStateP, void *userData68KP, void *call68KFuncP) {
  ArmArgs *a = (ArmArgs *)userData68KP;
  VC *g;
  u32 cmd;
  (void)emulStateP; (void)call68KFuncP;
  if (!a) return 0;
  cmd = A(cmd);
  g = (VC *)(unsigned long)A(vc);
  /* cmd 0 (SIZE) does not need a VC pointer */
  if (cmd != CMD_SIZE && !g) return 0;
  if (cmd == CMD_SIZE) { SETA(ret, sizeof(VC)); }
  else if (cmd == CMD_SETUP) {
    const u16 *spr[M_TYPES]; int i;
    for (i = 0; i < M_TYPES; i++) spr[i] = (const u16 *)(unsigned long)A(spr[i]);
    g->pixfmtBE = (int)A(pixBE);
    vc_setup(g, (const u16 *)(unsigned long)A(t0), (const u16 *)(unsigned long)A(t1), spr, A(seed));
    SETA(ret, 1);
  } else if (cmd == CMD_GEN) {
    SETA(ret, vc_gen_step(g));
  } else if (cmd == CMD_FRAME) {
    Input in; int i;
    in.keys = A(keys); in.penX = (s32)A(penX); in.penY = (s32)A(penY); in.penDown = (s32)A(penDown); in.dtMs = A(dtMs);
    g->req = 0;
    vc_frame(g, &in);
    SETA(nsnd, g->nsnd);
    for (i = 0; i < g->nsnd && i < 4; i++) { SETA(snd[i][0], g->snd[i].freq); SETA(snd[i][1], g->snd[i].ms); SETA(snd[i][2], g->snd[i].amp); }
    SETA(req, g->req); SETA(frames, g->frames); SETA(steps, g->steps); SETA(rays, g->rays);
    SETA(ret, g->state);
  } else if (cmd == CMD_SAVE) {
    SETA(ret, vc_save(g));
  } else if (cmd == CMD_LOAD) {
    SETA(ret, vc_load(g, A(len)));
  } else if (cmd == CMD_PRESENT) {
    vc_present(g, (u16 *)(unsigned long)A(dst), (int)A(rowPix));
  } else if (cmd == CMD_PROGRESS) {
    vc_progress(g, (int)A(pct), (const char *)(unsigned long)A(msg));
  } else if (cmd == CMD_IOPTR) {
    SETA(ret, (u32)(unsigned long)g->io);
  } else if (cmd == CMD_SAVESEED) {
    SETA(ret, vc_save_seed((const u8 *)(unsigned long)A(msg)));
  }
  return 0;
}
