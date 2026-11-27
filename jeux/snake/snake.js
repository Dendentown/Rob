/* ============================================================
   SNAKE
   Grille 24 × 24. Le serpent grandit à chaque fruit ; il meurt s'il
   touche un mur ou un corps de serpent.
   Score : 10 par fruit, 50 par fruit doré (il apparaît parfois et
   disparaît au bout de 5 secondes).

   SOLO : un pas toutes les 140 ms × 0,97^fruits (minimum 55 ms).
   1 CONTRE 1 (lobby, hôte ★ + partenaire) : deux serpents sur le même
   terrain (vert = hôte, rose = partenaire), mêmes fruits. Celui qui se
   cogne (mur, son corps ou celui de l'autre) perd la manche ; deux têtes
   qui se rencontrent = égalité. Premier à 3 manches.
   Vitesse en 1 contre 1 : 140 ms × 0,97^(fruits / 2), minimum 70 ms.
   L'hôte calcule ; le partenaire envoie ses changements de direction.
   ============================================================ */
(function () {
  const JEU = "snake";
  const N = 24, T = 20, MANCHES = 3;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);
  const COUL = [{ corps: "61, 255, 122", tete: "#b6ffcf" }, { corps: "255, 43, 214", tete: "#ffc2f2" }];

  // mode : "menu" | "solo" | "vs" (hôte : je calcule) | "vue" (partenaire : j'affiche)
  let mode = "menu", etat = "menu", partie = 0;
  let serpents = [], fruit = null, dore = null, fruits = 0, chrono = 0, mort = 0;
  let victoires = [0, 0], points = [0, 0], pauseManche = 0, messageManche = null;

  const monIndex = () => (mode === "vue" ? 1 : 0);
  const delai = () => mode === "solo" ? Math.max(55, 140 * Math.pow(0.97, fruits)) : Math.max(70, 140 * Math.pow(0.97, fruits / 2));
  const occupe = (x, y) => serpents.some((s) => s.corps.some((c) => c.x === x && c.y === y));
  const caseLibre = () => {
    let p;
    do { p = { x: (Math.random() * N) | 0, y: (Math.random() * N) | 0 }; }
    while (occupe(p.x, p.y) || (fruit && fruit.x === p.x && fruit.y === p.y) || (dore && dore.x === p.x && dore.y === p.y));
    return p;
  };

  function placerSerpents(vs) {
    serpents = [{ corps: [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }], dir: { x: 1, y: 0 }, file: [] }];
    if (vs) {
      serpents[0].corps = [{ x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }];
      serpents.push({ corps: [{ x: 18, y: 15 }, { x: 19, y: 15 }, { x: 20, y: 15 }], dir: { x: -1, y: 0 }, file: [] });
    }
    fruit = null; dore = null; fruit = caseLibre(); fruits = 0; chrono = 0;
  }

  function nouvellePartie(vs) {
    mode = vs ? "vs" : "solo";
    partie = Date.now(); victoires = [0, 0]; points = [0, 0]; pauseManche = 0; messageManche = null;
    dernierN = (Coop.entree() || {}).n || 0;
    placerSerpents(vs);
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
    if (vs) envoyer(true);
  }

  // ---------- Directions ----------
  function ajouterDirection(s, x, y) {
    const derniere = s.file.length ? s.file[s.file.length - 1] : s.dir;
    if ((x === -derniere.x && y === -derniere.y) || (x === derniere.x && y === derniere.y)) return; // pas de demi-tour
    if (s.file.length < 3) s.file.push({ x, y });
  }
  // le partenaire garde ses derniers virages numérotés et les envoie
  let mesVirages = [], compteurVirages = 0, dernierN = 0;
  function changerDirection(x, y) {
    if (etat !== "jeu") return;
    if (mode === "vue") { mesVirages.push([++compteurVirages, x, y]); mesVirages = mesVirages.slice(-4); return; }
    ajouterDirection(serpents[0], x, y);
  }

  // ---------- Un pas de jeu (solo, ou hôte en 1 contre 1) ----------
  function pas() {
    const vivants = serpents.map((s) => {
      if (s.file.length) s.dir = s.file.shift();
      const tete = { x: s.corps[0].x + s.dir.x, y: s.corps[0].y + s.dir.y };
      const mange = fruit && tete.x === fruit.x && tete.y === fruit.y;
      const mangeDore = dore && tete.x === dore.x && tete.y === dore.y;
      return { s, tete, grandit: mange || mangeDore, mange, mangeDore };
    });
    // corps après le mouvement (la queue avance sauf si le serpent grandit)
    const corpsApres = vivants.map((v) => [v.tete, ...(v.grandit ? v.s.corps : v.s.corps.slice(0, -1))]);
    const morts = vivants.map((v, i) => {
      const { x, y } = v.tete;
      if (x < 0 || y < 0 || x >= N || y >= N) return true;
      if (corpsApres[i].slice(1).some((c) => c.x === x && c.y === y)) return true;
      return corpsApres.some((corps, j) => j !== i && corps.some((c) => c.x === x && c.y === y));
    });

    if (morts.some(Boolean)) {
      if (mode === "solo") return finSolo();
      return finManche(morts);
    }
    vivants.forEach((v, i) => {
      v.s.corps = corpsApres[i];
      if (v.mange) { points[i] += 10; fruits++; fruit = caseLibre(); if (!dore && Math.random() < 0.2) dore = Object.assign(caseLibre(), { jusqua: performance.now() + 5000 }); }
      if (v.mangeDore) { points[i] += 50; fruits++; dore = null; }
      if (v.grandit && i === 0) Salle.publier(points[0], "jeu");
    });
    if (dore && performance.now() > dore.jusqua) dore = null;
  }

  function finSolo() {
    etat = "fini"; mort = 0.6;
    Salle.publier(points[0], "fini");
    Scores.enregistrer(JEU, points[0], Salle.pseudo()).catch(() => {});
    menu("GAME OVER", String(points[0]));
  }

  function finManche(morts) {
    mort = 0.6;
    let gagnant = -1;
    if (morts[0] && !morts[1]) gagnant = 1;
    if (morts[1] && !morts[0]) gagnant = 0;
    if (gagnant >= 0) victoires[gagnant]++;
    messageManche = { gagnant, t: 1.6 };
    if (victoires[0] >= MANCHES || victoires[1] >= MANCHES) {
      etat = "fini";
      envoyer(true);
      finMatch(victoires[0] > victoires[1]);
    } else {
      pauseManche = 1.6;
      envoyer(true);
    }
  }

  function finMatch(gagne) {
    const i = monIndex();
    Salle.publier(points[i], "fini");
    Scores.enregistrer(JEU, points[i], Salle.pseudo()).catch(() => {});
    menu(gagne ? "VICTOIRE !" : "PERDU", victoires[i] + " – " + victoires[1 - i]);
  }

  // ---------- Réseau ----------
  const code = (c) => c.x * N + c.y;
  const decode = (n) => ({ x: Math.floor(n / N), y: n % N });
  function envoyer(force) {
    Coop.envoyerEtat({
      mode: "vs", partie, etat,
      a: serpents[0].corps.map(code), b: serpents[1].corps.map(code),
      da: [serpents[0].dir.x, serpents[0].dir.y], db: [serpents[1].dir.x, serpents[1].dir.y],
      f: fruit ? code(fruit) : -1, g: dore ? code(dore) : -1,
      w: victoires, p: points, m: messageManche ? messageManche.gagnant : -2, pm: pauseManche > 0 ? 1 : 0,
    }, force);
  }

  let partieVue = 0, partieFinie = 0, dernierMessage = "";
  function recevoir(e) {
    if (Coop.role !== "partenaire" || e.mode !== "vs") return;
    if (e.etat === "jeu" && e.partie !== partieVue) {
      partieVue = e.partie; mode = "vue"; etat = "jeu"; mesVirages = [];
      $("#overlay").hidden = true;
    }
    if (mode !== "vue" || e.partie !== partieVue) return;
    serpents = [
      { corps: e.a.map(decode), dir: { x: e.da[0], y: e.da[1] }, file: [] },
      { corps: e.b.map(decode), dir: { x: e.db[0], y: e.db[1] }, file: [] },
    ];
    fruit = e.f >= 0 ? decode(e.f) : null;
    dore = e.g >= 0 ? decode(e.g) : null;
    if (points[1] !== e.p[1]) Salle.publier(e.p[1], "jeu");
    victoires = e.w; points = e.p;
    if (e.pm && dernierMessage !== e.m + "/" + e.w) { dernierMessage = e.m + "/" + e.w; messageManche = { gagnant: e.m, t: 1.6 }; mort = 0.6; }
    if (e.etat === "fini" && partieFinie !== e.partie) {
      partieFinie = e.partie; etat = "fini"; mode = "menu";
      messageManche = { gagnant: e.m, t: 1.6 };
      finMatchPartenaire();
    }
  }
  function finMatchPartenaire() {
    Salle.publier(points[1], "fini");
    Scores.enregistrer(JEU, points[1], Salle.pseudo()).catch(() => {});
    menu(victoires[1] > victoires[0] ? "VICTOIRE !" : "PERDU", victoires[1] + " – " + victoires[0]);
  }

  // ---------- Commandes ----------
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu" && (k === " " || k === "enter") && Coop.role !== "hote") { e.preventDefault(); nouvellePartie(false); return; }
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
      boutons.push(["VS · " + Coop.noms.partenaire, () => nouvellePartie(true), !present]);
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
  function carre(x, y, couleur, flou, marge) {
    ctx.fillStyle = couleur; ctx.shadowColor = couleur; ctx.shadowBlur = flou;
    ctx.fillRect(x * T + marge, y * T + marge, T - 2 * marge, T - 2 * marge);
    ctx.shadowBlur = 0;
  }
  function dessinerSerpent(s, i) {
    const c = COUL[i];
    s.corps.forEach((p, k) => {
      const a = 1 - (k / s.corps.length) * 0.6;
      carre(p.x, p.y, k === 0 ? c.tete : `rgba(${c.corps}, ${a})`, k === 0 ? 18 : 8, 1);
    });
    const h = s.corps[0], d = s.dir;
    ctx.fillStyle = "#000";
    const ox = d.y !== 0 ? [5, 12] : [d.x > 0 ? 12 : 5, d.x > 0 ? 12 : 5];
    const oy = d.x !== 0 ? [5, 12] : [d.y > 0 ? 12 : 5, d.y > 0 ? 12 : 5];
    ctx.fillRect(h.x * T + ox[0], h.y * T + oy[0], 3, 3);
    ctx.fillRect(h.x * T + ox[1], h.y * T + oy[1], 3, 3);
  }
  function dessiner(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(61, 255, 122, 0.06)";
    for (let i = 1; i < N; i++) { ctx.fillRect(i * T, 0, 1, N * T); ctx.fillRect(0, i * T, N * T, 1); }
    if (!serpents.length) return;
    const p = 2 + Math.round(Math.sin(t / 150) + 1);
    if (fruit) carre(fruit.x, fruit.y, "#ff3b3b", 16, p);
    if (dore) carre(dore.x, dore.y, (t / 120) % 2 < 1 ? "#ffe14d" : "#fff6b0", 20, 2);
    serpents.forEach(dessinerSerpent);
    if (mort > 0) { ctx.fillStyle = `rgba(255, 59, 59, ${mort * 0.6})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    if (serpents.length > 1) {
      // manches gagnées, en haut
      ctx.font = "16px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillStyle = "#3dff7a"; ctx.fillText(victoires[0], (N * T) / 2 - 30, 10);
      ctx.fillStyle = "#d8f9ff"; ctx.fillText("–", (N * T) / 2, 10);
      ctx.fillStyle = "#ff2bd6"; ctx.fillText(victoires[1], (N * T) / 2 + 30, 10);
      if (messageManche && messageManche.t > 0) {
        const g = messageManche.gagnant;
        const nom = g === 0 ? Coop.noms.hote : g === 1 ? Coop.noms.partenaire : "";
        ctx.font = "18px 'Press Start 2P', monospace"; ctx.textBaseline = "middle";
        ctx.fillStyle = g === 0 ? "#3dff7a" : g === 1 ? "#ff2bd6" : "#ffe14d";
        ctx.fillText(g >= 0 ? "+1 " + nom : "ÉGALITÉ", (N * T) / 2, (N * T) / 2);
      }
    }
    const i = monIndex();
    const moi = serpents[i] || serpents[0];
    $("#score").textContent = points[i] || 0;
    $("#longueur").textContent = moi.corps.length;
    $("#vitesse").textContent = "×" + (140 / delai()).toFixed(1);
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.1, (t - avant) / 1000); avant = t;
    if (mort > 0) mort = Math.max(0, mort - dt / 0.8);
    if (messageManche) messageManche.t -= dt;

    if (etat === "jeu" && (mode === "solo" || mode === "vs")) {
      if (mode === "vs") {
        // virages du partenaire
        const e = Coop.entree();
        if (e && e.q) e.q.forEach(([n, x, y]) => { if (n > dernierN) { dernierN = n; ajouterDirection(serpents[1], x, y); } });
      }
      if (pauseManche > 0) {
        pauseManche -= dt;
        if (pauseManche <= 0) { placerSerpents(true); messageManche = null; envoyer(true); }
      } else {
        chrono += dt * 1000;
        while (chrono >= delai() && etat === "jeu" && pauseManche <= 0) { chrono -= delai(); pas(); if (mode === "vs" && etat === "jeu") envoyer(true); }
      }
    }
    if (Coop.role === "partenaire") Coop.envoyerEntree({ q: mesVirages, n: compteurVirages });
    if (etat !== "jeu" && Coop.role === "hote" && !$("#overlay").hidden) menu($("#ov-titre").textContent, $("#ov-texte").textContent);
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__snake = {
    get mode() { return mode; }, get etat() { return etat; }, get score() { return points[monIndex()]; }, get victoires() { return victoires; },
    get serpent() { return (serpents[monIndex()] || serpents[0] || {}).corps; }, get serpents() { return serpents; }, get fruit() { return fruit; },
    changerDirection, nouvellePartie: () => nouvellePartie(false), nouvellePartieVS: () => nouvellePartie(true),
  };

  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Coop.demarrer(JEU, { surEtat: recevoir, surRoles: () => { if (etat !== "jeu") menu($("#ov-titre").textContent || "SNAKE", $("#ov-texte").textContent); } });
  menu("SNAKE", "");
  requestAnimationFrame(boucle);
})();
