// Копирует рантайм-зависимости из node_modules в vendor/, чтобы проект открывался
// в VS Code (Live Server) без сборки. Запуск: npm run vendor
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'vendor', p);

const copies = [
  ['three/build/three.module.js', 'three/three.module.js'],
  ['three/build/three.core.js', 'three/three.core.js'],
  ['three/LICENSE', 'three/LICENSE'],
  ['three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/loaders/GLTFLoader.js'],
  ['three/examples/jsm/loaders/DRACOLoader.js', 'three/examples/jsm/loaders/DRACOLoader.js'],
  ['three/examples/jsm/utils/BufferGeometryUtils.js', 'three/examples/jsm/utils/BufferGeometryUtils.js'],
  ['three/examples/jsm/utils/SkeletonUtils.js', 'three/examples/jsm/utils/SkeletonUtils.js'], // нужен GLTFLoader и клонированию скинированных моделей
  ['three/examples/jsm/libs/draco/gltf', 'three/examples/jsm/libs/draco/gltf'],
  ['gsap/dist/gsap.min.js', 'gsap/gsap.min.js'],
  ['gsap/README.md', 'gsap/README.md'],
];

for (const [from, to] of copies) {
  if (!existsSync(nm(from))) { console.warn('нет файла (пропуск):', from); continue; }
  mkdirSync(dirname(out(to)), { recursive: true });
  cpSync(nm(from), out(to), { recursive: true });
}
const pkg = (n) => JSON.parse(readFileSync(nm(`${n}/package.json`), 'utf8')).version;
writeFileSync(out('VERSIONS.json'), JSON.stringify({ three: pkg('three'), gsap: pkg('gsap') }, null, 2));
console.log('vendor готов: three', pkg('three'), '· gsap', pkg('gsap'));
