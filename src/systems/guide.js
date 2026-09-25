// SPDX-License-Identifier: GPL-3.0-only
// Lost children at the night market (Chapter 2). A soothed Wistful Sparrow becomes a Charm Sprite that
// "guides lost children back to their parents": with it equipped as her helper (ability: Guide), Xiao
// Pei can lead a crying child through the crowd. The child holds on and follows (actors/follower.js), and
// a little glowing sparrow flies ahead, leaving a trail of sparkles to the parent.
import { Vector3 } from 'three';
import { G, flag } from '../game.js';
import { talk } from '../story/helpers.js';
import { makeCreature } from '../actors/creatures.js';
import { SPECIES } from '../content/species.js';
import { writeSave } from '../core/save.js';

const FAMILIES = [
  { kid: 'kid1', parent: 'parent1', lost: 'I can’t find my mama… there were so many lanterns and then she was gone…', thanks: 'Mei-Mei! There you are! Oh, thank you, young sorcerer!' },
  { kid: 'kid2', parent: 'parent2', lost: 'Baba said wait by the water… but I followed a sparrow and now I don’t know where the water is…', thanks: 'Little Bo! I was so worried! Thank you, thank you!' },
  { kid: 'kid3', parent: 'parent3', lost: 'I wanted to see the boats… Grandma is by the dumplings… I think…', thanks: 'Ah, my little sailor! Grandma was about to cry into the dumplings. Thank you, dear.' },
];

const _t = new Vector3();

export function setupGuide(z) {
  let leading = null; // { fam, kid, parent }
  // the guide sparrow: a small glowing sprite that flies from Xiao Pei toward the parent, over and over
  let bird = null,
    birdT = 0,
    birdGlow = -1;
  const home = (fam) => flag(fam.kid + 'Home');

  for (const fam of FAMILIES) {
    z.whenNPC(fam.kid, (kid) => {
      kid.blobRadius = 0.22;
      z.whenNPC(fam.parent, (parent) => {
        if (home(fam)) {
          // already reunited on an earlier visit: they stay together
          kid.root.position.copy(parent.position).add(_t.set(0.7, 0, 0.3));
          kid.setAnim('idle', 0);
          return;
        }
        parent.onTalk = () => talk([['parent', 'Have you seen a little one? This tall, with a red scarf… oh, where could they be?']]);
      });
      kid.onTalk = async () => {
        if (home(fam)) return talk([['kid', 'Thank you for finding my family! Your sparrow is really pretty.']]);
        if (leading?.fam === fam) return talk([['kid', 'I’m holding on! Don’t let go!']]);
        if (leading) return talk([['kid', 'You’re already helping someone… can you come back for me after?']]);
        await talk([['kid', fam.lost]]);
        if (!G.collection.helper('guide')) {
          await talk([['xiaopei', 'Don’t cry. We’ll find them… I just need a way to know where they are.', { face: 'worried' }]]);
          if (G.collection.has('sparrow')) G.ui.toast('💡 Equip a Wistful Sparrow as your helper in the Sprite Book: its Guide ability knows the way.', 5);
          else G.ui.toast('💡 Wistful Sparrows know the way home. Soothe a flock, then come back!', 4.5);
          return;
        }
        await talk([
          ['xiaopei', 'My sparrow knows the way. Hold on to my jacket, okay?', { face: 'smile' }],
          ['kid', '…okay.'],
        ]);
        const parent = z.npcs.find((n) => n.id === fam.parent);
        if (!parent) return;
        leading = { fam, kid, parent };
        kid.setAnim('idle', 0.2);
        kid.follow({ x: 0.7, z: 0.9 });
        G.ui.toast('🐦 Follow the sparrow’s sparkles to their family.', 3.5);
        G.events.emit('guide', fam.kid);
      };
    });
  }

  z.updaters.push((dt) => {
    if (!leading) {
      if (bird) bird.visible = false;
      if (birdGlow >= 0) G.fx.glows.set(birdGlow, _t.set(0, -99, 0), null, 0);
      return;
    }
    const { fam, kid, parent } = leading;
    const p = G.player.position;
    // the guide: fly from her shoulder toward the parent, sparkling, then start again
    if (!bird) {
      bird = makeCreature('sparrow', { glow: SPECIES.sparrow.glow });
      bird.scale.setScalar(0.5);
      z.group.add(bird);
      birdGlow = G.fx.glows.add(p, SPECIES.sparrow.glow, 0.5);
    }
    bird.visible = true;
    birdT += dt;
    const to = parent.position;
    const d = Math.hypot(to.x - p.x, to.z - p.z);
    const reach = Math.min(d, 9);
    const k = (birdT % 2.6) / 2.6;
    _t.set(to.x - p.x, 0, to.z - p.z).normalize();
    bird.position.set(p.x + _t.x * reach * k, p.y + 1.6 + Math.sin(k * Math.PI) * 0.8, p.z + _t.z * reach * k);
    bird.rotation.y = Math.atan2(_t.x, _t.z);
    const wings = bird.userData.wings || [];
    wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * Math.sin(G.time * 26) * 0.9));
    G.fx.glows.set(birdGlow, bird.position, null, 0.6);
    if (Math.random() < dt * 14) G.fx.sparkles.emit(bird.position, 1, SPECIES.sparrow.glow, { speed: 0.15, up: -0.2, size: 0.12, life: 1.6 });
    // reunited
    const kd = kid.position.distanceTo(to);
    if ((kd < 3.2 || (G.player.position.distanceTo(to) < 2.2 && kd < 5)) && !G.frozen) {
      leading = null;
      reunite(fam, kid, parent);
    }
  });

  async function reunite(fam, kid, parent) {
    kid.follow(null);
    flag(fam.kid + 'Home', true);
    writeSave(G.save);
    kid.walkTo(parent.position.clone().add(_t.set(0.6, 0, 0.3)), 1.4).then(() => {
      kid.setAnim('celebrate', 0.3);
      setTimeout(() => kid.setAnim('idle', 0.4), 2600);
    });
    parent.setAnim('wave', 0.3);
    await talk([['parent', fam.thanks]]);
    parent.setAnim('idle', 0.4);
    parent.onTalk = () => talk([['parent', 'Thank you again. We’ll hold hands all the way home tonight.']]);
    G.audio.play('thanks');
    G.collection.cozy(10, 'Brought a family together', parent.position.clone().setY(parent.position.y + 1.8));
    G.events.emit('reunited', fam.kid);
    const left = FAMILIES.filter((f) => !home(f)).length;
    if (!left) G.ui.toast('💛 Every lost little one is back with their family tonight.', 4);
  }
}
