import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import type { Experience } from "../app";
import { altitudeAt, chapterPresence, PROJECTS_WINDOW, projectIndex, STOPS, type StopId } from "../story/chapters";
import { altimeter, main, topBar, viewer } from "./markup";
import { getLang, onLang, setLang, t, type Lang } from "../content/i18n";
import { FEATURED, PROJECTS } from "../content/projects";
import { CONTACT, SITE } from "../content/site";
import { UI } from "../content/ui";
import { aboutFacet } from "../world/tower/decks";
import { clamp } from "../core/math";
import { GlassLayer } from "./glass";
import { submitSignal } from "./contact";

/**
 * L'interface posée sur la scène. Le DOM porte tout le contenu (lisible,
 * focusable, indexable) ; ce contrôleur décide seulement de ce qui est
 * présent à quelle altitude, et relie les boutons au monde 3D.
 */

type Zone = { id: "tokyo" | "skills" | "projects" | "about" | "contact"; p0: number; p1: number };
const ZONES: Zone[] = [
  { id: "tokyo", p0: -1, p1: 0.064 },
  { id: "skills", p0: 0.084, p1: 0.16 },
  { id: "projects", p0: 0.392, p1: 0.603 },
  { id: "about", p0: 0.73, p1: 0.86 },
  { id: "contact", p0: 0.955, p1: 2 },
];

const STOP_OF_ZONE: Record<Zone["id"], StopId | null> = { tokyo: "ground", skills: "ground", projects: "projects", about: "about", contact: "contact" };

export class Hud {
  private root = document.documentElement;
  private active: Zone["id"] | null = null;
  private currentProject = -1;
  private ticketOpen = -1;
  private viewerIndex = -1;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private pointerInside = false;
  private css3d: CSS3DRenderer | null = null;
  private aboutObject: CSS3DObject | null = null;
  private flatAbout = false;
  private lastAlt = -1;
  private ticketTimer = 0;
  /** Dernière action à la souris ou au doigt (l'anneau de focus est réservé au clavier). */
  private byPointer = false;
  /** Chapitre dont il faut focaliser le titre à l'arrivée (navigation au clavier). */
  private pendingFocus: string | null = null;
  /** La matière des panneaux (peinte par le rendu, sous le DOM). */
  readonly glass: GlassLayer;

  constructor(private xp: Experience) {
    this.root.dataset.mode = "tower";
    this.glass = new GlassLayer(xp.stage, xp.reduced);
    this.setupCss3d();
    this.bind();
    onLang((l) => this.rerender(l));
    this.updateClock();
    setInterval(() => this.updateClock(), 20000);
    addEventListener("resize", () => this.layoutAbout());
  }

  /* ── Liaisons ───────────────────────────────────────────────────────── */

  private $(sel: string) {
    return document.querySelector<HTMLElement>(sel);
  }
  private $$(sel: string) {
    return Array.from(document.querySelectorAll<HTMLElement>(sel));
  }

  private bind() {
    document.addEventListener("click", (e) => this.onClick(e));
    addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.ticketOpen >= 0) this.closeTicket();
        this.toggleAlso(false);
      }
    });
    const canvas = this.xp.stage.canvas;
    canvas.addEventListener("pointermove", (e) => {
      this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.pointerInside = true;
    });
    canvas.addEventListener("pointerleave", () => (this.pointerInside = false));
    canvas.addEventListener("click", (e) => this.onSceneClick(e));
    const form = this.$(".signal-form") as HTMLFormElement | null;
    form?.addEventListener("submit", (e) => this.onSubmit(e));
    const details = this.$(".signal") as HTMLDetailsElement | null;
    details?.addEventListener("toggle", () => {
      if (details.open) this.xp.summit.burst();
    });
    const dialog = this.$(".viewer") as HTMLDialogElement;
    dialog.addEventListener("close", () => {
      this.viewerIndex = -1;
      dialog.classList.remove("is-closing");
      this.root.classList.remove("viewer-open");
    });
    // Échap : on referme en fondu plutôt que d'un coup.
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.closeViewer();
    });
    // Un clic hors de la feuille (sur la scène assombrie) referme aussi.
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.closeViewer();
    });
    this.$(".altimeter")?.addEventListener("click", (e) => {
      if (innerWidth <= 760 && (e.target as HTMLElement).closest(".alt-readout")) this.$(".altimeter")!.classList.toggle("is-open");
    });
  }

  private onClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    this.byPointer = e.detail > 0;
    const stop = el.closest<HTMLElement>("[data-stop]");
    if (stop) {
      e.preventDefault();
      this.goToStop(stop.dataset.stop as StopId);
      // Activation au clavier (detail = 0) : le focus suivra jusqu'au contenu.
      if (e.detail === 0) this.pendingFocus = ({ ground: "tokyo", projects: "projects", about: "about", contact: "contact" } as Record<string, string>)[stop.dataset.stop ?? ""] ?? null;
      this.$(".altimeter")?.classList.remove("is-open");
      return;
    }
    const skill = el.closest<HTMLElement>(".skill-button");
    if (skill) return this.dispense(Number(skill.dataset.skill));
    if (el.closest(".ticket-close")) return this.closeTicket();
    const open = el.closest<HTMLElement>(".open-project");
    if (open) return this.openViewer(PROJECTS.findIndex((p) => p.slug === open.dataset.slug), open);
    const pager = el.closest<HTMLElement>(".pager-item");
    if (pager) return this.goToFace(Number(pager.dataset.face));
    const step = el.closest<HTMLElement>(".face-step");
    if (step) return this.goToFace(clamp(Math.max(0, this.currentProject) + Number(step.dataset.step), 0, FEATURED.length - 1));
    if (el.closest(".also-toggle")) return this.toggleAlso();
    // Un clic ailleurs referme la liste « aussi à cet étage ».
    if (!el.closest(".also")) this.toggleAlso(false);
    const goto = el.closest<HTMLElement>("[data-goto-project]");
    if (goto) {
      e.preventDefault();
      this.closeTicket();
      const slug = goto.dataset.gotoProject!;
      const f = FEATURED.findIndex((p) => p.slug === slug);
      if (f >= 0) this.goToFace(f);
      else this.openViewer(PROJECTS.findIndex((p) => p.slug === slug), goto);
      return;
    }
    if (el.closest(".viewer-close")) return this.closeViewer();
    if (el.closest(".viewer-prev")) return this.showViewer((this.viewerIndex - 1 + PROJECTS.length) % PROJECTS.length);
    if (el.closest(".viewer-next")) return this.showViewer((this.viewerIndex + 1) % PROJECTS.length);
    const copy = el.closest<HTMLElement>(".copy");
    if (copy) return this.copyEmail(copy);
    if (el.closest(".daynight")) return this.toggleNight();
    if (el.closest(".lang")) return setLang(getLang() === "fr" ? "en" : "fr");
    if (el.closest(".sound")) return this.toggleSound();
  }

  private async toggleSound() {
    const on = await this.xp.audio.toggle();
    const b = this.$(".sound");
    b?.setAttribute("aria-pressed", String(on));
    b?.setAttribute("aria-label", t(on ? UI.soundOff : UI.soundOn));
  }

  goToStop(id: StopId) {
    this.closeTicket();
    this.xp.goTo(STOPS[id]);
  }

  goToFace(i: number) {
    const { p0, p1, count } = PROJECTS_WINDOW;
    this.xp.goTo(p0 + ((p1 - p0) * i) / (count - 1));
  }

  /* ── Distributeurs ─────────────────────────────────────────────────── */

  dispense(i: number) {
    if (i < 0) return;
    // Si l'on n'est pas devant les machines, on y va d'abord.
    if (this.active !== "skills") this.xp.goTo(STOPS.skills);
    this.xp.vending.dispense(i);
    this.xp.audio.can();
    clearTimeout(this.ticketTimer);
    this.ticketTimer = window.setTimeout(() => this.showTicket(i), this.xp.reduced ? 50 : 900);
  }

  private showTicket(i: number) {
    const ticket = this.$(".ticket")!;
    this.$$(".ticket .skill").forEach((s) => (s.hidden = Number(s.dataset.skill) !== i));
    ticket.hidden = false;
    this.ticketOpen = i;
    this.root.classList.add("ticket-open");
  }

  closeTicket() {
    if (this.ticketOpen < 0) return;
    this.$(".ticket")!.hidden = true;
    this.ticketOpen = -1;
    this.root.classList.remove("ticket-open");
    this.xp.vending.release();
    clearTimeout(this.ticketTimer);
  }

  /* ── Projets ───────────────────────────────────────────────────────── */

  private toggleAlso(open?: boolean) {
    const list = this.$(".also");
    const btn = this.$(".also-toggle");
    if (!list || !btn) return;
    const next = open ?? !list.classList.contains("is-open");
    list.classList.toggle("is-open", next);
    btn.setAttribute("aria-expanded", String(next));
  }

  openViewer(i: number, from?: HTMLElement | null) {
    if (i < 0) return;
    const dialog = this.$(".viewer") as HTMLDialogElement;
    // Le verre de la feuille naît de l'écran du deck (ou du bouton cliqué).
    const rect = this.screenRect(i) ?? from?.getBoundingClientRect();
    this.showViewer(i);
    if (!dialog.open || dialog.classList.contains("is-closing")) {
      dialog.classList.remove("is-closing");
      if (!dialog.open) dialog.showModal();
      this.root.classList.add("viewer-open");
      if (rect) this.glass.morph(dialog, { left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }, 6);
    }
    (dialog.querySelector(".viewer-close") as HTMLElement)?.focus({ focusVisible: !this.byPointer } as FocusOptions);
  }

  closeViewer() {
    const dialog = this.$(".viewer") as HTMLDialogElement;
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    this.root.classList.remove("viewer-open");
    if (this.xp.reduced) return dialog.close();
    dialog.classList.add("is-closing");
    setTimeout(() => {
      if (dialog.classList.contains("is-closing")) dialog.close();
    }, 260);
  }

  private showViewer(i: number) {
    const dialog = this.$(".viewer") as HTMLDialogElement;
    this.viewerIndex = i;
    dialog.innerHTML = viewer(PROJECTS[i], getLang(), i, PROJECTS.length);
    dialog.querySelector(".viewer-body")?.scrollTo(0, 0);
  }

  /** Rectangle écran de la façade-écran d'un projet (si visible). */
  private screenRect(i: number) {
    const s = this.xp.screens.screens[i];
    if (!s || this.active !== "projects") return null;
    const box = new THREE.Box3().setFromObject(s.mesh);
    const cam = this.xp.stage.camera;
    const pts = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    ].map((p) => p.project(cam));
    const xs = pts.map((p) => ((p.x + 1) / 2) * innerWidth);
    const ys = pts.map((p) => ((1 - p.y) / 2) * innerHeight);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) } as DOMRect;
  }

  /* ── Scène : survol et clic ────────────────────────────────────────── */

  private pick() {
    const xp = this.xp;
    this.raycaster.setFromCamera(this.ndc, xp.stage.camera);
    if (this.active === "skills") {
      const hit = this.raycaster.intersectObjects(xp.vending.pickables(), false)[0];
      return hit ? { kind: "vending" as const, index: hit.object.userData.machine as number } : null;
    }
    if (this.active === "projects") {
      const hit = this.raycaster.intersectObjects(
        xp.screens.screens.map((s) => s.mesh),
        false,
      )[0];
      return hit ? { kind: "screen" as const, index: hit.object.userData.project as number } : null;
    }
    return null;
  }

  private onSceneClick(e: MouseEvent) {
    this.byPointer = true;
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const hit = this.pick();
    if (!hit) return;
    if (hit.kind === "vending") this.dispense(hit.index);
    else {
      const idx = PROJECTS.findIndex((p) => p.slug === FEATURED[hit.index].slug);
      this.openViewer(idx);
    }
  }

  /* ── Contact ───────────────────────────────────────────────────────── */

  private async copyEmail(btn: HTMLElement) {
    try {
      await navigator.clipboard.writeText(CONTACT.email);
      const label = btn.querySelector(".copy-label");
      if (label) {
        label.textContent = t(UI.copied);
        setTimeout(() => (label.textContent = t(UI.copy)), 2200);
      }
    } catch {
      location.href = `mailto:${CONTACT.email}`;
    }
  }

  private async onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (await submitSignal(e.target as HTMLFormElement)) this.xp.summit.burst();
  }

  /* ── Jour / nuit, horloge ──────────────────────────────────────────── */

  toggleNight() {
    const toNight = this.xp.nightTarget < 0.5;
    this.xp.setNight(toNight ? 1 : 0);
    this.updateNightButton(toNight);
  }

  updateNightButton(night: boolean) {
    const b = this.$(".daynight");
    if (!b) return;
    b.setAttribute("aria-pressed", String(night));
    b.setAttribute("aria-label", t(night ? UI.toDay : UI.toNight));
    const label = b.querySelector(".tool-label");
    if (label) label.textContent = t(night ? UI.night : UI.day);
  }

  private updateClock() {
    const el = this.$(".clock-time");
    if (!el) return;
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
    el.textContent = fmt.format(now);
    el.setAttribute("datetime", now.toISOString());
  }

  /* ── Texte sur la vitre (CSS 3D) ───────────────────────────────────── */

  private setupCss3d() {
    const el = this.$(".glass-text");
    if (!el) return;
    this.css3d = new CSS3DRenderer();
    this.css3d.domElement.classList.add("css3d");
    this.css3d.domElement.setAttribute("aria-hidden", "false");
    document.body.appendChild(this.css3d.domElement);
    this.layoutAbout();
  }

  private layoutAbout() {
    const el = this.$(".glass-text");
    if (!el || !this.css3d) return;
    this.flatAbout = innerWidth < 900 || innerWidth / innerHeight < 1.15;
    this.root.classList.toggle("about-flat", this.flatAbout);
    if (this.flatAbout) {
      if (this.aboutObject) {
        this.aboutObject.parent?.remove(this.aboutObject);
        this.$("#a-propos")!.appendChild(el);
        this.aboutObject = null;
      }
      this.glass?.measure();
      return;
    }
    this.css3d.setSize(innerWidth, innerHeight);
    if (!this.aboutObject) {
      this.aboutObject = new CSS3DObject(el);
      const f = aboutFacet(4);
      const s = (f.width * 0.9) / 1180;
      this.aboutObject.scale.setScalar(s);
      this.aboutObject.position.copy(f.normal.clone().multiplyScalar(0.08).add(f.center));
      this.aboutObject.rotation.y = f.angle;
      this.xp.stage.scene.add(this.aboutObject);
    }
    this.glass?.measure();
  }

  /* ── Langue ────────────────────────────────────────────────────────── */

  private rerender(l: Lang) {
    const keepTicket = this.ticketOpen;
    const night = this.xp.nightTarget > 0.5;
    this.$(".topbar")!.innerHTML = topBar(l);
    this.$(".altimeter")!.innerHTML = altimeter(l);
    // Le texte « à propos » vit peut-être dans la scène CSS 3D : on le remet avant de réécrire.
    if (this.aboutObject) {
      this.aboutObject.parent?.remove(this.aboutObject);
      this.aboutObject = null;
    }
    this.$("main")!.innerHTML = main(l);
    this.layoutAbout();
    const form = this.$(".signal-form") as HTMLFormElement | null;
    form?.addEventListener("submit", (e) => this.onSubmit(e));
    const details = this.$(".signal") as HTMLDetailsElement | null;
    details?.addEventListener("toggle", () => {
      if (details.open) this.xp.summit.burst();
    });
    document.title = `${SITE.name} — ${t(SITE.role).replace(/\.$/, "")}`;
    this.updateNightButton(night);
    this.updateClock();
    if (this.xp.audio.enabled) {
      this.$(".sound")?.setAttribute("aria-pressed", "true");
      this.$(".sound")?.setAttribute("aria-label", t(UI.soundOff));
    }
    this.active = null;
    this.currentProject = -1;
    this.lastAlt = -1;
    this.ticketOpen = -1;
    if (keepTicket >= 0) this.showTicket(keepTicket);
    else this.root.classList.remove("ticket-open");
    this.glass.refresh();
    this.xp.relabel(l);
  }

  /* ── Par image ─────────────────────────────────────────────────────── */

  update(p: number) {
    // Chapitre présent.
    let zone: Zone["id"] | null = null;
    for (const z of ZONES) if (p >= z.p0 && p < z.p1) zone = z.id;
    if (zone !== this.active) {
      this.active = zone;
      for (const sec of this.$$(".chapter")) {
        const on = sec.dataset.chapter === zone;
        sec.classList.toggle("is-active", on);
        sec.inert = !on;
      }
      if (zone !== "skills") this.closeTicket();
      if (zone !== "projects") this.toggleAlso(false);
      if (zone && zone === this.pendingFocus) {
        const h = document.querySelector<HTMLElement>(`.chapter[data-chapter="${zone}"] h1, .chapter[data-chapter="${zone}"] h2, #t-about`);
        if (h) {
          h.tabIndex = -1;
          h.focus({ preventScroll: true });
        }
        this.pendingFocus = null;
      }
      const stop = zone ? STOP_OF_ZONE[zone] : null;
      for (const b of this.$$(".alt-stop")) b.toggleAttribute("aria-current", false);
      if (stop) this.$(`.alt-stop[data-stop="${stop}"]`)?.setAttribute("aria-current", "step");
    }
    this.root.dataset.chapterPast = p > 0.064 ? "tokyo" : "";
    // Projet de face.
    if (zone === "projects") {
      const i = projectIndex(p);
      if (i !== this.currentProject) {
        this.currentProject = i;
        this.$$(".project").forEach((el) => el.classList.toggle("is-current", Number(el.dataset.project) === i));
        this.$$(".pager-item").forEach((el) => el.setAttribute("aria-current", String(Number(el.dataset.face) === i)));
        this.$$(".face-step").forEach((el) => {
          const to = i + Number(el.dataset.step);
          (el as HTMLButtonElement).disabled = to < 0 || to >= FEATURED.length;
        });
      }
    }
    // Altimètre.
    const alt = Math.round(clamp(altitudeAt(p, this.xp.stage.camera.position.y), 0, 333));
    if (alt !== this.lastAlt) {
      this.lastAlt = alt;
      const v = this.$(".alt-value");
      if (v) v.textContent = String(alt).padStart(3, "0");
      const fill = this.$(".alt-fill");
      if (fill) fill.style.height = `${(alt / 333) * 100}%`;
    }
    // Survol 3D.
    let hit: ReturnType<Hud["pick"]> = null;
    if (this.pointerInside && (this.active === "skills" || this.active === "projects")) hit = this.pick();
    this.xp.vending.hovered = hit?.kind === "vending" ? hit.index : -1;
    this.xp.screens.hovered = hit?.kind === "screen" ? hit.index : -1;
    this.root.classList.toggle("pointer-hit", !!hit);
    // Texte sur la vitre.
    if (this.css3d && this.aboutObject) {
      const presence = chapterPresence(p, 0.73, 0.86, 0.02);
      (this.aboutObject.element as HTMLElement).style.opacity = String(presence);
      if (presence > 0.001) this.css3d.render(this.xp.stage.scene, this.xp.stage.camera);
    }
  }
}
