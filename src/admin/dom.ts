/**
 * Construction du DOM de l'administration. Tout texte passe par
 * `textContent` (jamais `innerHTML`) : un contenu saisi ou reçu ne peut pas
 * devenir du HTML.
 */

export type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> & { class?: string; text?: string | number };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "text") el.textContent = String(v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "selected" || k === "hidden") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

/** Remplace les enfants (les valeurs vides sont ignorées). */
export function fill(el: Element, ...children: Child[]) {
  el.replaceChildren();
  append(el, children);
}

export function append(el: Element, children: Child[]) {
  for (const c of children.flat(Infinity as 1) as Child[]) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

const PATHS: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  projects: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4",
  skills: "M8 3h8v3H8zM7 6h10v15H7zM10 10h4M10 14h4",
  about: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  contact: "M3 6h18v12H3zM3 7l9 6 9-6",
  text: "M5 6V4h14v2M12 4v16M9 20h6",
  media: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  messages: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2",
  journal: "M6 4h12v16H6zM9 8h6M9 12h6M9 16h4",
  account: "M14 10a4 4 0 1 0-4 4l-6 6v2h3l1-1v-2h2v-2h2zM15.5 7.5h.01",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M18 13l-6 6-6-6",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 6.1A9.7 9.7 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.4 6.5C3.7 8.3 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  check: "M5 12l5 5 9-10",
  close: "M6 6l12 12M18 6L6 18",
  logout: "M10 4H4v16h6M15 8l4 4-4 4M19 12H9",
  menu: "M4 6h16M4 12h16M4 18h16",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  back: "M15 6l-6 6 6 6",
  warn: "M12 3l10 18H2zM12 10v4M12 17.5v.01",
};

export function icon(name: keyof typeof PATHS | string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[name] ?? PATHS.dashboard);
  svg.append(path);
  return svg;
}

/** Bouton (avec icône facultative). */
export function button(label: string, onclick: (e: MouseEvent) => void, opts: { kind?: "primary" | "quiet" | "danger" | "ghost"; icon?: string; title?: string; disabled?: boolean; iconOnly?: boolean } = {}) {
  return h(
    "button",
    {
      type: "button",
      class: `a-btn a-btn-${opts.kind ?? "quiet"}${opts.iconOnly ? " a-btn-icon" : ""}`,
      onclick,
      title: opts.title ?? (opts.iconOnly ? label : undefined),
      "aria-label": opts.iconOnly ? label : undefined,
      disabled: opts.disabled,
    },
    opts.icon ? icon(opts.icon) : null,
    opts.iconOnly ? null : h("span", { text: label }),
  );
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function formatBytes(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`;
}

/** Fenêtre de confirmation (remplace `confirm()`, accessible au clavier). */
export function confirmDialog(title: string, text: string, confirmLabel = "Confirmer", danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "a-dialog" });
    const done = (v: boolean) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    append(dlg, [
      h("h2", { text: title }),
      h("p", { text }),
      h("div", { class: "a-dialog-actions" }, button("Annuler", () => done(false)), button(confirmLabel, () => done(true), { kind: danger ? "danger" : "primary" })),
    ]);
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(false);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Message bref en bas de l'écran. */
export function toast(text: string, kind: "ok" | "error" = "ok") {
  let zone = document.querySelector<HTMLElement>(".a-toasts");
  if (!zone) {
    zone = h("div", { class: "a-toasts", role: "status", "aria-live": "polite" });
    document.body.append(zone);
  }
  const t = h("p", { class: `a-toast a-toast-${kind}`, text });
  zone.append(t);
  setTimeout(() => t.classList.add("is-out"), 3200);
  setTimeout(() => t.remove(), 3700);
}
