/* ============================================================
   SPACE INVADERS
   55 envahisseurs (11 × 5) qui accélèrent à mesure qu'ils sont
   détruits, 4 boucliers qui s'abîment, une soucoupe de temps en
   temps, 3 vies. Chaque vague détruite en amène une plus basse et
   plus rapide.
   Points : 🦑 30 · 🦀 20 · 🐙 10 · soucoupe 50 à 300
   ============================================================ */
(function () {
  const JEU = "invaders";
  const W = 480, H = 540;
  const P = 3;                                   // taille d'un « pixel » des sprites
  const COLS = 11, RANGS = 5, PAS_X = 36, PAS_Y = 30;
  const Y_JOUEUR = H - 50;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  // ---------- Sprites (X = pixel allumé) ----------
  const SPRITES = {
    A: [["...XX...", "..XXXX..", ".XXXXXX.", "XX.XX.XX", "XXXXXXXX", "..X..X..", ".X.XX.X.", "X.X..X.X"],
        ["...XX...", "..XXXX..", ".XXXXXX.", "XX.XX.XX", "XXXXXXXX", ".X.XX.X.", "X......X", ".X....X."]],
    B: [["..X.....X..", "...X...X...", "..XXXXXXX..", ".XX.XXX.XX.", "XXXXXXXXXXX", "X.XXXXXXX.X", "X.X.....X.X", "...XX.XX..."],
        ["..X.....X..", "X..X...X..X", "X.XXXXXXX.X", "XXX.XXX.XXX", "XXXXXXXXXXX", ".XXXXXXXXX.", "..X.....X..", ".X.......X."]],
    C: [["....XXXX....", ".XXXXXXXXXX.", "XXXXXXXXXXXX", "XXX..XX..XXX", "XXXXXXXXXXXX", "...XX..XX...", "..XX.XX.XX..", "XX........XX"],
        ["....XXXX....", ".XXXXXXXXXX.", "XXXXXXXXXXXX", "XXX..XX..XXX", "XXXXXXXXXXXX", "..XXX..XXX..", ".XX..XX..XX.", "..XX....XX.."]],
    joueur: [[".....X.....", "....XXX....", "....XXX....", ".XXXXXXXXX.", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX"]],
    soucoupe: [[".....XXXXXX.....", "...XXXXXXXXXX...", "..XXXXXXXXXXXX..", ".XX.XX.XX.XX.XX.", "XXXXXXXXXXXXXXXX", "..XXX..XX..XXX..", "...X........X..."]],
    boum: [["X...X...X", ".X..X..X.", "..X...X..", "XX.....XX", "..X...X..", ".X..X..X.", "X...X...X"]],
  };
  const COULEURS = { A: "#ff2bd6", B: "#19f0ff", C: "#3dff7a", joueur: "#ffe14d", soucoupe: "#ff3b3b", boum: "#ffffff" };
  const POINTS = { A: 30, B: 20, C: 10 };
  const TYPE_RANG = ["A", "B", "B", "C", "C"];

  // dessin pré-calculé de chaque sprite (avec halo néon)
  const cache = {};
  function image(nom, frame, couleur) {
    const cle = nom + frame + (couleur || "");
    if (cache[cle]) return cache[cle];
    const lignes = SPRITES[nom][frame];
    const c = document.createElement("canvas");
    const m = 6;
    c.width = lignes[0].length * P + 2 * m; c.height = lignes.length * P + 2 * m;
    const x = c.getContext("2d");
    x.shadowColor = couleur || COULEURS[nom]; x.shadowBlur = 6; x.fillStyle = couleur || COULEURS[nom];
    lignes.forEach((l, j) => [...l].forEach((ch, i) => { if (ch === "X") x.fillRect(m + i * P, m + j * P, P, P); }));
    return (cache[cle] = { c, m, w: lignes[0].length * P, h: lignes.length * P });
  }
  function dessinerSprite(nom, frame, x, y, couleur) {
    const im = image(nom, frame, couleur);
    ctx.drawImage(im.c, Math.round(x - im.w / 2 - im.m), Math.round(y - im.h / 2 - im.m));
  }

  // ---------- État ----------
  let etat = "menu", score = 0, vies = 3, vague = 1;
  let envahisseurs = [], ox = 0, oy = 0, sens = 1, frame = 0, chronoPas = 0;
  let joueur = { x: W / 2 }, tir = null, tirsEnnemis = [], boucliers = [], soucoupe = null, prochaineSoucoupe = 0;
  let explosions = [], pauseMort = 0;

  function nouvellePartie() {
    score = 0; vies = 3; vague = 1;
    nouvelleVague();
    construireBoucliers();
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  function nouvelleVague() {
    envahisseurs = [];
    for (let r = 0; r < RANGS; r++) for (let c = 0; c < COLS; c++) envahisseurs.push({ r, c, type: TYPE_RANG[r], vivant: true });
    ox = 42; oy = 70 + Math.min(5, vague - 1) * 16; sens = 1; frame = 0; chronoPas = 0;
    tir = null; tirsEnnemis = []; soucoupe = null;
    prochaineSoucoupe = 12 + Math.random() * 10;
  }

  // bouclier = petits blocs de 3 px, en forme d'arche
  function construireBoucliers() {
    const forme = [
      "....XXXXXXXXXXXX....",
      "...XXXXXXXXXXXXXX...",
      "..XXXXXXXXXXXXXXXX..",
      ".XXXXXXXXXXXXXXXXXX.",
      "XXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXX",
      "XXXXXX........XXXXXX",
      "XXXXX..........XXXXX",
      "XXXX............XXXX",
    ];
    boucliers = [];
    for (let b = 0; b < 4; b++) {
      const bx = 60 + b * 110 - 30, by = Y_JOUEUR - 80;
      forme.forEach((l, j) => [...l].forEach((ch, i) => { if (ch === "X") boucliers.push({ x: bx + i * 3, y: by + j * 3, ok: true }); }));
    }
  }

  const posEnv = (e) => ({ x: ox + e.c * PAS_X, y: oy + e.r * PAS_Y });
  const vivants = () => envahisseurs.filter((e) => e.vivant);
  const delaiPas = () => {
    const n = vivants().length;
    return Math.max(0.02, (0.02 + 0.6 * (n / 55)) * Math.pow(0.88, vague - 1));
  };

  // ---------- Commandes ----------
  const touches = { g: false, d: false };
  let cibleX = null;
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu") { if (k === " " || k === "enter") { e.preventDefault(); nouvellePartie(); } return; }
    if (k === "arrowleft" || k === "q" || k === "a") { touches.g = true; cibleX = null; }
    if (k === "arrowright" || k === "d") { touches.d = true; cibleX = null; }
    if (k === " " || k === "arrowup" || k === "z" || k === "w") { e.preventDefault(); tirer(); }
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "q" || k === "a") touches.g = false;
    if (k === "arrowright" || k === "d") touches.d = false;
  });
  // au doigt / à la souris : glisser pour bouger, toucher pour tirer
  const xCanvas = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
  canvas.addEventListener("pointerdown", (e) => { cibleX = xCanvas(e); tirer(); });
  canvas.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType !== "mouse") cibleX = xCanvas(e); });
  document.querySelectorAll("[data-cmd]").forEach((b) => {
    const cmd = b.dataset.cmd;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault(); cibleX = null;
      if (cmd === "feu") tirer(); else touches[cmd] = true;
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => { if (cmd !== "feu") touches[cmd] = false; }));
  });

  function tirer() {
    if (etat !== "jeu" || tir || pauseMort > 0) return;
    tir = { x: joueur.x, y: Y_JOUEUR - 14 };
  }

  // ---------- Mise à jour ----------
  function toucheBouclier(x, y, rayon) {
    let touche = false;
    for (const b of boucliers) {
      if (b.ok && x >= b.x - rayon && x <= b.x + 3 + rayon && y >= b.y - 4 && y <= b.y + 7) {
        b.ok = false; touche = true;
        // l'impact abîme aussi un peu autour
        boucliers.forEach((v) => { if (v.ok && Math.abs(v.x - b.x) <= 3 && Math.abs(v.y - b.y) <= 3 && Math.random() < 0.5) v.ok = false; });
        break;
      }
    }
    return touche;
  }

  function mettreAJour(dt) {
    explosions.forEach((x) => (x.t -= dt));
    explosions = explosions.filter((x) => x.t > 0);
    if (pauseMort > 0) { pauseMort -= dt; return; }

    // joueur
    const v = 260;
    if (cibleX != null) joueur.x += Math.max(-v * dt * 1.6, Math.min(v * dt * 1.6, cibleX - joueur.x));
    else joueur.x += ((touches.d ? 1 : 0) - (touches.g ? 1 : 0)) * v * dt;
    joueur.x = Math.max(22, Math.min(W - 22, joueur.x));

    // envahisseurs : avancent par à-coups
    chronoPas += dt;
    if (chronoPas >= delaiPas()) {
      chronoPas = 0;
      frame ^= 1;
      const vv = vivants();
      const minX = Math.min(...vv.map((e) => posEnv(e).x)), maxX = Math.max(...vv.map((e) => posEnv(e).x));
      if ((sens > 0 && maxX + 6 > W - 22) || (sens < 0 && minX - 6 < 22)) { oy += 14; sens = -sens; }
      else ox += 6 * sens;
      // ils écrasent les boucliers qu'ils traversent
      vv.forEach((e) => { const p = posEnv(e); boucliers.forEach((b) => { if (b.ok && Math.abs(b.x - p.x) < 18 && Math.abs(b.y - p.y) < 12) b.ok = false; }); });
      if (vv.some((e) => posEnv(e).y + 12 >= Y_JOUEUR - 10)) { vies = 0; return finPartie(); }
    }

    // tir du joueur
    if (tir) {
      tir.y -= 560 * dt;
      if (tir.y < 20) tir = null;
      else if (toucheBouclier(tir.x, tir.y, 1)) tir = null;
      else {
        for (const e of envahisseurs) {
          if (!e.vivant) continue;
          const p = posEnv(e);
          if (Math.abs(tir.x - p.x) < 16 && Math.abs(tir.y - p.y) < 12) {
            e.vivant = false; tir = null;
            score += POINTS[e.type];
            explosions.push({ x: p.x, y: p.y, t: 0.25 });
            Salle.publier(score, "jeu");
            break;
          }
        }
        if (tir && soucoupe && Math.abs(tir.x - soucoupe.x) < 24 && Math.abs(tir.y - soucoupe.y) < 12) {
          const bonus = [50, 100, 150, 300][(Math.random() * 4) | 0];
          score += bonus;
          explosions.push({ x: soucoupe.x, y: soucoupe.y, t: 0.8, texte: String(bonus) });
          soucoupe = null; tir = null;
          Salle.publier(score, "jeu");
        }
      }
    }

    // tirs ennemis (depuis l'envahisseur le plus bas d'une colonne)
    const maxTirs = 2 + Math.min(3, vague);
    if (tirsEnnemis.length < maxTirs && Math.random() < dt * (0.9 + 0.25 * vague)) {
      const cols = [...new Set(vivants().map((e) => e.c))];
      if (cols.length) {
        const c = cols[(Math.random() * cols.length) | 0];
        const bas = vivants().filter((e) => e.c === c).sort((a, b) => b.r - a.r)[0];
        const p = posEnv(bas);
        tirsEnnemis.push({ x: p.x, y: p.y + 12, v: 200 + 20 * vague });
      }
    }
    tirsEnnemis.forEach((t) => (t.y += t.v * dt));
    tirsEnnemis = tirsEnnemis.filter((t) => {
      if (t.y > H) return false;
      if (toucheBouclier(t.x, t.y, 1)) return false;
      if (Math.abs(t.x - joueur.x) < 16 && t.y > Y_JOUEUR - 10 && t.y < Y_JOUEUR + 12) { toucheJoueur(); return false; }
      return true;
    });
    // tir contre tir
    if (tir) tirsEnnemis = tirsEnnemis.filter((t) => { if (tir && Math.abs(t.x - tir.x) < 5 && Math.abs(t.y - tir.y) < 10) { tir = null; return false; } return true; });

    // soucoupe
    prochaineSoucoupe -= dt;
    if (!soucoupe && prochaineSoucoupe <= 0) {
      const d = Math.random() < 0.5 ? 1 : -1;
      soucoupe = { x: d > 0 ? -30 : W + 30, y: 42, d };
      prochaineSoucoupe = 15 + Math.random() * 12;
    }
    if (soucoupe) { soucoupe.x += soucoupe.d * 110 * dt; if (soucoupe.x < -40 || soucoupe.x > W + 40) soucoupe = null; }

    if (!vivants().length) { vague++; nouvelleVague(); pauseMort = 0.8; }
  }

  function toucheJoueur() {
    vies--;
    explosions.push({ x: joueur.x, y: Y_JOUEUR, t: 1, joueur: true });
    tirsEnnemis = []; tir = null;
    if (vies <= 0) return finPartie();
    pauseMort = 1.2;
  }

  function finPartie() {
    etat = "fini";
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    setTimeout(() => {
      $("#ov-titre").textContent = "GAME OVER";
      $("#ov-texte").textContent = String(score);
      $("#ov-bouton").textContent = "Rejouer";
      $("#overlay").hidden = false;
    }, 900);
  }

  // ---------- Dessin ----------
  const etoiles = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, a: Math.random() }));
  function dessiner(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    etoiles.forEach((s) => { ctx.fillStyle = `rgba(216,249,255,${0.2 + 0.4 * Math.abs(Math.sin(t / 900 + s.a * 9))})`; ctx.fillRect(s.x, s.y, 2, 2); });

    if (etat !== "menu") {
      // boucliers
      ctx.fillStyle = "#ff8a1f"; ctx.shadowColor = "#ff8a1f"; ctx.shadowBlur = 4;
      boucliers.forEach((b) => { if (b.ok) ctx.fillRect(b.x, b.y, 3, 3); });
      ctx.shadowBlur = 0;
      // envahisseurs
      envahisseurs.forEach((e) => { if (e.vivant) { const p = posEnv(e); dessinerSprite(e.type, frame, p.x, p.y); } });
      if (soucoupe) dessinerSprite("soucoupe", 0, soucoupe.x, soucoupe.y);
      // joueur (clignote après un coup)
      if (etat === "jeu" && (pauseMort <= 0 || (t / 100) % 2 < 1)) dessinerSprite("joueur", 0, joueur.x, Y_JOUEUR);
      // tirs
      if (tir) { ctx.fillStyle = "#ffe14d"; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 8; ctx.fillRect(tir.x - 1, tir.y - 8, 3, 12); ctx.shadowBlur = 0; }
      ctx.fillStyle = "#fff";
      tirsEnnemis.forEach((s) => { const z = (t / 60 + s.x) % 2 < 1 ? 1 : -1; ctx.fillRect(s.x - 1 + z, s.y - 6, 3, 4); ctx.fillRect(s.x - 1 - z, s.y - 2, 3, 4); });
      // explosions
      explosions.forEach((x) => {
        if (x.texte) { ctx.font = "12px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#ff3b3b"; ctx.fillText(x.texte, x.x, x.y + 5); }
        else dessinerSprite("boum", 0, x.x, x.y, x.joueur ? "#ffe14d" : "#ffffff");
      });
      // sol
      ctx.fillStyle = "#3dff7a"; ctx.fillRect(0, H - 22, W, 2);
      for (let i = 0; i < vies - 1; i++) dessinerSprite("joueur", 0, 30 + i * 42, H - 10);
    }
    $("#score").textContent = score;
    $("#vies").textContent = vies;
    $("#vague").textContent = vague;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.05, (t - avant) / 1000); avant = t;
    if (etat === "jeu") mettreAJour(dt);
    else explosions.forEach((x) => (x.t -= dt));
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__invaders = { get etat() { return etat; }, get score() { return score; }, get vies() { return vies; }, get vague() { return vague; },
    get envahisseurs() { return envahisseurs; }, get joueur() { return joueur; }, tirer, nouvellePartie, toucheJoueur };

  $("#ov-bouton").addEventListener("click", nouvellePartie);
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  $("#ov-titre").textContent = "SPACE INVADERS";
  $("#ov-bouton").textContent = "Jouer";
  requestAnimationFrame(boucle);
})();
