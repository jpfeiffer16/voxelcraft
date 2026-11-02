/* Interface between the 68K Palm OS shell (app.c) and the ARM native core (arm/entry.c).
 * Every field is a 32-bit word stored big-endian (68K order); the ARM side byte-swaps. */
#ifndef VC_SHARED_H
#define VC_SHARED_H
enum { CMD_SIZE = 0, CMD_SETUP, CMD_GEN, CMD_FRAME, CMD_SAVE, CMD_LOAD, CMD_PRESENT, CMD_PROGRESS, CMD_IOPTR, CMD_SAVESEED };
typedef struct {
  unsigned long cmd, vc, ret;
  unsigned long t0, t1, spr[7], seed, pixBE;           /* setup */
  unsigned long keys, penX, penY, penDown, dtMs;       /* frame input */
  unsigned long dst, rowPix;                           /* present */
  unsigned long pct, msg;                              /* progress (msg = 68K pointer to a C string) */
  unsigned long len;                                   /* load */
  unsigned long nsnd, snd[4][3], req;                  /* frame output: sounds (freq, ms, amp) and requests */
  unsigned long frames, steps, rays;                   /* stats */
} ArmArgs;
#define ARGW (sizeof(ArmArgs) / 4)
#endif
