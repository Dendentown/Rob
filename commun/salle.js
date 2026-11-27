/* ============================================================
   SALLE — pour les jeux où chacun joue sa propre partie
   (Tetris, Snake, Flappy Bird…)

   - Sans lobby : partie solo, le bouton #btn-quitter ramène au menu.
   - Dans un lobby : chacun joue de son côté, et le panneau #salle
     montre en direct le score de chaque joueur du lobby et son record
     depuis l'arrivée dans le jeu. L'hôte peut ramener tout le monde
     au lobby.

   Utilisation dans un jeu :
     Salle.demarrer("tetris");                 // une fois au chargement
     Salle.publier(score, "jeu");              // pendant la partie (limité à ~3 envois/s)
     Salle.publier(score, "fini");             // à la fin
     Salle.pseudo()                            // le pseudo du joueur

   Données : games/<CODE>/<jeu>/joueurs/<id> = { nom, score, record, etat }
   À charger après commun/reseau.js et commun/scores.js.
   ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  let session = Reseau.session.lire();
  let jeu = "", ref = null, record = 0, dernierEnvoi = 0, attente = null;
  let joueursLobby = [], etats = {};

  const pseudo = () => (session && session.nom) || (localStorage.getItem("rob-pseudo") || "Joueur");

  function demarrer(nomJeu) {
    jeu = nomJeu;
    const quitter = $("#btn-quitter");
    if (!session) {
      if (quitter) { quitter.title = "Menu"; quitter.onclick = () => { location.href = Reseau.racine; }; }
      return Promise.resolve({ enLobby: false });
    }
    return Reseau.reprendre(session).then(() => {
      const lobbyRef = Reseau.lobby(session.code);
      ref = lobbyRef.child(jeu + "/joueurs");
      let lanceVu = false, parti = false, premier = true;
      const allerAuMenu = () => { if (parti) return; parti = true; Reseau.garderPresence(session); location.href = Reseau.racine; };

      lobbyRef.on("value", (snap) => {
        const v = snap.val();
        if (!v) { Reseau.session.effacer(); if (!parti) { parti = true; location.href = Reseau.racine; } return; }
        if (v.lancement) lanceVu = true;
        else if (lanceVu) { allerAuMenu(); return; }

        joueursLobby = Object.entries(v.joueurs || {}).sort((a, b) => (a[1].arrivee || 0) - (b[1].arrivee || 0));
        etats = (v[jeu] && v[jeu].joueurs) || {};
        if (premier) {
          premier = false;
          if (quitter) {
            if (v.hote === session.id) {
              quitter.title = "Retour au lobby (tout le monde)";
              quitter.onclick = () => lobbyRef.child("lancement").remove();
            } else {
              quitter.title = "Retour au lobby";
              quitter.onclick = allerAuMenu;
            }
          }
        }
        afficher(v.hote);
      });
      publier(0, "pret", true);
      return { enLobby: true };
    }).catch(() => { session = null; return demarrer(nomJeu); });
  }

  function publier(score, etat, force) {
    if (!ref || !session) return;
    record = Math.max(record, score || 0);
    const envoi = () => {
      dernierEnvoi = Date.now(); attente = null;
      ref.child(session.id).set({ nom: pseudo(), score: score || 0, record, etat }).catch(() => {});
    };
    clearTimeout(attente);
    if (force || etat !== "jeu" || Date.now() - dernierEnvoi > 300) envoi();
    else attente = setTimeout(envoi, 300);
  }

  function afficher(hote) {
    const panneau = $("#liste-salle");
    if (!panneau) return;
    panneau.hidden = false;
    const lignes = joueursLobby.map(([id, j]) => {
      const e = etats[id] || {};
      return { id, nom: j.nom, score: e.score || 0, record: e.record || 0, etat: e.etat || "pret" };
    }).sort((a, b) => b.record - a.record || b.score - a.score);
    $("#liste-salle").replaceChildren(...lignes.map((l) => {
      const li = document.createElement("li");
      li.className = (l.id === session.id ? "moi " : "") + (l.etat === "fini" ? "perdu" : "");
      li.innerHTML = '<span class="nom"></span><span class="val-salle"></span>';
      li.querySelector(".nom").textContent = (l.id === hote ? "★ " : "") + l.nom;
      li.querySelector(".val-salle").textContent = l.etat === "jeu" ? l.score : "🏆" + l.record;
      return li;
    }));
  }

  window.Salle = { demarrer, publier, pseudo };
})();
