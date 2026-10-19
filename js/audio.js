// Sound engine: one AudioContext, a small mixer (Master > Music / Effects / Mobs), synthesized sounds (no audio files),
// footsteps and block sounds per material, ambience (birds by day, crickets & owls at night, cave drips & drone,
// underwater hum) and gentle generative background music. Everything is made with WebAudio oscillators and noise.
window.VC = window.VC || {};
(function () {
  'use strict';
  const A = {
    ctx: null, unlocked: false, muted: false, played: 0, stats: {}, defs: {}, buses: {}, echoes: {},
    vol: { master: 80, music: 40, effects: 80, mobs: 80 },
    listener: { x: 0, y: 0, z: 0, yaw: 0 },
  };
  let noiseBuf = null;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- context, buses, echo ----------
  function ensure() {
    if (A.ctx) return A.ctx;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { A.ctx = new C(); } catch (e) { return null; }
    const ctx = A.ctx;
    const master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    A.buses.master = master;
    for (const b of ['music', 'effects', 'mobs']) { const g = ctx.createGain(); g.connect(master); A.buses[b] = g; }
    A.echoes.music = makeEcho(ctx, A.buses.music, 0.46, 0.38, 0.45, 2400);
    A.echoes.cave = makeEcho(ctx, A.buses.effects, 0.31, 0.45, 0.55, 1800);
    applyVolumes();
    if (ctx.addEventListener) ctx.addEventListener('statechange', () => { A.unlocked = ctx.state === 'running'; });
    return ctx;
  }
  function makeEcho(ctx, dest, time, feedback, wetGain, lpHz) {
    const input = ctx.createGain(), d = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
    d.delayTime.value = time; fb.gain.value = feedback; lp.type = 'lowpass'; lp.frequency.value = lpHz; wet.gain.value = wetGain;
    input.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(dest);
    return input;
  }
  // Called from user gestures (tap / click / key). iOS & Android only start audio inside a gesture.
  function unlock() {
    const ctx = ensure(); if (!ctx) return false;
    if (A.unlocked && ctx.state === 'running') return true;
    if (ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.then) p.then(() => { A.unlocked = ctx.state === 'running'; }, () => {}); } catch (e) {} }
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) {}
    A.unlocked = ctx.state === 'running';
    return true;
  }
  const curve = (v) => Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6);
  function applyVolumes() {
    const ctx = A.ctx; if (!ctx) return;
    const set = (g, v) => { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(v, ctx.currentTime, 0.03); };
    set(A.buses.master, A.muted ? 0 : curve(A.vol.master) * 1.2);
    set(A.buses.music, curve(A.vol.music) * 0.9);
    set(A.buses.effects, curve(A.vol.effects));
    set(A.buses.mobs, curve(A.vol.mobs));
  }
  function setVolumes(v) { Object.assign(A.vol, v); applyVolumes(); }
  function setMuted(m) { A.muted = !!m; applyVolumes(); if (A.muted) stopLoops(); }

  // ---------- building blocks ----------
  function noise(ctx) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; return n;
  }
  function env(ctx, g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur)); }
  // filtered noise burst
  function burst(ctx, out, t, o) {
    const n = noise(ctx), fl = ctx.createBiquadFilter(), g = ctx.createGain(), dur = o.dur || 0.1;
    fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + dur); fl.Q.value = o.q != null ? o.q : 1;
    env(ctx, g, t, o.a || 0.003, o.peak != null ? o.peak : 0.4, dur);
    n.connect(fl); fl.connect(g); g.connect(o.dest || out); n.start(t, Math.random() * 1.4); n.stop(t + dur + 0.05);
  }
  // oscillator note with optional pitch glide and low-pass
  function tone(ctx, out, t, o) {
    const osc = ctx.createOscillator(), g = ctx.createGain(), dur = o.dur || 0.2;
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f || 440, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    env(ctx, g, t, o.a || 0.005, o.peak != null ? o.peak : 0.3, dur);
    let src = osc; if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; osc.connect(fl); src = fl; }
    src.connect(g); g.connect(o.dest || out); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function register(name, fn, bus, dur) { A.defs[name] = { fn, bus: bus || 'effects', dur: dur || 2 }; }

  function panFor(pos) {
    const L = A.listener, dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return 0;
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw); // camera right
    return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.75;
  }
  // distance fade (linear) for a sound at pos heard up to `range` blocks away
  function at(pos, range) { const L = A.listener; const d = Math.hypot(pos.x - L.x, (pos.y || L.y) - L.y, pos.z - L.z); return Math.max(0, 1 - d / (range || 20)); }
  function play(name, vol, o) {
    o = o || {}; vol = vol == null ? 1 : vol;
    const ctx = A.ctx, def = A.defs[name];
    if (!ctx || !def || A.muted || ctx.state !== 'running' || vol < 0.004) return false;
    const t = ctx.currentTime + 0.005 + (o.delay || 0), bus = A.buses[o.bus || def.bus] || A.buses.effects;
    const out = ctx.createGain(); out.gain.value = Math.min(1.6, vol);
    const pan = o.pos ? panFor(o.pos) : 0;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out.connect(p); p.connect(bus); } else out.connect(bus);
    if (o.echo && A.echoes[o.echo]) { const s = ctx.createGain(); s.gain.value = o.echoAmt || 0.6; out.connect(s); s.connect(A.echoes[o.echo]); }
    A.stats[name] = (A.stats[name] || 0) + 1; A.played++;
    try { def.fn(ctx, out, t, o.pitch || 1, o); } catch (e) { console.warn('sound', name, e); }
    setTimeout(() => { try { out.disconnect(); } catch (e) {} }, (def.dur + (o.delay || 0)) * 1000 + 600);
    return true;
  }

  // ---------- materials: footsteps, breaking, placing ----------
  const MAT = {
    grass: (c, o, t, p, v) => { burst(c, o, t, { f: 1300 * p, q: 0.7, peak: 0.32 * v, dur: 0.09, a: 0.008 }); burst(c, o, t + 0.015, { type: 'highpass', f: 3200 * p, peak: 0.1 * v, dur: 0.07 }); },
    gravel: (c, o, t, p, v) => { for (let i = 0; i < 4; i++) burst(c, o, t + i * 0.017, { f: rnd(1300, 2600) * p, q: 2.2, peak: 0.3 * v, dur: 0.035 }); },
    sand: (c, o, t, p, v) => { burst(c, o, t, { type: 'highpass', f: 2200 * p, peak: 0.16 * v, dur: 0.13, a: 0.03 }); burst(c, o, t, { f: 900 * p, q: 0.6, peak: 0.08 * v, dur: 0.1, a: 0.02 }); },
    snow: (c, o, t, p, v) => { burst(c, o, t, { type: 'lowpass', f: 1000 * p, peak: 0.35 * v, dur: 0.14, a: 0.025 }); burst(c, o, t + 0.03, { f: 2400 * p, q: 3, peak: 0.07 * v, dur: 0.06 }); },
    wood: (c, o, t, p, v) => { tone(c, o, t, { type: 'triangle', f: 210 * p, f2: 140 * p, peak: 0.3 * v, dur: 0.07 }); burst(c, o, t, { type: 'lowpass', f: 1100 * p, peak: 0.25 * v, dur: 0.05 }); },
    stone: (c, o, t, p, v) => { burst(c, o, t, { f: 2500 * p, q: 1.4, peak: 0.32 * v, dur: 0.05 }); tone(c, o, t, { type: 'square', f: 380 * p, f2: 300 * p, peak: 0.05 * v, dur: 0.03, lp: 1400 }); },
    glass: (c, o, t, p, v) => { burst(c, o, t, { f: 3400 * p, q: 2, peak: 0.22 * v, dur: 0.04 }); tone(c, o, t, { f: 2300 * p, peak: 0.07 * v, dur: 0.09 }); },
    wool: (c, o, t, p, v) => { burst(c, o, t, { type: 'lowpass', f: 520 * p, peak: 0.34 * v, dur: 0.1, a: 0.015 }); },
    metal: (c, o, t, p, v) => { tone(c, o, t, { type: 'square', f: 520 * p, f2: 480 * p, peak: 0.06 * v, dur: 0.08, lp: 2500 }); burst(c, o, t, { f: 3000 * p, q: 4, peak: 0.18 * v, dur: 0.05 }); },
    water: (c, o, t, p, v) => { burst(c, o, t, { type: 'lowpass', f: 1400 * p, f2: 420, peak: 0.28 * v, dur: 0.2, a: 0.02 }); },
  };
  for (const m in MAT) {
    register('step_' + m, (c, o, t, p) => MAT[m](c, o, t, p, 1), 'effects', 0.4);
    register('place_' + m, (c, o, t, p) => { MAT[m](c, o, t, p * 0.85, 1.25); tone(c, o, t, { f: 130, f2: 65, peak: 0.28, dur: 0.07 }); }, 'effects', 0.4);
    register('break_' + m, (c, o, t, p) => {
      if (m === 'glass') { burst(c, o, t, { type: 'highpass', f: 3500, peak: 0.45, dur: 0.38, a: 0.002 }); for (let i = 0; i < 6; i++) tone(c, o, t + rnd(0, 0.18), { f: rnd(2400, 5200), peak: 0.07, dur: rnd(0.05, 0.14) }); return; }
      for (let i = 0; i < 4; i++) MAT[m](c, o, t + i * 0.035 + rnd(0, 0.015), p * rnd(0.72, 0.95), 1.3);
      tone(c, o, t, { f: 120 * p, f2: 55, peak: 0.32, dur: 0.12 });
    }, 'effects', 0.6);
  }
  const B = VC.B, BL = VC.Blocks;
  function material(id) {
    if (id == null || id <= 0) return 'stone';
    if (BL.FLUID[id]) return 'water';
    if (BL.doorInfo(id)) return BL.defs[id].iron ? 'metal' : 'wood';
    if (BL.bedInfo(id)) return 'wool';
    switch (id) {
      case B.GRASS: case B.LEAVES: case B.BIRCH_LEAVES: case B.TALLGRASS: case B.ROSE: case B.DANDELION: case B.BLUE_FLOWER:
      case B.TULIP: case B.MUSHROOM: case B.HAY: case B.CACTUS: case B.MELON: case B.PUMPKIN: case B.JACK_O_LANTERN: return 'grass';
      case B.DIRT: case B.GRAVEL: return 'gravel';
      case B.SAND: return 'sand';
      case B.SNOW: return 'snow';
      case B.LOG: case B.BIRCH_LOG: case B.PLANKS: case B.BOOKSHELF: case B.CRAFTING_TABLE: case B.OAK_WINDOW: case B.TORCH: case B.TORCH_PX: case B.TORCH_NX: case B.TORCH_PZ: case B.TORCH_NZ: case B.TNT: return 'wood';
      case B.GLASS: case B.GLASS_PANE: case B.STAINED_BLUE: case B.STAINED_AMBER: case B.GLOWSTONE: return 'glass';
      case B.LANTERN: return 'metal';
    }
    if (id >= B.WOOL_WHITE && id <= B.WOOL_BLUE || id >= B.WOOL_YELLOW && id <= B.WOOL_GRAY) return 'wool';
    return 'stone';
  }
  function step(id, vol, pos) { return play('step_' + material(id), (vol == null ? 0.5 : vol), { pitch: rnd(0.88, 1.12), pos }); }
  function blockSound(kind, id, pos) { return play(kind + '_' + material(id), kind === 'break' ? 0.7 : 0.6, { pitch: rnd(0.92, 1.08), pos }); }

  // ---------- combat, items, creatures ----------
  register('swing', (c, o, t, p) => {
    const n = noise(c), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = 'bandpass'; fl.Q.value = 1.6; fl.frequency.setValueAtTime(420 * p, t); fl.frequency.exponentialRampToValueAtTime(2000 * p, t + 0.08); fl.frequency.exponentialRampToValueAtTime(600 * p, t + 0.2);
    env(c, g, t, 0.04, 0.32, 0.22); n.connect(fl); fl.connect(g); g.connect(o); n.start(t, Math.random()); n.stop(t + 0.25);
  }, 'effects', 0.4);
  register('sword_hit', (c, o, t, p) => { burst(c, o, t, { type: 'lowpass', f: 2600 * p, peak: 0.5, dur: 0.08 }); tone(c, o, t, { type: 'triangle', f: 1150 * p, f2: 720 * p, peak: 0.1, dur: 0.14 }); tone(c, o, t, { f: 150, f2: 60, peak: 0.45, dur: 0.1 }); }, 'effects', 0.4);
  register('punch', (c, o, t, p) => { tone(c, o, t, { f: 170 * p, f2: 60, peak: 0.5, dur: 0.09 }); burst(c, o, t, { type: 'lowpass', f: 1200, peak: 0.3, dur: 0.05 }); }, 'effects', 0.3);
  register('axe_hit', (c, o, t, p) => { tone(c, o, t, { f: 110 * p, f2: 50, peak: 0.6, dur: 0.14 }); burst(c, o, t, { type: 'lowpass', f: 1800 * p, peak: 0.5, dur: 0.1 }); tone(c, o, t, { type: 'triangle', f: 700 * p, f2: 500, peak: 0.08, dur: 0.12 }); }, 'effects', 0.4);
  register('bow_draw', (c, o, t, p) => { burst(c, o, t, { f: 380 * p, f2: 1500 * p, q: 7, peak: 0.14, a: 0.3, dur: 0.75 }); tone(c, o, t, { type: 'sawtooth', f: 85 * p, f2: 150 * p, peak: 0.035, a: 0.3, dur: 0.7, lp: 700 }); }, 'effects', 1);
  register('bow_twang', (c, o, t, p) => { tone(c, o, t, { type: 'triangle', f: 400 * p, f2: 150 * p, peak: 0.4, dur: 0.26 }); tone(c, o, t, { f: 800 * p, f2: 320 * p, peak: 0.1, dur: 0.12 }); burst(c, o, t, { type: 'highpass', f: 2000, peak: 0.16, dur: 0.07 }); }, 'effects', 0.5);
  register('arrow_hit', (c, o, t, p) => { tone(c, o, t, { f: 230 * p, f2: 90, peak: 0.45, dur: 0.08 }); burst(c, o, t, { f: 900 * p, peak: 0.3, dur: 0.05 }); }, 'effects', 0.3);
  register('arrow_block', (c, o, t, p) => { tone(c, o, t, { type: 'triangle', f: 540 * p, f2: 310 * p, peak: 0.28, dur: 0.06 }); burst(c, o, t, { f: 2100 * p, q: 3, peak: 0.3, dur: 0.04 });
    const osc = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); osc.frequency.value = 160 * p; lfo.frequency.value = 26; lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain);
    env(c, g, t + 0.02, 0.005, 0.07, 0.28); osc.connect(g); g.connect(o); osc.start(t); lfo.start(t); osc.stop(t + 0.32); lfo.stop(t + 0.32); }, 'effects', 0.5);
  register('trident_throw', (c, o, t, p) => { burst(c, o, t, { f: 300 * p, f2: 1000 * p, q: 2, peak: 0.45, a: 0.05, dur: 0.36 }); tone(c, o, t, { f: 620 * p, f2: 930 * p, peak: 0.06, dur: 0.3 }); }, 'effects', 0.5);
  register('trident_return', (c, o, t, p) => { [660, 880, 1320, 1760].forEach((f, i) => tone(c, o, t + i * 0.07, { f: f * p, peak: 0.09, dur: 0.35 })); }, 'effects', 0.8);
  register('eat', (c, o, t, p) => { for (let i = 0; i < 3; i++) { const s = t + i * 0.2; burst(c, o, s, { f: rnd(1500, 2200) * p, q: 1.1, peak: 0.36, dur: 0.07 }); burst(c, o, s + 0.01, { type: 'lowpass', f: 600, peak: 0.25, dur: 0.06 }); } }, 'effects', 0.8);
  register('burp', (c, o, t, p) => { tone(c, o, t, { type: 'sawtooth', f: 115 * p, f2: 72 * p, peak: 0.28, dur: 0.32, lp: 520, a: 0.03 }); }, 'effects', 0.5);
  register('love', (c, o, t, p) => { [880, 1108, 1318].forEach((f, i) => tone(c, o, t + i * 0.09, { f: f * p, peak: 0.08, dur: 0.25 })); }, 'effects', 0.6);
  register('heal', (c, o, t, p) => { tone(c, o, t, { f: 660 * p, f2: 990 * p, peak: 0.08, dur: 0.3 }); }, 'effects', 0.4);
  register('pop', (c, o, t, p) => { tone(c, o, t, { f: 500 * p, f2: 1200 * p, peak: 0.15, dur: 0.08 }); }, 'effects', 0.3);
  // generic creature hurt / death voices; pitch per species (bears low, cats & spiders high)
  register('mob_hurt', (c, o, t, p) => {
    const osc = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(330 * p, t); osc.frequency.exponentialRampToValueAtTime(190 * p, t + 0.18);
    fl.type = 'bandpass'; fl.frequency.value = 950 * p; fl.Q.value = 1.8; env(c, g, t, 0.008, 0.42, 0.2);
    osc.connect(fl); fl.connect(g); g.connect(o); osc.start(t); osc.stop(t + 0.24);
    burst(c, o, t, { type: 'lowpass', f: 1500, peak: 0.28, dur: 0.05 });
  }, 'mobs', 0.4);
  register('mob_death', (c, o, t, p) => {
    const osc = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300 * p, t); osc.frequency.exponentialRampToValueAtTime(85 * p, t + 0.55);
    fl.type = 'bandpass'; fl.frequency.value = 760 * p; fl.Q.value = 1.4; env(c, g, t, 0.01, 0.42, 0.58);
    osc.connect(fl); fl.connect(g); g.connect(o); osc.start(t); osc.stop(t + 0.62);
    burst(c, o, t + 0.32, { type: 'lowpass', f: 900, f2: 200, peak: 0.32, dur: 0.45, a: 0.02 });
  }, 'mobs', 1);
  register('splash', (c, o, t, p) => { burst(c, o, t, { f: 1600 * p, q: 0.7, peak: 0.3, dur: 0.2 }); burst(c, o, t + 0.02, { type: 'lowpass', f: 900 * p, f2: 300, peak: 0.25, dur: 0.3, a: 0.02 }); }, 'effects', 0.5);
  register('swim', (c, o, t, p) => { burst(c, o, t, { type: 'lowpass', f: 950 * p, f2: 480, peak: 0.2, dur: 0.26, a: 0.05 }); }, 'effects', 0.4);
  register('bubble', (c, o, t, p) => { tone(c, o, t, { f: 380 * p, f2: 950 * p, peak: 0.07, dur: 0.06 }); }, 'effects', 0.2);
  register('land', (c, o, t, p) => { tone(c, o, t, { f: 115 * p, f2: 48, peak: 0.42, dur: 0.11 }); burst(c, o, t, { type: 'lowpass', f: 700, peak: 0.3, dur: 0.07 }); }, 'effects', 0.3);
  register('hoof', (c, o, t, p) => { tone(c, o, t, { type: 'triangle', f: 300 * p, f2: 180 * p, peak: 0.3, dur: 0.05 }); burst(c, o, t, { f: 1600 * p, q: 2.5, peak: 0.22, dur: 0.035 }); }, 'effects', 0.2);
  register('click', (c, o, t) => { tone(c, o, t, { type: 'square', f: 1250, peak: 0.04, dur: 0.025 }); }, 'effects', 0.2);
  // ---------- ambience ----------
  register('bird', (c, o, t, p) => {
    const kind = Math.random();
    if (kind < 0.3) { // two-note whistle
      tone(c, o, t, { f: 2100 * p, f2: 2300 * p, peak: 0.07, a: 0.03, dur: 0.24 }); tone(c, o, t + 0.3, { f: 2800 * p, f2: 2600 * p, peak: 0.06, a: 0.03, dur: 0.28 });
      return;
    }
    const n = 2 + ((Math.random() * 4) | 0), f = rnd(2600, 4200) * p;
    for (let i = 0; i < n; i++) {
      const s = t + i * rnd(0.1, 0.17), osc = c.createOscillator(), g = c.createGain();
      osc.frequency.setValueAtTime(f, s); osc.frequency.linearRampToValueAtTime(f * 1.35, s + 0.035); osc.frequency.linearRampToValueAtTime(f * 0.88, s + 0.08);
      env(c, g, s, 0.006, 0.07, 0.09); osc.connect(g); g.connect(o); osc.start(s); osc.stop(s + 0.11);
    }
  }, 'effects', 1.5);
  register('cricket', (c, o, t, p) => {
    const f = 4300 * p;
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) { const s = t + k * 0.32 + i * 0.026; tone(c, o, s, { f, peak: 0.035, a: 0.003, dur: 0.018 }); }
  }, 'effects', 1.2);
  register('owl', (c, o, t, p) => { tone(c, o, t, { f: 390 * p, f2: 360 * p, peak: 0.08, a: 0.05, dur: 0.32, lp: 900 }); tone(c, o, t + 0.5, { f: 380 * p, f2: 340 * p, peak: 0.06, a: 0.05, dur: 0.24, lp: 900 }); tone(c, o, t + 0.8, { f: 400 * p, f2: 330 * p, peak: 0.08, a: 0.06, dur: 0.5, lp: 900 }); }, 'effects', 1.6);
  register('drip', (c, o, t, p) => { tone(c, o, t, { f: 1500 * p, f2: 650 * p, peak: 0.14, dur: 0.09 }); }, 'effects', 0.4);
  register('cave_rumble', (c, o, t, p) => { burst(c, o, t, { type: 'lowpass', f: 140 * p, peak: 0.5, a: 1.2, dur: 3.2 }); tone(c, o, t, { f: 46 * p, f2: 38 * p, peak: 0.15, a: 1, dur: 3 }); }, 'effects', 3.5);

  // continuous loops (fade in / out): cave drone, outdoor breeze, underwater hum
  const loops = {};
  function loop(name, setup) {
    const ctx = A.ctx; if (loops[name] || !ctx) return loops[name];
    const n = noise(ctx); n.loop = true; const g = ctx.createGain(); g.gain.value = 0;
    setup(ctx, n, g); g.connect(A.buses.effects); n.start();
    return (loops[name] = { n, g });
  }
  function setLoop(name, v) { const l = loops[name]; if (l) l.g.gain.setTargetAtTime(v, A.ctx.currentTime, 0.8); }
  function stopLoops() { for (const k in loops) setLoop(k, 0); }
  const amb = { bird: 3, cricket: 2, owl: 25, drip: 4, rumble: 20, bubble: 2, t: 0 };
  function around(r) { const L = A.listener, a = Math.random() * Math.PI * 2, d = rnd(4, r); return { x: L.x + Math.cos(a) * d, y: L.y + rnd(0, 6), z: L.z + Math.sin(a) * d }; }
  // s: { active, day (0..1), cave (bool), outdoors (bool), underwater (bool) }
  function ambient(dt, s) {
    const ctx = A.ctx; if (!ctx || ctx.state !== 'running') return;
    if (A.muted || !s.active) { stopLoops(); music.idle(dt); return; }
    loop('cave', (c, n, g) => { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170; n.connect(f); f.connect(g); });
    loop('breeze', (c, n, g) => { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 550; f.Q.value = 0.45; n.connect(f); f.connect(g); });
    loop('water', (c, n, g) => { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 330; n.connect(f); f.connect(g); });
    setLoop('cave', s.cave && !s.underwater ? 0.22 : 0);
    setLoop('breeze', s.outdoors && !s.underwater ? 0.018 + 0.012 * s.day : 0);
    setLoop('water', s.underwater ? 0.3 : 0);
    const day = s.day > 0.6, night = s.day < 0.35;
    if (s.outdoors && !s.underwater && !s.cave) {
      if (day && (amb.bird -= dt) <= 0) { amb.bird = rnd(2.5, 8); play('bird', rnd(0.35, 0.8), { pitch: rnd(0.85, 1.2), pos: around(18) }); }
      if (night && (amb.cricket -= dt) <= 0) { amb.cricket = rnd(1.2, 3.8); play('cricket', rnd(0.3, 0.7), { pitch: rnd(0.95, 1.08), pos: around(12) }); }
      if (night && (amb.owl -= dt) <= 0) { amb.owl = rnd(25, 60); play('owl', 0.5, { pitch: rnd(0.95, 1.05), pos: around(25) }); }
    }
    if (s.cave && !s.underwater) {
      if ((amb.drip -= dt) <= 0) { amb.drip = rnd(2.5, 7); play('drip', rnd(0.3, 0.7), { pitch: rnd(0.8, 1.25), pos: around(10), echo: 'cave' }); }
      if ((amb.rumble -= dt) <= 0) { amb.rumble = rnd(22, 50); play('cave_rumble', 0.55, { pitch: rnd(0.8, 1.2), echo: 'cave', echoAmt: 0.3 }); }
    }
    if (s.underwater && (amb.bubble -= dt) <= 0) { amb.bubble = rnd(0.6, 2.2); play('bubble', 0.5, { pitch: rnd(0.8, 1.4) }); }
    music.update(dt, s);
  }

  // ---------- gentle generative music ----------
  // Short pieces (soft pads + sparse plucked melody in a pentatonic scale) with long silences between them.
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROGS = [[[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], [[0, 4, 7], [-7, -3, 0], [-3, 0, 4], [-5, -1, 2]], [[-3, 0, 4], [-7, -3, 0], [0, 4, 7], [-5, -1, 2]], [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]]];
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  const music = {
    wait: 9, playing: false, bar: 0, bars: 0, nextBar: 0, root: 60, prog: PROGS[0], barLen: 3.2, pieces: 0, last: 0,
    idle(dt) { /* keeps the timer still while paused or muted */ },
    start(s) {
      this.playing = true; this.bar = 0; this.bars = 12 + ((Math.random() * 3) | 0) * 4; this.pieces++;
      const night = s && s.day < 0.35;
      this.root = (night ? [55, 57, 53] : [60, 62, 64, 57])[(Math.random() * (night ? 3 : 4)) | 0];
      this.prog = PROGS[(Math.random() * PROGS.length) | 0]; this.barLen = night ? 3.8 : 3.2;
      this.nextBar = A.ctx.currentTime + 0.2; this.last = -1;
    },
    update(dt, s) {
      if (A.vol.music <= 0) { this.playing = false; return; }
      if (!this.playing) { this.wait -= dt; if (this.wait <= 0) this.start(s); return; }
      const ctx = A.ctx, now = ctx.currentTime;
      if (now < this.nextBar - 0.25) return;
      if (this.bar >= this.bars) { this.playing = false; this.wait = rnd(45, 110); return; }
      this.playBar(this.nextBar, this.prog[this.bar % 4], this.bar >= this.bars - 1);
      this.bar++; this.nextBar += this.barLen;
    },
    playBar(t, chord, last) {
      const ctx = A.ctx, bus = A.buses.music, echo = A.echoes.music, L = this.barLen;
      const out = ctx.createGain(); out.gain.value = 1; out.connect(bus); const send = ctx.createGain(); send.gain.value = 0.5; out.connect(send); send.connect(echo);
      // pad: the chord an octave down, slow swell, two detuned voices
      for (const n of chord) for (const det of [-5, 5]) tone(ctx, out, t, { type: 'triangle', f: mtof(this.root - 12 + n), detune: det, a: 1.1, peak: 0.028, dur: L * (last ? 2.2 : 1.25), lp: 900 });
      tone(ctx, out, t, { f: mtof(this.root - 24 + chord[0]), a: 0.6, peak: 0.05, dur: L * 1.1 });
      // melody: 0-3 plucked notes per bar from the scale, preferring chord tones
      const count = last ? 1 : [1, 2, 2, 3, 0][(Math.random() * 5) | 0];
      for (let i = 0; i < count; i++) {
        const st = t + (i === 0 ? 0 : (i / count) * L + rnd(-0.15, 0.15));
        let deg = Math.random() < 0.55 ? chord[(Math.random() * 3) | 0] + 12 : PENTA[(Math.random() * PENTA.length) | 0];
        if (this.last >= 0 && Math.abs(deg - this.last) > 9) deg = this.last + Math.sign(deg - this.last) * 4;
        this.last = deg;
        const f = mtof(this.root + deg);
        tone(ctx, out, st, { f, a: 0.012, peak: 0.07, dur: 1.9 }); tone(ctx, out, st, { f: f * 2, a: 0.01, peak: 0.018, dur: 0.9 });
      }
      setTimeout(() => { try { out.disconnect(); send.disconnect(); } catch (e) {} }, (L * 2.5 + 3) * 1000);
    },
  };
  function setListener(x, y, z, yaw) { const L = A.listener; L.x = x; L.y = y; L.z = z; L.yaw = yaw; }

  VC.Audio = Object.assign(A, { ensure, unlock, play, register, step, blockSound, material, ambient, setVolumes, setMuted, setListener, at, noise, env, burst, tone, music, loops });
})();
