import * as THREE from 'three';

function toVector3(value) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))
    return new THREE.Vector3(...value);
  return null;
}

export class ObjectHighlighter {
  constructor() {
    this.scene = null;
    this.helper = null;
    this.target = null;
  }

  highlight(target, scene, color = 0x79dcff) {
    this.clear();
    if (!scene || !target) return false;
    this.scene = scene;
    this.target = target;

    if (target.isObject3D) {
      this.helper = new THREE.BoxHelper(target, color);
      this.helper.material.depthTest = false;
      this.helper.material.transparent = true;
      this.helper.material.opacity = 0.9;
      scene.add(this.helper);
      return true;
    }

    const position = toVector3(target);
    if (!position) {
      this.scene = null;
      this.target = null;
      throw new TypeError('Highlight target must be an Object3D or a world-space position');
    }
    const geometry = new THREE.RingGeometry(0.75, 0.9, 48);
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
    });
    this.helper = new THREE.Mesh(geometry, material);
    this.helper.rotation.x = -Math.PI / 2;
    this.helper.position.copy(position);
    this.helper.position.y += 0.12;
    scene.add(this.helper);
    return true;
  }

  update() {
    if (this.helper?.isBoxHelper) this.helper.update();
  }

  clear() {
    if (!this.helper) return;
    this.scene?.remove(this.helper);
    this.helper.geometry?.dispose();
    const materials = Array.isArray(this.helper.material) ? this.helper.material : [this.helper.material];
    for (const material of materials) material?.dispose();
    this.helper = null;
    this.target = null;
    this.scene = null;
  }

  dispose() { this.clear(); }
}
