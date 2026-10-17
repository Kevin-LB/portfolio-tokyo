/**
 * Les cotes de la tour. Une seule source de vérité : le treillis, les
 * plateformes, l'ascenseur, la caméra, le chargement (dessin de la tour) et
 * l'altimètre en dérivent. Unités : mètres, axe de la tour en (0, 0).
 *
 * Relevés sur la vraie tour (333 m, Main Deck 150 m, Top Deck 250 m) ; les
 * largeurs viennent de photographies, puis sont légèrement épaissies pour
 * rester lisibles à l'écran (stylisation assumée).
 */

export const TOWER = {
  height: 333,
  /** Demi-largeur au sol (axe → axe d'un pied). */
  baseHalf: 40,
  /** Décroissance exponentielle du profil. */
  decay: 112,
  /** Fin des pieds séparés : au-dessus, un seul fût. */
  legsMerge: 58,
  /** Toit de FootTown. */
  footTownTop: 22,
  mainDeck: { bottom: 142, floor1: 145, floor2: 150, top: 158, half: 17.2, flare: 1.3 },
  topDeck: { bottom: 246, floor: 250, top: 256, radius: 7.4 },
  /** Couronne de transition au-dessus du Top Deck. */
  crown: { bottom: 256, top: 266, half: 2.6 },
  antenna: { bottom: 266, top: 333, baseRadius: 2.1, tipRadius: 0.12 },
  /** Cage d'ascenseur centrale (vitrée). */
  core: { half: 3.2 },
} as const;

/** Demi-largeur du fût à la hauteur `h` (jusqu'à la couronne). */
export function halfWidth(h: number) {
  if (h >= TOWER.crown.top) return antennaRadius(h);
  const w = TOWER.baseHalf * Math.exp(-h / TOWER.decay);
  if (h > TOWER.topDeck.top) {
    // Couronne : resserrement vers la base de l'antenne.
    const t = (h - TOWER.topDeck.top) / (TOWER.crown.top - TOWER.topDeck.top);
    const w0 = TOWER.baseHalf * Math.exp(-TOWER.topDeck.top / TOWER.decay);
    return w0 + (TOWER.crown.half - w0) * (t * t * (3 - 2 * t));
  }
  return w;
}

export function antennaRadius(h: number) {
  const { bottom, top, baseRadius, tipRadius } = TOWER.antenna;
  const t = Math.min(1, Math.max(0, (h - bottom) / (top - bottom)));
  // Trois tronçons : socle orange épais, mât blanc, pointe orange fine.
  if (t < 0.18) return baseRadius;
  if (t < 0.24) return baseRadius - (baseRadius - 1.15) * ((t - 0.18) / 0.06);
  if (t < 0.72) return 1.15 - 0.45 * ((t - 0.24) / 0.48);
  if (t < 0.75) return 0.7 - 0.3 * ((t - 0.72) / 0.03);
  return 0.4 - (0.4 - tipRadius) * ((t - 0.75) / 0.25);
}

/**
 * Bandes de peinture (orange international / blanc), relevées sur photo.
 * `true` = orange. Ordre du bas vers le haut ; chaque entrée = hauteur haute.
 */
export const BANDS: [top: number, orange: boolean][] = [
  [176, true],
  [200, false],
  [223, true],
  [253, false],
  [278, true],
  [314, false],
  [334, true],
];

export function isOrangeAt(h: number) {
  for (const [top, orange] of BANDS) if (h < top) return orange;
  return true;
}

/** Niveaux de l'histoire, en mètres (altimètre, navigation). */
export const LEVELS = {
  ground: 0,
  mainDeck: TOWER.mainDeck.floor2,
  topDeck: TOWER.topDeck.floor,
  summit: TOWER.height,
} as const;
