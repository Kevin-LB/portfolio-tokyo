import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MonotoneSpline, staircase, damp } from "./math";

describe("spline monotone", () => {
  it("passe par les clés et ne les dépasse jamais", () => {
    const xs = [0, 0.2, 0.5, 0.6, 1];
    const ys = [0, 10, 10, 40, 41];
    const s = new MonotoneSpline(xs, ys);
    xs.forEach((x, i) => assert.ok(Math.abs(s.at(x) - ys[i]) < 1e-9));
    let prev = -Infinity;
    for (let x = 0; x <= 1; x += 0.001) {
      const v = s.at(x);
      assert.ok(v >= prev - 1e-9, `non monotone en ${x}`);
      assert.ok(v >= 0 && v <= 41 + 1e-9, `dépassement en ${x}`);
      prev = v;
    }
    // Plateau entre deux clés égales : la caméra ne « rebondit » pas.
    for (let x = 0.2; x <= 0.5; x += 0.01) assert.ok(Math.abs(s.at(x) - 10) < 1e-9);
  });
});

describe("escalier adouci", () => {
  it("s'arrête sur chaque palier et reste monotone", () => {
    assert.equal(staircase(0, 4), 0);
    assert.equal(staircase(1, 4), 3);
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.002) {
      const v = staircase(t, 4, 0.5);
      assert.ok(v >= prev - 1e-9);
      prev = v;
    }
    // Au milieu d'un palier, on est exactement sur un projet.
    assert.equal(staircase(1 / 3, 4, 0.5), 1);
  });
});

describe("amortissement", () => {
  it("ne dépend pas de la cadence", () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 120; i++) b = damp(b, 1, 5, 1 / 120);
    assert.ok(Math.abs(a - b) < 1e-9);
  });
});
