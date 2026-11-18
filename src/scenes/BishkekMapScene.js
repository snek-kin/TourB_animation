// Сцена «Бишкек: живая карта» (25 с) — слот bishkek из data/timeline.js.
// Реалистичный город на фоне Ала-Тоо → сумерки → маркеры TourB. Оцифровка — следующий этап.
// Все анимации ведёт мастер-GSAP-таймлайн (детерминированы, синхронны с камерой).
import * as THREE from 'three';
import { BaseScene } from '../core/BaseScene.js';
import { CONFIG } from '../config.js';
import { ParticleMorph } from '../effects/ParticleMorph.js';
import { GlowMarker } from '../effects/GlowMarker.js';
import { FloatingCard } from '../effects/FloatingCard.js';
import { samplePointsFromCanvas, rng } from '../effects/util.js';
import { STATUS } from '../data/features.js';
import { CATEGORIES, resolvedPois } from './bishkek/data.js';
import { makeGroundHeight, buildTerrain } from './bishkek/Terrain.js';
import { generateLayout, buildCity } from './bishkek/CityKit.js';
import { buildCityGround, buildAvenueStrips, buildTrees } from './bishkek/Roads.js';
import { buildAtmosphere } from './bishkek/Atmosphere.js';

const N = 4000;

function drawPin(g, w, h) {
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(w / 2, h * 0.38, h * 0.26, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(w / 2 - h * 0.2, h * 0.52); g.lineTo(w / 2, h * 0.92); g.lineTo(w / 2 + h * 0.2, h * 0.52); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(w / 2, h * 0.38, h * 0.1, 0, Math.PI * 2); g.fill();
}

/** «частицы интерфейса → огни города»: точки на крышах и вдоль проспектов. */
function cityLightTargets(records, gh, count) {
  const rand = rng(99);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (rand() < 0.6 && records.length) {
      const r = records[(rand() * records.length) | 0];
      x = r.x + (rand() - 0.5) * r.w; z = r.z + (rand() - 0.5) * r.d;
      y = (r.y0 ?? gh(r.x, r.z)) + r.h + 0.2;
    } else {
      const t = rand();
      if (t < 0.4) { x = (rand() - 0.5) * 700; z = (rand() - 0.5) * 3; }
      else if (t < 0.7) { x = (rand() - 0.5) * 3; z = (rand() - 0.5) * 500; }
      else { x = -20 + (rand() - 0.5) * 3; z = -60 + rand() * 220; }
      y = gh(x, z) + 0.15;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

export class BishkekMapScene extends BaseScene {
  constructor(app) {
    super(app, { id: 'bishkek', duration: 25, feature: 'maps_places' });
    this.showDisclaimer = true; // в кадре есть концепт-контент (гиды/события)
    this.markers = []; this.cards = [];
    this.facadeMats = []; this.flagUniforms = null;
  }

  build() {
    const gh = this.groundHeightAt = makeGroundHeight(900);
    this.scene.background = new THREE.Color(CONFIG.palette.navy);
    this.scene.fog = new THREE.FogExp2(0xc9b49a, 0.0005);

    this.scene.add(this.track(buildTerrain(gh)));
    this.scene.add(this.track(buildCityGround(gh)));
    const layout = generateLayout(2026);
    const city = buildCity(layout, gh);
    this.scene.add(this.track(city.group));
    this.facadeMats = city.facadeMats;
    this.flagUniforms = city.flagUniforms;
    this.track(this.flagUniforms.uMap.value); // текстура в uniforms — Disposer её не сканирует
    this.scene.add(this.track(buildAvenueStrips(gh)));
    this.scene.add(this.track(buildTrees(gh)));

    const atmo = buildAtmosphere();
    this.sky = this.track(atmo.sky); this.stars = this.track(atmo.stars);
    this.sun = this.track(atmo.sun); this.hemi = this.track(atmo.hemi);
    this.skyU = atmo.skyU; this.starU = atmo.starU; this.starCount = atmo.starCount;
    this.scene.add(this.sky, this.stars, this.sun, this.hemi);

    const pois = resolvedPois();
    for (const p of pois) {
      const m = this.track(new GlowMarker({ color: CATEGORIES[p.cat].color, height: 4.5, radius: 1.6 }));
      m.position.set(p.x, gh(p.x, p.z), p.z); m.scale.setScalar(2.2);
      this.scene.add(m); this.markers.push({ poi: p, marker: m });
      if (p.hero) {
        const c = this.track(new FloatingCard({
          title: p.title, subtitle: p.sub, tag: STATUS[p.status].short,
          accent: CATEGORIES[p.cat].color, width: 4.5,
        }));
        c.baseY = gh(p.x, p.z) + 12; c.position.set(p.x, c.baseY, p.z);
        this.scene.add(c); this.cards.push(c);
      }
    }

    this.morph = this.track(new ParticleMorph({
      count: N, spread: 6, seed: 17, colorA: CONFIG.palette.blue, colorB: CONFIG.palette.amber, size: 0.9, wobble: 0.02,
    }));
    const pin = samplePointsFromCanvas(drawPin, { width: 400, height: 400, count: N, worldWidth: 6, z: 0 });
    for (let i = 0; i < N; i++) { pin[i * 3 + 1] += 18; pin[i * 3 + 2] += -150; }
    this.morph.setTargets(pin);
    this.morph.uniforms.uProgress.value = 1;
    this.morph.uniforms.uOpacity.value = 0;
    this.scene.add(this.morph.object3D);
    this.cityLights = cityLightTargets(layout.records, gh, N);

    const cc = this.app.cameraCtl;
    cc.groundHeightAt = gh; cc.clearance = 3; cc.colliders = city.colliders;
    cc.setPath({
      positions: [[0, 15, -195], [-26, 26, -150], [-60, 55, -95], [-85, 95, -20], [-70, 125, -40], [-20, 145, -70]],
      targets: [[0, 6, 120], [0, 5, 80], [0, 4, 40], [5, 3, 30], [10, 2, 20], [0, 2, 30]],
    });

    this._dusk = {
      sunDay: new THREE.Color(0xffd9a0), sunDusk: new THREE.Color(0x4a5f8a),
      posDay: new THREE.Vector3(-600, 260, -350), posDusk: new THREE.Vector3(-950, 30, -150),
      fogDay: new THREE.Color(0xc9b49a), fogDusk: new THREE.Color(0x0d1526),
    };

    const counts = {};
    for (const p of pois) counts[p.cat] = (counts[p.cat] ?? 0) + 1;
    this.app.hud.setPanel({
      title: 'TourB · Бишкек',
      items: [
        `Достопримечательности — ${counts.attractions}`,
        `Рестораны — ${counts.food}`,
        `Жильё — ${counts.stay} · ссылки`,
        `Гиды — ${counts.guides} · этап 2+`,
        `События — ${counts.events} · этап 2+ / концепт`,
      ],
      tag: 'MVP · карта и места',
    });
  }

  enter() {
    const { hud, cameraCtl } = this.app;
    const tl = this.createTimeline();
    const say = (t) => () => hud.setCaption(t);
    cameraCtl.addToTimeline(tl, { duration: this.duration, ease: 'sine.inOut' });

    tl.call(say('Бишкек — живой город'), null, 0.3);
    tl.call(say('Сетка улиц, зелень бульваров — и стена Ала-Тоо'), null, 8.5);
    tl.call(say('Город засыпает. Просыпается карта'), null, 13.5);
    tl.call(say('Места, которые стоит увидеть'), null, 16);
    tl.call(say('TourB · карта и места — входит в MVP'), null, 20.5);

    const uM = this.morph.uniforms;
    tl.to(uM.uOpacity, { value: 1, duration: 0.5, ease: 'sine.out' }, 0.2);
    tl.call(() => this.morph.morphTo(this.cityLights), null, 0.8);
    tl.fromTo(uM.uProgress, { value: 0 }, { value: 1, duration: 3.4, ease: 'none', immediateRender: false }, 0.8);
    tl.to(uM.uSize, { value: 2.4, duration: 3.4, ease: 'sine.inOut' }, 0.8);
    tl.to(uM.uOpacity, { value: 0, duration: 1.5, ease: 'sine.in' }, 5);

    const dusk = { t: 0 };
    tl.to(dusk, { t: 1, duration: 6, ease: 'sine.inOut', onUpdate: () => this._applyDusk(dusk.t) }, 8);

    const base = { attractions: 14.5, food: 16, stay: 17.2, guides: 18.2, events: 19.2 };
    const idx = {};
    for (const { poi, marker } of this.markers) {
      const i = (idx[poi.cat] = (idx[poi.cat] ?? 0) + 1) - 1;
      const st = { v: 0 };
      tl.to(st, { v: 1, duration: 1.1, ease: 'power2.out', onUpdate: () => marker.setAppear(st.v) }, base[poi.cat] + i * 0.3);
    }
    this.cards.forEach((c, i) => {
      const st = { v: 0 };
      tl.to(st, { v: 1, duration: 1.3, ease: 'power2.out', onUpdate: () => c.setAppear(st.v) }, 15.5 + i * 1.6);
    });
    const panel = hud.panel;
    tl.fromTo(panel, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.9, ease: 'power2.out', immediateRender: false }, 20.5);
    tl.to(panel, { opacity: 0, x: 40, duration: 0.8, ease: 'power2.in' }, 23.9);
    tl.to({}, { duration: this.duration }, 0);
  }

  _applyDusk(t) {
    const D = this._dusk;
    this.sun.intensity = 2.4 + (0.35 - 2.4) * t;
    this.sun.color.lerpColors(D.sunDay, D.sunDusk, t);
    this.sun.position.lerpVectors(D.posDay, D.posDusk, t);
    this.hemi.intensity = 0.9 + (0.35 - 0.9) * t;
    this.skyU.uDusk.value = t;
    this.skyU.uSunDir.value.copy(this.sun.position).normalize();
    this.scene.fog.color.lerpColors(D.fogDay, D.fogDusk, t);
    this.scene.fog.density = 0.0005 + (0.00035 - 0.0005) * t;
    for (const m of this.facadeMats) m.emissiveIntensity = t * 1.2;
    const s = Math.min(1, Math.max(0, (t - 0.55) / 0.45));
    this.starU.uOpacity.value = s * s * (3 - 2 * s) * 0.85;
  }

  update(dt) {
    if (this.flagUniforms) this.flagUniforms.uTime.value += dt;
    for (const { marker } of this.markers) marker.update(dt);
  }

  lateUpdate(dt) {
    const { camera, renderer } = this.app;
    this.morph.update(dt, camera, renderer);
    for (const c of this.cards) c.update(dt, camera);
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
  }

  setQuality(q) {
    this.morph?.setDensity(q.density);
    this.stars?.geometry.setDrawRange(0, Math.floor(this.starCount * q.density));
  }
}
