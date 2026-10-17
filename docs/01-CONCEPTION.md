# Conception — « 333 m »

Portfolio de Kévin Le Breton. Une seule idée : **le portfolio est l'ascension de la
Tour de Tokyo.** On part de la rue, on finit au bout de l'antenne. Le scroll est
l'ascenseur.

Ce document fixe les décisions avant le code. Tout ce qui est construit ensuite
doit pouvoir pointer vers une ligne d'ici.

---

## 1. Ce que la référence nous apprend (Think Big Studio)

Analyse faite sur le code livré (`boot.js`, `review.bundle.js`, `atmosphere.json`),
la référence ne s'affichant pas dans les navigateurs disponibles.

| Constat | Pourquoi ça compte | Ce qu'on en garde (sans copier) |
|---|---|---|
| Le HTML lisible est la page par défaut ; la 3D le remplace seulement si JS + WebGL répondent. En cas d'erreur, redirection vers la lecture. | Indexable, accessible, jamais de page blanche. | Même principe : `index.html` contient tout le contenu, la scène s'ajoute par-dessus. |
| Un seul modèle « héros », très travaillé ; tout le reste (ciel, nuages) est **calculé une fois puis réutilisé** (nuages volumétriques rendus dans une cible, réutilisés comme fond et comme environnement). | La qualité perçue vient d'un objet très soigné, pas de la quantité. Le coût réel est payé une fois. | La tour est le héros. Ciel, ombres et environnement sont recalculés seulement quand l'heure change. |
| Budget de pixels : `DPR = clamp(√(5 Mpx / surface), 1, 2)`. MSAA ×4 en cible flottante, puis une seule passe de sortie (tone mapping + saturation légère + courbe en S douce). Bloom **seulement la nuit**. | Net partout, sans faire chauffer un écran 5K. Le rendu « propre » vient de l'antialiasing et d'un étalonnage retenu, pas d'effets. | Même discipline : budget de pixels, MSAA, une passe d'étalonnage, bloom réservé à la nuit. |
| FOV 31° (téléobjectif). | Aplatit la perspective : effet maquette, objet précieux. | On alterne : grand-angle au sol (la tour écrase), focales longues en altitude (la ville devient maquette). Le changement de focale **est** une partie de la sensation de hauteur. |
| Lumière : hémisphère + soleil qui glisse vers la lune ; deux projecteurs chauds n'existent que la nuit. Sky shader avec étoiles fixées au monde. | Jour/nuit = une seule variable qui pilote tout. | Une variable `night ∈ [0,1]` pilote ciel, soleil, fenêtres, enseignes, tour, brouillard, bloom, son. |
| Interactions : roue → rotation amortie `1 − e^(−10·dt)`, inertie au glisser, survol = +6 % d'échelle en 320 ms, focus = page HTML détachée. | Tout répond, rien ne saute. Mêmes constantes partout = même langage. | Système de mouvement unique (§7), amortissements exponentiels, aucune animation hors tokens. |
| Chargement : la silhouette réelle du modèle est capturée et sert au loader. | Le loader appartient au monde. | Notre loader dessine la tour et la **peint** bande par bande (§9). |
| Instrumentation perf intégrée (médiane / p95 de frame, draw calls, triangles par section). | On mesure par chapitre, pas « en gros ». | `?perf` affiche les mêmes mesures par chapitre. |

Ce qu'on ne reprend **pas** : la tour qui tourne sur elle-même (chez nous, c'est la
caméra qui monte), les panneaux-pages accrochés à la tour, le dirigeable qui passe,
le message défilant à points, la palette argent / métal satiné.

## 2. La vraie tour (relevés)

- 333 m. Main Deck à **150 m** (deux niveaux), Top Deck à **250 m**. Antenne d'environ 90 m.
- Tour en treillis inspirée de la tour Eiffel, plus simple : quatre pieds concaves
  qui enjambent **FootTown** (5 étages, façade sombre), une cage d'ascenseur vitrée
  au centre, 4 ascenseurs (rez → Main Deck ; Main Deck → Top Deck), ~600 marches.
- Peinte en **orange international et blanc** (règles aériennes). Relevé sur photo :
  orange du pied jusqu'au-dessus du Main Deck, puis blanc / orange / blanc (Top Deck) /
  orange / blanc / orange à la pointe. Petites sphères blanches (balises, paraboles).
- Main Deck : boîte blanche plus large que la tour, vitrée, légèrement évasée vers le haut.
  Top Deck : anneau étroit, rayé.
- Nuit : 176 projecteurs. **Landmark Light** = sodium orange doré (octobre → juillet) ;
  la tour brille de l'intérieur, chaude, pas néon.
- Voisinage : parc Shiba, temple **Zōjō-ji** (grand toit courbe juste à côté), voies
  express surélevées, Azabudai, baie de Tokyo au sud-est, **Skytree** au nord-est,
  **Fuji** à l'ouest-sud-ouest par temps clair.

## 3. Direction artistique — « Tokyo, diorama de verre et de métal peint »

Stylisé, premium, chaud, coloré, minimal, un peu joueur, très propre.

- **Formes designées, pas des primitives** : chanfreins, auvents, garde-corps, bacs de
  climatisation, réservoirs d'eau sur les toits, poteaux et câbles, distributeurs avec
  façade, boutons et bac, voitures kei aux volumes arrondis, cerisiers en masses
  irrégulières, passants avec silhouettes distinctes (parapluie, sac, cartable).
- **Matières** : métal peint mat-satiné pour la tour, crépi et carrelage clair pour la ville,
  verre légèrement teinté. Pas de photoréalisme, pas de textures photo.
- **Lumière jour** : soleil d'après-midi chaud, ombres longues et nettes, ciel bleu doux,
  brume d'horizon chaude (perspective aérienne). La ville est claire.
- **Lumière nuit** : bleu profond (jamais violet), fenêtres ambrées allumées une par une,
  enseignes rares, rues en points chauds, voie express en ruban doré, tour en *Landmark
  Light*. Pas de cyberpunk.
- **Palette de scène** : orange tour `#E8542A`, blanc tour `#F3EEE6`, béton `#D8D1C4`,
  asphalte `#55585E`, verdure `#7E9F68`, sakura `#F1B9C6` (rare), ciel `#86BFE6`,
  nuit `#0D1830`, lumière ambrée `#FFC67A`.
- **Interface** : une encre, du verre, un accent. Accent = l'orange de la tour, réservé à
  l'action. Panneaux en verre liquide calculé dans le rendu (voir `02-REALISATION.md`),
  coins arrondis, commandes en pastilles ; la version texte reste sur papier,
  une seule famille latine (Instrument Sans) + Zen Kaku Gothic New pour le japonais
  (signalétique, noms des niveaux). Chiffres tabulaires pour l'altimètre.

## 4. Storytelling et level design vertical

Le contraste porte le récit : **rue → énergie → travail → ciel → calme → moi → signal.**

| Progression | Altitude | Chapitre | Ce qui se passe |
|---|---|---|---|
| 0 – 7 % | 1,6 m | **Tokyo** | Regard de piéton au milieu d'une rue étroite ; câbles, enseignes, la tour au bout de la rue, immense. Nom + une phrase. |
| 7 – 17 % | 1,6 → 3 m | **Distributeurs** | La caméra longe le trottoir jusqu'à quatre distributeurs. Chaque canette = une façon de travailler (pas une liste de logos). |
| 17 – 23 % | 3 → 20 m | **Départ** | Plan grue : la rue tombe, le pied de la tour et FootTown apparaissent, l'ascenseur vitré s'allume et part. |
| 23 – 40 % | 20 → 145 m | **Ascension 1** | Spirale autour de la tour ; passages au ras du treillis (parallaxe) puis plans larges ; la ville rapetisse, l'horizon et la baie apparaissent. |
| 40 – 60 % | 150 m | **Main Deck = Projets** | La montée ralentit et s'arrête. Les vitrages du Main Deck deviennent des écrans. Le scroll fait le tour du deck : 4 faces = 4 projets. |
| 60 – 72 % | 150 → 245 m | **Nuages** | Second ascenseur. Traversée d'un banc de nuages : blanc complet, silence, puis le ciel, la mer de nuages trouée, la ville minuscule. |
| 72 – 86 % | 250 m | **Top Deck = À propos** | Plan calme et long. Le texte est posé sur la vitre de l'observatoire. Fuji à l'horizon. |
| 86 – 100 % | 250 → 333 m | **Sommet = Contact** | On longe l'antenne jusqu'à la pointe. Un petit avion tire une banderole « ON SE PARLE ? » ; l'antenne émet des anneaux. Contact. |

**Quatre moments « wow »** (le polish va là, pas ailleurs) : la rue du départ, l'arrivée
au Main Deck (les vitres qui s'allument), la traversée des nuages, la vue du sommet.

### Projets — choix
Faces du Main Deck = **Xplosion, Eagles, Dolphins, TAGA** (ceux que l'auteur cite).
Les autres (Observo, Elo Ranker, QuickLab, Starfield Ultimate) sont dans la visionneuse
(« Aussi à cet étage ») et dans la version texte. Rien n'est inventé : les champs
inconnus (rôle de Dolphins et TAGA, lien en ligne) sont absents, pas remplis.

### Compétences — quatre distributeurs
Design (direction artistique) · Interfaces (front) · Systèmes (back, données, mise en
ligne) · 3D & rendu. Chaque canette raconte ce que ça permet de faire et renvoie aux
projets où c'est prouvé.

## 5. Caméra

La caméra fait 50 % de la qualité perçue. Règles :

1. **Coordonnées cylindriques autour de l'axe de la tour** (rayon, angle, hauteur) +
   cible (hauteur, décalage) + focale. On interpole ces grandeurs, pas des positions
   cartésiennes : les mouvements deviennent des arcs naturels qui ne traversent jamais
   la structure par accident.
2. **Clés de caméra par chapitre**, interpolées par splines monotones (pas de dépassement).
   Chaque clé a sa progression ; les zones « palier » ont plusieurs clés rapprochées.
3. **Anticipation et révélation** : on montre toujours la destination avant d'y aller
   (le Main Deck est cadré au-dessus de nous avant l'arrivée ; l'antenne avant le sommet).
4. **Focale qui raconte** : ~62° au sol, ~45° pendant l'ascension, ~34° au Main Deck,
   ~30° en haut (effet maquette sur la ville).
5. **Roulis** très léger dans les virages de la spirale (≤ 2°), jamais au sol.
6. **Vie** : respiration lente de ±0,15 m et parallaxe souris ≤ 1,2° (désactivées en
   mouvement réduit).
7. Garde-fous : rayon minimal autour des membrures, plan proche adaptatif.

## 6. Scroll

- **Scroll natif** (une hauteur de document), donc trackpad, molette, clavier, tactile,
  lecteurs d'écran : tout marche. Pas de détournement de la molette.
- `pCible = scrollY / (hauteur − écran)` ; `p` affiché = amortissement exponentiel vers
  `pCible` (λ = 5,5 bureau, 8 tactile). Tout l'état du monde est **une fonction pure de p**
  (+ le temps pour la vie ambiante) : remonter redescend exactement.
- **Paliers** : dans les chapitres-étages, une fonction en escalier adoucie
  transforme le scroll en arrêts (chaque projet tient un moment, puis on passe au suivant).
- **Navigation** : l'altimètre est un tableau de boutons d'ascenseur (0 · 150 · 250 · 333).
  Un clic anime le scroll (durée 1,2 → 3,2 s selon la distance, easeInOutCubic) : la
  caméra traverse vraiment le trajet. En mouvement réduit : saut direct avec fondu.

## 7. Système de mouvement (tokens)

| Token | Valeur | Usage |
|---|---|---|
| `damp.scroll` | λ 5,5 / 8 (tactile) | Progression |
| `damp.hover` | λ 12 | Réactions 3D au survol |
| `ease.out` | `cubic-bezier(.22,1,.36,1)` | Entrées d'interface |
| `ease.inOut` | `cubic-bezier(.65,0,.35,1)` | Navigation, panneaux |
| `dur.micro` | 160 ms | Boutons, focus |
| `dur.ui` | 480 ms | Textes de chapitre (décalage 70 ms entre lignes, montée 18 px) |
| `dur.panel` | 620 ms | Visionneuse, fiche compétence |
| `dur.daynight` | 3,4 s | Transition jour ↔ nuit (soleil, puis ciel, puis fenêtres, puis tour) |
| `dur.can` | 1,1 s | Chute de canette (gravité + rebond amorti) |

Mouvement réduit : la caméra ne fait plus de spirale (trajet direct, plans fixes,
fondus entre étages), pas de parallaxe, pas de roulis, pétales et respiration coupés.
Les fondus et les retours d'action restent.

## 8. Moments interactifs

- Survol distributeur → façade plus lumineuse, bouton qui clignote. Clic → chute de
  canette, fiche « ticket » qui s'ouvre.
- Survol écran de projet → l'image se décale légèrement, curseur main. Clic → visionneuse.
- Bouton jour / nuit → transition chorégraphiée ; l'heure de Tokyo choisit le mode initial.
- Sommet → l'antenne émet ; « Envoyer un signal » ouvre la messagerie et déclenche une
  impulsion plus forte.

## 9. Chargement

Écran papier. Le profil exact de la tour (le même code que la 3D) est dessiné en trait,
puis **peint en orange bande par bande** à mesure que le chargement avance. Le compteur
est une altitude (`000 m → 333 m`), pas un pourcentage. À la fin, le dessin s'efface
dans la vue de rue.

## 10. Performance

Budget bureau (M1 intégré, 1440p) : 60 i/s, < 140 draw calls, < 1,2 M triangles.
Budget mobile : 60 i/s visé / 30 minimum, < 90 draw calls, DPR ≤ 1,5.

Tricheries assumées :
- Treillis, ville, câbles : **géométrie procédurale fusionnée** (une poignée de draw calls),
  pas de modèle de 4 Mo.
- **Ombres statiques** : une carte calculée une fois par réglage d'heure, pas à chaque image ;
  ombres de contact peintes sous les voitures et les passants.
- **Fenêtres allumées dans le shader** (hachage par fenêtre), pas de lumières.
- Ville lointaine : un seul `InstancedMesh` ; horizon (Fuji, Skytree, baie) en silhouettes.
- Nuages : volumes sculptés + voile plein écran pour la traversée, pas de raymarching.
- Environnement (reflets) régénéré seulement quand l'heure change.
- Rendu en pause quand l'onglet est caché ; DPR adaptatif selon les temps de frame.

## 11. Accessibilité, repli, contenu

- `index.html` contient tout le contenu en HTML sémantique (identité, compétences,
  projets, à propos, contact). Sans WebGL ou avec `?lecture`, c'est lui qu'on lit.
- Les textes affichés sur la scène sont du vrai DOM (y compris le texte posé sur la vitre).
- Focus visible, navigation clavier complète, `aria-live` discret pour l'altitude par
  palier, contrastes AA.

## 12. Sécurité et vie privée

Site statique, aucun serveur applicatif, aucun cookie, aucune mesure d'audience, polices
auto-hébergées (aucune requête vers un tiers). Contact = `mailto:` préparé (rien n'est
envoyé sans le visiteur). En-têtes de sécurité (CSP stricte, etc.) fournis pour le
serveur. Dépendances épinglées et auditées.
