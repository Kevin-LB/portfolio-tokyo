import { api } from "../api";
import { button, confirmDialog, formatBytes, formatDate, h, icon, toast, fill } from "../dom";
import type { Page } from "../main";
import { navigate } from "../main";
import { dropzone } from "../media";
import { loadMedia, state, type MediaRow } from "../state";

/** Où une image est utilisée dans le brouillon. */
function usage(m: MediaRow) {
  const src = `/media/${m.file}`;
  return state.draft.projects.filter((p) => p.image?.src === src || p.gallery?.some((g) => g.src === src)).map((p) => p.title || p.slug);
}

export async function mediaPage(): Promise<Page> {
  await loadMedia();
  const grid = h("div", { class: "a-media-grid" });
  const render = () => {
    fill(grid, 
      ...(state.media.length
        ? state.media.map((m) => {
            const used = usage(m);
            const alt = (lang: "fr" | "en") => {
              const input = h("input", { class: "a-input", type: "text", maxlength: 200, lang, "aria-label": `Texte alternatif ${lang.toUpperCase()}`, placeholder: `Texte alternatif ${lang.toUpperCase()}` });
              input.value = lang === "fr" ? m.alt_fr : m.alt_en;
              input.addEventListener("change", async () => {
                try {
                  Object.assign(m, await api<MediaRow>(`media/${m.id}`, { method: "PATCH", body: { [`alt_${lang}`]: input.value } }));
                  toast("Texte alternatif enregistré");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Échec", "error");
                }
              });
              return input;
            };
            return h(
              "article",
              { class: "a-media-card" },
              h("a", { href: `/media/${m.file}`, target: "_blank", rel: "noopener", class: "a-media-thumb" }, h("img", { src: `/media/${m.file}`, alt: m.alt_fr, loading: "lazy", width: m.width, height: m.height })),
              h("div", { class: "a-media-info" }, h("strong", { text: m.name || m.file }), h("span", { class: "a-hint", text: `${m.width} × ${m.height} · ${formatBytes(m.bytes)} · ${formatDate(m.created_at)}` }), used.length ? h("span", { class: "a-badge a-badge-accent", text: `Utilisée : ${used.join(", ")}` }) : h("span", { class: "a-badge", text: "Non utilisée" })),
              alt("fr"),
              alt("en"),
              h(
                "div",
                { class: "a-row-tools" },
                button("Copier l'adresse", () => navigator.clipboard?.writeText(`/media/${m.file}`).then(() => toast("Adresse copiée")), { icon: "copy", iconOnly: true }),
                button("Supprimer", async () => {
                  if (!(await confirmDialog("Supprimer cette image ?", used.length ? `Elle est utilisée par : ${used.join(", ")}. Retirez-la d'abord de ces projets.` : "Le fichier sera effacé définitivement.", "Supprimer"))) return;
                  try {
                    await api(`media/${m.id}`, { method: "DELETE" });
                    await loadMedia();
                    render();
                    toast("Image supprimée");
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Échec", "error");
                  }
                }, { icon: "trash", iconOnly: true, kind: "ghost" }),
              ),
            );
          })
        : [h("p", { class: "a-empty", text: "Aucune image pour l'instant." })]),
    );
  };
  render();
  return {
    title: "Médiathèque",
    actions: button("Projets", () => navigate("/admin/projets"), { icon: "projects", kind: "ghost" }),
    body: h("div", { class: "a-stack" }, dropzone(() => render()), h("p", { class: "a-hint" }, icon("warn"), " Les images du dépôt (dossier public/projets) ne sont pas listées ici ; celles envoyées ici sont servies depuis /media/."), grid),
  };
}
