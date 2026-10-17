import { clamp, easeInOutCubic } from "../core/math";

/**
 * Le scroll est l'ascenseur. Scroll natif (molette, trackpad, clavier,
 * tactile, technologies d'assistance) ; la progression affichée suit la
 * cible par un ressort critique : la vitesse reste continue (un cran de
 * molette ne donne plus une impulsion qui retombe, mais un départ et un
 * arrêt doux), sans jamais dépasser la cible. La navigation anime le scroll
 * lui-même : la caméra traverse vraiment le trajet.
 */
export class ScrollController {
  /** Progression amortie (celle qui pilote la scène). */
  p = 0;
  /** Progression brute (position de scroll). */
  target = 0;
  /** Vitesse (unités de p par seconde), pour les effets de mouvement. */
  velocity = 0;
  private tween: { from: number; to: number; t: number; dur: number } | null = null;
  /** Temps de lissage du ressort (s). */
  private smoothTime: number;
  /** Vitesse du ressort (unités de p par seconde). */
  private springVel = 0;
  private max = 1;

  constructor(
    private spacer: HTMLElement,
    touch: boolean,
    private reduced: boolean,
  ) {
    // Le tactile a déjà son inertie native : on suit de plus près.
    this.smoothTime = touch ? 0.12 : 0.26;
    const stop = () => (this.tween = null);
    addEventListener("wheel", stop, { passive: true });
    addEventListener("touchstart", stop, { passive: true });
    addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(e.key)) stop();
    });
    addEventListener("resize", () => this.measure());
    this.measure();
    this.read();
    this.p = this.target;
  }

  measure() {
    this.max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  }

  private read() {
    this.target = clamp(scrollY / this.max);
  }

  /** Va à une progression : animation de scroll (ou saut en mouvement réduit). */
  goTo(p: number) {
    this.measure();
    const to = clamp(p);
    if (this.reduced) {
      scrollTo({ top: to * this.max, behavior: "instant" as ScrollBehavior });
      this.read();
      this.p = this.target;
      return;
    }
    const from = clamp(scrollY / this.max);
    const dist = Math.abs(to - from);
    const dur = Math.min(3.4, 1.1 + dist * 4.2);
    this.tween = { from, to, t: 0, dur };
  }

  get navigating() {
    return this.tween !== null;
  }

  update(dt: number) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = easeInOutCubic(clamp(tw.t / tw.dur));
      const v = tw.from + (tw.to - tw.from) * k;
      scrollTo({ top: v * this.max, behavior: "instant" as ScrollBehavior });
      if (tw.t >= tw.dur) this.tween = null;
    }
    this.read();
    const prev = this.p;
    if (this.reduced) {
      this.p = this.target;
      this.springVel = 0;
    } else {
      // Pendant une navigation, on suit de près (la courbe est déjà douce).
      // Vitesse plafonnée : un grand saut (Fin, barre de défilement) devient
      // un trajet, pas une téléportation à travers la tour.
      this.p = this.spring(this.p, this.target, this.tween ? 0.06 : this.smoothTime, 0.75, dt);
    }
    if (Math.abs(this.p - this.target) < 1e-5 && Math.abs(this.springVel) < 1e-4) {
      this.p = this.target;
      this.springVel = 0;
    }
    this.velocity = dt > 0 ? (this.p - prev) / dt : 0;
    return this.p;
  }

  /** Ressort critique (approximation stable, type « SmoothDamp »). */
  private spring(current: number, target: number, smoothTime: number, maxSpeed: number, dt: number) {
    if (dt <= 0) return current;
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const maxChange = maxSpeed * smoothTime;
    const change = clamp(current - target, -maxChange, maxChange);
    const goal = current - change;
    const temp = (this.springVel + omega * change) * dt;
    this.springVel = (this.springVel - omega * temp) * decay;
    let out = goal + (change + temp) * decay;
    // Jamais au-delà de la cible.
    if (target - current > 0 === out > target) {
      out = target;
      this.springVel = 0;
    }
    return out;
  }

  get spacerElement() {
    return this.spacer;
  }
}
