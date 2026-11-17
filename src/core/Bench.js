/**
 * Замер для РЕАЛЬНОГО железа: открыть index.html?bench (60 с) или ?bench=30 в обычном браузере с аппаратным ускорением.
 * Фильм крутится без автоснижения качества. Первые 2 секунды не считаются (компиляция, прогрев GPU).
 * Отчёт честно говорит, программный ли рендер (тогда FPS недействителен), и показывает: средний/минимальный FPS,
 * «1 % low», стабильность кадра, пики draw calls, рост ресурсов, зависания. Результат: окно на экране,
 * console.table и window.__bench / window.__benchResult.
 */
const WARMUP_SEC = 2;
const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render|microsoft basic/i;

export function startBench(app, seconds = 60, { onDone } = {}) {
  const perf = app.perf, gl = app.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'не удалось определить';
  app.hud.notice(`Замер ${seconds} с (+${WARMUP_SEC} с прогрев)… не трогайте окно`, 'ok');

  setTimeout(() => {
    perf.reset();
    const startSnap = perf.snapshot(), windows = [];
    let last = 0;
    const timer = setInterval(() => {
      const s = app.scenes.current, st = perf.stats(last, perf.count);
      last = perf.count;
      windows.push({ t: (windows.length + 1) * 2, ...st, ...perf.snapshot(), scene: s?.id, sceneT: s ? +s.elapsed.toFixed(1) : 0,
                     pixelRatio: +app.pixelRatio.toFixed(2), qualityLevel: app.quality.level });
      if ((windows.length) * 2 >= seconds) { clearInterval(timer); finish(startSnap, windows); }
    }, 2000);
  }, WARMUP_SEC * 1000);

  function finish(startSnap, windows) {
    const overall = perf.stats(), n = overall.frames ?? 0, third = Math.floor(n / 3);
    const endSnap = perf.snapshot(), software = SOFTWARE_GPU.test(gpu);
    const thirdFps = (a, b) => perf.stats(a, b).avgFps ?? null;
    const report = {
      environment: {
        gpu, software, userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio, viewport: [innerWidth, innerHeight],
        canvas: [app.canvas.width, app.canvas.height], antialias: app.antialias, pixelRatioStart: +app.pixelRatioStart.toFixed(2),
        pixelRatioEnd: +app.pixelRatio.toFixed(2), adaptiveQuality: app.adaptive, three: 'r187',
      },
      seconds, overall, fpsFirstThird: thirdFps(0, third), fpsLastThird: thirdFps(n - third, n),
      peaks: { drawCalls: perf.peakCalls, triangles: perf.peakTriangles },
      startSnapshot: startSnap, endSnapshot: endSnap,
      growth: { geometries: endSnap.geometries - startSnap.geometries, textures: endSnap.textures - startSnap.textures,
                programs: endSnap.programs - startSnap.programs, domNodes: endSnap.domNodes - startSnap.domNodes,
                heapMB: startSnap.heapMB != null ? +(endSnap.heapMB - startSnap.heapMB).toFixed(1) : null },
      qualityChanges: perf.qualityLog, windows, verdict: verdict(overall, software),
    };
    window.__bench = window.__benchResult = report;
    console.table({ gpu, software, ...overall, peakCalls: perf.peakCalls, peakTriangles: perf.peakTriangles });
    onDone?.(report);
  }
}

function verdict(o, software) {
  if (software) return 'ВНИМАНИЕ: программный рендер (нет аппаратного ускорения) — FPS НЕ показателен, замер недействителен.';
  if (!o.avgFps) return 'мало данных';
  const ok = o.avgFps >= 50 && o.low1Fps >= 30;
  return `${ok ? 'ЦЕЛЬ ДОСТИГНУТА' : 'ЦЕЛЬ НЕ ДОСТИГНУТА'}: средний ${o.avgFps} FPS (цель ≥ 50), «1% low» ${o.low1Fps} (цель ≥ 30), зависаний >250 мс: ${o.stalls250}`;
}
