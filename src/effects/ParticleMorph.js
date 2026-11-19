import * as THREE from 'three';
import { pointScale, rng, randomCloud } from './util.js';

// Частицы, которые организованно перетекают из облака в форму (карточка, иконка, карта…).
// Траектория каждой частицы — квадратичная кривая Безье с индивидуальным изгибом, а старт
// задерживается по x-координате цели: интерфейс «собирается» слева направо, а не вспыхивает.
// Переход к новой форме: morphTo(newTargets) — частицы стартуют из ТЕКУЩЕЙ формы (без скачка).
const VERT = /* glsl */`
  uniform float uProgress, uScale, uSize, uMaxPx, uTime, uWobble;
  attribute vec3 aStart, aTarget, aCurve;
  attribute float aDelay, aSeed;
  varying float vMix, vAlpha;
  float easeInOut(float x) { return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
  void main() {
    float t = clamp((uProgress - aDelay * 0.45) / 0.55, 0.0, 1.0);
    float e = easeInOut(t);
    vec3 mid = (aStart + aTarget) * 0.5 + aCurve;
    vec3 p = (1.0 - e) * (1.0 - e) * aStart + 2.0 * (1.0 - e) * e * mid + e * e * aTarget;
    p += vec3(sin(uTime * 1.3 + aSeed * 6.28), cos(uTime * 1.1 + aSeed * 12.5), sin(uTime * 0.9 + aSeed * 9.1)) * uWobble * (1.0 - e * 0.85);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * uScale / -mv.z, 1.0, uMaxPx);
    vMix = e; vAlpha = mix(0.45, 1.0, e);
  }`;
const FRAG = /* glsl */`
  uniform vec3 uColorA, uColorB;
  uniform float uOpacity;
  varying float vMix, vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d) * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uColorA, uColorB, smoothstep(0.2, 1.0, vMix)), a);
    #include <colorspace_fragment>
  }`;

export class ParticleMorph {
  constructor({ count = 4000, spread = 7, seed = 5, colorA = 0x35e08a, colorB = 0xdbe9ff, size = 0.045, wobble = 0.02 } = {}) {
    this.count = count; this.seed = seed; this.density = 1; this._view = {};
    const rand = rng(seed + 100);
    const geo = new THREE.BufferGeometry();
    this.aStart = new Float32Array(randomCloud(count, spread, seed));
    this.aTarget = new Float32Array(randomCloud(count, spread, seed + 1));
    this.aCurve = new Float32Array(count * 3);
    this.aDelay = new Float32Array(count);
    this.aSeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.aCurve.set([(rand() - 0.5) * spread * 0.6, (rand() - 0.5) * spread * 0.6, (rand() - 0.5) * spread * 0.6], i * 3);
      this.aSeed[i] = rand();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // фиктивный, позиции считает шейдер
    this._attr = {
      aStart: new THREE.BufferAttribute(this.aStart, 3), aTarget: new THREE.BufferAttribute(this.aTarget, 3),
      aCurve: new THREE.BufferAttribute(this.aCurve, 3), aDelay: new THREE.BufferAttribute(this.aDelay, 1),
      aSeed: new THREE.BufferAttribute(this.aSeed, 1),
    };
    for (const [k, a] of Object.entries(this._attr)) geo.setAttribute(k, a);
    this.uniforms = {
      uProgress: { value: 0 }, uScale: { value: 800 }, uSize: { value: size }, uMaxPx: { value: 16 }, uTime: { value: 0 }, uWobble: { value: wobble },
      uColorA: { value: new THREE.Color(colorA) }, uColorB: { value: new THREE.Color(colorB) }, uOpacity: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this._recomputeDelay();
  }

  get object3D() { return this.points; }

  _recomputeDelay() {
    const rand = rng(this.seed + 200);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < this.count; i++) { const x = this.aTarget[i * 3]; if (x < min) min = x; if (x > max) max = x; }
    const span = Math.max(1e-3, max - min);
    for (let i = 0; i < this.count; i++) this.aDelay[i] = 0.75 * ((this.aTarget[i * 3] - min) / span) + 0.25 * rand();
    this._attr.aDelay.needsUpdate = true;
  }

  /** Задать форму сразу (progress → 1 покажет её). */
  setTargets(targets) {
    if (targets.length !== this.count * 3) throw new Error(`ParticleMorph: ожидалось ${this.count * 3} чисел, получено ${targets.length}`);
    this.aTarget.set(targets);
    this._attr.aTarget.needsUpdate = true;
    this._recomputeDelay();
  }

  /** Перейти к новой форме из текущей: старт = прежняя цель, progress сбрасывается в 0 (дальше его ведёт GSAP). */
  morphTo(targets) {
    this.aStart.set(this.aTarget);
    this._attr.aStart.needsUpdate = true;
    this.setTargets(targets);
    this.uniforms.uProgress.value = 0;
  }

  /** 0..1 — доля частиц; порядок частиц случаен, поэтому префикс — равномерная выборка формы. */
  setDensity(d) {
    this.density = Math.min(1, Math.max(0.05, d));
    this.points.geometry.setDrawRange(0, Math.floor(this.count * this.density));
  }

  update(dt, camera, renderer, elapsed = null) {
    this.uniforms.uTime.value = Number.isFinite(elapsed) ? elapsed : this.uniforms.uTime.value + dt;
    this.uniforms.uScale.value = pointScale(camera, renderer, this._view);
    this.uniforms.uMaxPx.value = Math.min(this._view.height * 0.02, this._view.maxPoint);
    this.points.visible = this.uniforms.uOpacity.value > 0.01;
  }
  dispose() { this.points.geometry.dispose(); this.material.dispose(); }
}
