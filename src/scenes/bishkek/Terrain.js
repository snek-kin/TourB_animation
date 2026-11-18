// Terrain: gentle city slope (south rises) + the Kyrgyz Ala-Too range south of the city.
import * as THREE from 'three';
import { rng } from '../../effects/util.js';
function makeNoise(seed) {
  const rand = rng(seed);
  const perm = new Uint8Array(512);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    const l = (t, A, B) => A + t * (B - A);
    return l(v, l(u, grad(perm[a], x, y), grad(perm[b], x - 1, y)),
      l(u, grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1))) * 0.7071 + 0.5;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function makeGroundHeight(seed = 900) {
  const n = makeNoise(seed);
  const fbm = (x, y) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * n(x * f, y * f); a *= 0.5; f *= 2.1; } return s; };
  const ridge = (x, y) => { let s = 0, a = 0.55, f = 1; for (let i = 0; i < 4; i++) { const v = 1 - Math.abs(2 * n(x * f, y * f) - 1); s += a * v * v; a *= 0.5; f *= 2.0; } return s; };
  return (x, z) => {
    const base = z * 0.004;
    const foothill = smooth(360, 660, z) * (18 + fbm(x * 0.01, z * 0.01) * 46);
    const ramp = smooth(620, 1080, z);
    const crest = 150 + ridge(x * 0.0038 + 7.3, z * 0.0038) * 330;
    const along = 0.75 + 0.5 * fbm(x * 0.0016 + 3.1, 0.5);
    return base + foothill + ramp * crest * along;
  };
}
export function buildTerrain(groundHeightAt) {
  const W = 2600, D = 2400, CX = 0, CZ = 500;
  const geo = new THREE.PlaneGeometry(W, D, 128, 116);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const steppe = new THREE.Color(0x5d6247).convertSRGBToLinear(), dry = new THREE.Color(0x7a7550).convertSRGBToLinear();
  const rock = new THREE.Color(0x6e6a66).convertSRGBToLinear(), snow = new THREE.Color(0xeef3f8).convertSRGBToLinear();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + CX, z = pos.getZ(i) + CZ;
    const h = groundHeightAt(x, z);
    pos.setY(i, h);
    const e = 6;
    const slope = Math.abs(groundHeightAt(x + e, z) - h) / e + Math.abs(groundHeightAt(x, z + e) - h) / e;
    const t = Math.min(1, Math.max(0, (h - 20) / 120));
    c.copy(steppe).lerp(dry, Math.min(1, Math.max(0, (z - 200) / 500)));
    c.lerp(rock, t);
    const snowLine = 235 + (Math.sin(x * 0.013) + Math.cos(z * 0.017)) * 22;
    if (h > snowLine && slope < 1.15) c.lerp(snow, Math.min(1, (h - snowLine) / 55) * (1.15 - slope));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }));
  mesh.position.set(CX, -0.06, CZ);
  mesh.name = 'terrain';
  return mesh;
}
