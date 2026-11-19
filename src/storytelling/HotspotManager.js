import * as THREE from 'three';

function toVector3(value) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))
    return new THREE.Vector3(...value);
  throw new TypeError('Hotspot position must be a Vector3 or a three-number array');
}

export class HotspotManager {
  constructor({ element, stage, camera, onActivate, onHover, onError } = {}) {
    if (!element?.addEventListener || !camera?.isCamera)
      throw new TypeError('HotspotManager requires a DOM element and a Three.js camera');
    this.element = element;
    this.stage = stage ?? element.parentElement;
    this.camera = camera;
    this.onActivate = onActivate;
    this.onHover = onHover;
    this.onError = onError;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.entries = new Map();
    this.hovered = null;
    this.enabled = true;
    this._cursor = element.style.cursor;
    this._label = globalThis.document?.createElement?.('div') ?? null;
    if (this._label) {
      this._label.className = 'story-hotspot-label';
      this._label.setAttribute('role', 'status');
      this._label.hidden = true;
      this.stage?.appendChild(this._label);
    }
    this._onPointerMove = (event) => this._move(event);
    this._onPointerDown = (event) => this._activate(event);
    this._onPointerLeave = () => this._setHovered(null);
    element.addEventListener('pointermove', this._onPointerMove);
    element.addEventListener('pointerdown', this._onPointerDown);
    element.addEventListener('pointerleave', this._onPointerLeave);
  }

  register({ id, object = null, position = null, radiusPx = 26, label = '', content = null, onActivate = null } = {}) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('Hotspot requires a non-empty id');
    if (this.entries.has(id)) throw new Error(`Hotspot already registered: ${id}`);
    if ((!object || !object.isObject3D) && position == null)
      throw new TypeError(`Hotspot "${id}" requires an Object3D or a world-space position`);
    if (object && !object.isObject3D) throw new TypeError(`Hotspot "${id}" object must be a Three.js Object3D`);
    if (!Number.isFinite(radiusPx) || radiusPx <= 0) throw new RangeError('Hotspot radiusPx must be positive');
    const entry = {
      id, object, position: position == null ? null : toVector3(position),
      radiusPx, label, content, onActivate, enabled: true,
    };
    this.entries.set(id, entry);
    return () => this.unregister(id);
  }

  get(id) { return this.entries.get(id) ?? null; }

  setEnabled(id, enabled) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.enabled = Boolean(enabled);
    if (!entry.enabled && this.hovered === entry) this._setHovered(null);
    return true;
  }

  unregister(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (this.hovered === entry) this._setHovered(null);
    this.entries.delete(id);
    return true;
  }

  clear() {
    this._setHovered(null);
    this.entries.clear();
  }

  _move(event) {
    if (!this.enabled) return this._setHovered(null);
    this._setHovered(this._pick(event), event);
  }

  _pick(event) {
    const rect = this.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    this.pointer.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const objects = [...this.entries.values()]
      .filter((entry) => entry.enabled && entry.object)
      .map((entry) => entry.object);
    let nearestObject = null;
    if (objects.length) {
      for (const hit of this.raycaster.intersectObjects(objects, true)) {
        let object = hit.object;
        while (object) {
          nearestObject = [...this.entries.values()].find((entry) => entry.enabled && entry.object === object);
          if (nearestObject) break;
          object = object.parent;
        }
        if (nearestObject) break;
      }
    }

    let nearest = nearestObject;
    let nearestDepth = nearestObject
      ? this.raycaster.ray.origin.distanceTo(nearestObject.object.getWorldPosition(new THREE.Vector3()))
      : Infinity;
    for (const entry of this.entries.values()) {
      if (!entry.enabled || !entry.position) continue;
      const projected = entry.position.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const sx = (projected.x + 1) * 0.5 * rect.width;
      const sy = (1 - projected.y) * 0.5 * rect.height;
      if (Math.hypot(sx - x, sy - y) > entry.radiusPx) continue;
      const depth = this.camera.position.distanceTo(entry.position);
      if (depth < nearestDepth) { nearest = entry; nearestDepth = depth; }
    }
    return nearest;
  }

  _setHovered(entry, event = null) {
    if (this.hovered === entry) {
      if (entry && event) this._moveLabel(entry, event);
      return;
    }
    this.hovered = entry;
    this.element.style.cursor = entry ? 'pointer' : this._cursor;
    if (this._label) {
      this._label.hidden = !entry;
      this._label.textContent = entry?.label ?? '';
      if (entry && event) this._moveLabel(entry, event);
    }
    try { this.onHover?.(entry); }
    catch (error) { this.onError?.(error); }
  }

  _moveLabel(entry, event) {
    if (!this._label || !this.stage) return;
    const bounds = this.stage.getBoundingClientRect();
    this._label.style.left = `${event.clientX - bounds.left + 14}px`;
    this._label.style.top = `${event.clientY - bounds.top + 14}px`;
    this._label.textContent = entry.label ?? '';
  }

  _activate(event) {
    if (!this.enabled || event.button !== 0) return;
    const entry = this._pick(event);
    if (!entry) return;
    try {
      entry.onActivate?.(entry);
      this.onActivate?.(entry);
    } catch (error) { this.onError?.(error); }
  }

  dispose() {
    this.element.removeEventListener('pointermove', this._onPointerMove);
    this.element.removeEventListener('pointerdown', this._onPointerDown);
    this.element.removeEventListener('pointerleave', this._onPointerLeave);
    this._setHovered(null);
    this.entries.clear();
    this.element.style.cursor = this._cursor;
    this._label?.remove();
    this._label = null;
    this.onActivate = null;
    this.onHover = null;
    this.onError = null;
  }
}
