import { warmup } from './Warmup.js';
import { guardScene } from './ShaderGuard.js';

/**
 * Управляет порядком сцен, автопереходом по таймеру, фоновой предзагрузкой следующей сцены
 * и освобождением памяти предыдущей.
 * def: { id, create(app) → BaseScene, transition?: 'dip'|'cut'|'matchCut', loop?: boolean }
 */
export class SceneManager {
  constructor(app) {
    this.app = app;
    this.defs = [];
    this.index = -1;
    this.current = null;
    this.paused = false;
    this.busy = false;
    this.ended = false;
    this._next = null; // { index, scene } — предзагруженная следующая сцена
    this._preloadToken = 0;
    this._disposed = false;
  }

  register(def) {
    if (this._disposed) throw new Error('SceneManager has been disposed');
    this.defs.push(def);
    return this;
  }

  /** Создать, предзагрузить, построить и прогреть сцену, не запуская её (пока виден загрузочный экран). */
  async prepare(index = 0, onProgress) {
    if (this._disposed) throw new Error('SceneManager has been disposed');
    const scene = this.defs[index].create(this.app);
    await scene.preload(onProgress);
    if (this._disposed) { scene.dispose(); return; }
    await this._build(scene);
    if (this._disposed) { scene.dispose(); return; }
    this._next = { index, scene };
  }

  /** build() + прогрев шейдеров/текстур + защита от сломанных шейдеров. Идемпотентно. */
  async _build(scene) {
    if (scene._built) return;
    this.app.cameraCtl.reset();
    scene.build();
    scene._built = true;
    const { renderer, camera } = this.app;
    if (renderer) {
      await warmup(renderer, scene.scene, camera);
      if (this._disposed) return;
      guardScene(renderer, scene.scene, (b) =>
        this.app.hud?.notice(`Эффект отключён: ошибка шейдера (${b.object.name || b.object.type}). Сцена продолжит работу без него.`, 'warn'));
    }
  }

  /** Запустить сцену (после prepare — мгновенно). */
  start(index = 0) {
    if (this.app.director) return this.app.director.start(index);
    return this.goTo(index, { transition: 'cut' });
  }

  async goTo(i, { transition, duration } = {}) {
    if (this._disposed || this.busy || i < 0 || i >= this.defs.length) return;
    this.busy = true;
    this._preloadToken++; // любая идущая фоновая предзагрузка устарела
    try {
      let next;
      if (this._next?.index === i) { next = this._next.scene; this._next = null; }
      else {
        this._next?.scene.dispose(); this._next = null;
        next = this.defs[i].create(this.app);
        await next.preload();
      }
      if (this._disposed) { next.dispose(); return; }
      const prev = this.current;
      const swap = async () => {
        if (this._disposed) { next.dispose(); return; }
        if (prev) { prev.exit(); prev.dispose(); }
        await this._build(next);
        if (this._disposed) { next.dispose(); return; }
        this.current = next; this.index = i; this.ended = false;
        this.app.hud?.setScene(next);
        this.app.markSceneChange?.();
        next.setQuality(this.app.quality);
        next.enter();
      };
      const result = await this.app.transitions.run(transition ?? this.defs[i].transition ?? 'dip', {
        from: prev, to: next, swap, duration,
      });
      if (result?.cancelled) return;
      this._preloadNext();
    } catch (err) {
      this.app.reportError?.(err);
    } finally {
      this.busy = false;
    }
  }

  /** Вызывается после обновления камеры. */
  lateUpdate(dt) {
    if (this.current && !this.paused) this.current.lateUpdate(dt);
  }

  /** Перемотка текущей сцены на t секунд (отладка, покадровая запись). Камера встаёт без сглаживания. */
  seek(t) {
    const s = this.current;
    if (!s) return;
    s.elapsed = Math.max(0, t);
    s.timeline?.time(s.elapsed);
    s.update(0, s.elapsed);
    this.app.cameraCtl.snap();
    s.lateUpdate(0);
  }

  next() { return this.goTo(this.index + 1); }
  prev() { return this.goTo(this.index - 1); }

  togglePause() {
    if (this.busy) return;
    this.paused = !this.paused;
    this.app.hud?.setPaused(this.paused);
  }

  update(dt, { autoAdvance = true } = {}) {
    const s = this.current;
    if (!s || this.paused) return 0;
    s.elapsed += dt;
    s.timeline?.time(s.elapsed);
    s.update(dt, s.elapsed);
    if (autoAdvance && !this.ended && s.elapsed >= s.duration) {
      if (this.index < this.defs.length - 1) this.next();
      else if (this.defs[this.index].loop) this.goTo(0, { transition: 'dip' }); // по кругу: последняя → первая
      else { this.ended = true; this.app.hud?.setEnded(); }
    }
    return dt;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._preloadToken++;
    this.app.transitions?.cancel?.();
    this._next?.scene.dispose();
    this._next = null;
    this.current?.exit();
    this.current?.dispose();
    this.current = null;
    this.defs.length = 0;
  }

  /** Фоновая предзагрузка ассетов следующей сцены. Построение (GPU) — только при входе в неё. */
  async _preloadNext() {
    const i = this.index + 1;
    if (this._disposed || i >= this.defs.length || this._next) return;
    const token = ++this._preloadToken;
    try {
      const scene = this.defs[i].create(this.app);
      await scene.preload();
      // за время загрузки могли перейти на другую сцену — устаревший результат не сохраняем
      if (!this._disposed && token === this._preloadToken && !this._next && this.index + 1 === i) this._next = { index: i, scene };
      else scene.dispose();
    } catch (e) { console.warn('[SceneManager] предзагрузка следующей сцены не удалась:', e.message ?? e); }
  }
}
