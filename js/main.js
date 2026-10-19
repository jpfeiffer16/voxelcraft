// VoxelCraft main: renderer, sky, chunk streaming, UI, input, persistence.
(function () {
  'use strict';
  const { CS, CH, SEA, SAVE_KEY } = VC.CONST;
  const B = VC.B, defs = VC.Blocks.defs;
  const $ = (id) => document.getElementById(id);
  const MOBILE = !!VC.isMobile; // mode at load (settings storage key, initial defaults)
  const touchOn = () => !!VC.isMobile; // current touch-controls mode (can change at runtime)
  const SETTINGS_KEY = MOBILE ? 'voxelcraft.settings.mobile.v1' : 'voxelcraft.settings.v1';
  const DAY_LENGTH = 600; // seconds per full day

  window.addEventListener('error', (e) => { const el = $('error'); el.classList.remove('hidden'); el.textContent += (e.message || e) + '\n'; });

  // ---------- settings ----------
  const settings = Object.assign({ renderDistance: MOBILE ? 4 : 8, sensitivity: 8, fov: MOBILE ? 70 : 75, showDebug: !MOBILE, tilt: true, tiltSens: 10, lookSens: 10, sound: true, hostile: true, daylightBurn: false }, safeParse(localStorage.getItem(SETTINGS_KEY)) || {});
  settings.vol = Object.assign({ master: 80, music: 40, effects: 80, mobs: 80 }, settings.vol || {});
  function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

  // ---------- renderer ----------
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const applyPixelRatio = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchOn() ? 1 : 1.5));
  applyPixelRatio();
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
  let state = 'title'; // title | playing | paused | inventory | dead
  let worldTime = 0.05;
  let hotbar = [B.IRON_SWORD, B.BOW, B.GRASS, B.PLANKS, B.COBBLE, B.TORCH, B.OAK_DOOR_ITEM, B.STEAK, B.HORSE_EGG];
  let mobs = null, tnt = null, fluids = null, spawnPoint = null, proj = null;
  const held = new VC.Weapons.Held(atlas, tex);
  let selected = 0;
  let saveTimer = 0, dirtySave = false;
  const testMode = /[?&]test=1/.test(location.search);
  const noLock = () => testMode || touchOn(); // touch mode never requires pointer lock

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
    mobs = new VC.Mobs(scene, world, { max: MOBILE ? 10 : 20, maxWild: MOBILE ? 4 : 6, maxHostile: MOBILE ? 7 : 16, maxFish: MOBILE ? 6 : 16, maxWildLions: MOBILE ? 1 : 2, mobile: MOBILE });
    fluids = new VC.Fluids(world, { maxPerTick: MOBILE ? 48 : 96 });
    mobs.sound = settings.sound; mobs.hostile = settings.hostile !== false; mobs.burnDaylight = !!settings.daylightBurn;
    mobs.onBreed = (baby, parent) => { if (baby) { toast('A baby ' + mobs.name(baby).toLowerCase() + ' was born! ❤'); dirtySave = true; } else toast('Too many animals for a baby (max ' + mobs.max + ')'); };
    mobs.onGrow = (m) => { if (m.pos.distanceTo(player.pos) < 24) toast('Your ' + mobs.name(m).toLowerCase() + ' has grown up!'); dirtySave = true; };
    if (proj) proj.dispose();
    proj = new VC.Weapons.Projectiles(scene, world, { max: MOBILE ? 20 : 40 }); proj.mobs = mobs;
    proj.onHitMob = onProjectileHit;
    proj.onBlock = (p) => { VC.Audio.play(p.kind === 'trident' ? 'axe_hit' : 'arrow_block', 0.7 * VC.Audio.at(p.pos, 32), { pos: p.pos }); };
    proj.onReturn = () => { VC.Audio.play('trident_return', 0.45); held.equip = 0.6; };
    held.hidden = false; charge.on = false;
    mobs.onPlayerDamage = (amt, m) => { if (!settings.hostile) return; player.lastCause = 'mob'; if (player.hurt(amt, m.pos, m, 5)) onHurt(); };
    if (tnt) tnt.dispose();
    tnt = new VC.Explosives(scene, world, tex, { maxPrimed: MOBILE ? 10 : 20, perFrame: MOBILE ? 1 : 2, maxParticles: MOBILE ? 140 : 260 });
    tnt.sound = settings.sound; tnt.onExplode = onExplode; tnt.onBlocksChanged = () => { dirtySave = true; };
    world.onEdit = () => { dirtySave = true; };
    player = new VC.Player(world, camera);
    if (save) {
      world.loadEdits(save);
      if (save.player) { player.pos.set(save.player.x, save.player.y, save.player.z); player.yaw = save.player.yaw || 0; player.pitch = save.player.pitch || 0; player.flying = !!save.player.flying; if (save.player.hp > 0) player.health = Math.min(player.maxHealth, save.player.hp); }
      if (Array.isArray(save.spawn)) spawnPoint = save.spawn;
      if (typeof save.time === 'number') worldTime = save.time;
      if (Array.isArray(save.mobs)) pendingMobs = save.mobs;
      if (Array.isArray(save.hotbar) && save.hotbar.length === 9) hotbar = save.hotbar.map(id => defs[id] && defs[id].placeable ? id : B.STONE);
    } else {
      const [x, y, z] = findSpawn(world.gen);
      player.pos.set(x, y, z); worldTime = 0.05;
      spawnPoint = [x, y, z];
    }
    if (!spawnPoint) spawnPoint = findSpawn(world.gen);
    updateHearts(true);
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
      localStorage.setItem(SAVE_KEY, world.serialize({ time: worldTime, hotbar, mobs: mobs.serialize().concat(pendingMobs || []), spawn: spawnPoint, player: { x: p.x, y: p.y, z: p.z, yaw: player.yaw, pitch: player.pitch, flying: player.flying, hp: player.dead ? player.maxHealth : player.health } }));
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
    if (player.headInLava) {
      scene.background.setRGB(0.85, 0.3, 0.03); scene.fog.color.copy(scene.background);
      scene.fog.near = 0.2; scene.fog.far = 3;
    } else if (player.headInWater) {
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
    if (touchOn()) { const m = document.createElement('div'); m.className = 'slot menu-slot'; m.textContent = '⋯'; m.addEventListener('click', (e) => { e.stopPropagation(); if (state === 'playing') setState('inventory'); }); hb.appendChild(m); }
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
    show('start', s === 'title'); show('pause', s === 'paused'); show('inventory', s === 'inventory'); show('dead', s === 'dead');
    show('hearts', s !== 'title');
    show('hud', s !== 'title' && settings.showDebug);
    for (const k in player.keys) player.keys[k] = false;
    if (window.game && window.game.onState) window.game.onState(s);
    if (s === 'paused') { saveGame(); $('save-status').textContent = 'World saved automatically.'; }
  }
  function play() {
    if (noLock()) {
      if (touchOn() && VC.autoMobile && !testMode && !document.fullscreenElement && document.documentElement.requestFullscreen) { try { const p = document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
      setState('playing'); return;
    }
    lockPointer(); setState('playing');
  }
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) { if (state !== 'playing') setState('playing'); }
    else if (state === 'playing' && !noLock()) setState('paused'); // in touch mode, releasing the mouse doesn't pause
  });

  $('btn-play').addEventListener('click', () => { if (window.game && window.game.mobile) window.game.mobile.beforePlay(); play(); }); // tilt permission must be requested first, synchronously (iOS)
  // Audio starts on the first tap / click / key press (mobile browsers only allow sound after a user gesture)
  VC.Audio.setVolumes(settings.vol); VC.Audio.setMuted(!settings.sound);
  const unlockAudio = () => { if (settings.sound && !VC.Audio.unlocked) VC.Audio.unlock(); };
  for (const ev of ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
  $('btn-new').addEventListener('click', () => {
    if (window.game && window.game.mobile) window.game.mobile.beforePlay(); 
    const s = $('seed').value;
    const seed = s.trim() ? hashSeed(s) : (Math.random() * 2147483647) | 0;
    if (localStorage.getItem(SAVE_KEY) && !confirm('Start a new world? Your current saved world will be replaced.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    createWorld(seed, null); saveGame(); play();
  });
  $('btn-resume').addEventListener('click', () => { if (window.game && window.game.mobile) window.game.mobile.beforePlay(); play(); });
  $('btn-save').addEventListener('click', () => { $('save-status').textContent = saveGame() ? 'Saved at ' + new Date().toLocaleTimeString() : 'Save failed (storage full?)'; });
  $('btn-title').addEventListener('click', () => { saveGame(); setState('title'); });
  $('btn-inv-done').addEventListener('click', play);
  $('btn-inv-close').addEventListener('click', play);
  function setMuted(m) {
    settings.sound = !m; VC.Audio.setMuted(!!m); if (mobs) mobs.sound = !m; if (tnt) tnt.sound = !m; saveSettings();
    if (!m) { VC.Audio.unlock(); VC.Audio.play('click', 0.8); }
    updateMuteUi();
  }
  function updateMuteUi() {
    $('btn-mute').textContent = settings.sound ? '🔊 Sound: on (M to mute)' : '🔇 Sound: muted (M to unmute)';
    $('btn-mute').classList.toggle('muted', !settings.sound);
    const tb = $('tb-mute'); if (tb) { tb.textContent = settings.sound ? '🔊' : '🔇'; tb.classList.toggle('on', !settings.sound); }
  }
  $('btn-mute').addEventListener('click', () => setMuted(settings.sound));
  updateMuteUi();
  { let lastPing = 0;
    for (const [id, key, ping] of [['volMaster', 'master', 'pop'], ['volMusic', 'music', null], ['volEffects', 'effects', 'pop'], ['volMobs', 'mobs', 'cat']]) {
      const el = $(id), val = $(id + '-val');
      el.value = settings.vol[key]; val.textContent = settings.vol[key];
      el.addEventListener('input', () => {
        settings.vol[key] = +el.value; val.textContent = el.value; VC.Audio.setVolumes(settings.vol); saveSettings();
        const now = performance.now(); if (ping && now - lastPing > 350) { lastPing = now; VC.Audio.unlock(); VC.Audio.play(ping, 0.7); }
      });
    } }
  { const chk = $('chk-burn'); chk.checked = !!settings.daylightBurn; chk.addEventListener('change', () => { settings.daylightBurn = chk.checked; if (mobs) mobs.burnDaylight = chk.checked; saveSettings(); }); }
  { const chk = $('chk-hostile'); chk.checked = settings.hostile !== false; chk.addEventListener('change', () => { setHostile(chk.checked); }); }
  function setHostile(on) { settings.hostile = !!on; $('chk-hostile').checked = !!on; saveSettings(); if (mobs) mobs.setHostile(!!on); }
  $('btn-respawn').addEventListener('click', respawn);
  $('btn-dead-title').addEventListener('click', () => { respawn(true); saveGame(); setState('title'); });
  { const chk = $('chk-debug'); chk.checked = settings.showDebug; chk.addEventListener('change', () => { settings.showDebug = chk.checked; saveSettings(); }); }
  function bindSlider(id, key, fmt, apply) {
    const el = $(id), val = $(id + '-val');
    el.value = settings[key]; val.textContent = fmt(settings[key]);
    el.addEventListener('input', () => { settings[key] = +el.value; val.textContent = fmt(settings[key]); if (apply) apply(); saveSettings(); });
  }
  bindSlider('rd', 'renderDistance', (v) => v, () => { settings.rdCustom = true; });
  bindSlider('sens', 'sensitivity', (v) => v);
  bindSlider('fov', 'fov', (v) => v + '°', () => { camera.fov = settings.fov; camera.updateProjectionMatrix(); });

  // ---------- touch controls mode toggle (Auto / On / Off) ----------
  function touchLabel() {
    const tm = VC.touchMode, o = tm.urlOverride;
    return o !== null ? 'URL override (?mobile=' + (o ? 1 : 0) + ')' : tm.pref === 'auto' ? 'Auto: ' + (VC.autoMobile ? 'touch device detected' : 'no touch device detected') : '';
  }
  function updateTouchToggle() {
    for (const seg of document.querySelectorAll('.touch-seg')) {
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', VC.touchMode.urlOverride === null && b.dataset.mode === VC.touchMode.pref);
    }
    for (const n of document.querySelectorAll('.touch-note')) n.textContent = touchLabel() + (touchLabel() ? ' · ' : '') + 'Touch controls are ' + (touchOn() ? 'ON' : 'OFF') + ' · press T to toggle';
    $('btn-play').textContent = $('btn-play').textContent.replace(/^(Click|Tap)/, touchOn() ? 'Tap' : 'Click');
  }
  for (const seg of document.querySelectorAll('.touch-seg')) for (const b of seg.querySelectorAll('button'))
    b.addEventListener('click', (e) => { e.stopPropagation(); VC.touchMode.set(b.dataset.mode); });
  window.addEventListener('vc-touchmode', () => {
    applyPixelRatio();
    if (!settings.rdCustom) { settings.renderDistance = touchOn() ? 4 : 8; $('rd').value = settings.renderDistance; $('rd-val').textContent = settings.renderDistance; saveSettings(); }
    buildHotbar();
    if (touchOn()) { if (document.pointerLockElement) document.exitPointerLock(); }
    else if (state === 'playing' && !testMode && document.pointerLockElement !== canvas) setState('paused'); // desktop mode needs a click to capture the mouse
    if (window.game && window.game.onState) window.game.onState(state);
    updateTouchToggle();
    toast('Touch controls ' + (touchOn() ? 'on' : 'off'));
  });
  updateTouchToggle();

  // ---------- input ----------
  document.addEventListener('mousemove', (e) => {
    if (state !== 'playing' || (!testMode && document.pointerLockElement !== canvas)) return;
    const s = settings.sensitivity * 0.00025;
    player.yaw -= e.movementX * s; player.pitch -= e.movementY * s;
    player.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, player.pitch));
  });
  const mouse = { left: false, right: false, timer: 0 };
  canvas.addEventListener('mousedown', (e) => {
    if (state !== 'playing') return;
    if (!testMode && document.pointerLockElement !== canvas) { lockPointer(); return; } // a mouse click captures the mouse (also in touch mode)
    if (e.button === 0) { mouse.left = true; mouse.timer = 0.25; breakBlock(); }
    else if (e.button === 2) {
      // bow / trident: hold the right button to draw, release to shoot (unless you're aiming at an animal to feed / ride)
      if (heldRanged() && !(targetMob && !targetMob.hostile)) { if (useStart()) { mouse.charging = true; return; } }
      mouse.right = true; mouse.timer = 0.25; placeBlock();
    }
    else if (e.button === 1) { e.preventDefault(); pickBlock(); }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.left = false; if (e.button === 2) { mouse.right = false; if (mouse.charging) { mouse.charging = false; useEnd(); } } });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (state === 'playing') select(selected + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'F3') { e.preventDefault(); settings.showDebug = !settings.showDebug; saveSettings(); show('hud', state !== 'title' && settings.showDebug); return; }
    if (e.code === 'KeyT' && !e.repeat && !e.ctrlKey && !e.metaKey) { VC.touchMode.toggle(); return; }
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && state !== 'title') { setMuted(settings.sound); toast(settings.sound ? 'Sound on' : 'Sound muted'); return; }
    if (e.code === 'KeyE') {
      if (state === 'playing') { setState('inventory'); if (document.pointerLockElement) document.exitPointerLock(); }
      else if (state === 'inventory') play();
      return;
    }
    if (e.code === 'Escape' && state === 'inventory') { setState('paused'); return; }
    if (state !== 'playing') return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) || (e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight')) e.preventDefault();
    if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 9) select(n - 1); }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat && player.mount) { dismount(); }
    if (e.code === 'KeyF' && !e.repeat) { toggleFlyToast(); }
    if (e.code === 'Space' && !e.repeat && !player.mount) {
      const now = performance.now();
      if (now - player.lastSpace < 300) { toggleFlyToast(); player.lastSpace = 0; }
      else player.lastSpace = now;
    }
    player.keys[e.code] = true;
  });
  document.addEventListener('keyup', (e) => { if (player) player.keys[e.code] = false; });
  window.addEventListener('blur', () => { if (player) for (const k in player.keys) player.keys[k] = false; });
  window.addEventListener('beforeunload', () => { if (world && state !== 'title') saveGame(); });

  // ---------- block interaction ----------
  let target = null, targetMob = null, lastAttack = 0;
  const MobSounds = VC.MobSounds;
  function isReplaceable(id) { return id === B.AIR || (id > 0 && VC.Blocks.FLUID[id] > 0) || VC.Blocks.RENDER[id] === 4; }
  const BL = VC.Blocks, DIRS = BL.DIRS;
  // the other half of a door / bed
  function partnerOf(x, y, z, id) {
    const di = BL.doorInfo(id); if (di) return [x, y + (di.upper ? -1 : 1), z];
    const bi = BL.bedInfo(id); if (bi) { const [dx, dz] = DIRS[bi.f], s = bi.head ? -1 : 1; return [x + dx * s, y, z + dz * s]; }
    return null;
  }
  function breakPartner(x, y, z, id) {
    const pp = partnerOf(x, y, z, id); if (!pp) return;
    const pid = world.getBlock(pp[0], pp[1], pp[2]);
    if (pid > 0 && BL.defs[pid].item === BL.defs[id].item) world.setBlock(pp[0], pp[1], pp[2], B.AIR);
  }
  function toggleDoor(x, y, z, id) {
    const di = BL.doorInfo(id), ly = di.upper ? y - 1 : y;
    const open = !di.open;
    // don't close a door on top of the player
    if (!open) { const b = BL.shape(BL.doorId(di.base, di.f, false, false))[0], p = player.pos, HW = 0.3;
      if (p.x + HW > x + b[0] / 16 && p.x - HW < x + b[3] / 16 && p.z + HW > z + b[2] / 16 && p.z - HW < z + b[5] / 16 && p.y + 1.8 > ly && p.y < ly + 2) { toast('Something is in the way'); return; } }
    world.setBlock(x, ly, z, BL.doorId(di.base, di.f, open, false));
    if (BL.doorInfo(world.getBlock(x, ly + 1, z))) world.setBlock(x, ly + 1, z, BL.doorId(di.base, di.f, open, true));
    if (settings.sound) VC.Sound.play(open ? 'door_open' : 'door_close', 0.5);
    dirtySave = true;
  }
  function hostileNear(r) { for (const m of mobs.list) if (m.hostile && m.pos.distanceTo(player.pos) < r) return true; return false; }
  let sleeping = 0;
  function useBed(x, y, z, id) {
    // spawn point: a free spot next to the bed
    let sp = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const a = world.getBlock(x + dx, y, z + dz), b = world.getBlock(x + dx, y + 1, z + dz), f = world.getBlock(x + dx, y - 1, z + dz);
      if (a >= 0 && b >= 0 && !BL.SOLID[a] && !BL.SOLID[b] && !BL.FLUID[a] && BL.SOLID[f]) { sp = [x + dx + 0.5, y + 0.01, z + dz + 0.5]; break; }
    }
    spawnPoint = sp || [x + 0.5, y + 0.6, z + 0.5]; dirtySave = true;
    if (sleeping > 0) return;
    const night = currentDaylight < 0.45;
    if (!night) { toast('Spawn point set. You can only sleep at night.'); return; }
    if (hostileNear(8)) { toast('Spawn point set. You may not rest now — monsters are nearby!'); return; }
    // sleep: fade out, skip to morning
    $('sleep-overlay').classList.add('on'); sleeping = performance.now() + 1600;
    toast('Sleeping… spawn point set.');
  }
  function finishSleep() {
    worldTime = Math.floor(worldTime) + 1 + 0.02; // next morning (06:30)
    for (const m of [...mobs.list]) if (m.hostile && m.burns && m.pos.distanceTo(player.pos) < 48) mobs.remove(m);
    $('sleep-overlay').classList.remove('on');
    player.health = Math.min(player.maxHealth, player.health + 6); updateHearts(true);
    toast('Good morning!'); dirtySave = true;
  }
  // scoop up a fluid source along the view ray
  function scoopFluid() {
    const o = camera.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    for (let t = 0.3; t < 5.5; t += 0.1) {
      const x = Math.floor(o.x + dir.x * t), y = Math.floor(o.y + dir.y * t), z = Math.floor(o.z + dir.z * t), id = world.getBlock(x, y, z);
      if (id > 0 && BL.FLUID[id]) { if (BL.LEVEL[id] < 8) continue; world.setBlock(x, y, z, B.AIR); return BL.FLUID[id]; }
      if (id > 0 && BL.SOLID[id]) break;
    }
    return 0;
  }
  const WALL_TORCH = { '1,0': B.TORCH_PX, '-1,0': B.TORCH_NX, '0,1': B.TORCH_PZ, '0,-1': B.TORCH_NZ };
  function removeUnsupported(x, y, z) {
    // plants and floor torches above, wall torches attached to the sides
    const above = world.getBlock(x, y + 1, z);
    if (VC.Blocks.RENDER[above] === 4 || above === B.TORCH) world.setBlock(x, y + 1, z, B.AIR);
    const ad = BL.doorInfo(above); if (ad && !ad.upper) { world.setBlock(x, y + 1, z, B.AIR); breakPartner(x, y + 1, z, above); } // door lost its floor
    for (const [dx, dz, id] of [[1, 0, B.TORCH_PX], [-1, 0, B.TORCH_NX], [0, 1, B.TORCH_PZ], [0, -1, B.TORCH_NZ]])
      if (world.getBlock(x + dx, y, z + dz) === id) world.setBlock(x + dx, y, z + dz, B.AIR);
  }
  // ---------- weapons ----------
  const FIST = { kind: 'fist', dmg: 3, cd: 0.35, reach: 5, knock: 1 };
  const heldDef = () => defs[hotbar[selected]];
  const weaponOf = (d) => (d && d.weapon) || FIST;
  const heldRanged = () => { const w = weaponOf(heldDef()); return w.ranged ? w : null; };
  const HIT_SOUND = { fist: 'punch', sword: 'sword_hit', axe: 'axe_hit', trident: 'sword_hit', bow: 'punch' };
  const charge = { on: false, t: 0, w: null };
  let lastShot = 0;
  function attack(m) {
    const w = weaponOf(heldDef()), now = performance.now();
    if (now - lastAttack < w.cd * 1000) return; lastAttack = now; // attack cooldown (held buttons repeat)
    held.swing();
    const fights = m.hostile || m.fish || (m.type === 'lion' && !m.tamed);
    const msg = mobs.hit(m, player.pos, { dmg: w.dmg, knock: w.knock }); if (msg) toast(msg);
    VC.Audio.play(fights ? HIT_SOUND[w.kind] || 'punch' : 'swing', 0.65, { pos: m.pos, pitch: 0.95 + Math.random() * 0.1 });
    dirtySave = true;
  }
  function useStart() {
    const w = heldRanged(); if (!w || player.dead || state !== 'playing' || charge.on) return false;
    if (w.ranged === 'trident' && proj.tridentOut()) { toast('Your trident is still on its way back'); return false; }
    charge.on = true; charge.t = 0; charge.w = w; held.charge = 0;
    VC.Audio.play(w.ranged === 'arrow' ? 'bow_draw' : 'swing', w.ranged === 'arrow' ? 0.6 : 0.3, { pitch: w.ranged === 'arrow' ? 1 : 0.6 });
    return true;
  }
  function useEnd(cancel) {
    if (!charge.on) return false;
    charge.on = false; const w = charge.w, power = Math.min(1, charge.t / w.drawTime); held.charge = 0;
    if (cancel || power < 0.12 || player.dead) return false;
    fire(w, power); return true;
  }
  function fire(w, power) {
    const q = camera.quaternion, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const o = camera.position.clone().addScaledVector(dir, 0.3).addScaledVector(right, 0.1); o.y -= 0.1;
    const p = proj.shoot(w.ranged, o, dir, power);
    p.dmg = Math.round(w.shotDmg[0] + (w.shotDmg[1] - w.shotDmg[0]) * power);
    VC.Audio.play(w.ranged === 'arrow' ? 'bow_twang' : 'trident_throw', 0.7, { pitch: 0.9 + power * 0.2 });
    if (w.ranged === 'trident') held.swing();
    lastShot = performance.now();
  }
  function quickShot() { // a quick tap with a bow / trident (touch): a half-strength shot
    const w = heldRanged(); if (!w || performance.now() - lastShot < 550 || charge.on) return;
    if (w.ranged === 'trident' && proj.tridentOut()) { toast('Your trident is still on its way back'); return; }
    fire(w, 0.45);
  }
  function onProjectileHit(m, p) {
    if (m.rider || m.dead) return false;
    const dir = p.vel.clone().setY(0); if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1); dir.normalize();
    const from = m.pos.clone().addScaledVector(dir, -1);
    const msg = mobs.hit(m, from, { dmg: p.dmg || 4, knock: p.kind === 'trident' ? 1.1 : 0.7 });
    VC.Audio.play('arrow_hit', 0.75 * Math.max(0.25, VC.Audio.at(m.pos, 40)), { pos: m.pos });
    if (msg) toast(msg);
    dirtySave = true; return true;
  }
  // ---------- food ----------
  let eatUntil = 0;
  function eat(d) {
    const f = d.food; if (!f || !f.eat) return false;
    if (performance.now() < eatUntil) return true;
    if (player.health >= player.maxHealth) { toast("You're full — feed it to an animal instead"); return true; }
    eatUntil = performance.now() + 1100; held.eatT = 1.05;
    player.health = Math.min(player.maxHealth, player.health + f.eat); updateHearts(true);
    VC.Audio.play('eat', 0.7, { pitch: 0.95 + Math.random() * 0.1 }); VC.Audio.play('burp', 0.35, { delay: 0.75 });
    toast('Ate ' + d.name.toLowerCase() + ' (+' + (f.eat / 2) + ' ❤)');
    return true;
  }
  function breakBlock() {
    if (targetMob) { attack(targetMob); targetMob = null; return; }
    if (!target || target.id === B.BEDROCK) {
      const w = weaponOf(heldDef()), now = performance.now();
      if (!target && now - lastAttack > w.cd * 1000) { lastAttack = now; held.swing(); VC.Audio.play('swing', w.kind === 'fist' ? 0.2 : 0.35, { pitch: w.kind === 'axe' ? 0.8 : 1 }); }
      return;
    }
    const bid = target.id;
    held.swing(); VC.Audio.blockSound('break', bid, { x: target.x + 0.5, y: target.y + 0.5, z: target.z + 0.5 });
    world.setBlock(target.x, target.y, target.z, B.AIR);
    breakPartner(target.x, target.y, target.z, bid);
    removeUnsupported(target.x, target.y, target.z);
    // nearby water / lava flows into the hole by itself (fluid simulation)
    target = null;
  }
  function toggleFlyToast() { if (player.mount) { toast('You are riding — dismount first (' + (touchOn() ? '⏏ button' : 'Shift') + ')'); return; } player.toggleFly(); toast(player.flying ? 'Flying enabled' : 'Flying disabled'); }
  function mountHorse(m) {
    if (player.mount || player.dead) return false;
    if (player.flying) player.flying = false;
    const wasWild = !m.tamed;
    if (!mobs.mount(m, player)) return false;
    if (!player.mountHorse(m)) { m.rider = null; toast('No room to ride here'); return false; }
    toast((wasWild ? 'Horse tamed! ' : '') + (touchOn() ? 'Steer with the joystick, » to gallop, ▲ to jump, ⏏ to get off' : 'WASD to ride, Ctrl to gallop, Space to jump, Shift to get off'));
    dirtySave = true; updateRideUi(); return true;
  }
  function dismount() {
    if (!player.mount) return false;
    const ok = player.dismount();
    if (!ok) toast('No room to get off here'); else { toast('The horse will wait here for you'); dirtySave = true; }
    updateRideUi(); return ok;
  }
  function updateRideUi() { document.body.classList.toggle('riding', !!player.mount); }
  // fish eggs: spawn into the water you are looking at (the block ray passes through water)
  function waterCellAhead() {
    const o = camera.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    for (let t = 0.5; t < 7; t += 0.2) {
      const x = Math.floor(o.x + dir.x * t), y = Math.floor(o.y + dir.y * t), z = Math.floor(o.z + dir.z * t), id = world.getBlock(x, y, z);
      if (id > 0 && BL.FLUID[id] === 1) return [x, y, z];
      if (id > 0 && BL.SOLID[id] && BL.OPAQUE[id]) break; // see through glass / panes (aquariums)
    }
    return null;
  }
  function placeFish(d) {
    let c = null;
    if (target) { const x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz, id = world.getBlock(x, y, z); if (id > 0 && BL.FLUID[id] === 1) c = [x, y, z]; }
    if (!c) c = waterCellAhead();
    if (!c) { toast('Fish need water — aim at a lake or the sea'); return; }
    // drop the fish into the middle of that water column
    let [x, y, z] = c; const below = world.getBlock(x, y - 1, z); if (below > 0 && BL.FLUID[below] === 1) y -= 1;
    const m = mobs.spawn(d.egg, x + 0.5, y + 0.3, z + 0.5, { yaw: player.yaw + Math.PI, wild: false });
    if (!m) toast('Too many fish (max ' + mobs.maxFish + ')'); else { toast(mobs.name(m) + ' released'); if (settings.sound) VC.Sound.play('splash', 0.5); dirtySave = true; }
  }
  function placeBlock() {
    unlockAudio();
    const hd = heldDef();
    if (targetMob) {
      // food in hand: feed the animal (heals, tames, love mode -> babies)
      if (hd && hd.food) { const msg = mobs.feed(targetMob, hd); if (msg) { toast(msg); held.swing(); dirtySave = true; return; } }
      if (targetMob.rideable && !player.mount && !player.keys.ShiftLeft) {
        if (targetMob.baby) { toast('This foal is too young to ride — it will grow up'); return; }
        mountHorse(targetMob); return;
      }
      const msg = mobs.interact(targetMob); if (msg) toast(msg); dirtySave = true; return;
    }
    if (hd && hd.fishEgg) { placeFish(hd); return; }
    if (hd && hd.weapon) { if (hd.weapon.ranged) quickShot(); return; } // weapons never place anything
    if (hd && hd.food && hd.render === 'item') {
      const usable = target && !player.keys.ShiftLeft && (BL.doorInfo(target.id) || BL.bedInfo(target.id) || target.id === B.TNT);
      if (!usable) { if (!eat(hd)) toast('Feed the ' + hd.name.toLowerCase() + ' to a ' + hd.food.feeds.join(' or ') + ' — aim at it'); return; }
    }
    if (!target) return;
    const hdef = defs[hotbar[selected]];
    if (hdef && hdef.places === 'bucket') { const k = scoopFluid(); toast(k === 1 ? 'Scooped up water' : k === 2 ? 'Scooped up lava' : 'Aim at a water or lava source'); return; }
    if (!player.keys.ShiftLeft) {
      if (BL.doorInfo(target.id)) { toggleDoor(target.x, target.y, target.z, target.id); return; }
      if (BL.bedInfo(target.id)) { useBed(target.x, target.y, target.z, target.id); return; }
    }
    if (target.id === B.TNT && !player.keys.ShiftLeft) { // right-click / tap lights TNT (Shift+click places against it)
      if (tnt.ignite(target.x, target.y, target.z)) { toast('TNT lit — run!'); dirtySave = true; } else toast('Too much TNT already burning');
      mouse.timer = 0.4; return;
    }
    let id = hotbar[selected];
    const d = defs[id];
    let x = target.x, y = target.y, z = target.z;
    const onPlant = VC.Blocks.RENDER[target.id] === 4;
    if (!onPlant) { x += target.nx; y += target.ny; z += target.nz; }
    if (y < 0 || y >= CH) return;
    const cur = world.getBlock(x, y, z);
    if (!isReplaceable(cur)) return;
    if (d.egg) {
      const hostileEgg = VC.MOB_TYPES[d.egg] && VC.MOB_TYPES[d.egg].hostile;
      if (hostileEgg && !settings.hostile) { toast('Hostile mobs are off (pause menu)'); return; }
      const m = mobs.spawn(d.egg, x + 0.5, y + 0.01, z + 0.5, { yaw: player.yaw + Math.PI, wild: hostileEgg });
      if (!m) toast(hostileEgg ? 'Too many monsters (max ' + mobs.maxHostile + ')' : 'Too many animals (max ' + mobs.max + ')');
      else { toast(mobs.name(m) + ' spawned' + (hostileEgg ? ' — watch out!' : ' — ' + (touchOn() ? 'tap' : 'right-click') + ' it to tame')); dirtySave = true; }
      return;
    }
    const free = (xx, yy, zz) => { const c = world.getBlock(xx, yy, zz); return c >= 0 && isReplaceable(c); };
    const support = (xx, yy, zz) => { const c = world.getBlock(xx, yy, zz); return c > 0 && BL.SOLID[c] && !BL.defs[c].shape; };
    if (d.places === 'door') {
      const f = BL.facingFromYaw(player.yaw);
      if (!free(x, y + 1, z) || !support(x, y - 1, z)) { toast('A door needs 2 free blocks on solid ground'); return; }
      if (player.intersectsBlock(x, y, z) || player.intersectsBlock(x, y + 1, z)) return;
      world.setBlock(x, y, z, BL.doorId(d.base, f, false, false)); world.setBlock(x, y + 1, z, BL.doorId(d.base, f, false, true));
      placed(world.getBlock(x, y, z), x, y, z); dirtySave = true; return;
    }
    if (d.places === 'bed') {
      const f = BL.facingFromYaw(player.yaw), [dx, dz] = DIRS[f];
      if (!free(x + dx, y, z + dz) || !support(x, y - 1, z) || !support(x + dx, y - 1, z + dz)) { toast('A bed needs 2 free blocks on solid ground'); return; }
      if (player.intersectsBlock(x, y, z) || player.intersectsBlock(x + dx, y, z + dz)) return;
      world.setBlock(x, y, z, B.BED + f * 2); world.setBlock(x + dx, y, z + dz, B.BED + f * 2 + 1);
      placed(B.BED, x, y, z); dirtySave = true; return;
    }
    if (d.places === 'fluid') { world.setBlock(x, y, z, d.fluidBlock); VC.Audio.play('splash', 0.5); held.swing(); dirtySave = true; return; }
    if (d.render === 'item') return; // other items (weapons, food) never become blocks
    if (id === B.TORCH) {
      const support = onPlant ? world.getBlock(x, y - 1, z) : target.id;
      if (!VC.Blocks.SOLID[support] || VC.Blocks.RENDER[support] === 5) return;
      if (!onPlant && target.ny === -1) return;            // no ceiling torches
      if (!onPlant && target.ny === 0) id = WALL_TORCH[target.nx + ',' + target.nz];
    }
    if (VC.Blocks.SOLID[id] && player.intersectsBlock(x, y, z)) return;
    if (VC.Blocks.RENDER[id] === 4) { const below = world.getBlock(x, y - 1, z); if (below !== B.GRASS && below !== B.DIRT && below !== B.SNOW) return; }
    world.setBlock(x, y, z, id);
    placed(id, x, y, z);
  }
  function placed(id, x, y, z) { held.swing(); VC.Audio.blockSound('place', id, { x: x + 0.5, y: y + 0.5, z: z + 0.5 }); }
  function pickBlock() {
    if (!target) return;
    const d = defs[target.id], id = d.item || target.id;
    if (!defs[id].placeable) return;
    const i = hotbar.indexOf(id);
    if (i >= 0) select(i); else { hotbar[selected] = id; buildHotbar(); toast(defs[id].name); }
  }

  // ---------- health, damage, explosions, death ----------
  const heartImgs = {};
  function heartCanvas(kind) {
    if (heartImgs[kind]) return heartImgs[kind];
    const c = document.createElement('canvas'); c.width = c.height = 9; const g = c.getContext('2d');
    const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
    g.fillStyle = '#000'; rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') { g.fillRect(x, y + 1, 3, 3); } }));
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch !== 'X') return;
      const full = kind === 'full' || (kind === 'half' && x < 3);
      g.fillStyle = full ? (y === 1 && x === 1 ? '#ff9a9a' : '#e0202a') : '#3a1414';
      g.fillRect(x + 1, y + 2, 1, 1);
    }));
    return (heartImgs[kind] = c);
  }
  let heartsShown = -1;
  function updateHearts(force) {
    if (!player) return;
    const h = player.health;
    if (!force && h === heartsShown) return;
    heartsShown = h;
    const el = $('hearts'); el.innerHTML = '';
    for (let i = 0; i < player.maxHealth / 2; i++) {
      const kind = h >= (i + 1) * 2 ? 'full' : h === i * 2 + 1 ? 'half' : 'empty';
      const c = document.createElement('canvas'); c.width = c.height = 9; c.getContext('2d').drawImage(heartCanvas(kind), 0, 0); el.appendChild(c);
    }
    el.classList.toggle('low', h > 0 && h <= 6);
  }
  let hurtTimer = 0, lavaT = 0, burnTick = 1;
  function onHurt() {
    hurtTimer = 0.25; $('hurt-overlay').classList.add('on');
    if (settings.sound) VC.Sound.play('hurt', 0.6);
    updateHearts();
  }
  function onExplode(c, r) {
    const R2 = r * 2.2;
    const pc = player.pos.clone(); pc.y += 0.9;
    const d = pc.distanceTo(c);
    player.shake = Math.max(player.shake, Math.max(0, 1 - d / (r * 8)) * 0.9);
    if (d < R2 && state !== 'title') {
      const f = 1 - d / R2;
      player.invuln = 0; player.lastCause = 'tnt';
      if (player.hurt(Math.ceil(f * 18), c, null, 4 + f * 14)) onHurt();
    }
    for (const m of [...mobs.list]) {
      const md = m.pos.distanceTo(c);
      if (md < R2) { const f = 1 - md / R2; mobs.damage(m, Math.ceil(f * (m.tamed ? 9 : 18)), c, 'tnt'); if (!m.dead) { m.vel.y = 4 + f * 8; } }
    }
  }
  function spawnPointIsBed() { if (!spawnPoint) return false; const [x, y, z] = spawnPoint; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -1; dy <= 0; dy++) if (BL.bedInfo(world.getBlock(Math.floor(x) + dx, Math.floor(y) + dy, Math.floor(z) + dz))) return true; return false; }
  function respawn(silent) {
    if (!player.dead && silent !== true) { play(); return; }
    const [x, y, z] = spawnPoint || findSpawn(world.gen);
    // make sure the spawn column is clear (an explosion or building may have changed it)
    const bx = Math.floor(x), bz = Math.floor(z);
    let sy = Math.floor(y);
    const c = world.getChunk(Math.floor(bx / CS), Math.floor(bz / CS));
    if (c) { while (sy < CH - 2 && (VC.Blocks.SOLID[world.getBlock(bx, sy, bz)] || VC.Blocks.SOLID[world.getBlock(bx, sy + 1, bz)])) sy++; }
    if (player.mount) { player.dismount(true); updateRideUi(); }
    if (charge.on) useEnd(true);
    player.respawn(x, sy + 0.01, z); player.burnT = 0; player.lastCause = null;
    for (const m of [...mobs.list]) if (m.hostile && Math.hypot(m.pos.x - x, m.pos.z - z) < 24) mobs.remove(m);
    updateHearts(true);
    dirtySave = true;
    if (silent !== true) play();
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
      `Time: ${timeString()}   Mode: ${player.mount ? 'riding' : player.flying ? 'flying' : player.inWater ? 'swimming' : 'walking'}   Fish: ${mobs.fishes()}/${mobs.maxFish}\n` +
      `Target: ${targetMob ? (targetMob.tamed ? 'Tamed ' : '') + targetMob.type : tgt}   Animals: ${mobs.animals()}/${mobs.max}  Hostile: ${mobs.hostiles()}/${mobs.maxHostile}  TNT: ${tnt.count}  Fluid queue: ${fluids.pending}\n` +
      `Held: ${heldDef().name}  Arrows: ${proj.flying} flying / ${proj.stuck} stuck  Sound: ${VC.Audio.ctx ? VC.Audio.ctx.state : 'off'}${settings.sound ? '' : ' (muted)'} · ${VC.Audio.played} played${VC.Audio.music.playing ? ' · music' : ''}  ${amb.cave ? 'cave' : amb.outdoors ? 'outdoors' : 'indoors'}\n` +
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
    if (playing && mobs.list.length && !player.dead) {
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
      const mh = mobs.raycast(camera.position, dir, Math.max(5, weaponOf(heldDef()).reach));
      // plants/torches occupy a whole cell for ray picking; let animals standing in them win
      if (mh && (!target || mh.t < target.t || VC.Blocks.RENDER[target.id] >= 4)) { targetMob = mh.mob; target = null; }
    }
    if (playing) {
      mobs.update(dt, player, currentDaylight);
      tnt.daylight = currentDaylight; tnt.listener = player.pos;
      tnt.update(dt);
      fluids.update(dt);
      proj.daylight = currentDaylight; proj.update(dt, player);
      if (charge.on) { charge.t += dt; held.charge = Math.min(1, charge.t / charge.w.drawTime); if (heldRanged() !== charge.w || player.dead) useEnd(true); }
      player.slow = charge.on ? 0.4 : 1;
      // lava burns; water puts the fire out
      if (!player.dead) {
        if (player.inLava) { player.burnT = 4; lavaT -= dt; if (lavaT <= 0) { lavaT = 0.5; player.invuln = 0; player.lastCause = 'lava'; if (player.hurt(3, null, null)) onHurt(); } }
        else if (player.burnT > 0) {
          if (player.inWater) player.burnT = 0;
          else { player.burnT -= dt; burnTick -= dt; if (burnTick <= 0) { burnTick = 1; player.lastCause = 'fire'; if (player.hurt(1, null, null)) onHurt(); } }
        }
      }
      $('burn-overlay').classList.toggle('on', !player.dead && (player.inLava || player.burnT > 0));
      $('lava-overlay').style.display = player.headInLava ? 'block' : 'none';
      if (sleeping > 0 && performance.now() >= sleeping) { sleeping = 0; finishSleep(); }
      updateHearts();
      if (!!player.mount !== document.body.classList.contains('riding')) updateRideUi();
      if (player.dead) { // death screen
        setState('dead'); if (document.pointerLockElement) document.exitPointerLock();
        const la = player.lastAttacker, cause = player.lastCause;
        $('dead-msg').textContent = (cause === 'lava' ? 'Tried to swim in lava. ' : cause === 'fire' ? 'Burned to death. ' : cause === 'mob' && la ? 'Slain by a ' + mobs.name(la).toLowerCase() + '. ' : 'Blown up! ') + 'Your world is safe — respawn at your ' + (spawnPointIsBed() ? 'bed.' : 'spawn point.');
        toast('');
      }
      if (pendingMobs) { const c = world.getChunk(Math.floor(player.pos.x / CS), Math.floor(player.pos.z / CS)); if (c && c.meshes && !player.frozen) { mobs.load(pendingMobs); pendingMobs = null; } }
    }
    lightUniforms.uTime.value = now / 1000;
    if (target) { selBox.visible = true; selBox.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5); } else selBox.visible = false;
    if (playing && (mouse.left || (mouse.right && !charge.on))) { mouse.timer -= dt; if (mouse.timer <= 0) { mouse.timer = 0.22; if (mouse.left) breakBlock(); else placeBlock(); } }
    if (state !== 'playing' && tnt && (tnt.count || tnt.particles.length) && state !== 'title') { tnt.update(state === 'dead' ? dt : 0); }
    if (hurtTimer > 0) { hurtTimer -= dt; if (hurtTimer <= 0) $('hurt-overlay').classList.remove('on'); }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').style.opacity = 0; }
    if (dirtySave) { saveTimer += dt; if (saveTimer > 2) saveGame(); }
    hudTimer -= dt; if (hudTimer <= 0 && state !== 'title') { hudTimer = 0.25; updateHud(); }
    // loading indicator on title
    if (state === 'title') { const c = world.getChunk(Math.floor(player.pos.x / CS), Math.floor(player.pos.z / CS)); $('loading').textContent = c && c.meshes ? 'World ready' : 'Generating terrain…'; }
    updateHeld(dt);
    audioTick(dt);
    const tB = performance.now();
    renderer.render(scene, camera);
    if (state !== 'title' && state !== 'dead' && !player.dead) held.render(renderer);
    const tC = performance.now();
    perf.update = perf.update * 0.95 + (tB - tA) * 0.05; perf.render = perf.render * 0.95 + (tC - tB) * 0.05;
  }
  const perf = { update: 0, render: 0 };
  if (state !== 'playing' && charge.on) charge.on = false;

  // ---------- held item, charge bar ----------
  let heldBright = 1, heldLightT = 0, rangedUi = null;
  function updateHeld(dt) {
    if (!player) return;
    if (state !== 'playing' && charge.on) useEnd(true);
    held.set(hotbar[selected]);
    held.hidden = player.dead || (weaponOf(heldDef()).ranged === 'trident' && proj.tridentOut());
    heldLightT -= dt;
    if (heldLightT <= 0) {
      heldLightT = 0.25;
      const x = Math.floor(player.pos.x), y = Math.floor(player.pos.y + player.eye), z = Math.floor(player.pos.z);
      const L = world.getBlockLight(x, y, z), sky = mobs.skyOpen(x, y, z) ? 1 : 0.4;
      heldBright = Math.max(0.16, sky * currentDaylight, L ? Math.pow(L / 15, 1.4) : 0);
    }
    const hs = Math.hypot(player.vel.x, player.vel.z);
    held.update(dt, { bob: player.bob, moving: hs > 0.6 && player.onGround, bright: heldBright, mobile: touchOn() });
    const cb = $('charge'); cb.style.display = charge.on ? 'block' : 'none'; if (charge.on) cb.firstChild.style.width = Math.round(held.charge * 100) + '%';
    cb.classList.toggle('full', charge.on && held.charge >= 1);
    const r = !!heldRanged(); if (r !== rangedUi) { rangedUi = r; document.body.classList.toggle('ranged', r); }
  }

  // ---------- sound: footsteps, landing, swimming, ambience ----------
  let stepDist = 0, wasGround = true, wasWater = false, minVy = 0, swimT = 0, envT = 0;
  const amb = { cave: false, outdoors: true };
  function blockUnder() {
    const x = Math.floor(player.pos.x), z = Math.floor(player.pos.z);
    let id = world.getBlock(x, Math.floor(player.pos.y - 0.05), z);
    if (id <= 0 || !BL.SOLID[id]) id = world.getBlock(x, Math.floor(player.pos.y - 0.6), z);
    return id;
  }
  function audioTick(dt) {
    if (!player || !world) return;
    VC.Audio.setListener(camera.position.x, camera.position.y, camera.position.z, player.yaw);
    const live = state === 'playing' && !player.dead && !player.frozen;
    if (live) {
      const hs = Math.hypot(player.vel.x, player.vel.z);
      if (player.onGround && !player.flying && hs > 0.6) {
        stepDist += hs * dt;
        const stride = player.mount ? (hs > 7 ? 1.25 : 1.6) : 1.7;
        if (stepDist > stride) { stepDist = 0; if (player.mount) VC.Audio.play('hoof', hs > 7 ? 0.5 : 0.4, { pitch: 0.9 + Math.random() * 0.2 }); else VC.Audio.step(blockUnder(), 0.42); }
      }
      if (!player.onGround && !player.inWater && !player.flying) minVy = Math.min(minVy, player.vel.y);
      if (player.onGround && !wasGround && minVy < -9) { VC.Audio.play('land', Math.min(0.9, -minVy / 22)); VC.Audio.step(blockUnder(), 0.5); }
      if (player.onGround || player.inWater || player.flying) minVy = 0;
      if (player.inWater && !wasWater && player.vel.y < -2) VC.Audio.play('splash', Math.min(1, 0.3 - player.vel.y * 0.05));
      if (player.inWater && !player.onGround && hs > 0.8) { swimT -= dt; if (swimT <= 0) { swimT = 0.75; VC.Audio.play('swim', 0.32, { pitch: 0.9 + Math.random() * 0.2 }); } }
      wasGround = player.onGround; wasWater = player.inWater;
      envT -= dt;
      if (envT <= 0) {
        envT = 1;
        const x = Math.floor(player.pos.x), y = Math.floor(player.pos.y + player.eye), z = Math.floor(player.pos.z);
        const covered = !mobs.skyOpen(x, y, z);
        amb.outdoors = !covered; amb.cave = covered && player.pos.y < world.gen.height(x, z) - 3;
      }
    }
    VC.Audio.ambient(dt, { active: live, day: currentDaylight, cave: amb.cave, outdoors: amb.outdoors, underwater: player.headInWater });
  }

  // ---------- boot ----------
  const existing = safeParse(localStorage.getItem(SAVE_KEY));
  if (existing && typeof existing.seed === 'number') { createWorld(existing.seed, existing); $('btn-play').textContent = 'Click to Play (continue world)'; }
  else { createWorld((Math.random() * 2147483647) | 0, null); }
  setState('title');
  updateTouchToggle();
  if (testMode) play();
  requestAnimationFrame(frame);

  // Expose for debugging / automated tests
  window.game = { perf, get isMobile() { return touchOn(); }, get mobs() { return mobs; }, get targetMob() { return targetMob; }, lightUniforms, play, saveSettings, toast, get hotbar() { return hotbar; }, get selected() { return selected; }, toggleFly: () => toggleFlyToast(), mountHorse, dismount, held, get proj() { return proj; }, useStart, useEnd, quickShot, heldDef, heldRanged, eat, attack, setMuted, get charge() { return charge; }, get amb() { return amb; }, openInventory: () => setState('inventory'), get world() { return world; }, get player() { return player; }, get state() { return state; }, settings, saveGame, setTime: (t) => { worldTime = t; }, renderer, scene, camera, setState, select, breakBlock, placeBlock, get target() { return target; }, get tnt() { return tnt; }, get fluids() { return fluids; }, useBed, toggleDoor, scoopFluid, get worldTime() { return worldTime; }, get sleeping() { return sleeping; }, setHostile, respawn, onExplode, get spawnPoint() { return spawnPoint; } };
})();
