import * as THREE from 'three';
import { CONFIG } from '../../config.js';
import { rng } from '../../effects/util.js';

/**
 * Простое тестовое окружение для валидационных сцен: свет, туман, сетка-пол и «город» из коробок.
 * Коробки — ОДИН InstancedMesh (1 draw call на все), а у каждой есть AABB для проверки коллизий камеры.
 * Намеренно без тяжёлых моделей и теней. Всё, что создано, возвращается в { objects, colliders } для track().
 * Пол — только сетка: сплошной полноэкранный диск в замерах Phase 1.5 стоил ~30 из ~100 мс кадра (программный рендер).
 */
export function createTestEnvironment({ boxes = 14, innerRadius = 14, outerRadius = 26, seed = 31 } = {}) {
  const objects = [], colliders = [];
  const rand = rng(seed);

  const light = new THREE.HemisphereLight(0x9fc4ff, 0x0a1e3c, 1.0);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.4);
  sun.position.set(-12, 20, 8);
  objects.push(light, sun);

  const grid = new THREE.GridHelper(120, 60, 0x2f7bf6, 0x143a6b);
  grid.material.fog = true;
  objects.push(grid);

  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);       // низ коробки на y = 0
  const mat = new THREE.MeshLambertMaterial({ color: 0x1c3f73 });
  const mesh = new THREE.InstancedMesh(geo, mat, boxes);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < boxes; i++) {
    const a = (i / boxes) * Math.PI * 2 + (rand() - 0.5) * 0.3, r = innerRadius + rand() * (outerRadius - innerRadius);
    s.set(2 + rand() * 3, 3 + rand() * 9, 2 + rand() * 3);
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    colliders.push(new THREE.Box3(new THREE.Vector3(p.x - s.x / 2, 0, p.z - s.z / 2), new THREE.Vector3(p.x + s.x / 2, s.y, p.z + s.z / 2)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // InstancedMesh без пересчёта bounding sphere; коробок мало, тест лёгкий
  objects.push(mesh);

  return { objects, colliders, instanced: mesh };
}

export function applyFog(scene) {
  scene.background = new THREE.Color(CONFIG.palette.navy);
  scene.fog = new THREE.FogExp2(CONFIG.palette.navy, 0.02);
}
