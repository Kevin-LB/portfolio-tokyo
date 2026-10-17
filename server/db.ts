import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * La base : un fichier SQLite sur le volume de données (comme les autres
 * sites de l'auteur sur Dokploy), via le module SQLite intégré à Node — pas
 * de dépendance native à compiler, pas de service à côté.
 *
 *   revisions : chaque enregistrement du contenu (on peut revenir en arrière)
 *   media     : images envoyées depuis l'administration
 *   messages  : formulaire « Envoyer un signal »
 *   activity  : journal de l'administration
 *   settings  : petites valeurs (époque des sessions…)
 */

export type Db = DatabaseSync;

export function dataDir() {
  return path.resolve(process.env.DATA_DIR ?? "./.data");
}

export function openDb(file = path.join(dataDir(), "tour.db")): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY,
      file TEXT NOT NULL UNIQUE,
      mime TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      bytes INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      alt_fr TEXT NOT NULL DEFAULT '',
      alt_en TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      handled INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

export const now = () => new Date().toISOString();

export function getSetting(db: Db, key: string) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(db: Db, key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function logActivity(db: Db, action: string, detail = "") {
  db.prepare("INSERT INTO activity (at, action, detail) VALUES (?, ?, ?)").run(now(), action, detail.slice(0, 300));
  // Le journal garde ses 500 dernières lignes.
  db.prepare("DELETE FROM activity WHERE id NOT IN (SELECT id FROM activity ORDER BY id DESC LIMIT 500)").run();
}
