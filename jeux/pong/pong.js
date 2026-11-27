/* ============================================================
   PONG
   - Seul (ou seul dans le lobby)  → contre un bot
   - Deux joueurs dans le lobby    → 1 contre 1 en réseau
       l'hôte (★, raquette de gauche) calcule la partie et l'envoie
       par Firebase ; l'invité (raquette de droite) envoie seulement
       la position de sa raquette.
   - Les autres joueurs du lobby regardent la partie.

   VITESSE DE LA BALLE (pas de maximum, croissance logarithmique) :
       v(n) = V0 × (1 + K × ln(1 + n))
   n = nombre de renvois depuis le début de l'échange (remis à 0 à chaque point).
   Avec V0 = 340 et K = 0,45 :  n=0 → ×1   n=5 → ×1,8   n=10 → ×2,1
                                n=30 → ×2,5   n=100 → ×3,1   … sans fin
   ============================================================ */
(function () {
  const JEU = "pong";

  // ---------- Réglages ----------
  const W = 880, H = 500;               // terrain (unités logiques) — plus large que haut
  const PW = 14, PH = 84, MARGE = 26;   // raquettes
  const B = 12;                         // côté de la balle
  const V0 = 340, K = 0.45;             // vitesse : v(n) = V0 (1 + K ln(1+n))
  const ANGLE_MAX = (55 * Math.PI) / 180;
  const POINTS_VICTOIRE = 5;
  const VITESSE_CLAVIER = 600;          // raquette au clavier (px/s)
  const VITESSE_BOT = 430;              // raquette du bot (px/s)
  const ENVOI_MS = 50;                  // fréquence d'envoi réseau (20 fois/s)

  const vitesse = (n) => V0 * (1 + K * Math.log(1 + n));
  const borne = (v, a, b) => Math.max(a, Math.min(b, v));
  const scorePartie = (points, meilleur) => points * 100 + meilleur;

  const $ = (s) => document.querySelector(s);
  const canvas = $("#ecran");
  const ctx = canvas.getContext("2d");

  // ---------- Qui suis-je ? ----------
  let mode = "solo";        // "solo" | "hote" | "invite" | "spectateur"
  let session = Reseau.session.lire();
  let lobbyRef = null, etatRef = null, raqRef = null;
  let nomJ1 = "", nomJ2 = "", hoteId = null, adversaireId = null;
  const monPseudo = () => (session && session.nom) || (localStorage.getItem("rob-pseudo") || "Joueur");

  // ---------- État de la partie (calculé par l'hôte ou en solo) ----------
  const S = {
    y1: H / 2, y2: H / 2, bx: W / 2, by: H / 2, vx: 0, vy: 0,
    s1: 0, s2: 0, echange: 0, meilleur: 0,
    phase: "menu",            // "menu" | "service" | "jeu" | "fin"
    attente: 0, sens: 1, gagnant: 0, partie: 0, bot: true,
  };
  // État reçu (invité / spectateur)
  let R = null, recuA = 0;

  // ---------- Commandes ----------
  const touches = { haut: false, bas: false };
  let cibleSouris = null;   // position visée au doigt / à la souris
  let monY = H / 2;         // ma raquette

  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "z" || k === "w") { touches.haut = true; cibleSouris = null; e.preventDefault(); }
    if (k === "arrowdown" || k === "s") { touches.bas = true; cibleSouris = null; e.preventDefault(); }
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "z" || k === "w") touches.haut = false;
    if (k === "arrowdown" || k === "s") touches.bas = false;
  });
  /* Doigt (ou souris appuyée) n'importe où sur l'écran : la raquette suit le
     glissement. Souris qui survole le terrain : la raquette se place dessous. */
  const monCote = () => (mode === "invite" ? 2 : 1);
  // position le long de l'axe de la raquette, et sens, selon l'orientation de l'écran
  const axe = (e) => (vertical ? e.clientX : e.clientY);
  const sens = () => (vertical && monCote() === 2 ? -1 : 1);
  function longueurEcran() { const r = canvas.getBoundingClientRect(); return vertical ? r.width : r.height; }
  let glisse = null;
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, .modal, .overlay:not([hidden])")) return;
    glisse = { id: e.pointerId, depart: axe(e), y0: monY };
    if (e.pointerType !== "mouse") e.preventDefault();
  }, { passive: false });
  document.addEventListener("pointermove", (e) => {
    if (glisse && e.pointerId === glisse.id) {
      const echelle = (H / longueurEcran()) * 1.4; // un petit glissement suffit pour traverser le terrain
      cibleSouris = borne(glisse.y0 + (axe(e) - glisse.depart) * echelle * sens(), PH / 2, H - PH / 2);
      return;
    }
    if (e.pointerType === "mouse" && e.target.closest("#terrain")) {
      const r = canvas.getBoundingClientRect();
      const f = vertical ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
      cibleSouris = (sens() > 0 ? f : 1 - f) * H;
    }
  });
  ["pointerup", "pointercancel"].forEach((ev) => document.addEventListener(ev, (e) => { if (glisse && e.pointerId === glisse.id) glisse = null; }));

  // ---------- Orientation : sur un écran en hauteur, le terrain est tourné ----------
  let vertical = false;
  function orienter() {
    const v = innerHeight > innerWidth * 1.05;
    if (v === vertical && canvas.width === (v ? H : W)) return;
    vertical = v;
    canvas.width = vertical ? H : W;
    canvas.height = vertical ? W : H;
    $("#terrain").dataset.ratio = canvas.width + "/" + canvas.height;
    if (window.Page) Page.ajuster();
  }
  addEventListener("resize", orienter);
  orienter();

  function bougerMaRaquette(dt) {
    if (cibleSouris != null) {
      const pas = 2400 * dt;
      monY += borne(cibleSouris - monY, -pas, pas);
    } else {
      monY += ((touches.bas ? 1 : 0) - (touches.haut ? 1 : 0)) * VITESSE_CLAVIER * dt;
    }
    monY = borne(monY, PH / 2, H - PH / 2);
  }

  // ---------- Bot ----------
  let botCible = H / 2, botErreur = 0, botChrono = 0;
  function predireY(xCible) {
    if (S.vx === 0) return H / 2;
    const t = (xCible - S.bx) / S.vx;
    if (t < 0) return H / 2;
    // rebonds sur les murs : on « déplie » le terrain
    const haut = B / 2, h = H - B;
    let y = S.by + S.vy * t - haut;
    const periode = 2 * h;
    y = ((y % periode) + periode) % periode;
    if (y > h) y = periode - y;
    return y + haut;
  }
  function bougerBot(dt) {
    botChrono -= dt;
    if (botChrono <= 0) {
      botChrono = 0.1; // il « réfléchit » 10 fois par seconde
      botCible = S.phase === "jeu" && S.vx > 0 ? predireY(W - MARGE - PW) + botErreur : H / 2;
    }
    const pas = VITESSE_BOT * dt;
    S.y2 = borne(S.y2 + borne(botCible - S.y2, -pas, pas), PH / 2, H - PH / 2);
  }
  // Le bot vise avec une erreur qui grandit avec l'échange : il finit par rater
  // (au-delà de ±(PH/2 + B/2) ≈ 48 il manque la balle).
  const nouvelleErreurBot = () => {
    const amplitude = (PH / 2 + B / 2) * (0.6 + 0.15 * Math.log(1 + S.echange));
    botErreur = (Math.random() * 2 - 1) * amplitude;
  };

  // ---------- Adversaire humain (vu par l'hôte) ----------
  let y2Distant = H / 2, vuAdversaire = -1e9;
  const adversairePresent = () => performance.now() - vuAdversaire < 2500;

  // ---------- Moteur (hôte et solo) ----------
  function nouvellePartie() {
    Object.assign(S, {
      s1: 0, s2: 0, echange: 0, meilleur: 0, gagnant: 0,
      phase: "service", attente: 2.5, sens: Math.random() < 0.5 ? -1 : 1,
      bx: W / 2, by: H / 2, vx: 0, vy: 0, partie: Date.now(),
      bot: !(mode === "hote" && adversairePresent()),
    });
    enregistre = false;
    nouvelleErreurBot();
    cacherOverlay();
  }

  function servir() {
    S.echange = 0;
    S.bx = W / 2; S.by = H / 2;
    const a = (Math.random() * 2 - 1) * (25 * Math.PI) / 180;
    const v = vitesse(0);
    S.vx = S.sens * v * Math.cos(a);
    S.vy = v * Math.sin(a);
    S.phase = "jeu";
  }

  function renvoi(yRaquette, sens) {
    S.echange += 1;
    S.meilleur = Math.max(S.meilleur, S.echange);
    const decalage = borne((S.by - yRaquette) / (PH / 2 + B / 2), -1, 1);
    const angle = decalage * ANGLE_MAX;
    const v = vitesse(S.echange);
    S.vx = sens * v * Math.cos(angle);
    S.vy = v * Math.sin(angle);
    if (sens === 1) nouvelleErreurBot();
  }

  function point(marqueur) {
    if (marqueur === 1) S.s1++; else S.s2++;
    S.vx = S.vy = 0;
    if (S.s1 >= POINTS_VICTOIRE || S.s2 >= POINTS_VICTOIRE) {
      S.phase = "fin";
      S.gagnant = S.s1 > S.s2 ? 1 : 2;
    } else {
      S.phase = "service";
      S.attente = 1.2;
      S.sens = marqueur === 1 ? 1 : -1; // on sert vers celui qui a perdu le point
      S.bx = W / 2; S.by = H / 2;
    }
  }

  function simuler(dt) {
    // raquettes
    S.y1 = monY;
    if (mode === "hote" && !S.bot) {
      if (!adversairePresent() && S.phase !== "fin") { S.bot = true; message("BOT"); }
      const pas = 3000 * dt;
      S.y2 = borne(S.y2 + borne(y2Distant - S.y2, -pas, pas), PH / 2, H - PH / 2);
    } else {
      bougerBot(dt);
    }

    if (S.phase === "service") {
      S.attente -= dt;
      if (S.attente <= 0) servir();
      return;
    }
    if (S.phase !== "jeu") return;

    // balle : petits pas pour ne jamais traverser une raquette, même très vite
    const distance = Math.hypot(S.vx, S.vy) * dt;
    const n = Math.max(1, Math.ceil(distance / 4));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      S.bx += S.vx * h;
      S.by += S.vy * h;
      if (S.by < B / 2) { S.by = B / 2; S.vy = Math.abs(S.vy); }
      if (S.by > H - B / 2) { S.by = H - B / 2; S.vy = -Math.abs(S.vy); }

      const gauche = MARGE + PW, droite = W - MARGE - PW;
      if (S.vx < 0 && S.bx - B / 2 <= gauche && S.bx - B / 2 >= MARGE - B && Math.abs(S.by - S.y1) <= PH / 2 + B / 2) {
        S.bx = gauche + B / 2; renvoi(S.y1, 1);
      } else if (S.vx > 0 && S.bx + B / 2 >= droite && S.bx + B / 2 <= W - MARGE + B && Math.abs(S.by - S.y2) <= PH / 2 + B / 2) {
        S.bx = droite - B / 2; renvoi(S.y2, -1);
      }

      if (S.bx < -B) { point(2); return; }
      if (S.bx > W + B) { point(1); return; }
    }
  }

  // ---------- Vue (ce qu'on dessine) ----------
  function vue(maintenant) {
    if (mode === "solo" || mode === "hote") return S;
    if (!R) return null;
    const v = Object.assign({}, R);
    if (v.phase === "jeu") {
      // on prolonge la trajectoire depuis le dernier message reçu
      const dt = Math.min(0.25, (maintenant - recuA) / 1000);
      v.bx = borne(R.bx + R.vx * dt, MARGE + PW - B, W - MARGE - PW + B);
      v.by = R.by + R.vy * dt;
      if (v.by < B / 2) v.by = B - v.by;
      if (v.by > H - B / 2) v.by = 2 * H - B - v.by;
    }
    if (mode === "invite") v.y2 = monY; // ma raquette sans attendre le réseau
    return v;
  }

  // ---------- Dessin ----------
  const traine = [];
  function neon(couleur, flou) { ctx.shadowColor = couleur; ctx.shadowBlur = flou; ctx.fillStyle = couleur; }

  // repère du terrain : à l'écran, ma raquette est à gauche (écran large) ou en bas (écran en hauteur)
  function repere() {
    if (!vertical) ctx.setTransform(1, 0, 0, 1, 0, 0);
    else if (monCote() === 1) ctx.setTransform(0, -1, 1, 0, 0, W);  // x → vers le haut, y → vers la droite
    else ctx.setTransform(0, 1, -1, 0, H, 0);                        // côté droit en bas
  }
  function texte(t, x, y, taille, couleur, align) {
    ctx.font = taille + "px 'Press Start 2P', monospace";
    ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    neon(couleur, 10); ctx.fillText(t, x, y); ctx.shadowBlur = 0;
  }

  function dessiner(v) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    repere();

    // grille légère
    ctx.fillStyle = "rgba(255, 43, 214, 0.07)";
    for (let x = 0; x <= W; x += 40) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y <= H; y += 40) ctx.fillRect(0, y, W, 1);

    // filet
    neon("rgba(216, 249, 255, 0.5)", 6);
    for (let y = 8; y < H; y += 28) ctx.fillRect(W / 2 - 2, y, 4, 14);

    if (!v) return;

    // raquettes
    neon("#19f0ff", 20); ctx.fillRect(MARGE, v.y1 - PH / 2, PW, PH);
    neon("#ff2bd6", 20); ctx.fillRect(W - MARGE - PW, v.y2 - PH / 2, PW, PH);

    // balle + traînée
    if (v.phase === "jeu") {
      traine.push([v.bx, v.by]);
      if (traine.length > 8) traine.shift();
    } else traine.length = 0;
    traine.forEach(([x, y], i) => {
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255, 225, 77, ${(i + 1) / (traine.length * 3)})`;
      ctx.fillRect(x - B / 2, y - B / 2, B, B);
    });
    if (v.phase === "jeu" || v.phase === "service") {
      neon("#ffe14d", 18);
      ctx.fillRect(v.bx - B / 2, v.by - B / 2, B, B);
    }

    // textes, toujours à l'endroit
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cw = canvas.width, ch = canvas.height;
    const nom2 = v.bot ? "BOT" : nomJ2 || "—";
    const info = infoVitesse(v);
    if (!vertical) {
      texte(v.s1, cw / 2 - 90, 48, 40, "#19f0ff");
      texte(v.s2, cw / 2 + 90, 48, 40, "#ff2bd6");
      texte(nomJ1 || "—", 18, 18, 11, "#19f0ff", "left");
      texte(nom2, cw - 18, 18, 11, "#ff2bd6", "right");
      texte(info, cw / 2, ch - 16, 10, "#ffe14d");
    } else {
      // moi en bas, l'adversaire en haut
      const moi = monCote() === 1, [sMoi, sLui] = moi ? [v.s1, v.s2] : [v.s2, v.s1];
      const [cMoi, cLui] = moi ? ["#19f0ff", "#ff2bd6"] : ["#ff2bd6", "#19f0ff"];
      texte(sLui, 36, ch / 2 - 44, 32, cLui);
      texte(sMoi, 36, ch / 2 + 44, 32, cMoi);
      texte(moi ? nom2 : nomJ1 || "—", 14, 18, 11, cLui, "left");
      texte(moi ? nomJ1 || "—" : nom2, 14, ch - 18, 11, cMoi, "left");
      texte(info, cw - 14, ch - 18, 10, "#ffe14d", "right");
    }
    if (v.phase === "service" && v.attente > 0) {
      texte(v.attente > 1.5 ? "PRÊT ?" : Math.ceil(v.attente), cw / 2, vertical ? ch / 2 + 110 : ch / 2 + 80, 26, "#ffe14d");
    }
  }

  // ---------- Barre du haut ----------
  let messageTemp = "", messageJusqua = 0;
  function message(t) { messageTemp = t; messageJusqua = performance.now() + 3000; }
  function infoVitesse(v) {
    if (performance.now() < messageJusqua) return messageTemp;
    if (v && v.phase === "jeu") return "×" + (1 + K * Math.log(1 + v.echange)).toFixed(1);
    return mode === "spectateur" ? "SPECTATEUR" : "";
  }

  // ---------- Écran par-dessus le terrain ----------
  const overlay = $("#overlay");
  function afficherOverlay(titre, texte, boutons) {
    $("#ov-titre").textContent = titre;
    $("#ov-texte").textContent = texte || "";
    $("#ov-boutons").replaceChildren(...(boutons || []).map(([libelle, action, desactive]) => {
      const b = document.createElement("button");
      b.className = "bouton";
      b.textContent = libelle;
      b.disabled = !!desactive;
      b.addEventListener("click", action);
      return b;
    }));
    overlay.hidden = false;
  }
  function cacherOverlay() { overlay.hidden = true; }

  // Menu de l'hôte / du joueur seul (avant une partie ou après)
  let menuAffiche = "";
  function menuHote(fin) {
    const humain = mode === "hote" && adversairePresent();
    const cle = (fin ? "fin" : "debut") + humain + S.partie + adversaireId;
    if (menuAffiche === cle) return;
    menuAffiche = cle;
    const boutons = [];
    if (mode === "hote" && adversaireId) {
      boutons.push([humain ? "VS " + nomJ2 : nomJ2 + "…", () => { menuAffiche = ""; nouvellePartie(); }, !humain]);
      boutons.push(["VS 🤖", () => { menuAffiche = ""; nouvellePartie(); S.bot = true; }]);
    } else {
      boutons.push([fin ? "Rejouer" : "Jouer", () => { menuAffiche = ""; nouvellePartie(); }]);
    }
    if (fin) {
      const gagne = S.gagnant === 1;
      afficherOverlay(gagne ? "VICTOIRE !" : "PERDU", `${S.s1} – ${S.s2} · ${scorePartie(S.s1, S.meilleur)}`, boutons);
    } else {
      afficherOverlay("PONG", "", boutons);
    }
  }

  // Écran de l'invité / du spectateur
  function menuDistant(v) {
    if (!v || v.phase === "menu") {
      afficherOverlay("PONG", "EN ATTENTE…");
      return;
    }
    if (v.phase === "fin") {
      if (mode === "invite" && !v.bot) {
        const gagne = v.gagnant === 2;
        afficherOverlay(gagne ? "VICTOIRE !" : "PERDU", `${v.s2} – ${v.s1} · ${scorePartie(v.s2, v.meilleur)}`);
      } else {
        afficherOverlay("FIN", `${nomJ1} ${v.s1} – ${v.s2} ${v.bot ? "BOT" : nomJ2}`);
      }
      return;
    }
    if (mode === "invite" && v.bot) { afficherOverlay("PONG", "EN ATTENTE…"); return; }
    cacherOverlay();
  }

  // ---------- Enregistrer les scores ----------
  let enregistre = false, partieEnregistree = 0;
  function enregistrerSiFini() {
    if ((mode === "solo" || mode === "hote") && S.phase === "fin" && !enregistre) {
      enregistre = true;
      Scores.enregistrer(JEU, scorePartie(S.s1, S.meilleur), monPseudo()).catch(() => {});
    }
    if (mode === "invite" && R && R.phase === "fin" && !R.bot && R.partie !== partieEnregistree) {
      partieEnregistree = R.partie;
      Scores.enregistrer(JEU, scorePartie(R.s2, R.meilleur), monPseudo()).catch(() => {});
    }
  }

  // ---------- Réseau ----------
  let dernierEnvoi = 0;
  function envoyer(maintenant) {
    if (maintenant - dernierEnvoi < ENVOI_MS) return;
    dernierEnvoi = maintenant;
    if (mode === "hote" && etatRef) {
      const r = (x) => Math.round(x * 10) / 10;
      etatRef.set({
        y1: r(S.y1), y2: r(S.y2), bx: r(S.bx), by: r(S.by), vx: r(S.vx), vy: r(S.vy),
        s1: S.s1, s2: S.s2, echange: S.echange, meilleur: S.meilleur, phase: S.phase,
        attente: r(S.attente), gagnant: S.gagnant, partie: S.partie, bot: S.bot,
      }).catch(() => {});
    }
    if (mode === "invite" && raqRef) {
      raqRef.set({ y: Math.round(monY), t: Date.now() }).catch(() => {}); // sert aussi de « je suis là »
    }
  }

  // ---------- Boucle principale ----------
  let avant = performance.now();
  function boucle(maintenant) {
    const dt = Math.min(0.05, (maintenant - avant) / 1000);
    avant = maintenant;

    if (mode !== "spectateur") bougerMaRaquette(dt);

    if (mode === "solo" || mode === "hote") {
      if (S.phase === "menu") menuHote(false);
      else if (S.phase === "fin") menuHote(true);
      else simuler(dt);
    } else {
      menuDistant(R);
    }

    const v = vue(maintenant);
    dessiner(v);
    enregistrerSiFini();
    envoyer(maintenant);
    requestAnimationFrame(boucle);
  }

  // ---------- Démarrage ----------
  function quitterVersMenu() { location.href = Reseau.racine; }
  let parti = false;
  const allerAuMenu = () => { if (parti) return; parti = true; Reseau.garderPresence(session); quitterVersMenu(); };

  function demarrerSolo() {
    mode = "solo";
    nomJ1 = monPseudo();
    $("#btn-quitter").title = "Menu";
    $("#btn-quitter").onclick = quitterVersMenu;
  }

  function demarrerLobby() {
    lobbyRef = Reseau.lobby(session.code);
    etatRef = lobbyRef.child("pong/etat");
    raqRef = lobbyRef.child("pong/raquette2");
    let lanceVu = false, roleFixe = false;

    lobbyRef.on("value", (snap) => {
      const v = snap.val();
      if (!v) { Reseau.session.effacer(); if (!parti) { parti = true; quitterVersMenu(); } return; }
      if (v.lancement) lanceVu = true;
      else if (lanceVu) { allerAuMenu(); return; } // l'hôte a ramené tout le monde au lobby

      const joueurs = Object.entries(v.joueurs || {}).sort((a, b) => (a[1].arrivee || 0) - (b[1].arrivee || 0));
      hoteId = v.hote;
      const hote = joueurs.find(([id]) => id === hoteId);
      const adv = joueurs.find(([id]) => id !== hoteId);
      adversaireId = adv ? adv[0] : null;
      nomJ1 = hote ? hote[1].nom : "★";
      nomJ2 = adv ? adv[1].nom : "";

      if (!roleFixe) {
        roleFixe = true;
        mode = session.id === hoteId ? "hote" : session.id === adversaireId ? "invite" : "spectateur";
        if (mode === "hote") {
          etatRef.set({ phase: "menu", partie: 0, bot: true, s1: 0, s2: 0, y1: H / 2, y2: H / 2, bx: W / 2, by: H / 2, vx: 0, vy: 0, echange: 0, meilleur: 0, attente: 0, gagnant: 0 }).catch(() => {});
          raqRef.on("value", (s) => {
            const r = s.val();
            if (r && typeof r.y === "number") { y2Distant = r.y; vuAdversaire = performance.now(); }
          });
          $("#btn-quitter").title = "Retour au lobby (tout le monde)";
          $("#btn-quitter").onclick = () => lobbyRef.child("lancement").remove();
        } else {
          etatRef.on("value", (s) => { R = s.val(); recuA = performance.now(); });
          $("#btn-quitter").title = "Retour au lobby";
          $("#btn-quitter").onclick = allerAuMenu;
          
        }
      }
    });
  }

  // pour les tests (console du navigateur)
  window.__pong = { S, get R() { return R; }, get mode() { return mode; } };

  // Classement en direct sous le jeu
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(monPseudo())));

  if (!session) {
    demarrerSolo();
  } else {
    Reseau.reprendre(session).then(demarrerLobby).catch(() => { session = null; demarrerSolo(); });
  }

  // police pixel chargée avant le premier dessin, si possible
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(boucle));
})();
