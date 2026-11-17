// Сверяет манифест с файлами на диске, проверяет бюджеты GLB и пересобирает assets/ASSET_INVENTORY.md.
// Запуск: npm run assets:report   (после того как вы положили файлы в assets/…)
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inspectGlb } from './glb-inspect.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const manifestPath = join(root, 'assets/assets.manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const problems = [], rows = [];

for (const [key, e] of Object.entries(manifest.assets)) {
  const isRuntimeAsset = e.type !== 'procedural';
  const path = e.file ? join(root, e.type === 'procedural' ? '' : 'assets', e.file) : null;
  const exists = path && existsSync(path);
  let status = e.status, extra = '';

  // Автоповышение: файл появился, а в манифесте всё ещё Missing → подсказка.
  if (isRuntimeAsset && e.status === 'Missing' && exists) {
    problems.push(`${key}: файл ${e.file} найден, но status = Missing → смените на Prepared/Available в манифесте`);
  }
  if (e.status !== 'Missing' && e.file && !exists) {
    problems.push(`${key}: status = ${e.status}, но файла нет: ${e.file}`);
    status = 'Missing (файл не найден!)';
  }
  if (exists && isRuntimeAsset) {
    const mb = statSync(path).size / 1048576;
    extra = `${mb.toFixed(2)} МБ`;
    if (e.budget?.fileMB && mb > e.budget.fileMB) problems.push(`${key}: файл ${mb.toFixed(1)} МБ > бюджета ${e.budget.fileMB} МБ`);
    if (e.type === 'gltf' && path.endsWith('.glb')) {
      try {
        const info = inspectGlb(readFileSync(path));
        extra += `, ${info.triangles} треуг.${info.draco ? ', Draco' : ''}${info.meshopt ? ', meshopt' : ''}`;
        if (e.budget?.tris && info.triangles > e.budget.tris) problems.push(`${key}: ${info.triangles} треуг. > бюджета ${e.budget.tris}`);
      } catch (err) { problems.push(`${key}: ${err.message}`); }
    }
  }
  rows.push({ key, e, status, extra });
}

const order = ['Available', 'Prepared', 'Placeholder', 'Missing'];
const count = (s) => rows.filter((r) => r.status.startsWith(s)).length;
const esc = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# Реестр ассетов TourB Cinematic\n\n> Генерируется командой \`npm run assets:report\` из \`assets/assets.manifest.json\`. Не правьте этот файл вручную — правьте манифест.\n\n`;
md += `**Итого:** Available — ${count('Available')} · Prepared — ${count('Prepared')} · Placeholder — ${count('Placeholder')} · Missing — ${count('Missing')} (всего ${rows.length})\n\n`;
for (const group of ['effects', 'models', 'textures', 'hdri', 'audio', 'ui']) {
  const list = rows.filter((r) => r.e.category.startsWith(group)).sort((a, b) => order.indexOf(a.status.split(' ')[0]) - order.indexOf(b.status.split(' ')[0]));
  if (!list.length) continue;
  md += `## ${group}\n\n| Ключ | Назначение | Статус | Файл | Источник / способ создания | Оптимизация и лицензия |\n|---|---|---|---|---|---|\n`;
  for (const { key, e, status, extra } of list) {
    const opt = [e.budget && `бюджет: ${Object.entries(e.budget).map(([k, v]) => `${k} ${v}`).join(', ')}`, e.license && `лицензия: ${e.license}`, e.notes, extra && `факт: ${extra}`].filter(Boolean).join('; ');
    md += `| \`${key}\` | ${esc(e.purpose)} | **${status}** | ${esc(e.file)} | ${esc(e.source)} | ${esc(opt)} |\n`;
  }
  md += '\n';
}
const cands = rows.filter((r) => r.e.candidates?.length);
if (cands.length) {
  md += `## Источники (проверено при подготовке)\n\n`;
  for (const { key, e } of cands) for (const c of e.candidates) md += `- \`${key}\` — [${c.name}](${c.url}) · проверено: ${c.verified}\n`;
  md += '\n';
}
writeFileSync(join(root, 'assets/ASSET_INVENTORY.md'), md);
console.log(`Реестр обновлён: assets/ASSET_INVENTORY.md (${rows.length} записей)`);
if (problems.length) { console.warn('\nПроблемы:\n - ' + problems.join('\n - ')); process.exitCode = 1; }
else console.log('Проблем не найдено.');
