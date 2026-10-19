// Animals & monsters: dogs, cats, lions (tameable, lions/dogs protect you); zombies, wolves, bears, spiders and crocodiles (hostile).
// Blocky box models, simple AI, physics, health/combat, taming, synthesized sounds, saving.
window.VC = window.VC || {};
(function () {
  'use strict';
  const B = VC.B, { SOLID, FLUID } = VC.Blocks;
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
    wolf: [
      { name: 'Gray wolf', body: 0x8d8d90, dark: 0x5e5e62, light: 0xc9c9cc },
      { name: 'Timber wolf', body: 0x7b6a58, dark: 0x4e4236, light: 0xb9a68e },
      { name: 'Black wolf', body: 0x3a3a3e, dark: 0x222225, light: 0x6a6a70 },
    ],
    bear: [
      { name: 'Brown bear', body: 0x6b4426, dark: 0x4a2e18, snout: 0x9a7048 },
      { name: 'Black bear', body: 0x262222, dark: 0x161414, snout: 0x8a6a4a },
      { name: 'Polar bear', body: 0xeeeee6, dark: 0xd2d2c8, snout: 0xe0ddd0 },
    ],
    spider: [
      { name: 'Spider', body: 0x3a3030, dark: 0x241d1d, eye: 0xd01818 },
      { name: 'Cave spider', body: 0x1f4a52, dark: 0x13333a, eye: 0xd01818 },
    ],
    croc: [
      { name: 'Crocodile', body: 0x4f6e33, dark: 0x3a5226, belly: 0xb9b880 },
      { name: 'Swamp croc', body: 0x5a5e36, dark: 0x3f4324, belly: 0xc2b98a },
    ],
    horse: [
      { name: 'Chestnut', body: 0x9a5a2e, mane: 0x5a3018, hoof: 0x3a2a20 },
      { name: 'Bay', body: 0x7a4a2a, mane: 0x1e1814, hoof: 0x1e1814, lower: 0x1e1814 },
      { name: 'Black', body: 0x262224, mane: 0x141214, hoof: 0x0e0c0c },
      { name: 'White', body: 0xe8e4dc, mane: 0xd2ccc0, hoof: 0x8a8070 },
      { name: 'Dapple gray', body: 0x9a9a9e, mane: 0x4a4a50, hoof: 0x2a2a2e, spots: 0xc8c8cc },
      { name: 'Palomino', body: 0xd6a24e, mane: 0xf2ead8, hoof: 0x5a4a3a },
      { name: 'Paint', body: 0xf0ece4, mane: 0x3a2a20, hoof: 0x5a4a3a, spots: 0x7a4a2a },
    ],
    cod: [{ name: 'Cod', body: 0xb59c74, dark: 0x8a7454, belly: 0xe2d8c2, fin: 0x9a8260 }],
    salmon: [{ name: 'Salmon', body: 0xa84a3e, dark: 0x5c6a70, belly: 0xe09a84, fin: 0x7a3a30 }],
    tropical: [
      { name: 'Clownfish', body: 0xf07818, stripe: 0xffffff, edge: 0x141414, fin: 0xf07818 },
      { name: 'Blue tang', body: 0x2a5cd8, stripe: 0x101a44, edge: 0x101a44, fin: 0xf2d020 },
      { name: 'Yellow tang', body: 0xf2d020, stripe: 0xf8e870, edge: 0xd8b010, fin: 0xf2d020 },
    ],
    puffer: [{ name: 'Pufferfish', body: 0xe4c84a, spots: 0x6a5a2a, belly: 0xf4ecc8, spike: 0xf8f0d0, fin: 0x60a0c0 }],
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
    zombie: { hw: 0.3, h: 1.85, speed: 0.9, run: 2.5, hp: 20, hostile: true, attack: 3, reach: 0.6, cooldown: 1.0, sight: 24, burns: true },
    wolf: { hw: 0.3, h: 0.9, speed: 1.4, run: 5.4, hp: 12, hostile: true, attack: 3, reach: 0.6, cooldown: 0.8, sight: 28, stalk: true, pack: true },
    bear: { hw: 0.5, h: 1.35, speed: 1.1, run: 4.4, hp: 34, hostile: true, attack: 6, reach: 0.8, cooldown: 1.3, sight: 20 },
    spider: { hw: 0.45, h: 0.6, speed: 1.5, run: 5.0, hp: 14, hostile: true, attack: 2, reach: 0.6, cooldown: 0.7, sight: 24, stalk: true, climbs: true, leaps: true },
    croc: { hw: 0.42, h: 0.5, speed: 0.8, run: 3.0, swim: 5.5, hp: 22, hostile: true, attack: 5, reach: 1.0, cooldown: 1.2, sight: 16, aquatic: true },
    // rideable: tame-and-mount with right-click / tap; tamed horses stay where you leave them
    horse: { hw: 0.45, h: 1.55, speed: 1.3, run: 4.5, hp: 24, tame: true, rideable: true, stays: true },
    // fish: swim inside water only, flop & slowly die on land
    cod: { hw: 0.14, h: 0.26, speed: 1.0, swim: 1.5, hp: 3, fish: true },
    salmon: { hw: 0.15, h: 0.28, speed: 1.2, swim: 2.1, hp: 4, fish: true },
    tropical: { hw: 0.1, h: 0.3, speed: 0.9, swim: 1.3, hp: 3, fish: true },
    puffer: { hw: 0.15, h: 0.3, speed: 0.6, swim: 0.8, hp: 3, fish: true },
  };
  VC.MOB_TYPES = TYPES;
  // voice pitch for the generic hurt / death sounds
  const VOICE = { dog: 1.35, cat: 1.75, lion: 0.75, zombie: 0.62, wolf: 1.1, bear: 0.5, spider: 1.6, croc: 0.58, horse: 0.85, cod: 2.2, salmon: 2.1, tropical: 2.4, puffer: 2.3 };
  const GROW = 240; // seconds for a baby to grow up
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
      parts.legY = 0.4; parts.tailY = 0.64; parts.headY = 0.72; parts.headZ = 0.42;
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
      parts.legY = 0.3; parts.tailY = 0.5; parts.headY = 0.56; parts.headZ = 0.36;
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
      parts.legY = 0.56; parts.tailY = 0.88; parts.headY = 1.0; parts.headZ = 0.56;
    } else if (type === 'wolf') {
      add(torso, box(0.34, 0.34, 0.74, C.body), 0, 0.6, 0);
      add(torso, box(0.42, 0.4, 0.3, C.light), 0, 0.64, 0.24);           // ruff
      add(torso, box(0.35, 0.08, 0.6, C.dark), 0, 0.79, -0.05);           // dark back
      const head = parts.head = new THREE.Group(); head.position.set(0, 0.76, 0.46); root.add(head);
      add(head, box(0.32, 0.3, 0.28, C.body), 0, 0, 0);
      add(head, box(0.18, 0.13, 0.22, C.light), 0, -0.07, 0.22);          // long snout
      add(head, box(0.07, 0.06, 0.04, 0x111111), 0, -0.03, 0.34);
      add(head, box(0.06, 0.05, 0.02, 0xffc020), 0.08, 0.05, 0.145);       // yellow eyes
      add(head, box(0.06, 0.05, 0.02, 0xffc020), -0.08, 0.05, 0.145);
      add(head, box(0.08, 0.14, 0.06, C.dark), 0.1, 0.2, -0.04);           // pointy ears
      add(head, box(0.08, 0.14, 0.06, C.dark), -0.1, 0.2, -0.04);
      add(head, box(0.12, 0.03, 0.02, 0xf2f2f2), 0, -0.13, 0.31);          // fangs
      for (const [x, z] of [[0.11, 0.25], [-0.11, 0.25], [0.11, -0.25], [-0.11, -0.25]]) parts.legs.push(add(root, box(0.11, 0.45, 0.11, C.body, true), x, 0.45, z));
      parts.tail = add(root, shifted(box(0.1, 0.1, 0.42, C.dark), 0, 0, -0.21), 0, 0.7, -0.36); parts.tail.rotation.x = 0.5;
      parts.legY = 0.45; parts.tailY = 0.7; parts.headY = 0.76; parts.headZ = 0.46;
    } else if (type === 'bear') {
      add(torso, box(0.86, 0.72, 1.24, C.body), 0, 0.88, 0);
      add(torso, box(0.7, 0.2, 0.5, C.dark), 0, 1.26, 0.3);               // hump
      const head = parts.head = new THREE.Group(); head.position.set(0, 1.02, 0.72); root.add(head);
      add(head, box(0.52, 0.46, 0.4, C.body), 0, 0, 0);
      add(head, box(0.26, 0.2, 0.2, C.snout), 0, -0.1, 0.28);
      add(head, box(0.1, 0.07, 0.04, 0x111111), 0, -0.04, 0.39);
      add(head, box(0.06, 0.06, 0.02, 0x111111), 0.13, 0.08, 0.205);
      add(head, box(0.06, 0.06, 0.02, 0x111111), -0.13, 0.08, 0.205);
      add(head, box(0.12, 0.12, 0.08, C.dark), 0.2, 0.26, -0.04);
      add(head, box(0.12, 0.12, 0.08, C.dark), -0.2, 0.26, -0.04);
      for (const [x, z] of [[0.26, 0.42], [-0.26, 0.42], [0.26, -0.42], [-0.26, -0.42]]) parts.legs.push(add(root, box(0.26, 0.56, 0.28, C.dark, true), x, 0.56, z));
      parts.tail = add(root, box(0.14, 0.14, 0.12, C.body), 0, 1.0, -0.66);
      parts.legY = 0.56; parts.tailY = 1.0; parts.headY = 1.02; parts.headZ = 0.72;
    } else if (type === 'spider') {
      add(torso, box(0.46, 0.34, 0.4, C.body), 0, 0.4, 0.12);               // thorax
      add(torso, box(0.72, 0.5, 0.66, C.dark), 0, 0.48, -0.42);             // abdomen
      add(torso, box(0.5, 0.06, 0.4, C.body), 0, 0.74, -0.42);
      const head = parts.head = new THREE.Group(); head.position.set(0, 0.42, 0.42); root.add(head);
      add(head, box(0.36, 0.3, 0.26, C.body), 0, 0, 0);
      for (const [x, y] of [[0.1, 0.06], [-0.1, 0.06], [0.05, -0.02], [-0.05, -0.02], [0.14, -0.04], [-0.14, -0.04]]) add(head, box(0.05, 0.05, 0.02, C.eye), x, y, 0.135);
      add(head, box(0.04, 0.08, 0.06, 0x111111), 0.06, -0.14, 0.1); add(head, box(0.04, 0.08, 0.06, 0x111111), -0.06, -0.14, 0.1); // fangs
      for (let i = 0; i < 8; i++) { // legs: long thin boxes pivoting at the body, splayed out
        const side = i < 4 ? 1 : -1, k = i % 4, z = 0.3 - k * 0.17;
        const g = new THREE.Group(); g.position.set(side * 0.2, 0.44, z); root.add(g);
        const l = new THREE.Mesh(shifted(box(0.7, 0.06, 0.06, C.dark), side * 0.35, 0, 0), mat); g.add(l);
        g.rotation.z = side * -0.55; g.rotation.y = (k - 1.5) * 0.35 * side;
        g.userData = { side, k, baseY: g.rotation.y };
        parts.legs.push(g);
      }
      parts.spider = true; parts.tail = new THREE.Object3D(); root.add(parts.tail);
      parts.legY = 0.44; parts.tailY = 0.44; parts.headY = 0.42; parts.headZ = 0.42;
    } else if (type === 'croc') {
      add(torso, box(0.7, 0.3, 1.3, C.body), 0, 0.3, 0);
      add(torso, box(0.6, 0.06, 1.2, C.belly), 0, 0.15, 0);
      for (let i = 0; i < 5; i++) add(torso, box(0.12, 0.06, 0.12, C.dark), (i % 2 ? 0.14 : -0.14), 0.48, 0.5 - i * 0.25); // scutes
      const head = parts.head = new THREE.Group(); head.position.set(0, 0.32, 0.65); root.add(head);
      add(head, box(0.5, 0.24, 0.36, C.body), 0, 0.02, 0.1);
      add(head, box(0.36, 0.12, 0.6, C.body), 0, 0.06, 0.55);              // upper jaw
      parts.jaw = add(head, box(0.34, 0.08, 0.56, C.belly), 0, -0.06, 0.53); // lower jaw
      for (let i = 0; i < 4; i++) { add(head, box(0.03, 0.05, 0.03, 0xf4f0e0), 0.16, -0.01, 0.35 + i * 0.13); add(head, box(0.03, 0.05, 0.03, 0xf4f0e0), -0.16, -0.01, 0.35 + i * 0.13); }
      add(head, box(0.08, 0.08, 0.08, 0xd8c020), 0.15, 0.18, 0.12); add(head, box(0.08, 0.08, 0.08, 0xd8c020), -0.15, 0.18, 0.12);
      for (const [x, z] of [[0.36, 0.4], [-0.36, 0.4], [0.36, -0.4], [-0.36, -0.4]]) parts.legs.push(add(root, box(0.16, 0.22, 0.18, C.dark, true), x, 0.22, z));
      parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.3, -0.62); root.add(parts.tail);
      add(parts.tail, shifted(box(0.4, 0.22, 0.6, C.body), 0, 0, -0.3), 0, 0, 0);
      add(parts.tail, shifted(box(0.22, 0.14, 0.6, C.dark), 0, 0, -0.85), 0, 0, 0);
      parts.legY = 0.22; parts.tailY = 0.3; parts.headY = 0.32; parts.headZ = 0.65; parts.low = true;
    } else if (type === 'horse') {
      add(torso, box(0.6, 0.62, 1.3, C.body), 0, 1.12, 0);
      if (C.spots) { add(torso, box(0.61, 0.3, 0.34, C.spots), 0, 1.2, 0.18); add(torso, box(0.61, 0.24, 0.3, C.spots), 0, 1.0, -0.36); add(torso, box(0.3, 0.2, 0.22, C.spots), 0.16, 1.4, -0.1); }
      const head = parts.head = new THREE.Group(); head.position.set(0, 1.3, 0.58); root.add(head);
      const neck = add(head, box(0.3, 0.78, 0.38, C.body), 0, 0.3, 0.06); neck.rotation.x = 0.5;
      const mane = add(head, box(0.1, 0.82, 0.14, C.mane), 0, 0.34, -0.16); mane.rotation.x = 0.5;
      add(head, box(0.34, 0.3, 0.62, C.body), 0, 0.66, 0.34);                // head + long snout
      add(head, box(0.3, 0.2, 0.2, C.lower || C.mane === 0xf2ead8 ? 0x5a4632 : 0x4a3a30), 0, 0.6, 0.62); // muzzle
      add(head, box(0.04, 0.06, 0.06, 0x101010), 0.175, 0.72, 0.36); add(head, box(0.04, 0.06, 0.06, 0x101010), -0.175, 0.72, 0.36); // eyes
      add(head, box(0.08, 0.14, 0.06, C.body), 0.11, 0.86, 0.1); add(head, box(0.08, 0.14, 0.06, C.body), -0.11, 0.86, 0.1); // ears
      add(head, box(0.12, 0.08, 0.2, C.mane), 0, 0.84, 0.2); // forelock
      for (const [x, z] of [[0.2, 0.5], [-0.2, 0.5], [0.2, -0.5], [-0.2, -0.5]]) {
        const g = new THREE.Group(); g.position.set(x, 0.82, z); root.add(g);
        add(g, box(0.18, 0.6, 0.18, C.body, true), 0, 0, 0);
        add(g, box(0.18, 0.16, 0.18, C.lower || C.body, true), 0, -0.6, 0);
        add(g, box(0.2, 0.06, 0.2, C.hoof, true), 0, -0.76, 0);
        parts.legs.push(g);
      }
      parts.tail = new THREE.Group(); parts.tail.position.set(0, 1.36, -0.64); root.add(parts.tail);
      add(parts.tail, box(0.16, 0.7, 0.16, C.mane, true), 0, 0, 0);
      // saddle (shown when tamed) and the rider's legs (shown while ridden)
      const saddle = parts.collar = new THREE.Group(); root.add(saddle);
      add(saddle, box(0.64, 0.06, 0.52, 0x5a3418), 0, 1.45, -0.05); add(saddle, box(0.5, 0.12, 0.1, 0x6e4220), 0, 1.5, 0.18); add(saddle, box(0.66, 0.04, 0.6, 0xa02828), 0, 1.43, -0.05);
      add(saddle, box(0.04, 0.34, 0.06, 0x2a2a2a), 0.33, 1.26, -0.02); add(saddle, box(0.04, 0.34, 0.06, 0x2a2a2a), -0.33, 1.26, -0.02);
      const rider = parts.rider = new THREE.Group(); root.add(rider); rider.visible = false;
      for (const sx of [1, -1]) { add(rider, box(0.18, 0.18, 0.42, 0x3a4aa0), sx * 0.26, 1.56, 0.1); add(rider, box(0.17, 0.5, 0.17, 0x3a4aa0), sx * 0.38, 1.3, 0.24); add(rider, box(0.19, 0.12, 0.26, 0x4a3426), sx * 0.38, 1.02, 0.28); }
      parts.legY = 0.82; parts.tailY = 1.36; parts.headY = 1.3; parts.headZ = 0.58; parts.horse = true;
    } else if (TYPES[type] && TYPES[type].fish) {
      const T = TYPES[type];
      if (type === 'puffer') {
        add(torso, box(0.3, 0.26, 0.3, C.body), 0, 0.15, 0); add(torso, box(0.28, 0.06, 0.28, C.belly), 0, 0.03, 0);
        for (const [x, y, z] of [[0.16, 0.15, 0], [-0.16, 0.15, 0], [0, 0.29, 0], [0, 0.15, 0.16], [0.1, 0.25, -0.1], [-0.1, 0.06, 0.1], [0.1, 0.06, -0.1], [-0.1, 0.25, 0.1]]) add(torso, box(0.04, 0.04, 0.04, C.spike), x, y, z);
        add(torso, box(0.06, 0.06, 0.06, C.spots), 0.08, 0.22, -0.06); add(torso, box(0.06, 0.06, 0.06, C.spots), -0.07, 0.2, 0.04);
        add(torso, box(0.05, 0.05, 0.02, 0x101010), 0.09, 0.2, 0.15); add(torso, box(0.05, 0.05, 0.02, 0x101010), -0.09, 0.2, 0.15);
        parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.15, -0.15); torso.add(parts.tail); add(parts.tail, box(0.02, 0.14, 0.1, C.fin), 0, 0, -0.05);
      } else {
        const L = type === 'salmon' ? 0.56 : type === 'cod' ? 0.48 : 0.26, H = type === 'tropical' ? 0.24 : 0.16, Wd = type === 'tropical' ? 0.08 : 0.13;
        add(torso, box(Wd, H, L, C.body), 0, 0.13, 0);
        if (C.belly) add(torso, box(Wd - 0.01, 0.05, L * 0.8, C.belly), 0, 0.13 - H / 2 + 0.03, 0.02);
        if (C.dark) add(torso, box(Wd + 0.005, 0.04, L * 0.9, C.dark), 0, 0.13 + H / 2 - 0.03, 0);
        if (C.stripe) { add(torso, box(Wd + 0.01, H + 0.005, 0.04, C.stripe), 0, 0.13, L * 0.18); add(torso, box(Wd + 0.01, H * 0.8, 0.035, C.stripe), 0, 0.13, -L * 0.2); }
        add(torso, box(0.02, type === 'tropical' ? 0.08 : 0.06, L * 0.4, C.fin), 0, 0.13 + H / 2 + 0.03, -0.02);   // dorsal fin
        add(torso, box(Wd + 0.02, 0.03, 0.03, 0x101010), 0, 0.16, L / 2 - 0.06);                                    // eyes
        parts.tail = new THREE.Group(); parts.tail.position.set(0, 0.13, -L / 2); torso.add(parts.tail);
        add(parts.tail, box(0.02, H * 1.1, 0.14, C.fin), 0, 0, -0.07);
      }
      parts.collar = new THREE.Object3D(); parts.legY = 0; parts.headY = 0; parts.head = new THREE.Group(); root.add(parts.head); parts.fish = true;
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
      parts.legY = 0.72; parts.headY = 1.42; parts.headZ = 0;
    }
    parts.torso = torso;
    if (!parts.collar) parts.collar = new THREE.Object3D();
    return { root, mat, parts };
  }

  // ---------- creature & effect voices (synthesized; routed through VC.Audio's mixer) ----------
  const noise = (ctx) => VC.Audio.noise(ctx);
  function env(ctx, g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  const MOB_VOICES = ['dog', 'cat', 'lion', 'zombie', 'wolf', 'bear', 'horse', 'spider', 'croc'];
  function playSound(type, vol, pos) { return VC.Audio.play(type, vol, pos ? { pos } : undefined); }
  function legacySynth(type, ctx, out, t) {
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
    } else if (type === 'wolf') { // growl + short howl
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 900; lfo.frequency.value = 30; lg.gain.value = 20; lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(140, t + 0.5);
      env(ctx, g, t, 0.05, 0.35, 0.6); o.connect(f); f.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.62); lfo.stop(t + 0.62);
      const h = ctx.createOscillator(), hg = ctx.createGain(); h.type = 'triangle';
      h.frequency.setValueAtTime(420, t + 0.6); h.frequency.linearRampToValueAtTime(640, t + 1.0); h.frequency.linearRampToValueAtTime(520, t + 1.6);
      hg.gain.setValueAtTime(0.0001, t + 0.6); hg.gain.linearRampToValueAtTime(0.18, t + 0.8); hg.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      h.connect(hg); hg.connect(out); h.start(t + 0.6); h.stop(t + 1.75);
    } else if (type === 'bear') { // deep roar
      const n = noise(ctx), f = ctx.createBiquadFilter(), g1 = ctx.createGain();
      f.type = 'bandpass'; f.frequency.setValueAtTime(180, t); f.frequency.linearRampToValueAtTime(380, t + 0.3); f.frequency.linearRampToValueAtTime(140, t + 1.0); f.Q.value = 1.5;
      env(ctx, g1, t, 0.1, 0.8, 1.1); n.connect(f); f.connect(g1); g1.connect(out); n.start(t); n.stop(t + 1.15);
      const o = ctx.createOscillator(), g2 = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(60, t); o.frequency.linearRampToValueAtTime(85, t + 0.3); o.frequency.linearRampToValueAtTime(45, t + 1.0);
      env(ctx, g2, t, 0.1, 0.4, 1.05); o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 1.1);
    } else if (type === 'horse') { // whinny: vibrato that rises then falls, plus a snort
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.2; lfo.frequency.value = 11; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.setValueAtTime(500, t); o.frequency.linearRampToValueAtTime(950, t + 0.25); o.frequency.linearRampToValueAtTime(420, t + 1.0);
      env(ctx, g, t, 0.05, 0.35, 1.05); o.connect(f); f.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 1.1); lfo.stop(t + 1.1);
      const n = noise(ctx), nf = ctx.createBiquadFilter(), ng = ctx.createGain(); nf.type = 'lowpass'; nf.frequency.value = 700;
      env(ctx, ng, t + 1.05, 0.01, 0.4, 0.2); n.connect(nf); nf.connect(ng); ng.connect(out); n.start(t + 1.05); n.stop(t + 1.3);
    } else if (type === 'splash') {
      const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.7;
      env(ctx, g, t, 0.005, 0.25, 0.18); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.2);
    } else if (type === 'door_open' || type === 'door_close') { // wooden creak / thunk
      const op = type === 'door_open';
      const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = op ? 900 : 380; f.Q.value = 3;
      env(ctx, g, t, 0.005, 0.6, op ? 0.25 : 0.12); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.3);
      const o = ctx.createOscillator(), g2 = ctx.createGain(); o.type = 'square';
      o.frequency.setValueAtTime(op ? 220 : 110, t); o.frequency.exponentialRampToValueAtTime(op ? 330 : 60, t + 0.15);
      env(ctx, g2, t, 0.005, 0.12, 0.16); o.connect(g2); g2.connect(out); o.start(t); o.stop(t + 0.18);
    } else if (type === 'spider') { // clicking hiss
      for (let k = 0; k < 3; k++) {
        const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain(), s0 = t + k * 0.13;
        f.type = 'highpass'; f.frequency.value = 2500; env(ctx, g, s0, 0.01, 0.3, 0.12); n.connect(f); f.connect(g); g.connect(out); n.start(s0); n.stop(s0 + 0.13);
      }
    } else if (type === 'croc') { // low hiss + jaw snap
      const n = noise(ctx), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
      env(ctx, g, t, 0.08, 0.3, 0.7); n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.72);
      const s2 = ctx.createOscillator(), g2 = ctx.createGain(); s2.type = 'square'; s2.frequency.setValueAtTime(180, t + 0.72); s2.frequency.exponentialRampToValueAtTime(60, t + 0.8);
      env(ctx, g2, t + 0.72, 0.003, 0.35, 0.1); s2.connect(g2); g2.connect(out); s2.start(t + 0.72); s2.stop(t + 0.84);
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

  for (const n of MOB_VOICES.concat(['door_open', 'door_close', 'hurt', 'hit', 'fuse', 'boom']))
    VC.Audio.register(n, (ctx, out, t) => legacySynth(n, ctx, out, t), MOB_VOICES.includes(n) ? 'mobs' : 'effects', n === 'boom' ? 2 : 1.8);

  // ---------- particles (hearts / puffs) ----------
  function spriteTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 16; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; return t; }
  const heartTex = spriteTex((g) => { g.fillStyle = '#e8203a'; const rows = ['..XX...XX..', '.XXXX.XXXX.', 'XXXXXXXXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..XXXXXXX..', '...XXXXX...', '....XXX....', '.....X.....']; rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') g.fillRect(x + 2, y + 3, 1, 1); })); g.fillStyle = '#ff8a9a'; g.fillRect(4, 4, 1, 1); });
  const fireTex = spriteTex((g) => { g.fillStyle = '#ff7a1a'; g.fillRect(4, 6, 8, 9); g.fillStyle = '#ffc23a'; g.fillRect(6, 8, 4, 6); g.fillStyle = '#fff2a0'; g.fillRect(7, 11, 2, 3); g.fillStyle = '#ff7a1a'; g.fillRect(6, 3, 3, 3); });
  const critTex = spriteTex((g) => { g.fillStyle = '#fff6c0'; g.fillRect(7, 2, 2, 12); g.fillRect(2, 7, 12, 2); g.fillStyle = '#ffffff'; g.fillRect(6, 6, 4, 4); });
  const puffTex = spriteTex((g) => { g.fillStyle = '#ddd'; g.fillRect(4, 4, 8, 8); g.fillStyle = '#bbb'; g.fillRect(6, 6, 4, 4); });

  class Mobs {
    constructor(scene, world, opts) {
      this.scene = scene; this.world = world;
      this.list = []; this.particles = [];
      this.max = opts.max || 16; this.maxWild = opts.maxWild || 6; this.maxHostile = opts.maxHostile || opts.maxZombies || 12; this.maxWildLions = opts.maxWildLions || 2;
      this.mobile = !!opts.mobile; this.maxFish = opts.maxFish || (this.mobile ? 6 : 16); this.fishTimer = 2; this.maxWildHorses = this.mobile ? 3 : 5;
      this.spawnTimer = 3; this.hostileTimer = 4; this.sound = true; this.hostile = true; this.burnDaylight = false;
      this.onBreed = null; // (baby, parent) => void
      this.daylight = 1; this.player = null;
      this.onPlayerDamage = null; // (amount, mob) => void
    }
    get maxZombies() { return this.maxHostile; }
    get count() { return this.list.length; }
    animals() { let n = 0; for (const m of this.list) if (!m.hostile && !m.fish) n++; return n; }
    fishes() { let n = 0; for (const m of this.list) if (m.fish) n++; return n; }
    hostiles() { let n = 0; for (const m of this.list) if (m.hostile) n++; return n; }
    zombies() { return this.hostiles(); }
    countType(t) { let n = 0; for (const m of this.list) if (m.type === t) n++; return n; }
    dispose() { for (const m of this.list) this.scene.remove(m.model.root); this.list = []; for (const p of this.particles) this.scene.remove(p.s); this.particles = []; }
    spawn(type, x, y, z, o = {}) {
      const T = TYPES[type]; if (!T) return null;
      if (T.fish ? this.fishes() >= this.maxFish : T.hostile ? this.hostiles() >= this.maxHostile : this.animals() >= this.max) return null;
      const coats = COATS[type];
      const coatIdx = o.coat != null ? o.coat % coats.length : (Math.random() * coats.length) | 0;
      const model = buildModel(type, coats[coatIdx]);
      const m = Object.assign({ type, coat: coatIdx, model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), yaw: o.yaw != null ? o.yaw : Math.random() * Math.PI * 2,
        tamed: !!o.tamed, sitting: !!o.sitting, wild: o.wild !== undefined ? o.wild : false, state: 'idle', timer: 1 + Math.random() * 3,
        dir: 0, phase: 0, onGround: false, lightT: 0, soundT: 4 + Math.random() * 20, hpMax: T.hp, cd: 0, attackAnim: 0, hurtT: 0, angry: 0, enemy: null, burnT: 0, dead: false,
        foe: null, foeT: 0, regenT: 0, lavaT: 0, climbing: false, leapT: 0, rider: null, airT: 0, pv: 0, puff: 0, graze: 0,
        love: 0, breedCD: 0, feeds: 0, baby: !!o.baby, age: o.age || 0, growT: 0, scale: 1, knock: 0 }, T);
      m.hp = o.hp != null ? Math.min(o.hp, T.hp) : T.hp;
      this.applyScale(m);
      model.parts.collar.visible = m.tamed && !(m.baby && m.rideable);
      model.root.position.copy(m.pos);
      this.scene.add(model.root);
      this.list.push(m);
      return m;
    }
    // babies are half size and grow to full size over GROW seconds
    applyScale(m) {
      const T = TYPES[m.type], s = m.baby ? 0.5 + 0.5 * Math.min(1, m.age / GROW) : 1;
      m.scale = s; m.hw = T.hw * s; m.h = T.h * s; m.model.root.scale.setScalar(s);
    }
    remove(m) { if (m.dead) return; m.dead = true; this.scene.remove(m.model.root); m.model.mat.dispose(); const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1); }
    setHostile(on) { this.hostile = on; if (!on) for (const m of [...this.list]) if (m.hostile) this.remove(m); if (!on) for (const m of this.list) m.angry = 0; }
    // ----- physics helpers -----
    solid(x, y, z) { const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id === -1 || SOLID[id] === 1; }
    collides(m, px, py, pz) { return VC.Blocks.aabbHit(this.world, px - m.hw, py, pz - m.hw, px + m.hw, py + m.h, pz + m.hw); }
    moveAxis(m, axis, d) {
      if (!d) return false;
      const p = m.pos, steps = Math.ceil(Math.abs(d) / 0.3), s = d / steps;
      for (let i = 0; i < steps; i++) {
        const before = p.getComponent(axis);
        p.setComponent(axis, before + s);
        const hit = this.collides(m, p.x, p.y, p.z);
        if (hit) {
          if (axis === 1 && s < 0) { p.y = hit.maxY + 1e-4; if (p.y - before > 0.6 || this.collides(m, p.x, p.y, p.z)) p.y = before; }
          else p.setComponent(axis, before);
          return true;
        }
      }
      return false;
    }
    loaded(x, z) { const c = this.world.getChunk(Math.floor(x / CS), Math.floor(z / CS)); return c && c.meshes; }
    fluidAt(x, y, z) { const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)); return id > 0 ? FLUID[id] : 0; }
    safeGround(x, y, z, aquatic) {
      for (let dy = 0; dy <= 3; dy++) {
        const id = this.world.getBlock(Math.floor(x), Math.floor(y) - 1 - dy, Math.floor(z));
        if (id === -1) return false;
        if (id > 0 && FLUID[id]) return aquatic && FLUID[id] === 1;
        if (SOLID[id]) return true;
      }
      return false;
    }
    surfaceY(x, z) {
      for (let y = 120; y > 1; y--) {
        const id = this.world.getBlock(x, y, z);
        if (id > 0 && FLUID[id]) return { y: y + 1, id };
        if (id > 0 && SOLID[id]) return { y: y + 1, id };
      }
      return null;
    }
    skyOpen(x, y, z) { for (let yy = y + 1; yy < Math.min(127, y + 48); yy++) { const id = this.world.getBlock(x, yy, z); if (id > 0 && VC.Blocks.OPAQUE[id]) return false; } return true; }
    clear2(x, y, z) { const a = this.world.getBlock(x, y, z), b = this.world.getBlock(x, y + 1, z); return a >= 0 && b >= 0 && !SOLID[a] && !SOLID[b] && !FLUID[a]; }
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
              const horses = this.list.filter(m => m.wild && m.type === 'horse').length;
              if (s.id === B.GRASS && horses < this.maxWildHorses && Math.random() < 0.35 && this.treesNear(x, s.y, z) === 0) {
                const coat = (Math.random() * COATS.horse.length) | 0, n = 1 + ((Math.random() * 3) | 0); // a small herd on open plains
                for (let i = 0; i < n; i++) { const ox = x + (i ? Math.round((Math.random() - 0.5) * 6) : 0), oz = z + (i ? Math.round((Math.random() - 0.5) * 6) : 0), ss = this.surfaceY(ox, oz);
                  if (ss && ss.id === B.GRASS && this.clear2(ox, ss.y, oz) && this.clear2(ox, ss.y + 1, oz)) this.spawn('horse', ox + 0.5, ss.y, oz + 0.5, { wild: true, coat: Math.random() < 0.6 ? coat : undefined }); }
              } else if (Math.random() < 0.22 && lions < this.maxWildLions) this.spawn('lion', x + 0.5, s.y, z + 0.5, { wild: true });
              else if (s.id === B.GRASS) {
                const type = Math.random() < 0.5 ? 'dog' : 'cat', n = Math.random() < 0.5 ? 2 : 1;
                for (let i = 0; i < n; i++) this.spawn(type, x + 0.5 + i * 0.6, s.y, z + 0.5, { wild: true });
              }
            }
          }
        }
      }
    }
    // fish in open water (oceans, lakes) near the player: small schools of one species
    spawnFish(player) {
      if (this.fishes() >= this.maxFish) return;
      const wildFish = this.list.filter(m => m.fish && m.wild).length; if (wildFish >= this.maxFish - 1) return;
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 22;
        const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
        if (!this.loaded(x, z)) continue;
        const s = this.surfaceY(x, z); if (!s || FLUID[s.id] !== 1) continue;
        const y = s.y - 1; // top water cell
        let depth = 0; while (depth < 6 && FLUID[Math.max(0, this.world.getBlock(x, y - depth, z))] === 1) depth++;
        if (depth < 2) continue;
        const roll = Math.random(), sand = this.world.getBlock(x, y - depth, z) === B.SAND;
        const type = roll < 0.35 ? 'cod' : roll < 0.6 ? 'salmon' : roll < (sand ? 0.9 : 0.85) ? 'tropical' : 'puffer';
        const n = type === 'puffer' ? 1 : 1 + ((Math.random() * 3) | 0), coat = (Math.random() * COATS[type].length) | 0;
        for (let i = 0; i < n; i++) {
          const fy = y - Math.min(depth - 1, 1 + ((Math.random() * (depth - 1)) | 0)) + 0.3;
          const fx = x + 0.5 + (Math.random() - 0.5) * 1.6, fz = z + 0.5 + (Math.random() - 0.5) * 1.6;
          if (this.fluidAt(fx, fy + 0.15, fz) !== 1) continue;
          this.spawn(type, fx, fy, fz, { wild: true, coat });
        }
        return;
      }
    }
    treesNear(x, y, z) { let n = 0; for (let dz = -5; dz <= 5; dz += 2) for (let dx = -5; dx <= 5; dx += 2) for (let dy = 2; dy <= 8; dy += 2) { const id = this.world.getBlock(x + dx, y + dy, z + dz); if (id === B.LEAVES || id === B.BIRCH_LEAVES) { n++; break; } } return n; }
    waterNear(x, y, z) { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 0; dy++) { const id = this.world.getBlock(x + dx, y + dy, z + dz); if (id > 0 && FLUID[id] === 1) return true; } return false; }
    groupSpawn(type, n, x, y, z) {
      let made = 0;
      for (let i = 0; i < n; i++) {
        const ox = x + (i ? Math.round((Math.random() - 0.5) * 4) : 0), oz = z + (i ? Math.round((Math.random() - 0.5) * 4) : 0);
        let yy = y; for (let k = 0; k < 4 && !(SOLID[this.world.getBlock(ox, yy - 1, oz)] && this.clear2(ox, yy, oz)); k++) yy = k % 2 ? y - (k + 1) / 2 : y + (k + 1) / 2;
        if (!SOLID[this.world.getBlock(ox, yy - 1, oz)] || !this.clear2(ox, yy, oz)) continue;
        if (this.spawn(type, ox + 0.5, yy, oz + 0.5, { wild: true })) made++;
      }
      return made;
    }
    // Hostile spawning: zombies (night surface + caves, sometimes in small hordes), spiders (night + caves),
    // wolf packs (night, near trees), bears (forests / snow, any time, rare), crocodiles (by water, any time, rare).
    spawnHostile(player) {
      const night = this.daylight < 0.4, cap = night ? this.maxHostile : Math.max(2, Math.ceil(this.maxHostile * 0.6)); // fewer by day
      if (!this.hostile || player.dead || this.hostiles() >= cap) return;
      for (let attempt = 0; attempt < 5; attempt++) {
        const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 20;
        const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
        if (!this.loaded(x, z)) continue;
        if (Math.hypot(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z) < 12) continue;
        const surf = this.surfaceY(x, z);
        const roll = Math.random();
        // --- surface
        if (surf && Math.random() < 0.7) {
          const y = surf.y, gid = surf.id;
          if (FLUID[gid] || !SOLID[gid] || !this.clear2(x, y, z)) continue;
          if (this.world.getBlockLight(x, y, z) >= 7 || this.world.getBlockLight(x, y + 1, z) >= 7) continue; // torches keep monsters away
          const forest = this.treesNear(x, y, z) >= 2, snowy = gid === B.SNOW;
          // zombies and predators come out by day too (spawn timer is slower by day and the cap is lower)
          if (forest && roll < 0.22 && this.countType('wolf') < (this.mobile ? 3 : 6)) { this.groupSpawn('wolf', (night ? 2 : 1) + ((Math.random() * 2) | 0), x, y, z); return; }
          if ((forest || snowy) && roll < 0.3 && this.countType('bear') < (this.mobile ? 1 : 2)) { this.spawn('bear', x + 0.5, y, z + 0.5, { wild: true, coat: snowy ? 2 : (night || Math.random() < 0.6 ? 0 : 1) }); return; }
          if (roll < (night ? 0.5 : 0.42)) { this.spawn('spider', x + 0.5, y, z + 0.5, { wild: true }); return; }
          if (this.waterNear(x, y, z) && roll < 0.6 && this.countType('croc') < (this.mobile ? 1 : 2)) { this.spawn('croc', x + 0.5, y, z + 0.5, { wild: true }); return; }
          // zombies, sometimes a small horde (smaller by day)
          const horde = Math.random() < (night ? 0.3 : 0.12) ? 2 + ((Math.random() * (this.mobile ? 2 : 3)) | 0) : 1;
          this.groupSpawn('zombie', horde, x, y, z); return;
        }
        // --- caves: a dark air pocket around the player's height (any time of day)
        const y0 = Math.floor(player.pos.y) + 6;
        for (let y = y0; y > Math.max(2, y0 - 24); y--) {
          if (SOLID[this.world.getBlock(x, y - 1, z)] && this.clear2(x, y, z) && !this.skyOpen(x, y, z)) {
            if (this.world.getBlockLight(x, y, z) >= 7 || this.world.getBlockLight(x, y + 1, z) >= 7) break;
            if (roll < 0.35) this.spawn('spider', x + 0.5, y, z + 0.5, { wild: true, coat: Math.random() < 0.5 ? 1 : 0 });
            else this.groupSpawn('zombie', Math.random() < 0.25 ? 2 : 1, x, y, z);
            return;
          }
        }
      }
    }
    update(dt, player, daylight) {
      this.daylight = daylight; this.player = player;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 4 + Math.random() * 4; this.spawnNatural(player); }
      this.hostileTimer -= dt;
      if (this.hostileTimer <= 0) { this.hostileTimer = daylight < 0.4 ? 1.5 + Math.random() * 2 : 3.5 + Math.random() * 4.5; this.spawnHostile(player); }
      this.fishTimer -= dt;
      if (this.fishTimer <= 0) { this.fishTimer = 2.5 + Math.random() * 3; this.spawnFish(player); }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const m = this.list[i]; if (!m) continue;
        const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, dist = Math.hypot(dx, dz);
        if (m.rider) { // ridden horse: carried by the player's physics
          if (m.rider.mount !== m || m.rider.dead) { m.rider = null; m.model.parts.rider.visible = false; }
          else { this.ridden(m, dt, m.rider); continue; }
        }
        if (m.wild && !m.tamed && dist > (m.hostile ? 64 : m.fish ? 48 : 96)) { this.remove(m); continue; }
        if (!this.loaded(m.pos.x, m.pos.z)) {
          if (m.tamed && !m.sitting && !m.stays && this.loaded(player.pos.x, player.pos.z)) this.teleportNear(m, player);
          m.model.root.visible = false; continue;
        }
        m.model.root.visible = true;
        if (m.fish) { this.fishUpdate(m, dt, player); continue; }
        m.cd -= dt; m.attackAnim = Math.max(0, m.attackAnim - dt); m.hurtT = Math.max(0, m.hurtT - dt); if (m.angry > 0) m.angry -= dt;
        if (m.breedCD > 0) m.breedCD -= dt;
        if (m.baby) { m.age += dt; m.growT -= dt; if (m.growT <= 0) { m.growT = 1; if (m.age >= GROW) this.growUp(m); else this.applyScale(m); } }
        if (m.foeT > 0) { m.foeT -= dt; if (m.foeT <= 0 || (m.foe && m.foe.dead)) m.foe = null; }
        this.think(m, dt, player, dx, dz, dist);
        if (m.dead) continue;
        this.physics(m, dt);
        if (m.dead) continue;
        this.animate(m, dt);
        // zombies burn in daylight only when 'Daylight burning' is on (pause menu; off by default)
        if (m.burns && this.burnDaylight && this.daylight > 0.55 && m.skyB === 1) {
          m.burnT -= dt;
          if (m.burnT <= 0) { m.burnT = 0.8; this.particle(fireTex, new THREE.Vector3(m.pos.x, m.pos.y + 0.6, m.pos.z), 3, 0.5, 1.4, 0.6); this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + 1.8, m.pos.z), 1, 0.3, 0.9, 0.8); this.damage(m, 3, null, null); if (m.dead) continue; }
        }
        // tamed animals slowly heal
        if (m.tamed && m.hp < m.hpMax) { m.regenT += dt; if (m.regenT > 4) { m.regenT = 0; m.hp++; } }
        m.soundT -= dt;
        if (m.soundT <= 0) { m.soundT = (m.hostile ? 6 : 15) + Math.random() * 30; if (this.sound && dist < 16 && m.type !== 'lion') playSound(m.type, (1 - dist / 16) * 0.6, m.pos); }
      }
      this.updateParticles(dt);
    }
    // ---- horses ----
    mount(m, player) {
      if (!m.rideable || m.dead || m.baby) return false;
      for (const o of this.list) if (o.rider === player) o.rider = null;
      m.rider = player; m.tamed = true; m.wild = false; m.sitting = false; m.state = 'idle'; m.vel.set(0, 0, 0);
      m.model.parts.collar.visible = true; m.model.parts.rider.visible = true;
      if (this.sound) playSound('horse', 0.6);
      return true;
    }
    ridden(m, dt, player) {
      m.model.root.visible = true;
      m.pos.copy(player.pos); m.vel.copy(player.vel); m.onGround = player.onGround; m.inWater = player.inWater;
      // the horse turns its body toward where the rider looks (smoothly)
      let dy = player.yaw + Math.PI - m.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      m.yaw += dy * Math.min(1, dt * 7); m.lookYaw = 0; m.state = 'ridden';
      if (m.hurtT > 0) m.hurtT = Math.max(0, m.hurtT - dt);
      this.animate(m, dt);
      if (m.inWater) m.model.root.position.y -= 0.35; // swims low in the water
    }
    // ---- fish ----
    fishUpdate(m, dt, player) {
      const W = this.world, cy = m.pos.y + m.h * 0.5;
      const wet = (x, y, z) => this.fluidAt(x, y, z) === 1;
      m.inWater = wet(m.pos.x, cy, m.pos.z);
      m.hurtT = Math.max(0, m.hurtT - dt);
      const pd = Math.hypot(player.pos.x - m.pos.x, player.pos.y + 0.9 - cy, player.pos.z - m.pos.z);
      if (m.inWater) {
        m.airT = 0; m.timer -= dt;
        let speed = m.cruise != null ? m.cruise : m.speed;
        if (m.timer <= 0) { m.timer = 1.5 + Math.random() * 3.5; m.dir = Math.random() * Math.PI * 2; m.pv = (Math.random() - 0.5) * 0.7; m.cruise = m.swim * (0.25 + Math.random() * 0.55); if (Math.random() < 0.25) m.cruise = 0.15; speed = m.cruise; }
        if (pd < 3.2 && !player.dead) {
          if (m.type === 'puffer') m.puff = Math.min(1, m.puff + dt * 3);
          else { m.dir = Math.atan2(m.pos.x - player.pos.x, m.pos.z - player.pos.z) + (Math.random() - 0.5) * 0.6; speed = m.swim * 1.6; m.timer = 0.6; }
        } else if (m.puff > 0) m.puff = Math.max(0, m.puff - dt * 0.5);
        // stay inside the water: look ahead, turn back at walls / the surface / the floor
        const ax = m.pos.x + Math.sin(m.dir) * (m.hw + 0.35), az = m.pos.z + Math.cos(m.dir) * (m.hw + 0.35);
        if (!wet(ax, cy, az) || this.solid(ax, cy, az)) { m.dir += Math.PI * (0.6 + Math.random() * 0.8); speed *= 0.3; }
        if (m.pv > 0 && !wet(m.pos.x, cy + 0.45, m.pos.z)) m.pv = -Math.abs(m.pv) * 0.5;
        if (m.pv < 0 && !wet(m.pos.x, cy - 0.45, m.pos.z)) m.pv = Math.abs(m.pv) * 0.5;
        let d = m.dir - m.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        m.yaw += d * Math.min(1, dt * 4);
        const k = Math.min(1, dt * 3);
        m.vel.x += (Math.sin(m.yaw) * speed - m.vel.x) * k; m.vel.z += (Math.cos(m.yaw) * speed - m.vel.z) * k; m.vel.y += (m.pv * speed - m.vel.y) * k;
        // move axis by axis, refusing any step that would leave the water
        for (const ax3 of [0, 2, 1]) {
          const v = m.vel.getComponent(ax3) * dt; if (!v) continue;
          const before = m.pos.getComponent(ax3); m.pos.setComponent(ax3, before + v);
          if (!wet(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z) || this.collides(m, m.pos.x, m.pos.y, m.pos.z)) { m.pos.setComponent(ax3, before); m.vel.setComponent(ax3, 0); if (ax3 === 1) m.pv = -m.pv; }
        }
        m.onGround = false;
      } else {
        // out of water: flop around and slowly suffocate
        m.airT += dt; m.puff = Math.max(0, m.puff - dt);
        m.vel.y = Math.max(m.vel.y - 28 * dt, -30);
        if (m.onGround) { m.vel.x *= Math.pow(0.02, dt); m.vel.z *= Math.pow(0.02, dt); m.timer -= dt; if (m.timer <= 0) { m.timer = 0.5 + Math.random() * 0.9; m.vel.y = 3 + Math.random() * 1.5; const a = Math.random() * Math.PI * 2; m.vel.x = Math.sin(a) * 1.3; m.vel.z = Math.cos(a) * 1.3; m.yaw += (Math.random() - 0.5) * 2; } }
        if (this.moveAxis(m, 0, m.vel.x * dt)) m.vel.x = 0;
        if (this.moveAxis(m, 2, m.vel.z * dt)) m.vel.z = 0;
        const vy = m.vel.y * dt, hit = this.moveAxis(m, 1, vy); m.onGround = hit && vy < 0; if (hit) m.vel.y = 0;
        if (m.airT > 5) { m.lavaT -= dt; if (m.lavaT <= 0) { m.lavaT = 5; this.damage(m, 1, null, 'air'); if (m.dead) return; } }
        if (this.fluidAt(m.pos.x, m.pos.y + 0.1, m.pos.z) === 2) { this.damage(m, 10, null, 'lava'); return; }
        if (m.pos.y < -10) { this.remove(m); return; }
      }
      this.fishAnimate(m, dt);
    }
    fishAnimate(m, dt) {
      const P = m.model.parts, root = m.model.root, t = performance.now() / 1000;
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.phase += dt * (m.inWater ? 6 + hs * 9 : 22);
      if (P.tail) P.tail.rotation.y = Math.sin(m.phase) * (m.inWater ? 0.35 + Math.min(0.4, hs * 0.2) : 0.7);
      P.torso.rotation.y = Math.sin(m.phase + 1) * (m.inWater ? 0.06 : 0.15);
      const s = 1 + m.puff * 0.9; P.torso.scale.setScalar(s);
      root.position.copy(m.pos);
      const pitch = m.inWater ? -Math.atan2(m.vel.y, Math.max(0.2, hs)) * 0.7 : 0;
      root.rotation.set(pitch, m.yaw, m.inWater ? 0 : Math.PI / 2 * 0.95, 'YXZ');
      if (!m.inWater) root.position.y += 0.08;
      else root.position.y += Math.sin(t * 1.7 + m.coat * 2) * 0.02;
      this.shade(m, dt);
    }
    updateParticles(dt) {
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
    // nearest threat to the player for protectors: whoever hurt the player, else hostiles near the player/protector
    findEnemy(m, player) {
      const la = player.lastAttacker;
      if (la && !la.dead && !la.tamed && player.lastAttackT > 0 && la !== m) return la;
      if (m.foe && !m.foe.dead && m.foeT > 0) return m.foe; // fight back
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
      let speed = 0, chase = null, stalking = false;
      if (m.hostile || (m.angry > 0 && !m.tamed)) {
        // a predator bitten by a pet fights that pet; otherwise it hunts the player
        if (m.foe && !m.foe.dead && m.foeT > 0 && m.foe.pos.distanceTo(m.pos) < 16) chase = m.foe;
        else if (this.hostile && !player.dead && dist < (m.sight || 24) && Math.abs(player.pos.y - m.pos.y) < 10) chase = player;
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
        // stalkers creep up, then rush
        if (m.stalk && chase === player && td > 9) { speed = m.speed * 1.2; stalking = true; }
        if (m.aquatic && m.inWater) speed = m.swim || m.run;
        const reach = (m.hw + (chase.hw || 0.3)) + (m.reach != null ? m.reach : m.type === 'lion' ? 0.9 : 0.6);
        // spiders leap at their target
        if (m.leaps && m.onGround && td < 4 && td > 1.6 && m.leapT <= 0) { m.vel.y = 6; m.vel.x = Math.sin(m.dir) * 7; m.vel.z = Math.cos(m.dir) * 7; m.knock = 0.3; m.leapT = 2.5; }
        if (m.leapT > 0) m.leapT -= dt;
        if (td < reach && Math.abs(chase.pos.y - m.pos.y) < 1.8) {
          speed = 0.5;
          if (m.cd <= 0) {
            m.attackAnim = 0.35;
            if (chase === player) { m.cd = m.cooldown || 1.0; if (this.onPlayerDamage) this.onPlayerDamage(m.attack || 3, m); }
            else {
              m.cd = m.cooldown || (m.type === 'lion' ? 1.1 : 0.9);
              if (m.type === 'lion' && m.onGround) { m.vel.y = 5.5; m.vel.x += Math.sin(m.yaw) * 3; m.vel.z += Math.cos(m.yaw) * 3; } // pounce
              this.damage(chase, m.protect || m.attack || 2, m.pos, m);
            }
            if (this.sound && m.hostile && Math.random() < 0.35) playSound(m.type, 0.5);
          }
        }
        if (!m.engaged && m.type === 'lion' && chase !== player) { m.engaged = true; if (this.sound) playSound('lion', 0.8); }
        if (!m.engaged && (m.type === 'bear' || m.type === 'wolf') && chase === player && !stalking) { m.engaged = true; if (this.sound) playSound(m.type, 0.7); }
      } else {
        m.engaged = false;
        let mate = null;
        if (m.love > 0) { m.love -= dt; m.loveP = (m.loveP || 0) - dt; if (m.loveP <= 0) { m.loveP = 0.9; this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h + 0.1, m.pos.z), 1, 0.4, 0.7, 1); } mate = this.findMate(m); }
        if (mate) { // walk to the partner; breed when they meet
          const tx = mate.pos.x - m.pos.x, tz = mate.pos.z - m.pos.z, td = Math.hypot(tx, tz);
          m.state = 'walk'; m.timer = 1; m.dir = Math.atan2(tx, tz); speed = td > 1.2 ? m.speed * 1.8 : 0;
          if (td < m.hw + mate.hw + 0.7 && Math.abs(mate.pos.y - m.pos.y) < 1.2) this.breed(m, mate);
        }
        else if (m.sitting) { m.state = 'sit'; }
        else if (m.tamed && m.stays) { // tamed horses wait where you left them, grazing now and then
          m.state = 'idle';
          if (m.timer <= 0) { m.timer = 2 + Math.random() * 5; m.graze = Math.random() < 0.5 ? 2 + Math.random() * 3 : 0; }
        }
        else if (m.tamed && dist > 3) {
          m.state = 'follow';
          if (dist > 24 && player.onGround) { this.teleportNear(m, player); return; }
          m.dir = Math.atan2(dx, dz);
          speed = dist > 7 ? m.run : m.speed * 1.6;
        } else if (m.state === 'walk') {
          speed = m.speed;
          if (m.timer <= 0) { m.state = 'idle'; m.timer = 1.5 + Math.random() * 4; }
        } else {
          if (m.state !== 'idle') { m.state = 'idle'; m.timer = 1 + Math.random() * 3; if (m.rideable) m.graze = Math.random() < 0.6 ? 1.5 + Math.random() * 3 : 0; }
          if (m.timer <= 0) {
            m.state = 'walk'; m.timer = 1.5 + Math.random() * 3.5;
            m.dir = m.tamed ? Math.atan2(dx, dz) + (Math.random() - 0.5) * 2 : Math.random() * Math.PI * 2;
          }
        }
      }
      let dy = m.dir - m.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      if (speed > 0) m.yaw += dy * Math.min(1, dt * 8);
      const sx = Math.sin(m.yaw), sz = Math.cos(m.yaw);
      m.climbing = false;
      if (speed > 0) {
        const ax = m.pos.x + sx * (m.hw + 0.35), az = m.pos.z + sz * (m.hw + 0.35), fy = m.pos.y;
        if (this.solid(ax, fy + 0.1, az)) {
          if (m.climbs && (m.state === 'chase' || m.state === 'walk')) { m.climbing = true; }        // spiders walk up walls
          else if (!this.solid(ax, fy + 1.1, az) && !this.solid(m.pos.x, fy + m.h + 0.6, m.pos.z) && m.onGround) m.vel.y = 7.2; // hop up one block
          else if (m.state !== 'follow' && m.state !== 'chase') { m.dir += Math.PI * (0.5 + Math.random()); speed = 0; }
        } else if (!m.inWater && !this.safeGround(ax, fy, az, m.aquatic)) {
          const target = chase || (m.state === 'follow' ? player : null);
          if (this.fluidAt(ax, fy - 0.5, az) === 2 || this.fluidAt(ax, fy + 0.2, az) === 2) { speed = 0; m.dir += Math.PI * 0.7; }    // never walk into lava
          else if (target && target.pos.y < m.pos.y - 0.5 && target.pos.y > m.pos.y - 4.5 && !this.waterAhead(ax, fy, az)) { /* follow down small drops */ }
          else if (m.climbs && target) { /* spiders drop down */ }
          else { speed = 0; if (m.state !== 'follow' && m.state !== 'chase') { m.dir += Math.PI * (0.6 + Math.random() * 0.8); m.state = 'idle'; m.timer = 0.5; } }
        }
      }
      if ((m.state === 'idle' || m.state === 'sit') && dist < 6) { let d2 = Math.atan2(dx, dz) - m.yaw; while (d2 > Math.PI) d2 -= 2 * Math.PI; while (d2 < -Math.PI) d2 += 2 * Math.PI; m.lookYaw = Math.max(-0.8, Math.min(0.8, d2)); }
      else m.lookYaw = 0;
      if (m.knock > 0) { m.knock -= dt; return; } // being knocked back / leaping: no steering
      const k = Math.min(1, dt * (m.onGround || m.inWater ? 10 : 2));
      m.vel.x += (sx * speed - m.vel.x) * k;
      m.vel.z += (sz * speed - m.vel.z) * k;
    }
    waterAhead(x, y, z) { for (let dy = 1; dy <= 4; dy++) { const id = this.world.getBlock(Math.floor(x), Math.floor(y) - dy, Math.floor(z)); if (id > 0 && FLUID[id]) return true; if (id > 0 && SOLID[id]) return false; } return false; }
    physics(m, dt) {
      const fl = this.fluidAt(m.pos.x, m.pos.y + 0.3, m.pos.z);
      m.inWater = fl === 1; m.inLava = fl === 2;
      if (m.inWater) { m.vel.y = Math.min(m.vel.y + (m.aquatic ? 12 : 18) * dt, m.aquatic ? 1.2 : 2.5); if (!m.aquatic) { m.vel.x *= 0.95; m.vel.z *= 0.95; } }
      else if (m.inLava) { m.vel.y = Math.min(m.vel.y + 8 * dt, 1.5); m.vel.x *= 0.85; m.vel.z *= 0.85; }
      else if (m.climbing) m.vel.y = 2.6;
      else m.vel.y = Math.max(m.vel.y - 28 * dt, -40);
      if (this.moveAxis(m, 0, m.vel.x * dt)) m.vel.x = 0;
      if (this.moveAxis(m, 2, m.vel.z * dt)) m.vel.z = 0;
      const vy = m.vel.y * dt, hit = this.moveAxis(m, 1, vy);
      m.onGround = hit && vy < 0;
      if (hit) m.vel.y = 0;
      if (m.inLava) { m.lavaT -= dt; if (m.lavaT <= 0) { m.lavaT = 0.5; this.particle(fireTex, new THREE.Vector3(m.pos.x, m.pos.y + 0.5, m.pos.z), 2, 0.5, 1.4, 0.5); this.damage(m, 4, null, 'lava'); if (m.dead) return; } }
      if (m.pos.y < -10) { if (m.hostile || m.wild) { this.remove(m); return; } m.pos.y = 100; }
    }
    animate(m, dt) {
      const P = m.model.parts, root = m.model.root;
      const hs = Math.hypot(m.vel.x, m.vel.z);
      m.phase += dt * hs * ({ cat: 9, lion: 5.5, zombie: 4, bear: 4, croc: 5, spider: 9, wolf: 7, horse: 1.9 }[m.type] || 7.5);
      const sw = Math.min(1, hs / 1.5) * 0.7;
      const sit = m.sitting, atk = m.attackAnim > 0 ? Math.sin((1 - m.attackAnim / 0.35) * Math.PI) : 0;
      const t = performance.now() / 1000;
      if (m.type === 'zombie') {
        P.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.phase + i * Math.PI) * sw; });
        P.arms.forEach((a, i) => { a.rotation.x = -Math.PI / 2 + 0.1 + Math.sin(t * 2 + i) * 0.05 + atk * 0.9; });
        P.torso.rotation.x = atk * 0.15;
      } else if (P.horse) {
        // walk: diagonal pairs; gallop (fast): front pair then back pair
        const gallop = hs > 6.5, amp = Math.min(1, hs / 2) * (gallop ? 0.95 : 0.55);
        const off = gallop ? [0, 0.6, Math.PI, Math.PI + 0.6] : [0, Math.PI, Math.PI, 0];
        P.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.phase + off[i]) * amp; });
        P.torso.rotation.x = gallop ? Math.sin(m.phase) * 0.07 : 0;
        P.torso.position.y = gallop ? Math.abs(Math.sin(m.phase)) * 0.06 : 0;
        P.tail.rotation.x = 0.3 + Math.min(0.9, hs * 0.1) + Math.sin(t * 2.1 + m.coat) * 0.05; P.tail.rotation.z = Math.sin(t * 1.4 + m.coat) * 0.18;
        if (m.graze > 0) m.graze -= dt;
        if (P.rider) P.rider.visible = !!m.rider;
      } else if (P.spider) {
        P.legs.forEach((g, i) => { const u = g.userData, ph = m.phase + (u.k % 2 ? Math.PI : 0) + (u.side > 0 ? 0 : Math.PI);
          g.rotation.y = u.baseY + Math.sin(ph) * 0.35 * Math.min(1, hs);
          g.rotation.z = u.side * (-0.55 + Math.max(0, Math.cos(ph)) * 0.25 * Math.min(1, hs) - (m.climbing ? 0.4 : 0)); });
        P.torso.rotation.x = m.climbing ? -0.9 : -atk * 0.2;
        root.rotation.x = 0;
      } else {
        P.legs.forEach((l, i) => {
          if (sit && i >= 2) { l.rotation.x = -1.35; l.position.y = P.legY * 0.55; }
          else { l.rotation.x = (i < 2 ? -atk * 1.1 : 0) + Math.sin(m.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * sw; l.position.y = P.legY; }
        });
        P.torso.rotation.x = sit ? -0.38 : -atk * (m.type === 'croc' ? 0 : 0.3); P.torso.position.y = sit ? -0.1 * (P.legY / 0.4) : 0; P.torso.position.z = sit ? -0.08 : 0;
        if (m.type === 'dog') { P.tail.rotation.y = Math.sin(t * (m.tamed ? 14 : 6)) * (m.tamed ? 0.6 : 0.25); P.tail.rotation.x = sit ? 0.1 : 0.7; }
        else if (m.type === 'cat') { P.tail.rotation.y = Math.sin(t * 2.2 + m.coat) * 0.35; P.tail.rotation.x = sit ? 0.05 : 0.9 + Math.sin(t * 1.3) * 0.1; }
        else if (m.type === 'lion') { P.tail.rotation.y = Math.sin(t * 1.6 + m.coat) * 0.4; P.tail.rotation.x = sit ? 0.3 : -0.45 + Math.sin(t * 1.1) * 0.12; }
        else if (m.type === 'wolf') { P.tail.rotation.y = Math.sin(t * 3) * 0.15; P.tail.rotation.x = m.state === 'chase' ? 0.1 : 0.6; P.torso.rotation.x = m.state === 'chase' && hs < 2.5 ? 0.12 : P.torso.rotation.x; }
        else if (m.type === 'croc') { P.tail.rotation.y = Math.sin(m.phase * 0.6 + t) * 0.35; if (P.jaw) P.jaw.rotation.x = 0.1 + atk * 0.6 + (m.state === 'chase' ? 0.15 : 0); }
        if (m.type !== 'croc' && m.type !== 'bear') P.tail.position.y = P.tailY - (sit ? P.legY * 0.5 : 0);
      }
      P.head.rotation.y += ((m.lookYaw || 0) - P.head.rotation.y) * Math.min(1, dt * 6);
      P.head.rotation.x = m.type === 'zombie' || m.type === 'croc' ? 0 : -atk * 0.4;
      if (P.horse) { const gz = m.rider ? 0.35 : m.graze > 0 && hs < 0.3 ? 1.25 : 0, hs2 = Math.min(1, hs / 8); m.headX = (m.headX || 0) + (gz - hs2 * 0.25 + Math.sin(m.phase * 2) * 0.05 * hs2 - (m.headX || 0)) * Math.min(1, dt * 4); P.head.rotation.x = m.headX; }
      P.head.position.y = P.headY + (sit ? 0.04 : 0) + (m.state === 'idle' ? Math.sin(t * 2 + m.coat) * 0.01 : 0) - (m.type === 'wolf' && m.state === 'chase' ? 0.08 : 0);
      P.head.position.z = (P.headZ || 0) + atk * 0.15;
      root.position.copy(m.pos); root.rotation.y = m.yaw;
      if (m.inWater && m.aquatic) root.position.y -= 0.3; // crocodiles float low in the water
      this.shade(m, dt);
    }
    shade(m, dt) {
      m.lightT -= dt;
      if (m.lightT <= 0) {
        m.lightT = 0.25;
        const x = Math.floor(m.pos.x), y = Math.floor(m.pos.y + 0.5), z = Math.floor(m.pos.z);
        const L = this.world.getBlockLight(x, y, z);
        m.skyB = this.skyOpen(x, y, z) ? 1 : 0.35; m.blockB = L ? Math.pow(L / 15, 1.4) : 0;
      }
      const b = Math.max(0.12, Math.max((m.skyB || 1) * this.daylight, m.blockB || 0));
      if (m.hurtT > 0.22) m.model.mat.color.setRGB(Math.max(1.6, b * 2.6), Math.max(1.6, b * 2.6), Math.max(1.6, b * 2.6)); // white hit flash
      else if (m.hurtT > 0) m.model.mat.color.setRGB(b * 1.4, b * 0.4, b * 0.4);                                        // then red
      else m.model.mat.color.setScalar(b);
    }
    damage(m, amount, fromPos, attacker, knockMul) {
      if (m.dead) return;
      m.hp -= amount; m.hurtT = 0.3;
      if (fromPos) {
        const dx = m.pos.x - fromPos.x, dz = m.pos.z - fromPos.z, d = Math.hypot(dx, dz) || 1;
        const k = Math.min(10, 4 + amount * 0.4) * (m.type === 'bear' ? 0.5 : 1) * (knockMul != null ? knockMul : 1);
        m.vel.x = dx / d * k; m.vel.z = dz / d * k; m.vel.y = Math.max(m.vel.y, 3 + 1.5 * Math.min(1.5, knockMul != null ? knockMul : 1)); m.knock = 0.25;
      }
      if (attacker === 'player') this.particle(critTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h * 0.6, m.pos.z), 4, Math.max(0.4, m.hw * 1.6), 1.6, 0.35);
      if (attacker === 'player' && m.neutral && !m.tamed) m.angry = 20; // provoked lions fight back
      if (attacker && typeof attacker === 'object' && attacker !== m && (m.hostile || m.tamed)) { m.foe = attacker; m.foeT = 6; } // fight back against pets / predators
      if (this.sound) {
        const v = this.player ? Math.max(0, 1 - m.pos.distanceTo(this.player.pos) / 28) : 1;
        VC.Audio.play(m.hp <= 0 ? 'mob_death' : 'mob_hurt', 0.6 * v, { pitch: (VOICE[m.type] || 1) * (m.baby ? 1.5 : 1) * (0.94 + Math.random() * 0.12), pos: m.pos, bus: 'mobs' });
        if (m.hostile && m.hp > 0 && Math.random() < 0.3) playSound(m.type, 0.35 * v, m.pos);
      }
      if (m.hp <= 0) {
        this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h * 0.5, m.pos.z), 8, 0.8, 0.7, 0.8);
        this.remove(m);
      }
    }
    raycast(origin, dir, maxDist) {
      let best = null;
      for (const m of this.list) {
        if (!m.model.root.visible || m.rider) continue;
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
    name(m) { if (m.fish && m.type === 'tropical') return COATS.tropical[m.coat].name; return { dog: 'Dog', cat: 'Cat', lion: 'Lion', zombie: 'Zombie', wolf: 'Wolf', bear: 'Bear', spider: 'Spider', croc: 'Crocodile', horse: 'Horse', cod: 'Cod', salmon: 'Salmon', tropical: 'Tropical fish', puffer: 'Pufferfish' }[m.type]; }
    // right-click / tap: tame, then toggle sit <-> follow
    interact(m) {
      if (m.hostile) return null;
      if (m.fish) { if (this.sound) playSound('splash', 0.4); return (m.type === 'puffer' ? 'A pufferfish — careful, it puffs up!' : 'A ' + this.name(m).toLowerCase() + '.') + (m.inWater ? '' : ' It needs water!'); }
      if (m.rideable) { if (!m.tamed) { m.tamed = true; m.wild = false; m.model.parts.collar.visible = true; if (this.sound) playSound('horse', 0.6); this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z), 3, 0.5, 0.8, 1.2); return 'Horse tamed! It will wait where you leave it.'; } return 'Your horse — right-click / tap (without Shift) to ride.'; }
      if (m.angry > 0 && !m.tamed) return 'The lion is angry — let it calm down first!';
      let msg;
      if (!m.tamed) { m.tamed = true; m.wild = false; m.sitting = false; m.model.parts.collar.visible = true; msg = this.name(m) + ' tamed! It will follow you' + (m.protect ? ' and protect you.' : '.'); }
      else { m.sitting = !m.sitting; msg = this.name(m) + (m.sitting ? ' is sitting.' : ' is following you.'); }
      m.state = m.sitting ? 'sit' : 'follow'; m.vel.x = m.vel.z = 0;
      this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z), 3, 0.5, 0.8, 1.2);
      if (this.sound) playSound(m.type, 0.7);
      return msg;
    }
    // left-click / long-press: hit hostiles & wild lions, pet tamed animals, shoo wild dogs/cats
    hit(m, fromPos, w) {
      w = w || {};
      if (m.hostile || m.fish || (m.type === 'lion' && !m.tamed)) { this.damage(m, w.dmg != null ? w.dmg : 3, fromPos, 'player', w.knock); return null; }
      if (m.rideable && !m.tamed) { this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + 1.2, m.pos.z), 3, 0.5, 0.6, 0.6); m.dir = Math.atan2(m.pos.x - fromPos.x, m.pos.z - fromPos.z); m.state = 'walk'; m.timer = 2.5; m.speed = TYPES.horse.run; setTimeout(() => { m.speed = TYPES.horse.speed; }, 2500); if (this.sound) playSound('horse', 0.5); return null; } // wild horses bolt
      if (m.tamed) { this.particle(heartTex, new THREE.Vector3(m.pos.x, m.pos.y + m.h, m.pos.z), 2, 0.4, 0.8, 1); if (this.sound) playSound(m.type, 0.5); return null; }
      this.particle(puffTex, new THREE.Vector3(m.pos.x, m.pos.y + 0.3, m.pos.z), 6, 0.6, 0.6, 0.7);
      this.remove(m);
      return 'Shooed away';
    }
    // ---- feeding, taming with food, love mode & babies ----
    tameIt(m) {
      m.tamed = true; m.wild = false; m.angry = 0;
      if (!m.rideable) { m.sitting = false; m.state = 'follow'; }
      m.model.parts.collar.visible = !(m.baby && m.rideable);
    }
    // returns a message for the player, or null when this animal doesn't eat that food
    feed(m, d) {
      const f = d && d.food;
      if (!f || m.dead || m.hostile || m.fish || !f.feeds || !f.feeds.includes(m.type)) return null;
      const nm = this.name(m), top = new THREE.Vector3(m.pos.x, m.pos.y + m.h + 0.1, m.pos.z);
      if (m.angry > 0 && !m.tamed) return 'The ' + nm.toLowerCase() + ' is too angry to eat!';
      if (this.sound) { VC.Audio.play('eat', 0.6, { pos: m.pos, pitch: m.baby ? 1.3 : 1 }); if (m.type !== 'lion') playSound(m.type, 0.45, m.pos); }
      const hurt = m.hp < m.hpMax; m.hp = Math.min(m.hpMax, m.hp + (f.heal || 2));
      m.vel.x = m.vel.z = 0; m.graze = m.rideable ? 1.2 : 0;
      if (!m.tamed) {
        m.feeds++;
        if (m.feeds >= 3 || Math.random() < 0.4) {
          this.tameIt(m); this.particle(heartTex, top, 5, 0.6, 0.8, 1.3); if (this.sound) VC.Audio.play('love', 0.5);
          return nm + ' tamed with ' + d.name.toLowerCase() + '!' + (m.rideable ? ' Right-click / tap it to ride.' : m.protect ? ' It will follow and protect you.' : ' It will follow you.');
        }
        this.particle(puffTex, top, 3, 0.4, 0.6, 0.6); this.particle(heartTex, top, 1, 0.3, 0.8, 1);
        return 'The ' + nm.toLowerCase() + ' liked that. Keep feeding it to tame it.';
      }
      this.particle(heartTex, top, 3, 0.5, 0.8, 1.2);
      if (m.baby) { m.age = Math.min(GROW, m.age + GROW * 0.1); this.applyScale(m); return 'The baby ' + nm.toLowerCase() + ' ate it and grew a little.'; }
      if (hurt) { if (this.sound) VC.Audio.play('heal', 0.4); return nm + ' healed (' + Math.ceil(m.hp / 2) + '/' + Math.ceil(m.hpMax / 2) + ' ❤).'; }
      if (m.rider) return 'Your horse munches happily.';
      if (m.breedCD > 0) return nm + ' is not ready for another baby yet.';
      m.love = 30; m.loveP = 0; m.sitting = false; if (this.sound) VC.Audio.play('love', 0.5);
      return nm + ' is in love ❤ — feed another tamed ' + nm.toLowerCase() + ' nearby for a baby!';
    }
    findMate(m) {
      let best = null, bd = 10;
      for (const o of this.list) {
        if (o === m || o.type !== m.type || !o.tamed || o.baby || o.love <= 0 || o.dead || o.rider) continue;
        const d = o.pos.distanceTo(m.pos); if (d < bd) { bd = d; best = o; }
      }
      return best;
    }
    breed(a, b) {
      a.love = b.love = 0; a.breedCD = b.breedCD = 60;
      const x = (a.pos.x + b.pos.x) / 2, z = (a.pos.z + b.pos.z) / 2, y = Math.max(a.pos.y, b.pos.y) + 0.05;
      const baby = this.spawn(a.type, x, y, z, { tamed: true, wild: false, baby: true, coat: Math.random() < 0.5 ? a.coat : b.coat, yaw: Math.random() * Math.PI * 2 });
      this.particle(heartTex, new THREE.Vector3(x, y + 1, z), 6, 0.8, 0.9, 1.4);
      if (baby && this.sound) VC.Audio.play('pop', 0.5, { pos: baby.pos });
      if (this.onBreed) this.onBreed(baby, a);
      return baby;
    }
    growUp(m) { m.baby = false; m.age = GROW; this.applyScale(m); if (m.tamed) m.model.parts.collar.visible = true; if (this.onGrow) this.onGrow(m); }
    serialize() { return this.list.filter(m => !m.hostile && (m.tamed || !m.wild) && !(m.fish && !m.inWater)).map(m => ({ t: m.type, c: m.coat, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2), r: +m.yaw.toFixed(2), tm: m.tamed ? 1 : 0, s: m.sitting ? 1 : 0, hp: m.hp, b: m.baby ? Math.round(m.age) : undefined })); }
    load(arr) { for (const o of arr || []) if (COATS[o.t] && !TYPES[o.t].hostile) this.spawn(o.t, o.x, o.y, o.z, { coat: o.c, yaw: o.r, tamed: !!o.tm, sitting: !!o.s, wild: false, hp: o.hp, baby: o.b != null, age: o.b || 0 }); }
  }

  VC.Mobs = Mobs; VC.MobSounds = VC.Sound = { play: (n, v, o) => VC.Audio.play(n, v, o), unlock: () => VC.Audio.unlock() };
  VC.Particles = { puffTex, heartTex, critTex };
})();
