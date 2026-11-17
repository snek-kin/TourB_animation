import * as THREE from 'three';
import { BaseScene } from '../core/BaseScene.js';
import { MatrixRain } from '../effects/MatrixRain.js';
import { ParticleMorph } from '../effects/ParticleMorph.js';
import { samplePointsFromCanvas, roundRectPath, randomCloud } from '../effects/util.js';
import { createTestEnvironment, applyFog } from './shared/Environment.js';

const N = 4000;

/**
 * ВАЛИДАЦИОННАЯ СЦЕНА 1/2 (технический стенд, НЕ сцена фильма): цифровой слой.
 * Проверяет: окружение, камеру на рельсе, цифровой дождь, морфинг частиц, субтитры, переход dip в сцену 2.
 */
export class ValidationDigitalScene extends BaseScene {
  constructor(app) { super(app, { id: 'val-digital', duration: 12 }); }

  build() {
    applyFog(this.scene);
    const env = createTestEnvironment();
    env.objects.forEach((o) => { this.scene.add(o); this.track(o); });

    this.rain = this.track(new MatrixRain({ opacity: 0 }));
    this.scene.add(this.rain.object3D);

    this.morph = this.track(new ParticleMorph({ count: N }));
    this.morph.object3D.position.set(0, 3.2, 0);
    this.morph.uniforms.uOpacity.value = 0;
    this.scene.add(this.morph.object3D);
    this.shapeCard = samplePointsFromCanvas((g, w, h) => {
      g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 8; roundRectPath(g, 8, 8, w - 16, h - 16, 40); g.stroke();
      g.font = '700 190px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('TourB', w / 2, h / 2 + 8);
    }, { width: 800, height: 400, count: N, worldWidth: 6.4 });
    this.shapePin = samplePointsFromCanvas((g, w, h) => {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h * 0.38, h * 0.26, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(w / 2 - h * 0.2, h * 0.52); g.lineTo(w / 2, h * 0.92); g.lineTo(w / 2 + h * 0.2, h * 0.52); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(w / 2, h * 0.38, h * 0.1, 0, Math.PI * 2); g.fill();
    }, { width: 400, height: 400, count: N, worldWidth: 3.2 });
    this.shapeCloud = randomCloud(N, 8, 21);
    this.morph.setTargets(this.shapeCard);

    // Камера: плавная дуга перед карточкой (мягкий разгон и торможение — ease sine.inOut)
    const cc = this.app.cameraCtl;
    cc.groundHeightAt = () => 0; cc.clearance = 1.6; cc.colliders = env.colliders;
    cc.setPath({
      positions: [[0, 3.4, 15], [-4, 3.6, 12], [-6, 4.0, 8], [-2, 4.2, 6.5], [3, 4.0, 7.5]],
      targets: [[0, 3.2, 0], [0, 3.2, 0], [0, 3.3, 0], [0, 3.2, 0], [0, 3.2, 0]],
    });
  }

  enter() {
    const { hud, cameraCtl } = this.app, u = this.morph.uniforms, tl = this.createTimeline();
    const say = (t) => () => hud.setCaption(t);
    cameraCtl.addToTimeline(tl, { duration: this.duration });
    tl.call(say('Стенд 1/2 · цифровой слой'), null, 0.2)
      .to(this.rain.uniforms.uOpacity, { value: 0.9, duration: 2.5, ease: 'sine.out' }, 0)
      .set(u.uOpacity, { value: 1 }, 2)
      .fromTo(u.uProgress, { value: 0 }, { value: 1, duration: 4, ease: 'none', immediateRender: false }, 2)
      .call(say('Частицы собирают интерфейс'), null, 3)
      .call(() => this.morph.morphTo(this.shapePin), null, 7)
      .fromTo(u.uProgress, { value: 0 }, { value: 1, duration: 3, ease: 'none', immediateRender: false }, 7)
      .call(say('Форма → маркер места'), null, 8)
      .to(u.uOpacity, { value: 0, duration: 1.2 }, 10.5)
      .to({}, { duration: this.duration }, 0);
  }

  update() {}

  lateUpdate(dt) {
    const { camera, renderer } = this.app;
    this.rain.update(dt, camera, renderer);
    this.morph.update(dt, camera, renderer);
    this.morph.object3D.rotation.y = Math.atan2(camera.position.x, camera.position.z);
  }

  setQuality(q) { this.rain?.setDensity(q.density); this.morph?.setDensity(q.density); }
}
