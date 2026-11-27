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
jeux/demineur/        💣 Démineur
jeux/tetris/          🧱 Tetris
jeux/snake/           🐍 Snake
jeux/flappy/          🐤 Flappy Bird
jeux/invaders/        👾 Space Invaders
jeux/breakout/        🧱 Breakout
jeux/labyrinthe/      🤖 Labyrinthe
jeux/dash/            🔷 Néon Dash
jeux/horde/           ⚔️ Horde
commun/page.js        terrain ajusté à l'écran + fenêtre du classement
commun/salle.js       panneau « dans le lobby » des jeux où chacun joue de son côté
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

### 💣 Démineur
- 3 niveaux : Débutant 9×9 (10 mines), Intermédiaire 16×16 (40), Expert 30×16 (99).
- **Seul** : le premier clic n'est jamais une mine.
- **Dans le lobby : course.** L'hôte choisit le niveau et lance une manche ; tout le monde reçoit la même grille, avec une case de départ sûre qui clignote. Progression de chacun en direct, podium. 🙂 relance une manche.
- Drapeau : clic droit, appui long, ou bouton « mode drapeau ». Clic sur un chiffre entouré de ses drapeaux : ouvre les cases autour.
- **Score d'une victoire** : points du niveau × 60 / (60 + secondes) — Débutant 1000, Intermédiaire 3000, Expert 8000. Une défaite compte comme une partie à 0.

### 🧱 Tetris · 🐍 Snake · 🐤 Flappy Bird
Chacun joue sa propre partie. Dans un lobby, le panneau « Dans le lobby » montre en direct le score de chaque joueur et son record.
- **Tetris** : 7 pièces (tirage par sac), pièce fantôme, pièce suivante. Chute : 800 ms × 0,85^(niveau − 1) ; niveau + 1 toutes les 10 lignes. Score : 100 / 300 / 500 / 800 × niveau pour 1 / 2 / 3 / 4 lignes, + 1 par case en descente rapide, + 2 en chute directe. Clavier ← → ↑ ↓ Espace P ; boutons à l'écran sur téléphone.
- **Snake** : grille 24×24, un pas toutes les 140 ms × 0,97^fruits (min 55 ms). 10 points par fruit, 50 par fruit doré (apparaît parfois, 5 s). Flèches / ZQSD, ou glisser le doigt.
- **Flappy Bird** : 1 point par tuyau. Défilement 170 × (1 + 0,12 × ln(1 + score)) px/s, écart des tuyaux de 165 à 125 px. Clic, tap ou Espace.

### 👾 Space Invaders · 🧱 Breakout · 🤖 Labyrinthe · 🔷 Néon Dash · ⚔️ Horde
Chacun joue sa partie (panneau « Dans le lobby » en direct). Personnages et décors originaux.
- **Space Invaders** : niveaux en cycle de 5 — formation pleine, en V, damier (blindés), forteresse (sans boucliers, plus de blindés), puis un BOSS (vaisseau-mère avec barre de vie, tirs en éventail et visés). Chaque cycle : plus rapide, plus de blindés (2 coups), boss plus résistant. Bonus à attraper : R rafale (3 tirs), T triple (éventail), P perçant, B bouclier, V vie +1, X bombe. Coop à 2 vaisseaux (5 vies partagées). Points 30 / 20 / 10, blindé 40, soucoupe 50 à 300, boss 1000 × cycle.
- **Breakout** : niveaux en cycle de 6 — classique, pyramide, damier, forteresse (briques métal indestructibles), diamant, colonnes ; briques argent à 2 coups. Bonus à attraper : L grande raquette, M multi-balles (× 3), F balle de feu (traverse), C colle, S ralentir, V vie +1. Une vie est perdue quand il ne reste plus de balle. Vitesse de la balle 300 × (1 + 0,3 ln(1 + rebonds)) × (1 + 0,08 (niveau − 1)). Coop à 2 raquettes (5 vies partagées).
- **Labyrinthe** : Rob le robot ramasse 181 gommes (10) et 4 super-gommes (50) ; 4 bugs (poursuite, embuscade, hasard, timide) ; bugs mangés : 200 / 400 / 800 / 1600. Labyrinthe original 19 × 21 avec tunnel.
- **Néon Dash** (façon « speed runner ») : **on ne meurt jamais** — pique = on trébuche (vitesse × 0,25), mur / bloc = bloqué contre jusqu'à ce qu'on saute, trou = retour au dernier point de reprise ; le cube réaccélère tout seul. **On saute en appuyant n'importe où sur l'écran** ; la hauteur dépend de la durée de l'appui (de 1,3 à 4,2 blocs, même maximum qu'avant). Parcours généré au hasard (`jeux/dash/moteur.js`), obstacles très serrés : bloc · piques · bloc et piques · bloc · piques en nombreuses variantes (espaces, nombre de piques, blocs doubles ou larges), montées, descentes, trous, plusieurs trous d'affilée, escaliers, plafonds à piques, tunnels, couloirs étroits (petits sauts), slaloms sol/plafond, plateformes, zigzags, trois étages, souterrains (dessous ou sur le toit), tremplins, anneaux, doubles chemins, et des pièges animés : cubes qui tombent du plafond, ascenseurs, ponts de dalles qui s'effondrent, portails de gravité inversée, tapis roulants (avant / arrière), murs à rebond, lasers alternés haut / bas, pendules à piques, portes à interrupteur (sinon elles s'ouvrent après une attente), bulles de saut (rappuyer en l'air), deux voies (haut piégé / bas lent), zones sombres. Chaque parcours a **au moins une partie entière à l'envers** : un portail retourne le cube et il enchaîne 4 à 7 obstacles habituels retournés au plafond, avant un portail de sortie. Boîtes « ? » → un objet (bouton sous le terrain, ou E) : **turbo** ; **grappin** (le cube s'accroche au plafond et se balance vers l'avant, l'élan casse les obstacles et le relance plus vite) ; **laser** (rayon en ligne droite à hauteur du cube jusqu'au bord de l'écran : détruit ce qu'il touche, pas plus loin). **Solo** : contre-la-montre sur 600 blocs, score = 100 000 / temps. **Course** (lobby) : même parcours pour tous, fantômes, objets en plus : ralentir les autres, flaque ; le grappin s'accroche à l'adversaire s'il est assez proche devant (il est ramené derrière, on prend son élan), sinon au plafond ; le laser immobilise les adversaires devant dans l'écran. Vérifié par simulation : chaque passage se franchit **sans aucun choc** en repartant à l'arrêt (≈ 13 000 passages testés, à plusieurs instants pour les pièges animés).
- **Horde** : survivre aux vagues de monstres ; armes automatiques (Rayon, Orbes, Onde, Éclair) et bonus (Vitesse, Vie, Aimant, Puissance, Cadence) à choisir parmi 3 à chaque niveau. Score = 5 par seconde + 1 par monstre.

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
