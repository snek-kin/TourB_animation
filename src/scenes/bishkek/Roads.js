// City ground: one canvas-textured plane carries parcels, the street grid, parks,
// the Ala-Too plaza and the ariki (irrigation channels). Crisp lane strips + instanced trees on top.
import * as THREE from 'three';
import { rng } from '../../effects/util.js';
import { CITY, AVENUES_EW, STREETS_NS, RESERVES } from './data.js';
const GW = CITY.xMax - CITY.xMin, GD = CITY.zMax - CITY.zMin;
export function buildCityGround(groundHeightAt) {
  const CW = 2048, CH = 1536;
  const c = document.createElement('canvas'); c.width = CW; c.height = CH;
  const g = c.getContext('2d');
  const X = (x) => ((x - CITY.xMin) / GW) * CW;
  const Y = (z) => ((z - CITY.zMin) / GD) * CH;
  const U = (u) => (u / GW) * CW;
  const V = (u) => (u / GD) * CH;
  const rand = rng(4242);
  g.fillStyle = '#2e3136'; g.fillRect(0, 0, CW, CH);
  const xs = [CITY.xMin, ...STREETS_NS.map((s) => s.x), CITY.xMax];
  const zs = [CITY.zMin, ...AVENUES_EW.map((a) => a.z), CITY.zMax];
  for (let iz = 0; iz < zs.length - 1; iz++) {
    for (let ix = 0; ix < xs.length - 1; ix++) {
      const v = 0.9 + rand() * 0.2;
      g.fillStyle = `rgb(${56 * v | 0},${59 * v | 0},${64 * v | 0})`;
      g.fillRect(X(xs[ix] + 1.6), Y(zs[iz] + 1.6), U(xs[ix + 1] - xs[ix] - 3.2), V(zs[iz + 1] - zs[iz] - 3.2));
      g.strokeStyle = '#4a4d52'; g.lineWidth = 2;
      g.strokeRect(X(xs[ix] + 1.6), Y(zs[iz] + 1.6), U(xs[ix + 1] - xs[ix] - 3.2), V(zs[iz + 1] - zs[iz] - 3.2));
    }
  }
  for (const r of RESERVES) {
    if (r.kind === 'park') {
      g.fillStyle = '#3f6b3a'; g.fillRect(X(r.x), Y(r.z), U(r.w), V(r.d));
      g.fillStyle = 'rgba(20,45,20,0.5)';
      for (let i = 0; i < 60; i++) g.fillRect(X(r.x + rand() * r.w), Y(r.z + rand() * r.d), 3, 3);
    } else if (r.kind === 'plaza') {
      g.fillStyle = '#8a8578'; g.fillRect(X(r.x), Y(r.z), U(r.w), V(r.d));
      g.fillStyle = '#a33d33'; g.beginPath(); g.arc(X(3), Y(7), U(2.6), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6e6a5e'; g.lineWidth = 2;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(X(r.x), Y(r.z + (r.d * i) / 4)); g.lineTo(X(r.x + r.w), Y(r.z + (r.d * i) / 4)); g.stroke(); }
    } else {
      g.fillStyle = r.kind === 'market' ? '#6b6252' : '#55585e';
      g.fillRect(X(r.x), Y(r.z), U(r.w), V(r.d));
    }
  }
  const road = (x, z, w, d, dashed) => {
    g.fillStyle = '#26282c'; g.fillRect(X(x), Y(z), U(w), V(d));
    if (dashed) {
      g.strokeStyle = '#c9b97a'; g.lineWidth = 2; g.setLineDash([16, 12]);
      g.beginPath();
      if (w > d) { g.moveTo(X(x), Y(z + d / 2)); g.lineTo(X(x + w), Y(z + d / 2)); }
      else { g.moveTo(X(x + w / 2), Y(z)); g.lineTo(X(x + w / 2), Y(z + d)); }
      g.stroke(); g.setLineDash([]);
    }
  };
  for (const a of AVENUES_EW) road(CITY.xMin, a.z - a.w / 2, GW, a.w, true);
  for (const s of STREETS_NS) {
    if (s.boulevard) {
      g.fillStyle = '#3f6b3a'; g.fillRect(X(s.x - s.w / 2), Y(CITY.zMin), U(s.w), V(GD));
      g.fillStyle = '#8a8578'; g.fillRect(X(s.x - 0.6), Y(CITY.zMin), U(1.2), V(GD));
    } else road(s.x - s.w / 2, CITY.zMin, s.w, GD, true);
  }
  g.strokeStyle = '#2e7d86'; g.lineWidth = 2; // ariki flanking Chuy and Manas
  for (const off of [-2.1, 2.1]) {
    g.beginPath(); g.moveTo(X(CITY.xMin), Y(off)); g.lineTo(X(CITY.xMax), Y(off)); g.stroke();
    g.beginPath(); g.moveTo(X(off), Y(CITY.zMin)); g.lineTo(X(off), Y(CITY.zMax)); g.stroke();
  }
  g.fillStyle = '#d8d8d0';
  for (let i = 0; i < 6; i++) {
    g.fillRect(X(-7 + i * 2.4), Y(-1.2), U(1.1), V(2.4));
    g.fillRect(X(-1.2), Y(2 + i * 1.8), U(2.4), V(0.9));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(GW, GD, 48, 36);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }));
  mesh.name = 'cityGround';
  return mesh;
}
function laneTexture(horizontal, median = false) {
  const c = document.createElement('canvas');
  c.width = horizontal ? 256 : 64; c.height = horizontal ? 64 : 256;
  const g = c.getContext('2d');
  g.fillStyle = median ? '#3f6b3a' : '#26282c'; g.fillRect(0, 0, c.width, c.height);
  if (median) {
    g.fillStyle = '#8a8578';
    if (horizontal) g.fillRect(0, 26, 256, 12); else g.fillRect(26, 0, 12, 256);
  } else {
    g.strokeStyle = '#c9b97a'; g.lineWidth = 3; g.setLineDash([42, 30]);
    g.beginPath();
    if (horizontal) { g.moveTo(0, 32); g.lineTo(256, 32); } else { g.moveTo(32, 0); g.lineTo(32, 256); }
    g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#3a3d42'; g.lineWidth = 2;
    if (horizontal) g.strokeRect(0, 2, 256, 60); else g.strokeRect(2, 0, 60, 256);
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8;
  return tx;
}
export function buildAvenueStrips(groundHeightAt) {
  const group = new THREE.Group(); group.name = 'avenues';
  const strip = (cx, cz, len, w, alongX, tex, lift) => {
    const geo = new THREE.PlaneGeometry(alongX ? len : w, alongX ? w : len, alongX ? 64 : 1, alongX ? 1 : 64);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeightAt(pos.getX(i) + cx, pos.getZ(i) + cz) + lift);
    geo.computeVertexNormals();
    tex.repeat.set(alongX ? len / 10 : 1, alongX ? 1 : len / 10);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    mesh.position.set(cx, 0, cz);
    group.add(mesh);
  };
  strip(0, 0, GW, 3.4, true, laneTexture(true), 0.025);
  strip(0, 0, GD, 3.4, false, laneTexture(false), 0.045);
  strip(-20, 50, 220, 4.2, false, laneTexture(false, true), 0.035);
  return group;
}
export function buildTrees(groundHeightAt) {
  const group = new THREE.Group(); group.name = 'trees';
  const rand = rng(3131);
  const poplars = [], broadleaf = [];
  for (let z = -58; z <= 158; z += 2.6) { poplars.push([-21.5, z], [-18.5, z]); }
  for (let x = -130; x <= 130; x += 7) { if (Math.abs(x) > 12) poplars.push([x, -2.9], [x, 2.9]); }
  for (let z = -70; z <= 70; z += 7) { if (Math.abs(z) > 14) poplars.push([-2.9, z], [2.9, z]); }
  for (const r of RESERVES.filter((r) => r.kind === 'park')) {
    for (let i = 0; i < 22; i++) broadleaf.push([r.x + 1 + rand() * (r.w - 2), r.z + 1 + rand() * (r.d - 2)]);
  }
  const all = [...poplars, ...broadleaf];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const tint = new THREE.Color();
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.8, 5); trunkGeo.translate(0, 0.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }), all.length);
  const popGeo = new THREE.ConeGeometry(0.42, 2.2, 6); popGeo.translate(0, 1.9, 0);
  const popMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const pops = new THREE.InstancedMesh(popGeo, popMat, poplars.length);
  const leafGeo = new THREE.SphereGeometry(0.7, 7, 5); leafGeo.scale(1, 0.75, 1); leafGeo.translate(0, 1.3, 0);
  const leafs = new THREE.InstancedMesh(leafGeo, popMat.clone(), broadleaf.length);
  all.forEach(([x, z], i) => {
    const y = groundHeightAt(x, z), sc = 0.8 + rand() * 0.5;
    p.set(x, y, z); s.set(sc, sc, sc); m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    if (i < poplars.length) {
      pops.setMatrixAt(i, m);
      tint.setHSL(0.27 + rand() * 0.06, 0.35 + rand() * 0.15, 0.2 + rand() * 0.12);
      pops.setColorAt(i, tint);
    } else {
      const j = i - poplars.length;
      leafs.setMatrixAt(j, m);
      tint.setHSL(0.25 + rand() * 0.07, 0.4 + rand() * 0.15, 0.18 + rand() * 0.12);
      leafs.setColorAt(j, tint);
    }
  });
  for (const mesh of [trunks, pops, leafs]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}
