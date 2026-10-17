import { defaultContent, type Content } from "../src/content/store";
import { validateContent } from "../src/content/validate";
import { logActivity, now, type Db } from "./db";
import { HttpError } from "./media";

/**
 * Le contenu publié : la dernière révision. Chaque enregistrement de
 * l'administration en ajoute une (on garde les 200 dernières) ; restaurer
 * une ancienne version en crée une nouvelle, identique : rien ne se perd.
 * Au tout premier démarrage, la révision 1 est le contenu d'origine du dépôt.
 */

export type RevisionMeta = { id: number; created_at: string; summary: string };

let cache: { id: number; content: Content; json: string } | null = null;

export function currentContent(db: Db) {
  const row = db.prepare("SELECT id, data FROM revisions ORDER BY id DESC LIMIT 1").get() as { id: number; data: string } | undefined;
  if (!row) {
    saveContent(db, defaultContent(), "Contenu d'origine");
    return currentContent(db);
  }
  if (!cache || cache.id !== row.id) {
    // Un document enregistré a déjà été validé ; on le revalide quand même
    // (une base restaurée à la main ne doit pas casser le site).
    const r = validateContent(JSON.parse(row.data));
    const content = r.ok ? r.value : defaultContent();
    cache = { id: row.id, content, json: JSON.stringify(content) };
  }
  return cache;
}

export function saveContent(db: Db, input: unknown, summary: string) {
  const r = validateContent(input);
  if (!r.ok) throw new ValidationError(r.errors);
  const json = JSON.stringify(r.value);
  const s = summary.trim().slice(0, 140) || "Modification";
  const res = db.prepare("INSERT INTO revisions (created_at, summary, data) VALUES (?, ?, ?)").run(now(), s, json);
  db.prepare("DELETE FROM revisions WHERE id NOT IN (SELECT id FROM revisions ORDER BY id DESC LIMIT 200)").run();
  logActivity(db, "content.save", s);
  cache = { id: Number(res.lastInsertRowid), content: r.value, json };
  return cache;
}

export function listRevisions(db: Db) {
  return db.prepare("SELECT id, created_at, summary, length(data) AS bytes FROM revisions ORDER BY id DESC LIMIT 200").all() as (RevisionMeta & { bytes: number })[];
}

export function getRevision(db: Db, id: number) {
  const row = db.prepare("SELECT id, created_at, summary, data FROM revisions WHERE id = ?").get(id) as (RevisionMeta & { data: string }) | undefined;
  if (!row) throw new HttpError(404, "Version introuvable.");
  return row;
}

export function restoreRevision(db: Db, id: number) {
  const row = getRevision(db, id);
  const date = new Date(row.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
  return saveContent(db, JSON.parse(row.data), `Retour à la version du ${date}`);
}

export class ValidationError extends HttpError {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(422, "Le contenu n'est pas valide.");
    this.errors = errors;
  }
}
