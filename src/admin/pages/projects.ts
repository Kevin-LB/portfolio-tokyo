import type { StoredProject } from "../../content/store";
import { DECK_FACES } from "../../content/store";
import { button, confirmDialog, h, icon, toast, fill } from "../dom";
import { bilingual, color, repeater, section, tags, text, toggle } from "../fields";
import type { Page } from "../main";
import { navigate } from "../main";
import { pickImage } from "../media";
import { state, touch } from "../state";

const S = (p: StoredProject) => `Projet « ${p.title || p.slug} »`;
const go = (path: string) => (e: MouseEvent) => {
  e.preventDefault();
  navigate(path);
};

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

function blankProject(): StoredProject {
  let n = 1;
  while (state.draft.projects.some((p) => p.slug === `nouveau-projet-${n}`)) n++;
  return {
    slug: `nouveau-projet-${n}`,
    title: "",
    year: String(new Date().getFullYear()),
    discipline: { fr: "", en: "" },
    line: { fr: "", en: "" },
    summary: { fr: "", en: "" },
    stack: [],
    facts: [],
    tint: "#0b1426",
    featured: false,
    hidden: true,
  };
}

/** Face du Main Deck occupée par un projet (1 à 4), ou 0. */
function face(p: StoredProject) {
  const deck = state.draft.projects.filter((x) => x.featured && !x.hidden);
  const i = deck.indexOf(p);
  return i >= 0 && i < DECK_FACES ? i + 1 : 0;
}

export function projectsPage(): Page {
  const list = state.draft.projects;
  const box = h("div", { class: "a-rows" });
  const deckCount = () => list.filter((p) => p.featured && !p.hidden).length;
  const status = h("p", { class: "a-deck-status" });
  const render = () => {
    const n = deckCount();
    status.className = `a-deck-status${n === DECK_FACES ? "" : " is-alert"}`;
    status.textContent = `Main Deck : ${n} / ${DECK_FACES} écrans occupés${n === DECK_FACES ? "" : " — il en faut exactement 4 pour publier"}. L'ordre de la liste est l'ordre des faces, puis de « Aussi à cet étage ».`;
    fill(box, 
      ...list.map((p, i) => {
        const f = face(p);
        return h(
          "article",
          { class: `a-row${p.hidden ? " is-draft" : ""}` },
          p.image ? h("img", { class: "a-thumb", src: p.image.src, alt: "", width: 96, height: 60, loading: "lazy" }) : h("span", { class: "a-thumb a-thumb-empty", "aria-hidden": "true" }),
          h(
            "div",
            { class: "a-row-main" },
            h("a", { class: "a-row-title", href: `/admin/projets/${encodeURIComponent(p.slug)}`, onclick: go(`/admin/projets/${encodeURIComponent(p.slug)}`), text: p.title || "(sans titre)" }),
            h("p", { class: "a-row-meta", text: [p.year, p.discipline.fr].filter(Boolean).join(" — ") }),
            h(
              "div",
              { class: "a-badges" },
              f ? h("span", { class: "a-badge a-badge-accent", text: `Main Deck · face ${f}` }) : null,
              p.hidden ? h("span", { class: "a-badge", text: "Brouillon" }) : null,
              !p.discipline.en || !p.line.en || !p.summary.en ? h("span", { class: "a-badge a-badge-warn", text: "À traduire" }) : null,
            ),
          ),
          h(
            "div",
            { class: "a-row-tools" },
            button(p.featured ? "Retirer du Main Deck" : "Mettre sur le Main Deck", () => ((p.featured = !p.featured), touch(S(p)), render()), { icon: "star", iconOnly: true, kind: p.featured ? "primary" : "quiet" }),
            button(p.hidden ? "Publier (rendre visible)" : "Masquer (brouillon)", () => ((p.hidden = !p.hidden), touch(S(p)), render()), { icon: p.hidden ? "eyeOff" : "eye", iconOnly: true }),
            button("Monter", () => (([list[i - 1], list[i]] = [list[i], list[i - 1]]), touch("Ordre des projets"), render()), { icon: "up", iconOnly: true, disabled: i === 0 }),
            button("Descendre", () => (([list[i + 1], list[i]] = [list[i], list[i + 1]]), touch("Ordre des projets"), render()), { icon: "down", iconOnly: true, disabled: i === list.length - 1 }),
            button("Modifier", () => navigate(`/admin/projets/${encodeURIComponent(p.slug)}`), { icon: "edit", iconOnly: true }),
          ),
        );
      }),
    );
  };
  render();
  return {
    title: "Projets",
    actions: button("Nouveau projet", () => navigate("/admin/projets/nouveau"), { kind: "primary", icon: "plus" }),
    body: h("div", { class: "a-stack" }, status, box),
  };
}

function imageBlock(p: StoredProject) {
  const box = h("div", { class: "a-image" });
  const sec = S(p);
  const render = () => {
    const img = p.image;
    fill(box, 
      img ? h("img", { class: "a-image-preview", src: img.src, alt: "", width: img.w, height: img.h }) : h("div", { class: "a-image-empty", text: "Aucune image principale" }),
      h(
        "div",
        { class: "a-image-side" },
        h(
          "div",
          { class: "a-row-tools" },
          button(img ? "Changer d'image" : "Choisir une image", async () => {
            const m = await pickImage();
            if (!m) return;
            p.image = { src: `/media/${m.file}`, w: m.width, h: m.height, alt: { fr: m.alt_fr, en: m.alt_en }, phone: p.image?.phone };
            touch(sec);
            render();
          }, { icon: "media" }),
          img ? button("Retirer", () => ((p.image = undefined), touch(sec), render()), { icon: "trash", kind: "ghost" }) : null,
        ),
        img ? h("p", { class: "a-hint", text: `${img.src} — ${img.w} × ${img.h}` }) : null,
        img ? bilingual("Texte alternatif (ce que montre l'image)", img.alt, sec, { max: 200 }) : null,
        img ? toggle("Capture de téléphone (affichée dans un cadre de téléphone)", () => !!img.phone, (v) => (img.phone = v || undefined), sec) : null,
      ),
    );
  };
  render();
  return box;
}

function galleryBlock(p: StoredProject) {
  p.gallery ??= [];
  const sec = S(p);
  return repeater(
    "Galerie (dans la fiche du projet)",
    p.gallery,
    sec,
    (g) => h("div", { class: "a-gallery-item" }, h("img", { src: g.src, alt: "", width: 120, height: 75, loading: "lazy" }), bilingual("Texte alternatif", g.alt, sec, { max: 200 })),
    () => ({ src: "", w: 1, h: 1, alt: { fr: "", en: "" } }),
    { max: 12, addLabel: "Ajouter une image", hint: "Après « Ajouter », choisissez l'image dans la médiathèque." },
  );
}

export function projectEditPage(slug?: string): Page {
  let p = state.draft.projects.find((x) => x.slug === slug);
  if (slug === "nouveau" || !p) {
    if (slug !== "nouveau") return { title: "Projet introuvable", body: h("p", null, "Ce projet n'existe pas (ou plus). ", h("a", { href: "/admin/projets", onclick: go("/admin/projets"), text: "Retour aux projets" })) };
    p = blankProject();
    state.draft.projects.push(p);
    touch("Nouveau projet");
    history.replaceState(null, "", `/admin/projets/${p.slug}`);
  }
  const proj = p;
  const sec = () => S(proj);
  let slugTouched = !proj.slug.startsWith("nouveau-projet-");
  const slugField = text("Identifiant (adresse de la fiche)", () => proj.slug, (v) => {
    slugTouched = true;
    proj.slug = v;
  }, sec(), { max: 60, mono: true, hint: "Minuscules, chiffres et tirets. Sert d'ancre (#projet-…) et de lien entre compétences et projets." });
  const titleField = text("Titre", () => proj.title, (v) => {
    proj.title = v;
    if (!slugTouched) {
      proj.slug = slugify(v) || proj.slug;
      const input = slugField.querySelector("input");
      if (input) input.value = proj.slug;
    }
  }, sec(), { max: 80 });

  // Une galerie ajoutée vide attend son image : on la choisit tout de suite.
  const gallery = galleryBlock(proj);
  gallery.addEventListener("click", async (e) => {
    const add = (e.target as HTMLElement).closest("button");
    if (!add?.textContent?.includes("Ajouter une image")) return;
    const last = proj.gallery![proj.gallery!.length - 1];
    if (last && !last.src) {
      const m = await pickImage();
      if (!m) {
        proj.gallery!.pop();
      } else Object.assign(last, { src: `/media/${m.file}`, w: m.width, h: m.height, alt: { fr: m.alt_fr, en: m.alt_en } });
      touch(sec());
      navigate(location.pathname);
    }
  });

  const remove = async () => {
    if (!(await confirmDialog("Supprimer ce projet ?", `« ${proj.title || proj.slug} » sera retiré du site à la prochaine publication. Les versions précédentes restent dans l'historique.`, "Supprimer"))) return;
    state.draft.projects.splice(state.draft.projects.indexOf(proj), 1);
    for (const s of state.draft.skills) s.proof = s.proof.filter((x) => x !== proj.slug);
    touch(`Projet « ${proj.title || proj.slug} » supprimé`);
    toast("Projet retiré du brouillon. Publiez pour l'appliquer.");
    navigate("/admin/projets");
  };

  return {
    title: proj.title || "Nouveau projet",
    actions: [
      h("a", { class: "a-btn a-btn-ghost", href: "/admin/projets", onclick: go("/admin/projets") }, icon("back"), h("span", { text: "Projets" })),
      button("Supprimer", remove, { kind: "danger", icon: "trash" }),
    ],
    body: h(
      "div",
      { class: "a-stack" },
      section(
        "Publication",
        toggle("Visible sur le site", () => !proj.hidden, (v) => (proj.hidden = !v), sec(), "Masqué, le projet reste un brouillon : il n'apparaît nulle part."),
        toggle("Sur un écran du Main Deck", () => proj.featured, (v) => (proj.featured = v), sec(), "Quatre projets exactement occupent les quatre faces. L'ordre se règle dans la liste des projets."),
      ),
      section(
        "Identité",
        titleField,
        slugField,
        text("Année", () => proj.year, (v) => (proj.year = v), sec(), { max: 24, hint: "Ex. 2026, ou 2024 — 2025" }),
        text("Commanditaire", () => proj.org ?? "", (v) => (proj.org = v || undefined), sec(), { max: 120 }),
        bilingual("Type de projet", proj.discipline, sec(), { max: 120 }),
        bilingual("Rôle", (proj.role ??= { fr: "", en: "" }), sec(), { max: 120, required: false }),
      ),
      section(
        "Textes",
        bilingual("Phrase d'accroche (fiche du projet, version texte)", proj.line, sec(), { max: 220, multiline: true, rows: 2 }),
        bilingual("Résumé (fiche du projet)", proj.summary, sec(), { max: 1600, multiline: true, rows: 6 }),
        repeater("Faits (rôle, version, chiffres…)", proj.facts, sec(), (f) => h("div", { class: "a-pair" }, bilingual("Intitulé", f.label, sec(), { max: 60 }), bilingual("Valeur", f.value, sec(), { max: 160 })), () => ({ label: { fr: "", en: "" }, value: { fr: "", en: "" } }), { max: 12, addLabel: "Ajouter un fait" }),
      ),
      section(
        "Technique et lien",
        tags("Pile technique", proj.stack, sec(), { max: 30 }),
        text("Lien en ligne", () => proj.live ?? "", (v) => (proj.live = v || undefined), sec(), { type: "url", placeholder: "https://…", hint: "Laisser vide si le projet n'est pas en ligne." }),
      ),
      section("Visuels", h("div", { class: "a-field is-wide" }, imageBlock(proj)), gallery, color("Couleur de l'écran (colonne de titre sur le Main Deck)", () => proj.tint, (v) => (proj.tint = v), sec())),
    ),
  };
}
