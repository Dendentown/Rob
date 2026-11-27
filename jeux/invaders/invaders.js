/* ============================================================
   SPACE INVADERS
   Des niveaux en cycle de 5, de plus en plus durs à chaque tour :
     1 formation pleine   2 formation en V   3 damier (+ blindés)
     4 forteresse (sans boucliers, + blindés)   5 BOSS (vaisseau-mère)
   À chaque tour du cycle : formations plus rapides, plus de rangées
   blindées (2 coups), boss plus résistant.
   Points : rang du haut 30 · milieu 20 · bas 10 · blindé 40 ·
            soucoupe 50 à 300 · boss 1000 × tour

   BONUS (capsules lâchées par les envahisseurs détruits, à attraper) :
     R rafale (3 tirs à la fois)   T triple (tir en éventail)
     P perçant (traverse)          B bouclier (encaisse un coup)
     V vie +1                      X bombe (efface les tirs ennemis,
                                     détruit des envahisseurs)

   SOLO : 1 vaisseau, 3 vies.
   COOP (lobby, hôte ★ + partenaire) : 2 vaisseaux (jaune = hôte,
   cyan = partenaire), chacun ses tirs et ses bonus, 5 vies partagées,
   score d'équipe. L'hôte calcule ; le partenaire envoie ses commandes.
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

  // ---------- Sprites (X = pixel allumé, O = blanc) ----------
  const SPRITES = {
    // créatures originales : un œil, un vaisseau-losange, une méduse à antennes
    A: [["...XXXX...", ".XXXXXXXX.", "XXX....XXX", "XX..XX..XX", "XX..XX..XX", "XXX....XXX", ".XXXXXXXX.", "X.X.XX.X.X"],
        ["...XXXX...", ".XXXXXXXX.", "XXX....XXX", "XX.XX...XX", "XX.XX...XX", "XXX....XXX", ".XXXXXXXX.", ".X.X..X.X."]],
    B: [["....XX....", "...XXXX...", "..XX..XX..", ".XXXXXXXX.", "XX.X..X.XX", "XXXXXXXXXX", "..X.XX.X..", ".X......X."],
        ["....XX....", "...XXXX...", "..XX..XX..", ".XXXXXXXX.", "XX..XX..XX", "XXXXXXXXXX", "..X.XX.X..", "X........X"]],
    C: [["X........X", ".X......X.", "..XXXXXX..", ".XXXXXXXX.", "XX.XXXX.XX", "XXXXXXXXXX", ".XX.XX.XX.", "XX......XX"],
        [".X......X.", ".X......X.", "..XXXXXX..", ".XXXXXXXX.", "XXX.XX.XXX", "XXXXXXXXXX", ".XX.XX.XX.", "..XX..XX.."]],
    joueur: [[".....X.....", "....XXX....", "....XXX....", ".XXXXXXXXX.", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX"]],
    soucoupe: [[".....XXXXXX.....", "...XXXXXXXXXX...", "..XXXXXXXXXXXX..", ".XX.XX.XX.XX.XX.", "XXXXXXXXXXXXXXXX", "..XXX..XX..XXX..", "...X........X..."]],
    boss: [[
      "........XXXXXXXX........",
      ".....XXXXXXXXXXXXXX.....",
      "...XXXXXXXXXXXXXXXXXX...",
      "..XXX.XXX.XXXX.XXX.XXX..",
      ".XXXXXXXXXXXXXXXXXXXXXX.",
      "XXXXXXXXXXXXXXXXXXXXXXXX",
      "XX..XXXOOXXXXXXOOXXX..XX",
      "XX..XXXOOXXXXXXOOXXX..XX",
      ".XXXXXXXXXXXXXXXXXXXXXX.",
      "...XX..XX......XX..XX...",
      "..XX....XX....XX....XX..",
    ]],
    boum: [["X...X...X", ".X..X..X.", "..X...X..", "XX.....XX", "..X...X..", ".X..X..X.", "X...X...X"]],
  };
  const COULEURS = { A: "#ff2bd6", B: "#19f0ff", C: "#3dff7a", joueur: "#ffe14d", soucoupe: "#ff3b3b", boss: "#b388ff", boum: "#ffffff" };
  const BLINDE = "#d8e2ff";
  const POINTS = { A: 30, B: 20, C: 10 };
  const TYPE_RANG = ["A", "B", "B", "C", "C"];

  // dessin pré-calculé de chaque sprite (avec halo néon)
  const cache = {};
  function image(nom, frame, couleur, p) {
    p = p || P;
    const cle = nom + frame + (couleur || "") + p;
    if (cache[cle]) return cache[cle];
    const lignes = SPRITES[nom][frame];
    const c = document.createElement("canvas");
    const m = 8;
    c.width = lignes[0].length * p + 2 * m; c.height = lignes.length * p + 2 * m;
    const x = c.getContext("2d");
    const col = couleur || COULEURS[nom];
    x.shadowColor = col; x.shadowBlur = 6;
    lignes.forEach((l, j) => [...l].forEach((ch, i) => {
      if (ch === "X" || ch === "O") { x.fillStyle = ch === "O" ? "#ffffff" : col; x.fillRect(m + i * p, m + j * p, p, p); }
    }));
    return (cache[cle] = { c, m, w: lignes[0].length * p, h: lignes.length * p });
  }
  function dessinerSprite(nom, frame, x, y, couleur, p) {
    const im = image(nom, frame, couleur, p);
    ctx.drawImage(im.c, Math.round(x - im.w / 2 - im.m), Math.round(y - im.h / 2 - im.m));
  }

  // ---------- Niveaux ----------
  const MOTIFS = [
    { f: ["XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX", "XXXXXXXXXXX"], blindes: 0, boucliers: true },
    { f: ["X.........X", "XX.......XX", ".XX.....XX.", "..XX...XX..", "...XXXXX..."], blindes: 0, boucliers: true },
    { f: ["X.X.X.X.X.X", ".X.X.X.X.X.", "X.X.X.X.X.X", ".X.X.X.X.X.", "X.X.X.X.X.X"], blindes: 1, boucliers: true },
    { f: ["XXXX...XXXX", "XXXX...XXXX", "XX..XXX..XX", "XX..XXX..XX", "XXXXXXXXXXX"], blindes: 2, boucliers: false },
    { boss: true, boucliers: true },
  ];
  const motif = (n) => MOTIFS[(n - 1) % MOTIFS.length];
  const tour = (n) => Math.floor((n - 1) / MOTIFS.length); // 0 au premier cycle, 1 au deuxième…

  // ---------- Bonus ----------
  const BONUS = {
    R: { couleur: "#ffe14d", poids: 25, duree: 10 },
    T: { couleur: "#19f0ff", poids: 20, duree: 10 },
    P: { couleur: "#ff2bd6", poids: 15, duree: 8 },
    B: { couleur: "#3dff7a", poids: 20 },
    V: { couleur: "#ff3b3b", poids: 8 },
    X: { couleur: "#ff8a1f", poids: 12 },
  };
  const TYPES_BONUS = Object.keys(BONUS);
  function bonusAuHasard() {
    let r = Math.random() * TYPES_BONUS.reduce((s, k) => s + BONUS[k].poids, 0);
    for (const k of TYPES_BONUS) { r -= BONUS[k].poids; if (r <= 0) return k; }
    return "R";
  }

  // ---------- État ----------
  // mode : "menu" | "solo" | "coop" (hôte, je calcule) | "vue" (partenaire, j'affiche l'état reçu)
  let mode = "menu", etat = "menu", score = 0, vies = 3, niveau = 1, partie = 0;
  let envahisseurs = [], nDepart = 55, ox = 0, oy = 0, sens = 1, frame = 0, chronoPas = 0;
  let vaisseaux = [], tirsEnnemis = [], boucliers = [], soucoupe = null, prochaineSoucoupe = 0;
  let apresBoss = 0, boss = null, capsules = [], explosions = [], pauseNiveau = 0, banniere = null, tirsP2 = 0, mesTirs = 0;
  const COUL_VAISSEAU = ["#ffe14d", "#19f0ff"];

  const nouveauVaisseau = (x) => ({ x, tirs: [], pause: 0, bouclier: false, R: 0, T: 0, P: 0 });

  function nouvellePartie(coop) {
    mode = coop ? "coop" : "solo";
    score = 0; vies = coop ? 5 : 3; niveau = 1; partie = Date.now();
    vaisseaux = coop ? [nouveauVaisseau(W / 3), nouveauVaisseau((2 * W) / 3)] : [nouveauVaisseau(W / 2)];
    monX = vaisseaux[0].x;
    tirsP2 = (Coop.entree() || {}).feu || 0;
    nouveauNiveau();
    cibleX = null;
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  function nouveauNiveau() {
    const m = motif(niveau), k = tour(niveau);
    envahisseurs = [];
    // toujours 55 cases (11 × 5) ; celles hors du motif sont vides
    for (let r = 0; r < RANGS; r++) for (let c = 0; c < COLS; c++) {
      const present = !m.boss && m.f[r][c] === "X";
      const blinde = present && r < Math.min(RANGS, m.blindes + k);
      envahisseurs.push({ r, c, type: TYPE_RANG[r], vivant: present, pv: blinde ? 2 : 1, blinde });
    }
    nDepart = Math.max(1, envahisseurs.filter((e) => e.vivant).length);
    ox = 42; oy = 70 + Math.min(4, k) * 14; sens = 1; frame = 0; chronoPas = 0;
    vaisseaux.forEach((v) => (v.tirs = []));
    tirsEnnemis = []; soucoupe = null; capsules = [];
    prochaineSoucoupe = 12 + Math.random() * 10;
    apresBoss = 0;
    boss = m.boss ? { x: W / 2, y: 100, pv: 30 + 20 * k, pvMax: 30 + 20 * k, dir: 1, cd: 2, salve: 0, flash: 0 } : null;
    if (m.boucliers) construireBoucliers(); else boucliers = [];
    bouclierChange = true;
    pauseNiveau = 1.6;
    banniere = { txt: m.boss ? "BOSS" : "NIVEAU " + niveau, t: 1.6 };
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
    return Math.max(0.02, (0.02 + 0.6 * (n / nDepart)) * Math.pow(0.9, niveau - 1));
  };

  // ---------- Commandes ----------
  const touches = { g: false, d: false };
  let cibleX = null, monX = W / 2, appuiFeu = false;
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu") { if ((k === " " || k === "enter") && Coop.role !== "hote" && mode !== "vue") { e.preventDefault(); nouvellePartie(false); } return; }
    if (k === "arrowleft" || k === "q" || k === "a") { touches.g = true; cibleX = null; }
    if (k === "arrowright" || k === "d") { touches.d = true; cibleX = null; }
    if (k === " " || k === "arrowup" || k === "z" || k === "w") { e.preventDefault(); feu(); }
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "q" || k === "a") touches.g = false;
    if (k === "arrowright" || k === "d") touches.d = false;
  });
  // au doigt / à la souris : glisser pour bouger, toucher pour tirer
  const xCanvas = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
  canvas.addEventListener("pointerdown", (e) => { cibleX = xCanvas(e); feu(); appuiFeu = true; });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => canvas.addEventListener(ev, () => { appuiFeu = false; }));
  canvas.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType !== "mouse") cibleX = xCanvas(e); });
  document.querySelectorAll("[data-cmd]").forEach((b) => {
    const cmd = b.dataset.cmd;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault(); cibleX = null;
      if (cmd === "feu") { feu(); appuiFeu = true; } else touches[cmd] = true;
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => { if (cmd !== "feu") touches[cmd] = false; else appuiFeu = false; }));
  });
  // tir automatique tant qu'on garde le doigt / Espace : on retire dès que c'est possible
  addEventListener("keydown", (e) => { if (e.key === " ") appuiFeu = true; });
  addEventListener("keyup", (e) => { if (e.key === " ") appuiFeu = false; });

  function feu() {
    if (mode === "vue") { mesTirs++; return; }
    tirer(0);
  }
  function tirer(i) {
    const v = vaisseaux[i];
    if (etat !== "jeu" || !v || v.pause > 0 || pauseNiveau > 0) return;
    const max = v.R > 0 ? 3 : 1;
    if (v.tirs.length >= max) return;
    const vit = v.R > 0 ? 640 : 560;
    if (v.T > 0) {
      if (v.tirs.length) return; // l'éventail part d'un coup
      [-150, 0, 150].forEach((vx) => v.tirs.push({ x: v.x, y: Y_JOUEUR - 14, vx, vy: -vit, perce: v.P > 0, touches: [] }));
    } else v.tirs.push({ x: v.x, y: Y_JOUEUR - 14, vx: 0, vy: -vit, perce: v.P > 0, touches: [] });
  }

  function bougerMonVaisseau(dt) {
    const v = 260;
    if (cibleX != null) monX += Math.max(-v * dt * 1.6, Math.min(v * dt * 1.6, cibleX - monX));
    else monX += ((touches.d ? 1 : 0) - (touches.g ? 1 : 0)) * v * dt;
    monX = Math.max(22, Math.min(W - 22, monX));
  }

  // ---------- Simulation (solo, ou hôte en coop) ----------
  let bouclierChange = false;
  function toucheBouclier(x, y, rayon) {
    let touche = false;
    for (const b of boucliers) {
      if (b.ok && x >= b.x - rayon && x <= b.x + 3 + rayon && y >= b.y - 4 && y <= b.y + 7) {
        b.ok = false; touche = true;
        boucliers.forEach((v) => { if (v.ok && Math.abs(v.x - b.x) <= 3 && Math.abs(v.y - b.y) <= 3 && Math.random() < 0.5) v.ok = false; });
        break;
      }
    }
    if (touche) bouclierChange = true;
    return touche;
  }

  function lacherBonus(x, y, chance) {
    if (Math.random() < chance) capsules.push({ x, y, type: bonusAuHasard() });
  }

  function detruire(e) {
    const p = posEnv(e);
    e.vivant = false;
    score += e.blinde ? 40 : POINTS[e.type];
    explosions.push({ x: p.x, y: p.y, t: 0.25 });
    lacherBonus(p.x, p.y, e.blinde ? 0.22 : 0.1);
  }

  function prendreBonus(v, type) {
    explosions.push({ x: v.x, y: Y_JOUEUR - 30, t: 0.7, texte: type, couleur: BONUS[type].couleur });
    if (BONUS[type].duree) v[type] = BONUS[type].duree;
    if (type === "B") v.bouclier = true;
    if (type === "V") vies = Math.min(9, vies + 1);
    if (type === "X") {
      tirsEnnemis = [];
      const cibles = vivants().sort(() => Math.random() - 0.5).slice(0, 6);
      cibles.forEach((e) => { e.pv = 1; e.blinde = false; detruire(e); });
      if (boss) { boss.pv -= 6; boss.flash = 0.2; }
    }
    Salle.publier(score, "jeu");
  }

  function mettreAJour(dt) {
    explosions.forEach((x) => (x.t -= dt));
    explosions = explosions.filter((x) => x.t > 0);
    if (banniere) { banniere.t -= dt; if (banniere.t <= 0) banniere = null; }

    // vaisseaux (on peut bouger pendant l'annonce du niveau)
    bougerMonVaisseau(dt);
    vaisseaux[0].x = monX;
    if (mode === "coop") {
      const e = Coop.entree(), v2 = vaisseaux[1];
      if (e && Coop.partenairePresent()) v2.x += Math.max(-420 * dt, Math.min(420 * dt, e.x - v2.x));
      if (e && e.feu > tirsP2) { tirsP2 = e.feu; tirer(1); }
    }
    vaisseaux.forEach((v) => { if (v.pause > 0) v.pause -= dt; ["R", "T", "P"].forEach((k) => { if (v[k] > 0) v[k] -= dt; }); });
    if (appuiFeu) tirer(0);
    if (pauseNiveau > 0) { pauseNiveau -= dt; return; }

    // envahisseurs : avancent par à-coups
    const vv = vivants();
    if (vv.length) {
      chronoPas += dt;
      if (chronoPas >= delaiPas()) {
        chronoPas = 0;
        frame ^= 1;
        const minX = Math.min(...vv.map((e) => posEnv(e).x)), maxX = Math.max(...vv.map((e) => posEnv(e).x));
        if ((sens > 0 && maxX + 6 > W - 22) || (sens < 0 && minX - 6 < 22)) { oy += 14; sens = -sens; }
        else ox += 6 * sens;
        vv.forEach((e) => { const p = posEnv(e); boucliers.forEach((b) => { if (b.ok && Math.abs(b.x - p.x) < 18 && Math.abs(b.y - p.y) < 12) { b.ok = false; bouclierChange = true; } }); });
        if (vv.some((e) => posEnv(e).y + 12 >= Y_JOUEUR - 10)) { vies = 0; return finPartie(); }
      }
    }

    // boss
    if (boss) {
      const rage = 1 + (1 - boss.pv / boss.pvMax); // plus il est abîmé, plus il est rapide
      boss.x += boss.dir * 70 * rage * dt;
      if (boss.x > W - 70) boss.dir = -1;
      if (boss.x < 70) boss.dir = 1;
      if (boss.flash > 0) boss.flash -= dt;
      boss.cd -= dt;
      if (boss.cd <= 0) {
        boss.cd = Math.max(0.5, 1.4 - 0.1 * tour(niveau)) / rage;
        boss.salve++;
        const vit = 210 + 20 * tour(niveau);
        if (boss.salve % 3 === 0) {
          // tir visé sur un vaisseau
          const cible = vaisseaux[(Math.random() * vaisseaux.length) | 0];
          const dx = cible.x - boss.x, dy = Y_JOUEUR - (boss.y + 24), l = Math.hypot(dx, dy);
          tirsEnnemis.push({ x: boss.x, y: boss.y + 24, vx: (dx / l) * vit, v: (dy / l) * vit });
        } else [-0.35, 0, 0.35].forEach((a) => tirsEnnemis.push({ x: boss.x, y: boss.y + 24, vx: Math.sin(a) * vit, v: Math.cos(a) * vit }));
      }
    }

    // tirs des vaisseaux
    for (const v of vaisseaux) {
      v.tirs = v.tirs.filter((tir) => {
        tir.x += tir.vx * dt; tir.y += tir.vy * dt;
        if (tir.y < 20 || tir.x < 0 || tir.x > W) return false;
        if (toucheBouclier(tir.x, tir.y, 1)) return false;
        for (const e of envahisseurs) {
          if (!e.vivant || tir.touches.includes(e)) continue;
          const p = posEnv(e);
          if (Math.abs(tir.x - p.x) < 16 && Math.abs(tir.y - p.y) < 12) {
            tir.touches.push(e);
            e.pv--;
            if (e.pv <= 0) { e.blinde = e.blinde || false; detruire(e); }
            else { e.blinde = true; explosions.push({ x: p.x, y: p.y, t: 0.1 }); }
            Salle.publier(score, "jeu");
            if (!tir.perce) return false;
          }
        }
        if (boss && Math.abs(tir.x - boss.x) < 48 && Math.abs(tir.y - boss.y) < 22) {
          boss.pv--; boss.flash = 0.08;
          if (boss.pv <= 0) bossVaincu();
          return false;
        }
        if (soucoupe && Math.abs(tir.x - soucoupe.x) < 24 && Math.abs(tir.y - soucoupe.y) < 12) {
          const bonus = [50, 100, 150, 300][(Math.random() * 4) | 0];
          score += bonus;
          explosions.push({ x: soucoupe.x, y: soucoupe.y, t: 0.8, texte: String(bonus), couleur: "#ff3b3b" });
          lacherBonus(soucoupe.x, soucoupe.y, 1);
          soucoupe = null;
          Salle.publier(score, "jeu");
          return false;
        }
        return true;
      });
    }

    // tirs ennemis (depuis l'envahisseur le plus bas d'une colonne)
    const maxTirs = 2 + Math.min(3, niveau) + (vaisseaux.length - 1);
    if (vv.length && tirsEnnemis.length < maxTirs && Math.random() < dt * (0.9 + 0.25 * niveau) * vaisseaux.length) {
      const cols = [...new Set(vv.map((e) => e.c))];
      const c = cols[(Math.random() * cols.length) | 0];
      const bas = vv.filter((e) => e.c === c).sort((a, b) => b.r - a.r)[0];
      const p = posEnv(bas);
      tirsEnnemis.push({ x: p.x, y: p.y + 12, vx: 0, v: 200 + 15 * niveau });
    }
    tirsEnnemis.forEach((t) => { t.y += t.v * dt; t.x += (t.vx || 0) * dt; });
    tirsEnnemis = tirsEnnemis.filter((t) => {
      if (t.y > H || t.x < -10 || t.x > W + 10) return false;
      if (toucheBouclier(t.x, t.y, 1)) return false;
      for (const v of vaisseaux) {
        if (v.pause <= 0 && Math.abs(t.x - v.x) < 16 && t.y > Y_JOUEUR - 10 && t.y < Y_JOUEUR + 12) { toucheVaisseau(v); return false; }
      }
      return true;
    });
    if (etat !== "jeu") return;
    // tir contre tir
    for (const v of vaisseaux) {
      v.tirs = v.tirs.filter((tir) => {
        const i = tirsEnnemis.findIndex((t) => Math.abs(t.x - tir.x) < 5 && Math.abs(t.y - tir.y) < 10);
        if (i < 0) return true;
        tirsEnnemis.splice(i, 1);
        return false;
      });
    }

    // capsules de bonus
    capsules.forEach((c) => (c.y += 110 * dt));
    capsules = capsules.filter((c) => {
      if (c.y > H) return false;
      for (const v of vaisseaux) {
        if (v.pause <= 0 && Math.abs(c.x - v.x) < 22 && Math.abs(c.y - Y_JOUEUR) < 16) { prendreBonus(v, c.type); return false; }
      }
      return true;
    });

    // soucoupe (pas pendant le boss)
    prochaineSoucoupe -= dt;
    if (!soucoupe && !boss && prochaineSoucoupe <= 0) {
      const d = Math.random() < 0.5 ? 1 : -1;
      soucoupe = { x: d > 0 ? -30 : W + 30, y: 42, d };
      prochaineSoucoupe = 15 + Math.random() * 12;
    }
    if (soucoupe) { soucoupe.x += soucoupe.d * 110 * dt; if (soucoupe.x < -40 || soucoupe.x > W + 40) soucoupe = null; }

    if (apresBoss > 0) { apresBoss -= dt; if (apresBoss <= 0) { niveau++; nouveauNiveau(); } }
    else if (!vivants().length && !boss) { niveau++; nouveauNiveau(); }
  }

  function bossVaincu() {
    score += 1000 * (tour(niveau) + 1);
    for (let i = 0; i < 8; i++) explosions.push({ x: boss.x + (Math.random() - 0.5) * 90, y: boss.y + (Math.random() - 0.5) * 40, t: 0.4 + Math.random() * 0.6 });
    explosions.push({ x: boss.x, y: boss.y - 30, t: 1.2, texte: String(1000 * (tour(niveau) + 1)), couleur: "#b388ff" });
    lacherBonus(boss.x - 30, boss.y, 1); lacherBonus(boss.x + 30, boss.y, 1);
    boss = null; tirsEnnemis = [];
    Salle.publier(score, "jeu");
    // le niveau suivant démarre quand les capsules sont tombées
    apresBoss = 3.5; // le temps d'attraper les capsules
  }

  function toucheVaisseau(v) {
    if (v.bouclier) { v.bouclier = false; v.pause = 0.6; explosions.push({ x: v.x, y: Y_JOUEUR, t: 0.3 }); return; }
    vies--;
    explosions.push({ x: v.x, y: Y_JOUEUR, t: 1, joueur: true });
    v.tirs = []; v.pause = 1.2; v.R = v.T = v.P = 0;
    if (vaisseaux.length === 1) tirsEnnemis = [];
    if (vies <= 0) finPartie();
  }
  const toucheJoueur = () => toucheVaisseau(vaisseaux[0]); // pour les tests

  function finPartie() {
    etat = "fini";
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    if (mode === "coop") envoyer(true);
    setTimeout(() => menu("GAME OVER", String(score)), 900);
  }

  // ---------- Réseau (coop) ----------
  const r1 = (x) => Math.round(x);
  function envoyer(force) {
    Coop.envoyerEtat({
      mode: "coop", partie, etat, s: score, v: vies, n: niveau,
      o: [r1(ox), r1(oy), sens, frame],
      a: envahisseurs.map((e) => (e.vivant ? (e.pv >= 2 ? 2 : e.blinde ? 3 : 1) : 0)).join(""),
      x: vaisseaux.map((v) => [r1(v.x), v.pause > 0 ? 1 : 0, v.bouclier ? 1 : 0, v.R > 0 ? 1 : 0, v.T > 0 ? 1 : 0, v.P > 0 ? 1 : 0]),
      st: vaisseaux.map((v) => v.tirs.map((t) => [r1(t.x), r1(t.y)])),
      t: tirsEnnemis.map((t) => [r1(t.x), r1(t.y)]),
      u: soucoupe ? [r1(soucoupe.x), soucoupe.y] : null,
      b: boss ? [r1(boss.x), boss.y, boss.pv, boss.pvMax, boss.flash > 0 ? 1 : 0] : null,
      c: capsules.map((c) => [r1(c.x), r1(c.y), c.type]),
      ba: banniere ? banniere.txt : "",
    }, force);
    if (bouclierChange) envoyerBoucliers();
  }
  let dernierBouclier = 0;
  function envoyerBoucliers() {
    const t = performance.now();
    if (t - dernierBouclier < 250) return; // au plus 4 fois/s (bouclierChange reste vrai)
    dernierBouclier = t; bouclierChange = false;
    Coop.envoyerBloc("boucliers", { partie, n: niveau, k: boucliers.map((b) => (b.ok ? 1 : 0)).join("") });
  }

  let partieVue = 0, partieEnregistree = 0, niveauVu = 0, dernierBouclierRecu = null;
  function recevoir(e) {
    if (Coop.role !== "partenaire" || e.mode !== "coop") return;
    if (e.etat === "jeu" && e.partie !== partieVue) {
      // l'hôte lance une partie coop : on la rejoint (même en pleine partie solo)
      partieVue = e.partie; mode = "vue"; etat = "jeu"; niveauVu = 0;
      vaisseaux = [nouveauVaisseau(W / 3), nouveauVaisseau((2 * W) / 3)];
      monX = (2 * W) / 3; cibleX = null;
      $("#overlay").hidden = true;
    }
    if (mode !== "vue" || e.partie !== partieVue) return;
    if (e.n !== niveauVu) {
      niveauVu = e.n; niveau = e.n;
      envahisseurs = [];
      for (let r = 0; r < RANGS; r++) for (let c = 0; c < COLS; c++) envahisseurs.push({ r, c, type: TYPE_RANG[r], vivant: false, pv: 1 });
      if (motif(niveau).boucliers) construireBoucliers(); else boucliers = [];
      if (dernierBouclierRecu) recevoirBoucliers(dernierBouclierRecu);
    }
    if (e.ba && (!banniere || banniere.txt !== e.ba)) banniere = { txt: e.ba, t: 1.6 };
    if (score !== e.s) Salle.publier(e.s, "jeu");
    score = e.s; vies = e.v;
    [ox, oy, sens, frame] = e.o;
    envahisseurs.forEach((en, i) => {
      const c = e.a[i];
      const vivant = c !== "0";
      if (en.vivant && !vivant) { const p = posEnv(en); explosions.push({ x: p.x, y: p.y, t: 0.25 }); }
      en.vivant = vivant; en.pv = c === "2" ? 2 : 1; en.blinde = c === "2" || c === "3";
    });
    e.x.forEach(([x, pause, bouclier, R, T, Pc], i) => {
      const v = vaisseaux[i];
      if (i !== 1) v.x = x; // mon vaisseau : position locale, sans attendre le réseau
      if (pause && !(v.pause > 0) && !v.bouclier) explosions.push({ x: v.x, y: Y_JOUEUR, t: 1, joueur: true });
      v.pause = pause ? 1 : 0; v.bouclier = !!bouclier; v.R = R; v.T = T; v.P = Pc;
      v.tirs = (e.st[i] || []).map(([tx, ty]) => ({ x: tx, y: ty }));
    });
    tirsEnnemis = e.t.map(([x, y]) => ({ x, y }));
    soucoupe = e.u ? { x: e.u[0], y: e.u[1] } : null;
    if (boss && !e.b) for (let i = 0; i < 8; i++) explosions.push({ x: boss.x + (Math.random() - 0.5) * 90, y: boss.y + (Math.random() - 0.5) * 40, t: 0.4 + Math.random() * 0.6 });
    boss = e.b ? { x: e.b[0], y: e.b[1], pv: e.b[2], pvMax: e.b[3], flash: e.b[4] ? 0.08 : 0 } : null;
    capsules = e.c.map(([x, y, type]) => ({ x, y, type }));
    if (e.etat === "fini" && partieEnregistree !== e.partie) {
      partieEnregistree = e.partie; etat = "fini"; mode = "menu";
      Salle.publier(score, "fini");
      Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
      setTimeout(() => menu("GAME OVER", String(score)), 900);
    }
  }
  function recevoirBoucliers(b) {
    if (!b) return;
    dernierBouclierRecu = b;
    if (mode !== "vue" || b.partie !== partieVue || b.n !== niveau || b.k.length !== boucliers.length) return;
    boucliers.forEach((x, i) => { x.ok = b.k[i] === "1"; });
  }

  // ---------- Menus ----------
  let menuCle = "";
  function menu(titre, texte) {
    const role = Coop.role, present = Coop.partenairePresent();
    const cle = titre + texte + role + present + Coop.noms.partenaire;
    if (cle === menuCle && !$("#overlay").hidden) return;
    menuCle = cle;
    $("#ov-titre").textContent = titre;
    $("#ov-texte").textContent = texte || "";
    const boutons = [];
    if (role === "hote" && Coop.noms.partenaire) {
      boutons.push(["Solo", () => nouvellePartie(false)]);
      boutons.push(["Coop · " + Coop.noms.partenaire, () => nouvellePartie(true), !present]);
    } else boutons.push([etat === "fini" ? "Rejouer" : "Jouer", () => nouvellePartie(false)]);
    $("#ov-boutons").replaceChildren(...boutons.map(([l, f, off]) => {
      const b = document.createElement("button");
      b.className = "bouton"; b.textContent = l; b.disabled = !!off;
      b.addEventListener("click", f);
      return b;
    }));
    $("#overlay").hidden = false;
  }

  // ---------- Dessin ----------
  const etoiles = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, a: Math.random() }));
  function texte(t, x, y, taille, couleur) {
    ctx.font = taille + "px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = couleur; ctx.shadowColor = couleur; ctx.shadowBlur = 8;
    ctx.fillText(t, x, y); ctx.shadowBlur = 0;
  }
  function capsule(x, y, type, t) {
    const c = BONUS[type].couleur;
    ctx.fillStyle = "#05010f"; ctx.fillRect(x - 10, y - 8, 20, 16);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.shadowColor = c; ctx.shadowBlur = (t / 100) % 2 < 1 ? 12 : 4;
    ctx.strokeRect(x - 10, y - 8, 20, 16); ctx.shadowBlur = 0;
    texte(type, x, y + 1, 9, c);
  }

  function dessiner(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    etoiles.forEach((s) => { ctx.fillStyle = `rgba(216,249,255,${0.2 + 0.4 * Math.abs(Math.sin(t / 900 + s.a * 9))})`; ctx.fillRect(s.x, s.y, 2, 2); });

    if (etat === "jeu" || etat === "fini") {
      ctx.fillStyle = "#ff8a1f"; ctx.shadowColor = "#ff8a1f"; ctx.shadowBlur = 4;
      boucliers.forEach((b) => { if (b.ok) ctx.fillRect(b.x, b.y, 3, 3); });
      ctx.shadowBlur = 0;
      envahisseurs.forEach((e) => {
        if (!e.vivant) return;
        const p = posEnv(e);
        dessinerSprite(e.type, frame, p.x, p.y, e.pv >= 2 ? BLINDE : undefined);
      });
      if (soucoupe) dessinerSprite("soucoupe", 0, soucoupe.x, soucoupe.y);
      if (boss) {
        dessinerSprite("boss", 0, boss.x, boss.y, boss.flash > 0 ? "#ffffff" : undefined, 4);
        ctx.fillStyle = "#2a1c5c"; ctx.fillRect(W / 2 - 120, 24, 240, 6);
        ctx.fillStyle = "#b388ff"; ctx.fillRect(W / 2 - 120, 24, 240 * Math.max(0, boss.pv / boss.pvMax), 6);
      }
      // vaisseaux (clignotent après un coup), bouclier en halo
      if (etat === "jeu") vaisseaux.forEach((v, i) => {
        const x = mode === "vue" && i === 1 ? monX : v.x;
        if (v.pause <= 0 || (t / 100) % 2 < 1) dessinerSprite("joueur", 0, x, Y_JOUEUR, COUL_VAISSEAU[i]);
        if (v.bouclier) { ctx.strokeStyle = "#3dff7a"; ctx.lineWidth = 2; ctx.shadowColor = "#3dff7a"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x, Y_JOUEUR, 24, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0; }
      });
      vaisseaux.forEach((v, i) => v.tirs.forEach((tir) => {
        const c = v.P > 0 ? "#ff2bd6" : COUL_VAISSEAU[i];
        ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 8;
        ctx.fillRect(tir.x - 1, tir.y - 8, 3, 12); ctx.shadowBlur = 0;
      }));
      ctx.fillStyle = "#fff";
      tirsEnnemis.forEach((s) => { const z = (t / 60 + s.x) % 2 < 1 ? 1 : -1; ctx.fillRect(s.x - 1 + z, s.y - 6, 3, 4); ctx.fillRect(s.x - 1 - z, s.y - 2, 3, 4); });
      capsules.forEach((c) => capsule(c.x, c.y, c.type, t));
      explosions.forEach((x) => {
        if (x.texte) texte(x.texte, x.x, x.y, 12, x.couleur || "#ff3b3b");
        else dessinerSprite("boum", 0, x.x, x.y, x.joueur ? "#ffe14d" : "#ffffff");
      });
      // sol, vies, bonus actifs (les miens)
      ctx.fillStyle = "#3dff7a"; ctx.fillRect(0, H - 22, W, 2);
      for (let i = 0; i < vies - 1 && i < 8; i++) dessinerSprite("joueur", 0, 30 + i * 42, H - 10);
      const moi = vaisseaux[mode === "vue" ? 1 : 0];
      if (moi) ["R", "T", "P"].filter((k) => moi[k] > 0).forEach((k, i) => capsule(W - 20 - i * 26, H - 10, k, 0));
      if (banniere) texte(banniere.txt, W / 2, H / 2 - 20, 22, banniere.txt === "BOSS" ? "#b388ff" : "#ffe14d");
    }
    $("#score").textContent = score;
    $("#vies").textContent = vies;
    $("#vague").textContent = niveau;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.05, (t - avant) / 1000); avant = t;
    if (etat === "jeu" && (mode === "solo" || mode === "coop")) mettreAJour(dt);
    else {
      explosions.forEach((x) => (x.t -= dt));
      if (banniere) { banniere.t -= dt; if (banniere.t <= 0) banniere = null; }
    }
    explosions = explosions.filter((x) => x.t > 0);
    if (mode === "coop") envoyer(false);
    if (mode === "vue" && etat === "jeu") { bougerMonVaisseau(dt); if (appuiFeu && !vaisseaux[1].tirs.length) feu(); }
    if (Coop.role === "partenaire") Coop.envoyerEntree({ x: Math.round(monX), feu: mesTirs });
    if (etat !== "jeu" && Coop.role === "hote" && !$("#overlay").hidden) menu($("#ov-titre").textContent, $("#ov-texte").textContent);
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__invaders = {
    get mode() { return mode; }, get etat() { return etat; }, get score() { return score; }, get vies() { return vies; }, get niveau() { return niveau; },
    get vague() { return niveau; }, get envahisseurs() { return envahisseurs; }, get vaisseaux() { return vaisseaux; }, get boss() { return boss; },
    get capsules() { return capsules; },
    get joueur() { return { get x() { return monX; }, set x(v) { monX = v; } }; },
    tirer: feu, nouvellePartie, toucheJoueur,
    // tests : aller à un niveau, donner un bonus
    allerNiveau(n) { niveau = n; nouveauNiveau(); }, bonus(type) { prendreBonus(vaisseaux[0], type); },
    vider() { envahisseurs.forEach((e) => (e.vivant = false)); },
  };

  let boucliersEcoutes = false;
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Coop.demarrer(JEU, {
    surEtat: recevoir,
    surRoles: () => {
      if (Coop.role === "partenaire" && !boucliersEcoutes) { boucliersEcoutes = true; Coop.ecouterBloc("boucliers", recevoirBoucliers); }
      if (etat !== "jeu") menu($("#ov-titre").textContent || "SPACE INVADERS", $("#ov-texte").textContent);
    },
  });
  menu("SPACE INVADERS", "");
  requestAnimationFrame(boucle);
})();
