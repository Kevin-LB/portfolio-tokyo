/**
 * Petites fonctions partagées. TypeScript pur : testable sans navigateur.
 */

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

/** Amortissement exponentiel indépendant de la cadence. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const DEG = Math.PI / 180;

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

export const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Spline monotone (Fritsch–Carlson) : passe par toutes les clés, sans
 * dépassement. C'est ce qui empêche la caméra de « rebondir » entre deux plans.
 */
export class MonotoneSpline {
  private xs: number[];
  private ys: number[];
  private ms: number[];

  constructor(xs: number[], ys: number[]) {
    const n = xs.length;
    this.xs = xs;
    this.ys = ys;
    const d: number[] = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]));
    const m: number[] = new Array(n).fill(0);
    if (n > 1) {
      m[0] = d[0];
      m[n - 1] = d[n - 2];
      for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
      for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) {
          m[i] = 0;
          m[i + 1] = 0;
          continue;
        }
        const a = m[i] / d[i];
        const b = m[i + 1] / d[i];
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          m[i] = t * a * d[i];
          m[i + 1] = t * b * d[i];
        }
      }
    }
    this.ms = m;
  }

  at(x: number) {
    const { xs, ys, ms } = this;
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const h = xs[hi] - xs[lo];
    const t = (x - xs[lo]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[lo] +
      (t3 - 2 * t2 + t) * h * ms[lo] +
      (-2 * t3 + 3 * t2) * ys[hi] +
      (t3 - t2) * h * ms[hi]
    );
  }
}

/**
 * Escalier adouci : transforme une progression continue en arrêts.
 * `n` paliers ; `hold` = part de chaque intervalle passée à l'arrêt.
 */
export function staircase(t: number, n: number, hold = 0.45) {
  if (n <= 1) return 0;
  const x = clamp(t) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  const h = hold / 2;
  const s = smoothstep(h, 1 - h, f);
  return i + s;
}
