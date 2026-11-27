/* ============================================================
   MODÈLE DE JEU — copier ce dossier pour créer un nouveau jeu
   1. renommer le dossier (ex. jeux/mon-jeu) et mettre JEU = "mon-jeu"
   2. ajouter le jeu dans jeux.js
   3. écrire le jeu dans nouvellePartie / mettreAJour / dessiner

   Outils disponibles :
     Salle.publier(score, "jeu" | "fini")   score en direct pour le lobby
     Scores.enregistrer(JEU, score, nom)    score final → classements
     Salle.pseudo()                         pseudo du joueur
   ============================================================ */
(function () {
  const JEU = "_modele";
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  let etat = "menu", score = 0;

  function nouvellePartie() {
    score = 0; etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  function finPartie() {
    etat = "fini";
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    $("#ov-titre").textContent = "GAME OVER";
    $("#ov-texte").textContent = String(score);
    $("#ov-bouton").textContent = "Rejouer";
    $("#overlay").hidden = false;
  }

  function mettreAJour(dt) { /* logique du jeu */ }

  function dessiner() {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    $("#score").textContent = score;
  }

  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.05, (t - avant) / 1000); avant = t;
    if (etat === "jeu") mettreAJour(dt);
    dessiner();
    requestAnimationFrame(boucle);
  }

  $("#ov-bouton").addEventListener("click", nouvellePartie);
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  $("#ov-titre").textContent = "MODÈLE";
  $("#ov-bouton").textContent = "Jouer";
  requestAnimationFrame(boucle);
  window.__modele = { finPartie };
})();
