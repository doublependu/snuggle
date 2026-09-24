// Friend assists (Q / Y / Assist button):
//  - Sugarcraft Tart (Tangtang's pastries, from the kitchen): lobbed at the nearest Grumbling, calms
//    everything around the landing spot and pauses their tantrums.
//  - Echo Friend (Wei Bao, costs Cozy Energy): Captain Honk voices what the Grumbling needs, and
//    soothing it goes twice as fast for a while.
import { Mesh, SphereGeometry, Vector3 } from 'three';
import { G } from '../game.js';
import { materialFor } from '../render/materials.js';

const ECHO_COST = 20;
const NEEDS = {
  cloud: 'IT WANTS SOMEONE TO SHARE AN UMBRELLA WITH. HONK.',
  sock: 'IT IS SCARED IT WILL NEVER BE A PAIR AGAIN. STAND STILL AND BE PATIENT.',
  homework: 'IT THINKS EVERYONE IS DISAPPOINTED IN IT. TELL IT ONE PAGE IS ENOUGH.',
  pompom: 'IT JUST WANTS TO PLAY WITH EVERYONE ELSE. TAKE IT TO THE COURTYARD!',
};

function nearest(max = 9) {
  let best = null,
    bd = max;
  for (const g of G.grumblings) {
    if (!g.active) continue;
    const d = g.position.distanceTo(G.player.position);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}

export function useAssist() {
  const target = G.soothe.target || nearest();
  if (G.save.tarts > 0 && target) return throwTart(target);
  if (G.save.story.weibaoFriend && target) return echo(target);
  if (!target) G.ui.toast('Assists work on a nearby Grumbling.', 1.8);
  else G.ui.toast('No tarts left. Bake more with Tangtang in the kitchen!', 2.2);
}

function throwTart(target) {
  G.save.tarts--;
  G.collection.refreshHud();
  const p = G.player;
  p.overlayName = 'throw';
  setTimeout(() => (p.overlayName = null), 600);
  G.audio.play('whoosh');
  const tart = new Mesh(new SphereGeometry(0.1, 8, 5), materialFor('plain', { color: 0xf3c35a, vertexColors: false }));
  const from = p.position.clone().setY(p.position.y + 1);
  const to = target.position.clone().setY(target.position.y + 0.3);
  G.zone.group.add(tart);
  let t = 0;
  const fly = (dt) => {
    t += dt / 0.6;
    const k = Math.min(1, t);
    tart.position.lerpVectors(from, to, k);
    tart.position.y += Math.sin(k * Math.PI) * 1.2;
    tart.rotation.z += dt * 10;
    if (k >= 1) {
      G.updaters.delete(fly);
      tart.removeFromParent();
      G.fx.sparkles.emit(to, 30, '#ffd27a', { speed: 2, up: 1.2, size: 0.12, life: 1.1 });
      G.audio.play('sparkle');
      G.ui.floaty(to, '🥧 So sweet!');
      for (const g of G.grumblings) {
        if (g.active && g.position.distanceTo(to) < 3.2) {
          g.wrap(0.25);
          g.calmedT = 4;
        }
      }
    }
  };
  G.updaters.add(fly);
}

function echo(target) {
  if (!G.collection.spend(ECHO_COST)) {
    G.ui.toast(`Echo Friend needs ${ECHO_COST} Cozy Energy. Do something kind!`, 2.4);
    return;
  }
  G.audio.play('honk');
  G.ui.bubble(target.obj, `🪿 ${NEEDS[target.species] || 'IT JUST WANTS A HUG. HONK.'}`, 4.5, 0.9);
  const was = target.rate.bind(target);
  target.rate = () => was() * 2;
  setTimeout(() => (target.rate = was), 12000);
}
