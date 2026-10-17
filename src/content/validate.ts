import type { L } from "./i18n";
import { DECK_FACES, type Content, type Fact, type StoredProject } from "./store";
import type { Skill } from "./skills";

/**
 * Validation du document de contenu. Tout ce qui arrive de l'administration
 * (ou d'un import) passe ici avant d'être enregistré : types, longueurs,
 * formats (adresses, liens, couleurs, chemins d'images), cohérence (slugs
 * uniques, quatre projets sur le Main Deck, preuves qui existent).
 *
 * Le résultat est une copie propre : les champs inconnus sont écartés, les
 * textes sont rognés. Les messages d'erreur sont écrits pour l'auteur.
 */

export type Result = { ok: true; value: Content } | { ok: false; errors: string[] };

const SKILL_IDS = ["design", "front", "back", "render"] as const;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
/** Images : celles du dépôt (/projets/…) ou envoyées depuis l'administration (/media/…). */
const IMAGE = /^\/(?:projets|media)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:webp|jpe?g|png|avif)$/;

class Checker {
  errors: string[] = [];

  fail(where: string, msg: string) {
    this.errors.push(`${where} : ${msg}`);
  }

  str(v: unknown, where: string, opts: { min?: number; max: number; pattern?: RegExp; patternMsg?: string }): string {
    if (typeof v !== "string") {
      this.fail(where, "texte attendu");
      return "";
    }
    const s = v.trim();
    if (s.length < (opts.min ?? 0)) this.fail(where, opts.min === 1 ? "obligatoire" : `au moins ${opts.min} caractères`);
    if (s.length > opts.max) this.fail(where, `${opts.max} caractères au plus (actuellement ${s.length})`);
    if (opts.pattern && s && !opts.pattern.test(s)) this.fail(where, opts.patternMsg ?? "format invalide");
    return s;
  }

  optStr(v: unknown, where: string, opts: { max: number; pattern?: RegExp; patternMsg?: string }): string | undefined {
    if (v === undefined || v === null || v === "") return undefined;
    const s = this.str(v, where, opts);
    return s || undefined;
  }

  /** Texte bilingue : le français est obligatoire, l'anglais peut manquer (il retombe sur le français). */
  l(v: unknown, where: string, max: number, required = true): L {
    const o = (v ?? {}) as Record<string, unknown>;
    if (typeof v !== "object" || v === null) this.fail(where, "texte bilingue attendu");
    return {
      fr: this.str(o.fr ?? "", `${where} (FR)`, { min: required ? 1 : 0, max }),
      en: this.str(o.en ?? "", `${where} (EN)`, { max }),
    };
  }

  url(v: unknown, where: string, required = true): string | undefined {
    if (!required && (v === undefined || v === null || v === "")) return undefined;
    const s = this.str(v, where, { min: 1, max: 300 });
    try {
      const u = new URL(s);
      if (u.protocol !== "https:") this.fail(where, "le lien doit commencer par https://");
      return u.href;
    } catch {
      if (s) this.fail(where, "lien invalide");
      return s;
    }
  }

  color(v: unknown, where: string) {
    return this.str(v, where, { min: 1, max: 7, pattern: HEX, patternMsg: "couleur au format #rrggbb" }).toLowerCase();
  }

  int(v: unknown, where: string, min: number, max: number) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      this.fail(where, `nombre entier entre ${min} et ${max} attendu`);
      return min;
    }
    return v;
  }

  list<T>(v: unknown, where: string, max: number, each: (item: unknown, where: string, i: number) => T, min = 0): T[] {
    if (!Array.isArray(v)) {
      this.fail(where, "liste attendue");
      return [];
    }
    if (v.length < min) this.fail(where, `au moins ${min} élément${min > 1 ? "s" : ""}`);
    if (v.length > max) this.fail(where, `${max} éléments au plus`);
    return v.slice(0, max).map((item, i) => each(item, `${where} n° ${i + 1}`, i));
  }

  facts(v: unknown, where: string, max = 12): Fact[] {
    return this.list(v, where, max, (f, w) => {
      const o = (f ?? {}) as Record<string, unknown>;
      return { label: this.l(o.label, `${w}, intitulé`, 60), value: this.l(o.value, `${w}, valeur`, 160) };
    });
  }

  image(v: unknown, where: string, withPhone: boolean) {
    const o = (v ?? {}) as Record<string, unknown>;
    const img: { src: string; w: number; h: number; alt: L; phone?: boolean } = {
      src: this.str(o.src, `${where}, fichier`, { min: 1, max: 200, pattern: IMAGE, patternMsg: "image de la médiathèque attendue" }),
      w: this.int(o.w, `${where}, largeur`, 1, 10000),
      h: this.int(o.h, `${where}, hauteur`, 1, 10000),
      alt: this.l(o.alt, `${where}, texte alternatif`, 200),
    };
    if (withPhone && o.phone === true) img.phone = true;
    return img;
  }
}

function project(c: Checker, v: unknown, where: string): StoredProject {
  const o = (v ?? {}) as Record<string, unknown>;
  const title = c.str(o.title, `${where}, titre`, { min: 1, max: 80 });
  const w = title ? `Projet « ${title} »` : where;
  const p: StoredProject = {
    slug: c.str(o.slug, `${w}, identifiant`, { min: 1, max: 60, pattern: SLUG, patternMsg: "minuscules, chiffres et tirets (ex. mon-projet)" }),
    title,
    year: c.str(o.year, `${w}, année`, { min: 4, max: 24 }),
    discipline: c.l(o.discipline, `${w}, type de projet`, 120),
    line: c.l(o.line, `${w}, phrase d'accroche`, 220),
    summary: c.l(o.summary, `${w}, résumé`, 1600),
    stack: c.list(o.stack, `${w}, pile technique`, 30, (s, ww) => c.str(s, ww, { min: 1, max: 40 })),
    facts: c.facts(o.facts, `${w}, faits`),
    tint: c.color(o.tint ?? "#0b1426", `${w}, couleur d'écran`),
    featured: o.featured === true,
    hidden: o.hidden === true,
  };
  if (o.role !== undefined && o.role !== null) {
    const r = c.l(o.role, `${w}, rôle`, 120, false);
    if (r.fr) p.role = r;
  }
  const org = c.optStr(o.org, `${w}, commanditaire`, { max: 120 });
  if (org) p.org = org;
  const live = c.url(o.live, `${w}, lien en ligne`, false);
  if (live) p.live = live;
  if (o.image) p.image = c.image(o.image, `${w}, image principale`, true);
  if (Array.isArray(o.gallery) && o.gallery.length) p.gallery = c.list(o.gallery, `${w}, galerie`, 12, (g, ww) => {
    const { phone: _p, ...rest } = c.image(g, ww, false);
    return rest;
  });
  return p;
}

function skill(c: Checker, v: unknown, where: string, i: number): Skill {
  const o = (v ?? {}) as Record<string, unknown>;
  const id = SKILL_IDS[i];
  if (o.id !== id) c.fail(where, `distributeur « ${id} » attendu à cette place`);
  return {
    id,
    name: c.l(o.name, `${where}, nom`, 40),
    jp: c.str(o.jp, `${where}, nom japonais`, { min: 1, max: 4 }),
    body: c.color(o.body, `${where}, couleur de la machine`),
    accent: c.color(o.accent, `${where}, couleur du texte`),
    promise: c.l(o.promise, `${where}, promesse`, 140),
    text: c.l(o.text, `${where}, texte`, 700),
    tools: c.list(o.tools, `${where}, outils`, 20, (s, w) => c.str(s, w, { min: 1, max: 40 })),
    proof: c.list(o.proof, `${where}, projets liés`, 8, (s, w) => c.str(s, w, { min: 1, max: 60, pattern: SLUG })),
    price: c.str(o.price, `${where}, prix affiché`, { min: 1, max: 8 }),
  };
}

/** Taille maximale d'un document (octets de JSON). */
export const MAX_CONTENT_BYTES = 600_000;

export function validateContent(input: unknown): Result {
  const c = new Checker();
  if (typeof input !== "object" || input === null) return { ok: false, errors: ["Document : objet attendu"] };
  if (JSON.stringify(input).length > MAX_CONTENT_BYTES) return { ok: false, errors: ["Document : trop volumineux"] };
  const o = input as Record<string, unknown>;
  const site = (o.site ?? {}) as Record<string, unknown>;
  const about = (o.about ?? {}) as Record<string, unknown>;
  const contact = (o.contact ?? {}) as Record<string, unknown>;

  const value: Content = {
    version: 1,
    site: {
      name: c.str(site.name, "Site, nom", { min: 1, max: 60 }),
      role: c.l(site.role, "Site, métier", 120),
      lead: c.l(site.lead, "Site, accroche", 240),
      description: c.l(site.description, "Site, description (moteurs de recherche)", 300),
      banner: c.l(site.banner, "Site, banderole de la montgolfière", 24),
    },
    about: {
      place: c.str(about.place, "À propos, lieu", { max: 80 }),
      paragraphs: c.list(about.paragraphs, "À propos, paragraphes", 6, (p, w) => c.l(p, w, 600), 1),
      seeking: c.l(about.seeking, "À propos, ce que je cherche", 300),
      facts: c.facts(about.facts, "À propos, repères", 6),
    },
    contact: {
      email: c.str(contact.email, "Contact, adresse", { min: 3, max: 120, pattern: EMAIL, patternMsg: "adresse électronique invalide" }),
      links: c.list(contact.links, "Contact, liens", 8, (l, w) => {
        const lo = (l ?? {}) as Record<string, unknown>;
        return { label: c.str(lo.label, `${w}, nom`, { min: 1, max: 30 }), url: c.url(lo.url, `${w}, adresse`) ?? "" };
      }),
      details: c.facts(contact.details, "Contact, précisions", 6),
      subjects: c.list(contact.subjects, "Contact, objets du formulaire", 8, (s, w) => c.l(s, w, 60), 1),
    },
    skills: c.list(o.skills, "Distributeurs", 4, (s, w, i) => skill(c, s, w, i), 4),
    projects: c.list(o.projects, "Projets", 40, (p, w) => project(c, p, w), 1),
  };

  // Cohérence.
  const slugs = new Set<string>();
  for (const p of value.projects) {
    if (slugs.has(p.slug)) c.fail(`Projet « ${p.title} »`, `l'identifiant « ${p.slug} » est déjà utilisé`);
    slugs.add(p.slug);
  }
  const deck = value.projects.filter((p) => p.featured && !p.hidden);
  if (deck.length !== DECK_FACES) c.fail("Main Deck", `il faut exactement ${DECK_FACES} projets visibles sur les écrans (actuellement ${deck.length})`);
  for (const s of value.skills) {
    for (const slug of s.proof) if (!slugs.has(slug)) c.fail(`Distributeur « ${s.name.fr} »`, `le projet lié « ${slug} » n'existe pas`);
  }
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value };
}
