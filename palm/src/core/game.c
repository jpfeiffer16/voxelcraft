/* Game logic: player, interaction, mobs, TNT, day/night, sounds, save/load */
#define TNT_LIT 63
#define TW_U32 137624000u            /* asin(0.2)/(2pi) * 2^32 = 0.032043 */
#define HALF_U32 0x80000000u

/* ---------------- sounds (SndDoCmd on the 68K side) ---------------- */
static void snd(VC *g, int freq, int ms, int amp) {
  if (!g->soundOn || g->nsnd >= MAXSND) return;
  g->snd[g->nsnd].freq = (u16)freq; g->snd[g->nsnd].ms = (u16)ms; g->snd[g->nsnd].amp = (u16)amp; g->nsnd++;
}
static const u16 VOICE[M_TYPES] = {62, 135, 175, 85, 75, 110, 160}; /* zombie dog cat horse lion wolf spider (x100) */
static void mob_voice(VC *g, const Mob *m, int hurt) {
  fx dx = m->x - g->px, dz = m->z - g->pz; s64 d2 = (s64)dx * dx + (s64)dz * dz;
  int amp = d2 < (s64)FX(6) * FX(6) ? 64 : d2 < (s64)FX(14) * FX(14) ? 40 : 0;
  if (!amp) return;
  snd(g, (hurt ? 520 : 380) * VOICE[m->type] / 100, hurt ? 90 : 150, amp);
}
static void toast(VC *g, const char *s) { int i = 0; while (s[i] && i < 47) { g->toast[i] = s[i]; i++; } g->toast[i] = 0; g->toastT = 1600; }

/* ---------------- block helpers ---------------- */
static int solid_at(const VC *g, int x, int y, int z) {
  if (y < 0) return 1;
  if ((unsigned)x >= WX || (unsigned)z >= WZ) return 0;
  if (y >= WY) return 0;
  return g->bd[g->blocks[IDX(x, y, z)]].flags & F_SOLID;
}
static int fluid_at(const VC *g, int x, int y, int z) { int id = getb(g, x, y, z); return id == WATER ? 1 : id == LAVA ? 2 : 0; }
static int floorfx(fx v) { return v >> 16; }
static int collides(const VC *g, fx x, fx y, fx z, fx hw, fx h) {
  int x0 = floorfx(x - hw), x1 = floorfx(x + hw - 1), y0 = floorfx(y), y1 = floorfx(y + h - 1), z0 = floorfx(z - hw), z1 = floorfx(z + hw - 1), a, b, c;
  for (b = y0; b <= y1; b++) for (c = z0; c <= z1; c++) for (a = x0; a <= x1; a++) if (solid_at(g, a, b, c)) return 1;
  return 0;
}
/* move one axis in steps <= 0.25; returns 1 if blocked */
static int move_axis(const VC *g, fx *p, int axis, fx amount, fx hw, fx h) {
  fx a = amount < 0 ? -amount : amount; int steps = (int)((a + FX(0.25) - 1) / FX(0.25)), i; fx st;
  if (steps < 1) steps = 1; st = amount / steps;
  for (i = 0; i < steps; i++) {
    fx q[3]; q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[axis] += st;
    if (collides(g, q[0], q[1], q[2], hw, h)) {
      /* snap against the block face */
      if (axis == 1) { if (st < 0) p[1] = (floorfx(q[1]) + 1) << 16; else p[1] = (((q[1] + h) >> 16) << 16) - h - 8; }
      else if (st > 0) p[axis] = (((q[axis] + hw) >> 16) << 16) - hw - 8; else p[axis] = ((floorfx(q[axis] - hw) + 1) << 16) + hw + 8;
      return 1;
    }
    p[axis] = q[axis];
  }
  return 0;
}
static void relight(VC *g, int x, int z) { light_region(g, x, z, 15); }
static void set_block(VC *g, int x, int y, int z, int id) {
  if ((unsigned)x >= WX || (unsigned)z >= WZ || (unsigned)y >= WY) return;
  { u32 i = IDX(x, y, z); g->blocks[i] = (u8)id; g->edited[i >> 3] |= (u8)(1 << (i & 7)); }
}
static int iatan2(fx y, fx x) { /* returns angle 0..1023 of (x=sin, y=cos) style: atan2(y, x) */
  fx ax = x < 0 ? -x : x, ay = y < 0 ? -y : y, r; int a;
  if (!ax && !ay) return 0;
  if (ax >= ay) { r = (fx)(((s64)ay << 16) / ax); a = (int)((((s64)r * 128) >> 16) + ((((s64)r * (FONE - r)) >> 16) * 45 >> 16)); }
  else { r = (fx)(((s64)ax << 16) / ay); a = 256 - (int)((((s64)r * 128) >> 16) + ((((s64)r * (FONE - r)) >> 16) * 45 >> 16)); }
  if (x < 0) a = 512 - a; if (y < 0) a = -a;
  return a & 1023;
}
static fx isqrt_fx(s64 v) { /* sqrt of 32.32 -> 16.16 */
  u64 r = 0, b = (u64)1 << 62, x = (u64)(v < 0 ? 0 : v);
  while (b > x) b >>= 2;
  while (b) { if (x >= r + b) { x -= r + b; r = (r >> 1) + b; } else r >>= 1; b >>= 2; }
  return (fx)r;
}
static fx dist3(fx dx, fx dy, fx dz) { return isqrt_fx((s64)dx * dx + (s64)dy * dy + (s64)dz * dz); }

/* ---------------- mobs ---------------- */
typedef struct { fx hw, h; s16 speed, run, hp, attack, reach, cd, sight, protect; u8 hostile, tame, neutral; } MType;
static const MType MT[M_TYPES] = {
  /* zombie */ {FX(0.3), FX(1.85), 90, 250, 20, 3, 60, 100, 24, 0, 1, 0, 0},
  /* dog    */ {FX(0.3), FX(0.85), 160, 460, 10, 0, 60, 80, 0, 3, 0, 1, 0},
  /* cat    */ {FX(0.25), FX(0.7), 140, 480, 8, 0, 60, 80, 0, 0, 0, 1, 0},
  /* horse  */ {FX(0.45), FX(1.55), 130, 450, 24, 0, 60, 80, 0, 0, 0, 1, 0},
  /* lion   */ {FX(0.42), FX(1.15), 150, 580, 26, 5, 80, 100, 20, 7, 0, 1, 1},
  /* wolf   */ {FX(0.3), FX(0.9), 140, 540, 12, 3, 60, 80, 28, 0, 1, 0, 0},
  /* spider */ {FX(0.45), FX(0.6), 150, 500, 14, 2, 60, 70, 24, 0, 1, 0, 0},
};
static int count_mobs(VC *g, int hostile) { int i, n = 0; for (i = 0; i < MAXMOBS; i++) if (g->mobs[i].alive && (MT[g->mobs[i].type].hostile || g->mobs[i].wild) == hostile) n++; return n; }
static Mob *spawn_mob(VC *g, int type, fx x, fx y, fx z) {
  int i;
  for (i = 0; i < MAXMOBS; i++) if (!g->mobs[i].alive) {
    Mob *m = &g->mobs[i]; u8 *p = (u8 *)m; unsigned k; for (k = 0; k < sizeof(Mob); k++) p[k] = 0;
    m->alive = 1; m->type = (u8)type; m->x = x; m->y = y; m->z = z; m->hp = MT[type].hp; m->yaw = (s16)rnd(g, 1024);
    m->target = -1; m->timer = (s16)(100 + rnd(g, 300)); m->soundT = (s16)(400 + rnd(g, 900));
    return m;
  }
  return 0;
}
static int surface_y(const VC *g, int x, int z) { int y; for (y = WY - 2; y > 0; y--) if (g->bd[g->blocks[IDX(x, y, z)]].flags & F_SOLID || g->blocks[IDX(x, y, z)] == WATER || g->blocks[IDX(x, y, z)] == LAVA) return y; return 0; }
static void natural_spawn(VC *g) {
  int tries, night = g->day < 102; /* daylight < 0.4 */
  for (tries = 0; tries < 6; tries++) {
    int x = 4 + rnd(g, WX - 8), z = 4 + rnd(g, WZ - 8), y = surface_y(g, x, z), id = g->blocks[IDX(x, y, z)];
    fx dx = (x << 16) - g->px, dz = (z << 16) - g->pz, d = dist3(dx, 0, dz);
    if (d < FX(14) || d > FX(44)) continue;
    if (id == WATER || id == LAVA || id == LEAVES || id == BIRCH_LEAVES || y + 2 >= WY) continue;
    if (solid_at(g, x, y + 1, z) || solid_at(g, x, y + 2, z)) continue;
    if (g->hostileOn && !g->dead && (night ? 1 : rnd(g, 4) == 0)) {
      int cap = night ? 6 : 2;
      if (count_mobs(g, 1) < cap && (night || (g->light[IDX(x, y + 1, z)] >> 4) < 8)) {
        int r = rnd(g, 100), t = r < 22 ? M_WOLF : r < 50 ? M_SPIDER : M_ZOMBIE;
        Mob *m = spawn_mob(g, t, (x << 16) + FX(0.5), (y + 1) << 16, (z << 16) + FX(0.5));
        if (m) m->wild = 1;
        if (t == M_WOLF && m && rnd(g, 2)) { Mob *m2 = spawn_mob(g, M_WOLF, (x << 16) + FX(1.2), (y + 1) << 16, (z << 16) + FX(0.5)); if (m2) m2->wild = 1; }
        return;
      }
    }
    if (id == GRASS && count_mobs(g, 0) < 16) {
      int r = rnd(g, 100), t = r < 35 ? M_DOG : r < 65 ? M_CAT : r < 88 ? M_HORSE : M_LION;
      spawn_mob(g, t, (x << 16) + FX(0.5), (y + 1) << 16, (z << 16) + FX(0.5));
      return;
    }
  }
}
static void hurt_player(VC *g, int dmg, fx fromX, fx fromZ, fx knock) {
  if (g->dead || g->invuln > 0) return;
  g->health -= dmg; g->invuln = 500; g->sinceHurt = 0;
  snd(g, 240, 120, 80); snd(g, 180, 120, 60);
  if (knock) { fx dx = g->px - fromX, dz = g->pz - fromZ, d = dist3(dx, 0, dz); if (d > 256) { g->pvx = fmul(fdiv(g, dx, d), knock); g->pvz = fmul(fdiv(g, dz, d), knock); g->pvy = FX(5); } }
  if (g->shake < 200) g->shake = 200;
  if (g->health <= 0) { g->health = 0; g->dead = 1; g->state = ST_DEAD; g->deathT = 0; snd(g, 150, 400, 80); }
}
static void kill_mob(VC *g, Mob *m) {
  m->alive = 0; mob_voice(g, m, 1); snd(g, 140, 200, 60);
  if (g->riding == m - g->mobs + 1) g->riding = 0;
}
static void damage_mob(VC *g, Mob *m, int dmg, fx fromX, fx fromZ, int byPlayer) {
  fx dx = m->x - fromX, dz = m->z - fromZ, d = dist3(dx, 0, dz);
  m->hp -= dmg; m->hurt = 25;
  if (d > 256) { m->vx = fmul(fdiv(g, dx, d), FX(6)); m->vz = fmul(fdiv(g, dz, d), FX(6)); }
  m->vy = FX(4.5);
  if (m->hp <= 0) { kill_mob(g, m); return; }
  mob_voice(g, m, 1);
  if (byPlayer) {
    if (MT[m->type].neutral && !m->tamed) { m->angry = 2000; m->target = -2; }
    else if (!MT[m->type].hostile && !m->tamed) { m->state = 2; m->timer = 300; } /* flee */
  }
}
static int mob_index_nearest_hostile(VC *g, fx x, fx z, fx range) {
  int i, best = -1; fx bd = range;
  for (i = 0; i < MAXMOBS; i++) { Mob *m = &g->mobs[i]; fx d; if (!m->alive || !(MT[m->type].hostile || (m->wild && MT[m->type].attack))) continue; d = dist3(m->x - x, 0, m->z - z); if (d < bd) { bd = d; best = i; } }
  return best;
}
/* physics shared by mobs */
static void mob_move(VC *g, Mob *m, fx dt, fx tvx, fx tvz, int wantJump) {
  const MType *t = &MT[m->type]; fx p[3]; int bx, bz, f;
  fx acc = m->onGround ? fmul(FX(10), dt) : fmul(FX(3), dt); if (acc > FONE) acc = FONE;
  m->vx += fmul(tvx - m->vx, acc); m->vz += fmul(tvz - m->vz, acc);
  f = fluid_at(g, floorfx(m->x), floorfx(m->y + FX(0.4)), floorfx(m->z)); m->inWater = (s8)f;
  if (f) { m->vy -= fmul(FX(9), dt); m->vy = fmul(m->vy, FONE - fmul(FX(2), dt)); if (fluid_at(g, floorfx(m->x), floorfx(m->y + t->h - FX(0.2)), floorfx(m->z))) m->vy += fmul(FX(16), dt); if (m->vy < -FX(3)) m->vy = -FX(3); }
  else { m->vy -= fmul(FX(30), dt); if (m->vy < -FX(55)) m->vy = -FX(55); }
  p[0] = m->x; p[1] = m->y; p[2] = m->z;
  bx = move_axis(g, p, 0, fmul(m->vx, dt), t->hw, t->h);
  bz = move_axis(g, p, 2, fmul(m->vz, dt), t->hw, t->h);
  if ((bx || bz) && (m->onGround || m->inWater) && (wantJump || 1)) { m->vy = m->inWater ? FX(5) : FX(8.6); }
  if (bx) m->vx = 0; if (bz) m->vz = 0;
  {
    fx vy = fmul(m->vy, dt); int by = move_axis(g, p, 1, vy, t->hw, t->h);
    m->onGround = (s8)(by && vy < 0); if (by) m->vy = 0;
    if (!by) m->onGround = (s8)collides(g, p[0], p[1] - FX(0.02), p[2], t->hw, t->h);
  }
  /* stay on the island */
  if (p[0] < FX(0.6)) p[0] = FX(0.6); if (p[0] > FX(WX - 0.6)) p[0] = FX(WX - 0.6);
  if (p[2] < FX(0.6)) p[2] = FX(0.6); if (p[2] > FX(WZ - 0.6)) p[2] = FX(WZ - 0.6);
  m->x = p[0]; m->y = p[1]; m->z = p[2];
  if (m->y < -FX(10)) m->alive = 0;
  if (fluid_at(g, floorfx(m->x), floorfx(m->y + FX(0.3)), floorfx(m->z)) == 2) { if (m->cd <= 0) { m->hp -= 4; m->hurt = 25; m->cd = 50; if (m->hp <= 0) kill_mob(g, m); } }
}
static int lava_or_drop_ahead(VC *g, Mob *m, fx sx, fx sz) {
  int ax = floorfx(m->x + sx), az = floorfx(m->z + sz), y = floorfx(m->y + FX(0.2)), dy;
  for (dy = 0; dy >= -3; dy--) { int id = getb(g, ax, y + dy - 1, az); if (id == LAVA) return 1; if (g->bd[id].flags & F_SOLID || id == WATER) return 0; }
  return 1; /* cliff */
}
static void update_mobs(VC *g, fx dt, int dtcs) {
  int i;
  for (i = 0; i < MAXMOBS; i++) {
    Mob *m = &g->mobs[i]; const MType *t = &MT[m->type];
    fx dx, dz, dp, speed = 0, tvx = 0, tvz = 0; int hostile, chase = -3; /* -3 none, -2 player, i mob */
    if (!m->alive) continue;
    if (g->riding == i + 1) { m->x = g->px; m->y = g->py; m->z = g->pz; m->yaw = (s16)((g->yaw + 512) & 1023); m->vx = m->vz = m->vy = 0; continue; }
    if (m->hurt > 0) m->hurt = (u8)(m->hurt > dtcs ? m->hurt - dtcs : 0);
    if (m->cd > 0) m->cd = (s16)(m->cd - dtcs);
    if (m->angry > 0) m->angry = (s16)(m->angry - dtcs);
    m->timer = (s16)(m->timer - dtcs); m->soundT = (s16)(m->soundT - dtcs);
    dx = g->px - m->x; dz = g->pz - m->z; dp = dist3(dx, g->py - m->y, dz);
    hostile = t->hostile || (m->type == M_LION && m->angry > 0 && !m->tamed);
    if (dp > FX(70)) { m->alive = 0; continue; }
    if (t->hostile && g->day > 200 && dp > FX(30) && rnd(g, 400) == 0) { m->alive = 0; continue; }
    if (m->soundT <= 0) { m->soundT = (s16)(500 + rnd(g, 1000)); mob_voice(g, m, 0); }
    if (hostile && !g->dead && dp < FX(t->sight ? t->sight : 20) && g->hostileOn) chase = -2;
    if (m->tamed && t->protect) { int h = mob_index_nearest_hostile(g, g->px, g->pz, FX(10)); if (h >= 0) chase = h; }
    if (m->tamed && m->sitting) chase = -3;
    if (chase != -3) {
      fx tx = chase == -2 ? g->px : g->mobs[chase].x, tz = chase == -2 ? g->pz : g->mobs[chase].z;
      fx ddx = tx - m->x, ddz = tz - m->z, d = dist3(ddx, 0, ddz);
      m->yaw = (s16)iatan2(ddz, ddx) ;
      m->yaw = (s16)((256 - m->yaw) & 1023); /* convert: forward = (sin yaw, cos yaw) */
      speed = (fx)t->run * 655; /* /100 */
      if (d < t->hw + FX(0.3) + (fx)t->reach * 655 + (chase == -2 ? FX(0.3) : MT[g->mobs[chase].type].hw)) {
        speed = 0;
        if (m->cd <= 0 && (m->y - (chase == -2 ? g->py : g->mobs[chase].y)) < FX(1.5) && (m->y - (chase == -2 ? g->py : g->mobs[chase].y)) > -FX(2)) {
          m->cd = t->cd;
          if (chase == -2) hurt_player(g, t->attack, m->x, m->z, FX(6));
          else { damage_mob(g, &g->mobs[chase], m->tamed ? t->protect : t->attack, m->x, m->z, 0); mob_voice(g, m, 0); }
        }
      }
      if (m->type == M_SPIDER && m->onGround && d < FX(4) && d > FX(1.5) && m->cd <= 0) m->vy = FX(7);
    } else if (m->tamed && !m->sitting && m->type != M_HORSE) {
      /* follow */
      if (dp > FX(24)) { m->x = g->px - FX(1); m->z = g->pz; m->y = g->py; }
      else if (dp > FX(3.2)) { m->yaw = (s16)((256 - iatan2(dz, dx)) & 1023); speed = dp > FX(8) ? (fx)t->run * 655 : (fx)t->speed * 655 * 2; }
    } else if (m->state == 2 && m->timer > 0) { /* flee */
      m->yaw = (s16)((256 - iatan2(-dz, -dx)) & 1023); speed = (fx)t->run * 655;
    } else {
      /* wander */
      if (m->timer <= 0) { m->state = (u8)(rnd(g, 10) < 4 ? 0 : 1); m->timer = (s16)(150 + rnd(g, 350)); if (m->state) m->yaw = (s16)((m->yaw + rnd(g, 512) - 256) & 1023); }
      if (m->state == 1) speed = (fx)t->speed * 655;
    }
    if (m->sitting) speed = 0;
    if (speed) {
      fx sx = SIN(g, m->yaw), sz = COS(g, m->yaw);
      if (chase == -3 && lava_or_drop_ahead(g, m, fmul(sx, FX(0.8)), fmul(sz, FX(0.8)))) { speed = 0; m->yaw = (s16)((m->yaw + 400 + rnd(g, 224)) & 1023); }
      tvx = fmul(sx, speed); tvz = fmul(sz, speed);
    }
    mob_move(g, m, dt, tvx, tvz, chase != -3);
  }
}

/* ---------------- TNT ---------------- */
static int tnt_ignite(VC *g, int x, int y, int z, int fuseCs) {
  int i;
  for (i = 0; i < MAXTNT; i++) if (!g->tnt[i].used) {
    g->tnt[i].used = 1; g->tnt[i].x = (u8)x; g->tnt[i].y = (u8)y; g->tnt[i].z = (u8)z; g->tnt[i].fuse = (s16)fuseCs; g->tnt[i].t = 0;
    set_block(g, x, y, z, TNT_LIT);
    if (fuseCs >= 400) snd(g, 900, 300, 50);
    return 1;
  }
  return 0;
}
static void explode(VC *g, int cx, int cy, int cz) {
  fx r = FX(3.6) + (fx)rnd(g, FX(1.2)), R2 = fmul(r, FX(2.2)), lim0;
  int R = (r >> 16) + 2, dx, dy, dz, i; u32 seed = vc_rand(g) % 1000;
  int inWater = fluid_at(g, cx, cy, cz) == 1 || fluid_at(g, cx, cy + 1, cz) == 1;
  set_block(g, cx, cy, cz, AIR);
  if (!inWater) {
    for (dy = -R; dy <= R; dy++) for (dz = -R; dz <= R; dz++) for (dx = -R; dx <= R; dx++) {
      int x = cx + dx, y = cy + dy, z = cz + dz, id; fx d;
      if (y < 1 || y >= WY || (unsigned)x >= WX || (unsigned)z >= WZ) continue;
      d = isqrt_fx(((s64)(dx * dx + dz * dz) << 32) + (((s64)dy * dy * 75366) << 16));  /* dy^2 * 1.15 */
      if (d > r + FX(1.5)) continue;
      id = g->blocks[IDX(x, y, z)];
      if (id == TNT) { tnt_ignite(g, x, y, z, 40 + rnd(g, 80)); continue; }
      lim0 = fmul(r, FX(0.78) + (fx)(((u64)hash3u(x, y, z, seed) * FX(0.32)) >> 32));
      if (d > lim0) continue;
      if (!id || id == BEDROCK || id == WATER || id == LAVA || id == TNT_LIT) continue;
      if (id == OBSIDIAN && d > FX(1.2)) continue;
      set_block(g, x, y, z, AIR);
    }
    for (dy = -R - 1; dy <= R + 1; dy++) for (dz = -R - 1; dz <= R + 1; dz++) for (dx = -R - 1; dx <= R + 1; dx++) {
      int x = cx + dx, y = cy + dy, z = cz + dz, id;
      if (y < 1 || y >= WY || (unsigned)x >= WX || (unsigned)z >= WZ) continue;
      id = g->blocks[IDX(x, y, z)];
      if ((g->bd[id].render == R_CROSS || id == TORCH) && !solid_at(g, x, y - 1, z)) set_block(g, x, y, z, AIR);
    }
    light_region(g, cx, cz, R + 15 > 40 ? 40 : R + 15);
  }
  snd(g, 70, 500, 100); snd(g, 50, 400, 100);
  {
    fx d = dist3(g->px - (cx << 16) - FX(0.5), g->py + FX(0.9) - (cy << 16) - FX(0.5), g->pz - (cz << 16) - FX(0.5));
    if (d < fmul(r, FX(8))) g->shake = 900;
    if (d < R2 && !g->dead) { fx f = FONE - fdiv(g, d, R2); int dmg = (int)((f * 18 + FONE - 1) >> 16); g->invuln = 0; hurt_player(g, dmg, (cx << 16) + FX(0.5), (cz << 16) + FX(0.5), FX(4) + fmul(f, FX(14))); }
  }
  for (i = 0; i < MAXMOBS; i++) {
    Mob *m = &g->mobs[i]; fx md;
    if (!m->alive) continue;
    md = dist3(m->x - (cx << 16) - FX(0.5), m->y - (cy << 16), m->z - (cz << 16) - FX(0.5));
    if (md < R2) { fx f = FONE - fdiv(g, md, R2); damage_mob(g, m, (int)((f * (m->tamed ? 9 : 18) + FONE - 1) >> 16), (cx << 16) + FX(0.5), (cz << 16) + FX(0.5), 0); if (m->alive) m->vy = FX(4) + f * 8; }
  }
}
static void update_tnt(VC *g, int dtcs) {
  int i, n = 0;
  g->tntFlash = (int)((g->timeMs / 250) & 1);
  for (i = 0; i < MAXTNT; i++) {
    Tnt *t = &g->tnt[i];
    if (!t->used) continue;
    t->fuse = (s16)(t->fuse - dtcs); t->t = (s16)(t->t + dtcs);
    if (t->fuse < 100) g->tntFlash = (int)((g->timeMs / 100) & 1);
    if (t->fuse <= 0 && n < 2) { t->used = 0; explode(g, t->x, t->y, t->z); n++; }
  }
}

/* ---------------- interaction ---------------- */
typedef struct { int hit, x, y, z, nx, ny, nz, id, mob; fx t; } Ray;
static void ray_dir(VC *g, int sx, int sy, fx *dx, fx *dy, fx *dz) { /* screen pixel in 320x288 */
  const fx K = 637; fx vx = (fx)(sx - 160) * K / 2, vy = (fx)(sy - 144) * K / 2;
  *dx = g->cfx + fmul(g->crx, vx) - fmul(g->cux, vy);
  *dy = g->cfy - fmul(g->cuy, vy);
  *dz = g->cfz + fmul(g->crz, vx) - fmul(g->cuz, vy);
}
static void raycast(VC *g, fx dx, fx dy, fx dz, fx maxD, Ray *r) {
  fx ox = g->camX, oy = g->camY, oz = g->camZ, len = dist3(dx, dy, dz), t = 0, tmx, tmy, tmz, tdx, tdy, tdz;
  int x = ox >> 16, y = oy >> 16, z = oz >> 16, sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1, nx = 0, ny = 0, nz = 0, i;
  fx mt = RCP_INF;
  r->hit = 0; r->mob = -1;
  maxD = fdiv(g, maxD, len); /* t is in units of the (unnormalised) direction */
  tdx = dx ? rcp(g, (u32)(dx < 0 ? -dx : dx)) : RCP_INF; tdy = dy ? rcp(g, (u32)(dy < 0 ? -dy : dy)) : RCP_INF; tdz = dz ? rcp(g, (u32)(dz < 0 ? -dz : dz)) : RCP_INF;
  tmx = sx > 0 ? fmul(((x + 1) << 16) - ox, tdx) : fmul(ox - (x << 16), tdx);
  tmy = sy > 0 ? fmul(((y + 1) << 16) - oy, tdy) : fmul(oy - (y << 16), tdy);
  tmz = sz > 0 ? fmul(((z + 1) << 16) - oz, tdz) : fmul(oz - (z << 16), tdz);
  /* mobs: ray vs AABB */
  for (i = 0; i < MAXMOBS; i++) {
    Mob *m = &g->mobs[i]; fx b0[3], b1[3], th, hu, hv; int f;
    if (!m->alive || g->riding == i + 1) continue;
    b0[0] = m->x - MT[m->type].hw - FX(0.1); b1[0] = m->x + MT[m->type].hw + FX(0.1);
    b0[1] = m->y; b1[1] = m->y + MT[m->type].h;
    b0[2] = m->z - MT[m->type].hw - FX(0.1); b1[2] = m->z + MT[m->type].hw + FX(0.1);
    if (hit_box(g, ox, oy, oz, dx, dy, dz, 0, 0, 0, b0, b1, &th, &f, &hu, &hv) && th >= 0 && th < maxD && th < mt) { mt = th; r->mob = i; }
  }
  while (t <= maxD) {
    int id = getb(g, x, y, z);
    if (id > 0 && id != WATER && id != LAVA && (unsigned)x < WX && (unsigned)z < WZ) {
      if (t < mt) { r->hit = 1; r->x = x; r->y = y; r->z = z; r->nx = nx; r->ny = ny; r->nz = nz; r->id = id; r->t = t; r->mob = -1; }
      return;
    }
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
}
static int held(VC *g) { int s = g->sel; if ((unsigned)s > 8) s = 0; return g->hotbar[s] & 255; }
static void break_block(VC *g, int x, int y, int z) {
  int id = getb(g, x, y, z), above;
  if (!id || id == BEDROCK || (unsigned)x >= WX || (unsigned)z >= WZ) return;
  if (id >= OAK_DOOR && id < OAK_DOOR + 16) { int up = (id - OAK_DOOR) & 1; set_block(g, x, y, z, AIR); if (getb(g, x, up ? y - 1 : y + 1, z) >= OAK_DOOR && getb(g, x, up ? y - 1 : y + 1, z) < OAK_DOOR + 16) set_block(g, x, up ? y - 1 : y + 1, z, AIR); }
  else if (id >= BED && id < BED + 8) {
    int f = (id - BED) >> 1, head = (id - BED) & 1; static const s8 FX4[4] = {0, 1, 0, -1}, FZ4[4] = {-1, 0, 1, 0};
    int ox = head ? -FX4[f] : FX4[f], oz = head ? -FZ4[f] : FZ4[f];
    set_block(g, x, y, z, AIR); if (getb(g, x + ox, y, z + oz) >= BED && getb(g, x + ox, y, z + oz) < BED + 8) set_block(g, x + ox, y, z + oz, AIR);
  } else if (id == TNT_LIT) return;
  else set_block(g, x, y, z, AIR);
  above = getb(g, x, y + 1, z);
  if (g->bd[above].render == R_CROSS || above == TORCH) set_block(g, x, y + 1, z, AIR);
  relight(g, x, z);
  snd(g, id == GLASS || id == OAK_WINDOW || id == STAINED_BLUE || id == STAINED_AMBER ? 1400 : id == GRASS || id == DIRT || id == SAND || id == GRAVEL ? 160 : 220, 70, 70);
}
static int player_box_hits(VC *g, int x, int y, int z) {
  fx hw = g->riding ? FX(0.45) : FX(0.3), h = g->riding ? FX(2.4) : FX(1.8);
  return g->px + hw > (x << 16) && g->px - hw < ((x + 1) << 16) && g->py + h > (y << 16) && g->py < ((y + 1) << 16) && g->pz + hw > (z << 16) && g->pz - hw < ((z + 1) << 16);
}
static int facing4(VC *g) { /* direction the player looks: 0 -z, 1 +x, 2 +z, 3 -x */ return ((g->yaw + 128) >> 8) & 3; }
static void attack_mob(VC *g, int mi) {
  const BDef *d = &g->bd[held(g)]; int dmg = 3, cd = 35;
  if (d->kind == K_SWORD) { dmg = d->arg; cd = held(g) == IRON_AXE ? 85 : 45; }
  if (g->attackCD > 0) return;
  g->attackCD = cd; g->swing = 25;
  snd(g, 300, 50, 70);
  damage_mob(g, &g->mobs[mi], dmg, g->px, g->pz, 1);
}
static void use_mob(VC *g, int mi) {
  Mob *m = &g->mobs[mi]; const BDef *d = &g->bd[held(g)];
  if (MT[m->type].hostile || m->wild) { attack_mob(g, mi); return; }
  if (d->kind == K_SWORD && !m->tamed) { attack_mob(g, mi); return; }
  if (m->type == M_HORSE && m->tamed) { g->riding = mi + 1; toast(g, "Riding! Press Place (3rd button) to get off"); snd(g, 340, 160, 60); return; }
  if (!m->tamed) { m->tamed = 1; m->sitting = 0; toast(g, m->type == M_HORSE ? "Horse tamed! Tap it to ride." : MT[m->type].protect ? "Tamed! It will follow and protect you." : "Tamed! It will follow you."); mob_voice(g, m, 0); return; }
  m->sitting = (u8)!m->sitting; toast(g, m->sitting ? "Sitting." : "Following you."); mob_voice(g, m, 0);
}
static void sleep_in_bed(VC *g, int x, int y, int z) {
  fx s = SIN(g, (int)(g->worldTime >> 22));
  g->spawnX = (x << 16) + FX(0.5); g->spawnY = (y + 1) << 16; g->spawnZ = (z << 16) + FX(0.5);
  if (s >= FX(0.1)) { toast(g, "Spawn point set. You can only sleep at night"); return; }
  if (count_mobs(g, 1) > 0) { int i; for (i = 0; i < MAXMOBS; i++) { Mob *m = &g->mobs[i]; if (m->alive && MT[m->type].hostile && dist3(m->x - g->px, 0, m->z - g->pz) < FX(8)) { toast(g, "You may not rest now, there are monsters nearby"); return; } } }
  g->state = ST_SLEEP; g->sleepT = 0; toast(g, "Spawn point set. Sleeping...");
}
static void use_block(VC *g, const Ray *r) {
  int id = r->id, h = held(g); const BDef *hd = &g->bd[h];
  int x = r->x + r->nx, y = r->y + r->ny, z = r->z + r->nz;
  if (id >= OAK_DOOR && id < OAK_DOOR + 16) {
    int up = (id - OAK_DOOR) & 1, by = up ? r->y - 1 : r->y, b = getb(g, r->x, by, r->z), t = getb(g, r->x, by + 1, r->z);
    if (b >= OAK_DOOR && b < OAK_DOOR + 16) set_block(g, r->x, by, r->z, b ^ 2);
    if (t >= OAK_DOOR && t < OAK_DOOR + 16) set_block(g, r->x, by + 1, r->z, t ^ 2);
    snd(g, (b & 2) ? 200 : 260, 90, 60); return;
  }
  if (id >= BED && id < BED + 8) { sleep_in_bed(g, r->x, r->y, r->z); return; }
  if (id == TNT && hd->kind != K_BLOCK) { if (tnt_ignite(g, r->x, r->y, r->z, 400)) toast(g, "TNT lit - run!"); else toast(g, "Too much TNT already burning"); return; }
  if (hd->kind == K_FOOD) { goto eat; }
  if ((unsigned)x >= WX || (unsigned)z >= WZ || y < 1 || y >= WY - 1) return;
  {
    int cur = g->blocks[IDX(x, y, z)];
    if (cur && cur != WATER && cur != LAVA && g->bd[cur].render != R_CROSS) return;
  }
  if (hd->kind == K_EGG) {
    Mob *m = spawn_mob(g, hd->arg, (x << 16) + FX(0.5), y << 16, (z << 16) + FX(0.5));
    if (m) { m->wild = (u8)MT[m->type].hostile; m->yaw = (s16)(g->yaw & 1023); mob_voice(g, m, 0); snd(g, 700, 60, 60); }
    else toast(g, "Too many mobs");
    return;
  }
  if (hd->kind == K_SWORD) return;
  if (hd->kind == K_DOOR) {
    int f = facing4(g);
    if (y + 1 >= WY || (g->blocks[IDX(x, y + 1, z)] && g->bd[g->blocks[IDX(x, y + 1, z)]].render != R_CROSS) || player_box_hits(g, x, y, z) || player_box_hits(g, x, y + 1, z)) return;
    set_block(g, x, y, z, OAK_DOOR + f * 4); set_block(g, x, y + 1, z, OAK_DOOR + f * 4 + 1); relight(g, x, z); snd(g, 260, 80, 60); return;
  }
  if (hd->kind == K_BED) {
    static const s8 FX4[4] = {0, 1, 0, -1}, FZ4[4] = {-1, 0, 1, 0};
    int f = facing4(g), hx = x + FX4[f], hz = z + FZ4[f];
    if ((unsigned)hx >= WX || (unsigned)hz >= WZ || (g->blocks[IDX(hx, y, hz)] && g->bd[g->blocks[IDX(hx, y, hz)]].render != R_CROSS)) return;
    if (player_box_hits(g, x, y, z) || player_box_hits(g, hx, y, hz)) return;
    set_block(g, x, y, z, BED + f * 2); set_block(g, hx, y, hz, BED + f * 2 + 1); relight(g, x, z); snd(g, 220, 80, 60); return;
  }
  if ((hd->flags & F_SOLID) && player_box_hits(g, x, y, z)) return;
  if ((hd->render == R_CROSS || h == TORCH) && !solid_at(g, x, y - 1, z)) { if (h != TORCH) return; }
  set_block(g, x, y, z, h);
  relight(g, x, z);
  snd(g, 330, 60, 60);
  return;
eat:
  if (g->health >= g->maxHealth) { toast(g, "You're not hungry"); return; }
  g->health += hd->arg; if (g->health > g->maxHealth) g->health = g->maxHealth;
  snd(g, 520, 80, 60); snd(g, 600, 80, 60); toast(g, h == STEAK ? "Ate steak (+4 hearts)" : "Ate an apple (+2 hearts)");
}
static void do_use(VC *g, fx dx, fx dy, fx dz) {
  Ray r; const BDef *hd = &g->bd[held(g)];
  if (g->riding) { Mob *m = &g->mobs[g->riding - 1]; g->riding = 0; m->x = g->px + FX(1); g->toastT = 0; toast(g, "Dismounted"); return; }
  raycast(g, dx, dy, dz, FX(5), &r);
  g->swing = 20;
  if (r.mob >= 0) { use_mob(g, r.mob); return; }
  if (r.hit) { use_block(g, &r); return; }
  if (hd->kind == K_FOOD) { Ray e; e.id = AIR; e.x = e.y = e.z = e.nx = e.ny = e.nz = 0; e.id = 0; use_block(g, &e); }
}
static void do_break(VC *g, fx dx, fx dy, fx dz) {
  Ray r; raycast(g, dx, dy, dz, FX(5), &r);
  g->swing = 20;
  if (r.mob >= 0) { attack_mob(g, r.mob); return; }
  if (r.hit) { if (r.id == TNT_LIT) return; break_block(g, r.x, r.y, r.z); }
}

/* ---------------- player ---------------- */
static void camera_update(VC *g) {
  int sy = SIN(g, g->yaw), cy = COS(g, g->yaw), sp = SIN(g, g->pitch), cp = COS(g, g->pitch);
  int shk = g->shake > 0 ? (int)((g->shake * (int)(SIN(g, (int)g->timeMs * 3) >> 10)) >> 10) : 0;
  int yaw = g->yaw + shk / 2, pitch = g->pitch + shk;
  sy = SIN(g, yaw); cy = COS(g, yaw); sp = SIN(g, pitch); cp = COS(g, pitch);
  g->cfx = -fmul(sy, cp); g->cfy = sp; g->cfz = -fmul(cy, cp);
  g->crx = cy; g->crz = -sy;
  g->cux = fmul(sy, sp); g->cuy = cp; g->cuz = fmul(cy, sp);
  {
    fx bob = g->bobA ? fmul(SIN(g, g->bob * 2), FX(0.05)) : 0;
    g->camX = g->px; g->camZ = g->pz;
    g->camY = g->py + (g->riding ? FX(2.25) : FX(1.62)) + bob;
  }
}
static void player_update(VC *g, fx dt, int dtcs, int fwd, int turn, int jump) {
  int feet = getb(g, floorfx(g->px), floorfx(g->py + FX(0.4)), floorfx(g->pz)), head = getb(g, floorfx(g->px), floorfx(g->py + (g->riding ? FX(2.25) : FX(1.62))), floorfx(g->pz));
  fx speed, mx, mz, acc, hw = g->riding ? FX(0.45) : FX(0.3), h = g->riding ? FX(2.4) : FX(1.8), p[3];
  int R = g->riding, by;
  g->inWater = feet == WATER; g->headInWater = head == WATER; g->inLava = (feet == LAVA || head == LAVA) ? (head == LAVA ? 2 : 1) : 0;
  if (g->invuln > 0) g->invuln -= dtcs * 10;
  g->sinceHurt += dtcs * 10;
  if (g->health < g->maxHealth && g->sinceHurt > 6000) { g->regenT += dtcs * 10; if (g->regenT >= 3000) { g->regenT = 0; g->health++; } } else g->regenT = 0;
  /* turning with the 5-way (with a little acceleration) */
  if (turn) { g->yawVel += turn * dtcs * 12; if (g->yawVel > 420) g->yawVel = 420; if (g->yawVel < -420) g->yawVel = -420; }
  else g->yawVel = 0;
  g->yaw = (g->yaw - (g->yawVel * dtcs) / 100) & 1023;
  speed = R ? (fwd > 0 ? FX(6.2) : FX(3)) : FX(4.3);
  if (R && g->inWater) speed = FX(2.4);
  if (g->inWater) speed = fmul(speed, FX(0.55));
  if (g->inLava) speed = fmul(speed, FX(0.3));
  mx = -fmul(SIN(g, g->yaw), fwd * speed); mz = -fmul(COS(g, g->yaw), fwd * speed);
  acc = g->onGround ? fmul(FX(14), dt) : g->inWater ? fmul(FX(6), dt) : fmul(FX(4), dt); if (acc > FONE) acc = FONE;
  g->pvx += fmul(mx - g->pvx, acc); g->pvz += fmul(mz - g->pvz, acc);
  if (g->inLava) { g->pvy -= fmul(FX(6), dt); g->pvy = fmul(g->pvy, FONE - fmul(FX(2.9), dt)); if (jump) { g->pvy += fmul(FX(20), dt); if (g->pvy > FX(2)) g->pvy = FX(2); } if (g->pvy < -FX(2)) g->pvy = -FX(2); }
  else if (g->inWater) { g->pvy -= fmul(FX(9), dt); g->pvy = fmul(g->pvy, FONE - fmul(FX(2.1), dt)); if (jump) { g->pvy += fmul(FX(30), dt); if (g->pvy > FX(3.8)) g->pvy = FX(3.8); } if (g->pvy < -FX(4)) g->pvy = -FX(4); }
  else { g->pvy -= fmul(FX(30), dt); if (g->pvy < -FX(55)) g->pvy = -FX(55); if (jump && g->onGround) { g->pvy = R ? FX(12.4) : FX(8.6); g->onGround = 0; } }
  p[0] = g->px; p[1] = g->py; p[2] = g->pz;
  {
    int ax;
    for (ax = 0; ax <= 2; ax += 2) {
      fx v = fmul(ax ? g->pvz : g->pvx, dt);
      if (move_axis(g, p, ax, v, hw, h)) {
        int stepped = 0;
        if (R && (g->onGround || g->inWater) && !collides(g, p[0], p[1] + FX(1.05), p[2], hw, h)) { fx y0 = p[1]; p[1] += FX(1.05); if (!move_axis(g, p, ax, v, hw, h)) { stepped = 1; if (g->pvy < 0) g->pvy = 0; } else p[1] = y0; }
        if (!stepped) { if (ax) g->pvz = 0; else g->pvx = 0; }
      }
    }
  }
  {
    fx vy = fmul(g->pvy, dt);
    by = move_axis(g, p, 1, vy, hw, h);
    g->onGround = by && vy < 0; if (by) g->pvy = 0;
    if (!by) g->onGround = collides(g, p[0], p[1] - FX(0.02), p[2], hw, h);
  }
  if (p[0] < FX(0.4)) p[0] = FX(0.4); if (p[0] > FX(WX - 0.4)) p[0] = FX(WX - 0.4);
  if (p[2] < FX(0.4)) p[2] = FX(0.4); if (p[2] > FX(WZ - 0.4)) p[2] = FX(WZ - 0.4);
  if (p[1] < -FX(20)) { p[1] = FX(WY - 2); g->pvx = g->pvy = g->pvz = 0; }
  g->px = p[0]; g->py = p[1]; g->pz = p[2];
  {
    fx hs = dist3(g->pvx, 0, g->pvz);
    if (g->onGround && hs > FX(0.5)) { g->bobA = 1; g->bob += (int)((fmul(fmul(dt, hs), FX(1.8)) * 163) >> 16); } else g->bobA = 0;
    if (g->onGround && hs > FX(1) && (g->bob >> 8) != g->stepPh) { g->stepPh = g->bob >> 8; snd(g, 110 + rnd(g, 30), 30, 25); }
  }
  /* lava burns */
  if (g->inLava) { g->lavaT -= dtcs; if (g->lavaT <= 0) { g->lavaT = 50; g->invuln = 0; hurt_player(g, 3, g->px, g->pz, 0); } } else g->lavaT = 0;
}
static void respawn(VC *g) {
  g->px = g->spawnX; g->py = g->spawnY; g->pz = g->spawnZ;
  while (collides(g, g->px, g->py, g->pz, FX(0.3), FX(1.8)) && g->py < FX(WY - 2)) g->py += FONE;
  g->pvx = g->pvy = g->pvz = 0; g->health = g->maxHealth; g->dead = 0; g->state = ST_PLAY; g->invuln = 2000; g->riding = 0;
}
static void find_spawn(VC *g) {
  int r, a;
  for (r = 0; r < 40; r++) for (a = 0; a < 8 * (r + 1); a++) {
    int x = WX / 2 + (int)((COS(g, a * 1024 / (8 * (r + 1))) * r) >> 16), z = WZ / 2 + (int)((SIN(g, a * 1024 / (8 * (r + 1))) * r) >> 16), y;
    if ((unsigned)x >= WX || (unsigned)z >= WZ) continue;
    y = surface_y(g, x, z);
    if (g->blocks[IDX(x, y, z)] == WATER || g->blocks[IDX(x, y, z)] == LAVA || y <= SEA) continue;
    if (g->blocks[IDX(x, y, z)] == LEAVES || g->blocks[IDX(x, y, z)] == BIRCH_LEAVES) continue;
    g->spawnX = (x << 16) + FX(0.5); g->spawnY = (y + 1) << 16; g->spawnZ = (z << 16) + FX(0.5);
    return;
  }
  g->spawnX = FX(48.5); g->spawnY = FX(50); g->spawnZ = FX(48.5);
}

/* ---------------- day/night clock (web PHASES) ---------------- */
static void clock_advance(VC *g, u32 dtMs) {
  /* phase lengths in clock units (2^32 = one day) and real ms */
  u32 t = g->worldTime, lenU, ms;
  if (t < TW_U32 || t >= (u32)(0u - TW_U32)) { lenU = 2 * TW_U32; ms = 30000; }        /* dawn */
  else if (t < HALF_U32 - TW_U32) { lenU = HALF_U32 - 2 * TW_U32; ms = 510000; }        /* day */
  else if (t < HALF_U32 + TW_U32) { lenU = 2 * TW_U32; ms = 30000; }                    /* dusk */
  else { lenU = HALF_U32 - 2 * TW_U32; ms = 150000; }                                   /* night */
  g->worldTime += (u32)(((u64)lenU * dtMs) / ms);
}
