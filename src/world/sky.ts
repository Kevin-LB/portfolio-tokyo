import * as THREE from "three";
import { shared } from "./atmosphere";

/**
 * Le ciel : un dôme centré sur la caméra, peint dans le shader.
 * Jour → heure dorée → nuit pilotés par les uniformes ; étoiles fixées au
 * monde (elles ne glissent pas quand la caméra tourne), lune, cirrus.
 */

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = normalize(world.xyz - cameraPosition);
  vec4 clip = projectionMatrix * viewMatrix * world;
  gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunColor; uniform vec3 uSunDir;
uniform vec3 uMoonDir; uniform float uNight; uniform float uTime; uniform float uSunDisk;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.07; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float up = pow(smoothstep(-0.02, 0.75, e), 0.55);
  vec3 col = mix(uHorizon, uZenith, up);

  // Côté soleil : l'horizon se réchauffe (fort à l'heure dorée).
  vec2 dh = normalize(d.xz + 1e-5);
  vec2 sh = normalize(uSunDir.xz + 1e-5);
  float toward = pow(max(dot(dh, sh), 0.0), 3.0);
  float golden = smoothstep(0.1, 0.45, uNight) * (1.0 - smoothstep(0.6, 0.95, uNight));
  float horizonBand = 1.0 - smoothstep(0.0, 0.28, e);
  col = mix(col, uSunColor * 1.05, toward * horizonBand * (0.18 + 0.55 * golden));

  // Soleil : halo large, halo serré, disque.
  float mu = max(dot(d, uSunDir), 0.0);
  float sunVis = smoothstep(-0.06, 0.02, uSunDir.y);
  col += uSunColor * (pow(mu, 6.0) * 0.16 + pow(mu, 90.0) * 0.5) * sunVis;
  col += uSunColor * smoothstep(0.99955, 0.99975, mu) * 14.0 * sunVis * uSunDisk;

  // Cirrus d'altitude, très discrets.
  vec2 cp = d.xz / max(e, 0.06) * 0.9 + vec2(uTime * 0.004, 0.0);
  float ci = smoothstep(0.55, 0.85, fbm(cp * vec2(0.6, 2.4)));
  vec3 ciCol = mix(vec3(1.0), uSunColor, 0.35 + 0.4 * golden);
  col = mix(col, ciCol * mix(1.0, 0.12, uNight), ci * 0.28 * smoothstep(0.04, 0.3, e) * (1.0 - uNight * 0.7));

  // Nuit : étoiles fixées au monde, lune.
  if (uNight > 0.5) {
    float nf = smoothstep(0.5, 0.95, uNight);
    vec2 st = vec2(atan(d.x, d.z), asin(clamp(e, -1.0, 1.0))) * 260.0;
    vec2 cell = floor(st); vec2 local = fract(st) - 0.5;
    float seed = hash(cell);
    float star = step(0.985, seed) * (1.0 - smoothstep(0.03, 0.2, length(local)));
    float tw = 0.65 + 0.35 * sin(uTime * (1.0 + seed * 3.0) + seed * 40.0);
    col += vec3(0.75, 0.82, 1.0) * star * tw * smoothstep(0.03, 0.25, e) * nf * 1.4;
    float md = dot(d, uMoonDir);
    col += vec3(0.75, 0.82, 1.0) * (pow(max(md, 0.0), 60.0) * 0.06 + smoothstep(0.99935, 0.9996, md) * 1.6) * nf;
  }

  // Sous l'horizon : brume (raccord avec le brouillard du sol).
  col = mix(col, uHorizon, 1.0 - smoothstep(-0.12, 0.0, e));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uZenith: { value: new THREE.Color("#5fa8de") },
        uHorizon: { value: new THREE.Color("#e7eef1") },
        uSunColor: { value: new THREE.Color("#fff1dc") },
        uSunDir: shared.uSunDir,
        uMoonDir: { value: new THREE.Vector3(0.45, 0.55, -0.7).normalize() },
        uNight: shared.uNight,
        uTime: shared.uTime,
        uSunDisk: { value: 1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.scale.setScalar(50000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }
}
