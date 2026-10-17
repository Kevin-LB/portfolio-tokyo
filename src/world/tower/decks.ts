import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { TOWER, halfWidth } from "./spec";

/**
 * Main Deck (projets), Top Deck (à propos), cages d'ascenseur et FootTown.
 *
 * Main Deck : plan octogonal (carré chanfreiné), quatre grandes faces qui
 * portent chacune un écran (les vitrages deviennent façade média), quatre
 * pans coupés vitrés. Le haut est plus large que le bas (évasement réel).
 */

export const MAIN = {
  half: TOWER.mainDeck.half,
  chamfer: 3.2,
  y0: TOWER.mainDeck.bottom,
  y1: TOWER.mainDeck.top,
  screenY0: 144.2,
  screenY1: 155.2,
  flare: TOWER.mainDeck.flare,
};

/** Octogone du Main Deck à la hauteur y (sommets dans le sens antihoraire vu du dessus). */
export function mainDeckOutline(y: number) {
  const t = (y - MAIN.y0) / (MAIN.y1 - MAIN.y0);
  const h = MAIN.half + MAIN.flare * t;
  const c = MAIN.chamfer;
  return [
    v3(h, y, -(h - c)),
    v3(h, y, h - c),
    v3(h - c, y, h),
    v3(-(h - c), y, h),
    v3(-h, y, h - c),
    v3(-h, y, -(h - c)),
    v3(-(h - c), y, -h),
    v3(h - c, y, -h),
  ];
}

/**
 * Les quatre faces-écrans : index de face → angle (radians, autour de Y) de
 * la normale sortante. 0 = +z (face sud, celle qu'on voit en arrivant).
 */
export const SCREEN_FACES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export function screenFrame(face: number) {
  const angle = SCREEN_FACES[face];
  const yMid = (MAIN.screenY0 + MAIN.screenY1) / 2;
  const tMid = (yMid - MAIN.y0) / (MAIN.y1 - MAIN.y0);
  const h = MAIN.half + MAIN.flare * tMid;
  const width = (h - MAIN.chamfer) * 2 - 1.6;
  const height = MAIN.screenY1 - MAIN.screenY0;
  const normal = v3(Math.sin(angle), 0, Math.cos(angle));
  const center = normal.clone().multiplyScalar(h + 0.12);
  center.y = yMid;
  // Inclinaison de l'évasement (le haut avance).
  const tilt = Math.atan2(MAIN.flare, MAIN.y1 - MAIN.y0);
  return { angle, center, normal, width, height, tilt };
}

export function buildMainDeck() {
  const s = new MeshBuilder(); // structure blanche
  const g = new MeshBuilder(); // vitrages
  const white = "#f1ece3";
  const steel = "#d9d4cb";

  const ring = (y: number) => mainDeckOutline(y);
  const band = (yA: number, yB: number, color: string, inset = 0, builder = s) => {
    builder.color(color);
    const A = ring(yA).map((p) => p.clone().multiplyScalar(1 - inset / MAIN.half).setY(yA));
    const B = ring(yB).map((p) => p.clone().multiplyScalar(1 - inset / MAIN.half).setY(yB));
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      builder.quad(A[i], A[j], B[j], B[i]);
    }
  };
  const cap = (y: number, color: string, up: boolean, scale = 1) => {
    s.color(color);
    const P = ring(y).map((p) => p.clone().multiplyScalar(scale).setY(y));
    const c = v3(0, y, 0);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      if (up) s.tri(c, P[j], P[i]);
      else s.tri(c, P[i], P[j]);
    }
  };

  // Sous-face : du fût vers le bord, en pente douce.
  {
    s.color("#cfc9bf");
    const inner = halfWidth(MAIN.y0 - 2.5) + 0.6;
    const P = ring(MAIN.y0);
    const Q = P.map((p) => {
      const q = p.clone().normalize().multiplyScalar(inner * Math.SQRT2 * 0.92);
      return v3(Math.max(-inner, Math.min(inner, q.x)), MAIN.y0 - 2.5, Math.max(-inner, Math.min(inner, q.z)));
    });
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      s.quad(Q[i], Q[j], P[j], P[i]);
    }
  }
  cap(MAIN.y0, "#cfc9bf", false);
  band(MAIN.y0, MAIN.y0 + 2.2, white); // allège basse
  band(MAIN.screenY0 - 0.2, MAIN.screenY0, steel, 0.25);
  // Vitrages (pans coupés) : verre sombre réfléchissant, l'intérieur s'allume la nuit.
  g.glow(0.18);
  band(MAIN.screenY0, MAIN.screenY1, "#33414d", 0.35, g);
  g.glow(0);
  band(MAIN.screenY1, MAIN.screenY1 + 0.25, steel, 0.25);
  band(MAIN.screenY1 + 0.25, MAIN.y1, white); // acrotère
  cap(MAIN.y1, "#e6e1d8", true);
  // Garde-corps de toit.
  s.color(steel);
  const R = ring(MAIN.y1 + 1.1).map((p) => p.clone().multiplyScalar(0.985).setY(MAIN.y1 + 1.1));
  const R0 = ring(MAIN.y1).map((p) => p.clone().multiplyScalar(0.985).setY(MAIN.y1));
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    s.beam(R[i], R[j], 0.12, 0.12);
    const n = Math.max(2, Math.round(R0[i].distanceTo(R0[j]) / 2.2));
    for (let k = 0; k <= n; k++) s.beam(R0[i].clone().lerp(R0[j], k / n), R[i].clone().lerp(R[j], k / n), 0.08, 0.08);
  }
  // Meneaux des pans coupés (les grandes faces portent les écrans).
  s.color(white);
  for (let i = 1; i < 8; i += 2) {
    const A0 = ring(MAIN.screenY0);
    const A1 = ring(MAIN.screenY1);
    const n = 3;
    for (let k = 0; k <= n; k++) {
      const p0 = A0[i].clone().lerp(A0[(i + 1) % 8], k / n).multiplyScalar(1.003).setY(MAIN.screenY0);
      const p1 = A1[i].clone().lerp(A1[(i + 1) % 8], k / n).multiplyScalar(1.003).setY(MAIN.screenY1);
      s.beam(p0, p1, 0.28, 0.2);
    }
    // Lisse intermédiaire (plancher du niveau 2).
    const m0 = ring(150).map((p) => p.clone().multiplyScalar(1.004).setY(150));
    s.beam(m0[i], m0[(i + 1) % 8], 0.5, 0.3);
  }
  // Cadres des écrans (fins, blancs) sur les grandes faces.
  for (let f = 0; f < 4; f++) {
    const fr = screenFrame(f);
    const right = v3(Math.cos(fr.angle), 0, -Math.sin(fr.angle));
    const hw = fr.width / 2 + 0.35;
    const lean = Math.tan(fr.tilt);
    const at = (u: number, y: number) => {
      const p = fr.center.clone().addScaledVector(right, u);
      p.addScaledVector(fr.normal, (y - fr.center.y) * lean + 0.05);
      p.y = y;
      return p;
    };
    const y0 = MAIN.screenY0 - 0.3;
    const y1 = MAIN.screenY1 + 0.3;
    s.beam(at(-hw, y0), at(hw, y0), 0.6, 0.3, fr.normal);
    s.beam(at(-hw, y1), at(hw, y1), 0.6, 0.3, fr.normal);
    s.beam(at(-hw, y0), at(-hw, y1), 0.6, 0.3, fr.normal);
    s.beam(at(hw, y0), at(hw, y1), 0.6, 0.3, fr.normal);
  }

  return { structure: s.build(), glass: g.build() };
}

/** Top Deck : anneau octogonal vitré, rayé en haut. */
export const TOP = {
  radius: TOWER.topDeck.radius,
  y0: TOWER.topDeck.bottom,
  y1: TOWER.topDeck.top,
  glass0: 247.6,
  glass1: 253.2,
  sides: 8,
};

export function topDeckVertex(i: number, y: number, r: number = TOP.radius) {
  const a = ((i + 0.5) / TOP.sides) * Math.PI * 2;
  return v3(Math.sin(a) * r, y, Math.cos(a) * r);
}

/** Facette du Top Deck qui porte le texte « à propos » (celle face à la caméra). */
export function aboutFacet(index = 0) {
  const a = (index / TOP.sides) * Math.PI * 2;
  const apothem = TOP.radius * Math.cos(Math.PI / TOP.sides);
  const normal = v3(Math.sin(a), 0, Math.cos(a));
  const width = 2 * TOP.radius * Math.sin(Math.PI / TOP.sides);
  const center = normal.clone().multiplyScalar(apothem + 0.06);
  center.y = (TOP.glass0 + TOP.glass1) / 2;
  return { angle: a, normal, center, width, height: TOP.glass1 - TOP.glass0 };
}

export function buildTopDeck() {
  const s = new MeshBuilder();
  const g = new MeshBuilder();
  const n = TOP.sides;
  const ringBand = (yA: number, yB: number, color: string, rA: number = TOP.radius, rB: number = rA, builder = s) => {
    builder.color(color);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      builder.quad(topDeckVertex(i, yA, rA), topDeckVertex(j, yA, rA), topDeckVertex(j, yB, rB), topDeckVertex(i, yB, rB));
    }
  };
  const disc = (y: number, r: number, color: string, up: boolean) => {
    s.color(color);
    const c = v3(0, y, 0);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (up) s.tri(c, topDeckVertex(j, y, r), topDeckVertex(i, y, r));
      else s.tri(c, topDeckVertex(i, y, r), topDeckVertex(j, y, r));
    }
  };
  const orange = "#e8542a";
  const white = "#f1ece3";
  ringBand(TOP.y0 - 1.6, TOP.y0, "#d8d2c8", 3.6, TOP.radius - 0.4);
  disc(TOP.y0 - 1.6, 3.6, "#cfc9bf", false);
  ringBand(TOP.y0, TOP.glass0, white);
  ringBand(TOP.glass0, TOP.glass1, "#2b3541", TOP.radius - 0.15, TOP.radius - 0.15, g);
  ringBand(TOP.glass1, TOP.glass1 + 0.6, white, TOP.radius, TOP.radius + 0.1);
  ringBand(TOP.glass1 + 0.6, TOP.glass1 + 1.3, orange, TOP.radius + 0.1, TOP.radius + 0.1);
  ringBand(TOP.glass1 + 1.3, TOP.glass1 + 1.7, white, TOP.radius + 0.1, TOP.radius + 0.1);
  ringBand(TOP.glass1 + 1.7, TOP.y1, orange, TOP.radius + 0.1, TOP.radius - 0.6);
  disc(TOP.y1, TOP.radius - 0.6, "#e0dad0", true);
  // Meneaux.
  s.color(white);
  for (let i = 0; i < n; i++) {
    const p0 = topDeckVertex(i, TOP.glass0, TOP.radius + 0.02);
    const p1 = topDeckVertex(i, TOP.glass1, TOP.radius + 0.02);
    s.beam(p0, p1, 0.32, 0.22);
  }
  // Intérieur : plancher, plafond lumineux, noyau, quelques visiteurs à contre-jour.
  disc(TOP.glass0 - 0.02, TOP.radius - 0.2, "#cfc8bd", true);
  disc(TOP.glass1 + 0.25, TOP.radius - 0.2, "#e9e4db", false);
  s.glow(1).color("#fff1dc");
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    s.box(Math.sin(a) * (TOP.radius - 1.4), TOP.glass1 + 0.18, Math.cos(a) * (TOP.radius - 1.4), 0.9, 0.06, 0.25, a);
  }
  s.glow(0).color("#454a52").cylinder(0, TOP.glass0, 0, 2.3, 2.3, TOP.glass1 - TOP.glass0 + 0.3, 16);
  s.color("#2f3338");
  for (const [a, h] of [
    [0.6, 1.72],
    [0.95, 1.6],
    [2.4, 1.78],
    [3.6, 1.66],
    [4.1, 1.25],
    [5.3, 1.7],
  ] as [number, number][]) {
    const r = TOP.radius - 1.1;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    s.cylinder(x, TOP.glass0, z, 0.17, 0.2, h - 0.25, 8);
    s.geometry(new THREE.SphereGeometry(0.12, 8, 6), new THREE.Matrix4().makeTranslation(x, TOP.glass0 + h - 0.12, z));
  }
  return { structure: s.build(), glass: g.build() };
}

/** Cages d'ascenseur vitrées : la basse (sol → Main Deck), la haute (Main → Top). */
export const CORES = [
  { y0: TOWER.footTownTop, y1: MAIN.y0 - 2.5, half: TOWER.core.half },
  { y0: MAIN.y1, y1: TOP.y0 - 1.6, half: 2.3 },
];

export function buildCores() {
  const s = new MeshBuilder();
  const g = new MeshBuilder();
  for (const c of CORES) {
    const h = c.half;
    const P = [v3(h, 0, h), v3(-h, 0, h), v3(-h, 0, -h), v3(h, 0, -h)];
    g.color("#46535e");
    for (let i = 0; i < 4; i++) {
      const a = P[i];
      const b = P[(i + 1) % 4];
      g.quad(a.clone().setY(c.y0), b.clone().setY(c.y0), b.clone().setY(c.y1), a.clone().setY(c.y1));
    }
    s.color("#d9d4cb");
    for (const p of P) s.beam(p.clone().setY(c.y0), p.clone().setY(c.y1), 0.3, 0.3);
    for (let y = c.y0 + 9; y < c.y1; y += 9) {
      for (let i = 0; i < 4; i++) s.beam(P[i].clone().setY(y), P[(i + 1) % 4].clone().setY(y), 0.12, 0.22);
    }
    // Rails de guidage (lisibles de loin : « ici, ça monte »).
    s.color("#8f8a83");
    for (const dx of [-0.9, 0.9]) s.beam(v3(dx, c.y0, h - 0.25), v3(dx, c.y1, h - 0.25), 0.12, 0.12);
  }
  return { structure: s.build(), glass: g.build() };
}

/** FootTown : le bâtiment de cinq niveaux que la tour enjambe. */
export const FOOTTOWN = { w: 62, d: 46, h: TOWER.footTownTop };

export function buildFootTown() {
  const s = new MeshBuilder();
  const { w, d, h } = FOOTTOWN;
  const dark = "#3b3639";
  s.color(dark).box(0, h / 2, 0, w, h, d);
  // Bandeaux clairs entre niveaux.
  s.color("#8d8589");
  for (let i = 1; i < 5; i++) s.box(0, (h / 5) * i, 0, w + 0.3, 0.35, d + 0.3, 0, { top: true });
  // Entrée vitrée (côté sud) et auvent.
  s.color("#d6d0c6").box(0, 4.2, d / 2 + 2.2, 22, 0.5, 4.4);
  s.glow(0.85).color("#ffd9a3").box(0, 2.0, d / 2 + 0.06, 18, 3.6, 0.1).glow(0);
  // Toit : édicules, garde-corps, terrasse en bois, bacs plantés, gaines.
  s.color("#7c7478").box(-14, h + 2, -6, 14, 4, 10);
  s.color("#9a9296").box(16, h + 1.4, 8, 10, 2.8, 8);
  s.color("#a98a68").box(6, h + 0.08, -12, 18, 0.16, 12);
  s.color("#6f8a55");
  for (const x of [-3, 2, 7, 12, 17]) s.box(x, h + 0.5, -18.4, 3.6, 0.8, 1.2);
  s.color("#c9c3ba");
  for (const x of [-26, -21, 22, 27]) s.box(x, h + 0.7, 14, 3, 1.4, 2.2);
  s.color("#b8b2a8").box(-6, h + 0.35, 12, 22, 0.7, 1.1);
  // Rez-de-chaussée vitré tout autour, bandeaux de fenêtres aux étages.
  s.glow(0.9).color("#e9c99a");
  s.box(0, 2.0, -d / 2 - 0.06, w - 8, 3.4, 0.1);
  s.box(w / 2 + 0.06, 2.0, 0, 0.1, 3.4, d - 8);
  s.box(-w / 2 - 0.06, 2.0, 0, 0.1, 3.4, d - 8);
  s.glow(0.35).color("#4b4f57");
  for (let i = 1; i < 5; i++) {
    const y = (h / 5) * i + 1.6;
    s.box(0, y, d / 2 + 0.05, w - 10, 1.4, 0.08);
    s.box(0, y, -d / 2 - 0.05, w - 10, 1.4, 0.08);
  }
  s.glow(0);
  s.color("#c8c1b6");
  const rail = (x0: number, z0: number, x1: number, z1: number) => s.beam(v3(x0, h + 1.1, z0), v3(x1, h + 1.1, z1), 0.1, 0.1);
  rail(-w / 2, -d / 2, w / 2, -d / 2);
  rail(w / 2, -d / 2, w / 2, d / 2);
  rail(w / 2, d / 2, -w / 2, d / 2);
  rail(-w / 2, d / 2, -w / 2, -d / 2);
  return s.build();
}

/** Cabine d'ascenseur : verre, cadre, plafond lumineux. Géométrie locale (base en y = 0). */
export function buildElevatorCabin() {
  const s = new MeshBuilder();
  const w = 2.5;
  const hgt = 2.9;
  s.color("#efe9df").box(0, 0.12, 0, w + 0.2, 0.24, w + 0.2, 0, { bottom: true });
  s.color("#efe9df").box(0, hgt - 0.1, 0, w + 0.2, 0.2, w + 0.2);
  s.glow(1).color("#ffe2b0").box(0, hgt - 0.24, 0, w - 0.3, 0.06, w - 0.3).glow(0);
  s.color("#d8d2c8");
  for (const [x, z] of [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    s.box((x * w) / 2, hgt / 2, (z * w) / 2, 0.14, hgt, 0.14);
  }
  // Main courante.
  s.color("#b9b1a5").box(0, 1.0, w / 2 - 0.08, w - 0.3, 0.06, 0.06);
  const glass = new THREE.BoxGeometry(w, hgt - 0.3, w);
  glass.translate(0, hgt / 2, 0);
  return { frame: s.build(), glass };
}
