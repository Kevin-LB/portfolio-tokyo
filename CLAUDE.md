# Conventions du dépôt — « 333 m »

Portfolio-ascension de la Tour de Tokyo. Vite 8, TypeScript, three.js (sans
framework). Docs et commentaires en français.

```bash
npm run dev        # http://localhost:3003 (site + /admin, API montée dans Vite)
npm test           # node --test (TypeScript exécuté par Node, sans navigateur)
npm run typecheck && npm run build   # dist/ + dist-server/
```

## Ce qui tient l'architecture

**Tout l'état du monde est une fonction de la progression du récit `s ∈ [0,1]`.**
Le scroll (`p`) passe par `src/story/timeline.ts`, qui répartit le scroll
pour que la vitesse *perçue* reste régulière (arrêts conservés) ; le scroll
lui-même suit la main par un ressort critique (`scroll.ts`). Les clés de
caméra disent où aller, pas à quelle vitesse ; le regard est interpolé en
angles. `scripts/camera-profile.ts` mesure le trajet ; les tests interdisent
le recul dans la rue et les pics de vitesse.
`src/story/chapters.ts` découpe l'ascension (chapitres, ascenseurs, faces du
Main Deck, arrêts de navigation) ; `src/story/camera-rig.ts` porte les clés de
caméra en coordonnées cylindriques autour de l'axe de la tour, interpolées par
splines monotones. Remonter le scroll redescend exactement. Seule la vie
ambiante (passants, voitures, pétales, avion) dépend du temps.

**Une seule source de vérité pour la tour.** `src/world/tower/spec.ts` porte
les cotes (333 m, Main Deck 150 m, Top Deck 250 m, bandes de peinture). Le
treillis, les plateformes, la caméra « qui épouse la structure », l'altimètre
et le dessin du chargement en dérivent.

**Le WebGL porte l'environnement, le DOM porte le contenu.** Le contenu est
généré par `src/ui/markup.ts` (fonction pure) : injecté dans `index.html` à la
construction (moteurs, lecteurs d'écran, sans WebGL), réutilisé au changement
de langue. Le texte « à propos » posé sur la vitre est du vrai DOM (CSS 3D).

**Une variable pour l'heure.** `night ∈ [0,1]` pilote soleil, ciel, brouillard,
fenêtres (allumées une à une dans le shader), enseignes, Landmark Light,
bloom, nuages, horizon. Ombres et environnement ne sont recalculés que quand
l'heure change.

**Le contenu est un document édité dans l'administration.** `src/content/store.ts`
(type `Content`, application aux modules `site`, `skills`, `projects`),
`validate.ts` (tout ce qui entre). Le serveur (`server/`, Node seul, SQLite
intégré) enregistre des révisions, rend la page avec le contenu publié et le
joint en bloc JSON ; l'admin (`src/admin/`, sans framework, jamais
d'`innerHTML`) l'édite. Les valeurs d'origine restent dans les modules.

**Rien d'inventé.** Projets, textes « à propos », coordonnées : repris des
portfolios précédents de l'auteur ou relevés dans les dépôts des projets. Un
champ inconnu est absent, pas rempli.

## Règles

- Tricher plutôt que simuler : fenêtres dans le shader, points lumineux en
  billboards additifs, ombres statiques, nuages sculptés + voile plein écran.
- Budget mesuré (`__perf(p)` en dev) : ~14–17 ms/image à 1440×900 sur M1.
- Interface : verre liquide. Les panneaux `[data-glass]` sont transparents ;
  leur matière (scène floutée, réfraction et dispersion sur le biseau,
  reflets orientés par le soleil, ombre) est peinte par le rendu
  (`src/ui/glass.ts` lit leurs rectangles, `post.ts` les dessine). La teinte
  s'adapte au fond pour garder le contraste du texte. Une encre, l'orange de
  la tour pour l'action, des pastilles arrondies. La version texte reste
  sur papier.
- Mouvement réduit : plans fixes et fondus (`reducedProgress`), pas de spirale,
  pas de parallaxe, pas de pétales.
- Japonais : sous-ensemble de police (`scripts/subset-jp.py`) à relancer après
  avoir ajouté des caractères.

## Outils de développement

`__xp` (l'expérience), `__shot(nom, p, {night, w, h})` (écrit une image du
canvas dans `.shots/`), `__perf(p)` (temps par image, draw calls, triangles).
N'existent qu'en `vite dev`.
