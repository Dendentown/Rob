// ============================================================
//  LISTE DES MINI-JEUX
//  Pour ajouter un jeu :
//    1. copier le dossier  public/jeux/_modele  →  public/jeux/<nom-du-jeu>
//    2. ajouter une entrée ci-dessous avec  dossier: "<nom-du-jeu>"
//       et  statut: "disponible"
// ============================================================

const PLATEFORME = {
  nom: "Rob",
  sousTitre: "Salle d’arcade de la classe",
};

// Les familles de jeux (les filtres en haut de la page)
const CATEGORIES = [
  { id: "calcul",    nom: "Calcul",     emoji: "🧮" },
  { id: "logique",   nom: "Logique",    emoji: "🧩" },
  { id: "geometrie", nom: "Géométrie",  emoji: "📐" },
  { id: "quiz",      nom: "Quiz",       emoji: "❓" },
  { id: "reflexe",   nom: "Réflexe",    emoji: "⚡" },
];

// statut : "disponible" (jouable) ou "bientot" (carte grisée)
// Aucun jeu pour l'instant : on les ajoutera ensemble.
// Exemple d'entrée :
// { titre: "Mon jeu", description: "…", categorie: "calcul",
//   niveau: "5e", dossier: "mon-jeu", statut: "disponible" },
const JEUX = [
  {
    titre: "Pong",
    description: "Seul contre le bot, ou en 1 contre 1 dans le lobby. La balle accélère sans fin !",
    categorie: "reflexe",
    icone: "🏓",
    niveau: "Tous niveaux",
    dossier: "pong",
    statut: "disponible",
  },
  {
    titre: "Démineur",
    description: "Seul, ou en course dans le lobby : même grille pour tout le monde, le plus rapide gagne !",
    categorie: "logique",
    icone: "💣",
    niveau: "Tous niveaux",
    dossier: "demineur",
    statut: "disponible",
  },
  {
    titre: "Tetris",
    description: "Le classique : complète des lignes, la chute accélère à chaque niveau.",
    categorie: "logique",
    icone: "🟪",
    niveau: "Tous niveaux",
    dossier: "tetris",
    statut: "disponible",
  },
  {
    titre: "Snake",
    description: "Mange les fruits, grandis… et ne te mords pas la queue !",
    categorie: "reflexe",
    icone: "🐍",
    niveau: "Tous niveaux",
    dossier: "snake",
    statut: "disponible",
  },
  {
    titre: "Flappy Bird",
    description: "Un tap pour voler entre les tuyaux. Facile à comprendre, dur à maîtriser !",
    categorie: "reflexe",
    icone: "🐤",
    niveau: "Tous niveaux",
    dossier: "flappy",
    statut: "disponible",
  },
  {
    titre: "Space Invaders",
    description: "Repousse les vagues d'envahisseurs derrière tes boucliers.",
    categorie: "reflexe",
    icone: "👾",
    niveau: "Tous niveaux",
    dossier: "invaders",
    statut: "disponible",
  },
  {
    titre: "Breakout",
    description: "Casse toutes les briques avec la balle.",
    categorie: "reflexe",
    icone: "🧱",
    niveau: "Tous niveaux",
    dossier: "breakout",
    statut: "disponible",
  },
];
