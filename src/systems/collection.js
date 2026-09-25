// SPDX-License-Identifier: GPL-3.0-only
// Charm Sprites collected, the equipped helper, Cozy Energy, tarts and lemon candies (all saved).
import { G } from '../game.js';
import { SPECIES } from '../content/species.js';
import { writeSave } from '../core/save.js';

export class Collection {
  constructor() {
    this.candyTotal = 0;
  }

  get save() {
    return G.save;
  }

  refreshHud() {
    const s = this.save;
    G.ui.setCozy(s.cozy);
    G.ui.setChips(s.tarts, Object.keys(s.candies).length, this.candyTotal, s.chestnuts || 0);
    const h = s.helper && SPECIES[s.helper];
    G.ui.setHelper(h ? h.name : '', h ? G.menus.thumb(s.helper) : '', h ? h.abilityName : '');
    G.touch?.setAssist(this.assistLabel());
  }

  // key: '<zone>:<grumbling id>' for a one-off encounter; it counts once, however often it is replayed.
  add(id, from, key = null) {
    const s = this.save;
    if (key) {
      if (s.soothed[key]) return false;
      s.soothed[key] = true;
    }
    s.sprites[id] = (s.sprites[id] || 0) + 1;
    s.seen[id] = true;
    const first = s.sprites[id] === 1;
    G.ui.toast(first ? `✨ New Charm Sprite: <b>${SPECIES[id].name}</b>` : `✨ ${SPECIES[id].name} joined your team`);
    G.sprites?.add(id, from);
    if (first && SPECIES[id].ability && (!s.helper || !SPECIES[s.helper]?.ability)) this.equip(id, true);
    G.events.emit('sprite', { id, first });
    writeSave(s);
    this.refreshHud();
    return true;
  }

  equip(id, quiet = false) {
    this.save.helper = id;
    if (!quiet) G.ui.toast(`${SPECIES[id].name} is now helping: ${SPECIES[id].abilityName}`);
    G.events.emit('helper', id);
    this.refreshHud();
  }

  helper(ability) {
    return SPECIES[this.save.helper]?.ability === ability;
  }

  has(id) {
    return (this.save.sprites[id] || 0) > 0;
  }

  cozy(n, reason = '', pos = null) {
    const s = this.save;
    const gain = Math.round(n * (this.helper('cheer') ? 1.5 : 1));
    s.cozy = Math.min(100, s.cozy + gain);
    G.audio.play('cozy');
    if (pos) G.ui.floaty(pos, `+${gain} Cozy${reason ? ' · ' + reason : ''}`);
    else G.ui.toast(`+${gain} Cozy Energy${reason ? ': ' + reason : ''}`, 2);
    G.events.emit('cozy', s.cozy);
    this.refreshHud();
  }

  spend(n) {
    if (this.save.cozy < n) return false;
    this.save.cozy -= n;
    this.refreshHud();
    return true;
  }

  addTarts(n) {
    this.save.tarts += n;
    this.refreshHud();
  }

  addChestnuts(n) {
    this.save.chestnuts = (this.save.chestnuts || 0) + n;
    this.refreshHud();
  }

  candy(id, pos) {
    if (this.save.candies[id]) return;
    this.save.candies[id] = true;
    G.audio.play('candy');
    const n = Object.keys(this.save.candies).length;
    G.ui.floaty(pos, `🍬 ${n}/${this.candyTotal}`);
    if (n === this.candyTotal) G.ui.toast('You found every lemon candy! Master Fang would be proud.', 3.5);
    this.cozy(3, '', null);
    writeSave(this.save);
  }

  // Assist label shown on the touch button / used by Q.
  assistLabel() {
    const s = this.save;
    const opts = [];
    if (s.tarts > 0) opts.push('Tart');
    else if (s.chestnuts > 0) opts.push('Nuts');
    if (G.save.story.weibaoFriend) opts.push('Echo');
    return opts.join('/');
  }
}
