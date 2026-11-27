/* ============================================================
   BREAKOUT
   Casse toutes les briques avec la balle. 3 vies.
   Briques : rouge 70 · orange 50 · vert 30 · jaune 10
   Vitesse de la balle (sans maximum, comme Pong) :
     v = 300 × (1 + 0,3 × ln(1 + n)) × (1 + 0,08 × (niveau − 1))
     n = nombre de rebonds sur raquette / briques depuis le lancer
   Briques toutes cassées → niveau suivant, un peu plus rapide.
   ============================================================ */
(function () {
  const JEU = "breakout";
  const W = 480, H = 600;
  const COLS = 10, RANGS = 8, BW = 44, BH = 16, ESP = 4, HAUT = 70, GAUCHE = 2;
  const RW = 80, RH = 12, RY = H - 40, B = 8;
  const RANG_COULEUR = ["#ff3b3b", "#ff3b3b", "#ff8a1f", "#ff8a1f", "#3dff7a", "#3dff7a", "#ffe14d", "#ffe14d"];
  const RANG_POINTS = [70, 70, 50, 50, 30, 30, 10, 10];
  const ANGLE_MAX = (60 * Math.PI) / 180;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  let etat = "menu", score = 0, vies = 3, niveau = 1, rebonds = 0;
  let briques = [], raquette = W / 2, balle = null, collee = true, particules = [];

  const vitesse = () => 300 * (1 + 0.3 * Math.log(1 + rebonds)) * (1 + 0.08 * (niveau - 1));

  function construireBriques() {
    briques = [];
    for (let r = 0; r < RANGS; r++) for (let c = 0; c < COLS; c++)
      briques.push({ x: GAUCHE + c * (BW + ESP), y: HAUT + r * (BH + ESP), r, ok: true });
  }

  function poserBalle() {
    collee = true; rebonds = 0;
    balle = { x: raquette, y: RY - B / 2 - 1, vx: 0, vy: 0 };
  }

  function nouvellePartie() {
    score = 0; vies = 3; niveau = 1;
    construireBriques(); poserBalle();
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  function lancer() {
    if (etat !== "jeu" || !collee) return;
    collee = false;
    const a = (Math.random() * 2 - 1) * 0.35;
    const v = vitesse();
    balle.vx = v * Math.sin(a); balle.vy = -v * Math.cos(a);
  }

  // garder la direction, ajuster la vitesse au nombre de rebonds
  function accelerer() {
    rebonds++;
    const v = vitesse(), n = Math.hypot(balle.vx, balle.vy) || 1;
    balle.vx *= v / n; balle.vy *= v / n;
  }

  // ---------- Commandes ----------
  const touches = { g: false, d: false };
  let cibleX = null;
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu") { if (k === " " || k === "enter") { e.preventDefault(); nouvellePartie(); } return; }
    if (k === "arrowleft" || k === "q" || k === "a") { touches.g = true; cibleX = null; }
    if (k === "arrowright" || k === "d") { touches.d = true; cibleX = null; }
    if (k === " " || k === "arrowup" || k === "z" || k === "w") { e.preventDefault(); lancer(); }
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "q" || k === "a") touches.g = false;
    if (k === "arrowright" || k === "d") touches.d = false;
  });
  const xCanvas = (e) => { const r = canvas.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * W; };
  canvas.addEventListener("pointermove", (e) => { cibleX = xCanvas(e); });
  canvas.addEventListener("pointerdown", (e) => { cibleX = xCanvas(e); lancer(); });

  // ---------- Mise à jour ----------
  function casser(b) {
    b.ok = false;
    score += RANG_POINTS[b.r];
    for (let i = 0; i < 8; i++) particules.push({ x: b.x + BW / 2, y: b.y + BH / 2, vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, t: 0.5, c: RANG_COULEUR[b.r] });
    Salle.publier(score, "jeu");
  }

  function mettreAJour(dt) {
    // raquette
    const v = 560;
    if (cibleX != null) raquette = cibleX;
    else raquette += ((touches.d ? 1 : 0) - (touches.g ? 1 : 0)) * v * dt;
    raquette = Math.max(RW / 2, Math.min(W - RW / 2, raquette));

    particules.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; p.t -= dt; });
    particules = particules.filter((p) => p.t > 0);

    if (collee) { balle.x = raquette; balle.y = RY - B / 2 - 1; return; }

    // petits pas : la balle ne traverse jamais une brique, même très vite
    const n = Math.max(1, Math.ceil((Math.hypot(balle.vx, balle.vy) * dt) / 4));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const px = balle.x, py = balle.y;
      balle.x += balle.vx * h; balle.y += balle.vy * h;

      // murs
      if (balle.x < B / 2) { balle.x = B / 2; balle.vx = Math.abs(balle.vx); }
      if (balle.x > W - B / 2) { balle.x = W - B / 2; balle.vx = -Math.abs(balle.vx); }
      if (balle.y < B / 2) { balle.y = B / 2; balle.vy = Math.abs(balle.vy); }

      // raquette : l'angle dépend de l'endroit touché
      if (balle.vy > 0 && balle.y + B / 2 >= RY && py + B / 2 <= RY + 2 && Math.abs(balle.x - raquette) <= RW / 2 + B / 2) {
        const dec = Math.max(-1, Math.min(1, (balle.x - raquette) / (RW / 2)));
        const a = dec * ANGLE_MAX;
        const v = Math.hypot(balle.vx, balle.vy);
        balle.vx = v * Math.sin(a); balle.vy = -v * Math.cos(a);
        balle.y = RY - B / 2;
        accelerer();
      }

      // briques (une par pas)
      for (const b of briques) {
        if (!b.ok) continue;
        if (balle.x + B / 2 > b.x && balle.x - B / 2 < b.x + BW && balle.y + B / 2 > b.y && balle.y - B / 2 < b.y + BH) {
          const venaitDeCote = px + B / 2 <= b.x || px - B / 2 >= b.x + BW;
          if (venaitDeCote) { balle.vx = -balle.vx; balle.x = px; }
          else { balle.vy = -balle.vy; balle.y = py; }
          casser(b);
          accelerer();
          break;
        }
      }

      if (balle.y > H + B) {
        vies--;
        if (vies <= 0) return finPartie();
        poserBalle();
        return;
      }
    }

    if (briques.every((b) => !b.ok)) { niveau++; construireBriques(); poserBalle(); }
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
  function rect(x, y, w, h, c, flou) {
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = flou || 0;
    ctx.fillRect(x, y, w, h); ctx.shadowBlur = 0;
  }
  function dessiner() {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(25, 240, 255, 0.05)";
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 24) ctx.fillRect(0, y, W, 1);
    if (etat === "menu") return;

    briques.forEach((b) => {
      if (!b.ok) return;
      rect(b.x, b.y, BW, BH, RANG_COULEUR[b.r], 8);
      ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(b.x + 3, b.y + 3, BW - 6, 3);
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(b.x + 3, b.y + BH - 4, BW - 6, 2);
    });
    particules.forEach((p) => { ctx.globalAlpha = Math.max(0, p.t * 2); rect(p.x, p.y, 3, 3, p.c); });
    ctx.globalAlpha = 1;
    rect(raquette - RW / 2, RY, RW, RH, "#19f0ff", 16);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(raquette - RW / 2 + 4, RY + 2, RW - 8, 3);
    if (balle && etat === "jeu") rect(balle.x - B / 2, balle.y - B / 2, B, B, "#ffffff", 14);

    $("#score").textContent = score;
    $("#vies").textContent = vies;
    $("#niveau").textContent = niveau;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.033, (t - avant) / 1000); avant = t;
    if (etat === "jeu") mettreAJour(dt);
    dessiner();
    requestAnimationFrame(boucle);
  }

  window.__breakout = { get etat() { return etat; }, get score() { return score; }, get vies() { return vies; }, get niveau() { return niveau; },
    get briques() { return briques; }, get balle() { return balle; }, get collee() { return collee; }, lancer, nouvellePartie,
    viser(x) { cibleX = x; } };

  $("#ov-bouton").addEventListener("click", nouvellePartie);
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  $("#ov-titre").textContent = "BREAKOUT";
  $("#ov-bouton").textContent = "Jouer";
  requestAnimationFrame(boucle);
})();
