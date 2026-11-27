/* ============================================================
   NÉON DASH — MOTEUR (génération des niveaux + physique)
   Utilisé par le jeu (navigateur) ET par la simulation de test
   (Node) qui vérifie que chaque parcours généré est franchissable.

   Le niveau est fabriqué au fur et à mesure à partir d'une GRAINE :
   même graine = même parcours (indispensable pour la course).
   Il enchaîne des « morceaux » choisis au hasard :
     piques, blocs, montée, descente, trou, plusieurs trous, escalier,
     plafond à piques, tunnel, couloir étroit, slalom, plateformes,
     zigzag, trois étages, souterrain, tremplin, anneau, double chemin.
   Le sol a plusieurs hauteurs (niveaux 0 à 3).
   Des boîtes « ? » sont semées sur le parcours.
   On ne meurt jamais : les erreurs ralentissent ou bloquent (voir etape).
   ============================================================ */
(function (racine) {
  const U = 30, SOL = 360, H = 450, X_CUBE = 180;
  const G = 2600, SAUT = -820, SAUT_TREMPLIN = -1120;
  const SAUT_COUPE = -420; // relâcher tôt coupe le saut : appui bref = petit saut, appui long = saut maximal
  const vitesseBase = (d) => 330 * (1 + 0.15 * Math.log(1 + d / 3000));

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const yDe = (g) => SOL - g * U; // hauteur (en px) de la surface d'un sol de niveau g

  // ---------- Construction du monde ----------
  function creerMonde(graine, options) {
    options = options || {};
    const m = {
      rects: [], piques: [], tremplins: [], anneaux: [], boites: [], flaques: [], reperes: [],
      fin: options.longueur ? options.longueur * U : Infinity,
      alea: mulberry32(graine >>> 0), xGen: 0, g: 0, id: 0, course: !!options.course,
    };
    sol(m, 0, 12 * U, 0);
    m.reperes.push({ x: 0, g: 0 });
    m.xGen = 12 * U;
    return m;
  }

  function sol(m, x1, x2, g) { m.rects.push({ id: m.id++, x: x1, y: yDe(g), w: x2 - x1, h: H + 300 - yDe(g), type: "sol" }); }
  function bloc(m, x, niveauHaut, w, epaisseur) { // bloc dont la face du dessus est au niveau donné
    m.rects.push({ id: m.id++, x, y: yDe(niveauHaut), w: w || U, h: (epaisseur || 1) * U, type: "bloc" });
  }
  function plafond(m, x1, x2, yBas) { m.rects.push({ id: m.id++, x: x1, y: -400, w: x2 - x1, h: yBas + 400, type: "plafond" }); }
  function pique(m, x, yBase, bas) { m.piques.push({ id: m.id++, x, y: yBase, bas: !!bas }); }
  function tremplin(m, x, g) { m.tremplins.push({ id: m.id++, x, y: yDe(g) }); }
  function anneau(m, x, niveau) { m.anneaux.push({ id: m.id++, x, y: yDe(niveau) }); }
  function boite(m, x, niveau) { m.boites.push({ id: m.id++, x, y: yDe(niveau) }); }

  // Chaque morceau commence par du sol au niveau courant g (point de reprise sûr)
  const MORCEAUX = [
    { nom: "piques", min: 0, poids: 4, f(m, x, g, a) {
      const n = 1 + ((a() * 3) | 0); const l = 4 + n;
      sol(m, x, x + l * U, g);
      for (let i = 0; i < n; i++) pique(m, x + (2 + i) * U, yDe(g));
      if (a() < 0.3) boite(m, x + (2 + n / 2) * U, g + 3);
      return { l, g };
    } },
    { nom: "blocs", min: 0, poids: 3, f(m, x, g, a) {
      sol(m, x, x + 12 * U, g);
      bloc(m, x + 2 * U, g + 1);
      pique(m, x + 5 * U, yDe(g)); pique(m, x + 6 * U, yDe(g));
      bloc(m, x + 9 * U, g + 1);
      if (a() < 0.5) bloc(m, x + 10 * U, g + 2), bloc(m, x + 10 * U, g + 1);
      return { l: 12, g };
    } },
    { nom: "montee", min: 0, poids: 2, possible: (g) => g < 3, f(m, x, g, a) {
      const dg = g < 2 && a() < 0.4 ? 2 : 1;
      sol(m, x, x + 3 * U, g); sol(m, x + 3 * U, x + 6 * U, g + dg);
      return { l: 6, g: g + dg };
    } },
    { nom: "descente", min: 0, poids: 2, possible: (g) => g > 0, f(m, x, g, a) {
      const dg = 1 + ((a() * g) | 0);
      sol(m, x, x + 3 * U, g); sol(m, x + 3 * U, x + 8 * U, g - dg);
      if (a() < 0.5) pique(m, x + 6 * U, yDe(g - dg));
      return { l: 8, g: g - dg };
    } },
    { nom: "trou", min: 60, poids: 3, f(m, x, g, a) {
      const w = 2 + ((a() * 2) | 0);
      let g2 = g;
      if (w === 2 && g < 3 && a() < 0.4) g2 = g + 1; else if (g > 0 && a() < 0.4) g2 = g - 1;
      sol(m, x, x + 2 * U, g); sol(m, x + (2 + w) * U, x + (5 + w) * U, g2);
      if (a() < 0.3) boite(m, x + (2 + w / 2) * U, Math.max(g, g2) + 2.5);
      return { l: 5 + w, g: g2 };
    } },
    { nom: "multi-trous", min: 120, poids: 3, f(m, x, g, a) {
      // plusieurs petites îles au-dessus du vide, à des hauteurs qui changent
      sol(m, x, x + 2 * U, g);
      let cx = x + 2 * U, gi = g;
      const n = 3 + ((a() * 2) | 0);
      for (let i = 0; i < n; i++) {
        cx += (1.5 + a() * 0.7) * U;
        const r = a();
        if (r < 0.3 && gi < 3) gi++; else if (r < 0.55 && gi > 0) gi--;
        const w = i === n - 1 ? 3 : 2;
        sol(m, cx, cx + w * U, gi);
        if (i === 1 && a() < 0.4) boite(m, cx + U, gi + 2.5);
        cx += w * U;
      }
      return { l: (cx - x) / U, g: gi };
    } },
    { nom: "escalier", min: 80, poids: 2, f(m, x, g, a) {
      sol(m, x, x + 13 * U, g);
      bloc(m, x + 2 * U, g + 1, 2 * U, 1); bloc(m, x + 4 * U, g + 2, 2 * U, 2); bloc(m, x + 6 * U, g + 3, 2 * U, 3);
      pique(m, x + 9 * U, yDe(g)); pique(m, x + 10 * U, yDe(g));
      if (a() < 0.4) boite(m, x + 7 * U, g + 5.5);
      return { l: 13, g };
    } },
    { nom: "plafond-piques", min: 150, poids: 2, f(m, x, g, a) {
      const len = 5 + ((a() * 4) | 0), l = len + 4, yb = yDe(g + 3);
      sol(m, x, x + l * U, g);
      plafond(m, x + 2 * U, x + (2 + len) * U, yb);
      for (let i = 0; i < len; i++) pique(m, x + (2 + i) * U, yb, true);
      return { l, g };
    } },
    { nom: "tunnel", min: 250, poids: 2, f(m, x, g, a) {
      const len = 8 + ((a() * 3) | 0), l = len + 4;
      sol(m, x, x + l * U, g);
      plafond(m, x + 2 * U, x + (2 + len) * U, yDe(g) - 3.0 * U);
      for (let i = 5; i < 2 + len - 2; i += 3) pique(m, x + i * U, yDe(g));
      return { l, g };
    } },
    { nom: "etroit", min: 200, poids: 2, f(m, x, g, a) {
      // couloir très bas : il faut de tout petits sauts (appui bref) pour passer les piques
      const len = 8 + ((a() * 4) | 0), l = len + 4;
      sol(m, x, x + l * U, g);
      plafond(m, x + 2 * U, x + (2 + len) * U, yDe(g) - 2.4 * U);
      for (let i = 5; i < 2 + len - 1; i += 4) pique(m, x + i * U, yDe(g));
      return { l, g };
    } },
    { nom: "slalom", min: 300, poids: 2, f(m, x, g, a) {
      // piques au sol et au plafond en alternance
      const len = 12 + ((a() * 2) | 0) * 3, l = len + 4, yb = yDe(g) - 4.2 * U;
      sol(m, x, x + l * U, g);
      plafond(m, x + 2 * U, x + (2 + len) * U, yb);
      for (let i = 4, k = 0; i < 2 + len - 1; i += 3, k++) {
        if (k % 2 === 0) pique(m, x + i * U, yDe(g)); else pique(m, x + i * U, yb, true);
      }
      return { l, g };
    } },
    { nom: "plateformes", min: 350, poids: 2, f(m, x, g, a) {
      sol(m, x, x + 2 * U, g);
      const h1 = g + 1, h2 = g + 2;
      bloc(m, x + 3 * U, h1, 2 * U); bloc(m, x + 7 * U, h2, 2 * U); bloc(m, x + 11 * U, h1, 2 * U);
      if (a() < 0.6) boite(m, x + 8 * U, h2 + 1.5);
      sol(m, x + 15 * U, x + 18 * U, g);
      return { l: 18, g };
    } },
    { nom: "zigzag", min: 250, poids: 2, f(m, x, g, a) {
      // fines plateformes en zigzag au-dessus du vide
      sol(m, x, x + 2 * U, g);
      const hs = [g + 1, g + 2.5, g + 1, g + 2.5];
      let cx = x + 3.5 * U;
      hs.forEach((h, i) => {
        m.rects.push({ id: m.id++, x: cx, y: yDe(h), w: 2 * U, h: 0.5 * U, type: "bloc" });
        if (i === 1 && a() < 0.5) boite(m, cx + U, h + 2);
        cx += 3.5 * U;
      });
      sol(m, cx, cx + 3 * U, g);
      return { l: (cx - x) / U + 3, g };
    } },
    { nom: "trois-niveaux", min: 300, poids: 3, possible: (g) => g <= 1, f(m, x, g, a) {
      // trois étages : en bas (piques), au milieu, en haut (boîtes)
      const l = 24;
      sol(m, x, x + l * U, g);
      const dalle = (x1, x2, h) => m.rects.push({ id: m.id++, x: x1, y: yDe(h), w: x2 - x1, h: 0.5 * U, type: "bloc" });
      dalle(x + 3 * U, x + 9 * U, g + 2.5); dalle(x + 13 * U, x + 19 * U, g + 2.5);
      dalle(x + 8 * U, x + 14 * U, g + 5); dalle(x + 17 * U, x + 22 * U, g + 5);
      pique(m, x + 11 * U, yDe(g)); pique(m, x + 21 * U, yDe(g));
      pique(m, x + 6 * U, yDe(g + 2.5)); pique(m, x + 16 * U, yDe(g + 2.5));
      boite(m, x + 11 * U, g + 6.3);
      if (a() < 0.5) boite(m, x + 19.5 * U, g + 6.3);
      return { l, g };
    } },
    { nom: "souterrain", min: 400, poids: 2, possible: (g) => g >= 1, f(m, x, g, a) {
      // le sol s'enfonce : on passe dessous (petits sauts) ou dessus (sur le toit)
      const dg = Math.min(2, g), bas = g - dg;
      sol(m, x, x + 3 * U, g);
      sol(m, x + 3 * U, x + 19 * U, bas);
      m.rects.push({ id: m.id++, x: x + 5 * U, y: yDe(bas) - (dg + 0.5) * U - U, w: 11 * U, h: U, type: "bloc" });
      const toit = bas + dg + 1.5;
      if (dg === 2) { pique(m, x + 8 * U, yDe(bas)); pique(m, x + 12 * U, yDe(bas)); }
      pique(m, x + 10 * U, yDe(toit));
      if (a() < 0.5) boite(m, x + 13 * U, toit + 1.5);
      let cx = x + 19 * U;
      for (let k = bas + 1; k <= g; k++) { sol(m, cx, cx + 2 * U, k); cx += 2 * U; }
      sol(m, cx, cx + U, g);
      return { l: (cx - x) / U + 1, g };
    } },
    { nom: "tremplin", min: 450, poids: 2, f(m, x, g, a) {
      if (g === 0 && a() < 0.5) {
        // le tremplin fait monter sur un sol 3 niveaux plus haut
        sol(m, x, x + 4 * U, 0); tremplin(m, x + 1.5 * U, 0);
        sol(m, x + 4 * U, x + 8 * U, 3);
        return { l: 8, g: 3 };
      }
      sol(m, x, x + 10 * U, g); tremplin(m, x + 1.5 * U, g);
      for (let i = 3; i < 8; i++) pique(m, x + i * U, yDe(g));
      if (a() < 0.4) boite(m, x + 5.5 * U, g + 6);
      return { l: 10, g };
    } },
    { nom: "anneau", min: 600, poids: 1, f(m, x, g, a) {
      sol(m, x, x + 2 * U, g); anneau(m, x + 5.5 * U, g + 3); sol(m, x + 10 * U, x + 13 * U, g);
      return { l: 13, g };
    } },
    { nom: "double", min: 200, poids: 2, possible: (g) => g <= 2, f(m, x, g, a) {
      // en bas : des piques à sauter sous un plafond ; en haut : une plateforme (avec une boîte)
      sol(m, x, x + 15 * U, g);
      m.rects.push({ id: m.id++, x: x + 3 * U, y: yDe(g) - 3.9 * U, w: 10 * U, h: 0.9 * U, type: "bloc" });
      pique(m, x + 5 * U, yDe(g)); pique(m, x + 9 * U, yDe(g));
      boite(m, x + 8 * U, g + 4.6);
      return { l: 15, g };
    } },
  ];

  // Étend le monde jusqu'à l'abscisse xMax
  function etendre(m, xMax) {
    while (m.xGen < Math.min(xMax, m.fin + 20 * U)) {
      const d = m.xGen / U;
      if (m.xGen >= m.fin) { sol(m, m.xGen, m.xGen + 40 * U, m.g); m.xGen += 40 * U; break; } // après l'arrivée : sol plat
      const dispo = MORCEAUX.filter((c) => c.min <= d && (!c.possible || c.possible(m.g)));
      let r = m.alea() * dispo.reduce((s, c) => s + c.poids, 0), choix = dispo[0];
      for (const c of dispo) { r -= c.poids; if (r <= 0) { choix = c; break; } }
      m.reperes.push({ x: m.xGen, g: m.g, nom: choix.nom });
      const res = choix.f(m, m.xGen, m.g, m.alea);
      m.xGen += res.l * U; m.g = res.g;
      // sol plat entre deux morceaux, court : on ne meurt pas, les obstacles peuvent être serrés
      const v = vitesseBase(m.xGen);
      const ecart = Math.max(0.12 * v, (2.5 - d / 1000) * U) + m.alea() * 1.2 * U;
      m.reperes.push({ x: m.xGen, g: m.g, nom: "plat" });
      sol(m, m.xGen, m.xGen + ecart, m.g);
      m.xGen += ecart;
    }
  }

  // Oublie ce qui est loin derrière (le mode infini ne grossit pas sans fin)
  function nettoyer(m, xMin) {
    const garde = (o) => o.x + (o.w || U) > xMin;
    m.rects = m.rects.filter(garde); m.piques = m.piques.filter(garde); m.tremplins = m.tremplins.filter(garde);
    m.anneaux = m.anneaux.filter(garde); m.boites = m.boites.filter(garde); m.flaques = m.flaques.filter(garde);
    m.reperes = m.reperes.filter((r) => r.x > xMin - 2000);
  }

  // ---------- Joueur ----------
  // On ne meurt jamais : une erreur fait perdre de la vitesse ou du temps.
  //   pique         → on trébuche : vitesse × 0,25, petit rebond, 0,7 s sans nouveau choc
  //   mur / bloc    → on est bloqué contre (vitesse 0) jusqu'à ce qu'on saute par-dessus
  //   trou          → on repart du dernier point de reprise (temps perdu)
  // La vitesse remonte toute seule (accélération), jusqu'à la vitesse de croisière.
  const ACCEL = 520;
  function nouveauJoueur() {
    return { x: 0, y: yDe(0) - U, vy: 0, v: 0, sol: true, rot: 0, bouclier: false, boost: 0, lent: 0, stun: 0, inv: 0, anneaux: [], flaques: [], boites: [] };
  }

  // point de reprise : le dernier repère derrière le joueur
  function reprise(j, m, x) {
    const ref = x == null ? j.x - U : x;
    const r = m.reperes.filter((p) => p.x <= ref).pop() || m.reperes[0] || { x: 0, g: 0 };
    Object.assign(j, { x: r.x + 2, y: yDe(r.g) - U, vy: 0, v: 0, sol: true, rot: 0, tenu: false });
  }

  const vitesseCroisiere = (j) => vitesseBase(j.x) * (j.boost > 0 ? 1.5 : 1) * (j.lent > 0 ? 0.6 : 1);
  const vitesseJoueur = (j) => j.v;

  // Un pas de physique. Renvoie la liste des événements : "choc", "bloque", "chute", "bouclier", "boite", "glisse", "fini"…
  function etape(j, m, dt, appui) {
    const ev = [];
    ["boost", "lent", "stun", "inv"].forEach((k) => { if (j[k] > 0) j[k] = Math.max(0, j[k] - dt); });
    // vitesse horizontale : remonte vers la vitesse de croisière
    const cible = j.stun > 0 ? 0 : vitesseCroisiere(j);
    if (j.v < cible) j.v = Math.min(cible, j.v + ACCEL * (j.boost > 0 ? 2.5 : 1) * dt);
    else j.v = Math.max(cible, j.v - ACCEL * 2 * dt);
    if (appui && j.sol && j.stun <= 0) { j.vy = SAUT; j.sol = false; j.tenu = true; }
    if (j.tenu && !appui) { if (j.vy < SAUT_COUPE) j.vy = SAUT_COUPE; j.tenu = false; }
    if (j.vy >= 0) j.tenu = false;
    const xa = j.x, ya = j.y;
    j.x += j.v * dt;
    j.vy += G * dt; j.y += j.vy * dt;
    j.sol = false;

    for (const r of m.rects) {
      if (r.detruit) continue;
      const gx = j.x + 2, dx = j.x + U - 2;
      if (r.x > dx || r.x + r.w < gx) continue;
      if (j.y + U <= r.y || j.y >= r.y + r.h) continue;
      if (ya + U <= r.y + 10 && j.vy >= 0) { j.y = r.y - U; j.vy = 0; j.sol = true; continue; }     // atterrit dessus
      if (ya >= r.y + r.h - 10 && j.vy < 0) { j.y = r.y + r.h; j.vy = 0; continue; }                // se cogne dessous
      // de côté : le turbo casse les blocs, sinon on est bloqué contre
      if (r.type !== "sol" && j.boost > 0) { r.detruit = true; ev.push("casse"); continue; }
      j.x = Math.min(j.x, r.x - U + 1); j.v = 0;
      if (!ev.includes("bloque")) ev.push("bloque");
    }
    for (const p of m.piques) {
      if (p.detruit || p.x > j.x + U || p.x + U < j.x) continue;
      // zone dangereuse plus petite que le dessin
      const hx1 = p.x + 9, hx2 = p.x + U - 9;
      const hy1 = p.bas ? p.y : p.y - U + 12, hy2 = p.bas ? p.y + U - 12 : p.y;
      if (j.x + U - 6 > hx1 && j.x + 6 < hx2 && j.y + U > hy1 && j.y < hy2) {
        if (j.boost > 0) { p.detruit = true; ev.push("casse"); continue; }
        if (j.inv > 0) continue;
        if (j.bouclier) { j.bouclier = false; p.detruit = true; ev.push("bouclier"); continue; }
        j.v *= 0.25; j.inv = 0.7;
        j.vy = p.bas ? Math.max(j.vy, 250) : Math.min(j.vy, -380); // pique du plafond : on est renvoyé vers le bas
        ev.push("choc");
      }
    }
    if (j.y > H) {
      if (j.bouclier) { j.bouclier = false; j.vy = SAUT_TREMPLIN * 1.1; j.y = H - 1; ev.push("bouclier"); }
      else { reprise(j, m, xa - U); j.stun = 0.35; ev.push("chute"); return ev; }
    }
    for (const t of m.tremplins) {
      if (t.x > j.x + U || t.x + U < j.x) continue;
      if (j.y + U >= t.y - 8 && j.y + U <= t.y + 2 && j.vy >= 0) { j.vy = SAUT_TREMPLIN; j.sol = false; j.tenu = false; ev.push("tremplin"); }
    }
    for (const a of m.anneaux) {
      if (!appui || j.anneaux.includes(a.id)) continue;
      if (Math.abs(j.x + U / 2 - a.x) < U && Math.abs(j.y + U / 2 - a.y) < U) { j.vy = SAUT; j.tenu = true; j.anneaux.push(a.id); ev.push("anneau"); }
    }
    for (const b of m.boites) {
      if (j.boites.includes(b.id)) continue;
      if (Math.abs(j.x + U / 2 - b.x) < U * 0.9 && Math.abs(j.y + U / 2 - b.y) < U * 0.9) { j.boites.push(b.id); ev.push("boite"); }
    }
    for (const f of m.flaques) {
      if (j.flaques.includes(f.id) || !j.sol) continue;
      if (j.x + U > f.x && j.x < f.x + 2 * U && Math.abs(j.y + U - f.y) < 4) {
        j.flaques.push(f.id);
        if (j.bouclier) { j.bouclier = false; ev.push("bouclier"); } else { j.stun = 1.1; j.v = 0; ev.push("glisse"); }
      }
    }
    if (j.sol) j.rot = Math.round(j.rot / (Math.PI / 2)) * (Math.PI / 2);
    else j.rot += dt * 7.5;
    if (j.x >= m.fin) ev.push("fini");
    return ev;
  }

  // Laser : détruit les obstacles (pas le sol) devant le joueur
  function laser(j, m, portee) {
    const x1 = j.x + U, x2 = j.x + U + (portee || 9) * U;
    let n = 0;
    m.rects.forEach((r) => { if (r.type !== "sol" && !r.detruit && r.x < x2 && r.x + r.w > x1) { r.detruit = true; n++; } });
    m.piques.forEach((p) => { if (!p.detruit && p.x < x2 && p.x + U > x1) { p.detruit = true; n++; } });
    return { x1, x2, n };
  }

  // sol sous une abscisse (pour poser une flaque)
  function solSous(m, x) {
    const r = m.rects.filter((r) => r.type === "sol" && r.x <= x && r.x + r.w >= x).sort((a, b) => a.y - b.y)[0];
    return r ? r.y : null;
  }

  const API = { U, SOL, H, X_CUBE, G, SAUT, SAUT_TREMPLIN, SAUT_COUPE, vitesseBase, vitesseJoueur, vitesseCroisiere, yDe, mulberry32, creerMonde, etendre, nettoyer, nouveauJoueur, reprise, etape, laser, solSous, MORCEAUX };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.DashMoteur = API;
})(typeof window !== "undefined" ? window : globalThis);
