import * as THREE from 'three';

const _v = new THREE.Vector2();

const _maxPoint = new WeakMap();
/** Максимальный размер точки, который поддерживает GPU (gl_PointSize выше лимита обрезается драйвером: у части
 *  интегрированных и мобильных GPU он 64 px, у других — 256 и больше). Читается один раз на рендерер. */
export function maxPointSize(renderer) {
  if (!_maxPoint.has(renderer)) {
    const gl = renderer.getContext();
    _maxPoint.set(renderer, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)?.[1] ?? 64);
  }
  return _maxPoint.get(renderer);
}

/** Множитель размера точек (px на единицу мира на единице глубины) — одинаковый вид при любом разрешении.
 *  Заодно кладёт высоту буфера в out.height: размер спрайтов ограничивается долей высоты кадра, а не пикселями. */
export function pointScale(camera, renderer, out = {}) {
  renderer.getDrawingBufferSize(_v);
  out.height = _v.y;
  out.maxPoint = maxPointSize(renderer);
  out.scale = _v.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  return out.scale;
}

/** Детерминированный генератор (mulberry32): фильм выглядит одинаково при каждом запуске и записи. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Набор точек из любого 2D-рисунка (текст, иконка, контур карты): рисуем на canvas,
 * берём пиксели с alpha > 128. Именно так частицы «собирают» кнопки, карточки и логотип.
 * Возвращает Float32Array xyz в мировых координатах (центр в 0,0; ширина worldWidth).
 */
export function samplePointsFromCanvas(draw, { width = 512, height = 512, count = 4000, worldWidth = 4, z = 0, seed = 3 } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d', { willReadFrequently: true });
  draw(g, width, height);
  const data = g.getImageData(0, 0, width, height).data;
  const filled = [];
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) filled.push((i - 3) >> 2);
  const out = new Float32Array(count * 3);
  if (!filled.length) return out;
  const rand = rng(seed), s = worldWidth / width;
  for (let k = 0; k < count; k++) {
    const p = filled[(rand() * filled.length) | 0];
    const x = p % width, y = (p / width) | 0;
    out[k * 3] = (x - width / 2 + rand() - 0.5) * s;
    out[k * 3 + 1] = -(y - height / 2 + rand() - 0.5) * s;
    out[k * 3 + 2] = z + (rand() - 0.5) * 0.03;
  }
  return out;
}

export function randomCloud(count, radius = 6, seed = 11, center = [0, 0, 0]) {
  const rand = rng(seed), out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = radius * Math.cbrt(rand()), s = Math.sqrt(1 - u * u);
    out[i * 3] = center[0] + r * s * Math.cos(th);
    out[i * 3 + 1] = center[1] + r * u;
    out[i * 3 + 2] = center[2] + r * s * Math.sin(th);
  }
  return out;
}
