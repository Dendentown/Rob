# 🎮 Rob — plateforme de mini-jeux

Une page d'accueil où les élèves choisissent un mini-jeu. Site 100 % statique (HTML/CSS/JS), hébergé sur **Firebase Hosting** : les élèves jouent depuis n'importe quel appareil avec un simple lien, sans passer par l'ordinateur du prof.

## Organisation

```
public/
├── index.html        page d'accueil (ne pas toucher en général)
├── style.css         apparence commune
├── app.js            affiche les cartes de jeux
├── jeux.js           ⭐ LISTE DES JEUX — c'est ici qu'on ajoute un jeu
├── 404.html          page « introuvable »
└── jeux/
    └── _modele/      modèle à copier pour créer un nouveau jeu
firebase.json         réglages Firebase Hosting
.firebaserc           identifiant du projet Firebase
```

## Ajouter un jeu

1. Copier `public/jeux/_modele/` en `public/jeux/mon-jeu/`.
2. Dans `public/jeux.js`, ajouter (ou modifier) une entrée :
   ```js
   { titre: "Mon jeu", description: "…", categorie: "calcul",
     niveau: "5e", dossier: "mon-jeu", statut: "disponible" }
   ```
3. Remettre en ligne (`firebase deploy`, voir plus bas).

Les catégories se modifient dans `CATEGORIES` (même fichier).

## Tester sur son ordinateur

Ouvrir `public/index.html` dans le navigateur suffit. Ou, une fois Firebase installé : `firebase serve` puis http://localhost:5000.

## Mettre en ligne avec Firebase (une seule fois)

1. **Créer le projet** : aller sur https://console.firebase.google.com → *Ajouter un projet* → donner un nom (ex. `rob-jeux`). Google Analytics : pas nécessaire. Le forfait gratuit (Spark) suffit.
2. **Installer les outils** (sur ton ordinateur) :
   - installer Node.js : https://nodejs.org (version LTS)
   - dans un terminal : `npm install -g firebase-tools`
3. **Se connecter** : `firebase login`
4. **Récupérer le dépôt** : `git clone https://github.com/Dendentown/rob` puis `cd rob`
5. **Lier le projet** : `firebase use --add` → choisir le projet créé à l'étape 1 (ça remplit `.firebaserc`).
6. **Publier** : `firebase deploy --only hosting`

Le site est alors en ligne à l'adresse `https://<id-du-projet>.web.app` — c'est ce lien qu'on donne aux élèves.

## Mise en ligne automatique (optionnel)

Pour que chaque modification poussée sur GitHub soit publiée toute seule :

```
firebase init hosting:github
```

Répondre `Dendentown/rob`, accepter le déploiement automatique sur la branche `main`. Firebase crée lui-même la clé secrète dans GitHub et le fichier `.github/workflows/`. Ensuite, plus besoin de taper `firebase deploy`.
