// Быстрая проверка синтаксиса всех .js/.mjs в src, tools, tests (без браузера). npm run check:syntax
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = ['src', 'tools', 'tests'].flatMap((d) => walk(join(root, d))).filter((f) => /\.m?js$/.test(f));
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error('✗', f, '\n', r.stderr); }
}
console.log(bad ? `Ошибок синтаксиса: ${bad}` : `Синтаксис OK (${files.length} файлов)`);
process.exit(bad ? 1 : 0);
