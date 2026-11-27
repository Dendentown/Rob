/* ============================================================
   TETRIS
   Grille 10 × 20, 7 pièces (tirage « par sac » : les 7 pièces
   sortent une fois chacune dans un ordre au hasard), pièce fantôme,
   pièce suivante, niveaux.

   Vitesse de chute : 800 ms × 0,85^(niveau − 1)  (minimum 50 ms)
   Niveau : 1 + lignes ÷ 10
   Points : 1 ligne 100, 2 lignes 300, 3 lignes 500, TETRIS 800 (× niveau)
            + 1 par case en chute rapide, + 2 par case en chute directe
   ============================================================ */
(function () {
  const JEU = "tetris";
  const COLS = 10, LIGNES = 20, T = 28;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const suivCanvas = document.querySelector("#suivante");
  const sctx = suivCanvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  const PIECES = {
    I: { c: "#19f0ff", f: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { c: "#ffe14d", f: [[1, 0], [2, 0], [1, 1], [2, 1]] },
    T: { c: "#b388ff", f: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { c: "#3dff7a", f: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { c: "#ff3b3b", f: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { c: "#4d7cff", f: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { c: "#ff8a1f", f: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  };
  const TAILLE = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };

  let grille, piece, suivante, sac = [], score, lignes, niveau, etat = "menu", chrono = 0, pause = false;

  const tirer = () => {
    if (!sac.length) sac = Object.keys(PIECES).sort(() => Math.random() - 0.5);
    return sac.pop();
  };
  const nouvellePiece = (type) => ({ type, cases: PIECES[type].f.map(([x, y]) => [x, y]), x: 3, y: type === "I" ? -1 : 0 });

  function tourner(p, sens) {
    const n = TAILLE[p.type];
    if (p.type === "O") return p.cases;
    return p.cases.map(([x, y]) => (sens > 0 ? [n - 1 - y, x] : [y, n - 1 - x]));
  }
  const libre = (cases, x, y) => cases.every(([cx, cy]) => {
    const gx = cx + x, gy = cy + y;
    return gx >= 0 && gx < COLS && gy < LIGNES && (gy < 0 || !grille[gy][gx]);
  });

  function nouvellePartie() {
    grille = Array.from({ length: LIGNES }, () => Array(COLS).fill(null));
    sac = []; score = 0; lignes = 0; niveau = 1; chrono = 0; pause = false;
    suivante = tirer();
    apparaitre();
    etat = "jeu";
    cacherOverlay();
    Salle.publier(0, "jeu", true);
  }

  function apparaitre() {
    piece = nouvellePiece(suivante);
    suivante = tirer();
    if (!libre(piece.cases, piece.x, piece.y)) finPartie();
  }

  const delaiChute = () => Math.max(50, 800 * Math.pow(0.85, niveau - 1));

  function deplacer(dx) { if (etat === "jeu" && !pause && libre(piece.cases, piece.x + dx, piece.y)) piece.x += dx; }
  function rotation(sens) {
    if (etat !== "jeu" || pause) return;
    const c = tourner(piece, sens);
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
      if (libre(c, piece.x + dx, piece.y + dy)) { piece.cases = c; piece.x += dx; piece.y += dy; return; }
    }
  }
  function descendre(manuel) {
    if (etat !== "jeu" || pause) return false;
    if (libre(piece.cases, piece.x, piece.y + 1)) {
      piece.y++;
      if (manuel) score += 1;
      return true;
    }
    poser();
    return false;
  }
  function chuteDirecte() {
    if (etat !== "jeu" || pause) return;
    let n = 0;
    while (libre(piece.cases, piece.x, piece.y + 1)) { piece.y++; n++; }
    score += 2 * n;
    poser();
  }

  function poser() {
    for (const [cx, cy] of piece.cases) {
      const gy = cy + piece.y;
      if (gy < 0) { finPartie(); return; }
      grille[gy][cx + piece.x] = PIECES[piece.type].c;
    }
    let n = 0;
    for (let y = LIGNES - 1; y >= 0; y--) {
      if (grille[y].every(Boolean)) { grille.splice(y, 1); grille.unshift(Array(COLS).fill(null)); n++; y++; }
    }
    if (n) {
      score += [0, 100, 300, 500, 800][n] * niveau;
      lignes += n;
      niveau = 1 + Math.floor(lignes / 10);
      if (n === 4) flash = 0.4;
    }
    chrono = 0;
    apparaitre();
    Salle.publier(score, etat === "fini" ? "fini" : "jeu");
  }

  function finPartie() {
    etat = "fini";
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    afficherOverlay("GAME OVER", String(score), "Rejouer");
  }

  // ---------- Commandes ----------
  addEventListener("keydown", (e) => {
    if (etat !== "jeu") {
      if ((e.key === " " || e.key === "Enter") && etat !== "jeu") { e.preventDefault(); nouvellePartie(); }
      return;
    }
    const k = e.key.toLowerCase();
    const actions = {
      arrowleft: () => deplacer(-1), q: () => deplacer(-1),
      arrowright: () => deplacer(1), d: () => deplacer(1),
      arrowup: () => rotation(1), x: () => rotation(1), w: () => rotation(-1), z: () => rotation(1),
      arrowdown: () => descendre(true), s: () => descendre(true),
      " ": () => chuteDirecte(),
      p: () => { pause = !pause; if (pause) afficherOverlay("PAUSE", ""); else cacherOverlay(); },
    };
    if (actions[k]) { e.preventDefault(); actions[k](); }
  });

  // boutons tactiles (répétition si on laisse le doigt appuyé)
  document.querySelectorAll("[data-cmd]").forEach((b) => {
    let rep = null;
    const faire = () => ({ gauche: () => deplacer(-1), droite: () => deplacer(1), tourner: () => rotation(1), bas: () => descendre(true), chute: chuteDirecte })[b.dataset.cmd]();
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault(); faire();
      if (b.dataset.cmd !== "tourner" && b.dataset.cmd !== "chute") rep = setInterval(faire, 110);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => clearInterval(rep)));
  });

  // ---------- Dessin ----------
  let flash = 0;
  function bloc(c, x, y, couleur, t, fantome) {
    if (fantome) {
      c.strokeStyle = couleur; c.globalAlpha = 0.35; c.lineWidth = 2;
      c.strokeRect(x * t + 3, y * t + 3, t - 6, t - 6); c.globalAlpha = 1;
      return;
    }
    c.fillStyle = couleur;
    c.shadowColor = couleur; c.shadowBlur = 10;
    c.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
    c.shadowBlur = 0;
    c.fillStyle = "rgba(255,255,255,0.35)";
    c.fillRect(x * t + 3, y * t + 3, t - 8, 4);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.fillRect(x * t + 3, y * t + t - 6, t - 6, 3);
  }

  function dessiner() {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(25, 240, 255, 0.06)";
    for (let x = 1; x < COLS; x++) ctx.fillRect(x * T, 0, 1, LIGNES * T);
    for (let y = 1; y < LIGNES; y++) ctx.fillRect(0, y * T, COLS * T, 1);
    if (!grille) return;
    grille.forEach((ligne, y) => ligne.forEach((c, x) => { if (c) bloc(ctx, x, y, c, T); }));
    if (piece && etat === "jeu") {
      let gy = piece.y;
      while (libre(piece.cases, piece.x, gy + 1)) gy++;
      piece.cases.forEach(([cx, cy]) => { if (cy + gy >= 0) bloc(ctx, cx + piece.x, cy + gy, PIECES[piece.type].c, T, true); });
      piece.cases.forEach(([cx, cy]) => { if (cy + piece.y >= 0) bloc(ctx, cx + piece.x, cy + piece.y, PIECES[piece.type].c, T); });
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    // pièce suivante
    sctx.fillStyle = "#000"; sctx.fillRect(0, 0, suivCanvas.width, suivCanvas.height);
    if (suivante) {
      const p = PIECES[suivante], t = 22;
      const xs = p.f.map((c) => c[0]), ys = p.f.map((c) => c[1]);
      const ox = (suivCanvas.width / t - (Math.max(...xs) - Math.min(...xs) + 1)) / 2 - Math.min(...xs);
      const oy = (suivCanvas.height / t - (Math.max(...ys) - Math.min(...ys) + 1)) / 2 - Math.min(...ys);
      p.f.forEach(([x, y]) => bloc(sctx, x + ox, y + oy, p.c, t));
    }
    $("#score").textContent = score || 0;
    $("#lignes").textContent = lignes || 0;
    $("#niveau").textContent = niveau || 1;
  }

  // ---------- Overlay ----------
  function afficherOverlay(titre, texte, bouton) {
    $("#ov-titre").textContent = titre;
    $("#ov-texte").textContent = texte || "";
    const b = $("#ov-bouton");
    b.hidden = !bouton; b.textContent = bouton || "";
    $("#overlay").hidden = false;
  }
  function cacherOverlay() { $("#overlay").hidden = true; }
  $("#ov-bouton").addEventListener("click", nouvellePartie);

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(100, t - avant); avant = t;
    if (etat === "jeu" && !pause) {
      chrono += dt;
      if (chrono >= delaiChute()) { chrono = 0; descendre(false); }
    }
    if (flash > 0) flash = Math.max(0, flash - dt / 600);
    dessiner();
    requestAnimationFrame(boucle);
  }

  window.__tetris = { get grille() { return grille; }, get piece() { return piece; }, get etat() { return etat; }, get score() { return score; }, get lignes() { return lignes; }, chuteDirecte, deplacer, rotation, nouvellePartie };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  afficherOverlay("TETRIS", "", "Jouer");
  requestAnimationFrame(boucle);
})();
