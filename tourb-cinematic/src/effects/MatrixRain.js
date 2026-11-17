import * as THREE from 'three';
import { pointScale, rng } from './util.js';

// Цифровой дождь: каждая «колонка» — цепочка точек-глифов. Всё анимируется на GPU
// (CPU только двигает uTime). Глифы: цифры, символы и кыргызские буквы Ң Ө Ү — не копия «Матрицы».
const GLYPHS = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F','{','}','<','>','/','+','=','#','T','O','U','R','Ң','Ө','Ү','$'];
const COLS = 8, ROWS = 4;

const VERT = /* glsl */`
  uniform float uTime, uScale, uSize, uMaxPx, uHeight, uSpacing, uTrail, uRange, uFarStart, uFarEnd, uOpacity, uGlyphs;
  attribute float aSpeed, aPhase, aIdx, aGlyph;
  varying float vBright, vGlyph, vHead;
  void main() {
    float fall = mod(uTime * aSpeed + aPhase * uRange, uRange);
    float y = uHeight * 0.5 - fall + aIdx * uSpacing;               // голова вверху, шлейф выше неё
    float edge = smoothstep(-uHeight * 0.5, -uHeight * 0.5 + 3.0, y) * (1.0 - smoothstep(uHeight * 0.5 - 3.0, uHeight * 0.5, y));
    vec4 mv = modelViewMatrix * vec4(position.x, y, position.z, 1.0);
    float trail = aIdx / uTrail;
    vHead = 1.0 - step(0.5, aIdx);
    vBright = (1.0 - trail) * (1.0 - trail) * edge * uOpacity * (1.0 - smoothstep(uFarStart, uFarEnd, -mv.z)) * smoothstep(2.5, 9.0, -mv.z) * (1.0 + vHead * 0.6);
    vGlyph = mod(aGlyph + floor(uTime * 1.5 + aPhase * 10.0), uGlyphs);
    if (vBright < 0.03) {                 // почти невидимая точка: выкидываем до растеризации
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;
    }
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * uScale / -mv.z, 0.0, uMaxPx);
  }`;

const FRAG = /* glsl */`
  uniform sampler2D uAtlas;
  uniform vec3 uColor, uHeadColor;
  uniform float uCols, uRows;
  varying float vBright, vGlyph, vHead;
  void main() {
    float g = floor(vGlyph);
    vec2 uv = vec2((mod(g, uCols) + gl_PointCoord.x) / uCols, 1.0 - (floor(g / uCols) + gl_PointCoord.y) / uRows);
    float a = texture2D(uAtlas, uv).a * vBright;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uColor, uHeadColor, vHead), a);
    #include <colorspace_fragment>
  }`;

function makeAtlas() {
  const cell = 64, c = document.createElement('canvas');
  c.width = cell * COLS; c.height = cell * ROWS;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `600 ${cell * 0.7}px ui-monospace, Consolas, "Courier New", monospace`;
  GLYPHS.forEach((ch, i) => g.fillText(ch, (i % COLS + 0.5) * cell, (Math.floor(i / COLS) + 0.5) * cell));
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

export class MatrixRain {
  /** area: [ширина, высота, глубина] объёма дождя в мировых единицах. */
  constructor({ columns = 260, trail = 12, area = [60, 36, 60], seed = 7, color = 0x35e08a, headColor = 0xd9fff0, opacity = 0, size = 0.42 } = {}) {
    this.columns = columns; this.trail = trail; this.density = 1; this._view = {};
    const n = columns * trail, rand = rng(seed);
    const pos = new Float32Array(n * 3), speed = new Float32Array(n), phase = new Float32Array(n), idx = new Float32Array(n), glyph = new Float32Array(n);
    for (let c = 0; c < columns; c++) {
      const x = (rand() - 0.5) * area[0], z = (rand() - 0.5) * area[2], sp = 3.5 + rand() * 6, ph = rand(), g0 = rand() * GLYPHS.length;
      for (let t = 0; t < trail; t++) {
        const i = c * trail + t;
        pos[i * 3] = x; pos[i * 3 + 2] = z;
        speed[i] = sp; phase[i] = ph; idx[i] = t; glyph[i] = (g0 + t * 7) % GLYPHS.length;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('aGlyph', new THREE.BufferAttribute(glyph, 1));

    const spacing = size * 1.15;
    this.uniforms = {
      uTime: { value: 0 }, uScale: { value: 800 }, uSize: { value: size }, uMaxPx: { value: 24 }, uHeight: { value: area[1] },
      uSpacing: { value: spacing }, uTrail: { value: trail }, uRange: { value: area[1] + trail * spacing },
      uFarStart: { value: area[2] * 0.45 }, uFarEnd: { value: area[2] * 0.9 }, uOpacity: { value: opacity }, uGlyphs: { value: GLYPHS.length },
      uAtlas: { value: makeAtlas() }, uColor: { value: new THREE.Color(color) }, uHeadColor: { value: new THREE.Color(headColor) },
      uCols: { value: COLS }, uRows: { value: ROWS },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; // позиции считаются в шейдере — bounding sphere бессмысленна
  }

  get object3D() { return this.points; }
  /** 0..1 — доля колонок, которые рисуются (колонки расположены случайно → равномерное прореживание). */
  setDensity(d) {
    this.density = Math.min(1, Math.max(0.05, d));
    this.points.geometry.setDrawRange(0, Math.floor(this.columns * this.density) * this.trail);
  }

  update(dt, camera, renderer) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uScale.value = pointScale(camera, renderer, this._view);
    this.uniforms.uMaxPx.value = Math.min(this._view.height * 0.03, this._view.maxPoint);  // ≤ 3 % высоты кадра и ≤ лимита GPU
    this.points.visible = this.uniforms.uOpacity.value > 0.01;  // невидимое не рисуем
  }
  dispose() { this.points.geometry.dispose(); this.material.dispose(); this.uniforms.uAtlas.value.dispose(); }
}
