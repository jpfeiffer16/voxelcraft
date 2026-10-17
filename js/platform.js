// Platform detection (runs before everything else). ?mobile=1 / ?mobile=0 force a mode.
window.VC = window.VC || {};
(function () {
  const q = location.search;
  let mobile;
  if (/[?&]mobile=1/.test(q)) mobile = true;
  else if (/[?&]mobile=0/.test(q)) mobile = false;
  else {
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia && matchMedia('(any-pointer: fine)').matches;
    const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    mobile = touch && coarse && !fine;
  }
  VC.isMobile = mobile;
  if (mobile) document.documentElement.classList.add('mobile');
})();
