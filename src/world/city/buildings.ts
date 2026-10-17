import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { rng, type Rng } from "../../core/math";
import { VENDING, VENDING_CLEAR, type Lot, type Facing } from "./layout";
import { signGeometry, type SignAtlas, type SignQuad, type UvRect } from "./signs";

/**
 * Bâtiments proches : façades dessinées (pas des cubes). Chaque style a ses
 * gestes : balcons et climatiseurs des « mansions », bandeaux vitrés des
 * bureaux, enseignes verticales des immeubles mixtes, toitures de tuiles
 * des maisons anciennes. Fenêtres en géométrie ; `glow` porte le seuil
 * d'allumage de chaque fenêtre (la ville s'allume une fenêtre à la fois).
 */

const FACADES: Record<string, string[]> = {
  mansion: ["#e9e3d6", "#ddd5c6", "#efe9df", "#d4cbbb", "#e6dccb", "#cfd3d1"],
  zakkyo: ["#d9d2c5", "#c9c3b8", "#e2d8c8", "#bfb8ad", "#d6c7b4"],
  office: ["#c6cbcf", "#d5d7d6", "#b9bfc4", "#dcd8d0"],
  house: ["#ece5d8", "#d9cdb8", "#f1ece2"],
  old: ["#6a5644", "#5b4a3c", "#7a6450"],
  shop: ["#e4ddd0", "#d8cfbf", "#efe8dc"],
  konbini: ["#f2f2ee"],
};
const ROOF = ["#8d8a86", "#9c978f", "#7e7b78", "#a6a29a"];
const AWNING = ["#2f5f4f", "#8a2f2a", "#2d4a6b", "#c0883a", "#5b5f63", "#7a3b52", "#efe7d6"];

type Out = {
  body: MeshBuilder;
  glass: MeshBuilder;
  /** Vitrines : UV en mètres (u le long, v en hauteur), shader d'intérieur. */
  shop: MeshBuilder;
  signs: SignQuad[];
};


/** Repère d'une façade : origine au coin bas-gauche (vue de la rue), u le long, n vers la rue. */
function frame(l: Lot, facing: Facing) {
  switch (facing) {
    case "e":
      return { o: v3(l.x1, 0, l.z1), u: v3(0, 0, -1), n: v3(1, 0, 0), width: l.z1 - l.z0, depth: l.x1 - l.x0 };
    case "w":
      return { o: v3(l.x0, 0, l.z0), u: v3(0, 0, 1), n: v3(-1, 0, 0), width: l.z1 - l.z0, depth: l.x1 - l.x0 };
    case "n":
      return { o: v3(l.x1, 0, l.z0), u: v3(-1, 0, 0), n: v3(0, 0, -1), width: l.x1 - l.x0, depth: l.z1 - l.z0 };
    case "s":
      return { o: v3(l.x0, 0, l.z1), u: v3(1, 0, 0), n: v3(0, 0, 1), width: l.x1 - l.x0, depth: l.z1 - l.z0 };
  }
}

const SIDE_OF: Record<Facing, Facing[]> = { e: ["n", "s"], w: ["n", "s"], n: ["e", "w"], s: ["e", "w"] };

/** Seuil d'allumage d'une fenêtre : 0 = jamais ; (0, .5] chaud ; (.5, 1) froid. */
function windowGlow(r: Rng, office: boolean) {
  if (r.chance(office ? 0.35 : 0.42)) return 0;
  const t = r.range(0.06, 0.98);
  return office && r.chance(0.6) ? 0.5 + t * 0.49 : t * 0.5;
}

export function buildNearBuildings(lots: Lot[], atlas: SignAtlas, detail: number) {
  const out: Out = { body: new MeshBuilder(), glass: new MeshBuilder(), shop: new MeshBuilder(), signs: [] };
  for (const lot of lots) building(out, lot, atlas, detail);
  return {
    body: out.body.build(),
    glass: out.glass.build(),
    shop: out.shop.build(true),
    signs: signGeometry(out.signs),
  };
}

function building(out: Out, lot: Lot, atlas: SignAtlas, detail: number) {
  const r = rng(lot.seed);
  const { body, glass } = out;
  const f = frame(lot, lot.facing);
  const style = lot.style;
  const groundH = lot.shop ? 4.2 : 3.2;
  const floorH = style === "office" ? 3.7 : style === "old" || style === "house" ? 2.9 : 3.05;
  const height = style === "konbini" ? 4.6 : groundH + (lot.floors - 1) * floorH + 0.6;
  const facade = r.pick(FACADES[style]);
  const cx = (lot.x0 + lot.x1) / 2;
  const cz = (lot.z0 + lot.z1) / 2;
  const sx = lot.x1 - lot.x0;
  const sz = lot.z1 - lot.z0;

  // Volume principal (léger retrait des étages sur certains immeubles).
  body.color(facade);
  if (style === "old" || style === "house") {
    body.box(cx, height / 2, cz, sx, height, sz);
    pitchedRoof(body, lot, height, style === "old" ? "#4a4b4f" : r.pick(["#5d6266", "#7b5b4a", "#4f5a63"]));
  } else {
    body.box(cx, height / 2, cz, sx, height, sz, 0, { top: false });
    // Toit : dalle, acrotère.
    body.color(r.pick(ROOF)).box(cx, height - 0.05, cz, sx - 0.5, 0.1, sz - 0.5);
    body.color(shade(facade, 0.93));
    const pt = 0.25;
    body.box(cx, height + 0.45, lot.z0 + pt / 2, sx, 0.9, pt);
    body.box(cx, height + 0.45, lot.z1 - pt / 2, sx, 0.9, pt);
    body.box(lot.x0 + pt / 2, height + 0.45, cz, pt, 0.9, sz);
    body.box(lot.x1 - pt / 2, height + 0.45, cz, pt, 0.9, sz);
    roofProps(body, r, lot, height, detail);
  }
  // Soubassement plus sombre (ombre de contact peinte).
  body.color(shade(facade, 0.72)).box(cx, 0.25, cz, sx + 0.06, 0.5, sz + 0.06, 0, { top: false });

  // Façade principale.
  facadeWindows(out, r, lot, f, style, groundH, floorH, height, true, detail);
  // Façades latérales visibles (fenêtres plus rares).
  if (detail > 0.5) for (const side of SIDE_OF[lot.facing]) facadeWindows(out, r, lot, frame(lot, side), style, groundH, floorH, height, false, detail);

  // Rez-de-chaussée commerçant.
  if (lot.shop) shopFront(out, r, lot, f, style, groundH, atlas);
  else if (style !== "old" && style !== "house") entrance(body, glass, r, f);

  // Enseignes verticales (immeubles mixtes).
  if (style === "zakkyo" && lot.floors >= 4 && r.chance(0.8)) {
    const along = r.chance(0.5) ? 0.6 : f.width - 0.6;
    const count = Math.min(lot.floors - 1, r.int(2, 4));
    const base = f.o.clone().addScaledVector(f.u, along).addScaledVector(f.n, 0.75);
    for (let k = 0; k < count; k++) {
      const y0 = groundH + 0.4 + k * 2.6;
      const uv = atlas.vertical[(lot.seed + k * 7) % atlas.vertical.length];
      verticalSign(out, body, base, f, y0, 0.62, 2.35, uv);
    }
  }
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c;
}

function pitchedRoof(b: MeshBuilder, l: Lot, h: number, color: string) {
  const alongX = l.x1 - l.x0 > l.z1 - l.z0;
  const over = 0.45;
  const x0 = l.x0 - over;
  const x1 = l.x1 + over;
  const z0 = l.z0 - over;
  const z1 = l.z1 + over;
  const rise = Math.min(l.x1 - l.x0, l.z1 - l.z0) * 0.32;
  b.color(color);
  if (alongX) {
    const zm = (z0 + z1) / 2;
    b.quad(v3(x0, h, z1), v3(x1, h, z1), v3(x1, h + rise, zm), v3(x0, h + rise, zm));
    b.quad(v3(x1, h, z0), v3(x0, h, z0), v3(x0, h + rise, zm), v3(x1, h + rise, zm));
    b.color(shade(color, 0.85));
    b.tri(v3(x0 + over, h, z0 + over), v3(x0 + over, h, z1 - over), v3(x0 + over, h + rise, zm));
    b.tri(v3(x1 - over, h, z1 - over), v3(x1 - over, h, z0 + over), v3(x1 - over, h + rise, zm));
    b.color("#3c3d40").beam(v3(x0, h + rise + 0.05, zm), v3(x1, h + rise + 0.05, zm), 0.35, 0.25);
  } else {
    const xm = (x0 + x1) / 2;
    b.quad(v3(x1, h, z1), v3(x1, h, z0), v3(xm, h + rise, z0), v3(xm, h + rise, z1));
    b.quad(v3(x0, h, z0), v3(x0, h, z1), v3(xm, h + rise, z1), v3(xm, h + rise, z0));
    b.color(shade(color, 0.85));
    b.tri(v3(x0 + over, h, z1 - over), v3(x1 - over, h, z1 - over), v3(xm, h + rise, z1 - over));
    b.tri(v3(x1 - over, h, z0 + over), v3(x0 + over, h, z0 + over), v3(xm, h + rise, z0 + over));
    b.color("#3c3d40").beam(v3(xm, h + rise + 0.05, z0), v3(xm, h + rise + 0.05, z1), 0.35, 0.25);
  }
}

function roofProps(b: MeshBuilder, r: Rng, l: Lot, h: number, detail: number) {
  const sx = l.x1 - l.x0;
  const sz = l.z1 - l.z0;
  const px = (t: number) => l.x0 + 1.2 + (sx - 2.4) * t;
  const pz = (t: number) => l.z0 + 1.2 + (sz - 2.4) * t;
  // Réservoir d'eau sur pieds (le geste des toits de Tokyo).
  if (r.chance(0.55)) {
    const x = px(r.range(0.15, 0.85));
    const z = pz(r.range(0.15, 0.85));
    b.color("#8e8a84");
    for (const [dx, dz] of [
      [-0.7, -0.7],
      [0.7, -0.7],
      [0.7, 0.7],
      [-0.7, 0.7],
    ])
      b.box(x + dx, h + 0.8, z + dz, 0.14, 1.6, 0.14);
    b.color(r.pick(["#e9e6df", "#c9d2d6", "#9fb0b5"]));
    b.cylinder(x, h + 1.6, z, 1.15, 1.15, 1.9, 12, { top: true });
  }
  // Locaux techniques / cage d'escalier.
  if (r.chance(0.6)) {
    b.color(shade("#d9d3c8", r.range(0.85, 1)));
    b.box(px(r.range(0.1, 0.4)), h + 1.3, pz(r.range(0.2, 0.8)), Math.min(4, sx * 0.35), 2.6, Math.min(3.6, sz * 0.3));
  }
  // Groupes de climatisation.
  const n = Math.round(r.int(1, 5) * detail);
  b.color("#d3d1cb");
  for (let i = 0; i < n; i++) b.box(px(r.next()), h + 0.45, pz(r.next()), 1.0, 0.9, 0.55, r.chance(0.5) ? 0 : Math.PI / 2);
  // Antenne ou garde-corps.
  if (r.chance(0.35)) {
    b.color("#6b6b6b");
    const x = px(r.next());
    const z = pz(r.next());
    b.beam(v3(x, h, z), v3(x, h + 4.5, z), 0.08, 0.08);
    b.beam(v3(x - 0.8, h + 4, z), v3(x + 0.8, h + 4, z), 0.05, 0.05);
  }
}

function facadeWindows(
  out: Out,
  r: Rng,
  _lot: Lot,
  f: ReturnType<typeof frame>,
  style: string,
  groundH: number,
  floorH: number,
  height: number,
  front: boolean,
  detail: number,
) {
  const { body, glass } = out;
  if (style === "konbini") return;
  const office = style === "office";
  const width = f.width;
  const bays = Math.max(1, Math.floor((width - 1.2) / (office ? 2.4 : style === "old" ? 2.2 : 2.9)));
  const bayW = (width - 1.2) / bays;
  const floors = Math.max(1, Math.round((height - groundH - 0.6) / floorH));
  const ribbon = office && r.chance(0.55);
  const balconies = style === "mansion" && front && detail > 0.3;
  const sideRate = front ? 1 : 0.45;
  for (let fl = 0; fl < floors; fl++) {
    const y0 = groundH + fl * floorH;
    const winH = office ? floorH * 0.62 : floorH * 0.52;
    const sill = y0 + (office ? floorH * 0.2 : floorH * 0.3);
    if (ribbon) {
      // Bandeau vitré continu.
      const a = f.o.clone().addScaledVector(f.u, 0.6).addScaledVector(f.n, 0.04);
      const b2 = f.o.clone().addScaledVector(f.u, width - 0.6).addScaledVector(f.n, 0.04);
      glass.glow(windowGlow(r, true)).color(r.pick(["#3c4b57", "#4a5a66", "#33414c"]));
      glass.quad(a.clone().setY(sill), b2.clone().setY(sill), b2.clone().setY(sill + winH), a.clone().setY(sill + winH));
      // Meneaux.
      body.color("#d6d8d8");
      for (let k = 0; k <= bays; k++) {
        const p = f.o.clone().addScaledVector(f.u, 0.6 + k * bayW).addScaledVector(f.n, 0.06);
        body.box(p.x, sill + winH / 2, p.z, 0.12, winH, 0.12);
      }
      continue;
    }
    for (let k = 0; k < bays; k++) {
      if (!r.chance(sideRate)) continue;
      const cu = 0.6 + (k + 0.5) * bayW;
      const ww = bayW * (style === "old" ? 0.7 : office ? 0.78 : 0.56);
      const c = f.o.clone().addScaledVector(f.u, cu);
      const a = c.clone().addScaledVector(f.u, -ww / 2).addScaledVector(f.n, 0.03);
      const b2 = c.clone().addScaledVector(f.u, ww / 2).addScaledVector(f.n, 0.03);
      glass.glow(windowGlow(r, office)).color(r.pick(["#3a4752", "#45535e", "#2f3b45", "#4d5a62"]));
      glass.quad(a.clone().setY(sill), b2.clone().setY(sill), b2.clone().setY(sill + winH), a.clone().setY(sill + winH));
      // Encadrement et appui.
      body.color(shade("#ffffff", 0.88));
      const s = c.clone().addScaledVector(f.n, 0.12);
      body.box(s.x, sill - 0.06, s.z, Math.abs(f.u.x) * (ww + 0.25) + Math.abs(f.n.x) * 0.24, 0.12, Math.abs(f.u.z) * (ww + 0.25) + Math.abs(f.n.z) * 0.24);
      if (style === "old") {
        // Volets de bois.
        body.color("#4a3a2c");
        const sh = c.clone().addScaledVector(f.n, 0.05).addScaledVector(f.u, ww / 2 + 0.25);
        body.box(sh.x, sill + winH / 2, sh.z, Math.abs(f.u.x) * 0.45 + Math.abs(f.n.x) * 0.06, winH, Math.abs(f.u.z) * 0.45 + Math.abs(f.n.z) * 0.06);
      }
      // Climatiseur accroché (quelques-uns).
      if (!balconies && detail > 0.5 && r.chance(0.18)) {
        const ac = c.clone().addScaledVector(f.u, ww / 2 + 0.55).addScaledVector(f.n, 0.3);
        body.color("#e2e0da").box(ac.x, sill + 0.1, ac.z, Math.abs(f.u.x) * 0.8 + Math.abs(f.n.x) * 0.3, 0.6, Math.abs(f.u.z) * 0.8 + Math.abs(f.n.z) * 0.3);
      }
    }
    if (balconies) {
      // Dalle de balcon + garde-corps plein (verre dépoli), climatiseur.
      const depth = 1.1;
      const a = f.o.clone().addScaledVector(f.u, 0.3);
      const mid = a.clone().addScaledVector(f.u, (width - 0.6) / 2).addScaledVector(f.n, depth / 2);
      const L = width - 0.6;
      const sxB = Math.abs(f.u.x) * L + Math.abs(f.n.x) * depth;
      const szB = Math.abs(f.u.z) * L + Math.abs(f.n.z) * depth;
      body.color(shade("#ffffff", 0.9)).box(mid.x, y0 + 0.08, mid.z, sxB, 0.16, szB, 0, { bottom: true });
      const rail = mid.clone().addScaledVector(f.n, depth / 2 - 0.05);
      const sxR = Math.abs(f.u.x) * L + Math.abs(f.n.x) * 0.06;
      const szR = Math.abs(f.u.z) * L + Math.abs(f.n.z) * 0.06;
      body.color(r.pick(["#c9ced1", "#e4e1da", "#b9c2c6"])).box(rail.x, y0 + 0.65, rail.z, sxR, 0.95, szR);
      if (detail > 0.6 && r.chance(0.7)) {
        const ac = a.clone().addScaledVector(f.u, r.range(0.8, L - 0.8)).addScaledVector(f.n, 0.55);
        body.color("#ecebe6").box(ac.x, y0 + 0.5, ac.z, 0.8, 0.6, 0.8);
      }
    }
  }
}

function entrance(body: MeshBuilder, glass: MeshBuilder, r: Rng, f: ReturnType<typeof frame>) {
  const u = r.range(1.4, Math.max(1.5, f.width - 1.4));
  const c = f.o.clone().addScaledVector(f.u, u);
  const a = c.clone().addScaledVector(f.u, -0.8).addScaledVector(f.n, 0.03);
  const b = c.clone().addScaledVector(f.u, 0.8).addScaledVector(f.n, 0.03);
  glass.glow(1.0).color("#c9a776");
  glass.quad(a.clone().setY(0.5), b.clone().setY(0.5), b.clone().setY(2.6), a.clone().setY(2.6));
  const can = c.clone().addScaledVector(f.n, 0.6);
  body.color("#d8d4cc").box(can.x, 2.85, can.z, Math.abs(f.u.x) * 2.2 + Math.abs(f.n.x) * 1.2, 0.14, Math.abs(f.u.z) * 2.2 + Math.abs(f.n.z) * 1.2);
}

function shopFront(out: Out, r: Rng, lot: Lot, f: ReturnType<typeof frame>, style: string, groundH: number, atlas: SignAtlas) {
  const { body, glass } = out;
  const w = f.width;
  // Vitrine (s'allume la nuit, un peu le jour).
  const a = f.o.clone().addScaledVector(f.u, 0.5).addScaledVector(f.n, 0.05);
  const b = f.o.clone().addScaledVector(f.u, w - 0.5).addScaledVector(f.n, 0.05);
  // Couleur = teinte de l'intérieur (lumière, mur du fond) ; le shader dessine le reste.
  const warm = style === "konbini" ? "#eef3f2" : r.pick(["#f0c98e", "#e8b77a", "#f3d6a8", "#e9dcc0", "#d9c6a8", "#c9d6d2"]);
  const hShop = groundH - 1.1 - 0.45;
  out.shop.color(warm).glow(r.next());
  out.shop.quad(a.clone().setY(0.45), b.clone().setY(0.45), b.clone().setY(groundH - 1.1), a.clone().setY(groundH - 1.1), true, w - 1, hShop);
  out.shop.glow(0);
  void glass;
  // Montants.
  body.color("#3a3836");
  const n = Math.max(2, Math.round(w / 2.4));
  for (let k = 0; k <= n; k++) {
    const p = f.o.clone().addScaledVector(f.u, 0.5 + ((w - 1) * k) / n).addScaledVector(f.n, 0.08);
    body.box(p.x, (groundH - 0.65) / 2 + 0.2, p.z, 0.1, groundH - 0.65, 0.1);
  }
  // Bandeau d'enseigne.
  const signU0 = 0.7;
  const signU1 = w - 0.7;
  const sy0 = groundH - 1.05;
  const sy1 = groundH - 0.1;
  const p0 = f.o.clone().addScaledVector(f.u, signU0).addScaledVector(f.n, 0.12);
  const p1 = f.o.clone().addScaledVector(f.u, signU1).addScaledVector(f.n, 0.12);
  // Choisit une enseigne au ratio proche (4:1) : on centre une portion de la largeur.
  const signW = Math.min(signU1 - signU0, (sy1 - sy0) * 4);
  const mid = (signU0 + signU1) / 2;
  const q0 = f.o.clone().addScaledVector(f.u, mid - signW / 2).addScaledVector(f.n, 0.14);
  const q1 = f.o.clone().addScaledVector(f.u, mid + signW / 2).addScaledVector(f.n, 0.14);
  body.color("#2c2b2a");
  body.quad(p0.clone().setY(sy0), p1.clone().setY(sy0), p1.clone().setY(sy1), p0.clone().setY(sy1));
  const index = style === "konbini" ? 19 : (lot.seed >>> 3) % 20;
  out.signs.push({
    corners: [q0.clone().setY(sy0 + 0.06), q1.clone().setY(sy0 + 0.06), q1.clone().setY(sy1 - 0.06), q0.clone().setY(sy1 - 0.06)],
    uv: atlas.horizontal[index],
    lit: 1,
  });
  // Auvent incliné (sauf konbini).
  if (style !== "konbini" && r.chance(0.7)) {
    const depth = r.range(0.9, 1.5);
    const top = groundH - 1.15;
    const ca = f.o.clone().addScaledVector(f.u, 0.6);
    const cb = f.o.clone().addScaledVector(f.u, w - 0.6);
    const col = r.pick(AWNING);
    body.color(col);
    body.quad(cb.clone().addScaledVector(f.n, 0.1).setY(top), ca.clone().addScaledVector(f.n, 0.1).setY(top), ca.clone().addScaledVector(f.n, depth).setY(top - 0.55), cb.clone().addScaledVector(f.n, depth).setY(top - 0.55));
    body.quad(ca.clone().addScaledVector(f.n, 0.1).setY(top), cb.clone().addScaledVector(f.n, 0.1).setY(top), cb.clone().addScaledVector(f.n, depth).setY(top - 0.55), ca.clone().addScaledVector(f.n, depth).setY(top - 0.55));
    body.color(shade(col, 0.8));
    body.quad(ca.clone().addScaledVector(f.n, depth).setY(top - 0.55), cb.clone().addScaledVector(f.n, depth).setY(top - 0.55), cb.clone().addScaledVector(f.n, depth).setY(top - 0.85), ca.clone().addScaledVector(f.n, depth).setY(top - 0.85));
  }
  // Noren (rideau d'entrée) pour les restaurants.
  if (index <= 2 || index === 12 || index === 13 || index === 16) {
    const c = f.o.clone().addScaledVector(f.u, w * 0.35).addScaledVector(f.n, 0.22);
    body.color(index === 0 ? "#2b2a3a" : "#33405a");
    for (let k = 0; k < 3; k++) {
      const p = c.clone().addScaledVector(f.u, (k - 1) * 0.42);
      body.box(p.x, groundH - 1.6, p.z, Math.abs(f.u.x) * 0.38 + Math.abs(f.n.x) * 0.02, 0.9, Math.abs(f.u.z) * 0.38 + Math.abs(f.n.z) * 0.02);
    }
  }
  // Petites présences devant : plantes en pot, vélo, panneau. Rien devant
  // les distributeurs (les tirages aléatoires restent les mêmes ailleurs).
  const free = (p: THREE.Vector3) => !(Math.abs(p.x - VENDING.x) < 2.5 && p.z > VENDING_CLEAR.z0 && p.z < VENDING_CLEAR.z1);
  if (r.chance(0.6)) {
    const p = f.o.clone().addScaledVector(f.u, r.range(0.6, w - 0.6)).addScaledVector(f.n, 0.5);
    const leaf = r.pick(["#5f8a4f", "#6f9a5a", "#4f7a48"]);
    if (free(p)) {
      body.color("#8a6a52").cylinder(p.x, 0, p.z, 0.22, 0.28, 0.45, 8);
      body.color(leaf).geometry(new THREE.IcosahedronGeometry(0.42, 1), new THREE.Matrix4().makeTranslation(p.x, 0.75, p.z));
    }
  }
  if (r.chance(0.35)) {
    const p = f.o.clone().addScaledVector(f.u, r.range(0.8, w - 0.8)).addScaledVector(f.n, 0.7);
    if (free(p)) body.color("#f4f1ea").box(p.x, 0.5, p.z, Math.abs(f.u.x) * 0.5 + 0.08, 1.0, Math.abs(f.u.z) * 0.5 + 0.08);
  }
}

function verticalSign(out: Out, body: MeshBuilder, base: THREE.Vector3, f: ReturnType<typeof frame>, y0: number, w: number, h: number, uv: UvRect) {
  // Caisson perpendiculaire à la façade, lisible depuis la rue (deux faces).
  const c = base.clone();
  const t = 0.24;
  body.color("#2c2b2a");
  const sx = Math.abs(f.n.x) * w + Math.abs(f.u.x) * t;
  const sz = Math.abs(f.n.z) * w + Math.abs(f.u.z) * t;
  body.box(c.x, y0 + h / 2, c.z, sx, h, sz);
  const half = w / 2 - 0.04;
  for (const side of [1, -1]) {
    const o = c.clone().addScaledVector(f.u, (side * t) / 2 + side * 0.005);
    const a = o.clone().addScaledVector(f.n, -half * side);
    const b = o.clone().addScaledVector(f.n, half * side);
    out.signs.push({ corners: [a.clone().setY(y0 + 0.05), b.clone().setY(y0 + 0.05), b.clone().setY(y0 + h - 0.05), a.clone().setY(y0 + h - 0.05)], uv, lit: 1 });
  }
}

