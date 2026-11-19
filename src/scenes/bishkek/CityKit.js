// Procedural Bishkek building kit: instanced archetypes + recognizable landmark approximations.
// Layout generation is pure (node-testable); mesh building needs DOM canvas (browser only).
import * as THREE from 'three';
import { rng } from '../../effects/util.js';
import { CITY, AVENUES_EW, STREETS_NS, RESERVES } from './data.js';
const TYPES = {
  panel: { w: [9, 12], d: [3, 3.6], h: [5.4, 6.6] },
  brick: { w: [7, 9], d: [2.8, 3.2], h: [3.4, 4.2] },
  mid: { w: [5.5, 7], d: [2.6, 3], h: [2.6, 3.2] },
  house: { w: [2.6, 3.4], d: [2.2, 2.8], h: [1, 1.4] },
  tower: { w: [4, 5], d: [4, 5], h: [9, 12] },
};
const TOWER_SPOTS = [[26, -8], [40, 4], [58, -10], [14, -22], [-8, -24], [62, 12], [30, 24], [-44, 8]];
function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z; }

// Building grid: a regular minor-street lattice merged with the named arteries,
// so the downtown reads as many blocks rather than a handful of super-cells.
export function boundaries() {
  const xs = new Set([CITY.xMin, CITY.xMax, ...STREETS_NS.map((s) => s.x)]);
  const zs = new Set([CITY.zMin, CITY.zMax, ...AVENUES_EW.map((a) => a.z)]);
  for (let x = -110; x <= 110; x += 11) if (!STREETS_NS.some((s) => Math.abs(x - s.x) < 4)) xs.add(x);
  for (let z = -78; z <= 78; z += 11) if (!AVENUES_EW.some((a) => Math.abs(z - a.z) < 4)) zs.add(z);
  return { xs: [...xs].sort((a, b) => a - b), zs: [...zs].sort((a, b) => a - b) };
}

/** Pure layout: parallel mid-rise bars in the core, tiled houses in the periphery. Deterministic. */
export function generateLayout(seed = 2026) {
  const rand = rng(seed);
  const out = { panel: [], brick: [], mid: [], house: [], tower: [] };
  const records = [], colliders = [];
  const { xs, zs } = boundaries();
  const push = (type, x, z, w, d, h, rot) => {
    const rec = { type, x, z, w, d, h, rot };
    out[type].push(rec); records.push(rec);
    if (h > 4.5) colliders.push({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2] });
  };
  for (const [tx, tz] of TOWER_SPOTS) {
    if (RESERVES.some((r) => tx > r.x - 2 && tx < r.x + r.w + 2 && tz > r.z - 2 && tz < r.z + r.d + 2)) continue;
    const t = TYPES.tower;
    push('tower', tx, tz, t.w[0] + rand() * (t.w[1] - t.w[0]), t.d[0] + rand() * (t.d[1] - t.d[0]), t.h[0] + rand() * (t.h[1] - t.h[0]), 0);
  }
  for (let iz = 0; iz < zs.length - 1; iz++) {
    for (let ix = 0; ix < xs.length - 1; ix++) {
      const cell = { x: xs[ix] + 1.4, z: zs[iz] + 1.4, w: xs[ix + 1] - xs[ix] - 2.8, d: zs[iz + 1] - zs[iz] - 2.8 };
      if (cell.w < 3.5 || cell.d < 3.5) continue;
      if (RESERVES.some((r) => overlaps(cell, r))) continue;
      if (TOWER_SPOTS.some(([tx, tz]) => cell.x < tx && tx < cell.x + cell.w && cell.z < tz && tz < cell.z + cell.d)) continue;
      const cx = cell.x + cell.w / 2, cz = cell.z + cell.d / 2;
      const core = Math.abs(cx) < 85 && cz > -60 && cz < 50;
      const midRing = Math.abs(cx) < 150 && cz > -100 && cz < 95;
      const type = core ? (rand() < 0.5 ? 'panel' : rand() < 0.6 ? 'brick' : 'mid')
        : midRing ? (rand() < 0.28 ? 'panel' : rand() < 0.6 ? 'brick' : 'mid') : 'house';
      const t = TYPES[type];
      if (type === 'house') {
        const cols = Math.max(1, Math.floor(cell.w / 7)), rows = Math.max(1, Math.floor(cell.d / 7));
        let placed = 0;
        for (let rz = 0; rz < rows; rz++) {
          for (let cxi = 0; cxi < cols; cxi++) {
            if (placed >= 16) break;
            if (rand() < 0.3) continue;
            const w = t.w[0] + rand() * (t.w[1] - t.w[0]), d = t.d[0] + rand() * (t.d[1] - t.d[0]), h = t.h[0] + rand() * (t.h[1] - t.h[0]);
            const x = cell.x + (cxi + 0.5) * (cell.w / cols) + (rand() - 0.5) * 1.4;
            const z = cell.z + (rz + 0.5) * (cell.d / rows) + (rand() - 0.5) * 1.4;
            push('house', x, z, w, d, h, rand() < 0.5 ? 0 : Math.PI / 2); placed++;
          }
        }
      } else {
        const stackZ = cell.d >= cell.w;
        const barLen = (stackZ ? cell.w : cell.d) * 0.8;
        const barDep = (t.d[0] + t.d[1]) / 2;
        const longDim = stackZ ? cell.d : cell.w;
        const rows = Math.max(1, Math.floor(longDim / (barDep + 2.6)));
        for (let r = 0; r < rows; r++) {
          if (rand() < 0.08) continue;
          const h = t.h[0] + rand() * (t.h[1] - t.h[0]);
          const L = barLen * (0.85 + rand() * 0.15), D = barDep * (0.9 + rand() * 0.2);
          if (stackZ) {
            const x = cx + (rand() - 0.5) * 0.8, z = cell.z + (r + 0.5) * (cell.d / rows) + (rand() - 0.5) * 0.6;
            push(type, x, z, L, D, h, 0);
          } else {
            const z = cz + (rand() - 0.5) * 0.8, x = cell.x + (r + 0.5) * (cell.w / rows) + (rand() - 0.5) * 0.6;
            push(type, x, z, L, D, h, Math.PI / 2);
          }
        }
      }
    }
  }
  return { instances: out, records, colliders };
}

function facadeTextures({ floors, cols, base, litRatio, cool = 0.15, seed }) {
  const S = 256, roofY = 14;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = S;
  const ge = e.getContext('2d');
  const rand = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.05})`;
    g.fillRect(rand() * S, roofY + rand() * (S - roofY), 2 + rand() * 6, 8 + rand() * 30);
  }
  g.fillStyle = '#3a3d42'; g.fillRect(0, 0, S, roofY);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const mx = 10, my = roofY + 8, gw = (S - mx * 2) / cols, gh = (S - my - 8) / floors;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const wx = mx + col * gw + gw * 0.22, wy = my + f * gh + gh * 0.2, ww = gw * 0.56, wh = gh * 0.58;
      g.fillStyle = '#232c38'; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(wx, wy, ww, 1.5);
      if (rand() < litRatio) {
        const warm = rand() > cool;
        ge.fillStyle = warm ? `rgba(255,196,107,${0.55 + rand() * 0.45})` : `rgba(205,224,255,${0.5 + rand() * 0.5})`;
        ge.fillRect(wx, wy, ww, wh);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, my + f * gh, S, 1);
  }
  const mk = (cv) => { const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; };
  return { map: mk(c), emissiveMap: mk(e) };
}
function boxWithRoofUV(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  for (let i = 8; i < 16; i++) uv.setXY(i, (i % 2), 0.95 + (i % 4 < 2 ? 0 : 0.04));
  uv.needsUpdate = true;
  geo.translate(0, h / 2, 0);
  return geo;
}
function roofPrism() {
  const v = new Float32Array([-0.5,0,-0.5, 0.5,0,-0.5, 0.5,0,0.5, -0.5,0,0.5, -0.5,0.55,0, 0.5,0.55,0]);
  const idx = [0,1,5, 0,5,4, 3,2,5, 3,5,4, 0,3,4, 1,2,5, 0,1,2, 0,2,3];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
export function buildCity(layout, groundHeightAt) {
  const group = new THREE.Group(); group.name = 'city';
  const facadeMats = [];
  const meshes = {};
  const rand = rng(777);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const tint = new THREE.Color();
  const specs = {
    panel: { floors: 9, cols: 10, base: '#9a9186', litRatio: 0.5, rough: 0.85, metal: 0.05 },
    brick: { floors: 5, cols: 8, base: '#8a6f5c', litRatio: 0.55, rough: 0.9, metal: 0.02 },
    mid: { floors: 4, cols: 7, base: '#a89a83', litRatio: 0.5, rough: 0.85, metal: 0.05 },
    house: { floors: 1, cols: 4, base: '#b0a490', litRatio: 0.4, rough: 0.9, metal: 0 },
    tower: { floors: 14, cols: 6, base: '#1c2f45', litRatio: 0.6, cool: 0.6, rough: 0.3, metal: 0.6 },
  };
  for (const [type, list] of Object.entries(layout.instances)) {
    if (!list.length) continue;
    const sp = specs[type];
    const { map, emissiveMap } = facadeTextures({ ...sp, seed: 100 + type.charCodeAt(0) * 13 + type.length });
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: sp.rough, metalness: sp.metal });
    facadeMats.push(mat);
    const mesh = new THREE.InstancedMesh(boxWithRoofUV(1, 1, 1), mat, list.length);
    list.forEach((r, i) => {
      const y0 = groundHeightAt(r.x, r.z); r.y0 = y0;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot);
      p.set(r.x, y0, r.z); s.set(r.w, r.h, r.d);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      const v = 0.86 + rand() * 0.24;
      tint.setRGB(v, v * (0.97 + rand() * 0.05), v * (0.94 + rand() * 0.06));
      mesh.setColorAt(i, tint);
      r.tint = [tint.r, tint.g, tint.b];
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; mesh.name = `buildings-${type}`;
    group.add(mesh);
    meshes[type] = mesh;
    if (type === 'house') {
      const roofs = new THREE.InstancedMesh(roofPrism(), new THREE.MeshStandardMaterial({ color: 0x7d5a4a, roughness: 0.9 }), list.length);
      list.forEach((r, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot);
        p.set(r.x, r.y0 + r.h, r.z); s.set(r.w * 1.12, 0.8, r.d * 1.12);
        m.compose(p, q, s); roofs.setMatrixAt(i, m);
        tint.setHSL(0.05 + rand() * 0.04, 0.3 + rand() * 0.2, 0.32 + rand() * 0.14);
        roofs.setColorAt(i, tint);
      });
      roofs.instanceMatrix.needsUpdate = true;
      if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
      roofs.frustumCulled = false; group.add(roofs);
    }
  }
  const colliders = layout.colliders.map((c) => new THREE.Box3(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max)));
  const lm = buildLandmarks(groundHeightAt);
  group.add(lm.group);
  colliders.push(...lm.colliders);
  return { group, facadeMats, flagUniforms: lm.flagUniforms, colliders, meshes };
}
// Recognizable landmarks — stylized procedural approximations (not photogrammetry).
function buildLandmarks(groundHeightAt) {
  const g = new THREE.Group(); g.name = 'landmarks';
  const colliders = [];
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.9 });
  const granite = new THREE.MeshStandardMaterial({ color: 0x4a4642, roughness: 0.8 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x3d3428, roughness: 0.5, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x27435f, roughness: 0.25, metalness: 0.6 });
  const box = (w, h, d, mat, x, z, dy = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, groundHeightAt(x, z) + h / 2 + dy, z);
    g.add(mesh); return mesh;
  };
  const addCol = (x, z, w, h, d) => colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, h + 1, z + d / 2)));
  box(16, 4.6, 6, white, 0, -8.5);
  for (let i = 0; i < 9; i++) box(0.5, 3.8, 0.5, white, -6.4 + i * 1.6, -4.9);
  box(16.5, 0.5, 1.6, white, 0, -4.9, 3.8);
  addCol(0, -8.5, 17, 5, 8);
  box(20, 4, 4.5, white, 0, 16); addCol(0, 16, 21, 4.5, 5.5);
  const phil = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4, 24, 1, false, Math.PI, Math.PI), glass);
  phil.position.set(23, groundHeightAt(23, -10) + 2, -10); g.add(phil);
  box(10, 4, 3, white, 23, -12.5); addCol(23, -10, 11, 4.5, 9);
  const vy = groundHeightAt(57, 1);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.8, 24), granite);
  ped.position.set(57, vy + 0.4, 1); g.add(ped);
  const yurt = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.4, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a8178, roughness: 0.8, side: THREE.DoubleSide }));
  yurt.position.set(57, vy + 2, 1); g.add(yurt);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb03b, toneMapped: false }));
  flame.position.set(57, vy + 1.1, 3.6); g.add(flame);
  addCol(57, 1, 5.5, 3.5, 5.5);
  const sy = groundHeightAt(0, 4);
  box(1.8, 1.3, 1.2, granite, 0, 4);
  box(1.5, 0.9, 0.5, bronze, 0, 4, 1.3);
  box(0.45, 1.1, 0.45, bronze, 0.1, 4, 2.2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 7, 8), granite);
  pole.position.set(3, sy + 3.5, 7); g.add(pole);
  const flagUniforms = { uTime: { value: 0 }, uOpacity: { value: 1 }, uMap: { value: flagTexture() } };
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4, 12, 4), new THREE.ShaderMaterial({
    uniforms: flagUniforms, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `uniform float uTime; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position;
        p.z += sin(uv.x * 6.0 + uTime * 3.0) * 0.14 * uv.x;
        p.y += sin(uv.x * 3.0 + uTime * 1.7) * 0.05 * uv.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv;
      void main(){ vec4 c = texture2D(uMap, vUv); gl_FragColor = vec4(c.rgb, uOpacity);
        #include <colorspace_fragment> }`,
  }));
  flag.position.set(4.15, sy + 6.2, 7); g.add(flag);
  addCol(3, 7, 1, 7.5, 1);
  box(10, 2.6, 6, white, -20, 142);
  const sheds = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 1.2, 3), new THREE.MeshStandardMaterial({ color: 0x9c8f7a, roughness: 0.9 }), 8);
  const mm = new THREE.Matrix4(), tt = new THREE.Color(), rr = rng(55);
  for (let i = 0; i < 8; i++) {
    const x = -192 + (i % 4) * 5.5, z = 8 + Math.floor(i / 4) * 5;
    mm.makeTranslation(x, groundHeightAt(x, z) + 0.6, z);
    sheds.setMatrixAt(i, mm);
    tt.setHSL(0.07 + rr() * 0.05, 0.25, 0.4 + rr() * 0.15); sheds.setColorAt(i, tt);
  }
  sheds.instanceMatrix.needsUpdate = true;
  if (sheds.instanceColor) sheds.instanceColor.needsUpdate = true;
  sheds.frustumCulled = false; g.add(sheds);
  return { group: g, colliders, flagUniforms };
}
function flagTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#e8112d'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#ffef00'; g.beginPath(); g.arc(128, 80, 34, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8112d'; g.lineWidth = 5;
  for (let i = -1; i <= 1; i++) {
    g.beginPath(); g.moveTo(100, 80 + i * 12); g.lineTo(156, 80 + i * 12); g.stroke();
    g.beginPath(); g.moveTo(128 + i * 12, 52); g.lineTo(128 + i * 12, 108); g.stroke();
  }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
