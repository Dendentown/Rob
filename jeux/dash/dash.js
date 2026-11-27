/* ============================================================
   NÉON DASH
   Le cube avance tout seul : on saute (clic, tap, Espace — on peut
   garder appuyé). Parcours généré au hasard (voir moteur.js) :
   montées, descentes, trous, plafonds à piques, tunnels, plateformes,
   tremplins, anneaux, doubles chemins.

   BOÎTES « ? » : elles donnent un objet (un seul à la fois), à utiliser
   avec le bouton en bas à droite (ou E / Maj / Entrée) :
     T turbo (plus vite et casse les obstacles)   B bouclier (encaisse
     un choc, ou fait rebondir au-dessus d'un trou)   L laser (détruit
     les obstacles devant)
   En COURSE, deux objets de plus contre les autres :
     R ralentir (tous les autres pendant 3 s)
     F flaque d'eau (posée par terre : qui passe dessus glisse et reste
     immobilisé 1 s)
   et le laser immobilise aussi les joueurs juste devant (1,2 s).

   SOLO : parcours infini, score = distance en mètres (1 bloc = 1 m).
   COURSE (lobby) : l'hôte lance, tout le monde reçoit le même parcours
   (même graine). Les autres apparaissent en fantômes. Si on tombe, on
   repart du dernier point de reprise. Premier arrivé gagne.
   ============================================================ */
(function () {
  const JEU = "dash";
  const M = window.DashMoteur;
  const { U, H, X_CUBE } = M;
  const W = 800;
  const LONGUEUR_COURSE = 600; // blocs
  const COULEURS = ["#19f0ff", "#ff2bd6", "#3dff7a", "#ffe14d", "#ff8a1f", "#b388ff", "#ff3b3b", "#ffffff"];
  const OBJETS = {
    turbo: { lettre: "T", c: "#ff8a1f" }, bouclier: { lettre: "B", c: "#3dff7a" }, laser: { lettre: "L", c: "#ff2bd6" },
    ralentir: { lettre: "R", c: "#b388ff" }, flaque: { lettre: "F", c: "#19f0ff" },
  };
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  // etat : "menu" | "compte" (3,2,1) | "jeu" | "mort" (attente avant reprise, en course) | "arrive" | "fini"
  let mode = "menu", etat = "menu";
  let monde = null, j = null, appui = false, objet = null, particules = [], rayons = [], chronoMort = 0, compte = 0;
  let course = null, depart = 0, temps = 0, autres = {}, maCouleur = 0;

  const score = () => Math.floor((j ? j.x : 0) / U);

  // ---------- Solo ----------
  function nouvellePartie() {
    mode = "solo";
    monde = M.creerMonde((Math.random() * 2 ** 31) | 0);
    j = M.nouveauJoueur();
    objet = null; particules = []; rayons = [];
    etat = "jeu";
    $("#overlay").hidden = true;
    majBoutonObjet();
    Salle.publier(0, "jeu", true);
  }

  // ---------- Commandes ----------
  function presser() { if (etat === "jeu") appui = true; }
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["e", "shift", "enter", "arrowright"].includes(k)) { e.preventDefault(); if (etat !== "fini" && etat !== "menu") utiliserObjet(); return; }
    if (e.repeat) return;
    if (k === " " || k === "arrowup" || k === "z" || k === "w") {
      e.preventDefault();
      if ((etat === "menu" || etat === "fini") && mode !== "course" && Coop.role !== "hote") nouvellePartie(); else presser();
    }
  });
  addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); if (k === " " || k === "arrowup" || k === "z" || k === "w") appui = false; });
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); presser(); });
  addEventListener("pointerup", () => { appui = false; });
  addEventListener("pointercancel", () => { appui = false; });
  $("#btn-objet").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); utiliserObjet(); });

  // ---------- Objets ----------
  function donnerObjet() {
    if (objet) return;
    const liste = mode === "course" ? ["turbo", "bouclier", "laser", "ralentir", "flaque", "laser", "ralentir", "flaque"] : ["turbo", "bouclier", "laser"];
    objet = liste[(Math.random() * liste.length) | 0];
    majBoutonObjet();
  }
  function majBoutonObjet() {
    const b = $("#btn-objet");
    b.textContent = objet ? OBJETS[objet].lettre : "";
    b.style.setProperty("--c", objet ? OBJETS[objet].c : "#4a3a66");
    b.disabled = !objet;
  }
  function utiliserObjet() {
    if (!objet || !j || (etat !== "jeu" && etat !== "compte")) return;
    if (etat === "compte") return;
    const o = objet; objet = null; majBoutonObjet();
    if (o === "turbo") j.boost = 2.5;
    if (o === "bouclier") j.bouclier = true;
    if (o === "laser") {
      const r = M.laser(j, monde, 9);
      rayons.push({ x1: r.x1, x2: r.x2, y: j.y + U / 2, t: 0.35 });
      evenement("laser", { d: j.x });
    }
    if (o === "ralentir") evenement("ralentir", {});
    if (o === "flaque") evenement("flaque", { d: j.x - U });
    eclat(X_CUBE + U / 2, j.y, OBJETS[o].c, 14);
  }

  // ---------- Boucle de jeu ----------
  function eclat(x, y, c, n) {
    for (let i = 0; i < n; i++) particules.push({ x, y, vx: (Math.random() - 0.5) * 400, vy: (Math.random() - 0.8) * 400, t: 0.6, c, monde: false });
  }

  function mettreAJour(dt) {
    M.etendre(monde, j.x + 2 * W);
    if (mode === "solo" && Math.random() < 0.01) M.nettoyer(monde, j.x - 2000);
    const ev = M.etape(j, monde, dt, appui);
    if (ev.includes("boite")) { donnerObjet(); eclat(X_CUBE + U / 2, j.y, "#ffe14d", 10); }
    if (ev.includes("bouclier")) eclat(X_CUBE + U / 2, j.y + U / 2, "#3dff7a", 16);
    if (ev.includes("casse")) eclat(X_CUBE + U, j.y + U / 2, "#ff8a1f", 10);
    if (ev.includes("glisse")) eclat(X_CUBE + U / 2, j.y + U, "#19f0ff", 12);
    if (ev.includes("mort")) return mourir();
    if (j.sol && Math.random() < 0.6) particules.push({ x: X_CUBE, y: j.y + U - 2, vx: -150, vy: -Math.random() * 60, t: 0.3, c: j.boost > 0 ? "#ff8a1f" : COULEURS[maCouleur] });
    if (mode === "course") {
      temps = (performance.now() - depart) / 1000;
      if (ev.includes("fini")) arriver();
      publierPosition();
    } else Salle.publier(score(), "jeu");
  }

  function mourir() {
    eclat(X_CUBE + U / 2, j.y + U / 2, COULEURS[maCouleur], 30);
    eclat(X_CUBE + U / 2, j.y + U / 2, "#ffffff", 10);
    if (mode === "course") { etat = "mort"; chronoMort = 0.8; return; }
    etat = "fini";
    Salle.publier(score(), "fini");
    Scores.enregistrer(JEU, score(), Salle.pseudo()).catch(() => {});
    setTimeout(() => menu("GAME OVER", score() + " m"), 600);
  }

  // ---------- Course (réseau) ----------
  const session = Reseau.session.lire();
  let base = null, presents = [], courseVue = 0, premiereLecture = true, dernierePos = 0;

  function demarrerReseau() {
    if (!session) return;
    base = Reseau.base().ref("games/" + session.code + "X/dash");
    const moi = base.child("ici/" + session.id);
    moi.set({ nom: Salle.pseudo() }).then(() => moi.onDisconnect().remove()).catch(() => {});
    base.child("ici").on("value", (s) => {
      presents = Object.entries(s.val() || {}).map(([id, v]) => ({ id, nom: v.nom })).sort((a, b) => (a.id < b.id ? -1 : 1));
      maCouleur = Math.max(0, presents.findIndex((p) => p.id === session.id)) % COULEURS.length;
      if (etat === "menu" || etat === "fini") menu($("#ov-titre").textContent, $("#ov-texte").textContent);
    });
    base.child("course").on("value", (s) => {
      const c = Reseau.dec(s.val());
      if (premiereLecture) { premiereLecture = false; courseVue = c ? c.id : 0; return; } // on ne rejoint pas une course déjà finie
      if (c && c.id !== courseVue) { courseVue = c.id; commencerCourse(c); }
    });
    base.child("joueurs").on("value", (s) => {
      autres = {};
      Object.entries(s.val() || {}).forEach(([id, v]) => { const d = Reseau.dec(v); if (d && course && d.course === course.id && id !== session.id) autres[id] = d; });
      if (etat === "arrive") afficherResultats();
    });
    base.child("evts").on("child_added", (s) => { const e = Reseau.dec(s.val()); if (e) recevoirEvenement(e); });
  }

  function lancerCourse() {
    if (!base) return;
    const c = { id: Date.now(), graine: (Math.random() * 2 ** 31) | 0, longueur: LONGUEUR_COURSE };
    base.child("joueurs").remove().catch(() => {});
    base.child("evts").remove().catch(() => {});
    base.child("course").set(Reseau.enc(c)).catch(() => {});
  }

  function commencerCourse(c) {
    course = c; mode = "course";
    monde = M.creerMonde(c.graine, { longueur: c.longueur, course: true });
    j = M.nouveauJoueur();
    objet = null; particules = []; rayons = []; autres = {}; temps = 0;
    majBoutonObjet();
    etat = "compte"; compte = 3;
    $("#overlay").hidden = true;
  }

  function publierPosition(force) {
    if (!base || !course) return;
    const t = performance.now();
    if (!force && t - dernierePos < 100) return;
    dernierePos = t;
    base.child("joueurs/" + session.id).set(Reseau.enc({
      course: course.id, nom: Salle.pseudo(), c: maCouleur, d: Math.round(j.x), y: Math.round(j.y), r: +j.rot.toFixed(2),
      e: etat, tps: etat === "arrive" ? +temps.toFixed(2) : null, st: j.stun > 0 ? 1 : 0, b: j.bouclier ? 1 : 0, bo: j.boost > 0 ? 1 : 0,
    })).catch(() => {});
    Salle.publier(Math.floor(j.x / U), etat === "arrive" ? "fini" : "jeu");
  }

  function evenement(type, donnees) {
    if (mode !== "course" || !base) {
      // en solo, seul le laser sert (il a déjà détruit les obstacles)
      return;
    }
    base.child("evts").push(Reseau.enc(Object.assign({ course: course.id, de: session.id, type }, donnees))).catch(() => {});
  }

  function recevoirEvenement(e) {
    if (!course || e.course !== course.id || !j) return;
    if (e.type === "flaque") {
      const y = M.solSous(monde, e.d + U);
      if (y != null) monde.flaques.push({ id: "f" + e.d + e.de, x: e.d, y });
      return;
    }
    if (e.de === session.id) return;
    if (e.type === "ralentir") { j.lent = 3; eclat(X_CUBE + U / 2, j.y, "#b388ff", 12); }
    if (e.type === "laser" && j.x > e.d && j.x < e.d + 12 * U) { j.stun = 1.2; eclat(X_CUBE + U / 2, j.y + U / 2, "#ff2bd6", 16); }
  }

  function arriver() {
    etat = "arrive";
    publierPosition(true);
    afficherResultats();
  }

  function classement() {
    const tous = Object.entries(autres).map(([id, d]) => ({ id, nom: d.nom, d: d.d, tps: d.tps }));
    if (j && course) tous.push({ id: session.id, nom: Salle.pseudo(), d: j.x, tps: etat === "arrive" ? temps : null });
    return tous.sort((a, b) => (a.tps != null && b.tps != null ? a.tps - b.tps : a.tps != null ? -1 : b.tps != null ? 1 : b.d - a.d));
  }

  function afficherResultats() {
    const lignes = classement().map((p, i) => `${i + 1}. ${p.nom}  ${p.tps != null ? p.tps.toFixed(1) + " s" : Math.floor((p.d / (LONGUEUR_COURSE * U)) * 100) + " %"}`);
    const premier = classement()[0];
    menu(premier && premier.id === session.id ? "VICTOIRE !" : "ARRIVÉE", lignes.join("\n"));
  }

  // ---------- Menus ----------
  let menuCle = "";
  function menu(titre, texte) {
    const hote = Coop.role === "hote" && base;
    const n = presents.length;
    const cle = titre + texte + hote + n;
    if (cle === menuCle && !$("#overlay").hidden) return;
    menuCle = cle;
    $("#ov-titre").textContent = titre;
    $("#ov-texte").textContent = texte || "";
    const boutons = [["Solo", nouvellePartie]];
    if (hote) boutons.push(["Course · " + n, lancerCourse, n < 2]);
    $("#ov-boutons").replaceChildren(...boutons.map(([l, f, off]) => {
      const b = document.createElement("button");
      b.className = "bouton"; b.textContent = l; b.disabled = !!off;
      b.addEventListener("click", f);
      return b;
    }));
    $("#overlay").hidden = false;
  }

  // ---------- Dessin ----------
  function teinte() { return `hsl(${(280 + (j ? j.x : 0) / 40) % 360}, 80%, 8%)`; }
  const versEcran = (x) => x - (j ? j.x : 0) + X_CUBE;

  function dessinerCube(x, y, rot, couleur, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + U / 2, y + U / 2); ctx.rotate(rot);
    ctx.fillStyle = couleur; ctx.shadowColor = couleur; ctx.shadowBlur = 16;
    ctx.fillRect(-U / 2, -U / 2, U, U); ctx.shadowBlur = 0;
    ctx.fillStyle = "#05010f"; ctx.fillRect(-U / 2 + 4, -U / 2 + 4, U - 8, U - 8);
    ctx.fillStyle = couleur; ctx.fillRect(-U / 2 + 8, -U / 2 + 8, U - 16, U - 16);
    ctx.fillStyle = "#ffe14d"; ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  function texte(t, x, y, taille, c, align) {
    ctx.font = taille + "px 'Press Start 2P', monospace"; ctx.textAlign = align || "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 8; ctx.fillText(t, x, y); ctx.shadowBlur = 0;
  }

  function dessiner(t) {
    ctx.fillStyle = teinte(); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255, 43, 214, 0.12)";
    const gx = ((j ? j.x : 0) * 0.3) % 60;
    for (let x = -gx; x < W; x += 60) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 60) ctx.fillRect(0, y, W, 1);
    if (!monde) return;
    const vx1 = j.x - X_CUBE - 60, vx2 = j.x - X_CUBE + W + 60;
    const visible = (o) => o.x + (o.w || U) > vx1 && o.x < vx2;

    // sols, blocs, plafonds
    monde.rects.forEach((r) => {
      if (r.detruit || !visible(r)) return;
      const X = versEcran(r.x);
      if (r.type === "sol") {
        ctx.fillStyle = "#05010f"; ctx.fillRect(X, r.y, r.w, H - r.y);
        ctx.fillStyle = "rgba(25, 240, 255, 0.12)";
        for (let x = Math.ceil(r.x / U) * U; x < r.x + r.w; x += U) ctx.fillRect(versEcran(x), r.y + 3, 1, H - r.y);
        ctx.fillStyle = "#19f0ff"; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 10;
        ctx.fillRect(X, r.y, r.w, 3);
        // bords verticaux seulement s'il y a une marche ou un trou (pas entre deux sols au même niveau)
        const memeNiveau = (o) => o !== r && o.type === "sol" && o.y === r.y;
        if (!monde.rects.some((o) => memeNiveau(o) && Math.abs(o.x + o.w - r.x) < 1)) ctx.fillRect(X, r.y, 2, H - r.y);
        if (!monde.rects.some((o) => memeNiveau(o) && Math.abs(o.x - (r.x + r.w)) < 1)) ctx.fillRect(X + r.w - 2, r.y, 2, H - r.y);
        ctx.shadowBlur = 0;
      } else if (r.type === "plafond") {
        ctx.fillStyle = "#0c0424"; ctx.fillRect(X, 0, r.w, r.y + r.h);
        ctx.fillStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 10; ctx.fillRect(X, r.y + r.h - 3, r.w, 3); ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "#0c0424"; ctx.fillRect(X, r.y, r.w, r.h);
        ctx.strokeStyle = "#19f0ff"; ctx.lineWidth = 2; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 8;
        ctx.strokeRect(X + 1, r.y + 1, r.w - 2, r.h - 2); ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(25,240,255,0.25)";
        for (let x = 0; x < r.w; x += U) ctx.fillRect(X + x + 8, r.y + 8, U - 16, r.h - 16);
      }
    });
    // piques
    monde.piques.forEach((p) => {
      if (p.detruit || !visible(p)) return;
      const X = versEcran(p.x), s = p.bas ? 1 : -1;
      ctx.fillStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(X, p.y); ctx.lineTo(X + U / 2, p.y + s * U); ctx.lineTo(X + U, p.y); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#05010f";
      ctx.beginPath(); ctx.moveTo(X + 8, p.y); ctx.lineTo(X + U / 2, p.y + s * (U - 14)); ctx.lineTo(X + U - 8, p.y); ctx.closePath(); ctx.fill();
    });
    monde.tremplins.forEach((tr) => { if (!visible(tr)) return; ctx.fillStyle = "#ffe14d"; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 14; ctx.fillRect(versEcran(tr.x) + 3, tr.y - 6, U - 6, 6); ctx.shadowBlur = 0; });
    monde.anneaux.forEach((a) => {
      if (!visible(a)) return;
      const pris = j.anneaux.includes(a.id);
      ctx.strokeStyle = pris ? "rgba(255,225,77,0.3)" : "#ffe14d"; ctx.lineWidth = 3; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = pris ? 0 : 14;
      ctx.beginPath(); ctx.arc(versEcran(a.x), a.y, 11 + Math.sin(t / 120) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    });
    monde.boites.forEach((b) => {
      if (!visible(b) || j.boites.includes(b.id)) return;
      const X = versEcran(b.x), Y = b.y + Math.sin(t / 200 + b.x) * 3;
      ctx.fillStyle = "#05010f"; ctx.fillRect(X - 11, Y - 11, 22, 22);
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 2; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = (t / 150) % 2 < 1 ? 14 : 5;
      ctx.strokeRect(X - 11, Y - 11, 22, 22); ctx.shadowBlur = 0;
      texte("?", X + 1, Y + 1, 12, "#ffe14d");
    });
    monde.flaques.forEach((f) => {
      if (!visible(f)) return;
      const X = versEcran(f.x);
      ctx.fillStyle = "rgba(25, 240, 255, 0.55)"; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.ellipse(X + U, f.y - 2, U, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    });
    // ligne d'arrivée
    if (isFinite(monde.fin)) {
      const X = versEcran(monde.fin);
      if (X > -20 && X < W + 20) for (let y = 0; y < H; y += 12) { ctx.fillStyle = (y / 12) % 2 ? "#ffffff" : "#05010f"; ctx.fillRect(X, y, 6, 12); ctx.fillStyle = (y / 12) % 2 ? "#05010f" : "#ffffff"; ctx.fillRect(X + 6, y, 6, 12); }
    }
    // laser
    rayons.forEach((r) => {
      ctx.globalAlpha = Math.min(1, r.t * 4);
      ctx.fillStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 20;
      ctx.fillRect(versEcran(r.x1), r.y - 3, r.x2 - r.x1, 6); ctx.fillStyle = "#fff"; ctx.fillRect(versEcran(r.x1), r.y - 1, r.x2 - r.x1, 2);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });
    // fantômes des autres coureurs
    Object.values(autres).forEach((o) => {
      const X = versEcran(o.d);
      if (X < -U || X > W + U) return;
      dessinerCube(X, o.y, o.r || 0, COULEURS[o.c % COULEURS.length], o.st ? 0.25 : 0.45);
      texte(o.nom, X + U / 2, o.y - 12, 7, COULEURS[o.c % COULEURS.length]);
    });
    // particules
    particules.forEach((p) => { ctx.globalAlpha = Math.max(0, p.t * 2); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 4, 4); });
    ctx.globalAlpha = 1;
    // mon cube
    if (etat !== "fini" && etat !== "mort") {
      const clignote = j.stun > 0 && (t / 80) % 2 < 1;
      dessinerCube(X_CUBE, j.y, j.stun > 0 ? j.rot + t / 60 : j.rot, j.boost > 0 ? "#ff8a1f" : COULEURS[maCouleur], clignote ? 0.4 : 1);
      if (j.bouclier) { ctx.strokeStyle = "#3dff7a"; ctx.lineWidth = 2; ctx.shadowColor = "#3dff7a"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(X_CUBE + U / 2, j.y + U / 2, 26, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
      if (j.lent > 0) texte("~", X_CUBE + U / 2, j.y - 12, 14, "#b388ff");
    }
    // haut de l'écran : distance (solo) ou progression de la course
    if (mode === "course" && course) {
      const L = course.longueur * U, x1 = 60, x2 = W - 60;
      ctx.fillStyle = "rgba(216,249,255,0.3)"; ctx.fillRect(x1, 18, x2 - x1, 2);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x2, 10, 3, 18);
      Object.values(autres).forEach((o) => { ctx.fillStyle = COULEURS[o.c % COULEURS.length]; ctx.fillRect(x1 + (x2 - x1) * Math.min(1, o.d / L) - 4, 14, 8, 10); });
      ctx.fillStyle = COULEURS[maCouleur]; ctx.shadowColor = COULEURS[maCouleur]; ctx.shadowBlur = 10;
      ctx.fillRect(x1 + (x2 - x1) * Math.min(1, j.x / L) - 5, 12, 10, 14); ctx.shadowBlur = 0;
      texte(temps.toFixed(1), 16, 20, 10, "#ffffff", "left");
    }
    if (etat === "compte") texte(compte > 0.5 ? String(Math.ceil(compte - 0.5)) : "GO", W / 2, H / 2 - 40, 40, "#ffe14d");
    $("#score").textContent = mode === "course" ? Math.floor(j.x / U) + " / " + LONGUEUR_COURSE : score();
    $("#vitesse").textContent = "×" + (M.vitesseJoueur(j) / 330).toFixed(2);
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.025, (t - avant) / 1000); avant = t;
    if (etat === "compte") {
      compte -= dt;
      if (compte <= 0) { etat = "jeu"; depart = performance.now(); }
    } else if (etat === "jeu") mettreAJour(dt);
    else if (etat === "mort") {
      chronoMort -= dt;
      if (chronoMort <= 0) { M.reprise(j, monde); etat = "jeu"; }
      publierPosition();
    } else if (etat === "arrive") {
      // on continue à rouler doucement après la ligne
      M.etendre(monde, j.x + 2 * W);
      M.etape(j, monde, dt, false);
    }
    particules.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.t -= dt; });
    particules = particules.filter((p) => p.t > 0);
    rayons.forEach((r) => (r.t -= dt)); rayons = rayons.filter((r) => r.t > 0);
    if (monde) dessiner(t); else { ctx.fillStyle = teinte(); ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(boucle);
  }

  window.__dash = {
    get etat() { return etat; }, get mode() { return mode; }, get distance() { return j ? j.x : 0; }, get joueur() { return j; }, get monde() { return monde; },
    get objet() { return objet; }, set objet(o) { objet = o; majBoutonObjet(); }, get autres() { return autres; }, get temps() { return temps; },
    set appui(v) { appui = v; }, nouvellePartie, utiliserObjet, lancerCourse, classement,
    allerA(x) { M.etendre(monde, x + 2 * W); j.x = x; M.reprise(j, monde); },
  };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Coop.demarrer(JEU, { surRoles: () => { if (etat === "menu" || etat === "fini") menu($("#ov-titre").textContent || "NÉON DASH", $("#ov-texte").textContent); } })
    .then(demarrerReseau).catch(() => {});
  majBoutonObjet();
  menu("NÉON DASH", "");
  requestAnimationFrame(boucle);
})();
