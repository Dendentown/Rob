/* ============================================================
   BREAKOUT
   Casse toutes les briques avec la balle.
   Briques : rouge 70 · orange 50 · vert 30 · jaune 10
   Vitesse de chaque balle (sans maximum, comme Pong) :
     v = 300 × (1 + 0,3 × ln(1 + n)) × (1 + 0,08 × (niveau − 1))
     n = nombre de rebonds de cette balle depuis son lancer

   SOLO : 1 raquette, 1 balle, 3 vies.
   COOP (lobby, hôte ★ + partenaire) : 2 raquettes, chacune dans sa
   moitié du terrain, 2 balles, 5 vies partagées, score d'équipe.
   L'hôte calcule la partie ; le partenaire envoie sa raquette.
   ============================================================ */
(function () {
  const JEU = "breakout";
  const W = 480, H = 600;
  const COLS = 10, RANGS = 8, BW = 44, BH = 16, ESP = 4, HAUT = 70, GAUCHE = 2;
  const RW = 80, RH = 12, RY = H - 40, B = 8;
  const RANG_COULEUR = ["#ff3b3b", "#ff3b3b", "#ff8a1f", "#ff8a1f", "#3dff7a", "#3dff7a", "#ffe14d", "#ffe14d"];
  const RANG_POINTS = [70, 70, 50, 50, 30, 30, 10, 10];
  const COUL_JOUEUR = ["#19f0ff", "#ff2bd6"];
  const ANGLE_MAX = (60 * Math.PI) / 180;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  // mode : "menu" | "solo" | "coop" (je suis l'hôte et je calcule) | "vue" (partenaire : j'affiche l'état reçu)
  let mode = "menu", etat = "menu", score = 0, vies = 3, niveau = 1, partie = 0;
  let briques = [], raquettes = [], balles = [], particules = [];
  let lancersP2 = 0, monLancer = 0, chronoAuto = [];

  const vitesse = (b) => 300 * (1 + 0.3 * Math.log(1 + b.rebonds)) * (1 + 0.08 * (niveau - 1));
  const monIndex = () => (mode === "vue" ? 1 : 0);
  const enCoop = () => mode === "coop" || mode === "vue";

  function construireBriques() {
    briques = [];
    for (let r = 0; r < RANGS; r++) for (let c = 0; c < COLS; c++)
      briques.push({ x: GAUCHE + c * (BW + ESP), y: HAUT + r * (BH + ESP), r, ok: true });
  }

  function poserBalle(i) {
    const p = raquettes[i];
    balles[i] = { x: p.x, y: RY - B / 2 - 1, vx: 0, vy: 0, collee: true, rebonds: 0, proprio: i };
    chronoAuto[i] = 4; // lancée automatiquement au bout de 4 s
  }

  function nouvellePartie(coop) {
    mode = coop ? "coop" : "solo";
    score = 0; niveau = 1; vies = coop ? 5 : 3; partie = Date.now();
    raquettes = coop
      ? [{ x: W / 4, min: RW / 2, max: W / 2 - RW / 2 }, { x: (3 * W) / 4, min: W / 2 + RW / 2, max: W - RW / 2 }]
      : [{ x: W / 2, min: RW / 2, max: W - RW / 2 }];
    balles = []; chronoAuto = [];
    raquettes.forEach((_, i) => poserBalle(i));
    construireBriques();
    lancersP2 = (Coop.entree() || {}).lancer || 0;
    cibleX = null;
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  function lancer(i) {
    const b = balles[i];
    if (!b || !b.collee || etat !== "jeu") return;
    b.collee = false;
    const a = (Math.random() * 2 - 1) * 0.35, v = vitesse(b);
    b.vx = v * Math.sin(a); b.vy = -v * Math.cos(a);
  }
  function lancerLeMien() {
    if (mode === "vue") { monLancer++; return; }
    if (mode === "solo" || mode === "coop") lancer(0);
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
    p.x = Math.max(p.min, Math.min(p.max, p.x));
  }

  // ---------- Simulation (solo, ou hôte en coop) ----------
  function casser(b) {
    b.ok = false;
    score += RANG_POINTS[b.r];
    eclats(b);
    Salle.publier(score, "jeu");
  }
  function eclats(b) {
    for (let i = 0; i < 8; i++) particules.push({ x: b.x + BW / 2, y: b.y + BH / 2, vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, t: 0.5, c: RANG_COULEUR[b.r] });
  }

  function accelerer(b) {
    b.rebonds++;
    const v = vitesse(b), n = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= v / n; b.vy *= v / n;
  }

  function simuler(dt) {
    bougerRaquette(raquettes[0], dt);
    if (mode === "coop") {
      const p2 = raquettes[1], e = Coop.entree();
      if (Coop.partenairePresent() && e) p2.x = e.x;
      else {
        // partenaire absent : sa raquette suit la balle la plus proche de son côté
        const b = balles.filter((b) => b.x > W / 2).sort((a, c) => c.y - a.y)[0];
        if (b) p2.x += Math.max(-400 * dt, Math.min(400 * dt, b.x - p2.x));
      }
      p2.x = Math.max(p2.min, Math.min(p2.max, p2.x));
      if (e && e.lancer > lancersP2) { lancersP2 = e.lancer; lancer(1); }
    }

    for (let i = 0; i < balles.length; i++) {
      const b = balles[i];
      if (b.collee) {
        const p = raquettes[b.proprio];
        b.x = p.x; b.y = RY - B / 2 - 1;
        chronoAuto[i] -= dt;
        if (chronoAuto[i] <= 0) lancer(i);
        continue;
      }
      if (deplacerBalle(b, dt) === "perdue") {
        vies--;
        if (vies <= 0) return finPartie();
        poserBalle(i);
      }
    }
    if (briques.every((b) => !b.ok)) { niveau++; construireBriques(); raquettes.forEach((_, i) => poserBalle(i)); }
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
      for (const p of raquettes) {
        if (b.vy > 0 && b.y + B / 2 >= RY && py + B / 2 <= RY + 2 && Math.abs(b.x - p.x) <= RW / 2 + B / 2) {
          const a = Math.max(-1, Math.min(1, (b.x - p.x) / (RW / 2))) * ANGLE_MAX;
          const v = Math.hypot(b.vx, b.vy);
          b.vx = v * Math.sin(a); b.vy = -v * Math.cos(a);
          b.y = RY - B / 2;
          accelerer(b);
          break;
        }
      }
      for (const br of briques) {
        if (!br.ok) continue;
        if (b.x + B / 2 > br.x && b.x - B / 2 < br.x + BW && b.y + B / 2 > br.y && b.y - B / 2 < br.y + BH) {
          const deCote = px + B / 2 <= br.x || px - B / 2 >= br.x + BW;
          if (deCote) { b.vx = -b.vx; b.x = px; } else { b.vy = -b.vy; b.y = py; }
          casser(br);
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
  function envoyer(force) {
    Coop.envoyerEtat({
      mode: "coop", partie, etat, s: score, v: vies, n: niveau,
      r: raquettes.map((p) => Math.round(p.x)),
      b: balles.map((b) => [Math.round(b.x), Math.round(b.y), b.collee ? 1 : 0]),
      k: briques.map((b) => (b.ok ? 1 : 0)).join(""),
    }, force);
  }

  let partieVue = 0, partieEnregistree = 0;
  function recevoir(e) {
    if (Coop.role !== "partenaire" || e.mode !== "coop") return;
    if (e.etat === "jeu" && e.partie !== partieVue) {
      // l'hôte lance une partie coop : on la rejoint (même en pleine partie solo)
      partieVue = e.partie; mode = "vue"; etat = "jeu";
      raquettes = [{ x: W / 4, min: RW / 2, max: W / 2 - RW / 2 }, { x: (3 * W) / 4, min: W / 2 + RW / 2, max: W - RW / 2 }];
      construireBriques(); cibleX = null;
      $("#overlay").hidden = true;
    }
    if (mode !== "vue" || e.partie !== partieVue) return;
    if (score !== e.s) Salle.publier(e.s, "jeu");
    score = e.s; vies = e.v; niveau = e.n;
    raquettes[0].x = e.r[0];
    balles = (e.b || []).map(([x, y, c], i) => ({ x, y, collee: !!c, proprio: i }));
    const k = e.k || "";
    briques.forEach((br, i) => { if (br.ok && k[i] === "0") { br.ok = false; eclats(br); } else if (!br.ok && k[i] === "1") br.ok = true; });
    if (e.etat === "fini" && partieEnregistree !== e.partie) {
      partieEnregistree = e.partie; etat = "fini";
      Salle.publier(score, "fini");
      Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
      mode = "menu";
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
  function dessiner() {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(25, 240, 255, 0.05)";
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 24) ctx.fillRect(0, y, W, 1);
    if (!briques.length) return;

    briques.forEach((b) => {
      if (!b.ok) return;
      rect(b.x, b.y, BW, BH, RANG_COULEUR[b.r], 8);
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(b.x + 3, b.y + 3, BW - 6, 3);
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(b.x + 3, b.y + BH - 4, BW - 6, 2);
    });
    particules.forEach((p) => { ctx.globalAlpha = Math.max(0, p.t * 2); rect(p.x, p.y, 3, 3, p.c); });
    ctx.globalAlpha = 1;
    if (raquettes.length > 1) {
      ctx.fillStyle = "rgba(216,249,255,0.25)";
      for (let y = RY - 60; y < H; y += 12) ctx.fillRect(W / 2 - 1, y, 2, 6);
    }
    raquettes.forEach((p, i) => {
      rect(p.x - RW / 2, RY, RW, RH, COUL_JOUEUR[i], 16);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(p.x - RW / 2 + 4, RY + 2, RW - 8, 3);
    });
    if (etat === "jeu") balles.forEach((b) => rect(b.x - B / 2, b.y - B / 2, B, B, "#ffffff", 14));

    $("#score").textContent = score;
    $("#vies").textContent = vies;
    $("#niveau").textContent = niveau;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.033, (t - avant) / 1000); avant = t;
    particules.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.t -= dt; });
    particules = particules.filter((p) => p.t > 0);

    if (etat === "jeu" && (mode === "solo" || mode === "coop")) simuler(dt);
    if (mode === "coop") envoyer(false);
    if (mode === "vue" && etat === "jeu") bougerRaquette(raquettes[1], dt);
    if (Coop.role === "partenaire") Coop.envoyerEntree({ x: raquettes[1] && mode === "vue" ? Math.round(raquettes[1].x) : 0, lancer: monLancer });
    // le menu de l'hôte se met à jour quand le partenaire arrive ou part
    if (etat !== "jeu" && Coop.role === "hote") menu($("#ov-titre").textContent, $("#ov-texte").textContent);

    dessiner();
    requestAnimationFrame(boucle);
  }

  window.__breakout = {
    get mode() { return mode; }, get etat() { return etat; }, get score() { return score; }, get vies() { return vies; }, get niveau() { return niveau; },
    get briques() { return briques; }, get balles() { return balles; }, get raquettes() { return raquettes; },
    get balle() { return balles[0]; }, get collee() { return balles[0] && balles[0].collee; },
    lancer: lancerLeMien, nouvellePartie, viser(x) { cibleX = x; },
  };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Coop.demarrer(JEU, { surEtat: recevoir, surRoles: () => { if (etat !== "jeu") menu($("#ov-titre").textContent || "BREAKOUT", $("#ov-texte").textContent); } });
  menu("BREAKOUT", "");
  requestAnimationFrame(boucle);
})();
