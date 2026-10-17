import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { TOWER, halfWidth } from "./spec";

/**
 * Le treillis : pieds, arches, ceinture, fût, couronne et mât d'antenne.
 * Tout est généré depuis `spec.ts` et fusionné en une géométrie. La couleur
 * des bandes est appliquée dans le shader selon la hauteur (bords nets, pas
 * de découpe de géométrie).
 */

type V = THREE.Vector3;

const CORNERS: [number, number][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

/** Faces : paire de coins consécutifs + normale sortante. */
const FACES = CORNERS.map((c, i) => {
  const d = CORNERS[(i + 1) % 4];
  const nx = (c[0] + d[0]) / 2;
  const nz = (c[1] + d[1]) / 2;
  return { a: c, b: d, normal: v3(nx, 0, nz).normalize() };
});

const corner = (sx: number, sz: number, h: number, w = halfWidth(h)) => v3(sx * w, h, sz * w);

function legCenter(sx: number, sz: number, h: number) {
  return corner(sx, sz, h);
}

export function buildLattice(detail: number) {
  const b = new MeshBuilder();
  b.color("#ffffff");

  // ── Pieds (0 → legsMerge) : quatre colonnes en treillis à quatre membrures.
  const legPanels = Math.round(9 * detail + 3);
  for (const [sx, sz] of CORNERS) {
    const s = (h: number) => 3.4 - (h / TOWER.legsMerge) * 1.3; // demi-section du pied
    const chordAt = (h: number, ox: number, oz: number) => {
      const c = legCenter(sx, sz, h);
      return v3(c.x + ox * s(h), h, c.z + oz * s(h));
    };
    const offs: [number, number][] = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    const hs: number[] = [];
    for (let i = 0; i <= legPanels; i++) {
      const t = i / legPanels;
      hs.push(TOWER.legsMerge * (t * 0.85 + t * t * 0.15) + (i === 0 ? 0.2 : 0));
    }
    for (let i = 0; i < hs.length - 1; i++) {
      const h0 = hs[i];
      const h1 = hs[i + 1];
      for (let k = 0; k < 4; k++) {
        const [ox, oz] = offs[k];
        const [px, pz] = offs[(k + 1) % 4];
        const a0 = chordAt(h0, ox, oz);
        const a1 = chordAt(h1, ox, oz);
        const b0 = chordAt(h0, px, pz);
        const b1 = chordAt(h1, px, pz);
        b.beam(a0, a1, 1.0, 1.0, undefined, false); // membrure
        b.beam(a0, b1, 0.34, 0.26); // treillis en X
        b.beam(b0, a1, 0.34, 0.26);
        b.beam(a1, b1, 0.38, 0.3); // traverse
      }
    }
    // Socle béton du pied.
    const base = legCenter(sx, sz, 0);
    b.color("#b9b2a6").box(base.x, 0.6, base.z, 8.4, 1.2, 8.4).color("#ffffff");
  }

  // ── Arches entre les pieds (au-dessus du toit de FootTown).
  for (const f of FACES) {
    const segs = Math.round(14 * detail + 6);
    const springH = 24;
    const apexH = 40;
    const pts: V[] = [];
    const ptsLow: V[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ca = legCenter(f.a[0], f.a[1], springH + (apexH - springH) * 0);
      const cb = legCenter(f.b[0], f.b[1], springH);
      const x = THREE.MathUtils.lerp(ca.x, cb.x, t);
      const z = THREE.MathUtils.lerp(ca.z, cb.z, t);
      const lift = Math.sin(Math.PI * t);
      const y = springH + (apexH - springH) * Math.pow(lift, 0.8);
      // L'arche suit la face inclinée : on la recule légèrement vers l'axe.
      const inward = 1 - 0.06 * lift;
      pts.push(v3(x * inward, y, z * inward));
      ptsLow.push(v3(x * inward, y - 2.6 + 1.2 * lift, z * inward));
    }
    for (let i = 0; i < segs; i++) {
      b.beam(pts[i], pts[i + 1], 0.8, 0.8, f.normal);
      b.beam(ptsLow[i], ptsLow[i + 1], 0.6, 0.6, f.normal);
      b.beam(pts[i], ptsLow[i + 1], 0.22, 0.22, f.normal);
      b.beam(ptsLow[i], pts[i], 0.22, 0.22, f.normal);
    }
  }

  // ── Fût : de la jonction des pieds jusqu'à la couronne.
  const levels: number[] = [];
  let h: number = TOWER.legsMerge;
  while (h < TOWER.crown.top - 0.5) {
    levels.push(h);
    const w = halfWidth(h);
    const step = Math.max(2.4, w * (0.62 + 0.2 * (1 - detail)));
    h += step;
    // Arrêts nets sur les plateformes.
    for (const stop of [TOWER.mainDeck.bottom, TOWER.mainDeck.top, TOWER.topDeck.bottom, TOWER.topDeck.top]) {
      if (levels[levels.length - 1] < stop && h > stop - 1.2) h = stop;
    }
  }
  levels.push(TOWER.crown.top);

  const inDeck = (h0: number, h1: number) =>
    (h0 >= TOWER.mainDeck.bottom - 0.01 && h1 <= TOWER.mainDeck.top + 0.01) ||
    (h0 >= TOWER.topDeck.bottom - 0.01 && h1 <= TOWER.topDeck.top + 0.01);

  for (let i = 0; i < levels.length - 1; i++) {
    const h0 = levels[i];
    const h1 = levels[i + 1];
    const t = (h0 - TOWER.legsMerge) / (TOWER.crown.top - TOWER.legsMerge);
    const chord = THREE.MathUtils.lerp(1.5, 0.55, Math.pow(t, 0.8));
    const brace = THREE.MathUtils.lerp(0.5, 0.2, Math.pow(t, 0.8));
    for (const [sx, sz] of CORNERS) {
      b.beam(corner(sx, sz, h0), corner(sx, sz, h1), chord, chord);
    }
    if (inDeck(h0, h1)) continue;
    for (const f of FACES) {
      const a0 = corner(f.a[0], f.a[1], h0);
      const b0 = corner(f.b[0], f.b[1], h0);
      const a1 = corner(f.a[0], f.a[1], h1);
      const b1 = corner(f.b[0], f.b[1], h1);
      b.beam(a0, b0, brace * 1.15, brace * 0.9, f.normal);
      b.beam(a0, b1, brace, brace * 0.8, f.normal);
      b.beam(b0, a1, brace, brace * 0.8, f.normal);
      // Grands panneaux : sous-treillis (losange) pour la richesse de près.
      if (halfWidth(h0) > 9 && detail > 0.4) {
        const m0 = a0.clone().lerp(b0, 0.5);
        const m1 = a1.clone().lerp(b1, 0.5);
        const ma = a0.clone().lerp(a1, 0.5);
        const mb = b0.clone().lerp(b1, 0.5);
        b.beam(m0, ma, brace * 0.55, brace * 0.5, f.normal);
        b.beam(ma, m1, brace * 0.55, brace * 0.5, f.normal);
        b.beam(m1, mb, brace * 0.55, brace * 0.5, f.normal);
        b.beam(mb, m0, brace * 0.55, brace * 0.5, f.normal);
      }
    }
    // Diaphragme horizontal (losange) un niveau sur trois : profondeur à travers
    // la tour, sans traverser la cage d'ascenseur.
    if (i % 3 === 0) {
      const p = CORNERS.map(([sx, sz]) => corner(sx, sz, h0));
      const mids = p.map((q, k) => q.clone().lerp(p[(k + 1) % 4], 0.5));
      for (let k = 0; k < 4; k++) b.beam(mids[k], mids[(k + 1) % 4], brace * 0.7, brace * 0.7);
    }
  }
  // Ceinture à la jonction des pieds.
  for (const f of FACES) {
    for (const dh of [0, 4.2]) {
      const a = corner(f.a[0], f.a[1], TOWER.legsMerge + dh);
      const c = corner(f.b[0], f.b[1], TOWER.legsMerge + dh);
      b.beam(a, c, 1.1, 1.1, f.normal);
    }
    const a = corner(f.a[0], f.a[1], TOWER.legsMerge);
    const c = corner(f.b[0], f.b[1], TOWER.legsMerge);
    const a2 = corner(f.a[0], f.a[1], TOWER.legsMerge + 4.2);
    const c2 = corner(f.b[0], f.b[1], TOWER.legsMerge + 4.2);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const p0 = a.clone().lerp(c, i / n);
      const p1 = a2.clone().lerp(c2, (i + 1) / n);
      const p2 = a2.clone().lerp(c2, i / n);
      b.beam(p0, p1, 0.3, 0.3, f.normal);
      b.beam(p0, p2, 0.3, 0.3, f.normal);
    }
  }

  // ── Mât d'antenne : treillis carré fin, puis pointe pleine.
  const mastTop = 318;
  const mastLevels: number[] = [];
  for (let y = TOWER.antenna.bottom; y < mastTop; y += 2.4) mastLevels.push(y);
  mastLevels.push(mastTop);
  const mastHalf = (y: number) => {
    const t = (y - TOWER.antenna.bottom) / (mastTop - TOWER.antenna.bottom);
    return THREE.MathUtils.lerp(1.55, 0.55, t);
  };
  for (let i = 0; i < mastLevels.length - 1; i++) {
    const y0 = mastLevels[i];
    const y1 = mastLevels[i + 1];
    const w0 = mastHalf(y0);
    const w1 = mastHalf(y1);
    const P = (sx: number, sz: number, y: number, w: number) => v3(sx * w, y, sz * w);
    for (const [sx, sz] of CORNERS) b.beam(P(sx, sz, y0, w0), P(sx, sz, y1, w1), 0.26, 0.26);
    for (const f of FACES) {
      const a0 = P(f.a[0], f.a[1], y0, w0);
      const b0 = P(f.b[0], f.b[1], y0, w0);
      const a1 = P(f.a[0], f.a[1], y1, w1);
      b.beam(a0, b0, 0.12, 0.12, f.normal);
      b.beam(b0, a1, 0.1, 0.1, f.normal);
    }
  }
  return b.build();
}

/** Parties pleines de l'antenne (socle cerclé, pointe), peintes elles aussi par bandes. */
export function buildAntennaSolids() {
  const b = new MeshBuilder();
  b.color("#ffffff");
  // Socle : tambour cerclé (le « bouchon » orange au-dessus du Top Deck).
  const base = TOWER.antenna.bottom;
  b.cylinder(0, base - 0.6, 0, 2.5, 2.5, 1.2, 20);
  for (let i = 0; i < 6; i++) b.cylinder(0, base + 1 + i * 1.7, 0, 2.15, 2.15, 0.9, 20);
  b.cylinder(0, base, 0, 1.75, 1.75, 11.5, 16, {});
  // Pointe pleine.
  b.cylinder(0, 318, 0, 0.42, 0.3, 3, 10, {});
  b.cylinder(0, 321, 0, 0.3, 0.14, 11.5, 8, {});
  b.cylinder(0, 332.5, 0, 0.14, 0.05, 0.6, 6, { top: true });
  // Petits anneaux sur la pointe.
  for (const y of [319.5, 323, 326.5]) b.cylinder(0, y, 0, 0.5, 0.5, 0.25, 10);
  return b.build();
}

/** Positions des sphères blanches (radômes / paraboles) accrochées au fût. */
export function radomePositions() {
  const out: { p: THREE.Vector3; r: number }[] = [];
  const hs = [128, 134, 165, 171, 186, 194, 208, 214, 231, 238];
  hs.forEach((h, i) => {
    const w = halfWidth(h) + 0.9;
    const f = FACES[(i * 3 + 1) % 4];
    const along = (i % 2 === 0 ? -0.45 : 0.4) * w;
    const tangent = v3(-f.normal.z, 0, f.normal.x);
    const p = f.normal.clone().multiplyScalar(w * Math.SQRT2 * 0.72).addScaledVector(tangent, along);
    p.y = h;
    out.push({ p, r: 0.9 + (i % 3) * 0.25 });
  });
  return out;
}

/** Feux d'obstacle (rouges), aux coins à quelques hauteurs. */
export function beaconPositions() {
  const out: THREE.Vector3[] = [];
  for (const h of [58, 100, 176, 223]) {
    const w = halfWidth(h) + 0.5;
    for (const [sx, sz] of CORNERS) out.push(v3(sx * w, h + 0.6, sz * w));
  }
  for (const h of [278, 300]) for (const [sx, sz] of CORNERS) out.push(v3(sx * 1.8, h, sz * 1.8));
  out.push(v3(0, 333.4, 0));
  return out;
}
