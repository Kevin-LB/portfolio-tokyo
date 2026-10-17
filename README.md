# 333 m — portfolio de Kévin Le Breton

Une ascension de la Tour de Tokyo : on part de la rue, on finit au bout de
l'antenne. Le scroll est l'ascenseur. Compétences dans des distributeurs,
projets sur les façades-écrans du Main Deck (150 m), « à propos » sur la vitre
du Top Deck (250 m), contact au sommet (333 m).

Vite + TypeScript + three.js, sans framework. Tout le décor (tour, ville,
nuages, avion) est généré en code : aucun modèle 3D à télécharger.

```bash
npm install
cp .env.example .env   # mot de passe de l'administration, etc.
npm run dev            # http://localhost:3003 — le site, et /admin
npm test               # caméra, ligne de temps, contenu, serveur, en-têtes
npm run typecheck
npm run build          # → dist/ (site, admin) et dist-server/ (serveur Node)
npm start              # sert le build comme en production (port 8080)
```

## Administration

`/admin` : projets (ordre, faces du Main Deck, brouillons, images, galerie),
compétences (les quatre distributeurs), à propos, contact, textes du site
(dont la banderole de la montgolfière), médiathèque, messages du formulaire,
historique des publications (retour à une version), journal, sauvegarde
JSON. Chaque publication est validée puis enregistrée comme une révision ;
le site l'applique aussitôt. Accès : `ADMIN_PASSWORD` + `SESSION_SECRET`
dans l'environnement, comme sur les autres sites.

Paramètres d'URL utiles : `?lecture` (version texte), `?nuit=1` / `?nuit=0`
(forcer l'heure, sinon c'est l'heure réelle de Tokyo), `?qualite=low|medium|high`.

## Mise en ligne

`Dockerfile` : construction (typecheck + tests + build), puis Node seul
(aucune dépendance npm à l'exécution, SQLite intégré à Node 24) sur le port
8080, utilisateur non root. Monter un volume sur `/app/data` (base + images
envoyées) et définir `ADMIN_PASSWORD`, `SESSION_SECRET`. Prévu pour Dokploy
(Traefik termine le TLS, `TRUST_PROXY=1`), comme les autres projets.

## Où lire la suite

- `docs/01-CONCEPTION.md` — l'idée, la référence analysée, la direction
  artistique, le découpage, la caméra, le scroll, le système de mouvement.
- `docs/02-REALISATION.md` — ce qui a été construit, mesures de performance,
  sécurité, vie privée, ce qui reste à confirmer.
- `CLAUDE.md` — conventions du dépôt.
