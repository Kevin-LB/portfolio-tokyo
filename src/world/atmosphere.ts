import * as THREE from "three";
import { clamp, lerp, smoothstep } from "../core/math";

/**
 * L'état de l'atmosphère : une seule variable `night ∈ [0,1]` pilote le
 * soleil, le ciel, le brouillard, les fenêtres, les enseignes, la tour, le
 * bloom et le son. Les uniformes ci-dessous sont partagés par tous les
 * matériaux patchés (un seul endroit à mettre à jour par image).
 */

export const shared = {
  uNight: { value: 0 },
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color("#d9e4ec") },
  uFogDensity: { value: 0.0004 },
  uFogHeight: { value: 260 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
  uCamPos: { value: new THREE.Vector3() },
  /** 0 → 1 : allumage des fenêtres (décalé par rapport à la nuit). */
  uLights: { value: 0 },
  /** Lumière de la tour (Landmark Light). */
  uTowerGlow: { value: 0 },
};

/** Palette keyée par `night` : jour (0), heure dorée (~0.45), nuit (1). */
const KEYS = {
  zenith: ["#5fa8de", "#4a6fa8", "#08132a"],
  horizon: ["#e7eef1", "#f2b98f", "#1b2a47"],
  sun: ["#ffe7c4", "#ffab62", "#9fb4dc"],
  fog: ["#dbe5ec", "#e9b996", "#16223a"],
  hemiSky: ["#a9c9ee", "#d9a58a", "#24365e"],
  hemiGround: ["#9c8a74", "#7a5a4a", "#0d1424"],
} as const;

const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

export function palette(key: keyof typeof KEYS, night: number, out = new THREE.Color()) {
  const k = KEYS[key];
  if (night < 0.45) {
    _c0.set(k[0]);
    _c1.set(k[1]);
    return out.copy(_c0).lerp(_c1, night / 0.45);
  }
  _c0.set(k[1]);
  _c1.set(k[2]);
  return out.copy(_c0).lerp(_c1, (night - 0.45) / 0.55);
}

/** Direction du soleil : après-midi le jour, descend sous l'horizon la nuit (la lune prend le relais). */
export function sunDirection(night: number, out = new THREE.Vector3()) {
  // Azimut sud-ouest, hauteur qui descend.
  const elev = lerp(38, -8, smoothstep(0, 0.75, night)) * (Math.PI / 180);
  const az = lerp(-35, -70, night) * (Math.PI / 180);
  return out.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).normalize();
}

export function moonDirection(out = new THREE.Vector3()) {
  return out.set(0.45, 0.55, -0.7).normalize();
}

/** Intensités dérivées. */
export function lightLevels(night: number) {
  return {
    sun: lerp(3.9, 0, smoothstep(0.35, 0.8, night)),
    moon: lerp(0, 0.6, smoothstep(0.6, 1, night)),
    hemi: lerp(0.45, 0.4, night),
    env: lerp(0.42, 0.28, night),
    exposure: lerp(1.0, 1.15, night),
    lights: clamp((night - 0.35) / 0.5),
    towerGlow: smoothstep(0.55, 0.95, night),
    bloom: lerp(0.0, 0.5, smoothstep(0.35, 1, night)),
  };
}

/**
 * Brouillard maison : exponentiel en distance, atténué en altitude (la brume
 * reste en bas, la vue s'ouvre en montant). Remplace les chunks de three.js
 * pour tous les matériaux standards et nos shaders.
 */
export const FOG_PARS_VERTEX = /* glsl */ `
varying vec3 vFogWorld;
`;
export const FOG_VERTEX = /* glsl */ `
vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#ifdef USE_INSTANCING
vFogWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;
export const FOG_PARS_FRAGMENT = /* glsl */ `
varying vec3 vFogWorld;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogHeight;
uniform vec3 uCamPos;
float fogAmount(vec3 world) {
  vec3 d = world - uCamPos;
  float dist = length(d);
  // Densité intégrée le long du rayon pour une brume qui décroît avec l'altitude.
  float h0 = max(uCamPos.y, 0.0);
  float h1 = max(world.y, 0.0);
  float k = 1.0 / uFogHeight;
  float dh = h1 - h0;
  float integral = abs(dh) > 0.5 ? (exp(-h0 * k) - exp(-h1 * k)) / (dh * k) : exp(-h0 * k);
  float f = 1.0 - exp(-uFogDensity * dist * integral);
  return clamp(f, 0.0, 1.0);
}
`;
export const FOG_FRAGMENT = /* glsl */ `
gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, fogAmount(vFogWorld));
`;

/** Injecte le brouillard maison dans un matériau three.js (à appeler dans onBeforeCompile). */
export function patchFog(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.uniforms.uFogColor = shared.uFogColor;
  shader.uniforms.uFogDensity = shared.uFogDensity;
  shader.uniforms.uFogHeight = shared.uFogHeight;
  shader.uniforms.uCamPos = shared.uCamPos;
  shader.vertexShader = shader.vertexShader
    .replace("#include <fog_pars_vertex>", FOG_PARS_VERTEX)
    .replace("#include <fog_vertex>", FOG_VERTEX);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <fog_pars_fragment>", FOG_PARS_FRAGMENT)
    .replace("#include <fog_fragment>", FOG_FRAGMENT);
}
