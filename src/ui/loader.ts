import { BANDS, TOWER, halfWidth } from "../world/tower/spec";
import { MAIN } from "../world/tower/decks";

/**
 * Le chargement : la silhouette exacte de la tour (le même profil que la 3D)
 * est tracée, puis peinte en orange bande par bande à mesure que la scène se
 * construit. Le compteur est une altitude, pas un pourcentage.
 */

const NS = "http://www.w3.org/2000/svg";
const VW = 200;
const VH = 400;
const SCALE = (VH - 16) / TOWER.height;
const X = (x: number) => VW / 2 + x * SCALE * 1.15;
const Y = (h: number) => VH - 8 - h * SCALE;

function towerPath() {
  // Profil : pied gauche → sommet → pied droit (la silhouette vue de face).
  const left: string[] = [];
  const right: string[] = [];
  for (let h = 0; h <= TOWER.crown.top; h += 4) {
    let w = halfWidth(h);
    if (h >= TOWER.mainDeck.bottom && h <= TOWER.mainDeck.top) w = MAIN.half + MAIN.flare * ((h - MAIN.y0) / (MAIN.y1 - MAIN.y0));
    if (h >= TOWER.topDeck.bottom && h <= TOWER.topDeck.top) w = TOWER.topDeck.radius;
    left.push(`${X(-w).toFixed(1)},${Y(h).toFixed(1)}`);
    right.unshift(`${X(w).toFixed(1)},${Y(h).toFixed(1)}`);
  }
  const tip = [`${X(-1.6).toFixed(1)},${Y(TOWER.crown.top).toFixed(1)}`, `${X(-0.4).toFixed(1)},${Y(318).toFixed(1)}`, `${X(0).toFixed(1)},${Y(TOWER.height).toFixed(1)}`, `${X(0.4).toFixed(1)},${Y(318).toFixed(1)}`, `${X(1.6).toFixed(1)},${Y(TOWER.crown.top).toFixed(1)}`];
  // Arche du pied.
  const arch = `${X(32).toFixed(1)},${Y(0).toFixed(1)} Q ${X(0).toFixed(1)},${Y(62).toFixed(1)} ${X(-32).toFixed(1)},${Y(0).toFixed(1)}`;
  return `M ${left.join(" L ")} L ${tip.join(" L ")} L ${right.join(" L ")} L ${arch} Z`;
}

export class Loader {
  private el = document.querySelector<HTMLElement>("#loader");
  private value = document.querySelector<HTMLElement>(".loader-value");
  private bands: SVGRectElement[] = [];
  private shown = 0;
  private target = 0;
  private raf = 0;

  constructor() {
    const svg = document.querySelector<SVGSVGElement>(".loader-tower");
    if (!svg) return;
    const d = towerPath();
    const defs = document.createElementNS(NS, "defs");
    const clip = document.createElementNS(NS, "clipPath");
    clip.setAttribute("id", "tower-clip");
    const clipPath = document.createElementNS(NS, "path");
    clipPath.setAttribute("d", d);
    clip.appendChild(clipPath);
    defs.appendChild(clip);
    svg.appendChild(defs);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("clip-path", "url(#tower-clip)");
    let prev = 0;
    for (const [top, orange] of BANDS) {
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", "0");
      r.setAttribute("width", String(VW));
      r.setAttribute("y", Y(Math.min(top, TOWER.height)).toFixed(1));
      r.setAttribute("height", (Y(prev) - Y(Math.min(top, TOWER.height))).toFixed(1));
      r.setAttribute("fill", orange ? "#e4532a" : "#efe7da");
      r.style.transformOrigin = `0 ${Y(prev)}px`;
      r.style.transform = "scaleY(0)";
      g.appendChild(r);
      this.bands.push(r);
      prev = top;
    }
    svg.appendChild(g);
    const outline = document.createElementNS(NS, "path");
    outline.setAttribute("d", d);
    outline.setAttribute("class", "outline");
    svg.appendChild(outline);
    this.tick();
  }

  /** 0 → 1 */
  progress(v: number) {
    this.target = Math.max(this.target, Math.min(1, v));
  }

  private tick = () => {
    this.shown += (this.target - this.shown) * 0.12;
    if (this.target - this.shown < 0.002) this.shown = this.target;
    const h = this.shown * TOWER.height;
    if (this.value) this.value.textContent = String(Math.round(h)).padStart(3, "0");
    let prev = 0;
    for (let i = 0; i < this.bands.length; i++) {
      const top = Math.min(BANDS[i][0], TOWER.height);
      const k = Math.max(0, Math.min(1, (h - prev) / (top - prev)));
      this.bands[i].style.transform = `scaleY(${k})`;
      prev = top;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  async done(label: string) {
    this.progress(1);
    await new Promise((r) => setTimeout(r, 450));
    const l = document.querySelector(".loader-label");
    if (l) l.textContent = label;
    this.el?.classList.add("is-done");
    this.el?.setAttribute("aria-busy", "false");
    setTimeout(() => cancelAnimationFrame(this.raf), 1000);
  }
}
