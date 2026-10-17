import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminConfigured } from "./auth";
import { createApp } from "./app";
import { currentContent } from "./content";
import { openDb } from "./db";
import { purgeOldMessages } from "./messages";

/**
 * Point d'entrée de production : `node dist-server/index.js`.
 *
 * Variables d'environnement :
 *   PORT            port d'écoute (8080)
 *   DATA_DIR        base SQLite et médiathèque (volume persistant)
 *   ADMIN_PASSWORD  mot de passe de l'administration (12 caractères au moins)
 *   SESSION_SECRET  secret des sessions (openssl rand -hex 32)
 *   TRUST_PROXY=1   derrière Traefik : l'adresse du client vient de X-Forwarded-For
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(process.env.DIST_DIR ?? path.join(here, "../dist"));
const db = openDb();
currentContent(db); // crée la première révision si la base est neuve
purgeOldMessages(db);
setInterval(() => purgeOldMessages(db), 24 * 3600_000).unref();

const handle = createApp({ db, distDir });
const server = createServer((req, res) => void handle(req, res));
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => {
  console.log(`Portfolio : http://localhost:${port} — administration ${adminConfigured() ? "active" : "désactivée (ADMIN_PASSWORD absent)"}`);
});

const stop = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
