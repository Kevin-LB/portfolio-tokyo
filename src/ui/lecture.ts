import { main, topBar, viewer } from "./markup";
import { getLang, onLang, setLang, t } from "../content/i18n";
import { PROJECTS } from "../content/projects";
import { CONTACT } from "../content/site";
import { UI } from "../content/ui";
import { submitSignal } from "./contact";

/**
 * La version texte : le même contenu, en document. Utilisée sans WebGL, sur
 * demande (?lecture), ou si la scène échoue. Elle garde la bascule de
 * langue, la visionneuse de projets et le formulaire de contact.
 */
export function startLecture(reason?: "nowebgl") {
  const root = document.documentElement;
  root.dataset.mode = "lecture";
  if (reason === "nowebgl") {
    const p = document.createElement("p");
    p.className = "noscript";
    p.textContent = t(UI.noWebgl);
    document.querySelector("main")?.prepend(p);
  }
  // Lien « version 3D » à la place de « version texte ».
  const swap = () => {
    const a = document.querySelector<HTMLAnchorElement>(".text-version");
    if (a) {
      a.href = location.pathname;
      a.textContent = t(UI.experience);
    }
  };
  swap();
  let index = -1;
  document.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    if (el.closest(".lang")) return setLang(getLang() === "fr" ? "en" : "fr");
    const open = el.closest<HTMLElement>(".open-project");
    const dialog = document.querySelector<HTMLDialogElement>(".viewer")!;
    if (open) {
      index = PROJECTS.findIndex((p) => p.slug === open.dataset.slug);
      dialog.innerHTML = viewer(PROJECTS[index], getLang(), index, PROJECTS.length);
      dialog.showModal();
      return;
    }
    if (el.closest(".viewer-close")) return dialog.close();
    if (el.closest(".viewer-prev") || el.closest(".viewer-next")) {
      index = (index + (el.closest(".viewer-next") ? 1 : -1) + PROJECTS.length) % PROJECTS.length;
      dialog.innerHTML = viewer(PROJECTS[index], getLang(), index, PROJECTS.length);
      return;
    }
    const copy = el.closest<HTMLElement>(".copy");
    if (copy) navigator.clipboard?.writeText(CONTACT.email).catch(() => undefined);
    const skill = el.closest<HTMLElement>(".skill-button");
    if (skill) document.querySelector(`.skill[data-skill="${skill.dataset.skill}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  document.addEventListener("submit", (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.classList.contains("signal-form")) return;
    e.preventDefault();
    void submitSignal(form);
  });
  onLang((l) => {
    document.querySelector(".topbar")!.innerHTML = topBar(l);
    document.querySelector("main")!.innerHTML = main(l);
    swap();
  });
}
