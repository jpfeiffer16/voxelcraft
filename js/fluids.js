// Simple, tick-limited fluid simulation for water and lava.
// Sources (level 8) spread down (falling = level 7) and sideways when resting on something solid,
// losing `step` levels per block (water 2 -> 3 blocks, lava 3 -> 2 blocks). Flowing fluid that loses its
// supply drains away. Water meeting lava makes obsidian (lava source) or cobblestone (flowing lava).
window.VC = window.VC || {};
(function () {
  'use strict';
  const B = VC.B, { SOLID, FLUID, LEVEL, RENDER, defs } = VC.Blocks;
  const KIND = { 1: { src: B.WATER, flow: B.WATER_FLOW, step: 2, tick: 0.25 }, 2: { src: B.LAVA, flow: B.LAVA_FLOW, step: 3, tick: 0.9 } };
  const idFor = (kind, level) => level >= 8 ? KIND[kind].src : KIND[kind].flow + level - 1;
  const N6 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
  const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // can fluid flow into this cell? (air, plants, torches; not doors/beds/solid blocks)
  const open = (id) => id === 0 || (id > 0 && !SOLID[id] && !FLUID[id] && (RENDER[id] === 4 || defs[id].wall || id === B.TORCH));

  class Fluids {
    constructor(world, opts) {
      this.world = world;
      this.maxPerTick = (opts && opts.maxPerTick) || 96;
      this.queues = { 1: new Map(), 2: new Map() }; // key -> [x,y,z]
      this.timers = { 1: 0, 2: 0 };
      this.updates = 0; this.changed = 0;
      this.busy = false; // true while we write blocks ourselves
      this.onChange = null; // (x, y, z) => void
      world.onSetBlock = (x, y, z, id, old) => this.onSet(x, y, z, id, old);
    }
    get pending() { return this.queues[1].size + this.queues[2].size; }
    queue(x, y, z) {
      const id = this.world.getBlock(x, y, z);
      if (id <= 0) return;
      const k = FLUID[id]; if (!k) return;
      this.queues[k].set(x + ',' + y + ',' + z, [x, y, z]);
    }
    // any edit next to a fluid wakes the fluid up
    onSet(x, y, z, id, old) {
      if (FLUID[id] || FLUID[old] || true) {
        this.queue(x, y, z);
        for (const [dx, dy, dz] of N6) this.queue(x + dx, y + dy, z + dz);
      }
    }
    set(x, y, z, id) {
      const w = this.world;
      w.setBlock(x, y, z, id, true);
      w.markRegionDirty(x, z, x, z, x, z);
      this.changed++;
      if (this.onChange) this.onChange(x, y, z, id);
    }
    update(dt) {
      for (const kind of [1, 2]) {
        this.timers[kind] -= dt;
        if (this.timers[kind] > 0) continue;
        this.timers[kind] = KIND[kind].tick;
        const q = this.queues[kind]; if (!q.size) continue;
        // process a bounded batch; new work goes to the next tick
        const batch = []; let n = 0;
        for (const [k, v] of q) { batch.push(v); q.delete(k); if (++n >= this.maxPerTick) break; }
        for (const [x, y, z] of batch) this.step(kind, x, y, z);
      }
    }
    step(kind, x, y, z) {
      const w = this.world, id = w.getBlock(x, y, z);
      if (id <= 0 || FLUID[id] !== kind) return;
      this.updates++;
      const K = KIND[kind];
      let level = LEVEL[id];
      // ---- water + lava contact
      for (const [dx, dy, dz] of N6) {
        const nx = x + dx, ny = y + dy, nz = z + dz, nid = w.getBlock(nx, ny, nz);
        if (nid <= 0) continue;
        const nk = FLUID[nid];
        if (!nk || nk === kind) continue;
        if (kind === 2) { this.set(x, y, z, level >= 8 ? B.OBSIDIAN : B.COBBLE); return; }       // this lava gets cooled
        else { this.set(nx, ny, nz, LEVEL[nid] >= 8 ? B.OBSIDIAN : B.COBBLE); }                   // water cools neighbour lava
      }
      // ---- flowing cells: recompute supported level, drain if unsupported
      if (level < 8) {
        const above = w.getBlock(x, y + 1, z);
        let want = 0;
        if (above > 0 && FLUID[above] === kind) want = 7;
        for (const [dx, dz] of H4) {
          const nid = w.getBlock(x + dx, y, z + dz);
          if (nid > 0 && FLUID[nid] === kind) {
            // a neighbour only feeds sideways if it rests on something (not falling into air)
            const below = w.getBlock(x + dx, y - 1, z + dz);
            const resting = !(below === 0 || open(below)) || LEVEL[nid] >= 8;
            if (resting) want = Math.max(want, LEVEL[nid] >= 8 ? 8 - K.step : LEVEL[nid] - K.step);
          }
        }
        if (want !== level) {
          if (want <= 0) { this.set(x, y, z, B.AIR); return; }
          this.set(x, y, z, idFor(kind, Math.min(7, want)));
          level = Math.min(7, want);
        }
      }
      // ---- spread down
      const below = w.getBlock(x, y - 1, z);
      if (below !== -1 && y > 0 && open(below)) { this.set(x, y - 1, z, idFor(kind, 7)); return; }
      if (below > 0 && FLUID[below] === kind) { if (LEVEL[below] < 7) this.set(x, y - 1, z, idFor(kind, 7)); return; }
      // ---- spread sideways (only when resting on something)
      const out = level >= 8 ? 8 - K.step : level - K.step;
      if (out <= 0) return;
      for (const [dx, dz] of H4) {
        const nx = x + dx, nz = z + dz, nid = w.getBlock(nx, y, nz);
        if (nid === -1) continue;
        if (open(nid)) this.set(nx, y, nz, idFor(kind, out));
        else if (FLUID[nid] === kind && LEVEL[nid] < out) this.set(nx, y, nz, idFor(kind, out));
        else if (FLUID[nid] && FLUID[nid] !== kind) this.queue(nx, y, nz);
      }
    }
    clear() { this.queues[1].clear(); this.queues[2].clear(); }
  }
  VC.Fluids = Fluids;
})();
