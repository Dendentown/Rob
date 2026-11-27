/* ============================================================
   HORDE
   Rob se déplace (ZQSD / flèches, ou joystick au doigt) ; ses armes
   tirent toutes seules. Les monstres arrivent de partout, de plus
   en plus nombreux et résistants. Chaque monstre lâche une gemme ;
   assez de gemmes → niveau supérieur → choix entre 3 améliorations.

   Armes : Rayon (vers le plus proche) · Orbes (tournent autour)
           Onde (anneau autour de Rob) · Éclair (frappe au hasard)
   Bonus : Vitesse · Vie · Aimant · Puissance · Cadence
   Score : 5 par seconde de survie + 1 par monstre éliminé.
   ============================================================ */
(function () {
  const JEU = "horde";
  const W = 800, H = 500;
  const canvas = document.querySelector("#ecran");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);

  // ---------- Sprites (pixel art) ----------
  const ROB = [".....A.....", ".....X.....", "..XXXXXXX..", ".XXXXXXXXX.", ".XKKKKKKKX.", ".XKEKKKEKX.", ".XXXXXXXXX.", ".XXMMMMMXX.", ".XXXXXXXXX.", "..X.....X..", ".XX.....XX."];
  const MONSTRES = {
    gluant: { pv: 10, vit: 62, deg: 12, taille: 3, couleur: "#3dff7a", xp: 1,
      img: [["...XXXX...", ".XXXXXXXX.", "XXOXXXXOXX", "XXXXXXXXXX", "XXXX..XXXX", ".XXXXXXXX.", "X.X.XX.X.X"], ["...XXXX...", ".XXXXXXXX.", "XXOXXXXOXX", "XXXXXXXXXX", "XXXX..XXXX", "XXXXXXXXXX", ".X.X..X.X."]] },
    rapide: { pv: 6, vit: 120, deg: 8, taille: 3, couleur: "#ff8a1f", xp: 1,
      img: [["X.........X", "XX..XXX..XX", ".XXXXOXXXX.", "..XXXXXXX..", "...X...X..."], ["...........", "X...XXX...X", "XXXXXOXXXXX", "..XXXXXXX..", "..X.....X.."]] },
    brute: { pv: 70, vit: 42, deg: 25, taille: 4, couleur: "#b388ff", xp: 5,
      img: [["..XXXXXXX..", ".XXXXXXXXX.", "XXOOXXXOOXX", "XXXXXXXXXXX", "XX.X.X.X.XX", "XXXXXXXXXXX", ".XXX...XXX.", ".XX.....XX."], ["..XXXXXXX..", ".XXXXXXXXX.", "XXOOXXXOOXX", "XXXXXXXXXXX", "XXX.X.X.XXX", "XXXXXXXXXXX", ".XX.....XX.", "XX.......XX"]] },
  };
  const cache = {};
  function image(lignes, couleur, p, cle) {
    if (cache[cle]) return cache[cle];
    const c = document.createElement("canvas"), m = 6;
    c.width = lignes[0].length * p + 2 * m; c.height = lignes.length * p + 2 * m;
    const x = c.getContext("2d");
    const pal = { X: couleur, O: "#ffffff", K: "#05010f", E: "#ffe14d", M: "#05010f", A: "#ff2bd6" };
    x.shadowColor = couleur; x.shadowBlur = 6;
    lignes.forEach((l, j) => [...l].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(m + i * p, m + j * p, p, p); } }));
    return (cache[cle] = c);
  }
  function sprite(lignes, couleur, p, cle, X, Y, blanc) {
    const im = image(lignes, blanc ? "#ffffff" : couleur, p, cle + (blanc ? "b" : ""));
    ctx.drawImage(im, Math.round(X - im.width / 2), Math.round(Y - im.height / 2));
  }

  // ---------- État ----------
  let etat = "menu", temps = 0, tues = 0, niveau = 1, xp = 0;
  let rob, monstres = [], projectiles = [], gemmes = [], ondes = [], eclairs = [], textes = [];
  let armes, bonus, chronoApparition = 0;

  const xpNiveau = (n) => Math.round(4 + 4 * Math.pow(n, 1.3));
  const score = () => Math.floor(temps) * 5 + tues;
  const deg = (base) => base * (1 + 0.15 * bonus.puissance);
  const cad = (base) => base * Math.pow(0.9, bonus.cadence);

  function nouvellePartie() {
    rob = { x: 0, y: 0, pv: 100, pvMax: 100, vit: 150, aimant: 110, dir: 1, touche: 0 };
    monstres = []; projectiles = []; gemmes = []; ondes = []; eclairs = []; textes = [];
    temps = 0; tues = 0; niveau = 1; xp = 0; chronoApparition = 0;
    armes = { rayon: { niv: 1, cd: 0 }, orbes: { niv: 0, cd: 0, angle: 0 }, onde: { niv: 0, cd: 0 }, eclair: { niv: 0, cd: 0 } };
    bonus = { vitesse: 0, vie: 0, aimant: 0, puissance: 0, cadence: 0 };
    etat = "jeu";
    $("#overlay").hidden = true;
    Salle.publier(0, "jeu", true);
  }

  // ---------- Commandes ----------
  const touches = new Set();
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (etat !== "jeu" && etat !== "choix" && (k === " " || k === "enter")) { e.preventDefault(); nouvellePartie(); return; }
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "z", "q", "s", "d", "w", "a"].includes(k)) { e.preventDefault(); touches.add(k); }
    if (etat === "choix" && ["1", "2", "3"].includes(k)) { const b = $("#ov-choix").children[+k - 1]; if (b) b.click(); }
  });
  addEventListener("keyup", (e) => touches.delete(e.key.toLowerCase()));
  // joystick virtuel : on pose le doigt n'importe où sur le terrain et on glisse
  let joy = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  canvas.addEventListener("pointerdown", (e) => { const p = pos(e); joy = { ox: p.x, oy: p.y, x: p.x, y: p.y }; });
  canvas.addEventListener("pointermove", (e) => { if (joy) { const p = pos(e); joy.x = p.x; joy.y = p.y; } });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => canvas.addEventListener(ev, () => { joy = null; }));

  function directionVoulue() {
    let dx = 0, dy = 0;
    if (touches.has("arrowleft") || touches.has("q") || touches.has("a")) dx--;
    if (touches.has("arrowright") || touches.has("d")) dx++;
    if (touches.has("arrowup") || touches.has("z") || touches.has("w")) dy--;
    if (touches.has("arrowdown") || touches.has("s")) dy++;
    if (joy) {
      const jx = joy.x - joy.ox, jy = joy.y - joy.oy, l = Math.hypot(jx, jy);
      if (l > 6) { const f = Math.min(1, l / 40); dx = (jx / l) * f; dy = (jy / l) * f; }
    }
    const l = Math.hypot(dx, dy);
    return l > 1 ? { dx: dx / l, dy: dy / l } : { dx, dy };
  }

  // ---------- Monstres ----------
  function apparaitre() {
    const t = temps;
    let type = "gluant";
    const r = Math.random();
    if (t > 40 && r < 0.3) type = "rapide";
    if (t > 90 && r < 0.12) type = "brute";
    const m = MONSTRES[type];
    const a = Math.random() * Math.PI * 2, d = 480 + Math.random() * 80;
    const force = 1 + t / 150;
    monstres.push({ type, x: rob.x + Math.cos(a) * d, y: rob.y + Math.sin(a) * d, pv: m.pv * force, flash: 0, touchesOrbe: 0, ondeVue: -1 });
  }

  function blesser(m, d) {
    m.pv -= d; m.flash = 0.08;
    textes.push({ x: m.x, y: m.y - 14, txt: String(Math.round(d)), t: 0.5 });
  }

  function tuer(m) {
    tues++;
    const x = MONSTRES[m.type].xp;
    gemmes.push({ x: m.x, y: m.y, v: x });
  }

  // ---------- Armes ----------
  function plusProche(maxD) {
    let best = null, bd = maxD * maxD;
    for (const m of monstres) { const d = (m.x - rob.x) ** 2 + (m.y - rob.y) ** 2; if (d < bd) { bd = d; best = m; } }
    return best;
  }

  function armesAgissent(dt) {
    const R = armes.rayon;
    if (R.niv) {
      R.cd -= dt;
      if (R.cd <= 0) {
        const cible = plusProche(500);
        if (cible) {
          R.cd = cad(0.55 * Math.pow(0.9, R.niv - 1));
          const n = 1 + Math.floor((R.niv - 1) / 2);
          const base = Math.atan2(cible.y - rob.y, cible.x - rob.x);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.18;
            projectiles.push({ x: rob.x, y: rob.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, deg: deg(12 + 4 * (R.niv - 1)), perce: R.niv >= 4 ? 2 : 1, vie: 1.2, touches: new Set() });
          }
        }
      }
    }
    const O = armes.orbes;
    if (O.niv) {
      O.angle += dt * (2.6 + 0.2 * O.niv);
      const n = Math.min(6, O.niv + 1), rayon = 70 + 4 * O.niv;
      for (let i = 0; i < n; i++) {
        const a = O.angle + (i * Math.PI * 2) / n, ox = rob.x + Math.cos(a) * rayon, oy = rob.y + Math.sin(a) * rayon;
        for (const m of monstres) {
          if (m.touchesOrbe > temps) continue;
          if ((m.x - ox) ** 2 + (m.y - oy) ** 2 < 22 * 22) { blesser(m, deg(8 + 3 * O.niv)); m.touchesOrbe = temps + 0.4; }
        }
      }
    }
    const N = armes.onde;
    if (N.niv) {
      N.cd -= dt;
      if (N.cd <= 0) { N.cd = cad(3 * Math.pow(0.9, N.niv - 1)); ondes.push({ r: 10, max: 90 + 20 * N.niv, deg: deg(15 + 5 * N.niv), id: Math.random() }); }
    }
    ondes.forEach((o) => {
      o.r += 400 * dt;
      for (const m of monstres) if (m.ondeVue !== o.id && Math.hypot(m.x - rob.x, m.y - rob.y) < o.r) { m.ondeVue = o.id; blesser(m, o.deg); }
    });
    ondes = ondes.filter((o) => o.r < o.max);
    const E = armes.eclair;
    if (E.niv) {
      E.cd -= dt;
      if (E.cd <= 0) {
        E.cd = cad(1.6 * Math.pow(0.9, E.niv - 1));
        const visibles = monstres.filter((m) => Math.abs(m.x - rob.x) < W / 2 && Math.abs(m.y - rob.y) < H / 2);
        for (let i = 0; i < E.niv && visibles.length; i++) {
          const m = visibles.splice((Math.random() * visibles.length) | 0, 1)[0];
          blesser(m, deg(25 + 10 * E.niv));
          eclairs.push({ x: m.x, y: m.y, t: 0.15 });
        }
      }
    }
    eclairs.forEach((e) => (e.t -= dt));
    eclairs = eclairs.filter((e) => e.t > 0);
  }

  // ---------- Montée de niveau : 3 choix ----------
  const CHOIX = {
    rayon:     { ico: "⚡", nom: "Rayon",     type: "arme", max: 6 },
    orbes:     { ico: "🔵", nom: "Orbes",     type: "arme", max: 6 },
    onde:      { ico: "💫", nom: "Onde",      type: "arme", max: 6 },
    eclair:    { ico: "🌩", nom: "Éclair",    type: "arme", max: 6 },
    vitesse:   { ico: "👟", nom: "Vitesse",   type: "bonus", max: 5 },
    vie:       { ico: "❤️", nom: "Vie",       type: "bonus", max: 5 },
    aimant:    { ico: "🧲", nom: "Aimant",    type: "bonus", max: 5 },
    puissance: { ico: "💪", nom: "Puissance", type: "bonus", max: 5 },
    cadence:   { ico: "⏩", nom: "Cadence",   type: "bonus", max: 5 },
  };
  const nivDe = (id) => (CHOIX[id].type === "arme" ? armes[id].niv : bonus[id]);

  function monterNiveau() {
    niveau++;
    const possibles = Object.keys(CHOIX).filter((id) => nivDe(id) < CHOIX[id].max);
    if (!possibles.length) return;
    const tires = [];
    while (tires.length < 3 && possibles.length) tires.push(possibles.splice((Math.random() * possibles.length) | 0, 1)[0]);
    etat = "choix";
    touches.clear(); joy = null;
    $("#ov-titre").textContent = "NIVEAU " + niveau;
    $("#ov-texte").textContent = "";
    $("#ov-bouton").hidden = true;
    $("#ov-choix").replaceChildren(...tires.map((id) => {
      const b = document.createElement("button");
      b.className = "tuile";
      b.innerHTML = '<span class="ico"></span><span class="nom"></span>';
      b.querySelector(".ico").textContent = CHOIX[id].ico;
      const n = nivDe(id);
      b.querySelector(".nom").textContent = CHOIX[id].nom + (n ? " " + (n + 1) : " +");
      b.addEventListener("click", () => choisir(id));
      return b;
    }));
    $("#ov-choix").hidden = false;
    $("#overlay").hidden = false;
  }

  function choisir(id) {
    if (CHOIX[id].type === "arme") armes[id].niv++;
    else {
      bonus[id]++;
      if (id === "vitesse") rob.vit = 150 * (1 + 0.1 * bonus.vitesse);
      if (id === "vie") { rob.pvMax += 20; rob.pv = Math.min(rob.pvMax, rob.pv + 40); }
      if (id === "aimant") rob.aimant = 110 + 35 * bonus.aimant;
    }
    $("#ov-choix").hidden = true;
    $("#ov-bouton").hidden = false;
    $("#overlay").hidden = true;
    etat = "jeu";
    if (xp >= xpNiveau(niveau)) { xp -= xpNiveau(niveau); monterNiveau(); }
  }

  // ---------- Mise à jour ----------
  function mettreAJour(dt) {
    temps += dt;
    const d = directionVoulue();
    rob.x += d.dx * rob.vit * dt; rob.y += d.dy * rob.vit * dt;
    if (d.dx) rob.dir = Math.sign(d.dx);

    // apparitions : de plus en plus fréquentes
    chronoApparition -= dt;
    const parSeconde = 0.7 + temps / 45;
    while (chronoApparition <= 0) { chronoApparition += 1 / parSeconde; if (monstres.length < 350) apparaitre(); }

    // déplacement des monstres + petite répulsion entre eux (grille)
    const grille = new Map(), C = 24;
    monstres.forEach((m) => { const k = ((m.x / C) | 0) + "," + ((m.y / C) | 0); if (!grille.has(k)) grille.set(k, []); grille.get(k).push(m); });
    for (const m of monstres) {
      const t = MONSTRES[m.type];
      const dx = rob.x - m.x, dy = rob.y - m.y, l = Math.hypot(dx, dy) || 1;
      let vx = (dx / l) * t.vit, vy = (dy / l) * t.vit;
      const gx = (m.x / C) | 0, gy = (m.y / C) | 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const voisins = grille.get(gx + i + "," + (gy + j));
        if (!voisins) continue;
        for (const o of voisins) {
          if (o === m) continue;
          const ex = m.x - o.x, ey = m.y - o.y, d2 = ex * ex + ey * ey;
          if (d2 > 0 && d2 < 400) { const f = (20 - Math.sqrt(d2)) * 6; vx += (ex / Math.sqrt(d2)) * f; vy += (ey / Math.sqrt(d2)) * f; }
        }
      }
      m.x += vx * dt; m.y += vy * dt;
      if (m.flash > 0) m.flash -= dt;
      // contact avec Rob
      if (l < 22 + t.taille * 2) { rob.pv -= t.deg * dt; rob.touche = 0.1; }
      // trop loin derrière : on le replace devant
      if (l > 900) { const a = Math.random() * Math.PI * 2; m.x = rob.x + Math.cos(a) * 520; m.y = rob.y + Math.sin(a) * 520; }
    }
    if (rob.touche > 0) rob.touche -= dt;

    armesAgissent(dt);

    // projectiles
    projectiles.forEach((p) => {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt;
      for (const m of monstres) {
        if (p.perce <= 0 || p.touches.has(m)) continue;
        if ((m.x - p.x) ** 2 + (m.y - p.y) ** 2 < 18 * 18) { blesser(m, p.deg); p.touches.add(m); p.perce--; }
      }
    });
    projectiles = projectiles.filter((p) => p.vie > 0 && p.perce > 0);

    // morts
    monstres = monstres.filter((m) => { if (m.pv <= 0) { tuer(m); return false; } return true; });

    // gemmes : attirées par l'aimant
    gemmes.forEach((g) => {
      const dx = rob.x - g.x, dy = rob.y - g.y, l = Math.hypot(dx, dy);
      if (l < rob.aimant) { g.x += (dx / l) * 380 * dt; g.y += (dy / l) * 380 * dt; }
      if (l < 16) { g.pris = true; xp += g.v; }
    });
    gemmes = gemmes.filter((g) => !g.pris);
    if (gemmes.length > 400) gemmes.splice(0, gemmes.length - 400);

    textes.forEach((t) => { t.t -= dt; t.y -= 30 * dt; });
    textes = textes.filter((t) => t.t > 0).slice(-60);

    Salle.publier(score(), "jeu");
    if (rob.pv <= 0) return finPartie();
    if (xp >= xpNiveau(niveau)) { xp -= xpNiveau(niveau); monterNiveau(); }
  }

  function finPartie() {
    etat = "fini";
    Salle.publier(score(), "fini");
    Scores.enregistrer(JEU, score(), Salle.pseudo()).catch(() => {});
    $("#ov-titre").textContent = "GAME OVER";
    $("#ov-texte").textContent = score() + " · " + chrono();
    $("#ov-bouton").textContent = "Rejouer";
    $("#ov-choix").hidden = true; $("#ov-bouton").hidden = false;
    $("#overlay").hidden = false;
  }

  const chrono = () => { const s = Math.floor(temps); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  // ---------- Dessin ----------
  function dessiner(t) {
    ctx.fillStyle = "#07031a"; ctx.fillRect(0, 0, W, H);
    if (!rob) return;
    const cx = rob.x - W / 2, cy = rob.y - H / 2; // caméra centrée sur Rob
    ctx.fillStyle = "rgba(255, 43, 214, 0.12)";
    for (let x = -(((cx % 50) + 50) % 50); x < W; x += 50) ctx.fillRect(x, 0, 1, H);
    for (let y = -(((cy % 50) + 50) % 50); y < H; y += 50) ctx.fillRect(0, y, W, 1);

    // gemmes
    gemmes.forEach((g) => {
      const X = g.x - cx, Y = g.y - cy;
      if (X < -10 || X > W + 10 || Y < -10 || Y > H + 10) return;
      ctx.fillStyle = g.v > 1 ? "#ff2bd6" : "#19f0ff";
      ctx.fillRect(X - 3, Y - 4, 6, 8); ctx.fillStyle = "#fff"; ctx.fillRect(X - 1, Y - 3, 2, 2);
    });
    // ondes
    ondes.forEach((o) => {
      ctx.strokeStyle = `rgba(255, 225, 77, ${1 - o.r / o.max})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, o.r, 0, Math.PI * 2); ctx.stroke();
    });
    // monstres
    const frame = ((t / 180) | 0) % 2;
    monstres.forEach((m) => {
      const X = m.x - cx, Y = m.y - cy;
      if (X < -30 || X > W + 30 || Y < -30 || Y > H + 30) return;
      const ty = MONSTRES[m.type];
      sprite(ty.img[frame], ty.couleur, ty.taille, m.type + frame, X, Y, m.flash > 0);
    });
    // orbes
    const O = armes.orbes;
    if (O.niv) {
      const n = Math.min(6, O.niv + 1), rayon = 70 + 4 * O.niv;
      ctx.fillStyle = "#19f0ff"; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 12;
      for (let i = 0; i < n; i++) { const a = O.angle + (i * Math.PI * 2) / n; ctx.fillRect(W / 2 + Math.cos(a) * rayon - 6, H / 2 + Math.sin(a) * rayon - 6, 12, 12); }
      ctx.shadowBlur = 0;
    }
    // projectiles
    ctx.fillStyle = "#ffe14d"; ctx.shadowColor = "#ffe14d"; ctx.shadowBlur = 10;
    projectiles.forEach((p) => ctx.fillRect(p.x - cx - 4, p.y - cy - 4, 8, 8));
    ctx.shadowBlur = 0;
    // éclairs
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.shadowColor = "#19f0ff"; ctx.shadowBlur = 14;
    eclairs.forEach((e) => {
      const X = e.x - cx, Y = e.y - cy;
      ctx.beginPath(); ctx.moveTo(X + 10, Y - 120);
      for (let i = 1; i <= 5; i++) ctx.lineTo(X + (Math.random() - 0.5) * 24, Y - 120 + i * 24);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
    // Rob
    sprite(ROB, "#19f0ff", 3, "rob", W / 2, H / 2, rob.touche > 0 && (t / 60) % 2 < 1);
    // barre de vie
    ctx.fillStyle = "#3a1020"; ctx.fillRect(W / 2 - 20, H / 2 + 24, 40, 5);
    ctx.fillStyle = "#ff3b3b"; ctx.fillRect(W / 2 - 20, H / 2 + 24, 40 * Math.max(0, rob.pv / rob.pvMax), 5);
    // dégâts
    ctx.font = "8px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#fff";
    textes.forEach((x) => ctx.fillText(x.txt, x.x - cx, x.y - cy));
    // barre d'XP en haut
    ctx.fillStyle = "#1c1240"; ctx.fillRect(0, 0, W, 8);
    ctx.fillStyle = "#19f0ff"; ctx.fillRect(0, 0, W * Math.min(1, xp / xpNiveau(niveau)), 8);
    // joystick
    if (joy) {
      ctx.strokeStyle = "rgba(25,240,255,0.5)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 40, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(25,240,255,0.5)"; ctx.beginPath();
      const jx = joy.x - joy.ox, jy = joy.y - joy.oy, l = Math.hypot(jx, jy), f = l > 40 ? 40 / l : 1;
      ctx.arc(joy.ox + jx * f, joy.oy + jy * f, 14, 0, Math.PI * 2); ctx.fill();
    }

    $("#score").textContent = score();
    $("#temps").textContent = chrono();
    $("#niveau").textContent = niveau;
  }

  // ---------- Boucle ----------
  let avant = performance.now();
  function boucle(t) {
    const dt = Math.min(0.033, (t - avant) / 1000); avant = t;
    if (etat === "jeu") mettreAJour(dt);
    dessiner(t);
    requestAnimationFrame(boucle);
  }

  window.__horde = { get etat() { return etat; }, get temps() { return temps; }, get tues() { return tues; }, get niveau() { return niveau; },
    get rob() { return rob; }, get monstres() { return monstres; }, get armes() { return armes; }, get score() { return score(); }, nouvellePartie };

  $("#ov-bouton").addEventListener("click", nouvellePartie);
  Scores.ecouter((data) => Scores.tableau($("#classement"), data, JEU, Scores.cle(Salle.pseudo())));
  Salle.demarrer(JEU);
  $("#ov-titre").textContent = "HORDE";
  $("#ov-bouton").textContent = "Jouer";
  requestAnimationFrame(boucle);
})();
