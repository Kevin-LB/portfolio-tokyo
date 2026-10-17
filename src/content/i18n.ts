/**
 * Les deux langues. Le français est la langue de référence (HTML servi,
 * métadonnées) ; l'anglais est une bascule côté client.
 */
export const LANGS = ["fr", "en"] as const;
export type Lang = (typeof LANGS)[number];
/** Un texte rédigé, dans les deux langues. */
export type L = Record<Lang, string>;

let current: Lang = "fr";
const listeners = new Set<(l: Lang) => void>();

export function getLang() {
  return current;
}

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem("lang", l);
  } catch {
    // Stockage indisponible : la langue ne sera pas retenue, rien de plus.
  }
  for (const fn of listeners) fn(l);
}

export function onLang(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    // ignore
  }
  return navigator.language?.toLowerCase().startsWith("fr") ? "fr" : navigator.language ? "en" : "fr";
}

export const t = (text: L | string) => (typeof text === "string" ? text : text[current]);
