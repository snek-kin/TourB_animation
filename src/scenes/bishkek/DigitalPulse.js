import * as THREE from 'three';
import { rng } from '../../effects/util.js';
import { AVENUES_EW, CITY, STREETS_NS } from './data.js';
import { boundaries } from './CityKit.js';

const ORIGIN = [0, 4];
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const linearColor = (hex) => new THREE.Color(hex).convertSRGBToLinear();

const EDGE_VERTEX = `
  attribute float aDist;
  attribute float aY;
  varying float vDist;
  varying float vY;
  void main() {
    vDist = aDist;
    vY = aY;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const EDGE_FRAGMENT = `
  uniform float uDigital, uOpacity, uScanRadius, uScanFeather, uRingStrength, uGlow;
  uniform vec3 uColor;
  varying float vDist, vY;
  void main() {
    float f = max(uScanFeather, 1.0);
    float reveal = 1.0 - smoothstep(uScanRadius - f, uScanRadius + f, vDist);
    float flash = exp(-pow((vDist - uScanRadius) / f, 2.0));
    float a = (reveal * (0.30 + 0.35 * vY) + flash * 0.85 * uRingStrength)
            * uDigital * uOpacity * uGlow;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;
const ROAD_VERTEX = `
  attribute float aU, aAlong, aDist, aDir, aMajor;
  varying float vU, vAlong, vDist, vDir, vMajor;
  void main() {
    vU = aU; vAlong = aAlong; vDist = aDist; vDir = aDir; vMajor = aMajor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ROAD_FRAGMENT = `
  uniform float uDigital, uOpacity, uScanRadius, uScanFeather, uRingStrength, uGlow, uTime;
  uniform vec3 uColorA, uColorB;
  varying float vU, vAlong, vDist, vDir, vMajor;
  void main() {
    float f = max(uScanFeather, 1.0);
    float across = abs(vU - 0.5) * 2.0;
    float core = pow(max(1.0 - across, 0.0), 2.2);
    float reveal = 1.0 - smoothstep(uScanRadius - f, uScanRadius + f, vDist);
    float flash = exp(-pow((vDist - uScanRadius) / f, 2.0));
    float p = fract(vAlong * 0.045 * vDir - uTime * 0.5);
    float pulse = smoothstep(0.0, 0.06, p) * (1.0 - smoothstep(0.06, 0.30, p));
    vec3 col = mix(uColorA, uColorB, pulse);
    float a = core * (0.26 + 0.55 * pulse) * (reveal * 0.85 + flash * 0.6 * uRingStrength)
            * uDigital * uOpacity * uGlow * mix(0.5, 1.0, vMajor);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;
const RING_VERTEX = `
  varying vec2 vXZ;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vXZ = worldPosition.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;
const RING_FRAGMENT = `
  uniform vec2 uScanOrigin;
  uniform vec3 uColor;
  uniform float uScanRadius, uScanFeather, uRingStrength, uDigital, uOpacity;
  varying vec2 vXZ;
  void main() {
    float f = max(uScanFeather, 1.0);
    float d = distance(vXZ, uScanOrigin);
    float ring = exp(-pow((d - uScanRadius) / f, 2.0));
    float lead = exp(-pow((d - uScanRadius) / (f * 2.6), 2.0)) * 0.25;
    float a = (ring + lead) * uRingStrength * uDigital * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;
const BEACON_VERTEX = `
  attribute float aPhase;
  varying float vPhase;
  void main() {
    vPhase = aPhase;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(240.0 / -mvPosition.z, 2.0, 9.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const BEACON_FRAGMENT = `
  uniform float uTime, uDigital, uOpacity;
  uniform vec3 uColor;
  varying float vPhase;
  void main() {
    float blink = 0.5 + 0.5 * sin(uTime * 2.4 + vPhase);
    float d = length(gl_PointCoord - 0.5);
    float softDisc = 1.0 - smoothstep(0.05, 0.5, d);
    float a = softDisc * blink * uDigital * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

export class DigitalPulse extends THREE.Group {
  constructor({ instances, meshes, facadeMats = [], groundHeightAt }) {
    super();
    if (!instances || !meshes || typeof groundHeightAt !== 'function')
      throw new TypeError('DigitalPulse requires city instances, meshes, and groundHeightAt');
    this.name = 'digitalPulse';
    this.instances = instances;
    this.meshes = meshes;
    this.facadeMats = facadeMats;
    this.groundHeightAt = groundHeightAt;
    this._lastRadius = -1;
    this._lastDigital = -1;
    this._colorsDirty = false;
    this._color = new THREE.Color();
    this.uniforms = {
      uTime: { value: 0 },
      uDigital: { value: 0 },
      uOpacity: { value: 1 },
      uScanOrigin: { value: new THREE.Vector2(...ORIGIN) },
      uScanRadius: { value: 0 },
      uScanFeather: { value: 26 },
      uRingStrength: { value: 0 },
      uGlow: { value: 1 },
    };

    const shared = this.uniforms;
    const addMesh = (geometry, material) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.add(mesh);
      return mesh;
    };

    const edgeGeometry = this._buildEdges();
    this.edgeVertexCount = edgeGeometry.attributes.position.count;
    this.edges = new THREE.LineSegments(edgeGeometry, new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: linearColor(0x4fd8ff) } },
      vertexShader: EDGE_VERTEX,
      fragmentShader: EDGE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.edges.frustumCulled = false;
    this.add(this.edges);

    const roadGeometry = this._buildRoads();
    this.roadIndexCount = roadGeometry.index.count;
    this.roads = addMesh(roadGeometry, new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uColorA: { value: linearColor(0x2fa8e8) },
        uColorB: { value: linearColor(0xc8f2ff) },
      },
      vertexShader: ROAD_VERTEX,
      fragmentShader: ROAD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }));

    const ringGeometry = new THREE.PlaneGeometry(900, 700, 48, 36);
    ringGeometry.rotateX(-Math.PI / 2);
    const ringPositions = ringGeometry.attributes.position;
    for (let i = 0; i < ringPositions.count; i++) {
      ringPositions.setY(
        i,
        this.groundHeightAt(ringPositions.getX(i), ringPositions.getZ(i)) + 0.1,
      );
    }
    ringGeometry.computeVertexNormals();
    this.ring = addMesh(ringGeometry, new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: linearColor(0x9fe8ff) } },
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }));

    const towers = instances.tower ?? [];
    const beaconPositions = new Float32Array(towers.length * 3);
    const beaconPhases = new Float32Array(towers.length);
    towers.forEach((record, i) => {
      beaconPositions[i * 3] = record.x;
      beaconPositions[i * 3 + 1] = record.y0 + record.h + 0.35;
      beaconPositions[i * 3 + 2] = record.z;
      beaconPhases[i] = i * 1.7;
    });
    const beaconGeometry = new THREE.BufferGeometry();
    beaconGeometry.setAttribute('position', new THREE.BufferAttribute(beaconPositions, 3));
    beaconGeometry.setAttribute('aPhase', new THREE.BufferAttribute(beaconPhases, 1));
    this.beacons = new THREE.Points(beaconGeometry, new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: linearColor(0xff6a3c) } },
      vertexShader: BEACON_VERTEX,
      fragmentShader: BEACON_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.beacons.frustumCulled = false;
    this.add(this.beacons);

    this.fill = new THREE.DirectionalLight(0x35c8ff, 0);
    this.fill.position.set(240, 160, 300);
    this.add(this.fill);
  }

  _buildEdges() {
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const positions = [], distances = [], heights = [];
    const [originX, originZ] = ORIGIN;
    for (const type of ['tower', 'panel', 'brick', 'mid', 'house']) {
      for (const record of this.instances[type] ?? []) {
        let halfWidth = record.w / 2 + 0.04;
        let halfDepth = record.d / 2 + 0.04;
        if (record.rot) [halfWidth, halfDepth] = [halfDepth, halfWidth];
        const bottom = record.y0 + 0.02;
        const top = record.y0 + record.h + 0.04;
        const corners = [
          [record.x - halfWidth, bottom, record.z - halfDepth],
          [record.x + halfWidth, bottom, record.z - halfDepth],
          [record.x + halfWidth, bottom, record.z + halfDepth],
          [record.x - halfWidth, bottom, record.z + halfDepth],
          [record.x - halfWidth, top, record.z - halfDepth],
          [record.x + halfWidth, top, record.z - halfDepth],
          [record.x + halfWidth, top, record.z + halfDepth],
          [record.x - halfWidth, top, record.z + halfDepth],
        ];
        for (const [a, b] of edges) {
          for (const cornerIndex of [a, b]) {
            const corner = corners[cornerIndex];
            positions.push(...corner);
            distances.push(Math.hypot(corner[0] - originX, corner[2] - originZ));
            heights.push(cornerIndex >= 4 ? 1 : 0);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(distances, 1));
    geometry.setAttribute('aY', new THREE.Float32BufferAttribute(heights, 1));
    return geometry;
  }

  _buildRoads() {
    const { xs, zs } = boundaries();
    const namedX = STREETS_NS.map((street) => street.x);
    const namedZ = AVENUES_EW.map((avenue) => avenue.z);
    const lines = [];
    for (const avenue of AVENUES_EW) {
      lines.push({ along: 'x', fixed: avenue.z, from: CITY.xMin, to: CITY.xMax, width: 0.9, major: 1 });
    }
    for (const street of STREETS_NS) {
      lines.push({ along: 'z', fixed: street.x, from: CITY.zMin, to: CITY.zMax, width: 0.9, major: 1 });
    }
    for (const x of xs) {
      if (Math.abs(x) <= 110 && !namedX.includes(x)) lines.push({ along: 'z', fixed: x, from: -78, to: 78, width: 0.5, major: 0 });
    }
    for (const z of zs) {
      if (Math.abs(z) <= 78 && !namedZ.includes(z)) lines.push({ along: 'x', fixed: z, from: -110, to: 110, width: 0.5, major: 0 });
    }

    const random = rng(4242);
    const positions = [], across = [], along = [], distances = [], directions = [], majors = [], indices = [];
    const [originX, originZ] = ORIGIN;
    const segmentsPerLine = 16;
    for (const line of lines) {
      const direction = random() < 0.5 ? 1 : -1;
      const halfWidth = line.width / 2;
      for (let segment = 0; segment < segmentsPerLine; segment++) {
        const t0 = line.from + (line.to - line.from) * (segment / segmentsPerLine);
        const t1 = line.from + (line.to - line.from) * ((segment + 1) / segmentsPerLine);
        const corners = line.along === 'x'
          ? [[t0, line.fixed - halfWidth], [t0, line.fixed + halfWidth], [t1, line.fixed + halfWidth], [t1, line.fixed - halfWidth]]
          : [[line.fixed - halfWidth, t0], [line.fixed + halfWidth, t0], [line.fixed + halfWidth, t1], [line.fixed - halfWidth, t1]];
        const acrossValues = [0, 1, 1, 0];
        const lengths = [t0, t0, t1, t1];
        const base = positions.length / 3;
        for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
          const [x, z] = corners[cornerIndex];
          positions.push(x, this.groundHeightAt(x, z) + 0.12, z);
          across.push(acrossValues[cornerIndex]);
          along.push(lengths[cornerIndex]);
          distances.push(Math.hypot(x - originX, z - originZ));
          directions.push(direction);
          majors.push(line.major);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aU', new THREE.Float32BufferAttribute(across, 1));
    geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(distances, 1));
    geometry.setAttribute('aDir', new THREE.Float32BufferAttribute(directions, 1));
    geometry.setAttribute('aMajor', new THREE.Float32BufferAttribute(majors, 1));
    geometry.setIndex(indices);
    return geometry;
  }

  _wave() {
    const digital = clamp01(this.uniforms.uDigital.value);
    const radius = this.uniforms.uScanRadius.value;
    const feather = Math.max(this.uniforms.uScanFeather.value, 1);
    const [originX, originZ] = ORIGIN;
    for (const [type, records] of Object.entries(this.instances)) {
      const mesh = this.meshes[type];
      if (!mesh?.instanceColor) continue;
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const distance = Math.hypot(record.x - originX, record.z - originZ);
        const reveal = 1 - smooth(radius - feather, radius + feather, distance);
        const flash = Math.exp(-Math.pow((distance - radius) / feather, 2));
        const boost = digital * (reveal * 0.35 + flash * 0.8);
        const tint = record.tint;
        this._color.setRGB(
          tint[0] * (1 + boost * 0.6),
          tint[1] * (1 + boost * 0.75),
          tint[2] * (1 + boost * 1.1),
        );
        mesh.setColorAt(i, this._color);
      }
      mesh.instanceColor.needsUpdate = true;
    }
  }

  _restoreColors() {
    for (const [type, records] of Object.entries(this.instances)) {
      const mesh = this.meshes[type];
      if (!mesh?.instanceColor) continue;
      for (let i = 0; i < records.length; i++) {
        const tint = records[i].tint;
        this._color.setRGB(tint[0], tint[1], tint[2]);
        mesh.setColorAt(i, this._color);
      }
      mesh.instanceColor.needsUpdate = true;
    }
  }

  update(elapsed, dusk = 0) {
    this.uniforms.uTime.value = elapsed;
    const digital = clamp01(this.uniforms.uDigital.value);
    this.fill.intensity = digital * 0.45;
    for (let i = 0; i < this.facadeMats.length; i++) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.7 + i * 1.9);
      this.facadeMats[i].emissiveIntensity = dusk * 1.2 + digital * 0.12 * pulse;
    }

    const radius = this.uniforms.uScanRadius.value;
    if (digital <= 0.001) {
      if (this._colorsDirty) this._restoreColors();
      this._colorsDirty = false;
      this._lastRadius = -1;
      this._lastDigital = -1;
      return;
    }
    if (this._colorsDirty &&
        Math.abs(radius - this._lastRadius) < 0.05 &&
        Math.abs(digital - this._lastDigital) < 0.005) return;
    this._lastRadius = radius;
    this._lastDigital = digital;
    this._colorsDirty = true;
    this._wave();
  }

  setQuality(density) {
    if (!Number.isFinite(density)) throw new TypeError('DigitalPulse density must be finite');
    const scale = clamp01(density);
    this.uniforms.uGlow.value = 0.55 + 0.45 * scale;
    const edgeCount = Math.floor(this.edgeVertexCount * scale / 2) * 2;
    const roadCount = Math.floor(this.roadIndexCount * scale / 6) * 6;
    const beaconCount = Math.floor(this.beacons.geometry.attributes.position.count * scale);
    this.edges.geometry.setDrawRange(0, edgeCount);
    this.roads.geometry.setDrawRange(0, roadCount);
    this.beacons.geometry.setDrawRange(0, beaconCount);
  }
}
