import type { L } from "../content/i18n";
import { button, h, icon, type Child, fill } from "./dom";
import { touch } from "./state";

/**
 * Champs de formulaire liés au brouillon : chaque saisie écrit directement
 * dans l'objet et marque la rubrique comme modifiée.
 */

let uid = 0;
const nextId = () => `f${++uid}`;

function counter(input: HTMLInputElement | HTMLTextAreaElement, max?: number) {
  if (!max) return null;
  const c = h("span", { class: "a-count" });
  const upd = () => {
    const n = input.value.length;
    c.textContent = `${n} / ${max}`;
    c.classList.toggle("is-over", n > max);
  };
  input.addEventListener("input", upd);
  upd();
  return c;
}

export function field(label: string, control: Child, opts: { hint?: string; id?: string; wide?: boolean } = {}) {
  return h(
    "div",
    { class: `a-field${opts.wide ? " is-wide" : ""}` },
    h("label", { class: "a-label", for: opts.id, text: label }),
    control,
    opts.hint ? h("p", { class: "a-hint", text: opts.hint }) : null,
  );
}

export function text(label: string, get: () => string, set: (v: string) => void, section: string, opts: { max?: number; hint?: string; multiline?: boolean; rows?: number; placeholder?: string; type?: string; wide?: boolean; mono?: boolean } = {}) {
  const id = nextId();
  const input = opts.multiline
    ? h("textarea", { id, class: "a-input", rows: opts.rows ?? 4, placeholder: opts.placeholder })
    : h("input", { id, class: `a-input${opts.mono ? " is-mono" : ""}`, type: opts.type ?? "text", placeholder: opts.placeholder, autocomplete: "off" });
  input.value = get() ?? "";
  input.addEventListener("input", () => {
    set(input.value);
    touch(section);
  });
  return field(label, h("div", { class: "a-control" }, input, counter(input, opts.max)), { hint: opts.hint, id, wide: opts.wide });
}

/** Texte bilingue : français (obligatoire) et anglais côte à côte. */
export function bilingual(label: string, value: L, section: string, opts: { max?: number; multiline?: boolean; rows?: number; hint?: string; required?: boolean } = {}) {
  const make = (lang: "fr" | "en") => {
    const id = nextId();
    const input = opts.multiline ? h("textarea", { id, class: "a-input", rows: opts.rows ?? 3, lang }) : h("input", { id, class: "a-input", type: "text", lang, autocomplete: "off" });
    input.value = value[lang] ?? "";
    const badge = lang === "en" ? h("span", { class: "a-badge a-badge-warn", text: "À traduire" }) : null;
    const sync = () => badge?.toggleAttribute("hidden", !(value.fr.trim() && !value.en.trim()));
    input.addEventListener("input", () => {
      value[lang] = input.value;
      touch(section);
      sync();
    });
    sync();
    return h(
      "div",
      { class: "a-lang" },
      h("label", { class: "a-lang-tag", for: id }, lang.toUpperCase(), lang === "fr" && opts.required !== false ? h("span", { class: "a-req", "aria-hidden": "true", text: " *" }) : null),
      h("div", { class: "a-control" }, input, counter(input, opts.max)),
      badge,
    );
  };
  return h(
    "fieldset",
    { class: "a-field a-bilingual" },
    h("legend", { class: "a-label", text: label }),
    h("div", { class: "a-lang-grid" }, make("fr"), make("en")),
    opts.hint ? h("p", { class: "a-hint", text: opts.hint }) : null,
  );
}

export function toggle(label: string, get: () => boolean, set: (v: boolean) => void, section: string, hint?: string) {
  const id = nextId();
  const input = h("input", { id, type: "checkbox", class: "a-switch-input", role: "switch" });
  input.checked = get();
  input.addEventListener("change", () => {
    set(input.checked);
    touch(section);
  });
  return h("div", { class: "a-field a-switch" }, input, h("label", { for: id, class: "a-switch-label" }, h("span", { class: "a-switch-track", "aria-hidden": "true" }), h("span", { text: label })), hint ? h("p", { class: "a-hint", text: hint }) : null);
}

export function color(label: string, get: () => string, set: (v: string) => void, section: string) {
  const id = nextId();
  const picker = h("input", { type: "color", class: "a-color", "aria-label": `${label} (sélecteur)` });
  const input = h("input", { id, class: "a-input is-mono", type: "text", maxlength: 7, spellcheck: "false" });
  picker.value = input.value = get();
  const write = (v: string) => {
    set(v);
    touch(section);
  };
  picker.addEventListener("input", () => {
    input.value = picker.value;
    write(picker.value);
  });
  input.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(input.value)) picker.value = input.value;
    write(input.value);
  });
  return field(label, h("div", { class: "a-control a-color-row" }, picker, input), { id });
}

/** Étiquettes (pile technique, outils) : Entrée ajoute, × retire. */
export function tags(label: string, list: string[], section: string, opts: { max?: number; hint?: string; placeholder?: string } = {}) {
  const id = nextId();
  const chips = h("ul", { class: "a-tags" });
  const input = h("input", { id, class: "a-input a-tags-input", type: "text", placeholder: opts.placeholder ?? "Ajouter puis Entrée", autocomplete: "off" });
  const render = () => {
    fill(chips, 
      ...list.map((t, i) =>
        h(
          "li",
          { class: "a-tag" },
          h("span", { text: t }),
          h("button", { type: "button", class: "a-tag-x", "aria-label": `Retirer ${t}`, onclick: () => (list.splice(i, 1), touch(section), render()) }, icon("close")),
        ),
      ),
    );
  };
  const add = () => {
    for (const part of input.value.split(",")) {
      const v = part.trim();
      if (v && !list.includes(v) && list.length < (opts.max ?? 30)) list.push(v);
    }
    input.value = "";
    touch(section);
    render();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !input.value && list.length) {
      list.pop();
      touch(section);
      render();
    }
  });
  input.addEventListener("blur", () => input.value.trim() && add());
  render();
  return field(label, h("div", { class: "a-tags-box" }, chips, input), { id, hint: opts.hint ?? "Entrée ou virgule pour ajouter." });
}

/** Liste éditable : ajouter, retirer, monter, descendre. */
export function repeater<T>(label: string, list: T[], section: string, renderItem: (item: T, i: number) => Child, make: () => T, opts: { max?: number; min?: number; addLabel?: string; hint?: string } = {}) {
  const box = h("div", { class: "a-repeater" });
  const render = () => {
    fill(box, 
      ...list.map((item, i) =>
        h(
          "div",
          { class: "a-repeat-item" },
          h("div", { class: "a-repeat-body" }, renderItem(item, i)),
          h(
            "div",
            { class: "a-repeat-tools" },
            button("Monter", () => (([list[i - 1], list[i]] = [list[i], list[i - 1]]), touch(section), render()), { icon: "up", iconOnly: true, disabled: i === 0 }),
            button("Descendre", () => (([list[i + 1], list[i]] = [list[i], list[i + 1]]), touch(section), render()), { icon: "down", iconOnly: true, disabled: i === list.length - 1 }),
            button("Retirer", () => (list.splice(i, 1), touch(section), render()), { icon: "trash", iconOnly: true, kind: "ghost", disabled: list.length <= (opts.min ?? 0) }),
          ),
        ),
      ),
      list.length < (opts.max ?? 99) ? button(opts.addLabel ?? "Ajouter", () => (list.push(make()), touch(section), render()), { icon: "plus" }) : null,
    );
  };
  render();
  return h("fieldset", { class: "a-field is-wide" }, h("legend", { class: "a-label", text: label }), opts.hint ? h("p", { class: "a-hint", text: opts.hint }) : null, box);
}

export function section(title: string, ...children: Child[]) {
  return h("section", { class: "a-card" }, h("h2", { class: "a-card-title", text: title }), h("div", { class: "a-grid" }, ...children));
}
