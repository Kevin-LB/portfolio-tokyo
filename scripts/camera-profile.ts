import * as THREE from "three";
import { CameraRig } from "../src/story/camera-rig.ts";
import { nearDistance, Timeline } from "../src/story/timeline.ts";

/**
 * Profil du trajet de caméra, par tranche de 0,005 de scroll : vitesse (m par
 * 0,01), rotation du regard (° par 0,01), part latérale, recul. `--raw` :
 * sans la ligne de temps (dans le temps du récit).
 *   node --import ./scripts/ts-resolve.mjs scripts/camera-profile.ts [--raw]
 */
const rig = new CameraRig();
const raw = process.argv.includes("--raw");
const timeline = new Timeline();
const N = 2000;
const pos: THREE.Vector3[] = [], dir: THREE.Vector3[] = [], near: number[] = [];
for (let i = 0; i <= N; i++) {
  rig.evaluate(raw ? i / N : timeline.story(i / N));
  pos.push(rig.position.clone());
  dir.push(rig.target.clone().sub(rig.position).normalize());
  near.push(nearDistance(rig.position, rig.target));
}
// Par tranche de 0.005 : vitesse (m par 0.01 de p), rotation du regard (° par 0.01), part latérale.
const rows: string[] = [];
for (let s = 0; s < N; s += 10) {
  let dist = 0, rot = 0, lat = 0, back = 0, perc = 0;
  for (let i = s; i < s + 10; i++) {
    const d = pos[i + 1].clone().sub(pos[i]);
    dist += d.length();
    perc += d.length() / near[i] + 0.8 * dir[i].angleTo(dir[i + 1]);
    rot += dir[i].angleTo(dir[i + 1]) / THREE.MathUtils.DEG2RAD;
    const fwd = dir[i];
    const along = d.dot(fwd);
    if (along < 0) back += -along;
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    lat += Math.abs(d.dot(right));
  }
  const k = 0.01 / (10 / N); // par 0.01 de p
  rows.push(`${(s / N).toFixed(3)} v=${(dist * k).toFixed(1).padStart(6)} rot=${(rot * k).toFixed(1).padStart(6)} lat=${(lat * k).toFixed(1).padStart(6)} back=${(back * k).toFixed(1).padStart(5)} perçu=${(perc * k).toFixed(2).padStart(5)} y=${pos[s].y.toFixed(1)}`);
}
console.log(rows.join("\n"));
