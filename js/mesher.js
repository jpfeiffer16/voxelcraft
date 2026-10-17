// Chunk mesher: face culling + per-vertex ambient occlusion + smooth sky-light approximation.
window.VC = window.VC || {};
(function () {
  'use strict';
  const { CS, CH } = VC.CONST;
  const { OPAQUE, RENDER, TEX, defs } = VC.Blocks;
  const B = VC.B;
  const PW = CS + 2, PH = CH + 2, PLANE = PW * PW;
  const pad = new Uint8Array(PW * PW * PH);
  const hm = new Int16Array(PLANE);
  const pidx = (x, y, z) => (x + 1) + (z + 1) * PW + (y + 1) * PLANE;
  const GLOW = new Uint8Array(256); for (const d of defs) if (d && d.glow) GLOW[d.id] = 1;

  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8, t: 2 },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8, t: 2 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, t: 0 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, t: 1 },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.65, t: 2 },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.65, t: 2 },
  ];
  const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
  // Precompute padded-array offsets
  for (const f of FACES) {
    const na = f.n[0] ? 0 : f.n[1] ? 1 : 2;
    const ax = [0, 1, 2].filter(a => a !== na);
    const off = (v) => v[0] + v[2] * PW + v[1] * PLANE;
    f.nOff = off(f.n);
    f.ao = f.c.map(c => {
      const du = [0, 0, 0], dv = [0, 0, 0];
      du[ax[0]] = c[ax[0]] ? 1 : -1; dv[ax[1]] = c[ax[1]] ? 1 : -1;
      const s1 = [f.n[0] + du[0], f.n[1] + du[1], f.n[2] + du[2]];
      const s2 = [f.n[0] + dv[0], f.n[1] + dv[1], f.n[2] + dv[2]];
      const cc = [f.n[0] + du[0] + dv[0], f.n[1] + du[1] + dv[1], f.n[2] + du[2] + dv[2]];
      return [off(s1), off(s2), off(cc), s1, s2, cc];
    });
  }
  const AO_CURVE = [0.45, 0.65, 0.82, 1.0];

  class Buf {
    constructor() { this.pos = new Float32Array(4096); this.uv = new Float32Array(4096); this.col = new Float32Array(4096); this.v = 0; this.idx = []; }
    grow() {
      const g = (a, n) => { const b = new Float32Array(n); b.set(a); return b; };
      const n = this.pos.length * 2; this.pos = g(this.pos, n); this.col = g(this.col, n); this.uv = g(this.uv, n / 3 * 2);
    }
    vert(x, y, z, u, v, c) {
      if ((this.v + 1) * 3 > this.pos.length) this.grow();
      const i3 = this.v * 3, i2 = this.v * 2;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.col[i3] = c; this.col[i3 + 1] = c; this.col[i3 + 2] = c;
      this.uv[i2] = u; this.uv[i2 + 1] = v;
      return this.v++;
    }
    toGeometry() {
      if (this.v === 0) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.v * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.v * 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.v * 3), 3));
      g.setIndex(this.v > 65535 ? new THREE.BufferAttribute(new Uint32Array(this.idx), 1) : new THREE.BufferAttribute(new Uint16Array(this.idx), 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
  }

  const uvCache = [];
  function uvOf(tile) { return uvCache[tile] || (uvCache[tile] = VC.Textures.tileUV(tile)); }

  // Build geometries for a chunk. Requires all 8 neighbours loaded.
  function buildChunk(world, chunk) {
    const cx = chunk.cx, cz = chunk.cz;
    let maxY = chunk.maxY;
    pad.fill(0);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = world.getChunk(cx + dx, cz + dz);
      if (!c) continue;
      if (dx || dz) maxY = Math.max(maxY, Math.min(c.maxY, CH));
      const xs = dx === -1 ? CS - 1 : 0, xe = dx === 1 ? 1 : CS;
      const zs = dz === -1 ? CS - 1 : 0, ze = dz === 1 ? 1 : CS;
      const d = c.data, cmax = c.maxY;
      for (let y = 0; y < cmax; y++) for (let z = zs; z < ze; z++) {
        const pz = z + dz * CS, row = y * 256 + z * 16;
        for (let x = xs; x < xe; x++) pad[pidx(x + dx * CS, y, pz)] = d[row + x];
      }
    }
    // bedrock floor below y=0
    for (let i = 0; i < PLANE; i++) pad[i] = B.BEDROCK;
    const yLimit = Math.min(CH, maxY + 1);
    // column heightmap of top opaque block
    for (let pz = 0; pz < PW; pz++) for (let px = 0; px < PW; px++) {
      let y = yLimit; const base = px + pz * PW;
      while (y > 0 && !OPAQUE[pad[base + (y + 1) * PLANE]]) y--;
      hm[base] = y;
    }
    const light = (p) => { // p: padded index
      const y = Math.floor(p / PLANE) - 1, col = p % PLANE;
      const h = hm[col];
      if (y > h) return 1;
      return Math.max(0.3, 0.86 - (h - y) * 0.065);
    };

    const opaque = new Buf(), cutout = new Buf(), water = new Buf();
    const ox = cx * CS, oz = cz * CS;
    for (let y = 0; y < yLimit; y++) {
      for (let z = 0; z < CS; z++) {
        for (let x = 0; x < CS; x++) {
          const p = pidx(x, y, z);
          const id = pad[p];
          if (!id) continue;
          const r = RENDER[id];
          const wx = x + ox, wz = z + oz;
          if (r === 4) { // cross plant
            const tile = TEX[id * 3 + 2], uv = uvOf(tile), L = light(p + PLANE) * 0.95;
            const s = 0.15, e = 0.85;
            const quads = [[[s, s], [e, e]], [[e, s], [s, e]]];
            for (const q of quads) {
              const a = cutout.vert(wx + q[0][0], y, wz + q[0][1], uv[0], uv[1], L);
              cutout.vert(wx + q[1][0], y, wz + q[1][1], uv[2], uv[1], L);
              cutout.vert(wx + q[1][0], y + 0.9, wz + q[1][1], uv[2], uv[3], L);
              cutout.vert(wx + q[0][0], y + 0.9, wz + q[0][1], uv[0], uv[3], L);
              cutout.idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
            }
            continue;
          }
          const buf = r === 1 ? opaque : r === 2 ? cutout : water;
          const glow = GLOW[id];
          const waterTop = r === 3 && pad[p + PLANE] !== B.WATER;
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nid = pad[p + F.nOff];
            if (OPAQUE[nid]) continue;
            if (r === 2 && nid === id) continue;
            if (r === 3) { if (nid === B.WATER) continue; if (RENDER[nid] === 2 && f !== 2) continue; }
            if (r === 1 && nid === 0 && y === 0 && f === 3) continue;
            const tile = TEX[id * 3 + F.t], uv = uvOf(tile);
            const aos = [0, 0, 0, 0];
            const base = buf.v;
            for (let k = 0; k < 4; k++) {
              const c = F.c[k], A = F.ao[k];
              let col;
              if (glow) col = 1;
              else if (r === 3) col = F.shade * light(p + F.nOff) * 0.95 + 0.05;
              else {
                const o1 = OPAQUE[pad[p + A[0]]], o2 = OPAQUE[pad[p + A[1]]], o3 = OPAQUE[pad[p + A[2]]];
                const ao = (o1 && o2) ? 0 : 3 - o1 - o2 - o3;
                aos[k] = ao;
                // smooth light: average over non-opaque cells around the vertex
                let ls = light(p + F.nOff), ln = 1;
                if (!o1) { ls += light(p + A[0]); ln++; }
                if (!o2) { ls += light(p + A[1]); ln++; }
                if (!o3 && !(o1 && o2)) { ls += light(p + A[2]); ln++; }
                col = F.shade * AO_CURVE[ao] * (ls / ln);
              }
              let vy = y + c[1];
              if (waterTop && c[1] === 1) vy -= 0.12;
              const uc = UVC[k];
              buf.vert(wx + c[0], vy, wz + c[2], uc[0] ? uv[2] : uv[0], uc[1] ? uv[3] : uv[1], col);
            }
            if (aos[0] + aos[2] < aos[1] + aos[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
    return { opaque: opaque.toGeometry(), cutout: cutout.toGeometry(), water: water.toGeometry() };
  }

  VC.Mesher = { buildChunk };
})();
