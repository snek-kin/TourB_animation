import * as THREE from 'three';
import { roundRectPath } from './util.js';
import { STATUS } from '../data/features.js';

// Плавающая информационная карточка (3D-плоскость с canvas-текстурой), всегда повёрнута к камере.
// Карточка «концепта» обязана нести бейдж статуса (по умолчанию — «Концепт»), чтобы будущие
// идеи (фото от путешественников, события) не выглядели как готовые функции.
export class FloatingCard extends THREE.Mesh {
  constructor({ title, subtitle = '', tag = STATUS.concept.short, accent = 0x2f7bf6, width = 1.8, photoLabel = 'фото' } = {}) {
    const W = 640, H = 400, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
    g.fillStyle = 'rgba(10, 30, 60, 0.9)'; roundRectPath(g, 8, 8, W - 16, H - 16, 36); g.fill();
    g.lineWidth = 3; g.strokeStyle = css(accent); g.stroke();
    const grad = g.createLinearGradient(0, 40, W, 200);
    grad.addColorStop(0, css(accent)); grad.addColorStop(1, '#17a589');
    g.fillStyle = grad; roundRectPath(g, 36, 36, W - 72, 170, 22); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '500 26px "Segoe UI", system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText(photoLabel, 56, 60);
    g.fillStyle = '#fff'; g.font = '700 44px "Segoe UI", system-ui, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText(title, 40, 268, W - 80);
    g.fillStyle = '#b8cdea'; g.font = '400 30px "Segoe UI", system-ui, sans-serif';
    g.fillText(subtitle, 40, 312, W - 80);
    if (tag) {
      g.font = '600 24px "Segoe UI", system-ui, sans-serif';
      const w = g.measureText(tag).width + 36;
      g.fillStyle = '#ffb03b'; roundRectPath(g, 40, 336, w, 40, 20); g.fill();
      g.fillStyle = '#0a1e3c'; g.textBaseline = 'middle'; g.fillText(tag, 58, 357);
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    super(new THREE.PlaneGeometry(width, (width * H) / W),
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
    this._map = map; this._appear = 0; this.baseY = 0; this._t = Math.random() * 6.28;
    this.setAppear(0);
  }

  setAppear(v) {
    this._appear = v;
    this.material.opacity = v;
    this.scale.setScalar(0.4 + 0.6 * v);
    this.visible = v > 0.001;
  }

  update(dt, camera) {
    this._t += dt;
    this.position.y = this.baseY + Math.sin(this._t * 1.2) * 0.06 * this._appear;
    this.quaternion.copy(camera.quaternion); // billboard (родитель без поворота)
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); this._map.dispose(); }
}
