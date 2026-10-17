import * as THREE from "three";
import { DEG, MonotoneSpline, smoothstep } from "../core/math";
import { PROJECTS_WINDOW, projectCursor } from "./chapters";
import { MAIN, SCREEN_FACES, aboutFacet } from "../world/tower/decks";
import { halfWidth } from "../world/tower/spec";
import { VENDING } from "../world/city/layout";

/**
 * La caméra. Chaque clé est exprimée en coordonnées cylindriques autour de
 * l'axe de la tour : rayon `r`, angle `a` (degrés, 0 = sud, +z), hauteur `y` ;
 * la cible aussi (`tr`, `ta`, `ty`). On interpole ces grandeurs par splines
 * monotones : les mouvements deviennent des arcs, jamais des coupes à travers
 * la structure, et aucune clé n'est dépassée.
 */

export type CamKey = {
  p: number;
  /** Rayon absolu… */
  r?: number;
  /** …ou marge au-dessus de la surface de la tour (la caméra « épouse » la structure). */
  hug?: number;
  a: number;
  y: number;
  tr: number;
  ta: number;
  ty: number;
  fov: number;
  roll?: number;
};

const SCREEN_R = MAIN.half + MAIN.flare * 0.6 + 0.1;
const SCREEN_Y = 149.7;
const FACE0 = (SCREEN_FACES[2] / DEG) | 0; // 180° : on arrive par le nord
const FACET = aboutFacet(4);
const FACET_A = 180;
const FACET_R = FACET.center.clone().setY(0).length();
/** Ce que l'on regarde aux distributeurs (le milieu de la rangée, à hauteur de fente). */
const VEND_X = VENDING.x + 0.15;
const VEND_Z = VENDING.z - 0.57;
/**
 * Le regard aux distributeurs : depuis la place de la caméra, on vise un
 * peu à gauche des machines, pour qu'elles tiennent le centre-droit de
 * l'image — la colonne d'interface occupe la gauche.
 */
function vendingAim(camR: number, offsetDeg: number) {
  const cx = Math.sin(0.2 * DEG) * camR;
  const cz = Math.cos(0.2 * DEG) * camR;
  const dx = VEND_X - cx;
  const dz = VEND_Z - cz;
  const t = offsetDeg * DEG;
  const x = cx + dx * Math.cos(t) + dz * Math.sin(t);
  const z = cz - dx * Math.sin(t) + dz * Math.cos(t);
  return { tr: Math.hypot(x, z), ta: Math.atan2(x, z) / DEG };
}
const VEND_AIM_DEG = 11;
const VEND_A = vendingAim(VEND_Z + 7, VEND_AIM_DEG);
const VEND_B = vendingAim(VEND_Z + 6, VEND_AIM_DEG);

/** Distance de l'axe à la surface carrée de la tour, dans la direction `a` (degrés). */
export function towerBoundary(aDeg: number, y: number) {
  const a = aDeg * DEG;
  // Les angles portent les membrures les plus épaisses (et les pieds) : on s'en écarte davantage.
  // (Transition continue avec l'altitude : un seuil faisait sauter la caméra de 4 m.)
  const corner = Math.pow(Math.abs(Math.sin(2 * a)), 2) * (9 - 4 * smoothstep(50, 90, y));
  return halfWidth(Math.max(0, y)) / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) + corner;
}

export const KEYS: CamKey[] = [
  // Tokyo : regard de piéton au milieu de la rue, la tour au bout, immense.
  // On marche vers elle ; on ne recule jamais.
  { p: 0.0, r: 340, a: 0.2, y: 1.6, tr: 0, ta: 0, ty: 118, fov: 58 },
  { p: 0.055, r: 318, a: 0.2, y: 1.62, tr: 0, ta: 0, ty: 116, fov: 56 },
  // Distributeurs, plus loin dans la rue : on y arrive en marchant, en tournant la tête.
  { p: 0.1, r: VEND_Z + 7, a: 0.2, y: 1.55, tr: VEND_A.tr, ta: VEND_A.ta, ty: 1.18, fov: 46 },
  { p: 0.145, r: VEND_Z + 6, a: 0.2, y: 1.55, tr: VEND_B.tr, ta: VEND_B.ta, ty: 1.2, fov: 46 },
  // Départ : plan grue au-dessus de la rue, la tour grandit, puis le pied et l'ascenseur.
  { p: 0.172, r: VEND_Z - 10, a: 0.05, y: 7, tr: 150, ta: 0, ty: 30, fov: 54 },
  { p: 0.2, r: 192, a: 0.6, y: 40, tr: 0, ta: 0, ty: 62, fov: 50 },
  { p: 0.224, r: 86, a: 9, y: 35, tr: 0, ta: 0, ty: 38, fov: 46 },
  // Ascension 1 : la caméra épouse la tour, l'ascenseur reste dans le cadre.
  { p: 0.25, hug: 22, a: 30, y: 56, tr: 0, ta: 0, ty: 50, fov: 44, roll: 0.8 },
  { p: 0.285, hug: 15, a: 68, y: 80, tr: 0, ta: 0, ty: 75, fov: 44, roll: 1.4 },
  { p: 0.32, hug: 17, a: 108, y: 105, tr: 0, ta: 0, ty: 99, fov: 45, roll: 1.1 },
  // Respiration : plan large, la ville rapetisse, l'horizon et la baie apparaissent.
  { p: 0.352, r: 96, a: 150, y: 126, tr: 0, ta: 0, ty: 118, fov: 46, roll: 0.4 },
  // Anticipation : on lève les yeux vers le Main Deck.
  { p: 0.383, r: 64, a: 172, y: 134, tr: 0, ta: 0, ty: 150, fov: 40, roll: 0.1 },
  // Main Deck : arrivée face à la première façade-écran.
  { p: 0.405, r: 58, a: FACE0, y: 149.2, tr: SCREEN_R, ta: FACE0, ty: SCREEN_Y, fov: 34 },
  { p: PROJECTS_WINDOW.p0, r: 57, a: FACE0, y: 149.2, tr: SCREEN_R, ta: FACE0, ty: SCREEN_Y, fov: 34 },
  { p: PROJECTS_WINDOW.p1, r: 57, a: FACE0 + 270, y: 149.2, tr: SCREEN_R, ta: FACE0 + 270, ty: SCREEN_Y, fov: 34 },
  { p: 0.6, r: 56, a: FACE0 + 272, y: 151, tr: SCREEN_R * 0.5, ta: FACE0 + 272, ty: 156, fov: 38 },
  // Nuages : second ascenseur, traversée, ciel.
  { p: 0.625, hug: 16, a: FACE0 + 298, y: 178, tr: 0, ta: 0, ty: 196, fov: 46, roll: 0.6 },
  { p: 0.65, hug: 14, a: FACE0 + 325, y: 212, tr: 0, ta: 0, ty: 216, fov: 50, roll: 0.8 },
  { p: 0.676, r: 52, a: FACE0 + 348, y: 238, tr: 0, ta: 0, ty: 248, fov: 42, roll: 0.3 },
  { p: 0.705, r: 30, a: FACE_A_UNWRAP(), y: 249, tr: 0, ta: 0, ty: 251, fov: 38 },
  // Top Deck : plan calme, lent, face à la vitre.
  { p: 0.74, r: FACET_R + 13.5, a: FACE_A_UNWRAP(), y: 250.5, tr: FACET_R, ta: FACE_A_UNWRAP(), ty: 250.4, fov: 34 },
  { p: 0.835, r: FACET_R + 11.2, a: FACE_A_UNWRAP(), y: 250.5, tr: FACET_R, ta: FACE_A_UNWRAP(), ty: 250.4, fov: 34 },
  // Sommet : on longe l'antenne jusqu'à la pointe.
  { p: 0.875, r: 30, a: FACE_A_UNWRAP() + 80, y: 268, tr: 0, ta: 0, ty: 292, fov: 44, roll: 0.5 },
  { p: 0.935, r: 26, a: FACE_A_UNWRAP() + 190, y: 308, tr: 0, ta: 0, ty: 318, fov: 46, roll: 0.6 },
  { p: 0.975, r: 40, a: FACE_A_UNWRAP() + 265, y: 334, tr: 0, ta: 0, ty: 327, fov: 42, roll: 0.2 },
  { p: 1.0, r: 50, a: FACE_A_UNWRAP() + 290, y: 337, tr: 0, ta: 0, ty: 327.5, fov: 40 },
];

/** Angle déroulé de la facette « à propos » (continuité avec la spirale). */
function FACE_A_UNWRAP() {
  return FACET_A + 360;
}

type Channel = "r" | "hug" | "hugMix" | "a" | "y" | "tr" | "ta" | "ty" | "fov" | "roll" | "yaw" | "pitch" | "dist";
const CHANNELS: Channel[] = ["r", "hug", "hugMix", "a", "y", "tr", "ta", "ty", "fov", "roll"];

/** Position et cible exactes d'une clé. */
function keyPose(k: CamKey) {
  const r = k.r ?? towerBoundary(k.a, k.y) + (k.hug ?? 0);
  const pos = new THREE.Vector3(Math.sin(k.a * DEG) * r, k.y, Math.cos(k.a * DEG) * r);
  const target = new THREE.Vector3(Math.sin(k.ta * DEG) * k.tr, k.ty, Math.cos(k.ta * DEG) * k.tr);
  return { pos, target };
}

export class CameraRig {
  private splines = new Map<Channel, MonotoneSpline>();
  readonly position = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  fov = 50;
  roll = 0;
  /** Angle courant (degrés), utile pour l'interface. */
  angle = 0;

  constructor(keys: CamKey[] = KEYS) {
    const xs = keys.map((k) => k.p);
    // Rayon : pour les clés « hug », on garde une valeur de rayon cohérente (pour l'interpolation).
    const value = (k: CamKey, c: Channel) => {
      if (c === "hugMix") return k.hug !== undefined ? 1 : 0;
      if (c === "hug") return k.hug ?? 0;
      if (c === "r") return k.r ?? towerBoundary(k.a, k.y) + (k.hug ?? 0);
      return (k[c as keyof CamKey] as number | undefined) ?? 0;
    };
    for (const c of CHANNELS) this.splines.set(c, new MonotoneSpline(xs, keys.map((k) => value(k, c))));
    // Le regard est interpolé en angles (cap, inclinaison) et en distance, pas
    // en position de cible : quand on passe d'une cible lointaine (la tour) à
    // une cible proche (les distributeurs), la tête tourne régulièrement au
    // lieu de pivoter d'un coup à la fin.
    const yaw: number[] = [];
    const pitch: number[] = [];
    const dist: number[] = [];
    for (const k of keys) {
      const { pos, target } = keyPose(k);
      const d = target.sub(pos);
      let y = Math.atan2(d.x, d.z);
      if (yaw.length) {
        const prev = yaw[yaw.length - 1];
        while (y - prev > Math.PI) y -= 2 * Math.PI;
        while (y - prev < -Math.PI) y += 2 * Math.PI;
      }
      yaw.push(y);
      pitch.push(Math.atan2(d.y, Math.hypot(d.x, d.z)));
      dist.push(Math.log(Math.max(0.5, d.length())));
    }
    this.splines.set("yaw", new MonotoneSpline(xs, yaw));
    this.splines.set("pitch", new MonotoneSpline(xs, pitch));
    this.splines.set("dist", new MonotoneSpline(xs, dist));
  }

  evaluate(p: number) {
    const s = (c: Channel) => this.splines.get(c)!.at(p);
    let a = s("a");
    let ta = s("ta");
    let y = s("y");
    let ty = s("ty");
    const hugMix = s("hugMix");
    let r = s("r");
    if (hugMix > 0.001) r = THREE.MathUtils.lerp(r, towerBoundary(a, y) + s("hug"), hugMix);
    // Palier des projets : l'angle suit l'escalier (arrêt devant chaque façade).
    const projects = p > PROJECTS_WINDOW.p0 && p < PROJECTS_WINDOW.p1;
    if (projects) {
      const cur = projectCursor(p);
      a = FACE0 + 90 * cur;
      ta = a;
      const between = Math.sin((cur % 1) * Math.PI);
      // En contournant l'angle, on s'élève et on prend du recul : le
      // mouvement latéral se lit comme un travelling, pas comme un glissé.
      y += between * 4;
      ty += between * 1.5;
      r += between * 13;
    }
    this.angle = a;
    const ar = a * DEG;
    const tar = ta * DEG;
    const tr = s("tr");
    this.position.set(Math.sin(ar) * r, y, Math.cos(ar) * r);
    if (projects) {
      this.target.set(Math.sin(tar) * tr, ty, Math.cos(tar) * tr);
    } else {
      const yaw = s("yaw");
      const pitch = s("pitch");
      const d = Math.exp(s("dist"));
      this.target.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(d).add(this.position);
    }
    this.fov = s("fov");
    this.roll = s("roll") * DEG * smoothstep(0.2, 0.25, p);
    return this;
  }
}
