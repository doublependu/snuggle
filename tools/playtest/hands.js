// SPDX-License-Identifier: GPL-3.0-only
// The autoplayer's hands: real keyboard and mouse input through Playwright, like a person at a PC. Nothing
// here reads the game. The camera turns with a right-button drag (it works without capturing the mouse).
export function makeHands(page, log) {
  const held = new Set();
  const W = 1280,
    H = 720;
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
    // hold exactly these movement keys (W/A/S/D/Shift), release the others
    async move(keys) {
      for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) {
        if (keys.includes(k)) await hands.down(k);
        else await hands.up(k);
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
    // sensitivity), dy tilts it.
    async turn(dx, dy = 0) {
      dx = Math.max(-500, Math.min(500, Math.round(dx)));
      dy = Math.max(-200, Math.min(200, Math.round(dy)));
      if (!dx && !dy) return;
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: 'right' });
      const steps = Math.max(2, Math.ceil(Math.hypot(dx, dy) / 60));
      for (let i = 1; i <= steps; i++) await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
      await page.mouse.up({ button: 'right' });
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
