import type { L } from "./i18n";

/**
 * Le relevé des projets.
 *
 * Repris du portfolio précédent de l'auteur (dépôt 3D-portfolio,
 * src/lib/projects.ts), où le contenu avait été relevé sur les produits
 * réels ; Dolphins et TAGA sont relevés sur leurs dépôts (README, PRODUCT.md).
 * Aucun chiffre, aucune date, aucun résultat n'est inventé : là où une
 * information manque (rôle, lien en ligne), le champ est absent.
 *
 * Les quatre premiers occupent les quatre faces du Main Deck.
 */

export type Project = {
  slug: string;
  title: string;
  year: string;
  discipline: L;
  role?: L;
  org?: string;
  line: L;
  summary: L;
  live?: string;
  stack: string[];
  facts: { label: L; value: L }[];
  /** Image principale (page d'accueil du produit), si elle existe. */
  image?: { src: string; w: number; h: number; alt: L; phone?: boolean };
  gallery?: { src: string; w: number; h: number; alt: L }[];
  /** Couleur d'écran (direction artistique, ne prétend rien sur le projet). */
  tint: string;
};

export const PROJECTS: Project[] = [
  {
    slug: "xplosion",
    title: "Xplosion",
    year: "2026",
    discipline: { fr: "Plateforme de club — site public et portails privés", en: "Club platform — public site and private portals" },
    role: { fr: "Design et développement fullstack", en: "Design and fullstack development" },
    org: "Xplosion Cheerleaders Orléans, ASPTT",
    line: {
      fr: "Pas une vitrine : une plateforme de gestion de club, deux rôles, deux portails privés.",
      en: "Not a brochure: a club management platform, two roles, two private portals.",
    },
    summary: {
      fr: "La demande ressemblait à un site vitrine ; le besoin était une application. Le club fait vivre six équipes et en prépare deux pour le Summit Européen 2027, une pour celui d’Orlando. Livré : un site public complet et deux espaces privés, derrière une authentification à deux rôles.",
      en: "The brief looked like a brochure site; the need was an application. The club runs six teams and is preparing two of them for the 2027 European Summit and one for Orlando. Delivered: a complete public site and two private areas behind two-role authentication.",
    },
    live: "https://xplosion.kevinlebreton.com",
    stack: ["Next.js 16", "React 19", "TypeScript", "Tailwind v4", "Framer Motion 12", "PostgreSQL", "Prisma 7", "Auth.js", "Docker", "Dokploy"],
    facts: [
      { label: { fr: "Rôle", en: "Role" }, value: { fr: "Design et développement fullstack", en: "Design and fullstack development" } },
      { label: { fr: "Version livrée", en: "Shipped version" }, value: { fr: "1.4.0", en: "1.4.0" } },
      { label: { fr: "Rôles applicatifs", en: "Application roles" }, value: { fr: "Bureau, Coach", en: "Board, Coach" } },
      { label: { fr: "Équipes actives", en: "Active teams" }, value: { fr: "6", en: "6" } },
    ],
    image: {
      src: "/projets/xplosion-accueil.webp",
      w: 1600,
      h: 1000,
      alt: {
        fr: "La page d’accueil du site Xplosion en ligne : titre du club, chiffres de la saison et appels à l’action.",
        en: "The live Xplosion homepage: club title, season figures and calls to action.",
      },
    },
    tint: "#18181d",
  },
  {
    slug: "eagles-cheerleading",
    title: "Eagles Cheerleading",
    year: "2026",
    discipline: { fr: "Site de club — refonte complète", en: "Club website — full redesign" },
    role: { fr: "Direction artistique et développement", en: "Art direction and development" },
    org: "Eagles Cheerleading, Meaux",
    line: {
      fr: "Un club champion du monde, dont le titre était enterré en page intérieure.",
      en: "A world-champion club whose title was buried on an inner page.",
    },
    summary: {
      fr: "Les Eagles sont champions du monde 2025 en Sénior Élite COED, et leur site enterrait ce titre dans un paragraphe de page intérieure. La refonte livre un site public et un panel d’administration, sur la direction artistique du club plutôt que sur celle de son gabarit.",
      en: "The Eagles are 2025 world champions in Senior Elite COED, and their website buried that title in a paragraph on an inner page. The redesign ships a public site and an admin panel, built on the club’s own art direction rather than its template’s.",
    },
    stack: ["Next.js 16", "React 19", "TypeScript", "Tailwind v4", "Prisma 7", "SQLite", "Docker", "Dokploy"],
    facts: [
      { label: { fr: "Rôle", en: "Role" }, value: { fr: "Direction artistique et développement", en: "Art direction and development" } },
      { label: { fr: "Livré", en: "Delivered" }, value: { fr: "Site public + panel d’administration", en: "Public site + admin panel" } },
      { label: { fr: "Pages reprises", en: "Pages reworked" }, value: { fr: "11", en: "11" } },
      { label: { fr: "Saisons de palmarès", en: "Seasons of results" }, value: { fr: "5", en: "5" } },
    ],
    image: {
      src: "/projets/eagles.webp",
      w: 1600,
      h: 854,
      alt: {
        fr: "La page d’accueil du site Eagles, du bloc-titre aux appels à l’action.",
        en: "The Eagles homepage, from the title block down to the calls to action.",
      },
    },
    gallery: [
      { src: "/projets/eagles-2.webp", w: 1800, h: 998, alt: { fr: "La page de l’équipe Cataclysm : « Championne du monde » et son palmarès.", en: "The Cataclysm team page: “Championne du monde” and its record." } },
      { src: "/projets/eagles-3.webp", w: 1800, h: 998, alt: { fr: "La galerie : « La saison, image par image », avec ses filtres par catégorie.", en: "The gallery: “La saison, image par image”, with its category filters." } },
      { src: "/projets/eagles-4.webp", w: 1800, h: 998, alt: { fr: "La page d’inscription : « Le praticable vous attend », en trois étapes.", en: "The sign-up page: “Le praticable vous attend”, in three steps." } },
    ],
    tint: "#1a1414",
  },
  {
    slug: "dolphins",
    title: "Dolphins Cheer Community",
    year: "2026",
    discipline: { fr: "Site de club — refonte trilingue", en: "Club website — trilingual redesign" },
    org: "Dolphins Cheer Community Salzgitter.Lichtenberg e.V.",
    line: {
      fr: "Trois langues, et les adresses de l’ancien site conservées : aucun lien ni référencement perdu.",
      en: "Three languages, and the old site’s addresses kept: no link and no ranking lost.",
    },
    summary: {
      fr: "Refonte de dolphins-online.de. Trois langues (allemand par défaut, anglais, français), pages rendues côté serveur depuis SQLite, panel d’administration complet. Chaque page a une vraie adresse localisée ; les adresses allemandes reprennent celles du site WordPress actuel, pour que les liens existants et le référencement continuent de fonctionner.",
      en: "A redesign of dolphins-online.de. Three languages (German by default, English, French), pages server-rendered from SQLite, a full admin panel. Every page has a real localised address; the German addresses match the current WordPress site, so existing links and search rankings keep working.",
    },
    stack: ["Astro", "TypeScript", "SQLite", "Node.js", "Docker"],
    facts: [
      { label: { fr: "Langues", en: "Languages" }, value: { fr: "Allemand, anglais, français", en: "German, English, French" } },
      { label: { fr: "Livré", en: "Delivered" }, value: { fr: "Site public + panel d’administration", en: "Public site + admin panel" } },
      { label: { fr: "Adresses", en: "Addresses" }, value: { fr: "Reprises de l’ancien site", en: "Kept from the old site" } },
    ],
    image: {
      src: "/projets/dolphins-accueil.webp",
      w: 1600,
      h: 1000,
      alt: {
        fr: "La page d’accueil du site Dolphins : le nom du club en grandes capitales bleues, une photo de compétition et le calendrier de la saison.",
        en: "The Dolphins homepage: the club name in large blue capitals, a competition photo and the season calendar.",
      },
    },
    tint: "#1f3f93",
  },
  {
    slug: "taga",
    title: "TAGA",
    year: "2026",
    discipline: { fr: "Application — les homeworks du cheerleading", en: "App — cheerleading homework" },
    line: {
      fr: "Le coach donne un homework, l’athlète s’entraîne, se filme et envoie ; le coach corrige.",
      en: "The coach sets homework, the athlete trains, films and sends it; the coach reviews it.",
    },
    summary: {
      fr: "TAGA n’est ni un réseau social ni une appli de fitness : tout sert une seule boucle — donner, s’entraîner, filmer, envoyer, corriger, valider. Cinq statuts seulement, un fil de discussion par homework, et un mineur n’envoie de vidéo qu’après l’autorisation d’un parent enregistrée par son club.",
      en: "TAGA is not a social network or a fitness app: everything serves one loop — assign, practise, film, send, review, approve. Only five statuses, one thread per homework, and a minor can only send video once a parent’s authorisation has been recorded by the club.",
    },
    stack: ["Expo", "React Native", "TypeScript", "Fastify", "PostgreSQL", "Drizzle", "ffmpeg", "Docker", "Dokploy"],
    facts: [
      { label: { fr: "La boucle", en: "The loop" }, value: { fr: "Donner → filmer → corriger → valider", en: "Assign → film → review → approve" } },
      { label: { fr: "Statuts", en: "Statuses" }, value: { fr: "5", en: "5" } },
      { label: { fr: "Rôles", en: "Roles" }, value: { fr: "Athlète, coach, admin", en: "Athlete, coach, admin" } },
    ],
    image: {
      src: "/projets/taga-accueil.webp",
      w: 860,
      h: 1864,
      phone: true,
      alt: {
        fr: "L’écran d’accueil de TAGA : le décompte « 5 6 7 8 » en autocollants, « Les homeworks du cheer. », créer un compte ou se connecter.",
        en: "TAGA’s welcome screen: the “5 6 7 8” count-in as stickers, “Les homeworks du cheer.”, sign up or sign in.",
      },
    },
    tint: "#d6246a",
  },
  {
    slug: "observo",
    title: "Observo",
    year: "2026",
    discipline: { fr: "Plateforme de recensement — web", en: "Survey platform — web" },
    role: { fr: "Développement fullstack", en: "Fullstack development" },
    org: "Université d’Orléans",
    line: { fr: "Recenser la faune : carte interactive, export PDF, API ouverte.", en: "Surveying wildlife: interactive map, PDF export, open API." },
    summary: {
      fr: "Recenser la faune suppose trois choses qu’un tableur fait mal : localiser une observation, la vérifier, la rendre réutilisable. Une carte géolocalise les espèces, les fiches s’exportent en PDF, une API REST ouvre les données.",
      en: "Surveying wildlife needs three things a spreadsheet does badly: locating an observation, verifying it, and making it reusable. A map geolocates species, records export to PDF, and a REST API opens the data.",
    },
    stack: ["Django", "Python", "Docker", "Leaflet", "API REST"],
    facts: [
      { label: { fr: "Rôle", en: "Role" }, value: { fr: "Développement fullstack", en: "Fullstack development" } },
      { label: { fr: "Cadre", en: "Context" }, value: { fr: "Université d’Orléans", en: "Université d’Orléans" } },
    ],
    image: {
      src: "/projets/observo-1.webp",
      w: 1920,
      h: 1080,
      alt: { fr: "La page d’accueil d’Observo et ses trois entrées principales.", en: "The Observo homepage and its three main entries." },
    },
    tint: "#14202a",
  },
  {
    slug: "elo-ranker",
    title: "Elo Ranker",
    year: "2025",
    discipline: { fr: "Application web temps réel", en: "Real-time web application" },
    role: { fr: "Conception et développement", en: "Design and development" },
    org: "Projet interne, IUT d’Orléans",
    line: { fr: "Un classement qui se met à jour chez tout le monde en même temps.", en: "Standings that update for everyone at the same moment." },
    summary: {
      fr: "Le calcul est l’algorithme Elo ; le vrai défi est la diffusion. Si les autres doivent recharger la page pour voir un résultat, le classement n’est plus une source commune : c’est une capture datée. NestJS porte le calcul, le client s’abonne à un flux Server-Sent Events.",
      en: "The maths is the Elo algorithm; the real problem is distribution. If everyone else has to reload to see a result, the standings stop being a shared source and become a dated snapshot. NestJS carries the computation, the client subscribes to a Server-Sent Events stream.",
    },
    stack: ["NestJS", "Next.js", "TypeScript", "TypeORM", "Server-Sent Events", "Tailwind CSS", "Framer Motion"],
    facts: [
      { label: { fr: "Rôle", en: "Role" }, value: { fr: "Conception et développement", en: "Design and development" } },
      { label: { fr: "Temps réel", en: "Real time" }, value: { fr: "Server-Sent Events", en: "Server-Sent Events" } },
    ],
    image: {
      src: "/projets/ranker-1.webp",
      w: 1920,
      h: 1130,
      alt: { fr: "La page d’accueil d’Elo Ranker, avec le podium des trois champions actuels.", en: "The Elo Ranker homepage, with the podium of the three current champions." },
    },
    tint: "#1a1a1a",
  },
  {
    slug: "quicklab",
    title: "QuickLab",
    year: "2024 — 2025",
    discipline: { fr: "Application web et mobile", en: "Web and mobile application" },
    role: { fr: "Développement", en: "Development" },
    org: "IUT d’Orléans, département Chimie",
    line: { fr: "Vérifier la disponibilité d’un produit avant de monter au labo.", en: "Checking whether a chemical is in stock before walking up to the lab." },
    summary: {
      fr: "En travaux pratiques, l’étudiant découvre qu’un produit manque au moment où il en a besoin ; le préparateur découvre la demande au même instant. QuickLab déplace l’information en amont : disponibilité en temps réel, réservation, canal direct avec les préparateurs.",
      en: "In lab sessions, a student finds out a chemical is missing exactly when they need it; the technician hears about the request at the same moment. QuickLab moves that information upstream: live availability, booking, and a direct channel to the technicians.",
    },
    stack: ["Django", "Python", "JavaScript", "Docker", "Docker Compose", "API REST"],
    facts: [
      { label: { fr: "Rôle", en: "Role" }, value: { fr: "Développement", en: "Development" } },
      { label: { fr: "Cibles", en: "Targets" }, value: { fr: "Web et mobile", en: "Web and mobile" } },
    ],
    image: {
      src: "/projets/quicklab-1.webp",
      w: 1920,
      h: 1077,
      alt: { fr: "La page d’accueil de QuickLab, listant les derniers produits ajoutés.", en: "The QuickLab homepage, listing the most recently added products." },
    },
    tint: "#151b22",
  },
  {
    slug: "starfield-ultimate",
    title: "Starfield Ultimate",
    year: "2024",
    discipline: { fr: "Moteur de rendu — C et SDL2", en: "Rendering engine — C and SDL2" },
    role: { fr: "Conception et développement", en: "Design and development" },
    org: "Projet personnel, IUT d’Orléans",
    line: { fr: "Un pipeline de rendu 3D écrit à la main en C, sans moteur.", en: "A 3D rendering pipeline written by hand in C, with no engine." },
    summary: {
      fr: "SDL2 ne fournit qu’une surface 2D et des entrées : tout ce qui relève de la 3D devait être écrit. Matrices de rotation, projection perspective, tracé fil-de-fer, champ d’étoiles infini, astéroïdes générés à l’exécution, physique newtonienne.",
      en: "SDL2 gives you a 2D surface and input, nothing more: everything 3D had to be written. Rotation matrices, perspective projection, wireframe drawing, an endless star field, asteroids generated at runtime, Newtonian physics.",
    },
    stack: ["C", "SDL2", "CMake", "Mathématiques 3D"],
    facts: [
      { label: { fr: "Rôle", en: "Role" }, value: { fr: "Conception et développement", en: "Design and development" } },
      { label: { fr: "Langage", en: "Language" }, value: { fr: "C, sans moteur", en: "C, no engine" } },
    ],
    image: {
      src: "/projets/starfield-2.webp",
      w: 1590,
      h: 1196,
      alt: {
        fr: "Starfield Ultimate en vol — le programme n’a pas de page d’accueil, il démarre dans le champ d’étoiles.",
        en: "Starfield Ultimate in flight — the program has no homepage; it starts inside the star field.",
      },
    },
    tint: "#05070c",
  },
];

/** Les quatre faces du Main Deck. Remplies par le contenu (store.ts). */
export const FEATURED: Project[] = PROJECTS.slice(0, 4);
/** « Aussi à cet étage ». */
export const OTHERS: Project[] = PROJECTS.slice(4);
