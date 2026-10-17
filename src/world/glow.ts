import * as THREE from "three";
import { shared } from "./atmosphere";

/**
 * Points lumineux (réverbères, feux d'obstacle, lampadaires sodium, phares) :
 * des billboards instanciés en additif, sans aucune lumière dynamique.
 * C'est la triche qui remplace « 500 lumières ».
 */

const VERT = /* glsl */ `
attribute vec3 aPos; attribute vec3 aColor; attribute float aSize; attribute float aPhase;
uniform float uTime; uniform float uBlink; uniform float uMinPx;
varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
void main() {
  vUv = position.xy;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float size = aSize;
  // Taille minimale à l'écran : les feux lointains restent visibles.
  float dist = -mv.z;
  float pxWorld = dist * 2.0 / (projectionMatrix[1][1] * 900.0);
  size = max(size, uMinPx * pxWorld);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  float blink = mix(1.0, step(0.0, sin(uTime * 2.4 + aPhase)) * 0.85 + 0.15, uBlink);
  vColor = aColor;
  vAlpha = blink;
}
`;

const FRAG = /* glsl */ `
uniform float uIntensity;
varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 18.0);
  float halo = exp(-r * r * 4.0) * 0.35;
  float a = (core + halo) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(vColor * a * uIntensity * vAlpha, 1.0);
}
`;

export class GlowPoints {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(
    points: { p: THREE.Vector3; color: THREE.ColorRepresentation; size: number; phase?: number }[],
    opts: { blink?: boolean; minPx?: number; name?: string } = {},
  ) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const pos = new Float32Array(points.length * 3);
    const col = new Float32Array(points.length * 3);
    const size = new Float32Array(points.length);
    const phase = new Float32Array(points.length);
    const c = new THREE.Color();
    points.forEach((pt, i) => {
      pos.set([pt.p.x, pt.p.y, pt.p.z], i * 3);
      c.set(pt.color);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = pt.size;
      phase[i] = pt.phase ?? 0;
    });
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    g.instanceCount = points.length;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: shared.uTime,
        uIntensity: { value: 0 },
        uBlink: { value: opts.blink ? 1 : 0 },
        uMinPx: { value: opts.minPx ?? 1.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = opts.name ?? "Points lumineux";
  }

  set intensity(v: number) {
    this.material.uniforms.uIntensity.value = v;
    this.mesh.visible = v > 0.001;
  }
}

/** Flaques de lumière au sol sous les réverbères (additif, la nuit). */
export function lightPools(points: THREE.Vector3[], radius = 5.5, color = "#ffcf8a") {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  const pos = new Float32Array(points.length * 3);
  points.forEach((p, i) => pos.set([p.x, 0.06, p.z], i * 3));
  g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 3));
  g.instanceCount = points.length;
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec3 aPos; uniform float uR; varying vec2 vUv;
      void main() { vUv = position.xz; gl_Position = projectionMatrix * viewMatrix * vec4(aPos + position * vec3(uR, 1.0, uR), 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
      void main() { float r = length(vUv); float a = pow(max(0.0, 1.0 - r), 2.2); gl_FragColor = vec4(uColor * a * uIntensity, 1.0); }`,
    uniforms: { uR: { value: radius }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = "Flaques de lumière";
  return mesh;
}
