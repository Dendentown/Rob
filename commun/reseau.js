/* ============================================================
   RÉSEAU COMMUN À TOUS LES MINI-JEUX
   Le site est hébergé par GitHub Pages. Firebase (Realtime Database,
   serveurs de Google, port web sécurisé habituel) sert seulement de
   relais : le tableau du prof et les téléphones ne se connectent jamais
   directement entre eux, ils s'échangent des messages par la base.
   Ça passe donc les pare-feux d'établissement, et personne n'a besoin
   de se connecter à l'ordinateur du prof.

   Même base que La Ruée vers l'Or : les parties sont rangées dans
   games/<CODE> (règles : code de 8 caractères max) et effacées
   automatiquement au bout de 24 h.

   À charger dans chaque page, dans cet ordre :
     lib/firebase-app-compat.js
     lib/firebase-database-compat.js
     lib/qrcode.js
     commun/reseau.js
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

  const partie = (code) => base().ref("games/" + code);
  const TS = () => firebase.database.ServerValue.TIMESTAMP;
  // Les messages voyagent en texte JSON : la base les garde exactement comme envoyés
  const enc = (m) => ({ j: JSON.stringify(m) });
  const dec = (v) => { try { return v && v.j ? JSON.parse(v.j) : null; } catch (e) { return null; } };

  const LETTRES = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sans 0/O, 1/I/L
  const nouveauCode = () =>
    Array.from({ length: 5 }, () => LETTRES[Math.floor(Math.random() * LETTRES.length)]).join("");
  const nettoyerCode = (c) => String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8);

  // Racine du site (fonctionne sur https://dendentown.github.io/rob/ comme en local)
  const racine = (() => {
    const s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/commun\/reseau\.js.*$/, "") : "./";
  })();

  /* --- PROF : créer une partie ---------------------------------
     jeu : nom du dossier du jeu (ex. "calcul-eclair")
     renvoie { code, ref }  — ref pointe sur games/<code>          */
  async function creerPartie(jeu) {
    if (!base()) throw new Error("Firebase non chargé");
    // ménage : parties de plus de 24 h
    base().ref("games").orderByChild("createdAt").endAt(Date.now() - 864e5).once("value")
      .then((snap) => snap.forEach((c) => { c.ref.remove(); })).catch(() => {});
    let code = nouveauCode();
    for (let n = 0; n < 5; n++) {
      const snap = await partie(code).once("value");
      if (!snap.exists()) break;
      code = nouveauCode();
    }
    const ref = partie(code);
    await ref.set({ createdAt: TS(), jeu: jeu, hote: true });
    ref.child("hote").onDisconnect().remove();
    return { code, ref };
  }

  /* --- ÉLÈVE : rejoindre une partie ----------------------------
     renvoie { code, ref, moi, id, jeu }
     moi pointe sur games/<code>/joueurs/<id> (effacé si l'élève part) */
  async function rejoindre(code, nom) {
    if (!base()) throw new Error("Firebase non chargé");
    code = nettoyerCode(code);
    const ref = partie(code);
    const snap = await ref.once("value");
    const v = snap.val();
    if (!v || !v.createdAt) throw new Error("Code inconnu");
    const moi = ref.child("joueurs/j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    await moi.set({ nom: String(nom || "").slice(0, 20), arrivee: TS() });
    moi.onDisconnect().remove();
    return { code, ref, moi, id: moi.key, jeu: v.jeu };
  }

  /* --- Quel jeu correspond à ce code ? (page d'accueil) --- */
  async function jeuDuCode(code) {
    if (!base()) throw new Error("Firebase non chargé");
    const snap = await partie(nettoyerCode(code)).child("jeu").once("value");
    return snap.val();
  }

  // Adresse que les élèves ouvrent pour rejoindre directement
  const lienRejoindre = (jeu, code) => racine + "jeux/" + jeu + "/?code=" + encodeURIComponent(code);

  // QR code en SVG (à mettre dans un innerHTML)
  function qr(texte) {
    try {
      const q = qrcode(0, "M"); q.addData(texte); q.make();
      return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true, alt: "QR code pour rejoindre" });
    } catch (e) { return ""; }
  }

  // « Tester la connexion » : écrit dans la base et relit
  function testerConnexion(sortie) {
    const dire = (txt, ok) => { sortie.textContent = txt; sortie.className = "test-reseau " + (ok ? "ok" : ok === false ? "ko" : ""); };
    dire("Test en cours…");
    if (!base()) return dire("Le jeu en réseau ne marche pas : bibliothèque non chargée.", false);
    const r = partie("_t" + Math.random().toString(36).slice(2, 7));
    const t0 = Date.now(); let fini = false;
    const echec = (pq) => { if (fini) return; fini = true; dire("Le réseau bloque la connexion (" + pq + "). Essayez la 4G ou un autre wifi.", false); };
    const delai = setTimeout(() => echec("pas de réponse en 10 s"), 10000);
    r.child("createdAt").set(TS())
      .then(() => r.child("createdAt").once("value"))
      .then((snap) => {
        if (fini) return; fini = true; clearTimeout(delai);
        r.remove().catch(() => {});
        if (!snap.exists()) return dire("Lecture impossible.", false);
        dire("La connexion fonctionne sur ce réseau (" + (Date.now() - t0) + " ms).", true);
      })
      .catch((e) => { clearTimeout(delai); echec(e && e.code ? e.code : "accès refusé"); });
  }

  window.Reseau = {
    base, partie, TS, enc, dec, nouveauCode, nettoyerCode, racine,
    creerPartie, rejoindre, jeuDuCode, lienRejoindre, qr, testerConnexion,
  };
})();
