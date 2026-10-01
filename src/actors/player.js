// SPDX-License-Identifier: GPL-3.0-only
// Pip: capsule character controller against the zone BVH, animation state and Bean riding in
// her hood (her braid swings on the Humanoid's spring chains).
import { Line3, MathUtils, Vector3 } from 'three';
import { G } from '../game.js';

const _f = new Vector3();
const _r = new Vector3();
const _m = new Vector3();
const _seg = new Line3();
const _p = new Vector3();
const _look = new Vector3();
const _foot = new Vector3();
const WALK = 1.45; // m/s: a brisk walk, just under where the walk clip gives way to the run (gaitFor)
const TURN_TIME = 0.34; // a pivot on the spot (the 'turn' clip plays meanwhile)
const angleTo = (from, to) => MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;

// Walk or run for a speed, from the character's measured gait: the walk clip up to about twice its natural
// speed (a brisk walk: Pip's on a keyboard), then the run (with a little hysteresis so it doesn't flicker
// between them), each played at the speed that keeps the planted foot still. Used by Pip, the NPCs and her
// friends.
export function gaitFor(h, speed, wasRun = false) {
  const walk = h.gait('walk'),
    run = h.gait('run');
  const up = (walk?.speed || 0.95) * (wasRun ? 2.0 : 2.15);
  if (speed < up || !run) return ['walk', MathUtils.clamp(speed / (walk?.speed || 0.95), 0.5, 2.2)];
  return ['run', MathUtils.clamp(speed / run.speed, 0.7, 3.4)];
}

// Put Bean in Pip's hood. Newer models carry a seat_doudou bone (where his base sits);
// older ones fall back to a fixed offset. Call while the skeleton is still in its bind pose.
export function seatDoudou(humanoid, doudou) {
  const root = humanoid.root;
  root.updateMatrixWorld(true);
  const seat = humanoid.bones.seat_doudou;
  if (seat) root.worldToLocal(seat.getWorldPosition(_p));
  else _p.set(0.02, 0.705, -0.12);
  doudou.position.copy(_p);
  doudou.rotation.set(seat ? -0.35 : -0.15, 0.25, 0.05);
  doudou.scale.setScalar(seat ? 0.68 : 0.82);
  root.add(doudou);
  doudou.updateMatrixWorld(true);
  (seat || humanoid.bones.hood)?.attach(doudou);
  return doudou;
}

export class Player {
  constructor(humanoid, doudou) {
    this.h = humanoid;
    this.root = humanoid.root;
    this.position = this.root.position;
    this.velocity = new Vector3();
    this.radius = 0.24;
    this.height = 1.12;
    this.facing = 0;
    this.speed = 0;
    this.onGround = false;
    this.groundTime = 0;
    this.airTime = 0;
    this.jumpBuffer = 0;
    this.state = 'move'; // move | sit | overwhelmed | pose
    this.stateTime = 0;
    this.humming = false;
    this.landTimer = 0;
    this.safe = new Vector3();
    this.groundN = new Vector3(0, 1, 0); // the ground's normal under her (world/collision.js)
    this.stepPhase = 0;
    this.turnT = 0;
    this.stepWas = null;
    this.moveScale = 1;
    this.root.name = 'xiaopei';
    // Bean sleeps in the hood
    this.doudou = doudou;
    if (doudou) seatDoudou(humanoid, doudou);
    // her face follows the dialogue like the NPCs'
    G.events.on('say', ({ who, face }) => {
      if (who === 'xiaopei') humanoid.face?.set(face || 'neutral');
      humanoid.face?.talk(who === 'xiaopei');
      if (who !== 'xiaopei') this.speaker = G.npcs.get(who === 'honk' ? 'weibao' : who) || this.speaker;
    });
    G.events.on('typed', () => humanoid.face?.talk(false));
    G.events.on('said', () => humanoid.face?.set('neutral'));
  }

  // Put her at p, feet on the floor under it: story spots come from markers at ground level, so one on a raised
  // floor (the pavilion's platform) would otherwise leave her inside it. snap=false keeps p exactly (seats).
  teleport(p, facing = this.facing, snap = true) {
    this.position.copy(p);
    const y = snap ? G.collision?.floorY(p) : null;
    if (y != null) this.position.y = y;
    this.safe.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.root.rotation.y = facing;
  }

  // Running flat out: shy Grumblings (sparrows, grey ones) startle at it. On a keyboard that is Shift (the move
  // keys alone walk); on a gamepad the sprint button; on the touch stick, pushing it right out.
  get rushing() {
    return this.speed > 3.6;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  // Sit on a seat: front = centre of the seat's front edge, seat = seat-top height. stand() puts her back
  // on her feet, on the floor (by default a step in front of the seat, clear of the bench's collider).
  sitOn(front, facing, seat = 0.45) {
    this.teleport(this.h.seatRoot(front, facing, seat, _p), facing, false);
    this.seatFront = front.clone();
    this.setState('sit');
    this.h.overlayPlay(null);
  }
  stand(pos) {
    if (!pos && this.state === 'sit' && this.seatFront) {
      pos = this.seatFront.clone();
      pos.x += Math.sin(this.facing) * 0.35;
      pos.z += Math.cos(this.facing) * 0.35;
    }
    if (pos) this.teleport(pos, this.facing);
    this.seatFront = null;
    this.setState('move');
  }

  // Called by the soothing system when Calm runs out.
  overwhelm() {
    this.setState('overwhelmed');
    this.h.play('overwhelmed', 0.3);
    this.h.overlayPlay(null);
  }

  update(dt) {
    const input = G.input;
    this.stateTime += dt;
    if (this.state !== 'move') {
      // seated / overwhelmed / scripted pose: no physics, just animation
      this.velocity.set(0, 0, 0);
      this.speed = 0;
      this.humming = false;
      this.root.rotation.y = this.facing;
      this.animate(dt);
      return;
    }
    const locked = G.frozen;
    // in a conversation, she turns to face whoever is talking to her (the head look-at does the rest)
    if (locked && G.ui.dialogueOpen && this.speaker && !this.speaker.hidden && this.onGround && this.turnT <= 0) {
      const sp = this.speaker.position;
      const want = Math.atan2(sp.x - this.position.x, sp.z - this.position.z);
      if (Math.abs(angleTo(this.facing, want)) > 1.05 && Math.hypot(sp.x - this.position.x, sp.z - this.position.z) > 0.6) this.startTurn(want);
    }
    // camera-relative wish direction
    G.cam.basis(_f, _r);
    _m.set(0, 0, 0);
    if (!locked) _m.addScaledVector(_f, input.move.y).addScaledVector(_r, input.move.x);
    const amount = Math.min(1, _m.length());
    if (amount > 0.01) _m.divideScalar(Math.max(amount, 1e-6));

    this.humming = !locked && input.humHeld && this.canHum !== false;
    // a keyboard has no half-pressed keys: the move keys walk (the walk clip's brisk stroll), Shift runs.
    // Sticks are analog: up to an easy jog, and the sprint button runs.
    let top = amount * (input.device === 'keyboard' ? WALK : 3.2);
    if (input.sprintHeld && amount > 0.5) top = 4.7;
    if (this.humming) top = Math.min(top, 1.15);
    top *= this.moveScale;
    const accel = this.onGround ? 16 : 6;
    // turning in place: from a standstill, a big change of direction pivots on the spot first
    if (amount > 0.1 && this.turnT <= 0 && this.speed < 0.5 && this.onGround && !this.humming && !locked) {
      const want = Math.atan2(_m.x, _m.z);
      if (Math.abs(angleTo(this.facing, want)) > 1.75) this.startTurn(want);
    }
    if (this.turnT > 0) top = 0;
    const vx = _m.x * top,
      vz = _m.z * top;
    this.velocity.x += (vx - this.velocity.x) * Math.min(1, dt * accel * 0.6);
    this.velocity.z += (vz - this.velocity.z) * Math.min(1, dt * accel * 0.6);
    if (amount < 0.05 && this.onGround) {
      this.velocity.x *= Math.max(0, 1 - dt * 12);
      this.velocity.z *= Math.max(0, 1 - dt * 12);
    }
    // face the movement (or the soothing target while humming)
    let wantFacing = null;
    if (this.turnT > 0) {
      this.turnT -= dt;
      const k = 1 - Math.max(0, this.turnT) / TURN_TIME;
      this.facing = this.turnFrom + this.turnBy * k * k * (3 - 2 * k);
    } else if (this.humming && G.soothe?.target) {
      const t = G.soothe.target.position;
      wantFacing = Math.atan2(t.x - this.position.x, t.z - this.position.z);
    } else if (amount > 0.1) wantFacing = Math.atan2(_m.x, _m.z);
    if (wantFacing !== null) {
      const d = MathUtils.euclideanModulo(wantFacing - this.facing + Math.PI, Math.PI * 2) - Math.PI;
      this.facing += d * Math.min(1, dt * 12);
    }
    this.root.rotation.y = this.facing;

    // jump with coyote time and input buffering
    if (!locked && input.pressed('jump')) this.jumpBuffer = 0.14;
    this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.groundTime > -0.12 && !this.humming) {
      this.velocity.y = 4.4;
      this.jumpBuffer = 0;
      this.groundTime = -1;
      this.onGround = false;
      G.audio.play('jump');
    }
    this.velocity.y -= 13 * dt;
    if (this.onGround) {
      // Follow the ground: on a slope she rises or drops with it, so her pace over the ground is the same up
      // steps as on the flat, plus a little push down to stay on it. (It used to be a flat 2.5 m/s down, which
      // on a 30 degree ramp left a walk only 0.3 m/s of climb.)
      const n = this.groundN;
      this.velocity.y = -(n.x * this.velocity.x + n.z * this.velocity.z) / n.y - 1;
    }

    // integrate + collide in substeps
    const steps = dt > 1 / 45 ? 3 : 2;
    let grounded = false;
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.position.addScaledVector(this.velocity, h);
      if (!G.collision) continue;
      _seg.start.set(this.position.x, this.position.y + this.radius, this.position.z);
      _seg.end.set(this.position.x, this.position.y + this.height - this.radius, this.position.z);
      const before = _seg.start.y;
      const g = G.collision.collideCapsule(_seg, this.radius);
      const dy = _seg.start.y - before;
      // standing still on a slope: the ground pushes her out along its normal, a little downhill every step,
      // so she would creep down the stairs. Keep her where she is (only a real shove, from a wall, moves her).
      const creep = g && amount < 0.05 && Math.hypot(_seg.start.x - this.position.x, _seg.start.z - this.position.z) < 0.02;
      if (creep) _seg.start.set(this.position.x, _seg.start.y, this.position.z);
      this.position.set(_seg.start.x, _seg.start.y - this.radius, _seg.start.z);
      if (g) {
        grounded = true;
        this.groundN.copy(G.collision.groundNormal);
      }
      if (dy < -1e-4 && this.velocity.y > 0) this.velocity.y = 0; // head bump
    }
    const wasAir = !this.onGround;
    this.onGround = grounded;
    if (grounded) {
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (wasAir && this.airTime > 0.35) {
        this.landTimer = 0.28;
        G.audio.play('land');
        if (G.zone?.stepFx) G.fx.sparkles.emit(_foot.copy(this.position).setY(this.position.y + 0.04), 8, G.zone.stepFx, { speed: 0.9, up: 0.25, size: 0.18, life: 0.8, spread: 0.25 });
      }
      this.groundTime = Math.max(0, this.groundTime) + dt;
      this.airTime = 0;
      if (this.groundTime > 0.5 && this.position.y > (G.zone?.safeMinY ?? -Infinity)) this.safe.copy(this.position);
    } else {
      this.groundTime = Math.min(0, this.groundTime) - dt;
      this.airTime += dt;
    }
    // fell out of the world: back to the last safe spot
    if (this.position.y < (G.zone?.killY ?? -20)) {
      this.teleport(this.safe);
      G.events.emit('fell');
    }
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.animate(dt);
  }

  startTurn(want) {
    this.turnT = TURN_TIME;
    this.turnFrom = this.facing;
    this.turnBy = angleTo(this.facing, want);
  }

  animate(dt) {
    const h = this.h;
    this.landTimer -= dt;
    if (this.state !== 'move') this.turnT = 0;
    // look at the Grumbling she is soothing, or at whoever is talking to her
    const t = G.soothe?.target;
    if (!G.ui.dialogueOpen) this.speaker = null;
    const look = t ? _look.copy(t.position).setY(t.position.y + 0.3 * t.size) : this.speaker && !this.speaker.hidden ? this.speaker.h.worldBone('head', _look) : null;
    h.lookTarget = look;
    if (this.state === 'overwhelmed') {
      h.play('overwhelmed', 0.3);
    } else if (this.state === 'sit') {
      h.play('sit', 0.4);
    } else if (this.state === 'pose') {
      /* a script drives the clip */
    } else if (!this.onGround && this.airTime > 0.12) {
      h.play('air', 0.15);
    } else if (this.landTimer > 0 && this.speed < 1) {
      h.play('land', 0.08);
    } else if (this.turnT > 0) {
      h.play('turn', 0.1);
    } else if (this.speed < 0.2) {
      h.play('idle', 0.25);
    } else {
      const [clip, ts] = gaitFor(h, this.speed, h.base === h.actions.run);
      h.play(clip, 0.2, ts);
    }
    if (this.state === 'move') h.overlayPlay(this.humming ? 'hum' : this.overlayName || null, 0.25);
    h.update(dt);
    this.footsteps();
    this.updateDoudou(dt);
  }

  // Footsteps where the feet really land in the walk and run clips (Humanoid.gait): a soft step sound and,
  // in most zones, a little puff where the foot came down (zone.stepFx: dust, mist, a cool night puff).
  footsteps() {
    const h = this.h;
    const a = h.base;
    const clip = a === h.actions.walk ? 'walk' : a === h.actions.run ? 'run' : a === h.actions.turn ? 'turn' : null;
    if (!clip || !this.onGround || this.state !== 'move') return void (this.stepWas = null);
    const g = clip === 'turn' ? { plants: [0.25, 0.75] } : h.gait(clip);
    const ph = (a.time / a.getClip().duration) % 1;
    if (this.stepWas !== null && this.stepClip === clip) {
      g.plants.forEach((p, i) => {
        const crossed = this.stepWas <= ph ? this.stepWas < p && p <= ph : this.stepWas < p || p <= ph;
        if (crossed) this.step(clip === 'turn' ? i : p > 0.7 ? 1 : 0, clip === 'run');
      });
    }
    this.stepWas = ph;
    this.stepClip = clip;
  }
  step(foot, running) {
    G.audio.play('step');
    const fx = G.zone?.stepFx;
    if (!fx) return;
    this.h.worldBone(foot ? 'foot_R' : 'foot_L', _foot);
    _foot.y = this.position.y + 0.03;
    G.fx.sparkles.emit(_foot, running ? 3 : 2, fx, { speed: running ? 0.35 : 0.22, up: 0.18, size: running ? 0.16 : 0.12, life: 0.7, spread: 0.08 });
  }

  updateDoudou(dt) {
    const d = this.doudou;
    if (!d) return;
    // sleepy breathing; wide awake only for emergencies (ud.awake set by story/soothe)
    const s = d.userData;
    s.baseScale = s.baseScale || d.scale.x;
    const br = 1 + Math.sin(G.time * 2.1) * 0.035;
    d.scale.set(s.baseScale * (1 + (br - 1) * 0.6), s.baseScale * br, s.baseScale);
    if (s.eyes) s.eyes.scale.y = s.awake ? 3.2 : 1;
  }

  setCameraNear(near) {
    for (const m of this.h.meshes) m.visible = !near;
  }
}
