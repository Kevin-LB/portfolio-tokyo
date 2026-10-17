import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { TEMPLE } from "./layout";

/**
 * Zōjō-ji (stylisé) : le grand toit courbe à côté de la tour, la vue
 * « temple + tour » que tout le monde associe au quartier. Toit en
 * croupe à bords relevés, piliers vermillon, socle de pierre, lanternes.
 */
export function buildTemple() {
  const b = new MeshBuilder();
  const { x, z, w, d } = TEMPLE;
  const stone = "#cfc6b4";
  // Socle et emmarchement (côté ouest, vers la tour).
  b.color(stone).box(x, 0.9, z, w, 1.8, d);
  for (let i = 0; i < 6; i++) b.color(i % 2 ? "#c6bdab" : stone).box(x - w / 2 - 0.6 - i * 0.6, 0.15 * (6 - i), z, 1.2, 0.3 * (6 - i), 14);
  // Corps : murs blancs, piliers vermillon, portes de bois.
  const bw = w - 10;
  const bd = d - 9;
  const top = 1.8 + 8.5;
  b.color("#efe8da").box(x, 1.8 + 4.25, z, bw, 8.5, bd, 0, { top: false });
  b.color("#b8402c");
  const cols = 7;
  for (let i = 0; i <= cols; i++) {
    const zz = z - bd / 2 + (bd * i) / cols;
    b.cylinder(x - bw / 2 - 0.2, 1.8, zz, 0.42, 0.42, 8.5, 10);
    b.cylinder(x + bw / 2 + 0.2, 1.8, zz, 0.42, 0.42, 8.5, 10);
  }
  for (let i = 0; i <= 9; i++) {
    const xx = x - bw / 2 + (bw * i) / 9;
    b.cylinder(xx, 1.8, z - bd / 2 - 0.2, 0.42, 0.42, 8.5, 10);
    b.cylinder(xx, 1.8, z + bd / 2 + 0.2, 0.42, 0.42, 8.5, 10);
  }
  // Linteaux.
  b.color("#9e3424").box(x, top - 0.6, z, bw + 1.2, 1.0, bd + 1.2);
  // Portes (façade ouest) : panneaux sombres, la nuit une lueur chaude.
  for (let i = 1; i < 6; i++) {
    const zz = z - bd / 2 + (bd * i) / 6;
    b.glow(0.35).color("#5a3c28").box(x - bw / 2 - 0.05, 1.8 + 3.2, zz, 0.12, 5.2, bd / 6 - 1.2);
  }
  b.glow(0);
  // Avant-toit / encorbellement.
  b.color("#3f3a34").box(x, top + 0.4, z, bw + 4, 0.8, bd + 4);
  // Le toit : croupe à courbe concave, coins relevés.
  roof(b, x, top + 0.8, z, w + 6, d + 8, 13);
  // Lanternes de pierre devant.
  for (const dz of [-9, 9]) lantern(b, x - w / 2 - 6, z + dz);
  for (const dz of [-16, 16]) lantern(b, x - w / 2 - 14, z + dz);
  return b.build();
}

function roof(b: MeshBuilder, cx: number, y0: number, cz: number, W: number, D: number, H: number) {
  const nx = 28;
  const nz = 20;
  const tile = new THREE.Color("#4b5552");
  const tileDark = new THREE.Color("#323a39");
  const hx = W / 2;
  const hz = D / 2;
  const ridge = (W - D) / 2; // demi-longueur du faîtage
  const height = (px: number, pz: number) => {
    // Distance « en croupe » normalisée : 0 au faîtage, 1 à l'égout.
    const dx = Math.max(0, Math.abs(px) - ridge) / (hx - ridge);
    const dz = Math.abs(pz) / hz;
    const t = Math.min(1, Math.max(dx, dz));
    const curve = Math.pow(1 - t, 1.55);
    // Coins relevés (le geste des toits de temple).
    const corner = Math.pow(Math.abs(px) / hx, 6) * Math.pow(Math.abs(pz) / hz, 6);
    return H * curve + corner * 2.2 + (1 - t) * 0.4;
  };
  const P = (i: number, k: number) => {
    const px = -hx + (W * i) / nx;
    const pz = -hz + (D * k) / nz;
    return v3(cx + px, y0 + height(px, pz), cz + pz);
  };
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const a = P(i, k);
      const bb = P(i + 1, k);
      const c = P(i + 1, k + 1);
      const d = P(i, k + 1);
      const shadeK = (k % 2 === 0) !== (i % 2 === 0) ? 0 : 0.12;
      b.color(tile.clone().lerp(tileDark, shadeK));
      b.quad(a, d, c, bb);
    }
  }
  // Bordure d'égout (bandeau vertical) et faîtage.
  b.color("#2c3332");
  for (let i = 0; i < nx; i++) {
    for (const k of [0, nz]) {
      const a = P(i, k);
      const c = P(i + 1, k);
      const sign = k === 0 ? 1 : -1;
      b.quad(a.clone().setY(a.y - 0.9), c.clone().setY(c.y - 0.9), c, a);
      if (sign < 0) b.quad(c.clone().setY(c.y - 0.9), a.clone().setY(a.y - 0.9), a, c);
    }
  }
  for (let k = 0; k < nz; k++) {
    for (const i of [0, nx]) {
      const a = P(i, k);
      const c = P(i, k + 1);
      b.quad(c.clone().setY(c.y - 0.9), a.clone().setY(a.y - 0.9), a, c);
      b.quad(a.clone().setY(a.y - 0.9), c.clone().setY(c.y - 0.9), c, a);
    }
  }
  b.color("#2a302f").beam(v3(cx - ridge, y0 + H + 0.55, cz), v3(cx + ridge, y0 + H + 0.55, cz), 1.0, 1.0);
  for (const s of [-1, 1]) b.color("#2a302f").box(cx + s * ridge, y0 + H + 1.6, cz, 1.2, 2.2, 0.8);
}

function lantern(b: MeshBuilder, x: number, z: number) {
  b.color("#b9b1a2");
  b.box(x, 0.3, z, 1.2, 0.6, 1.2);
  b.cylinder(x, 0.6, z, 0.25, 0.25, 1.4, 8);
  b.glow(1).color("#efd9b0").box(x, 2.3, z, 0.8, 0.8, 0.8);
  b.glow(0).color("#a9a192");
  b.cylinder(x, 2.7, z, 0.9, 0.1, 0.7, 8, { top: true });
}
