/* ============================================================
   FLAPPY BIRD
   Un clic / un tap / Espace = un battement d'ailes. Passe entre les
   tuyaux sans les toucher ni toucher le sol.
   Vitesse de défilement : 170 × (1 + 0,12 × ln(1 + score)) px/s
     (augmente doucement, sans maximum)
   Écart entre les tuyaux : 165 px, qui se resserre jusqu'à 125 px.
   Score : 1 point par tuyau franchi.
   ============================================================ */
(function () {
  const JEU = "flappy";
  const W = 400, H = 600, SOL = H - 64;
  const GRAVITE = 1500, BATTEMENT = -430, CHUTE_MAX = 620;
  const LARGEUR_TUYAU = 64, ESPACEMENT = 230;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  const vitesse = (s) => 170 * (1 + 0.12 * Math.log(1 + s));
  const ecart = (s) => Math.max(125, 165 - s * 1.5);

  // Oiseau en pixel art (chaque caractère = 1 pixel × 3)
  const SPRITE = [
    "....YYYYY...",
    "..YYYYYWWW..",
    ".YYYYYWWBWW.",
    "YYYYYYWWBWW.",
    "YWWWWYYWWWW.",
    "WWWWWWYYOOOO",
    "YWWWWYYOOOO.",
    ".YYYYYYYOOO.",
    "..YYYYYYY...",
  ];
  const COUL = { Y: "#ffe14d", W: "#ffffff", B: "#05010f", O: "#ff8a1f" };
  const PX = 3, BW = SPRITE[0].length * PX, BH = SPRITE.length * PX;

  let oiseau, tuyaux, score, etat = "menu", defile = 0, etoiles = [], flash = 0;
  for (let i = 0; i < 50; i++) etoiles.push({ x: Math.random() * W, y: Math.random() * SOL * 0.8, v: 0.2 + Math.random() * 0.6 });

  function preparer() {
    oiseau = { x: 110, y: H / 2 - 40, v: 0, angle: 0 };
    tuyaux = []; score = 0; defile = 0;
  }

  function nouvellePartie() {
    preparer();
    etat = "pret";
    cacherOverlay();
    Salle.publier(0, "jeu", true);
  }

  function battre() {
    if (etat === "pret") { etat = "jeu"; ajouterTuyau(W + 40); }
    if (etat === "jeu") oiseau.v = BATTEMENT;
  }

  function ajouterTuyau(x) {
    const e = ecart(score);
    const haut = 70 + Math.random() * (SOL - 140 - e);
    tuyaux.push({ x, haut, bas: haut + e, passe: false });
  }

  function collision() {
    const m = 4; // un peu de tolérance
    const ox1 = oiseau.x - BW / 2 + m, ox2 = oiseau.x + BW / 2 - m, oy1 = oiseau.y - BH / 2 + m, oy2 = oiseau.y + BH / 2 - m;
    if (oy2 >= SOL) return true;
    return tuyaux.some((t) => ox2 > t.x && ox1 < t.x + LARGEUR_TUYAU && (oy1 < t.haut || oy2 > t.bas));
  }

  function mettreAJour(dt) {
    defile += (etat === "fini" ? 0 : vitesse(score)) * dt;
    etoiles.forEach((s) => { s.x -= s.v * (etat === "fini" ? 0 : 1); if (s.x < 0) s.x = W; });
    if (etat === "pret") { oiseau.y = H / 2 - 40 + Math.sin(performance.now() / 200) * 8; return; }
    if (etat !== "jeu" && etat !== "fini") return;

    oiseau.v = Math.min(CHUTE_MAX, oiseau.v + GRAVITE * dt);
    oiseau.y = Math.min(SOL - BH / 2, oiseau.y + oiseau.v * dt);
    oiseau.angle = Math.max(-0.45, Math.min(1.3, oiseau.v / 500));
    if (etat === "fini") return;

    const v = vitesse(score);
    tuyaux.forEach((t) => {
      t.x -= v * dt;
      if (!t.passe && t.x + LARGEUR_TUYAU < oiseau.x - BW / 2) { t.passe = true; score++; Salle.publier(score, "jeu"); }
    });
    if (tuyaux.length && tuyaux[0].x < -LARGEUR_TUYAU) tuyaux.shift();
    const dernier = tuyaux[tuyaux.length - 1];
    if (!dernier || dernier.x < W - ESPACEMENT) ajouterTuyau((dernier ? dernier.x : W) + ESPACEMENT);
    if (oiseau.y - BH / 2 < -40) oiseau.y = -40 + BH / 2;

    if (collision()) finPartie();
  }

  function finPartie() {
    etat = "fini"; flash = 0.7;
    oiseau.v = Math.max(oiseau.v, 0);
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    setTimeout(() => afficherOverlay("GAME OVER", String(score), "Rejouer"), 700);
  }

  // ---------- Commandes ----------
  addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "ArrowUp" || e.key.toLowerCase() === "z" || e.key.toLowerCase() === "w") {
      e.preventDefault();
      if (etat === "menu" || (etat === "fini" && !$("#overlay").hidden)) nouvellePartie();
      else battre();
    }
  });
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); battre(); });

  // ---------- Dessin ----------
  function dessinerOiseau() {
    ctx.save();
    ctx.translate(oiseau.x, oiseau.y);
    ctx.rotate(oiseau.angle);
    ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 12;
    const aile = etat === "jeu" && oiseau.v < 0 ? -1 : 0; // aile levée quand il monte
    SPRITE.forEach((ligne, y) => [...ligne].forEach((c, x) => {
      if (c === ".") return;
      let yy = y;
      if (c === "W" && x < 6 && y >= 4 && y <= 6) yy += aile * 2;
      ctx.fillStyle = COUL[c];
      ctx.fillRect(x * PX - BW / 2, yy * PX - BH / 2, PX, PX);
    }));
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  function dessinerTuyau(t) {
    const x = Math.round(t.x);
    ctx.shadowColor = "#3dff7a"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#0c3a1c";
    ctx.fillRect(x, 0, LARGEUR_TUYAU, t.haut);
    ctx.fillRect(x, t.bas, LARGEUR_TUYAU, SOL - t.bas);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#3dff7a"; ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, -5, LARGEUR_TUYAU - 3, t.haut + 5);
    ctx.strokeRect(x + 1.5, t.bas, LARGEUR_TUYAU - 3, SOL - t.bas + 5);
    // embouts
    ctx.fillStyle = "#3dff7a";
    ctx.fillRect(x - 5, t.haut - 18, LARGEUR_TUYAU + 10, 18);
    ctx.fillRect(x - 5, t.bas, LARGEUR_TUYAU + 10, 18);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + 8, 0, 6, t.haut - 18);
    ctx.fillRect(x + 8, t.bas + 18, 6, SOL - t.bas - 18);
  }

  function dessiner() {
    const g = ctx.createLinearGradient(0, 0, 0, SOL);
    g.addColorStop(0, "#05010f"); g.addColorStop(1, "#2a0a4a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(216, 249, 255, 0.7)";
    etoiles.forEach((s) => ctx.fillRect(s.x | 0, s.y | 0, 2, 2));
    // soleil rétro
    ctx.fillStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(W / 2, SOL - 10, 90, Math.PI, 0); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#2a0a4a";
    for (let i = 0; i < 6; i++) ctx.fillRect(W / 2 - 95, SOL - 20 - i * 14, 190, 3 + i * 0.6);

    if (tuyaux) tuyaux.forEach(dessinerTuyau);

    // sol en grille qui défile
    ctx.fillStyle = "#05010f"; ctx.fillRect(0, SOL, W, H - SOL);
    ctx.fillStyle = "#ff2bd6"; ctx.fillRect(0, SOL, W, 3);
    ctx.fillStyle = "rgba(255, 43, 214, 0.55)";
    for (let x = -(defile % 32); x < W; x += 32) ctx.fillRect(x | 0, SOL + 3, 2, H - SOL);
    for (let y = SOL + 18; y < H; y += 16) ctx.fillRect(0, y, W, 1);

    if (oiseau) dessinerOiseau();

    if (etat === "jeu" || etat === "fini" || etat === "pret") {
      ctx.font = "36px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillStyle = "#ff2bd6"; ctx.fillText(score, W / 2 + 4, 44);
      ctx.fillStyle = "#fff"; ctx.fillText(score, W / 2, 40);
    }
    if (etat === "pret") {
      ctx.font = "14px 'Press Start 2P', monospace"; ctx.fillStyle = "#19f0ff";
      ctx.fillText((performance.now() / 400) % 2 < 1 ? "PRÊT ?" : "", W / 2, H / 2 + 30);
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
    $("#score").textContent = score || 0;
    $("#vitesse").textContent = "×" + (vitesse(score || 0) / 170).toFixed(2);
  }

  // ---------- Overlay ----------
  function afficherOverlay(titre, texte, bouton) {
    $("#ov-titre").textContent = titre;
    $("#ov-texte").textContent = texte || "";
    $("#ov-bouton").textContent = bouton;
    $("#overlay").hidden = false;
  }
  function cacherOverlay() { $("#overlay").hidden = true; }
  $("#ov-bouton").addEventListener("click", nouvellePartie);

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.033, (t - avant) / 1000); avant = t;
    mettreAJour(dt);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.5);
    dessiner();
    requestAnimationFrame(boucle);
  }

  window.__flappy = { get etat() { return etat; }, get score() { return score; }, get oiseau() { return oiseau; }, get tuyaux() { return tuyaux; }, battre, nouvellePartie };

  preparer();
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  afficherOverlay("FLAPPY BIRD", "", "Jouer");
  requestAnimationFrame(boucle);
})();
