// Dogs & cats: blocky box models, simple wander/follow AI, physics, taming, sounds, saving.
window.VC = window.VC || {};
(function () {
  'use strict';
  const B = VC.B, { SOLID } = VC.Blocks;
  const CS = VC.CONST.CS;

  const COATS = {
    dog: [
      { name: 'White', body: 0xe8e4dc, ear: 0xd6cfc2 },
      { name: 'Brown', body: 0x8a5a33, ear: 0x6b4426 },
      { name: 'Black', body: 0x2c2724, ear: 0x1d1a18 },
      { name: 'Golden', body: 0xd9a24e, ear: 0xb98234 },
      { name: 'Gray', body: 0x8c8c8c, ear: 0x6d6d6d },
      { name: 'Spotted', body: 0xece6da, ear: 0x6b4426, spots: 0x6b4426 },
    ],
    cat: [
      { name: 'Orange tabby', body: 0xe08a3c, ear: 0xc06a26, stripes: 0xb0601e },
      { name: 'Black', body: 0x24222a, ear: 0x18171c },
      { name: 'White', body: 0xf0eeea, ear: 0xe6c8c8 },
      { name: 'Gray tabby', body: 0x8a8a8f, ear: 0x6d6d72, stripes: 0x5f5f66 },
      { name: 'Siamese', body: 0xe9dcc0, ear: 0x4a3a2e, points: 0x4a3a2e },
      { name: 'Calico', body: 0xf2efe8, ear: 0xd88a3c, spots: 0xd88a3c, spots2: 0x2a2624 },
    ],
  };
  const DIMS = { dog: { hw: 0.3, h: 0.85, speed: 1.6, run: 4.6 }, cat: { hw: 0.25, h: 0.7, speed: 1.4, run: 4.8 } };
  const FACE_SHADE = [0.8, 0.8, 1.0, 0.5, 0.7, 0.7];

  // Box geometry with baked per-face shading and colour
  const geoCache = new Map();
  function box(w, h, d, color, pivotTop) {
    const key = [w, h, d, color, pivotTop].join(',');
    let g = geoCache.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(w, h, d);
      if (pivotTop) g.translate(0, -h / 2, 0);
      const c = new THREE.Color(color), col = new Float32Array(24 * 3);
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = (f * 4 + v) * 3, s = FACE_SHADE[f]; col[i] = c.r * s; col[i + 1] = c.g * s; col[i + 2] = c.b * s; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geoCache.set(key, g);
    }
    return g;
  }

  function buildModel(type, coat) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const root = new THREE.Group(), torso = new THREE.Group();
    root.add(torso);
    const add = (parent, geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    const parts = { legs: [] };
    const C = coat;
    if (type === 'dog') {
      add(torso, box(0.36, 0.34, 0.72, C.body), 0, 0.55, 0);
      if (C.spots) { add(torso, box(0.37, 0.2, 0.22, C.spots), 0, 0.6, 0.1); add(torso, box(0.2, 0.35, 0.2, C.spots), 0.05, 0.56, -0.2); }
      const head = parts.head = new THREE.Group(); head.position.set(0, 0.72, 0.42); root.add(head);
      add(head, box(0.36, 0.32, 0.3, C.body), 0, 0, 0);
      add(head, box(0.2, 0.15, 0.16, C.spots ? 0xece6da : C.body), 0, -0.06, 0.22);
      add(head, box(0.07, 0.07, 0.04, 0x161210), 0, -0.02, 0.3);              // nose
      add(head, box(0.06, 0.06, 0.02, 0x111111), 0.09, 0.05, 0.155);            // eyes
      add(head, box(0.06, 0.06, 0.02, 0x111111), -0.09, 0.05, 0.155);
      add(head, box(0.08, 0.16, 0.08, C.ear), 0.15, 0.1, -0.02);                // ears (floppy)
      add(head, box(0.08, 0.16, 0.08, C.ear), -0.15, 0.1, -0.02);
      parts.collar = add(root, box(0.38, 0.07, 0.1, 0xd02828), 0, 0.68, 0.3);
      for (const [x, z] of [[0.11, 0.24], [-0.11, 0.24], [0.11, -0.24], [-0.11, -0.24]]) { const l = add(root, box(0.12, 0.4, 0.12, C.body, true), x, 0.4, z); parts.legs.push(l); }
      parts.tail = add(root, box(0.08, 0.08, 0.34, C.ear, false), 0, 0.66, -0.48);
      parts.tail.geometry = box(0.08, 0.08, 0.34, C.ear); parts.tail.geometry = parts.tail.geometry.clone().translate(0, 0, -0.17);
      parts.tail.position.set(0, 0.64, -0.34); parts.tail.rotation.x = 0.6;
    } else {
      add(torso, box(0.28, 0.26, 0.62, C.body), 0, 0.4, 0);
      if (C.stripes) for (const z of [-0.18, 0, 0.18]) add(torso, box(0.29, 0.06, 0.06, C.stripes), 0, 0.5, z);
      if (C.spots) { add(torso, box(0.29, 0.14, 0.18, C.spots), 0, 0.45, 0.12); add(torso, box(0.29, 0.12, 0.16, C.spots2), 0, 0.43, -0.16); }
      const head = parts.head = new THREE.Group(); head.position.set(0, 0.56, 0.36); root.add(head);
      add(head, box(0.3, 0.26, 0.26, C.body), 0, 0, 0);
      if (C.points) add(head, box(0.18, 0.14, 0.03, C.points), 0, -0.03, 0.13);
      add(head, box(0.05, 0.05, 0.02, 0x2a9a3a), 0.075, 0.03, 0.135);           // green eyes
      add(head, box(0.05, 0.05, 0.02, 0x2a9a3a), -0.075, 0.03, 0.135);
      add(head, box(0.05, 0.04, 0.02, 0xe88aa0), 0, -0.04, 0.135);             // pink nose
      add(head, box(0.07, 0.09, 0.05, C.ear), 0.09, 0.16, -0.03);               // pointy ears
      add(head, box(0.07, 0.09, 0.05, C.ear), -0.09, 0.16, -0.03);
      parts.collar = add(root, box(0.3, 0.05, 0.08, 0x2a62d0), 0, 0.5, 0.25);
      const lc = C.points || C.body;
      for (const [x, z] of [[0.08, 0.21], [-0.08, 0.21], [0.08, -0.21], [-0.08, -0.21]]) { const l = add(root, box(0.09, 0.3, 0.09, lc, true), x, 0.3, z); parts.legs.push(l); }
      parts.tail = add(root, box(0.06, 0.06, 0.5, C.points || C.ear), 0, 0.5, -0.3);
      parts.tail.geometry = parts.tail.geometry.clone().translate(0, 0, -0.25);
      parts.tail.rotation.x = 0.9;
    }
    parts.torso = torso;
    return { root, mat, parts };
  }

  // ---------- sounds (tiny WebAudio synth) ----------
  let actx = null;
  function audio() {
    if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { actx = new A(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function playSound(type, vol) {
    const ctx = actx; if (!ctx || vol <= 0.01) return; // only after a user gesture unlocked audio
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime, g = ctx.createGain(); g.connect(ctx.destination);
    if (type === 'dog') {
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), gg = ctx.createGain();
        o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1400;
        const s = t + k * 0.2;
        o.frequency.setValueAtTime(420, s); o.frequency.exponentialRampToValueAtTime(190, s + 0.12);
        gg.gain.setValueAtTime(0, s); gg.gain.linearRampToValueAtTime(0.35 * vol, s + 0.015); gg.gain.exponentialRampToValueAtTime(0.001, s + 0.14);
        o.connect(f); f.connect(gg); gg.connect(g); o.start(s); o.stop(s + 0.16);
      }
    } else {
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), gg = ctx.createGain();
      o.type = 'triangle'; lfo.frequency.value = 7; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.setValueAtTime(560, t); o.frequency.linearRampToValueAtTime(880, t + 0.18); o.frequency.linearRampToValueAtTime(520, t + 0.55);
      gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.22 * vol, t + 0.06); gg.gain.linearRampToValueAtTime(0.15 * vol, t + 0.35); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.connect(gg); gg.connect(g); o.start(t); lfo.start(t); o.stop(t + 0.62); lfo.stop(t + 0.62);
    }
  }

  // ---------- particles (hearts / puffs) ----------
  function spriteTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 16; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t; }
  const heartTex = spriteTex((g) => { g.fillStyle = '#e8203a'; const rows = ['..XX...XX..', '.XXXX.XXXX.', 'XXXXXXXXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XXXXX...', '....XXX....', '.....X.....']; rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') g.fillRect(x + 2, y + 3, 1, 1); })); g.fillStyle = '#ff8a9a'; g.fillRect(4, 4, 1, 1); });
  const puffTex = spriteTex((g) => { g.fillStyle = '#ddd'; g.fillRect(4, 4, 8, 8); g.fillStyle = '#bbb'; g.fillRect(6, 6, 4, 4); });

  class Mobs {
    constructor(scene, world, opts) {
      this.scene = scene; this.world = world;
      this.list = []; this.particles = [];
      this.max = opts.max || 16; this.maxWild = opts.maxWild || 6;
      this.spawnTimer = 3; this.sound = true;
      this.daylight = 1;
    }
    get count() { return this.list.length; }
    dispose() { for (const m of this.list) this.scene.remove(m.model.root); this.list = []; for (const p of this.particles) this.scene.remove(p.s); this.particles = []; }
    spawn(type, x, y, z, o = {}) {
      if (this.list.length >= this.max) return null;
      const coats = COATS[type];
      const coatIdx = o.coat != null ? o.coat % coats.length : (Math.random() * coats.length) | 0;
      const model = buildModel(type, coats[coatIdx]);
      const m = { type, coat: coatIdx, model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw: o.yaw != null ? o.yaw : Math.random() * Math.PI * 2,
        tamed: !!o.tamed, sitting: !!o.sitting, wild: o.wild !== undefined ? o.wild : false, state: 'idle', timer: 1 + Math.random() * 3,
        dir: 0, phase: 0, onGround: false, lightT: 0, soundT: 8 + Math.random() * 25, ...DIMS[type] };
      model.parts.collar.visible = m.tamed;
      model.root.position.copy(m.pos);
      this.scene.add(model.root);
      this.list.push(m);
      return m;
    }
    remove(m) { this.scene.remove(m.model.root); m.model.mat.dispose(); this.list.splice(this.list.indexOf(m), 1); }
    // ----- physics helpers -----
    solid(x, y, z) { const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id === -1 || SOLID[id] === 1; }
    collides(m, px, py, pz) {
      const hw = m.hw;
      for (let y = Math.floor(py); y <= Math.floor(py + m.h - 1e-6); y++)
        for (let z = Math.floor(pz - hw); z <= Math.floor(pz + hw - 1e-6); z++)
          for (let x = Math.floor(px - hw); x <= Math.floor(px + hw - 1e-6); x++) {
            const id = this.world.getBlock(x, y, z); if (id === -1 || SOLID[id]) return true;
          }
      return false;
    }
    moveAxis(m, axis, d) {
      if (!d) return false;
      const p = m.pos, steps = Math.ceil(Math.abs(d) / 0.3), s = d / steps;
      for (let i = 0; i < steps; i++) {
        const before = p.getComponent(axis);
        p.setComponent(axis, before + s);
        if (this.collides(m, p.x, p.y, p.z)) {
          if (axis === 1 && s < 0) { p.y = Math.floor(p.y) + 1 + 1e-4; if (this.collides(m, p.x, p.y, p.z)) p.y = before; }
          else p.setComponent(axis, before);
          return true;
        }
      }
      return false;
    }
    loaded(x, z) { const c = this.world.getChunk(Math.floor(x / CS), Math.floor(z / CS)); return c && c.meshes; }
    // Is it safe to step to (x,z)? Avoid water and drops of more than 3 blocks.
    safeGround(x, y, z) {
      for (let dy = 0; dy <= 3; dy++) {
        const id = this.world.getBlock(Math.floor(x), Math.floor(y) - 1 - dy, Math.floor(z));
        if (id === B.WATER) return false;
        if (id === -1) return false;
        if (SOLID[id]) return true;
      }
      return false;
    }
    surfaceY(x, z) {
      for (let y = 120; y > 1; y--) {
        const id = this.world.getBlock(x, y, z);
        if (id > 0 && SOLID[id]) return { y: y + 1, id };
        if (id === B.WATER) return { y: y + 1, id };
      }
      return null;
    }
    update(dt, player, daylight) {
      this.daylight = daylight;
      // natural spawning on grass near the player
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 4 + Math.random() * 4;
        const wild = this.list.filter(m => m.wild).length;
        if (wild < this.maxWild && this.list.length < this.max) {
          const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 16;
          const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
          if (this.loaded(x, z)) {
            const s = this.surfaceY(x, z);
            if (s && s.id === B.GRASS && !SOLID[this.world.getBlock(x, s.y + 1, z)] && !SOLID[this.world.getBlock(x, s.y, z)]) {
              const type = Math.random() < 0.5 ? 'dog' : 'cat';
              const n = Math.random() < 0.5 ? 2 : 1; // sometimes a pair
              for (let i = 0; i < n; i++) this.spawn(type, x + 0.5 + i * 0.6, s.y, z + 0.5, { wild: true });
            }
          }
        }
      }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const m = this.list[i];
        const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, dist = Math.hypot(dx, dz);
        if (m.wild && !m.tamed && dist > 96) { this.remove(m); continue; }
        if (!this.loaded(m.pos.x, m.pos.z)) {
          if (m.tamed && !m.sitting && this.loaded(player.pos.x, player.pos.z)) this.teleportNear(m, player); // follow across distances
          m.model.root.visible = false; continue;
        }
        m.model.root.visible = true;
        this.think(m, dt, player, dx, dz, dist);
        this.physics(m, dt);
        this.animate(m, dt);
        // sounds
        m.soundT -= dt;
        if (m.soundT <= 0) { m.soundT = 15 + Math.random() * 35; if (this.sound && dist < 16) playSound(m.type, (1 - dist / 16) * 0.6); }
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.t += dt;
        p.s.position.y += dt * p.vy; p.s.material.opacity = Math.max(0, 1 - p.t / p.life);
        if (p.t >= p.life) { this.scene.remove(p.s); p.s.material.dispose(); this.particles.splice(i, 1); }
      }
    }
    teleportNear(m, player) {
      const a = player.yaw + Math.PI + (Math.random() - 0.5);
      const x = player.pos.x + Math.sin(a) * 1.5, z = player.pos.z + Math.cos(a) * 1.5;
      m.pos.set(x, player.pos.y + 0.2, z);
      if (this.collides(m, m.pos.x, m.pos.y, m.pos.z)) m.pos.set(player.pos.x, player.pos.y + 0.2, player.pos.z);
      m.vel.set(0, 0, 0);
    }
    think(m, dt, player, dx, dz, dist) {
      m.timer -= dt;
      let speed = 0;
      if (m.sitting) { m.state = 'sit'; }
      else if (m.tamed && dist > 3) {
        m.state = 'follow';
        if (dist > 24 && player.onGround) { this.teleportNear(m, player); return; }
        m.dir = Math.atan2(dx, dz);
        speed = dist > 7 ? m.run : m.speed * 1.6;
      } else if (m.state === 'walk') {
        speed = m.speed;
        if (m.timer <= 0) { m.state = 'idle'; m.timer = 1.5 + Math.random() * 4; }
      } else {
        if (m.state !== 'idle') { m.state = 'idle'; m.timer = 1 + Math.random() * 3; }
        if (m.timer <= 0) {
          m.state = 'walk'; m.timer = 1.5 + Math.random() * 3.5;
          m.dir = m.tamed ? Math.atan2(dx, dz) + (Math.random() - 0.5) * 2 : Math.random() * Math.PI * 2;
        }
      }
      // turn smoothly toward the desired direction
      let dy = m.dir - m.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      if (speed > 0) m.yaw += dy * Math.min(1, dt * 8);
      const sx = Math.sin(m.yaw), sz = Math.cos(m.yaw);
      if (speed > 0) {
        // obstacle / hazard check one step ahead
        const ax = m.pos.x + sx * (m.hw + 0.35), az = m.pos.z + sz * (m.hw + 0.35), fy = m.pos.y;
        if (this.solid(ax, fy, az)) {
          if (!this.solid(ax, fy + 1, az) && !this.solid(m.pos.x, fy + m.h + 0.6, m.pos.z) && m.onGround) m.vel.y = 7.2; // hop up one block
          else if (m.state !== 'follow') { m.dir += Math.PI * (0.5 + Math.random()); speed = 0; }
        } else if (!m.inWater && !this.safeGround(ax, fy, az)) {
          if (m.state === 'follow' && player.pos.y < m.pos.y - 0.5 && player.pos.y > m.pos.y - 4.5 && !this.waterAhead(ax, fy, az)) { /* follow down small drops */ }
          else { speed = 0; if (m.state !== 'follow') { m.dir += Math.PI * (0.6 + Math.random() * 0.8); m.state = 'idle'; m.timer = 0.5; } }
        }
      }
      if (m.state === 'idle' || m.state === 'sit') {
        // look at the player when close
        if (dist < 6) { let d2 = Math.atan2(dx, dz) - m.yaw; while (d2 > Math.PI) d2 -= 2 * Math.PI; while (d2 < -Math.PI) d2 += 2 * Math.PI; m.lookYaw = Math.max(-0.8, Math.min(0.8, d2)); }
        else m.lookYaw = 0;
      } else m.lookYaw = 0;
      const k = Math.min(1, dt * (m.onGround ? 10 : 2));
      m.vel.x += (sx * speed - m.vel.x) * k;
      m.vel.z += (sz * speed - m.vel.z) * k;
    }
    waterAhead(x, y, z) { for (let dy = 1; dy <= 4; dy++) { const id = this.world.getBlock(Math.floor(x), Math.floor(y) - dy, Math.floor(z)); if (id === B.WATER) return true; if (id > 0 && SOLID[id]) return false; } return false; }
    physics(m, dt) {
      const id = this.world.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.3), Math.floor(m.pos.z));
      m.inWater = id === B.WATER;
      if (m.inWater) { m.vel.y = Math.min(m.vel.y + 18 * dt, 2.5); m.vel.x *= 0.95; m.vel.z *= 0.95; }
      else m.vel.y = Math.max(m.vel.y - 28 * dt, -40);
      if (this.moveAxis(m, 0, m.vel.x * dt)) m.vel.x = 0;
      if (this.moveAxis(m, 2, m.vel.z * dt)) m.vel.z = 0;
      const vy = m.vel.y * dt, hit = this.moveAxis(m, 1, vy);
      m.onGround = hit && vy < 0;
      if (hit) m.vel.y = 0;
      if (m.pos.y < -10) m.pos.y = 100;
    }
    animate(m, dt) {
      const P = m.model.parts, root = m.model.root;
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.phase += dt * hs * (m.type === 'cat' ? 9 : 7.5);
      const sw = Math.min(1, hs / 1.5) * 0.7;
      const sit = m.sitting;
      P.legs.forEach((l, i) => {
        if (sit && i >= 2) { l.rotation.x = -1.35; l.position.y = (m.type === 'dog' ? 0.22 : 0.17); }
        else { l.rotation.x = Math.sin(m.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * sw; l.position.y = m.type === 'dog' ? 0.4 : 0.3; }
      });
      P.torso.rotation.x = sit ? -0.38 : 0; P.torso.position.y = sit ? -0.1 : 0; P.torso.position.z = sit ? -0.08 : 0;
      const t = performance.now() / 1000;
      if (m.type === 'dog') { P.tail.rotation.y = Math.sin(t * (m.tamed ? 14 : 6)) * (m.tamed ? 0.6 : 0.25); P.tail.rotation.x = sit ? 0.1 : 0.7; }
      else { P.tail.rotation.y = Math.sin(t * 2.2 + m.coat) * 0.35; P.tail.rotation.x = sit ? 0.05 : 0.9 + Math.sin(t * 1.3) * 0.1; }
      P.tail.position.y = (m.type === 'dog' ? 0.64 : 0.5) - (sit ? 0.22 : 0);
      P.head.rotation.y += ((m.lookYaw || 0) - P.head.rotation.y) * Math.min(1, dt * 6);
      P.head.position.y = (m.type === 'dog' ? 0.72 : 0.56) + (sit ? 0.04 : 0) + (m.state === 'idle' ? Math.sin(t * 2 + m.coat) * 0.01 : 0);
      root.position.copy(m.pos); root.rotation.y = m.yaw;
      // lighting: max(daylight * sky exposure, block light)
      m.lightT -= dt;
      if (m.lightT <= 0) {
        m.lightT = 0.25;
        const x = Math.floor(m.pos.x), y = Math.floor(m.pos.y + 0.5), z = Math.floor(m.pos.z);
        let open = true; for (let yy = y + 1; yy < Math.min(127, y + 40); yy++) { const id = this.world.getBlock(x, yy, z); if (id > 0 && VC.Blocks.OPAQUE[id]) { open = false; break; } }
        const L = this.world.getBlockLight(x, y, z);
        m.skyB = open ? 1 : 0.35; m.blockB = L ? Math.pow(L / 15, 1.4) : 0;
      }
      const b = Math.max((m.skyB || 1) * this.daylight, m.blockB || 0);
      m.model.mat.color.setScalar(Math.max(0.12, b));
    }
    // ray vs mob AABBs; returns { mob, t }
    raycast(origin, dir, maxDist) {
      let best = null;
      for (const m of this.list) {
        if (!m.model.root.visible) continue;
        const mn = [m.pos.x - m.hw - 0.05, m.pos.y, m.pos.z - m.hw - 0.05], mx = [m.pos.x + m.hw + 0.05, m.pos.y + m.h, m.pos.z + m.hw + 0.05];
        let t0 = 0, t1 = maxDist, ok = true;
        for (let a = 0; a < 3 && ok; a++) {
          const o = origin.getComponent(a), d = dir.getComponent(a);
          if (Math.abs(d) < 1e-9) { if (o < mn[a] || o > mx[a]) ok = false; continue; }
          let ta = (mn[a] - o) / d, tb = (mx[a] - o) / d; if (ta > tb) { const s = ta; ta = tb; tb = s; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
        }
        if (ok && (!best || t0 < best.t)) best = { mob: m, t: t0 };
      }
      return best;
    }
    particle(tex, pos, n, spread, vy, life) {
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        s.scale.setScalar(0.3);
        s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.3, pos.z + (Math.random() - 0.5) * spread);
        this.scene.add(s); this.particles.push({ s, t: -i * 0.12, life, vy });
      }
    }
    // right-click / tap: tame, then toggle sit <-> follow
    interact(m) {
      let msg;
      if (!m.tamed) { m.tamed = true; m.wild = false; m.sitting = false; m.model.parts.collar.visible = true; msg = (m.type === 'dog' ? 'Dog' : 'Cat') + ' tamed! It will follow you.'; }
      else { m.sitting = !m.sitting; msg = (m.type === 'dog' ? 'Dog' : 'Cat') + (m.sitting ? ' is sitting.' : ' is following you.'); }
      m.state = m.sitting ? 'sit' : 'follow'; m.vel.x = m.vel.z = 0;
      this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z), 3, 0.5, 0.8, 1.2);
      if (this.sound) playSound(m.type, 0.7);
      return msg;
    }
    // left-click / long-press: pet a tamed animal, shoo away a wild one
    hit(m) {
      if (m.tamed) { this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z), 2, 0.4, 0.8, 1); if (this.sound) playSound(m.type, 0.5); return null; }
      this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + 0.3, m.pos.z), 6, 0.6, 0.6, 0.7);
      this.remove(m);
      return 'Shooed away';
    }
    serialize() { return this.list.filter(m => m.tamed || !m.wild).map(m => ({ t: m.type, c: m.coat, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2), r: +m.yaw.toFixed(2), tm: m.tamed ? 1 : 0, s: m.sitting ? 1 : 0 })); }
    load(arr) { for (const o of arr || []) if (COATS[o.t]) this.spawn(o.t, o.x, o.y, o.z, { coat: o.c, yaw: o.r, tamed: !!o.tm, sitting: !!o.s, wild: false }); }
  }

  VC.Mobs = Mobs; VC.MobSounds = { play: playSound, unlock: audio };
})();
