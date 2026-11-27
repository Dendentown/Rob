// ============================================================
//  LISTE DES MINI-JEUX
//  Pour ajouter un jeu :
//    1. copier le dossier  public/jeux/_modele  →  public/jeux/<nom-du-jeu>
//    2. ajouter une entrée ci-dessous avec  dossier: "<nom-du-jeu>"
//       et  statut: "disponible"
// ============================================================

const PLATEFORME = {
  nom: "Rob",
  sousTitre: "La salle de mini-jeux de la classe",
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
const JEUX = [
  {
    titre: "Jeu de calcul",
    description: "À créer ensemble.",
    categorie: "calcul",
    niveau: "6e – 3e",
    dossier: "",
    statut: "bientot",
  },
  {
    titre: "Jeu de logique",
    description: "À créer ensemble.",
    categorie: "logique",
    niveau: "6e – 3e",
    dossier: "",
    statut: "bientot",
  },
  {
    titre: "Jeu de géométrie",
    description: "À créer ensemble.",
    categorie: "geometrie",
    niveau: "6e – 3e",
    dossier: "",
    statut: "bientot",
  },
  {
    titre: "Quiz",
    description: "À créer ensemble.",
    categorie: "quiz",
    niveau: "6e – 3e",
    dossier: "",
    statut: "bientot",
  },
  {
    titre: "Jeu de réflexe",
    description: "À créer ensemble.",
    categorie: "reflexe",
    niveau: "6e – 3e",
    dossier: "",
    statut: "bientot",
  },
];
