import { api } from "../api";
import { formatDate, h, icon } from "../dom";
import type { Page } from "../main";
import { navigate, refreshUnread } from "../main";
import { missingEnglish, state } from "../state";
import { ACTIONS } from "./history";

type Overview = { messagesUnread: number; messages: number; media: number; revisions: number; lastRevision: { id: number; created_at: string; summary: string } | null; activity: { at: string; action: string; detail: string }[] };

const go = (path: string) => (e: MouseEvent) => {
  e.preventDefault();
  navigate(path);
};

function stat(label: string, value: string | number, href: string, note?: string, alert = false) {
  return h("a", { class: `a-stat${alert ? " is-alert" : ""}`, href, onclick: go(href) }, h("span", { class: "a-stat-value", text: value }), h("span", { class: "a-stat-label", text: label }), note ? h("span", { class: "a-stat-note", text: note }) : null);
}

export async function dashboardPage(): Promise<Page> {
  const o = await api<Overview>("overview");
  await refreshUnread();
  const c = state.draft;
  const visible = c.projects.filter((p) => !p.hidden);
  const deck = visible.filter((p) => p.featured);
  const todo = missingEnglish(c);
  return {
    title: "Tableau de bord",
    actions: h("a", { class: "a-btn a-btn-primary", href: "/admin/projets/nouveau", onclick: go("/admin/projets/nouveau") }, icon("plus"), h("span", { text: "Nouveau projet" })),
    body: h(
      "div",
      { class: "a-stack" },
      h(
        "div",
        { class: "a-stats" },
        stat("Projets en ligne", visible.length, "/admin/projets", `${c.projects.length - visible.length} brouillon(s) · Main Deck ${deck.length}/4`, deck.length !== 4),
        stat("Messages à traiter", o.messagesUnread, "/admin/messages", `${o.messages} au total`, o.messagesUnread > 0),
        stat("Images", o.media, "/admin/medias"),
        stat("Versions publiées", o.revisions, "/admin/historique", o.lastRevision ? `Dernière : ${formatDate(o.lastRevision.created_at)}` : undefined),
      ),
      h(
        "div",
        { class: "a-cols" },
        h(
          "section",
          { class: "a-card" },
          h("h2", { class: "a-card-title", text: "Sur les écrans du Main Deck" }),
          h(
            "ol",
            { class: "a-deck" },
            deck.map((p, i) =>
              h(
                "li",
                null,
                h("span", { class: "a-deck-face", text: `Face ${i + 1}` }),
                p.image ? h("img", { src: p.image.src, alt: "", width: 80, height: 50, loading: "lazy" }) : h("span", { class: "a-thumb-empty" }),
                h("a", { href: `/admin/projets/${encodeURIComponent(p.slug)}`, onclick: go(`/admin/projets/${encodeURIComponent(p.slug)}`), text: p.title }),
              ),
            ),
          ),
          deck.length !== 4 ? h("p", { class: "a-error", text: `Il faut exactement 4 projets sur le Main Deck (actuellement ${deck.length}).` }) : null,
        ),
        h(
          "section",
          { class: "a-card" },
          h("h2", { class: "a-card-title", text: "À traduire en anglais" }),
          todo.length
            ? h("ul", { class: "a-list" }, todo.slice(0, 8).map((t) => h("li", null, h("a", { href: t.href, onclick: go(t.href), text: t.where }))), todo.length > 8 ? h("li", { class: "a-hint", text: `… et ${todo.length - 8} autre(s)` }) : null)
            : h("p", { class: "a-ok", text: "Tout est traduit." }),
          h("p", { class: "a-hint", text: "Un texte sans version anglaise s'affiche en français sur la version anglaise du site." }),
        ),
      ),
      h(
        "section",
        { class: "a-card" },
        h("h2", { class: "a-card-title", text: "Activité récente" }),
        o.activity.length
          ? h("ul", { class: "a-timeline" }, o.activity.map((a) => h("li", null, h("time", { text: formatDate(a.at) }), h("span", { text: ACTIONS[a.action] ?? a.action }), a.detail ? h("span", { class: "a-hint", text: a.detail }) : null)))
          : h("p", { class: "a-hint", text: "Rien pour l'instant." }),
      ),
    ),
  };
}
