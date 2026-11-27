/* ============================================================
   SNAKE
   Grille 24 × 24. Le serpent grandit à chaque fruit ; il meurt s'il
   touche un mur ou sa propre queue.
   Vitesse : un pas toutes les  140 ms × 0,97^fruits  (minimum 55 ms)
   Score : 10 par fruit, 50 par fruit doré (il apparaît parfois et
   disparaît au bout de 5 secondes).
   ============================================================ */
(function () {
  const JEU = "snake";
  const N = 24, T = 20;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  let serpent, dir, file, fruit, dore, score, fruits, etat = "menu", chrono = 0, mort = 0;

  const delai = () => Math.max(55, 140 * Math.pow(0.97, fruits));
  const caseLibre = () => {
    let p;
    do { p = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 }; }
    while (serpent.some((s) => s.x === p.x && s.y === p.y) || (fruit && fruit.x === p.x && fruit.y === p.y));
    return p;
  };

  function nouvellePartie() {
    serpent = [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
    dir = { x: 1, y: 0 }; file = [];
    fruit = null; fruit = caseLibre(); dore = null;
    score = 0; fruits = 0; chrono = 0;
    etat = "jeu";
    cacherOverlay();
    Salle.publier(0, "jeu", true);
  }

  function changerDirection(x, y) {
    if (etat !== "jeu") return;
    const derniere = file.length ? file[file.length - 1] : dir;
    if ((x === -derniere.x && y === -derniere.y) || (x === derniere.x && y === derniere.y)) return; // pas de demi-tour
    if (file.length < 3) file.push({ x, y });
  }

  function pas() {
    if (file.length) dir = file.shift();
    const tete = { x: serpent[0].x + dir.x, y: serpent[0].y + dir.y };
    const mange = tete.x === fruit.x && tete.y === fruit.y;
    const mangeDore = dore && tete.x === dore.x && tete.y === dore.y;
    const corps = mange || mangeDore ? serpent : serpent.slice(0, -1);
    if (tete.x < 0 || tete.y < 0 || tete.x >= N || tete.y >= N || corps.some((s) => s.x === tete.x && s.y === tete.y)) {
      return finPartie();
    }
    serpent.unshift(tete);
    if (mange) {
      score += 10; fruits++;
      fruit = caseLibre();
      if (!dore && Math.random() < 0.2) dore = Object.assign(caseLibre(), { jusqua: performance.now() + 5000 });
      Salle.publier(score, "jeu");
    } else if (mangeDore) {
      score += 50; fruits++; dore = null;
      Salle.publier(score, "jeu");
    } else {
      serpent.pop();
    }
    if (dore && performance.now() > dore.jusqua) dore = null;
  }

  function finPartie() {
    etat = "fini"; mort = 0.6;
    Salle.publier(score, "fini");
    Scores.enregistrer(JEU, score, Salle.pseudo()).catch(() => {});
    afficherOverlay("GAME OVER", `Score ${score} · longueur ${serpent.length}`, "Rejouer");
  }

  // ---------- Commandes ----------
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu" && (k === " " || k === "enter")) { e.preventDefault(); nouvellePartie(); return; }
    const d = { arrowup: [0, -1], z: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], q: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
    if (d) { e.preventDefault(); changerDirection(d[0], d[1]); }
  });
  // glisser le doigt sur le terrain
  let depart = null;
  canvas.addEventListener("pointerdown", (e) => { depart = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointermove", (e) => {
    if (!depart) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
    if (Math.hypot(dx, dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) changerDirection(Math.sign(dx), 0); else changerDirection(0, Math.sign(dy));
    depart = { x: e.clientX, y: e.clientY };
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => canvas.addEventListener(ev, () => { depart = null; }));
  document.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const [x, y] = b.dataset.dir.split(",").map(Number);
    changerDirection(x, y);
  }));

  // ---------- Dessin ----------
  function carre(x, y, couleur, flou, marge) {
    ctx.fillStyle = couleur; ctx.shadowColor = couleur; ctx.shadowBlur = flou;
    ctx.fillRect(x * T + marge, y * T + marge, T - 2 * marge, T - 2 * marge);
    ctx.shadowBlur = 0;
  }
  function dessiner(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(61, 255, 122, 0.06)";
    for (let i = 1; i < N; i++) { ctx.fillRect(i * T, 0, 1, N * T); ctx.fillRect(0, i * T, N * T, 1); }
    if (!serpent) return;
    // fruit qui pulse
    const p = 2 + Math.round(Math.sin(t / 150) + 1);
    carre(fruit.x, fruit.y, "#ff2bd6", 16, p);
    if (dore) carre(dore.x, dore.y, (t / 120) % 2 < 1 ? "#ffe14d" : "#fff6b0", 20, 2);
    // serpent : tête plus claire, dégradé vers la queue
    serpent.forEach((s, i) => {
      const a = 1 - (i / serpent.length) * 0.6;
      carre(s.x, s.y, i === 0 ? "#b6ffcf" : `rgba(61, 255, 122, ${a})`, i === 0 ? 18 : 8, 1);
    });
    // yeux
    const h = serpent[0];
    ctx.fillStyle = "#000";
    const ox = dir.y !== 0 ? [5, 12] : [dir.x > 0 ? 12 : 5, dir.x > 0 ? 12 : 5];
    const oy = dir.x !== 0 ? [5, 12] : [dir.y > 0 ? 12 : 5, dir.y > 0 ? 12 : 5];
    ctx.fillRect(h.x * T + ox[0], h.y * T + oy[0], 3, 3);
    ctx.fillRect(h.x * T + ox[1], h.y * T + oy[1], 3, 3);
    if (mort > 0) { ctx.fillStyle = `rgba(255, 59, 59, ${mort})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    $("#score").textContent = score;
    $("#longueur").textContent = serpent.length;
    $("#vitesse").textContent = "×" + (140 / delai()).toFixed(1);
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
    const dt = Math.min(100, t - avant); avant = t;
    if (etat === "jeu") {
      chrono += dt;
      while (chrono >= delai() && etat === "jeu") { chrono -= delai(); pas(); }
    }
    if (mort > 0) mort = Math.max(0, mort - dt / 800);
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__snake = { get etat() { return etat; }, get score() { return score; }, get serpent() { return serpent; }, get fruit() { return fruit; }, changerDirection, nouvellePartie };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  afficherOverlay("SNAKE", "Flèches (ou Z Q S D) · sur téléphone : glisse le doigt", "Jouer");
  requestAnimationFrame(boucle);
})();
