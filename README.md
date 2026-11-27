# 🕹️ Rob — salle d'arcade de la classe

Plateforme de mini-jeux en style arcade années 80.

- **Hébergement : GitHub Pages** → https://dendentown.github.io/rob/
- **Connexion : Firebase Realtime Database**, utilisée seulement comme relais (même base que La Ruée vers l'Or). Les appareils s'échangent des messages par les serveurs de Google : personne ne se connecte à l'ordinateur du prof, et ça passe les pare-feux d'établissement.

## Mise en route (une seule fois)

1. **GitHub Pages** : dépôt **rob** → **Settings** → **Pages** → *Deploy from a branch* → **main**, dossier **/ (root)** → **Save**. Ensuite, chaque modification poussée sur `main` est mise en ligne automatiquement.
2. **Règles Firebase** (pour les classements) : console Firebase → projet **ruee-vers-l-or** → **Realtime Database** → onglet **Règles** → remplacer tout par le contenu de [`database.rules.json`](database.rules.json) → **Publier**.
   Ces règles gardent exactement celles de La Ruée vers l'Or et ajoutent seulement `rob/scores`.

## Comment ça marche

1. Chaque joueur entre son **pseudo** (son pseudo = son compte : le même pseudo sur un autre appareil retrouve ses scores).
2. Un joueur **crée un lobby** → il devient l'**hôte ★** ; un code et un QR code s'affichent.
3. Les autres **rejoignent** avec le code, le QR code ou le lien.
4. **Seul l'hôte choisit le jeu** et clique sur **Lancer la partie** : tout le monde arrive sur la page du jeu.
5. À la fin, l'hôte peut ramener tout le monde au lobby. S'il quitte le lobby, il est fermé pour tous.

Les lobbys sont rangés dans `games/<CODE>` et effacés automatiquement au bout de 24 h.

## Classements

- **Chaque jeu** a son tableau des scores (meilleur score de chaque joueur, avec son rang).
- **Score total** (affiché dans le menu, sur 1000) :
  1. à chaque jeu joué, des points selon le rang : `1000 × (N − rang + 1) / N` (N = nombre de joueurs de ce jeu) → le 1er a 1000 ;
  2. moyenne de ces points, **pondérée par la fréquentation** de chaque jeu (nombre total de parties jouées dessus) → un jeu très joué compte plus.
- Bouton **🏆 Classements** dans le menu : classement général + un onglet par jeu.

Scores rangés dans `rob/scores/<jeu>/<pseudo>`. Le calcul est dans `commun/scores.js`.

## Organisation

```
index.html            menu, lobby, classements
style.css             style arcade (pixel art, néons)
app.js                logique du menu, du lobby et des classements
jeux.js               ⭐ LISTE DES JEUX
commun/reseau.js      ⭐ lobby + connexion Firebase
commun/scores.js      ⭐ scores et classements
lib/                  bibliothèques Firebase + QR code (en local)
jeux/pong/            🏓 Pong
jeux/_modele/         modèle de jeu (joueurs déjà connectés, tableau des scores)
database.rules.json   règles Firebase à copier dans la console
404.html              « GAME OVER »
```

## Les jeux

### 🏓 Pong
- **Seul** (ou seul dans le lobby) : contre un bot.
- **À deux dans le lobby** : 1 contre 1. L'hôte ★ a la raquette de gauche et calcule la partie ; l'invité a la raquette de droite. Les autres joueurs du lobby regardent.
- Si l'adversaire quitte pendant la partie, le bot prend le relais.
- Premier à 5 points. Commandes : ↑ ↓ (ou Z / S), ou glisser au doigt / à la souris.
- **Vitesse de la balle** : `v(n) = V0 × (1 + 0,45 × ln(1 + n))`, n = nombre de renvois depuis le début de l'échange. Croissance logarithmique, sans maximum : ×1,8 après 5 renvois, ×2,1 après 10, ×2,5 après 30, ×3,1 après 100.
- Le bot vise de moins en moins bien quand la balle accélère : il finit par rater.
- **Score d'une partie** : 100 par point marqué + le plus long échange.

## Ajouter un jeu

1. Copier `jeux/_modele/` en `jeux/mon-jeu/`.
2. Dans `jeux/mon-jeu/index.html`, mettre `const JEU = "mon-jeu";`.
3. Dans `jeux.js`, ajouter :
   ```js
   { titre: "Mon jeu", description: "…", categorie: "calcul",
     niveau: "5e", dossier: "mon-jeu", statut: "disponible" }
   ```
   Ajouter `scoreInverse: true` si un score plus petit est meilleur (ex. un temps).
4. En fin de partie, dans le jeu : `Scores.enregistrer(JEU, score)` (ou `Scores.enregistrer(JEU, score, "Pseudo")` pour un autre joueur).

### Outils disponibles dans chaque jeu

| Fonction | Rôle |
|---|---|
| `Reseau.session.lire()` | `{ code, id, nom }` : le lobby et moi |
| `Reseau.lobby(code)` | référence Firebase du lobby (`games/<code>`) pour ranger l'état du jeu |
| `Reseau.enc(objet)` / `Reseau.dec(valeur)` | emballer / déballer un message JSON |
| `Scores.enregistrer(jeu, score, nom?)` | enregistrer un score |
| `Scores.ecouter(cb)` + `Scores.tableau(el, data, jeu, cle)` | afficher un classement en direct |
