// SPDX-License-Identifier: GPL-3.0-only
// Keep the page from zooming on phones. iOS Safari ignores maximum-scale / user-scalable in the viewport
// meta, so pinch (WebKit gesture events), double-tap and multi-finger moves are cancelled here, and if the
// page still ends up zoomed a "Reset zoom" chip snaps it back (rewriting the viewport meta).
export function lockZoom(root) {
  const opts = { passive: false };
  const scrollable = (t) => t instanceof Element && t.closest('.menu .panel');
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), opts);
  document.addEventListener('dblclick', (e) => e.preventDefault(), opts);
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1 && !scrollable(e.target)) e.preventDefault();
      else if (e.scale !== undefined && e.scale !== 1) e.preventDefault();
    },
    opts,
  );
  // a second quick tap on the game (not on a button) would be a double-tap zoom
  let lastTap = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      if (e.target instanceof Element && e.target.closest('button, a, input, select, label, .menu')) return;
      const now = performance.now();
      if (now - lastTap < 350) e.preventDefault();
      lastTap = now;
    },
    opts,
  );

  const vv = window.visualViewport;
  if (!vv) return;
  const chip = document.createElement('button');
  chip.className = 'zoomchip';
  chip.textContent = '🔍 Reset zoom';
  chip.hidden = true;
  root.append(chip);
  const meta = document.querySelector('meta[name=viewport]');
  const content = meta?.getAttribute('content') || 'width=device-width, initial-scale=1';
  chip.addEventListener('click', () => {
    // changing the viewport meta makes iOS re-apply the initial scale
    meta?.setAttribute('content', content.replace('initial-scale=1', 'initial-scale=1.0001'));
    setTimeout(() => meta?.setAttribute('content', content), 120);
    setTimeout(check, 400);
  });
  const check = () => {
    const zoomed = vv.scale > 1.01;
    chip.hidden = !zoomed;
    if (zoomed) {
      // keep the chip on screen inside the zoomed visual viewport
      chip.style.left = vv.offsetLeft + vv.width / 2 + 'px';
      chip.style.top = vv.offsetTop + 12 + 'px';
      chip.style.transform = `translateX(-50%) scale(${1 / vv.scale})`;
      chip.style.transformOrigin = 'top center';
    }
  };
  vv.addEventListener('resize', check);
  vv.addEventListener('scroll', check);
}
