import gsap from 'gsap';

globalThis.gsap = gsap;
const THREE = await import('three');
const { BaseScene } = await import('../src/core/BaseScene.js');
const { SceneManager } = await import('../src/core/SceneManager.js');
const { SequenceDirector } = await import('../src/core/SequenceDirector.js');
const { CameraController } = await import('../src/core/CameraController.js');
const { CinematicCameraController } = await import('../src/core/CinematicCameraController.js');
const { TransitionManager } = await import('../src/core/TransitionManager.js');
const { App } = await import('../src/core/App.js');

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
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function createHarness({ transitionRun } = {}) {
  const disposed = [];
  const app = {
    assets: { load: async () => {} },
    quality: {},
    cameraCtl: { reset() {}, snap() {} },
    hud: { setScene() {}, setPaused() {}, setEnded() {} },
    markSceneChange() {},
    reportError(error) { throw error; },
    transitions: {
      run: transitionRun ?? (async (_name, context) => { await context.swap(); }),
      cancel() {},
    },
  };
  class TestScene extends BaseScene {
    constructor(a, id) { super(a, { id, duration: 10 }); }
    dispose() { disposed.push(this.id); super.dispose(); }
  }
  app.scenes = new SceneManager(app);
  app.scenes.register({ id: 'one', create: (a) => new TestScene(a, 'one') });
  app.scenes.register({ id: 'two', create: (a) => new TestScene(a, 'two') });
  app.scenes.register({ id: 'three', create: (a) => new TestScene(a, 'three') });
  app.director = new SequenceDirector(app.scenes);
  return { app, disposed };
}

console.log('Sequence director');
await test('scene start adopts the director and advances deterministically through configured durations', async () => {
  const { app } = createHarness();
  const cues = [];
  app.director = new SequenceDirector(app.scenes, {
    sequence: [
      { scene: 'one', duration: 2, cues: [{ at: 0.5, run: ({ scene }) => cues.push(scene.id) }] },
      { scene: 'two', duration: 3 },
    ],
  });
  app.scenes.app.director = app.director;
  await app.scenes.start(0);
  eq(app.director.state, 'playing');
  eq(app.director.getProgress().sequenceProgress, 0);
  app.director.update(0.25);
  app.director.update(0.25);
  eq(cues.length, 1, 'cue should fire once at its crossed time');
  eq(app.scenes.current.elapsed, 0.5);
  app.director.update(1.5);
  await settle();
  eq(app.director.index, 1);
  eq(app.scenes.current.id, 'two');
  eq(app.director.getProgress().sequenceProgress, 0.4);
});

await test('pause, resume, skip, restart, and end update the sequence state', async () => {
  const { app } = createHarness();
  app.director = new SequenceDirector(app.scenes, {
    sequence: [{ scene: 'one', duration: 2 }, { scene: 'two', duration: 2 }, { scene: 'three', duration: 2 }],
  });
  app.scenes.app.director = app.director;
  await app.scenes.start(0);
  app.director.update(0.5);
  ok(app.director.pause());
  app.director.update(1);
  eq(app.director.elapsed, 0.5);
  ok(await app.director.skip());
  eq(app.director.state, 'paused', 'skip while paused should retain pause state');
  eq(app.director.index, 1);
  ok(app.director.resume());
  ok(await app.director.skip());
  eq(app.director.index, 2);
  await app.director.restart();
  eq(app.director.index, 0);
  ok(app.director.stop());
  eq(app.director.state, 'stopped');
  await app.director.play();
  eq(app.director.state, 'playing');
  eq(app.director.elapsed, 0);
  app.director.update(2);
  await settle();
  app.director.update(2);
  await settle();
  app.director.update(2);
  eq(app.director.state, 'ended');
  eq(app.director.getProgress().segmentProgress, 1);
});

await test('SceneManager still disposes prior scenes and honors existing navigation without a director', async () => {
  let transitionDuration;
  const { app, disposed } = createHarness({
    transitionRun: async (_name, context) => {
      transitionDuration = context.duration;
      await context.swap();
    },
  });
  await app.scenes.goTo(0, { transition: 'cut', duration: 0.25 });
  eq(transitionDuration, 0.25, 'transition duration was not forwarded');
  app.scenes.update(10);
  await settle();
  eq(app.scenes.current.id, 'two');
  ok(disposed.includes('one'), 'previous scene was not disposed');
});

await test('SceneManager disposal releases its current and preloaded scenes', async () => {
  const { app, disposed } = createHarness();
  await app.scenes.goTo(0, { transition: 'cut' });
  await settle();
  app.scenes.dispose();
  ok(disposed.includes('one'), 'current scene was not disposed');
  ok(disposed.includes('two'), 'preloaded scene was not disposed');
});

await test('App disposal removes registered listeners and is safe to repeat', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  try {
    const app = new App({ canvas: {}, stage: {} });
    let removed = 0;
    const target = {
      addEventListener() {},
      removeEventListener() { removed++; },
    };
    app._listen(target, 'test', () => {});
    app.dispose();
    app.dispose();
    eq(removed, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

console.log('Camera choreography');
await test('keyframes progress with frame deltas and cancellation holds the current pose', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 10);
  const base = new CameraController(camera);
  const choreography = new CinematicCameraController(base);
  choreography.animateTo({ position: [10, 0, 10], target: [0, 0, 0], fov: 45 }, { duration: 1 });
  choreography.update(0.4);
  const heldX = camera.position.x;
  ok(heldX > 0 && heldX < 10, `unexpected interpolated x ${heldX}`);
  ok(choreography.cancel());
  choreography.update(0.4);
  eq(camera.position.x, heldX, 'cancel should hold the pose');
  eq(choreography.getState().held, true);
  choreography.release();
  choreography.playKeyframes([
    { position: [5, 0, 10], duration: 1 },
    { position: [10, 0, 10], target: [0, 0, 0], fov: 45, duration: 1 },
  ]);
  choreography.update(1.5);
  ok(camera.position.x > 5 && camera.position.x < 10, 'keyframes did not run sequentially');
  ok(camera.fov < 60 && camera.fov > 45, 'FOV did not interpolate');
  ok(choreography.cancel());
  choreography.dispose();
});

console.log('Transition cancellation');
await test('an interrupted dip cancels its animation and never swaps scenes', async () => {
  const veil = { opacity: 0 };
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: () => veil };
  try {
    const transitions = new TransitionManager({});
    let swaps = 0;
    const running = transitions.run('dip', { duration: 1, swap: async () => { swaps++; } });
    await settle();
    ok(transitions.cancel());
    const result = await running;
    eq(result.cancelled, true);
    eq(swaps, 0);
    eq(veil.opacity, 0);
    transitions.dispose();
  } finally {
    globalThis.document = previousDocument;
  }
});

await test('overlapping transitions wait for an in-progress scene swap', async () => {
  const transitions = new TransitionManager({});
  let finishSwap, swaps = 0;
  transitions.register('delayed', async ({ swap }) => { await swap(); });
  const first = transitions.run('delayed', {
    swap: () => { swaps++; return new Promise((resolve) => { finishSwap = resolve; }); },
  });
  await settle();
  const second = transitions.run('cut', { swap: async () => { swaps++; } });
  await settle();
  eq(swaps, 1, 'overlapping swap started while the first was still active');
  finishSwap();
  await Promise.all([first, second]);
  eq(swaps, 2);
  transitions.dispose();
});

console.log(`\n${failed ? 'FAIL' : 'OK'}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
