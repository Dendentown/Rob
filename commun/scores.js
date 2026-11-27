/* ============================================================
   SCORES ET CLASSEMENTS
   Rangés dans Firebase : rob/scores/<jeu>/<joueur>
     { nom, meilleur, parties, dernier, maj }
   Le joueur est reconnu par son PSEUDO (sans accents ni majuscules) :
   le même pseudo sur un autre appareil = le même joueur.

   CLASSEMENT D'UN JEU : par meilleur score
     (plus grand = mieux, sauf si le jeu a  scoreInverse: true  dans jeux.js,
      ex. un temps de réaction : plus petit = mieux)

   SCORE TOTAL (affiché dans le menu), sur 1000 :
     1. pour chaque jeu joué, des points selon le rang :
          points = 1000 × (N − rang + 1) / N      (N = nombre de joueurs du jeu)
        → 1er = 1000 points, dernier = 1000/N. Ça rend comparables des jeux
          dont les scores n'ont pas la même échelle.
     2. moyenne de ces points, pondérée par la fréquentation de chaque jeu
        (nombre total de parties jouées sur ce jeu, tous joueurs confondus) :
          total = Σ fréquentation × points / Σ fréquentation
        → un jeu très joué compte plus qu'un jeu peu joué.

   À charger après commun/reseau.js (et jeux.js si possible).
   ============================================================ */
(function () {
  const racineScores = () => Reseau.base().ref("rob/scores");

  // pseudo → identifiant de joueur ("Léa M." → "lea-m")
  const cle = (pseudo) =>
    String(pseudo || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "joueur";

  const pseudoLocal = () => { try { return localStorage.getItem("rob-pseudo") || ""; } catch (e) { return ""; } };
  // jeux.js déclare JEUX avec const : ce n'est pas window.JEUX
  const listeJeux = () => (typeof JEUX !== "undefined" ? JEUX : []);
  const infoJeu = (jeu) => (listeJeux().find((j) => j.dossier === jeu) || {});
  const inverse = (jeu) => !!infoJeu(jeu).scoreInverse;
  const meilleurDe = (jeu, a, b) => (a == null ? b : inverse(jeu) ? Math.min(a, b) : Math.max(a, b));

  /* --- Enregistrer un score à la fin d'une partie ---
     Scores.enregistrer("mon-jeu", 42)            → pour moi (mon pseudo)
     Scores.enregistrer("mon-jeu", 42, "Léa")     → pour un autre joueur
                                                     (ex. l'hôte qui compte les points) */
  async function enregistrer(jeu, score, nom) {
    nom = String(nom || pseudoLocal() || "Joueur").trim().slice(0, 16);
    score = Number(score);
    if (!jeu || !isFinite(score)) throw new Error("Score invalide");
    const ref = racineScores().child(jeu + "/" + cle(nom));
    const avant = (await ref.once("value")).val() || {};
    const fiche = {
      nom,
      meilleur: meilleurDe(jeu, avant.meilleur, score),
      parties: (avant.parties || 0) + 1,
      dernier: score,
      maj: Reseau.TS(),
    };
    await ref.set(fiche);
    return fiche;
  }

  // --- Lire tous les scores (une fois, ou en direct) ---
  const tout = () => racineScores().once("value").then((s) => s.val() || {});
  function ecouter(cb) {
    const ref = racineScores();
    const f = (s) => cb(s.val() || {});
    const erreur = () => cb(null); // règles Firebase pas encore mises à jour, réseau bloqué…
    ref.on("value", f, erreur);
    return () => ref.off("value", f);
  }

  // --- Classement d'un jeu : [{cle, nom, meilleur, parties, rang, points}] ---
  function classementJeu(data, jeu) {
    const liste = Object.entries((data || {})[jeu] || {})
      .filter(([, f]) => f && isFinite(f.meilleur))
      .map(([c, f]) => ({ cle: c, nom: f.nom || c, meilleur: f.meilleur, parties: f.parties || 0 }));
    const inv = inverse(jeu);
    liste.sort((a, b) => (inv ? a.meilleur - b.meilleur : b.meilleur - a.meilleur) || a.nom.localeCompare(b.nom));
    const N = liste.length;
    liste.forEach((l, i) => {
      // ex æquo : même rang
      l.rang = i > 0 && l.meilleur === liste[i - 1].meilleur ? liste[i - 1].rang : i + 1;
      l.points = Math.round((1000 * (N - l.rang + 1)) / N);
    });
    return liste;
  }

  // --- Score total de chaque joueur : [{cle, nom, total, rang, jeux}] ---
  function totaux(data) {
    const acc = {};
    Object.keys(data || {}).forEach((jeu) => {
      const cl = classementJeu(data, jeu);
      const frequentation = cl.reduce((s, l) => s + Math.max(1, l.parties), 0);
      cl.forEach((l) => {
        const a = (acc[l.cle] = acc[l.cle] || { cle: l.cle, nom: l.nom, somme: 0, poids: 0, jeux: 0 });
        a.somme += frequentation * l.points;
        a.poids += frequentation;
        a.jeux += 1;
      });
    });
    const liste = Object.values(acc).map((a) => ({ cle: a.cle, nom: a.nom, jeux: a.jeux, total: Math.round(a.somme / a.poids) }));
    liste.sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom));
    liste.forEach((l, i) => { l.rang = i > 0 && l.total === liste[i - 1].total ? liste[i - 1].rang : i + 1; });
    return liste;
  }

  // --- Afficher un tableau des scores dans un élément ---
  //   jeu = dossier du jeu, ou null pour le classement général
  //   max = nombre de lignes affichées (+ ma ligne si je suis plus loin)
  function tableau(el, data, jeu, maCle, max) {
    max = max || 10;
    if (data === null) { el.innerHTML = '<p class="vide-scores">—</p>'; return; }
    const general = !jeu;
    const lignes = general ? totaux(data) : classementJeu(data, jeu);
    if (!lignes.length) { el.innerHTML = '<p class="vide-scores">—</p>'; return; }
    let visibles = lignes.slice(0, max);
    const moi = lignes.findIndex((l) => l.cle === maCle);
    const separation = moi >= max;
    if (separation) visibles = lignes.slice(0, max - 1);
    const table = document.createElement("table");
    table.className = "scores";
    table.innerHTML = general
      ? "<thead><tr><th>#</th><th>Joueur</th><th>Total</th><th>Jeux</th></tr></thead>"
      : "<thead><tr><th>#</th><th>Joueur</th><th>Record</th><th>Parties</th></tr></thead>";
    const tbody = document.createElement("tbody");
    const ligne = (l) => {
      const tr = document.createElement("tr");
      if (l.cle === maCle) tr.className = "moi";
      [rangTexte(l.rang), l.nom, general ? l.total : l.meilleur, general ? l.jeux : l.parties].forEach((v) => {
        const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
      });
      tbody.appendChild(tr);
    };
    visibles.forEach(ligne);
    if (separation) {
      const tr = document.createElement("tr"); tr.className = "separation";
      tr.innerHTML = '<td colspan="4">⋮</td>'; tbody.appendChild(tr);
      ligne(lignes[moi]);
    }
    table.appendChild(tbody);
    el.replaceChildren(table);
  }
  const rangTexte = (r) => (r === 1 ? "1er" : r + "e");

  window.Scores = { cle, enregistrer, tout, ecouter, classementJeu, totaux, tableau, rangTexte };
})();
