/* ============================================================
   RÉSEAU COMMUN À TOUS LES MINI-JEUX
   Le site est hébergé par GitHub Pages. Firebase (Realtime Database,
   serveurs de Google, port web sécurisé habituel) sert seulement de
   relais : les appareils ne se connectent jamais directement entre eux,
   ils s'échangent des messages par la base. Personne ne se connecte à
   l'ordinateur du prof, et ça passe les pare-feux d'établissement.

   Même base que La Ruée vers l'Or : chaque lobby est rangé dans
   games/<CODE> et effacé automatiquement au bout de 24 h.

   Structure d'un lobby :
     games/<CODE>/
       createdAt   heure de création
       type        "rob-lobby"
       hote        id du joueur qui a créé le lobby (lui seul choisit le jeu)
       jeu         dossier du jeu choisi par l'hôte ("" = pas encore choisi)
       lancement   { jeu, t } quand l'hôte lance la partie
       joueurs/<id> { nom, arrivee }

   À charger dans chaque page, dans cet ordre :
     lib/firebase-app-compat.js, lib/firebase-database-compat.js,
     lib/qrcode.js, commun/reseau.js
   ============================================================ */
(function () {
  const FB_CONFIG = {
    apiKey: "AIzaSyDS1suX6wywyxf80TGWU3BsP6Cid3hS2Y4",
    authDomain: "ruee-vers-l-or.firebaseapp.com",
    databaseURL: "https://ruee-vers-l-or-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ruee-vers-l-or",
    storageBucket: "ruee-vers-l-or.firebasestorage.app",
    messagingSenderId: "528254486654",
    appId: "1:528254486654:web:04b72ce470f67d9313b02f",
  };

  let fdb = null;
  function base() {
    if (fdb) return fdb;
    if (!window.firebase || !firebase.database) return null;
    try {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FB_CONFIG);
      fdb = firebase.database();
    } catch (e) { console.error(e); return null; }
    return fdb;
  }
  function exigerBase() { if (!base()) throw new Error("Connexion impossible"); }

  const lobby = (code) => base().ref("games/" + code);
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  // Les messages voyagent en texte JSON : la base les garde exactement comme envoyés
  const enc = (m) => ({ j: JSON.stringify(m) });
  const dec = (v) => { try { return v && v.j ? JSON.parse(v.j) : null; } catch (e) { return null; } };

  const LETTRES = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sans 0/O, 1/I/L
  const nouveauCode = () =>
    Array.from({ length: 5 }, () => LETTRES[Math.floor(Math.random() * LETTRES.length)]).join("");
  const nettoyerCode = (c) => String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8);
  const nouvelId = () => "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nettoyerNom = (n) => String(n || "").trim().slice(0, 16) || "Joueur";

  // Racine du site (fonctionne sur https://dendentown.github.io/rob/ comme en local)
  const racine = (() => {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/commun\/reseau\.js.*$/, "") : "./";
  })();

  // ---------- Session : qui je suis, dans quel lobby (survit au rechargement) ----------
  const CLE = "rob-session";
  const session = {
    lire() { try { return JSON.parse(sessionStorage.getItem(CLE)); } catch (e) { return null; } },
    ecrire(s) { try { sessionStorage.setItem(CLE, JSON.stringify(s)); } catch (e) {} },
    effacer() { try { sessionStorage.removeItem(CLE); } catch (e) {} },
  };

  // Ma fiche joueur disparaît si je ferme la page
  function presence(code, id, nom, arrivee) {
    const moi = lobby(code).child("joueurs/" + id);
    return moi.set({ nom, arrivee: arrivee || TS() }).then(() => { moi.onDisconnect().remove(); return moi; });
  }

  /* --- Créer un lobby : je deviens l'hôte --- */
  async function creerLobby(nom) {
    exigerBase();
    nom = nettoyerNom(nom);
    // ménage : lobbys de plus de 24 h
    base().ref("games").orderByChild("createdAt").endAt(Date.now() - 864e5).once("value")
      .then((snap) => snap.forEach((c) => { c.ref.remove(); })).catch(() => {});
    let code = nouveauCode();
    for (let n = 0; n < 5; n++) {
      if (!(await lobby(code).once("value")).exists()) break;
      code = nouveauCode();
    }
    const id = nouvelId();
    await lobby(code).set({ createdAt: TS(), type: "rob-lobby", hote: id, jeu: "" });
    await presence(code, id, nom);
    const s = { code, id, nom };
    session.ecrire(s);
    return s;
  }

  /* --- Rejoindre le lobby d'un autre joueur --- */
  async function rejoindreLobby(code, nom) {
    exigerBase();
    code = nettoyerCode(code);
    const v = (await lobby(code).once("value")).val();
    if (!v || v.type !== "rob-lobby") throw new Error("Code inconnu");
    const s = { code, id: nouvelId(), nom: nettoyerNom(nom) };
    await presence(code, s.id, s.nom);
    session.ecrire(s);
    return s;
  }

  /* --- Revenir dans son lobby (page rechargée, ou arrivée sur la page d'un jeu) --- */
  async function reprendre(s) {
    exigerBase();
    if (!s || !s.code || !s.id) throw new Error("Pas de lobby");
    const v = (await lobby(s.code).once("value")).val();
    if (!v || v.type !== "rob-lobby") { session.effacer(); throw new Error("Lobby fermé"); }
    const avant = v.joueurs && v.joueurs[s.id];
    await presence(s.code, s.id, s.nom, avant && avant.arrivee);
    return s;
  }

  /* --- Quitter : l'hôte ferme le lobby pour tout le monde --- */
  async function quitter(s, estHote) {
    session.effacer();
    if (!s || !base()) return;
    try {
      if (estHote) await lobby(s.code).remove();
      else await lobby(s.code).child("joueurs/" + s.id).remove();
    } catch (e) {}
  }

  /* --- Avant de changer de page : ne pas effacer sa fiche en partant --- */
  function garderPresence(s) {
    try {
      const od = lobby(s.code).child("joueurs/" + s.id).onDisconnect();
      if (od.cancel) od.cancel();
    } catch (e) {}
  }

  // Adresse d'invitation (ouvre le menu avec le code déjà rempli)
  const lienInvitation = (code) => racine + "?code=" + encodeURIComponent(code);
  // Adresse de la page d'un jeu
  const lienJeu = (jeu) => racine + "jeux/" + jeu + "/";

  // QR code en SVG (à mettre dans un innerHTML)
  function qr(texte) {
    try {
      const q = qrcode(0, "M"); q.addData(texte); q.make();
      return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: "QR code pour rejoindre" });
    } catch (e) { return ""; }
  }

  window.Reseau = {
    base, lobby, TS, enc, dec, nettoyerCode, racine, session,
    creerLobby, rejoindreLobby, reprendre, quitter, garderPresence,
    lienInvitation, lienJeu, qr,
  };
})();
