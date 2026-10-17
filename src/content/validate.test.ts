import { test } from "node:test";
import assert from "node:assert/strict";
import { applyContent, defaultContent, orderedProjects } from "./store";
import { validateContent } from "./validate";
import { FEATURED, PROJECTS } from "./projects";
import { SITE } from "./site";

test("le contenu d'origine est valide", () => {
  const r = validateContent(defaultContent());
  assert.ok(r.ok, r.ok ? "" : r.errors.join("\n"));
});

test("refuse ce qui sortirait du cadre", () => {
  const c = defaultContent();
  c.projects[0].live = "javascript:alert(1)";
  c.projects[1].slug = c.projects[0].slug;
  c.projects[2].image!.src = "https://ailleurs.example/x.png";
  c.contact.email = "pas-une-adresse";
  c.skills[0].body = "red";
  c.projects[3].featured = false;
  const r = validateContent(c);
  assert.equal(r.ok, false);
  const all = r.ok ? "" : r.errors.join("\n");
  for (const bit of ["https://", "déjà utilisé", "médiathèque", "adresse électronique", "#rrggbb", "exactement 4"]) assert.ok(all.includes(bit), `manque : ${bit}\n${all}`);
});

test("rogne les textes et écarte les champs inconnus", () => {
  const c = defaultContent() as unknown as Record<string, unknown>;
  (c.site as Record<string, unknown>).name = "  Kévin  ";
  (c as Record<string, unknown>).intrus = "<script>";
  const r = validateContent(c);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.site.name, "Kévin");
    assert.ok(!("intrus" in r.value));
  }
});

test("appliquer : brouillons masqués, deck dans l'ordre, anglais manquant → français", () => {
  const c = defaultContent();
  const extra = { ...c.projects[4], slug: "brouillon", title: "Brouillon", hidden: true, featured: false };
  c.projects.push(extra);
  c.site.lead.en = "";
  applyContent(c);
  assert.equal(FEATURED.length, 4);
  assert.ok(!PROJECTS.some((p) => p.slug === "brouillon"));
  assert.equal(SITE.lead.en, SITE.lead.fr);
  assert.deepEqual(orderedProjects(c).featured.map((p) => p.slug), FEATURED.map((p) => p.slug));
  applyContent(defaultContent());
});
