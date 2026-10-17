import type { L } from "./i18n";

/**
 * Identité, « à propos », contact. Textes de l'auteur repris de ses
 * portfolios précédents (dépôts 3D-portfolio et portoflio-house), sans ajout.
 */

export const SITE = {
  name: "Kévin Le Breton",
  url: (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SITE_URL || "https://kevinlebreton.com",
  role: { fr: "Designer et développeur web, à Orléans.", en: "Web designer and developer, based in Orléans." } as L,
  lead: {
    fr: "Je dessine et je développe des sites et des applications. Du premier écran à la mise en ligne.",
    en: "I design and build websites and applications. From the first screen to going live.",
  } as L,
  /** La banderole de la montgolfière, au sommet. */
  banner: { fr: "ON SE PARLE ?", en: "LET’S TALK" } as L,
  description: {
    fr: "Portfolio de Kévin Le Breton, designer et développeur web à Orléans : une ascension de la Tour de Tokyo, de la rue jusqu’à l’antenne — compétences, projets, à propos, contact.",
    en: "Portfolio of Kévin Le Breton, web designer and developer in Orléans: a climb up Tokyo Tower, from the street to the antenna — skills, projects, about, contact.",
  } as L,
};

export const ABOUT = {
  place: "Orléans · France",
  paragraphs: [
    {
      fr: "Je m’appelle Kévin. Je fais des sites et des applications, seul, du premier croquis à la mise en production.",
      en: "My name is Kévin. I make websites and applications, on my own, from the first sketch to production.",
    },
    {
      fr: "Je viens de la compétition — cinq championnats de France, de l’athlétisme au cheerleading. Ça se voit surtout dans la méthode : on refait jusqu’à ce que ce soit propre, et on ne livre pas un geste qu’on n’assume pas.",
      en: "I come from competition — five French championships, from athletics to cheerleading. It shows mostly in the method: you redo it until it is clean, and you don’t ship a move you can’t stand behind.",
    },
    {
      fr: "En ce moment, ce qui me retient : le temps réel, le rendu, et les interfaces qui ont l’air simples parce que quelqu’un s’est donné du mal.",
      en: "What holds my attention right now: real time, rendering, and interfaces that look simple because someone took the trouble.",
    },
  ] as L[],
  seeking: {
    fr: "Ce que je cherche : un poste où la même personne décide de la couleur d’un titre et de la façon dont la base répond.",
    en: "What I’m looking for: a role where the same person decides the colour of a heading and how the database answers.",
  } as L,
  facts: [
    { label: { fr: "Lieu", en: "Location" }, value: { fr: "Orléans, France", en: "Orléans, France" } },
    { label: { fr: "En cours", en: "Studying" }, value: { fr: "Licence MIAGE", en: "MIAGE degree" } },
    { label: { fr: "Avant le code", en: "Before code" }, value: { fr: "Cinq championnats de France", en: "Five French championships" } },
  ] as { label: L; value: L }[],
};

export const CONTACT = {
  email: "le.breton.kevin@icloud.com",
  links: [
    { label: "GitHub", url: "https://github.com/Kevin-LB" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/kevin-le-breton-6568a0276" },
    { label: "Instagram", url: "https://www.instagram.com/kev__1_/" },
  ],
  details: [
    { label: { fr: "Disponibilité", en: "Availability" }, value: { fr: "Poste en conception et développement web", en: "Open to a web design and development role" } },
    { label: { fr: "Réponse", en: "Reply" }, value: { fr: "Plus rapide par courrier que par message privé", en: "Faster by email than by direct message" } },
  ] as { label: L; value: L }[],
  subjects: [
    { fr: "Un poste", en: "A role" },
    { fr: "Un projet", en: "A project" },
    { fr: "Une question", en: "A question" },
    { fr: "Autre", en: "Something else" },
  ] as L[],
};
