// Affiche les filtres et les cartes de jeux à partir de jeux.js
(function () {
  document.getElementById("nom-plateforme").textContent = PLATEFORME.nom;
  document.getElementById("sous-titre").textContent = PLATEFORME.sousTitre;
  document.title = PLATEFORME.nom + " — Mini-jeux";

  const filtres = document.getElementById("filtres");
  const grille = document.getElementById("grille");
  const vide = document.getElementById("vide");
  const parId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  let actif = "tous";

  function bouton(id, texte) {
    const b = document.createElement("button");
    b.className = "filtre";
    b.textContent = texte;
    b.dataset.id = id;
    b.addEventListener("click", () => { actif = id; afficher(); });
    filtres.appendChild(b);
  }

  bouton("tous", "Tous les jeux");
  CATEGORIES.forEach((c) => bouton(c.id, c.emoji + " " + c.nom));

  function carte(jeu) {
    const cat = parId[jeu.categorie] || { nom: jeu.categorie, emoji: "🎲", id: "autre" };
    const dispo = jeu.statut === "disponible" && jeu.dossier;
    const el = document.createElement(dispo ? "a" : "div");
    el.className = "carte cat-" + cat.id + (dispo ? "" : " bientot");
    if (dispo) el.href = "jeux/" + jeu.dossier + "/";

    el.innerHTML = `
      <div class="carte-icone">${cat.emoji}</div>
      <div class="carte-corps">
        <span class="etiquette">${cat.nom}</span>
        <h2></h2>
        <p></p>
        <div class="carte-bas">
          <span class="niveau"></span>
          <span class="action">${dispo ? "Jouer ▶" : "Bientôt"}</span>
        </div>
      </div>`;
    el.querySelector("h2").textContent = jeu.titre;
    el.querySelector("p").textContent = jeu.description;
    el.querySelector(".niveau").textContent = jeu.niveau || "";
    return el;
  }

  function afficher() {
    filtres.querySelectorAll(".filtre").forEach((b) =>
      b.classList.toggle("actif", b.dataset.id === actif)
    );
    const liste = JEUX
      .filter((j) => actif === "tous" || j.categorie === actif)
      // les jeux jouables en premier
      .sort((a, b) => (b.statut === "disponible") - (a.statut === "disponible"));
    grille.replaceChildren(...liste.map(carte));
    vide.hidden = liste.length > 0;
  }

  afficher();
})();
