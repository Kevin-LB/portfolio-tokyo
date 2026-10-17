import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLots, buildRoads, PLOT, VENDING, TOWER_STREET } from "./layout";

const overlaps = (a: { x0: number; x1: number; z0: number; z1: number }, b: typeof a) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

describe("plan du quartier", () => {
  const lots = buildLots();
  const roads = buildRoads();
  it("aucun bâtiment sur une chaussée ni sur le terrain de la tour", () => {
    for (const l of lots) {
      assert.ok(!overlaps(l, PLOT), `lot sur le terrain de la tour : ${JSON.stringify(l)}`);
      for (const r of roads) assert.ok(!overlaps(l, r), `lot sur une route : ${JSON.stringify(l)}`);
    }
  });
  it("la rue d'ouverture reste dégagée jusqu'à la tour", () => {
    for (const l of lots) assert.ok(!overlaps(l, { ...TOWER_STREET, z0: 60 }));
  });
  it("les distributeurs sont adossés à une façade du côté ouest", () => {
    const wall = lots.find((l) => l.x1 <= VENDING.x && l.x1 > VENDING.x - 1.5 && l.z0 < VENDING.z && l.z1 > VENDING.z);
    assert.ok(wall, "pas de façade derrière les distributeurs");
  });
  it("le plan est déterministe", () => {
    assert.deepEqual(buildLots().slice(0, 20), lots.slice(0, 20));
  });
});
