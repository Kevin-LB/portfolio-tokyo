import { randomBytes } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir, logActivity, now, type Db } from "./db";

/**
 * La médiathèque. Les images sont réduites et converties en WebP dans le
 * navigateur avant l'envoi (aucune dépendance native côté serveur) ; ici, on
 * vérifie le vrai type du fichier (ses premiers octets, pas ce que le client
 * annonce), on lit ses dimensions, et on l'enregistre sous un nom aléatoire
 * sur le volume de données. Pas de SVG (il peut contenir du script).
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type MediaRow = { id: number; file: string; mime: string; width: number; height: number; bytes: number; name: string; alt_fr: string; alt_en: string; created_at: string };

export function mediaDir() {
  return path.join(dataDir(), "media");
}

/** Chemin public d'un fichier de la médiathèque. */
export const mediaUrl = (file: string) => `/media/${file}`;

type Sniffed = { mime: "image/webp" | "image/jpeg" | "image/png"; ext: string; width: number; height: number };

/** Type et dimensions d'après le contenu du fichier. */
export function sniffImage(buf: Buffer): Sniffed | null {
  // PNG : signature puis IHDR.
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString("ascii", 12, 16) === "IHDR") {
    return { mime: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // WebP : RIFF....WEBP puis VP8 / VP8L / VP8X.
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { mime: "image/webp", ext: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { mime: "image/webp", ext: "webp", width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
    if (chunk === "VP8 ") return { mime: "image/webp", ext: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    return null;
  }
  // JPEG : on parcourt les segments jusqu'à un SOF.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { mime: "image/jpeg", ext: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

export function saveMedia(db: Db, buf: Buffer, name: string): MediaRow {
  if (buf.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "Image trop lourde (8 Mo au plus).");
  const info = sniffImage(buf);
  if (!info) throw new HttpError(415, "Format non accepté : WebP, JPEG ou PNG.");
  if (!info.width || !info.height || info.width > 10000 || info.height > 10000) throw new HttpError(400, "Dimensions d'image invalides.");
  const file = `${randomBytes(9).toString("hex")}.${info.ext}`;
  mkdirSync(mediaDir(), { recursive: true });
  writeFileSync(path.join(mediaDir(), file), buf, { flag: "wx" });
  const clean = name.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 80);
  const r = db
    .prepare("INSERT INTO media (file, mime, width, height, bytes, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(file, info.mime, info.width, info.height, buf.length, clean, now());
  logActivity(db, "media.upload", clean || file);
  return db.prepare("SELECT * FROM media WHERE id = ?").get(r.lastInsertRowid) as MediaRow;
}

export function listMedia(db: Db) {
  return db.prepare("SELECT * FROM media ORDER BY id DESC").all() as MediaRow[];
}

export function updateMedia(db: Db, id: number, fields: { alt_fr?: unknown; alt_en?: unknown; name?: unknown }) {
  const row = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow | undefined;
  if (!row) throw new HttpError(404, "Image introuvable.");
  const str = (v: unknown, fallback: string, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
  db.prepare("UPDATE media SET alt_fr = ?, alt_en = ?, name = ? WHERE id = ?").run(
    str(fields.alt_fr, row.alt_fr, 200),
    str(fields.alt_en, row.alt_en, 200),
    str(fields.name, row.name, 80),
    id,
  );
  return db.prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow;
}

/** Supprime une image… si le contenu publié ne l'utilise pas. */
export function deleteMedia(db: Db, id: number, contentJson: string) {
  const row = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow | undefined;
  if (!row) throw new HttpError(404, "Image introuvable.");
  if (contentJson.includes(mediaUrl(row.file))) throw new HttpError(409, "Cette image est utilisée par le contenu publié. Retirez-la d'abord du projet.");
  db.prepare("DELETE FROM media WHERE id = ?").run(id);
  try {
    unlinkSync(path.join(mediaDir(), row.file));
  } catch {
    // Déjà absent du disque : la ligne est retirée quand même.
  }
  logActivity(db, "media.delete", row.name || row.file);
}

/** Erreur à renvoyer telle quelle au client (message lisible). */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
