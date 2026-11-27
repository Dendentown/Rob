/* ============================================================
   NÉON DASH
   Le cube avance tout seul : on saute (clic, tap, Espace — on peut
   garder appuyé) pour éviter les piques et les trous, monter sur
   les blocs et les plateformes.
   - tremplin jaune : grand saut automatique
   - anneau jaune : appuie en le traversant pour sauter en l'air
   Parcours infini, de plus en plus dense.
   Vitesse : 330 × (1 + 0,15 × ln(1 + distance / 3000)) px/s
   Score : distance en mètres (1 bloc = 1 m).
   ============================================================ */
(function () {
  const JEU = "dash";
  const W = 800, H = 450, SOL = 360, U = 30, X_CUBE = 180;
  const GRAVITE = 2600, SAUT = -820, SAUT_TREMPLIN = -1120;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  const vitesse = (d) => 330 * (1 + 0.15 * Math.log(1 + d / 3000));

  // ---------- Motifs d'obstacles (x et hauteurs en blocs) ----------
  // p = pique, b = bloc (h = hauteur de la base), t = trou (largeur l), r = tremplin, a = anneau
  const MOTIFS = [
    { min: 0,    l: 1,  e: [["p", 0]] },
    { min: 0,    l: 2,  e: [["p", 0], ["p", 1]] },
    { min: 0,    l: 3,  e: [["b", 0, 0]] },
    { min: 400,  l: 3,  e: [["p", 0], ["p", 1], ["p", 2]] },
    { min: 300,  l: 7,  e: [["b", 0, 0], ["p", 3], ["p", 4], ["b", 6, 0]] },
    { min: 600,  l: 9,  e: [["b", 0, 0], ["b", 3, 0], ["b", 3, 1], ["b", 6, 0], ["b", 6, 1], ["b", 6, 2]] },
    { min: 500,  l: 3,  e: [["t", 0, 3]] },
    { min: 900,  l: 8,  e: [["b", 0, 2], ["b", 1, 2], ["b", 2, 2], ["b", 3, 2], ["b", 4, 2], ["b", 5, 2], ["p", 1], ["p", 2], ["p", 3], ["p", 4]] },
    { min: 1200, l: 8,  e: [["r", 0], ["p", 2], ["p", 3], ["p", 4], ["p", 5], ["p", 6]] },
    { min: 1500, l: 7,  e: [["p", 0], ["t", 2, 3], ["p", 6]] },
    { min: 1800, l: 9,  e: [["p", 0], ["p", 1], ["p", 2], ["a", 3, 3], ["p", 3], ["p", 4], ["p", 5], ["p", 6], ["p", 7]] },
    { min: 2200, l: 10, e: [["b", 0, 0], ["b", 1, 0], ["p", 2], ["p", 3], ["b", 4, 1], ["p", 5], ["p", 6], ["b", 7, 2], ["b", 8, 2]] },
    { min: 2600, l: 6,  e: [["t", 0, 2], ["p", 3], ["p", 4], ["p", 5]] },
  ];

  // ---------- État ----------
  let etat = "menu", distance = 0, prochainX = 0;
  let cube, objets = [], trous = [], particules = [], appui = false, fin = 0;

  function nouvellePartie() {
    cube = { y: SOL - U, vy: 0, sol: true, rot: 0 };
    distance = 0; objets = []; trous = []; particules = [];
    prochainX = X_CUBE + 700;
    etat = "jeu"; fin = 0;
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  // ajoute des motifs devant le joueur
  function generer() {
    while (prochainX < distance + X_CUBE + W + 200) {
      const dispo = MOTIFS.filter((m) => m.min <= distance / U);
      const m = dispo[(Math.random() * dispo.length) | 0];
      const x0 = prochainX;
      m.e.forEach(([type, dx, h]) => {
        const x = x0 + dx * U;
        if (type === "t") trous.push({ x1: x, x2: x + h * U });
        else objets.push({ type, x, h: h || 0, utilise: false });
      });
      // écart minimal = environ un saut, pour toujours pouvoir retomber entre deux motifs
      const v = vitesse(distance);
      let ecart = Math.max(0.65 * v, (10 - distance / U / 400) * U) + Math.random() * 4 * U;
      if (m.e.some((e) => e[0] === "r")) ecart += 0.6 * v; // le tremplin envoie loin
      prochainX = x0 + m.l * U + ecart;
    }
    objets = objets.filter((o) => o.x > distance - 100);
    trous = trous.filter((t) => t.x2 > distance - 100);
  }

  const score = () => Math.floor(distance / U);

  // ---------- Commandes ----------
  function presser() {
    if (etat === "fini" && fin <= 0) { nouvellePartie(); return; }
    appui = true;
  }
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.key === " " || e.key === "ArrowUp" || e.key.toLowerCase() === "z" || e.key.toLowerCase() === "w") {
      e.preventDefault();
      if (etat === "menu") nouvellePartie(); else presser();
    }
  });
  addEventListener("keyup", (e) => { if (e.key === " " || e.key === "ArrowUp" || e.key.toLowerCase() === "z" || e.key.toLowerCase() === "w") appui = false; });
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); if (etat === "jeu") presser(); });
  addEventListener("pointerup", () => { appui = false; });
  addEventListener("pointercancel", () => { appui = false; });

  // ---------- Mise à jour ----------
  function mourir() {
    etat = "fini"; fin = 0.6;
    const cx = X_CUBE + U / 2, cy = cube.y + U / 2;
    for (let i = 0; i < 30; i++) particules.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 600, vy: (Math.random() - 0.7) * 600, t: 0.8, c: Math.random() < 0.5 ? "#19f0ff" : "#ff2bd6" });
    Salle.publier(score(), "fini");
    Scores.enregistrer(JEU, score(), Salle.pseudo()).catch(() => {});
    setTimeout(() => {
      $("#ov-titre").textContent = "GAME OVER";
      $("#ov-texte").textContent = score() + " m";
      $("#ov-bouton").textContent = "Rejouer";
      $("#overlay").hidden = false;
    }, 600);
  }

  function auDessusDuVide(xMonde) {
    // le cube tombe seulement si ses deux bords sont au-dessus d'un trou
    return trous.some((t) => xMonde + 4 >= t.x1 && xMonde + U - 4 <= t.x2);
  }

  function mettreAJour(dt) {
    const v = vitesse(distance);
    distance += v * dt;
    generer();
    const xg = distance + X_CUBE; // bord gauche du cube dans le monde

    // saut
    if (appui && cube.sol) { cube.vy = SAUT; cube.sol = false; }

    const yAvant = cube.y;
    cube.vy += GRAVITE * dt;
    cube.y += cube.vy * dt;
    cube.sol = false;

    // sol (sauf au-dessus d'un trou)
    if (cube.y + U >= SOL && !auDessusDuVide(xg)) {
      if (yAvant + U <= SOL + 8) { cube.y = SOL - U; cube.vy = 0; cube.sol = true; }
    }
    if (cube.y > H) return mourir();

    for (const o of objets) {
      if (o.x > xg + U + 2 || o.x + U < xg - 2) continue;
      if (o.type === "p") {
        // pique : zone dangereuse plus petite que le dessin
        const haut = SOL - U + 12;
        if (xg + U - 6 > o.x + 9 && xg + 6 < o.x + U - 9 && cube.y + U > haut) return mourir();
      } else if (o.type === "b") {
        const top = SOL - U * (o.h + 1), bas = top + U;
        if (xg + U > o.x + 2 && xg < o.x + U - 2 && cube.y + U > top && cube.y < bas) {
          if (yAvant + U <= top + 10 && cube.vy >= 0) { cube.y = top - U; cube.vy = 0; cube.sol = true; }
          else return mourir();
        }
      } else if (o.type === "r") {
        if (xg + U > o.x && xg < o.x + U && cube.y + U >= SOL - 8) { cube.vy = SAUT_TREMPLIN; cube.sol = false; o.utilise = true; }
      } else if (o.type === "a") {
        const ay = SOL - U * (o.h + 0.5);
        if (!o.utilise && appui && Math.abs(xg + U / 2 - (o.x + U / 2)) < U && Math.abs(cube.y + U / 2 - ay) < U) { cube.vy = SAUT; o.utilise = true; }
      }
    }
    // atterrissage sur un bloc en roulant d'un bloc voisin
    if (cube.sol) cube.rot = Math.round(cube.rot / (Math.PI / 2)) * (Math.PI / 2);
    else cube.rot += dt * 7.5;

    // traînée
    if (cube.sol && Math.random() < 0.6) particules.push({ x: X_CUBE, y: cube.y + U - 2, vx: -v * 0.3, vy: -Math.random() * 60, t: 0.3, c: "#19f0ff" });
    Salle.publier(score(), "jeu");
  }

  // ---------- Dessin ----------
  function teinte() {
    // le fond change doucement de couleur avec la distance
    const h = (280 + distance / 40) % 360;
    return `hsl(${h}, 80%, 8%)`;
  }

  function dessiner(t) {
    ctx.fillStyle = teinte(); ctx.fillRect(0, 0, W, H);
    // grille de fond (parallaxe lente)
    ctx.fillStyle = "rgba(255, 43, 214, 0.12)";
    const dx = (distance * 0.3) % 60;
    for (let x = -dx; x < W; x += 60) ctx.fillRect(x, 0, 1, SOL);
    for (let y = 0; y < SOL; y += 60) ctx.fillRect(0, y, W, 1);

    // sol
    const ox = distance;
    ctx.fillStyle = "#05010f"; ctx.fillRect(0, SOL, W, H - SOL);
    ctx.fillStyle = "#19f0ff"; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 12;
    // ligne du sol interrompue par les trous
    let x = 0;
    const tri = trous.map((tr) => [tr.x1 - ox, tr.x2 - ox]).filter(([a, b]) => b > 0 && a < W).sort((a, b) => a[0] - b[0]);
    tri.forEach(([a, b]) => { if (a > x) ctx.fillRect(x, SOL, a - x, 3); x = Math.max(x, b); });
    if (x < W) ctx.fillRect(x, SOL, W - x, 3);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(25, 240, 255, 0.15)";
    for (let gx = -(ox % 30); gx < W; gx += 30) ctx.fillRect(gx, SOL + 3, 1, H - SOL);
    tri.forEach(([a, b]) => { ctx.fillStyle = "#000"; ctx.fillRect(a, SOL, b - a, H - SOL); });

    // objets
    objets.forEach((o) => {
      const X = o.x - ox;
      if (X < -U || X > W) return;
      if (o.type === "p") {
        ctx.fillStyle = "#ff2bd6"; ctx.shadowColor = "#ff2bd6"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(X, SOL); ctx.lineTo(X + U / 2, SOL - U); ctx.lineTo(X + U, SOL); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = "#05010f";
        ctx.beginPath(); ctx.moveTo(X + 8, SOL); ctx.lineTo(X + U / 2, SOL - U + 14); ctx.lineTo(X + U - 8, SOL); ctx.closePath(); ctx.fill();
      } else if (o.type === "b") {
        const Y = SOL - U * (o.h + 1);
        ctx.fillStyle = "#0c0424"; ctx.fillRect(X, Y, U, U);
        ctx.strokeStyle = "#19f0ff"; ctx.lineWidth = 2; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 8;
        ctx.strokeRect(X + 1, Y + 1, U - 2, U - 2); ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(25,240,255,0.25)"; ctx.fillRect(X + 8, Y + 8, U - 16, U - 16);
      } else if (o.type === "r") {
        ctx.fillStyle = "#ffe14d"; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 14;
        ctx.fillRect(X + 3, SOL - 6, U - 6, 6); ctx.shadowBlur = 0;
      } else if (o.type === "a") {
        const Y = SOL - U * (o.h + 0.5);
        ctx.strokeStyle = o.utilise ? "rgba(255,225,77,0.3)" : "#ffe14d"; ctx.lineWidth = 3; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = o.utilise ? 0 : 14;
        ctx.beginPath(); ctx.arc(X + U / 2, Y, 11 + Math.sin(t / 120) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
      }
    });

    // particules
    particules.forEach((p) => { ctx.globalAlpha = Math.max(0, p.t * 2); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 4, 4); });
    ctx.globalAlpha = 1;

    // cube
    if (cube && etat !== "fini") {
      ctx.save();
      ctx.translate(X_CUBE + U / 2, cube.y + U / 2);
      ctx.rotate(cube.rot);
      ctx.fillStyle = "#19f0ff"; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 16;
      ctx.fillRect(-U / 2, -U / 2, U, U); ctx.shadowBlur = 0;
      ctx.fillStyle = "#05010f"; ctx.fillRect(-U / 2 + 4, -U / 2 + 4, U - 8, U - 8);
      ctx.fillStyle = "#ff2bd6"; ctx.fillRect(-U / 2 + 8, -U / 2 + 8, U - 16, U - 16);
      ctx.fillStyle = "#ffe14d"; ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }

    $("#score").textContent = score();
    $("#vitesse").textContent = "×" + (vitesse(distance) / 330).toFixed(2);
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.025, (t - avant) / 1000); avant = t;
    if (etat === "jeu") mettreAJour(dt);
    if (fin > 0) fin -= dt;
    particules.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.t -= dt; });
    particules = particules.filter((p) => p.t > 0);
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__dash = { get etat() { return etat; }, get distance() { return distance; }, get cube() { return cube; }, get objets() { return objets; }, get trous() { return trous; },
    set appui(v) { appui = v; }, nouvellePartie, X_CUBE, U, SOL };

  $("#ov-bouton").addEventListener("click", nouvellePartie);
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  $("#ov-titre").textContent = "NÉON DASH";
  $("#ov-bouton").textContent = "Jouer";
  requestAnimationFrame(boucle);
})();
