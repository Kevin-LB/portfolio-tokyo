import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BANDS, TOWER, halfWidth, isOrangeAt } from "./spec";

describe("profil de la tour", () => {
  it("s'affine continûment du pied à la pointe", () => {
    let prev = Infinity;
    for (let h = 0; h <= TOWER.height; h += 0.5) {
      const w = halfWidth(h);
      assert.ok(w <= prev + 1e-6, `élargissement à ${h} m`);
      assert.ok(w > 0);
      prev = w;
    }
    assert.equal(halfWidth(0), TOWER.baseHalf);
  });
  it("peinte orange au pied et à la pointe (règles aériennes)", () => {
    assert.equal(isOrangeAt(0), true);
    assert.equal(isOrangeAt(TOWER.height - 1), true);
    assert.equal(BANDS.length, 7);
  });
  it("Main Deck à 150 m, Top Deck à 250 m", () => {
    assert.equal(TOWER.mainDeck.floor2, 150);
    assert.equal(TOWER.topDeck.floor, 250);
  });
});
