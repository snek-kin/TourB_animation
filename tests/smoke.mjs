// Дымовые тесты без браузера: npm test. Проверяют данные, манифест, зависимости, камеру, менеджер сцен.
// (Рендер и шейдеры проверяются только в браузере — см. docs/04-risks-and-next-phase.md.)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import gsap from 'gsap';

globalThis.gsap = gsap; // в браузере его даёт <script src="vendor/gsap/gsap.min.js">
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.error('  ✗', name, '\n     ', e.message); }
};
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg ?? 'не равно'}: ${a} !== ${b}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };

const { CONFIG } = await import('../src/config.js');
const { TIMELINE, totalDuration } = await import('../src/data/timeline.js');
const { FEATURES, STATUS } = await import('../src/data/features.js');
const { inspectGlb } = await import('../tools/glb-inspect.mjs');
const { rng } = await import('../src/effects/util.js');
const THREE = await import('three');

console.log('Данные');
await test('раскадровка = 3:50 (230 с)', () => eq(totalDuration(), CONFIG.totalDurationSec));
await test('id сцен уникальны, у каждой есть название и длительность', () => {
  const ids = new Set(TIMELINE.map((s) => s.id));
  eq(ids.size, TIMELINE.length, 'дубли id');
  for (const s of TIMELINE) ok(s.title && s.duration > 0, `сцена ${s.id}`);
});
await test('все функции из раскадровки описаны в features.js', () => {
  for (const s of TIMELINE) for (const f of s.features) ok(FEATURES[f], `нет функции ${f} (сцена ${s.id})`);
});
await test('статусы функций допустимы; у «concept» есть пояснение', () => {
  for (const [id, f] of Object.entries(FEATURES)) {
    ok(STATUS[f.status], `${id}: неизвестный статус ${f.status}`);
    if (f.status === 'concept') ok(f.note && f.note.length > 20, `${id}: нужно пояснение`);
  }
});
await test('Smart Deals и «Живой город» не помечены как готовые', () => {
  for (const id of ['smart_deals', 'living_city', 'translator_dictionary']) ok(FEATURES[id].status === 'concept', id);
  ok(FEATURES.ai_assistant.status === 'later', 'ИИ-помощник — этап 2');
});
const { BishkekMapScene } = await import('../src/scenes/BishkekMapScene.js');
const { generateLayout, boundaries } = await import('../src/scenes/bishkek/CityKit.js');
const { DigitalPulse } = await import('../src/scenes/bishkek/DigitalPulse.js');
const { makeGroundHeight } = await import('../src/scenes/bishkek/Terrain.js');
const { buildLandmarkPack } = await import('../src/scenes/bishkek/landmarks/LandmarkPack.js');
const { createCityActivity } = await import('../src/scenes/bishkek/landmarks/CityActivity.js');
const { disposeObject } = await import('../src/core/Disposer.js');
const { resolvedPois, RESERVES } = await import('../src/scenes/bishkek/data.js');
await test('Bishkek scene: imports, is registered in the timeline, and preserves 230 seconds', () => {
  ok(typeof BishkekMapScene === 'function', 'сцена не импортируется');
  const scene = TIMELINE.find((entry) => entry.id === 'bishkek');
  ok(scene, 'нет сцены bishkek в раскадровке');
  eq(scene.duration, 25);
  eq(scene.status, 'implemented');
  eq(totalDuration(), 230);
});
await test('Bishkek layout: deterministic, populated, and clear of reserved sites', () => {
  const layout = generateLayout(2026), repeat = generateLayout(2026);
  eq(JSON.stringify(layout.records), JSON.stringify(repeat.records), 'планировка должна быть детерминированной');
  eq(layout.records.length, 1293, `число зданий Stage 1 изменилось: ${layout.records.length}`);
  const intersects = (b, r) =>
    b.x - b.w / 2 < r.x + r.w && b.x + b.w / 2 > r.x &&
    b.z - b.d / 2 < r.z + r.d && b.z + b.d / 2 > r.z;
  eq(layout.records.filter((b) => RESERVES.some((r) => intersects(b, r))).length, 0, 'здания перекрывают зарезервированные места');
  eq(resolvedPois().length, 15);
  for (const poi of resolvedPois()) ok(STATUS[poi.status], `неизвестный статус POI ${poi.title}`);
});
await test('Digital Pulse: road ranges use indices and remain primitive-aligned at all quality levels', () => {
  const layout = generateLayout(2026);
  for (const records of Object.values(layout.instances)) {
    for (const record of records) {
      record.y0 = 0;
      record.tint = [0.72, 0.8, 0.9];
    }
  }
  const meshes = {};
  for (const [type, records] of Object.entries(layout.instances)) {
    if (!records.length) continue;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), records.length);
    records.forEach((record, i) => mesh.setColorAt(i, new THREE.Color(...record.tint)));
    meshes[type] = mesh;
  }
  const facadeMats = [new THREE.MeshStandardMaterial({ emissiveIntensity: 0 })];
  const pulse = new DigitalPulse({ instances: layout.instances, meshes, facadeMats, groundHeightAt: () => 0 });
  const roadIndices = pulse.roads.geometry.index.count;
  ok(roadIndices > pulse.roads.geometry.attributes.position.count, 'test requires indexed road geometry');
  pulse.setQuality(1);
  eq(pulse.roads.geometry.drawRange.count, roadIndices, 'full quality must draw every road index');
  for (const density of [0.75, 0.25, 0]) {
    pulse.setQuality(density);
    ok(pulse.roads.geometry.drawRange.count <= roadIndices, 'road draw range exceeds index count');
    eq(pulse.roads.geometry.drawRange.count % 6, 0, 'road range cuts through a quad');
    eq(pulse.edges.geometry.drawRange.count % 2, 0, 'edge range cuts through a segment');
    ok(pulse.beacons.geometry.drawRange.count <= pulse.beacons.geometry.attributes.position.count,
      'beacon draw range exceeds its vertex count');
  }

  pulse.uniforms.uDigital.value = 1;
  pulse.uniforms.uScanRadius.value = 200;
  pulse.update(15, 0.5);
  const color = new THREE.Color();
  let illuminated = false;
  for (const [type, records] of Object.entries(layout.instances)) {
    const mesh = meshes[type];
    if (!mesh) continue;
    for (let i = 0; i < records.length; i++) {
      mesh.getColorAt(i, color);
      if (Math.abs(color.r - records[i].tint[0]) > 1e-5) illuminated = true;
    }
  }
  ok(illuminated, 'building wave did not change instance colors');
  ok(facadeMats[0].emissiveIntensity > 0.6, 'window emissive intensity did not animate');

  pulse.uniforms.uDigital.value = 0;
  pulse.update(12, 0.5);
  for (const [type, records] of Object.entries(layout.instances)) {
    const mesh = meshes[type];
    if (!mesh) continue;
    for (let i = 0; i < records.length; i++) {
      mesh.getColorAt(i, color);
      ok(Math.abs(color.r - records[i].tint[0]) < 1e-6, 'base instance tint was not restored');
    }
  }
  eq(facadeMats[0].emissiveIntensity, 0.6, 'window baseline was not restored');

  pulse.uniforms.uDigital.value = 1;
  pulse.update(15, 0.5);
  const panelIndex = layout.instances.panel.findIndex((record) => Math.hypot(record.x, record.z - 4) < 180);
  ok(panelIndex >= 0, 'test requires a panel building inside the wave radius');
  const expected = meshes.panel.getColorAt(panelIndex, new THREE.Color()).toArray();
  pulse.uniforms.uDigital.value = 0;
  pulse.update(12, 0.5);
  pulse.uniforms.uDigital.value = 1;
  pulse.update(15, 0.5);
  const repeated = meshes.panel.getColorAt(panelIndex, new THREE.Color()).toArray();
  eq(JSON.stringify(repeated), JSON.stringify(expected), 'seeking back and forward changed pulse colors');

  let disposed = 0;
  for (const object of [pulse.edges, pulse.roads, pulse.ring, pulse.beacons]) {
    object.geometry.addEventListener('dispose', () => disposed++);
    object.material.addEventListener('dispose', () => disposed++);
  }
  disposeObject(pulse);
  eq(disposed, 8, 'Digital Pulse GPU resources were not all disposed');
  for (const mesh of Object.values(meshes)) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  facadeMats[0].dispose();
});
await test('Bishkek landmarks and city activity: procedural models animate deterministically and dispose resources', () => {
  const groundHeightAt = makeGroundHeight(900);
  const pack = buildLandmarkPack(groundHeightAt);
  const activity = createCityActivity(groundHeightAt);
  eq(Object.keys(pack.landmarks).join(','), 'square,philharmonic,manas');
  eq(pack.colliders.length, 2, 'landmark collision bounds missing');
  ok(activity.movers.length >= 5, 'vehicle and pedestrian routes were not created');

  const flag = pack.landmarks.square.userData.flag;
  const flagPositions = flag.geometry.attributes.position;
  pack.update(0);
  const atStart = Array.from(flagPositions.array);
  pack.update(1.25);
  const atTime = Array.from(flagPositions.array);
  ok(atTime.some((value, i) => Math.abs(value - atStart[i]) > 1e-4), 'flag did not animate');
  pack.update(0);
  pack.update(1.25);
  eq(JSON.stringify(Array.from(flagPositions.array)), JSON.stringify(atTime), 'flag animation is not deterministic');

  const vehicle = activity.movers.find((mover) => !mover.pedestrian).object;
  activity.update(0, 0);
  const initialPosition = vehicle.position.clone();
  activity.update(2, 0.6);
  const atTimePosition = vehicle.position.clone();
  ok(vehicle.position.distanceTo(initialPosition) > 0.1, 'vehicle did not move along its route');
  activity.update(8, 1);
  activity.update(2, 0.6);
  ok(vehicle.position.distanceTo(atTimePosition) < 1e-8, 'vehicle movement changed when seeking');
  ok(activity.group.getObjectByName('lamp-diffuser').material.emissiveIntensity > 0.18,
    'street lighting did not respond to dusk');

  const flagTexture = flag.material.map;
  const carGeometry = vehicle.children[0].geometry;
  let textureDisposed = false, geometryDisposed = false;
  flagTexture.addEventListener('dispose', () => { textureDisposed = true; });
  carGeometry.addEventListener('dispose', () => { geometryDisposed = true; });
  disposeObject(pack.group);
  disposeObject(activity.group);
  ok(textureDisposed && geometryDisposed, 'landmark or activity GPU resources were not disposed');
});

console.log('Ассеты и зависимости');
const manifest = JSON.parse(readFileSync(join(root, 'assets/assets.manifest.json'), 'utf8'));
await test('манифест: допустимые статусы, файлы для Available/Prepared существуют', () => {
  for (const [k, e] of Object.entries(manifest.assets)) {
    ok(manifest.statuses.includes(e.status), `${k}: статус ${e.status}`);
    if (['Available', 'Prepared'].includes(e.status)) {
      const p = e.type === 'procedural' ? e.file : `assets/${e.file}`;
      ok(existsSync(join(root, p)), `${k}: нет файла ${p}`);
    }
    if (e.status === 'Missing') ok(e.source, `${k}: не указан способ получения/создания`);
  }
});
await test('папки категорий из манифеста существуют в assets/', () => {
  for (const e of Object.values(manifest.assets))
    ok(existsSync(join(root, 'assets', e.category)), `нет папки assets/${e.category}`);
});
await test('import map в index.html указывает на существующие файлы', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const v of Object.values(map)) ok(existsSync(join(root, v)), `нет ${v}`);
  ok(existsSync(join(root, 'vendor/gsap/gsap.min.js')), 'нет vendor/gsap/gsap.min.js');
});
await test('vendor: замыкание относительных импортов GLTFLoader/DRACOLoader/three замкнуто', () => {
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return; seen.add(rel);
    const file = join(root, rel);
    ok(existsSync(file), `отсутствует ${rel}`);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) walk(join(dirname(rel), m[1]).replace(/\\/g, '/'));
  };
  for (const f of ['three/three.module.js', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/loaders/DRACOLoader.js'])
    walk(`vendor/${f}`);
  ok(existsSync(join(root, 'vendor/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm')), 'нет Draco-декодера');
});
await test('inspectGlb: считает треугольники в синтетическом GLB', () => {
  const json = { asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: 4 }, { count: 6 }], extensionsUsed: ['KHR_draco_mesh_compression'] };
  let j = new TextEncoder().encode(JSON.stringify(json)); const pad = (4 - (j.length % 4)) % 4;
  const jj = new Uint8Array(j.length + pad).fill(0x20); jj.set(j);
  const out = new Uint8Array(20 + jj.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jj.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jj, 20);
  const info = inspectGlb(out);
  eq(info.triangles, 2); ok(info.draco, 'Draco не определён');
});

console.log('Эффекты, камера, менеджер сцен');
await test('rng детерминирован (одинаковый seed → одинаковая последовательность)', () => {
  const a = rng(7), b = rng(7);
  for (let i = 0; i < 20; i++) eq(a(), b());
});
const { CameraController } = await import('../src/core/CameraController.js');
await test('камера: рельса, нет NaN, не уходит под землю, выталкивается из коллайдера', () => {
  const cam = new THREE.PerspectiveCamera(), cc = new CameraController(cam);
  cc.groundHeightAt = () => 0; cc.clearance = 2;
  cc.colliders = [new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 10, 1))];
  cc.setPath({ positions: [[-5, 0.2, 0], [0, 3, 0], [5, 0.5, 0]], targets: [[0, 2, -10], [0, 2, -10], [0, 2, -10]] });
  for (let t = 0; t <= 1.0001; t += 0.01) {
    cc.setProgress(t); cc.update(1 / 60);
    const p = cam.position;
    ok(Number.isFinite(p.x + p.y + p.z), 'NaN в позиции');
    ok(p.y >= 2 - 1e-6, `камера ниже зазора: ${p.y}`);
    const r = cc.radius, e = 1e-3;
    const inside = Math.abs(p.x) < 1 + r - e && Math.abs(p.z) < 1 + r - e && p.y > -r + e && p.y < 10 + r - e;
    ok(!inside, `камера внутри коллайдера: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
  }
  ok(cam.up.y === 1 && cam.up.x === 0, 'у камеры не должно быть крена');
});
await test('камера: резкий скачок цели сглаживается (нет мгновенного телепорта)', () => {
  const cam = new THREE.PerspectiveCamera(), cc = new CameraController(cam);
  cc.setPath({ positions: [[0, 5, 0], [100, 5, 0]], targets: [[0, 5, -10], [100, 5, -10]] });
  cc.setProgress(1); cc.update(1 / 60);
  ok(cam.position.x < 20, `слишком резкий скачок: x=${cam.position.x.toFixed(1)}`);
});

const { SceneManager } = await import('../src/core/SceneManager.js');
const { BaseScene } = await import('../src/core/BaseScene.js');
await test('SceneManager: prepare → start → автопереход → dispose предыдущей → конец', async () => {
  const log = [];
  class S extends BaseScene {
    constructor(app, id) { super(app, { id, duration: 1 }); }
    build() { log.push(`build ${this.id}`); }
    enter() { log.push(`enter ${this.id}`); this.createTimeline().to({}, { duration: 1 }); }
    dispose() { log.push(`dispose ${this.id}`); super.dispose(); }
  }
  const app = {
    assets: { load: async () => {} },
    cameraCtl: { reset() { log.push('camera.reset'); }, snap() {} },
    hud: { setScene() {}, setPaused() {}, setEnded() { log.push('ended'); } },
    transitions: { run: async (_n, { swap }) => { await swap(); } },
  };
  const sm = new SceneManager(app);
  sm.register({ id: 'a', create: (a) => new S(a, 'a') }).register({ id: 'b', create: (a) => new S(a, 'b') });
  await sm.prepare(0); await sm.start(0);
  eq(sm.current.id, 'a');
  sm.update(1.1); await new Promise((r) => setTimeout(r, 20));
  eq(sm.current.id, 'b'); ok(log.includes('dispose a'), 'сцена a не освобождена');
  sm.update(1.1); eq(sm.ended, true); ok(log.includes('ended'));
  ok(log.indexOf('camera.reset') < log.indexOf('build a'), 'камера должна сбрасываться до build');
});
await test('SceneManager: пауза замораживает время сцены', async () => {
  const app = { assets: { load: async () => {} }, cameraCtl: { reset() {}, snap() {} }, hud: { setScene() {}, setPaused() {}, setEnded() {} }, transitions: { run: async (_n, { swap }) => { await swap(); } } };
  const sm = new SceneManager(app);
  sm.register({ id: 'a', create: (a) => new BaseScene(a, { id: 'a', duration: 10 }) });
  await sm.prepare(0); await sm.start(0);
  sm.update(1); sm.togglePause(); sm.update(5);
  eq(sm.current.elapsed, 1);
});

console.log('Phase 1.5: ассеты, монитор кадров');
const { AssetManager } = await import('../src/core/AssetManager.js');
const { PerfMonitor } = await import('../src/core/PerfMonitor.js');
await test('AssetManager: Missing не падает и громко предупреждает с файлом и способом получения', async () => {
  const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  try {
    const am = new AssetManager({ capabilities: { getMaxAnisotropy: () => 4 } });
    am.manifest = { a: { type: 'gltf', file: 'models/a.glb', status: 'Missing', purpose: 'тест', source: 'создать в Blender' } };
    await am.load(['a']); await am.load(['a']);
    eq(am.get('a'), null); eq(warns.length, 1, 'предупреждение должно быть одно на ключ');
    ok(warns[0].includes('models/a.glb') && warns[0].includes('создать в Blender'), warns[0]);
  } finally { console.warn = ow; }
});
await test('AssetManager.require: бросает понятную ошибку для критичного ассета', async () => {
  const am = new AssetManager({ capabilities: { getMaxAnisotropy: () => 4 } });
  am.manifest = { a: { type: 'gltf', file: 'models/a.glb', status: 'Missing', purpose: 'самолёт', source: 'Poly Pizza' } };
  const ow = console.warn; console.warn = () => {};
  try { await am.load(['a']); } finally { console.warn = ow; }
  let msg = ''; try { am.require(['a']); } catch (e) { msg = e.message; }
  ok(msg.includes('Критичные') && msg.includes('самолёт') && msg.includes('Poly Pizza'), msg);
});
await test('AssetManager: неизвестный ключ — ошибка в errors, без исключения наружу', async () => {
  const am = new AssetManager({ capabilities: { getMaxAnisotropy: () => 4 } });
  const oe = console.error; console.error = () => {};
  try { await am.load(['нет такого']); } finally { console.error = oe; }
  eq(am.errors.length, 1);
});
await test('AssetManager: манифест запрашивается из заданного GitHub Pages-подпути и init дедуплицируется', async () => {
  const am = new AssetManager({}, { baseUrl: 'https://example.test/TourB_animation/assets/' });
  const of = globalThis.fetch; let requests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    eq(url, 'https://example.test/TourB_animation/assets/assets.manifest.json');
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, json: async () => ({ assets: { sample: { type: 'json', file: 'sample.json' } } }) };
  };
  try {
    const [a, b] = await Promise.all([am.init('assets.manifest.json'), am.init()]);
    ok(a && b && am.manifest.sample, 'манифест не загружен');
    eq(requests, 1, 'одновременный init должен выполнять один запрос');
  } finally { globalThis.fetch = of; }
});
await test('AssetManager: 404 манифеста не прерывает запуск, пишет URL и допускает повторную попытку', async () => {
  const am = new AssetManager({}, { baseUrl: 'https://example.test/TourB_animation/assets/' });
  const of = globalThis.fetch, oe = console.error; let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return requests === 1
      ? { ok: false, status: 404 }
      : { ok: true, json: async () => ({ assets: {} }) };
  };
  console.error = () => {};
  try {
    eq(await am.init(), false, '404 манифеста должен быть мягкой ошибкой');
    ok(am.errors[0]?.message.includes('https://example.test/TourB_animation/assets/assets.manifest.json') && am.errors[0]?.message.includes('HTTP 404'), am.errors[0]?.message);
    ok(requests === 1 && await am.init(), 'повторный запрос не смог загрузить манифест');
    eq(requests, 2);
  } finally { globalThis.fetch = of; console.error = oe; }
});
await test('AssetManager: одновременная загрузка GLTF одного ключа использует один запрос', async () => {
  const am = new AssetManager({});
  let requests = 0;
  const gltf = { scene: { traverse() {} } };
  am._gltf = { loadAsync: async (url) => {
    requests++;
    eq(url, new URL('models/sample.glb', am.baseUrl).href);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return gltf;
  } };
  am.manifest = { sample: { type: 'gltf', file: 'models/sample.glb', status: 'Available' } };
  await Promise.all([am.load(['sample']), am.load(['sample'])]);
  eq(requests, 1, 'GLTF не должен загружаться повторно');
  eq(am.get('sample'), gltf);
});
await test('AssetManager: сбой GLTF сохраняет диагностический URL и не прерывает загрузку', async () => {
  const am = new AssetManager({}, { baseUrl: 'https://example.test/TourB_animation/assets/' });
  am._gltf = { loadAsync: async () => { throw new Error('HTTP 404'); } };
  am.manifest = { sample: { type: 'gltf', file: 'models/missing.glb', status: 'Available' } };
  const oe = console.error; console.error = () => {};
  try { await am.load(['sample']); } finally { console.error = oe; }
  eq(am.get('sample'), null);
  ok(am.errors[0]?.message.includes('https://example.test/TourB_animation/assets/models/missing.glb'), am.errors[0]?.message);
});
await test('AssetManager: release освобождает GLTF-геометрию, материал и текстуру', async () => {
  const am = new AssetManager({});
  const scene = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  scene.add(new THREE.Mesh(geometry, material));
  am._gltf = { loadAsync: async () => ({ scene }) };
  am.manifest = { sample: { type: 'gltf', file: 'models/sample.glb', status: 'Available' } };
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  material.addEventListener('dispose', () => disposed++);
  texture.addEventListener('dispose', () => disposed++);
  await am.load(['sample']);
  am.release(['sample']);
  eq(disposed, 3, 'не все ресурсы освободились');
  eq(am.get('sample'), null);
});
await test('PerfMonitor: статистика кадров (среднее, минимум, 1% low, зависания)', () => {
  const pm = new PerfMonitor({ info: { render: {}, memory: {} } });
  for (let i = 0; i < 99; i++) pm.frame(10, i * 10); pm.frame(500, 1000);
  const st = pm.stats();
  eq(st.frames, 100); eq(st.stalls250, 1); eq(st.maxMs, 500); eq(st.minFps, 2);
  ok(Math.abs(st.avgFps - 1000 / 14.9) < 0.1, `avgFps ${st.avgFps}`); ok(st.low1Fps <= 100, `low1 ${st.low1Fps}`);
});

console.log(`\n${failed ? 'ПРОВАЛ' : 'OK'}: ${passed} пройдено, ${failed} не пройдено`);
process.exit(failed ? 1 : 0);
