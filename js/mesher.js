// Chunk mesher: face culling, per-vertex ambient occlusion, smooth sky-light approximation
// and flood-filled block light (torches, glowstone...) baked into vertex colours.
// Vertex colour channels: r = sky-lit brightness (scaled by daylight in the shader),
//                         g = block-light brightness (not affected by day/night), b = unused.
window.VC = window.VC || {};
(function () {
  'use strict';
  const { CS, CH } = VC.CONST;
  const { OPAQUE, RENDER, TEX, LIGHT, FLUID, LEVEL, defs } = VC.Blocks;
  const B = VC.B;
  const PW = CS + 2, PH = CH + 2, PLANE = PW * PW;
  const pad = new Uint8Array(PW * PW * PH);
  const hm = new Int16Array(PLANE);
  const pidx = (x, y, z) => (x + 1) + (z + 1) * PW + (y + 1) * PLANE;

  // ---- block light flood fill over the chunk + 15 block margin ----
  const M = 15, RW = CS + 2 * M, RPLANE = RW * RW;
  const rlight = new Uint8Array(RPLANE * CH);
  const queue = new Int32Array(RPLANE * CH);
  const rdx = new Int8Array(RW), rlx = new Uint8Array(RW);
  for (let r = 0; r < RW; r++) { const v = r - M; rdx[r] = Math.floor(v / CS); rlx[r] = v - rdx[r] * CS; }
  const BL = new Float32Array(16); for (let l = 1; l < 16; l++) BL[l] = Math.pow(l / 15, 1.4);
  let lightOn = false, lyMin = 0, lyMax = -1;

  function computeBlockLight(world, chunk) {
    const datas = [];
    let any = false;
    const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
    const seeds = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = world.getChunk(chunk.cx + dx, chunk.cz + dz);
      datas[(dz + 1) * 3 + dx + 1] = c ? c.data : null;
      if (!c || !c.emitters.size) continue;
      for (const i of c.emitters) {
        const lx = i & 15, lz = (i >> 4) & 15, y = i >> 8, lv = LIGHT[c.data[i]];
        if (!lv) continue;
        const rx = lx + dx * CS + M, rz = lz + dz * CS + M;
        if (rx < 0 || rz < 0 || rx >= RW || rz >= RW) continue;
        // skip emitters too far to reach this chunk
        const ex = Math.max(0, M - rx, rx - (M + CS - 1)), ez = Math.max(0, M - rz, rz - (M + CS - 1));
        if (ex + ez >= lv) continue;
        seeds.push(rx, y, rz, lv); any = true;
      }
    }
    lightOn = any;
    if (!any) { chunk.blockLight = null; return; }
    let ymin = CH, ymax = 0;
    for (let s = 0; s < seeds.length; s += 4) { ymin = Math.min(ymin, seeds[s + 1] - seeds[s + 3]); ymax = Math.max(ymax, seeds[s + 1] + seeds[s + 3]); }
    lyMin = Math.max(0, ymin); lyMax = Math.min(CH - 1, ymax);
    rlight.fill(0, lyMin * RPLANE, (lyMax + 1) * RPLANE);
    let qh = 0, qt = 0;
    for (let s = 0; s < seeds.length; s += 4) {
      const i = seeds[s] + seeds[s + 2] * RW + seeds[s + 1] * RPLANE;
      if (rlight[i] < seeds[s + 3]) { rlight[i] = seeds[s + 3]; queue[qt++] = i; }
    }
    const opaqueAt = (rx, y, rz) => {
      const d = datas[(rdx[rz] + 1) * 3 + rdx[rx] + 1];
      return !d || OPAQUE[d[rlx[rx] + rlx[rz] * 16 + y * 256]];
    };
    while (qh < qt) {
      const i = queue[qh++], L = rlight[i];
      if (L <= 1) continue;
      const y = (i / RPLANE) | 0, rem = i - y * RPLANE, rz = (rem / RW) | 0, rx = rem - rz * RW;
      const nl = L - 1;
      // 6 neighbours
      if (rx > 0 && rlight[i - 1] < nl && !opaqueAt(rx - 1, y, rz)) { rlight[i - 1] = nl; queue[qt++] = i - 1; }
      if (rx < RW - 1 && rlight[i + 1] < nl && !opaqueAt(rx + 1, y, rz)) { rlight[i + 1] = nl; queue[qt++] = i + 1; }
      if (rz > 0 && rlight[i - RW] < nl && !opaqueAt(rx, y, rz - 1)) { rlight[i - RW] = nl; queue[qt++] = i - RW; }
      if (rz < RW - 1 && rlight[i + RW] < nl && !opaqueAt(rx, y, rz + 1)) { rlight[i + RW] = nl; queue[qt++] = i + RW; }
      if (y > lyMin && rlight[i - RPLANE] < nl && !opaqueAt(rx, y - 1, rz)) { rlight[i - RPLANE] = nl; queue[qt++] = i - RPLANE; }
      if (y < lyMax && rlight[i + RPLANE] < nl && !opaqueAt(rx, y + 1, rz)) { rlight[i + RPLANE] = nl; queue[qt++] = i + RPLANE; }
    }
    // keep this chunk's slice for entity lighting queries
    const bl = chunk.blockLight || (chunk.blockLight = new Uint8Array(CS * CS * CH));
    bl.fill(0);
    for (let y = lyMin; y <= lyMax; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) bl[x + z * 16 + y * 256] = rlight[(x + M) + (z + M) * RW + y * RPLANE];
  }
  // block light (0-15) for a padded-array index
  function blockLightP(p) {
    if (!lightOn) return 0;
    const y = ((p / PLANE) | 0) - 1;
    if (y < lyMin || y > lyMax) return 0;
    const rem = p % PLANE, z = ((rem / PW) | 0) - 1, x = (rem % PW) - 1;
    return rlight[(x + M) + (z + M) * RW + y * RPLANE];
  }

  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.8, t: 2 },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.8, t: 2 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, t: 0 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5, t: 1 },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.65, t: 2 },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.65, t: 2 },
  ];
  const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const f of FACES) {
    const na = f.n[0] ? 0 : f.n[1] ? 1 : 2;
    const ax = [0, 1, 2].filter(a => a !== na);
    const off = (v) => v[0] + v[2] * PW + v[1] * PLANE;
    f.na = na;
    f.nOff = off(f.n);
    f.ao = f.c.map(c => {
      const du = [0, 0, 0], dv = [0, 0, 0];
      du[ax[0]] = c[ax[0]] ? 1 : -1; dv[ax[1]] = c[ax[1]] ? 1 : -1;
      const s1 = [f.n[0] + du[0], f.n[1] + du[1], f.n[2] + du[2]];
      const s2 = [f.n[0] + dv[0], f.n[1] + dv[1], f.n[2] + dv[2]];
      const cc = [f.n[0] + du[0] + dv[0], f.n[1] + du[1] + dv[1], f.n[2] + du[2] + dv[2]];
      return [off(s1), off(s2), off(cc)];
    });
  }
  const AO_CURVE = [0.45, 0.65, 0.82, 1.0];

  // Small box models (units of 1/16). wall: [nx, nz] = direction away from the wall.
  const MODELS = [];
  MODELS[B.TORCH] = [[7, 0, 7, 9, 10, 9]];
  MODELS[B.LANTERN] = [[5, 0, 5, 11, 9, 11], [6, 9, 6, 10, 11, 10]];
  for (const id of [B.TORCH_PX, B.TORCH_NX, B.TORCH_PZ, B.TORCH_NZ]) MODELS[id] = MODELS[B.TORCH];

  class Buf {
    constructor() { this.pos = new Float32Array(4096); this.uv = new Float32Array(4096); this.col = new Float32Array(4096); this.v = 0; this.idx = []; }
    grow() {
      const g = (a, n) => { const b = new Float32Array(n); b.set(a); return b; };
      const n = this.pos.length * 2; this.pos = g(this.pos, n); this.col = g(this.col, n); this.uv = g(this.uv, Math.ceil(n / 3 * 2));
    }
    vert(x, y, z, u, v, r, gg) {
      if ((this.v + 1) * 3 > this.pos.length) this.grow();
      const i3 = this.v * 3, i2 = this.v * 2;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.col[i3] = r; this.col[i3 + 1] = gg; this.col[i3 + 2] = 0;
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
    for (let i = 0; i < PLANE; i++) pad[i] = B.BEDROCK;
    computeBlockLight(world, chunk);
    const yLimit = Math.min(CH, maxY + 1);
    for (let pz = 0; pz < PW; pz++) for (let px = 0; px < PW; px++) {
      let y = yLimit; const base = px + pz * PW;
      while (y > 0 && !OPAQUE[pad[base + (y + 1) * PLANE]]) y--;
      hm[base] = y;
    }
    const sky = (p) => {
      const y = ((p / PLANE) | 0) - 1, h = hm[p % PLANE];
      if (y > h) return 1;
      return Math.max(0.12, 0.86 - (h - y) * 0.07);
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
          if (r === 0) continue;
          const wx = x + ox, wz = z + oz;
          if (r === 4) { // cross plant
            const tile = TEX[id * 3 + 2], uv = uvOf(tile);
            const S = sky(p) * 0.95, G = LIGHT[id] ? 0.6 : BL[blockLightP(p)] * 0.95;
            const s = 0.15, e = 0.85;
            const quads = [[[s, s], [e, e]], [[e, s], [s, e]]];
            for (const q of quads) {
              const a = cutout.vert(wx + q[0][0], y, wz + q[0][1], uv[0], uv[1], S, G);
              cutout.vert(wx + q[1][0], y, wz + q[1][1], uv[2], uv[1], S, G);
              cutout.vert(wx + q[1][0], y + 0.9, wz + q[1][1], uv[2], uv[3], S, G);
              cutout.vert(wx + q[0][0], y + 0.9, wz + q[0][1], uv[0], uv[3], S, G);
              cutout.idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
            }
            continue;
          }
          if (r === 5) { modelBlock(cutout, id, wx, y, wz, p, sky); continue; }
          const buf = r === 1 || r === 7 ? opaque : r === 2 ? cutout : water;
          const glow = LIGHT[id] >= 10;
          const fl = FLUID[id];
          // fluid surface height: full when the same fluid is above, else by level (8 = source)
          const fluidH = (q) => FLUID[pad[q + PLANE]] === fl ? 1 : (LEVEL[pad[q]] >= 8 ? 0.88 : Math.max(0.14, LEVEL[pad[q]] / 8 * 0.86));
          const fluidTop = fl ? fluidH(p) : 1;
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nid = pad[p + F.nOff];
            if (OPAQUE[nid]) continue;
            if (r === 2 && nid === id) continue;
            let sideFloor = 0; // a side face against lower fluid of the same kind only covers the step
            if (fl) {
              if (FLUID[nid] === fl) {
                if (f === 2) { if (fluidTop === 1) continue; }
                else if (f === 3) continue;
                else { const nh = fluidH(p + F.nOff); if (nh >= fluidTop - 0.001) continue; sideFloor = nh; }
              }
              if (r === 3 && RENDER[nid] === 2 && f !== 2) continue;
            }
            if (r === 6 && nid === id) continue;
            if (r === 1 && nid === 0 && y === 0 && f === 3) continue;
            const tile = TEX[id * 3 + F.t], uv = uvOf(tile);
            const aos = [0, 0, 0, 0];
            const base = buf.v;
            const pn = p + F.nOff;
            for (let k = 0; k < 4; k++) {
              const c = F.c[k], A = F.ao[k];
              let S, G;
              if (glow) { S = 1; G = 1; }
              else if (r === 3 || r === 6) { S = F.shade * sky(pn) * 0.95 + 0.05; G = F.shade * BL[blockLightP(pn)]; }
              else {
                const o1 = OPAQUE[pad[p + A[0]]], o2 = OPAQUE[pad[p + A[1]]], o3 = OPAQUE[pad[p + A[2]]];
                const ao = (o1 && o2) ? 0 : 3 - o1 - o2 - o3;
                aos[k] = ao;
                // smooth lighting: average over the non-opaque cells touching this vertex
                let ss = sky(pn), bs = BL[blockLightP(pn)], n = 1;
                if (!o1) { ss += sky(p + A[0]); bs += BL[blockLightP(p + A[0])]; n++; }
                if (!o2) { ss += sky(p + A[1]); bs += BL[blockLightP(p + A[1])]; n++; }
                if (!o3 && !(o1 && o2)) { ss += sky(p + A[2]); bs += BL[blockLightP(p + A[2])]; n++; }
                const k2 = F.shade * AO_CURVE[ao] / n;
                S = ss * k2; G = bs * k2;
              }
              let vy = y + c[1];
              if (fluidTop < 1 && c[1] === 1) vy = y + fluidTop;
              else if (sideFloor && c[1] === 0) vy = y + sideFloor;
              const uc = UVC[k];
              buf.vert(wx + c[0], vy, wz + c[2], uc[0] ? uv[2] : uv[0], uc[1] ? uv[3] : uv[1], S, G);
            }
            if (aos[0] + aos[2] < aos[1] + aos[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
    return { opaque: opaque.toGeometry(), cutout: cutout.toGeometry(), water: water.toGeometry() };
  }

  // Small textured boxes (torches, lanterns). UVs crop the tile by the box position, like Minecraft.
  const nbOff = (dx, dz) => dx + dz * PW;
  function modelBlock(buf, id, wx, y, wz, p, sky) {
    const d = defs[id], wall = d.wall;
    let boxes = MODELS[id], specs = null;
    if (d.shape) { specs = VC.Blocks.shape(id, (dx, dz) => pad[p + nbOff(dx, dz)]); boxes = specs.map(s => s.b); }
    if (!boxes) return;
    const emit = LIGHT[id] > 0;
    const S0 = emit ? 1 : sky(p), G0 = emit ? 1 : BL[blockLightP(p)];
    for (let bi = 0; bi < boxes.length; bi++) {
      const bx = boxes[bi], spec = specs && specs[bi];
      const mn = [bx[0] / 16, bx[1] / 16, bx[2] / 16], mx = [bx[3] / 16, bx[4] / 16, bx[5] / 16];
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const tile = TEX[id * 3 + F.t], uv = uvOf(tile);
        const base = buf.v;
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          let lx = c[0] ? mx[0] : mn[0], ly = c[1] ? mx[1] : mn[1], lz = c[2] ? mx[2] : mn[2];
          // tile-space coords for UV (x/z horizontally, y vertically)
          let u, v;
          if (F.na === 0) { u = lz; v = ly; } else if (F.na === 2) { u = lx; v = ly; } else {
            u = lx; v = 1 - lz;
            if (spec && spec.rotTop != null) for (let r = (spec.rotTop + 2) % 4; r > 0; r--) { const t = u; u = v; v = 1 - t; } // bed: pillow at the head end
          }
          let px = lx, py = ly, pz = lz;
          if (wall) { // lean against the wall: move base to the wall, tilt the top away from it
            py += 0.22;
            px += -wall[0] * 0.32 + wall[0] * ly * 0.42;
            pz += -wall[1] * 0.32 + wall[1] * ly * 0.42;
          }
          const sh = emit ? 1 : F.shade;
          buf.vert(wx + px, y + py, wz + pz, uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v, S0 * sh, G0 * sh);
        }
        buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }

  VC.Mesher = { buildChunk };
})();
