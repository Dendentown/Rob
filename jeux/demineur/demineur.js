/* ============================================================
   DÉMINEUR
   - Seul (sans lobby) : partie classique, le premier clic n'est
     jamais une mine.
   - Dans un lobby : COURSE. L'hôte choisit le niveau et lance une
     manche ; tout le monde reçoit la MÊME grille (même « graine »
     de hasard) avec une case de départ sûre qui clignote.
     La progression de chacun s'affiche en direct.
   ============================================================ */
(function () {
  const JEU = "demineur";
  const NIVEAUX = {
    debutant:      { nom: "Débutant",      cols: 9,  rows: 9,  mines: 10, points: 1000 },
    intermediaire: { nom: "Intermédiaire", cols: 16, rows: 16, mines: 40, points: 3000 },
    expert:        { nom: "Expert",        cols: 30, rows: 16, mines: 99, points: 8000 },
  };
  const scoreVictoire = (niv, secondes) => Math.round((NIVEAUX[niv].points * 60) / (60 + secondes));

  const $ = (s) => document.querySelector(s);
  const grilleEl = $("#grille");

  // ---------- Hasard reproductible (même graine = même grille pour tous) ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- État ----------
  let niveau = "debutant";
  let C = 9, L = 9, M = 10;
  let mine = [], adj = [], ouverte = [], drapeau = [];
  let etat = "attente";     // "attente" | "pret" | "jeu" | "gagne" | "perdu"
  let debut = 0, fin = 0, nbOuvertes = 0, caseBoum = -1, caseDepart = -1;
  let modeDrapeau = false;
  let mancheId = 0;         // manche en cours (lobby)

  const voisins = (i) => {
    const x = i % C, y = (i / C) | 0, v = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < C && ny < L) v.push(ny * C + nx);
    }
    return v;
  };

  function preparer(niv) {
    niveau = niv;
    ({ cols: C, rows: L, mines: M } = NIVEAUX[niv]);
    const n = C * L;
    mine = new Array(n).fill(false);
    adj = new Array(n).fill(0);
    ouverte = new Array(n).fill(false);
    drapeau = new Array(n).fill(false);
    nbOuvertes = 0; caseBoum = -1; caseDepart = -1; debut = 0; fin = 0;
    construireGrille();
  }

  function poserMines(indices) {
    indices.slice(0, M).forEach((i) => { mine[i] = true; });
    for (let i = 0; i < C * L; i++) adj[i] = voisins(i).filter((j) => mine[j]).length;
  }
  function melanger(t, alea) {
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
    return t;
  }

  // Solo : mines posées au premier clic, loin de la case cliquée
  function minesSolo(premiere) {
    const interdit = new Set([premiere, ...voisins(premiere)]);
    const libres = [...Array(C * L).keys()].filter((i) => !interdit.has(i));
    poserMines(melanger(libres, Math.random));
  }

  // Lobby : grille tirée de la graine, + une case de départ sans mine autour
  function minesGraine(graine) {
    const alea = mulberry32(graine);
    poserMines(melanger([...Array(C * L).keys()], alea));
    const zeros = [...Array(C * L).keys()].filter((i) => !mine[i] && adj[i] === 0);
    const sures = zeros.length ? zeros : [...Array(C * L).keys()].filter((i) => !mine[i]);
    caseDepart = sures[Math.floor(alea() * sures.length)];
  }

  // ---------- Règles ----------
  function creuser(i) {
    if (drapeau[i] || ouverte[i]) return;
    if (mine[i]) { perdre(i); return; }
    const pile = [i];
    while (pile.length) {
      const k = pile.pop();
      if (ouverte[k] || drapeau[k]) continue;
      ouverte[k] = true; nbOuvertes++;
      if (adj[k] === 0) voisins(k).forEach((j) => { if (!ouverte[j] && !mine[j]) pile.push(j); });
    }
    if (nbOuvertes === C * L - M) gagner();
  }

  function accord(i) {
    // clic sur un chiffre : si le bon nombre de drapeaux l'entoure, on ouvre le reste
    if (!ouverte[i] || adj[i] === 0) return;
    const v = voisins(i);
    if (v.filter((j) => drapeau[j]).length !== adj[i]) return;
    v.forEach((j) => { if (etat === "jeu") creuser(j); });
  }

  function basculerDrapeau(i) {
    if (ouverte[i]) return;
    drapeau[i] = !drapeau[i];
  }

  function gagner() {
    etat = "gagne"; fin = Date.now();
    mine.forEach((m, i) => { if (m) drapeau[i] = true; });
    const s = secondes();
    const score = scoreVictoire(niveau, s);
    Scores.enregistrer(JEU, score, monPseudo()).catch(() => {});
    dire(`VICTOIRE en ${s} s — score ${score}`, "gagne");
  }

  function perdre(i) {
    etat = "perdu"; fin = Date.now(); caseBoum = i;
    Scores.enregistrer(JEU, 0, monPseudo()).catch(() => {}); // compte comme partie jouée
    dire("BOUM ! " + (enLobby ? "Attends la prochaine manche." : "Clique sur 💀 pour rejouer."), "perdu");
  }

  // ---------- Clics ----------
  function action(i, drapeauForce) {
    if (etat === "pret") {
      if (drapeauForce || modeDrapeau) return;
      if (!enLobby) minesSolo(i);
      etat = "jeu"; debut = Date.now();
    }
    if (etat !== "jeu") return;
    if (drapeauForce || (modeDrapeau && !ouverte[i])) basculerDrapeau(i);
    else if (ouverte[i]) accord(i);
    else creuser(i);
    dessiner();
    publierProgression();
  }

  let appuiLong = null, ignorerClic = false;
  grilleEl.addEventListener("click", (e) => {
    const c = e.target.closest(".case"); if (!c) return;
    if (ignorerClic) { ignorerClic = false; return; }
    action(+c.dataset.i, false);
  });
  grilleEl.addEventListener("contextmenu", (e) => {
    const c = e.target.closest(".case"); if (!c) return;
    e.preventDefault();
    action(+c.dataset.i, true);
  });
  // appui long (tactile) = drapeau
  grilleEl.addEventListener("pointerdown", (e) => {
    const c = e.target.closest(".case"); if (!c) return;
    $("#btn-visage").textContent = etat === "jeu" || etat === "pret" ? "😮" : $("#btn-visage").textContent;
    if (e.pointerType === "mouse") return;
    appuiLong = setTimeout(() => { appuiLong = null; ignorerClic = true; action(+c.dataset.i, true); if (navigator.vibrate) navigator.vibrate(30); }, 420);
  });
  const annulerAppui = () => { if (appuiLong) { clearTimeout(appuiLong); appuiLong = null; } majVisage(); };
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => grilleEl.addEventListener(ev, annulerAppui));

  $("#btn-drapeau").addEventListener("click", () => {
    modeDrapeau = !modeDrapeau;
    $("#btn-drapeau").classList.toggle("actif", modeDrapeau);
    $("#btn-drapeau").textContent = "🚩 Mode drapeau : " + (modeDrapeau ? "oui" : "non");
  });

  // ---------- Affichage ----------
  function construireGrille() {
    grilleEl.style.setProperty("--cols", C);
    const boutons = [];
    for (let i = 0; i < C * L; i++) {
      const b = document.createElement("button");
      b.className = "case"; b.dataset.i = i; b.type = "button";
      boutons.push(b);
    }
    grilleEl.replaceChildren(...boutons);
    tailleCases();
    dessiner();
  }

  function tailleCases() {
    const dispo = Math.min(window.innerWidth, document.querySelector("main").clientWidth) - 40;
    const t = Math.max(24, Math.min(34, Math.floor((dispo - 2 * (C - 1)) / C)));
    grilleEl.style.setProperty("--taille", t + "px");
  }
  addEventListener("resize", tailleCases);

  function dessiner() {
    const fini = etat === "gagne" || etat === "perdu";
    const cases = grilleEl.children;
    for (let i = 0; i < cases.length; i++) {
      const b = cases[i];
      let cls = "case", txt = "";
      if (ouverte[i]) {
        cls += " ouverte";
        if (adj[i]) { txt = adj[i]; cls += " n" + adj[i]; }
      } else if (fini && mine[i] && !drapeau[i]) {
        cls += " ouverte"; txt = "💣";
      } else if (drapeau[i]) {
        txt = "🚩";
        if (fini && !mine[i]) cls += " faux";
      }
      if (i === caseBoum) { cls += " boum"; txt = "💥"; }
      if (i === caseDepart && etat !== "attente") cls += " depart";
      if (b.className !== cls) b.className = cls;
      if (b.textContent !== String(txt)) b.textContent = txt;
    }
    const restantes = M - drapeau.filter(Boolean).length;
    $("#mines-restantes").textContent = (restantes < 0 ? "-" : "") + String(Math.abs(restantes)).padStart(3, "0");
    majVisage();
  }

  function majVisage() {
    $("#btn-visage").textContent = etat === "gagne" ? "😎" : etat === "perdu" ? "💀" : "🙂";
  }

  const secondes = () => (debut ? Math.min(999, Math.floor(((fin || Date.now()) - debut) / 1000)) : 0);
  setInterval(() => { $("#chrono").textContent = String(secondes()).padStart(3, "0"); }, 200);

  function dire(txt, cls) {
    const m = $("#message");
    m.textContent = txt || "";
    m.className = "message-jeu" + (cls ? " " + cls : "");
  }

  // ---------- Boutons de niveau ----------
  function afficherNiveaux() {
    const peutChoisir = !enLobby || estHote;
    $("#niveaux").replaceChildren(...Object.entries(NIVEAUX).map(([id, n]) => {
      const b = document.createElement("button");
      b.className = "filtre" + (id === niveau ? " actif" : "");
      b.textContent = n.nom + " · " + n.cols + "×" + n.rows;
      b.disabled = !peutChoisir;
      b.addEventListener("click", () => { if (enLobby) lancerManche(id); else nouvellePartieSolo(id); });
      return b;
    }));
  }

  $("#btn-visage").addEventListener("click", () => {
    if (!enLobby) nouvellePartieSolo(niveau);
    else if (estHote) lancerManche(niveau);
  });

  // ---------- Solo ----------
  function nouvellePartieSolo(niv) {
    preparer(niv);
    etat = "pret";
    dire("");
    afficherNiveaux();
  }

  // ---------- Lobby : course ----------
  let session = Reseau.session.lire();
  let enLobby = false, estHote = false, lobbyRef = null, mancheRef = null, joueursCourseRef = null;
  let joueursLobby = [], progression = {};
  const monPseudo = () => (session && session.nom) || (localStorage.getItem("rob-pseudo") || "Joueur");

  function lancerManche(niv) {
    if (!estHote) return;
    mancheRef.set({ id: Date.now(), graine: Math.floor(Math.random() * 2 ** 31), niveau: niv });
  }

  function recevoirManche(m) {
    if (!m || m.id === mancheId) return;
    mancheId = m.id;
    preparer(m.niveau);
    minesGraine(m.graine);
    etat = "jeu"; debut = Date.now(); // le chrono démarre pour tout le monde en même temps
    dire("C'est parti ! Commence par la case qui clignote.");
    afficherNiveaux();
    dessiner();
    publierProgression();
  }

  function publierProgression() {
    if (!enLobby || !mancheId) return;
    const sures = C * L - M;
    joueursCourseRef.child(session.id).set({
      nom: monPseudo(), manche: mancheId, etat,
      pct: Math.round((100 * nbOuvertes) / sures),
      temps: etat === "gagne" || etat === "perdu" ? secondes() : null,
    }).catch(() => {});
  }

  function afficherCourse() {
    if (!enLobby) return;
    $("#course").hidden = false;
    const lignes = joueursLobby.map(([id, j]) => {
      const p = progression[id];
      const ok = p && p.manche === mancheId;
      return { id, nom: j.nom, etat: ok ? p.etat : "attente", pct: ok ? p.pct : 0, temps: ok ? p.temps : null };
    });
    const ordre = { gagne: 0, jeu: 1, pret: 1, attente: 2, perdu: 3 };
    lignes.sort((a, b) => ordre[a.etat] - ordre[b.etat] || (a.etat === "gagne" ? a.temps - b.temps : b.pct - a.pct));
    let place = 0;
    $("#liste-course").replaceChildren(...lignes.map((l) => {
      const li = document.createElement("li");
      li.className = l.etat + (l.id === session.id ? " moi" : "");
      const etatTxt = l.etat === "gagne" ? `${++place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "✔"} ${l.temps} s`
        : l.etat === "perdu" ? "💥" : l.pct + " %";
      li.innerHTML = `<span class="nom"></span><span class="barre-prog"><span style="width:${l.etat === "gagne" ? 100 : l.pct}%"></span></span><span class="etat"></span>`;
      li.querySelector(".nom").textContent = l.nom + (l.id === session.id ? " (toi)" : "");
      li.querySelector(".etat").textContent = etatTxt;
      return li;
    }));
  }

  function demarrerLobby() {
    enLobby = true;
    lobbyRef = Reseau.lobby(session.code);
    mancheRef = lobbyRef.child("demineur/manche");
    joueursCourseRef = lobbyRef.child("demineur/joueurs");
    let lanceVu = false, parti = false, premier = true;
    const allerAuMenu = () => { if (parti) return; parti = true; Reseau.garderPresence(session); location.href = Reseau.racine; };

    lobbyRef.on("value", (snap) => {
      const v = snap.val();
      if (!v) { Reseau.session.effacer(); if (!parti) { parti = true; location.href = Reseau.racine; } return; }
      if (v.lancement) lanceVu = true;
      else if (lanceVu) { allerAuMenu(); return; }

      joueursLobby = Object.entries(v.joueurs || {}).sort((a, b) => (a[1].arrivee || 0) - (b[1].arrivee || 0));
      estHote = v.hote === session.id;
      progression = (v.demineur && v.demineur.joueurs) || {};
      if (v.demineur && v.demineur.manche) recevoirManche(v.demineur.manche);

      if (premier) {
        premier = false;
        if (estHote) {
          $("#btn-quitter").textContent = "◀ Retour au lobby (tout le monde)";
          $("#btn-quitter").onclick = () => lobbyRef.child("lancement").remove();
        } else {
          $("#btn-quitter").textContent = "◀ Retour au lobby";
          $("#btn-quitter").onclick = allerAuMenu;
        }
        if (!mancheId) {
          preparer("debutant");
          etat = "attente";
          dire(estHote ? "Choisis un niveau pour lancer la course." : "En attente de l'hôte…");
        }
      }
      $("#info-mode").textContent = estHote
        ? "Course : choisis le niveau, tout le lobby reçoit la même grille. 🙂 relance une manche."
        : "Course : l'hôte choisit le niveau. Même grille pour tout le monde !";
      afficherNiveaux();
      afficherCourse();
    });
  }

  function demarrerSolo() {
    enLobby = false;
    $("#info-mode").textContent = "Partie solo — le premier clic n'est jamais une mine.";
    $("#btn-quitter").onclick = () => { location.href = Reseau.racine; };
    nouvellePartieSolo("debutant");
  }

  // pour les tests (console du navigateur)
  window.__demineur = {
    get etat() { return etat; }, get mine() { return mine; }, get ouverte() { return ouverte; },
    get depart() { return caseDepart; }, get C() { return C; }, get L() { return L; }, action,
  };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(monPseudo())));

  if (!session) demarrerSolo();
  else Reseau.reprendre(session).then(demarrerLobby).catch(() => { session = null; demarrerSolo(); });
})();
