// SPDX-License-Identifier: GPL-3.0-only
// Chestnut roasting at the night market (Chapter 2). Five chestnuts toast in the wok at their own pace;
// stir on the lullaby's beat (Hum) to keep them toasting evenly, and take each one out (tap it, or press
// 1-5, or d-pad + Interact) when it turns golden. Can't be lost: even a burnt chestnut is still a snack.
// The bags of chestnuts are a shareable snack, like Tangtang's tarts (systems/assists.js).
import { G, flag } from '../game.js';
import { ask, talk, shot } from '../story/helpers.js';
import { writeSave } from '../core/save.js';

const GOLD = [0.6, 0.86],
  PERFECT = [0.68, 0.78];

export function setupChestnuts(z) {
  z.whenNPC('chestnut', (n) => {
    n.onTalk = async () => {
      const first = !flag('chestnutDone');
      const a = await ask(
        'chestnut',
        first ? 'Roasted chestnuts! Want a turn at the wok? Stir on the beat, and pull each one out when it goes golden.' : 'Back for another round at the wok?',
        ['Let me stir!', 'Maybe later'],
      );
      G.ui.closeDialogue();
      if (a !== 0) return;
      // stand at the cart facing the wok; the camera looks over her shoulder into it
      const spot = z.marker('POINT_chestnut');
      const wok = spot.position.clone().add({ x: -0.25, y: 1.1, z: -1.6 });
      G.frozen = true;
      G.player.teleport(spot.position, Math.PI);
      G.player.setState('pose');
      G.player.h.play('stir', 0.3);
      G.cam.setShot(spot.position.clone().add({ x: 1.2, y: 2.3, z: 1.7 }), wok, 1);
      const score = await chestnutGame();
      G.player.setState('move');
      G.cam.clearShot();
      const bags = 2 + (score >= 7 ? 2 : score >= 4 ? 1 : 0);
      G.collection.addChestnuts(bags);
      await talk([['chestnut', score >= 7 ? 'Perfect! Not one burnt. You have a gift, young lady.' : score >= 4 ? 'Nicely done! Toasty and sweet.' : 'A little smoky… the way my grandmother liked them!']]);
      G.ui.toast(`🌰 +${bags} bags of roasted chestnuts: share them with an upset Grumbling (Assist).`, 3.5);
      if (first) {
        flag('chestnutDone', true);
        G.collection.cozy(10 + score, 'Roasted chestnuts', G.player.position.clone().setY(G.player.position.y + 1.6));
        writeSave(G.save);
      }
    };
  });
}

export function chestnutGame() {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'cook panel show nuts';
    el.setAttribute('role', 'dialog');
    G.ui.root.append(el);
    G.frozen = true;
    const nuts = Array.from({ length: 5 }, (_, i) => ({ t: 0, rate: 0.09 + Math.random() * 0.06 + i * 0.008, out: false, hot: 0 }));
    let score = 0,
      since = 0,
      focus = 0,
      ended = false,
      time = 0;
    el.innerHTML = `<h3>🌰 Roasting chestnuts</h3><div class="small" style="margin:-4px 0 8px">Stir on the beat (Hum). Take each chestnut out when it's golden.</div>
      <div class="nutrow">${nuts.map((_, i) => `<button class="nut" data-i="${i}"><i></i><span>${i + 1}</span></button>`).join('')}</div>
      <div class="res" style="min-height:1.4em;font-weight:800"></div>`;
    const btns = [...el.querySelectorAll('.nut')];
    const res = el.querySelector('.res');
    const take = (i) => {
      const n = nuts[i];
      if (!n || n.out || ended) return;
      n.out = true;
      const b = btns[i];
      b.classList.add('out');
      if (n.t >= PERFECT[0] && n.t <= PERFECT[1]) {
        score += 2;
        res.textContent = '✨ Perfectly golden!';
        G.audio.play('perfect');
      } else if (n.t >= GOLD[0] && n.t <= GOLD[1]) {
        score += 1;
        res.textContent = '👍 Toasty!';
        G.audio.play('blip');
      } else {
        res.textContent = n.t < GOLD[0] ? '😅 A bit pale, still tasty!' : '💨 A little smoky!';
        G.audio.play('snap');
      }
    };
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const b = e.target.closest('.nut');
      if (b) take(+b.dataset.i);
    });
    const onKey = (e) => {
      const i = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4 }[e.code];
      if (i !== undefined) take(i);
    };
    addEventListener('keydown', onKey);
    const tick = (dt) => {
      const input = G.input;
      time += dt;
      since += dt;
      input.consume('confirm');
      // stirring on the beat evens out the heat; forget to stir and one chestnut gets a hot spot
      if (input.consume('hum')) {
        const b = G.audio.beat();
        const off = Math.min(b.phase, 1 - b.phase) * (60 / 84);
        if (off < 0.15) {
          since = 0;
          for (const n of nuts) n.hot = 0;
          G.audio.play('sizzle');
          res.textContent = '♪ Stir!';
        } else G.audio.play('blip');
      }
      if (since > 2.6) {
        const n = nuts.filter((x) => !x.out)[(Math.random() * 5) | 0];
        if (n) n.hot = 1;
        since = 1.2;
      }
      if (input.consume('left_edge') || input.consume('up_edge')) focus = (focus + 4) % 5;
      if (input.consume('right_edge') || input.consume('down_edge')) focus = (focus + 1) % 5;
      if (input.consume('interact') || input.consume('jump')) take(focus);
      nuts.forEach((n, i) => {
        if (!n.out) n.t += n.rate * dt * (1 + n.hot);
        const b = btns[i];
        b.classList.toggle('focus', i === focus && input.device === 'gamepad');
        // raw cream -> golden -> dark
        const t = Math.min(1.2, n.t);
        const col = t < 0.6 ? mixc([236, 214, 170], [214, 150, 70], t / 0.6) : t < 0.86 ? mixc([214, 150, 70], [168, 96, 40], (t - 0.6) / 0.26) : mixc([168, 96, 40], [60, 34, 24], Math.min(1, (t - 0.86) / 0.3));
        b.querySelector('i').style.background = `rgb(${col})`;
        b.classList.toggle('gold', t >= GOLD[0] && t <= GOLD[1]);
        b.classList.toggle('hot', n.hot > 0 && !n.out);
        if (!n.out && n.t > 1.25) take(i);
      });
      if (!ended && nuts.every((n) => n.out)) {
        ended = true;
        setTimeout(() => {
          G.updaters.delete(tick);
          removeEventListener('keydown', onKey);
          el.remove();
          G.frozen = false;
          resolve(score);
        }, 900);
      }
    };
    G.updaters.add(tick);
  });
}

function mixc(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
}
