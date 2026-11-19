import * as THREE from 'three';
import { LANDMARK_LOCATIONS } from './locations.js';
import { addBox, addCylinder, addMesh, addSoftContactShadow, makePbr } from './primitives.js';

export function createPhilharmonic(groundHeightAt) {
  if (typeof groundHeightAt !== 'function') throw new TypeError('Philharmonic requires groundHeightAt');
  const { x, z } = LANDMARK_LOCATIONS.philharmonic;
  const baseY = groundHeightAt(x, z);
  const group = new THREE.Group();
  group.name = 'landmark-national-philharmonic';
  group.position.set(x, baseY, z);

  const limestone = makePbr(0xc9c3b4, { roughness: 0.78 });
  const trim = makePbr(0xe0d9c8, { roughness: 0.66 });
  const shadowedStone = makePbr(0x8d887e, { roughness: 0.86 });
  const glazing = makePbr(0x29445c, { roughness: 0.3, metalness: 0.48, emissive: 0x101b27, emissiveIntensity: 0.12 });
  const bronze = makePbr(0x927342, { roughness: 0.4, metalness: 0.68 });

  addSoftContactShadow(group, 16, 9.5, [0, 0.045, 0.25], 0.36);
  addBox(group, [13.4, 0.48, 7.2], shadowedStone, [0, 0.25, 0]);
  addBox(group, [12.7, 4.0, 5.8], limestone, [0, 2.45, -0.05]);
  addBox(group, [13.1, 0.32, 6.1], trim, [0, 4.56, -0.05]);
  addBox(group, [13.5, 0.22, 6.5], shadowedStone, [0, 4.84, -0.02]);
  addBox(group, [13.8, 0.24, 6.7], trim, [0, 5.05, -0.02]);

  const columnZ = 2.92;
  const columnCount = 9;
  for (let i = 0; i < columnCount; i++) {
    const columnX = -5.35 + i * 1.34;
    addCylinder(group, 0.17, 0.2, 3.34, trim, [columnX, 2.43, columnZ], 16);
    addCylinder(group, 0.29, 0.29, 0.16, shadowedStone, [columnX, 0.74, columnZ], 16);
    addCylinder(group, 0.28, 0.28, 0.16, trim, [columnX, 4.13, columnZ], 16);
    addBox(group, [0.56, 0.16, 0.54], trim, [columnX, 4.27, columnZ]);
  }

  for (let i = 0; i < 7; i++) {
    const windowX = -4.95 + i * 1.65;
    addBox(group, [0.72, 1.25, 0.08], shadowedStone, [windowX, 2.55, 2.88]);
    addBox(group, [0.55, 1.02, 0.09], glazing, [windowX, 2.58, 2.94]);
    addBox(group, [0.58, 0.07, 0.1], trim, [windowX, 2.6, 3.0]);
    addBox(group, [0.08, 1.04, 0.1], trim, [windowX, 2.58, 3.0]);
  }
  addBox(group, [1.32, 2.18, 0.16], shadowedStone, [0, 1.65, 3.03]);
  addBox(group, [1.04, 1.86, 0.12], makePbr(0x3c2f25, { roughness: 0.62 }), [0, 1.67, 3.12]);
  addCylinder(group, 0.11, 0.11, 0.08, bronze, [0.36, 1.72, 3.2], 12);

  const pediment = new THREE.Shape();
  pediment.moveTo(-6.3, 0);
  pediment.lineTo(6.3, 0);
  pediment.lineTo(0, 2.05);
  pediment.closePath();
  const pedimentGeometry = new THREE.ExtrudeGeometry(pediment, { depth: 0.22, bevelEnabled: false });
  addMesh(group, pedimentGeometry, trim, [0, 5.14, 3.18]);
  addMesh(group, new THREE.TorusGeometry(0.52, 0.075, 10, 32), bronze,
    [0, 5.8, 3.43], [0, 0, 0]);
  addCylinder(group, 0.08, 0.08, 0.12, bronze, [0, 7.15, 3.32], 12);

  for (let step = 0; step < 5; step++) {
    const width = 4.8 + step * 0.72;
    const depth = 0.5;
    addBox(group, [width, 0.22, depth], step % 2 ? trim : limestone,
      [0, 0.11 + step * 0.22, 3.65 + step * 0.5]);
  }
  for (const side of [-1, 1]) {
    addBox(group, [0.22, 0.74, 0.28], shadowedStone, [side * 6.15, 5.42, 3.28]);
    addBox(group, [0.42, 0.18, 0.42], trim, [side * 6.15, 5.86, 3.28]);
  }

  group.userData.collider = new THREE.Box3(
    new THREE.Vector3(x - 7.2, baseY, z - 4.2),
    new THREE.Vector3(x + 7.2, baseY + 7.6, z + 6.4),
  );
  return group;
}
