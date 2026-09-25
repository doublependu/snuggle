// Xiao Pei: capsule character controller against the zone BVH, animation state and Doudou riding in
// her hood (her braid swings on the Humanoid's spring chains).
import { Line3, MathUtils, Vector3 } from 'three';
import { G } from '../game.js';

const _f = new Vector3();
const _r = new Vector3();
const _m = new Vector3();
const _seg = new Line3();
const _p = new Vector3();

// Put Doudou in Xiao Pei's hood. Newer models carry a seat_doudou bone (where his base sits);
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
    this.stepPhase = 0;
    this.moveScale = 1;
    this.root.name = 'xiaopei';
    // Doudou sleeps in the hood
    this.doudou = doudou;
    if (doudou) seatDoudou(humanoid, doudou);
    // her face follows the dialogue like the NPCs'
    G.events.on('say', ({ who, face }) => {
      if (who === 'xiaopei') humanoid.face?.set(face || 'neutral');
      humanoid.face?.talk(who === 'xiaopei');
    });
    G.events.on('typed', () => humanoid.face?.talk(false));
    G.events.on('said', () => humanoid.face?.set('neutral'));
  }

  teleport(p, facing = this.facing) {
    this.position.copy(p);
    this.safe.copy(p);
    this.velocity.set(0, 0, 0);
    this.facing = facing;
    this.root.rotation.y = facing;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  // Sit on a seat marker (height in metres); stand() puts her back on her feet.
  sitOn(pos, facing, seat = 0.5) {
    this.teleport(pos, facing);
    this.position.y += seat - (this.h.clipHipsY('sit') - 0.11);
    this.setState('sit');
    this.h.overlayPlay(null);
  }
  stand(pos) {
    if (pos) this.teleport(pos, this.facing);
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
    // camera-relative wish direction
    G.cam.basis(_f, _r);
    _m.set(0, 0, 0);
    if (!locked) _m.addScaledVector(_f, input.move.y).addScaledVector(_r, input.move.x);
    const amount = Math.min(1, _m.length());
    if (amount > 0.01) _m.divideScalar(Math.max(amount, 1e-6));

    this.humming = !locked && input.humHeld && this.canHum !== false;
    let top = amount * 3.2;
    if (input.sprintHeld && amount > 0.5) top = 4.7;
    if (this.humming) top = Math.min(top, 1.15);
    top *= this.moveScale;
    const accel = this.onGround ? 16 : 6;
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
    if (this.humming && G.soothe?.target) {
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
    if (this.onGround && this.velocity.y < 0) this.velocity.y = -2.5;

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
      this.position.set(_seg.start.x, _seg.start.y - this.radius, _seg.start.z);
      if (g) grounded = true;
      if (dy < -1e-4 && this.velocity.y > 0) this.velocity.y = 0; // head bump
    }
    const wasAir = !this.onGround;
    this.onGround = grounded;
    if (grounded) {
      if (this.velocity.y < 0) this.velocity.y = 0;
      if (wasAir && this.airTime > 0.35) {
        this.landTimer = 0.28;
        G.audio.play('land');
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

  animate(dt) {
    const h = this.h;
    this.landTimer -= dt;
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
    } else if (this.speed < 0.2) {
      h.play('idle', 0.25);
    } else if (this.speed < 2.3) {
      h.play('walk', 0.2, MathUtils.clamp(this.speed / 0.95, 0.7, 2.4));
    } else {
      h.play('run', 0.2, MathUtils.clamp(this.speed / 2.2, 1, 2.1));
    }
    if (this.state === 'move') h.overlayPlay(this.humming ? 'hum' : this.overlayName || null, 0.25);
    // footsteps
    if (this.onGround && this.speed > 0.5 && this.state === 'move') {
      this.stepPhase += dt * this.speed * 1.6;
      if (this.stepPhase > 1) {
        this.stepPhase = 0;
        G.audio.play('step');
      }
    }
    h.update(dt);
    this.updateDoudou(dt);
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
