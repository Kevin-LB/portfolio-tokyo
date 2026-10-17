import { logActivity, now, type Db } from "./db";
import { HttpError } from "./media";

/**
 * Les messages du formulaire « Envoyer un signal ». On garde ce que la
 * personne a écrit (nom, adresse, objet, message) et la date : rien d'autre
 * (ni adresse IP, ni navigateur). Effacés au plus tard un an après
 * réception, comme l'annonce la politique de confidentialité.
 */

export type MessageRow = { id: number; created_at: string; name: string; email: string; subject: string; body: string; handled: number };

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
export const RETENTION_DAYS = 365;

export function parseMessage(input: unknown) {
  const o = (input ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim() : "").slice(0, max);
  const msg = { name: s(o.name, 120), email: s(o.email, 200), subject: s(o.subject, 80), body: s(o.message, 4000) };
  const trap = s(o.site, 200);
  if (!msg.name || !EMAIL.test(msg.email) || msg.body.length < 12) throw new HttpError(400, "Message incomplet.");
  // Contrôles d'en-tête : pas de saut de ligne dans les champs courts.
  if (/[\r\n]/.test(msg.name + msg.email + msg.subject)) throw new HttpError(400, "Message invalide.");
  return { msg, trap };
}

export function storeMessage(db: Db, msg: { name: string; email: string; subject: string; body: string }) {
  db.prepare("INSERT INTO messages (created_at, name, email, subject, body) VALUES (?, ?, ?, ?, ?)").run(now(), msg.name, msg.email, msg.subject, msg.body);
}

export function purgeOldMessages(db: Db) {
  const limit = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
  const r = db.prepare("DELETE FROM messages WHERE created_at < ?").run(limit);
  if (Number(r.changes) > 0) logActivity(db, "messages.purge", `${r.changes} message(s) de plus d'un an effacé(s)`);
}

export function listMessages(db: Db) {
  return db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 500").all() as MessageRow[];
}

export function setHandled(db: Db, id: number, handled: boolean) {
  const r = db.prepare("UPDATE messages SET handled = ? WHERE id = ?").run(handled ? 1 : 0, id);
  if (!r.changes) throw new HttpError(404, "Message introuvable.");
}

export function deleteMessage(db: Db, id: number) {
  const r = db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Message introuvable.");
  logActivity(db, "message.delete");
}
