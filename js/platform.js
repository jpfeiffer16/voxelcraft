// Platform / touch-mode handling (runs before everything else).
// Touch mode: saved preference 'auto' | 'on' | 'off'; ?mobile=1 / ?mobile=0 overrides it for the session.
window.VC = window.VC || {};
(function () {
  const PREF_KEY = 'voxelcraft.touchMode';
  const q = location.search;
  const url = /[?&]mobile=1/.test(q) ? true : /[?&]mobile=0/.test(q) ? false : null;
  function detect() {
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia && matchMedia('(any-pointer: fine)').matches;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return touch && coarse && !fine;
  }
  let pref = 'auto';
  try { const p = localStorage.getItem(PREF_KEY); if (p === 'on' || p === 'off' || p === 'auto') pref = p; } catch (e) {}
  let urlActive = url !== null; // URL wins until the player changes the toggle
  VC.autoMobile = detect();
  function resolve() { return urlActive ? url : pref === 'on' ? true : pref === 'off' ? false : VC.autoMobile; }
  function apply() {
    VC.isMobile = resolve();
    document.documentElement.classList.toggle('mobile', VC.isMobile);
  }
  VC.touchMode = {
    get pref() { return pref; },
    get urlOverride() { return urlActive ? url : null; },
    set(mode) {
      pref = mode; urlActive = false;
      try { localStorage.setItem(PREF_KEY, mode); } catch (e) {}
      const was = VC.isMobile; apply();
      window.dispatchEvent(new CustomEvent('vc-touchmode', { detail: { changed: was !== VC.isMobile } }));
    },
    // T key: flip whatever is currently active
    toggle() { this.set(VC.isMobile ? 'off' : 'on'); },
  };
  apply();
})();
