import * as THREE from 'three';
import { BaseScene } from '../core/BaseScene.js';
import { CONFIG } from '../config.js';
import { MatrixRain } from '../effects/MatrixRain.js';
import { ParticleMorph } from '../effects/ParticleMorph.js';
import { samplePointsFromCanvas, roundRectPath } from '../effects/util.js';

/**
 * Сцена 3 «Цифровой мир» (20 с) — первая производственная сцена фильма.
 *
 * Кинематографическая последовательность:
 *   0–3 с   : тёмное пространство, проявляется цифровой дождь
 *   3–8 с   : камера плавно подлетает к процедурному смартфону
 *   8–12 с  : частицы собирают интерфейс TourB прямо из экрана
 *   12–14 с : экран телефона растворяется, остаётся «цифровой» интерфейс
 *   14–18 с : интерфейс перетекает в маркер-булавку места
 *   18–20 с : растворение, подготовка к переходу в следующую сцену
 *
 * Все анимации ведутся мастер-GSAP-таймлайном — они детерминированы и не зависят от FPS.
 */
const N = 4000;

export class DigitalWorldScene extends BaseScene {
  constructor(app) {
    // Контракт BaseScene: вторым аргументом идёт объект { id, duration, feature }.
    super(app, { id: 'digital', duration: 20, feature: null });
    this._screenTex = null;
    this._screen = null;
    this.phoneGroup = null;
    this.rain = null;
    this.morph = null;
    this.shapeCard = null;
    this.shapePin = null;
  }

  /* ------------------------------------------------------------------ */
  /*  BUILD — создание объектов под «шторой» перехода                    */
  /* ------------------------------------------------------------------ */
  build() {
    // Фон и туман — из CONFIG, не хардкод.
    this.scene.background = new THREE.Color(CONFIG.palette.navy);
    this.scene.fog = new THREE.FogExp2(CONFIG.palette.navy, 0.025);

    // Освещение: холодное «цифровое», с подсветкой бренда.
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    const key = new THREE.DirectionalLight(CONFIG.palette.ice, 1.2);
    key.position.set(5, 8, 5);
    const rim = new THREE.PointLight(CONFIG.palette.digitalGreen, 1.6, 22, 2);
    rim.position.set(-4, 2, -6);
    this.scene.add(ambient, key, rim);
    this.track(ambient); this.track(key); this.track(rim);

    // ---- Процедурный смартфон -----------------------------------------
    this.phoneGroup = new THREE.Group();
    this.phoneGroup.position.set(0, 0, -8);

    const bodyGeo = new THREE.BoxGeometry(3.6, 7.2, 0.3, 8, 16, 1);
    this._roundBox(bodyGeo, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x111118,
      roughness: 0.25,
      metalness: 0.85,
      emissive: 0x050510,
      emissiveIntensity: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.phoneGroup.add(body);

    // Экран — canvas-текстура с интерфейсом TourB.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    this._drawUI(canvas.getContext('2d'), 512, 1024);
    this._screenTex = new THREE.CanvasTexture(canvas);
    this._screenTex.colorSpace = THREE.SRGBColorSpace;
    this._screenTex.anisotropy = 4;

    const screenGeo = new THREE.PlaneGeometry(3.2, 6.8);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this._screenTex,
      transparent: true,
      opacity: 1,
      toneMapped: false,
    });
    this._screen = new THREE.Mesh(screenGeo, screenMat);
    this._screen.position.z = 0.16; // передняя грань корпуса
    this.phoneGroup.add(this._screen);

    this.scene.add(this.phoneGroup);
    this.track(this.phoneGroup);

    // ---- Цифровой дождь -----------------------------------------------
    this.rain = this.track(new MatrixRain({
      columns: 180,
      trail: 10,
      area: [40, 28, 40],
      color: CONFIG.palette.digitalGreen,
      headColor: CONFIG.palette.ice,
      opacity: 0,
      size: 0.38,
    }));
    this.rain.object3D.position.set(0, 0, -8);
    this.scene.add(this.rain.object3D);

    // ---- Частицы-морф -------------------------------------------------
    this.morph = this.track(new ParticleMorph({
      count: N,
      spread: 6,
      seed: 17,
      colorA: CONFIG.palette.blue,
      colorB: CONFIG.palette.digitalGreen,
      size: 0.04,
      wobble: 0.015,
    }));
    // Позиционируем морф в плоскости экрана телефона (z = -8 + 0.16).
    this.morph.object3D.position.set(0, 0, -7.84);
    this.morph.uniforms.uOpacity.value = 0;
    this.scene.add(this.morph.object3D);

    // Целевые формы: карточка интерфейса и булавка места.
    this.shapeCard = samplePointsFromCanvas(
      (g, w, h) => this._drawUI(g, w, h),
      { width: 512, height: 1024, count: N, worldWidth: 3.2, z: 0 },
    );
    this.shapePin = samplePointsFromCanvas((g, w, h) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(w / 2, h * 0.38, h * 0.26, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(w / 2 - h * 0.2, h * 0.52);
      g.lineTo(w / 2, h * 0.92);
      g.lineTo(w / 2 + h * 0.2, h * 0.52);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(w / 2, h * 0.38, h * 0.1, 0, Math.PI * 2);
      g.fill();
    }, { width: 400, height: 400, count: N, worldWidth: 2.8, z: 0 });

    this.morph.setTargets(this.shapeCard);

    // ---- Камера на рельсе ---------------------------------------------
    const cc = this.app.cameraCtl;
    cc.groundHeightAt = () => -10;
    cc.clearance = 0.5;
    cc.colliders = [];
    cc.setPath({
      positions: [
        [0, 2.5, 5],
        [-1.5, 1.5, 0],
        [0, 0.3, -4],
        [0, 0, -6.2],
      ],
      targets: [
        [0, 0, -8],
        [0, 0, -8],
        [0, 0, -8],
        [0, 0, -8],
      ],
    });
  }

  /* Скругление углов BoxGeometry по X/Y (локальные полуоси 1.8 × 3.6). */
  _roundBox(geo, r) {
    const pos = geo.attributes.position;
    const halfX = 1.8 - r;
    const halfY = 3.6 - r;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (Math.abs(x) > halfX && Math.abs(y) > halfY) {
        const sx = Math.sign(x);
        const sy = Math.sign(y);
        const dx = Math.abs(x) - halfX;
        const dy = Math.abs(y) - halfY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) {
          const a = Math.atan2(dy, dx);
          pos.setX(i, sx * (halfX + Math.cos(a) * r));
          pos.setY(i, sy * (halfY + Math.sin(a) * r));
        }
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /* Рисуем макет интерфейса TourB. Используется и для CanvasTexture, и для
     выборки точек морфа — поэтому формы частиц точно совпадают с экраном. */
  _drawUI(ctx, w, h) {
    ctx.fillStyle = '#0a1525';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#4a90e2';
    ctx.font = 'bold 72px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TourB', w / 2, 120);

    ctx.fillStyle = '#dbe9ff';
    ctx.font = '400 28px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Кыргызстан в кармане', w / 2, 180);

    ctx.fillStyle = '#1c3f73';
    roundRectPath(ctx, 40, 240, w - 80, 180, 20);
    ctx.fill();
    ctx.fillStyle = '#dbe9ff';
    ctx.font = '600 32px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Ала-Арча', 70, 290);
    ctx.font = '400 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#8fa8c8';
    ctx.fillText('Национальный парк · 40 км', 70, 330);

    ctx.fillStyle = '#1c3f73';
    roundRectPath(ctx, 40, 450, w - 80, 180, 20);
    ctx.fill();
    ctx.fillStyle = '#dbe9ff';
    ctx.font = '600 32px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Сон-Куль', 70, 500);
    ctx.font = '400 24px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#8fa8c8';
    ctx.fillText('Горное озеро · 3016 м', 70, 540);

    ctx.fillStyle = '#35e08a';
    roundRectPath(ctx, w / 2 - 120, h - 160, 240, 70, 35);
    ctx.fill();
    ctx.fillStyle = '#0a1525';
    ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Начать', w / 2, h - 125);
  }

  /* ------------------------------------------------------------------ */
  /*  ENTER — мастер-таймлайн. Всё, что происходит на экране, — здесь.    */
  /* ------------------------------------------------------------------ */
  enter() {
    const { hud, cameraCtl } = this.app;
    const tl = this.createTimeline();
    const uRain = this.rain.uniforms;
    const uMorph = this.morph.uniforms;
    const say = (t) => () => hud.setCaption(t);

    // Камера ведётся мастер-таймлайном → детерминированно, синхронно со всей сценой.
    cameraCtl.addToTimeline(tl, { duration: this.duration, ease: 'sine.inOut' });

    // 1. Проявление цифрового дождя.
    tl.to(uRain.uOpacity, { value: 0.55, duration: 3, ease: 'sine.out' }, 0);

    // 2. Субтитры.
    tl.call(say('Цифровой мир TourB'), null, 0.5);
    tl.call(say('Интерфейс собирается из частиц'), null, 9);
    tl.call(say('Маркер места'), null, 15);

    // 3. Частицы проявляются и собирают интерфейс.
    tl.to(uMorph.uOpacity, { value: 1, duration: 0.8, ease: 'sine.out' }, 7);
    tl.fromTo(uMorph.uProgress, { value: 0 }, {
      value: 1, duration: 4, ease: 'none', immediateRender: false,
    }, 7.5);

    // 4. Экран телефона растворяется — остаётся «цифровой» интерфейс.
    tl.to(this._screen.material, {
      opacity: 0, duration: 1.5, ease: 'sine.in',
    }, 11.5);

    // 5. Перетекаем в булавку места. morphTo() сбрасывает uProgress в 0,
    //    поэтому сразу следом запускаем новую анимацию прогресса.
    tl.call(() => this.morph.morphTo(this.shapePin), null, 13.5);
    tl.fromTo(uMorph.uProgress, { value: 0 }, {
      value: 1, duration: 3, ease: 'none', immediateRender: false,
    }, 13.5);

    // 6. Растворение к концу сцены.
    tl.to(uMorph.uOpacity, { value: 0, duration: 1.5, ease: 'sine.in' }, 18);
    tl.to(uRain.uOpacity, { value: 0, duration: 1.5, ease: 'sine.in' }, 18);

    // Фиксируем длительность мастер-таймлайна.
    tl.to({}, { duration: this.duration }, 0);
  }

  /* ------------------------------------------------------------------ */
  /*  UPDATE / LATEUPDATE                                                */
  /* ------------------------------------------------------------------ */
  update(_dt) {
    // Лёгкое «дыхание» телефона, пока он видим.
    if (this._screen && this._screen.material.opacity > 0.01) {
      const t = this.elapsed;
      this.phoneGroup.position.y = Math.sin(t * 0.6) * 0.08;
      this.phoneGroup.rotation.y = Math.sin(t * 0.35) * 0.04;
    }
  }

  lateUpdate(dt) {
    const { camera, renderer } = this.app;
    // Эффекты требуют camera/renderer для расчёта масштаба точек и лимита GPU.
    this.rain.update(dt, camera, renderer);
    this.morph.update(dt, camera, renderer);
  }

  /* ------------------------------------------------------------------ */
  /*  QUALITY / DISPOSE                                                  */
  /* ------------------------------------------------------------------ */
  setQuality(q) {
    this.rain?.setDensity(q.density);
    this.morph?.setDensity(q.density);
  }

  dispose() {
    // CanvasTexture не является Object3D — BaseScene.track() её не увидит,
    // поэтому освобождаем вручную перед вызовом super.dispose().
    if (this._screenTex) {
      this._screenTex.dispose();
      this._screenTex = null;
    }
    super.dispose();
  }
}