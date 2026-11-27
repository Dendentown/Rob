/* ============================================================
   BREAKOUT
   Casse toutes les briques (sauf les briques métal, indestructibles).
   Briques : rouge 70 · orange 50 · vert 30 · jaune 10 ·
             argent 50 (2 coups) · métal (indestructible)
   Niveaux en cycle de 6 : classique, pyramide, damier, forteresse,
   diamant, colonnes. Chaque niveau est un peu plus rapide.
   Vitesse de chaque balle (sans maximum, comme Pong) :
     v = 300 × (1 + 0,3 × ln(1 + n)) × (1 + 0,08 × (niveau − 1))
     n = nombre de rebonds de cette balle depuis son lancer

   BONUS (capsules lâchées par les briques cassées, à attraper) :
     L grande raquette   M multi-balles (chaque balle × 3)
     F balle de feu (traverse les briques)   C colle (la balle reste
     sur la raquette, on relance quand on veut)   S ralentir   V vie +1
   Une vie est perdue quand il ne reste plus aucune balle.

   SOLO : 1 raquette, 3 vies.
   COOP (lobby, hôte ★ + partenaire) : 2 raquettes, chacune dans sa
   moitié du terrain, 5 vies partagées, score d'équipe.
   L'hôte calcule la partie ; le partenaire envoie sa raquette.
   ============================================================ */
(function () {
  const JEU = "breakout";
  const W = 480, H = 600;
  const BW = 44, BH = 16, ESP = 4, HAUT = 62, GAUCHE = 2;
  const RW = 80, RH = 12, RY = H - 40, B = 8, MAX_BALLES = 9;
  const ANGLE_MAX = (60 * Math.PI) / 180;
  const COUL_JOUEUR = ["#19f0ff", "#ff2bd6"];
  const BRIQUE = {
    R: { c: "#ff3b3b", pts: 70 }, O: { c: "#ff8a1f", pts: 50 }, G: { c: "#3dff7a", pts: 30 }, Y: { c: "#ffe14d", pts: 10 },
    S: { c: "#c9d6ff", pts: 50, pv: 2 }, I: { c: "#6b6488", pts: 0, pv: Infinity },
  };
  const NIVEAUX = [
    ["RRRRRRRRRR", "RRRRRRRRRR", "OOOOOOOOOO", "OOOOOOOOOO", "GGGGGGGGGG", "GGGGGGGGGG", "YYYYYYYYYY", "YYYYYYYYYY"],
    ["....RR....", "...ROOR...", "..ROOOOR..", ".ROGGGGOR.", "ROGGYYGGOR", "OGGYYYYGGO", "GYYYSSYYYG", "YYYSSSSYYY"],
    ["S.S.S.S.S.", ".R.R.R.R.R", "O.O.O.O.O.", ".G.G.G.G.G", "Y.Y.Y.Y.Y.", ".S.S.S.S.S", "R.R.R.R.R.", ".Y.Y.Y.Y.Y"],
    ["IIII..IIII", "I.RRRRRR.I", "I.ROOOOR.I", "I.ROSSOR.I", "I.ROOOOR.I", "I.RGGGGR.I", "I.YYYYYY.I", "I........I"],
    ["....SS....", "...SRRS...", "..SROORS..", ".SROGGORS.", "SROGYYGORS", ".SROGGORS.", "..SROORS..", "...SRRS...", "....SS...."],
    ["R.O.G.Y.R.", "R.O.G.Y.R.", "S.S.S.S.S.", "R.O.G.Y.R.", "R.O.G.Y.R.", "..I...I...", "Y.G.O.R.Y.", "Y.G.O.R.Y."],
  ];
  const BONUS = {
    L: { c: "#19f0ff", poids: 22 }, M: { c: "#ffe14d", poids: 20 }, F: { c: "#ff8a1f", poids: 14 },
    C: { c: "#3dff7a", poids: 16 }, S: { c: "#b388ff", poids: 16 }, V: { c: "#ff3b3b", poids: 8 },
  };
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  // mode : "menu" | "solo" | "coop" (je suis l'hôte et je calcule) | "vue" (partenaire : j'affiche l'état reçu)
  let mode = "menu", etat = "menu", score = 0, vies = 3, niveau = 1, partie = 0;
  let briques = [], raquettes = [], balles = [], capsules = [], particules = [];
  let feu = 0, pause = 0, banniere = null, lancersP2 = 0, monLancer = 0;

  const vitesse = (b) => 300 * (1 + 0.3 * Math.log(1 + b.rebonds)) * (1 + 0.08 * (niveau - 1));
  const enCoop = () => mode === "coop" || mode === "vue";
  const largeur = (p) => (p.L > 0 ? RW * 1.5 : RW);
  function bonusAuHasard() {
    const k = Object.keys(BONUS);
    let r = Math.random() * k.reduce((s, x) => s + BONUS[x].poids, 0);
    for (const x of k) { r -= BONUS[x].poids; if (r <= 0) return x; }
    return "L";
  }

  function construireBriques() {
    briques = [];
    NIVEAUX[(niveau - 1) % NIVEAUX.length].forEach((ligne, r) => [...ligne].forEach((ch, c) => {
      if (ch === ".") return;
      briques.push({ x: GAUCHE + c * (BW + ESP), y: HAUT + r * (BH + ESP), type: ch, pv: BRIQUE[ch].pv || 1, ok: true });
    }));
  }
  const restantes = () => briques.filter((b) => b.ok && b.type !== "I").length;

  function nouvellesRaquettes(coop) {
    raquettes = coop
      ? [{ x: W / 4, zMin: 0, zMax: W / 2, L: 0, C: 0 }, { x: (3 * W) / 4, zMin: W / 2, zMax: W, L: 0, C: 0 }]
      : [{ x: W / 2, zMin: 0, zMax: W, L: 0, C: 0 }];
  }
  const borner = (p) => { const w = largeur(p); p.x = Math.max(p.zMin + w / 2, Math.min(p.zMax - w / 2, p.x)); };

  function poserBalle(i) {
    balles.push({ x: raquettes[i].x, y: RY - B / 2 - 1, vx: 0, vy: 0, collee: true, dx: 0, chrono: 4, rebonds: 0, proprio: i });
  }

  function debutNiveau() {
    construireBriques();
    balles = []; capsules = [];
    raquettes.forEach((_, i) => poserBalle(i));
    banniere = { txt: "NIVEAU " + niveau, t: 1.5 };
    pause = 1.2;
  }

  function nouvellePartie(coop) {
    mode = coop ? "coop" : "solo";
    score = 0; niveau = 1; vies = coop ? 5 : 3; partie = Date.now(); feu = 0;
    nouvellesRaquettes(coop);
    lancersP2 = (Coop.entree() || {}).lancer || 0;
    cibleX = null;
    debutNiveau();
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  function lancerBalle(b) {
    b.collee = false;
    const a = (Math.random() * 2 - 1) * 0.35 + (b.dx / RW) * 0.8, v = vitesse(b);
    b.vx = v * Math.sin(a); b.vy = -v * Math.cos(a);
  }
  function lancer(i) { balles.forEach((b) => { if (b.collee && b.proprio === i) lancerBalle(b); }); }
  function lancerLeMien() {
    if (mode === "vue") { monLancer++; return; }
    if ((mode === "solo" || mode === "coop") && etat === "jeu") lancer(0);
  }

  // ---------- Commandes ----------
  const touches = { g: false, d: false };
  let cibleX = null;
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu") { if ((k === " " || k === "enter") && mode !== "vue" && Coop.role !== "hote") { e.preventDefault(); nouvellePartie(false); } return; }
    if (k === "arrowleft" || k === "q" || k === "a") { touches.g = true; cibleX = null; }
    if (k === "arrowright" || k === "d") { touches.d = true; cibleX = null; }
    if (k === " " || k === "arrowup" || k === "z" || k === "w") { e.preventDefault(); lancerLeMien(); }
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "q" || k === "a") touches.g = false;
    if (k === "arrowright" || k === "d") touches.d = false;
  });
  const xCanvas = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
  canvas.addEventListener("pointermove", (e) => { cibleX = xCanvas(e); });
  canvas.addEventListener("pointerdown", (e) => { cibleX = xCanvas(e); lancerLeMien(); });

  function bougerRaquette(p, dt) {
    if (cibleX != null) p.x = cibleX;
    else p.x += ((touches.d ? 1 : 0) - (touches.g ? 1 : 0)) * 560 * dt;
    borner(p);
  }

  // ---------- Simulation (solo, ou hôte en coop) ----------
  function eclats(b) {
    const c = BRIQUE[b.type].c;
    for (let i = 0; i < 8; i++) particules.push({ x: b.x + BW / 2, y: b.y + BH / 2, vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, t: 0.5, c });
  }
  function toucherBrique(br) {
    if (br.type === "I") return;
    br.pv--;
    if (br.pv > 0) return;
    br.ok = false;
    score += BRIQUE[br.type].pts;
    eclats(br);
    if (Math.random() < 0.12) capsules.push({ x: br.x + BW / 2, y: br.y + BH / 2, type: bonusAuHasard() });
    Salle.publier(score, "jeu");
  }

  function accelerer(b) {
    b.rebonds++;
    const v = vitesse(b), n = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= v / n; b.vy *= v / n;
  }

  function appliquerBonus(i, type) {
    const p = raquettes[i];
    particules.push({ x: p.x, y: RY - 20, vx: 0, vy: -40, t: 0.8, c: BONUS[type].c, texte: type });
    if (type === "L") p.L = 15;
    if (type === "C") p.C = 12;
    if (type === "F") feu = 8;
    if (type === "V") vies = Math.min(9, vies + 1);
    if (type === "S") balles.forEach((b) => { b.rebonds = 0; if (!b.collee) { const v = vitesse(b) * 0.85, n = Math.hypot(b.vx, b.vy) || 1; b.vx *= v / n; b.vy *= v / n; } });
    if (type === "M") {
      const nouvelles = [];
      balles.forEach((b) => {
        if (b.collee) return;
        [-0.4, 0.4].forEach((a) => {
          if (balles.length + nouvelles.length >= MAX_BALLES) return;
          const c = Math.cos(a), s = Math.sin(a);
          nouvelles.push(Object.assign({}, b, { vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c }));
        });
      });
      balles.push(...nouvelles);
    }
  }

  function simuler(dt) {
    bougerRaquette(raquettes[0], dt);
    if (mode === "coop") {
      const p2 = raquettes[1], e = Coop.entree();
      if (Coop.partenairePresent() && e) p2.x = e.x;
      else {
        // partenaire absent : sa raquette suit la balle la plus basse de son côté
        const b = balles.filter((b) => b.x > W / 2 && !b.collee).sort((a, c) => c.y - a.y)[0];
        if (b) p2.x += Math.max(-400 * dt, Math.min(400 * dt, b.x - p2.x));
      }
      borner(p2);
      if (e && e.lancer > lancersP2) { lancersP2 = e.lancer; lancer(1); }
    }
    raquettes.forEach((p) => { if (p.L > 0) { p.L -= dt; borner(p); } if (p.C > 0) p.C -= dt; });
    if (feu > 0) feu -= dt;
    if (pause > 0) { pause -= dt; balles.forEach((b) => { if (b.collee) { const p = raquettes[b.proprio]; b.x = p.x + b.dx; b.y = RY - B / 2 - 1; } }); return; }

    balles = balles.filter((b) => {
      if (b.collee) {
        const p = raquettes[b.proprio];
        b.x = p.x + b.dx; b.y = RY - B / 2 - 1;
        b.chrono -= dt;
        if (b.chrono <= 0) lancerBalle(b);
        return true;
      }
      return deplacerBalle(b, dt) !== "perdue";
    });
    if (!balles.length) {
      vies--;
      if (vies <= 0) return finPartie();
      raquettes.forEach((_, i) => poserBalle(i));
    }

    // capsules
    capsules.forEach((c) => (c.y += 120 * dt));
    capsules = capsules.filter((c) => {
      if (c.y > H) return false;
      const i = raquettes.findIndex((p) => Math.abs(c.x - p.x) < largeur(p) / 2 + 10 && c.y + 8 >= RY && c.y - 8 <= RY + RH);
      if (i < 0) return true;
      appliquerBonus(i, c.type);
      return false;
    });

    if (!restantes()) { niveau++; debutNiveau(); }
  }

  // petits pas : la balle ne traverse jamais une brique, même très vite
  function deplacerBalle(b, dt) {
    const n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 4));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const px = b.x, py = b.y;
      b.x += b.vx * h; b.y += b.vy * h;
      if (b.x < B / 2) { b.x = B / 2; b.vx = Math.abs(b.vx); }
      if (b.x > W - B / 2) { b.x = W - B / 2; b.vx = -Math.abs(b.vx); }
      if (b.y < B / 2) { b.y = B / 2; b.vy = Math.abs(b.vy); }

      // n'importe quelle raquette renvoie n'importe quelle balle
      for (let k = 0; k < raquettes.length; k++) {
        const p = raquettes[k], w = largeur(p);
        if (b.vy > 0 && b.y + B / 2 >= RY && py + B / 2 <= RY + 2 && Math.abs(b.x - p.x) <= w / 2 + B / 2) {
          if (p.C > 0) { b.collee = true; b.proprio = k; b.dx = b.x - p.x; b.chrono = 3; b.y = RY - B / 2 - 1; return; }
          const a = Math.max(-1, Math.min(1, (b.x - p.x) / (w / 2))) * ANGLE_MAX;
          const v = Math.hypot(b.vx, b.vy);
          b.vx = v * Math.sin(a); b.vy = -v * Math.cos(a);
          b.y = RY - B / 2;
          b.proprio = k;
          accelerer(b);
          break;
        }
      }
      for (const br of briques) {
        if (!br.ok) continue;
        if (b.x + B / 2 > br.x && b.x - B / 2 < br.x + BW && b.y + B / 2 > br.y && b.y - B / 2 < br.y + BH) {
          if (feu > 0 && br.type !== "I") { br.pv = 1; toucherBrique(br); continue; } // la balle de feu traverse
          const deCote = px + B / 2 <= br.x || px - B / 2 >= br.x + BW;
          if (deCote) { b.vx = -b.vx; b.x = px; } else { b.vy = -b.vy; b.y = py; }
          toucherBrique(br);
          accelerer(b);
          break;
        }
      }
      if (b.y > H + B) return "perdue";
    }
  }

  function finPartie() {
    etat = "fini";
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    if (mode === "coop") envoyer(true);
    menu("GAME OVER", String(score));
  }

  // ---------- Réseau (coop) ----------
  const r1 = (x) => Math.round(x);
  function envoyer(force) {
    Coop.envoyerEtat({
      mode: "coop", partie, etat, s: score, v: vies, n: niveau, f: feu > 0 ? 1 : 0,
      r: raquettes.map((p) => [r1(p.x), p.L > 0 ? 1 : 0, p.C > 0 ? 1 : 0]),
      b: balles.map((b) => [r1(b.x), r1(b.y), b.collee ? 1 : 0]),
      k: briques.map((b) => (!b.ok ? "." : b.type === "S" && b.pv === 1 ? "s" : b.type)).join(""),
      c: capsules.map((c) => [r1(c.x), r1(c.y), c.type]),
      ba: banniere ? banniere.txt : "",
    }, force);
  }

  let partieVue = 0, partieEnregistree = 0;
  function recevoir(e) {
    if (Coop.role !== "partenaire" || e.mode !== "coop") return;
    if (e.etat === "jeu" && e.partie !== partieVue) {
      // l'hôte lance une partie coop : on la rejoint (même en pleine partie solo)
      partieVue = e.partie; mode = "vue"; etat = "jeu";
      nouvellesRaquettes(true); cibleX = null; briques = [];
      $("#overlay").hidden = true;
    }
    if (mode !== "vue" || e.partie !== partieVue) return;
    if (e.n !== niveau || briques.length !== e.k.length) { niveau = e.n; construireBriques(); }
    if (e.ba && (!banniere || banniere.txt !== e.ba)) banniere = { txt: e.ba, t: 1.5 };
    if (score !== e.s) Salle.publier(e.s, "jeu");
    score = e.s; vies = e.v; feu = e.f ? 1 : 0;
    e.r.forEach(([x, L, C], i) => { const p = raquettes[i]; if (i !== 1) p.x = x; p.L = L; p.C = C; });
    borner(raquettes[1]);
    balles = e.b.map(([x, y, c]) => ({ x, y, collee: !!c }));
    briques.forEach((br, i) => {
      const ch = e.k[i];
      if (br.ok && ch === ".") { br.ok = false; eclats(br); }
      else if (ch !== ".") { br.ok = true; br.pv = ch === "s" ? 1 : BRIQUE[br.type].pv || 1; }
    });
    capsules = e.c.map(([x, y, type]) => ({ x, y, type }));
    if (e.etat === "fini" && partieEnregistree !== e.partie) {
      partieEnregistree = e.partie; etat = "fini"; mode = "menu";
      Salle.publier(score, "fini");
      Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
      menu("GAME OVER", String(score));
    }
  }

  // ---------- Menus (par-dessus le terrain) ----------
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
    } else {
      boutons.push([etat === "fini" ? "Rejouer" : "Jouer", () => nouvellePartie(false)]);
    }
    $("#ov-boutons").replaceChildren(...boutons.map(([l, f, off]) => {
      const b = document.createElement("button");
      b.className = "bouton"; b.textContent = l; b.disabled = !!off;
      b.addEventListener("click", f);
      return b;
    }));
    $("#overlay").hidden = false;
  }

  // ---------- Dessin ----------
  function rect(x, y, w, h, c, flou) {
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = flou || 0;
    ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
  }
  function texte(t, x, y, taille, c) {
    ctx.font = taille + "px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 8; ctx.fillText(t, x, y); ctx.shadowBlur = 0;
  }
  function dessinerBrique(b) {
    const def = BRIQUE[b.type];
    if (b.type === "I") {
      ctx.fillStyle = "#2a2640"; ctx.fillRect(b.x, b.y, BW, BH);
      ctx.strokeStyle = def.c; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, b.y + 1, BW - 2, BH - 2);
      ctx.fillStyle = def.c; [[4, 4], [BW - 6, 4], [4, BH - 6], [BW - 6, BH - 6]].forEach(([x, y]) => ctx.fillRect(b.x + x, b.y + y, 2, 2));
      return;
    }
    rect(b.x, b.y, BW, BH, def.c, 8);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(b.x + 3, b.y + 3, BW - 6, 3);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(b.x + 3, b.y + BH - 4, BW - 6, 2);
    if (b.type === "S" && b.pv === 1) { // argent fissuré
      ctx.strokeStyle = "#05010f"; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(b.x + 10, b.y + 2); ctx.lineTo(b.x + 18, b.y + 9); ctx.lineTo(b.x + 14, b.y + BH - 2);
      ctx.moveTo(b.x + 30, b.y + 2); ctx.lineTo(b.x + 26, b.y + 8); ctx.lineTo(b.x + 33, b.y + BH - 3); ctx.stroke();
    }
  }
  function capsule(c, t) {
    const col = BONUS[c.type].c;
    ctx.fillStyle = "#05010f"; ctx.fillRect(c.x - 12, c.y - 8, 24, 16);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = (t / 100) % 2 < 1 ? 12 : 4;
    ctx.strokeRect(c.x - 12, c.y - 8, 24, 16); ctx.shadowBlur = 0;
    texte(c.type, c.x, c.y + 1, 9, col);
  }

  function dessiner(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(25, 240, 255, 0.05)";
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 24) ctx.fillRect(0, y, W, 1);
    if (!briques.length) return;

    briques.forEach((b) => { if (b.ok) dessinerBrique(b); });
    particules.forEach((p) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.t * 2));
      if (p.texte) texte(p.texte, p.x, p.y, 12, p.c); else rect(p.x, p.y, 3, 3, p.c);
    });
    ctx.globalAlpha = 1;
    capsules.forEach((c) => capsule(c, t));
    if (raquettes.length > 1) {
      ctx.fillStyle = "rgba(216,249,255,0.25)";
      for (let y = RY - 60; y < H; y += 12) ctx.fillRect(W / 2 - 1, y, 2, 6);
    }
    raquettes.forEach((p, i) => {
      const w = largeur(p);
      rect(p.x - w / 2, RY, w, RH, COUL_JOUEUR[i], 16);
      ctx.fillStyle = p.C > 0 ? "#3dff7a" : "rgba(255,255,255,0.5)"; ctx.fillRect(p.x - w / 2 + 4, RY + 2, w - 8, 3);
    });
    if (etat === "jeu") balles.forEach((b) => rect(b.x - B / 2, b.y - B / 2, B, B, feu > 0 ? "#ff8a1f" : "#ffffff", feu > 0 ? 18 : 14));
    if (banniere) texte(banniere.txt, W / 2, H / 2 + 40, 20, "#ffe14d");

    $("#score").textContent = score;
    $("#vies").textContent = vies;
    $("#niveau").textContent = niveau;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.033, (t - avant) / 1000); avant = t;
    particules.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; if (!p.texte) p.vy += 400 * dt; p.t -= dt; });
    particules = particules.filter((p) => p.t > 0);
    if (banniere) { banniere.t -= dt; if (banniere.t <= 0) banniere = null; }

    if (etat === "jeu" && (mode === "solo" || mode === "coop")) simuler(dt);
    if (mode === "coop") envoyer(false);
    if (mode === "vue" && etat === "jeu") bougerRaquette(raquettes[1], dt);
    if (Coop.role === "partenaire") Coop.envoyerEntree({ x: raquettes[1] && mode === "vue" ? Math.round(raquettes[1].x) : 0, lancer: monLancer });
    // le menu de l'hôte se met à jour quand le partenaire arrive ou part
    if (etat !== "jeu" && Coop.role === "hote") menu($("#ov-titre").textContent, $("#ov-texte").textContent);

    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__breakout = {
    get mode() { return mode; }, get etat() { return etat; }, get score() { return score; }, get vies() { return vies; }, get niveau() { return niveau; },
    get briques() { return briques; }, get balles() { return balles; }, get raquettes() { return raquettes; }, get capsules() { return capsules; }, get feu() { return feu; },
    get balle() { return balles[0]; }, get collee() { return balles[0] && balles[0].collee; },
    lancer: lancerLeMien, nouvellePartie, viser(x) { cibleX = x; },
    // tests
    allerNiveau(n) { niveau = n; debutNiveau(); pause = 0; }, bonus(type) { appliquerBonus(0, type); },
    vider() { briques.forEach((b) => { if (b.type !== "I") b.ok = false; }); },
  };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Coop.demarrer(JEU, { surEtat: recevoir, surRoles: () => { if (etat !== "jeu") menu($("#ov-titre").textContent || "BREAKOUT", $("#ov-texte").textContent); } });
  menu("BREAKOUT", "");
  requestAnimationFrame(boucle);
})();
