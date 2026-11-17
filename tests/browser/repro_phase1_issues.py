"""Воспроизведение проблем, о которых сообщали после Phase 1: 404 манифеста, ошибка GLSL, THREE.Clock.
Строит ВРЕМЕННУЮ копию проекта, возвращает в неё исходные (дефектные) варианты и сравнивает с текущим кодом.
Так причина каждой проблемы подтверждается экспериментом, а не предположением."""
import asyncio, json, re, shutil, tempfile, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from _harness import ROOT, Session, serve

def make_regressed(dst: Path):
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns('node_modules', '.git', 'docs'))
    (dst / 'assets/assets.manifest.json').unlink()                                   # R1: манифеста нет
    gm = dst / 'src/effects/GlowMarker.js'; s = gm.read_text(encoding='utf8')          # R2: #include в одну строку
    s = re.sub(r"const BEAM_F = `.*?`;", "const BEAM_F = `uniform vec3 uColor; uniform float uAppear; varying vec2 vUv;\n  void main(){ float a = pow(1.0 - vUv.y, 2.0) * 0.55 * uAppear; gl_FragColor = vec4(uColor, a); #include <colorspace_fragment> }`;", s, flags=re.S)
    gm.write_text(s, encoding='utf8')
    app = dst / 'src/core/App.js'; s = app.read_text(encoding='utf8')                  # R3: THREE.Clock
    s = s.replace('this._last = performance.now();', 'this.clock = new THREE.Clock();')
    s = re.sub(r"const now = performance\.now\(\);\s*const dt = .*?;\s*this\._last = now;", "const dt = Math.min(this.clock.getDelta(), 0.1);", s, flags=re.S)
    app.write_text(s, encoding='utf8')

async def probe(root: Path):
    with serve(root) as port:
        async with Session(port) as s:
            await s.open('?debug')
            await s.ev('tourb.scenes.togglePause()')
            await s.ev('tourb.scenes.seek(17)')           # маркеры уже видимы → шейдер луча компилируется
            await s.page.wait_for_timeout(1500)
            p = s.problems()
            return {'console_errors': [e[:400] for e in p['console_errors']],
                    'console_warnings': [w[:300] for w in p['console_warnings']],
                    'bad_responses': p['bad_responses'], 'page_errors': p['page_errors'][:3]}

async def main():
    tmp = Path(tempfile.mkdtemp()) / 'regressed'
    make_regressed(tmp)
    res = {'regressed': await probe(tmp), 'current': await probe(ROOT)}
    out = ROOT / 'docs/phase1.5/repro.json'
    out.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding='utf8')
    for k, v in res.items():
        print(f'== {k}: ошибок консоли {len(v["console_errors"])}, предупреждений {len(v["console_warnings"])}, 4xx/5xx {len(v["bad_responses"])}, исключений {len(v["page_errors"])}')
        for e in v['console_errors'][:3]: print('   ERROR:', e.replace('\n', ' ')[:220])
        for w in v['console_warnings'][:3]: print('   WARN :', w.replace('\n', ' ')[:200])
        for b in v['bad_responses'][:3]: print('   HTTP :', b)
asyncio.run(main())
