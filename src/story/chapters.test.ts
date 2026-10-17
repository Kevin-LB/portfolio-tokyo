import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHAPTERS, LIFT1, LIFT2, STOPS, chapterAt, lift1Y, lift2Y, projectIndex, PROJECTS_WINDOW, altitudeAt } from "./chapters";
import { TOWER } from "../world/tower/spec";

describe("chapitres", () => {
  it("couvrent [0, 1] sans trou ni chevauchement", () => {
    assert.equal(CHAPTERS[0].p0, 0);
    assert.equal(CHAPTERS[CHAPTERS.length - 1].p1, 1);
    for (let i = 1; i < CHAPTERS.length; i++) assert.equal(CHAPTERS[i].p0, CHAPTERS[i - 1].p1);
  });
  it("les arrêts de navigation tombent dans le bon chapitre", () => {
    assert.equal(chapterAt(STOPS.skills).id, "skills");
    assert.equal(chapterAt(STOPS.projects).id, "projects");
    assert.equal(chapterAt(STOPS.about).id, "about");
    assert.equal(chapterAt(STOPS.contact - 1e-6).id, "summit");
  });
});

describe("ascenseurs", () => {
  it("montent sans jamais redescendre, d'un étage à l'autre", () => {
    let prev = -1;
    for (let p = 0; p <= 1; p += 0.001) {
      const y = lift1Y(p);
      assert.ok(y >= prev - 1e-9);
      prev = y;
    }
    assert.equal(lift1Y(LIFT1.p0), LIFT1.y0);
    assert.equal(lift1Y(LIFT1.p1), LIFT1.y1);
    assert.equal(lift2Y(LIFT2.p1), LIFT2.y1);
  });
  it("l'altitude affichée finit à 333 m", () => {
    assert.equal(Math.round(altitudeAt(1, 340)), TOWER.height);
    assert.ok(altitudeAt(0, 1.6) < 3);
  });
});

describe("projets", () => {
  it("chaque face est atteinte et tenue", () => {
    const { p0, p1, count } = PROJECTS_WINDOW;
    for (let i = 0; i < count; i++) assert.equal(projectIndex(p0 + ((p1 - p0) * i) / (count - 1)), i);
  });
});

import { reducedProgress, REDUCED_ANCHORS } from "./chapters";
describe("mouvement réduit", () => {
  it("ne montre que des plans fixes, la coupe est cachée par le fondu", () => {
    for (let p = 0; p <= 1; p += 0.0025) {
      const r = reducedProgress(p);
      assert.ok(REDUCED_ANCHORS.includes(r.p), `plan non fixe à ${p}`);
    }
    // Au point de coupe, l'écran est couvert.
    const mid = (REDUCED_ANCHORS[1] + REDUCED_ANCHORS[2]) / 2;
    assert.ok(reducedProgress(mid).fade > 0.99);
  });
});
