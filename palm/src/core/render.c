/* Software voxel raycaster (fixed point) + sprites + HUD.  Internal view 160x144 doubled to 320x288. */
#include "font.h"

#define RGB(r, g, b) ((u16)((((r) >> 3) << 11) | (((g) >> 2) << 5) | ((b) >> 3)))
#define MASK 0x07E0F81Fu
#define KEY 0xF81F
#define FOCAL 102  /* px: 72 / tan(35deg) -> vertical FOV 70 like web mobile */
static inline AI u32 spr32(u16 c) { return ((u32)c | ((u32)c << 16)) & MASK; }
static inline AI u16 pk32(u32 x) { return (u16)(x | (x >> 16)); }
static inline AI u16 blend(u16 a, u16 b, int f) { /* f/32 of b */
  u32 x = spr32(a), y = spr32(b); return pk32(((x * (32 - f) + y * f) >> 5) & MASK);
}
static inline AI u16 scale565(u16 c, int b) { return pk32(((spr32(c) * (u32)b) >> 5) & MASK); }
static inline AI const u16 *tile(const VC *g, int t) { return g->tiles[(t >> 6) & 1] + ((t & 63) << 8); }
static inline u16 lerp565(u16 a, u16 b, int t256) { return blend(a, b, t256 >> 3); }

/* per-frame lookup: final brightness (0..32) for light byte & face */
typedef struct { u8 b[256][4]; } BTab;
static void make_btab(VC *g, BTab *t) {
  int l, f; static const u8 FS[4] = {32, 16, 26, 22}; /* top, bottom, x, z (web FACE_SHADE 1, .5, .8, .7) */
  for (l = 0; l < 256; l++) {
    int sky = g->lightCurve[l >> 4] * g->bright >> 8, blk = g->lightCurve[l & 15];
    int L = sky > blk ? sky : blk; if (L < 13) L = 13;
    for (f = 0; f < 4; f++) t->b[l][f] = (u8)((L * FS[f] + 128) >> 8);
  }
}

/* ---------------- sky colours (js/main.js updateSky) ---------------- */
static int smooth256(fx a, fx b, fx x) { fx t; if (x <= a) return 0; if (x >= b) return 256; t = (fx)(((s64)(x - a) << 16) / (b - a)); return (int)(fmul(fmul(t, t), (3 * FONE - 2 * t)) >> 8); }
static void sky_update(VC *g) {
  int a = (int)(g->worldTime >> 22);       /* 0..1023 */
  fx elev = SIN(g, a);
  int day = smooth256(-FX(0.18), FX(0.22), elev);
  fx ae = elev < 0 ? -elev : elev;
  int sunset = ae >= FX(0.24) ? 0 : (int)(256 - (ae * 256 / FX(0.24)));
  u16 c = lerp565(RGB(0x05, 0x07, 0x0f), RGB(0x87, 0xc5, 0xf0), day);
  c = lerp565(c, RGB(0xf0, 0x8a, 0x4b), sunset * 45 / 100);
  g->day = day; g->bright = (int)(0.15 * 256) + day * 85 / 100;
  g->skyCol = c; g->fogCol = c;
  if (g->headInWater) g->fogCol = scale565(RGB(0x0e, 0x2f, 0x6a), 10 + day * 22 / 256);
  if (g->inLava == 2) g->fogCol = RGB(0xd9, 0x4c, 0x08);
}

/* ---------------- ray casting ---------------- */
typedef struct { fx near_, far_; u32 fogS; int fogRange; } FogP;
static inline AI int fogf(const FogP *fp, fx t) { if (t <= fp->near_) return 0; if (t >= fp->far_) return 32; return (int)(((t - fp->near_) >> 8) * fp->fogRange >> 16); }
static inline AI u16 fogmix(u16 c, const FogP *fp, int f) { if (!f) return c; return pk32(((spr32(c) * (32 - f) + fp->fogS * f) >> 5) & MASK); }

/* cross-shaped plant inside a cell: returns texel or KEY; *tHit gets the depth */
static HOT u16 hit_cross(const VC *g, const u16 *tp, fx ox, fx oy, fx oz, fx dx, fx dy, fx dz, int cx, int cy, int cz, fx tin, fx tout, fx *tHit, int torch) {
  u16 best = KEY; fx bt = tout; int p;
  for (p = 0; p < 2; p++) {
    /* plane p0: lx - lz = 0, p1: lx + lz = 1  (cell-local) */
    fx ex = ox + fmul(dx, tin) - (cx << 16), ez = oz + fmul(dz, tin) - (cz << 16);
    fx num = p ? (FONE - ex - ez) : (ez - ex), den = p ? (dx + dz) : (dx - dz), s, ly, lx;
    if (den > -64 && den < 64) continue;
    s = fdiv(g, num, den);
    if (s < 0 || tin + s >= bt) continue;
    lx = ex + fmul(dx, s); ly = oy + fmul(dy, tin + s) - (cy << 16);
    if (lx < 0 || lx >= FONE || ly < 0 || ly >= FONE) continue;
    {
      int u = lx >> 12, v = 15 - (ly >> 12); u16 c;
      if (torch) { u = (u - 8) / 2 + 8; } /* thin torch */
      c = tp[(v << 4) | (u & 15)];
      if (c != KEY) { best = c; bt = tin + s; }
    }
  }
  *tHit = bt; return best;
}
/* axis aligned box [b0,b1] (cell-local 16.16) */
static int hit_box(const VC *g, fx ox, fx oy, fx oz, fx dx, fx dy, fx dz, int cx, int cy, int cz, const fx *b0, const fx *b1, fx *tHit, int *face, fx *hu, fx *hv) {
  fx o[3], d[3], tmin = -RCP_INF, tmax = RCP_INF; int i, f = 0;
  o[0] = ox - (cx << 16); o[1] = oy - (cy << 16); o[2] = oz - (cz << 16); d[0] = dx; d[1] = dy; d[2] = dz;
  for (i = 0; i < 3; i++) {
    if (d[i] > -16 && d[i] < 16) { if (o[i] < b0[i] || o[i] > b1[i]) return 0; continue; }
    {
      fx r = fdiv(g, FONE, d[i]); fx t1 = fmul(b0[i] - o[i], r), t2 = fmul(b1[i] - o[i], r), tt;
      if (t1 > t2) { tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; f = i; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return 0;
    }
  }
  if (tmax < 0) return 0;
  *tHit = tmin; *face = f;
  {
    fx hx = o[0] + fmul(dx, tmin), hy = o[1] + fmul(dy, tmin), hz = o[2] + fmul(dz, tmin);
    if (f == 0) { *hu = hz; *hv = hy; } else if (f == 1) { *hu = hx; *hv = hz; } else { *hu = hx; *hv = hy; }
  }
  return 1;
}
static void door_box(int id, fx *b0, fx *b1) {
  int f = (id - OAK_DOOR) >> 2, open = (id - OAK_DOOR) & 2; const fx T = 3 * 4096;
  if (open) f = (f + 1) & 3;
  b0[0] = 0; b0[1] = 0; b0[2] = 0; b1[0] = FONE; b1[1] = FONE; b1[2] = FONE;
  if (f == 0) b1[2] = T; else if (f == 1) b0[0] = FONE - T; else if (f == 2) b0[2] = FONE - T; else b1[0] = T;
}

/* generic DDA: used when the camera is outside the island box (swimming in the open sea) */
static void render_world_generic(VC *g, const BTab *bt) {
  const u8 *B = g->blocks, *L = g->light;
  fx ox = g->camX, oy = g->camY, oz = g->camZ;
  int cx0 = ox >> 16, cy0 = oy >> 16, cz0 = oz >> 16, px, py;
  const fx K = 637; /* tan(35)/72 */
  fx rkx = fmul(g->crx, K), rkz = fmul(g->crz, K);
  FogP fp; fx tFar;
  int camWater = g->headInWater, tgt = g->tgtValid ? (int)IDX(g->tgtX, g->tgtY, g->tgtZ) : -1;
  u16 *view = g->view; u16 *zb = g->zbuf;
  u32 steps = 0;
  if (g->inLava == 2) { fp.near_ = FX(0.2); fp.far_ = FX(3); }
  else if (camWater) { fp.near_ = FX(1); fp.far_ = FX(12); }
  else { fp.near_ = FX(VIEWDIST * 0.55); fp.far_ = FX(VIEWDIST * 0.98); }
  fp.fogS = spr32(g->fogCol);
  fp.fogRange = (int)(((s64)32 << 16) / ((fp.far_ - fp.near_) >> 8));
  tFar = fp.far_;
  for (py = 0; py < VH; py++) {
    fx vy = (fx)((2 * py - VH + 1) * K / 2);  /* (py+0.5-72)*K */
    fx dX = g->cfx - fmul(g->cux, vy) - fmul(rkx, FX(VW / 2 - 0.5));
    fx dY = g->cfy - fmul(g->cuy, vy);
    fx dZ = g->cfz - fmul(g->cuz, vy) - fmul(rkz, FX(VW / 2 - 0.5));
    for (px = 0; px < VW; px++, dX += rkx, dZ += rkz) {
      int x = cx0, y = cy0, z = cz0, sx, sy, sz, face = 1, tinted = 0;
      fx tDX, tDY, tDZ, tMX, tMY, tMZ, t = 0, tin = 0;
      s32 idx, prev; u16 col = 0, tint = 0; int tintA = 0, outside = 0; fx tintT = 0;
      int hit = 0;
      /* setup */
      if (dX > 0) { sx = 1; tDX = rcp(g, dX); tMX = fmul(((x + 1) << 16) - ox, tDX); }
      else if (dX < 0) { sx = -1; tDX = rcp(g, -dX); tMX = fmul(ox - (x << 16), tDX); }
      else { sx = 0; tDX = RCP_INF; tMX = RCP_INF; }
      if (dY > 0) { sy = 1; tDY = rcp(g, dY); tMY = fmul(((y + 1) << 16) - oy, tDY); }
      else if (dY < 0) { sy = -1; tDY = rcp(g, -dY); tMY = fmul(oy - (y << 16), tDY); }
      else { sy = 0; tDY = RCP_INF; tMY = RCP_INF; }
      if (dZ > 0) { sz = 1; tDZ = rcp(g, dZ); tMZ = fmul(((z + 1) << 16) - oz, tDZ); }
      else if (dZ < 0) { sz = -1; tDZ = rcp(g, -dZ); tMZ = fmul(oz - (z << 16), tDZ); }
      else { sz = 0; tDZ = RCP_INF; tMZ = RCP_INF; }
      idx = IDX(x, y, z); prev = idx;
      if ((unsigned)x >= WX || (unsigned)z >= WZ || (unsigned)y >= WY) outside = 1;
      for (;;) {
        int id;
        tin = t;
        prev = idx;
        if (tMX < tMY) {
          if (tMX < tMZ) { x += sx; idx += sx; t = tMX; tMX += tDX; face = 0; }
          else { z += sz; idx += sz * WX; t = tMZ; tMZ += tDZ; face = 2; }
        } else {
          if (tMY < tMZ) { y += sy; idx += sy * WXZ; t = tMY; tMY += tDY; face = 1; }
          else { z += sz; idx += sz * WX; t = tMZ; tMZ += tDZ; face = 2; }
        }
        STEP_STAT(steps++);
        if (t >= tFar) break;
        if ((unsigned)x >= WX || (unsigned)z >= WZ) {
          /* outside the island: endless sea at y <= SEA */
          if (y <= SEA && y >= 0) { id = WATER; }
          else { if (sy >= 0 && y > SEA) break; continue; }
          if (y < 0) break;
          if (!tinted && !camWater) { /* ocean surface: opaque-ish deep water */
            fx hx = ox + fmul(dX, t), hz = oz + fmul(dZ, t);
            const u16 *tp = tile(g, T_WATER); int f = fogf(&fp, t);
            col = scale565(tp[(((hz >> 12) & 15) << 4) | ((hx >> 12) & 15)], bt->b[0xF0][0]);
            col = blend(col, scale565(RGB(0x0e, 0x2f, 0x6a), bt->b[0xF0][0]), 12);
            (void)f; hit = 1; break;
          }
          if (camWater) { col = g->fogCol; hit = 1; break; }
          continue;
        }
        if ((unsigned)y >= WY) { if (sy > 0) break; continue; }
        id = B[idx];
        if (!id) continue;
        {
          const BDef *d = &g->bd[id];
          int r = d->render;
          if (r == R_OPAQUE || r == R_CUTOUT || r == R_LAVA || (r == R_WATER && !camWater) || r == R_GLASS) {
            fx hu, hv; int tex, sidx = face == 1 ? (sy > 0 ? 1 : 0) : face == 0 ? 2 : 3; u16 c; const u16 *tp;
            if (face == 0) { hu = oz + fmul(dZ, t); hv = oy + fmul(dY, t); if (sx < 0) hu = -hu; }
            else if (face == 1) { hu = ox + fmul(dX, t); hv = oz + fmul(dZ, t); }
            else { hu = ox + fmul(dX, t); hv = oy + fmul(dY, t); if (sz > 0) hu = -hu; }
            tex = face == 1 ? (sy > 0 ? d->bottom : d->top) : d->side;
            if (r == R_LAVA || r == R_WATER) { if (face != 1) hv = -hv; hv += (fx)(g->timeMs << 4) * (r == R_LAVA ? 1 : 2); }
            tp = tile(g, tex);
            c = tp[face == 1 ? ((((hv >> 12) & 15) << 4) | ((hu >> 12) & 15)) : (((15 - ((hv >> 12) & 15)) << 4) | ((hu >> 12) & 15))];
            if (c == KEY) continue;
            if (r == R_WATER || r == R_GLASS) {
              if (!tinted) {
                int lb = bt->b[(u32)prev < WSIZE ? L[prev] : 0xF0][sidx];
                tint = scale565(c, lb); tintT = t; tinted = 1; tintA = r == R_WATER ? 18 : 14;
              }
              continue;
            }
            {
              int b = r == R_LAVA ? 32 : bt->b[(u32)prev < WSIZE ? L[prev] : 0xF0][sidx];
              if ((s32)idx == tgt) { int eu = (hu >> 11) & 31, ev = (hv >> 11) & 31; if (eu == 0 || eu == 31 || ev == 0 || ev == 31) b = b / 4; }
              if (id == 63) b = g->tntFlash ? 32 : b;
              col = scale565(c, b);
              if (id == 63 && g->tntFlash) col = blend(col, 0xFFFF, 20);
            }
            hit = 1; break;
          } else if (r == R_CROSS || r == R_TORCH) {
            fx th; fx tout = tMX < tMY ? (tMX < tMZ ? tMX : tMZ) : (tMY < tMZ ? tMY : tMZ);
            u16 c = hit_cross(g, tile(g, d->side), ox, oy, oz, dX, dY, dZ, x, y, z, t, tout, &th, r == R_TORCH);
            if (c == KEY) continue;
            col = r == R_TORCH ? c : scale565(c, bt->b[L[idx]][0]); t = th; hit = 1;
            if ((s32)idx == tgt) col = scale565(col, 20);
            break;
          } else if (r == R_DOOR || r == R_BED) {
            fx b0[3], b1[3], th, hu, hv; int f, tex;
            if (r == R_DOOR) door_box(id, b0, b1); else { b0[0] = b0[1] = b0[2] = 0; b1[0] = b1[2] = FONE; b1[1] = 9 * 4096; }
            if (!hit_box(g, ox, oy, oz, dX, dY, dZ, x, y, z, b0, b1, &th, &f, &hu, &hv)) continue;
            tex = f == 1 ? d->top : d->side;
            if (r == R_BED && f != 1) { int fz = (id - BED) >> 1; tex = ((fz & 1) ? f == 2 : f == 0) ? T_BED_END : T_BED_SIDE; }
            {
              int u = (hu >> 12) & 15, v = f == 1 ? ((hv >> 12) & 15) : 15 - ((hv >> 12) & 15); u16 c = tile(g, tex)[(v << 4) | u];
              if (c == KEY) continue;
              col = scale565(c, bt->b[L[idx] | 0][f == 1 ? 0 : 2]);
              if ((s32)idx == tgt) col = scale565(col, 22);
            }
            t = th < t ? t : th; hit = 1; break;
          } else continue; /* water seen from inside */
        }
      }
      if (hit) {
        int f = fogf(&fp, t);
        if (tinted) { int a = tintA + (int)((t - tintT) >> 15); if (a > 28) a = 28; col = blend(col, tint, a); }
        col = fogmix(col, &fp, f);
        zb[py * VW + px] = (u16)(t >> 8 > 65000 ? 65000 : t >> 8);
      } else {
        col = g->skyCol;
        if (tinted) { int f = fogf(&fp, tintT); col = fogmix(blend(col, tint, 26), &fp, f); zb[py * VW + px] = (u16)(tintT >> 8); }
        else zb[py * VW + px] = 0xFFFF;
      }
      view[py * VW + px] = col;
    }
  }
  g->steps = steps; g->rays = VW * VH;
}

/* fast DDA for a camera inside the island: steps only the cell index and stops at the precomputed box exit */
static HOT void render_world_fast(VC *g, const BTab *bt) {
  const u8 *B = g->blocks, *L = g->light;
  fx ox = g->camX, oy = g->camY, oz = g->camZ;
  int cx0 = ox >> 16, cy0 = oy >> 16, cz0 = oz >> 16, px, py;
  const fx K = 637; /* tan(35)/72 */
  fx rkx = fmul(g->crx, K), rkz = fmul(g->crz, K);
  FogP fp; fx tFar;
  int camWater = g->headInWater, tgt = g->tgtValid ? (int)IDX(g->tgtX, g->tgtY, g->tgtZ) : -1;
  u16 *view = g->view; u16 *zb = g->zbuf;
  u32 steps = 0;
  if (g->inLava == 2) { fp.near_ = FX(0.2); fp.far_ = FX(3); }
  else if (camWater) { fp.near_ = FX(1); fp.far_ = FX(12); }
  else { fp.near_ = FX(VIEWDIST * 0.55); fp.far_ = FX(VIEWDIST * 0.98); }
  fp.fogS = spr32(g->fogCol);
  fp.fogRange = (int)(((s64)32 << 16) / ((fp.far_ - fp.near_) >> 8));
  tFar = fp.far_;
  for (py = 0; py < VH; py++) {
    fx vy = (fx)((2 * py - VH + 1) * K / 2);  /* (py+0.5-72)*K */
    fx dX = g->cfx - fmul(g->cux, vy) - fmul(rkx, FX(VW / 2 - 0.5));
    fx dY = g->cfy - fmul(g->cuy, vy);
    fx dZ = g->cfz - fmul(g->cuz, vy) - fmul(rkz, FX(VW / 2 - 0.5));
    for (px = 0; px < VW; px++, dX += rkx, dZ += rkz) {
      int x, y, z, sx, sy, sz, face = 1, tinted = 0, dIX, dIY, dIZ;
      fx tDX, tDY, tDZ, tMX, tMY, tMZ, t = 0, tStop;
      s32 idx, prev; u16 col = 0, tint = 0; int tintA = 0, outside = 0; fx tintT = 0;
      int hit = 0;
      /* setup */
      if (dX > 0) { sx = 1; tDX = rcp(g, dX); tMX = fmul(((cx0 + 1) << 16) - ox, tDX); }
      else if (dX < 0) { sx = -1; tDX = rcp(g, -dX); tMX = fmul(ox - (cx0 << 16), tDX); }
      else { sx = 0; tDX = RCP_INF; tMX = RCP_INF; }
      if (dY > 0) { sy = 1; tDY = rcp(g, dY); tMY = fmul(((cy0 + 1) << 16) - oy, tDY); }
      else if (dY < 0) { sy = -1; tDY = rcp(g, -dY); tMY = fmul(oy - (cy0 << 16), tDY); }
      else { sy = 0; tDY = RCP_INF; tMY = RCP_INF; }
      if (dZ > 0) { sz = 1; tDZ = rcp(g, dZ); tMZ = fmul(((cz0 + 1) << 16) - oz, tDZ); }
      else if (dZ < 0) { sz = -1; tDZ = rcp(g, -dZ); tMZ = fmul(oz - (cz0 << 16), tDZ); }
      else { sz = 0; tDZ = RCP_INF; tMZ = RCP_INF; }
      idx = IDX(cx0, cy0, cz0); prev = idx; (void)outside;
      dIX = sx; dIY = sy * WXZ; dIZ = sz * WX;
      { /* t of the step that leaves the box on each axis (same arithmetic as the DDA, so the compare is exact) */
        s64 m = tFar, l;
        l = sx > 0 ? (s64)tMX + (s64)(WX - 1 - cx0) * tDX : sx < 0 ? (s64)tMX + (s64)cx0 * tDX : m; if (l < m) m = l;
        l = sy > 0 ? (s64)tMY + (s64)(WY - 1 - cy0) * tDY : sy < 0 ? (s64)tMY + (s64)cy0 * tDY : m; if (l < m) m = l;
        l = sz > 0 ? (s64)tMZ + (s64)(WZ - 1 - cz0) * tDZ : sz < 0 ? (s64)tMZ + (s64)cz0 * tDZ : m; if (l < m) m = l;
        tStop = (fx)m;
      }
      for (;;) {
        int id;
        if (tMX < tMY) {
          if (tMX < tMZ) { idx += dIX; t = tMX; tMX += tDX; face = 0; }
          else { idx += dIZ; t = tMZ; tMZ += tDZ; face = 2; }
        } else {
          if (tMY < tMZ) { idx += dIY; t = tMY; tMY += tDY; face = 1; }
          else { idx += dIZ; t = tMZ; tMZ += tDZ; face = 2; }
        }
        if (t >= tStop) break;
        id = B[idx];
        if (!id) continue;
        prev = idx - (face == 0 ? dIX : face == 1 ? dIY : dIZ);
        {
          const BDef *d = &g->bd[id];
          int r = d->render;
          if (r == R_OPAQUE || r == R_CUTOUT || r == R_LAVA || (r == R_WATER && !camWater) || r == R_GLASS) {
            fx hu, hv; int tex, sidx = face == 1 ? (sy > 0 ? 1 : 0) : face == 0 ? 2 : 3; u16 c; const u16 *tp;
            if (face == 0) { hu = oz + fmul(dZ, t); hv = oy + fmul(dY, t); if (sx < 0) hu = -hu; }
            else if (face == 1) { hu = ox + fmul(dX, t); hv = oz + fmul(dZ, t); }
            else { hu = ox + fmul(dX, t); hv = oy + fmul(dY, t); if (sz > 0) hu = -hu; }
            tex = face == 1 ? (sy > 0 ? d->bottom : d->top) : d->side;
            if (r == R_LAVA || r == R_WATER) { if (face != 1) hv = -hv; hv += (fx)(g->timeMs << 4) * (r == R_LAVA ? 1 : 2); }
            tp = tile(g, tex);
            c = tp[face == 1 ? ((((hv >> 12) & 15) << 4) | ((hu >> 12) & 15)) : (((15 - ((hv >> 12) & 15)) << 4) | ((hu >> 12) & 15))];
            if (c == KEY) continue;
            if (r == R_WATER || r == R_GLASS) {
              if (!tinted) {
                int lb = bt->b[(u32)prev < WSIZE ? L[prev] : 0xF0][sidx];
                tint = scale565(c, lb); tintT = t; tinted = 1; tintA = r == R_WATER ? 18 : 14;
              }
              continue;
            }
            {
              int b = r == R_LAVA ? 32 : bt->b[(u32)prev < WSIZE ? L[prev] : 0xF0][sidx];
              if ((s32)idx == tgt) { int eu = (hu >> 11) & 31, ev = (hv >> 11) & 31; if (eu == 0 || eu == 31 || ev == 0 || ev == 31) b = b / 4; }
              if (id == 63) b = g->tntFlash ? 32 : b;
              col = scale565(c, b);
              if (id == 63 && g->tntFlash) col = blend(col, 0xFFFF, 20);
            }
            hit = 1; break;
          } else if (r == R_CROSS || r == R_TORCH) {
            fx th; fx tout = tMX < tMY ? (tMX < tMZ ? tMX : tMZ) : (tMY < tMZ ? tMY : tMZ);
            u16 c; y = idx / WXZ; z = (idx - y * WXZ) / WX; x = idx - y * WXZ - z * WX;
            c = hit_cross(g, tile(g, d->side), ox, oy, oz, dX, dY, dZ, x, y, z, t, tout, &th, r == R_TORCH);
            if (c == KEY) continue;
            col = r == R_TORCH ? c : scale565(c, bt->b[L[idx]][0]); t = th; hit = 1;
            if ((s32)idx == tgt) col = scale565(col, 20);
            break;
          } else if (r == R_DOOR || r == R_BED) {
            fx b0[3], b1[3], th, hu, hv; int f, tex;
            if (r == R_DOOR) door_box(id, b0, b1); else { b0[0] = b0[1] = b0[2] = 0; b1[0] = b1[2] = FONE; b1[1] = 9 * 4096; }
            y = idx / WXZ; z = (idx - y * WXZ) / WX; x = idx - y * WXZ - z * WX;
            if (!hit_box(g, ox, oy, oz, dX, dY, dZ, x, y, z, b0, b1, &th, &f, &hu, &hv)) continue;
            tex = f == 1 ? d->top : d->side;
            if (r == R_BED && f != 1) { int fz = (id - BED) >> 1; tex = ((fz & 1) ? f == 2 : f == 0) ? T_BED_END : T_BED_SIDE; }
            {
              int u = (hu >> 12) & 15, v = f == 1 ? ((hv >> 12) & 15) : 15 - ((hv >> 12) & 15); u16 c = tile(g, tex)[(v << 4) | u];
              if (c == KEY) continue;
              col = scale565(c, bt->b[L[idx] | 0][f == 1 ? 0 : 2]);
              if ((s32)idx == tgt) col = scale565(col, 22);
            }
            t = th < t ? t : th; hit = 1; break;
          } else continue; /* water seen from inside */
        }
      }
      if (!hit && t < tFar) { /* left the island box: endless sea at y <= SEA */
        int yc = (oy + fmul(dY, t)) >> 16; fx th = -1;
        if (face == 1 && sy > 0) th = -1;
        else if (yc <= SEA) th = t;
        else if (sy < 0) { th = fmul(oy - ((SEA + 1) << 16), tDY); if (th >= tFar) th = -1; }
        if (th >= 0) {
          if (camWater) { col = g->fogCol; hit = 1; t = th; }
          else if (!tinted) {
            fx hx = ox + fmul(dX, th), hz = oz + fmul(dZ, th);
            const u16 *tp = tile(g, T_WATER);
            col = scale565(tp[(((hz >> 12) & 15) << 4) | ((hx >> 12) & 15)], bt->b[0xF0][0]);
            col = blend(col, scale565(RGB(0x0e, 0x2f, 0x6a), bt->b[0xF0][0]), 12);
            hit = 1; t = th;
          }
        }
      }
      if (hit) {
        int f = fogf(&fp, t);
        if (tinted) { int a = tintA + (int)((t - tintT) >> 15); if (a > 28) a = 28; col = blend(col, tint, a); }
        col = fogmix(col, &fp, f);
        zb[py * VW + px] = (u16)(t >> 8 > 65000 ? 65000 : t >> 8);
      } else {
        col = g->skyCol;
        if (tinted) { int f = fogf(&fp, tintT); col = fogmix(blend(col, tint, 26), &fp, f); zb[py * VW + px] = (u16)(tintT >> 8); }
        else zb[py * VW + px] = 0xFFFF;
      }
      view[py * VW + px] = col;
    }
  }
  g->steps = steps; g->rays = VW * VH;
}

#ifdef VC_HOST
static int vc_force_generic;
#endif
static void render_world(VC *g, const BTab *bt) {
  int x = g->camX >> 16, y = g->camY >> 16, z = g->camZ >> 16;
#ifdef VC_HOST
  if (vc_force_generic) { render_world_generic(g, bt); return; }
#endif
  if ((unsigned)x < WX && (unsigned)y < WY && (unsigned)z < WZ) render_world_fast(g, bt);
  else render_world_generic(g, bt);
}

/* ---------------- sun, moon, stars ---------------- */
static int project(const VC *g, fx rx, fx ry, fx rz, int *sx, int *sy, fx *depth) {
  fx z = fmul(rx, g->cfx) + fmul(ry, g->cfy) + fmul(rz, g->cfz), X, Y;
  if (z < FX(0.2)) return 0;
  X = fmul(rx, g->crx) + fmul(rz, g->crz);
  Y = fmul(rx, g->cux) + fmul(ry, g->cuy) + fmul(rz, g->cuz);
  {
    fx iz = rcp(g, (u32)z);
    *sx = VW / 2 + (int)(fmul(X, iz) * FOCAL >> 16);
    *sy = VH / 2 - (int)(fmul(Y, iz) * FOCAL >> 16);
  }
  *depth = z; return 1;
}
static void sky_square(VC *g, int cx, int cy, int r, u16 c, int a) {
  int x, y;
  for (y = cy - r; y <= cy + r; y++) for (x = cx - r; x <= cx + r; x++) {
    if ((unsigned)x >= VW || (unsigned)y >= VH) continue;
    if (g->zbuf[y * VW + x] != 0xFFFF) continue;
    g->view[y * VW + x] = blend(g->view[y * VW + x], c, a);
  }
}
static void render_sky(VC *g) {
  int a = (int)(g->worldTime >> 22), sx, sy, i; fx d;
  fx sxv = COS(g, a), syv = SIN(g, a), szv = FX(0.25);
  if (g->headInWater) return;
  if (g->day < 230) { /* stars */
    int alpha = (230 - g->day) * 32 / 230;
    for (i = 0; i < 90; i++) {
      u32 h = hash3u(i, 77, 3, 12345);
      fx vx = (fx)((h & 0xFFFF) - 32768) * 2, vz = (fx)(((h >> 16) & 0xFFFF) - 32768) * 2, vy = (fx)(hash3u(i, 5, 9, 99) >> 16) + 4000;
      if (project(g, vx, vy, vz, &sx, &sy, &d)) sky_square(g, sx, sy, 0, RGB(255, 255, 255), alpha);
    }
  }
  if (project(g, sxv, syv, szv, &sx, &sy, &d)) { sky_square(g, sx, sy, 6, RGB(255, 236, 160), 30); sky_square(g, sx, sy, 4, RGB(255, 252, 230), 32); }
  if (project(g, -sxv, -syv, -szv, &sx, &sy, &d)) { sky_square(g, sx, sy, 4, RGB(220, 224, 236), 30); sky_square(g, sx - 1, sy + 1, 1, RGB(170, 175, 190), 30); }
}

/* ---------------- mobs as billboard sprites ---------------- */
static HOT void render_mobs(VC *g, const BTab *bt) {
  int order[MAXMOBS], n = 0, i, j;
  fx dep[MAXMOBS];
  for (i = 0; i < MAXMOBS; i++) {
    Mob *m = &g->mobs[i]; fx rx, ry, rz, z;
    if (!m->alive) continue;
    rx = m->x - g->camX; ry = m->y - g->camY; rz = m->z - g->camZ;
    z = fmul(rx, g->cfx) + fmul(ry, g->cfy) + fmul(rz, g->cfz);
    if (z < FX(0.3) || z > FX(VIEWDIST)) continue;
    dep[n] = z; order[n++] = i;
  }
  for (i = 1; i < n; i++) for (j = i; j > 0 && dep[j] > dep[j - 1]; j--) { fx t = dep[j]; int o = order[j]; dep[j] = dep[j - 1]; order[j] = order[j - 1]; dep[j - 1] = t; order[j - 1] = o; }
  for (i = 0; i < n; i++) {
    Mob *m = &g->mobs[order[i]]; int sx, sy, size, view, x0, y0, x1, y1, x, y, light, b, f; fx depth, step, mz;
    fx cx = g->camX - m->x, cz = g->camZ - m->z;
    fx fwx = SIN(g, m->yaw), fwz = COS(g, m->yaw);   /* model +z rotated by yaw */
    fx dF = fmul(fwx, cx) + fmul(fwz, cz), dR = fmul(COS(g, m->yaw), cx) - fmul(SIN(g, m->yaw), cz);
    const u16 *sp;
    FogP fp;
    if (!project(g, m->x - g->camX, m->y - g->camY, m->z - g->camZ, &sx, &sy, &depth)) continue;
    view = (dF < 0 ? -dF : dF) >= (dR < 0 ? -dR : dR) ? (dF > 0 ? 0 : 2) : (dR > 0 ? 1 : 3);
    sp = g->spr[m->type] + view * 1600;
    size = (int)(((s64)FX(2.5) * FOCAL / depth));
    if (size < 2) continue;
    if (size > 400) size = 400;
    x0 = sx - size / 2; y1 = sy; y0 = sy - size; x1 = x0 + size;
    step = (fx)((40 << 16) / size);
    mz = depth >> 8;
    light = light_at(g, m->x >> 16, (m->y >> 16) + 1, m->z >> 16);
    b = bt->b[light][2] + 2; if (b > 32) b = 32;
    fp.near_ = FX(VIEWDIST * 0.55); fp.far_ = FX(VIEWDIST * 0.98); fp.fogS = spr32(g->fogCol); fp.fogRange = (int)(((s64)32 << 16) / ((fp.far_ - fp.near_) >> 8));
    if (g->headInWater) { fp.near_ = FX(1); fp.far_ = FX(12); fp.fogRange = (int)(((s64)32 << 16) / ((fp.far_ - fp.near_) >> 8)); }
    f = fogf(&fp, depth);
    for (y = y0 < 0 ? 0 : y0; y < y1 && y < VH; y++) {
      int ty = (int)(((s64)(y - y0) * step) >> 16); const u16 *row; fx u;
      if (ty > 39) ty = 39;
      row = sp + ty * 40;
      x = x0 < 0 ? 0 : x0; u = (x - x0) * step;
      for (; x < x1 && x < VW; x++, u += step) {
        u16 c = row[(u >> 16) > 39 ? 39 : (u >> 16)];
        if (c == KEY) continue;
        if (g->zbuf[y * VW + x] <= mz) continue;
        c = scale565(c, b);
        if (m->hurt) c = blend(c, RGB(255, 40, 40), 14);
        g->view[y * VW + x] = fogmix(c, &fp, f);
        g->zbuf[y * VW + x] = (u16)mz;
      }
    }
  }
}

/* ---------------- 2D helpers on the 320x320 back buffer ---------------- */
static void fill(VC *g, int x0, int y0, int w, int h, u16 c) {
  int x, y; for (y = y0; y < y0 + h; y++) { if ((unsigned)y >= SH) continue; for (x = x0; x < x0 + w; x++) if ((unsigned)x < SW) g->back[y * SW + x] = c; }
}
static void shade_rect(VC *g, int x0, int y0, int w, int h) { /* darken (50%) */
  int x, y; for (y = y0; y < y0 + h; y++) { if ((unsigned)y >= SH) continue; for (x = x0; x < x0 + w; x++) if ((unsigned)x < SW) g->back[y * SW + x] = (u16)((g->back[y * SW + x] >> 1) & 0x7BEF); }
}
static void frame_rect(VC *g, int x0, int y0, int w, int h, u16 c) { fill(g, x0, y0, w, 1, c); fill(g, x0, y0 + h - 1, w, 1, c); fill(g, x0, y0, 1, h, c); fill(g, x0 + w - 1, y0, 1, h, c); }
static int text_w(const char *s) { int n = 0; while (*s++) n++; return n * 8; }
static void draw_char(VC *g, int x, int y, int ch, u16 c) {
  int r, b; const u8 *gl;
  if (ch < 32 || ch > 126) ch = '?';
  gl = FONT8x16[ch - 32];
  for (r = 0; r < 16; r++) { int bits = gl[r]; if (!bits || (unsigned)(y + r) >= SH) continue; for (b = 0; b < 8; b++) if (bits & (0x80 >> b) && (unsigned)(x + b) < SW) g->back[(y + r) * SW + x + b] = c; }
}
static void draw_text(VC *g, int x, int y, const char *s, u16 c, int shadow) {
  int cx = x; const char *p;
  if (shadow) for (p = s, cx = x; *p; p++, cx += 8) draw_char(g, cx + 1, y + 1, (u8)*p, RGB(30, 30, 30));
  for (p = s, cx = x; *p; p++, cx += 8) draw_char(g, cx, y, (u8)*p, c);
}
static void draw_text_c(VC *g, int cx, int y, const char *s, u16 c, int shadow) { draw_text(g, cx - text_w(s) / 2, y, s, c, shadow); }
static char *itoa2(char *p, int v, int w) { char tmp[12]; int n = 0, neg = v < 0; if (neg) v = -v; do { tmp[n++] = (char)('0' + v % 10); v /= 10; } while (v); while (n < w) tmp[n++] = '0'; if (neg) *p++ = '-'; while (n) *p++ = tmp[--n]; *p = 0; return p; }
static char *scpy(char *p, const char *s) { while (*s) *p++ = *s++; *p = 0; return p; }
/* scaled tile */
static void draw_tile(VC *g, int x0, int y0, int t, int size, int bright) {
  const u16 *tp = tile(g, t); int x, y;
  if (size <= 0) return;
  t &= 127;
  tp = tile(g, t);
  for (y = 0; y < size; y++) for (x = 0; x < size; x++) {
    u16 c = tp[((y * 16 / size) << 4) | (x * 16 / size)];
    if (c == KEY || (unsigned)(x0 + x) >= SW || (unsigned)(y0 + y) >= (unsigned)g->clipH) continue;
    g->back[(y0 + y) * SW + x0 + x] = bright < 32 ? scale565(c, bright) : c;
  }
}
/* isometric block icon (like textures.drawIcon) */
static void draw_iso(VC *g, int x0, int y0, int S, int id) {
  const BDef *d; const u16 *top, *side; int px, py; fx ik; int s;
  id &= 255; d = &g->bd[id];
  if (S <= 0) return;
  ik = (fx)((32 << 16) / S); s = S / 2;
  if (d->render == R_CROSS || d->render == R_TORCH || d->render == R_DOOR || (d->flags & F_ITEM)) {
    int t = d->side; if (d->render == R_DOOR) t = T_DOOR_ITEM; if (id >= BED && id < BED + 8) t = T_BED_ITEM;
    draw_tile(g, x0 + S / 10, y0 + S / 10, t, S * 8 / 10, 32); return;
  }
  if (d->render == R_BED) { draw_tile(g, x0 + S / 10, y0 + S / 10, T_BED_ITEM, S * 8 / 10, 32); return; }
  top = tile(g, d->top); side = tile(g, d->side);
  for (py = 0; py < S; py++) for (px = 0; px < S; px++) {
    fx dx = (px - s) << 16, dy = py << 16, u, v; u16 c = KEY; int b = 32;
    /* top face: origin (s,0), u*(k,k/2) + v*(-k,k/2), k = S/32 */
    u = fmul((2 * dy + dx) / 2, ik); v = fmul((2 * dy - dx) / 2, ik);
    if (u >= 0 && v >= 0 && u < FX(16) && v < FX(16)) { int uu = (int)(u >> 16) & 15, vv = (int)(v >> 16) & 15; c = top[(vv << 4) | uu]; }
    else {
      fx lx = px << 16, ly = (py << 16) - (s << 15);
      u = fmul(lx, ik); v = fmul(ly - lx / 2, ik);
      if (px < s && u >= 0 && v >= 0 && u < FX(16) && v < FX(16)) { int uu = (int)(u >> 16) & 15, vv = (int)(v >> 16) & 15; c = side[(vv << 4) | uu]; b = 26; }
      else {
        fx rx = (px - s) << 16, ry = (py - s) << 16;
        u = fmul(rx, ik); v = fmul(ry + rx / 2, ik);
        if (px >= s && u >= 0 && v >= 0 && u < FX(16) && v < FX(16)) { int uu = (int)(u >> 16) & 15, vv = (int)(v >> 16) & 15; c = side[(vv << 4) | uu]; b = 21; }
      }
    }
    if (c == KEY || (unsigned)(x0 + px) >= SW || (unsigned)(y0 + py) >= (unsigned)g->clipH) continue;
    g->back[(y0 + py) * SW + x0 + px] = scale565(c, b);
  }
}
static const u16 HEART[9] = {0x0C6, 0x1EF, 0x1FF, 0x1FF, 0x0FE, 0x07C, 0x038, 0x010, 0x000};
static void draw_heart(VC *g, int x0, int y0, int kind) { /* 0 empty, 1 half, 2 full */
  int x, y;
  for (y = 0; y < 9; y++) for (x = 0; x < 9; x++) {
    int on = (HEART[y] >> (8 - x)) & 1, edge;
    if (!on) continue;
    edge = !((y > 0 && (HEART[y - 1] >> (8 - x)) & 1) && (HEART[y + 1] >> (8 - x)) & 1 && x > 0 && (HEART[y] >> (9 - x)) & 1 && x < 8 && (HEART[y] >> (7 - x)) & 1);
    {
      u16 c = edge ? RGB(20, 0, 0) : (kind == 2 || (kind == 1 && x < 5)) ? RGB(220, 30, 30) : RGB(60, 20, 20);
      if (!edge && y == 1 && x >= 2 && x <= 3 && kind) c = RGB(255, 160, 160);
      if ((unsigned)(x0 + x) < SW && (unsigned)(y0 + y) < SH) g->back[(y0 + y) * SW + x0 + x] = c;
    }
  }
}

/* blit view (2x) into back */
static HOT void blit_view(VC *g) {
  int x, y; const u16 *src = g->view;
  /* 32-bit duplicate-and-store is only safe when the 320-wide back buffer is 4-aligned. */
  if ((((unsigned long)g->back) & 3) == 0) {
    u32 *dst = (u32 *)g->back;
    for (y = 0; y < VH; y++) {
      u32 *r0 = dst + (2 * y) * (SW / 2), *r1 = r0 + SW / 2; const u16 *s = src + y * VW;
      for (x = 0; x < VW; x++) { u32 p = s[x]; p |= p << 16; r0[x] = p; r1[x] = p; }
    }
  } else {
    for (y = 0; y < VH; y++) {
      u16 *r0 = g->back + (2 * y) * SW, *r1 = r0 + SW; const u16 *s = src + y * VW;
      for (x = 0; x < VW; x++) { u16 p = s[x]; r0[2 * x] = r0[2 * x + 1] = p; r1[2 * x] = r1[2 * x + 1] = p; }
    }
  }
}
