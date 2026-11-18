import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { CameraController } from './CameraController.js';
import { AssetManager } from './AssetManager.js';
import { AudioManager } from './AudioManager.js';
import { TransitionManager } from './TransitionManager.js';
import { SceneManager } from './SceneManager.js';
import { PerfMonitor } from './PerfMonitor.js';
import { Hud } from '../ui/Hud.js';
import { posthog } from '../posthog.js';

/**
 * Точка сборки: рендерер, ЕДИНСТВЕННЫЙ цикл (setAnimationLoop), таймер, ресайз 16:9, адаптивное качество,
 * горячие клавиши, обработка ошибок. Параметры адреса (для отладки и замеров):
 *   ?debug  панель FPS/памяти      ?noadapt  без автоснижения качества     ?pr=1  фиксированный pixelRatio
 *   ?aa=0|1 принудительно MSAA     ?q=N      стартовый уровень качества    ?scene=id  стартовая сцена
 *   ?bench=60  замер N секунд с отчётом (для реального железа)
 */
export class App {
  constructor({ canvas, stage }) {
    this.canvas = canvas;
    this.stage = stage;
    this.params = new URLSearchParams(globalThis.location?.search ?? '');
    this.timer = new THREE.Timer();              // THREE.Clock объявлен устаревшим с r183
    this.timer.connect(globalThis.document);     // на скрытой вкладке dt = 0, без гигантских скачков
    this.dpr = globalThis.devicePixelRatio || 1;
    this.bench = this.params.has('bench') ? Number(this.params.get('bench')) || 60 : 0;
    this.adaptive = this.params.has('adapt') || !(this.params.has('noadapt') || this.bench);
    const q = CONFIG.quality;
    this.pixelRatioStart = this.params.has('pr') ? Number(this.params.get('pr')) : Math.min(this.dpr, q.maxPixelRatio);
    this.pixelRatio = this.pixelRatioStart;
    this.antialias = this.params.has('aa') ? this.params.get('aa') !== '0' : this.dpr < q.antialiasMaxDpr;
    this.quality = { level: 0, density: 1, pixelRatio: this.pixelRatio };
    this._frames = 0;
    this._win = { frames: 0, time: 0, skip: 1, low: 0 };
    this._debugAt = 0;
  }

  async init() {
    this.hud = new Hud();
    this._bindErrors();

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.antialias, powerPreference: 'high-performance' });
    } catch (e) {
      this.hud.showError('Не удалось создать WebGL-контекст.\nОбновите браузер или включите аппаратное ускорение (Chrome/Edge).');
      throw e;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(CONFIG.palette.navy);
    // Диагностика шейдеров: понятное сообщение вместо длинного дампа three; отключение делает ShaderGuard.
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      console.error(`[Shader] программа не собралась.\nlink: ${gl.getProgramInfoLog(program)}\nvertex: ${gl.getShaderInfoLog(vs)}\nfragment: ${gl.getShaderInfoLog(fs)}`);
    };

    const { fov, near, far } = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(fov, CONFIG.design.aspect, near, far);
    this.cameraCtl = new CameraController(this.camera);
    this.perf = new PerfMonitor(this.renderer);

    this.assets = new AssetManager(this.renderer);
    if (!(await this.assets.init())) this.hud.notice('Манифест ассетов не загружен — работаем без внешних ассетов (см. консоль).', 'warn');
    this.audio = new AudioManager(this.assets);
    this.transitions = new TransitionManager(this);
    this.scenes = new SceneManager(this);

    if (this.params.has('q')) this._setQualityLevel(Number(this.params.get('q')) || 0);
    this.resize();
    globalThis.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.renderer.setAnimationLoop(null);
      this.hud.showError('Графический контекст потерян (драйвер или нехватка памяти). Ждём восстановления; если не вернётся — перезагрузите страницу.');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.hud.el.error.hidden = true;
      this.timer.reset();
      this.renderer.setAnimationLoop((t) => this._tick(t));
    });
    this._bindKeys();
    this.renderer.setAnimationLoop((t) => this._tick(t));
  }

  /** Сцена вписывается в окно как 16:9; CSS-переменная --u = высота/1080 масштабирует весь HUD. */
  resize() {
    const w = Math.min(globalThis.innerWidth, globalThis.innerHeight * CONFIG.design.aspect);
    const h = w / CONFIG.design.aspect;
    this.stage.style.width = `${w}px`;
    this.stage.style.setProperty('--u', `${h / CONFIG.design.height}px`);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = CONFIG.design.aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Уровни качества. Сначала прореживаем частицы (глазу почти незаметно): densitySteps; затем уменьшаем
   * внутреннее разрешение (картинка остаётся 16:9, становится мягче) — вплоть до minPixelRatio.
   */
  get maxQualityLevel() {
    const q = CONFIG.quality;
    const extra = Math.ceil(Math.log(q.minPixelRatio / this.pixelRatioStart) / Math.log(q.step));
    return q.densitySteps.length - 1 + Math.max(0, extra);
  }

  _setQualityLevel(level) {
    const q = CONFIG.quality;
    level = Math.max(0, Math.min(level, this.maxQualityLevel));
    const di = Math.min(level, q.densitySteps.length - 1);
    const extra = Math.max(0, level - (q.densitySteps.length - 1));
    const pr = Math.max(q.minPixelRatio, this.pixelRatioStart * q.step ** extra);
    this.quality = { level, density: q.densitySteps[di], pixelRatio: pr };
    const prChanged = Math.abs(pr - this.pixelRatio) > 1e-6;
    this.pixelRatio = pr;
    if (this.renderer && prChanged) this.resize();
    this.scenes?.current?.setQuality(this.quality);
    this.perf?.qualityLog.push({ t: +((performance.now() - this.perf.t0) / 1000).toFixed(1), ...this.quality, fps: +this.perf.fps.toFixed(1) });
    console.info(`[quality] уровень ${level}: плотность ${this.quality.density}, pixelRatio ${pr.toFixed(2)}`);
  }

  /** Вызывается SceneManager при смене сцены: первое окно после смены (сборка, прогрев) не оцениваем. */
  markSceneChange() { Object.assign(this._win, { skip: 1, frames: 0, time: 0, low: 0 }); }

  _adaptQuality(rawDt) {
    if (!this.adaptive) return;
    const w = this._win, q = CONFIG.quality;
    if (this.scenes.busy || this.scenes.paused || globalThis.document?.hidden || rawDt <= 0) return;
    w.frames++; w.time += rawDt;
    if (w.time < q.checkEverySec) return;
    const fps = w.frames / w.time;
    w.frames = 0; w.time = 0;
    if (w.skip > 0) { w.skip--; return; }
    // Снижаем только после ДВУХ подряд «плохих» окон (≈4 с): одиночный тяжёлый кадр (сборка, GC) не закрепляет низкое качество.
    w.low = fps < q.targetFps ? w.low + 1 : 0;
    if (w.low >= 2 && this.quality.level < this.maxQualityLevel) { w.low = 0; this._setQualityLevel(this.quality.level + 1); }
  }

  _tick(timestamp) {
    this.timer.update(timestamp);
    const raw = this._frames++ === 0 ? 0 : this.timer.getDelta();     // первый кадр: дельта = время загрузки страницы, не берём
    const dt = Math.min(raw, CONFIG.quality.maxDt);                    // анимация видит ограниченный dt…
    if (raw > 0) this.perf.frame(raw * 1000, timestamp);               // …а статистика — настоящий
    const stepped = this.scenes.update(dt);
    this.cameraCtl.update(stepped);
    this.scenes.lateUpdate(stepped);
    const scene = this.scenes.current?.scene;
    if (scene) { this.renderer.render(scene, this.camera); this.perf.notePeak(); }
    this._adaptQuality(raw);
    if (this.hud.debugOn && (timestamp ?? 0) - this._debugAt > 250) { this._debugAt = timestamp ?? 0; this._debug(); }
  }

  _debug() {
    const i = this.renderer.info, s = this.scenes.current, c = this.cameraCtl.stats, p = this.perf.stats(Math.max(0, this.perf.count - 120));
    this.hud.setDebug([
      `FPS ${this.perf.fps.toFixed(0)} (окно: ср ${p.avgFps ?? '-'}, мин ${p.minFps ?? '-'})  кадр ${this.perf.emaMs.toFixed(1)} мс`,
      `качество L${this.quality.level} плотн ${this.quality.density}  pixelRatio ${this.pixelRatio.toFixed(2)}  MSAA ${this.antialias ? 'вкл' : 'выкл'}`,
      `draw calls ${i.render.calls}  треуг. ${i.render.triangles}  точек ${i.render.points}`,
      `геометрии ${i.memory.geometries}  текстуры ${i.memory.textures}  программы ${(i.programs ?? []).length}`,
      `сцена ${s?.id ?? '-'}  ${s ? s.elapsed.toFixed(1) : 0}/${s?.duration ?? 0} с`,
      `камера v ${c.speed.toFixed(2)}  a ${c.accel.toFixed(1)}`,
      this.assets.errors.length ? `ошибки ассетов: ${this.assets.errors.length}` : '',
      this.assets.missing.size ? `отсутствуют ассеты: ${this.assets.missing.size}` : '',
    ].filter(Boolean).join('\n'));
  }

  _bindKeys() {
    globalThis.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.scenes.togglePause();
          posthog?.capture('presentation_pause_toggled', { paused: this.scenes.paused });
          break;
        case 'ArrowRight':
          this.scenes.next();
          posthog?.capture('scene_navigation_requested', { direction: 'next' });
          break;
        case 'ArrowLeft':
          this.scenes.prev();
          posthog?.capture('scene_navigation_requested', { direction: 'previous' });
          break;
        case 'KeyD': {
          // Переключение панели делаем до вызова аналитики: состояние UI не должно зависеть от SDK.
          const enabled = this.hud.toggleDebug();
          posthog?.capture('debug_panel_toggled', { enabled });
          break;
        }
        case 'KeyM': {
          const muted = !this.audio.muted;
          this.audio.setMuted(muted);
          this.hud.notice(
            muted ? 'Звук выключен.' : 'Звук включён, но аудиодорожки пока не добавлены.',
            muted ? 'warn' : 'ok',
          );
          posthog?.capture('audio_mute_toggled', { muted: this.audio.muted });
          break;
        }
        case 'KeyF': {
          const enabled = !document.fullscreenElement;
          if (document.fullscreenElement) document.exitFullscreen();
          else this.stage.requestFullscreen?.();
          posthog?.capture('fullscreen_toggled', { enabled });
          break;
        }
      }
    });
  }

  /** Замер на реальном железе. Модуль грузится только по требованию (?bench) — обычный запуск не затрагивается. */
  async runBench(seconds = this.bench || 60) {
    const { startBench } = await import('./Bench.js');
    startBench(this, seconds, { onDone: (r) => this.hud.showBench(r) });
  }

  _bindErrors() {
    globalThis.addEventListener('error', (e) => this.reportError(e.error ?? e.message));
    globalThis.addEventListener('unhandledrejection', (e) => this.reportError(e.reason));
  }

  reportError(err) {
    console.error(err);
    this.hud?.showError(`Ошибка: ${err?.message ?? err}\n(подробности — в консоли браузера, F12)`);
  }
}
