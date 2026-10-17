import type { Content } from "../../content/store";
import { api } from "../api";
import { button, confirmDialog, formatBytes, formatDate, h, icon, toast, fill } from "../dom";
import type { Page } from "../main";
import { navigate } from "../main";
import { adopt, state } from "../state";

export const ACTIONS: Record<string, string> = {
  login: "Connexion",
  "login.fail": "Mot de passe refusé",
  "logout.all": "Toutes les sessions déconnectées",
  "content.save": "Publication",
  "media.upload": "Image ajoutée",
  "media.delete": "Image supprimée",
  "message.delete": "Message supprimé",
  "messages.purge": "Messages anciens effacés",
  export: "Sauvegarde téléchargée",
};

type Rev = { id: number; created_at: string; summary: string; bytes: number };

/** Ce qui diffère entre deux versions, en mots. */
function describe(a: Content, b: Content) {
  const out: string[] = [];
  for (const k of ["site", "about", "contact", "skills"] as const) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push({ site: "Textes du site", about: "À propos", contact: "Contact", skills: "Compétences" }[k]);
  const byA = new Map(a.projects.map((p) => [p.slug, p]));
  const byB = new Map(b.projects.map((p) => [p.slug, p]));
  for (const [s, p] of byA) if (!byB.has(s)) out.push(`« ${p.title} » absent aujourd'hui`);
  for (const [s, p] of byB) if (!byA.has(s)) out.push(`« ${p.title} » n'existait pas`);
  for (const [s, p] of byA) if (byB.has(s) && JSON.stringify(p) !== JSON.stringify(byB.get(s))) out.push(`« ${p.title} » différent`);
  if (a.projects.map((p) => p.slug).join() !== b.projects.map((p) => p.slug).join()) out.push("ordre des projets");
  return out;
}

export async function historyPage(): Promise<Page> {
  const revs = await api<Rev[]>("revisions");
  const detail = h("div", { class: "a-card a-rev-detail", hidden: true });
  const show = async (r: Rev) => {
    const full = await api<{ data: Content }>(`revisions/${r.id}`);
    const diff = describe(full.data, state.published!);
    detail.hidden = false;
    fill(detail, 
      h("h2", { class: "a-card-title", text: `Version du ${formatDate(r.created_at)}` }),
      h("p", { text: r.summary }),
      h("p", { class: "a-label", text: "Par rapport au site actuel :" }),
      diff.length ? h("ul", { class: "a-list" }, diff.map((d) => h("li", { text: d }))) : h("p", { class: "a-ok", text: "Identique au site actuel." }),
      r.id === state.revision
        ? h("p", { class: "a-badge a-badge-accent", text: "Version en ligne" })
        : button("Revenir à cette version", async () => {
            if (state.dirty.size && !(await confirmDialog("Abandonner le brouillon ?", "Des modifications non publiées seront perdues.", "Continuer"))) return;
            if (!(await confirmDialog("Revenir à cette version ?", "Elle sera republiée telle quelle. La version actuelle reste dans l'historique.", "Republier", false))) return;
            const res = await api<{ revision: number; content: Content }>(`revisions/${r.id}/restore`, { method: "POST" });
            adopt(res.revision, res.content);
            toast("Version republiée");
            navigate("/admin/historique");
          }, { kind: "primary", icon: "history" }),
    );
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  return {
    title: "Historique des publications",
    body: h(
      "div",
      { class: "a-stack" },
      h("p", { class: "a-hint", text: "Chaque publication est gardée (les 200 dernières). Revenir à une version la republie, sans rien effacer." }),
      h(
        "div",
        { class: "a-cols" },
        h(
          "ol",
          { class: "a-revs" },
          revs.map((r) =>
            h(
              "li",
              null,
              h("button", { type: "button", class: "a-rev", onclick: () => show(r) }, h("time", { text: formatDate(r.created_at) }), h("span", { text: r.summary }), r.id === state.revision ? h("span", { class: "a-badge a-badge-accent", text: "En ligne" }) : h("span", { class: "a-hint", text: formatBytes(r.bytes) })),
            ),
          ),
        ),
        detail,
      ),
    ),
  };
}

export async function activityPage(): Promise<Page> {
  const rows = await api<{ id: number; at: string; action: string; detail: string }[]>("activity");
  return {
    title: "Journal",
    body: h(
      "div",
      { class: "a-card" },
      rows.length
        ? h("table", { class: "a-table" }, h("thead", null, h("tr", null, h("th", { text: "Date" }), h("th", { text: "Action" }), h("th", { text: "Détail" }))), h("tbody", null, rows.map((r) => h("tr", null, h("td", { text: formatDate(r.at) }), h("td", { text: ACTIONS[r.action] ?? r.action }), h("td", { text: r.detail })))))
        : h("p", { class: "a-hint", text: "Journal vide." }),
    ),
  };
}

export function accountPage(): Page {
  const file = h("input", { type: "file", accept: "application/json,.json", class: "a-file" });
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text()) as { content?: unknown };
      const content = parsed.content ?? parsed;
      if (!(await confirmDialog("Importer cette sauvegarde ?", "Son contenu sera publié tel quel (après vérification). La version actuelle reste dans l'historique.", "Importer et publier", false))) return;
      const res = await api<{ revision: number; content: Content }>("import", { method: "POST", body: { content } });
      adopt(res.revision, res.content);
      toast("Sauvegarde importée et publiée");
    } catch (e) {
      const errs = (e as { errors?: string[] }).errors;
      toast(errs?.length ? `Import refusé : ${errs[0]}` : e instanceof Error ? e.message : "Fichier illisible", "error");
    } finally {
      file.value = "";
    }
  });
  return {
    title: "Compte et sauvegarde",
    body: h(
      "div",
      { class: "a-stack" },
      h(
        "section",
        { class: "a-card" },
        h("h2", { class: "a-card-title", text: "Sauvegarde du contenu" }),
        h("p", { class: "a-hint", text: "Un fichier JSON avec tous les textes et projets (pas les images : elles restent sur le volume du serveur)." }),
        h("div", { class: "a-row-tools" }, h("a", { class: "a-btn a-btn-quiet", href: "/api/admin/export", download: "" }, icon("download"), h("span", { text: "Télécharger une sauvegarde" })), h("label", { class: "a-btn a-btn-quiet" }, icon("upload"), h("span", { text: "Importer une sauvegarde" }), file)),
      ),
      h(
        "section",
        { class: "a-card" },
        h("h2", { class: "a-card-title", text: "Sessions" }),
        h("p", { class: "a-hint", text: "Une session dure 12 heures. Le mot de passe se change dans les variables d'environnement du serveur (ADMIN_PASSWORD), comme sur les autres sites." }),
        h(
          "div",
          { class: "a-row-tools" },
          button("Déconnecter toutes les sessions", async () => {
            if (!(await confirmDialog("Déconnecter partout ?", "Toutes les sessions ouvertes, y compris celle-ci, seront fermées.", "Déconnecter"))) return;
            await api("logout-all", { method: "POST" });
            location.href = "/admin";
          }, { icon: "logout", kind: "danger" }),
        ),
      ),
    ),
  };
}
