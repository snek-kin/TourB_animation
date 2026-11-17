import * as THREE from 'three';

// Светящийся маркер места: булавка + вертикальный луч + круговая «рябь» на земле.
// Геометрии общие для всех маркеров (userData.shared), у каждого маркера свои uniforms.
const shared = {};
function geos() {
  if (shared.beam) return shared;
  shared.beam = new THREE.CylinderGeometry(0.06, 0.16, 1, 16, 1, true);
  shared.beam.translate(0, 0.5, 0);
  shared.disc = new THREE.CircleGeometry(1, 48);
  shared.disc.rotateX(-Math.PI / 2);
  shared.pin = new THREE.SphereGeometry(0.14, 20, 14);
  for (const g of Object.values(shared)) g.userData.shared = true;
  return shared;
}

const BEAM_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const BEAM_F = `uniform vec3 uColor; uniform float uAppear; varying vec2 vUv;
  void main(){
    float a = pow(1.0 - vUv.y, 2.0) * 0.55 * uAppear;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }`;
const DISC_F = `uniform vec3 uColor; uniform float uAppear, uTime; varying vec2 vUv;
  void main(){
    float d = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(0.82, 0.88, d) * (1.0 - smoothstep(0.94, 1.0, d));
    float r = fract(uTime * 0.55);
    float wave = exp(-pow((d - r) * 7.0, 2.0)) * (1.0 - r);
    gl_FragColor = vec4(uColor, (ring * 0.9 + wave * 0.55) * uAppear * step(d, 1.0));
    #include <colorspace_fragment>
  }`;

export class GlowMarker extends THREE.Group {
  constructor({ color = 0x35e08a, height = 2.2, radius = 0.55 } = {}) {
    super();
    const g = geos();
    this.uniforms = { uColor: { value: new THREE.Color(color) }, uAppear: { value: 0 }, uTime: { value: 0 } };
    const mk = (frag) => new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: BEAM_V, fragmentShader: frag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    this._beamMat = mk(BEAM_F); this._discMat = mk(DISC_F);
    this._pinMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    this.beam = new THREE.Mesh(g.beam, this._beamMat); this.beam.scale.y = height;
    this.disc = new THREE.Mesh(g.disc, this._discMat); this.disc.scale.setScalar(radius); this.disc.position.y = 0.02;
    this.pin = new THREE.Mesh(g.pin, this._pinMat); this.pin.position.y = height;
    this.add(this.beam, this.disc, this.pin);
    this._height = height;
    this.setAppear(0);
  }

  /** 0 → 1: появление (ведётся GSAP-ом или вручную). */
  setAppear(v) {
    this.uniforms.uAppear.value = v;
    this.pin.scale.setScalar(Math.max(v, 1e-3));
    this.pin.position.y = this._height * v;
    this.visible = v > 0.001;
  }
  update(dt) { this.uniforms.uTime.value += dt; }
  dispose() { this._beamMat.dispose(); this._discMat.dispose(); this._pinMat.dispose(); }
}
