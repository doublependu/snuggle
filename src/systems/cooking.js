// Tangtang's kitchen mini-game: three timing steps (knead, fill, bake). Press Hum / Interact / tap
// when the marker is in the green zone. Returns the score (0-6: 1 per good step, 2 per perfect).
import { G } from '../game.js';

const STEPS = [
  { label: 'Knead the dough', speed: 0.8, zone: [0.35, 0.65], perfect: [0.46, 0.54] },
  { label: 'Pipe the custard', speed: 1.1, zone: [0.55, 0.8], perfect: [0.64, 0.71] },
  { label: 'Bake until golden', speed: 1.45, zone: [0.2, 0.4], perfect: [0.27, 0.33] },
];

export function cookingGame() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'cook panel show';
    el.setAttribute('role', 'dialog');
    G.ui.root.append(el);
    G.frozen = true;
    let step = 0,
      score = 0,
      pos = 0,
      dir = 1,
      wait = 0,
      clicked = false;
    const render = () => {
      const s = STEPS[step];
      el.innerHTML = `<h3>🥧 Custard tarts with Tangtang</h3><div>${step + 1}/3 · <b>${s.label}</b></div>
        <div class="meter"><div class="zone" style="left:${s.zone[0] * 100}%;width:${(s.zone[1] - s.zone[0]) * 100}%"></div>
        <div class="zone perfect" style="left:${s.perfect[0] * 100}%;width:${(s.perfect[1] - s.perfect[0]) * 100}%"></div><div class="mark"></div></div>
        <div class="res" style="min-height:1.4em;font-weight:800"></div><div class="small">Press Hum / Interact or tap when the marker is in the green.</div>`;
    };
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      clicked = true;
    });
    render();
    const tick = (dt) => {
      const input = G.input;
      const press = clicked || input.consume('hum') || input.consume('interact') || input.consume('jump');
      clicked = false;
      input.consume('confirm');
      if (wait > 0) {
        wait -= dt;
        if (wait <= 0) {
          step++;
          if (step >= STEPS.length) {
            G.updaters.delete(tick);
            el.remove();
            G.frozen = false;
            resolve(score);
            return;
          }
          pos = 0;
          render();
        }
        return;
      }
      const s = STEPS[step];
      pos += dir * s.speed * dt;
      if (pos > 1) {
        pos = 1;
        dir = -1;
      } else if (pos < 0) {
        pos = 0;
        dir = 1;
      }
      const mark = el.querySelector('.mark');
      if (mark) mark.style.left = pos * 100 + '%';
      if (press) {
        const res = el.querySelector('.res');
        if (pos >= s.perfect[0] && pos <= s.perfect[1]) {
          score += 2;
          res.textContent = '✨ Perfect!';
          G.audio.play('perfect');
        } else if (pos >= s.zone[0] && pos <= s.zone[1]) {
          score += 1;
          res.textContent = '👍 Good!';
          G.audio.play('blip');
        } else {
          res.textContent = '💨 Oops — still tasty!';
          G.audio.play('snap');
        }
        wait = 0.9;
      }
    };
    G.updaters.add(tick);
  });
}
