import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { rng } from "../../core/math";
import { expresswayX } from "./distant";
import { VENDING_CLEAR } from "./layout";
import { patched } from "../materials";
import { shared } from "../atmosphere";
import { GlowPoints } from "../glow";

/**
 * La micro-vie : voitures (on roule à gauche), passants, trains sur le
 * viaduc, pétales. Tout est instancié ; les positions sont recalculées sur
 * le CPU (quelques centaines d'objets), les membres des passants bougent
 * dans le shader. Rien ne vit quand on ne le voit pas.
 */

/* ── Chemins ─────────────────────────────────────────────────────────────── */

class Path {
  pts: THREE.Vector3[] = [];
  cum: number[] = [];
  length = 0;
  constructor(
    points: THREE.Vector3[],
    readonly closed: boolean,
    radius = 0,
  ) {
    const src = closed ? [...points, points[0]] : points;
    if (radius > 0) {
      // Coins arrondis (arcs échantillonnés).
      const out: THREE.Vector3[] = [src[0].clone()];
      for (let i = 1; i < src.length - 1; i++) {
        const a = src[i - 1];
        const b = src[i];
        const c = src[i + 1];
        const d1 = b.clone().sub(a).normalize();
        const d2 = c.clone().sub(b).normalize();
        const p1 = b.clone().addScaledVector(d1, -radius);
        const p2 = b.clone().addScaledVector(d2, radius);
        for (let k = 0; k <= 6; k++) {
          const t = k / 6;
          const q = p1.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(b, 2 * t * (1 - t)).addScaledVector(p2, t * t);
          out.push(q);
        }
      }
      out.push(src[src.length - 1].clone());
      this.pts = out;
    } else this.pts = src.map((p) => p.clone());
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }

  sample(s: number, pos: THREE.Vector3, dir: THREE.Vector3) {
    let d = s % this.length;
    if (d < 0) d += this.length;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (d - this.cum[lo]) / seg;
    pos.lerpVectors(this.pts[lo], this.pts[hi], t);
    dir.subVectors(this.pts[hi], this.pts[lo]).normalize();
  }
}

/* ── Voitures ────────────────────────────────────────────────────────────── */

function wheel(b: MeshBuilder, x: number, z: number, r = 0.3) {
  b.color("#1d1e20");
  const g = new THREE.CylinderGeometry(r, r, 0.22, 10);
  g.rotateZ(Math.PI / 2);
  b.geometry(g, new THREE.Matrix4().makeTranslation(x, r, z));
  b.color("#9a9da2");
  const hub = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.24, 8);
  hub.rotateZ(Math.PI / 2);
  b.geometry(hub, new THREE.Matrix4().makeTranslation(x, r, z));
}

/** Avant = +z. Carrosserie peinte en blanc (teintée par instance). */
function carGeometry(kind: "taxi" | "kei" | "sedan" | "truck") {
  const b = new MeshBuilder();
  const glass = "#2a333c";
  if (kind === "taxi") {
    // Silhouette haute et arrondie des taxis de Tokyo.
    b.color("#ffffff").box(0, 0.62, 0, 1.7, 0.62, 4.4);
    b.color("#ffffff").box(0, 1.26, -0.25, 1.62, 0.66, 3.0);
    b.color(glass).box(0, 1.28, -0.25, 1.64, 0.5, 2.8, 0, { top: false });
    b.color("#ffffff").box(0, 1.6, -0.25, 1.6, 0.06, 2.9);
    b.glow(1).color("#f2e6c4").box(0, 1.75, -0.1, 0.5, 0.22, 0.24).glow(0);
    b.color("#c9a227").box(0, 0.62, 0, 1.72, 0.08, 4.42);
  } else if (kind === "kei") {
    b.color("#ffffff").box(0, 0.98, -0.05, 1.47, 1.42, 3.3);
    b.color("#ffffff").box(0, 0.55, 1.5, 1.45, 0.5, 0.42);
    b.color(glass).box(0, 1.35, -0.1, 1.49, 0.62, 3.0, 0, { top: false });
    b.color(glass).box(0, 1.25, 1.36, 1.4, 0.55, 0.12);
  } else if (kind === "sedan") {
    b.color("#ffffff").box(0, 0.58, 0, 1.72, 0.56, 4.3);
    b.color("#ffffff").box(0, 1.08, -0.3, 1.58, 0.48, 2.2);
    b.color(glass).box(0, 1.08, -0.3, 1.6, 0.36, 2.0, 0, { top: false });
  } else {
    // Kei truck : cabine + plateau.
    b.color("#ffffff").box(0, 0.95, 1.05, 1.47, 1.3, 1.3);
    b.color(glass).box(0, 1.28, 1.25, 1.49, 0.5, 1.0, 0, { top: false });
    b.color("#d8d6d0").box(0, 0.62, -0.75, 1.45, 0.16, 2.0);
    b.color("#d8d6d0").box(0, 0.86, -1.72, 1.45, 0.34, 0.06);
    b.color("#d8d6d0").box(0.7, 0.86, -0.75, 0.06, 0.34, 2.0);
    b.color("#d8d6d0").box(-0.7, 0.86, -0.75, 0.06, 0.34, 2.0);
  }
  const len = kind === "kei" ? 3.4 : kind === "truck" ? 3.4 : 4.3;
  for (const z of [len * 0.32, -len * 0.32]) for (const x of [-0.72, 0.72]) wheel(b, x, z, kind === "kei" || kind === "truck" ? 0.27 : 0.31);
  // Phares, feux arrière.
  b.glow(1).color("#fff6dc");
  b.box(0.55, 0.72, len / 2 + 0.01, 0.3, 0.14, 0.04);
  b.box(-0.55, 0.72, len / 2 + 0.01, 0.3, 0.14, 0.04);
  b.color("#d23a2a");
  b.box(0.6, 0.82, -len / 2 - 0.01, 0.22, 0.2, 0.04);
  b.box(-0.6, 0.82, -len / 2 - 0.01, 0.22, 0.2, 0.04);
  b.glow(0);
  // Ombre de contact (un rectangle sombre sous la voiture).
  b.color("#1a1a1a").box(0, 0.025, 0, 1.6, 0.03, len * 0.95, 0, { top: true });
  return { geo: b.build(), len };
}

type Car = { path: Path; s: number; speed: number; kind: number; index: number; len: number };

/* ── Passants ────────────────────────────────────────────────────────────── */

/**
 * Silhouette dessinée (pas une capsule) : jambes, buste trapézoïdal, épaules,
 * bras, tête et cheveux, accessoires. Les membres portent un attribut
 * `limb` pour la marche dans le shader. Couleurs-repères : magenta = haut,
 * cyan = bas (remplacées par instance).
 */
function personGeometry(variant: number) {
  const b = new MeshBuilder();
  const limbs: number[] = [];
  const mark = (fn: () => void, limb: number) => {
    const before = b.vertexCount;
    fn();
    for (let i = before; i < b.vertexCount; i++) limbs[i] = limb;
  };
  const skin = variant % 3 === 0 ? "#e8c4a6" : variant % 3 === 1 ? "#d9b08c" : "#f0d2b8";
  const hair = ["#1d1a19", "#2b211c", "#3b2c22", "#121212"][variant % 4];
  const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion(), v3(sx, sy, sz));
  // Jambes : fuseaux effilés + chaussures.
  for (const [x, l] of [
    [-0.085, 1],
    [0.085, -1],
  ] as [number, number][]) {
    mark(() => {
      b.colorRGB(0, 1, 1).geometry(new THREE.CylinderGeometry(0.075, 0.055, 0.8, 8), M(x, 0.46, 0));
      b.color("#2a2622").geometry(new THREE.SphereGeometry(0.075, 8, 6), M(x, 0.06, 0.04, 1, 0.6, 1.6));
    }, l);
  }
  // Bassin et buste : volumes elliptiques, épaules arrondies.
  mark(() => {
    b.colorRGB(0, 1, 1).geometry(new THREE.CylinderGeometry(0.16, 0.15, 0.16, 10), M(0, 0.86, 0, 1, 1, 0.72));
    b.colorRGB(1, 0, 1).geometry(new THREE.CylinderGeometry(0.205, 0.165, 0.52, 12), M(0, 1.16, 0, 1, 1, 0.62));
    b.colorRGB(1, 0, 1).geometry(new THREE.SphereGeometry(0.205, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0, 1.42, 0, 1, 0.45, 0.62));
  }, 0);
  // Bras : fuseaux, mains.
  for (const [x, l] of [
    [-0.245, 2],
    [0.245, -2],
  ] as [number, number][]) {
    mark(() => {
      b.colorRGB(1, 0, 1).geometry(new THREE.CylinderGeometry(0.055, 0.045, 0.56, 8), M(x, 1.15, 0));
      b.color(skin).geometry(new THREE.SphereGeometry(0.05, 8, 6), M(x, 0.84, 0));
    }, l);
  }
  // Cou, tête, cheveux (coupe différente selon la variante).
  mark(() => {
    b.color(skin).geometry(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), M(0, 1.5, 0));
    b.color(skin).geometry(new THREE.SphereGeometry(0.115, 14, 10), M(0, 1.63, 0, 0.92, 1.06, 0.98));
    const hairGeo = new THREE.SphereGeometry(0.123, 14, 8, 0, Math.PI * 2, 0, Math.PI * (variant === 2 ? 0.62 : 0.52));
    b.color(hair).geometry(hairGeo, M(0, 1.645, -0.012, 0.95, 1.05, 1.02));
    if (variant === 1) b.color(hair).geometry(new THREE.SphereGeometry(0.09, 8, 6), M(0, 1.6, -0.1, 1, 1.4, 0.6)); // chignon / queue
  }, 0);
  // Accessoires selon la variante.
  mark(() => {
    if (variant === 1) b.color("#3a3a3a").geometry(new RoundedBox(0.08, 0.28, 0.32), M(0.29, 0.92, 0.02)); // sacoche
    if (variant === 2) b.color("#b33b2e").geometry(new RoundedBox(0.3, 0.36, 0.13), M(0, 1.16, -0.17)); // sac à dos
    if (variant === 3) {
      // Parapluie transparent (le parapluie de Tokyo).
      b.color("#9a9a9a").beam(v3(0.24, 1.2, 0.05), v3(0.24, 2.05, 0.05), 0.02, 0.02);
      b.color("#dfe7ec").geometry(new THREE.ConeGeometry(0.55, 0.26, 12, 1, true), M(0.24, 2.0, 0.05));
    }
  }, 0);
  const geo = b.build();
  geo.setAttribute("limb", new THREE.Float32BufferAttribute(limbs, 1));
  return geo;
}

/** Petit pavé aux arêtes adoucies (sacs). */
class RoundedBox extends THREE.BufferGeometry {
  constructor(w: number, h: number, d: number) {
    super();
    const g = new THREE.SphereGeometry(1, 8, 6);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 0.35;
      p.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), k) * (w / 2), Math.sign(y) * Math.pow(Math.abs(y), k) * (h / 2), Math.sign(z) * Math.pow(Math.abs(z), k) * (d / 2));
    }
    g.computeVertexNormals();
    this.copy(g);
    g.dispose();
  }
}

function personMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  return patched(mat, "person-v2", (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float limb; attribute vec3 aTop; attribute vec3 aBottom; attribute float aPhase; attribute float aWalk;
        uniform float uTime;`,
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
        {
          float isTop = step(0.9, color.r) * step(color.g, 0.1) * step(0.9, color.b);
          float isBot = step(color.r, 0.1) * step(0.9, color.g) * step(0.9, color.b);
          vColor.rgb = mix(vColor.rgb, aTop, isTop);
          vColor.rgb = mix(vColor.rgb, aBottom, isBot);
        }`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float sw = sin(uTime * 7.0 * aWalk + aPhase) * aWalk;
          float al = abs(limb);
          float side = sign(limb);
          float pivotY = al > 1.5 ? 1.36 : 0.84;
          float amp = al > 1.5 ? 0.45 : 0.5;
          float ang = (al > 0.5 ? 1.0 : 0.0) * sw * amp * side;
          vec3 q = transformed - vec3(0.0, pivotY, 0.0);
          float c = cos(ang), s = sin(ang);
          q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
          transformed = mix(transformed, q + vec3(0.0, pivotY, 0.0), step(0.5, al));
          transformed.y += abs(sin(uTime * 7.0 * aWalk + aPhase)) * 0.035 * aWalk;
        }`,
      );
  });
}

type Walker = { path: Path; s: number; speed: number; mesh: number; index: number };

/* ── Pétales ─────────────────────────────────────────────────────────────── */

const PETAL_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime; uniform vec3 uCamPos; uniform float uBox;
varying float vShade;
void main() {
  float t = uTime * (0.6 + aSeed.w * 0.5) + aSeed.x * 40.0;
  vec3 base = aSeed.xyz * uBox;
  base.y -= t * 0.8;
  base.x += sin(t * 0.9 + aSeed.y * 6.0) * 1.2 + t * 0.35;
  base.z += cos(t * 0.7 + aSeed.z * 6.0) * 0.8;
  vec3 rel = mod(base - uCamPos + uBox * 0.5, vec3(uBox)) - uBox * 0.5;
  vec3 world = uCamPos + rel;
  // Pétale qui tourne sur lui-même.
  float a = t * 2.3 + aSeed.y * 9.0;
  vec3 p = position * 0.04;
  p = vec3(p.x * cos(a) - p.z * sin(a), p.y, p.x * sin(a) + p.z * cos(a));
  p.yz = vec2(p.y * cos(a * 0.7) - p.z * sin(a * 0.7), p.y * sin(a * 0.7) + p.z * cos(a * 0.7));
  vShade = 0.75 + 0.25 * sin(a);
  gl_Position = projectionMatrix * viewMatrix * vec4(world + p, 1.0);
}
`;
const PETAL_FRAG = /* glsl */ `
uniform float uAlpha; uniform vec3 uColor;
varying float vShade;
void main() { gl_FragColor = vec4(uColor * vShade, uAlpha); }
`;

export class Traffic {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private carMeshes: THREE.InstancedMesh[] = [];
  private walkers: Walker[] = [];
  private peopleMeshes: THREE.InstancedMesh[] = [];
  private trains: { mesh: THREE.InstancedMesh; x: number; dir: number; s: number; speed: number }[] = [];
  private petals: THREE.Mesh;
  private petalMat: THREE.ShaderMaterial;
  private headlights: GlowPoints;
  private taillights: GlowPoints;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private pos = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(detail: number) {
    this.group.name = "Vie";
    const r = rng(8);
    const L = (x: number, z: number, y = 0) => v3(x, y, z);

    // Boucles et lignes de circulation.
    const loops = [
      new Path([L(-1.7, 468), L(-1.7, 67.5), L(-62.6, 67.5), L(-62.6, 468)], true, 3.5),
      // Descente par la rue d'ouverture jusqu'à la 2e transversale seulement : aucune voiture ne passe à l'endroit où se tient la caméra.
      new Path([L(1.7, 62.6), L(1.7, 268), L(62.4, 268), L(62.4, 62.6)], true, 3.5),
      new Path([L(-63.5, -63.5), L(63.5, -63.5), L(63.5, 63.5), L(-63.5, 63.5)], true, 5),
      new Path([L(-66.5, 66.5), L(66.5, 66.5), L(66.5, -66.5), L(-66.5, -66.5)], true, 5),
    ];
    const lines: Path[] = [];
    for (const x of [-124, -120, 336, 342]) lines.push(new Path(x < 0 || x === 342 ? [L(x, -900), L(x, 900)] : [L(x, 900), L(x, -900)], false));
    for (const [z, d] of [
      [-187, 1],
      [-183, -1],
      [566, 1],
      [570, -1],
    ] as [number, number][])
      lines.push(new Path(d > 0 ? [L(-900, z), L(900, z)] : [L(900, z), L(-900, z)], false));
    // Voie express (sur le tablier).
    const xp = (side: number) => {
      const pts: THREE.Vector3[] = [];
      for (let z = -1800; z <= 1800; z += 40) pts.push(v3(expresswayX(z) + side * 4.2, 14.05, z));
      return new Path(side > 0 ? pts : pts.reverse(), false);
    };
    const xpN = xp(-1);
    const xpS = xp(1);

    const kinds: ("taxi" | "kei" | "sedan" | "truck")[] = ["taxi", "kei", "sedan", "truck"];
    const geos = kinds.map((k) => carGeometry(k));
    const palettes = [
      ["#1d2433", "#151517", "#2b3a2f", "#e5c53a"],
      ["#f2f0ea", "#e8dcc6", "#b9bec4", "#c0453a", "#7fa0b8", "#2c2c2e"],
      ["#f2f0ea", "#b9bec4", "#2c2c2e", "#3b4f6b", "#7a1f25"],
      ["#f4f3ef", "#f4f3ef", "#dfe3e6"],
    ];
    const plan: { path: Path; count: number; speed: [number, number] }[] = [
      { path: loops[0], count: Math.round(5 * detail + 2), speed: [6, 8] },
      { path: loops[1], count: Math.round(4 * detail + 2), speed: [6, 8] },
      { path: loops[2], count: Math.round(5 * detail + 2), speed: [8, 11] },
      { path: loops[3], count: Math.round(5 * detail + 2), speed: [8, 11] },
      ...lines.map((path) => ({ path, count: Math.round(10 * detail + 3), speed: [11, 15] as [number, number] })),
      { path: xpN, count: Math.round(34 * detail + 6), speed: [20, 26] },
      { path: xpS, count: Math.round(34 * detail + 6), speed: [20, 26] },
    ];
    const counts = [0, 0, 0, 0];
    for (const pl of plan) {
      for (let i = 0; i < pl.count; i++) {
        const kind = r.chance(0.4) ? 0 : r.chance(0.5) ? 1 : r.chance(0.6) ? 2 : 3;
        this.cars.push({ path: pl.path, s: (pl.path.length * (i + r.range(0, 0.6))) / pl.count, speed: r.range(pl.speed[0], pl.speed[1]), kind, index: counts[kind]++, len: geos[kind].len });
      }
    }
    const carMat = patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, envMapIntensity: 1.1 }), "cars-v1", (shader) => {
      shader.uniforms.uLights = shared.uLights;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGlow;\nuniform float uLights;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.9, 0.75) * vGlow * mix(0.05, 2.2, uLights);");
    });
    geos.forEach((g, k) => {
      const mesh = new THREE.InstancedMesh(g.geo, carMat, Math.max(1, counts[k]));
      mesh.name = `Voitures — ${kinds[k]}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < counts[k]; i++) mesh.setColorAt(i, new THREE.Color(r.pick(palettes[k])));
      this.carMeshes.push(mesh);
      this.group.add(mesh);
    });
    this.headlights = new GlowPoints(
      this.cars.map(() => ({ p: new THREE.Vector3(), color: "#fff1d0", size: 0.45 })),
      { minPx: 1.4, name: "Phares" },
    );
    this.taillights = new GlowPoints(
      this.cars.map(() => ({ p: new THREE.Vector3(), color: "#ff3b22", size: 0.32 })),
      { minPx: 1.2, name: "Feux arrière" },
    );
    this.group.add(this.headlights.mesh, this.taillights.mesh);

    // Passants : trottoirs de la rue d'ouverture, quelques traversées, le parvis de la tour.
    const pmat = personMaterial();
    const variants = 4;
    const perVariant: number[] = new Array(variants).fill(0);
    const walkerPaths: { path: Path; speed: number; variant: number; s: number }[] = [];
    const nWalk = Math.round(46 * detail + 10);
    for (let i = 0; i < nWalk; i++) {
      const north = r.chance(0.5);
      const west = r.chance(0.5);
      const x = (west ? -1 : 1) * r.range(3.4, 4.0);
      // Côté ouest : personne devant les distributeurs (on laisse la vue dégagée).
      const span = west ? (r.chance(0.5) ? [78, VENDING_CLEAR.z0] : [VENDING_CLEAR.z1, 515]) : [78, 515];
      const [z0, z1] = span;
      const path = new Path(north ? [L(x, z1), L(x, z0)] : [L(x, z0), L(x, z1)], false);
      const variant = r.chance(0.12) ? 3 : r.int(0, 2);
      walkerPaths.push({ path, speed: r.range(1.1, 1.6), variant, s: r.range(0, path.length) });
    }
    // Parvis : promeneurs en boucle autour de FootTown.
    for (let i = 0; i < Math.round(14 * detail + 4); i++) {
      const path = new Path([L(-40, 36), L(40, 36), L(40, -36), L(-40, -36)], true, 6);
      walkerPaths.push({ path, speed: r.range(0.9, 1.3), variant: r.int(0, 3), s: r.range(0, path.length) });
    }
    for (const w of walkerPaths) {
      this.walkers.push({ path: w.path, s: w.s, speed: w.speed, mesh: w.variant, index: perVariant[w.variant]++ });
    }
    const tops = ["#2b3a55", "#e8e3d8", "#c0453a", "#22252b", "#6f8a5a", "#d9a441", "#f2efe8", "#4a6a8a", "#8a4a5a", "#efe2c8"];
    const bottoms = ["#22252b", "#3a3f4a", "#2a2622", "#5a5f66", "#c9bca6", "#1d2433"];
    for (let v = 0; v < variants; v++) {
      const geo = personGeometry(v);
      const n = Math.max(1, perVariant[v]);
      const top = new Float32Array(n * 3);
      const bottom = new Float32Array(n * 3);
      const phase = new Float32Array(n);
      const walk = new Float32Array(n);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        c.set(r.pick(tops)).toArray(top, i * 3);
        c.set(r.pick(bottoms)).toArray(bottom, i * 3);
        phase[i] = r.range(0, 6.28);
        walk[i] = 1;
      }
      geo.setAttribute("aTop", new THREE.InstancedBufferAttribute(top, 3));
      geo.setAttribute("aBottom", new THREE.InstancedBufferAttribute(bottom, 3));
      geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
      geo.setAttribute("aWalk", new THREE.InstancedBufferAttribute(walk, 1));
      const mesh = new THREE.InstancedMesh(geo, pmat, n);
      mesh.name = `Passants ${v}`;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.peopleMeshes.push(mesh);
      this.group.add(mesh);
    }

    // Trains (Yamanote : argent et vert ; Keihin-Tōhoku : argent et bleu).
    const trainGeo = (stripe: string) => {
      const b = new MeshBuilder();
      b.color("#d9dcdf").box(0, 1.9, 0, 2.95, 3.4, 19.4);
      b.glow(0.12).color("#2d3640").box(0, 2.35, 0, 2.97, 0.95, 18.6, 0, { top: false }).glow(0);
      b.color(stripe).box(0, 1.55, 0, 2.97, 0.3, 19.42, 0, { top: false });
      b.color("#8a8d90").box(0, 3.65, 0, 2.6, 0.18, 18);
      b.color("#2a2c2e").box(0, 0.35, 0, 2.6, 0.5, 18.8);
      return b.build();
    };
    const tmat = patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }), "train-v1");
    for (const [x, dir, stripe, phase] of [
      [877.3, 1, "#80c241", 0],
      [882.7, -1, "#2f8fd8", 900],
    ] as [number, number, string, number][]) {
      const mesh = new THREE.InstancedMesh(trainGeo(stripe), tmat, 11);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.trains.push({ mesh, x, dir, s: phase, speed: 18 });
    }

    // Pétales (au sol seulement).
    const n = Math.round(420 * detail + 80);
    const pg = new THREE.InstancedBufferGeometry();
    // Pétale : losange arrondi (6 triangles), échancré à la pointe.
    const petal: number[] = [];
    const ring = [
      [0, -1.1],
      [0.55, -0.55],
      [0.62, 0.25],
      [0.32, 0.95],
      [0, 0.75],
      [-0.32, 0.95],
      [-0.62, 0.25],
      [-0.55, -0.55],
    ];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      petal.push(0, 0, 0, a[0], 0, a[1], b[0], 0, b[1]);
    }
    pg.setAttribute("position", new THREE.Float32BufferAttribute(petal, 3));
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) seeds.set([r.next(), r.next(), r.next(), r.next()], i * 4);
    pg.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    pg.instanceCount = n;
    this.petalMat = new THREE.ShaderMaterial({
      vertexShader: PETAL_VERT,
      fragmentShader: PETAL_FRAG,
      uniforms: { uTime: shared.uTime, uCamPos: shared.uCamPos, uBox: { value: 26 }, uAlpha: { value: 0.9 }, uColor: { value: new THREE.Color("#f6c9d4") } },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.petals = new THREE.Mesh(pg, this.petalMat);
    this.petals.frustumCulled = false;
    this.petals.name = "Pétales";
    this.group.add(this.petals);
  }

  update(dt: number, cameraY: number, reduced: boolean) {
    const lights = shared.uLights.value;
    const pos = this.pos;
    const dir = this.dir;
    const m = this.m;
    const q = this.q;
    const fwd = new THREE.Vector3(0, 0, 1);
    const hp = this.headlights.mesh.geometry.getAttribute("aPos") as THREE.InstancedBufferAttribute;
    const tp = this.taillights.mesh.geometry.getAttribute("aPos") as THREE.InstancedBufferAttribute;
    const flow = reduced ? 0.35 : 1;
    this.cars.forEach((c, i) => {
      c.s += c.speed * dt * flow;
      c.path.sample(c.s, pos, dir);
      q.setFromUnitVectors(fwd, dir);
      m.compose(pos, q, this.one);
      this.carMeshes[c.kind].setMatrixAt(c.index, m);
      const f = c.len / 2;
      hp.setXYZ(i, pos.x + dir.x * (f + 0.4), pos.y + 0.75, pos.z + dir.z * (f + 0.4));
      tp.setXYZ(i, pos.x - dir.x * (f + 0.1), pos.y + 0.85, pos.z - dir.z * (f + 0.1));
    });
    for (const mesh of this.carMeshes) mesh.instanceMatrix.needsUpdate = true;
    hp.needsUpdate = true;
    tp.needsUpdate = true;
    this.headlights.intensity = lights * 3.2;
    this.taillights.intensity = lights * 2.4;

    // Passants : seulement quand on peut les voir.
    const showPeople = cameraY < 260;
    for (const mesh of this.peopleMeshes) mesh.visible = showPeople;
    if (showPeople) {
      for (const w of this.walkers) {
        w.s += w.speed * dt * flow;
        w.path.sample(w.s, pos, dir);
        q.setFromUnitVectors(fwd, dir);
        m.compose(pos, q, this.one);
        this.peopleMeshes[w.mesh].setMatrixAt(w.index, m);
      }
      for (const mesh of this.peopleMeshes) mesh.instanceMatrix.needsUpdate = true;
    }

    for (const tr of this.trains) {
      tr.s += tr.speed * dt * tr.dir * flow;
      for (let k = 0; k < 11; k++) {
        let z = tr.s - k * 20 * tr.dir;
        z = ((((z + 1800) % 3600) + 3600) % 3600) - 1800;
        m.makeTranslation(tr.x, 9.0, z);
        if (tr.dir < 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
        tr.mesh.setMatrixAt(k, m);
      }
      tr.mesh.instanceMatrix.needsUpdate = true;
    }

    // Pétales : présents au sol, s'effacent en montant.
    const a = THREE.MathUtils.clamp(1 - (cameraY - 6) / 30, 0, 1) * (reduced ? 0 : 1);
    this.petalMat.uniforms.uAlpha.value = a * 0.85;
    this.petalMat.uniforms.uColor.value.set("#f6c9d4").multiplyScalar(THREE.MathUtils.lerp(1, 0.22, shared.uNight.value));
    this.petals.visible = a > 0.01;
  }
}
