// Sky dome (golden hour - dusk), stars, and the light rig. No post-processing:
// glow is additive geometry, consistent with the project's Phase 1 rendering policy.
import * as THREE from 'three';
import { rng } from '../../effects/util.js';
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export function buildAtmosphere() {
  const skyU = {
    uOpacity: { value: 1 }, uDusk: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.3, -0.4).normalize() },
    uZenithDay: { value: lin(0x3a6ea8) }, uHorizonDay: { value: lin(0xe8c39a) },
    uZenithDusk: { value: lin(0x0b1224) }, uHorizonDusk: { value: lin(0xb0563a) },
    uSunCol: { value: lin(0xffd9a0) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uOpacity, uDusk; uniform vec3 uSunDir, uZenithDay, uHorizonDay, uZenithDusk, uHorizonDusk, uSunCol;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = pow(max(d.y, 0.0), 0.55);
        vec3 day = mix(uHorizonDay, uZenithDay, h);
        vec3 dusk = mix(uHorizonDusk, uZenithDusk, pow(max(d.y, 0.0), 0.45));
        vec3 col = mix(day, dusk, uDusk);
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(s, 600.0) * 1.4 + pow(s, 12.0) * 0.2) * (1.0 - uDusk * 0.75);
        col = mix(col, mix(uHorizonDay, uHorizonDusk, uDusk) * 0.55, 1.0 - smoothstep(-0.12, 0.0, d.y));
        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'sky'; sky.frustumCulled = false;
  const rand = rng(88);
  const N = 700, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const th = rand() * Math.PI * 2, y = 0.12 + rand() * 0.85, r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(th) * r * 2850; pos[i * 3 + 1] = y * 2850; pos[i * 3 + 2] = Math.sin(th) * r * 2850;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starU = { uOpacity: { value: 0 } };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 2.0; }`,
    fragmentShader: `uniform float uOpacity;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * uOpacity;
        if (a < 0.01) discard; gl_FragColor = vec4(0.85, 0.9, 1.0, a);
        #include <colorspace_fragment> }`,
  }));
  stars.name = 'stars'; stars.frustumCulled = false;
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(-600, 260, -350);
  const hemi = new THREE.HemisphereLight(0xbfd4e8, 0x3a3f35, 0.9);
  return { sky, stars, sun, hemi, skyU, starU, starCount: N };
}
