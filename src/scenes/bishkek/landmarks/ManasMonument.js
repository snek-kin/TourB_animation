import * as THREE from 'three';
import { LANDMARK_LOCATIONS } from './locations.js';
import { addBox, addCylinder, addMesh, addSoftContactShadow, makePbr } from './primitives.js';

function addLimb(group, start, end, radius, material) {
  const from = new THREE.Vector3(...start), to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const mesh = addMesh(group, new THREE.CylinderGeometry(radius * 0.72, radius, direction.length(), 10),
    material, from.clone().add(to).multiplyScalar(0.5).toArray());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function elongatedSphere(group, size, material, position, rotation = [0, 0, 0]) {
  const mesh = addMesh(group, new THREE.SphereGeometry(1, 18, 12), material, position, rotation);
  mesh.scale.set(...size);
  return mesh;
}

export function createManasMonument(groundHeightAt) {
  if (typeof groundHeightAt !== 'function') throw new TypeError('Manas Monument requires groundHeightAt');
  const { x, z } = LANDMARK_LOCATIONS.manasMonument;
  const baseY = groundHeightAt(x, z);
  const group = new THREE.Group();
  group.name = 'landmark-manas-monument';
  group.position.set(x, baseY, z);

  const granite = makePbr(0x5c5b58, { roughness: 0.82 });
  const graniteLight = makePbr(0x8b877d, { roughness: 0.72 });
  const bronze = makePbr(0x51402c, { roughness: 0.4, metalness: 0.74 });
  const bronzeLight = makePbr(0x9d7843, { roughness: 0.36, metalness: 0.78 });
  const saddle = makePbr(0x762e2b, { roughness: 0.56, metalness: 0.08 });

  addSoftContactShadow(group, 7.2, 6.4, [0, 0.06, 0], 0.48);
  addBox(group, [4.5, 0.42, 3.9], granite, [0, 0.22, 0]);
  addBox(group, [4.0, 0.2, 3.42], graniteLight, [0, 0.53, 0]);
  addBox(group, [3.42, 0.3, 2.92], bronzeLight, [0, 0.78, 0]);
  addBox(group, [3.05, 1.28, 2.58], granite, [0, 1.54, 0]);
  addBox(group, [3.32, 0.25, 2.83], graniteLight, [0, 2.3, 0]);
  addBox(group, [2.4, 0.15, 0.08], bronzeLight, [0, 1.64, 1.34]);

  const figure = new THREE.Group();
  figure.name = 'stylized-equestrian-figure';
  figure.position.y = 2.42;
  group.add(figure);

  elongatedSphere(figure, [1.12, 0.52, 0.43], bronze, [0, 0.5, 0], [0, 0, -Math.PI / 2]);
  elongatedSphere(figure, [0.5, 0.49, 0.45], bronze, [-0.75, 0.53, 0]);
  elongatedSphere(figure, [0.56, 0.57, 0.46], bronze, [0.76, 0.58, 0]);
  const neck = addMesh(figure, new THREE.CapsuleGeometry(0.24, 0.72, 5, 12), bronze, [0.94, 1.03, 0], [0, 0, -0.38]);
  neck.scale.set(0.92, 1, 0.88);
  elongatedSphere(figure, [0.4, 0.29, 0.27], bronze, [1.35, 1.54, 0.02], [0, 0, -0.15]);
  elongatedSphere(figure, [0.28, 0.18, 0.21], bronzeLight, [1.58, 1.45, 0.02]);
  for (const side of [-1, 1]) {
    const ear = addMesh(figure, new THREE.ConeGeometry(0.09, 0.34, 8), bronze, [1.24, 1.83, side * 0.13], [0, 0, -0.18]);
    ear.rotation.x = side * 0.22;
    elongatedSphere(figure, [0.055, 0.055, 0.04], bronzeLight, [1.55, 1.59, side * 0.19]);
  }
  for (const side of [-1, 1]) {
    addLimb(figure, [-0.63, 0.34, side * 0.25], [-0.74, -0.2, side * 0.32], 0.12, bronze);
    addLimb(figure, [0.58, 0.34, side * 0.25], [0.71, -0.2, side * 0.32], 0.12, bronze);
    addBox(figure, [0.34, 0.16, 0.28], bronzeLight, [-0.75, -0.27, side * 0.32]);
    addBox(figure, [0.34, 0.16, 0.28], bronzeLight, [0.71, -0.27, side * 0.32]);
  }

  addMesh(figure, new THREE.TorusGeometry(0.49, 0.055, 8, 24), bronzeLight, [0.03, 0.73, 0], [Math.PI / 2, 0, 0]);
  addBox(figure, [1.12, 0.18, 0.78], saddle, [-0.04, 0.94, 0]);
  addBox(figure, [0.16, 0.26, 0.94], bronzeLight, [-0.15, 0.99, 0]);

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.06, 0.75, 0),
    new THREE.Vector3(-1.35, 0.55, 0),
    new THREE.Vector3(-1.47, 0.2, 0.02),
    new THREE.Vector3(-1.62, 0.1, 0.12),
  ]);
  addMesh(figure, new THREE.TubeGeometry(tailCurve, 14, 0.085, 8, false), bronze, [0, 0, 0]);

  elongatedSphere(figure, [0.38, 0.63, 0.37], bronzeLight, [0.04, 1.55, 0], [0, 0, -0.12]);
  elongatedSphere(figure, [0.19, 0.22, 0.2], bronze, [0.12, 2.19, 0]);
  addMesh(figure, new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    bronzeLight, [0.12, 2.32, 0]);
  addMesh(figure, new THREE.ConeGeometry(0.075, 0.48, 8), saddle, [0.12, 2.64, 0], [0, 0, -0.1]);
  addLimb(figure, [0.25, 1.76, 0.22], [0.63, 2.12, 0.26], 0.105, bronze);
  addLimb(figure, [0.63, 2.12, 0.26], [0.78, 2.5, 0.28], 0.075, bronzeLight);
  addMesh(figure, new THREE.CylinderGeometry(0.025, 0.035, 2.1, 8), bronzeLight,
    [0.82, 2.57, 0.28], [0, 0, -0.08]);
  elongatedSphere(figure, [0.4, 0.12, 0.31], saddle, [-0.25, 1.57, -0.31], [0, 0, -0.22]);
  addLimb(figure, [-0.14, 1.72, -0.22], [-0.46, 1.35, -0.32], 0.11, bronze);

  const collider = new THREE.Box3(
    new THREE.Vector3(x - 2.5, baseY, z - 2.2),
    new THREE.Vector3(x + 2.5, baseY + 5.7, z + 2.2),
  );
  group.userData.collider = collider;
  return group;
}
