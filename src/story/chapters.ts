import { clamp, easeInOutCubic, invLerp, lerp, smoothstep, staircase } from "../core/math";
import { TOWER } from "../world/tower/spec";

/**
 * Le découpage de l'ascension. Toute la scène est une fonction pure de la
 * progression `p ∈ [0,1]` : remonter redescend exactement.
 */

export type ChapterId = "tokyo" | "skills" | "depart" | "ascent" | "projects" | "clouds" | "about" | "summit";

export const CHAPTERS: { id: ChapterId; p0: number; p1: number }[] = [
  { id: "tokyo", p0: 0, p1: 0.07 },
  { id: "skills", p0: 0.07, p1: 0.17 },
  { id: "depart", p0: 0.17, p1: 0.23 },
  { id: "ascent", p0: 0.23, p1: 0.405 },
  { id: "projects", p0: 0.405, p1: 0.6 },
  { id: "clouds", p0: 0.6, p1: 0.72 },
  { id: "about", p0: 0.72, p1: 0.86 },
  { id: "summit", p0: 0.86, p1: 1 },
];

export function chapterAt(p: number) {
  for (const c of CHAPTERS) if (p < c.p1) return c;
  return CHAPTERS[CHAPTERS.length - 1];
}

/** Arrêts de navigation (boutons de l'altimètre). */
export const STOPS = {
  ground: 0,
  skills: 0.118,
  projects: 0.415, // face du premier projet (début du palier)
  about: 0.8,
  contact: 1,
} as const;
export type StopId = keyof typeof STOPS;

/** Projets : fenêtre du palier et nombre de faces. */
export const PROJECTS_WINDOW = { p0: 0.415, p1: 0.585, count: 4 };

/** Progression continue sur les faces du Main Deck (0 → count-1), avec arrêts. */
export function projectCursor(p: number) {
  const t = invLerp(PROJECTS_WINDOW.p0, PROJECTS_WINDOW.p1, p);
  return staircase(t, PROJECTS_WINDOW.count, 0.3);
}

/** Index du projet de face (le plus proche). */
export function projectIndex(p: number) {
  return Math.round(projectCursor(p));
}

/** Ascenseur 1 : du toit de FootTown au Main Deck. */
export const LIFT1 = { p0: 0.19, p1: 0.405, y0: TOWER.footTownTop + 0.3, y1: TOWER.mainDeck.floor1 };
/** Ascenseur 2 : du Main Deck au Top Deck. */
export const LIFT2 = { p0: 0.6, p1: 0.705, y0: TOWER.mainDeck.floor2, y1: TOWER.topDeck.floor - 2.4 };

/** Profil d'ascenseur : démarrage doux, vitesse de croisière, freinage doux. */
function liftCurve(t: number) {
  const a = 0.18; // part d'accélération
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const vmax = 1 / (1 - a);
  if (t < a) return (vmax * t * t) / (2 * a);
  if (t > 1 - a) return 1 - (vmax * (1 - t) * (1 - t)) / (2 * a);
  return vmax * (t - a / 2);
}

export function lift1Y(p: number) {
  return lerp(LIFT1.y0, LIFT1.y1, liftCurve(invLerp(LIFT1.p0, LIFT1.p1, p)));
}
export function lift2Y(p: number) {
  return lerp(LIFT2.y0, LIFT2.y1, liftCurve(invLerp(LIFT2.p0, LIFT2.p1, p)));
}

/** Altitude affichée : celle du regard du visiteur (l'ascenseur, puis l'antenne). */
export function altitudeAt(p: number, cameraY: number) {
  if (p < LIFT1.p0) return clamp(cameraY, 0, 400);
  if (p < LIFT2.p0) return lift1Y(p) + 1.6;
  if (p < 0.86) return lift2Y(p) + 1.6;
  return lerp(TOWER.topDeck.floor, TOWER.height, easeInOutCubic(invLerp(0.86, 0.985, p)));
}

/** Facteur d'intensité d'un chapitre (0 hors, 1 au cœur), pour les fondus d'interface. */
export function chapterPresence(p: number, a: number, b: number, fade = 0.015) {
  return smoothstep(a - fade, a + fade, p) * (1 - smoothstep(b - fade, b + fade, p));
}

/**
 * Mouvement réduit : la caméra ne voyage plus. Le scroll choisit un plan fixe
 * (la rue, les distributeurs, chaque face du Main Deck, le Top Deck, le
 * sommet) et l'on passe de l'un à l'autre par un fondu, coupe cachée au
 * milieu. Retourne la progression effective et l'opacité du fondu.
 */
export const REDUCED_ANCHORS = [0, 0.12, PROJECTS_WINDOW.p0, 0.4717, 0.5283, PROJECTS_WINDOW.p1, 0.8, 1];

export function reducedProgress(p: number) {
  const a = REDUCED_ANCHORS;
  for (let i = 0; i < a.length - 1; i++) {
    if (p <= a[i + 1]) {
      const t = invLerp(a[i], a[i + 1], p);
      const fade = smoothstep(0.42, 0.5, t) * (1 - smoothstep(0.5, 0.58, t));
      return { p: t < 0.5 ? a[i] : a[i + 1], fade };
    }
  }
  return { p: 1, fade: 0 };
}
