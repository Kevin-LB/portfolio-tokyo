// Résolution des imports sans extension vers les fichiers .ts, pour `node --test`
// (Node exécute le TypeScript directement, mais exige des extensions explicites).
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    if ((specifier.startsWith(".") || specifier.startsWith("/")) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
  },
});
