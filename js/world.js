// World: chunk storage, procedural generation, edits & persistence.
window.VC = window.VC || {};
(function () {
  'use strict';
  const CS = 16, CH = 128, SEA = 32;
  const B = VC.B;
  const hash3 = VC.Noise.hash3;
  const idx = (x, y, z) => x + z * CS + y * CS * CS;
  const LIGHT = VC.Blocks.LIGHT;

  class Chunk {
    constructor(cx, cz) {
      this.cx = cx; this.cz = cz; this.key = cx + ',' + cz;
      this.data = new Uint8Array(CS * CS * CH);
      this.maxY = 0;           // highest non-air y + 1
      this.meshes = null;      // { opaque, cutout, water }
      this.dirty = true;
      this.urgent = false;     // edited: rebuild this frame
      this.emitters = new Set(); // indices of light-emitting blocks
      this.blockLight = null;  // Uint8Array of baked block light (only when lit)
    }
  }

  class Generator {
    constructor(seed) {
      this.seed = seed | 0;
      const S = VC.Noise.Simplex;
      this.nCont = new S(seed ^ 0x1234);
      this.nHill = new S(seed ^ 0x5678);
      this.nDet = new S(seed ^ 0x9abc);
      this.nMount = new S(seed ^ 0xdef0);
      this.nCaveA = new S(seed ^ 0x1111);
      this.nCaveB = new S(seed ^ 0x2222);
      this.nCheese = new S(seed ^ 0x3333);
      this.nTemp = new S(seed ^ 0x4444);
      this.nForest = new S(seed ^ 0x5555);
    }
    height(x, z) {
      const c = this.nCont.fbm2(x / 700, z / 700, 3);
      const hills = this.nHill.fbm2(x / 160, z / 160, 4);
      const det = this.nDet.fbm2(x / 40, z / 40, 2);
      let m = this.nMount.fbm2(x / 300, z / 300, 4);
      m = Math.max(0, m - 0.05); m = m * m * 160;
      let h = SEA + 3 + c * 16 + hills * 9 + det * 2.5 + m;
      return Math.max(3, Math.min(CH - 12, Math.floor(h)));
    }
    temperature(x, z) { return this.nTemp.fbm2(x / 500, z / 500, 2); }
    isCave(x, y, z, h) {
      if (y < 3 || y > h) return false;
      if (h < SEA + 3 && y > h - 6) return false; // keep sea/lake floors sealed
      // Near the surface only carve where the tunnel really continues downward,
      // so tunnels make proper entrances instead of 1-block pinholes.
      if (y >= h - 2) return this.caveRaw(x, y, z, h) && this.caveRaw(x, h - 3, z, h) && this.caveRaw(x, h - 4, z, h);
      return this.caveRaw(x, y, z, h);
    }
    caveRaw(x, y, z, h) {
      const a = this.nCaveA.noise3(x / 45, y / 28, z / 45), b = this.nCaveB.noise3(x / 45, y / 28, z / 45);
      if (a * a + b * b < 0.006) return true;
      if (y < h - 8 && this.nCheese.noise3(x / 70, y / 35, z / 70) > 0.62) return true;
      return false;
    }
    // Deterministic per-column decoration, usable across chunk borders
    treeAt(x, z) {
      const h = this.height(x, z);
      if (h <= SEA + 1 || h > 88) return null;
      const temp = this.temperature(x, z);
      const r = hash3(x, 7, z, this.seed);
      if (temp > 0.35) { // desert
        if (r < 0.004 && !this.isCave(x, h, z, h)) return { type: 'cactus', h, height: 2 + ((hash3(x, 9, z, this.seed) * 2) | 0) };
        return null;
      }
      const forest = this.nForest.fbm2(x / 120, z / 120, 2);
      const chance = forest > 0.15 ? 0.045 : forest > -0.1 ? 0.012 : 0.003;
      if (r >= chance || this.isCave(x, h, z, h)) return null;
      const birch = hash3(x, 11, z, this.seed) < (forest > 0.3 ? 0.35 : 0.15);
      return { type: birch ? 'birch' : 'oak', h, height: 4 + ((hash3(x, 3, z, this.seed) * 3) | 0) };
    }
    generate(chunk) {
      const d = chunk.data, x0 = chunk.cx * CS, z0 = chunk.cz * CS, seed = this.seed;
      let maxY = SEA + 1;
      const heights = new Int16Array(CS * CS);
      for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const h = this.height(x, z); heights[lx + lz * CS] = h;
        const temp = this.temperature(x, z);
        const desert = temp > 0.35;
        const beach = h <= SEA + 1 && h >= SEA - 3;
        const snowy = h > 78 + ((hash3(x, 0, z, seed) * 6) | 0);
        let surface, sub;
        if (h < SEA - 3) { surface = hash3(x, 1, z, seed) < 0.3 ? B.GRAVEL : (h < SEA - 8 ? B.GRAVEL : B.SAND); sub = B.DIRT; if (hash3(x, 2, z, seed) < 0.5) surface = B.SAND; }
        else if (desert) { surface = B.SAND; sub = B.SAND; }
        else if (beach) { surface = B.SAND; sub = B.SAND; }
        else if (h > 95) { surface = B.STONE; sub = B.STONE; }
        else if (snowy) { surface = B.SNOW; sub = B.DIRT; }
        else { surface = B.GRASS; sub = B.DIRT; }
        const bedrockTop = 1 + ((hash3(x, 5, z, seed) * 3) | 0);
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let id = B.AIR;
          if (y < bedrockTop) id = B.BEDROCK;
          else if (y < h - 3) {
            id = B.STONE;
            if (desert && y >= h - 6) id = B.SANDSTONE;
            else {
              const r = hash3(x, y, z, seed);
              if (r < 0.012 && y < 90) id = B.COAL;
              else if (r < 0.018 && y < 50) id = B.IRON;
              else if (r < 0.0195 && y < 24) id = B.GOLD;
            }
          } else if (y < h) id = sub;
          else if (y === h) id = surface;
          else if (y <= SEA) id = B.WATER;
          if (id !== B.AIR && id !== B.WATER && id !== B.BEDROCK && this.isCave(x, y, z, h)) id = B.AIR;
          d[idx(lx, y, lz)] = id;
        }
        // Ground plants
        if (surface === B.GRASS && h > SEA && d[idx(lx, h, lz)] === B.GRASS) {
          const r = hash3(x, 13, z, seed);
          if (r < 0.10) d[idx(lx, h + 1, lz)] = B.TALLGRASS;
          else if (r < 0.108) d[idx(lx, h + 1, lz)] = B.ROSE;
          else if (r < 0.116) d[idx(lx, h + 1, lz)] = B.DANDELION;
        }
        if (h + 2 > maxY) maxY = h + 2;
      }
      // Trees (scan a margin so canopies cross chunk borders seamlessly)
      const set = (lx, y, lz, id, force) => {
        if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= CH) return;
        const i = idx(lx, y, lz), cur = d[i];
        if (force || cur === B.AIR || cur === B.TALLGRASS || cur === B.ROSE || cur === B.DANDELION) { d[i] = id; if (y + 1 > maxY) maxY = y + 1; }
      };
      for (let lz = -3; lz < CS + 3; lz++) for (let lx = -3; lx < CS + 3; lx++) {
        const t = this.treeAt(x0 + lx, z0 + lz);
        if (!t) continue;
        const base = t.h + 1;
        if (t.type === 'cactus') { for (let i = 0; i < t.height; i++) set(lx, base + i, lz, B.CACTUS, true); continue; }
        const log = t.type === 'birch' ? B.BIRCH_LOG : B.LOG, leaf = t.type === 'birch' ? B.BIRCH_LEAVES : B.LEAVES;
        const top = base + t.height;
        for (let y = top - 3; y <= top; y++) {
          const r = y >= top - 1 ? 1 : 2;
          for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
            if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash3(x0 + lx + dx, y, z0 + lz + dz, seed) < 0.6) continue;
            if (y === top && Math.abs(dx) + Math.abs(dz) > 1) continue;
            set(lx + dx, y, lz + dz, leaf, false);
          }
        }
        for (let y = base; y < top; y++) set(lx, y, lz, log, true);
        if (lx >= 0 && lz >= 0 && lx < CS && lz < CS) d[idx(lx, t.h, lz)] = B.DIRT;
      }
      chunk.maxY = Math.min(CH, maxY + 1);
    }
  }

  const SAVE_KEY = 'voxelcraft.save.v1';

  class World {
    constructor(seed) {
      this.seed = seed;
      this.gen = new Generator(seed);
      this.chunks = new Map();
      this.edits = new Map(); // chunkKey -> Map(index -> id)
      this.onEdit = null;
    }
    static key(cx, cz) { return cx + ',' + cz; }
    getChunk(cx, cz) { return this.chunks.get(cx + ',' + cz); }
    ensureChunk(cx, cz) {
      const k = cx + ',' + cz;
      let c = this.chunks.get(k);
      if (c) return c;
      c = new Chunk(cx, cz);
      this.gen.generate(c);
      const e = this.edits.get(k);
      if (e) for (const [i, id] of e) { c.data[i] = id; const y = Math.floor(i / 256); if (y + 2 > c.maxY) c.maxY = Math.min(CH, y + 2); if (LIGHT[id]) c.emitters.add(i); }
      this.chunks.set(k, c);
      return c;
    }
    getBlock(x, y, z) {
      if (y < 0) return B.BEDROCK;
      if (y >= CH) return B.AIR;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const c = this.chunks.get(cx + ',' + cz);
      if (!c) return -1; // unloaded
      return c.data[idx(x - cx * CS, y, z - cz * CS)];
    }
    getBlockLight(x, y, z) {
      if (y < 0 || y >= CH) return 0;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const c = this.chunks.get(cx + ',' + cz);
      if (!c || !c.blockLight) return 0;
      return c.blockLight[idx(x - cx * CS, y, z - cz * CS)];
    }
    // Mark every chunk overlapping [x0..x1]x[z0..z1] (+1 block) dirty; also a ring around it if lights are near.
    markRegionDirty(x0, z0, x1, z1, urgentX, urgentZ) {
      const c0x = Math.floor((x0 - 1) / CS), c1x = Math.floor((x1 + 1) / CS), c0z = Math.floor((z0 - 1) / CS), c1z = Math.floor((z1 + 1) / CS);
      let lit = false;
      for (let cx = c0x - 1; cx <= c1x + 1 && !lit; cx++) for (let cz = c0z - 1; cz <= c1z + 1; cz++) { const c = this.getChunk(cx, cz); if (c && c.emitters.size) { lit = true; break; } }
      const g = lit ? 1 : 0;
      for (let cx = c0x - g; cx <= c1x + g; cx++) for (let cz = c0z - g; cz <= c1z + g; cz++) { const c = this.getChunk(cx, cz); if (c) c.dirty = true; }
      if (urgentX != null) { const c = this.getChunk(Math.floor(urgentX / CS), Math.floor(urgentZ / CS)); if (c) c.urgent = true; }
    }
    setBlock(x, y, z, id, quiet) {
      if (y < 0 || y >= CH) return false;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const c = this.chunks.get(cx + ',' + cz);
      if (!c) return false;
      const lx = x - cx * CS, lz = z - cz * CS, i = idx(lx, y, lz);
      const old = c.data[i];
      c.data[i] = id; c.dirty = true;
      if (LIGHT[id]) c.emitters.add(i); else c.emitters.delete(i);
      if (quiet) { // batched edits (explosions): caller marks neighbours via markRegionDirty
        if (y + 2 > c.maxY) c.maxY = Math.min(CH, y + 2);
        let e = this.edits.get(c.key); if (!e) { e = new Map(); this.edits.set(c.key, e); }
        e.set(i, id);
        if (this.onEdit) this.onEdit(c);
        return true;
      }
      c.urgent = true;
      if (y + 2 > c.maxY) c.maxY = Math.min(CH, y + 2);
      let e = this.edits.get(c.key); if (!e) { e = new Map(); this.edits.set(c.key, e); }
      e.set(i, id);
      // neighbours need remesh when editing borders (incl. diagonals for AO)
      const nx = lx === 0 ? -1 : lx === CS - 1 ? 1 : 0, nz = lz === 0 ? -1 : lz === CS - 1 ? 1 : 0;
      const mark = (a, b) => { const n = this.chunks.get((cx + a) + ',' + (cz + b)); if (n) { n.dirty = true; n.urgent = true; } };
      if (nx) mark(nx, 0); if (nz) mark(0, nz); if (nx && nz) mark(nx, nz);
      // Block light can reach up to 14 blocks: if a light source changed, or lights are nearby,
      // neighbouring chunks need relighting too (rebuilt over the next frames, not urgently).
      let lit = LIGHT[id] || LIGHT[old];
      if (!lit) for (let a = -1; a <= 1 && !lit; a++) for (let b = -1; b <= 1; b++) { const n = this.chunks.get((cx + a) + ',' + (cz + b)); if (n && n.emitters.size) { lit = true; break; } }
      if (lit) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const n = this.chunks.get((cx + a) + ',' + (cz + b)); if (n) n.dirty = true; }
      if (this.onEdit) this.onEdit(c);
      return true;
    }
    serialize(extra) {
      const edits = {};
      for (const [k, m] of this.edits) { const arr = []; for (const [i, id] of m) arr.push(i, id); if (arr.length) edits[k] = arr; }
      return JSON.stringify(Object.assign({ v: 1, seed: this.seed, edits }, extra));
    }
    loadEdits(obj) {
      this.edits.clear();
      for (const k in obj.edits || {}) { const arr = obj.edits[k], m = new Map(); for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]); this.edits.set(k, m); }
    }
  }

  VC.World = World; VC.Chunk = Chunk; VC.Generator = Generator;
  VC.CONST = { CS, CH, SEA, SAVE_KEY };
})();
