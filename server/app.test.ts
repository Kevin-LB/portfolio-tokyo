import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Environnement de test : données dans un dossier temporaire, mot de passe connu.
const tmp = mkdtempSync(path.join(tmpdir(), "tour-"));
process.env.DATA_DIR = tmp;
process.env.ADMIN_PASSWORD = "mot-de-passe-de-test-12";
process.env.SESSION_SECRET = "s".repeat(40);

const { createApp } = await import("./app");
const { openDb } = await import("./db");
const { defaultContent } = await import("../src/content/store");
const { SECURITY_HEADERS } = await import("../deploy/security-headers.mjs");
const { sniffImage } = await import("./media");

let server: Server;
let base = "";
const dist = path.join(tmp, "dist");

before(async () => {
  mkdirSync(dist, { recursive: true });
  writeFileSync(path.join(dist, "index.html"), "<html><head><title>x</title><!--head:start-->ZZPERIME<!--head:end--></head><body><!--app:start-->ZZPERIME<!--app:end--></body></html>");
  writeFileSync(path.join(dist, "admin.html"), "<html>admin</html>");
  const handle = createApp({ db: openDb(":memory:"), distDir: dist });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});

after(() => {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
});

const same = () => ({ origin: base, "sec-fetch-site": "same-origin" });
const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...same(), ...headers }, body: JSON.stringify(body) });

async function login() {
  const r = await post("/api/admin/login", { password: process.env.ADMIN_PASSWORD });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie")!.split(";")[0];
}

test("la page d'accueil est rendue avec le contenu publié, en-têtes compris", async () => {
  const r = await fetch(base + "/");
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.ok(html.includes("Kévin Le Breton") && !html.includes("ZZPERIME"));
  assert.ok(html.includes('<script type="application/json" id="contenu-donnees">'));
  assert.ok(!/<script[^>]*>[^<]*<\/script>/.test(html.replace(/<script type="application\/(?:json|ld\+json)"[^>]*>[\s\S]*?<\/script>/g, "")), "aucun script exécutable en ligne");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, k);
});

test("l'API d'administration exige une session", async () => {
  assert.equal((await fetch(base + "/api/admin/content")).status, 401);
  assert.equal((await fetch(base + "/api/admin/messages")).status, 401);
});

test("écriture depuis un autre site : refusée", async () => {
  const r = await fetch(base + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://ailleurs.example", "sec-fetch-site": "cross-site" }, body: "{}" });
  assert.equal(r.status, 403);
  const r2 = await fetch(base + "/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r2.status, 403, "sans origine : refusé");
});

test("connexion : cookie HttpOnly SameSite=Strict, puis publication validée", async () => {
  const cookie = await login();
  const r = await fetch(base + "/api/admin/content", { headers: { cookie } });
  const { revision, content } = (await r.json()) as { revision: number; content: ReturnType<typeof defaultContent> };
  content.site.name = "Kévin L.";
  const ok = await fetch(base + "/api/admin/content", { method: "PUT", headers: { "content-type": "application/json", cookie, ...same() }, body: JSON.stringify({ content, summary: "Nom", base: revision }) });
  assert.equal(ok.status, 200);
  assert.ok((await (await fetch(base + "/")).text()).includes("Kévin L."), "la page suit la publication");
  // Base périmée : conflit.
  const stale = await fetch(base + "/api/admin/content", { method: "PUT", headers: { "content-type": "application/json", cookie, ...same() }, body: JSON.stringify({ content, summary: "x", base: revision }) });
  assert.equal(stale.status, 409);
  // Contenu invalide : refusé, avec les raisons.
  content.contact.email = "nope";
  const bad = await fetch(base + "/api/admin/content", { method: "PUT", headers: { "content-type": "application/json", cookie, ...same() }, body: JSON.stringify({ content, summary: "x" }) });
  assert.equal(bad.status, 422);
  assert.ok(((await bad.json()) as { errors: string[] }).errors.some((e) => e.includes("adresse")));
});

test("contact : enregistré, piège à robots silencieux, fréquence limitée", async () => {
  const msg = { name: "Ada", email: "ada@example.com", subject: "Un projet", message: "Bonjour, un message assez long." };
  assert.equal((await post("/api/contact", msg, { "x-forwarded-for": "1" })).status, 201);
  assert.equal((await post("/api/contact", { ...msg, site: "spam" })).status, 201);
  assert.equal((await post("/api/contact", { ...msg, message: "court" })).status, 400);
  const cookie = await login();
  const list = (await (await fetch(base + "/api/admin/messages", { headers: { cookie } })).json()) as { name: string }[];
  assert.equal(list.length, 1, "le message piégé n'est pas gardé");
  let last = 0;
  for (let i = 0; i < 4; i++) last = (await post("/api/contact", msg)).status;
  assert.equal(last, 429);
});

test("médiathèque : le vrai type du fichier compte, pas ce qu'annonce le client", async () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000010000000080806000000", "hex");
  assert.deepEqual(sniffImage(Buffer.concat([png, Buffer.alloc(16)]))?.width, 16);
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
  const cookie = await login();
  const svg = await fetch(base + "/api/admin/media", { method: "POST", headers: { "content-type": "image/png", cookie, ...same() }, body: "<svg onload=alert(1)></svg>" });
  assert.equal(svg.status, 415);
  const ok = await fetch(base + "/api/admin/media", { method: "POST", headers: { "content-type": "image/png", cookie, ...same() }, body: Buffer.concat([png, Buffer.alloc(64)]) });
  assert.equal(ok.status, 201);
  const row = (await ok.json()) as { file: string };
  const served = await fetch(`${base}/media/${row.file}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal((await fetch(`${base}/media/..%2F..%2Fetc%2Fpasswd`)).status, 404);
  assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
});

test("connexion : cinq échecs, puis blocage", async () => {
  let status = 0;
  for (let i = 0; i < 6; i++) status = (await post("/api/admin/login", { password: "faux" }, { "x-forwarded-for": "9" })).status;
  assert.equal(status, 429);
});
