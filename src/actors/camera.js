// Third-person spring-arm camera: orbit with mouse / right stick / touch drag, BVH collision so it
// never clips into walls, soft framing of the soothing target, and scripted shots for cutscenes.
import { MathUtils, Vector3 } from 'three';
import { G } from '../game.js';

const _dir = new Vector3();
const _t = new Vector3();
const _p = new Vector3();

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.distance = 4.2;
    this.minDist = 1.4;
    this.maxDist = 6;
    this.curDist = 4.2;
    this.target = new Vector3();
    this.focus = null; // Vector3 of the soothing target
    this.idleLook = 0;
    this.shot = null;
    this.shake = 0;
    this.heightOffset = 1.05;
  }

  snapBehind(player) {
    this.yaw = player.facing + Math.PI;
    this.target.copy(player.position).y += this.heightOffset;
    this.curDist = this.distance;
    this.update(0, player, true);
  }

  // Scripted framing: from (optional) position looking at `look`; call clearShot() to return control.
  setShot(pos, look, blend = 1.2) {
    this.shot = { pos: pos.clone(), look: look.clone(), blend, t: 0, fromPos: this.camera.position.clone(), fromLook: this.lookAt?.clone() || look.clone() };
  }
  clearShot() {
    this.shot = null;
  }

  update(dt, player, force = false) {
    const input = G.input;
    const cam = this.camera;
    if (this.shot) {
      const s = this.shot;
      s.t = Math.min(1, s.t + dt / s.blend);
      const k = s.t * s.t * (3 - 2 * s.t);
      cam.position.lerpVectors(s.fromPos, s.pos, k);
      _t.lerpVectors(s.fromLook, s.look, k);
      cam.lookAt(_t);
      this.lookAt = _t.clone();
      return;
    }
    if (!G.frozen && !G.paused) {
      const d = input.lookDelta();
      this.yaw -= d.x;
      this.pitch = MathUtils.clamp(this.pitch + d.y, -0.3, 1.15);
      const looking = Math.abs(d.x) + Math.abs(d.y) > 0.0005;
      this.idleLook = looking ? 0 : this.idleLook + dt;
      // auto-recentre behind the player for stick / touch users who aren't steering the camera
      if (input.device !== 'keyboard' && this.idleLook > 1.2 && player.speed > 1) {
        const want = player.facing + Math.PI;
        let dy = MathUtils.euclideanModulo(want - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
        this.yaw += dy * Math.min(1, dt * 1.2);
        this.pitch += (0.3 - this.pitch) * Math.min(1, dt * 0.8);
      }
    }
    // follow target with a little lag; frame the soothing target when there is one
    _t.copy(player.position);
    _t.y += this.heightOffset;
    let want = this.distance;
    if (this.focus) {
      _t.lerp(_p.copy(this.focus).setY(Math.max(this.focus.y, _t.y - 0.3)), 0.35);
      want += 0.8;
    }
    if (force) this.target.copy(_t);
    else this.target.lerp(_t, 1 - Math.exp(-dt * 10));

    _dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const hit = G.collision ? G.collision.raycast(this.target, _dir, want + 0.3) : Infinity;
    const allowed = Math.max(this.minDist * 0.5, Math.min(want, hit - 0.3));
    // pull in fast, ease back out slowly
    this.curDist = allowed < this.curDist || force ? allowed : this.curDist + (allowed - this.curDist) * Math.min(1, dt * 2.5);
    cam.position.copy(this.target).addScaledVector(_dir, this.curDist);
    if (this.shake > 0 && !G.save?.settings.reducedMotion) {
      this.shake = Math.max(0, this.shake - dt);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.1;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.1;
    }
    cam.lookAt(this.target);
    this.lookAt = this.target.clone();
    // fade the player out if the camera is squeezed right into her
    player.setCameraNear?.(this.curDist < 0.9);
  }

  // Horizontal forward / right vectors for camera-relative movement.
  basis(forward, right) {
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
