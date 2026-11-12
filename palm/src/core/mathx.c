/* Fixed-point math + a 16.16 port of js/noise.js (same permutations, same hash3) */
#include "sintab.h"

VC_STATIC void math_init(VC *g) {
  int i;
  for (i = 0; i <= 256; i++) { g->sinT[i] = SIN_Q[i]; }
  for (i = 0; i < 256; i++) { g->sinT[512 - i] = SIN_Q[i]; }
  for (i = 0; i < 512; i++) g->sinT[512 + i] = -g->sinT[i];
  /* reciprocal table: rcpT[i] = 2^24 / (256 + i), i=0..256 (mantissa in [1,2)) */
  for (i = 0; i <= 256; i++) g->rcpT[i] = (u16)((1u << 24) / (256 + i) > 65535 ? 65535 : (1u << 24) / (256 + i));
}
#define SIN(g, a) ((g)->sinT[(a) & 1023])
#define COS(g, a) ((g)->sinT[((a) + 256) & 1023])

/* Unsigned count-leading-zeros */
static inline AI int clz32(u32 v) {
#if defined(__GNUC__)
  return v ? __builtin_clz(v) : 32;
#else
  int n = 0; if (!v) return 32; while (!(v & 0x80000000u)) { v <<= 1; n++; } return n;
#endif
}
/* 1/v for v > 0 in 16.16: table lookup on the normalised mantissa + one Newton step (~16 bits) */
#define RCP_INF 0x3fffffff
static inline AI fx rcp(const VC *g, u32 v) {
  int z; u32 r; s64 rr;
  if (v < 4) return RCP_INF;
  z = clz32(v);                         /* v ~ m9 * 2^(23-z), m9 in [256,511] */
  r = g->rcpT[((v << z) >> 23) - 256];  /* ~ 2^24 / m9 */
  rr = z >= 15 ? ((s64)r << (z - 15)) : ((s64)r >> (15 - z)); /* ~ 2^32 / v */
  rr = (rr * (((s64)1 << 33) - (s64)v * rr)) >> 32;            /* one Newton step */
  return rr > RCP_INF ? RCP_INF : (fx)rr;
}
static inline AI fx fdiv(const VC *g, fx a, fx b) { /* a / b, both 16.16, b != 0 */
  int neg = 0; fx r;
  if (b < 0) { b = -b; neg = 1; }
  r = fmul(a, rcp(g, (u32)b));
  return neg ? -r : r;
}

/* ---- hash + PRNG exactly as js/noise.js */
static inline u32 hash3u(int x, int y, int z, u32 seed) {
  u32 h = (u32)x * 374761393u + (u32)y * 668265263u + (u32)z * 1274126177u + seed * 2246822519u;
  h = (h ^ (h >> 13)) * 1274126177u;
  h ^= h >> 16;
  return h;
}
#define P32(f) ((u32)((f) * 4294967296.0))
static u32 mulberry(u32 *a) {
  u32 t;
  *a += 0x6D2B79F5u;
  t = (*a ^ (*a >> 15)) * (1u | *a);
  t = (t + (t ^ (t >> 7)) * (61u | t)) ^ t;
  return t ^ (t >> 14);
}
static u32 vc_rand(VC *g) { return mulberry(&g->rng); }
static int rnd(VC *g, int n) { return (int)(((u64)vc_rand(g) * (u32)n) >> 32); }

VC_STATIC void simplex_init(u8 *perm, u32 seed) {
  u8 p[256]; int i; u32 a = seed;
  for (i = 0; i < 256; i++) p[i] = (u8)i;
  for (i = 255; i > 0; i--) { int j = (int)(((u64)mulberry(&a) * (u32)(i + 1)) >> 32); u8 t = p[i]; p[i] = p[j]; p[j] = t; }
  for (i = 0; i < 512; i++) perm[i] = p[i & 255];
}
/* perm values are 0..255: v % 12 by table (no divide in the noise inner loop) */
static const u8 MOD12[256] __attribute__((aligned(4))) = {
#define M12_(i) (i) % 12
#define M12_8(i) M12_(i), M12_(i + 1), M12_(i + 2), M12_(i + 3), M12_(i + 4), M12_(i + 5), M12_(i + 6), M12_(i + 7)
#define M12_64(i) M12_8(i), M12_8(i + 8), M12_8(i + 16), M12_8(i + 24), M12_8(i + 32), M12_8(i + 40), M12_8(i + 48), M12_8(i + 56)
  M12_64(0), M12_64(64), M12_64(128), M12_64(192)
};
static const s8 GRAD3[12][3] __attribute__((aligned(4))) = {{1,1,0},{-1,1,0},{1,-1,0},{-1,-1,0},{1,0,1},{-1,0,1},{1,0,-1},{-1,0,-1},{0,1,1},{0,-1,1},{0,1,-1},{0,-1,-1}};
#define F2 23988   /* 0.5*(sqrt(3)-1) */
#define G2 13849   /* (3-sqrt(3))/6 */
static inline fx gdot2(int g, fx x, fx y) { return GRAD3[g][0] * x + GRAD3[g][1] * y; }
static inline fx gdot3(int g, fx x, fx y, fx z) { return GRAD3[g][0] * x + GRAD3[g][1] * y + GRAD3[g][2] * z; }
static HOT fx noise2(const u8 *perm, fx xin, fx yin) {
  fx s = fmul(xin + yin, F2);
  int i = (xin + s) >> 16, j = (yin + s) >> 16;
  fx t = (i + j) * G2;
  fx x0 = xin - ((i << 16) - t), y0 = yin - ((j << 16) - t);
  int i1, j1; fx x1, y1, x2, y2, t0, t1, t2, n = 0;
  int ii = i & 255, jj = j & 255;
  if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
  x1 = x0 - (i1 << 16) + G2; y1 = y0 - (j1 << 16) + G2;
  x2 = x0 - FONE + 2 * G2; y2 = y0 - FONE + 2 * G2;
  t0 = 32768 - fmul(x0, x0) - fmul(y0, y0);
  if (t0 >= 0) { int gi = MOD12[perm[ii + perm[jj]]]; t0 = fmul(t0, t0); n += fmul(fmul(t0, t0), gdot2(gi, x0, y0)); }
  t1 = 32768 - fmul(x1, x1) - fmul(y1, y1);
  if (t1 >= 0) { int gi = MOD12[perm[ii + i1 + perm[jj + j1]]]; t1 = fmul(t1, t1); n += fmul(fmul(t1, t1), gdot2(gi, x1, y1)); }
  t2 = 32768 - fmul(x2, x2) - fmul(y2, y2);
  if (t2 >= 0) { int gi = MOD12[perm[ii + 1 + perm[jj + 1]]]; t2 = fmul(t2, t2); n += fmul(fmul(t2, t2), gdot2(gi, x2, y2)); }
  return 70 * n;
}
static HOT fx noise3(const u8 *perm, fx xin, fx yin, fx zin) {
  fx s = fmul(xin + yin + zin, 21845); /* F3 = 1/3 */
  int i = (xin + s) >> 16, j = (yin + s) >> 16, k = (zin + s) >> 16;
  fx t = (i + j + k) * 10923; /* G3 = 1/6 */
  fx x0 = xin - ((i << 16) - t), y0 = yin - ((j << 16) - t), z0 = zin - ((k << 16) - t);
  int i1, j1, k1, i2, j2, k2, ii = i & 255, jj = j & 255, kk = k & 255;
  fx G3 = 10923, x1, y1, z1, x2, y2, z2, x3, y3, z3, tt, n = 0;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  x1 = x0 - (i1 << 16) + G3; y1 = y0 - (j1 << 16) + G3; z1 = z0 - (k1 << 16) + G3;
  x2 = x0 - (i2 << 16) + 2 * G3; y2 = y0 - (j2 << 16) + 2 * G3; z2 = z0 - (k2 << 16) + 2 * G3;
  x3 = x0 - FONE + 3 * G3; y3 = y0 - FONE + 3 * G3; z3 = z0 - FONE + 3 * G3;
#define N3TERM(X, Y, Z, GI) tt = 39322 - fmul(X, X) - fmul(Y, Y) - fmul(Z, Z); \
  if (tt >= 0) { int gi = MOD12[GI]; tt = fmul(tt, tt); n += fmul(fmul(tt, tt), gdot3(gi, X, Y, Z)); }
  N3TERM(x0, y0, z0, perm[ii + perm[jj + perm[kk]]]);
  N3TERM(x1, y1, z1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]);
  N3TERM(x2, y2, z2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]);
  N3TERM(x3, y3, z3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]);
  return 32 * n;
}
static HOT fx fbm2(const u8 *perm, fx x, fx y, int oct) {
  fx s = 0; int o, a = FONE;
  static const s32 INORM[5] __attribute__((aligned(4))) = {0, 65536, 43691, 37449, 34953}; /* 1 / sum of amplitudes */
  for (o = 0; o < oct; o++) { s += fmul(a, noise2(perm, x << o, y << o)); a >>= 1; }
  return fmul(s, INORM[oct]);
}
