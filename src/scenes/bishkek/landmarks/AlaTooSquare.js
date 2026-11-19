import * as THREE from 'three';
import { RESERVES } from '../data.js';
import { LANDMARK_LOCATIONS } from './locations.js';
import { addBox, addCylinder, addMesh, addSoftContactShadow, makePbr } from './primitives.js';

function makeFlagTexture() {
  const width = 256, height = 160;
  const data = new Uint8Array(width * height * 4);
  const red = [237, 28, 52], gold = [255, 215, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - width / 2, dy = y + 0.5 - height / 2;
      const radius = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
      const rays = Math.max(0, Math.cos(angle * 20));
      const sunEdge = 31 + 8 * rays;
      const coverage = THREE.MathUtils.clamp(sunEdge - radius + 0.5, 0, 1);
      let color = red.map((channel, i) => Math.round(channel + (gold[i] - channel) * coverage));

      const inner = radius < 15;
      const ring = Math.abs(radius - 11.5) < 1.7;
      const spokes = inner && (Math.abs(dx) < 1.4 || Math.abs(dy) < 1.4 ||
        Math.abs(Math.abs(dx) - Math.abs(dy)) < 1.2);
      if (ring || spokes) color = red;

      const offset = (y * width + x) * 4;
      data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createAlaTooSquare(groundHeightAt) {
  if (typeof groundHeightAt !== 'function') throw new TypeError('Ala-Too Square requires groundHeightAt');
  const reserve = RESERVES.find((entry) => entry.id === 'alaToo');
  const center = LANDMARK_LOCATIONS.alaTooSquare;
  const baseY = groundHeightAt(center.x, center.z);
  const group = new THREE.Group();
  group.name = 'landmark-ala-too-square';
  group.position.set(center.x, baseY, center.z);

  const stone = makePbr(0xc8c4ba, { roughness: 0.88 });
  const borderStone = makePbr(0x716f69, { roughness: 0.92 });
  const brass = makePbr(0x9b7840, { roughness: 0.48, metalness: 0.62 });
  const flagBase = makePbr(0x5c5143, { roughness: 0.78, metalness: 0.24 });
  const tileColumns = 10, tileRows = 8;
  const tileWidth = (reserve.w - 0.5) / tileColumns, tileDepth = (reserve.d - 0.5) / tileRows;
  const tiles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(tileWidth - 0.045, 0.075, tileDepth - 0.045),
    stone,
    tileColumns * tileRows,
  );
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1), color = new THREE.Color();
  let instance = 0;
  for (let row = 0; row < tileRows; row++) {
    for (let column = 0; column < tileColumns; column++) {
      const x = reserve.x + 0.25 + (column + 0.5) * tileWidth;
      const z = reserve.z + 0.25 + (row + 0.5) * tileDepth;
      position.set(x - center.x, groundHeightAt(x, z) - baseY + 0.045, z - center.z);
      matrix.compose(position, rotation, scale);
      tiles.setMatrixAt(instance, matrix);
      const shade = 0.92 + ((column * 13 + row * 7) % 9) * 0.01;
      color.setRGB(shade, shade * 0.99, shade * 0.96);
      tiles.setColorAt(instance++, color);
    }
  }
  tiles.instanceMatrix.needsUpdate = true;
  if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  tiles.frustumCulled = false;
  tiles.name = 'ala-too-square-paving';
  group.add(tiles);

  const curbY = groundHeightAt(center.x, center.z) - baseY + 0.14;
  addBox(group, [reserve.w + 0.35, 0.22, 0.28], borderStone, [0, curbY, -reserve.d / 2]);
  addBox(group, [reserve.w + 0.35, 0.22, 0.28], borderStone, [0, curbY, reserve.d / 2]);
  addBox(group, [0.28, 0.22, reserve.d], borderStone, [-reserve.w / 2, curbY, 0]);
  addBox(group, [0.28, 0.22, reserve.d], borderStone, [reserve.w / 2, curbY, 0]);
  for (const radius of [1.9, 2.15, 2.65]) {
    addMesh(
      group,
      new THREE.RingGeometry(radius, radius + 0.045, 64),
      brass,
      [center.x - center.x, groundHeightAt(center.x, center.z) - baseY + 0.11, center.z - center.z],
      [-Math.PI / 2, 0, 0],
    );
  }
  const poleX = 3, poleZ = 0;
  addSoftContactShadow(group, 4.2, 3.3,
    [poleX, groundHeightAt(center.x + poleX, center.z + poleZ) - baseY + 0.13, poleZ], 0.42);

  const poleGround = groundHeightAt(center.x + poleX, center.z + poleZ) - baseY;
  addCylinder(group, 0.5, 0.62, 0.38, flagBase, [poleX, poleGround + 0.19, poleZ], 12);
  addCylinder(group, 0.28, 0.38, 0.22, brass, [poleX, poleGround + 0.49, poleZ], 12);
  addCylinder(group, 0.075, 0.11, 6.7, makePbr(0x9b9b93, { roughness: 0.34, metalness: 0.8 }),
    [poleX, poleGround + 3.95, poleZ], 16);
  addCylinder(group, 0.12, 0.16, 0.18, brass, [poleX, poleGround + 7.29, poleZ], 12);
  addMesh(group, new THREE.SphereGeometry(0.13, 16, 12), brass, [poleX, poleGround + 7.45, poleZ]);

  const flagGeometry = new THREE.PlaneGeometry(2.25, 1.42, 24, 8);
  const flag = addMesh(group, flagGeometry, new THREE.MeshStandardMaterial({
    map: makeFlagTexture(), roughness: 0.72, metalness: 0.01, side: THREE.DoubleSide,
  }), [poleX + 1.15, poleGround + 6.72, poleZ + 0.02]);
  flag.name = 'animated-kyrgyz-flag';
  const basePositions = new Float32Array(flagGeometry.attributes.position.array);
  group.userData.update = (elapsed) => {
    const positions = flagGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i) / 2.25 + 0.5;
      const v = positions.getY(i) / 1.42 + 0.5;
      positions.setZ(i, basePositions[i * 3 + 2] + Math.sin(elapsed * 2.05 - u * 3.1 + v * 0.45) * 0.16 * u);
    }
    positions.needsUpdate = true;
    flagGeometry.computeVertexNormals();
  };
  group.userData.flag = flag;
  return group;
}
