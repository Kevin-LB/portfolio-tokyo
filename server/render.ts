import { applyContent, CONTENT_ELEMENT_ID, type Content } from "../src/content/store";
import { SITE } from "../src/content/site";
import { body } from "../src/ui/markup";
import { head } from "../src/ui/head";

/**
 * La page d'accueil, rendue avec le contenu publié : les zones injectées
 * au build (balisées) sont réécrites, et le document de contenu est joint
 * en bloc de données JSON (non exécutable : compatible avec la CSP sans
 * script en ligne) pour que le site l'applique sans requête de plus.
 */

const between = (html: string, name: string, inner: string) => {
  const start = `<!--${name}:start-->`;
  const end = `<!--${name}:end-->`;
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < a) return html;
  return html.slice(0, a + start.length) + inner + html.slice(b);
};

/** JSON sûr dans une balise <script> (pas de « </script> » possible). */
export const scriptSafeJson = (json: string) => json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderIndex(template: string, content: Content, json: string) {
  applyContent(content);
  let html = between(template, "head", head("fr"));
  html = between(html, "app", body("fr"));
  const role = SITE.role.fr.replace(/\.$/, "");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(`${SITE.name} — ${role}`)}</title>`);
  const data = `<script type="application/json" id="${CONTENT_ELEMENT_ID}">${scriptSafeJson(json)}</script>`;
  return html.replace("<!--app:end-->", `<!--app:end-->\n    ${data}`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
