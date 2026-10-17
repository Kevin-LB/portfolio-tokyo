import * as THREE from "three";
import { clamp } from "../core/math";
import { CameraRig, towerBoundary } from "./camera-rig";

/**
 * La ligne de temps : du scroll (`p`, ce que fait la main) au récit (`s`, la
 * progression dans laquelle sont écrits les chapitres et les clés de caméra).
 *
 * Les clés de caméra disent où aller, pas à quelle vitesse. Sans cette table,
 * un même cran de molette avançait de 2 m dans la rue et de 60 m au plan
 * grue, et un virage de tête se faisait en un cran. Ici, on mesure le long du
 * trajet une vitesse *perçue* — déplacement rapporté à la distance de ce qui
 * est proche (on sent la vitesse contre un mur, pas dans le ciel), plus la
 * rotation du regard, plus le zoom — puis on répartit le scroll pour qu'elle
 * soit régulière. Les arrêts (on y lit) gardent leur durée.
 *
 * Calculé une fois au démarrage, tabulé : toujours une fonction pure du scroll.
 */

/** Intervalles du récit gardés tels quels : distributeurs, Main Deck, Top Deck. */
export const HOLDS: [number, number][] = [
  [0.1, 0.145],
  [0.405, 0.6],
  [0.74, 0.835],
];

const inHold = (s: number) => HOLDS.some(([a, b]) => s >= a && s < b);

/** Distance de « ce qui est proche » : le sol, la tour, ou ce qu'on regarde. */
export function nearDistance(pos: THREE.Vector3, target: THREE.Vector3) {
  const r = Math.hypot(pos.x, pos.z);
  const a = (Math.atan2(pos.x, pos.z) * 180) / Math.PI;
  const tower = r - towerBoundary(a, pos.y);
  return clamp(Math.min(pos.y + 4, tower, pos.distanceTo(target)), 5, 150);
}

export class Timeline {
  /** Récit aux pas réguliers du scroll. */
  private storyOf: Float64Array;
  /** Scroll aux pas réguliers du récit. */
  private scrollOf: Float64Array;
  readonly n: number;

  constructor(rig = new CameraRig(), n = 3000) {
    this.n = n;
    // 1. Coût perçu de chaque pas du récit.
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const prevPos = new THREE.Vector3();
    const prevDir = new THREE.Vector3();
    let prevFov = 0;
    const cost = new Float64Array(n);
    for (let i = 0; i <= n; i++) {
      rig.evaluate(i / n);
      pos.copy(rig.position);
      dir.copy(rig.target).sub(rig.position).normalize();
      if (i > 0) {
        const near = nearDistance(prevPos, rig.target);
        const move = pos.distanceTo(prevPos) / near;
        const turn = prevDir.angleTo(dir);
        const zoom = Math.abs(rig.fov - prevFov) / Math.max(prevFov, 1);
        cost[i - 1] = move + 0.8 * turn + 0.6 * zoom;
      }
      prevPos.copy(pos);
      prevDir.copy(dir);
      prevFov = rig.fov;
    }
    // 2. Scroll par pas du récit : 1 dans les arrêts, proportionnel au coût
    //    ailleurs (avec un plancher), le trajet se partageant le reste.
    const ds = 1 / n;
    let holdLen = 0;
    let travelCost = 0;
    for (let i = 0; i < n; i++) {
      if (inHold((i + 0.5) / n)) holdLen += ds;
      else travelCost += cost[i];
    }
    const travelMean = travelCost / Math.max(1e-9, (1 - holdLen) * n);
    const rate = new Float64Array(n);
    let travelW = 0;
    for (let i = 0; i < n; i++) {
      if (inHold((i + 0.5) / n)) continue;
      rate[i] = Math.max(cost[i], travelMean * 0.22);
      travelW += rate[i];
    }
    const k = (1 - holdLen) / (travelW * ds);
    for (let i = 0; i < n; i++) rate[i] = inHold((i + 0.5) / n) ? 1 : rate[i] * k;
    // 3. Lissage (gaussienne, σ ≈ 0,4 % du récit) : pas de changement de
    //    vitesse brusque, même aux bords des arrêts.
    const sigma = 0.004 * n;
    const half = Math.ceil(sigma * 3);
    const kernel: number[] = [];
    for (let j = -half; j <= half; j++) kernel.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
    const smooth = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      let w = 0;
      for (let j = -half; j <= half; j++) {
        const m = i + j;
        if (m < 0 || m >= n) continue;
        acc += rate[m] * kernel[j + half];
        w += kernel[j + half];
      }
      smooth[i] = acc / w;
    }
    // 4. Scroll cumulé (normalisé à 1), puis table inverse.
    this.scrollOf = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) this.scrollOf[i + 1] = this.scrollOf[i] + smooth[i] * ds;
    const total = this.scrollOf[n];
    for (let i = 0; i <= n; i++) this.scrollOf[i] /= total;
    this.storyOf = new Float64Array(n + 1);
    let j = 0;
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      while (j < n - 1 && this.scrollOf[j + 1] < p) j++;
      const a = this.scrollOf[j];
      const b = this.scrollOf[j + 1];
      const t = b > a ? clamp((p - a) / (b - a), 0, 1) : 0;
      this.storyOf[i] = (j + t) / n;
    }
    this.storyOf[n] = 1;
  }

  private static sample(table: Float64Array, x: number) {
    const n = table.length - 1;
    const f = clamp(x, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(f));
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  }

  /** Du scroll au récit. */
  story(p: number) {
    return Timeline.sample(this.storyOf, p);
  }

  /** Du récit au scroll (pour la navigation : aller à un étage). */
  scroll(s: number) {
    return Timeline.sample(this.scrollOf, s);
  }
}
