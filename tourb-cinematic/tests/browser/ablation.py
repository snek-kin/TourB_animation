"""Абляция: во сколько кадра обходится каждый компонент сцены (на замороженном кадре, чистая стоимость рендера).
python3 tests/browser/ablation.py --root DIR --query "?debug" --out файл.json"""
import argparse, asyncio, json, statistics, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _harness import ROOT, Session, serve
from perf import SAMPLER

SET = """(cfg) => { const s = tourb.scenes.current;
  const vis = (o, v) => { if (o) o.visible = v; };
  s.scene.traverse(o => { if (o.isGridHelper || (o.isMesh && o.geometry.type === 'CircleGeometry')) o.visible = cfg.ground; });
  vis(s.rain && s.rain.object3D, cfg.rain); vis(s.morph && s.morph.object3D, cfg.morph);
  (s.markers || []).forEach(m => m.visible = cfg.markers && m.uniforms.uAppear.value > 0.001);
  (s.cards || []).forEach(c => c.visible = cfg.cards && c._appear > 0.001);
  tourb.renderer.info.reset ? 0 : 0; }"""

CONFIGS = {'всё': dict(ground=1, rain=1, morph=1, markers=1, cards=1),
           'без дождя': dict(ground=1, rain=0, morph=1, markers=1, cards=1),
           'без частиц-морфа': dict(ground=1, rain=1, morph=0, markers=1, cards=1),
           'без маркеров': dict(ground=1, rain=1, morph=1, markers=0, cards=1),
           'без карточек': dict(ground=1, rain=1, morph=1, markers=1, cards=0),
           'без земли/сетки': dict(ground=0, rain=1, morph=1, markers=1, cards=1),
           'только земля/сетка': dict(ground=1, rain=0, morph=0, markers=0, cards=0),
           'пусто': dict(ground=0, rain=0, morph=0, markers=0, cards=0)}

RENDER_COST = """async () => { const r = tourb.renderer, gl = r.getContext(), sc = tourb.scenes.current.scene, cam = tourb.camera, px = new Uint8Array(4);
  r.setAnimationLoop(null); await new Promise(res => setTimeout(res, 150));
  for (let i = 0; i < 3; i++) { r.render(sc, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const t = []; for (let i = 0; i < 20; i++) { const a = performance.now(); r.render(sc, cam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); }
  r.setAnimationLoop(() => tourb._tick()); t.sort((x, y) => x - y); return { mean: t.reduce((x, y) => x + y) / t.length, median: t[10] }; }"""

async def measure(s, seconds=5):
    await s.ev('window.__fr.length = 0'); await s.page.wait_for_timeout(int(seconds * 1000))
    ts = await s.ev('window.__fr.slice()'); dts = [b - a for a, b in zip(ts, ts[1:])]
    info = await s.ev('(()=>{const i=tourb.renderer.info;return {calls:i.render.calls,tris:i.render.triangles}})()')
    rc = await s.ev(RENDER_COST)
    return {'ms': round(statistics.mean(dts), 1), 'fps': round(1000 / statistics.mean(dts), 1), 'render_ms': round(rc['median'], 1), **info} if dts else {}

async def main(root, query, out, moments=(8, 18)):
    res = {}
    with serve(root) as port:
        async with Session(port) as s:
            await s.page.add_init_script(SAMPLER); await s.open(query)
            await s.ev('tourb.scenes.togglePause()')
            for t in moments:
                await s.ev(f'tourb.scenes.seek({t})'); await s.page.wait_for_timeout(1500)
                res[f't={t}'] = {}
                for name, cfg in CONFIGS.items():
                    await s.ev(f'({SET})({json.dumps({k: bool(v) for k, v in cfg.items()})})')
                    await s.page.wait_for_timeout(700); res[f't={t}'][name] = await measure(s)
                await s.ev(f'({SET})({json.dumps({k: True for k in CONFIGS["всё"]})})')
            # стоимость HTML-оверлея (backdrop-filter, text-shadow) на пустой сцене
            await s.ev(f'({SET})({json.dumps({k: False for k in CONFIGS["всё"]})})'); res['HTML-оверлей (пустая сцена)'] = {}
            res['HTML-оверлей (пустая сцена)']['HUD включён'] = await measure(s, 4)
            await s.ev("document.getElementById('hud').style.display='none'"); await s.page.wait_for_timeout(500)
            res['HTML-оверлей (пустая сцена)']['HUD скрыт'] = await measure(s, 4)
            await s.ev("document.getElementById('hud').style.display=''")
            await s.ev(f'({SET})({json.dumps({k: True for k in CONFIGS["всё"]})})')
            # зависимость от разрешения: если время кадра ~ пропорционально числу пикселей → упираемся в заполнение (fill-rate)
            await s.ev('tourb.scenes.seek(8)'); res['разрешение (t=8)'] = {}
            for pr in (1.0, 0.75, 0.5):
                await s.ev(f'tourb.pixelRatio={pr}; tourb.resize()'); await s.page.wait_for_timeout(700)
                res['разрешение (t=8)'][f'pixelRatio {pr}'] = await measure(s, 4)
    for k, v in res.items():
        print(f'--- {k}')
        for n, m in v.items(): print(f'   {n:24s} кадр {m.get("ms")} мс ({m.get("fps")} FPS) | render+sync {m.get("render_ms")} мс  draw calls {m.get("calls")}  треуг. {m.get("tris")}')
    if out: Path(out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf8')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--root', default=str(ROOT)); ap.add_argument('--query', default='?debug'); ap.add_argument('--out')
    a = ap.parse_args(); asyncio.run(main(Path(a.root), a.query, a.out))
