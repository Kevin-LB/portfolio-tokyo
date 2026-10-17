import "@fontsource-variable/instrument-sans/wdth.css";
import "../styles/admin.css";
import { api, ApiError } from "./api";
import { append, button, h, icon, toast, type Child, fill } from "./dom";
import { discard, loadContent, loadMedia, onChange, save, state } from "./state";
import { dashboardPage } from "./pages/dashboard";
import { projectEditPage, projectsPage } from "./pages/projects";
import { skillsPage } from "./pages/skills";
import { aboutPage, contactPage, sitePage } from "./pages/texts";
import { mediaPage } from "./pages/media";
import { messagesPage } from "./pages/messages";
import { accountPage, activityPage, historyPage } from "./pages/history";

/**
 * L'administration du portfolio : une page, un routeur minimal sous
 * /admin/…, une barre latérale (comme sur les autres sites de l'auteur), et
 * une barre d'enregistrement qui apparaît dès qu'une rubrique est modifiée.
 */

export type Page = { title: string; body: Child; actions?: Child };

type Route = { path: string; label: string; icon: string; render: (param?: string) => Page | Promise<Page>; badge?: () => number | undefined; group?: string };

const ROUTES: Route[] = [
  { path: "/admin", label: "Tableau de bord", icon: "dashboard", render: dashboardPage },
  { path: "/admin/projets", label: "Projets", icon: "projects", render: projectsPage, badge: () => state.draft?.projects.length, group: "Contenu" },
  { path: "/admin/distributeurs", label: "Compétences", icon: "skills", render: skillsPage, group: "Contenu" },
  { path: "/admin/a-propos", label: "À propos", icon: "about", render: aboutPage, group: "Contenu" },
  { path: "/admin/contact", label: "Contact", icon: "contact", render: contactPage, group: "Contenu" },
  { path: "/admin/textes", label: "Textes du site", icon: "text", render: sitePage, group: "Contenu" },
  { path: "/admin/medias", label: "Médiathèque", icon: "media", render: mediaPage, badge: () => state.media.length, group: "Fichiers" },
  { path: "/admin/messages", label: "Messages", icon: "messages", render: messagesPage, badge: () => state.unread || undefined, group: "Fichiers" },
  { path: "/admin/historique", label: "Historique", icon: "history", render: historyPage, group: "Suivi" },
  { path: "/admin/journal", label: "Journal", icon: "journal", render: activityPage, group: "Suivi" },
  { path: "/admin/compte", label: "Compte et sauvegarde", icon: "account", render: accountPage, group: "Suivi" },
];

const root = document.getElementById("admin")!;

export function navigate(path: string) {
  if (location.pathname !== path) history.pushState(null, "", path);
  void render();
}

function match(pathname: string): { route: Route; param?: string } {
  const p = pathname.replace(/\/+$/, "") || "/admin";
  const edit = p.match(/^\/admin\/projets\/(.+)$/);
  if (edit) return { route: { ...ROUTES[1], render: projectEditPage }, param: decodeURIComponent(edit[1]) };
  return { route: ROUTES.find((r) => r.path === p) ?? ROUTES[0] };
}

/* ── Connexion ─────────────────────────────────────────────────────── */

function loginScreen(configured: boolean) {
  const err = h("p", { class: "a-error", role: "alert", hidden: true });
  const pwd = h("input", { id: "pwd", class: "a-input", type: "password", autocomplete: "current-password", required: true });
  const form = h(
    "form",
    { class: "a-login-card" },
    h("p", { class: "a-login-kicker", text: "333 m — administration" }),
    h("h1", { text: "Connexion" }),
    configured
      ? [h("label", { class: "a-label", for: "pwd", text: "Mot de passe" }), pwd, err, h("button", { type: "submit", class: "a-btn a-btn-primary a-btn-wide" }, h("span", { text: "Se connecter" }))]
      : h("p", { class: "a-hint", text: "L'administration n'est pas configurée : définissez ADMIN_PASSWORD (12 caractères au moins) et SESSION_SECRET dans l'environnement du serveur, puis redémarrez-le." }),
    h("a", { class: "a-link", href: "/", text: "← Retour au site" }),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      await api("login", { method: "POST", body: { password: pwd.value } });
      await start();
    } catch (x) {
      err.textContent = x instanceof Error ? x.message : "Échec de la connexion.";
      err.hidden = false;
      pwd.select();
    }
  });
  fill(root, h("main", { class: "a-login" }, form));
  pwd.focus();
}

/* ── Panneau ───────────────────────────────────────────────────────── */

const shell = {
  nav: h("nav", { class: "a-nav", "aria-label": "Rubriques" }),
  main: h("main", { class: "a-main", id: "contenu", tabindex: "-1" }),
  bar: h("div", { class: "a-savebar", role: "region", "aria-label": "Enregistrement" }),
};

function renderNav() {
  const current = match(location.pathname).route.path;
  const groups = new Map<string, Route[]>();
  for (const r of ROUTES) groups.set(r.group ?? "", [...(groups.get(r.group ?? "") ?? []), r]);
  fill(shell.nav, 
    h("a", { class: "a-brand", href: "/admin", onclick: link("/admin") }, h("span", { class: "a-brand-mark", "aria-hidden": "true", text: "333" }), h("span", { text: "Administration" })),
    ...[...groups].map(([g, routes]) =>
      h(
        "div",
        { class: "a-nav-group" },
        g ? h("p", { class: "a-nav-title", text: g }) : null,
        h(
          "ul",
          null,
          routes.map((r) => {
            const n = r.badge?.();
            const alert = r.path === "/admin/messages" && !!state.unread;
            return h(
              "li",
              null,
              h(
                "a",
                { href: r.path, onclick: link(r.path), "aria-current": r.path === current ? "page" : undefined, class: "a-nav-link" },
                icon(r.icon),
                h("span", { text: r.label }),
                n !== undefined ? h("span", { class: `a-pill${alert ? " is-alert" : ""}`, text: n }) : null,
              ),
            );
          }),
        ),
      ),
    ),
    h(
      "div",
      { class: "a-nav-foot" },
      h("a", { class: "a-nav-link", href: "/", target: "_blank", rel: "noopener" }, icon("external"), h("span", { text: "Voir le site" })),
      h("button", { type: "button", class: "a-nav-link", onclick: logout }, icon("logout"), h("span", { text: "Se déconnecter" })),
    ),
  );
}

function link(path: string) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    document.body.classList.remove("nav-open");
    navigate(path);
  };
}

function renderBar() {
  const n = state.dirty.size;
  shell.bar.classList.toggle("is-visible", n > 0 || state.errors.length > 0);
  fill(shell.bar, 
    h(
      "div",
      { class: "a-savebar-inner" },
      h("div", { class: "a-savebar-text" }, h("strong", { text: n ? "Modifications non publiées" : "Rien à publier" }), n ? h("span", { text: [...state.dirty].join(" · ") }) : null),
      button("Annuler", () => {
        discard();
        void render();
      }, { kind: "ghost", disabled: !n }),
      button("Publier", async () => {
        if (await save()) toast("Publié : le site est à jour.");
        else toast("Rien n'a été publié : voir les erreurs.", "error");
        void render();
      }, { kind: "primary", icon: "check", disabled: !n }),
    ),
    state.errors.length ? h("ul", { class: "a-errors", role: "alert" }, state.errors.slice(0, 12).map((e) => h("li", { text: e })), state.errors.length > 12 ? h("li", { text: `… et ${state.errors.length - 12} autre(s)` }) : null) : null,
  );
}

async function logout() {
  await api("logout", { method: "POST" }).catch(() => undefined);
  location.href = "/admin";
}

let rendering = 0;
async function render() {
  const token = ++rendering;
  const { route, param } = match(location.pathname);
  renderNav();
  let page: Page;
  try {
    page = await route.render(param);
  } catch (e) {
    page = { title: "Erreur", body: h("p", { class: "a-error", text: e instanceof Error ? e.message : String(e) }) };
  }
  if (token !== rendering) return;
  document.title = `${page.title} — administration`;
  fill(shell.main, 
    h(
      "header",
      { class: "a-head" },
      h("button", { type: "button", class: "a-btn a-btn-ghost a-btn-icon a-menu", "aria-label": "Menu", onclick: () => document.body.classList.toggle("nav-open") }, icon("menu")),
      h("h1", { text: page.title }),
      h("div", { class: "a-head-actions" }, page.actions ?? null),
    ),
    page.body,
  );
  shell.main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function start() {
  fill(root, h("p", { class: "boot", text: "Chargement…" }));
  await loadContent();
  await Promise.all([loadMedia(), refreshUnread()]);
  append(root, []);
  fill(root, h("div", { class: "a-app" }, h("a", { class: "a-skip", href: "#contenu", text: "Aller au contenu" }), shell.nav, shell.main, shell.bar));
  onChange(() => {
    renderBar();
    renderNav();
  });
  renderBar();
  await render();
}

export async function refreshUnread() {
  const o = await api<{ messagesUnread: number }>("overview").catch(() => ({ messagesUnread: 0 }));
  state.unread = o.messagesUnread;
}

window.addEventListener("popstate", () => void render());
window.addEventListener("beforeunload", (e) => {
  if (state.dirty.size) e.preventDefault();
});
window.addEventListener("admin:unauthorized", () => {
  toast("Session expirée : reconnectez-vous. Vos modifications non publiées sont perdues.", "error");
  void boot();
});

async function boot() {
  try {
    const s = await api<{ authenticated: boolean; configured: boolean }>("session");
    if (s.authenticated) await start();
    else loginScreen(s.configured);
  } catch (e) {
    fill(root, h("main", { class: "a-login" }, h("div", { class: "a-login-card" }, h("h1", { text: "Administration indisponible" }), h("p", { text: e instanceof ApiError ? e.message : "Le serveur ne répond pas." }), h("a", { class: "a-link", href: "/", text: "← Retour au site" }))));
  }
}

void boot();
