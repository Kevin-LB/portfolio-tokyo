import * as THREE from "three";
import type { Stage } from "../core/stage";
import { MAX_GLASS } from "../core/post";
import { damp, smoothstep } from "../core/math";
import { shared } from "../world/atmosphere";

/**
 * Le verre liquide de l'interface. Chaque élément `[data-glass]` du DOM ne
 * porte que son texte ; sa matière (scène floutée et déviée, reflets, ombre)
 * est peinte par la passe finale du rendu, exactement sous lui. Ce module lit
 * à chaque image où sont les panneaux, leur rayon et leur opacité effective
 * (les fondus CSS suffisent donc à animer le verre), et les passe au shader.
 *
 * Le verre suit son élément avec un léger amorti : quand un panneau change de
 * taille (projet suivant, altimètre déplié), il s'étire comme une goutte.
 */

type Kind = "panel" | "control";
type Box = { x: number; y: number; w: number; h: number; r: number };
type Item = {
  el: HTMLElement;
  kind: Kind;
  radius: number;
  shown: boolean;
  box: Box;
  morph: { from: Box; t: number; dur: number } | null;
};

const DEFAULT_LIGHT = new THREE.Vector2(-0.55, 0.83).normalize();

/** Ease out « expo doux », la même courbe que `--ease-out`. */
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

export class GlassLayer {
  private items: Item[] = [];
  private dark = 0;
  private dim = 0;
  private light = DEFAULT_LIGHT.clone();
  private pointer = { x: -1e4, y: -1e4, on: 0, target: 0 };
  private canvasRect = { left: 0, top: 0, width: 1, height: 1 };
  private frame = 0;
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector2();
  private opaque = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more)");

  constructor(
    private stage: Stage,
    private reduced: boolean,
  ) {
    document.documentElement.classList.add("glass-gl");
    this.refresh();
    addEventListener("resize", () => this.measure());
    const track = (e: PointerEvent) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      const over = !!(e.target as Element | null)?.closest?.("[data-glass]");
      this.pointer.target = over && (e.pointerType === "mouse" || e.buttons > 0) ? 1 : 0;
    };
    addEventListener("pointermove", track, { passive: true });
    addEventListener("pointerdown", track, { passive: true });
    addEventListener("pointerup", (e) => e.pointerType !== "mouse" && (this.pointer.target = 0), { passive: true });
    document.documentElement.addEventListener("pointerleave", () => (this.pointer.target = 0));
  }

  /** À rappeler quand le DOM est réécrit (changement de langue). */
  refresh() {
    this.items = Array.from(document.querySelectorAll<HTMLElement>("[data-glass]")).map((el) => ({
      el,
      kind: el.dataset.glass === "control" ? "control" : "panel",
      radius: 0,
      shown: false,
      box: { x: 0, y: 0, w: 0, h: 0, r: 0 },
      morph: null,
    }));
    this.measure();
  }

  /** Rayons (ils changent avec les media queries) et place du canvas. */
  measure() {
    for (const it of this.items) it.radius = parseFloat(getComputedStyle(it.el).borderTopLeftRadius) || 0;
    const r = this.stage.canvas.getBoundingClientRect();
    this.canvasRect = { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) };
  }

  /** Le verre d'un élément naît d'un autre rectangle (l'écran du deck, un bouton). */
  morph(el: HTMLElement, from: { left: number; top: number; width: number; height: number }, radius = 10, ms = 720) {
    const it = this.items.find((i) => i.el === el);
    if (!it || this.reduced) return;
    it.morph = { from: { x: from.left, y: from.top, w: from.width, h: from.height, r: radius }, t: 0, dur: ms / 1000 };
    it.shown = true;
  }

  private opacityOf(el: HTMLElement) {
    if (getComputedStyle(el).visibility !== "visible") return 0;
    let o = 1;
    for (let n: HTMLElement | null = el; n && o > 0.002; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  }

  update(dt: number) {
    const post = this.stage.post;
    const u = post.glassMaterial.uniforms;
    if (++this.frame % 90 === 0) this.measure();
    const root = document.documentElement;
    const W = u.uRes.value.x as number;
    const H = u.uRes.value.y as number;
    const cr = this.canvasRect;
    const sx = W / cr.width;
    const sy = H / cr.height;

    // Ce qui est visible, dans l'ordre du DOM (la visionneuse en dernier, au-dessus).
    const visible: { it: Item; o: number; b: Box }[] = [];
    for (const it of this.items) {
      const el = it.el;
      if (!el.isConnected || el.closest(".css3d")) {
        it.shown = false;
        continue;
      }
      const rect = el.getBoundingClientRect();
      const o = rect.width * rect.height > 0 ? this.opacityOf(el) : 0;
      if (o < 0.003 || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) {
        it.shown = false;
        it.morph = null;
        continue;
      }
      const target: Box = { x: rect.left, y: rect.top, w: rect.width, h: rect.height, r: Math.min(it.radius, rect.width / 2, rect.height / 2) };
      const b = it.box;
      if (it.morph) {
        const m = it.morph;
        m.t = Math.min(1, m.t + dt / m.dur);
        const e = easeOut(m.t);
        b.x = THREE.MathUtils.lerp(m.from.x, target.x, e);
        b.y = THREE.MathUtils.lerp(m.from.y, target.y, e);
        b.w = THREE.MathUtils.lerp(m.from.w, target.w, e);
        b.h = THREE.MathUtils.lerp(m.from.h, target.h, e);
        b.r = THREE.MathUtils.lerp(m.from.r, target.r, e);
        if (m.t >= 1) it.morph = null;
      } else if (!it.shown || this.reduced) {
        Object.assign(b, target);
      } else {
        // Amorti : la goutte rattrape son panneau en ~120 ms.
        const k = 24;
        b.x = damp(b.x, target.x, k, dt);
        b.y = damp(b.y, target.y, k, dt);
        b.w = damp(b.w, target.w, k, dt);
        b.h = damp(b.h, target.h, k, dt);
        b.r = target.r;
      }
      it.shown = true;
      visible.push({ it, o, b });
    }
    const list = visible.slice(-MAX_GLASS);
    const { rects, shapes } = post.glass;
    list.forEach(({ it, o, b }, i) => {
      const cx = (b.x + b.w / 2 - cr.left) * sx;
      const cy = H - (b.y + b.h / 2 - cr.top) * sy;
      rects[i].set(cx, cy, (b.w / 2) * sx, (b.h / 2) * sy);
      const control = it.kind === "control";
      const r = Math.min(b.r, b.w / 2, b.h / 2);
      const bezel = control ? Math.min(b.h * 0.42, 16) : Math.min(24, Math.max(r, 12), Math.min(b.w, b.h) * 0.3);
      shapes[i].set(r * sx, o, bezel * sx, control ? 1 : 0);
    });
    post.glass.count = list.length;
    u.uPx.value = sx;

    // Verre clair le jour (texte d'encre), fumé la nuit (texte crème) : suit
    // la bascule de l'interface, le temps que les couleurs du texte changent.
    this.dark = damp(this.dark, root.dataset.time === "night" ? 1 : 0, 9, dt);
    u.uGlassDark.value = this.dark;
    // La scène s'efface derrière la visionneuse.
    const viewer = root.classList.contains("viewer-open") ? 1 : 0;
    this.dim = this.reduced ? viewer : damp(this.dim, viewer, 7, dt);
    post.final.uniforms.uDim.value = this.dim;
    u.uOpaque.value = this.opaque.matches ? 0.9 : 0;

    // La lumière des reflets vient du soleil tel que la caméra le voit ; la
    // nuit (ou soleil dans le dos), d'en haut à gauche.
    const cam = this.stage.camera;
    this.v.copy(shared.uSunDir.value).transformDirection(cam.matrixWorldInverse);
    this.v2.set(this.v.x, this.v.y);
    const len = this.v2.length();
    const w = smoothstep(0.08, 0.35, len) * (1 - shared.uNight.value) * smoothstep(-0.05, 0.1, shared.uSunDir.value.y);
    if (len > 1e-4) this.v2.divideScalar(len);
    this.v2.lerp(DEFAULT_LIGHT, 1 - w * 0.85).normalize();
    this.light.x = damp(this.light.x, this.v2.x, 3, dt);
    this.light.y = damp(this.light.y, this.v2.y, 3, dt);
    (u.uLightDir.value as THREE.Vector2).copy(this.light).normalize();

    const pt = this.pointer;
    pt.on = damp(pt.on, pt.target, 8, dt);
    (u.uPointer.value as THREE.Vector3).set((pt.x - cr.left) * sx, H - (pt.y - cr.top) * sy, pt.on);
  }
}
