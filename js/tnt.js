// TNT: primed (falling, flashing) entities, explosions that carve noisy spherical craters,
// chain reactions, batched remeshing, and flash / smoke / spark particles.
window.VC = window.VC || {};
(function () {
  'use strict';
  const B = VC.B, { SOLID, RENDER, defs } = VC.Blocks;

  function spriteTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 32; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t; }
  const smokeTex = spriteTex((g) => { g.fillStyle = '#9a9a9a'; g.fillRect(6, 6, 20, 20); g.fillStyle = '#c4c4c4'; g.fillRect(10, 8, 12, 10); g.fillStyle = '#7a7a7a'; g.fillRect(8, 20, 8, 6); });
  const sparkTex = spriteTex((g) => { g.fillStyle = '#ffd040'; g.fillRect(10, 10, 12, 12); g.fillStyle = '#fff6c0'; g.fillRect(13, 13, 6, 6); });
  const flashTex = spriteTex((g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,230,1)'); r.addColorStop(0.35, 'rgba(255,210,120,0.9)'); r.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });

  function tntGeometry() {
    const g = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const uv = g.attributes.uv, T = defs[B.TNT]; // faces: +x -x +y -y +z -z
    const tiles = [T.side, T.side, T.top, T.bottom, T.side, T.side];
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = VC.Textures.tileUV(tiles[f]);
      for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); }
    }
    g.translate(0, 0.49, 0);
    return g;
  }

  class Explosives {
    constructor(scene, world, texture, opts) {
      this.scene = scene; this.world = world;
      this.maxPrimed = opts.maxPrimed || 20; this.perFrame = opts.perFrame || 2; this.maxParticles = opts.maxParticles || 220;
      this.primed = []; this.queue = []; this.particles = [];
      this.geo = tntGeometry();
      this.texture = texture;
      this.daylight = 1; this.sound = true; this.listener = null;
      this.onExplode = null;     // (center Vector3, radius) => void   (damage, knockback, shake)
      this.onBlocksChanged = null;
      this.exploded = 0;
    }
    get count() { return this.primed.length; }
    // Replace a TNT block with a primed entity
    ignite(x, y, z, fuse, batched) {
      if (this.primed.length >= this.maxPrimed) return false;
      if (this.world.getBlock(x, y, z) === B.TNT) this.world.setBlock(x, y, z, B.AIR, true);
      const mat = new THREE.MeshBasicMaterial({ map: this.texture });
      const mesh = new THREE.Mesh(this.geo, mat);
      const e = { mesh, mat, pos: new THREE.Vector3(x + 0.5, y, z + 0.5), vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, fuse == null ? 2.5 : 1.5, (Math.random() - 0.5) * 0.6), fuse: fuse == null ? 4 : fuse, t: 0 };
      mesh.position.copy(e.pos); this.scene.add(mesh); this.primed.push(e);
      if (!batched) this.world.markRegionDirty(x, z, x, z, x, z); // chained ignitions are remeshed with the crater
      if (this.sound && VC.Sound && fuse == null) VC.Sound.play('fuse', this.vol(e.pos, 0.6));
      return true;
    }
    vol(p, base) { const l = this.listener; if (!l) return base; const d = l.distanceTo(p); return base * Math.max(0, 1 - d / 64); }
    solid(x, y, z) { const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id === -1 || SOLID[id] === 1; }
    update(dt) {
      for (let i = this.primed.length - 1; i >= 0; i--) {
        const e = this.primed[i];
        e.t += dt; e.fuse -= dt;
        // gravity + simple collision against blocks below / sideways
        e.vel.y = Math.max(e.vel.y - 25 * dt, -30);
        const ny = e.pos.y + e.vel.y * dt;
        if (e.vel.y < 0 && (this.solid(e.pos.x - 0.45, ny, e.pos.z - 0.45) || this.solid(e.pos.x + 0.45, ny, e.pos.z - 0.45) || this.solid(e.pos.x - 0.45, ny, e.pos.z + 0.45) || this.solid(e.pos.x + 0.45, ny, e.pos.z + 0.45))) { e.pos.y = Math.floor(ny) + 1; e.vel.y = 0; e.vel.x *= 0.7; e.vel.z *= 0.7; }
        else if (e.vel.y > 0 && this.solid(e.pos.x, ny + 0.98, e.pos.z)) e.vel.y = 0;
        else e.pos.y = ny;
        const nx = e.pos.x + e.vel.x * dt; if (!this.solid(nx + Math.sign(e.vel.x) * 0.49, e.pos.y + 0.5, e.pos.z)) e.pos.x = nx; else e.vel.x = 0;
        const nz = e.pos.z + e.vel.z * dt; if (!this.solid(e.pos.x, e.pos.y + 0.5, nz + Math.sign(e.vel.z) * 0.49)) e.pos.z = nz; else e.vel.z = 0;
        if (e.pos.y < -10) e.fuse = 0;
        e.mesh.position.copy(e.pos);
        // flash white, faster as the fuse runs out; swell just before detonation
        const rate = e.fuse < 1 ? 10 : 4, on = Math.floor(e.t * rate) % 2 === 0;
        const L = Math.max(0.25, this.daylight);
        e.mat.color.setScalar(on ? 2.4 : L);
        const sw = e.fuse < 0.3 ? 1 + (0.3 - e.fuse) * 0.6 : 1; e.mesh.scale.setScalar(sw);
        if (e.fuse <= 0) { this.scene.remove(e.mesh); e.mat.dispose(); this.primed.splice(i, 1); this.queue.push(e.pos.clone()); }
      }
      // limit explosions per frame to keep frame time bounded (mobile)
      for (let n = 0; n < this.perFrame && this.queue.length; n++) this.explode(this.queue.shift());
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.t += dt;
        p.s.position.addScaledVector(p.v, dt); p.v.y += p.g * dt; p.v.multiplyScalar(Math.pow(p.drag, dt));
        const k = p.t / p.life;
        p.s.material.opacity = Math.max(0, (p.fade0 || 1) * (1 - k));
        if (p.grow) p.s.scale.setScalar(p.size * (1 + k * p.grow));
        if (p.t >= p.life) { this.scene.remove(p.s); p.s.material.dispose(); this.particles.splice(i, 1); }
      }
    }
    explode(c) {
      const w = this.world, cx = Math.floor(c.x), cy = Math.floor(c.y + 0.5), cz = Math.floor(c.z);
      const r = 3.6 + Math.random() * 1.2, R = Math.ceil(r + 1);
      const inWater = VC.Blocks.FLUID[Math.max(0, w.getBlock(cx, cy, cz))] === 1 || VC.Blocks.FLUID[Math.max(0, w.getBlock(cx, cy + 1, cz))] === 1;
      this.exploded++;
      let changed = 0;
      if (!inWater) {
        const seed = Math.random() * 1000;
        for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (y < 1 || y >= VC.CONST.CH) continue;
          const d = Math.sqrt(dx * dx + dy * dy * 1.15 + dz * dz);
          if (d > r + 1.5) continue;
          const id = w.getBlock(x, y, z);
          if (id === B.TNT) { this.ignite(x, y, z, 0.4 + Math.random() * 0.8, true); continue; } // chain reaction (reliable, ignores the ragged edge)
          const lim = r * (0.78 + 0.32 * VC.Noise.hash3(x, y, z, seed | 0)); // ragged crater edge
          if (d > lim) continue;
          if (id <= 0 || id === B.BEDROCK || VC.Blocks.FLUID[id]) continue;
          if ((id === B.OBSIDIAN) && d > 1.2) continue; // blast resistant
          w.setBlock(x, y, z, B.AIR, true); changed++;
        }
        // drop plants / torches that lost their support
        for (let dy = -R - 1; dy <= R + 1; dy++) for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
          const x = cx + dx, y = cy + dy, z = cz + dz, id = w.getBlock(x, y, z);
          if (id <= 0) continue;
          const d = defs[id];
          if (RENDER[id] === 4 || id === B.TORCH) { const below = w.getBlock(x, y - 1, z); if (below === 0 || !SOLID[below]) { w.setBlock(x, y, z, B.AIR, true); changed++; } }
          else if (d && d.wall) { const s = w.getBlock(x - d.wall[0], y, z - d.wall[1]); if (s === 0 || !SOLID[s]) { w.setBlock(x, y, z, B.AIR, true); changed++; } }
          else if (VC.Blocks.FLUID[id]) { /* fluids stay */ }
        }
        if (changed || this.primed.length) w.markRegionDirty(cx - R - 1, cz - R - 1, cx + R + 1, cz + R + 1, cx, cz);
      }
      this.effects(c, r);
      if (this.onExplode) this.onExplode(new THREE.Vector3(c.x, c.y + 0.5, c.z), r, inWater);
      if (changed && this.onBlocksChanged) this.onBlocksChanged();
    }
    sprite(tex, pos, size, opts) {
      if (this.particles.length >= this.maxParticles) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending, color: opts.color || 0xffffff }));
      s.position.copy(pos); s.scale.setScalar(size);
      this.scene.add(s);
      this.particles.push({ s, v: opts.v || new THREE.Vector3(), g: opts.g || 0, drag: opts.drag || 1, t: 0, life: opts.life || 1, size, grow: opts.grow || 0, fade0: opts.fade0 || 1 });
    }
    effects(c, r) {
      const mob = this.maxParticles < 200;
      const p = new THREE.Vector3(c.x, c.y + 0.5, c.z);
      this.sprite(flashTex, p, r * 3.2, { life: 0.35, grow: 0.8, add: true });
      this.sprite(flashTex, p, r * 1.5, { life: 0.6, grow: 1.2, add: true, color: 0xffa040 });
      const busy = this.particles.length > this.maxParticles * 0.5; // chain reactions: fewer particles each
      const nSmoke = (mob ? 8 : 16) >> (busy ? 1 : 0), nSpark = (mob ? 8 : 16) >> (busy ? 1 : 0);
      for (let i = 0; i < nSmoke; i++) {
        const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
        const q = p.clone().addScaledVector(d, Math.random() * r * 0.7);
        this.sprite(smokeTex, q, 0.9 + Math.random() * 0.9, { v: d.multiplyScalar(2 + Math.random() * 4), g: 1.2, drag: 0.25, life: 1.2 + Math.random() * 1.4, grow: 1.6, fade0: 0.85, color: new THREE.Color().setScalar(0.45 + Math.random() * 0.4) });
      }
      for (let i = 0; i < nSpark; i++) {
        const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
        this.sprite(sparkTex, p.clone(), 0.18 + Math.random() * 0.15, { v: d.multiplyScalar(6 + Math.random() * 9), g: -18, drag: 0.5, life: 0.5 + Math.random() * 0.7, add: true });
      }
      if (this.sound && VC.Sound) VC.Sound.play('boom', this.vol(p, 1));
    }
    dispose() {
      for (const e of this.primed) { this.scene.remove(e.mesh); e.mat.dispose(); }
      for (const p of this.particles) { this.scene.remove(p.s); p.s.material.dispose(); }
      this.primed = []; this.particles = []; this.queue = [];
    }
  }
  VC.Explosives = Explosives;
})();
