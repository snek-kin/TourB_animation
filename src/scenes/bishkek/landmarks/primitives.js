import * as THREE from 'three';

export function addMesh(group, geometry, material, position = [0, 0, 0], rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function addBox(group, size, material, position = [0, 0, 0]) {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position);
}

export function addCylinder(group, radiusTop, radiusBottom, height, material, position = [0, 0, 0], radialSegments = 16) {
  return addMesh(
    group,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    material,
    position,
  );
}

export function addSoftContactShadow(group, width, depth, position = [0, 0.035, 0], opacity = 0.32) {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - size / 2) / (size / 2);
      const dy = (y + 0.5 - size / 2) / (size / 2);
      const radius = Math.sqrt(dx * dx + dy * dy);
      const edge = THREE.MathUtils.clamp((1 - radius) / 0.32, 0, 1);
      const alpha = Math.round(edge * edge * (3 - 2 * edge) * 255);
      const offset = (y * size + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
      pixels[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    color: 0x101725,
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  return addMesh(group, geometry, material, position);
}

export function makePbr(color, { roughness = 0.75, metalness = 0, ...options } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
}
