"""Длительный замер кадров: независимый сэмплер requestAnimationFrame внутри страницы (работает и со старым кодом).
python3 tests/browser/perf.py --root DIR --seconds 60 --query "?debug" --label name
ЧЕСТНО: в этом окружении рендер программный (SwiftShader, CPU). Числа сравнимы МЕЖДУ СОБОЙ (до/после),
но не равны FPS на реальной видеокарте."""
import argparse, asyncio, json, statistics, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _harness import ROOT, Session, serve

SAMPLER = """
window.__fr = []; (function loop(t){ window.__fr.push(t); requestAnimationFrame(loop); })(performance.now());
"""
SNAP = """() => { const i = tourb.renderer.info, s = tourb.scenes.current, m = performance.memory;
  const ch = (window.gsap ? gsap.globalTimeline.getChildren(true, true, true).length : -1);
  return { scene: s ? s.id : null, elapsed: s ? +s.elapsed.toFixed(2) : 0, calls: i.render.calls, tris: i.render.triangles,
    geo: i.memory.geometries, tex: i.memory.textures, prog: (i.programs||[]).length, pr: +tourb.pixelRatio.toFixed(3),
    heapMB: m ? +(m.usedJSHeapSize/1048576).toFixed(1) : null, dom: document.getElementsByTagName('*').length, gsapChildren: ch }; }"""

def frame_stats(ts):
    dts = [b - a for a, b in zip(ts, ts[1:])]
    if len(dts) < 5: return {'frames': len(ts)}
    dts_sorted = sorted(dts); n = len(dts)
    med = statistics.median(dts)
    return {'frames': len(ts), 'avg_fps': round(1000 * n / sum(dts), 2), 'min_fps_instant': round(1000 / max(dts), 2),
            'p95_ms': round(dts_sorted[int(n * .95)], 1), 'p99_ms': round(dts_sorted[min(n - 1, int(n * .99))], 1),
            'median_ms': round(med, 1), 'stdev_ms': round(statistics.pstdev(dts), 1),
            'jank_frames_gt_2x_median': sum(1 for d in dts if d > 2 * med)}

async def run(root, seconds, query, label, window_s=2.0, viewport=(1280, 720), start=True):
    with serve(root) as port:
        async with Session(port, viewport) as s:
            await s.page.add_init_script(SAMPLER)
            await s.open(query, start=start)
            await s.page.wait_for_timeout(1000)
            series, last_idx = [], 0
            for w in range(int(seconds / window_s)):
                await s.page.wait_for_timeout(int(window_s * 1000))
                ts = await s.ev('window.__fr.slice(%d)' % last_idx)
                last_idx += len(ts)
                snap = await s.ev(SNAP)
                series.append({'t': round((w + 1) * window_s, 1), **frame_stats(ts), **snap})
            all_ts = await s.ev('window.__fr.slice(1)')
            res = {'label': label, 'seconds': seconds, 'viewport': viewport, 'query': query, 'overall': frame_stats(all_ts),
                   'series': series, 'problems': s.problems(), 'external_requests': s.external_requests(),
                   'renderer': await s.ev('(()=>{const g=tourb.renderer.getContext();const e=g.getExtension("WEBGL_debug_renderer_info");return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):"?"})()')}
            return res

def show(res):
    o = res['overall']; print(f"[{res['label']}] {res['renderer'][:60]}")
    print('  итого:', o)
    first, last = res['series'][0], res['series'][-1]
    print(f"  FPS по окнам 2с: начало {first.get('avg_fps')} → конец {last.get('avg_fps')};  "
          f"min окна {min(x.get('avg_fps', 0) for x in res['series'])}, max окна {max(x.get('avg_fps', 0) for x in res['series'])}")
    print(f"  pixelRatio {first['pr']} → {last['pr']};  geo {first['geo']}→{last['geo']};  tex {first['tex']}→{last['tex']};  heap {first['heapMB']}→{last['heapMB']} МБ;  dom {first['dom']}→{last['dom']};  gsap {first['gsapChildren']}→{last['gsapChildren']}")
    p = res['problems']; print('  ошибки консоли:', len(p['console_errors']), ' предупреждения:', len(p['console_warnings']), ' 4xx/5xx:', len(p['bad_responses']), ' внешние запросы:', len(res['external_requests']))

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=str(ROOT)); ap.add_argument('--seconds', type=int, default=60)
    ap.add_argument('--query', default='?debug'); ap.add_argument('--label', default='run'); ap.add_argument('--out')
    a = ap.parse_args()
    r = asyncio.run(run(Path(a.root), a.seconds, a.query, a.label)); show(r)
    if a.out: Path(a.out).write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding='utf8')
