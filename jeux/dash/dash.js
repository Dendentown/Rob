/* ============================================================
   NÉON DASH — course façon « speed runner »
   Le cube accélère tout seul ; on saute (clic, tap, Espace — on peut
   garder appuyé). ON NE MEURT JAMAIS : une erreur fait perdre du temps.
     pique → on trébuche (vitesse × 0,25)   mur / bloc → bloqué contre
     trou → retour au dernier point de reprise
   Parcours généré au hasard (voir moteur.js), obstacles serrés :
   montées, descentes, trous, plafonds à piques, tunnels, plateformes,
   tremplins, anneaux, doubles chemins, parties À L'ENVERS (au plafond),
   et des pièges animés :
   cubes qui tombent, ascenseurs, dalles qui s'effondrent, portails de
   gravité, tapis roulants, murs à rebond, lasers alternés, pendules,
   portes à interrupteur, bulles de saut, deux voies, zone sombre.

   BOÎTES « ? » : un objet à la fois, à utiliser avec le bouton sous le
   terrain (ou E / Maj / Entrée) :
     T turbo (plus vite et casse les obstacles)
     G grappin (s'accroche au plafond et se balance vers l'avant : élan)
     L laser (rayon en ligne droite jusqu'au bord de l'écran : détruit
       les obstacles à hauteur du cube)
   En COURSE, des objets contre les autres :
     R ralentir (tous les autres pendant 3 s)
     F flaque d'eau (qui passe dessus glisse : immobilisé 1 s)
     G grappin : si un adversaire est assez proche devant, on s'accroche
       à LUI (il est ramené derrière, on prend son élan)
     et le laser immobilise aussi les joueurs devant dans l'écran (1,2 s).

   SOLO : contre-la-montre sur 600 blocs. Score = 100 000 / temps (s).
   COURSE (lobby) : l'hôte lance, même parcours pour tous (même graine),
   les autres en fantômes, premier arrivé gagne.
   ============================================================ */
(function () {
  const JEU = "dash";
  const M = window.DashMoteur;
  const { U, H, X_CUBE } = M;
  const W = 800;
  const LONGUEUR_COURSE = 600; // blocs
  const COULEURS = ["#19f0ff", "#ff2bd6", "#3dff7a", "#ffe14d", "#ff8a1f", "#b388ff", "#ff3b3b", "#ffffff"];
  const OBJETS = {
    turbo: { lettre: "T", nom: "TURBO", c: "#ff8a1f" }, bouclier: { lettre: "B", nom: "BOUCLIER", c: "#3dff7a" }, laser: { lettre: "L", nom: "LASER", c: "#ff2bd6" },
    ralentir: { lettre: "R", nom: "RALENTIR", c: "#b388ff" }, flaque: { lettre: "F", nom: "FLAQUE", c: "#19f0ff" }, grappin: { lettre: "G", nom: "GRAPPIN", c: "#ffe14d" },
  };
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  // etat : "menu" | "compte" (3,2,1) | "jeu" | "arrive"
  let mode = "menu", etat = "menu";
  let monde = null, j = null, appui = false, objet = null, particules = [], rayons = [], compte = 0;
  let course = null, depart = 0, temps = 0, autres = {}, maCouleur = 0, liens = [], secousse = 0;

  const score = () => Math.floor((j ? j.x : 0) / U);
  const COURSE_OBJETS = ["turbo", "grappin", "laser", "ralentir", "flaque", "grappin", "laser", "ralentir", "flaque", "turbo"];

  // ---------- Solo ----------
  function nouvellePartie() {
    mode = "solo";
    course = { id: 0, longueur: LONGUEUR_COURSE };
    monde = M.creerMonde((Math.random() * 2 ** 31) | 0, { longueur: LONGUEUR_COURSE });
    j = M.nouveauJoueur();
    objet = null; particules = []; rayons = []; liens = []; autres = {}; temps = 0;
    etat = "compte"; compte = 3;
    $("#overlay").hidden = true;
    majBoutonObjet();
    Salle.publier(0, "jeu", true);
  }
  const pointsSolo = (t) => Math.round(100000 / Math.max(1, t));

  // ---------- Commandes ----------
  function presser() { if (etat === "jeu") appui = true; }
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["e", "shift", "enter", "arrowright"].includes(k)) { e.preventDefault(); utiliserObjet(); return; }
    if (e.repeat) return;
    if (k === " " || k === "arrowup" || k === "z" || k === "w") {
      e.preventDefault();
      if ((etat === "menu" || (etat === "arrive" && mode === "solo")) && Coop.role !== "hote") nouvellePartie(); else presser();
    }
  });
  addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); if (k === " " || k === "arrowup" || k === "z" || k === "w") appui = false; });
  // on saute en appuyant n'importe où sur l'écran (sauf sur les boutons) ; plus l'appui dure, plus le saut est haut
  addEventListener("pointerdown", (e) => {
    if (etat !== "jeu" || e.target.closest("button, .modal")) return;
    e.preventDefault(); presser();
  });
  addEventListener("pointerup", () => { appui = false; });
  addEventListener("pointercancel", () => { appui = false; });
  $("#btn-objet").addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); utiliserObjet(); });

  // ---------- Objets ----------
  function donnerObjet() {
    if (objet) return;
    const liste = mode === "course" ? COURSE_OBJETS : ["turbo", "grappin", "laser"];
    objet = liste[(Math.random() * liste.length) | 0];
    majBoutonObjet();
  }
  function majBoutonObjet() {
    const b = $("#btn-objet");
    b.textContent = objet ? OBJETS[objet].nom : "—";
    b.style.setProperty("--c", objet ? OBJETS[objet].c : "#4a3a66");
    b.disabled = !objet;
  }
  function utiliserObjet() {
    if (!objet || !j || etat !== "jeu") return;
    const o = objet;
    if (o === "grappin") {
      // en course : un adversaire pas trop loin devant → on s'accroche à lui (il est tiré en arrière, on prend son élan)
      const cible = mode === "course" && Object.entries(autres).filter(([, d]) => d.d > j.x && d.d - j.x < 15 * U && d.e !== "arrive").sort((a, b) => a[1].d - b[1].d)[0];
      if (cible) {
        liens.push({ de: X_CUBE + U / 2, dy: j.y + U / 2, vers: cible[1].d, vy: cible[1].y + U / 2, t: 0.4 });
        evenement("grappin", { cible: cible[0], d: j.x });
        j.v = M.vitesseCroisiere(j) * 1.8; j.boost = Math.max(j.boost, 0.8);
      } else M.accrocher(j, monde); // sinon : au plafond, et on se balance vers l'avant
    }
    objet = null; majBoutonObjet();
    if (o === "turbo") j.boost = 2.5;
    if (o === "bouclier") j.bouclier = true;
    if (o === "laser") {
      const r = M.laser(j, monde, W - X_CUBE); // jusqu'au bord de l'écran
      rayons.push({ x1: r.x1, x2: r.x2, y: r.y, t: 0.35 });
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
    if (ev.includes("choc")) { eclat(X_CUBE + U / 2, j.y + U / 2, "#ff2bd6", 12); secousse = 0.15; }
    if (ev.includes("bloque") && Math.random() < 0.15) eclat(X_CUBE + U, j.y + U / 2, "#19f0ff", 2);
    if (ev.includes("lache")) eclat(X_CUBE + U / 2, j.y + U / 2, "#ffe14d", 12);
    if (ev.includes("rebond")) eclat(X_CUBE + U, j.y + U / 2, "#3dff7a", 8);
    if (ev.includes("bulle-prise")) eclat(X_CUBE + U / 2, j.y + U / 2, "#19f0ff", 10);
    if (ev.includes("bulle")) eclat(X_CUBE + U / 2, j.y + U, "#19f0ff", 8);
    if (ev.includes("portail")) { eclat(X_CUBE + U / 2, j.y + U / 2, "#ffe14d", 14); secousse = 0.1; }
    if (ev.includes("porte")) eclat(X_CUBE + U, j.y, "#3dff7a", 12);
    if (ev.includes("chute")) { eclat(X_CUBE + U / 2, j.y + U / 2, COULEURS[maCouleur], 20); secousse = 0.25; }
    if (j.sol && Math.random() < 0.6) particules.push({ x: X_CUBE, y: j.grav < 0 ? j.y : j.y + U - 2, vx: -150, vy: -Math.random() * 60, t: 0.3, c: j.boost > 0 ? "#ff8a1f" : COULEURS[maCouleur] });
    temps = (performance.now() - depart) / 1000;
    if (mode === "course") {
      if (ev.includes("fini")) arriver();
      publierPosition();
    } else {
      Salle.publier(score(), "jeu");
      if (ev.includes("fini")) finSolo();
    }
  }

  function finSolo() {
    etat = "arrive";
    const pts = pointsSolo(temps);
    Salle.publier(pts, "fini");
    Scores.enregistrer(JEU, pts, Salle.pseudo()).catch(() => {});
    menu("ARRIVÉE", temps.toFixed(1) + " s · " + pts);
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
      if (etat === "menu" || (etat === "arrive" && mode === "solo")) menu($("#ov-titre").textContent, $("#ov-texte").textContent);
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
    objet = null; particules = []; rayons = []; liens = []; autres = {}; temps = 0;
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
    if (e.type === "ralentir") { if (j.bouclier) j.bouclier = false; else j.lent = 3; eclat(X_CUBE + U / 2, j.y, "#b388ff", 12); }
    if (e.type === "laser" && j.x > e.d && j.x < e.d + (W - X_CUBE)) {
      if (j.bouclier) j.bouclier = false; else { j.stun = 1.2; j.v = 0; }
      eclat(X_CUBE + U / 2, j.y + U / 2, "#ff2bd6", 16);
    }
    if (e.type === "grappin" && e.cible === session.id && etat === "jeu") {
      const lanceur = autres[e.de];
      liens.push({ de: X_CUBE + U / 2, dy: j.y + U / 2, vers: e.d, vy: lanceur ? lanceur.y + U / 2 : j.y, t: 0.4, inverse: true });
      if (j.bouclier) { j.bouclier = false; eclat(X_CUBE + U / 2, j.y + U / 2, "#3dff7a", 16); return; }
      // ramené derrière le lanceur (sur du sol, sinon au point de reprise)
      const x = e.d - 2 * U, ySol = M.solSous(monde, x + U / 2);
      if (ySol != null) Object.assign(j, { x, y: ySol - U, vy: 0, v: 0, sol: true });
      else M.reprise(j, monde, x);
      j.stun = 0.5; secousse = 0.3;
      eclat(X_CUBE + U / 2, j.y + U / 2, "#ffe14d", 20);
    }
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (secousse > 0) ctx.translate((Math.random() - 0.5) * 8 * secousse / 0.3, (Math.random() - 0.5) * 8 * secousse / 0.3);
    ctx.fillStyle = teinte(); ctx.fillRect(-10, -10, W + 20, H + 20);
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
      if (r.type === "sol" && r.haut) { // sol retourné (partie à l'envers)
        const b = r.y + r.h;
        ctx.fillStyle = "#05010f"; ctx.fillRect(X, 0, r.w, b);
        ctx.fillStyle = "rgba(255, 225, 77, 0.12)";
        for (let x = Math.ceil(r.x / U) * U; x < r.x + r.w; x += U) ctx.fillRect(versEcran(x), 0, 1, b - 3);
        ctx.fillStyle = "#ffe14d"; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 10;
        ctx.fillRect(X, b - 3, r.w, 3);
        const meme = (o) => o !== r && o.type === "sol" && o.haut && o.y + o.h === b;
        if (!monde.rects.some((o) => meme(o) && Math.abs(o.x + o.w - r.x) < 1)) ctx.fillRect(X, 0, 2, b);
        if (!monde.rects.some((o) => meme(o) && Math.abs(o.x - (r.x + r.w)) < 1)) ctx.fillRect(X + r.w - 2, 0, 2, b);
        ctx.shadowBlur = 0;
      } else if (r.type === "sol") {
        ctx.fillStyle = "#05010f"; ctx.fillRect(X, r.y, r.w, H - r.y);
        ctx.fillStyle = "rgba(25, 240, 255, 0.12)";
        for (let x = Math.ceil(r.x / U) * U; x < r.x + r.w; x += U) ctx.fillRect(versEcran(x), r.y + 3, 1, H - r.y);
        ctx.fillStyle = "#19f0ff"; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 10;
        ctx.fillRect(X, r.y, r.w, 3);
        // bords verticaux seulement s'il y a une marche ou un trou (pas entre deux sols au même niveau)
        const memeNiveau = (o) => o !== r && o.type === "sol" && !o.haut && o.y === r.y;
        if (!monde.rects.some((o) => memeNiveau(o) && Math.abs(o.x + o.w - r.x) < 1)) ctx.fillRect(X, r.y, 2, H - r.y);
        if (!monde.rects.some((o) => memeNiveau(o) && Math.abs(o.x - (r.x + r.w)) < 1)) ctx.fillRect(X + r.w - 2, r.y, 2, H - r.y);
        ctx.shadowBlur = 0;
      } else if (r.type === "plafond") {
        ctx.fillStyle = "#0c0424"; ctx.fillRect(X, 0, r.w, r.y + r.h);
        ctx.fillStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 10; ctx.fillRect(X, r.y + r.h - 3, r.w, 3); ctx.shadowBlur = 0;
      } else if (r.type === "rebond") {
        ctx.fillStyle = "#0c0424"; ctx.fillRect(X, r.y, r.w, r.h);
        ctx.strokeStyle = "#3dff7a"; ctx.lineWidth = 2; ctx.shadowColor = "#3dff7a"; ctx.shadowBlur = 10;
        ctx.strokeRect(X + 1, r.y + 1, r.w - 2, r.h - 2); ctx.shadowBlur = 0;
        ctx.fillStyle = "#3dff7a";
        for (let y = r.y + r.h - 22; y > r.y; y -= 24) { ctx.beginPath(); ctx.moveTo(X + 4, y + 10); ctx.lineTo(X + 10, y); ctx.lineTo(X + 16, y + 10); ctx.lineTo(X + 13, y + 10); ctx.lineTo(X + 10, y + 5); ctx.lineTo(X + 7, y + 10); ctx.fill(); }
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
    // ---- pièges animés ----
    const tj = j.t;
    monde.tombants.forEach((o) => {
      if (o.detruit || !visible(o)) return;
      const y = M.yTombant(o, j), pret = j.trig[o.id] == null && o.x - j.x < 9 * U;
      const X = versEcran(o.x) + (pret ? Math.sin(t / 25) * 2 : 0);
      ctx.fillStyle = "#0c0424"; ctx.fillRect(X, y, U, U);
      ctx.strokeStyle = "#ff8a1f"; ctx.lineWidth = 2; ctx.shadowColor = "#ff8a1f"; ctx.shadowBlur = 10; ctx.strokeRect(X + 1, y + 1, U - 2, U - 2); ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff8a1f"; ctx.fillRect(X + 8, y + 8, U - 16, U - 16);
    });
    monde.mobiles.forEach((o) => {
      if (!visible(o)) return;
      const X = versEcran(o.x), y = M.yMobile(o, tj);
      ctx.strokeStyle = "rgba(179,136,255,0.25)"; ctx.setLineDash([4, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X + o.w / 2, o.yc - o.amp); ctx.lineTo(X + o.w / 2, o.yc + o.amp + o.h); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#b388ff"; ctx.shadowColor = "#b388ff"; ctx.shadowBlur = 12; ctx.fillRect(X, y, o.w, o.h); ctx.shadowBlur = 0;
      ctx.fillStyle = "#05010f"; for (let x = 6; x < o.w - 6; x += 12) ctx.fillRect(X + x, y + 4, 6, o.h - 8);
    });
    monde.fragiles.forEach((o) => {
      if (!visible(o)) return;
      const t0 = j.trig[o.id], tau = t0 == null ? 0 : tj - t0;
      let X = versEcran(o.x), y = o.y;
      if (t0 != null && tau <= 0.3) X += Math.sin(t / 15) * 1.5;
      if (t0 != null && tau > 0.3) { y += 0.5 * 2600 * (tau - 0.3) ** 2; if (y > H) return; ctx.globalAlpha = 0.6; }
      ctx.fillStyle = "#1a0f33"; ctx.fillRect(X + 1, y, o.w - 2, o.h);
      ctx.fillStyle = "#d8f9ff"; ctx.fillRect(X + 1, y, o.w - 2, 2);
      ctx.strokeStyle = "rgba(216,249,255,0.6)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X + 8, y); ctx.lineTo(X + 14, y + o.h / 2); ctx.lineTo(X + 10, y + o.h); ctx.moveTo(X + 14, y + o.h / 2); ctx.lineTo(X + 22, y + 3); ctx.stroke();
      ctx.globalAlpha = 1;
    });
    monde.tapis.forEach((o) => {
      if (!visible(o)) return;
      const X = versEcran(o.x), c = o.dir > 0 ? "#3dff7a" : "#ff3b3b", dec = ((t / 1000) * 60 * o.dir) % 20;
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 8; ctx.fillRect(X, o.y, o.w, 3); ctx.shadowBlur = 0;
      ctx.save(); ctx.beginPath(); ctx.rect(X, o.y + 4, o.w, 10); ctx.clip();
      ctx.fillStyle = c;
      for (let x = -20 + dec; x < o.w + 20; x += 20) {
        const a = X + x;
        ctx.beginPath();
        if (o.dir > 0) { ctx.moveTo(a, o.y + 5); ctx.lineTo(a + 6, o.y + 9); ctx.lineTo(a, o.y + 13); }
        else { ctx.moveTo(a + 6, o.y + 5); ctx.lineTo(a, o.y + 9); ctx.lineTo(a + 6, o.y + 13); }
        ctx.fill();
      }
      ctx.restore();
    });
    monde.portails.forEach((o) => {
      if (!visible(o)) return;
      const X = versEcran(o.x), c = o.grav < 0 ? "#ffe14d" : "#19f0ff";
      ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 18; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t / 100);
      ctx.fillRect(X - 6, o.haut, 12, o.bas - o.haut); ctx.globalAlpha = 1;
      ctx.fillRect(X - 1, o.haut, 2, o.bas - o.haut); ctx.shadowBlur = 0;
      texte(o.grav < 0 ? "▲" : "▼", X, (o.haut + o.bas) / 2, 12, c);
    });
    monde.lasers.forEach((o) => {
      if (o.detruit || !visible(o)) return;
      const X = versEcran(o.x), on = M.laserActif(o, tj);
      ctx.fillStyle = "#ff3b3b"; ctx.fillRect(X - 3, o.y1 - 4, o.w + 6, 4); ctx.fillRect(X - 3, o.y2 - 2, o.w + 6, 4);
      if (on) {
        ctx.fillStyle = "#ff3b3b"; ctx.shadowColor = "#ff3b3b"; ctx.shadowBlur = 18; ctx.fillRect(X, o.y1, o.w, o.y2 - o.y1);
        ctx.fillStyle = "#fff"; ctx.fillRect(X + o.w / 2 - 1, o.y1, 2, o.y2 - o.y1); ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "rgba(255,59,59,0.25)";
        for (let y = o.y1; y < o.y2; y += 8) ctx.fillRect(X + o.w / 2 - 1, y, 2, 4);
      }
    });
    monde.pendules.forEach((o) => {
      if (o.detruit || Math.abs(o.x - j.x) > W + o.L) return;
      const b = M.posPendule(o, tj), X = versEcran(o.x), BX = versEcran(b.x);
      ctx.strokeStyle = "#8a7aa8"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(X, o.py); ctx.lineTo(BX, b.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 14;
      ctx.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + tj * 3, r = k % 2 ? o.r : o.r + 6; ctx.lineTo(BX + Math.cos(a) * r, b.y + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#05010f"; ctx.beginPath(); ctx.arc(BX, b.y, o.r - 6, 0, Math.PI * 2); ctx.fill();
    });
    monde.portes.forEach((o) => {
      if (o.detruit || !visible(o)) return;
      const t0 = j.trig[o.id], X = versEcran(o.x);
      const monte = t0 == null ? 0 : Math.min(1, (tj - t0) * 3);
      const bas = o.y + o.h - monte * 200;
      if (bas <= 0) return;
      ctx.fillStyle = "#0c0424"; ctx.fillRect(X, 0, o.w, bas);
      ctx.fillStyle = "#3dff7a"; ctx.shadowColor = "#3dff7a"; ctx.shadowBlur = 10;
      ctx.fillRect(X, 0, 2, bas); ctx.fillRect(X + o.w - 2, 0, 2, bas); ctx.fillRect(X, bas - 3, o.w, 3);
      for (let y = bas - 20; y > 0; y -= 20) ctx.fillRect(X, y, o.w, 2);
      ctx.shadowBlur = 0;
      const att = j.attente[o.id] || 0;
      if (t0 == null && att > 0) { ctx.fillStyle = "#3dff7a"; ctx.fillRect(X - 6, bas - 30 - att * 40, 3, att * 40); }
    });
    monde.boutons.forEach((o) => {
      if (!visible(o)) return;
      const X = versEcran(o.x), on = j.trig[o.porte] != null;
      ctx.fillStyle = on ? "#1a4d2a" : "#3dff7a"; ctx.shadowColor = "#3dff7a"; ctx.shadowBlur = on ? 0 : 12;
      ctx.fillRect(X + 4, o.y - (on ? 3 : 7), o.w - 8, on ? 3 : 7); ctx.shadowBlur = 0;
    });
    monde.bulles.forEach((o) => {
      if (!visible(o) || j.bulles.includes(o.id)) return;
      const X = versEcran(o.x), r = 12 + Math.sin(t / 150 + o.x) * 1.5;
      ctx.fillStyle = "rgba(25,240,255,0.15)"; ctx.strokeStyle = "#19f0ff"; ctx.lineWidth = 2; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(X, o.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#d8f9ff"; ctx.fillRect(X - 5, o.y - 6, 3, 3);
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
    // grappin
    liens.forEach((l) => {
      const x2 = versEcran(l.vers) + U / 2;
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 3; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 12; ctx.globalAlpha = Math.min(1, l.t * 4);
      ctx.beginPath(); ctx.moveTo(l.de, l.dy); ctx.lineTo(x2, l.vy); ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
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
    // corde du grappin
    if (j.croc) {
      const ax = versEcran(j.croc.ax), ay = j.croc.ay;
      ctx.strokeStyle = "#ffe14d"; ctx.lineWidth = 3; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(X_CUBE + U / 2, j.y + U / 2); ctx.lineTo(ax, ay); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffe14d"; ctx.fillRect(ax - 5, ay - 3, 10, 6);
      if (j.croc.air) { // pas de plafond proche : le câble remonte jusqu'en haut (ou en bas à l'envers)
        ctx.globalAlpha = 0.5; ctx.fillRect(ax - 1, j.croc.s > 0 ? 0 : ay, 2, j.croc.s > 0 ? ay : H - ay); ctx.globalAlpha = 1;
      }
    }
    // mon cube
    {
      const clignote = (j.stun > 0 || j.inv > 0) && (t / 80) % 2 < 1;
      dessinerCube(X_CUBE, j.y, j.stun > 0 ? j.rot + t / 60 : j.rot, j.boost > 0 ? "#ff8a1f" : COULEURS[maCouleur], clignote ? 0.4 : 1);
      if (j.bouclier) { ctx.strokeStyle = "#3dff7a"; ctx.lineWidth = 2; ctx.shadowColor = "#3dff7a"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(X_CUBE + U / 2, j.y + U / 2, 26, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
      if (j.lent > 0) texte("~", X_CUBE + U / 2, j.y - 12, 14, "#b388ff");
    }
    // zone sombre : seul un halo autour du cube éclaire
    {
      const cx = j.x + U / 2;
      const z = monde.sombres.find((o) => cx > o.x - 2 * U && cx < o.x + o.w + 2 * U);
      if (z) {
        const a = Math.max(0, Math.min(1, (cx - (z.x - 2 * U)) / (2 * U), (z.x + z.w + 2 * U - cx) / (2 * U)));
        const gr = ctx.createRadialGradient(X_CUBE + U / 2, j.y + U / 2, 0, X_CUBE + U / 2, j.y + U / 2, 170);
        gr.addColorStop(0, "rgba(2,0,8,0)"); gr.addColorStop(0.45, "rgba(2,0,8,0)"); gr.addColorStop(1, `rgba(2,0,8,${0.97 * a})`);
        ctx.fillStyle = gr; ctx.fillRect(-10, -10, W + 20, H + 20);
      }
    }
    // haut de l'écran : distance (solo) ou progression de la course
    if (course) {
      const L = course.longueur * U, x1 = 60, x2 = W - 60;
      ctx.fillStyle = "rgba(216,249,255,0.3)"; ctx.fillRect(x1, 18, x2 - x1, 2);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x2, 10, 3, 18);
      Object.values(autres).forEach((o) => { ctx.fillStyle = COULEURS[o.c % COULEURS.length]; ctx.fillRect(x1 + (x2 - x1) * Math.min(1, o.d / L) - 4, 14, 8, 10); });
      ctx.fillStyle = COULEURS[maCouleur]; ctx.shadowColor = COULEURS[maCouleur]; ctx.shadowBlur = 10;
      ctx.fillRect(x1 + (x2 - x1) * Math.min(1, j.x / L) - 5, 12, 10, 14); ctx.shadowBlur = 0;
      texte(temps.toFixed(1), 16, 20, 10, "#ffffff", "left");
    }
    if (etat === "compte") texte(compte > 0.5 ? String(Math.ceil(compte - 0.5)) : "GO", W / 2, H / 2 - 40, 40, "#ffe14d");
    $("#score").textContent = Math.min(LONGUEUR_COURSE, Math.floor(j.x / U)) + " / " + LONGUEUR_COURSE;
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
    else if (etat === "arrive") {
      // on continue à rouler doucement après la ligne
      M.etendre(monde, j.x + 2 * W);
      M.etape(j, monde, dt, false);
    }
    particules.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.t -= dt; });
    particules = particules.filter((p) => p.t > 0);
    rayons.forEach((r) => (r.t -= dt)); rayons = rayons.filter((r) => r.t > 0);
    liens.forEach((l) => (l.t -= dt)); liens = liens.filter((l) => l.t > 0);
    if (secousse > 0) secousse -= dt;
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
  Coop.demarrer(JEU, { surRoles: () => { if (etat === "menu" || (etat === "arrive" && mode === "solo")) menu($("#ov-titre").textContent || "NÉON DASH", $("#ov-texte").textContent); } })
    .then(demarrerReseau).catch(() => {});
  majBoutonObjet();
  menu("NÉON DASH", "");
  requestAnimationFrame(boucle);
})();
