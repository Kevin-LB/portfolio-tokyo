import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting, type Db } from "./db";

/**
 * Accès à l'administration : un mot de passe défini par variable
 * d'environnement (ADMIN_PASSWORD, comme sur les autres sites de l'auteur)
 * et une session signée (HMAC, SESSION_SECRET) portée par un cookie
 * HttpOnly, SameSite=Strict, Secure en HTTPS.
 *
 * La session porte une « époque » : « Déconnecter partout » l'incrémente,
 * et toutes les sessions émises avant deviennent invalides.
 */

export const SESSION_HOURS = 12;
const COOKIE = "tour_admin";

let devSecret: string | null = null;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET absent ou trop court (32 caractères au moins : openssl rand -hex 32).");
  // Développement : un secret par processus (les sessions meurent au redémarrage).
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}

/** L'administration est-elle configurée ? (mot de passe d'au moins 12 caractères) */
export function adminConfigured() {
  return (process.env.ADMIN_PASSWORD ?? "").length >= 12;
}

const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();

/** Comparaison à durée constante (sur les empreintes : même la longueur ne fuit pas). */
export function checkPassword(candidate: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!adminConfigured()) return false;
  return timingSafeEqual(digest(candidate), digest(expected));
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function epoch(db: Db) {
  return Number(getSetting(db, "session_epoch") ?? "1");
}

export function bumpEpoch(db: Db) {
  setSetting(db, "session_epoch", String(epoch(db) + 1));
}

export function createSession(db: Db) {
  const expires = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${expires}.${epoch(db)}`;
  return { token: `${payload}.${sign(payload)}`, maxAge: SESSION_HOURS * 3600 };
}

export function verifySession(db: Db, token: string | undefined) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expires, ep, sig] = parts;
  const expected = Buffer.from(sign(`${expires}.${ep}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(expires) > Date.now() && Number(ep) === epoch(db);
}

export function cookieName(secure: boolean) {
  // Le préfixe __Host- impose Secure, Path=/ et pas de Domain : réservé à HTTPS.
  return secure ? `__Host-${COOKIE}` : COOKIE;
}

export function sessionCookie(token: string, maxAge: number, secure: boolean) {
  return `${cookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearCookie(secure: boolean) {
  return `${cookieName(secure)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}
