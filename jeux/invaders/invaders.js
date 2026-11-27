/* ============================================================
   SPACE INVADERS
   55 envahisseurs (11 × 5) qui accélèrent à mesure qu'ils sont
   détruits, 4 boucliers qui s'abîment, une soucoupe de temps en
   temps, 3 vies. Chaque vague détruite en amène une plus basse et
   plus rapide.
   Points : rang du haut 30 · milieu 20 · bas 10 · soucoupe 50 à 300

   SOLO : 1 vaisseau, 3 vies.
   COOP (lobby, hôte ★ + partenaire) : 2 vaisseaux sur le même terrain
   (jaune = hôte, cyan = partenaire), chacun son tir, 5 vies partagées,
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

  // ---------- Sprites (X = pixel allumé) ----------
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
  // mode : "menu" | "solo" | "coop" (hôte, je calcule) | "vue" (partenaire, j'affiche l'état reçu)
  let mode = "menu", etat = "menu", score = 0, vies = 3, vague = 1, partie = 0;
  let envahisseurs = [], ox = 0, oy = 0, sens = 1, frame = 0, chronoPas = 0;
  let vaisseaux = [], tirsEnnemis = [], boucliers = [], soucoupe = null, prochaineSoucoupe = 0;
  let explosions = [], pauseVague = 0, tirsP2 = 0, mesTirs = 0;
  const COUL_VAISSEAU = ["#ffe14d", "#19f0ff"];
  const monIndex = () => (mode === "vue" ? 1 : 0);

  function nouvellePartie(coop) {
    mode = coop ? "coop" : "solo";
    score = 0; vies = coop ? 5 : 3; vague = 1; partie = Date.now();
    vaisseaux = coop ? [{ x: W / 3, tir: null, pause: 0 }, { x: (2 * W) / 3, tir: null, pause: 0 }] : [{ x: W / 2, tir: null, pause: 0 }];
    tirsP2 = (Coop.entree() || {}).feu || 0;
    nouvelleVague();
    construireBoucliers();
    cibleX = null;
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
    if (coop) envoyerBoucliers();
  }

  function nouvelleVague() {
    envahisseurs = [];
    for (let r = 0; r < RANGS; r++) for (let c = 0; c < COLS; c++) envahisseurs.push({ r, c, type: TYPE_RANG[r], vivant: true });
    ox = 42; oy = 70 + Math.min(5, vague - 1) * 16; sens = 1; frame = 0; chronoPas = 0;
    vaisseaux.forEach((v) => (v.tir = null));
    tirsEnnemis = []; soucoupe = null;
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
  let cibleX = null, monX = W / 2;
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu") { if ((k === " " || k === "enter") && Coop.role !== "hote") { e.preventDefault(); nouvellePartie(false); } return; }
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
  canvas.addEventListener("pointerdown", (e) => { cibleX = xCanvas(e); feu(); });
  canvas.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType !== "mouse") cibleX = xCanvas(e); });
  document.querySelectorAll("[data-cmd]").forEach((b) => {
    const cmd = b.dataset.cmd;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault(); cibleX = null;
      if (cmd === "feu") feu(); else touches[cmd] = true;
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => { if (cmd !== "feu") touches[cmd] = false; }));
  });

  function feu() {
    if (mode === "vue") { mesTirs++; return; }
    tirer(0);
  }
  function tirer(i) {
    const v = vaisseaux[i];
    if (etat !== "jeu" || !v || v.tir || v.pause > 0 || pauseVague > 0) return;
    v.tir = { x: v.x, y: Y_JOUEUR - 14 };
  }

  function bougerMonVaisseau(dt) {
    const v = 260;
    if (cibleX != null) monX += Math.max(-v * dt * 1.6, Math.min(v * dt * 1.6, cibleX - monX));
    else monX += ((touches.d ? 1 : 0) - (touches.g ? 1 : 0)) * v * dt;
    monX = Math.max(22, Math.min(W - 22, monX));
  }

  // ---------- Simulation (solo, ou hôte en coop) ----------
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
    if (touche) bouclierChange = true;
    return touche;
  }
  let bouclierChange = false;

  function mettreAJour(dt) {
    explosions.forEach((x) => (x.t -= dt));
    explosions = explosions.filter((x) => x.t > 0);
    if (pauseVague > 0) { pauseVague -= dt; return; }

    // vaisseaux
    bougerMonVaisseau(dt);
    vaisseaux[0].x = monX;
    if (mode === "coop") {
      const e = Coop.entree(), v2 = vaisseaux[1];
      if (e && Coop.partenairePresent()) v2.x += Math.max(-420 * dt, Math.min(420 * dt, e.x - v2.x));
      if (e && e.feu > tirsP2) { tirsP2 = e.feu; tirer(1); }
    }
    vaisseaux.forEach((v) => { if (v.pause > 0) v.pause -= dt; });

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
      vv.forEach((e) => { const p = posEnv(e); boucliers.forEach((b) => { if (b.ok && Math.abs(b.x - p.x) < 18 && Math.abs(b.y - p.y) < 12) { b.ok = false; bouclierChange = true; } }); });
      if (vv.some((e) => posEnv(e).y + 12 >= Y_JOUEUR - 10)) { vies = 0; return finPartie(); }
    }

    // tirs des vaisseaux
    for (const v of vaisseaux) {
      const tir = v.tir;
      if (!tir) continue;
      tir.y -= 560 * dt;
      if (tir.y < 20 || toucheBouclier(tir.x, tir.y, 1)) { v.tir = null; continue; }
      for (const e of envahisseurs) {
        if (!e.vivant) continue;
        const p = posEnv(e);
        if (Math.abs(tir.x - p.x) < 16 && Math.abs(tir.y - p.y) < 12) {
          e.vivant = false; v.tir = null;
          score += POINTS[e.type];
          explosions.push({ x: p.x, y: p.y, t: 0.25 });
          Salle.publier(score, "jeu");
          break;
        }
      }
      if (v.tir && soucoupe && Math.abs(v.tir.x - soucoupe.x) < 24 && Math.abs(v.tir.y - soucoupe.y) < 12) {
        const bonus = [50, 100, 150, 300][(Math.random() * 4) | 0];
        score += bonus;
        explosions.push({ x: soucoupe.x, y: soucoupe.y, t: 0.8, texte: String(bonus) });
        soucoupe = null; v.tir = null;
        Salle.publier(score, "jeu");
      }
    }

    // tirs ennemis (depuis l'envahisseur le plus bas d'une colonne)
    const maxTirs = 2 + Math.min(3, vague) + (vaisseaux.length - 1);
    if (tirsEnnemis.length < maxTirs && Math.random() < dt * (0.9 + 0.25 * vague) * vaisseaux.length) {
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
      for (const v of vaisseaux) {
        if (v.pause <= 0 && Math.abs(t.x - v.x) < 16 && t.y > Y_JOUEUR - 10 && t.y < Y_JOUEUR + 12) { toucheVaisseau(v); return false; }
      }
      return true;
    });
    if (etat !== "jeu") return;
    // tir contre tir
    for (const v of vaisseaux) {
      if (v.tir) tirsEnnemis = tirsEnnemis.filter((t) => { if (v.tir && Math.abs(t.x - v.tir.x) < 5 && Math.abs(t.y - v.tir.y) < 10) { v.tir = null; return false; } return true; });
    }

    // soucoupe
    prochaineSoucoupe -= dt;
    if (!soucoupe && prochaineSoucoupe <= 0) {
      const d = Math.random() < 0.5 ? 1 : -1;
      soucoupe = { x: d > 0 ? -30 : W + 30, y: 42, d };
      prochaineSoucoupe = 15 + Math.random() * 12;
    }
    if (soucoupe) { soucoupe.x += soucoupe.d * 110 * dt; if (soucoupe.x < -40 || soucoupe.x > W + 40) soucoupe = null; }

    if (!vivants().length) { vague++; nouvelleVague(); pauseVague = 0.8; }
  }

  function toucheVaisseau(v) {
    vies--;
    explosions.push({ x: v.x, y: Y_JOUEUR, t: 1, joueur: true });
    v.tir = null; v.pause = 1.2;
    if (vaisseaux.length === 1) tirsEnnemis = [];
    if (vies <= 0) finPartie();
  }
  // pour les tests
  const toucheJoueur = () => toucheVaisseau(vaisseaux[0]);

  function finPartie() {
    etat = "fini";
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    if (mode === "coop") envoyer(true);
    setTimeout(() => menu("GAME OVER", String(score)), 900);
  }

  // ---------- Réseau (coop) ----------
  function envoyer(force) {
    Coop.envoyerEtat({
      mode: "coop", partie, etat, s: score, v: vies, n: vague,
      o: [Math.round(ox), Math.round(oy), sens, frame],
      a: envahisseurs.map((e) => (e.vivant ? 1 : 0)).join(""),
      x: vaisseaux.map((v) => [Math.round(v.x), v.pause > 0 ? 1 : 0, v.tir ? Math.round(v.tir.x) : -1, v.tir ? Math.round(v.tir.y) : -1]),
      t: tirsEnnemis.map((t) => [Math.round(t.x), Math.round(t.y)]),
      u: soucoupe ? [Math.round(soucoupe.x), soucoupe.y] : null,
    }, force);
    if (bouclierChange) { bouclierChange = false; envoyerBoucliers(); }
  }
  let dernierBouclier = 0;
  function envoyerBoucliers() {
    const t = performance.now();
    if (t - dernierBouclier < 250) { bouclierChange = true; return; } // au plus 4 fois/s
    dernierBouclier = t;
    Coop.envoyerBloc("boucliers", { partie, k: boucliers.map((b) => (b.ok ? 1 : 0)).join("") });
  }

  let partieVue = 0, partieEnregistree = 0;
  function recevoir(e) {
    if (Coop.role !== "partenaire" || e.mode !== "coop") return;
    if (e.etat === "jeu" && e.partie !== partieVue) {
      // l'hôte lance une partie coop : on la rejoint (même en pleine partie solo)
      partieVue = e.partie; mode = "vue"; etat = "jeu";
      vaisseaux = [{ x: W / 3, tir: null, pause: 0 }, { x: (2 * W) / 3, tir: null, pause: 0 }];
      envahisseurs = [];
      for (let r = 0; r < RANGS; r++) for (let c = 0; c < COLS; c++) envahisseurs.push({ r, c, type: TYPE_RANG[r], vivant: true });
      construireBoucliers(); monX = (2 * W) / 3; cibleX = null;
      $("#overlay").hidden = true;
    }
    if (mode !== "vue" || e.partie !== partieVue) return;
    if (score !== e.s) Salle.publier(e.s, "jeu");
    score = e.s; vies = e.v; vague = e.n;
    [ox, oy, sens, frame] = e.o;
    envahisseurs.forEach((en, i) => {
      const vivant = e.a[i] === "1";
      if (en.vivant && !vivant) { const p = posEnv(en); explosions.push({ x: p.x, y: p.y, t: 0.25 }); }
      en.vivant = vivant;
    });
    e.x.forEach(([x, pause, tx, ty], i) => {
      const v = vaisseaux[i];
      if (i !== 1) v.x = x;                       // mon vaisseau : position locale, sans attendre le réseau
      if (pause && !(v.pause > 0)) explosions.push({ x: v.x, y: Y_JOUEUR, t: 1, joueur: true });
      v.pause = pause ? 1 : 0;
      v.tir = tx >= 0 ? { x: tx, y: ty } : null;
    });
    tirsEnnemis = e.t.map(([x, y]) => ({ x, y }));
    soucoupe = e.u ? { x: e.u[0], y: e.u[1] } : null;
    if (e.etat === "fini" && partieEnregistree !== e.partie) {
      partieEnregistree = e.partie; etat = "fini"; mode = "menu";
      Salle.publier(score, "fini");
      Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
      setTimeout(() => menu("GAME OVER", String(score)), 900);
    }
  }
  function recevoirBoucliers(b) {
    if (!b || mode !== "vue" || b.partie !== partieVue) return;
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
  function dessiner(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    etoiles.forEach((s) => { ctx.fillStyle = `rgba(216,249,255,${0.2 + 0.4 * Math.abs(Math.sin(t / 900 + s.a * 9))})`; ctx.fillRect(s.x, s.y, 2, 2); });

    if (envahisseurs.length) {
      ctx.fillStyle = "#ff8a1f"; ctx.shadowColor = "#ff8a1f"; ctx.shadowBlur = 4;
      boucliers.forEach((b) => { if (b.ok) ctx.fillRect(b.x, b.y, 3, 3); });
      ctx.shadowBlur = 0;
      envahisseurs.forEach((e) => { if (e.vivant) { const p = posEnv(e); dessinerSprite(e.type, frame, p.x, p.y); } });
      if (soucoupe) dessinerSprite("soucoupe", 0, soucoupe.x, soucoupe.y);
      // vaisseaux (clignotent après un coup)
      if (etat === "jeu") vaisseaux.forEach((v, i) => {
        const x = mode === "vue" && i === 1 ? monX : v.x;
        if (v.pause <= 0 || (t / 100) % 2 < 1) dessinerSprite("joueur", 0, x, Y_JOUEUR, COUL_VAISSEAU[i]);
      });
      vaisseaux.forEach((v, i) => {
        if (!v.tir) return;
        ctx.fillStyle = COUL_VAISSEAU[i]; ctx.shadowColor = COUL_VAISSEAU[i]; ctx.shadowBlur = 8;
        ctx.fillRect(v.tir.x - 1, v.tir.y - 8, 3, 12); ctx.shadowBlur = 0;
      });
      ctx.fillStyle = "#fff";
      tirsEnnemis.forEach((s) => { const z = (t / 60 + s.x) % 2 < 1 ? 1 : -1; ctx.fillRect(s.x - 1 + z, s.y - 6, 3, 4); ctx.fillRect(s.x - 1 - z, s.y - 2, 3, 4); });
      explosions.forEach((x) => {
        if (x.texte) { ctx.font = "12px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#ff3b3b"; ctx.fillText(x.texte, x.x, x.y + 5); }
        else dessinerSprite("boum", 0, x.x, x.y, x.joueur ? "#ffe14d" : "#ffffff");
      });
      ctx.fillStyle = "#3dff7a"; ctx.fillRect(0, H - 22, W, 2);
      for (let i = 0; i < vies - 1 && i < 8; i++) dessinerSprite("joueur", 0, 30 + i * 42, H - 10);
    }
    $("#score").textContent = score;
    $("#vies").textContent = vies;
    $("#vague").textContent = vague;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.05, (t - avant) / 1000); avant = t;
    if (etat === "jeu" && (mode === "solo" || mode === "coop")) mettreAJour(dt);
    else explosions.forEach((x) => (x.t -= dt));
    explosions = explosions.filter((x) => x.t > 0);
    if (mode === "coop") envoyer(false);
    if (mode === "vue" && etat === "jeu") bougerMonVaisseau(dt);
    if (Coop.role === "partenaire") Coop.envoyerEntree({ x: Math.round(monX), feu: mesTirs });
    if (etat !== "jeu" && Coop.role === "hote" && !$("#overlay").hidden) menu($("#ov-titre").textContent, $("#ov-texte").textContent);
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__invaders = {
    get mode() { return mode; }, get etat() { return etat; }, get score() { return score; }, get vies() { return vies; }, get vague() { return vague; },
    get envahisseurs() { return envahisseurs; }, get vaisseaux() { return vaisseaux; },
    get joueur() { return { get x() { return monX; }, set x(v) { monX = v; } }; },
    tirer: feu, nouvellePartie, toucheJoueur,
  };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  let boucliersEcoutes = false;
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
