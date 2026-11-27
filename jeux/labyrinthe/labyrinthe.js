/* ============================================================
   LABYRINTHE
   Rob le robot ramasse toutes les gommes du labyrinthe en évitant
   les 4 bugs. Une super-gomme rend les bugs vulnérables : Rob peut
   alors les manger (200, 400, 800, 1600).
   Gomme 10 · super-gomme 50 · 3 vies · chaque labyrinthe vidé
   → niveau suivant, plus rapide.

   Les 4 bugs ont chacun leur caractère :
     rouge  : fonce droit sur Rob
     rose   : vise 4 cases devant Rob pour lui couper la route
     vert   : se promène au hasard
     orange : poursuit Rob de loin, s'enfuit quand il est trop près
   Ils alternent entre « dispersion » (chacun vers son coin) et
   « poursuite ».
   ============================================================ */
(function () {
  const JEU = "labyrinthe";
  const PLAN = [
    "###################",
    "#o.......#.......o#",
    "#.###.##.#.##.###.#",
    "#.#.............#.#",
    "#.#.##.#####.##.#.#",
    "#......#...#......#",
    "###.##.#.#.#.##.###",
    "###.#.........#.###",
    "###.#.###-###.#.###",
    "    ...#GGG#...    ",
    "###.#.#######.#.###",
    "###.#....R....#.###",
    "###.#.#######.#.###",
    "#........#........#",
    "#.##.###.#.###.##.#",
    "#o.#...........#.o#",
    "##.#.#.#####.#.#.##",
    "#....#...#...#....#",
    "#.######.#.######.#",
    "#.................#",
    "###################",
  ];
  const COLS = PLAN[0].length, LIGNES = PLAN.length, T = 22;
  const LIGNE_TUNNEL = 9, PORTE = { x: 9, y: 8 }, SORTIE = { x: 9, y: 7 }, MAISON = { x: 9, y: 9 };
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  const DIRS = [{ dx: 0, dy: -1 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }]; // haut, gauche, bas, droite
  const car = (x, y) => (y >= 0 && y < LIGNES && x >= 0 && x < COLS ? PLAN[y][x] : y === LIGNE_TUNNEL ? " " : "#");
  const mur = (x, y) => car(x, y) === "#";

  // ---------- État ----------
  let etat = "menu", score = 0, vies = 3, niveau = 1;
  let gommes = new Set(), supers = new Set();
  let rob, bugs = [], pause = 0, peur = 0, combo = 0, chronoMode = 0, indexMode = 0, tempsVie = 0, mort = 0, textes = [];
  const MODES = [["dispersion", 7], ["poursuite", 20], ["dispersion", 7], ["poursuite", 20], ["dispersion", 5], ["poursuite", Infinity]];

  function remplirGommes() {
    gommes = new Set(); supers = new Set();
    PLAN.forEach((l, y) => [...l].forEach((c, x) => {
      if (c === ".") gommes.add(x + "," + y);
      if (c === "o") supers.add(x + "," + y);
    }));
  }

  const vitesseRob = () => 6.6 * (1 + 0.05 * (niveau - 1));
  const vitesseBug = () => 6.0 * (1 + 0.06 * (niveau - 1));
  const dureePeur = () => Math.max(2, 7 - (niveau - 1));

  function placer() {
    rob = { x: 9, y: 11, dx: 0, dy: 0, suivante: null, bouche: 0 };
    bugs = [
      { nom: "rouge",  couleur: "#ff3b3b", x: 9,  y: 7, dx: -1, dy: 0, etat: "normal", sortie: 0, coin: { x: 18, y: -2 } },
      { nom: "rose",   couleur: "#ff2bd6", x: 9,  y: 9, dx: 0, dy: -1, etat: "maison", sortie: 1.5, coin: { x: 0, y: -2 } },
      { nom: "vert",   couleur: "#3dff7a", x: 8,  y: 9, dx: 0, dy: -1, etat: "maison", sortie: 4.5, coin: { x: 18, y: 22 }, hasard: { x: 9, y: 13 }, chronoHasard: 0 },
      { nom: "orange", couleur: "#ff8a1f", x: 10, y: 9, dx: 0, dy: -1, etat: "maison", sortie: 7.5, coin: { x: 0, y: 22 } },
    ];
    peur = 0; combo = 0; chronoMode = 0; indexMode = 0; tempsVie = 0;
    pause = 1.2;
  }

  function nouvellePartie() {
    score = 0; vies = 3; niveau = 1;
    remplirGommes(); placer();
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  // ---------- Déplacement sur la grille ----------
  function passable(e, x, y) {
    const c = car(x, y);
    if (c === "#") return false;
    if (c === "-" || c === "G") return e !== rob && (e.etat === "sortie" || e.etat === "yeux" || e.etat === "maison");
    return true;
  }

  // avance de « dist » cases ; à chaque centre de case, decider(e) choisit la direction
  function avancer(e, dist, decider) {
    let garde = 0;
    while (dist > 1e-6 && garde++ < 12) {
      const ax = Math.round(e.x), ay = Math.round(e.y);
      if (Math.abs(e.x - ax) < 1e-6 && Math.abs(e.y - ay) < 1e-6) {
        e.x = ax; e.y = ay;
        // tunnel : on ressort de l'autre côté
        if (ay === LIGNE_TUNNEL && ax <= 0 && e.dx < 0) { e.x = COLS - 1; continue; }
        if (ay === LIGNE_TUNNEL && ax >= COLS - 1 && e.dx > 0) { e.x = 0; continue; }
        decider(e, ax, ay);
        if (!e.dx && !e.dy) return;
        if (!passable(e, ax + e.dx, ay + e.dy)) { if (e === rob) { e.dx = e.dy = 0; } return; }
        const pas = Math.min(dist, 1);
        e.x += e.dx * pas; e.y += e.dy * pas; dist -= pas;
      } else {
        const reste = e.dx > 0 ? Math.ceil(e.x) - e.x : e.dx < 0 ? e.x - Math.floor(e.x) : e.dy > 0 ? Math.ceil(e.y) - e.y : e.y - Math.floor(e.y);
        const pas = Math.min(dist, reste || 1);
        e.x += e.dx * pas; e.y += e.dy * pas; dist -= pas;
        if (Math.abs(e.x - Math.round(e.x)) < 1e-6) e.x = Math.round(e.x);
        if (Math.abs(e.y - Math.round(e.y)) < 1e-6) e.y = Math.round(e.y);
      }
    }
  }

  function deciderRob(e, x, y) {
    if (e.suivante && passable(e, x + e.suivante.dx, y + e.suivante.dy)) { e.dx = e.suivante.dx; e.dy = e.suivante.dy; }
  }

  function cible(b) {
    if (b.etat === "sortie") return SORTIE;
    if (b.etat === "yeux") return MAISON;
    const mode = MODES[indexMode][0];
    if (mode === "dispersion") return b.coin;
    const rx = Math.round(rob.x), ry = Math.round(rob.y);
    if (b.nom === "rouge") return { x: rx, y: ry };
    if (b.nom === "rose") return { x: rx + 4 * rob.dx, y: ry + 4 * rob.dy };
    if (b.nom === "vert") return b.hasard;
    if (b.nom === "orange") return Math.hypot(b.x - rx, b.y - ry) > 6 ? { x: rx, y: ry } : b.coin;
    return { x: rx, y: ry };
  }

  function deciderBug(b, x, y) {
    if (b.etat === "sortie" && x === SORTIE.x && y === SORTIE.y) { b.etat = peur > 0 && !b.dejaMange ? "peur" : "normal"; }
    if (b.etat === "yeux" && x === MAISON.x && y === MAISON.y) { b.etat = "sortie"; b.dejaMange = true; }
    const options = DIRS.filter((d) => passable(b, x + d.dx, y + d.dy) && !(d.dx === -b.dx && d.dy === -b.dy));
    // un bug « normal » ne rentre pas dans la maison
    const ok = options.filter((d) => b.etat === "sortie" || b.etat === "yeux" || !"-G".includes(car(x + d.dx, y + d.dy)));
    const choix = ok.length ? ok : DIRS.filter((d) => passable(b, x + d.dx, y + d.dy));
    if (!choix.length) return;
    let d;
    if (b.etat === "peur") d = choix[(Math.random() * choix.length) | 0];
    else {
      const c = cible(b);
      d = choix.reduce((m, o) => ((x + o.dx - c.x) ** 2 + (y + o.dy - c.y) ** 2 < (x + m.dx - c.x) ** 2 + (y + m.dy - c.y) ** 2 ? o : m));
    }
    b.dx = d.dx; b.dy = d.dy;
  }

  function vitesseDe(b) {
    if (b.etat === "yeux") return 12;
    if (b.etat === "maison") return 2;
    if (Math.round(b.y) === LIGNE_TUNNEL && (b.x < 4 || b.x > COLS - 5)) return 3;
    if (b.etat === "peur") return 3.6;
    return vitesseBug();
  }

  // ---------- Commandes ----------
  function diriger(dx, dy) {
    if (!rob) return;
    rob.suivante = { dx, dy };
    // demi-tour immédiat, même entre deux cases
    if (dx === -rob.dx && dy === -rob.dy && (dx || dy)) { rob.dx = dx; rob.dy = dy; }
    if (!rob.dx && !rob.dy) { const x = Math.round(rob.x), y = Math.round(rob.y); if (passable(rob, x + dx, y + dy)) { rob.dx = dx; rob.dy = dy; } }
  }
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu") { if (k === " " || k === "enter") { e.preventDefault(); nouvellePartie(); } return; }
    const d = { arrowup: [0, -1], z: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], q: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
    if (d) { e.preventDefault(); diriger(d[0], d[1]); }
  });
  let depart = null;
  canvas.addEventListener("pointerdown", (e) => { depart = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointermove", (e) => {
    if (!depart) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
    if (Math.hypot(dx, dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) diriger(Math.sign(dx), 0); else diriger(0, Math.sign(dy));
    depart = { x: e.clientX, y: e.clientY };
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => canvas.addEventListener(ev, () => { depart = null; }));
  document.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const [x, y] = b.dataset.dir.split(",").map(Number);
    diriger(x, y);
  }));

  // ---------- Mise à jour ----------
  function mettreAJour(dt) {
    textes.forEach((t) => (t.t -= dt));
    textes = textes.filter((t) => t.t > 0);
    if (mort > 0) {
      mort -= dt;
      if (mort <= 0) { if (vies <= 0) return finPartie(); placer(); }
      return;
    }
    if (pause > 0) { pause -= dt; return; }

    tempsVie += dt;
    // alternance dispersion / poursuite (en pause pendant la peur)
    if (peur > 0) {
      peur -= dt;
      if (peur <= 0) bugs.forEach((b) => { if (b.etat === "peur") b.etat = "normal"; });
    } else {
      chronoMode += dt;
      if (chronoMode >= MODES[indexMode][1]) {
        chronoMode = 0; indexMode = Math.min(MODES.length - 1, indexMode + 1);
        bugs.forEach((b) => { if (b.etat === "normal") { b.dx = -b.dx; b.dy = -b.dy; } });
      }
    }

    // Rob
    avancer(rob, vitesseRob() * dt, deciderRob);
    if (rob.dx || rob.dy) rob.bouche += dt * 10;
    const cle = Math.round(rob.x) + "," + Math.round(rob.y);
    if (gommes.delete(cle)) { score += 10; Salle.publier(score, "jeu"); }
    if (supers.delete(cle)) {
      score += 50; peur = dureePeur(); combo = 0;
      bugs.forEach((b) => { b.dejaMange = false; if (b.etat === "normal") { b.etat = "peur"; b.dx = -b.dx; b.dy = -b.dy; } });
      Salle.publier(score, "jeu");
    }

    // bugs
    bugs.forEach((b) => {
      if (b.etat === "maison") {
        if (tempsVie >= b.sortie) { b.etat = "sortie"; b.x = Math.round(b.x); b.y = Math.round(b.y); }
        else { b.y = 9 + Math.sin(tempsVie * 6 + b.x) * 0.25; return; }
      }
      if (b.nom === "vert") {
        b.chronoHasard -= dt;
        if (b.chronoHasard <= 0) {
          b.chronoHasard = 3;
          const libres = []; PLAN.forEach((l, y) => [...l].forEach((c, x) => { if (".o ".includes(c) && y !== LIGNE_TUNNEL) libres.push({ x, y }); }));
          b.hasard = libres[(Math.random() * libres.length) | 0];
        }
      }
      avancer(b, vitesseDe(b) * dt, deciderBug);
    });

    // collisions
    for (const b of bugs) {
      if (Math.hypot(b.x - rob.x, b.y - rob.y) > 0.6 || b.etat === "yeux" || b.etat === "maison") continue;
      if (b.etat === "peur") {
        const pts = 200 * 2 ** combo; combo = Math.min(3, combo + 1);
        score += pts; b.etat = "yeux";
        textes.push({ x: b.x, y: b.y, txt: String(pts), t: 1 });
        pause = 0.4;
        Salle.publier(score, "jeu");
      } else {
        vies--; mort = 1.6;
        Salle.publier(score, vies <= 0 ? "fini" : "jeu");
        return;
      }
    }

    if (!gommes.size && !supers.size) {
      niveau++;
      textes.push({ x: 9, y: 11, txt: "NIVEAU " + niveau, t: 1.5 });
      remplirGommes(); placer(); pause = 1.8;
    }
  }

  function finPartie() {
    etat = "fini";
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    $("#ov-titre").textContent = "GAME OVER";
    $("#ov-texte").textContent = String(score);
    $("#ov-bouton").textContent = "Rejouer";
    $("#overlay").hidden = false;
  }

  // ---------- Dessin ----------
  const P = 2; // sprites 11 × 11 pixels de 2 px
  const ROB = [
    ".....A.....",
    ".....X.....",
    "..XXXXXXX..",
    ".XXXXXXXXX.",
    ".XKKKKKKKX.",
    ".XKKKKKKKX.",
    ".XXXXXXXXX.",
    ".XXMMMMMXX.",
    ".XXXXXXXXX.",
    "..X.....X..",
    ".XX.....XX.",
  ];
  const BUG = [
    ["X...XXX...X", ".X.XXXXX.X.", "..XXXXXXX..", ".XXXXXXXXX.", "XXXXXXXXXXX", "XXXXXXXXXXX", ".XXXXXXXXX.", "..XXXXXXX..", ".X.X...X.X.", "X..X...X..X", "..X.....X.."],
    ["X...XXX...X", ".X.XXXXX.X.", "..XXXXXXX..", ".XXXXXXXXX.", "XXXXXXXXXXX", "XXXXXXXXXXX", ".XXXXXXXXX.", "..XXXXXXX..", "X..X...X..X", ".X.X...X.X.", "X.........X"],
  ];
  function pixels(lignes, cx, cy, couleurs) {
    const ox = Math.round(cx - (lignes[0].length * P) / 2), oy = Math.round(cy - (lignes.length * P) / 2);
    lignes.forEach((l, j) => [...l].forEach((c, i) => {
      const col = couleurs[c];
      if (col) { ctx.fillStyle = col; ctx.fillRect(ox + i * P, oy + j * P, P, P); }
    }));
    return { ox, oy };
  }

  function dessinerMurs() {
    ctx.fillStyle = "#0a0628";
    for (let y = 0; y < LIGNES; y++) for (let x = 0; x < COLS; x++) if (mur(x, y)) ctx.fillRect(x * T, y * T, T, T);
    ctx.strokeStyle = "#2b6bff"; ctx.lineWidth = 2; ctx.shadowColor = "#2b6bff"; ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let y = 0; y < LIGNES; y++) for (let x = 0; x < COLS; x++) {
      if (!mur(x, y)) continue;
      const X = x * T, Y = y * T;
      // un trait néon seulement sur les bords qui touchent un couloir
      const vide = (a, b) => b >= 0 && b < LIGNES && a >= 0 && a < COLS && !mur(a, b);
      if (vide(x, y - 1)) { ctx.moveTo(X, Y + 1); ctx.lineTo(X + T, Y + 1); }
      if (vide(x, y + 1)) { ctx.moveTo(X, Y + T - 1); ctx.lineTo(X + T, Y + T - 1); }
      if (vide(x - 1, y)) { ctx.moveTo(X + 1, Y); ctx.lineTo(X + 1, Y + T); }
      if (vide(x + 1, y)) { ctx.moveTo(X + T - 1, Y); ctx.lineTo(X + T - 1, Y + T); }
    }
    ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff2bd6"; ctx.fillRect(PORTE.x * T + 2, PORTE.y * T + T / 2 - 2, T - 4, 4);
  }

  function dessinerRob(t) {
    const cx = rob.x * T + T / 2, cy = rob.y * T + T / 2;
    const bouche = Math.sin(rob.bouche) > 0;
    ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 10;
    const { ox, oy } = pixels(ROB, cx, cy, { X: "#19f0ff", K: "#05010f", A: (t / 300) % 2 < 1 ? "#ffe14d" : "#ff2bd6", M: bouche ? "#05010f" : "#19f0ff" });
    ctx.shadowBlur = 0;
    // yeux qui regardent dans la direction
    const ex = rob.dx, ey = rob.dy;
    ctx.fillStyle = "#ffe14d";
    ctx.fillRect(ox + (3 + ex) * P, oy + (4 + Math.max(0, ey)) * P, P, P);
    ctx.fillRect(ox + (7 + ex) * P, oy + (4 + Math.max(0, ey)) * P, P, P);
  }

  function dessinerBug(b, t) {
    const cx = b.x * T + T / 2, cy = b.y * T + T / 2;
    const frame = ((t / 150) | 0) % 2;
    if (b.etat !== "yeux") {
      let couleur = b.couleur;
      if (b.etat === "peur") couleur = peur < 2 && (t / 200) % 2 < 1 ? "#ffffff" : "#3050ff";
      ctx.shadowColor = couleur; ctx.shadowBlur = 8;
      pixels(BUG[frame], cx, cy, { X: couleur });
      ctx.shadowBlur = 0;
    }
    // yeux
    const ox = Math.round(cx - 11), oy = Math.round(cy - 11);
    if (b.etat === "peur") {
      ctx.fillStyle = "#ffe14d";
      ctx.fillRect(ox + 3 * P, oy + 4 * P, P * 2, P); ctx.fillRect(ox + 6 * P, oy + 4 * P, P * 2, P);
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(ox + 2 * P, oy + 3 * P, P * 3, P * 3); ctx.fillRect(ox + 6 * P, oy + 3 * P, P * 3, P * 3);
      ctx.fillStyle = "#05010f";
      ctx.fillRect(ox + (3 + b.dx) * P, oy + (4 + b.dy) * P, P, P); ctx.fillRect(ox + (7 + b.dx) * P, oy + (4 + b.dy) * P, P, P);
    }
  }

  function dessiner(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    dessinerMurs();
    if (etat === "menu") return;
    ctx.fillStyle = "#ffd6f6";
    gommes.forEach((k) => { const [x, y] = k.split(",").map(Number); ctx.fillRect(x * T + T / 2 - 2, y * T + T / 2 - 2, 4, 4); });
    const r = 4 + Math.round(Math.sin(t / 150) + 1);
    ctx.fillStyle = "#ffe14d"; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 12;
    supers.forEach((k) => { const [x, y] = k.split(",").map(Number); ctx.fillRect(x * T + T / 2 - r, y * T + T / 2 - r, 2 * r, 2 * r); });
    ctx.shadowBlur = 0;

    bugs.forEach((b) => dessinerBug(b, t));
    if (mort > 0) {
      // Rob grésille avant de disparaître
      if ((t / 80) % 2 < 1 || mort > 1.2) dessinerRob(t);
      ctx.fillStyle = "#ffe14d";
      for (let i = 0; i < 6; i++) ctx.fillRect(rob.x * T + T / 2 + (Math.random() - 0.5) * 30, rob.y * T + T / 2 + (Math.random() - 0.5) * 30, 2, 2);
    } else dessinerRob(t);

    ctx.font = "10px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#19f0ff";
    textes.forEach((x) => ctx.fillText(x.txt, x.x * T + T / 2, x.y * T + T / 2 + 4));
    if (pause > 0 && mort <= 0 && !textes.length) { ctx.fillStyle = "#ffe14d"; ctx.fillText("PRÊT ?", 9 * T + T / 2, 13 * T + T / 2 + 4); }

    $("#score").textContent = score;
    $("#vies").textContent = vies;
    $("#niveau").textContent = niveau;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.04, (t - avant) / 1000); avant = t;
    if (etat === "jeu") mettreAJour(dt);
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__laby = { get etat() { return etat; }, get score() { return score; }, get vies() { return vies; }, get niveau() { return niveau; },
    get rob() { return rob; }, get bugs() { return bugs; }, get gommes() { return gommes; }, get supers() { return supers; }, get peur() { return peur; },
    diriger, nouvellePartie, passable: (x, y) => passable(rob, x, y) };

  $("#ov-bouton").addEventListener("click", nouvellePartie);
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  $("#ov-titre").textContent = "LABYRINTHE";
  $("#ov-bouton").textContent = "Jouer";
  requestAnimationFrame(boucle);
})();
