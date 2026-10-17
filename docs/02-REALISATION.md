# Réalisation — ce qui est construit, mesuré, vérifié

État au 17 octobre 2026. Ce document complète `01-CONCEPTION.md`.

## Le parcours

| Progression | Ce qu'on voit | Interaction |
|---|---|---|
| 0 – 6 % | Rue étroite plein sud, câbles, enseignes en japonais, passants, pétales ; la tour au bout. Cartel « Kévin Le Breton ». | Scroll |
| 8 – 16 % | Plus loin dans la rue (on y arrive en marchant, sans jamais reculer) : quatre distributeurs (Design 意匠, Interfaces 画面, Systèmes 基盤, 3D 立体) à hauteur d'yeux. | Survol (façade plus vive), clic : la canette tombe, sort du bac, se présente ; fiche « ticket ». |
| 17 – 23 % | Plan grue au-dessus de la rue, puis le pied : arches, FootTown, cage vitrée, cabine qui démarre. | — |
| 23 – 40 % | Spirale qui épouse la tour (marge calculée depuis le profil réel), plan large sur la ville et la baie, regard levé vers le Main Deck. | — |
| 40 – 60 % | Main Deck : les façades deviennent écrans et démarrent à l'arrivée ; quatre arrêts, un par projet. L'interface tient dans une barre de verre sous l'écran (la façade reste entièrement visible). | Survol, clic → visionneuse ; flèches et points ; « Aussi à cet étage » s'ouvre au-dessus de la barre. |
| 60 – 72 % | Second ascenseur, traversée d'un banc de nuages (voile plein écran), sortie sur la mer de nuages. | — |
| 72 – 86 % | Top Deck : le texte « à propos » est du vrai DOM posé en 3D sur un film sombre de la vitre ; visiteurs à contre-jour. | — |
| 86 – 100 % | Spirale le long de l'antenne ; une montgolfière aux couleurs de la tour flotte à côté, banderole « ON SE PARLE ? » suspendue sous la nacelle (brûleur qui luit la nuit) ; anneaux du signal, Fuji à l'horizon. | Copier l'adresse, liens, « Envoyer un signal » (message envoyé au serveur, salve d'anneaux). |

Partout : altimètre-ascenseur (0 · 150 · 250 · 333), jour/nuit (heure réelle de
Tokyo au chargement), son procédural (coupé par défaut), FR/EN, version texte.

## Choix techniques

- **Vite + TypeScript + three.js, sans framework** : une seule boucle, aucun
  rendu React par image, contrôle complet du pipeline.
- **Tout est généré** (tour paramétrique, quartier déterministe, arbres, nuages,
  voitures, passants, avion) : 0 modèle téléchargé. La page complète pèse
  ~570 Ko transférés (référence analysée : un modèle de 3,8 Mo).
- **Rendu** : HDR demi-flottant, MSAA adaptatif, bloom à double filtre (la nuit
  seulement), tone mapping neutre Khronos (l'orange reste orange), étalonnage
  discret, tramage anti-bandes ; fond lointain (ciel, Fuji, Skytree) rendu à
  part en demi-résolution.
- **Tricheries** : fenêtres dessinées et allumées dans le shader (seuil par
  fenêtre) ; vitrines avec intérieur procédural ; points lumineux en billboards
  additifs ; flaques de lumière au sol ; ombres statiques recalculées seulement
  quand l'heure change ; nuages sculptés + voile plein écran au lieu de
  raymarching ; sous-ensemble de police japonaise (2 × 23 Ko).

## Scroll : vitesse régulière, jamais de recul

Mesuré avec `scripts/camera-profile.ts` avant correction : dans la rue, un
centième de scroll avançait de 2 m ; au plan grue, de 60 m ; le regard
pivotait de 50° en un cran vers les distributeurs (la caméra reculait aussi
de 6 m pour les voir) ; un seuil faisait sauter la caméra de 4 m à 70 m
d'altitude ; chaque cran de molette donnait une impulsion (lissage du premier
ordre).

- **Ligne de temps** (`story/timeline.ts`) : le scroll est réparti selon une
  vitesse *perçue* (déplacement rapporté à la distance de ce qui est proche,
  rotation du regard, zoom), lissée ; les arrêts gardent leur durée. Résultat :
  vitesse perçue constante à ±5 % hors arrêts.
- **Regard interpolé en angles** (cap, inclinaison, distance) : la tête tourne
  régulièrement entre une cible lointaine et une cible proche.
- **Ressort critique** pour suivre le scroll : vitesse continue, pas de
  dépassement, vitesse plafonnée (un saut au bout devient un trajet).
- **Main Deck** : passages d'une façade à l'autre plus longs et plus reculés
  (1,6× la vitesse de croisière au plus, contre 2,3×).
- Tests : pas de recul dans la rue, pas de pic de vitesse perçue, arrêts
  conservés, aller-retour scroll ↔ récit.

## Administration et serveur

- **Serveur** (`server/`) : Node 24 seul, sans dépendance npm à l'exécution
  (HTTP, crypto et SQLite intégrés). Sert la page d'accueil rendue avec le
  contenu publié (le document est joint en bloc JSON, non exécutable), le
  build, la médiathèque (`/media/…`), le formulaire de contact et l'API de
  l'administration. Même gestionnaire monté dans Vite en développement.
- **Contenu** : un document (`src/content/store.ts`) validé à l'entrée
  (`validate.ts` : longueurs, liens `https://` seulement, images de la
  médiathèque seulement, couleurs, slugs uniques, quatre projets exactement
  sur le Main Deck, projets liés existants). Chaque publication est une
  révision (200 gardées) ; revenir à une version la republie.
- **Administration** (`/admin`) : tableau de bord (Main Deck, messages à
  traiter, textes à traduire, activité), projets (ordre = ordre des faces,
  brouillons, image principale, capture de téléphone, galerie, faits, pile
  technique, couleur d'écran), compétences, à propos, contact, textes du
  site, médiathèque (réduction et conversion WebP dans le navigateur avant
  l'envoi, texte alternatif FR/EN, suppression refusée si l'image est
  utilisée), messages, historique, journal, sauvegarde/import JSON,
  déconnexion de toutes les sessions. Barre « Publier » dès qu'une rubrique
  change ; conflit détecté si le contenu a changé ailleurs entre-temps.

## Verre liquide de l'interface

Les panneaux (carte d'intro, distributeurs, ticket, projets, contact,
altimètre, barre d'outils, visionneuse) sont du verre calculé dans le rendu,
pas un flou CSS :

- Le DOM ne porte que le texte. `src/ui/glass.ts` lit à chaque image le
  rectangle, le rayon et l'opacité effective de chaque `[data-glass]` : les
  fondus CSS animent donc aussi le verre. Il suit son panneau avec un léger
  amorti, ce qui donne l'effet « goutte » quand un panneau change de taille.
- `src/core/post.ts` dessine un quadrilatère par panneau par-dessus l'image :
  scène floutée au centre (lisibilité), nette et **déviée sur le biseau**
  (réfraction d'un bord convexe) avec **dispersion** (le bleu dévie plus que
  le rouge), couleurs ravivées, liseré et biseau éclairés du côté du
  **soleil tel que la caméra le voit**, ombre douce, lueur sous le pointeur.
- **Lisibilité garantie** : la teinte du verre se renforce là où le fond
  ferait perdre le texte (luminance ≥ 0,58 le jour sous l'encre, ≤ 0,05 la
  nuit sous le texte crème). Préférences « transparence réduite » ou
  « contraste élevé » : verre presque opaque.
- La visionneuse naît de l'écran du Main Deck (le verre s'étire depuis son
  rectangle) ; la scène s'assombrit derrière ; Échap ou un clic dehors la
  referment en fondu.
- Coût mesuré : ~1 ms par image avec cinq panneaux (deux passes de flou au
  huitième de résolution + les pixels des panneaux). Constat : chaque passe
  coûte surtout par son existence (~0,15 ms), d'où une chaîne de deux passes.
- Repli : avant que le rendu ne prenne la main, verre CSS (`backdrop-filter`).

## Performance (mesurée)

Outil : `__perf(p)` en dev (débit d'images synchronisé GPU), Chromium headless,
Apple M1, 1440×900 :

| Réglage | Rue | Main Deck | Sommet |
|---|---|---|---|
| DPR 2, MSAA ×4, bloom | 23,7 ms | 21,7 ms | 35,6 ms |
| **Retenu (budget 3,2 Mpx → DPR 1,57, MSAA ×2, bloom la nuit)** | ~15 ms | ~14 ms | ~16 ms |

Constat de mesure : le coût est fixe par pixel (MSAA en demi-flottant, bloom),
pas dans la géométrie (~1,1 M triangles, 30 à 80 draw calls). D'où : budget de
pixels, MSAA ×2 sur écrans denses, bloom coupé le jour. Un gouverneur baisse le
budget si la médiane des images dépasse ~17 ms. Paliers : `high` (GPU Apple,
NVIDIA, Radeon…), `medium`, `low` (téléphones modestes : sans MSAA, ombres
1024, ville et vie allégées).

## Accessibilité

- Tout le contenu est dans le HTML servi ; sans WebGL, ou avec `?lecture`,
  c'est un document lisible (vérifié).
- Clavier : lien d'évitement, barre d'outils, altimètre ; les chapitres absents
  sont `inert` ; après une navigation au clavier, le focus se pose sur le titre
  du chapitre atteint. Focus visible partout.
- Mouvement réduit : plans fixes par étage, fondus aux changements, pas de
  spirale, de parallaxe, de pétales ; navigation instantanée.
- Contrastes : verre à teinte adaptative (voir plus haut) ; boutons d'action
  sur un orange plus profond (`#cc4620`, texte blanc ≥ 4,5:1).

## Sécurité

- Secrets uniquement en variables d'environnement (`.env.example`), jamais dans le dépôt.
- Dépendances épinglées (versions exactes, lockfile), `npm audit` : 0.
- Administration : mot de passe en variable d'environnement (comparaison à
  durée constante), session signée HMAC de 12 h dans un cookie `__Host-`
  HttpOnly, SameSite=Strict, Secure ; « déconnecter partout » ; 5 essais par
  15 min et par adresse. Toute écriture vérifie l'origine (Sec-Fetch-Site /
  Origin). Fichiers envoyés : type vérifié sur les octets (WebP, JPEG, PNG ;
  pas de SVG), dimensions lues dans le fichier, nom aléatoire, jamais hors de
  leur dossier. Corps de requête bornés. Aucun `innerHTML` dans l'admin.
- Contact : validation serveur, piège à robots, 3 messages par 10 min et par
  adresse (en mémoire), rien d'autre que le message n'est gardé.
- En-têtes (`deploy/security-headers.mjs`, appliqués par le serveur, testés)
  : CSP stricte (aucun script en
  ligne, aucun domaine tiers), `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, COOP/CORP, `frame-ancestors 'none'`, HSTS.
- Build de production testé sous cette CSP : aucune violation, aucune erreur.
- Liens externes `rel="noopener noreferrer"` ; contenu toujours échappé.

## Vie privée

Aucun cookie pour les visiteurs (seul l'auteur reçoit un cookie de session
en se connectant à l'administration), aucune mesure d'audience, aucune
requête vers un tiers (polices auto-hébergées). Seule la langue choisie est
gardée en stockage local. Les messages du formulaire (nom, adresse, objet,
message, date — rien d'autre) sont effacés automatiquement au plus tard un
an après réception ; la page de confidentialité le dit. Pages
`mentions-legales.html` et `confidentialite.html` rédigées avec les
informations déjà fournies par l'auteur pour ses autres portfolios.

## À confirmer par l'auteur

1. **Domaine** : `SITE.url` vaut `https://kevinlebreton.com` par défaut
   (canonical, Open Graph). Changer via `VITE_SITE_URL` si le site va ailleurs.
2. **Hébergeur** des mentions légales : OVH SAS repris des autres portfolios ;
   à confirmer pour celui-ci.
3. **Dolphins et TAGA** : rôle et lien en ligne absents faute de source
   (`dolphins-online.de` sert encore l'ancien site ; `taga-app.fr` n'est qu'un
   exemple de la documentation). Les captures viennent des projets eux-mêmes
   (Dolphins servi en local depuis une copie, TAGA depuis son build web).
4. **Eagles** : pas de lien en ligne (le domaine sert encore l'ancien site).
