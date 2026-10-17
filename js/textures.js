// Procedurally painted 16x16 pixel-art tiles packed into a canvas atlas.
window.VC = window.VC || {};
(function () {
  'use strict';
  const S = 16, COLS = 16, ROWS = 16, W = S * COLS, H = S * ROWS;
  const T = VC.T;

  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

  function makeTile(paint, seed) {
    const img = new ImageData(S, S);
    const rnd = VC.Noise.mulberry32(seed * 7919 + 13);
    const set = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      const i = (y * S + x) * 4; img.data[i] = clamp(c[0]); img.data[i + 1] = clamp(c[1]); img.data[i + 2] = clamp(c[2]); img.data[i + 3] = a;
    };
    const get = (x, y) => { const i = (y * S + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
    const vary = (c, amt) => { const v = (rnd() - 0.5) * 2 * amt; return [c[0] + v, c[1] + v, c[2] + v]; };
    const fill = (c, amt) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, vary(c, amt)); };
    const speckle = (c, prob, amt = 10) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (rnd() < prob) set(x, y, vary(c, amt)); };
    paint({ set, get, vary, fill, speckle, rnd });
    return img;
  }

  const P = {};
  const dirtC = [134, 96, 67];
  function dirt(t) { t.fill(dirtC, 14); t.speckle([105, 75, 52], 0.18, 8); t.speckle([160, 120, 85], 0.08, 6); }
  function stone(t) {
    t.fill([125, 125, 125], 10);
    for (let i = 0; i < 9; i++) { const x = (t.rnd() * 16) | 0, y = (t.rnd() * 16) | 0, l = 2 + ((t.rnd() * 3) | 0); for (let k = 0; k < l; k++) t.set(x + k, y, t.vary([100, 100, 100], 6)); }
    t.speckle([145, 145, 145], 0.08, 5);
  }
  function ore(color) { return (t) => { stone(t); for (let i = 0; i < 5; i++) { const cx = 2 + ((t.rnd() * 12) | 0), cy = 2 + ((t.rnd() * 12) | 0); for (let k = 0; k < 4; k++) { const x = cx + ((t.rnd() * 3) | 0) - 1, y = cy + ((t.rnd() * 3) | 0) - 1; t.set(x, y, t.vary(color, 15)); } } }; }
  P[T.grass_top] = (t) => { t.fill([95, 159, 53], 16); t.speckle([75, 130, 40], 0.25, 8); t.speckle([120, 185, 70], 0.1, 6); };
  P[T.grass_side] = (t) => {
    dirt(t);
    for (let x = 0; x < 16; x++) { const d = 3 + ((t.rnd() * 3) | 0) - (x % 3 === 0 ? 1 : 0); for (let y = 0; y < d; y++) t.set(x, y, t.vary([95, 159, 53], 14)); }
  };
  P[T.dirt] = dirt;
  P[T.stone] = stone;
  P[T.sand] = (t) => { t.fill([219, 207, 163], 8); t.speckle([200, 185, 140], 0.2, 6); t.speckle([235, 225, 185], 0.1, 5); };
  P[T.gravel] = (t) => { t.fill([130, 124, 122], 18); for (let i = 0; i < 26; i++) { const x = (t.rnd() * 16) | 0, y = (t.rnd() * 16) | 0; const c = t.rnd() < 0.5 ? [95, 90, 88] : [165, 158, 155]; t.set(x, y, c); t.set(x + 1, y, c); t.set(x, y + 1, c); } };
  P[T.water] = (t) => { t.fill([45, 95, 205], 10); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) if (t.rnd() < 0.5) t.set(x, (y + ((x / 4) | 0)) % 16, [80, 130, 230]); };
  P[T.log_side] = (t) => { for (let x = 0; x < 16; x++) { const base = x % 4 === 0 ? [80, 60, 35] : [105, 80, 48]; for (let y = 0; y < 16; y++) t.set(x, y, t.vary(base, 8)); } t.speckle([70, 52, 30], 0.06, 4); };
  P[T.birch_side] = (t) => { t.fill([216, 215, 205], 8); for (let i = 0; i < 9; i++) { const x = (t.rnd() * 14) | 0, y = (t.rnd() * 16) | 0, l = 2 + ((t.rnd() * 3) | 0); for (let k = 0; k < l; k++) t.set(x + k, y, [45, 45, 40]); } };
  P[T.log_top] = (t) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      let c = (Math.floor(d) % 2 === 0) ? [176, 140, 88] : [150, 115, 70];
      if (d > 6.5) c = [100, 76, 45];
      t.set(x, y, t.vary(c, 6));
    }
  };
  function leaves(base) { return (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const r = t.rnd(); if (r < 0.16) t.set(x, y, [0, 0, 0], 0); else t.set(x, y, t.vary(r < 0.4 ? [base[0] - 20, base[1] - 25, base[2] - 12] : base, 14)); } }; }
  P[T.leaves] = leaves([60, 130, 40]);
  P[T.birch_leaves] = leaves([105, 150, 60]);
  P[T.glass] = (t) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, [0, 0, 0], 0);
    for (let i = 0; i < 16; i++) { t.set(i, 0, [220, 235, 240]); t.set(i, 15, [190, 210, 220]); t.set(0, i, [220, 235, 240]); t.set(15, i, [190, 210, 220]); }
    for (let i = 0; i < 4; i++) { t.set(3 + i, 4 - i, [235, 245, 250], 200); t.set(4 + i, 4 - i, [235, 245, 250], 150); t.set(9 + i, 12 - i, [235, 245, 250], 170); }
  };
  P[T.planks] = (t) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = [168, 135, 82];
      if (y % 4 === 3) c = [120, 94, 56];
      else if ((y >> 2) % 2 === 0 ? x === 5 : x === 12) c = [130, 102, 62];
      t.set(x, y, t.vary(c, 7));
    }
  };
  P[T.cobble] = (t) => {
    t.fill([110, 110, 110], 8);
    const pts = []; for (let i = 0; i < 10; i++) pts.push([t.rnd() * 16, t.rnd() * 16, 95 + t.rnd() * 60]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let d1 = 1e9, d2 = 1e9, c = 0;
      for (const p of pts) for (let ox = -16; ox <= 16; ox += 16) for (let oy = -16; oy <= 16; oy += 16) { const dx = x - p[0] - ox, dy = y - p[1] - oy, d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; c = p[2]; } else if (d < d2) d2 = d; }
      const edge = Math.sqrt(d2) - Math.sqrt(d1) < 1.1;
      t.set(x, y, edge ? t.vary([70, 70, 70], 6) : t.vary([c, c, c], 8));
    }
  };
  P[T.bedrock] = (t) => { t.fill([80, 80, 80], 30); t.speckle([30, 30, 30], 0.3, 10); t.speckle([150, 150, 150], 0.1, 10); };
  P[T.coal] = ore([30, 30, 30]);
  P[T.iron] = ore([216, 175, 147]);
  P[T.gold] = ore([250, 220, 60]);
  P[T.brick] = (t) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 2, off = row % 2 ? 4 : 0;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      t.set(x, y, mortar ? t.vary([175, 168, 160], 6) : t.vary([150, 70, 55], 12));
    }
  };
  P[T.stone_bricks] = (t) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 3, off = row % 2 ? 8 : 0;
      const mortar = y % 8 === 7 || (x + off) % 16 === 15;
      const hl = y % 8 === 0 || (x + off) % 16 === 0;
      t.set(x, y, mortar ? t.vary([80, 80, 80], 4) : hl ? t.vary([140, 140, 140], 5) : t.vary([118, 118, 118], 7));
    }
  };
  P[T.snow] = (t) => { t.fill([240, 246, 250], 6); t.speckle([215, 225, 235], 0.12, 4); };
  P[T.snow_side] = (t) => { dirt(t); for (let x = 0; x < 16; x++) { const d = 3 + ((t.rnd() * 3) | 0); for (let y = 0; y < d; y++) t.set(x, y, t.vary([240, 246, 250], 6)); } };
  function plant(t, flower) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, [0, 0, 0], 0);
    if (!flower) {
      for (let i = 0; i < 9; i++) { let x = 1 + ((t.rnd() * 14) | 0); const h = 6 + ((t.rnd() * 9) | 0); for (let y = 15; y > 15 - h; y--) { t.set(x, y, t.vary([85, 150, 45], 18)); if (t.rnd() < 0.2) x += t.rnd() < 0.5 ? -1 : 1; } }
    } else {
      for (let y = 7; y < 16; y++) t.set(7, y, [50, 120, 30]);
      t.set(6, 11, [60, 140, 35]); t.set(5, 10, [60, 140, 35]); t.set(8, 12, [60, 140, 35]); t.set(9, 11, [60, 140, 35]);
      const c = flower;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2) t.set(7 + dx, 5 + dy, t.vary(c, 15));
      t.set(7, 5, flower[0] > 200 && flower[1] > 150 ? [200, 120, 20] : [250, 220, 70]);
    }
  }
  P[T.tallgrass] = (t) => plant(t, null);
  P[T.flower_red] = (t) => plant(t, [210, 30, 35]);
  P[T.flower_yellow] = (t) => plant(t, [245, 215, 40]);
  P[T.bookshelf] = (t) => {
    P[T.planks](t);
    const cols = [[140, 40, 40], [40, 70, 140], [50, 120, 50], [160, 130, 50], [100, 50, 120]];
    for (const y0 of [1, 9]) for (let x = 1; x < 15; x++) { const c = cols[(t.rnd() * cols.length) | 0]; const h = 5 + (t.rnd() < 0.3 ? -1 : 0); for (let y = y0 + (6 - h); y < y0 + 6; y++) t.set(x, y, t.vary(c, 10)); }
  };
  P[T.sandstone_side] = (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let c = [216, 202, 155]; if (y < 3) c = [226, 214, 170]; if (y === 3 || y === 11) c = [190, 175, 128]; t.set(x, y, t.vary(c, 6)); } };
  P[T.sandstone_top] = (t) => { t.fill([222, 210, 165], 6); t.speckle([205, 190, 145], 0.15, 4); };
  P[T.cactus_side] = (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let c = [60, 130, 45]; if (x === 0 || x === 15) c = [30, 80, 25]; if (x % 4 === 2) c = [45, 105, 35]; t.set(x, y, t.vary(c, 8)); } for (let i = 0; i < 10; i++) t.set((t.rnd() * 16) | 0, (t.rnd() * 16) | 0, [230, 230, 200]); };
  P[T.cactus_top] = (t) => { t.fill([75, 145, 55], 8); for (let i = 0; i < 16; i++) { t.set(i, 0, [30, 80, 25]); t.set(i, 15, [30, 80, 25]); t.set(0, i, [30, 80, 25]); t.set(15, i, [30, 80, 25]); } };
  P[T.wool_white] = (t) => { t.fill([232, 232, 232], 10); t.speckle([210, 210, 210], 0.2, 5); };
  P[T.wool_red] = (t) => { t.fill([175, 45, 40], 10); t.speckle([150, 35, 32], 0.2, 5); };
  P[T.wool_blue] = (t) => { t.fill([55, 70, 165], 10); t.speckle([45, 55, 140], 0.2, 5); };
  P[T.glowstone] = (t) => { t.fill([200, 160, 80], 20); for (let i = 0; i < 40; i++) t.set((t.rnd() * 16) | 0, (t.rnd() * 16) | 0, [255, 235, 160]); t.speckle([140, 100, 50], 0.12, 10); };
  P[T.obsidian] = (t) => { t.fill([22, 16, 34], 6); t.speckle([60, 40, 90], 0.15, 12); };

  // ---- added content ----
  const clear = (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, [0, 0, 0], 0); };
  P[T.torch] = (t) => {
    clear(t);
    for (let y = 10; y < 16; y++) { t.set(7, y, t.vary([120, 85, 45], 8)); t.set(8, y, t.vary([95, 66, 34], 8)); }
    t.set(7, 6, [255, 250, 210]); t.set(8, 6, [255, 236, 150]); t.set(7, 7, [255, 220, 90]); t.set(8, 7, [255, 245, 170]);
    t.set(7, 8, [250, 170, 40]); t.set(8, 8, [255, 200, 70]); t.set(7, 9, [210, 110, 30]); t.set(8, 9, [230, 140, 40]);
    t.set(7, 5, [255, 210, 120], 200); t.set(8, 4, [255, 190, 90], 140);
  };
  P[T.lantern] = (t) => {
    clear(t);
    for (let y = 7; y < 16; y++) for (let x = 5; x < 11; x++) {
      const edge = x === 5 || x === 10 || y === 7 || y === 15;
      const bar = !edge && (x === 7 || x === 8) && (y === 10 || y === 13);
      t.set(x, y, edge ? t.vary([55, 58, 66], 6) : bar ? [80, 70, 60] : t.vary(y > 10 ? [255, 190, 80] : [255, 225, 130], 12));
    }
    for (let x = 6; x < 10; x++) { t.set(x, 5, [60, 62, 70]); t.set(x, 6, [72, 74, 82]); }
    t.set(7, 3, [70, 70, 78]); t.set(8, 3, [70, 70, 78]); t.set(6, 4, [70, 70, 78]); t.set(9, 4, [70, 70, 78]);
  };
  P[T.lantern_top] = (t) => { t.fill([60, 62, 70], 5); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.set(x, y, [255, 200, 100]); };
  P[T.craft_top] = (t) => {
    P[T.planks](t);
    for (let i = 0; i < 16; i++) { t.set(i, 0, [95, 70, 40]); t.set(i, 15, [95, 70, 40]); t.set(0, i, [95, 70, 40]); t.set(15, i, [95, 70, 40]); }
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if (x % 3 === 0 || y % 3 === 0) t.set(x, y, [110, 82, 48]);
  };
  P[T.craft_side] = (t) => {
    P[T.planks](t);
    for (let x = 0; x < 16; x++) { t.set(x, 0, [95, 70, 40]); t.set(x, 1, [130, 100, 60]); }
    for (let y = 4; y < 12; y++) t.set(4, y, [120, 120, 125]); for (let x = 2; x < 7; x++) t.set(x, 4, [150, 150, 155]); // hammer
    for (let y = 5; y < 13; y++) t.set(11, y, [110, 80, 45]); for (let y = 3; y < 7; y++) { t.set(10, y, [170, 170, 175]); t.set(12, y, [170, 170, 175]); }
  };
  P[T.pumpkin_side] = (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, t.vary(x % 4 === 0 ? [190, 100, 20] : [225, 135, 30], 8)); };
  P[T.pumpkin_top] = (t) => { P[T.pumpkin_side](t); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.set(x, y, t.vary([110, 90, 40], 8)); };
  P[T.jack_face] = (t) => {
    P[T.pumpkin_side](t);
    const glow = (x, y) => t.set(x, y, t.vary([255, 220, 90], 15));
    for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { glow(3 + j, 4 + i); glow(4 - j + 0, 4 + i); glow(11 + j, 4 + i); glow(12 - j, 4 + i); }
    for (let x = 3; x < 13; x++) { glow(x, 10); if (x !== 5 && x !== 10) glow(x, 11); if (x > 4 && x < 11) glow(x, 12); }
  };
  function wool(c) { return (t) => { t.fill(c, 9); t.speckle([c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], 0.22, 5); }; }
  P[T.wool_yellow] = wool([240, 200, 50]); P[T.wool_lime] = wool([125, 200, 40]); P[T.wool_green] = wool([75, 105, 35]);
  P[T.wool_orange] = wool([235, 125, 35]); P[T.wool_purple] = wool([125, 55, 175]); P[T.wool_cyan] = wool([30, 140, 150]);
  P[T.wool_pink] = wool([235, 140, 170]); P[T.wool_black] = wool([30, 30, 36]); P[T.wool_gray] = wool([75, 78, 82]);
  P[T.mossy_cobble] = (t) => { P[T.cobble](t); for (let i = 0; i < 40; i++) { const x = (t.rnd() * 16) | 0, y = (t.rnd() * 16) | 0; t.set(x, y, t.vary([80, 120, 50], 12)); if (t.rnd() < 0.5) t.set(x + 1, y, t.vary([70, 110, 45], 12)); } };
  P[T.hay_side] = (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let c = t.rnd() < 0.3 ? [190, 150, 40] : [220, 185, 60]; if (y === 4 || y === 11) c = [150, 60, 40]; t.set(x, y, t.vary(c, 8)); } };
  P[T.hay_top] = (t) => { t.fill([205, 170, 55], 14); t.speckle([170, 130, 35], 0.3, 6); };
  P[T.melon_side] = (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, t.vary(x % 5 < 2 ? [95, 150, 35] : [130, 175, 45], 8)); };
  P[T.melon_top] = (t) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) | 0; t.set(x, y, t.vary(d % 3 === 0 ? [95, 150, 35] : [130, 175, 45], 8)); } };
  P[T.terracotta] = (t) => { t.fill([160, 88, 62], 6); t.speckle([145, 78, 55], 0.2, 4); };
  P[T.flower_blue] = (t) => plant(t, [40, 160, 230]);
  P[T.flower_tulip] = (t) => plant(t, [240, 120, 170]);
  P[T.mushroom] = (t) => {
    clear(t);
    for (let y = 9; y < 16; y++) { t.set(7, y, [225, 215, 195]); t.set(8, y, [210, 200, 180]); }
    for (let y = 4; y < 9; y++) for (let x = 3; x < 13; x++) { if (y === 4 && (x < 5 || x > 10)) continue; t.set(x, y, t.vary([200, 30, 30], 12)); }
    t.set(5, 6, [250, 250, 250]); t.set(9, 5, [250, 250, 250]); t.set(11, 7, [250, 250, 250]); t.set(7, 7, [250, 250, 250]);
  };
  function egg(base, spot) {
    return (t) => {
      clear(t);
      for (let y = 1; y < 15; y++) for (let x = 2; x < 14; x++) {
        const dx = (x - 7.5) / 5.5, dy = (y - 8.5) / (y < 8.5 ? 7.5 : 6.5);
        if (dx * dx + dy * dy <= 1) t.set(x, y, t.vary(base, 8));
      }
      for (let i = 0; i < 9; i++) { const x = 4 + ((t.rnd() * 8) | 0), y = 3 + ((t.rnd() * 10) | 0); if (t.get(x, y)[3]) { t.set(x, y, spot); if (t.get(x + 1, y)[3]) t.set(x + 1, y, spot); } }
      t.set(5, 4, [255, 255, 255], 200);
    };
  }
  P[T.dog_egg] = egg([225, 205, 170], [130, 85, 50]);
  P[T.cat_egg] = egg([240, 160, 70], [60, 45, 40]);

  function buildAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const tiles = [];
    for (const key in P) {
      const idx = +key; const img = makeTile(P[idx], idx + 1);
      ctx.putImageData(img, (idx % COLS) * S, Math.floor(idx / COLS) * S);
      tiles[idx] = img;
    }
    return { canvas, tiles };
  }

  // UV rect for a tile (three.js flipY = true, so v=1 is canvas top)
  function tileUV(idx) {
    const c = idx % COLS, r = Math.floor(idx / COLS);
    const e = 0.0005;
    return [c / COLS + e, 1 - (r + 1) / ROWS + e, (c + 1) / COLS - e, 1 - r / ROWS - e]; // u0, v0(bottom), u1, v1(top)
  }

  // Draw an isometric block icon into a 2D context
  function drawIcon(ctx, atlas, id, size) {
    const d = VC.Blocks.defs[id];
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    const src = (t) => [(t % COLS) * S, Math.floor(t / COLS) * S];
    if (d.render === 'cross' || d.render === 'item' || d.render === 'model') { const [sx, sy] = src(d.side); ctx.drawImage(atlas, sx, sy, S, S, size * 0.1, size * 0.1, size * 0.8, size * 0.8); return; }
    const s = size / 2 * 0.92, cx = size / 2, top = size * 0.04;
    const k = s / S;
    // top face
    ctx.save(); ctx.setTransform(k, k * 0.5, -k, k * 0.5, cx, top); let [sx, sy] = src(d.top); ctx.drawImage(atlas, sx, sy, S, S, 0, 0, S, S); ctx.restore();
    // left face
    ctx.save(); ctx.setTransform(k, k * 0.5, 0, k, cx - s, top + s * 0.5); [sx, sy] = src(d.side); ctx.drawImage(atlas, sx, sy, S, S, 0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, S, S); ctx.restore();
    // right face
    ctx.save(); ctx.setTransform(k, -k * 0.5, 0, k, cx, top + s); ctx.drawImage(atlas, sx, sy, S, S, 0, 0, S, S);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, S, S); ctx.restore();
  }

  VC.Textures = { buildAtlas, tileUV, drawIcon, TILE: S };
})();
