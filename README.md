# 🎮 Rob — plateforme de mini-jeux

Une page d'accueil où les élèves choisissent un mini-jeu ou rejoignent la partie lancée par le prof.

- **Hébergement : GitHub Pages** → https://dendentown.github.io/rob/
- **Connexion : Firebase Realtime Database**, utilisée seulement comme relais (même base que La Ruée vers l'Or). Le tableau du prof et les téléphones s'échangent des messages par les serveurs de Google : personne ne se connecte à l'ordinateur du prof, et ça passe les pare-feux d'établissement.

## Mettre en ligne (une seule fois)

Sur GitHub : dépôt **rob** → **Settings** → **Pages** → *Source : Deploy from a branch* → branche **main**, dossier **/ (root)** → **Save**.
Une ou deux minutes plus tard, le site est à l'adresse https://dendentown.github.io/rob/. Ensuite, chaque modification poussée sur `main` est mise en ligne automatiquement.

## Organisation

```
index.html            page d'accueil (liste des jeux + « Rejoindre une partie »)
style.css             apparence commune
app.js                affiche les cartes, gère le code de partie
jeux.js               ⭐ LISTE DES JEUX — c'est ici qu'on ajoute un jeu
commun/reseau.js      ⭐ connexion Firebase partagée par tous les jeux
lib/                  bibliothèques Firebase + QR code (copiées en local)
jeux/_modele/         modèle de jeu : salle d'attente prof / élèves déjà prête
404.html              page « introuvable »
```

## Comment se passe une partie

1. Le prof ouvre un jeu au tableau → **Créer une partie** → un code (ex. `GV9ZV`) et un QR code s'affichent.
2. Les élèves scannent le QR code, ou vont sur la page d'accueil et tapent le code.
3. Ils entrent leur prénom ; le tableau affiche la liste des joueurs en direct.

Les parties sont rangées dans `games/<CODE>` de la base et effacées automatiquement au bout de 24 h.

## Ajouter un jeu

1. Copier `jeux/_modele/` en `jeux/mon-jeu/`.
2. Dans `jeux/mon-jeu/index.html`, remplacer `const JEU = "_modele";` par `const JEU = "mon-jeu";`.
3. Dans `jeux.js`, ajouter une entrée :
   ```js
   { titre: "Mon jeu", description: "…", categorie: "calcul",
     niveau: "5e", dossier: "mon-jeu", statut: "disponible" }
   ```

### Outils réseau disponibles dans chaque jeu (`Reseau.…`)

| Fonction | Rôle |
|---|---|
| `creerPartie(jeu)` | prof : crée la partie, renvoie `{ code, ref }` |
| `rejoindre(code, nom)` | élève : rejoint, renvoie `{ ref, moi, id }` |
| `lienRejoindre(jeu, code)` | adresse à mettre dans le QR code |
| `qr(texte)` | QR code en SVG |
| `enc(objet)` / `dec(valeur)` | emballer / déballer un message JSON |
| `TS()` | heure du serveur |
| `testerConnexion(element)` | vérifie que le réseau laisse passer |

`ref` est une référence Firebase classique : `ref.child("etat").set(...)`, `ref.child("joueurs").on("value", ...)`, etc.

## Attention

- Ouvert en double-cliquant sur `index.html`, le site s'affiche mais le jeu en réseau n'est garanti qu'en ligne (GitHub Pages).
- Faire un essai avec **Tester la connexion** (bas de la page d'accueil) sur le wifi du collège avant le cours ; si ça bloque, passer les téléphones en 4G.
