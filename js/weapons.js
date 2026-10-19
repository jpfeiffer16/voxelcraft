// First-person held item (extruded pixel-art items, textured mini blocks, an arm), swing / draw / eat animations,
// and projectiles: arrows (gravity, stick in blocks) and a thrown trident that flies back to you.
window.VC = window.VC || {};
(function () {
  'use strict';
  const BL = VC.Blocks, defs = BL.defs, SOLID = BL.SOLID, FLUID = BL.FLUID;

  // ---------- geometry helpers ----------
  // A 16x16 RGBA tile -> 3D "extruded" geometry (one thin box per opaque pixel, hidden faces skipped)
  function extrude(img, px) {
    const pos = [], col = [], S = 16, D = img.data;
    const op = (x, y) => x >= 0 && y >= 0 && x < S && y < S && D[(y * S + x) * 4 + 3] > 100;
    const quad = (v, c, s) => { for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(v[k][0], v[k][1], v[k][2]); col.push(c[0] * s, c[1] * s, c[2] * s); } };
    const d = px / 2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!op(x, y)) continue;
      const i = (y * S + x) * 4, c = [D[i] / 255, D[i + 1] / 255, D[i + 2] / 255];
      const x0 = (x - 8) * px, x1 = x0 + px, y1 = (8 - y) * px, y0 = y1 - px;
      quad([[x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d]], c, 1);
      quad([[x1, y0, -d], [x0, y0, -d], [x0, y1, -d], [x1, y1, -d]], c, 0.72);
      if (!op(x, y - 1)) quad([[x0, y1, d], [x1, y1, d], [x1, y1, -d], [x0, y1, -d]], c, 0.92);
      if (!op(x, y + 1)) quad([[x0, y0, -d], [x1, y0, -d], [x1, y0, d], [x0, y0, d]], c, 0.55);
      if (!op(x - 1, y)) quad([[x0, y0, -d], [x0, y0, d], [x0, y1, d], [x0, y1, -d]], c, 0.8);
      if (!op(x + 1, y)) quad([[x1, y0, d], [x1, y0, -d], [x1, y1, -d], [x1, y1, d]], c, 0.8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function colorBox(w, h, d, color, shade) {
    const g = new THREE.BoxGeometry(w, h, d), c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    const FS = shade || [0.8, 0.8, 1, 0.55, 0.92, 0.7];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = (f * 4 + v) * 3; col[i] = c.r * FS[f]; col[i + 1] = c.g * FS[f]; col[i + 2] = c.b * FS[f]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  }
  // textured cube for a block (faces +x,-x,+y,-y,+z,-z map to side,side,top,bottom,side,side)
  function blockGeo(id) {
    const d = defs[id], g = new THREE.BoxGeometry(1, 1, 1), uv = g.attributes.uv, tiles = [d.side, d.side, d.top, d.bottom, d.side, d.side];
    const FS = [0.8, 0.8, 1, 0.55, 0.92, 0.7], col = new Float32Array(24 * 3);
    for (let f = 0; f < 6; f++) {
      const [u0, v0, u1, v1] = VC.Textures.tileUV(tiles[f]);
      for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = FS[f]; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  // ---------- held item ----------
  class Held {
    constructor(atlas, tex) {
      this.atlas = atlas;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
      this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.blockMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
      this.root = new THREE.Group(); this.scene.add(this.root);   // bob / sway
      this.hand = new THREE.Group(); this.root.add(this.hand);    // swing / draw
      this.arm = new THREE.Mesh(colorBox(0.2, 0.2, 0.72, 0xd8a47e), this.mat); this.hand.add(this.arm);
      this.item = new THREE.Group(); this.hand.add(this.item);
      this.cache = new Map(); this.id = -1; this.kind = '';
      this.swingT = 0; this.equip = 0; this.charge = 0; this.eatT = 0; this.hidden = false; this.t = 0; this.mobile = false;
      window.addEventListener('resize', () => { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); });
    }
    meshFor(id, variant) {
      const key = id + ':' + (variant || '');
      let m = this.cache.get(key); if (m) return m;
      const d = defs[id];
      if (d.render === 'opaque' || d.render === 'cutout' || d.render === 'glass' || (d.render === 'model' && d.shape === 'door')) {
        m = new THREE.Mesh(blockGeo(id), this.blockMat); m.userData.kind = 'block';
      } else {
        const tile = variant === 'pull' ? VC.T.bow_pull : d.side;
        m = new THREE.Mesh(extrude(this.atlas.tiles[tile], 1 / 16), this.mat);
        m.userData.kind = d.weapon ? d.weapon.kind : d.food ? 'food' : 'item';
      }
      this.cache.set(key, m); return m;
    }
    set(id) {
      const pulled = this.charge > 0.25 && defs[id] && defs[id].weapon && defs[id].weapon.kind === 'bow';
      const key = id + (pulled ? 'p' : '');
      if (key === this.key) return;
      if (id !== this.id) this.equip = 1;
      this.id = id; this.key = key;
      while (this.item.children.length) this.item.remove(this.item.children[0]);
      const m = this.meshFor(id, pulled ? 'pull' : ''); this.item.add(m); this.kind = m.userData.kind;
      // pose each kind of item in the hand
      const it = this.item; it.position.set(0, 0, 0); it.rotation.set(0, 0, 0); it.scale.setScalar(1);
      if (this.kind === 'block') { it.scale.setScalar(0.22); it.position.set(0.05, 0.06, -0.26); it.rotation.set(0.12, 0.75, 0); }
      else if (this.kind === 'sword' || this.kind === 'axe') { it.scale.setScalar(0.55); it.position.set(0.02, 0.2, -0.3); it.rotation.order = 'YXZ'; it.rotation.set(-0.1, 0.8, 0.3); }
      else if (this.kind === 'trident') { it.scale.setScalar(0.8); it.position.set(0.0, 0.22, -0.32); it.rotation.order = 'YXZ'; it.rotation.set(-0.1, 0.85, 0.25); }
      else if (this.kind === 'bow') { it.scale.setScalar(0.55); it.position.set(-0.02, 0.15, -0.36); it.rotation.order = 'YXZ'; it.rotation.set(0.05, Math.PI / 2 + 0.55, 0); }
      else { it.scale.setScalar(0.34); it.position.set(0.02, 0.14, -0.3); it.rotation.set(0, 0.35, 0); }
    }
    swing() { this.swingT = 1; }
    update(dt, o) {
      this.t += dt;
      this.root.visible = !this.hidden;
      if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt / 0.28);
      if (this.equip > 0) this.equip = Math.max(0, this.equip - dt / 0.25);
      if (this.eatT > 0) this.eatT = Math.max(0, this.eatT - dt);
      const mob = o.mobile ? 1 : 0;
      // resting position: lower right of the view (a little smaller and further right on phones, clear of the buttons)
      const bx = 0.36 + mob * 0.1, by = -0.36 - mob * 0.02, bz = -0.58;
      const bob = o.bob || 0, sway = Math.sin(bob) * 0.012 * (o.moving ? 1 : 0), bobY = Math.abs(Math.cos(bob)) * 0.014 * (o.moving ? 1 : 0);
      const R = this.root; R.position.set(bx + sway, by - bobY - this.equip * 0.35, bz); R.rotation.set(0, 0, 0);
      const H = this.hand; H.position.set(0, 0, 0); H.rotation.set(0, 0, 0);
      this.arm.position.set(0.06, -0.06, 0.18); this.arm.rotation.set(-0.3, 0.12, 0); this.arm.visible = true;
      const p = 1 - this.swingT, s = this.swingT > 0 ? Math.sin(p * Math.PI) : 0, s2 = this.swingT > 0 ? Math.sin(Math.sqrt(p) * Math.PI) : 0;
      if (this.kind === 'bow' || (this.kind === 'trident' && this.charge > 0)) {
        const c = this.charge;
        if (this.kind === 'bow') { H.position.set(-0.14 * Math.min(1, c * 3), 0.08 * Math.min(1, c * 3), 0.05 * c); H.rotation.set(0, 0.25 * Math.min(1, c * 3), -0.1 * c); }
        else { H.position.set(0.05, 0.12 * c, 0.25 * c); H.rotation.set(-0.5 * c, 0, 0); }
        if (c >= 1) { H.position.x += Math.sin(this.t * 50) * 0.004; H.position.y += Math.cos(this.t * 43) * 0.004; }
        if (this.kind === 'bow') this.arm.visible = c < 0.2;
      }
      if (this.swingT > 0) { // chop: forward and down-left, then back
        H.position.x -= s * 0.22; H.position.y += s2 * 0.08 - s * 0.12; H.position.z -= s * 0.2;
        H.rotation.x -= s * 0.95; H.rotation.y += s * 0.55; H.rotation.z += s * 0.35;
      }
      if (this.eatT > 0) { // bring food up to the mouth and nibble
        const e = Math.min(1, (1.05 - this.eatT) * 6, this.eatT * 6);
        H.position.x -= 0.28 * e; H.position.y += 0.14 * e + Math.abs(Math.sin(this.t * 18)) * 0.03 * e; H.rotation.y -= 0.5 * e; H.rotation.x += 0.25 * e;
      }
      if (o.bright != null) { this.mat.color.setScalar(o.bright); this.blockMat.color.setScalar(o.bright); }
    }
    render(renderer) {
      if (this.hidden) return;
      const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth();
      renderer.render(this.scene, this.camera); renderer.autoClear = ac;
    }
  }

  // ---------- projectiles ----------
  function arrowModel(mat) {
    const g = new THREE.Group();
    const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); };
    add(colorBox(0.035, 0.035, 0.62, 0x9a7044), 0, 0, 0);
    add(colorBox(0.07, 0.07, 0.1, 0xb8b8c0), 0, 0, 0.33);
    add(colorBox(0.11, 0.01, 0.13, 0xf2f2f2), 0, 0, -0.27); add(colorBox(0.01, 0.11, 0.13, 0xf2f2f2), 0, 0, -0.27);
    return g;
  }
  function tridentModel(mat) {
    const g = new THREE.Group();
    const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); };
    add(colorBox(0.05, 0.05, 1.2, 0x2f9a94), 0, 0, -0.1);
    add(colorBox(0.3, 0.05, 0.05, 0x4cc8bc), 0, 0, 0.5);
    add(colorBox(0.05, 0.05, 0.28, 0x8ff0e4), 0, 0, 0.66); add(colorBox(0.05, 0.05, 0.2, 0x5ad8cc), 0.13, 0, 0.6); add(colorBox(0.05, 0.05, 0.2, 0x5ad8cc), -0.13, 0, 0.6);
    return g;
  }
  class Projectiles {
    constructor(scene, world, opts = {}) {
      this.scene = scene; this.world = world; this.list = [];
      this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.max = opts.max || 40;
      this.onHitMob = null;   // (mob, projectile) => bool (true = it hit)
      this.onBlock = null;    // (projectile) => void
      this.onReturn = null;   // (projectile) => void (trident is back)
      this.mobs = null; this.player = null; this.daylight = 1;
    }
    get flying() { let n = 0; for (const p of this.list) if (!p.stuck) n++; return n; }
    get stuck() { let n = 0; for (const p of this.list) if (p.stuck) n++; return n; }
    tridentOut() { return this.list.some(p => p.kind === 'trident'); }
    shoot(kind, origin, dir, power) {
      // keep the arrow count bounded: drop the oldest stuck arrows first
      while (this.list.length >= this.max) { const i = this.list.findIndex(p => p.stuck); this.removeAt(i >= 0 ? i : 0); }
      const model = kind === 'trident' ? tridentModel(this.mat) : arrowModel(this.mat);
      const speed = kind === 'trident' ? 14 + 20 * power : 12 + 34 * power;
      const p = { kind, power, model, pos: origin.clone(), vel: dir.clone().normalize().multiplyScalar(speed), age: 0, stuck: false, stuckT: 0, returning: false, hitOnce: new Set() };
      model.position.copy(p.pos); this.orient(p); this.scene.add(model); this.list.push(p);
      return p;
    }
    orient(p) { if (p.vel.lengthSq() > 1e-6) { const t = p.pos.clone().add(p.vel); p.model.lookAt(t); } }
    removeAt(i) { const p = this.list[i]; if (!p) return; this.scene.remove(p.model); this.list.splice(i, 1); }
    clear() { while (this.list.length) this.removeAt(0); }
    solidAt(x, y, z) {
      const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === -1) return true; if (id <= 0 || !SOLID[id]) return false;
      if (!defs[id].shape) return true;
      return !!BL.aabbHit(this.world, x - 0.02, y - 0.02, z - 0.02, x + 0.02, y + 0.02, z + 0.02);
    }
    // segment vs mob boxes; returns the nearest mob hit along a->b
    mobOnSegment(a, b, p) {
      const M = this.mobs; if (!M) return null;
      let best = null, bt = 1;
      const d = b.clone().sub(a);
      for (const m of M.list) {
        if (m.dead || m.rider || !m.model.root.visible || m.tamed || p.hitOnce.has(m)) continue;
        const mn = [m.pos.x - m.hw - 0.08, m.pos.y - 0.05, m.pos.z - m.hw - 0.08], mx = [m.pos.x + m.hw + 0.08, m.pos.y + m.h + 0.05, m.pos.z + m.hw + 0.08];
        let t0 = 0, t1 = 1, ok = true;
        for (let k = 0; k < 3 && ok; k++) {
          const o = a.getComponent(k), dd = d.getComponent(k);
          if (Math.abs(dd) < 1e-9) { if (o < mn[k] || o > mx[k]) ok = false; continue; }
          let ta = (mn[k] - o) / dd, tb = (mx[k] - o) / dd; if (ta > tb) { const s = ta; ta = tb; tb = s; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
        }
        if (ok && t0 < bt) { bt = t0; best = m; }
      }
      return best;
    }
    update(dt, player) {
      this.player = player;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i]; p.age += dt;
        if (p.returning) { // trident flies back to the player's hand
          const tgt = player.pos.clone(); tgt.y += player.eye - 0.3;
          const to = tgt.sub(p.pos), d = to.length();
          if (d < 0.8 || p.age > 12) { this.removeAt(i); if (this.onReturn) this.onReturn(p); continue; }
          p.vel.copy(to.multiplyScalar(Math.min(24, 8 + p.age * 6) / d));
          p.pos.addScaledVector(p.vel, dt); p.model.position.copy(p.pos); this.orient(p);
          continue;
        }
        if (p.stuck) {
          p.stuckT += dt;
          // the block it stuck in was removed: fall
          if (!this.solidAt(p.tip.x, p.tip.y, p.tip.z)) { p.stuck = false; p.vel.set(0, -1, 0); }
          else if (p.stuckT > 40) { this.removeAt(i); continue; }
          else continue;
        }
        if (p.age > 30 || p.pos.y < -10) { this.removeAt(i); continue; }
        const inWater = FLUID[Math.max(0, this.world.getBlock(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z)))] === 1;
        const g = p.kind === 'trident' ? (inWater ? 4 : 14) : (inWater ? 5 : 16);
        p.vel.y -= g * dt;
        if (inWater) p.vel.multiplyScalar(Math.pow(p.kind === 'trident' ? 0.7 : 0.15, dt));
        const sp = p.vel.length(), n = Math.max(1, Math.ceil(sp * dt / 0.2)), step = p.vel.clone().multiplyScalar(dt / n);
        let done = false;
        for (let k = 0; k < n && !done; k++) {
          const a = p.pos.clone(), b = a.clone().add(step);
          const m = this.mobOnSegment(a, b, p);
          if (m) {
            p.hitOnce.add(m);
            const hit = this.onHitMob ? this.onHitMob(m, p) : true;
            if (hit) {
              if (p.kind === 'trident') { p.returning = true; p.age = 0; p.pos.copy(b); }
              else { this.removeAt(i); }
              done = true; break;
            }
          }
          const tip = b.clone().addScaledVector(step.clone().normalize(), p.kind === 'trident' ? 0.6 : 0.3);
          if (this.solidAt(tip.x, tip.y, tip.z)) {
            // stick: back up until the tip is just inside the block
            p.pos.copy(a); p.stuck = true; p.stuckT = 0; p.tip = tip; p.model.position.copy(p.pos);
            if (this.onBlock) this.onBlock(p);
            if (p.kind === 'trident') { p.stuck = false; p.returning = true; p.age = -0.5; p.vel.set(0, 0, 0); }
            done = true; break;
          }
          p.pos.copy(b);
        }
        if (done) continue;
        p.model.position.copy(p.pos); this.orient(p);
      }
      // light the projectiles like the world (roughly)
      this.mat.color.setScalar(Math.max(0.25, this.daylight));
    }
    dispose() { this.clear(); }
  }
  VC.Weapons = { Held, Projectiles, extrude };
})();
