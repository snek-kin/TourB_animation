import gsap from 'gsap';
globalThis.gsap = gsap;

const THREE = await import('three');
const { StorytellingEngine } = await import('../src/storytelling/StorytellingEngine.js');
const { StoryPanel } = await import('../src/storytelling/StoryPanel.js');
const { HotspotManager } = await import('../src/storytelling/HotspotManager.js');
const { ObjectHighlighter } = await import('../src/storytelling/ObjectHighlighter.js');
const { CameraController } = await import('../src/core/CameraController.js');
const { CinematicCameraController } = await import('../src/core/CinematicCameraController.js');

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (error) { failed++; console.error('  ✗', name, '\n     ', error.stack ?? error); }
};
const eq = (actual, expected, message = 'values differ') => {
  if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`);
};
const ok = (condition, message = 'expected condition to be true') => {
  if (!condition) throw new Error(message);
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

class FakeElement {
  constructor(tagName = 'div', fragment = false) {
    this.tagName = tagName;
    this.isFragment = fragment;
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.hidden = false;
    this._textContent = '';
    this.disabled = false;
    this.onclick = null;
  }
  get childElementCount() { return this.children.length; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent; }
  set textContent(value) { this._textContent = String(value); this.replaceChildren(); }
  append(...elements) {
    for (const element of elements) {
      if (element?.isFragment) { this.append(...element.children); element.children = []; continue; }
      element.parentElement?.removeChild(element);
      element.parentElement = this;
      this.children.push(element);
    }
  }
  appendChild(element) { this.append(element); return element; }
  replaceChildren(...elements) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...elements); }
  removeChild(element) { this.children = this.children.filter((child) => child !== element); element.parentElement = null; }
  remove() { this.parentElement?.removeChild(this); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener({ target: this, ...event }); }
  click() { this.dispatch('click'); this.onclick?.({ target: this }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  focus() { this.focused = true; }
}
const fakeDocument = {
  createElement: (tag) => new FakeElement(tag),
  createDocumentFragment: () => new FakeElement('#fragment', true),
};

function harness() {
  const stage = new FakeElement('stage');
  const canvas = new FakeElement('canvas');
  canvas.parentElement = stage;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const cinematicCamera = {
    active: false, paused: false, remaining: 0, snapshot: null,
    animateTo(_pose, options = {}) { this.active = true; this.paused = false; this.remaining = options.duration ?? 1; },
    update(dt) { if (this.active && !this.paused) { this.remaining -= dt; if (this.remaining <= 0) this.active = false; } },
    getState() { return { active: this.active }; },
    cancel() { this.active = false; this.paused = false; },
    release() { this.cancel(); },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
    suspend() { this.snapshot = { active: this.active }; this.cancel(); return this.snapshot; },
    restore(snapshot) { this.snapshot = snapshot; },
  };
  const app = {
    stage, camera, renderer: { domElement: canvas },
    scenes: { current: { id: 'test-scene', scene }, paused: false },
    cinematicCamera,
    director: { state: 'stopped', pause() { this.state = 'paused'; }, resume() { this.state = 'playing'; } },
    hud: { setPaused() {} },
    reportError(error) { throw error; },
  };
  return { app, stage, canvas, scene, camera };
}

console.log('Storytelling engine');
await test('story registration validates definitions and rejects duplicate ids', () => {
  const { app } = harness();
  const engine = new StorytellingEngine(app, { document: fakeDocument });
  const story = { id: 'valid', chapters: [{ id: 'chapter', steps: [{ id: 'step', actions: [] }] }] };
  engine.register(story);
  eq(engine.stories.get('valid'), story);
  let duplicate = false, invalid = false;
  try { engine.register(story); } catch { duplicate = true; }
  try { engine.register({ id: 'bad', chapters: [{ id: 'c', steps: [{ id: 's', actions: [{ type: 'unknown' }] }] }] }); }
  catch { invalid = true; }
  ok(duplicate && invalid, 'invalid story registration was accepted');
  engine.dispose();
});

await test('chapters, steps, previous/next, restart, and repeated execution are deterministic', async () => {
  const { app } = harness();
  const engine = new StorytellingEngine(app, { document: fakeDocument });
  engine.register({ id: 'nav', chapters: [
    { id: 'one', title: 'One', steps: [{ id: 'a', actions: [] }, { id: 'b', actions: [] }] },
    { id: 'two', title: 'Two', steps: [{ id: 'c', actions: [] }] },
  ] });
  engine.start('nav'); await flush();
  eq(engine.getState().stepId, 'a');
  ok(engine.next()); await flush();
  eq(engine.getState().stepId, 'b');
  ok(engine.next()); await flush();
  eq(engine.getState().chapterId, 'two');
  ok(engine.previous()); await flush();
  eq(engine.getState().stepId, 'b');
  ok(engine.restart()); await flush();
  eq(engine.getState().stepId, 'a');
  ok(engine.next()); await flush();
  ok(engine.next()); await flush();
  ok(engine.next()); await flush();
  eq(engine.state, 'ended');
  ok(engine.restart()); await flush();
  eq(engine.state, 'awaiting-input');
  ok(!engine.panel.nextButton.hidden, 'completed steps should offer navigation');
  eq(engine.getState().stepId, 'a');
  engine.stop(); engine.dispose();
});

await test('action order is deterministic and wait pauses with the story', async () => {
  const { app } = harness();
  const engine = new StorytellingEngine(app, { document: fakeDocument });
  const order = [];
  engine.addEventListener('demo:first', () => order.push('first'));
  engine.addEventListener('demo:last', () => order.push('last'));
  engine.register({ id: 'actions', chapters: [{ id: 'c', steps: [{
    id: 's', actions: [
      { type: 'event', name: 'demo:first' },
      { type: 'wait', duration: 0.5 },
      { type: 'event', name: 'demo:last' },
    ],
  }] }] });
  engine.start('actions'); await flush();
  eq(order.join(','), 'first');
  ok(engine.pause());
  engine.update(1);
  await flush();
  eq(order.length, 1, 'paused wait advanced');
  ok(engine.resume());
  engine.update(0.25); await flush();
  eq(order.length, 1);
  engine.update(0.3); await flush();
  eq(order.join(','), 'first,last');
  eq(engine.state, 'awaiting-input');
  ok(!engine.panel.nextButton.hidden, 'completed steps should offer navigation');
  engine.stop(); engine.dispose();
});

await test('next cancels the interrupted action and interaction waits resolve from a hotspot click', async () => {
  const { app, canvas } = harness();
  const engine = new StorytellingEngine(app, { document: fakeDocument });
  let cancelled = false;
  engine.registerAction('hold', (_action, signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => { cancelled = true; resolve(); }, { once: true });
  }));
  engine.register({ id: 'interactive', hotspots: [{
    id: 'point', position: [0, 0, 0], label: 'Demo point',
    content: { title: 'Demo point details', facts: ['Mock fact'] },
  }], chapters: [{ id: 'c', steps: [
    { id: 'cancel-me', actions: [{ type: 'hold' }] },
    { id: 'interact', actions: [{ type: 'interaction', hotspotId: 'point' }] },
  ] }] });
  engine.start('interactive'); await flush();
  ok(engine.next()); await flush();
  ok(cancelled, 'interrupted action did not receive cancellation');
  eq(engine.state, 'awaiting-interaction');
  ok(engine.panel.nextButton.hidden, 'interaction must be required before continuing');
  canvas.dispatch('pointermove', { clientX: 50, clientY: 50 });
  eq(canvas.style.cursor, 'pointer', 'hover feedback missing');
  canvas.dispatch('pointerdown', { button: 0, clientX: 50, clientY: 50 });
  await flush();
  eq(engine.state, 'awaiting-input', 'interaction should finish the action and await navigation');
  eq(engine.panel.title.textContent, 'Demo point details');
  ok(engine.panel.facts.textContent.includes('Mock fact'));
  engine.stop(); engine.dispose();
  eq(canvas.listeners.get('pointerdown').size, 0, 'hotspot pointer listener leaked');
});

await test('hotspots support object targets, enable/disable, unregister, and listener disposal', () => {
  const { canvas, camera } = harness();
  const originalDocument = globalThis.document;
  globalThis.document = fakeDocument;
  const activations = [];
  const hotspot = new HotspotManager({ element: canvas, camera, onActivate: (entry) => activations.push(entry.id) });
  const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  const unregisterObject = hotspot.register({ id: 'object', object });
  const unregisterPoint = hotspot.register({ id: 'point', position: [0, 0, 0], radiusPx: 20 });
  canvas.dispatch('pointerdown', { button: 0, clientX: 50, clientY: 50 });
  ok(activations.length === 1, 'raycast did not activate an object hotspot');
  hotspot.setEnabled('object', false);
  hotspot.setEnabled('point', false);
  canvas.dispatch('pointerdown', { button: 0, clientX: 50, clientY: 50 });
  eq(activations.length, 1, 'disabled hotspots were activated');
  unregisterObject(); unregisterPoint(); hotspot.dispose();
  eq(canvas.listeners.get('pointermove').size, 0);
  eq(canvas.listeners.get('pointerdown').size, 0);
  globalThis.document = originalDocument;
  object.geometry.dispose(); object.material.dispose();
});

await test('information panel renders safe content and disposes its DOM', () => {
  const stage = new FakeElement('stage');
  let closed = 0, next = 0;
  const panel = new StoryPanel({ stage, document: fakeDocument, onClose: () => closed++, onNext: () => next++ });
  panel.setLaunch(() => {}, 'Launch demo');
  panel.setAvailable(true);
  ok(!panel.launcher.hidden, 'available story should expose its launcher');
  panel.show({
    title: '<title>',
    description: 'Demo description',
    facts: ['Fact'],
    statistics: [{ label: 'Count', value: 'Demo' }],
    image: { src: 'demo.png', alt: 'Demo image' },
  }, { chapterTitle: 'Demo', chapterIndex: 0, chapterCount: 2, stepIndex: 0, stepCount: 3, state: 'playing' });
  ok(panel.launcher.hidden, 'launcher should be hidden while its story panel is open');
  eq(panel.title.textContent, '<title>');
  eq(panel.facts.children[0].textContent, 'Fact');
  eq(panel.statistics.children[0].textContent, 'Count');
  eq(panel.image.alt, 'Demo image');
  panel.closeButton.click(); panel.nextButton.click();
  eq(closed, 1); eq(next, 1);
  panel.close();
  ok(!panel.launcher.hidden, 'closing the panel should restore the available launcher');
  panel.dispose();
  eq(stage.children.length, 0, 'panel elements were not removed');
});

await test('object highlights are removed and their GPU resources are disposed', () => {
  const scene = new THREE.Scene();
  const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  scene.add(target);
  const highlighter = new ObjectHighlighter();
  ok(highlighter.highlight(target, scene));
  const helper = highlighter.helper;
  let disposed = false;
  helper.geometry.addEventListener('dispose', () => { disposed = true; });
  highlighter.update();
  highlighter.clear();
  ok(disposed && !scene.children.includes(helper), 'highlight resources were not cleaned up');
  ok(highlighter.highlight([1, 0, 1], scene));
  highlighter.dispose();
  scene.remove(target); target.geometry.dispose(); target.material.dispose();
});

await test('cinematic camera pauses and restores a suspended sequence animation', () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const base = new CameraController(camera);
  const cinematic = new CinematicCameraController(base);
  cinematic.playKeyframes([{ position: [0, 4, 10], target: [0, 0, 0], duration: 2 }]);
  cinematic.update(0.5);
  const snapshot = cinematic.suspend();
  eq(cinematic.getState().active, false);
  cinematic.animateTo({ position: [3, 5, 8], target: [1, 0, 0] }, { duration: 0.2 });
  cinematic.update(0.2);
  cinematic.release();
  ok(cinematic.restore(snapshot));
  eq(cinematic.getState().elapsed, 0.5);
  cinematic.pause(); cinematic.update(0.5);
  eq(cinematic.getState().elapsed, 0.5, 'paused camera advanced');
  cinematic.resume(); cinematic.update(0.5);
  eq(cinematic.getState().elapsed, 1);
  cinematic.dispose(); base.dispose();
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
