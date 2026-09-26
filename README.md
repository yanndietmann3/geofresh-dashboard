# GeoFresh — Jumeau numérique & supervision

Site GitHub Pages : https://yanndietmann3.github.io/geofresh-dashboard/portail.html

## Organisation

```
portail.html         Accueil : liste des exploitations, saisons terminées
index.html           Vue client : lecture + consignes (Stockage PDT + briques)
operateur.html       Vue opérateur : pilotage (super admin / opérateur)
config.js            Configuration : Supabase, couleurs, seuils, libellés des briques
js/commun.js         Fonctions communes : rôle, chargement des briques
js/briques/          Un fichier par bâtiment optionnel
  habitation.js      Maison agricole + PAC3
  serre.js           Serre (encart « pas encore de capteurs »)
css/                 geofresh.css (commun) + un fichier par page
img/                 Logo
simulateur/          Simulateur Python (à lancer sur le PC)
supabase/            Fonction d'alertes + migrations SQL (toutes appliquées)
tests/               Tests automatiques des pages
```

## Briques

- **Stockage PDT** est la brique universelle : elle est intégrée aux pages.
- Les autres bâtiments sont des **briques** : leur fichier n'est chargé que si
  l'exploitation a la brique active (table `briques`). Sans maison, `habitation.js`
  n'est jamais chargé : pas d'onglet, pas de PAC3, et le simulateur ne simule pas de PAC3.
- Ajouter / retirer un bâtiment : portail (création) ou vue opérateur → « Bâtiments à chauffer ».

### Ajouter un nouveau type de bâtiment

1. Copier `js/briques/serre.js` en `js/briques/<type>.js` et l'adapter.
2. L'ajouter dans `GF.fichiersBriques` (`js/commun.js`).
3. Ajouter son libellé dans `GEOFRESH_CONFIG.briques` (`config.js`).

## Mise en ligne

Le site contient maintenant des dossiers (`css/`, `js/`, `img/`) : l'ancien script
`DEPLOY_ALL.ps1` (4 fichiers) ne suffit plus. Mettre en ligne = fusionner la branche
dans `main` sur GitHub : GitHub Pages publie tout le dépôt.

À chaque mise en ligne, changer le numéro de version (`version` dans `config.js` et les `?v=`
des pages HTML, même valeur) : sinon les navigateurs peuvent garder d'anciens fichiers en cache.

## Tests

```bash
npm install --no-save playwright && npx playwright install chromium   # une fois
node tests/pages.test.mjs                                              # avant chaque mise en ligne
```
