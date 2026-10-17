import type { L } from "./i18n";
import { FEATURED, OTHERS, PROJECTS, type Project } from "./projects";
import { SKILLS, type Skill } from "./skills";
import { ABOUT, CONTACT, SITE } from "./site";

/**
 * Le contenu éditable, en un seul document : textes du site, « à propos »,
 * contact, les quatre distributeurs, les projets. Les modules `site`,
 * `skills`, `projects` portent les valeurs d'origine ; l'administration
 * enregistre des révisions de ce document (serveur), et le site l'applique
 * au démarrage, avant de construire quoi que ce soit.
 *
 * Fonctions pures (sauf `applyContent`, qui remplit les modules en place
 * pour que tous leurs lecteurs voient le même contenu).
 */

export type Fact = { label: L; value: L };

export type StoredProject = Project & {
  /** Sur une face du Main Deck (quatre exactement, dans l'ordre de la liste). */
  featured: boolean;
  /** Brouillon : n'apparaît nulle part sur le site. */
  hidden: boolean;
};

export type Content = {
  version: 1;
  site: { name: string; role: L; lead: L; description: L; banner: L };
  about: { place: string; paragraphs: L[]; seeking: L; facts: Fact[] };
  contact: { email: string; links: { label: string; url: string }[]; details: Fact[]; subjects: L[] };
  skills: Skill[];
  projects: StoredProject[];
};

/** Nombre de faces-écrans du Main Deck. */
export const DECK_FACES = 4;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// Instantané des valeurs d'origine, pris au chargement (avant toute application).
const DEFAULTS: Content = clone({
  version: 1,
  site: { name: SITE.name, role: SITE.role, lead: SITE.lead, description: SITE.description, banner: SITE.banner },
  about: ABOUT,
  contact: CONTACT,
  skills: SKILLS,
  projects: PROJECTS.map((p, i) => ({ ...p, featured: i < DECK_FACES, hidden: false })),
});

export function defaultContent(): Content {
  return clone(DEFAULTS);
}

/** Texte bilingue : l'anglais manquant retombe sur le français. */
function fill(l: L): L {
  return { fr: l.fr, en: l.en.trim() ? l.en : l.fr };
}

function fillFacts(facts: Fact[]) {
  return facts.map((f) => ({ label: fill(f.label), value: fill(f.value) }));
}

function fillProject(p: StoredProject): Project {
  const { featured: _f, hidden: _h, ...rest } = p;
  return {
    ...rest,
    discipline: fill(p.discipline),
    role: p.role ? fill(p.role) : undefined,
    line: fill(p.line),
    summary: fill(p.summary),
    facts: fillFacts(p.facts),
    image: p.image ? { ...p.image, alt: fill(p.image.alt) } : undefined,
    gallery: p.gallery?.map((g) => ({ ...g, alt: fill(g.alt) })),
  };
}

/** Projets visibles dans l'ordre du site : les faces du deck, puis les autres. */
export function orderedProjects(c: Content) {
  const visible = c.projects.filter((p) => !p.hidden);
  const featured = visible.filter((p) => p.featured).slice(0, DECK_FACES);
  const others = visible.filter((p) => !featured.includes(p));
  return { featured, others };
}

const replace = <T>(target: T[], items: T[]) => target.splice(0, target.length, ...items);

/** Remplit les modules de contenu (en place) avec ce document. */
export function applyContent(c: Content) {
  SITE.name = c.site.name;
  SITE.role = fill(c.site.role);
  SITE.lead = fill(c.site.lead);
  SITE.description = fill(c.site.description);
  SITE.banner = fill(c.site.banner);
  ABOUT.place = c.about.place;
  replace(ABOUT.paragraphs, c.about.paragraphs.map(fill));
  ABOUT.seeking = fill(c.about.seeking);
  replace(ABOUT.facts, fillFacts(c.about.facts));
  CONTACT.email = c.contact.email;
  replace(CONTACT.links, c.contact.links.map((l) => ({ ...l })));
  replace(CONTACT.details, fillFacts(c.contact.details));
  replace(CONTACT.subjects, c.contact.subjects.map(fill));
  replace(
    SKILLS,
    c.skills.map((s) => ({ ...s, name: fill(s.name), promise: fill(s.promise), text: fill(s.text) })),
  );
  const { featured, others } = orderedProjects(c);
  replace(FEATURED, featured.map(fillProject));
  replace(OTHERS, others.map(fillProject));
  replace(PROJECTS, [...FEATURED, ...OTHERS]);
}

/** Identifiant du bloc de données injecté dans la page par le serveur. */
export const CONTENT_ELEMENT_ID = "contenu-donnees";

/**
 * Au démarrage du site : le contenu injecté dans la page (production), sinon
 * celui de l'API (développement), sinon les valeurs d'origine.
 */
export async function loadRuntimeContent() {
  const el = document.getElementById(CONTENT_ELEMENT_ID);
  try {
    if (el?.textContent) {
      applyContent(JSON.parse(el.textContent) as Content);
      return "page";
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("/api/content", { signal: ctrl.signal, headers: { accept: "application/json" } });
    clearTimeout(timer);
    if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
      applyContent((await res.json()) as Content);
      return "api";
    }
  } catch {
    // Pas de serveur (hébergement statique) : contenu d'origine.
  }
  return "defaults";
}
