/**
 * Paliers de qualité. Décidés au démarrage d'après l'appareil, puis ajustés
 * en continu par le budget de pixels (temps de frame mesurés).
 */

export type Tier = "high" | "medium" | "low";

export type Quality = {
  tier: Tier;
  /** Mégapixels rendus au plus (le DPR en découle). */
  pixelBudget: number;
  maxDpr: number;
  msaa: number;
  bloom: boolean;
  shadowSize: number;
  /** 0..1 : densité de la ville, des passants, des détails du treillis. */
  detail: number;
  touch: boolean;
};

export function detectQuality(gl: WebGL2RenderingContext | null): Quality {
  const touch = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  let gpu = "";
  if (gl) {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  }
  const weakGpu = /swiftshader|llvmpipe|software|mali-[gt][0-9]{2}\b|adreno \(tm\) [3-5]|intel\(r\) (hd|uhd) graphics [0-9]{3}\b/i.test(gpu);
  const strongGpu = /apple m\d|apple gpu|nvidia|geforce|radeon rx|rtx|arc/i.test(gpu);

  const forced = new URLSearchParams(location.search).get("qualite") as Tier | null;
  let tier: Tier = "medium";
  if (touch && small) tier = mem >= 6 && cores >= 6 && !weakGpu ? "medium" : "low";
  else if (strongGpu && !weakGpu) tier = "high";
  else if (weakGpu || mem <= 4) tier = "low";
  if (forced === "high" || forced === "medium" || forced === "low") tier = forced;

  const table: Record<Tier, Omit<Quality, "tier" | "touch">> = {
    high: { pixelBudget: 3.2e6, maxDpr: 2, msaa: 4, bloom: true, shadowSize: 4096, detail: 1 },
    medium: { pixelBudget: 2.2e6, maxDpr: 1.75, msaa: 2, bloom: true, shadowSize: 2048, detail: 0.7 },
    low: { pixelBudget: 1.4e6, maxDpr: 2, msaa: 0, bloom: false, shadowSize: 1024, detail: 0.4 },
  };
  return { tier, touch, ...table[tier] };
}

/**
 * MSAA selon la densité réelle : sur un écran déjà dense (DPR ≥ 1,5), ×2
 * suffit et coûte deux fois moins (c'est le poste le plus cher mesuré).
 */
export function samplesFor(q: Quality, dpr: number) {
  if (q.msaa === 0) return 0;
  return dpr >= 1.5 ? Math.min(2, q.msaa) : q.msaa;
}

/** DPR qui respecte le budget de pixels (même logique qu'un budget d'énergie). */
export function dprFor(q: Quality, w: number, h: number, scale = 1) {
  const budget = q.pixelBudget * scale;
  return Math.max(0.75, Math.min(q.maxDpr, devicePixelRatio, Math.sqrt(budget / (w * h))));
}

/**
 * Gouverneur : si la médiane des frames dépasse la cible, on baisse le budget
 * de pixels par paliers ; si on a de la marge longtemps, on remonte.
 */
export class FrameGovernor {
  private samples: number[] = [];
  scale = 1;
  private cooldown = 0;
  constructor(private target = 1000 / 58) {}

  /** Retourne true si l'échelle a changé (il faut redimensionner). */
  push(ms: number) {
    this.samples.push(ms);
    if (this.cooldown > 0) this.cooldown--;
    if (this.samples.length < 90) return false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples.length = 0;
    if (this.cooldown > 0) return false;
    if (median > this.target * 1.12 && this.scale > 0.45) {
      this.scale = Math.max(0.45, this.scale * 0.8);
      this.cooldown = 3;
      return true;
    }
    if (median < this.target * 0.7 && this.scale < 1) {
      this.scale = Math.min(1, this.scale * 1.12);
      this.cooldown = 6;
      return true;
    }
    return false;
  }
}
