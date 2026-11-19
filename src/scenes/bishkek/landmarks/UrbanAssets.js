import * as THREE from 'three';
import { addBox, addCylinder, addMesh, makePbr } from './primitives.js';

function placedGroup(name, x, z, groundHeightAt, rotation = 0) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, groundHeightAt(x, z), z);
  group.rotation.y = rotation;
  return group;
}

function addSegment(group, start, end, radius, material) {
  const from = new THREE.Vector3(...start), to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const mesh = addMesh(group,
    new THREE.CylinderGeometry(radius * 0.78, radius, direction.length(), 8),
    material, from.clone().add(to).multiplyScalar(0.5).toArray());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function createStreetLamp({ x, z, groundHeightAt, height = 4.8 } = {}) {
  const group = placedGroup('street-lamp', x, z, groundHeightAt);
  const darkMetal = makePbr(0x303a43, { roughness: 0.36, metalness: 0.78 });
  const trim = makePbr(0x68727a, { roughness: 0.34, metalness: 0.82 });
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xdbc18f, emissive: 0xffc66b, emissiveIntensity: 0.32, roughness: 0.3,
  });
  addCylinder(group, 0.17, 0.24, 0.24, darkMetal, [0, 0.12, 0], 12);
  addCylinder(group, 0.045, 0.105, height - 0.28, darkMetal, [0, (height - 0.28) / 2 + 0.12, 0], 12);
  const armY = height - 0.18;
  addSegment(group, [0, armY - 0.3, 0], [0.82, armY, 0], 0.045, trim);
  addBox(group, [0.5, 0.09, 0.35], darkMetal, [0.91, armY - 0.03, 0]);
  const bulb = addMesh(group, new THREE.SphereGeometry(0.16, 14, 10), bulbMaterial, [0.91, armY - 0.17, 0]);
  bulb.name = 'lamp-diffuser';
  group.userData.update = (_elapsed, dusk = 0) => {
    bulbMaterial.emissiveIntensity = 0.18 + dusk * 1.8;
  };
  group.userData.bulb = bulb;
  return group;
}

export function createBench({ x, z, groundHeightAt, rotation = 0 } = {}) {
  const group = placedGroup('plaza-bench', x, z, groundHeightAt, rotation);
  const wood = makePbr(0x76513a, { roughness: 0.72 });
  const darkMetal = makePbr(0x343b40, { roughness: 0.4, metalness: 0.72 });
  for (let i = 0; i < 5; i++) addBox(group, [2.05, 0.095, 0.16], wood, [0, 0.76, -0.32 + i * 0.16]);
  for (let side of [-0.78, 0.78]) {
    addBox(group, [0.12, 0.72, 0.72], darkMetal, [side, 0.42, 0]);
    addBox(group, [0.14, 0.11, 0.88], darkMetal, [side, 0.78, -0.05]);
    addBox(group, [0.12, 0.55, 0.1], darkMetal, [side, 1.04, -0.34]);
  }
  for (let i = 0; i < 4; i++) addBox(group, [2.05, 0.09, 0.12], wood, [0, 1.28, -0.34 + i * 0.15]);
  return group;
}

export function createTree({ x, z, groundHeightAt, scale = 1, phase = 0, foliage = 0x58734a } = {}) {
  const group = placedGroup('street-tree', x, z, groundHeightAt);
  group.scale.setScalar(scale);
  const trunkMaterial = makePbr(0x51402f, { roughness: 0.96 });
  const leaves = makePbr(foliage, { roughness: 0.92 });
  const trunk = addCylinder(group, 0.14, 0.2, 1.75, trunkMaterial, [0, 0.88, 0], 8);
  trunk.name = 'tree-trunk';
  const canopy = new THREE.Group();
  canopy.name = 'tree-canopy';
  canopy.position.y = 1.58;
  group.add(canopy);
  const clusters = [
    [[0, 0.22, 0], [0.72, 0.78, 0.62]],
    [[-0.48, 0.7, 0.08], [0.62, 0.7, 0.56]],
    [[0.46, 0.65, -0.1], [0.64, 0.76, 0.58]],
    [[0, 0.88, 0.35], [0.58, 0.62, 0.52]],
  ];
  for (const [position, size] of clusters) {
    const leaf = addMesh(canopy, new THREE.IcosahedronGeometry(1, 1), leaves, position);
    leaf.scale.set(...size);
  }
  group.userData.update = (elapsed) => {
    canopy.rotation.z = Math.sin(elapsed * 0.72 + phase) * 0.026;
    canopy.rotation.x = Math.cos(elapsed * 0.53 + phase) * 0.012;
  };
  return group;
}

export function createBusStop({ x, z, groundHeightAt, rotation = 0 } = {}) {
  const group = placedGroup('glass-bus-stop', x, z, groundHeightAt, rotation);
  const frame = makePbr(0x404c53, { roughness: 0.32, metalness: 0.78 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x8db5cb, roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.28,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const roof = makePbr(0x454d50, { roughness: 0.42, metalness: 0.68 });
  const wood = makePbr(0x73533a, { roughness: 0.76 });
  addBox(group, [4.6, 0.16, 2.35], roof, [0, 2.75, 0]);
  for (const side of [-2.15, 2.15]) addBox(group, [0.12, 2.65, 0.12], frame, [side, 1.35, -0.98]);
  for (const xPanel of [-1.1, 0.55]) {
    addMesh(group, new THREE.BoxGeometry(1.55, 2.4, 0.055), glass, [xPanel, 1.38, -0.98]);
    addBox(group, [0.06, 2.58, 0.08], frame, [xPanel - 0.78, 1.36, -0.98]);
    addBox(group, [0.06, 2.58, 0.08], frame, [xPanel + 0.78, 1.36, -0.98]);
  }
  addBox(group, [2.1, 0.15, 0.55], wood, [0.15, 0.78, -0.25]);
  for (const side of [-0.72, 0.96]) addBox(group, [0.09, 0.77, 0.48], frame, [side, 0.42, -0.25]);
  addBox(group, [0.84, 0.78, 0.08], frame, [-1.56, 1.86, -0.86]);
  addBox(group, [0.62, 0.42, 0.035], makePbr(0x80b9ce, { roughness: 0.46, metalness: 0.18, emissive: 0x12313e, emissiveIntensity: 0.15 }),
    [-1.56, 1.88, -0.8]);
  return group;
}

export function createTrafficLight({ x, z, groundHeightAt, rotation = 0, phase = 0 } = {}) {
  const group = placedGroup('animated-traffic-signal', x, z, groundHeightAt, rotation);
  const metal = makePbr(0x313a40, { roughness: 0.38, metalness: 0.75 });
  const pole = addCylinder(group, 0.055, 0.09, 3.4, metal, [0, 1.7, 0], 10);
  pole.name = 'signal-pole';
  addBox(group, [0.42, 1.16, 0.42], metal, [0, 3.1, 0]);
  const colors = [0xff3f46, 0xffc447, 0x39e181];
  const bulbs = colors.map((color, i) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.08,
      roughness: 0.22,
    });
    const bulb = addMesh(group, new THREE.SphereGeometry(0.13, 14, 10), material, [0, 3.48 - i * 0.37, 0.23]);
    return { material, bulb };
  });
  group.userData.update = (elapsed) => {
    const phaseTime = (elapsed + phase) % 12;
    const active = phaseTime < 6 ? 2 : phaseTime < 7.5 ? 1 : 0;
    bulbs.forEach(({ material }, index) => {
      material.emissiveIntensity = index === active ? 2.2 : 0.06;
    });
  };
  return group;
}

export function createRoadSign({ x, z, groundHeightAt, rotation = 0 } = {}) {
  const group = placedGroup('direction-road-sign', x, z, groundHeightAt, rotation);
  const post = makePbr(0x747c7e, { roughness: 0.35, metalness: 0.8 });
  const panel = makePbr(0x2d6871, { roughness: 0.42, metalness: 0.18 });
  const marking = makePbr(0xe4e5d8, { roughness: 0.48, metalness: 0.05 });
  addCylinder(group, 0.055, 0.075, 2.85, post, [0, 1.43, 0], 10);
  for (const [y, direction] of [[2.34, 1], [1.73, -1]]) {
    addBox(group, [1.55, 0.48, 0.11], panel, [0, y, 0]);
    addBox(group, [0.62, 0.055, 0.13], marking, [direction * 0.08, y, 0.08]);
    const arrow = addMesh(group, new THREE.ConeGeometry(0.17, 0.35, 4), marking,
      [direction * 0.55, y, 0.08], [0, 0, direction < 0 ? Math.PI / 2 : -Math.PI / 2]);
    arrow.rotation.z = direction < 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  return group;
}

export function createSidewalkElement({ x, z, groundHeightAt, rotation = 0 } = {}) {
  const group = placedGroup('tactile-sidewalk-paving', x, z, groundHeightAt, rotation);
  const slab = makePbr(0xaaa79d, { roughness: 0.92 });
  const tactile = makePbr(0xd0b263, { roughness: 0.84 });
  addBox(group, [2.5, 0.1, 1.25], slab, [0, 0.05, 0]);
  const studs = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.045, 8),
    tactile,
    24,
  );
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 8; column++) {
      matrix.makeTranslation(-0.88 + column * 0.25, 0.12, -0.24 + row * 0.24);
      studs.setMatrixAt(index++, matrix);
    }
  }
  studs.instanceMatrix.needsUpdate = true;
  group.add(studs);
  return group;
}

export function createPlanter({ x, z, groundHeightAt, radius = 1.15, foliage = 0x59744b } = {}) {
  const group = placedGroup('plaza-planter', x, z, groundHeightAt);
  const stone = makePbr(0x77766f, { roughness: 0.85 });
  const soil = makePbr(0x403629, { roughness: 1 });
  const leaves = makePbr(foliage, { roughness: 0.9 });
  addCylinder(group, radius, radius * 1.08, 0.52, stone, [0, 0.26, 0], 20);
  addCylinder(group, radius * 0.82, radius * 0.82, 0.09, soil, [0, 0.54, 0], 20);
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const height = 0.75 + (i % 3) * 0.16;
    const leaf = addMesh(group, new THREE.ConeGeometry(0.21, height, 7), leaves,
      [Math.cos(angle) * radius * 0.46, 0.58 + height / 2, Math.sin(angle) * radius * 0.46]);
    leaf.rotation.z = Math.cos(angle) * -0.16;
    leaf.rotation.x = Math.sin(angle) * 0.16;
  }
  return group;
}
