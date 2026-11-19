import * as THREE from 'three';
import { RESERVES } from '../data.js';
import {
  createBench,
  createBusStop,
  createPlanter,
  createRoadSign,
  createSidewalkElement,
  createStreetLamp,
  createTrafficLight,
  createTree,
} from './UrbanAssets.js';
import { LANDMARK_LOCATIONS } from './locations.js';
import { addBox, addCylinder, addMesh, makePbr } from './primitives.js';

function createVehicle(colorHex, groundHeightAt, length = 2.2) {
  const group = new THREE.Group();
  group.name = 'procedural-city-vehicle';
  const paint = new THREE.MeshPhysicalMaterial({
    color: colorHex, roughness: 0.34, metalness: 0.62, clearcoat: 0.68, clearcoatRoughness: 0.28,
  });
  const trim = makePbr(0x20272c, { roughness: 0.42, metalness: 0.58 });
  const glass = makePbr(0x33495b, { roughness: 0.22, metalness: 0.42, transparent: true, opacity: 0.9 });
  const wheel = makePbr(0x171b1e, { roughness: 0.92 });
  const hub = makePbr(0xa6a7a3, { roughness: 0.36, metalness: 0.82 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xf3e7bd, emissive: 0xffdf96, emissiveIntensity: 0.25, roughness: 0.3 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0x8e2924, emissive: 0xff2e24, emissiveIntensity: 0.18, roughness: 0.3 });
  const width = length * 0.48;
  addBox(group, [width, 0.52, length], paint, [0, 0.48, 0]);
  addBox(group, [width * 0.78, 0.46, length * 0.52], trim, [0, 0.9, -0.02]);
  addBox(group, [width * 0.71, 0.34, length * 0.43], glass, [0, 0.94, 0]);
  addBox(group, [width * 0.91, 0.12, length * 0.18], paint, [0, 0.48, length * 0.41]);
  for (const side of [-1, 1]) {
    for (const front of [-1, 1]) {
      const z = front * length * 0.31;
      const tire = addCylinder(group, 0.23, 0.23, 0.14, wheel, [side * (width * 0.49), 0.27, z], 14);
      tire.rotation.z = Math.PI / 2;
      const rim = addCylinder(group, 0.11, 0.11, 0.15, hub, [side * (width * 0.49), 0.27, z], 12);
      rim.rotation.z = Math.PI / 2;
    }
    addMesh(group, new THREE.SphereGeometry(0.095, 10, 8), headlight,
      [side * width * 0.34, 0.57, length * 0.49]);
    addMesh(group, new THREE.SphereGeometry(0.075, 10, 8), taillight,
      [side * width * 0.34, 0.58, -length * 0.49]);
  }
  group.userData.update = (_elapsed, dusk = 0) => {
    headlight.emissiveIntensity = 0.15 + dusk * 2.1;
    taillight.emissiveIntensity = 0.18 + dusk * 0.3;
  };
  group.userData.groundHeightAt = groundHeightAt;
  return group;
}

function createPedestrian(groundHeightAt, clothing) {
  const group = new THREE.Group();
  group.name = 'pedestrian-silhouette';
  const cloth = makePbr(clothing, { roughness: 0.86 });
  const dark = makePbr(0x282c30, { roughness: 0.82 });
  const skin = makePbr(0xa8785e, { roughness: 0.8 });
  const torso = addMesh(group, new THREE.CapsuleGeometry(0.16, 0.56, 4, 8), cloth, [0, 1.05, 0]);
  torso.name = 'pedestrian-torso';
  addMesh(group, new THREE.SphereGeometry(0.17, 12, 8), skin, [0, 1.52, 0]);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.095, 0.77, 0);
    group.add(leg);
    addMesh(leg, new THREE.CapsuleGeometry(0.07, 0.45, 3, 7), dark, [0, -0.24, 0]);
    addBox(leg, [0.13, 0.08, 0.24], dark, [0, -0.5, 0.06]);
    legs.push(leg);
    addSegment(group, [side * 0.17, 1.28, 0], [side * 0.24, 0.88, 0.04], 0.07, cloth);
  }
  group.userData.walk = (elapsed, phase) => {
    legs[0].rotation.x = Math.sin(elapsed * 4 + phase) * 0.28;
    legs[1].rotation.x = -Math.sin(elapsed * 4 + phase) * 0.28;
  };
  group.userData.groundHeightAt = groundHeightAt;
  return group;
}

function addSegment(group, start, end, radius, material) {
  const from = new THREE.Vector3(...start), to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const mesh = addMesh(group, new THREE.CylinderGeometry(radius * 0.75, radius, direction.length(), 8),
    material, from.clone().add(to).multiplyScalar(0.5).toArray());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function reserveCenter(id) {
  const reserve = RESERVES.find((entry) => entry.id === id);
  return { x: reserve.x + reserve.w / 2, z: reserve.z + reserve.d / 2, reserve };
}

function add(group, objects) {
  for (const object of objects) group.add(object);
}

function routeCurve(points) {
  return new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
    0.2,
  );
}

export function createCityActivity(groundHeightAt) {
  if (typeof groundHeightAt !== 'function') throw new TypeError('City activity requires groundHeightAt');
  const root = new THREE.Group();
  root.name = 'bishkek-city-activity';
  const updates = [];
  const movers = [];
  const trees = [];
  const square = reserveCenter('alaToo');
  const phil = LANDMARK_LOCATIONS.philharmonic;

  const lamps = [
    [square.x - 6.4, square.z], [square.x + 6.4, square.z],
    [phil.x - 6.9, phil.z + 2.8], [phil.x + 6.9, phil.z + 2.8],
  ];
  for (const [x, z] of lamps) {
    const lamp = createStreetLamp({ x, z, groundHeightAt, height: 4.5 });
    root.add(lamp); updates.push(lamp.userData.update);
  }

  const benches = [
    [square.x - 4.6, square.z - 4.7, 0], [square.x + 4.6, square.z - 4.7, Math.PI],
    [square.x - 4.6, square.z + 4.7, 0], [square.x + 4.6, square.z + 4.7, Math.PI],
    [phil.x - 4.3, phil.z + 5.2, 0], [phil.x + 4.3, phil.z + 5.2, 0],
  ];
  for (const [x, z, rotation] of benches) root.add(createBench({ x, z, groundHeightAt, rotation }));

  const treesAt = [
    [square.x - 6.4, square.z - 4.8], [square.x + 6.4, square.z - 4.8],
    [square.x - 6.4, square.z + 4.8], [square.x + 6.4, square.z + 4.8],
    [-39, -5],
  ];
  treesAt.forEach(([x, z], index) => {
    const tree = createTree({ x, z, groundHeightAt, scale: index === 4 ? 1.08 : 0.86, phase: index * 1.31 });
    root.add(tree); trees.push(tree);
  });

  const planters = [[square.x - 5.2, square.z], [-39, -10]];
  for (const [x, z] of planters) root.add(createPlanter({ x, z, groundHeightAt, radius: 0.72 }));

  const busStop = createBusStop({ x: -43, z: -2.7, groundHeightAt, rotation: Math.PI });
  root.add(busStop);
  root.add(createRoadSign({ x: -51, z: 2.2, groundHeightAt, rotation: Math.PI / 2 }));
  root.add(createSidewalkElement({ x: -46, z: -1.3, groundHeightAt }));
  root.add(createSidewalkElement({ x: -40, z: -1.3, groundHeightAt }));

  const signals = [
    createTrafficLight({ x: -53.7, z: 2.8, groundHeightAt, rotation: 0, phase: 0 }),
    createTrafficLight({ x: 25.8, z: 2.8, groundHeightAt, rotation: Math.PI / 2, phase: 3 }),
  ];
  for (const signal of signals) { root.add(signal); updates.push(signal.userData.update); }

  const carRoutes = [
    { points: [[-88, 0], [88, 0], [88, -46], [-88, -46]], speed: 9.2, phase: 0.02, color: 0x344c61 },
    { points: [[-88, -46], [88, -46], [88, 0], [-88, 0]], speed: 8.4, phase: 0.54, color: 0x7d4234 },
    { points: [[-88, 18], [56, 18], [56, 34], [-88, 34]], speed: 7.6, phase: 0.31, color: 0x9b9b8a },
  ];
  for (const [index, route] of carRoutes.entries()) {
    const vehicle = createVehicle(route.color, groundHeightAt, index === 2 ? 1.9 : 2.2);
    root.add(vehicle);
    movers.push({
      object: vehicle,
      curve: routeCurve(route.points),
      speed: route.speed,
      phase: route.phase,
      offset: index * 11,
      pedestrian: false,
    });
    updates.push(vehicle.userData.update);
  }

  const pedestrianRoutes = [
    { points: [[square.x - 6, square.z - 3.8], [square.x + 5, square.z - 3.8], [square.x + 5, square.z + 3.8], [square.x - 6, square.z + 3.8]], phase: 0 },
    { points: [[square.x + 5.3, square.z - 2.4], [square.x + 5.3, square.z + 2.8], [square.x + 1.5, square.z + 3.4]], phase: 1.9 },
  ];
  for (const [index, route] of pedestrianRoutes.entries()) {
    const walker = createPedestrian(groundHeightAt, index ? 0x6a5849 : 0x475865);
    root.add(walker);
    movers.push({
      object: walker,
      curve: routeCurve(route.points),
      speed: 1.15,
      phase: route.phase / (Math.PI * 2),
      offset: index * 5,
      pedestrian: true,
    });
  }

  function update(elapsed, dusk = 0) {
    for (const animate of updates) animate?.(elapsed, dusk);
    for (const tree of trees) tree.userData.update(elapsed);
    for (const mover of movers) {
      const length = mover.curve.getLength();
      const distance = ((elapsed * mover.speed + mover.offset) % length + length) % length;
      const u = distance / length;
      const point = mover.curve.getPointAt(u);
      const tangent = mover.curve.getTangentAt(u);
      mover.object.position.set(point.x, groundHeightAt(point.x, point.z), point.z);
      mover.object.rotation.y = Math.atan2(tangent.x, tangent.z);
      if (mover.pedestrian) mover.object.userData.walk(elapsed, mover.phase);
      else mover.object.position.y += 0.08;
    }
  }

  return { group: root, update, movers, trafficLights: signals, trees };
}
