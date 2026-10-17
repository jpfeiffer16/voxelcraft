// Touch controls + tilt (gyro) look for phones/tablets. Desktop is untouched.
(function () {
  'use strict';
  const game = window.game;
  if (!game || !game.isMobile) return;
  const $ = (id) => document.getElementById(id);
  const settings = game.settings;
  const ui = $('touch-ui'), joyBase = $('joy-base'), joyKnob = $('joy-knob');
  const canvas = game.renderer.domElement;

  // Block browser gestures (pinch zoom, double-tap zoom, pull-to-refresh, scrolling)
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.cancelable && !(e.target.closest && e.target.closest('.overlay'))) e.preventDefault(); }, { passive: false });

  { const b = $('btn-play'); b.textContent = b.textContent.replace('Click', 'Tap'); }

  game.onState = (s) => {
    ui.classList.toggle('hidden', s !== 'playing');
    if (s !== 'playing') { releaseAll(); }
  };

  // ---------- joystick + look (multi-touch) ----------
  const JOY_R = 55;
  let joy = null;          // { id, ox, oy }
  const looks = new Map(); // id -> { x, y, sx, sy, t, moved, breaking }
  const player = () => game.player;

  function joyHome() { joyBase.style.left = ''; joyBase.style.top = ''; joyKnob.style.transform = ''; joyBase.classList.remove('active'); }
  function setJoy(dx, dy) {
    const d = Math.hypot(dx, dy), k = d > JOY_R ? JOY_R / d : 1;
    dx *= k; dy *= k;
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    let ax = dx / JOY_R, ay = -dy / JOY_R;
    const m = Math.hypot(ax, ay);
    if (m < 0.12) { ax = 0; ay = 0; } // dead zone
    player().analog.x = ax; player().analog.y = ay;
  }
  function releaseAll() {
    joy = null; joyHome(); looks.clear();
    const p = player(); if (p) { p.analog.x = 0; p.analog.y = 0; }
    for (const b of document.querySelectorAll('.tbtn.pressed')) b.classList.remove('pressed');
    holdBreak = false;
  }

  let holdBreak = false, breakTimer = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.cancelable) e.preventDefault();
    if (game.state !== 'playing') return;
    for (const t of e.changedTouches) {
      if (!joy && t.clientX < window.innerWidth * 0.42 && t.clientY > window.innerHeight * 0.3) {
        joy = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        joyBase.style.left = t.clientX + 'px'; joyBase.style.top = t.clientY + 'px'; joyBase.classList.add('active');
        setJoy(0, 0);
      } else {
        looks.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now(), moved: false, breaking: false });
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy && t.identifier === joy.id) { setJoy(t.clientX - joy.ox, t.clientY - joy.oy); continue; }
      const L = looks.get(t.identifier); if (!L) continue;
      const dx = t.clientX - L.x, dy = t.clientY - L.y; L.x = t.clientX; L.y = t.clientY;
      if (Math.hypot(t.clientX - L.sx, t.clientY - L.sy) > 12) L.moved = true;
      if (game.state !== 'playing') continue;
      const s = settings.lookSens * 0.0006;
      const p = player();
      p.yaw -= dx * s; p.pitch = clampPitch(p.pitch - dy * s);
    }
  }, { passive: false });
  const endTouch = (e) => {
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy && t.identifier === joy.id) { joy = null; joyHome(); player().analog.x = 0; player().analog.y = 0; continue; }
      const L = looks.get(t.identifier); if (!L) continue;
      looks.delete(t.identifier);
      // quick tap without dragging -> place block at the crosshair
      if (!L.moved && !L.breaking && performance.now() - L.t < 300 && game.state === 'playing') game.placeBlock();
    }
  };
  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });
  function clampPitch(v) { return Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, v)); }

  // ---------- buttons ----------
  function hold(id, down, up) {
    const el = $(id);
    el.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); down && down(); }, { passive: false });
    const end = (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); el.classList.remove('pressed'); up && up(); };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
    // mouse fallback (e.g. ?mobile=1 on desktop)
    el.addEventListener('mousedown', (e) => { e.preventDefault(); down && down(); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); up && up(); });
    return el;
  }
  hold('tb-jump', () => { player().keys.Space = true; }, () => { player().keys.Space = false; });
  hold('tb-down', () => { player().keys.ShiftLeft = true; }, () => { player().keys.ShiftLeft = false; });
  hold('tb-break', () => { game.breakBlock(); holdBreak = true; breakTimer = 0.3; }, () => { holdBreak = false; });
  let placeRepeat = false, placeTimer = 0;
  hold('tb-place', () => { game.placeBlock(); placeRepeat = true; placeTimer = 0.35; }, () => { placeRepeat = false; });
  const sprintBtn = hold('tb-sprint', () => { const p = player(); p.touchSprint = !p.touchSprint; sprintBtn.classList.toggle('on', p.touchSprint); });
  const flyBtn = hold('tb-fly', () => { game.toggleFly(); });
  hold('tb-menu', () => { game.setState('paused'); });
  hold('tb-recenter', () => recenter(true));
  const tiltBtn = hold('tb-tilt', () => toggleTilt());

  // ---------- tilt / gyro look ----------
  const zee = new THREE.Vector3(0, 0, 1), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const qDev = new THREE.Quaternion(), qTmp = new THREE.Quaternion(), eDev = new THREE.Euler(), eOut = new THREE.Euler();
  let tiltPermission = typeof DeviceOrientationEvent === 'undefined' ? 'unsupported'
    : typeof DeviceOrientationEvent.requestPermission === 'function' ? 'prompt' : 'granted';
  let tiltSeen = false, prev = null, pendYaw = 0, pendPitch = 0;
  function screenAngle() { return ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * Math.PI / 180; }
  function onOrient(ev) {
    if (ev.alpha == null && ev.beta == null) return;
    tiltSeen = true; updateTiltUI();
    const D = Math.PI / 180;
    eDev.set((ev.beta || 0) * D, (ev.alpha || 0) * D, -(ev.gamma || 0) * D, 'YXZ');
    qDev.setFromEuler(eDev).multiply(q1).multiply(qTmp.setFromAxisAngle(zee, -screenAngle()));
    eOut.setFromQuaternion(qDev, 'YXZ');
    const cur = { yaw: eOut.y, pitch: eOut.x };
    if (prev && settings.tilt && game.state === 'playing') {
      let dy = cur.yaw - prev.yaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
      const dp = cur.pitch - prev.pitch;
      const k = settings.tiltSens / 10;
      if (Math.abs(cur.pitch) < 1.35 && Math.abs(dy) < 0.5) pendYaw += dy * k; // yaw is unstable when pointing straight up/down
      if (Math.abs(dp) < 0.5) pendPitch += dp * k;
    }
    prev = cur;
  }
  function startListening() {
    window.removeEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientation', onOrient);
  }
  function recenter(level) {
    prev = null; pendYaw = 0; pendPitch = 0;
    if (level) { player().pitch = 0; game.toast('View recentered'); }
  }
  async function requestTilt() {
    if (tiltPermission === 'prompt') {
      try { tiltPermission = await DeviceOrientationEvent.requestPermission(); } catch (e) { tiltPermission = 'denied'; }
      if (tiltPermission === 'granted') { settings.tilt = true; game.saveSettings(); }
    }
    if (tiltPermission === 'granted') startListening();
    updateTiltUI();
  }
  function toggleTilt() {
    if (tiltPermission === 'prompt') { requestTilt(); return; }
    if (tiltPermission !== 'granted' || !tiltSeen) { game.toast(tiltPermission === 'denied' ? 'Tilt permission denied (check browser settings)' : 'Tilt sensor not available'); return; }
    settings.tilt = !settings.tilt; game.saveSettings(); recenter(false);
    game.toast(settings.tilt ? 'Tilt look on' : 'Tilt look off'); updateTiltUI();
  }
  function updateTiltUI() {
    const active = tiltPermission === 'granted' && tiltSeen && settings.tilt;
    tiltBtn.classList.toggle('on', active);
    let label;
    if (tiltPermission === 'unsupported') label = 'Tilt look not supported';
    else if (tiltPermission === 'prompt') label = 'Enable tilt look';
    else if (tiltPermission === 'denied') label = 'Tilt permission denied';
    else if (!tiltSeen) label = 'Tilt: waiting for sensor…';
    else label = settings.tilt ? 'Tilt look: ON (tap to turn off)' : 'Tilt look: OFF (tap to turn on)';
    for (const id of ['btn-tilt-start', 'btn-tilt-pause']) { const b = $(id); b.textContent = label; b.classList.toggle('on', active); }
  }
  for (const id of ['btn-tilt-start', 'btn-tilt-pause']) $(id).addEventListener('click', (e) => { e.stopPropagation(); if (tiltPermission === 'prompt') requestTilt(); else toggleTilt(); });
  $('btn-recenter').addEventListener('click', () => recenter(true));
  // iOS: ask for motion permission on the same tap that starts the game
  $('btn-play').addEventListener('click', () => { if (tiltPermission === 'prompt' && settings.tilt) requestTilt(); recenter(false); }, true);
  $('btn-resume').addEventListener('click', () => recenter(false), true);
  if (tiltPermission === 'granted') startListening();
  updateTiltUI();
  window.addEventListener('orientationchange', () => recenter(false));
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => recenter(false));

  function bindSlider(id, key) {
    const el = $(id), val = $(id + '-val');
    el.value = settings[key]; val.textContent = settings[key];
    el.addEventListener('input', () => { settings[key] = +el.value; val.textContent = el.value; game.saveSettings(); });
  }
  bindSlider('tiltSens', 'tiltSens'); bindSlider('lookSens', 'lookSens');

  // ---------- per-frame: smoothing, held actions, button states ----------
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (game.state !== 'playing') { pendYaw = pendPitch = 0; return; }
    const p = player();
    // smooth tilt deltas (exponential)
    const a = 1 - Math.exp(-dt * 16);
    const y = pendYaw * a, pp = pendPitch * a;
    pendYaw -= y; pendPitch -= pp;
    p.yaw += y; p.pitch = clampPitch(p.pitch + pp);
    // long-press on the world = break (repeats while held)
    for (const L of looks.values()) {
      if (!L.moved && now - L.t > 380) {
        if (!L.breaking) { L.breaking = true; L.next = 0; }
        L.next -= dt; if (L.next <= 0) { game.breakBlock(); L.next = 0.3; if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {} }
      }
    }
    if (holdBreak) { breakTimer -= dt; if (breakTimer <= 0) { breakTimer = 0.25; game.breakBlock(); } }
    if (placeRepeat) { placeTimer -= dt; if (placeTimer <= 0) { placeTimer = 0.25; game.placeBlock(); } }
    flyBtn.classList.toggle('on', p.flying);
    $('tb-down').classList.toggle('show', p.flying);
    $('tb-jump').textContent = p.flying ? '▲' : '▲';
  }
  requestAnimationFrame(tick);

  // expose for testing
  game.mobile = { recenter, get tiltPermission() { return tiltPermission; }, get tiltSeen() { return tiltSeen; }, onOrient };
})();
// sync with the state main.js may already be in (e.g. ?test=1 auto-start)
if (window.game && window.game.onState) window.game.onState(window.game.state);
