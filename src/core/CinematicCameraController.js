import * as THREE from 'three';
import { gsap } from './gsap.js';

function toVector3(value, fallback, label) {
  if (value == null) return fallback.clone();
  if (value.isVector3) return value.clone();
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))
    return new THREE.Vector3(...value);
  throw new TypeError(`${label} must be a Vector3 or a three-number array`);
}

/** Deterministic camera choreography driven by the application's frame delta. */
export class CinematicCameraController {
  constructor(cameraController) {
    if (!cameraController?.camera) throw new TypeError('CinematicCameraController requires a CameraController');
    this.cameraController = cameraController;
    this.camera = cameraController.camera;
    this._timeline = null;
    this._state = null;
    this._elapsed = 0;
    this._duration = 0;
    this._active = false;
    this._held = false;
    this._paused = false;
    this._disposed = false;
  }

  animateTo(pose, { duration = 1, ease = 'sine.inOut' } = {}) {
    return this.playKeyframes([{ ...pose, duration, ease }]);
  }

  /**
   * Keyframes are sequential poses: each has an optional position, target, fov,
   * duration, and GSAP easing. Target interpolation provides smooth orientation changes.
   */
  playKeyframes(keyframes) {
    if (this._disposed) throw new Error('CinematicCameraController has been disposed');
    if (!Array.isArray(keyframes) || !keyframes.length) throw new TypeError('At least one camera keyframe is required');

    this.release();
    const position = this.camera.position.clone();
    const target = toVector3(this.cameraController.look, position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)), 'camera target');
    this._state = {
      x: position.x, y: position.y, z: position.z,
      tx: target.x, ty: target.y, tz: target.z,
      fov: this.camera.fov,
    };
    this._timeline = gsap.timeline({ paused: true });

    for (const [index, frame] of keyframes.entries()) {
      const duration = frame.duration ?? 1;
      if (!Number.isFinite(duration) || duration <= 0) throw new RangeError(`Camera keyframe ${index} duration must be greater than zero`);
      const vars = { duration, ease: frame.ease ?? 'sine.inOut' };
      if (frame.position != null) {
        const p = toVector3(frame.position, position, 'camera position');
        Object.assign(vars, { x: p.x, y: p.y, z: p.z });
      }
      if (frame.target != null) {
        const t = toVector3(frame.target, target, 'camera target');
        Object.assign(vars, { tx: t.x, ty: t.y, tz: t.z });
      }
      if (frame.fov != null) {
        if (!Number.isFinite(frame.fov) || frame.fov <= 0 || frame.fov >= 180)
          throw new RangeError(`Camera keyframe ${index} fov must be between 0 and 180 degrees`);
        vars.fov = frame.fov;
      }
      this._timeline.to(this._state, { ...vars, onUpdate: () => this._apply() }, '>');
    }

    this._elapsed = 0;
    this._duration = this._timeline.duration();
    this._active = true;
    this._held = false;
    this._paused = false;
    this._apply();
    return this;
  }

  update(dt) {
    if (this._active && !this._paused && dt > 0) {
      this._elapsed = Math.min(this._duration, this._elapsed + dt);
      this._timeline.time(this._elapsed);
      if (this._elapsed >= this._duration) {
        this._active = false;
        this._held = true;
      }
    } else if (this._held) {
      this._apply();
    }
  }

  _apply() {
    if (!this._state) return;
    const s = this._state, c = this.camera, target = this.cameraController.look;
    c.position.set(s.x, s.y, s.z);
    c.lookAt(s.tx, s.ty, s.tz);
    if (c.fov !== s.fov) { c.fov = s.fov; c.updateProjectionMatrix(); }
    target.set(s.tx, s.ty, s.tz);
    this.cameraController.pos.copy(c.position);
  }

  cancel({ release = false } = {}) {
    const hadAnimation = this._active;
    this._timeline?.kill();
    this._timeline = null;
    this._active = false;
    this._paused = false;
    this._held = !release && this._state !== null;
    return hadAnimation;
  }

  release() { return this.cancel({ release: true }); }

  pause() {
    if (!this._active || this._paused) return false;
    this._paused = true;
    return true;
  }

  resume() {
    if (!this._active || !this._paused) return false;
    this._paused = false;
    return true;
  }

  suspend() {
    if (this._disposed) throw new Error('CinematicCameraController has been disposed');
    const snapshot = {
      timeline: this._timeline,
      state: this._state,
      elapsed: this._elapsed,
      duration: this._duration,
      active: this._active,
      held: this._held,
      paused: this._paused,
    };
    this._timeline?.pause();
    this._timeline = null;
    this._state = null;
    this._elapsed = 0;
    this._duration = 0;
    this._active = false;
    this._held = false;
    this._paused = false;
    return snapshot;
  }

  restore(snapshot) {
    if (this._disposed) throw new Error('CinematicCameraController has been disposed');
    if (!snapshot) return false;
    this.release();
    this._timeline = snapshot.timeline;
    this._state = snapshot.state;
    this._elapsed = snapshot.elapsed;
    this._duration = snapshot.duration;
    this._active = snapshot.active;
    this._held = snapshot.held;
    this._paused = snapshot.paused;
    if (this._held || this._active) this._apply();
    return true;
  }

  getState() {
    return {
      active: this._active,
      held: this._held,
      paused: this._paused,
      elapsed: this._elapsed,
      duration: this._duration,
      progress: this._duration ? this._elapsed / this._duration : 0,
    };
  }

  dispose() {
    this.release();
    this._state = null;
    this._disposed = true;
  }
}
