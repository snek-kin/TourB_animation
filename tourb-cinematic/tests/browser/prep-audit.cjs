#!/usr/bin/env node
/**
 * Браузерный аудит TourB Cinematic (Playwright + Chromium).
 * Запуск:  node browser-audit.cjs <папка-проекта> [--seconds 60] [--restarts 8] [--out report.json] [--w 1280 --h 720] [--gpu]
 * Без --gpu рендер программный (SwiftShader): FPS при этом НЕ показатель реального железа,
 * но ошибки консоли, 404, компиляция шейдеров, рост ресурсов и дубли циклов видны полностью.
 * С --gpu запускается без флагов SwiftShader — для обычного ПК с видеокартой.
 */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Не найден пакет playwright. Установите один раз:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const root = path.resolve(argv[0] && !argv[0].startsWith('--') ? argv[0] : path.join(__dirname, '..'));
const SECONDS = +arg('seconds', 60), RESTARTS = +arg('restarts', 8);
const W = +arg('w', 1280), H = +arg('h', 720), OUT = arg('out', null), GPU = argv.includes('--gpu');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(root, rel === '/' ? 'index.html' : rel);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('not found'); return; }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const args = GPU ? ['--enable-precise-memory-info'] :
    ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
  const browser = await chromium.launch({ args });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();

  const log = { console: [], pageErrors: [], badResponses: [], failedRequests: [], allRequests: 0 };
  page.on('console', (m) => log.console.push({ type: m.type(), text: m.text().slice(0, 600) }));
  page.on('pageerror', (e) => log.pageErrors.push(String(e.stack ?? e).slice(0, 800)));
  page.on('response', (r) => { log.allRequests++; if (r.status() >= 400) log.badResponses.push({ status: r.status(), url: r.url().replace(base, '') }); });
  page.on('requestfailed', (r) => log.failedRequests.push({ url: r.url().replace(base, ''), err: r.failure()?.errorText }));

  // Считаем, сколько rAF-колбэков исполняется в одном кадре (дубли циклов дадут рост числа).
  await page.addInitScript(() => {
    const orig = window.requestAnimationFrame.bind(window);
    const perFrame = new Map(); window.__rafMax = 0; window.__rafLog = [];
    window.requestAnimationFrame = (cb) => orig((ts) => {
      const n = (perFrame.get(ts) ?? 0) + 1; perFrame.set(ts, n);
      if (perFrame.size > 4) perFrame.delete(perFrame.keys().next().value);
      window.__rafMax = Math.max(window.__rafMax, n);
      cb(ts);
    });
  });

  const t0 = Date.now();
  await page.goto(`${base}/index.html?debug`, { waitUntil: 'load' });
  const startBtn = page.locator('#start');
  await startBtn.waitFor({ state: 'visible', timeout: 120000 });
  const loadMs = Date.now() - t0;
  const preStart = { console: log.console.length, bad: log.badResponses.length };

  const env = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: !!gl, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, ua: navigator.userAgent,
             three: window.tourb?.renderer?.info ? 'ok' : 'n/a' };
  });

  // Инструментация рендера: время кадра, камера, ресурсы.
  await page.evaluate(() => {
    const app = window.tourb, r = app.renderer, orig = r.render.bind(r);
    window.__frames = [];
    r.render = (s, c) => {
      const t = performance.now(), sc = app.scenes.current;
      const e = c.matrixWorld.elements;
      window.__frames.push({ t, el: sc ? sc.elapsed : -1, id: sc?.id, px: c.position.x, py: c.position.y, pz: c.position.z,
        roll: Math.asin(Math.max(-1, Math.min(1, e[1]))), // y-компонента «правого» вектора камеры = крен
        calls: r.info.render.calls, tris: r.info.render.triangles });
      if (window.__frames.length > 20000) window.__frames.shift();
      return orig(s, c);
    };
    window.__samples = [];
    window.__sampler = setInterval(() => {
      const i = r.info, sc = app.scenes.current;
      window.__samples.push({ t: performance.now(), fps: app._fps.value, pr: app.pixelRatio, calls: i.render.calls, tris: i.render.triangles,
        geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs?.length ?? null, el: sc?.elapsed ?? -1,
        heap: performance.memory?.usedJSHeapSize ?? null, gsapChildren: window.gsap?.globalTimeline.getChildren(true, true, true).length ?? null });
    }, 1000);
  });

  await startBtn.click();
  await sleep(SECONDS * 1000);

  // Перезапуски сцены (создать → удалить) — рост ресурсов и циклов.
  const restarts = [];
  const snap = async () => { await page.evaluate(() => window.tourb.scenes.seek(22)); await sleep(800); return page.evaluate(() => { const i = window.tourb.renderer.info;
    return { geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs?.length ?? null,
             heap: performance.memory?.usedJSHeapSize ?? null, gsapChildren: window.gsap?.globalTimeline.getChildren(true, true, true).length ?? null,
             rafMax: window.__rafMax }; }); };
  restarts.push({ n: 0, ...(await snap()) });
  for (let k = 1; k <= RESTARTS; k++) {
    await page.evaluate(() => window.tourb.scenes.goTo(0, { transition: 'dip' }));
    await page.waitForFunction(() => !window.tourb.scenes.busy, null, { timeout: 60000 });
    await sleep(1500);
    restarts.push({ n: k, ...(await snap()) });
  }

  const data = await page.evaluate(() => { clearInterval(window.__sampler);
    return { frames: window.__frames, samples: window.__samples, rafMax: window.__rafMax,
             cards: window.tourb.scenes.current?.cards?.map((c) => [c.position.x, c.position.y, c.position.z]) ?? [],
             markers: window.tourb.scenes.current?.markers?.map((c) => [c.position.x, c.position.y, c.position.z]) ?? [],
             pixelRatio: window.tourb.pixelRatio, assetErrors: window.tourb.assets.errors,
             missing: [...window.tourb.assets.missing], manifestKeys: Object.keys(window.tourb.assets.manifest).length }; });
  if (OUT) fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  await page.screenshot({ path: OUT ? OUT.replace(/\.json$/, '.png') : 'audit.png' });

  // ---- анализ кадров ----
  const fr = data.frames;
  const dts = []; for (let i = 1; i < fr.length; i++) { const d = fr[i].t - fr[i - 1].t; if (d < 2000) dts.push(d); }
  const fpsOf = (a) => a.length ? 1000 / (a.reduce((s, x) => s + x, 0) / a.length) : null;
  const third = Math.floor(dts.length / 3);
  // камера: скорость/ускорение по ВРЕМЕНИ СЦЕНЫ в окнах ≥0.25 с (покадровая разность шумит), в пределах одного прогона
  const WIN = 0.25;
  let maxV = 0, maxA = 0, jumps = 0, maxRoll = 0, minCard = Infinity, minY = Infinity, prevV = null, anchor = null;
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i], de = b.el - a.el;
    maxRoll = Math.max(maxRoll, Math.abs(b.roll)); minY = Math.min(minY, b.py);
    for (const c of data.cards) minCard = Math.min(minCard, Math.hypot(b.px - c[0], b.py - c[1], b.pz - c[2]));
    if (de <= 0 || de > 0.5) { prevV = null; anchor = null; continue; }
    if (Math.hypot(b.px - a.px, b.py - a.py, b.pz - a.pz) / de > 40) jumps++; // скачок позиции между соседними кадрами
    if (!anchor) { anchor = b; continue; }
    const w = b.el - anchor.el;
    if (w >= WIN) {
      const v = Math.hypot(b.px - anchor.px, b.py - anchor.py, b.pz - anchor.pz) / w;
      maxV = Math.max(maxV, v);
      if (prevV != null) maxA = Math.max(maxA, Math.abs(v - prevV) / w);
      prevV = v; anchor = b;
    }
  }
  const S = data.samples;
  const report = {
    when: new Date().toISOString(), mode: GPU ? 'аппаратный (--gpu)' : 'программный SwiftShader (FPS не показателен)', viewport: `${W}x${H}`,
    env, loadMs, requestCount: log.allRequests,
    errors: {
      consoleErrors: log.console.filter((m) => m.type === 'error'),
      consoleWarnings: log.console.filter((m) => m.type === 'warning'),
      consoleInfoLog: log.console.filter((m) => !['error', 'warning'].includes(m.type)).map((m) => m.text),
      pageErrors: log.pageErrors, http4xx5xx: log.badResponses, failedRequests: log.failedRequests,
      shaderErrors: log.console.filter((m) => /shader|glsl|webglprogram|compile/i.test(m.text)),
      deprecations: log.console.filter((m) => /deprecat/i.test(m.text)),
      errorsBeforeStartClick: preStart,
    },
    assets: { manifestKeys: data.manifestKeys, missingReported: data.missing, loaderErrors: data.assetErrors },
    performance: {
      frames: fr.length, seconds: SECONDS, pixelRatioAtEnd: data.pixelRatio,
      fpsAvgAll: fpsOf(dts), fpsFirstThird: fpsOf(dts.slice(0, third)), fpsLastThird: fpsOf(dts.slice(-third)),
      fpsMin: dts.length ? 1000 / Math.max(...dts) : null,
      frameMs: { p50: pct(dts, .5), p95: pct(dts, .95), p99: pct(dts, .99), max: Math.max(...dts) },
      drawCalls: { min: Math.min(...fr.map((f) => f.calls)), max: Math.max(...fr.map((f) => f.calls)) },
      triangles: { min: Math.min(...fr.map((f) => f.tris)), max: Math.max(...fr.map((f) => f.tris)) },
      jsHeapMB: { first: S[0]?.heap ? S[0].heap / 1048576 : null, last: S.at(-1)?.heap ? S.at(-1).heap / 1048576 : null },
      fpsBySceneTime: Object.fromEntries([[0, 4], [4, 10], [10, 14], [14, 20], [20, 26]].map(([a, b]) => {
        const ds = []; for (let i = 1; i < fr.length; i++) if (fr[i].el >= a && fr[i].el < b && fr[i].t - fr[i - 1].t < 2000) ds.push(fr[i].t - fr[i - 1].t);
        return [`${a}-${b}s`, fpsOf(ds)]; })),
    },
    camera: { windowSec: WIN, maxSpeed_mps: maxV, maxAccel_mps2: maxA, jumpsOver40mps: jumps, maxRoll_rad: maxRoll, minHeight: minY, minDistToCardCenter: minCard },
    loops: { maxRafCallbacksPerFrame: data.rafMax, note: 'норма: 2 (цикл three + тикер gsap); больше — возможны дубли циклов' },
    restarts,
    samplesEverySec: S.map((s) => ({ el: +s.el.toFixed(1), fps: +s.fps.toFixed(1), calls: s.calls, geo: s.geo, tex: s.tex, prog: s.prog, gsap: s.gsapChildren })),
  };
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify(report, null, 2));
  await browser.close(); srv.close();
})().catch((e) => { console.error('AUDIT FAILED', e); process.exit(1); });
