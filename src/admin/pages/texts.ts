import { h } from "../dom";
import { bilingual, repeater, section, text } from "../fields";
import type { Page } from "../main";
import { state } from "../state";

const L = () => ({ fr: "", en: "" });
const fact = () => ({ label: L(), value: L() });

export function sitePage(): Page {
  const s = state.draft.site;
  const sec = "Textes du site";
  return {
    title: "Textes du site",
    body: h(
      "div",
      { class: "a-stack" },
      section(
        "Carte d'arrivée (dans la rue)",
        text("Nom", () => s.name, (v) => (s.name = v), sec, { max: 60 }),
        bilingual("Métier", s.role, sec, { max: 120 }),
        bilingual("Accroche", s.lead, sec, { max: 240, multiline: true, rows: 2 }),
      ),
      section("Au sommet", bilingual("Banderole de la montgolfière", s.banner, sec, { max: 24, hint: "Court : elle doit se lire de loin." })),
      section("Moteurs de recherche et partage", bilingual("Description", s.description, sec, { max: 300, multiline: true, rows: 3, hint: "Affichée par les moteurs de recherche et lors d'un partage." })),
    ),
  };
}

export function aboutPage(): Page {
  const a = state.draft.about;
  const sec = "À propos";
  return {
    title: "À propos",
    body: h(
      "div",
      { class: "a-stack" },
      h("p", { class: "a-hint", text: "Ce texte est posé sur la vitre du Top Deck (250 m). Court se lit mieux : trois paragraphes suffisent." }),
      section(
        "Le texte",
        repeater("Paragraphes", a.paragraphs, sec, (p, i) => bilingual(i === 0 ? "Paragraphe d'ouverture (en grand)" : `Paragraphe ${i + 1}`, p, sec, { max: 600, multiline: true, rows: 3 }), L, { max: 6, min: 1, addLabel: "Ajouter un paragraphe" }),
        bilingual("Ce que je cherche", a.seeking, sec, { max: 300, multiline: true, rows: 2 }),
      ),
      section(
        "Repères",
        text("Lieu (données structurées)", () => a.place, (v) => (a.place = v), sec, { max: 80 }),
        repeater("Repères affichés", a.facts, sec, (f) => h("div", { class: "a-pair" }, bilingual("Intitulé", f.label, sec, { max: 60 }), bilingual("Valeur", f.value, sec, { max: 160 })), fact, { max: 6, addLabel: "Ajouter un repère" }),
      ),
    ),
  };
}

export function contactPage(): Page {
  const c = state.draft.contact;
  const sec = "Contact";
  return {
    title: "Contact",
    body: h(
      "div",
      { class: "a-stack" },
      section(
        "Adresse et liens",
        text("Adresse électronique affichée", () => c.email, (v) => (c.email = v), sec, { type: "email", max: 120, hint: "Affichée au sommet et utilisée si le formulaire ne peut pas joindre le serveur." }),
        repeater("Liens (réseaux, GitHub…)", c.links, sec, (l) => h("div", { class: "a-pair" }, text("Nom", () => l.label, (v) => (l.label = v), sec, { max: 30 }), text("Adresse", () => l.url, (v) => (l.url = v), sec, { type: "url", placeholder: "https://…" })), () => ({ label: "", url: "" }), { max: 8, addLabel: "Ajouter un lien" }),
      ),
      section(
        "Précisions et formulaire",
        repeater("Précisions affichées", c.details, sec, (f) => h("div", { class: "a-pair" }, bilingual("Intitulé", f.label, sec, { max: 60 }), bilingual("Valeur", f.value, sec, { max: 160 })), fact, { max: 6, addLabel: "Ajouter une précision" }),
        repeater("Objets proposés dans le formulaire", c.subjects, sec, (s, i) => bilingual(`Objet ${i + 1}`, s, sec, { max: 60 }), L, { max: 8, min: 1, addLabel: "Ajouter un objet" }),
      ),
    ),
  };
}
