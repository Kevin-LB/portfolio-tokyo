import type { L } from "./i18n";

/**
 * Quatre distributeurs, quatre façons de travailler. Pas un inventaire de
 * logos : ce que ça permet de faire, et où c'est prouvé (les projets).
 * Les outils cités viennent des piles techniques réelles des projets.
 */

export type Skill = {
  id: "design" | "front" | "back" | "render";
  /** Nom sur la canette et la machine. */
  name: L;
  /** Nom japonais (sur le fronton du distributeur). */
  jp: string;
  /** Couleur de la marque du distributeur. */
  body: string;
  accent: string;
  /** Une phrase qui tient seule. */
  promise: L;
  /** Ce que ça veut dire concrètement. */
  text: L;
  tools: string[];
  /** Projets où c'est visible (slugs). */
  proof: string[];
  price: string;
};

export const SKILLS: Skill[] = [
  {
    id: "design",
    name: { fr: "Design", en: "Design" },
    jp: "意匠",
    body: "#f2efe8",
    accent: "#d6246a",
    promise: { fr: "Un design qui appartient au projet, pas au gabarit.", en: "A design that belongs to the project, not to the template." },
    text: {
      fr: "Je pars de ce que le client a de propre — son palmarès, ses couleurs, son tapis — et je décide la typographie, la palette, la mise en page et le mouvement avant d’écrire une ligne de code.",
      en: "I start from what the client already owns — their record, their colours, their mat — and decide typography, palette, layout and motion before writing a line of code.",
    },
    tools: ["Figma", "Direction artistique", "Systèmes de design", "Typographie", "Motion"],
    proof: ["eagles-cheerleading", "taga", "xplosion"],
    price: "¥130",
  },
  {
    id: "front",
    name: { fr: "Interfaces", en: "Interfaces" },
    jp: "画面",
    body: "#1f6f8b",
    accent: "#f2c14e",
    promise: {
      fr: "Des interfaces qui ont l’air simples parce que quelqu’un s’est donné du mal.",
      en: "Interfaces that look simple because someone took the trouble.",
    },
    text: {
      fr: "Accessibles, rapides, lisibles sur un téléphone tenu d’une main, animées quand le mouvement explique quelque chose. Des sites publics aux applications avec comptes, en trois langues s’il le faut.",
      en: "Accessible, fast, readable on a phone held in one hand, animated when motion explains something. From public sites to apps with accounts, in three languages if needed.",
    },
    tools: ["React", "Next.js", "TypeScript", "Tailwind", "Astro", "React Native", "Expo", "Motion"],
    proof: ["xplosion", "eagles-cheerleading", "dolphins", "taga"],
    price: "¥150",
  },
  {
    id: "back",
    name: { fr: "Systèmes", en: "Systems" },
    jp: "基盤",
    body: "#2f6b4f",
    accent: "#e9e4d6",
    promise: { fr: "Ce qu’il y a derrière, jusqu’à la mise en ligne.", en: "What sits behind it, all the way to production." },
    text: {
      fr: "Comptes et rôles, bases de données, temps réel, panels d’administration, traitement vidéo — puis les conteneurs et la mise en production sur un serveur que j’administre.",
      en: "Accounts and roles, databases, real time, admin panels, video processing — then containers and deployment on a server I run myself.",
    },
    tools: ["Node.js", "NestJS", "Fastify", "Django", "PostgreSQL", "SQLite", "Prisma", "Drizzle", "Auth.js", "Docker", "Dokploy"],
    proof: ["xplosion", "taga", "elo-ranker", "observo"],
    price: "¥160",
  },
  {
    id: "render",
    name: { fr: "3D & rendu", en: "3D & rendering" },
    jp: "立体",
    body: "#e4532a",
    accent: "#fff3e6",
    promise: { fr: "Vous êtes dedans.", en: "You are standing in it." },
    text: {
      fr: "Three.js et shaders pour le web — cette tour est générée en code, sans modèle téléchargé. Et pour comprendre ce qu’il y a dessous, un moteur de rendu écrit en C, sans bibliothèque graphique.",
      en: "Three.js and shaders for the web — this tower is generated in code, with no downloaded model. And to understand what sits underneath, a renderer written in C, with no graphics library.",
    },
    tools: ["three.js", "WebGL", "GLSL", "React Three Fiber", "C", "SDL2"],
    proof: ["starfield-ultimate"],
    price: "¥180",
  },
];
