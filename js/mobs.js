// Animals & monsters: dogs, cats, lions (tameable, lions/dogs protect you) and zombies (hostile).
// Blocky box models, simple AI, physics, health/combat, taming, synthesized sounds, saving.
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
    lion: [
      { name: 'Tawny', body: 0xc8954a, mane: 0x6b3e1a, belly: 0xd9b07a },
      { name: 'Golden', body: 0xd8aa5a, mane: 0x8a5224, belly: 0xe6c48c },
      { name: 'Pale', body: 0xe0c48e, mane: 0x5a3418, belly: 0xeedcb4 },
      { name: 'White', body: 0xeee6d2, mane: 0xcdbb98, belly: 0xf6f0e2 },
    ],
    zombie: [
      { name: 'Zombie', skin: 0x5d9a4a, shirt: 0x2f8a8a, pants: 0x3b3a8f },
      { name: 'Zombie', skin: 0x6a9a50, shirt: 0x7a4a2a, pants: 0x3a3a3a },
      { name: 'Zombie', skin: 0x558f45, shirt: 0x8a2f2f, pants: 0x2f4a8a },
    ],
  };
  // hw: half width, h: height, hp: health, protect: damage dealt defending the player, attack: hostile melee damage
  const TYPES = {
    dog: { hw: 0.3, h: 0.85, speed: 1.6, run: 4.6, hp: 10, tame: true, protect: 3 },
    cat: { hw: 0.25, h: 0.7, speed: 1.4, run: 4.8, hp: 8, tame: true },
    lion: { hw: 0.42, h: 1.15, speed: 1.5, run: 5.8, hp: 26, tame: true, protect: 7, neutral: true, attack: 5 },
    zombie: { hw: 0.3, h: 1.85, speed: 0.9, run: 2.5, hp: 20, hostile: true, attack: 3 },
  };
  VC.MOB_TYPES = TYPES;
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
  const shifted = (g, x, y, z) => { const k = 'sh' + g.uuid + [x, y, z]; let r = geoCache.get(k); if (!r) { r = g.clone().translate(x, y, z); geoCache.set(k, r); } return r; };

  function buildModel(type, coat) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const root = new THREE.Group(), torso = new THREE.Group();
    root.add(torso);
    const add = (parent, geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    const parts = { legs: [], arms: [] };
    const C = coat;
    if (type === 'dog') {
      add(torso, box(0.36, 0.34, 0.72, C.body), 0, 0.55, 0);
      if (C.spots) { add(torso, box(0.37, 0.2, 0.22, C.spots), 0, 0.6, 0.1); add(torso, box(0.2, 0.35, 0.2, C.spots), 0.05, 0.56, -0.2); }
      const head = parts.head = new THREE.Group(); head.position.set(0, 0.72, 0.42); root.add(head);
      add(head, box(0.36, 0.32, 0.3, C.body), 0, 0, 0);
      add(head, box(0.2, 0.15, 0.16, C.spots ? 0xece6da : C.body), 0, -0.06, 0.22);
      add(head, box(0.07, 0.07, 0.04, 0x161210), 0, -0.02, 0.3);
      add(head, box(0.06, 0.06, 0.02, 0x111111), 0.09, 0.05, 0.155);
      add(head, box(0.06, 0.06, 0.02, 0x111111), -0.09, 0.05, 0.155);
      add(head, box(0.08, 0.16, 0.08, C.ear), 0.15, 0.1, -0.02);
      add(head, box(0.08, 0.16, 0.08, C.ear), -0.15, 0.1, -0.02);
      parts.collar = add(root, box(0.38, 0.07, 0.1, 0xd02828), 0, 0.68, 0.3);
      for (const [x, z] of [[0.11, 0.24], [-0.11, 0.24], [0.11, -0.24], [-0.11, -0.24]]) parts.legs.push(add(root, box(0.12, 0.4, 0.12, C.body, true), x, 0.4, z));
      parts.tail = add(root, shifted(box(0.08, 0.08, 0.34, C.ear), 0, 0, -0.17), 0, 0.64, -0.34); parts.tail.rotation.x = 0.6;
      parts.legY = 0.4; parts.tailY = 0.64; parts.headY = 0.72;
    } else if (type === 'cat') {
      add(torso, box(0.28, 0.26, 0.62, C.body), 0, 0.4, 0);
      if (C.stripes) for (const z of [-0.18, 0, 0.18]) add(torso, box(0.29, 0.06, 0.06, C.stripes), 0, 0.5, z);
      if (C.spots) { add(torso, box(0.29, 0.14, 0.18, C.spots), 0, 0.45, 0.12); add(torso, box(0.29, 0.12, 0.16, C.spots2), 0, 0.43, -0.16); }
      const head = parts.head = new THREE.Group(); head.position.set(0, 0.56, 0.36); root.add(head);
      add(head, box(0.3, 0.26, 0.26, C.body), 0, 0, 0);
      if (C.points) add(head, box(0.18, 0.14, 0.03, C.points), 0, -0.03, 0.13);
      add(head, box(0.05, 0.05, 0.02, 0x2a9a3a), 0.075, 0.03, 0.135);
      add(head, box(0.05, 0.05, 0.02, 0x2a9a3a), -0.075, 0.03, 0.135);
      add(head, box(0.05, 0.04, 0.02, 0xe88aa0), 0, -0.04, 0.135);
      add(head, box(0.07, 0.09, 0.05, C.ear), 0.09, 0.16, -0.03);
      add(head, box(0.07, 0.09, 0.05, C.ear), -0.09, 0.16, -0.03);
      parts.collar = add(root, box(0.3, 0.05, 0.08, 0x2a62d0), 0, 0.5, 0.25);
      const lc = C.points || C.body;
      for (const [x, z] of [[0.08, 0.21], [-0.08, 0.21], [0.08, -0.21], [-0.08, -0.21]]) parts.legs.push(add(root, box(0.09, 0.3, 0.09, lc, true), x, 0.3, z));
      parts.tail = add(root, shifted(box(0.06, 0.06, 0.5, C.points || C.ear), 0, 0, -0.25), 0, 0.5, -0.3); parts.tail.rotation.x = 0.9;
      parts.legY = 0.3; parts.tailY = 0.5; parts.headY = 0.56;
    } else if (type === 'lion') {
      add(torso, box(0.52, 0.48, 1.0, C.body), 0, 0.78, 0);
      add(torso, box(0.42, 0.06, 0.8, C.belly), 0, 0.53, 0);
      const head = parts.head = new THREE.Group(); head.position.set(0, 1.0, 0.56); root.add(head);
      add(head, box(0.66, 0.62, 0.26, C.mane), 0, 0.02, -0.06);               // mane
      add(head, box(0.56, 0.2, 0.3, C.mane), 0, 0.28, -0.12);
      add(head, box(0.42, 0.4, 0.3, C.body), 0, 0, 0.12);                     // face
      add(head, box(0.24, 0.17, 0.14, C.belly), 0, -0.1, 0.32);               // muzzle
      add(head, box(0.1, 0.07, 0.04, 0x2a1a12), 0, -0.04, 0.4);               // nose
      add(head, box(0.07, 0.06, 0.02, 0x1a1208), 0.11, 0.07, 0.275);           // eyes
      add(head, box(0.07, 0.06, 0.02, 0x1a1208), -0.11, 0.07, 0.275);
      add(head, box(0.1, 0.1, 0.06, C.body), 0.2, 0.26, 0.04);                 // ears
      add(head, box(0.1, 0.1, 0.06, C.body), -0.2, 0.26, 0.04);
      parts.collar = add(root, box(0.5, 0.08, 0.12, 0xd8a020), 0, 0.82, 0.42);
      for (const [x, z] of [[0.16, 0.36], [-0.16, 0.36], [0.16, -0.36], [-0.16, -0.36]]) parts.legs.push(add(root, box(0.16, 0.56, 0.16, C.body, true), x, 0.56, z));
      parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.88, -0.5); root.add(parts.tail);
      add(parts.tail, shifted(box(0.07, 0.07, 0.6, C.body), 0, 0, -0.3), 0, 0, 0);
      add(parts.tail, box(0.13, 0.13, 0.15, C.mane), 0, 0, -0.62);               // tuft
      parts.tail.rotation.x = -0.5;
      parts.legY = 0.56; parts.tailY = 0.88; parts.headY = 1.0;
    } else { // zombie (humanoid)
      add(torso, box(0.5, 0.7, 0.26, C.shirt), 0, 1.07, 0);
      const head = parts.head = new THREE.Group(); head.position.set(0, 1.42, 0); root.add(head);
      add(head, box(0.48, 0.48, 0.48, C.skin), 0, 0.24, 0);
      add(head, box(0.1, 0.07, 0.02, 0x101010), 0.11, 0.27, 0.245);
      add(head, box(0.1, 0.07, 0.02, 0x101010), -0.11, 0.27, 0.245);
      add(head, box(0.18, 0.05, 0.02, 0x2f4a26), 0, 0.12, 0.245);
      for (const x of [0.12, -0.12]) parts.legs.push(add(root, box(0.24, 0.72, 0.24, C.pants, true), x, 0.72, 0));
      for (const x of [0.37, -0.37]) { const a = add(root, box(0.22, 0.7, 0.22, C.skin, true), x, 1.38, 0); a.rotation.x = -Math.PI / 2 + 0.1; parts.arms.push(a); }
      parts.collar = new THREE.Object3D();
      parts.legY = 0.72; parts.headY = 1.42;
    }
    parts.torso = torso;
    return { root, mat, parts };
  }

  // ---------- sounds (tiny WebAudio synth) ----------
  let actx = null, noiseBuf = null;
  function audio() {
    if (!actx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { actx = new A(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function noise(ctx) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; return n;
  }
  function env(ctx, g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function playSound(type, vol) {
    const ctx = actx; if (!ctx || vol <= 0.01) return; // only after a user gesture unlocked audio
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = Math.min(1, vol); out.connect(ctx.destination);
    if (type === 'dog') {
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), gg = ctx.createGain();
        o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1400;
        const s = t + k * 0.2;
        o.frequency.setValueAtTime(420, s); o.frequency.exponentialRampToValueAtTime(190, s + 0.12);
        env(ctx, gg, s, 0.015, 0.35, 0.14);
        o.connect(f); f.connect(gg); gg.connect(out); o.start(s); o.stop(s + 0.16);
      }
    } else if (type === 'cat') {
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), gg = ctx.createGain();
      o.type = 'triangle'; lfo.frequency.value = 7; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.setValueAtTime(560, t); o.frequency.linearRampToValueAtTime(880, t + 0.18); o.frequency.linearRampToValueAtTime(520, t + 0.55);
      env(ctx, gg, t, 0.06, 0.22, 0.6);
      o.connect(gg); gg.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.62); lfo.stop(t + 0.62);
    } else if (type === 'lion') { // roar: filtered noise + growling saw
      const n = noise(ctx), f = ctx.createBiquadFilter(), g1 = ctx.createGain();
      f.type = 'bandpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(700, t + 0.3); f.frequency.linearRampToValueAtTime(220, t + 1.1); f.Q.value = 1.2;
      env(ctx, g1, t, 0.12, 0.7, 1.2); n.connect(f); f.connect(g1); g1.connect(out); n.start(t); n.stop(t + 1.25);
      const o = ctx.createOscillator(), g2 = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(140, t + 0.35); o.frequency.linearRampToValueAtTime(70, t + 1.1);
      lfo.frequency.value = 24; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency);
      env(ctx, g2, t, 0.1, 0.35, 1.15); o.connect(g2); g2.connect(out); o.start(t); lfo.start(t); o.stop(t + 1.2); lfo.stop(t + 1.2);
    } else if (type === 'zombie') { // groan
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 600;
      o.frequency.setValueAtTime(120, t); o.frequency.linearRampToValueAtTime(90, t + 0.9);
      lfo.frequency.value = 5; lg.gain.value = 8; lfo.connect(lg); lg.connect(o.frequency);
      env(ctx, g, t, 0.15, 0.4, 1.0); o.connect(f); f.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 1.05); lfo.stop(t + 1.05);
    } else if (type === 'hurt') {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square';
      o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.15);
      env(ctx, g, t, 0.005, 0.2, 0.18); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2);
    } else if (type === 'hit') {
      const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 1800;
      env(ctx, g, t, 0.003, 0.4, 0.1); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.12);
    } else if (type === 'fuse') {
      const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 3000;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.05); g.gain.linearRampToValueAtTime(0.12, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 1.55);
    } else if (type === 'boom') {
      const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass';
      f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
      env(ctx, g, t, 0.005, 1.0, 1.6); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 1.7);
      const o = ctx.createOscillator(), g2 = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
      env(ctx, g2, t, 0.005, 0.9, 0.9); o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.95);
    }
  }

  // ---------- particles (hearts / puffs) ----------
  function spriteTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 16; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t; }
  const heartTex = spriteTex((g) => { g.fillStyle = '#e8203a'; const rows = ['..XX...XX..', '.XXXX.XXXX.', 'XXXXXXXXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XXXXX...', '....XXX....', '.....X.....']; rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') g.fillRect(x + 2, y + 3, 1, 1); })); g.fillStyle = '#ff8a9a'; g.fillRect(4, 4, 1, 1); });
  const fireTex = spriteTex((g) => { g.fillStyle = '#ff7a1a'; g.fillRect(4, 6, 8, 9); g.fillStyle = '#ffc23a'; g.fillRect(6, 8, 4, 6); g.fillStyle = '#fff2a0'; g.fillRect(7, 11, 2, 3); g.fillStyle = '#ff7a1a'; g.fillRect(6, 3, 3, 3); });
  const puffTex = spriteTex((g) => { g.fillStyle = '#ddd'; g.fillRect(4, 4, 8, 8); g.fillStyle = '#bbb'; g.fillRect(6, 6, 4, 4); });

  class Mobs {
    constructor(scene, world, opts) {
      this.scene = scene; this.world = world;
      this.list = []; this.particles = [];
      this.max = opts.max || 16; this.maxWild = opts.maxWild || 6; this.maxZombies = opts.maxZombies || 6; this.maxWildLions = opts.maxWildLions || 2;
      this.spawnTimer = 3; this.zombieTimer = 4; this.sound = true; this.hostile = true;
      this.daylight = 1; this.player = null;
      this.onPlayerDamage = null; // (amount, mob) => void
    }
    get count() { return this.list.length; }
    animals() { return this.list.filter(m => !m.hostile).length; }
    zombies() { return this.list.filter(m => m.hostile).length; }
    dispose() { for (const m of this.list) this.scene.remove(m.model.root); this.list = []; for (const p of this.particles) this.scene.remove(p.s); this.particles = []; }
    spawn(type, x, y, z, o = {}) {
      const T = TYPES[type]; if (!T) return null;
      if (T.hostile ? this.zombies() >= this.maxZombies : this.animals() >= this.max) return null;
      const coats = COATS[type];
      const coatIdx = o.coat != null ? o.coat % coats.length : (Math.random() * coats.length) | 0;
      const model = buildModel(type, coats[coatIdx]);
      const m = Object.assign({ type, coat: coatIdx, model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw: o.yaw != null ? o.yaw : Math.random() * Math.PI * 2,
        tamed: !!o.tamed, sitting: !!o.sitting, wild: o.wild !== undefined ? o.wild : false, state: 'idle', timer: 1 + Math.random() * 3,
        dir: 0, phase: 0, onGround: false, lightT: 0, soundT: 8 + Math.random() * 25, hpMax: T.hp, cd: 0, attackAnim: 0, hurtT: 0, angry: 0, enemy: null, burnT: 0, dead: false }, T);
      m.hp = o.hp != null ? o.hp : T.hp;
      model.parts.collar.visible = m.tamed;
      model.root.position.copy(m.pos);
      this.scene.add(model.root);
      this.list.push(m);
      return m;
    }
    remove(m) { if (m.dead) return; m.dead = true; this.scene.remove(m.model.root); m.model.mat.dispose(); const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1); }
    setHostile(on) { this.hostile = on; if (!on) for (const m of [...this.list]) if (m.hostile) this.remove(m); if (!on) for (const m of this.list) m.angry = 0; }
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
    safeGround(x, y, z) {
      for (let dy = 0; dy <= 3; dy++) {
        const id = this.world.getBlock(Math.floor(x), Math.floor(y) - 1 - dy, Math.floor(z));
        if (id === B.WATER || id === -1) return false;
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
    skyOpen(x, y, z) { for (let yy = y + 1; yy < Math.min(127, y + 48); yy++) { const id = this.world.getBlock(x, yy, z); if (id > 0 && VC.Blocks.OPAQUE[id]) return false; } return true; }
    clear2(x, y, z) { return !SOLID[this.world.getBlock(x, y, z)] && !SOLID[this.world.getBlock(x, y + 1, z)] && this.world.getBlock(x, y, z) !== B.WATER; }
    spawnNatural(player) {
      // animals on grass (lions also on sand) near the player
      if (this.animals() < this.max) {
        const wild = this.list.filter(m => m.wild && !m.hostile).length;
        if (wild < this.maxWild) {
          const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 16;
          const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
          if (this.loaded(x, z)) {
            const s = this.surfaceY(x, z);
            const lions = this.list.filter(m => m.wild && m.type === 'lion').length;
            if (s && (s.id === B.GRASS || s.id === B.SAND) && this.clear2(x, s.y, z)) {
              if (Math.random() < 0.22 && lions < this.maxWildLions) this.spawn('lion', x + 0.5, s.y, z + 0.5, { wild: true });
              else if (s.id === B.GRASS) {
                const type = Math.random() < 0.5 ? 'dog' : 'cat', n = Math.random() < 0.5 ? 2 : 1;
                for (let i = 0; i < n; i++) this.spawn(type, x + 0.5 + i * 0.6, s.y, z + 0.5, { wild: true });
              }
            }
          }
        }
      }
    }
    spawnZombie(player) {
      if (!this.hostile || this.zombies() >= this.maxZombies || player.dead) return;
      const night = this.daylight < 0.4;
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 20;
        const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
        if (!this.loaded(x, z)) continue;
        let spot = null;
        if (night && Math.random() < 0.7) { const s = this.surfaceY(x, z); if (s && s.id !== B.WATER && SOLID[s.id] && this.clear2(x, s.y, z)) spot = s.y; }
        if (spot == null) { // caves: dark air pocket around the player's height
          const y0 = Math.floor(player.pos.y) + 6;
          for (let y = y0; y > Math.max(2, y0 - 22); y--) {
            if (SOLID[this.world.getBlock(x, y - 1, z)] && this.clear2(x, y, z) && !this.skyOpen(x, y, z)) { spot = y; break; }
          }
        }
        if (spot == null) continue;
        if (this.world.getBlockLight(x, spot, z) >= 7 || this.world.getBlockLight(x, spot + 1, z) >= 7) continue; // torches keep zombies away
        if (!night && this.skyOpen(x, spot, z)) continue;
        if (Math.hypot(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z) < 10) continue;
        this.spawn('zombie', x + 0.5, spot, z + 0.5, { wild: true });
        return;
      }
    }
    update(dt, player, daylight) {
      this.daylight = daylight; this.player = player;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 4 + Math.random() * 4; this.spawnNatural(player); }
      this.zombieTimer -= dt;
      if (this.zombieTimer <= 0) { this.zombieTimer = 3 + Math.random() * 3; this.spawnZombie(player); }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const m = this.list[i]; if (!m) continue;
        const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, dist = Math.hypot(dx, dz);
        if (m.wild && !m.tamed && dist > (m.hostile ? 64 : 96)) { this.remove(m); continue; }
        if (!this.loaded(m.pos.x, m.pos.z)) {
          if (m.tamed && !m.sitting && this.loaded(player.pos.x, player.pos.z)) this.teleportNear(m, player);
          m.model.root.visible = false; continue;
        }
        m.model.root.visible = true;
        m.cd -= dt; m.attackAnim = Math.max(0, m.attackAnim - dt); m.hurtT = Math.max(0, m.hurtT - dt); if (m.angry > 0) m.angry -= dt;
        this.think(m, dt, player, dx, dz, dist);
        if (m.dead) continue;
        this.physics(m, dt);
        this.animate(m, dt);
        // zombies burn in daylight
        if (m.hostile && this.daylight > 0.55 && m.skyB === 1) {
          m.burnT -= dt;
          if (m.burnT <= 0) { m.burnT = 0.8; this.particle(fireTex, new THREE.Vector3(m.pos.x, m.pos.y + 0.6, m.pos.z), 3, 0.5, 1.4, 0.6); this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + 1.8, m.pos.z), 1, 0.3, 0.9, 0.8); this.damage(m, 3, null, null); if (m.dead) continue; }
        }
        m.soundT -= dt;
        if (m.soundT <= 0) { m.soundT = (m.hostile ? 6 : 15) + Math.random() * 30; if (this.sound && dist < 16 && m.type !== 'lion') playSound(m.type, (1 - dist / 16) * 0.6); }
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.t += dt;
        if (p.t < 0) continue;
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
    // nearest threat to the player for protectors: whoever hurt the player, else zombies near the player/protector
    findEnemy(m, player) {
      const la = player.lastAttacker;
      if (la && !la.dead && !la.tamed && player.lastAttackT > 0 && la !== m) return la;
      let best = null, bd = 12;
      for (const o of this.list) {
        if (o.dead || !(o.hostile || (o.angry > 0 && !o.tamed))) continue;
        const d = Math.min(o.pos.distanceTo(player.pos), o.pos.distanceTo(m.pos) + 2);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }
    think(m, dt, player, dx, dz, dist) {
      m.timer -= dt;
      let speed = 0, chase = null;
      if (m.hostile || (m.angry > 0 && !m.tamed)) {
        // hostile: chase and melee the player
        if (this.hostile && !player.dead && dist < 24 && Math.abs(player.pos.y - m.pos.y) < 10) chase = player;
        else if (m.angry > 0 && !m.hostile) m.angry = 0;
      } else if (m.tamed && m.protect && !m.sitting) {
        const e = this.findEnemy(m, player);
        if (e) chase = e;
      }
      if (chase) {
        m.state = 'chase';
        const tx = chase.pos.x - m.pos.x, tz = chase.pos.z - m.pos.z, td = Math.hypot(tx, tz);
        m.dir = Math.atan2(tx, tz);
        speed = m.run;
        const reach = (m.hw + (chase.hw || 0.3)) + (m.type === 'lion' ? 0.9 : 0.6);
        if (td < reach && Math.abs(chase.pos.y - m.pos.y) < 1.6) {
          speed = 0.5;
          if (m.cd <= 0) {
            m.attackAnim = 0.35;
            if (chase === player) { m.cd = 1.0; if (this.onPlayerDamage) this.onPlayerDamage(m.attack || 3, m); }
            else {
              m.cd = m.type === 'lion' ? 1.1 : 0.9;
              if (m.type === 'lion' && m.onGround) { m.vel.y = 5.5; m.vel.x += Math.sin(m.yaw) * 3; m.vel.z += Math.cos(m.yaw) * 3; } // pounce
              this.damage(chase, m.protect || m.attack || 2, m.pos, m);
            }
          }
        }
        if (!m.engaged && m.type === 'lion' && chase !== player) { m.engaged = true; if (this.sound) playSound('lion', 0.8); }
      } else {
        m.engaged = false;
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
      }
      let dy = m.dir - m.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      if (speed > 0) m.yaw += dy * Math.min(1, dt * 8);
      const sx = Math.sin(m.yaw), sz = Math.cos(m.yaw);
      if (speed > 0) {
        const ax = m.pos.x + sx * (m.hw + 0.35), az = m.pos.z + sz * (m.hw + 0.35), fy = m.pos.y;
        if (this.solid(ax, fy, az)) {
          if (!this.solid(ax, fy + 1, az) && !this.solid(m.pos.x, fy + m.h + 0.6, m.pos.z) && m.onGround) m.vel.y = 7.2; // hop up one block
          else if (m.state !== 'follow' && m.state !== 'chase') { m.dir += Math.PI * (0.5 + Math.random()); speed = 0; }
        } else if (!m.inWater && !this.safeGround(ax, fy, az)) {
          const target = chase || (m.state === 'follow' ? player : null);
          if (target && target.pos.y < m.pos.y - 0.5 && target.pos.y > m.pos.y - 4.5 && !this.waterAhead(ax, fy, az)) { /* follow down small drops */ }
          else { speed = 0; if (m.state !== 'follow' && m.state !== 'chase') { m.dir += Math.PI * (0.6 + Math.random() * 0.8); m.state = 'idle'; m.timer = 0.5; } }
        }
      }
      if ((m.state === 'idle' || m.state === 'sit') && dist < 6) { let d2 = Math.atan2(dx, dz) - m.yaw; while (d2 > Math.PI) d2 -= 2 * Math.PI; while (d2 < -Math.PI) d2 += 2 * Math.PI; m.lookYaw = Math.max(-0.8, Math.min(0.8, d2)); }
      else m.lookYaw = 0;
      if (m.knock > 0) { m.knock -= dt; return; } // being knocked back: no steering
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
      if (m.pos.y < -10) { if (m.hostile || m.wild) { this.remove(m); return; } m.pos.y = 100; }
    }
    animate(m, dt) {
      const P = m.model.parts, root = m.model.root;
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.phase += dt * hs * (m.type === 'cat' ? 9 : m.type === 'lion' ? 5.5 : m.type === 'zombie' ? 4 : 7.5);
      const sw = Math.min(1, hs / 1.5) * 0.7;
      const sit = m.sitting, atk = m.attackAnim > 0 ? Math.sin((1 - m.attackAnim / 0.35) * Math.PI) : 0;
      const t = performance.now() / 1000;
      if (m.type === 'zombie') {
        P.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.phase + i * Math.PI) * sw; });
        P.arms.forEach((a, i) => { a.rotation.x = -Math.PI / 2 + 0.1 + Math.sin(t * 2 + i) * 0.05 + atk * 0.9; });
        P.torso.rotation.x = atk * 0.15;
      } else {
        P.legs.forEach((l, i) => {
          if (sit && i >= 2) { l.rotation.x = -1.35; l.position.y = P.legY * 0.55; }
          else { l.rotation.x = (i < 2 ? -atk * 1.1 : 0) + Math.sin(m.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * sw; l.position.y = P.legY; }
        });
        P.torso.rotation.x = sit ? -0.38 : -atk * 0.3; P.torso.position.y = sit ? -0.1 * (P.legY / 0.4) : 0; P.torso.position.z = sit ? -0.08 : 0;
        if (m.type === 'dog') { P.tail.rotation.y = Math.sin(t * (m.tamed ? 14 : 6)) * (m.tamed ? 0.6 : 0.25); P.tail.rotation.x = sit ? 0.1 : 0.7; }
        else if (m.type === 'cat') { P.tail.rotation.y = Math.sin(t * 2.2 + m.coat) * 0.35; P.tail.rotation.x = sit ? 0.05 : 0.9 + Math.sin(t * 1.3) * 0.1; }
        else { P.tail.rotation.y = Math.sin(t * 1.6 + m.coat) * 0.4; P.tail.rotation.x = sit ? 0.3 : -0.45 + Math.sin(t * 1.1) * 0.12; }
        P.tail.position.y = P.tailY - (sit ? P.legY * 0.5 : 0);
      }
      P.head.rotation.y += ((m.lookYaw || 0) - P.head.rotation.y) * Math.min(1, dt * 6);
      P.head.rotation.x = m.type === 'zombie' ? 0 : -atk * 0.4;
      P.head.position.y = P.headY + (sit ? 0.04 : 0) + (m.state === 'idle' ? Math.sin(t * 2 + m.coat) * 0.01 : 0);
      P.head.position.z = (m.type === 'lion' ? 0.56 : m.type === 'dog' ? 0.42 : m.type === 'cat' ? 0.36 : 0) + atk * 0.15;
      root.position.copy(m.pos); root.rotation.y = m.yaw;
      m.lightT -= dt;
      if (m.lightT <= 0) {
        m.lightT = 0.25;
        const x = Math.floor(m.pos.x), y = Math.floor(m.pos.y + 0.5), z = Math.floor(m.pos.z);
        const L = this.world.getBlockLight(x, y, z);
        m.skyB = this.skyOpen(x, y, z) ? 1 : 0.35; m.blockB = L ? Math.pow(L / 15, 1.4) : 0;
      }
      const b = Math.max(0.12, Math.max((m.skyB || 1) * this.daylight, m.blockB || 0));
      if (m.hurtT > 0) m.model.mat.color.setRGB(b * 1.3, b * 0.45, b * 0.45);
      else m.model.mat.color.setScalar(b);
    }
    damage(m, amount, fromPos, attacker) {
      if (m.dead) return;
      m.hp -= amount; m.hurtT = 0.2;
      if (fromPos) {
        const dx = m.pos.x - fromPos.x, dz = m.pos.z - fromPos.z, d = Math.hypot(dx, dz) || 1;
        const k = Math.min(9, 4 + amount * 0.4);
        m.vel.x = dx / d * k; m.vel.z = dz / d * k; m.vel.y = Math.max(m.vel.y, 4.5); m.knock = 0.25;
      }
      if (attacker === 'player' && m.neutral && !m.tamed) m.angry = 20; // provoked lions fight back
      if (this.sound) playSound(m.type === 'zombie' ? 'zombie' : 'hit', 0.5);
      if (m.hp <= 0) {
        this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z), 8, 0.8, 0.7, 0.8);
        this.remove(m);
      }
    }
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
      if (this.particles.length > 160) return;
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        s.scale.setScalar(0.3);
        s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.3, pos.z + (Math.random() - 0.5) * spread);
        this.scene.add(s); this.particles.push({ s, t: -i * 0.12, life, vy });
      }
    }
    name(m) { return { dog: 'Dog', cat: 'Cat', lion: 'Lion', zombie: 'Zombie' }[m.type]; }
    // right-click / tap: tame, then toggle sit <-> follow
    interact(m) {
      if (m.hostile) return null;
      if (m.angry > 0 && !m.tamed) return 'The lion is angry — let it calm down first!';
      let msg;
      if (!m.tamed) { m.tamed = true; m.wild = false; m.sitting = false; m.model.parts.collar.visible = true; msg = this.name(m) + ' tamed! It will follow you' + (m.protect ? ' and protect you.' : '.'); }
      else { m.sitting = !m.sitting; msg = this.name(m) + (m.sitting ? ' is sitting.' : ' is following you.'); }
      m.state = m.sitting ? 'sit' : 'follow'; m.vel.x = m.vel.z = 0;
      this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z), 3, 0.5, 0.8, 1.2);
      if (this.sound) playSound(m.type, 0.7);
      return msg;
    }
    // left-click / long-press: hit zombies & wild lions, pet tamed animals, shoo wild dogs/cats
    hit(m, fromPos) {
      if (m.hostile || (m.type === 'lion' && !m.tamed)) { this.damage(m, 4, fromPos, 'player'); return null; }
      if (m.tamed) { this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z), 2, 0.4, 0.8, 1); if (this.sound) playSound(m.type, 0.5); return null; }
      this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + 0.3, m.pos.z), 6, 0.6, 0.6, 0.7);
      this.remove(m);
      return 'Shooed away';
    }
    serialize() { return this.list.filter(m => !m.hostile && (m.tamed || !m.wild)).map(m => ({ t: m.type, c: m.coat, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2), r: +m.yaw.toFixed(2), tm: m.tamed ? 1 : 0, s: m.sitting ? 1 : 0, hp: m.hp })); }
    load(arr) { for (const o of arr || []) if (COATS[o.t] && !TYPES[o.t].hostile) this.spawn(o.t, o.x, o.y, o.z, { coat: o.c, yaw: o.r, tamed: !!o.tm, sitting: !!o.s, wild: false, hp: o.hp }); }
  }

  VC.Mobs = Mobs; VC.MobSounds = VC.Sound = { play: playSound, unlock: audio };
  VC.Particles = { puffTex };
})();
