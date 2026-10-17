import type { Content } from "../content/store";
import { api, ApiError } from "./api";

/**
 * L'état de l'édition : le contenu publié, un brouillon modifié en place par
 * les formulaires, et la liste des rubriques touchées (elle sert de résumé à
 * la révision enregistrée). Un seul brouillon pour toutes les pages : on
 * peut passer d'une rubrique à l'autre sans perdre ce qu'on a saisi.
 */

export type MediaRow = { id: number; file: string; mime: string; width: number; height: number; bytes: number; name: string; alt_fr: string; alt_en: string; created_at: string };

export const state = {
  revision: 0,
  published: null as Content | null,
  draft: null as unknown as Content,
  dirty: new Set<string>(),
  media: [] as MediaRow[],
  unread: 0,
  errors: [] as string[],
};

const listeners = new Set<() => void>();
export const onChange = (fn: () => void) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export async function loadContent() {
  const r = await api<{ revision: number; content: Content }>("content");
  state.revision = r.revision;
  state.published = r.content;
  state.draft = clone(r.content);
  state.dirty.clear();
  state.errors = [];
  emit();
}

export async function loadMedia() {
  state.media = await api<MediaRow[]>("media");
}

/** Une rubrique a été modifiée. */
export function touch(section: string) {
  state.dirty.add(section);
  emit();
}

export function discard() {
  if (state.published) state.draft = clone(state.published);
  state.dirty.clear();
  state.errors = [];
  emit();
}

export async function save() {
  try {
    const r = await api<{ revision: number; content: Content }>("content", {
      method: "PUT",
      body: { content: state.draft, summary: [...state.dirty].join(" · "), base: state.revision },
    });
    state.revision = r.revision;
    state.published = r.content;
    state.draft = clone(r.content);
    state.dirty.clear();
    state.errors = [];
    emit();
    return true;
  } catch (e) {
    state.errors = e instanceof ApiError && e.errors.length ? e.errors : [e instanceof Error ? e.message : String(e)];
    emit();
    return false;
  }
}

/** Remplace le brouillon et le publié par une version renvoyée par le serveur (restauration, import). */
export function adopt(revision: number, content: Content) {
  state.revision = revision;
  state.published = content;
  state.draft = clone(content);
  state.dirty.clear();
  state.errors = [];
  emit();
}

/** Champs anglais vides (ils retombent sur le français sur le site). */
export function missingEnglish(c: Content) {
  const out: { where: string; href: string }[] = [];
  const walk = (v: unknown, where: string, href: string) => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.fr === "string" && typeof o.en === "string" && Object.keys(o).length === 2) {
      if (o.fr.trim() && !o.en.trim()) out.push({ where, href });
      return;
    }
    for (const x of Object.values(o)) walk(x, where, href);
  };
  walk(c.site, "Textes du site", "/admin/textes");
  walk(c.about, "À propos", "/admin/a-propos");
  walk(c.contact, "Contact", "/admin/contact");
  c.skills.forEach((s) => walk(s, `Distributeur « ${s.name.fr} »`, "/admin/distributeurs"));
  c.projects.forEach((p) => walk(p, `Projet « ${p.title} »`, `/admin/projets/${encodeURIComponent(p.slug)}`));
  return out;
}
