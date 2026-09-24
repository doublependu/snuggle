// Context interaction: the nearest enabled interactable within reach gets the prompt / touch button.
// Interactable: { label, position (Vector3), radius, enabled(), action(), key? }
import { G } from '../game.js';

const KEYS = { keyboard: 'F', gamepad: 'X', touch: '' };

export class Interact {
  constructor() {
    this.current = null;
  }

  update() {
    const p = G.player;
    let best = null;
    let bd = Infinity;
    if (p && !G.frozen && p.state === 'move') {
      for (const it of G.interactables) {
        if (it.enabled && !it.enabled()) continue;
        const d = it.position.distanceTo(p.position);
        if (d > (it.radius || 2)) continue;
        // prefer things in front of her
        const dx = it.position.x - p.position.x,
          dz = it.position.z - p.position.z;
        const front = (dx * Math.sin(p.facing) + dz * Math.cos(p.facing)) / Math.max(0.01, Math.hypot(dx, dz));
        const score = d - front * 0.6;
        if (score < bd) {
          bd = score;
          best = it;
        }
      }
    }
    this.current = best;
    const label = best ? (typeof best.label === 'function' ? best.label() : best.label) : '';
    G.ui.prompt(label, KEYS[G.input.device] || 'F');
    G.touch?.setAct(label);
    if (best && G.input.consume('interact')) best.action();
  }
}
