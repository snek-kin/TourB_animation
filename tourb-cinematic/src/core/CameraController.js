import * as THREE from 'three';
import { gsap } from './gsap.js';

/**
 * Автоматическая камера «на рельсах».
 * Принципы (из требований брифа):
 *  - позиция и точка взгляда идут по сплайнам Catmull-Rom (центрипетальный — без петель и рывков);
 *  - между «целью» и реальной камерой стоит критически демпфированное сглаживание —
 *    резких смен направления и ускорений нет;
 *  - камера не получает крен: up всегда (0,1,0) → нестабильной ориентации не бывает;
 *  - защита от пролёта сквозь геометрию: минимальная высота над рельефом + выталкивание из AABB-коллайдеров.
 */
export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3(0, 0, -1);
    this.progress = 0;
    this.smoothing = 5;               // 1/сек; больше — жёстче следование за рельсой
    this.clearance = 1.0;             // мин. высота над groundHeightAt
    this.radius = 1.2;                // «толщина» камеры для коллайдеров
    this.groundHeightAt = null;       // (x, z) => y
    this.colliders = [];              // THREE.Box3[]
    this.stats = { speed: 0, accel: 0 };
    this._curveP = null; this._curveT = null;
    this._tp = new THREE.Vector3(); this._tl = new THREE.Vector3();
    this._prevPos = new THREE.Vector3(); this._prevSpeed = 0;
    this._tween = null;
  }

  /** positions / targets: массивы [x,y,z] или Vector3 (одинаковой длины не обязательно). */
  setPath({ positions, targets }) {
    const v = (a) => a.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
    this._curveP = new THREE.CatmullRomCurve3(v(positions), false, 'centripetal');
    this._curveT = new THREE.CatmullRomCurve3(v(targets), false, 'centripetal');
    this.setProgress(0);
    this.snap();
    return this;
  }

  setProgress(p) {
    this.progress = THREE.MathUtils.clamp(p, 0, 1);
    if (!this._curveP) return;
    this._curveP.getPointAt(this.progress, this._tp);
    this._curveT.getPointAt(this.progress, this._tl);
  }

  /** Мгновенно поставить камеру на текущую рельсу (без сглаживания). */
  snap() {
    this.pos.copy(this._tp); this.look.copy(this._tl);
    this._safety();
    this._apply();
  }

  /** Проиграть рельсу за duration секунд. Возвращает GSAP-твин. */
  play(duration, { ease = 'sine.inOut', delay = 0 } = {}) {
    this._tween?.kill();
    const state = { p: this.progress };
    this._tween = gsap.to(state, {
      p: 1, duration, ease, delay,
      onUpdate: () => this.setProgress(state.p),
    });
    return this._tween;
  }

  /** Добавить проход по рельсе в GSAP-таймлайн сцены — камера строго следует мастер-времени сцены. */
  addToTimeline(tl, { duration, at = 0, ease = 'sine.inOut' }) {
    const st = { p: 0 };
    tl.to(st, { p: 1, duration, ease, onUpdate: () => this.setProgress(st.p) }, at);
    return this;
  }

  update(dt) {
    if (!this._curveP || dt <= 0) return;
    const a = 1 - Math.exp(-this.smoothing * dt);
    this.pos.lerp(this._tp, a);
    this.look.lerp(this._tl, a);
    this._safety();
    this._apply();
    const speed = this.pos.distanceTo(this._prevPos) / dt;
    this.stats.accel = Math.abs(speed - this._prevSpeed) / dt;
    this.stats.speed = speed;
    this._prevSpeed = speed;
    this._prevPos.copy(this.pos);
  }

  _safety() {
    if (this.groundHeightAt) {
      const min = this.groundHeightAt(this.pos.x, this.pos.z) + this.clearance;
      if (this.pos.y < min) this.pos.y = min;
    }
    for (const box of this.colliders) this._pushOut(box);
  }

  _pushOut(box) {
    const p = this.pos, r = this.radius;
    if (p.x < box.min.x - r || p.x > box.max.x + r ||
        p.y < box.min.y - r || p.y > box.max.y + r ||
        p.z < box.min.z - r || p.z > box.max.z + r) return;
    // вытолкнуть по оси с наименьшим проникновением
    const d = [
      [p.x - (box.min.x - r), 'x', -1], [(box.max.x + r) - p.x, 'x', 1],
      [p.y - (box.min.y - r), 'y', -1], [(box.max.y + r) - p.y, 'y', 1],
      [p.z - (box.min.z - r), 'z', -1], [(box.max.z + r) - p.z, 'z', 1],
    ].sort((m, n) => m[0] - n[0])[0];
    const [, axis, sign] = d;
    p[axis] = sign < 0 ? box.min[axis] - r : box.max[axis] + r;
  }

  _apply() {
    this.camera.position.copy(this.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.look);
  }

  /** Сбросить рельсу, коллайдеры и рельеф — вызывается между сценами, чтобы ничего не «протекало». */
  reset() {
    this._tween?.kill();
    this._curveP = this._curveT = null;
    this.colliders = [];
    this.groundHeightAt = null;
    this.clearance = 1.0;
    this.progress = 0;
  }

  dispose() { this._tween?.kill(); }
}
