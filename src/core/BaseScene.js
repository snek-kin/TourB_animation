import * as THREE from 'three';
import { disposeObject } from './Disposer.js';
import { gsap } from './gsap.js';

/**
 * Базовый класс сцены. Жизненный цикл (вызывает SceneManager):
 *   preload() → build() → enter() → update(dt) … → exit() → dispose()
 *  - preload: загрузка ассетов из манифеста (можно фоном, пока играет предыдущая сцена);
 *  - build:   создание объектов (вызывается под «шторой» перехода, чтобы не было подвисаний на виду);
 *  - enter:   запуск GSAP-таймлайна и камеры;
 *  - dispose: освобождение GPU-памяти — всё, что создано, регистрируется через track().
 */
export class BaseScene {
  constructor(app, { id, duration, feature = null }) {
    this.app = app;
    this.id = id;
    this.duration = duration;
    this.feature = feature;       // id из data/features.js → бейдж статуса в HUD
    this.scene = new THREE.Scene();
    this.timeline = null;
    this.elapsed = 0;
    this._tracked = [];
  }

  /** Ключи ассетов из assets/assets.manifest.json, которые сцена хочет загрузить (отсутствующие — не ошибка). */
  get requiredAssets() { return []; }
  /** Подмножество, без которого сцена не может работать: при отсутствии preload() бросает понятную ошибку. */
  get criticalAssets() { return []; }

  async preload(onProgress) {
    const keys = [...new Set([...this.requiredAssets, ...this.criticalAssets])];
    await this.app.assets.load(keys, onProgress);
    if (this.criticalAssets.length) this.app.assets.require(this.criticalAssets);
  }

  /** Адаптивное качество: q = { level, density, pixelRatio }. Сцена прореживает свои эффекты. */
  setQuality(_q) {}
  build() {}
  enter() {}
  update(_dt, _t) {}       // логика сцены; камера ЕЩЁ не обновлена
  lateUpdate(_dt) {}       // после камеры: billboard-карточки, масштаб точек и всё, что зависит от камеры
  exit() { this.timeline?.pause(); }

  /**
   * Мастер-таймлайн сцены. Он на паузе и ведётся вручную: SceneManager каждый кадр ставит
   * timeline.time(scene.elapsed). Поэтому пауза, перемотка (seek) и запись видео детерминированы
   * и не зависят от FPS (GSAP-часы и кадры не расходятся).
   */
  createTimeline() {
    this.timeline = gsap.timeline({ paused: true });
    return this.timeline;
  }

  track(obj) { this._tracked.push(obj); return obj; }

  dispose() {
    this.timeline?.kill();
    for (const o of this._tracked) {
      if (o?.isObject3D) disposeObject(o);
      else o?.dispose?.();
    }
    this._tracked.length = 0;
    this.scene.clear();
  }
}
