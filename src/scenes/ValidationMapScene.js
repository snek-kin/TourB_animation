import * as THREE from 'three';
import { BaseScene } from '../core/BaseScene.js';
import { CONFIG } from '../config.js';
import { MatrixRain } from '../effects/MatrixRain.js';
import { GlowMarker } from '../effects/GlowMarker.js';
import { FloatingCard } from '../effects/FloatingCard.js';
import { createTestEnvironment, applyFog } from './shared/Environment.js';

const PLACES = [['Площадь Ала-Тоо', 'Бишкек'], ['Ала-Арча', 'Парк'], ['Сон-Куль', 'Озеро'], ['Каракол', 'Город'], ['Манас', 'Аэропорт']];

/**
 * ВАЛИДАЦИОННАЯ СЦЕНА 2/2 (технический стенд, НЕ сцена фильма): «карта».
 * Проверяет: InstancedMesh-окружение с коллайдерами, маркеры, плавающие карточки, HTML-панель поверх 3D,
 * камеру внутри кольца маркеров, зацикливание с переходом dip и полную очистку памяти.
 * Карточки и панель несут бейдж «Концепт» — это будущая идея, не функция продукта (features.js: living_city).
 */
export class ValidationMapScene extends BaseScene {
  constructor(app) { super(app, { id: 'val-map', duration: 14, feature: 'living_city' }); this.showDisclaimer = true; }

  build() {
    applyFog(this.scene);
    const env = createTestEnvironment({ seed: 47 });
    env.objects.forEach((o) => { this.scene.add(o); this.track(o); });

    this.rain = this.track(new MatrixRain({ opacity: 0.35, columns: 120 }));   // лёгкий «след» цифрового слоя
    this.scene.add(this.rain.object3D);

    this.markers = []; this.cards = [];
    PLACES.forEach(([title, sub], i) => {
      const a = (i / PLACES.length) * Math.PI * 2 + 0.4, r = 10;
      const m = this.track(new GlowMarker({ color: i % 2 ? CONFIG.palette.amber : CONFIG.palette.digitalGreen }));
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      const c = this.track(new FloatingCard({ title, subtitle: sub, width: 2.2 }));
      c.baseY = 4.2; c.position.set(m.position.x, 4.2, m.position.z);
      this.scene.add(m, c); this.markers.push(m); this.cards.push(c);
    });

    // Камера внутри кольца маркеров; коллайдеры — коробки окружения и карточки (страховка)
    const cc = this.app.cameraCtl;
    cc.groundHeightAt = () => 0; cc.clearance = 1.6;
    cc.colliders = [...env.colliders, ...this.cards.map((c) => new THREE.Box3().setFromCenterAndSize(c.position, new THREE.Vector3(2.6, 1.8, 2.6)))];
    const ring = (rad, y, ang) => [Math.cos(ang) * rad, y, Math.sin(ang) * rad];
    const B = 1.03; // между маркерами (их углы: 0.4, 1.66, 2.91, 4.17, 5.43)
    cc.setPath({
      positions: [ring(7.5, 3.8, B), ring(6.5, 4.0, B + 1.2), ring(6.5, 4.4, B + 2.4), ring(6.5, 4.8, B + 3.6),
                  ring(6.5, 4.3, B + 4.8), ring(7.5, 3.8, B + Math.PI * 2)],
      targets: Array.from({ length: 6 }, (_, i) => [0, 3.0 + (i % 2) * 0.2, 0]),
    });

    this.app.hud.setPanel({ title: 'TourB · Места', items: PLACES.map((p) => p[0]), tag: 'Концепт' });
  }

  enter() {
    const { hud, cameraCtl } = this.app, tl = this.createTimeline(), panel = hud.panel;
    const say = (t) => () => hud.setCaption(t);
    cameraCtl.addToTimeline(tl, { duration: this.duration });
    tl.call(say('Стенд 2/2 · маркеры, карточки, HTML-панель'), null, 0.2);
    this.markers.forEach((m, i) => {
      const st = { v: 0 };
      tl.to(st, { v: 1, duration: 1.2, ease: 'power2.out', onUpdate: () => m.setAppear(st.v) }, 1 + i * 0.45);
    });
    this.cards.forEach((c, i) => {
      const st = { v: 0 };
      tl.to(st, { v: 1, duration: 1.4, ease: 'power2.out', onUpdate: () => c.setAppear(st.v) }, 1.4 + i * 0.45);
    });
    // HTML-панель — часть мастер-таймлайна: появляется и уходит вместе с 3D, перематывается вместе с ним
    tl.fromTo(panel, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.9, ease: 'power2.out', immediateRender: false }, 4.5)
      .call(say('HTML-панель синхронна с 3D'), null, 5)
      .to(panel, { opacity: 0, x: 40, duration: 0.7, ease: 'power2.in' }, 11.5)
      .to({}, { duration: this.duration }, 0);
  }

  update(dt) { for (const m of this.markers) m.update(dt); }

  lateUpdate(dt) {
    const { camera, renderer } = this.app;
    this.rain.update(dt, camera, renderer);
    for (const c of this.cards) c.update(dt, camera);
  }

  setQuality(q) { this.rain?.setDensity(q.density); }
}
