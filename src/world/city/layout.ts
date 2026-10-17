import { rng, type Rng } from "../../core/math";

/**
 * Le plan du quartier. TypeScript pur (testable) : rues, îlots, lots,
 * points remarquables. Nord = −z, est = +x. La tour est en (0, 0).
 *
 * Choix de level design : une rue étroite plein sud mène à la tour (le plan
 * d'ouverture), des rues transversales rythment la montée, le parc Shiba et
 * le temple Zōjō-ji à l'est, une voie express surélevée à l'ouest, des
 * grappes de tours au loin (Toranomon, Shiodome, Roppongi, Azabudai).
 */

export type Rect = { x0: number; x1: number; z0: number; z1: number };
export type RoadKind = "lane" | "road" | "avenue";
export type Road = Rect & { kind: RoadKind; axis: "x" | "z"; sidewalk: number };

export type Facing = "n" | "s" | "e" | "w";
export type Style = "mansion" | "zakkyo" | "office" | "house" | "shop" | "konbini" | "old";

export type Lot = Rect & {
  facing: Facing;
  floors: number;
  style: Style;
  seed: number;
  /** Détaillé (géométrie complète) ou simplifié (instancié). */
  near: boolean;
  shop: boolean;
};

export const PLOT: Rect = { x0: -58, x1: 58, z0: -58, z1: 58 };

/** La rue d'ouverture (plein sud). */
export const TOWER_STREET = { x0: -4.6, x1: 4.6, z0: 70, z1: 520 };
export const CROSS_STREETS = [
  { z: 170, w: 10 },
  { z: 270, w: 8.5 },
  { z: 380, w: 11 },
  { z: 470, w: 9 },
];
export const PARK: Rect = { x0: 70, x1: 330, z0: -170, z1: 160 };
export const TEMPLE = { x: 196, z: 10, w: 46, d: 34, facing: "w" as Facing };
export const EXPRESSWAY_X = -186;
/**
 * Les distributeurs : sur le trottoir ouest, entre le point de départ (z = 340)
 * et la tour. On les atteint en marchant vers elle : le parcours n'a qu'un sens.
 */
export const VENDING = { x: -4.55, z: 296, count: 4, spacing: 1.18 };
/** Bande réservée devant les machines (ni poteau, ni vélo, ni passant). */
export const VENDING_CLEAR = { z0: VENDING.z - 10, z1: VENDING.z + 10 };

export function buildRoads(): Road[] {
  const roads: Road[] = [];
  const add = (r: Rect, kind: RoadKind, axis: "x" | "z", sidewalk: number) => roads.push({ ...r, kind, axis, sidewalk });
  // Boulevard autour du terrain de la tour.
  add({ x0: -72, x1: 72, z0: 58, z1: 72 }, "road", "x", 2.6);
  add({ x0: -72, x1: 72, z0: -72, z1: -58 }, "road", "x", 2.6);
  add({ x0: -72, x1: -58, z0: -58, z1: 58 }, "road", "z", 2.6);
  add({ x0: 58, x1: 72, z0: -58, z1: 58 }, "road", "z", 2.6);
  // Rue d'ouverture.
  add({ ...TOWER_STREET, z0: 72 }, "lane", "z", 0);
  // Transversales.
  for (const c of CROSS_STREETS) add({ x0: -640, x1: 640, z0: c.z - c.w / 2, z1: c.z + c.w / 2 }, c.w > 9.5 ? "road" : "lane", "x", c.w > 9.5 ? 1.8 : 0);
  // Parallèles à la rue d'ouverture.
  add({ x0: -67.5, x1: -60.5, z0: 72, z1: 640 }, "lane", "z", 0);
  add({ x0: 60.5, x1: 67.5, z0: 72, z1: 640 }, "lane", "z", 0);
  // Avenues.
  add({ x0: -132, x1: -112, z0: -900, z1: 900 }, "avenue", "z", 3.5);
  add({ x0: 330, x1: 348, z0: -900, z1: 900 }, "avenue", "z", 3.5);
  add({ x0: -900, x1: 900, z0: -194, z1: -176 }, "avenue", "x", 3.5);
  add({ x0: -900, x1: 900, z0: 560, z1: 576 }, "avenue", "x", 3.2);
  // Petites rues de quartier (nord, ouest).
  for (const z of [-320, -440, -560, -700]) add({ x0: -900, x1: 900, z0: z - 4, z1: z + 4 }, "lane", "x", 0);
  for (const x of [-260, -390, -520, 470, 600]) add({ x0: x - 4.5, x1: x + 4.5, z0: -900, z1: 900 }, "lane", "z", 0);
  return roads;
}

const overlaps = (a: Rect, b: Rect, pad = 0) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;

/**
 * Remplit une bande de façade : lots alignés le long d'une rue.
 * `along` = axe de la rue, `frontAt` = coordonnée du front bâti.
 */
function frontage(
  out: Lot[],
  r: Rng,
  opts: {
    along: "x" | "z";
    from: number;
    to: number;
    frontAt: number;
    depthDir: 1 | -1;
    depth: [number, number];
    width: [number, number];
    floors: [number, number];
    facing: Facing;
    near: boolean;
    styles: Style[];
    shopChance: number;
  },
) {
  let t = opts.from;
  while (t < opts.to - 4) {
    const w = Math.min(opts.to - t, r.range(opts.width[0], opts.width[1]));
    if (opts.to - (t + w) < 5) {
      // Dernier lot : on absorbe le reste.
    }
    const wEff = opts.to - (t + w) < 5 ? opts.to - t : w;
    const d = r.range(opts.depth[0], opts.depth[1]);
    const gap = r.chance(0.18) ? r.range(0.6, 1.4) : 0.25;
    const a0 = t + gap / 2;
    const a1 = t + wEff - gap / 2;
    const f0 = opts.frontAt;
    const f1 = opts.frontAt + d * opts.depthDir;
    const style = r.pick(opts.styles);
    let floors = r.int(opts.floors[0], opts.floors[1]);
    if (style === "house" || style === "old") floors = Math.min(floors, 2);
    if (style === "konbini") floors = 1;
    const rect: Rect =
      opts.along === "z"
        ? { x0: Math.min(f0, f1), x1: Math.max(f0, f1), z0: a0, z1: a1 }
        : { x0: a0, x1: a1, z0: Math.min(f0, f1), z1: Math.max(f0, f1) };
    out.push({
      ...rect,
      facing: opts.facing,
      floors,
      style,
      seed: Math.floor(r.next() * 1e9),
      near: opts.near,
      shop: style === "konbini" || style === "shop" || r.chance(opts.shopChance),
    });
    t += wEff;
  }
}

export function buildLots(seed = 333): Lot[] {
  const r = rng(seed);
  const lots: Lot[] = [];
  const roads = buildRoads();
  const zRanges: [number, number][] = [];
  {
    let z = 72;
    for (const c of CROSS_STREETS) {
      zRanges.push([z, c.z - c.w / 2]);
      z = c.z + c.w / 2;
    }
    zRanges.push([z, 556]);
  }
  const streetStyles: Style[] = ["zakkyo", "mansion", "shop", "zakkyo", "mansion", "office", "old", "shop"];
  for (const [z0, z1] of zRanges) {
    // Rue d'ouverture : deux fronts serrés, rez-de-chaussée commerçants.
    frontage(lots, r, { along: "z", from: z0 + 0.5, to: z1 - 0.5, frontAt: -5.2, depthDir: -1, depth: [13, 19], width: [6.5, 12], floors: [3, 8], facing: "e", near: true, styles: streetStyles, shopChance: 0.75 });
    frontage(lots, r, { along: "z", from: z0 + 0.5, to: z1 - 0.5, frontAt: 5.2, depthDir: 1, depth: [13, 19], width: [6.5, 12], floors: [3, 8], facing: "w", near: true, styles: streetStyles, shopChance: 0.75 });
    // Fronts sur les rues parallèles.
    frontage(lots, r, { along: "z", from: z0 + 0.5, to: z1 - 0.5, frontAt: -60, depthDir: 1, depth: [14, 20], width: [9, 16], floors: [3, 9], facing: "w", near: true, styles: ["mansion", "office", "house", "mansion"], shopChance: 0.2 });
    frontage(lots, r, { along: "z", from: z0 + 0.5, to: z1 - 0.5, frontAt: 60, depthDir: -1, depth: [14, 20], width: [9, 16], floors: [3, 9], facing: "e", near: true, styles: ["mansion", "office", "house", "mansion"], shopChance: 0.2 });
  }
  // Fronts des transversales, au-delà des parallèles (moins de détail).
  for (const c of CROSS_STREETS) {
    for (const side of [-1, 1] as const) {
      const frontAt = c.z + (side * c.w) / 2 + side * 0.6;
      for (const [x0, x1] of [
        [-640, -132],
        [-112, -67.5],
        [67.5, 330],
        [348, 640],
      ] as [number, number][]) {
        if (x0 >= 67.5 && x1 <= 330 && c.z < PARK.z1 + 10) continue;
        frontage(lots, r, {
          along: "x",
          from: x0 + 1,
          to: x1 - 1,
          frontAt,
          depthDir: side as 1 | -1,
          depth: [14, 26],
          width: [10, 22],
          floors: [3, 12],
          facing: side < 0 ? "s" : "n",
          near: Math.abs(x0) < 140 && Math.abs(x1) < 340,
          styles: ["mansion", "office", "zakkyo", "office", "mansion"],
          shopChance: 0.35,
        });
      }
    }
  }
  // Autour du boulevard de la tour (côtés nord et ouest).
  frontage(lots, r, { along: "x", from: -110, to: 56, frontAt: -73, depthDir: -1, depth: [16, 26], width: [12, 24], floors: [4, 14], facing: "s", near: true, styles: ["office", "mansion", "office"], shopChance: 0.3 });
  frontage(lots, r, { along: "z", from: -170, to: 56, frontAt: -73, depthDir: -1, depth: [16, 24], width: [12, 22], floors: [4, 12], facing: "e", near: true, styles: ["office", "mansion", "zakkyo"], shopChance: 0.3 });

  // Tissu lointain : grille d'îlots autour, densité variable, sans empiéter.
  const avoid: Rect[] = [PLOT, PARK, { x0: -72, x1: 72, z0: -72, z1: 72 }, { x0: -70, x1: 70, z0: 72, z1: 560 }];
  for (const rd of roads) avoid.push(rd);
  const existing = lots.map((l) => l as Rect);
  const step = 26;
  for (let gx = -2400; gx < 2400; gx += step) {
    for (let gz = -2400; gz < 2400; gz += step) {
      const cx = gx + step / 2;
      const cz = gz + step / 2;
      const dist = Math.hypot(cx, cz);
      if (dist < 150 || dist > 2350) continue;
      // Baie au sud-est.
      if (cx > 1250 && cz > -200) continue;
      if (cx + cz * 0.4 > 1500) continue;
      const density = dist < 700 ? 0.92 : dist < 1400 ? 0.78 : 0.55;
      if (!r.chance(density)) continue;
      const w = r.range(12, step - 3);
      const d = r.range(12, step - 3);
      const rect: Rect = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 };
      if (avoid.some((a) => overlaps(rect, a, 1.5))) continue;
      if (existing.some((a) => overlaps(rect, a, 1))) continue;
      const floors = farFloors(cx, cz, r);
      lots.push({ ...rect, facing: r.pick(["n", "s", "e", "w"] as Facing[]), floors, style: floors > 14 ? "office" : r.pick(["mansion", "office", "zakkyo"] as Style[]), seed: Math.floor(r.next() * 1e9), near: false, shop: false });
    }
  }
  // Aucun bâtiment sur une chaussée ni sur le terrain de la tour (vérifié par les tests).
  return lots.filter((l) => !overlaps(l, PLOT) && !roads.some((rd) => overlaps(l, rd)));
}

/** Grappes de grande hauteur (Toranomon, Shiodome, Roppongi…) ; ailleurs, bas. */
function farFloors(x: number, z: number, r: Rng) {
  const clusters = [
    { x: 1300, z: -700, rad: 420, f: 34 }, // Shiodome / Shinbashi
    { x: 380, z: -900, rad: 360, f: 30 }, // Toranomon
    { x: -1450, z: -200, rad: 380, f: 32 }, // Roppongi
    { x: 700, z: -1500, rad: 500, f: 26 }, // Marunouchi
    { x: 1050, z: 370, rad: 300, f: 22 }, // Hamamatsuchō
    { x: -1500, z: 900, rad: 400, f: 16 },
  ];
  let base = r.int(3, 9);
  for (const c of clusters) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.rad) {
      const k = 1 - d / c.rad;
      base = Math.max(base, Math.round(r.range(0.4, 1) * c.f * k + 6));
    }
  }
  return base;
}

/** Tours remarquables (silhouettes reconnaissables pendant la montée). */
export const LANDMARKS = [
  { name: "Azabudai Hills Mori JP Tower", x: -450, z: -270, h: 325, w: 54, kind: "azabudai" as const },
  { name: "Roppongi Hills Mori Tower", x: -1460, z: -200, h: 238, w: 62, kind: "roppongi" as const },
  { name: "Toranomon Hills", x: 400, z: -900, h: 255, w: 50, kind: "slab" as const },
  { name: "Shiodome", x: 1320, z: -710, h: 210, w: 44, kind: "slab" as const },
  { name: "World Trade Center", x: 1050, z: 370, h: 200, w: 46, kind: "slab" as const },
];
