import * as THREE from "three";
import { rng, smoothstep } from "../core/math";
import { FOG_FRAGMENT, FOG_PARS_FRAGMENT, shared } from "./atmosphere";

/**
 * Nuages sculptés : des grappes de volumes arrondis, éclairés dans le shader
 * (lumière enveloppante, ombre bleutée dessous, liseré au contre-jour). Une
 * couche entre ~185 et 240 m que la caméra traverse : quand elle entre dans
 * un nuage, le volume s'efface en tramage et un voile plein écran prend le
 * relais (aucun raymarching).
 */

const VERT = /* glsl */ `
attribute float aShade;
varying vec3 vN; varying vec3 vFogWorld; varying float vShade; varying vec3 vLocal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vFogWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vShade = aShade;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyColor; uniform vec3 uShadowColor;
uniform float uNight; uniform float uNearFade;
varying vec3 vN; varying float vShade; varying vec3 vLocal;
${FOG_PARS_FRAGMENT}
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  return fract(i * 0.7071067 + 0.37) ;
}
void main() {
  vec3 n = normalize(vN);
  float wrap = clamp(dot(n, uSunDir) * 0.55 + 0.45, 0.0, 1.0);
  float up = n.y * 0.5 + 0.5;
  vec3 col = mix(uShadowColor, uSkyColor, up * 0.8 + 0.2);
  col = mix(col, uSunColor * 1.15, wrap * wrap * (1.0 - uNight * 0.85));
  // Liseré lumineux au contre-jour.
  vec3 v = normalize(uCamPos - vFogWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float back = max(dot(-v, uSunDir), 0.0);
  col += uSunColor * rim * (0.25 + 0.6 * back) * (1.0 - uNight * 0.7);
  col *= mix(0.86, 1.04, vShade);
  // Effacement en tramage quand la caméra est tout près (on « entre »).
  float d = length(uCamPos - vFogWorld);
  float a = smoothstep(uNearFade * 0.35, uNearFade, d);
  if (bayer4(gl_FragCoord.xy) > a) discard;
  gl_FragColor = vec4(col, 1.0);
  ${FOG_FRAGMENT}
}
`;

export type Puff = { c: THREE.Vector3; r: number };

export class Clouds {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly puffs: Puff[] = [];

  constructor(detail: number) {
    this.group.name = "Nuages";
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSunDir: shared.uSunDir,
        uSunColor: { value: new THREE.Color("#fff3e2") },
        uSkyColor: { value: new THREE.Color("#e9f1f8") },
        uShadowColor: { value: new THREE.Color("#a9b8cc") },
        uNight: shared.uNight,
        uNearFade: { value: 28 },
        uFogColor: shared.uFogColor,
        uFogDensity: shared.uFogDensity,
        uFogHeight: shared.uFogHeight,
        uCamPos: shared.uCamPos,
      },
    });
    const r = rng(2024);
    const clouds: { center: THREE.Vector3; size: number; flat: number }[] = [];
    // Le banc que traverse la caméra (autour de la spirale, côté est/sud-est).
    for (let i = 0; i < 7; i++) {
      const a = ((120 + i * 18) * Math.PI) / 180;
      const rad = r.range(30, 70);
      clouds.push({ center: new THREE.Vector3(Math.sin(a) * rad, r.range(206, 222), Math.cos(a) * rad), size: r.range(20, 28), flat: 0.55 });
    }
    // Couronne autour de la tour, trouée (la ville se voit entre les nuages).
    const count = Math.round(46 * (0.5 + detail * 0.5));
    for (let i = 0; i < count; i++) {
      const a = r.range(0, Math.PI * 2);
      const rad = r.range(120, 1300);
      clouds.push({ center: new THREE.Vector3(Math.sin(a) * rad, r.range(190, 240), Math.cos(a) * rad), size: r.range(18, 46) * (rad > 600 ? 1.4 : 1), flat: r.range(0.45, 0.62) });
    }
    // Quelques cumulus hauts, loin (profondeur du ciel au sommet).
    for (let i = 0; i < 8; i++) {
      const a = r.range(0, Math.PI * 2);
      const rad = r.range(1600, 3200);
      clouds.push({ center: new THREE.Vector3(Math.sin(a) * rad, r.range(380, 520), Math.cos(a) * rad), size: r.range(60, 110), flat: 0.6 });
    }

    const pos: number[] = [];
    const nor: number[] = [];
    const shade: number[] = [];
    const base = new THREE.IcosahedronGeometry(1, 2);
    const bp = base.getAttribute("position");
    const v = new THREE.Vector3();
    for (const cl of clouds) {
      const lobes = 5 + Math.floor(r.next() * 5);
      for (let k = 0; k < lobes; k++) {
        const ang = r.range(0, Math.PI * 2);
        const off = cl.size * r.range(0.1, 0.85);
        const c = cl.center.clone().add(new THREE.Vector3(Math.cos(ang) * off, r.range(-0.1, 0.35) * cl.size, Math.sin(ang) * off * 0.8));
        const rad = cl.size * r.range(0.45, 0.8) * (k === 0 ? 1.15 : 1);
        this.puffs.push({ c, r: rad });
        const seed = r.range(0, 10);
        for (let i = 0; i < bp.count; i++) {
          v.fromBufferAttribute(bp, i);
          // Bosses douces, dessous aplati (base des cumulus).
          const bump = 1 + 0.12 * Math.sin(v.x * 4.0 + seed) * Math.sin(v.z * 3.0 + seed * 1.3) + 0.06 * Math.sin(v.y * 7.0 + seed);
          const p = v.clone().multiplyScalar(bump);
          if (p.y < -0.15) p.y = -0.15 + (p.y + 0.15) * 0.25;
          p.y *= cl.flat + 0.25;
          pos.push(c.x + p.x * rad, c.y + p.y * rad, c.z + p.z * rad);
          const n = v.clone();
          if (v.y < -0.15) n.set(v.x * 0.3, -1, v.z * 0.3).normalize();
          nor.push(n.x, n.y, n.z);
          shade.push(smoothstep(-0.6, 0.9, v.y));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("aShade", new THREE.Float32BufferAttribute(shade, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  /** Densité « dans le nuage » au point donné (0 dehors, 1 au cœur). */
  insideness(p: THREE.Vector3) {
    let best = 0;
    for (const pf of this.puffs) {
      const d = pf.c.distanceTo(p) / (pf.r * 1.05);
      if (d < 1.4) best = Math.max(best, 1 - smoothstep(0.55, 1.35, d));
    }
    return best;
  }

  setColors(sun: THREE.Color, sky: THREE.Color, shadow: THREE.Color) {
    this.material.uniforms.uSunColor.value.copy(sun);
    this.material.uniforms.uSkyColor.value.copy(sky);
    this.material.uniforms.uShadowColor.value.copy(shadow);
  }
}
