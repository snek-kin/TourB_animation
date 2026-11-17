import * as THREE from 'three';
import { BaseScene } from '../core/BaseScene.js';
import { CONFIG } from '../config.js';
import { MatrixRain } from '../effects/MatrixRain.js';
import { ParticleMorph } from '../effects/ParticleMorph.js';
import { GlowMarker } from '../effects/GlowMarker.js';
import { FloatingCard } from '../effects/FloatingCard.js';
import { samplePointsFromCanvas, roundRectPath, randomCloud } from '../effects/util.js';

const N = 4000; // частиц в морфинге

/**
 * ТЕХНИЧЕСКИЙ СТЕНД (не сцена фильма): проверяет, что фундамент работает целиком —
 * менеджер сцен, камера на рельсах, GSAP-таймлайн, цифровой дождь, сборка интерфейса из частиц,
 * маркеры и плавающие карточки, освобождение памяти при перезапуске.
 * Здесь НЕТ реальных 3D-моделей: их ещё нет (см. assets/ASSET_INVENTORY.md).
 */
export class SandboxScene extends BaseScene {
  constructor(app) { super(app, { id: 'sandbox', duration: 26, feature: 'living_city' }); this.showDisclaimer = true; }

  build() {
    const s = this.scene;
    s.background = new THREE.Color(CONFIG.palette.navy);
    s.fog = new THREE.FogExp2(CONFIG.palette.navy, 0.018);
    s.add(new THREE.HemisphereLight(0x9fc4ff, 0x0a1e3c, 0.9));

    // «земля»: тёмный диск + сетка — масштабный ориентир (1 единица = 1 метр)
    // Phase 1.5: сплошной диск земли убран — в замерах он стоил ~30 из ~100 мс кадра; хватает сетки и тумана.
    const grid = this.track(new THREE.GridHelper(120, 60, 0x2f7bf6, 0x143a6b));
    s.add(grid);

    this.rain = this.track(new MatrixRain({ opacity: 0 }));
    s.add(this.rain.object3D);

    // Частицы: облако → карточка «TourB» → булавка карты → снова облако
    this.morph = this.track(new ParticleMorph({ count: N }));
    this.morph.object3D.position.set(0, 3.2, 0);
    this.morph.uniforms.uOpacity.value = 0;
    s.add(this.morph.object3D);
    this.shapeCard = samplePointsFromCanvas((g, w, h) => {
      g.fillStyle = '#fff'; roundRectPath(g, 8, 8, w - 16, h - 16, 40); g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
      g.font = '700 190px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('TourB', w / 2, h / 2 + 8);
    }, { width: 800, height: 400, count: N, worldWidth: 6.4 });
    this.shapePin = samplePointsFromCanvas((g, w, h) => {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h * 0.38, h * 0.26, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(w / 2 - h * 0.2, h * 0.52); g.lineTo(w / 2, h * 0.92); g.lineTo(w / 2 + h * 0.2, h * 0.52); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(w / 2, h * 0.38, h * 0.1, 0, Math.PI * 2); g.fill();
    }, { width: 400, height: 400, count: N, worldWidth: 3.2 });
    this.shapeCloud = randomCloud(N, 9, 21, [0, 0, 0]);
    this.morph.setTargets(this.shapeCard);

    // Маркеры по кольцу и карточки над ними (карточки — концепт, с бейджем)
    this.markers = []; this.cards = [];
    const places = [['Площадь Ала-Тоо', 'Бишкек'], ['Ала-Арча', 'Парк'], ['Сон-Куль', 'Озеро'], ['Каракол', 'Город'], ['Манас', 'Аэропорт']];
    places.forEach(([title, sub], i) => {
      const a = (i / places.length) * Math.PI * 2 + 0.4, r = 11;
      const m = this.track(new GlowMarker({ color: i % 2 ? CONFIG.palette.amber : CONFIG.palette.digitalGreen }));
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      const c = this.track(new FloatingCard({ title, subtitle: sub, width: 2.2 }));
      c.baseY = 4.2; c.position.set(m.position.x, 4.2, m.position.z);
      s.add(m, c); this.markers.push(m); this.cards.push(c);
    });

    // Камера по рельсе ВНУТРИ кольца маркеров (радиус 7.5 < 11), а не вплотную к карточкам.
    // Дополнительно: земля как «пол» и AABB-коллайдеры карточек — страховка от пролёта сквозь объекты.
    const cc = this.app.cameraCtl;
    cc.groundHeightAt = () => 0; cc.clearance = 1.6;
    cc.colliders = this.cards.map((c) => new THREE.Box3().setFromCenterAndSize(c.position, new THREE.Vector3(2.6, 1.8, 2.6)));
    const ring = (r, y, a) => [Math.cos(a) * r, y, Math.sin(a) * r];
    const B = 1.03; // старт между маркерами (их углы: 0.4, 1.66, 2.91, 4.17, 5.43)
    cc.setPath({
      positions: [ring(8.5, 3.6, B), ring(7.5, 3.9, B + 1.0), ring(7.5, 4.3, B + 2.1), ring(7.5, 4.8, B + 3.2),
                  ring(7.5, 4.4, B + 4.3), ring(7.5, 4.0, B + 5.3), ring(8.5, 3.6, B + Math.PI * 2)],
      targets: Array.from({ length: 7 }, (_, i) => [0, 3.2 + (i % 2) * 0.15, 0]),
    });
  }

  enter() {
    const { hud, cameraCtl } = this.app;
    const u = this.morph.uniforms, tl = this.createTimeline();
    const say = (t) => () => hud.setCaption(t);
    cameraCtl.addToTimeline(tl, { duration: this.duration });
    tl.to(this.rain.uniforms.uOpacity, { value: 0.9, duration: 3, ease: 'sine.out' }, 0)
      .call(say('Цифровая среда'), null, 2)
      .set(u.uOpacity, { value: 1 }, 3)
      .fromTo(u.uProgress, { value: 0 }, { value: 1, duration: 5, ease: 'none', immediateRender: false }, 3)                 // облако → карточка
      .call(say('Частицы собирают интерфейс'), null, 4)
      .call(() => { this.morph.morphTo(this.shapePin); }, null, 11)                // карточка → булавка
      .fromTo(u.uProgress, { value: 0 }, { value: 1, duration: 3.5, ease: 'none', immediateRender: false }, 11)
      .call(say('Маркер места (концепт)'), null, 12)
      .call(() => { this.morph.morphTo(this.shapeCloud); }, null, 16)              // булавка → облако
      .fromTo(u.uProgress, { value: 0 }, { value: 1, duration: 3, ease: 'none', immediateRender: false }, 16)
      .to(u.uOpacity, { value: 0, duration: 1.5 }, 18.5)
      .call(say('Места и карточки поднимаются над картой (концепт)'), null, 14);
    this.markers.forEach((m, i) => {
      const st = { v: 0 };
      tl.to(st, { v: 1, duration: 1.4, ease: 'power2.out', onUpdate: () => m.setAppear(st.v) }, 14 + i * 0.5);
    });
    this.cards.forEach((c, i) => {
      const st = { v: 0 };
      tl.to(st, { v: 1, duration: 1.6, ease: 'power2.out', onUpdate: () => c.setAppear(st.v) }, 14.4 + i * 0.5);
    });
    tl.to({}, { duration: this.duration }, 0); // таймлайн длится ровно duration сцены
  }

  update(dt) {
    for (const m of this.markers) m.update(dt);
  }

  setQuality(q) { this.rain?.setDensity(q.density); this.morph?.setDensity(q.density); }

  lateUpdate(dt) {
    const { camera, renderer } = this.app;
    this.rain.update(dt, camera, renderer);
    this.morph.update(dt, camera, renderer);
    this.morph.object3D.rotation.y = Math.atan2(camera.position.x, camera.position.z); // карточка «смотрит» на камеру
    for (const c of this.cards) c.update(dt, camera);
  }
}
