// SPDX-License-Identifier: GPL-3.0-only
// The autoplayer's hands: real keyboard and mouse input through Playwright, like a person at a PC. Nothing
// here reads the game. The camera turns with a right-button drag (it works without capturing the mouse).
export function makeHands(page, log, { width = 1280, height = 720 } = {}) {
  const held = new Set();
  const sent = new Map(); // key -> when a keydown was last sent
  const W = width,
    H = height;
  const cx = W / 2,
    cy = H / 2;
  const hands = {
    async down(code) {
      if (held.has(code)) return;
      held.add(code);
      await page.keyboard.down(code);
    },
    async up(code) {
      if (!held.has(code)) return;
      held.delete(code);
      await page.keyboard.up(code);
    },
    // hold exactly these movement keys (W/A/S/D/Shift), release the others. A held key is pressed again every
    // half second (a repeat, as a held key does): if the page ever lost it (a blur clears the game's keys), she
    // would otherwise stand still with the key "held"
    async move(keys) {
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) {
        if (keys.includes(k)) {
          if (held.has(k) && Date.now() - (sent.get(k) || 0) > 500) {
            await page.keyboard.down(k);
            sent.set(k, Date.now());
          } else if (!held.has(k)) sent.set(k, Date.now());
          await hands.down(k);
        } else await hands.up(k);
      }
    },
    async stop() {
      await hands.move([]);
    },
    async tap(code, ms = 70) {
      await hands.up(code);
      await page.keyboard.down(code);
      await page.waitForTimeout(ms);
      await page.keyboard.up(code);
      log?.input(code);
    },
    async releaseAll() {
      for (const k of [...held]) await hands.up(k);
      await page.mouse.up({ button: 'right' }).catch(() => {});
    },
    // Turn the view: dx pixels of right-button drag (the game turns ~0.0036 rad per pixel at the default
    // sensitivity), dy tilts it. Like a hand on a mouse, not a jump cut: the drag eases in and out, at no more
    // than `speed` degrees a second on average (a look round is slower still). Every turn is noted, so a
    // run can say how fast the camera moved.
    async turn(dx, dy = 0, { speed = 110 } = {}) {
      dx = Math.max(-850, Math.min(850, Math.round(dx)));
      dy = Math.max(-260, Math.min(260, Math.round(dy)));
      if (!dx && !dy) return;
      const deg = (Math.hypot(dx, dy) * 0.0036 * 180) / Math.PI;
      const ms = Math.max(50, (deg / speed) * 1000);
      const steps = Math.max(2, Math.ceil(ms / 16));
      hands.turns.push({ deg, ms, t: Date.now(), dir: Math.sign(dx), look: speed < 100 });
      log?.input(`turn ${Math.sign(dx) < 0 ? '-' : '+'}${deg.toFixed(0)}°${dy ? ' tilt' : ''}`);
      if (hands.turns.length > 4000) hands.turns.splice(0, 1000);
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: 'right' });
      // each step on its own schedule (a step's own round trip doesn't stretch the turn)
      const t0 = Date.now();
      for (let i = 1; i <= steps; i++) {
        const k = Math.min(1, (Date.now() - t0) / ms),
          e = k * k * (3 - 2 * k);
        await page.mouse.move(cx + dx * e, cy + dy * e);
        if (k >= 1) break;
        await page.waitForTimeout(Math.max(0, t0 + (i * ms) / steps - Date.now()));
        if (i === steps) await page.mouse.move(cx + dx, cy + dy);
      }
      await page.mouse.up({ button: 'right' });
    },
    turns: [],
    // Scroll what's under the middle of the screen (a long menu, like the Sprite Book)
    async wheel(dy) {
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, dy);
      log?.input('wheel ' + dy);
    },
    // Click a visible button by its text (menus, dialogue choices, the chips of free good things)
    async click(text, scope = 'button') {
      const el = page.locator(scope, { hasText: text }).filter({ visible: true }).first();
      await el.click({ timeout: 3000, force: true });
      log?.input('click ' + text);
    },
    async clickSel(sel) {
      await page.locator(sel).filter({ visible: true }).first().click({ timeout: 3000, force: true });
      log?.input('click ' + sel);
    },
    wait: (ms) => page.waitForTimeout(ms),
  };
  return hands;
}
