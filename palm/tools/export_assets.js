// Exports VoxelCraft web assets (16x16 block tiles + 4-view mob sprites) for the Palm port.
// Usage: node export_assets.js <out.json>   (needs puppeteer-core + google-chrome; run from /workspace/vc-tests for node_modules)
const path = require('path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [process.cwd(), '/workspace/vc-tests/node_modules', '/workspace/vc-tests'] }));
(async () => {
  const out = process.argv[2] || 'assets.json';
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'], userDataDir: '/tmp/vcexp-' + process.pid });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../../index.html') + '?test=1');
  await new Promise(r => setTimeout(r, 5000));
  const data = await page.evaluate(async () => {
    const T = VC.T || null;
    const atlas = VC.Textures.buildAtlas();
    const tiles = {};
    atlas.tiles.forEach((img, i) => { if (img) tiles[i] = Array.from(img.data); });
    // mob sprites
    const SZ = 40, PX = 16; // 16 px per block
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(SZ * 4, SZ * 4); r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    const W = SZ / PX; // world units across
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, W, 0, -10, 10);
    const sprites = {};
    const g = window.game, p = g.player;
    for (const type of ['zombie', 'dog', 'cat', 'horse', 'lion', 'wolf', 'spider']) {
      const m = g.mobs.spawn(type, p.pos.x + 50, 200, p.pos.z, { force: true, coat: 0, yaw: 0 });
      const root = m.model.root;
      g.mobs.remove ? null : null;
      const scene = new THREE.Scene();
      root.parent && root.parent.remove(root);
      root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1);
      scene.add(root);
      const views = [];
      for (let v = 0; v < 4; v++) { // camera around the mob: 0 = front(+z side?), 1 = right, 2 = back, 3 = left
        const a = v * Math.PI / 2;
        cam.position.set(Math.sin(a) * 5, 0, Math.cos(a) * 5); cam.lookAt(0, 0, 0); cam.position.y = 0; cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        r.render(scene, cam);
        const gl = r.getContext(); const buf = new Uint8Array(SZ * 4 * SZ * 4 * 4);
        gl.readPixels(0, 0, SZ * 4, SZ * 4, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        // downsample 4x (nearest, center sample) and flip Y
        const px = [];
        for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
          const sy = (SZ - 1 - y) * 4 + 2, sx = x * 4 + 2, i = (sy * SZ * 4 + sx) * 4;
          px.push(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
        }
        views.push(px);
      }
      sprites[type] = views;
      scene.remove(root);
      m.dead = true; const i = g.mobs.list.indexOf(m); if (i >= 0) g.mobs.list.splice(i, 1);
    }
    return { tiles, sprites, T: (function(){ try { return VC.Blocks ? Object.keys(VC.Blocks) : null } catch (e) { return null } })() };
  });
  require('fs').writeFileSync(out, JSON.stringify(data));
  console.log('tiles', Object.keys(data.tiles).length, 'sprites', Object.keys(data.sprites), 'errors', errs);
  await browser.close();
})();
