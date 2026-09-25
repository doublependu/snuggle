// SPDX-License-Identifier: GPL-3.0-only
// On-screen touch controls: floating move stick (left), drag-to-look (right), Hum / Jump / Act / Assist buttons.
export function createTouch(root, input) {
  const wrap = document.createElement('div');
  wrap.className = 'touchui';
  wrap.innerHTML = `<div class="look-zone"></div><div class="stick-zone"></div><div class="stick"><i></i></div>
    <button class="tbtn hum" aria-label="Hum">Hum</button><button class="tbtn jump" aria-label="Jump">Jump</button>
    <button class="tbtn act" aria-label="Interact"></button><button class="tbtn assist" aria-label="Assist"></button>`;
  root.append(wrap);
  const stick = wrap.querySelector('.stick');
  const knob = stick.querySelector('i');
  const R = 50;
  let stickId = null,
    ox = 0,
    oy = 0;
  const sz = wrap.querySelector('.stick-zone');
  sz.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    sz.setPointerCapture(e.pointerId);
    ox = e.clientX;
    oy = e.clientY;
    stick.style.left = ox + 'px';
    stick.style.top = oy + 'px';
    stick.classList.add('on');
    knob.style.transform = '';
    input.touchButton('none', false);
  });
  sz.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - ox,
      dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      // floating stick follows the finger past the rim
      ox += (dx / d) * (d - R);
      oy += (dy / d) * (d - R);
      stick.style.left = ox + 'px';
      stick.style.top = oy + 'px';
      dx = e.clientX - ox;
      dy = e.clientY - oy;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.min(1, Math.hypot(dx, dy) / R);
    const a = Math.atan2(dy, dx);
    input.touchMove(Math.cos(a) * m, -Math.sin(a) * m);
    input.touch.sprint = m > 0.97 && d > R * 1.6;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stick.classList.remove('on');
    input.touchMove(0, 0);
    input.touch.sprint = false;
  };
  sz.addEventListener('pointerup', endStick);
  sz.addEventListener('pointercancel', endStick);

  const lz = wrap.querySelector('.look-zone');
  const looks = new Map();
  lz.addEventListener('pointerdown', (e) => {
    lz.setPointerCapture(e.pointerId);
    looks.set(e.pointerId, [e.clientX, e.clientY, performance.now()]);
    input.touchButton('none', false);
  });
  lz.addEventListener('pointermove', (e) => {
    const l = looks.get(e.pointerId);
    if (!l) return;
    input.touchLook(e.clientX - l[0], e.clientY - l[1]);
    l[0] = e.clientX;
    l[1] = e.clientY;
  });
  const endLook = (e) => {
    const l = looks.get(e.pointerId);
    looks.delete(e.pointerId);
    // a quick tap on the look zone advances dialogue
    if (l && performance.now() - l[2] < 220) input.press('confirm');
  };
  lz.addEventListener('pointerup', endLook);
  lz.addEventListener('pointercancel', endLook);

  const button = (sel, name) => {
    const b = wrap.querySelector(sel);
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('down');
      input.touchButton(name, true);
    };
    const up = () => {
      b.classList.remove('down');
      input.touchButton(name, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    return b;
  };
  button('.hum', 'hum');
  button('.jump', 'jump');
  const act = button('.act', 'interact');
  const assist = button('.assist', 'assist');
  return {
    setAct(label) {
      if (act.textContent !== (label || '')) act.textContent = label || '';
    },
    setAssist(label) {
      if (assist.textContent !== (label || '')) assist.textContent = label || '';
    },
    reset() {
      input.touchMove(0, 0);
      for (const b of wrap.querySelectorAll('.tbtn.down')) b.classList.remove('down');
      input.touch.hum = input.touch.jump = input.touch.sprint = false;
      stick.classList.remove('on');
      stickId = null;
      looks.clear();
    },
  };
}
