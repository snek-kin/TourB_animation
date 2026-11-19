import { App } from './core/App.js';
import { SandboxScene } from './scenes/SandboxScene.js';
import { ValidationDigitalScene } from './scenes/ValidationDigitalScene.js';
import { ValidationMapScene } from './scenes/ValidationMapScene.js';
import { DigitalWorldScene } from './scenes/DigitalWorldScene.js';
import { BishkekMapScene } from './scenes/BishkekMapScene.js';
import { DEMO_STORY } from './data/demoStory.js';
import { initializePostHog, presentationLogger } from './posthog.js';

initializePostHog();

const app = new App({ canvas: document.getElementById('gl'), stage: document.getElementById('stage') });
globalThis.tourb = app; // для отладки из консоли: tourb.scenes, tourb.cameraCtl …

try {
  await app.init();
  app.storytelling.register(DEMO_STORY);
  // Технические стенды и первая производственная сцена:
  //   по умолчанию: val-digital → digital → bishkek → val-map → (dip) → в начало;
  //   ?scene=sandbox — старый «всё в одном» стенд (худший случай по нагрузке).
  if (app.params.get('scene') === 'sandbox') {
    app.scenes.register({ id: 'sandbox', create: (a) => new SandboxScene(a), loop: true });
  } else {
   app.scenes
  .register({ id: 'val-digital', create: (a) => new ValidationDigitalScene(a), transition: 'dip' })
  .register({ id: 'digital', create: (a) => new DigitalWorldScene(a), transition: 'dip' })
   .register({ id: 'bishkek', create: (a) => new BishkekMapScene(a), transition: 'dip' })
  .register({ id: 'val-map', create: (a) => new ValidationMapScene(a), transition: 'dip', loop: true });
  }

  app.hud.setLoading(0.1, 'Подготовка сцены…');
  await app.scenes.prepare(0, (p) => app.hud.setLoading(0.1 + p * 0.9, 'Загрузка ассетов…'));
  // Старт только по клику: браузер не разрешает звук и полноэкранный режим без жеста пользователя.
  const begin = async () => {
    app.audio.unlock();
    app.storytelling.setAvailable(false);
    await app.scenes.start(0);
    app.storytelling.setAvailable(true);
    if (app.bench) app.runBench();
  };
  // ?bench — запуск без клика (звук не нужен), чтобы замер не зависел от человека
  if (app.bench) { app.hud.el.loader.classList.add('done'); begin(); } else app.hud.showStart(begin);
} catch (e) {
  presentationLogger.error('presentation initialization failed', { stage: 'application_startup' });
  app.reportError(e);
}
