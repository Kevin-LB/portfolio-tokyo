import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CameraRig } from "./camera-rig";
import { HOLDS, nearDistance, Timeline } from "./timeline";
import { PROJECTS_WINDOW } from "./chapters";

const rig = new CameraRig();
const timeline = new Timeline(rig);

test("ligne de temps : bornes, monotonie, aller-retour", () => {
  assert.equal(timeline.story(0), 0);
  assert.equal(timeline.story(1), 1);
  let prev = -1;
  for (let i = 0; i <= 1000; i++) {
    const s = timeline.story(i / 1000);
    assert.ok(s >= prev, `le récit recule au scroll ${i / 1000}`);
    prev = s;
    assert.ok(Math.abs(timeline.scroll(s) - i / 1000) < 2e-3, "story → scroll → story");
  }
});

test("les arrêts gardent à peu près leur durée de scroll", () => {
  for (const [a, b] of HOLDS) {
    const len = timeline.scroll(b) - timeline.scroll(a);
    assert.ok(len > (b - a) * 0.7 && len < (b - a) * 1.4, `arrêt ${a}–${b} : ${len.toFixed(3)}`);
  }
});

test("dans la rue, on ne fait qu'avancer vers la tour", () => {
  let prevZ = Infinity;
  for (let s = 0; s <= 0.2; s += 0.001) {
    rig.evaluate(s);
    assert.ok(rig.position.z <= prevZ + 1e-6, `recul à s = ${s.toFixed(3)}`);
    prevZ = rig.position.z;
  }
});

test("vitesse perçue régulière hors des arrêts (pas d'accélération brusque)", () => {
  const N = 2000;
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  const prevDir = new THREE.Vector3();
  const rates: number[] = [];
  let near = 0;
  for (let i = 0; i <= N; i++) {
    const p = i / N;
    const s = timeline.story(p);
    rig.evaluate(s);
    pos.copy(rig.position);
    dir.copy(rig.target).sub(rig.position).normalize();
    const travel = !HOLDS.some(([a, b]) => s >= a - 0.01 && s <= b + 0.01) && !(s > PROJECTS_WINDOW.p0 && s < PROJECTS_WINDOW.p1);
    if (i > 0 && travel) rates.push((pos.distanceTo(prevPos) / near + 0.8 * prevDir.angleTo(dir)) * N);
    near = nearDistance(rig.position, rig.target);
    prevPos.copy(pos);
    prevDir.copy(dir);
  }
  const sorted = [...rates].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const max = sorted[sorted.length - 1];
  assert.ok(max < median * 1.6, `pic ${max.toFixed(1)} pour une médiane de ${median.toFixed(1)}`);
});
