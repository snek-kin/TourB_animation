"""Приёмочный браузерный аудит Phase 1.5 (Chromium; без GPU — программный рендер SwiftShader).
python3 tests/browser/audit.py [--root DIR] [--out docs/phase1.5/audit.json] [--cycles 10]
Проверяет: старт без ошибок и 404, загрузку ассетов и запасное поведение, компиляцию шейдеров и защиту от сбоя,
камеру (плавность, крен, коллизии), GSAP-переходы без конфликтов, единственный цикл рендера, очистку GPU-памяти,
полноту dispose у каждого эффекта. FPS здесь НЕ показатель реального железа — см. perf.py и ?bench."""
import argparse, asyncio, json, os, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _harness import ROOT, Session, serve

RAF_COUNTER = """
(() => { const orig = window.requestAnimationFrame.bind(window); const per = new Map(); window.__rafMax = 0;
  window.requestAnimationFrame = (cb) => orig((ts) => { const n = (per.get(ts) ?? 0) + 1; per.set(ts, n); if (n > window.__rafMax) window.__rafMax = n;
    if (per.size > 300) per.delete(per.keys().next().value); return cb(ts); }); })();"""

SNAP = """() => { const i = tourb.renderer.info, m = performance.memory;
  return { scene: tourb.scenes.current?.id, geo: i.memory.geometries, tex: i.memory.textures, prog: (i.programs || []).length,
           heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, dom: document.getElementsByTagName('*').length,
           gsap: gsap.globalTimeline.getChildren(true, true, true).length, veil: getComputedStyle(document.getElementById('veil')).opacity }; }"""

R = {}   # результаты по разделам
def rec(name, ok, **details): R[name] = {'ok': bool(ok), **details}; print(('  ✓ ' if ok else '  ✗ ') + name, ('' if ok else details))

async def a_startup(s):
    await s.open('?noadapt')
    await s.page.wait_for_timeout(2500)
    p = s.problems()
    rec('Старт: 0 ошибок консоли, 0 исключений', not p['console_errors'] and not p['page_errors'], console_errors=p['console_errors'][:3], page_errors=p['page_errors'][:3])
    rec('Старт: 0 предупреждений консоли', not p['console_warnings'], warnings=p['console_warnings'][:3])
    rec('Сеть: 0 ответов 4xx/5xx и сбоев запросов', not p['bad_responses'], bad=p['bad_responses'][:5])
    rec('Сеть: нет внешних запросов (работает офлайн)', not s.external_requests(), external=s.external_requests()[:5])
    info = await s.ev("({ru: new Set(performance.getEntriesByType('resource').map(e=>e.name)).size, keys: Object.keys(tourb.assets.manifest).length})")
    R['Сеть: запросов к ресурсам'] = {'ok': True, **info}

async def a_assets(s):
    # статусы 29 ассетов сверяем с файлами на диске
    rep = subprocess.run(['node', str(ROOT / 'tools/assets-report.mjs')], capture_output=True, text=True, cwd=ROOT)
    rec('Реестр ассетов: файлы соответствуют статусам', rep.returncode == 0, out=(rep.stdout + rep.stderr)[-400:])
    res = await s.ev("""async () => {
      const a = tourb.assets, out = {}, warns = [], errs = [], ow = console.warn, oe = console.error;
      console.warn = (...x) => { warns.push(x.join(' ')); ow(...x); }; console.error = (...x) => { errs.push(x.join(' ')); oe(...x); };
      a.manifest['t.plain'] = { type:'gltf', file:'../tests/fixtures/test_quad.glb', status:'Prepared', purpose:'тест GLB' };
      a.manifest['t.draco'] = { type:'gltf', file:'../tests/fixtures/test_quad_draco.glb', status:'Prepared', purpose:'тест Draco' };
      a.manifest['t.404']   = { type:'gltf', file:'models/нет_файла.glb', status:'Prepared', purpose:'битая ссылка', source:'тест' };
      await a.load(['t.plain', 't.draco', 't.404', 'env.terrain.kyrgyzstan', 'tex.ref.deck_mountain_lake']);
      const cnt = (k) => { let n = 0; a.get(k)?.scene.traverse(o => { if (o.isMesh) n++; }); return n; };
      const tex = a.get('tex.ref.deck_mountain_lake');
      out.glb = [cnt('t.plain'), cnt('t.draco')];
      out.texture = tex ? [tex.image.width, tex.image.height, tex.colorSpace] : null;
      out.missingHas = a.missing.has('env.terrain.kyrgyzstan'); out.getMissing = a.get('env.terrain.kyrgyzstan');
      out.errorKeys = a.errors.map(e => e.key);
      try { a.require(['env.terrain.kyrgyzstan']); out.requireThrows = false; } catch (e) { out.requireThrows = true; out.requireMsg = e.message.slice(0, 300); }
      console.warn = ow; console.error = oe; out.warns = warns.filter(w => w.includes('отсутствует')); out.errs = errs.filter(e => e.includes('не удалось загрузить'));
      return out; }""")
    rec('Ассеты: GLB и Draco-GLB загружаются в браузере', res['glb'] == [1, 1], glb=res['glb'])
    rec('Ассеты: текстура «Available» (референс гор) загружается', bool(res['texture']), texture=res['texture'])
    rec('Ассеты: отсутствующий (Missing) — не падает, get()=null, громкое предупреждение с указанием файла и источника',
        res['missingHas'] and res['getMissing'] is None and any('env.terrain.kyrgyzstan' in w and 'файл' in w for w in res['warns']), warns=res['warns'][:2])
    rec('Ассеты: битая ссылка — ошибка с описанием (ключ, файл, источник), приложение живо', 't.404' in res['errorKeys'] and any('t.404' in e for e in res['errs']), errs=res['errs'][:2])
    rec('Ассеты: критичный отсутствующий — require() бросает понятную ошибку', res['requireThrows'] and 'env.terrain.kyrgyzstan' in res.get('requireMsg', ''), msg=res.get('requireMsg'))

async def a_shaders(s):
    r = await s.ev("""() => { const i = tourb.renderer.info; const bad = (i.programs || []).filter(p => p.diagnostics && p.diagnostics.runnable === false).length;
       const gl = tourb.renderer.getContext(); return { programs: (i.programs || []).length, bad, glError: gl.getError(),
         pointRange: Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)), maxVarying: gl.getParameter(gl.MAX_VARYING_VECTORS),
         fragPrecision: gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision }; }""")
    rec('Шейдеры: все программы собраны, gl.getError() = 0', r['bad'] == 0 and r['glError'] == 0, **r)
    # защита: сломанный шейдер отключается, остальная сцена живёт, нет спама ошибок
    g = await s.ev("""async () => {
      const THREE = await import('three'); const { guardScene } = await import('/src/core/ShaderGuard.js');
      const sc = new THREE.Scene(); const good = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      const bad = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = vec4(0.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(1.0) #include <colorspace_fragment> }' }));
      bad.name = 'broken-test'; sc.add(good, bad);
      const errs = []; const oe = console.error; console.error = (...a) => { errs.push(a.join(' ')); };
      tourb.renderer.compile(sc, tourb.camera);
      const broken = guardScene(tourb.renderer, sc, () => {});
      const before = errs.length; for (let i = 0; i < 5; i++) tourb.renderer.render(sc, tourb.camera);
      console.error = oe;
      return { found: broken.length, badHidden: !bad.layers.test(tourb.camera.layers), goodVisible: good.layers.test(tourb.camera.layers), spam: errs.length - before, guardLogged: errs.some(e => e.includes('[ShaderGuard]')), shaderLogged: errs.some(e => e.includes('[Shader]')) }; }""")
    rec('Шейдеры: сломанный шейдер найден и отключён, остальное работает, без спама в консоли',
        g['found'] == 1 and g['badHidden'] and g['goodVisible'] and g['spam'] == 0 and g['guardLogged'] and g['shaderLogged'], **g)

async def a_dispose(s):
    out = {}
    for sid in ('val-digital', 'val-map', 'sandbox'):
        pass
    res = await s.ev("""async () => {
      const results = {};
      for (const [idx, id] of [[0, 'val-digital'], [1, 'val-map']]) {
        await tourb.scenes.goTo(idx, { transition: 'cut' });
        const sc = tourb.scenes.current, items = [], seen = new Set();
        const reg = (x, kind, what) => { if (!x || seen.has(x) || !x.addEventListener) return; seen.add(x); const it = { kind, what, shared: !!x.userData?.shared, fired: false }; items.push(it); x.addEventListener('dispose', () => { it.fired = true; }); };
        const texOf = (m) => { for (const k in m) if (m[k]?.isTexture) reg(m[k], 'texture', 'материал.' + k); if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) if (u.value?.isTexture) reg(u.value, 'texture', 'uniform ' + k); };
        sc.scene.traverse(o => { if (o.isInstancedMesh) reg(o, 'instancedMesh', o.name || 'instanced'); if (o.geometry) reg(o.geometry, 'geometry', o.geometry.type);
          for (const m of [].concat(o.material ?? [])) { reg(m, 'material', m.type); texOf(m); } });
        for (const k of ['rain', 'morph']) if (sc[k]) { reg(sc[k].points.geometry, 'geometry', k); reg(sc[k].material, 'material', k + ' ShaderMaterial'); texOf(sc[k].material); }
        sc.dispose();
        const miss = items.filter(i => !i.fired && !i.shared);
        results[id] = { total: items.length, shared: items.filter(i => i.shared).length, fired: items.filter(i => i.fired).length, notDisposed: miss.map(i => i.kind + ':' + i.what) };
      }
      return results; }""")
    for sid, r in res.items():
        rec(f'Dispose: {sid} — все несовместные ресурсы освобождены (геометрии, материалы, текстуры, instancing)', not r['notDisposed'], **r)
    await s.ev("tourb.scenes.goTo(0, { transition: 'cut' })")

async def a_camera(s):
    res = await s.ev("""async () => {
      const out = {}, cc = tourb.cameraCtl, cam = tourb.camera; const THREE = await import('three');
      if (!tourb.scenes.paused) tourb.scenes.togglePause();
      for (const [idx, id] of [[0, 'val-digital'], [1, 'val-map']]) {
        await tourb.scenes.goTo(idx, { transition: 'cut' }); if (!tourb.scenes.paused) tourb.scenes.togglePause();
        const sc = tourb.scenes.current, dt = 1 / 60, P = [], F = [], boxes = cc.colliders;
        sc.elapsed = 0; sc.timeline.time(0); cc.snap();
        const fwd = new THREE.Vector3(), right = new THREE.Vector3();
        let maxRoll = 0, minH = 1e9, minBox = 1e9, nan = 0, minCard = 1e9;
        for (let t = 0; t <= sc.duration + 1e-9; t += dt) {
          sc.timeline.time(t); cc.update(dt);
          const p = cam.position.clone(); if (!Number.isFinite(p.x + p.y + p.z)) nan++;
          P.push(p); cam.getWorldDirection(fwd); F.push(fwd.clone());
          right.setFromMatrixColumn(cam.matrixWorld, 0); maxRoll = Math.max(maxRoll, Math.abs(right.y));
          minH = Math.min(minH, p.y);
          for (const b of boxes) minBox = Math.min(minBox, Math.sqrt(b.distanceToPoint(p) ** 2));   // 0 = внутри/на границе
          for (const c of (sc.cards || [])) minCard = Math.min(minCard, p.distanceTo(c.position));
        }
        const V = [], A = [], W = []; 
        for (let i = 1; i < P.length; i++) { V.push(P[i].distanceTo(P[i - 1]) / dt); W.push(F[i].angleTo(F[i - 1]) / dt); }
        for (let i = 1; i < V.length; i++) A.push(Math.abs(V[i] - V[i - 1]) / dt);
        const J = []; for (let i = 1; i < A.length; i++) J.push(Math.abs(A[i] - A[i - 1]) / dt);
        const mx = (a) => Math.max(...a), jumps = V.filter(v => v > 40).length;
        out[id] = { frames: P.length, nan, maxSpeed: +mx(V).toFixed(2), maxAccel: +mx(A).toFixed(2), maxJerk: +mx(J).toFixed(1), maxAngVel: +mx(W).toFixed(3),
          startSpeed: +V[0].toFixed(3), endSpeed: +V[V.length - 1].toFixed(3), maxRoll: +maxRoll.toFixed(5), minHeight: +minH.toFixed(2),
          minDistToBox: +minBox.toFixed(2), minDistToCard: minCard < 1e8 ? +minCard.toFixed(2) : null, jumps };
      }
      return out; }""")
    for sid, m in res.items():
        ok = (m['nan'] == 0 and m['jumps'] == 0 and m['maxRoll'] < 1e-3 and m['minHeight'] >= 1.6 and m['minDistToBox'] > 0.5
              and (m['minDistToCard'] is None or m['minDistToCard'] > 2.5) and m['startSpeed'] < 0.3 and m['endSpeed'] < 0.6)
        rec(f'Камера {sid}: плавно, без крена/скачков/NaN, не в геометрии; старт и финиш из покоя', ok, **m)
    await s.ev("tourb.scenes.goTo(0, { transition: 'cut' })")

async def a_lifecycle(s, cycles):
    await s.ev("tourb.scenes.goTo(0, { transition: 'cut' })")
    if await s.ev("tourb.scenes.paused"): await s.ev("tourb.scenes.togglePause()")
    snaps = []
    for c in range(cycles):
        await s.ev("(async () => { await tourb.scenes.goTo(1); await tourb.scenes.goTo(0); })()")     # dip-переходы: туда и обратно
        await s.page.wait_for_timeout(3500)                                                             # даём стабилизироваться; 1 ядро, программный рендер
        await s.ev("(() => { if (!tourb.scenes.paused) tourb.scenes.togglePause(); tourb.scenes.seek(8); })()")
        await s.page.wait_for_timeout(800)
        snaps.append(await s.ev(SNAP))
        await s.ev("tourb.scenes.togglePause()")
    keys = ('geo', 'tex', 'prog', 'gsap', 'dom')
    stable = all(len({sn[k] for sn in snaps[1:]}) == 1 for k in keys)       # после 1-го цикла счётчики не должны меняться
    heap = [sn['heapMB'] for sn in snaps]
    rec(f'Цикл ×{cycles}: геометрии/текстуры/программы/GSAP/DOM не растут после первого цикла', stable, snapshots=snaps)
    rec('Цикл: «штора» перехода возвращается в 0 (переход завершён)', all(float(sn['veil']) < 0.01 for sn in snaps), veil=[sn['veil'] for sn in snaps])
    R['Цикл: куча JS по циклам (МБ)'] = {'ok': True, 'heapMB': heap}

async def a_loops_and_transitions(s):
    r = await s.ev("""async () => {
      const out = {}, r = tourb.renderer, per = new Map(); let renders = 0, maxPer = 0; const orig = r.render.bind(r);
      let frameTs = 0; r.render = (a, b) => { renders++; const k = Math.round(performance.now() / 8); per.set(k, (per.get(k) ?? 0) + 1); return orig(a, b); };
      if (tourb.scenes.paused) tourb.scenes.togglePause();
      // «тревожные» сценарии: быстрые повторные команды во время перехода, пауза в переходе
      const p1 = tourb.scenes.goTo(1); tourb.scenes.goTo(0); tourb.scenes.next(); tourb.scenes.togglePause(); await p1;
      await new Promise(res => setTimeout(res, 300));
      out.idAfterBurst = tourb.scenes.current.id; out.pausedAfterBurst = tourb.scenes.paused; out.busy = tourb.scenes.busy;
      if (tourb.scenes.paused) tourb.scenes.togglePause();
      const f0 = performance.now(); const n0 = renders; await new Promise(res => setTimeout(res, 3000)); const frames = renders - n0;
      r.render = orig; out.rendersPerSec = +(frames / ((performance.now() - f0) / 1000)).toFixed(1);
      out.rafMax = window.__rafMax; out.gsapChildren = gsap.globalTimeline.getChildren(true, true, true).length;
      return out; }""")
    rec('Переходы: пакет быстрых команд во время dip не ломает состояние (одна сцена, нет зависшей «шторы»)', r['idAfterBurst'] in ('val-digital', 'val-map') and not r['busy'], **r)
    rec('Циклы: максимум rAF-колбэков за кадр ≤ 2 (three + тикер GSAP) — дублей цикла рендера нет', r['rafMax'] <= 2, rafMax=r['rafMax'])
    # render() вызывается не чаще одного раза за кадр: сверяем с частотой rAF
    fps = await s.ev("tourb.perf.fps")
    rec('Циклы: renders/сек не превышает FPS (один render на кадр)', r['rendersPerSec'] <= fps * 1.15 + 1, rendersPerSec=r['rendersPerSec'], fps=round(fps, 1))

async def a_timer(s):
    r = await s.ev("""() => { const src = Array.from(document.scripts).length; return { timerClass: tourb.timer.constructor.name, hasClock: typeof tourb.clock !== 'undefined' }; }""")
    code = ''.join(p.read_text(encoding='utf8') for p in (ROOT / 'src').rglob('*.js'))
    rec('THREE.Clock не используется (src/), таймер — THREE.Timer', 'Clock(' not in code.replace('THREE.Clock deprecated', '') and r['timerClass'] == 'Timer' and not r['hasClock'], **r)

async def a_context_loss(s):
    r = await s.ev("""async () => { const gl = tourb.renderer.getContext(), ext = gl.getExtension('WEBGL_lose_context'), out = {};
      if (tourb.scenes.paused) tourb.scenes.togglePause();
      ext.loseContext(); await new Promise(r => setTimeout(r, 700));
      out.errorShown = !document.getElementById('error').hidden; const e1 = tourb.scenes.current.elapsed;
      await new Promise(r => setTimeout(r, 500)); out.frozenWhileLost = tourb.scenes.current.elapsed === e1;
      ext.restoreContext(); await new Promise(r => setTimeout(r, 3000));
      out.errorHiddenAfter = document.getElementById('error').hidden; out.resumed = tourb.scenes.current.elapsed > e1 + 0.2; return out; }""")
    rec('Потеря и восстановление WebGL-контекста: сообщение показано, после восстановления рендер продолжается', all(r.values()), **r)

async def main(root, out, cycles):
    with serve(root) as port:
        async with Session(port) as s:
            await s.page.add_init_script(RAF_COUNTER)
            await a_startup(s); await a_assets(s); await a_shaders(s); await a_timer(s)
            await a_dispose(s); await a_camera(s); await a_lifecycle(s, cycles); await a_loops_and_transitions(s); await a_context_loss(s)
            p = s.problems()
            # сознательно вызванные тестами сбои: битая ссылка (404 на «нет_файла.glb») и сломанный шейдер
            intended = ('%D0%BD%D0%B5%D1%82_%D1%84%D0%B0%D0%B9%D0%BB%D0%B0',)
            bad = [b for b in p['bad_responses'] if not any(k in b['url'] for k in intended)]
            unexpected = [e for e in p['console_errors'] if not any(k in e for k in ('[ShaderGuard]', '[Shader]', 't.404', 'Failed to load resource'))]
            rec('ИТОГО: кроме сознательно вызванных тестами сбоев — 0 ошибок консоли, 0 исключений, 0 ответов 4xx',
                not p['page_errors'] and not bad and not unexpected, unexpected=[e[:200] for e in unexpected][:6], bad=bad[:4], page_errors=p['page_errors'][:3])
            R['_env'] = {'cpus': os.cpu_count(), 'renderer': await s.ev('(()=>{const g=tourb.renderer.getContext();const e=g.getExtension("WEBGL_debug_renderer_info");return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):"?"})()'),
                         'antialias': await s.ev('tourb.antialias'), 'note': 'программный рендер (SwiftShader): FPS не отражает реальную видеокарту'}
    Path(out).parent.mkdir(parents=True, exist_ok=True); Path(out).write_text(json.dumps(R, ensure_ascii=False, indent=1), encoding='utf8')
    bad = [k for k, v in R.items() if not k.startswith('_') and not v.get('ok', True)]
    print(f"\nИТОГ: {len([k for k in R if not k.startswith('_')]) - len(bad)} пройдено, {len(bad)} не пройдено"); [print('  ✗', b) for b in bad]
    return 1 if bad else 0

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--root', default=str(ROOT)); ap.add_argument('--out', default=str(ROOT / 'docs/phase1.5/audit.json')); ap.add_argument('--cycles', type=int, default=10)
    a = ap.parse_args(); sys.exit(asyncio.run(main(Path(a.root), a.out, a.cycles)))
