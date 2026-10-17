// VoxelCraft main: renderer, sky, chunk streaming, UI, input, persistence.
(function () {
  'use strict';
  const { CS, CH, SEA, SAVE_KEY } = VC.CONST;
  const B = VC.B, defs = VC.Blocks.defs;
  const $ = (id) => document.getElementById(id);
  const MOBILE = !!VC.isMobile;
  const SETTINGS_KEY = MOBILE ? 'voxelcraft.settings.mobile.v1' : 'voxelcraft.settings.v1';
  const DAY_LENGTH = 600; // seconds per full day

  window.addEventListener('error', (e) => { const el = $('error'); el.classList.remove('hidden'); el.textContent += (e.message || e) + '\n'; });

  // ---------- settings ----------
  const settings = Object.assign({ renderDistance: MOBILE ? 4 : 8, sensitivity: 8, fov: MOBILE ? 70 : 75, showDebug: !MOBILE, tilt: true, tiltSens: 10, lookSens: 10, sound: true }, safeParse(localStorage.getItem(SETTINGS_KEY)) || {});
  function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

  // ---------- renderer ----------
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  $('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.08, 1200);
  scene.fog = new THREE.Fog(0x87ceeb, 60, 120);
  scene.background = new THREE.Color(0x87ceeb);
  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  // ---------- textures & materials ----------
  const atlas = VC.Textures.buildAtlas();
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const matOpaque = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true });
  const matCutout = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const matWater = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide });
  const terrainMats = [matOpaque, matCutout, matWater];
  // Vertex colour r = sky light (scaled by daylight), g = block light (torches; warm, flickering)
  const lightUniforms = { uDay: { value: 1 }, uTime: { value: 0 } };
  for (const m of terrainMats) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uDay = lightUniforms.uDay; sh.uniforms.uTime = lightUniforms.uTime;
      sh.vertexShader = 'varying float vFlick;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFlick = position.x * 1.7 + position.z * 2.3 + position.y * 0.9;');
      sh.fragmentShader = 'uniform float uDay;\nuniform float uTime;\nvarying float vFlick;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        '  float flick = 0.9 + 0.06 * sin(uTime * 10.0 + vFlick) + 0.04 * sin(uTime * 23.0 + vFlick * 1.7);\n' +
        '  vec3 lightC = max(vec3(vColor.r * uDay), vColor.g * flick * vec3(1.0, 0.86, 0.66));\n' +
        '  diffuseColor.rgb *= lightC;');
    };
  }

  // ---------- sky: sun, moon, stars, clouds ----------
  function discTexture(draw) { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; }
  const sunTex = discTexture((g) => { g.fillStyle = 'rgba(255,240,180,0.25)'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff6c8'; g.fillRect(14, 14, 36, 36); g.fillStyle = '#fffbe8'; g.fillRect(20, 20, 24, 24); });
  const moonTex = discTexture((g) => { g.fillStyle = '#dfe4ee'; g.fillRect(16, 16, 32, 32); g.fillStyle = '#b8bfcc'; g.fillRect(22, 22, 8, 8); g.fillRect(34, 32, 8, 6); g.fillRect(26, 38, 5, 5); });
  const skyMat = (t) => new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), skyMat(sunTex));
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(45, 45), skyMat(moonTex));
  sun.renderOrder = moon.renderOrder = -2;
  scene.add(sun, moon);
  const starGeo = new THREE.BufferGeometry();
  { const n = 1400, p = new Float32Array(n * 3), r = VC.Noise.mulberry32(42); for (let i = 0; i < n; i++) { const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); p[i * 3] = s * Math.cos(th) * 500; p[i * 3 + 1] = u * 500; p[i * 3 + 2] = s * Math.sin(th) * 500; } starGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
  stars.renderOrder = -3; scene.add(stars);
  const cloudCanvas = document.createElement('canvas'); cloudCanvas.width = cloudCanvas.height = 128;
  { const g = cloudCanvas.getContext('2d'), n = new VC.Noise.Simplex(7); for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { // tileable via 4D-ish torus trick on 2D: sample sum of wrapped offsets
      const a = x / 128 * Math.PI * 2, b = y / 128 * Math.PI * 2;
      const v = n.noise3(Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(b) * 3 + Math.sin(b) * 1.7) + 0.5 * n.noise3(Math.cos(a) * 6 + 9, Math.sin(b) * 6, Math.sin(a) * 6);
      if (v > 0.25) { g.fillStyle = '#fff'; g.fillRect(x, y, 1, 1); } } }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas); cloudTex.magFilter = THREE.NearestFilter; cloudTex.minFilter = THREE.NearestFilter; cloudTex.generateMipmaps = false;
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  const CLOUD_SIZE = 1536;
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(CLOUD_SIZE, CLOUD_SIZE), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.1 }));
  clouds.rotation.x = -Math.PI / 2; clouds.position.y = 118; clouds.renderOrder = 2; scene.add(clouds);

  // ---------- selection outline ----------
  const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
  selBox.visible = false; scene.add(selBox);

  // ---------- game state ----------
  let world = null, player = null;
  let state = 'title'; // title | playing | paused | inventory
  let worldTime = 0.05;
  let hotbar = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.TORCH, B.DOG_EGG, B.CAT_EGG];
  let mobs = null;
  let selected = 0;
  let saveTimer = 0, dirtySave = false;
  const testMode = /[?&]test=1/.test(location.search);
  const noLock = testMode || MOBILE; // touch devices never use pointer lock

  function hashSeed(s) { s = String(s).trim(); if (/^-?\d+$/.test(s)) return parseInt(s, 10) | 0; let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }

  function disposeWorld() {
    if (!world) return;
    for (const c of world.chunks.values()) disposeChunkMeshes(c);
    world.chunks.clear();
  }
  function findSpawn(gen) {
    // Dry grass column above sea level, preferring one with trees close by.
    const ok = (x, z) => { const h = gen.height(x, z); return h > SEA + 3 && h < 80 && gen.temperature(x, z) < 0.3 && !gen.treeAt(x, z) && !gen.isCave(x, h, z, h) && !gen.isCave(x, h - 1, z, h) ? h : -1; };
    const clearOfCanopy = (x, z) => { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (gen.treeAt(x + dx, z + dz)) return false; return true; };
    const treesNear = (x, z) => { let n = 0; for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) if (gen.treeAt(x + dx, z + dz)) n++; return n; };
    for (let pass = 0; pass < 2; pass++) {
      for (let r = 0; r < 1200; r += 6) {
        const steps = Math.max(8, Math.round(r / 6));
        for (let a = 0; a < steps; a++) {
          const x = Math.round(Math.cos(a / steps * Math.PI * 2) * r), z = Math.round(Math.sin(a / steps * Math.PI * 2) * r);
          const h = ok(x, z);
          if (h < 0) continue;
          if (clearOfCanopy(x, z) === false) continue;
          if (pass === 0 && treesNear(x, z) < 2) continue;
          return [x + 0.5, h + 1.01, z + 0.5];
        }
      }
    }
    return [0.5, gen.height(0, 0) + 2, 0.5];
  }
  function createWorld(seed, save) {
    disposeWorld();
    pendingMobs = null;
    world = new VC.World(seed);
    if (mobs) mobs.dispose();
    mobs = new VC.Mobs(scene, world, { max: MOBILE ? 10 : 20, maxWild: MOBILE ? 4 : 6 });
    mobs.sound = settings.sound;
    world.onEdit = () => { dirtySave = true; };
    player = new VC.Player(world, camera);
    if (save) {
      world.loadEdits(save);
      if (save.player) { player.pos.set(save.player.x, save.player.y, save.player.z); player.yaw = save.player.yaw || 0; player.pitch = save.player.pitch || 0; player.flying = !!save.player.flying; }
      if (typeof save.time === 'number') worldTime = save.time;
      if (Array.isArray(save.mobs)) pendingMobs = save.mobs;
      if (Array.isArray(save.hotbar) && save.hotbar.length === 9) hotbar = save.hotbar.map(id => defs[id] && defs[id].placeable ? id : B.STONE);
    } else {
      const [x, y, z] = findSpawn(world.gen);
      player.pos.set(x, y, z); worldTime = 0.05;
    }
    // generate spawn area synchronously
    const pcx = Math.floor(player.pos.x / CS), pcz = Math.floor(player.pos.z / CS);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) world.ensureChunk(pcx + dx, pcz + dz);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) meshChunk(world.getChunk(pcx + dx, pcz + dz));
    player.updateCamera();
    buildHotbar();
    $('world-info').textContent = 'Seed: ' + seed + (save ? ' · ' + world.edits.size + ' edited chunk(s) loaded' : ' · new world');
  }
  let pendingMobs = null; // restored once their chunks are loaded
  function saveGame() {
    if (!world) return false;
    try {
      const p = player.pos;
      localStorage.setItem(SAVE_KEY, world.serialize({ time: worldTime, hotbar, mobs: mobs.serialize().concat(pendingMobs || []), player: { x: p.x, y: p.y, z: p.z, yaw: player.yaw, pitch: player.pitch, flying: player.flying } }));
      dirtySave = false; saveTimer = 0;
      return true;
    } catch (e) { console.warn('Save failed', e); return false; }
  }

  // ---------- chunk streaming ----------
  let offsets = [], offsetsR = -1;
  function buildOffsets(R) {
    offsets = [];
    const G = R + 1;
    for (let dz = -G; dz <= G; dz++) for (let dx = -G; dx <= G; dx++) { const d = Math.sqrt(dx * dx + dz * dz); if (d <= G + 0.5) offsets.push([dx, dz, d]); }
    offsets.sort((a, b) => a[2] - b[2]);
    offsetsR = R;
  }
  function disposeChunkMeshes(c) {
    if (!c.meshes) return;
    for (const m of c.meshes) { scene.remove(m); m.geometry.dispose(); }
    c.meshes = null;
  }
  function neighboursReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!world.getChunk(cx + dx, cz + dz)) return false;
    return true;
  }
  function meshChunk(c) {
    if (!c) return;
    const g = VC.Mesher.buildChunk(world, c);
    disposeChunkMeshes(c);
    c.meshes = [];
    const add = (geo, mat, order) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.renderOrder = order; scene.add(m); c.meshes.push(m); };
    add(g.opaque, matOpaque, 0); add(g.cutout, matCutout, 0); add(g.water, matWater, 1);
    c.dirty = false; c.urgent = false;
  }
  let stats = { gen: 0, mesh: 0 };
  function updateChunks(budget) {
    if (offsetsR !== settings.renderDistance) buildOffsets(settings.renderDistance);
    const R = settings.renderDistance;
    const pcx = Math.floor(player.pos.x / CS), pcz = Math.floor(player.pos.z / CS);
    const t0 = performance.now();
    // 1) edited (dirty) chunks near the player get rebuilt immediately
    for (const c of world.chunks.values()) if (c.urgent) { c.urgent = false; if (c.dirty && c.meshes && neighboursReady(c.cx, c.cz)) meshChunk(c); }
    // 2) generate + mesh nearest-first within the time budget
    for (const [dx, dz, d] of offsets) {
      if (performance.now() - t0 > budget) break;
      const cx = pcx + dx, cz = pcz + dz;
      let c = world.getChunk(cx, cz);
      if (!c) { c = world.ensureChunk(cx, cz); stats.gen++; }
      if (d <= R + 0.5 && c.dirty) {
        // ensure neighbours exist, then mesh
        for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) if (!world.getChunk(cx + nx, cz + nz)) { world.ensureChunk(cx + nx, cz + nz); stats.gen++; }
        meshChunk(c); stats.mesh++;
      }
    }
    // 3) unload far chunks
    const U = R + 3;
    for (const [k, c] of world.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > U * U) { disposeChunkMeshes(c); world.chunks.delete(k); }
      else if (c.meshes && dx * dx + dz * dz > (R + 1.5) * (R + 1.5)) { disposeChunkMeshes(c); c.dirty = true; }
    }
  }

  // ---------- day / night ----------
  const cDay = new THREE.Color(0x87c5f0), cNight = new THREE.Color(0x05070f), cSunset = new THREE.Color(0xf08a4b), cWater = new THREE.Color(0x0e2f6a);
  const tmpC = new THREE.Color();
  function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function updateSky(dt) {
    worldTime = (worldTime + dt / DAY_LENGTH) % 1;
    const ang = worldTime * Math.PI * 2;
    const elev = Math.sin(ang);
    const day = smooth(-0.18, 0.22, elev);
    const sunset = Math.max(0, 1 - Math.abs(elev) / 0.28) * (Math.cos(ang) > -2 ? 1 : 0);
    tmpC.copy(cNight).lerp(cDay, day).lerp(cSunset, sunset * 0.45);
    const R = settings.renderDistance * CS;
    if (player.headInWater) {
      scene.background.copy(cWater).multiplyScalar(0.3 + 0.7 * day); scene.fog.color.copy(scene.background);
      scene.fog.near = 1; scene.fog.far = 24;
    } else {
      scene.background.copy(tmpC); scene.fog.color.copy(tmpC);
      scene.fog.near = R * 0.55; scene.fog.far = R * 0.98;
    }
    const bright = 0.15 + 0.85 * day;
    lightUniforms.uDay.value = bright; currentDaylight = bright;
    clouds.material.color.setScalar(0.2 + 0.8 * day); clouds.material.opacity = 0.12 + 0.68 * day;
    stars.material.opacity = Math.max(0, 1 - day * 1.6);
    const cp = camera.position;
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.25).normalize();
    sun.position.copy(cp).addScaledVector(dir, 400); sun.lookAt(cp);
    moon.position.copy(cp).addScaledVector(dir, -400); moon.lookAt(cp);
    stars.position.copy(cp); stars.rotation.z = ang;
    // clouds follow camera; texture offset keeps them fixed in world + slow drift
    clouds.position.x = cp.x; clouds.position.z = cp.z;
    cloudDrift += dt * 1.2;
    cloudTex.offset.set((cp.x + cloudDrift) / CLOUD_SIZE, -cp.z / CLOUD_SIZE);
    $('water-overlay').style.display = player.headInWater ? 'block' : 'none';
  }
  let cloudDrift = 0, currentDaylight = 1;

  // ---------- UI: hotbar & inventory ----------
  function iconCanvas(id, size) { const c = document.createElement('canvas'); c.width = c.height = size; VC.Textures.drawIcon(c.getContext('2d'), atlas.canvas, id, size); return c; }
  function buildHotbar() {
    const hb = $('hotbar'); hb.innerHTML = '';
    hotbar.forEach((id, i) => {
      const s = document.createElement('div'); s.className = 'slot' + (i === selected ? ' sel' : '');
      s.appendChild(iconCanvas(id, 64));
      const n = document.createElement('span'); n.className = 'num'; n.textContent = i + 1; s.appendChild(n);
      s.addEventListener('click', (e) => { e.stopPropagation(); if (state === 'playing') select(i); });
      hb.appendChild(s);
    });
    if (MOBILE) { const m = document.createElement('div'); m.className = 'slot menu-slot'; m.textContent = '⋯'; m.addEventListener('click', (e) => { e.stopPropagation(); if (state === 'playing') setState('inventory'); }); hb.appendChild(m); }
  }
  let toastTimer = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; toastTimer = 1.6; }
  function select(i) { selected = (i + 9) % 9; buildHotbar(); toast(defs[hotbar[selected]].name); }
  function buildInventory() {
    const g = $('inv-grid'); g.innerHTML = '';
    for (const id of VC.Blocks.ORDER) {
      const d = defs[id];
      if (!d || !d.placeable) continue;
      const it = document.createElement('div'); it.className = 'inv-item'; it.title = d.name;
      it.appendChild(iconCanvas(d.id, 64));
      it.addEventListener('click', () => { hotbar[selected] = d.id; buildHotbar(); toast(d.name); dirtySave = true; });
      g.appendChild(it);
    }
  }
  buildInventory();

  // ---------- state transitions ----------
  const canvas = renderer.domElement;
  function lockPointer() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function setState(s) {
    state = s;
    show('start', s === 'title'); show('pause', s === 'paused'); show('inventory', s === 'inventory');
    show('hud', s !== 'title' && settings.showDebug);
    for (const k in player.keys) player.keys[k] = false;
    if (window.game && window.game.onState) window.game.onState(s);
    if (s === 'paused') { saveGame(); $('save-status').textContent = 'World saved automatically.'; }
  }
  function play() {
    if (noLock) {
      if (MOBILE && !testMode && !document.fullscreenElement && document.documentElement.requestFullscreen) { try { const p = document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
      setState('playing'); return;
    }
    lockPointer(); setState('playing');
  }
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) { if (state !== 'playing') setState('playing'); }
    else if (state === 'playing') setState('paused');
  });

  $('btn-play').addEventListener('click', play);
  document.addEventListener('pointerdown', () => { if (settings.sound) VC.MobSounds.unlock(); }, { once: true });
  $('btn-new').addEventListener('click', () => {
    const s = $('seed').value;
    const seed = s.trim() ? hashSeed(s) : (Math.random() * 2147483647) | 0;
    if (localStorage.getItem(SAVE_KEY) && !confirm('Start a new world? Your current saved world will be replaced.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    createWorld(seed, null); saveGame(); play();
  });
  $('btn-resume').addEventListener('click', play);
  $('btn-save').addEventListener('click', () => { $('save-status').textContent = saveGame() ? 'Saved at ' + new Date().toLocaleTimeString() : 'Save failed (storage full?)'; });
  $('btn-title').addEventListener('click', () => { saveGame(); setState('title'); });
  $('btn-inv-done').addEventListener('click', play);
  $('btn-inv-close').addEventListener('click', play);
  { const chk = $('chk-sound'); chk.checked = settings.sound; chk.addEventListener('change', () => { settings.sound = chk.checked; if (mobs) mobs.sound = chk.checked; saveSettings(); if (chk.checked) MobSounds.unlock(); }); }
  { const chk = $('chk-debug'); chk.checked = settings.showDebug; chk.addEventListener('change', () => { settings.showDebug = chk.checked; saveSettings(); }); }
  function bindSlider(id, key, fmt, apply) {
    const el = $(id), val = $(id + '-val');
    el.value = settings[key]; val.textContent = fmt(settings[key]);
    el.addEventListener('input', () => { settings[key] = +el.value; val.textContent = fmt(settings[key]); if (apply) apply(); saveSettings(); });
  }
  bindSlider('rd', 'renderDistance', (v) => v);
  bindSlider('sens', 'sensitivity', (v) => v);
  bindSlider('fov', 'fov', (v) => v + '°', () => { camera.fov = settings.fov; camera.updateProjectionMatrix(); });

  // ---------- input ----------
  document.addEventListener('mousemove', (e) => {
    if (state !== 'playing' || (!noLock && document.pointerLockElement !== canvas)) return;
    const s = settings.sensitivity * 0.00025;
    player.yaw -= e.movementX * s; player.pitch -= e.movementY * s;
    player.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, player.pitch));
  });
  const mouse = { left: false, right: false, timer: 0 };
  canvas.addEventListener('mousedown', (e) => {
    if (state !== 'playing') return;
    if (!noLock && document.pointerLockElement !== canvas) { lockPointer(); return; }
    if (e.button === 0) { mouse.left = true; mouse.timer = 0.25; breakBlock(); }
    else if (e.button === 2) { mouse.right = true; mouse.timer = 0.25; placeBlock(); }
    else if (e.button === 1) { e.preventDefault(); pickBlock(); }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (state === 'playing') select(selected + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'F3') { e.preventDefault(); settings.showDebug = !settings.showDebug; saveSettings(); show('hud', state !== 'title' && settings.showDebug); return; }
    if (e.code === 'KeyE') {
      if (state === 'playing') { setState('inventory'); if (document.pointerLockElement) document.exitPointerLock(); }
      else if (state === 'inventory') play();
      return;
    }
    if (e.code === 'Escape' && state === 'inventory') { setState('paused'); return; }
    if (state !== 'playing') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) || (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight')) e.preventDefault();
    if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9) select(n - 1); }
    if (e.code === 'KeyF' && !e.repeat) { player.toggleFly(); toast(player.flying ? 'Flying enabled' : 'Flying disabled'); }
    if (e.code === 'Space' && !e.repeat) {
      const now = performance.now();
      if (now - player.lastSpace < 300) { player.toggleFly(); toast(player.flying ? 'Flying enabled' : 'Flying disabled'); player.lastSpace = 0; }
      else player.lastSpace = now;
    }
    player.keys[e.code] = true;
  });
  document.addEventListener('keyup', (e) => { if (player) player.keys[e.code] = false; });
  window.addEventListener('blur', () => { if (player) for (const k in player.keys) player.keys[k] = false; });
  window.addEventListener('beforeunload', () => { if (world && state !== 'title') saveGame(); });

  // ---------- block interaction ----------
  let target = null, targetMob = null;
  const MobSounds = VC.MobSounds;
  function isReplaceable(id) { return id === B.AIR || id === B.WATER || VC.Blocks.RENDER[id] === 4; }
  const WALL_TORCH = { '1,0': B.TORCH_PX, '-1,0': B.TORCH_NX, '0,1': B.TORCH_PZ, '0,-1': B.TORCH_NZ };
  function removeUnsupported(x, y, z) {
    // plants and floor torches above, wall torches attached to the sides
    const above = world.getBlock(x, y + 1, z);
    if (VC.Blocks.RENDER[above] === 4 || above === B.TORCH) world.setBlock(x, y + 1, z, B.AIR);
    for (const [dx, dz, id] of [[1, 0, B.TORCH_PX], [-1, 0, B.TORCH_NX], [0, 1, B.TORCH_PZ], [0, -1, B.TORCH_NZ]])
      if (world.getBlock(x + dx, y, z + dz) === id) world.setBlock(x + dx, y, z + dz, B.AIR);
  }
  function breakBlock() {
    if (targetMob) { const msg = mobs.hit(targetMob); if (msg) toast(msg); targetMob = null; dirtySave = true; return; }
    if (!target || target.id === B.BEDROCK) return;
    world.setBlock(target.x, target.y, target.z, B.AIR);
    removeUnsupported(target.x, target.y, target.z);
    // fill from adjacent water so oceans don't get dry holes
    const adjW = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([a, b, c]) => world.getBlock(target.x + a, target.y + b, target.z + c) === B.WATER);
    if (adjW) world.setBlock(target.x, target.y, target.z, B.WATER);
    target = null;
  }
  function placeBlock() {
    if (MobSounds) MobSounds.unlock();
    if (targetMob) { toast(mobs.interact(targetMob)); dirtySave = true; return; }
    if (!target) return;
    let id = hotbar[selected];
    const d = defs[id];
    let x = target.x, y = target.y, z = target.z;
    const onPlant = VC.Blocks.RENDER[target.id] === 4;
    if (!onPlant) { x += target.nx; y += target.ny; z += target.nz; }
    if (y < 0 || y >= CH) return;
    const cur = world.getBlock(x, y, z);
    if (!isReplaceable(cur)) return;
    if (d.egg) {
      const m = mobs.spawn(d.egg, x + 0.5, y + 0.01, z + 0.5, { yaw: player.yaw + Math.PI });
      if (!m) toast('Too many animals (max ' + mobs.max + ')'); else { toast((d.egg === 'dog' ? 'Dog' : 'Cat') + ' spawned — right-click / tap it to tame'); dirtySave = true; }
      return;
    }
    if (id === B.TORCH) {
      const support = onPlant ? world.getBlock(x, y - 1, z) : target.id;
      if (!VC.Blocks.SOLID[support] || VC.Blocks.RENDER[support] === 5) return;
      if (!onPlant && target.ny === -1) return;            // no ceiling torches
      if (!onPlant && target.ny === 0) id = WALL_TORCH[target.nx + ',' + target.nz];
    }
    if (VC.Blocks.SOLID[id] && player.intersectsBlock(x, y, z)) return;
    if (VC.Blocks.RENDER[id] === 4) { const below = world.getBlock(x, y - 1, z); if (below !== B.GRASS && below !== B.DIRT && below !== B.SNOW) return; }
    world.setBlock(x, y, z, id);
  }
  function pickBlock() {
    if (!target) return;
    const d = defs[target.id], id = d.item || target.id;
    if (!defs[id].placeable) return;
    const i = hotbar.indexOf(id);
    if (i >= 0) select(i); else { hotbar[selected] = id; buildHotbar(); toast(defs[id].name); }
  }

  // ---------- HUD ----------
  let fpsFrames = 0, fpsTime = 0, fps = 0, hudTimer = 0;
  function timeString() { const h = (worldTime * 24 + 6) % 24; return String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'); }
  function updateHud() {
    const p = player.pos;
    let meshed = 0, tris = 0; for (const c of world.chunks.values()) if (c.meshes) { meshed++; }
    const dirs = ['North (-Z)', 'West (-X)', 'South (+Z)', 'East (+X)'];
    const facing = dirs[((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4];
    const tgt = target ? `${defs[target.id].name} @ ${target.x} ${target.y} ${target.z}` : '—';
    $('debug').textContent =
      `VoxelCraft  ${fps} fps\n` +
      `XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
      `Chunk: ${Math.floor(p.x / CS)}, ${Math.floor(p.z / CS)}   Facing: ${facing}\n` +
      `Chunks: ${meshed} rendered / ${world.chunks.size} loaded  (RD ${settings.renderDistance})\n` +
      `Time: ${timeString()}   Mode: ${player.flying ? 'flying' : player.inWater ? 'swimming' : 'walking'}\n` +
      `Target: ${targetMob ? (targetMob.tamed ? 'Tamed ' : '') + targetMob.type : tgt}   Animals: ${mobs.list.length}/${mobs.max}\n` +
      `Draw calls: ${renderer.info.render.calls}  Tris: ${(renderer.info.render.triangles / 1000).toFixed(0)}k`;
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    fpsFrames++; fpsTime += dt; if (fpsTime >= 0.5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }
    if (!world) return;
    const tA = performance.now();
    const playing = state === 'playing';
    if (playing) player.update(dt); else { if (state === 'title') { player.yaw += dt * 0.04; } player.updateCamera(); }
    updateChunks(playing ? 5 : 14);
    updateSky(playing ? dt : dt * 0.25);
    // target + outline
    target = playing ? player.raycast(6) : null;
    targetMob = null;
    if (playing && mobs.list.length) {
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      const mh = mobs.raycast(camera.position, dir, 5);
      // plants/torches occupy a whole cell for ray picking; let animals standing in them win
      if (mh && (!target || mh.t < target.t || VC.Blocks.RENDER[target.id] >= 4)) { targetMob = mh.mob; target = null; }
    }
    if (playing) {
      mobs.update(dt, player, currentDaylight);
      if (pendingMobs) { const c = world.getChunk(Math.floor(player.pos.x / CS), Math.floor(player.pos.z / CS)); if (c && c.meshes && !player.frozen) { mobs.load(pendingMobs); pendingMobs = null; } }
    }
    lightUniforms.uTime.value = now / 1000;
    if (target) { selBox.visible = true; selBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5); } else selBox.visible = false;
    if (playing && (mouse.left || mouse.right)) { mouse.timer -= dt; if (mouse.timer <= 0) { mouse.timer = 0.22; if (mouse.left) breakBlock(); else placeBlock(); } }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').style.opacity = 0; }
    if (dirtySave) { saveTimer += dt; if (saveTimer > 2) saveGame(); }
    hudTimer -= dt; if (hudTimer <= 0 && state !== 'title') { hudTimer = 0.25; updateHud(); }
    // loading indicator on title
    if (state === 'title') { const c = world.getChunk(Math.floor(player.pos.x / CS), Math.floor(player.pos.z / CS)); $('loading').textContent = c && c.meshes ? 'World ready' : 'Generating terrain…'; }
    const tB = performance.now();
    renderer.render(scene, camera);
    const tC = performance.now();
    perf.update = perf.update * 0.95 + (tB - tA) * 0.05; perf.render = perf.render * 0.95 + (tC - tB) * 0.05;
  }
  const perf = { update: 0, render: 0 };

  // ---------- boot ----------
  const existing = safeParse(localStorage.getItem(SAVE_KEY));
  if (existing && typeof existing.seed === 'number') { createWorld(existing.seed, existing); $('btn-play').textContent = 'Click to Play (continue world)'; }
  else { createWorld((Math.random() * 2147483647) | 0, null); }
  setState('title');
  if (testMode) play();
  requestAnimationFrame(frame);

  // Expose for debugging / automated tests
  window.game = { perf, get mobs() { return mobs; }, get targetMob() { return targetMob; }, lightUniforms, play, isMobile: MOBILE, saveSettings, toast, get hotbar() { return hotbar; }, get selected() { return selected; }, toggleFly: () => { player.toggleFly(); toast(player.flying ? 'Flying enabled' : 'Flying disabled'); }, openInventory: () => setState('inventory'), get world() { return world; }, get player() { return player; }, get state() { return state; }, settings, saveGame, setTime: (t) => { worldTime = t; }, renderer, scene, camera, setState, select, breakBlock, placeBlock, get target() { return target; } };
})();
