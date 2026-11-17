/**
 * Монитор кадров. Пишет СЫРЫЕ интервалы между кадрами (без ограничения dt — анимация использует ограниченный dt,
 * а здесь нужна правда о частоте кадров) и снимки счётчиков рендерера. Используется HUD (клавиша D),
 * режимом ?bench и браузерными тестами (window.tourb.perf).
 */
export class PerfMonitor {
  constructor(renderer, { maxFrames = 36000 } = {}) {
    this.renderer = renderer;
    this.dt = new Float32Array(maxFrames); // мс
    this.t = new Float32Array(maxFrames);  // мс от начала записи
    this.count = 0;
    this.t0 = performance.now();
    this.emaMs = 16.7;
    this.qualityLog = [];                  // [{t, level, density, pixelRatio, fps}]
    this.peakCalls = 0; this.peakTriangles = 0;
  }

  /** Пики draw calls и треугольников за кадр (вызывается после render). */
  notePeak() {
    const r = this.renderer.info.render;
    if (r.calls > this.peakCalls) this.peakCalls = r.calls;
    if (r.triangles > this.peakTriangles) this.peakTriangles = r.triangles;
  }

  reset() { this.count = 0; this.t0 = performance.now(); this.qualityLog.length = 0; this.peakCalls = 0; this.peakTriangles = 0; }

  frame(dtMs, now = performance.now()) {
    this.emaMs += (dtMs - this.emaMs) * 0.05;
    if (this.count < this.dt.length) { this.dt[this.count] = dtMs; this.t[this.count] = now - this.t0; this.count++; }
  }

  get fps() { return 1000 / this.emaMs; }

  /** Статистика по кадрам [from, to). */
  stats(from = 0, to = this.count) {
    const n = to - from;
    if (n < 5) return { frames: n };
    const a = Array.from(this.dt.subarray(from, to));
    const sorted = [...a].sort((x, y) => x - y);
    const sum = a.reduce((x, y) => x + y, 0), mean = sum / n;
    const median = sorted[n >> 1];
    const std = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const q = (p) => sorted[Math.min(n - 1, Math.floor(n * p))];
    const r = (v, d = 1) => +v.toFixed(d);
    return {
      frames: n, seconds: r(sum / 1000),
      avgFps: r(1000 / mean, 2), minFps: r(1000 / sorted[n - 1], 2), low1Fps: r(1000 / q(0.99), 2),
      medianMs: r(median), p95Ms: r(q(0.95)), p99Ms: r(q(0.99)), maxMs: r(sorted[n - 1]), stdevMs: r(std),
      jankFrames: a.filter((v) => v > 2 * median).length,        // кадры длиннее 2 медиан
      stalls250: a.filter((v) => v > 250).length,                // «зависания» дольше 250 мс
    };
  }

  /** Счётчики рендерера и памяти на текущий момент. */
  snapshot() {
    const i = this.renderer.info, m = performance.memory;
    return {
      calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
      geometries: i.memory.geometries, textures: i.memory.textures, programs: (i.programs ?? []).length,
      heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null,
      domNodes: document.getElementsByTagName('*').length,
    };
  }
}
