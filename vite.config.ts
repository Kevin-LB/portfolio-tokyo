import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { body } from "./src/ui/markup";
import { head } from "./src/ui/head";
import { SECURITY_HEADERS } from "./deploy/security-headers.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Outil de développement : la page peut envoyer une capture de son canvas
 * (POST /__shot?name=…) qui est écrite dans `.shots/`. Sert à vérifier le
 * rendu image par image, même quand aucun navigateur n'est visible.
 * N'existe qu'en `vite dev`.
 */
function shots(): Plugin {
  return {
    name: "dev-shots",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__shot", (req, res) => {
        if (req.method !== "POST") return res.end();
        const url = new URL(req.url ?? "", "http://x");
        const name = (url.searchParams.get("name") ?? "shot").replace(/[^a-z0-9_-]/gi, "_");
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          const data = Buffer.concat(chunks).toString();
          const b64 = data.slice(data.indexOf(",") + 1);
          const dir = join(process.cwd(), ".shots");
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.jpg`), Buffer.from(b64, "base64"));
          res.end("ok");
        });
      });
    },
  };
}

/**
 * Développement : le serveur du site (API, administration, médiathèque) est
 * monté dans Vite. `/admin/*` sert la page d'administration.
 */
function backend(): Plugin {
  let handle: ((req: unknown, res: unknown, next: () => void) => Promise<void>) | null = null;
  const load = async (server: ViteDevServer) => {
    if (handle) return handle;
    const [{ createApp }, { openDb }] = await Promise.all([server.ssrLoadModule("/server/app.ts"), server.ssrLoadModule("/server/db.ts")]);
    handle = createApp({ db: openDb() }) as typeof handle;
    return handle!;
  };
  return {
    name: "backend",
    apply: "serve",
    configureServer(server) {
      // Variables du fichier .env (ADMIN_PASSWORD…) pour le serveur, sans écraser l'environnement.
      for (const [k, v] of Object.entries(loadEnv(server.config.mode, process.cwd(), ""))) process.env[k] ??= v;
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "/";
        if (url === "/admin" || /^\/admin\/(?!.*\.[a-z0-9]+$)/.test(url.split("?")[0])) {
          req.url = "/admin.html";
          return next();
        }
        if (url.startsWith("/api/") || url.startsWith("/media/")) return (await load(server))(req, res, next);
        next();
      });
    },
  };
}

/** Injecte le contenu sémantique (et les métadonnées) dans le HTML servi. */
function content(): Plugin {
  return {
    name: "content",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!ctx.filename.endsWith("index.html")) return html;
        // Zones balisées : le serveur les réécrit avec le contenu publié.
        return html.replace("<!--head-->", `<!--head:start-->${head("fr")}<!--head:end-->`).replace("<!--app-->", `<!--app:start-->${body("fr")}<!--app:end-->`);
      },
    },
  };
}

export default defineConfig(({ isSsrBuild }) => {
  const ssr = isSsrBuild || process.argv.includes("--ssr");
  return {
  plugins: [content(), shots(), backend()],
  server: { port: 3003, strictPort: true },
  // `vite preview` sert le build avec les mêmes en-têtes que la production.
  preview: { headers: SECURITY_HEADERS },
  // `vite build --ssr` : le serveur (Node), sans dépendance externe à embarquer.
  ...(ssr ? { ssr: { target: "node" as const } } : {}),
  build: ssr
    ? { ssr: "server/index.ts", outDir: "dist-server", target: "node24", emptyOutDir: true, copyPublicDir: false, sourcemap: false }
    : {
    target: "es2022",
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: "index.html",
        mentions: "mentions-legales.html",
        confidentialite: "confidentialite.html",
        admin: "admin.html",
      },
    },
  },
};
});
