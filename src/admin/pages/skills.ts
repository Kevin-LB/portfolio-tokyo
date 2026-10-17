import { h, fill } from "../dom";
import { bilingual, color, section, tags, text } from "../fields";
import type { Page } from "../main";
import { state, touch } from "../state";


/** Les quatre distributeurs (le nombre est fixé par la scène : quatre machines). */
export function skillsPage(): Page {
  const tabs = h("div", { class: "a-tabs", role: "tablist" });
  const panel = h("div", { class: "a-stack" });
  let current = 0;
  const show = (i: number) => {
    current = i;
    const s = state.draft.skills[i];
    const sec = `Distributeur « ${s.name.fr} »`;
    fill(tabs, 
      ...state.draft.skills.map((x, k) =>
        h(
          "button",
          { type: "button", role: "tab", class: "a-tab", "aria-selected": String(k === current), onclick: () => show(k) },
          h("span", { class: "a-skill-badge", style: `--c:${x.body};--a:${x.accent}`, lang: "ja", text: x.jp }),
          h("span", { text: x.name.fr }),
        ),
      ),
    );
    const proofs = h(
      "div",
      { class: "a-checks" },
      state.draft.projects.map((p) => {
        const id = `proof-${p.slug}`;
        const box = h("input", { type: "checkbox", id });
        box.checked = s.proof.includes(p.slug);
        box.addEventListener("change", () => {
          if (box.checked) s.proof.push(p.slug);
          else s.proof.splice(s.proof.indexOf(p.slug), 1);
          touch(sec);
        });
        return h("label", { class: "a-check", for: id }, box, h("span", { text: p.title || p.slug }), p.hidden ? h("span", { class: "a-badge", text: "Brouillon" }) : null);
      }),
    );
    fill(panel, 
      section(
        "Le distributeur",
        bilingual("Nom (sur la canette et le bouton)", s.name, sec, { max: 40 }),
        text("Nom japonais (fronton de la machine)", () => s.jp, (v) => (s.jp = v), sec, { max: 4, hint: "Deux kanji. Les caractères nouveaux demandent de régénérer la police japonaise (scripts/subset-jp.py)." }),
        text("Prix affiché", () => s.price, (v) => (s.price = v), sec, { max: 8 }),
        color("Couleur de la machine", () => s.body, (v) => (s.body = v), sec),
        color("Couleur du texte", () => s.accent, (v) => (s.accent = v), sec),
      ),
      section(
        "Le ticket",
        bilingual("Promesse (titre du ticket)", s.promise, sec, { max: 140, multiline: true, rows: 2 }),
        bilingual("Ce que ça veut dire concrètement", s.text, sec, { max: 700, multiline: true, rows: 5 }),
        tags("Outils", s.tools, sec, { max: 20 }),
        h("fieldset", { class: "a-field is-wide" }, h("legend", { class: "a-label", text: "Où le voir (projets liés)" }), proofs),
      ),
    );
  };
  show(0);
  return { title: "Compétences — les distributeurs", body: h("div", { class: "a-stack" }, h("p", { class: "a-hint", text: "Quatre machines dans la rue, quatre façons de travailler. Le nombre est fixé par la scène." }), tabs, panel) };
}
