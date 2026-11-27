/* ============================================================
   COOP — deux joueurs dans la même partie (Breakout, Space Invaders…)
   - l'hôte du lobby (★) calcule la partie et envoie l'état ~20 fois/s
   - le partenaire (premier autre joueur du lobby) envoie seulement ses
     commandes (position, tirs…) ; il sert aussi de signal « je suis là »
   - les autres joueurs du lobby jouent en solo

   Les données vont dans games/<CODE>X (à côté du lobby, pas dedans) pour
   que les écrans qui écoutent le lobby ne reçoivent pas tout ce trafic.

   Utilisation :
     Coop.demarrer("breakout", { surEtat(e) {…}, surRoles() {…} })
     Coop.role            "solo" | "hote" | "partenaire" | "autre"
     Coop.noms            { hote, partenaire }
     Coop.partenairePresent()
     Coop.envoyerEtat(obj)        (hôte)
     Coop.entree()                (hôte) : dernières commandes du partenaire
     Coop.envoyerEntree(obj)      (partenaire)
   À charger après reseau.js, scores.js et salle.js.
   ============================================================ */
(function () {
  const session = Reseau.session.lire();
  let jeu = "", base = null, role = "solo", noms = { hote: "", partenaire: "" };
  let entree = null, vuPartenaire = -1e9, dernierEtat = 0, dernierEntree = 0;
  let rappels = {};

  function demarrer(nomJeu, r) {
    jeu = nomJeu; rappels = r || {};
    const pret = Salle.demarrer(jeu); // bouton quitter, retour au lobby, panneau des scores
    if (!session) return pret;
    return pret.then((info) => {
      if (!info || !info.enLobby) return info;
      const code = session.code;
      base = Reseau.base().ref("games/" + code + "X/" + jeu);
      Reseau.base().ref("games/" + code + "X/createdAt").set(Reseau.TS()).catch(() => {});

      // rôles : hôte ★ et partenaire = premier autre joueur arrivé
      Reseau.lobby(code).child("joueurs").on("value", (s) => {
        const joueurs = Object.entries(s.val() || {}).sort((a, b) => (a[1].arrivee || 0) - (b[1].arrivee || 0));
        Reseau.lobby(code).child("hote").once("value").then((h) => {
          const hote = h.val();
          const autre = joueurs.find(([id]) => id !== hote);
          const ancien = role;
          role = session.id === hote ? "hote" : autre && session.id === autre[0] ? "partenaire" : "autre";
          noms = { hote: ((joueurs.find(([id]) => id === hote) || [])[1] || {}).nom || "★", partenaire: autre ? autre[1].nom : "" };
          if (ancien !== role && role === "hote") ecouterEntrees();
          if (ancien !== role && role !== "hote") ecouterEtat();
          if (rappels.surRoles) rappels.surRoles();
        });
      });
      return info;
    });
  }

  let ecouteEntree = false, ecouteEtat = false;
  function ecouterEntrees() {
    if (ecouteEntree) return; ecouteEntree = true;
    base.child("entree").on("value", (s) => {
      const v = s.val();
      if (v) { entree = Reseau.dec(v); vuPartenaire = performance.now(); }
    });
  }
  function ecouterEtat() {
    if (ecouteEtat) return; ecouteEtat = true;
    base.child("etat").on("value", (s) => { const e = Reseau.dec(s.val()); if (e && rappels.surEtat) rappels.surEtat(e); });
  }

  function envoyerEtat(obj, force) {
    if (!base || role !== "hote") return;
    const t = performance.now();
    if (!force && t - dernierEtat < 50) return;
    dernierEtat = t;
    base.child("etat").set(Reseau.enc(obj)).catch(() => {}); // en texte JSON : les tableaux restent des tableaux
  }
  // gros morceaux qui changent rarement (ex. boucliers) : envoyés à part
  function envoyerBloc(nom, valeur) {
    if (!base || role !== "hote") return;
    base.child(nom).set(Reseau.enc(valeur)).catch(() => {});
  }
  function ecouterBloc(nom, cb) {
    if (!base) return;
    base.child(nom).on("value", (s) => cb(Reseau.dec(s.val())));
  }

  function envoyerEntree(obj) {
    if (!base || role !== "partenaire") return;
    const t = performance.now();
    if (t - dernierEntree < 50) return;
    dernierEntree = t;
    obj.t = Date.now(); // change à chaque envoi : sert de « je suis là »
    base.child("entree").set(Reseau.enc(obj)).catch(() => {});
  }

  window.Coop = {
    demarrer, envoyerEtat, envoyerEntree, envoyerBloc, ecouterBloc,
    entree: () => entree,
    partenairePresent: () => performance.now() - vuPartenaire < 2500,
    get role() { return role; },
    get noms() { return noms; },
  };
})();
