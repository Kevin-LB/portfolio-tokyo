import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SECURITY_HEADERS } from "../deploy/security-headers.mjs";
import { adminConfigured, bumpEpoch, checkPassword, clearCookie, cookieName, createSession, readCookie, sessionCookie, verifySession } from "./auth";
import { currentContent, getRevision, listRevisions, restoreRevision, saveContent, ValidationError } from "./content";
import { logActivity, type Db } from "./db";
import { deleteMedia, HttpError, listMedia, MAX_UPLOAD_BYTES, mediaDir, saveMedia, updateMedia } from "./media";
import { deleteMessage, listMessages, parseMessage, setHandled, storeMessage } from "./messages";
import { RateLimiter } from "./rate-limit";
import { renderIndex } from "./render";

/**
 * Le serveur du site : la page d'accueil rendue avec le contenu publié, les
 * fichiers du build, la médiathèque, le formulaire de contact, et l'API de
 * l'administration. Même gestionnaire en production (server/index.ts) et en
 * développement (monté dans Vite, vite.config.ts).
 *
 * Sécurité, en bref :
 * - toute écriture vérifie l'origine (même site) : pas de requête forgée
 *   depuis un autre site, en plus du cookie SameSite=Strict ;
 * - l'API d'administration exige une session valide (sauf connexion) ;
 * - connexion et contact sont limités en fréquence ;
 * - les corps de requête sont bornés ; les fichiers servis ne sortent jamais
 *   de leur dossier ; rien n'est interprété comme HTML venant du client.
 */

type Req = IncomingMessage;
type Res = ServerResponse;
type Next = (err?: unknown) => void;

export type AppOptions = {
  db: Db;
  /** Dossier du build (production). Absent en développement : Vite sert le reste. */
  distDir?: string;
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

const loginLimiter = new RateLimiter(5, 15 * 60_000);
const loginGlobal = new RateLimiter(40, 15 * 60_000);
const contactLimiter = new RateLimiter(3, 10 * 60_000);
const contactGlobal = new RateLimiter(40, 60 * 60_000);

const isHttps = (req: Req) => (req.headers["x-forwarded-proto"] ?? "").toString().split(",")[0].trim() === "https" || (req.socket as { encrypted?: boolean }).encrypted === true;

function clientIp(req: Req) {
  if (process.env.TRUST_PROXY === "1") {
    const fwd = (req.headers["x-forwarded-for"] ?? "").toString().split(",")[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? "?";
}

function baseHeaders(req: Req, res: Res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

function send(res: Res, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(body);
}

const json = (res: Res, status: number, data: unknown, extra: Record<string, string> = {}) =>
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8", { "Cache-Control": "no-store", ...extra });

function readBody(req: Req, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? "0");
    if (declared > limit) return reject(new HttpError(413, "Requête trop volumineuse."));
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Requête trop volumineuse."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req: Req, limit = 1_000_000) {
  if (!(req.headers["content-type"] ?? "").includes("application/json")) throw new HttpError(415, "JSON attendu.");
  try {
    return JSON.parse((await readBody(req, limit)).toString("utf8")) as unknown;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "JSON invalide.");
  }
}

/** Écriture venue du site lui-même ? (navigateur moderne : Sec-Fetch-Site ; sinon Origin.) */
function sameOrigin(req: Req) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin") return false;
  const origin = req.headers.origin;
  if (!origin) return !!site; // ni l'un ni l'autre : refusé
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function safeJoin(base: string, rel: string) {
  const target = path.resolve(base, "." + path.posix.normalize("/" + rel));
  return target === base || target.startsWith(base + path.sep) ? target : null;
}

function serveFile(req: Req, res: Res, file: string, cache: string) {
  const ext = path.extname(file).toLowerCase();
  const st = statSync(file);
  res.statusCode = 200;
  res.setHeader("Content-Type", TYPES[ext] ?? "application/octet-stream");
  res.setHeader("Content-Length", st.size);
  res.setHeader("Cache-Control", cache);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

export function createApp(opts: AppOptions) {
  const { db, distDir } = opts;
  const indexTemplate = distDir && existsSync(path.join(distDir, "index.html")) ? readFileSync(path.join(distDir, "index.html"), "utf8") : null;
  let rendered: { id: number; html: string } | null = null;

  const authed = (req: Req) => verifySession(db, readCookie(req.headers.cookie, cookieName(isHttps(req))));

  async function admin(req: Req, res: Res, route: string) {
    const method = req.method ?? "GET";
    const secure = isHttps(req);
    if (route === "session" && method === "GET") return json(res, 200, { authenticated: authed(req), configured: adminConfigured() });
    if (route === "login" && method === "POST") {
      if (!adminConfigured()) throw new HttpError(503, "Administration non configurée : définir ADMIN_PASSWORD (12 caractères au moins) et SESSION_SECRET.");
      const ip = clientIp(req);
      if (loginLimiter.blocked(ip) || loginGlobal.blocked("all")) {
        throw new HttpError(429, `Trop de tentatives. Réessayer dans ${Math.ceil(Math.max(loginLimiter.retryAfter(ip), 60) / 60)} min.`);
      }
      const body = (await readJson(req, 4096)) as { password?: unknown };
      if (typeof body.password !== "string" || !checkPassword(body.password)) {
        loginLimiter.hit(ip);
        loginGlobal.hit("all");
        logActivity(db, "login.fail");
        throw new HttpError(401, "Mot de passe incorrect.");
      }
      loginLimiter.reset(ip);
      const s = createSession(db);
      logActivity(db, "login");
      return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(s.token, s.maxAge, secure) });
    }
    if (!authed(req)) throw new HttpError(401, "Session expirée : reconnectez-vous.");
    if (route === "logout" && method === "POST") return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie(secure) });
    if (route === "logout-all" && method === "POST") {
      bumpEpoch(db);
      logActivity(db, "logout.all");
      return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie(secure) });
    }

    if (route === "overview" && method === "GET") {
      const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
      const last = db.prepare("SELECT id, created_at, summary FROM revisions ORDER BY id DESC LIMIT 1").get();
      return json(res, 200, {
        messagesUnread: count("SELECT COUNT(*) AS n FROM messages WHERE handled = 0"),
        messages: count("SELECT COUNT(*) AS n FROM messages"),
        media: count("SELECT COUNT(*) AS n FROM media"),
        revisions: count("SELECT COUNT(*) AS n FROM revisions"),
        lastRevision: last ?? null,
        activity: db.prepare("SELECT at, action, detail FROM activity ORDER BY id DESC LIMIT 8").all(),
      });
    }
    if (route === "content" && method === "GET") {
      const cur = currentContent(db);
      return json(res, 200, { revision: cur.id, content: cur.content });
    }
    if (route === "content" && method === "PUT") {
      const body = (await readJson(req)) as { content?: unknown; summary?: unknown; base?: unknown };
      const cur = currentContent(db);
      if (typeof body.base === "number" && body.base !== cur.id) {
        throw new HttpError(409, "Le contenu a été modifié ailleurs (autre onglet ?) depuis l'ouverture. Rechargez avant d'enregistrer.");
      }
      const saved = saveContent(db, body.content, typeof body.summary === "string" ? body.summary : "");
      return json(res, 200, { revision: saved.id, content: saved.content });
    }
    if (route === "revisions" && method === "GET") return json(res, 200, listRevisions(db));
    let m = route.match(/^revisions\/(\d+)(\/restore)?$/);
    if (m && method === "GET" && !m[2]) {
      const r = getRevision(db, Number(m[1]));
      return json(res, 200, { ...r, data: JSON.parse(r.data) });
    }
    if (m && method === "POST" && m[2]) {
      const saved = restoreRevision(db, Number(m[1]));
      return json(res, 200, { revision: saved.id, content: saved.content });
    }

    if (route === "media" && method === "GET") return json(res, 200, listMedia(db));
    if (route === "media" && method === "POST") {
      const name = decodeURIComponent((req.headers["x-file-name"] ?? "").toString()).slice(0, 120);
      const row = saveMedia(db, await readBody(req, MAX_UPLOAD_BYTES), name);
      return json(res, 201, row);
    }
    m = route.match(/^media\/(\d+)$/);
    if (m && method === "PATCH") return json(res, 200, updateMedia(db, Number(m[1]), (await readJson(req, 8192)) as Record<string, unknown>));
    if (m && method === "DELETE") {
      deleteMedia(db, Number(m[1]), currentContent(db).json);
      return json(res, 200, { ok: true });
    }

    if (route === "messages" && method === "GET") return json(res, 200, listMessages(db));
    m = route.match(/^messages\/(\d+)$/);
    if (m && method === "PATCH") {
      const body = (await readJson(req, 1024)) as { handled?: unknown };
      setHandled(db, Number(m[1]), body.handled === true);
      return json(res, 200, { ok: true });
    }
    if (m && method === "DELETE") {
      deleteMessage(db, Number(m[1]));
      return json(res, 200, { ok: true });
    }

    if (route === "activity" && method === "GET") return json(res, 200, db.prepare("SELECT id, at, action, detail FROM activity ORDER BY id DESC LIMIT 200").all());
    if (route === "export" && method === "GET") {
      const cur = currentContent(db);
      const date = new Date().toISOString().slice(0, 10);
      logActivity(db, "export");
      return send(res, 200, JSON.stringify({ exportedAt: new Date().toISOString(), revision: cur.id, content: cur.content }, null, 2), "application/json; charset=utf-8", {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="portfolio-contenu-${date}.json"`,
      });
    }
    if (route === "import" && method === "POST") {
      const body = (await readJson(req)) as { content?: unknown };
      const saved = saveContent(db, body.content, "Import d'une sauvegarde");
      return json(res, 200, { revision: saved.id, content: saved.content });
    }
    throw new HttpError(404, "Route inconnue.");
  }

  async function contact(req: Req, res: Res) {
    const ip = clientIp(req);
    if (contactLimiter.blocked(ip) || contactGlobal.blocked("all")) throw new HttpError(429, "Trop de messages.");
    const { msg, trap } = parseMessage(await readJson(req, 16_384));
    contactLimiter.hit(ip);
    contactGlobal.hit("all");
    // Piège à robots rempli : on répond comme si tout allait bien, sans rien garder.
    if (!trap) storeMessage(db, msg);
    return json(res, 201, { ok: true });
  }

  return async function handle(req: Req, res: Res, next?: Next) {
    const url = new URL(req.url ?? "/", "http://local");
    const p = url.pathname;
    const method = req.method ?? "GET";
    try {
      if (p.startsWith("/api/")) {
        baseHeaders(req, res);
        if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) throw new HttpError(403, "Origine refusée.");
        if (p === "/api/content" && method === "GET") return json(res, 200, currentContent(db).content, { "Cache-Control": "no-cache" });
        if (p === "/api/contact" && method === "POST") return await contact(req, res);
        if (p.startsWith("/api/admin/")) return await admin(req, res, p.slice("/api/admin/".length));
        throw new HttpError(404, "Route inconnue.");
      }
      if (p.startsWith("/media/") && (method === "GET" || method === "HEAD")) {
        baseHeaders(req, res);
        const file = p.slice("/media/".length);
        const full = /^[a-f0-9]{18}\.(?:webp|jpg|png)$/.test(file) ? safeJoin(mediaDir(), file) : null;
        if (!full || !existsSync(full)) throw new HttpError(404, "Image introuvable.");
        return serveFile(req, res, full, "public, max-age=31536000, immutable");
      }
      if (!distDir) return next ? next() : send(res, 404, "Introuvable", "text/plain; charset=utf-8");

      // Production : le reste du site.
      if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "Méthode non autorisée.");
      baseHeaders(req, res);
      if ((p === "/" || p === "/index.html") && indexTemplate) {
        const cur = currentContent(db);
        if (!rendered || rendered.id !== cur.id) rendered = { id: cur.id, html: renderIndex(indexTemplate, cur.content, cur.json) };
        return send(res, 200, method === "HEAD" ? "" : rendered.html, "text/html; charset=utf-8", { "Cache-Control": "no-cache" });
      }
      if (p === "/admin" || p.startsWith("/admin/")) {
        return serveFile(req, res, path.join(distDir, "admin.html"), "no-store");
      }
      const full = safeJoin(distDir, decodeURIComponent(p));
      if (full && !path.basename(full).startsWith(".") && existsSync(full) && statSync(full).isFile()) {
        return serveFile(req, res, full, p.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
      }
      throw new HttpError(404, "Page introuvable.");
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof ValidationError) return json(res, e.status, { error: e.message, errors: e.errors });
      if (e instanceof HttpError) {
        if (p.startsWith("/api/")) return json(res, e.status, { error: e.message });
        return send(res, e.status, e.message, "text/plain; charset=utf-8");
      }
      console.error(e);
      return p.startsWith("/api/") ? json(res, 500, { error: "Erreur du serveur." }) : send(res, 500, "Erreur du serveur.", "text/plain; charset=utf-8");
    }
  };
}
