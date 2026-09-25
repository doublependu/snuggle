// SPDX-License-Identifier: GPL-3.0-only
// Floating lanterns from the end of the pier (Chapter 2). Release eight paper lanterns, one on each beat
// of the lullaby (Hum, or tap Release): well-timed lanterns drift further out and glow brighter. They stay
// on the water (lighting it through the lamp map), and every lantern floated makes "the lanterns on the
// water" a stronger free good thing for the sparrow flocks (systems/perch.js).
import { CylinderGeometry, Mesh, Vector3 } from 'three';
import { G, flag } from '../game.js';
import { materialFor } from '../render/materials.js';
import { writeSave } from '../core/save.js';
import { talk } from '../story/helpers.js';

const GEO = new CylinderGeometry(0.13, 0.16, 0.26, 7);
const COLORS = ['#ff6a3d', '#ffb45c', '#ffd166', '#ff8fb0'];

export function setupLanterns(z) {
  const pier = z.marker('POINT_launch');
  const out = new Vector3(Math.sin(pier.facing), 0, Math.cos(pier.facing)); // out over the water
  const floating = [];
  const waterY = (z.waterLevel ?? -0.75) + 0.12;
  const add = (pos, color, settle = false) => {
    const m = new Mesh(GEO, materialFor('glow', { color: color, vertexColors: false }));
    m.position.copy(pos);
    z.group.add(m);
    const l = { m, vel: new Vector3(), home: pos.clone(), glow: G.fx.glows.add(pos, color, 0.9), phase: Math.random() * 6 };
    if (settle) l.settled = true;
    floating.push(l);
    return l;
  };
  // lanterns floated on earlier visits are still out there
  const n = Math.min(24, G.save.story.lanternsFloated || 0);
  for (let i = 0; i < n; i++) {
    const a = (Math.random() - 0.5) * 1.6;
    const d = 5 + Math.random() * 14;
    const p = pier.position.clone().addScaledVector(out, d).add(new Vector3(Math.cos(pier.facing) * a * d * 0.5, 0, -Math.sin(pier.facing) * a * d * 0.5));
    p.y = waterY;
    add(p, COLORS[i % 4], true);
  }
  if (n) relight();
  function relight() {
    const extra = floating.map((l) => ({ position: l.m.position, color: '#ffb45c', radius: 2.6, intensity: 0.55 }));
    z.lampList = z.lampList.filter((x) => !x.floating).concat(extra.map((e) => ({ ...e, floating: true })));
    z.relight();
  }
  z.updaters.push((dt) => {
    for (const l of floating) {
      l.phase += dt;
      if (!l.settled) {
        l.m.position.addScaledVector(l.vel, dt);
        l.vel.multiplyScalar(Math.max(0, 1 - dt * 0.35));
        if (l.m.position.y > waterY) l.m.position.y = Math.max(waterY, l.m.position.y - dt * 0.8);
        if (l.vel.lengthSq() < 0.01) l.settled = true;
      }
      l.m.position.y = Math.max(waterY, l.m.position.y) + Math.sin(l.phase * 1.3) * 0.0015;
      l.m.rotation.y += dt * 0.2;
      G.fx.glows.set(l.glow, l.m.position);
    }
  });

  z.addInteractable({
    position: pier.position,
    radius: 2.4,
    label: 'Float lanterns',
    action: async () => {
      if (!flag('lanternTalk')) {
        flag('lanternTalk', true);
        await talk([
          ['tangtang', 'Floating lanterns! You make a wish, and let it go on the beat of a song.'],
          ['honk', 'CAPTAIN HONK WISHES FOR BREAD. HONK.'],
        ]);
      }
      const results = await lanternGame((q) => {
        // launch one lantern: good timing sends it further out
        const l = add(pier.position.clone().setY(pier.position.y + 0.5), COLORS[(Math.random() * 4) | 0]);
        const speed = 1.4 + q * 1.8;
        l.vel.copy(out).multiplyScalar(speed).add(new Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.3));
        G.audio.play('launch');
        G.fx.sparkles.emit(l.m.position, 8, '#ffd9a8', { speed: 0.5, size: 0.14 });
      });
      const good = results.filter((q) => q >= 0.5).length;
      G.save.story.lanternsFloated = (G.save.story.lanternsFloated || 0) + results.length;
      setTimeout(relight, 4000);
      const first = !flag('lanternsDone');
      if (first) {
        flag('lanternsDone', true);
        G.collection.cozy(8 + good, 'Floated lanterns', G.player.position.clone().setY(G.player.position.y + 1.6));
      } else G.collection.cozy(3, 'Floated lanterns', G.player.position.clone().setY(G.player.position.y + 1.6));
      writeSave(G.save);
      G.events.emit('lanterns', results.length);
      G.ui.toast('🏮 The lanterns on the water shine a little brighter for every one you float.', 3.5);
    },
  });
}

// Eight releases, each scored by how close to a beat it lands: 1 perfect, 0.5 good, 0.2 off-beat.
export function lanternGame(onRelease) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'cook panel show lanterns';
    el.setAttribute('role', 'dialog');
    G.ui.root.append(el);
    G.frozen = true;
    const N = 8;
    const results = [];
    el.innerHTML = `<h3>🏮 Floating lanterns</h3><div class="small" style="margin:-4px 0 8px">Release each lantern on the beat (Hum, or tap Release).</div>
      <div class="lrow">${Array.from({ length: N }, () => '<i></i>').join('')}</div>
      <div class="beatring"><div class="pulse"></div></div>
      <button class="btn release">Release</button><div class="res" style="min-height:1.4em;font-weight:800;margin-top:6px"></div>`;
    const dots = [...el.querySelectorAll('.lrow i')];
    const res = el.querySelector('.res');
    const pulse = el.querySelector('.pulse');
    let clicked = false,
      lastBeat = -1,
      done = false;
    el.querySelector('.release').addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      clicked = true;
    });
    const tick = () => {
      const input = G.input;
      input.consume('confirm');
      const b = G.audio.beat();
      if (b.index !== lastBeat) {
        lastBeat = b.index;
        pulse.classList.remove('beat');
        void pulse.offsetWidth;
        pulse.classList.add('beat');
      }
      const press = clicked || input.consume('hum') || input.consume('interact') || input.consume('jump');
      clicked = false;
      if (press && !done) {
        const off = Math.min(b.phase, 1 - b.phase) * (60 / 84);
        const q = off < 0.09 ? 1 : off < 0.18 ? 0.5 : 0.2;
        res.textContent = q === 1 ? '✨ Perfect release!' : q === 0.5 ? '👍 Lovely!' : '🌬️ Off it goes!';
        G.audio.play(q === 1 ? 'perfect' : 'blip');
        dots[results.length].className = q === 1 ? 'perfect' : 'done';
        results.push(q);
        onRelease(q);
        if (results.length >= N) {
          done = true;
          setTimeout(() => {
            G.updaters.delete(tick);
            el.remove();
            G.frozen = false;
            resolve(results);
          }, 1200);
        }
      }
    };
    G.updaters.add(tick);
  });
}
