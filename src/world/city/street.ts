import * as THREE from "three";
import { MeshBuilder, v3 } from "../builder";
import { rng } from "../../core/math";
import { CROSS_STREETS, PARK, PLOT, TOWER_STREET, VENDING_CLEAR, type Road } from "./layout";
import type { SignAtlas, SignQuad } from "./signs";

/**
 * Le sol et le mobilier : chaussées, trottoirs, marquages (passages piétons,
 * « 止まれ »), poteaux électriques et leurs câbles (le geste le plus
 * tokyoïte du quartier), réverbères, miroirs de carrefour, feux, vélos.
 */

const ASPHALT = "#5b5e64";
const ASPHALT_LANE = "#64676c";
const SIDEWALK = "#c8c2b6";
const CURB = "#d9d4ca";
const PAINT = "#eeebe4";

export type StreetOut = {
  ground: THREE.BufferGeometry;
  props: THREE.BufferGeometry;
  wires: THREE.BufferGeometry;
  signs: SignQuad[];
  lamps: THREE.Vector3[];
};

export function buildStreets(roads: Road[], atlas: SignAtlas, detail: number): StreetOut {
  const g = new MeshBuilder(); // sol, marquages
  const p = new MeshBuilder(); // mobilier
  const w = new MeshBuilder(); // câbles
  const signs: SignQuad[] = [];
  const lamps: THREE.Vector3[] = [];
  const r = rng(77);
  const Y = 0.02;

  const flat = (x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.ColorRepresentation) => {
    g.color(color);
    g.quad(v3(x0, y, z1), v3(x1, y, z1), v3(x1, y, z0), v3(x0, y, z0));
  };

  // Terrain de la tour : dallage clair, bordures.
  flat(PLOT.x0, PLOT.z0, PLOT.x1, PLOT.z1, 0.03, "#d6cfc2");
  // Parc Shiba : pelouse, allées.
  flat(PARK.x0, PARK.z0, PARK.x1, PARK.z1, 0.03, "#8ea46c");
  flat(PARK.x0 + 10, -6, PARK.x1 - 10, 4, 0.05, "#d8ccb4");
  flat(150, PARK.z0 + 10, 160, PARK.z1 - 10, 0.05, "#d8ccb4");

  for (const rd of roads) {
    const along = rd.axis;
    const lane = rd.kind === "lane";
    const sw = rd.sidewalk;
    // Chaussée.
    if (along === "z") flat(rd.x0 + sw, rd.z0, rd.x1 - sw, rd.z1, Y, lane ? ASPHALT_LANE : ASPHALT);
    else flat(rd.x0, rd.z0 + sw, rd.x1, rd.z1 - sw, Y, lane ? ASPHALT_LANE : ASPHALT);
    // Trottoirs surélevés.
    if (sw > 0) {
      p.color(SIDEWALK);
      if (along === "z") {
        p.box(rd.x0 + sw / 2, 0.08, (rd.z0 + rd.z1) / 2, sw, 0.16, rd.z1 - rd.z0);
        p.box(rd.x1 - sw / 2, 0.08, (rd.z0 + rd.z1) / 2, sw, 0.16, rd.z1 - rd.z0);
        p.color(CURB);
        p.box(rd.x0 + sw - 0.1, 0.09, (rd.z0 + rd.z1) / 2, 0.2, 0.18, rd.z1 - rd.z0);
        p.box(rd.x1 - sw + 0.1, 0.09, (rd.z0 + rd.z1) / 2, 0.2, 0.18, rd.z1 - rd.z0);
      } else {
        p.box((rd.x0 + rd.x1) / 2, 0.08, rd.z0 + sw / 2, rd.x1 - rd.x0, 0.16, sw);
        p.box((rd.x0 + rd.x1) / 2, 0.08, rd.z1 - sw / 2, rd.x1 - rd.x0, 0.16, sw);
        p.color(CURB);
        p.box((rd.x0 + rd.x1) / 2, 0.09, rd.z0 + sw - 0.1, rd.x1 - rd.x0, 0.18, 0.2);
        p.box((rd.x0 + rd.x1) / 2, 0.09, rd.z1 - sw + 0.1, rd.x1 - rd.x0, 0.18, 0.2);
      }
    }
    // Marquages.
    g.color(PAINT);
    const my = 0.035;
    if (lane) {
      // Lignes de rive (couloirs piétons des petites rues).
      if (along === "z") {
        flat(rd.x0 + 0.75, rd.z0, rd.x0 + 0.9, rd.z1, my, PAINT);
        flat(rd.x1 - 0.9, rd.z0, rd.x1 - 0.75, rd.z1, my, PAINT);
      } else {
        flat(rd.x0, rd.z0 + 0.75, rd.x1, rd.z0 + 0.9, my, PAINT);
        flat(rd.x0, rd.z1 - 0.9, rd.x1, rd.z1 - 0.75, my, PAINT);
      }
    } else {
      // Axe : tirets blancs (route) ou ligne orange continue (avenue).
      const center = rd.kind === "avenue" ? "#e8a23a" : PAINT;
      if (along === "z") {
        const cx = (rd.x0 + rd.x1) / 2;
        if (rd.kind === "avenue") flat(cx - 0.12, rd.z0, cx + 0.12, rd.z1, my, center);
        else for (let z = rd.z0; z < rd.z1 - 3; z += 8) flat(cx - 0.08, z, cx + 0.08, z + 4, my, center);
      } else {
        const cz = (rd.z0 + rd.z1) / 2;
        if (rd.kind === "avenue") flat(rd.x0, cz - 0.12, rd.x1, cz + 0.12, my, center);
        else for (let x = rd.x0; x < rd.x1 - 3; x += 8) flat(x, cz - 0.08, x + 4, cz + 0.08, my, center);
      }
    }
  }

  // Passages piétons : sur la rue d'ouverture à chaque transversale, et devant la tour.
  const zebraX = (cx: number, z0: number, z1: number, width: number) => {
    // Bandes parallèles à z (on traverse selon x… ici on traverse la transversale selon z).
    for (let x = cx - width / 2; x < cx + width / 2 - 0.3; x += 0.9) flat(x, z0, x + 0.45, z1, 0.04, PAINT);
  };
  const zebraZ = (cz: number, x0: number, x1: number, width: number) => {
    for (let z = cz - width / 2; z < cz + width / 2 - 0.3; z += 0.9) flat(x0, z, x1, z + 0.45, 0.04, PAINT);
  };
  for (const c of CROSS_STREETS) {
    // Traversée de la transversale, de part et d'autre de la rue d'ouverture.
    zebraX(TOWER_STREET.x0 - 3.2, c.z - c.w / 2 + 0.6, c.z + c.w / 2 - 0.6, 3.6);
    zebraX(TOWER_STREET.x1 + 3.2, c.z - c.w / 2 + 0.6, c.z + c.w / 2 - 0.6, 3.6);
    // Traversée de la rue d'ouverture.
    zebraZ(c.z + c.w / 2 + 2.6, TOWER_STREET.x0 + 0.4, TOWER_STREET.x1 - 0.4, 3.2);
    zebraZ(c.z - c.w / 2 - 2.6, TOWER_STREET.x0 + 0.4, TOWER_STREET.x1 - 0.4, 3.2);
    // Ligne d'arrêt + « 止まれ » dans la voie qui monte vers la tour (on roule à gauche).
    const zs = c.z + c.w / 2 + 4.7;
    flat(TOWER_STREET.x0 + 0.9, zs, -0.1, zs + 0.45, 0.04, PAINT);
    const a = v3(TOWER_STREET.x0 + 1.2, 0.042, zs + 5.6);
    const b = v3(-0.4, 0.042, zs + 5.6);
    signs.push({ corners: [a, b, v3(b.x, 0.042, zs + 1.1), v3(a.x, 0.042, zs + 1.1)], uv: atlas.stop, lit: 0 });
  }
  // Grand passage devant la tour (boulevard sud).
  zebraZ(65, -9, 9, 9);
  zebraX(0, 58.4, 71.6, 14);

  // Poteaux électriques et câbles : rue d'ouverture et parallèles.
  const poleLine = (x: number, z0: number, z1: number, side: number) => {
    const poles: THREE.Vector3[] = [];
    for (let z = z0; z < z1; z += r.range(26, 32)) {
      if (CROSS_STREETS.some((c) => Math.abs(z - c.z) < c.w / 2 + 2)) continue;
      // Devant les distributeurs, le trottoir reste dégagé.
      if (x < 0 && x > TOWER_STREET.x0 - 1 && z > VENDING_CLEAR.z0 && z < VENDING_CLEAR.z1) continue;
      poles.push(v3(x, 0, z));
    }
    poles.forEach((base, i) => {
      const h = 10.5;
      p.color("#9b9890").cylinder(base.x, 0, base.z, 0.2, 0.15, h, 8);
      // Traverses.
      p.color("#6f6d68");
      p.box(base.x, h - 0.7, base.z, 1.8, 0.12, 0.12);
      p.box(base.x, h - 1.6, base.z, 1.3, 0.1, 0.1);
      // Transformateur un poteau sur trois.
      if (i % 3 === 1) {
        p.color("#a7a59e").cylinder(base.x - side * 0.5, h - 3.6, base.z, 0.32, 0.32, 1.1, 10, { top: true });
        p.color("#8f8d86").cylinder(base.x - side * 0.5, h - 4.9, base.z, 0.28, 0.28, 1.0, 10, { top: true });
      }
      // Bras de réverbère vers la chaussée.
      p.color("#7d7b76").beam(v3(base.x, 6.2, base.z), v3(base.x - side * 1.6, 6.5, base.z), 0.08, 0.08);
      p.color("#efece4").box(base.x - side * 1.7, 6.4, base.z, 0.55, 0.12, 0.25);
      lamps.push(v3(base.x - side * 1.7, 6.3, base.z));
      // Panneau d'adresse bleu sur le poteau (détail réel des rues de Tokyo).
      if (i % 2 === 0) p.color("#2d5a8c").box(base.x - side * 0.21, 2.6, base.z, 0.03, 0.9, 0.28);
    });
    // Câbles en chaînette entre poteaux consécutifs.
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      for (const [dy, dx, sag] of [
        [10.4, -0.8, 0.45],
        [10.4, 0.8, 0.45],
        [10.4, 0.0, 0.5],
        [8.9, -0.6, 0.6],
        [8.9, 0.6, 0.55],
        [7.4, 0.15, 0.8],
      ] as [number, number, number][]) {
        catenary(w, v3(a.x + dx, dy, a.z), v3(b.x + dx, dy, b.z), sag, detail > 0.6 ? 10 : 6);
      }
    }
    return poles;
  };
  const westPoles = poleLine(TOWER_STREET.x0 + 0.35, 78, 515, -1);
  poleLine(TOWER_STREET.x1 - 0.35, 92, 515, 1);
  poleLine(-60.9, 80, 550, -1);
  poleLine(60.9, 170, 550, 1);
  // Quelques câbles qui traversent la rue (au-dessus du plan d'ouverture).
  for (let i = 1; i < westPoles.length; i += 2) {
    const a = westPoles[i];
    catenary(w, v3(a.x, 9.6, a.z), v3(TOWER_STREET.x1 - 0.35, 9.4, a.z + r.range(-6, 6)), 0.5, 8);
  }

  // Réverbères du boulevard et des avenues.
  for (const rd of roads) {
    if (rd.kind === "lane") continue;
    const along = rd.axis;
    const len = along === "z" ? rd.z1 - rd.z0 : rd.x1 - rd.x0;
    const step = 32;
    if (len > 1300 || Math.abs(along === "z" ? rd.x0 : rd.z0) > 400) continue;
    for (let t = 12; t < len - 6; t += step) {
      for (const s of [0, 1]) {
        const x = along === "z" ? (s ? rd.x1 - 0.6 : rd.x0 + 0.6) : rd.x0 + t;
        const z = along === "z" ? rd.z0 + t : s ? rd.z1 - 0.6 : rd.z0 + 0.6;
        if (Math.abs(x) < 72 && Math.abs(z) < 72 && rd.sidewalk === 0) continue;
        p.color("#5f6266").cylinder(x, 0, z, 0.1, 0.08, 7.5, 6);
        const dir = along === "z" ? (s ? -1 : 1) : 0;
        const dirz = along === "x" ? (s ? -1 : 1) : 0;
        p.beam(v3(x, 7.4, z), v3(x + dir * 1.4, 7.6, z + dirz * 1.4), 0.07, 0.07);
        p.color("#f3efe6").box(x + dir * 1.5, 7.5, z + dirz * 1.5, 0.5, 0.14, 0.5);
        lamps.push(v3(x + dir * 1.5, 7.4, z + dirz * 1.5));
      }
    }
  }

  // Miroirs de carrefour (poteau orange, miroir rond) sur la rue d'ouverture.
  for (const c of CROSS_STREETS) {
    const x = TOWER_STREET.x1 + 0.5;
    const z = c.z + c.w / 2 + 0.6;
    p.color("#e8742a").cylinder(x, 0, z, 0.05, 0.05, 2.8, 6);
    p.color("#e8742a").cylinder(x - 0.05, 2.75, z, 0.42, 0.42, 0.08, 16, { top: true }, 0);
    const mirror = new THREE.CircleGeometry(0.38, 18);
    mirror.rotateY(-Math.PI / 2 + 0.6);
    p.color("#c9d6de").geometry(mirror, new THREE.Matrix4().makeTranslation(x - 0.11, 3.15, z));
  }

  // Feux tricolores à l'entrée du boulevard (vers la tour).
  for (const [x, z, rot] of [
    [-6.2, 73.5, 0],
    [6.2, 73.5, 0],
  ] as [number, number, number][]) {
    p.color("#6c6f73").cylinder(x, 0, z, 0.1, 0.1, 5.2, 8);
    p.beam(v3(x, 5.1, z), v3(x * 0.2, 5.3, z), 0.1, 0.1);
    p.color("#3e4246").box(x * 0.2, 5.3, z, 1.3, 0.42, 0.3, rot);
    p.glow(1).color("#3fbf7a").box(x * 0.2 + 0.4, 5.3, z + 0.16, 0.26, 0.26, 0.04);
    p.glow(0);
  }

  // Vélos garés le long de la rue d'ouverture (silhouettes simples mais lisibles).
  for (let i = 0; i < Math.round(14 * detail); i++) {
    const side = r.chance(0.5) ? -1 : 1;
    const x = side * (TOWER_STREET.x1 - 0.55);
    const z = r.range(90, 500);
    if (CROSS_STREETS.some((c) => Math.abs(z - c.z) < c.w / 2 + 3)) continue;
    if (side < 0 && z > VENDING_CLEAR.z0 && z < VENDING_CLEAR.z1) continue;
    bicycle(p, x, z, r.pick(["#2f5f8c", "#b33b2e", "#e7e2d6", "#2f2f2f", "#5f8a4f"]));
  }

  return { ground: g.build(), props: p.build(), wires: w.build(), signs, lamps };
}

function catenary(b: MeshBuilder, a: THREE.Vector3, c: THREE.Vector3, sag: number, segs: number) {
  b.color("#2a2a2c");
  let prev = a.clone();
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const pt = a.clone().lerp(c, t);
    pt.y -= sag * 4 * t * (1 - t);
    b.beam(prev, pt, 0.045, 0.045);
    prev = pt;
  }
}

function bicycle(b: MeshBuilder, x: number, z: number, color: string) {
  b.color("#2b2b2b");
  for (const dz of [-0.55, 0.55]) {
    const wheel = new THREE.TorusGeometry(0.33, 0.035, 5, 14);
    wheel.rotateY(Math.PI / 2);
    b.geometry(wheel, new THREE.Matrix4().makeTranslation(x, 0.35, z + dz));
  }
  b.color(color);
  b.beam(v3(x, 0.35, z - 0.55), v3(x, 0.75, z - 0.05), 0.05, 0.05);
  b.beam(v3(x, 0.75, z - 0.05), v3(x, 0.35, z + 0.55), 0.05, 0.05);
  b.beam(v3(x, 0.75, z - 0.05), v3(x, 0.8, z + 0.4), 0.05, 0.05);
  b.color("#2b2b2b").box(x, 0.86, z - 0.12, 0.12, 0.05, 0.22);
  b.beam(v3(x - 0.25, 0.98, z + 0.42), v3(x + 0.25, 0.98, z + 0.42), 0.035, 0.035);
  // Panier avant (les « mamachari »).
  b.color("#9a968e").box(x, 0.86, z + 0.62, 0.32, 0.22, 0.26);
}
