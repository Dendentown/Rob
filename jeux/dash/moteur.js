/* ============================================================
   NÉON DASH — MOTEUR (génération des niveaux + physique)
   Utilisé par le jeu (navigateur) ET par la simulation de test
   (Node) qui vérifie que chaque parcours généré est franchissable.

   Le niveau est fabriqué au fur et à mesure à partir d'une GRAINE :
   même graine = même parcours (indispensable pour la course).
   Il enchaîne des « morceaux » choisis au hasard :
     piques, blocs, montée, descente, trou, plafond à piques,
     tunnel bas, plateformes au-dessus du vide, tremplin,
     anneau au-dessus du vide, double chemin (haut / bas).
   Le sol a plusieurs hauteurs (niveaux 0 à 3).
   Des boîtes « ? » sont semées sur le parcours.
   ============================================================ */
(function (racine) {
  const U = 30, SOL = 360, H = 450, X_CUBE = 180;
  const G = 2600, SAUT = -820, SAUT_TREMPLIN = -1120;
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
    sol(m, 0, 26 * U, 0);
    m.reperes.push({ x: 0, g: 0 });
    m.xGen = 26 * U;
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
      const n = 1 + ((a() * 3) | 0); const l = 6 + n;
      sol(m, x, x + l * U, g);
      for (let i = 0; i < n; i++) pique(m, x + (3 + i) * U, yDe(g));
      if (a() < 0.3) boite(m, x + (3 + n / 2) * U, g + 3);
      return { l, g };
    } },
    { nom: "blocs", min: 0, poids: 3, f(m, x, g, a) {
      sol(m, x, x + 12 * U, g);
      bloc(m, x + 2 * U, g + 1);
      pique(m, x + 5 * U, yDe(g)); pique(m, x + 6 * U, yDe(g));
      bloc(m, x + 8 * U, g + 1);
      if (a() < 0.5) bloc(m, x + 9 * U, g + 2), bloc(m, x + 9 * U, g + 1);
      return { l: 12, g };
    } },
    { nom: "montee", min: 0, poids: 3, possible: (g) => g < 3, f(m, x, g, a) {
      const dg = g < 2 && a() < 0.4 ? 2 : 1;
      sol(m, x, x + 4 * U, g); sol(m, x + 4 * U, x + 9 * U, g + dg);
      return { l: 9, g: g + dg };
    } },
    { nom: "descente", min: 0, poids: 3, possible: (g) => g > 0, f(m, x, g, a) {
      const dg = 1 + ((a() * g) | 0);
      sol(m, x, x + 4 * U, g); sol(m, x + 4 * U, x + 10 * U, g - dg);
      if (a() < 0.5) pique(m, x + 8 * U, yDe(g - dg));
      return { l: 10, g: g - dg };
    } },
    { nom: "trou", min: 100, poids: 3, f(m, x, g, a) {
      const w = 2 + ((a() * 2) | 0);
      let g2 = g;
      if (w === 2 && g < 3 && a() < 0.4) g2 = g + 1; else if (g > 0 && a() < 0.4) g2 = g - 1;
      sol(m, x, x + 3 * U, g); sol(m, x + (3 + w) * U, x + (8 + w) * U, g2);
      if (a() < 0.3) boite(m, x + (3 + w / 2) * U, Math.max(g, g2) + 2.5);
      return { l: 8 + w, g: g2 };
    } },
    { nom: "plafond-piques", min: 150, poids: 2, f(m, x, g, a) {
      const len = 6 + ((a() * 5) | 0), l = len + 6, yb = yDe(g + 3);
      sol(m, x, x + l * U, g);
      plafond(m, x + 3 * U, x + (3 + len) * U, yb);
      for (let i = 0; i < len; i++) pique(m, x + (3 + i) * U, yb, true);
      return { l, g };
    } },
    { nom: "tunnel", min: 250, poids: 2, f(m, x, g, a) {
      const len = 9 + ((a() * 3) | 0), l = len + 6;
      sol(m, x, x + l * U, g);
      plafond(m, x + 3 * U, x + (3 + len) * U, yDe(g) - 3.0 * U);
      for (let i = 6; i < 3 + len - 2; i += 4) pique(m, x + i * U, yDe(g));
      return { l, g };
    } },
    { nom: "plateformes", min: 350, poids: 2, f(m, x, g, a) {
      sol(m, x, x + 3 * U, g);
      const h1 = g + 1, h2 = g + 2;
      bloc(m, x + 4 * U, h1, 2 * U); bloc(m, x + 9 * U, h2, 2 * U); bloc(m, x + 14 * U, h1, 2 * U);
      if (a() < 0.6) boite(m, x + 10 * U, h2 + 1.5);
      sol(m, x + 19 * U, x + 23 * U, g);
      return { l: 23, g };
    } },
    { nom: "tremplin", min: 450, poids: 2, f(m, x, g, a) {
      if (g === 0 && a() < 0.5) {
        // le tremplin fait monter sur un sol 3 niveaux plus haut
        sol(m, x, x + 5 * U, 0); tremplin(m, x + 2 * U, 0);
        sol(m, x + 5 * U, x + 11 * U, 3);
        return { l: 11, g: 3 };
      }
      sol(m, x, x + 12 * U, g); tremplin(m, x + 2 * U, g);
      for (let i = 4; i < 9; i++) pique(m, x + i * U, yDe(g));
      if (a() < 0.4) boite(m, x + 6.5 * U, g + 6);
      return { l: 12, g };
    } },
    { nom: "anneau", min: 600, poids: 1, f(m, x, g, a) {
      sol(m, x, x + 3 * U, g); anneau(m, x + 6.5 * U, g + 3); sol(m, x + 11 * U, x + 15 * U, g);
      return { l: 15, g };
    } },
    { nom: "double", min: 200, poids: 2, possible: (g) => g <= 2, f(m, x, g, a) {
      // en bas : des piques à sauter sous un plafond ; en haut : une plateforme (avec une boîte)
      sol(m, x, x + 17 * U, g);
      m.rects.push({ id: m.id++, x: x + 4 * U, y: yDe(g) - 3.9 * U, w: 10 * U, h: 0.9 * U, type: "bloc" });
      pique(m, x + 6 * U, yDe(g)); pique(m, x + 10 * U, yDe(g));
      boite(m, x + 9 * U, g + 4.6);
      return { l: 17, g };
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
      m.reperes.push({ x: m.xGen, g: m.g });
      const res = choix.f(m, m.xGen, m.g, m.alea);
      m.xGen += res.l * U; m.g = res.g;
      // sol plat entre deux morceaux : au moins un saut de long, pour toujours pouvoir retomber
      const v = vitesseBase(m.xGen) * 1.05;
      const ecart = Math.max(0.7 * v, (8 - d / 600) * U) + m.alea() * 3 * U;
      m.reperes.push({ x: m.xGen, g: m.g });
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
  function nouveauJoueur() {
    return { x: 0, y: yDe(0) - U, vy: 0, sol: true, rot: 0, bouclier: false, boost: 0, lent: 0, stun: 0, anneaux: [], flaques: [], boites: [] };
  }

  // point de reprise : le dernier repère derrière le joueur
  function reprise(j, m) {
    const r = m.reperes.filter((p) => p.x <= j.x - U).pop() || m.reperes[0] || { x: 0, g: 0 };
    Object.assign(j, { x: r.x + 2, y: yDe(r.g) - U, vy: 0, sol: true, rot: 0, stun: 0 });
  }

  const vitesseJoueur = (j) => (j.stun > 0 ? 0 : vitesseBase(j.x) * (j.boost > 0 ? 1.5 : 1) * (j.lent > 0 ? 0.6 : 1));

  // Un pas de physique. Renvoie la liste des événements : "mort", "bouclier", "boite", "glisse", "fini"…
  function etape(j, m, dt, appui) {
    const ev = [];
    ["boost", "lent", "stun"].forEach((k) => { if (j[k] > 0) j[k] = Math.max(0, j[k] - dt); });
    if (appui && j.sol && j.stun <= 0) { j.vy = SAUT; j.sol = false; }
    const xa = j.x, ya = j.y;
    j.x += vitesseJoueur(j) * dt;
    j.vy += G * dt; j.y += j.vy * dt;
    j.sol = false;

    const gx = j.x + 2, dx = j.x + U - 2;
    for (const r of m.rects) {
      if (r.detruit || r.x > dx || r.x + r.w < gx) continue;
      if (j.y + U <= r.y || j.y >= r.y + r.h) continue;
      if (ya + U <= r.y + 10 && j.vy >= 0) { j.y = r.y - U; j.vy = 0; j.sol = true; continue; }     // atterrit dessus
      if (ya >= r.y + r.h - 10 && j.vy < 0) { j.y = r.y + r.h; j.vy = 0; continue; }                // se cogne dessous
      // de côté
      if (r.type !== "sol" && j.boost > 0) { r.detruit = true; ev.push("casse"); continue; }
      if (j.bouclier) {
        j.bouclier = false; ev.push("bouclier");
        if (r.type !== "sol") r.detruit = true; else { j.y = r.y - U; j.vy = 0; j.sol = true; }
        continue;
      }
      ev.push("mort"); return ev;
    }
    for (const p of m.piques) {
      if (p.detruit || p.x > j.x + U || p.x + U < j.x) continue;
      // zone dangereuse plus petite que le dessin
      const hx1 = p.x + 9, hx2 = p.x + U - 9;
      const hy1 = p.bas ? p.y : p.y - U + 12, hy2 = p.bas ? p.y + U - 12 : p.y;
      if (j.x + U - 6 > hx1 && j.x + 6 < hx2 && j.y + U > hy1 && j.y < hy2) {
        if (j.boost > 0) { p.detruit = true; ev.push("casse"); continue; }
        if (j.bouclier) { j.bouclier = false; p.detruit = true; ev.push("bouclier"); continue; }
        ev.push("mort"); return ev;
      }
    }
    if (j.y > H) {
      if (j.bouclier) { j.bouclier = false; j.vy = SAUT_TREMPLIN * 1.1; j.y = H - 1; ev.push("bouclier"); }
      else { ev.push("mort"); return ev; }
    }
    for (const t of m.tremplins) {
      if (t.x > j.x + U || t.x + U < j.x) continue;
      if (j.y + U >= t.y - 8 && j.y + U <= t.y + 2 && j.vy >= 0) { j.vy = SAUT_TREMPLIN; j.sol = false; ev.push("tremplin"); }
    }
    for (const a of m.anneaux) {
      if (!appui || j.anneaux.includes(a.id)) continue;
      if (Math.abs(j.x + U / 2 - a.x) < U && Math.abs(j.y + U / 2 - a.y) < U) { j.vy = SAUT; j.anneaux.push(a.id); ev.push("anneau"); }
    }
    for (const b of m.boites) {
      if (j.boites.includes(b.id)) continue;
      if (Math.abs(j.x + U / 2 - b.x) < U * 0.9 && Math.abs(j.y + U / 2 - b.y) < U * 0.9) { j.boites.push(b.id); ev.push("boite"); }
    }
    for (const f of m.flaques) {
      if (j.flaques.includes(f.id) || !j.sol) continue;
      if (j.x + U > f.x && j.x < f.x + 2 * U && Math.abs(j.y + U - f.y) < 4) { j.flaques.push(f.id); j.stun = 1.1; ev.push("glisse"); }
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

  const API = { U, SOL, H, X_CUBE, G, SAUT, SAUT_TREMPLIN, vitesseBase, vitesseJoueur, mulberry32, creerMonde, etendre, nettoyer, nouveauJoueur, reprise, etape, laser, solSous, MORCEAUX };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.DashMoteur = API;
})(typeof window !== "undefined" ? window : globalThis);
