/* ============================================================
   NÉON DASH — MOTEUR (génération des niveaux + physique)
   Utilisé par le jeu (navigateur) ET par la simulation de test
   (Node) qui vérifie que chaque parcours généré est franchissable.

   Le niveau est fabriqué au fur et à mesure à partir d'une GRAINE :
   même graine = même parcours (indispensable pour la course).
   Il enchaîne des « morceaux » choisis au hasard :
     piques, blocs, montée, descente, trou, plusieurs trous, escalier,
     plafond à piques, tunnel, couloir étroit, slalom, plateformes,
     zigzag, trois étages, souterrain, tremplin, anneau, double chemin,
     éboulement, ascenseurs, pont qui s'effondre, gravité inversée,
     tapis roulants, mur à rebond, lasers alternés, pendules, porte à
     interrupteur, bulles de saut, deux voies, zone sombre.
   Parfois, une partie du parcours se fait À L'ENVERS : un portail retourne
   le cube, qui enchaîne des obstacles habituels retournés au plafond.
   Le sol a plusieurs hauteurs (niveaux 0 à 3).
   Des boîtes « ? » sont semées sur le parcours.
   On ne meurt jamais : les erreurs ralentissent ou bloquent (voir etape).
   ============================================================ */
(function (racine) {
  const U = 30, SOL = 360, H = 450, X_CUBE = 180;
  const G = 2600, SAUT = -820, SAUT_TREMPLIN = -1120;
  // Saut variable, progressif : tant qu'on garde appuyé en montant, la gravité est réduite de moitié.
  // Appui bref ≈ 2,1 blocs, appui long (≈ 0,45 s) = 4,2 blocs ; la hauteur grandit doucement avec la durée.
  const SAUT_V = -580, G_TENU = 0.5, SAUT_COUPE = -580;
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
      tombants: [], mobiles: [], fragiles: [], portails: [], tapis: [], lasers: [], pendules: [], portes: [], boutons: [], bulles: [], sombres: [], scies: [],
      fin: options.longueur ? options.longueur * U : Infinity,
      alea: mulberry32(graine >>> 0), xGen: 0, g: 0, id: 0, course: !!options.course,
    };
    sol(m, 0, 12 * U, 0);
    m.reperes.push({ x: 0, g: 0 });
    m.xGen = 12 * U;
    return m;
  }

  // Partie à l'envers : tout est retourné autour de y = MIROIR / 2 (le sol du niveau g devient un plafond en haut de l'écran)
  const MIROIR = H;
  function solHaut(m, x1, x2, g) { const yb = MIROIR - yDe(g); m.rects.push({ id: m.id++, x: x1, y: -300, w: x2 - x1, h: yb + 300, type: "sol", haut: true }); }
  const ENVERS_OK = ["piques", "blocs", "montee", "descente", "trou", "multi-trous", "escalier", "plafond-piques", "tunnel", "etroit", "slalom", "plateformes", "zigzag", "double", "trois-niveaux", "souterrain"];
  function mondeTemp(m) { const t = { id: m.id }; LISTES.forEach((k) => (t[k] = [])); return t; }
  function retourner(m, tm) {
    m.id = tm.id;
    tm.rects.forEach((r) => {
      const y = MIROIR - (r.y + r.h);
      if (r.type === "sol") m.rects.push(Object.assign({}, r, { y, haut: true }));
      else if (r.type === "plafond") m.rects.push(Object.assign({}, r, { y, h: H + 300 - y, type: "sol" }));
      else m.rects.push(Object.assign({}, r, { y }));
    });
    tm.piques.forEach((p) => m.piques.push(Object.assign({}, p, { y: MIROIR - p.y, bas: !p.bas })));
    tm.boites.forEach((b) => m.boites.push(Object.assign({}, b, { y: MIROIR - b.y })));
    tm.bulles.forEach((b) => m.bulles.push(Object.assign({}, b, { y: MIROIR - b.y })));
  }

  function sol(m, x1, x2, g) { m.rects.push({ id: m.id++, x: x1, y: yDe(g), w: x2 - x1, h: H + 300 - yDe(g), type: "sol" }); }
  function bloc(m, x, niveauHaut, w, epaisseur) { // bloc dont la face du dessus est au niveau donné
    m.rects.push({ id: m.id++, x, y: yDe(niveauHaut), w: w || U, h: (epaisseur || 1) * U, type: "bloc" });
  }
  function plafond(m, x1, x2, yBas) { m.rects.push({ id: m.id++, x: x1, y: -400, w: x2 - x1, h: yBas + 400, type: "plafond" }); }
  function pique(m, x, yBase, bas) { m.piques.push({ id: m.id++, x, y: yBase, bas: !!bas }); }
  function tremplin(m, x, g) {
    m.tremplins.push({ id: m.id++, x, y: yDe(g) });
  }
  function anneau(m, x, niveau) { m.anneaux.push({ id: m.id++, x, y: yDe(niveau) }); }
  function boite(m, x, niveau) { m.boites.push({ id: m.id++, x, y: yDe(niveau) }); }
  // dalle fine (plateforme) dont le dessus est au niveau donné
  function dalle(m, x1, x2, niveau) { m.rects.push({ id: m.id++, x: x1, y: yDe(niveau), w: x2 - x1, h: 0.5 * U, type: "bloc" }); }

  // Sommet du PLUS GRAND saut possible depuis le bord d'une marche : on simule le cube qui court
  // sur la marche à la vitesse de croisière, saute au tout dernier moment et garde appuyé.
  function sommetSautMax(marche) {
    const tw = { rects: [marche], fin: Infinity, reperes: [] };
    LISTES.forEach((k) => { if (!tw[k]) tw[k] = []; });
    let j = nouveauJoueur();
    Object.assign(j, { x: marche.x, y: marche.y - U, v: vitesseBase(marche.x), sol: true });
    let dernier = copier(j);
    for (let i = 0; i < 600; i++) { // court sans sauter : on garde le dernier instant encore sur la marche
      const c = copier(j); etape(c, tw, 1 / 120, false);
      if (!c.sol) break;
      dernier = copier(j); j = c;
    }
    j = dernier;
    let best = { x: j.x, y: j.y };
    for (let i = 0; i < 240; i++) {
      etape(j, tw, 1 / 120, true);
      if (j.y < best.y) best = { x: j.x, y: j.y };
      if (j.vy > 0) break;
    }
    return best; // coin haut-gauche du cube au sommet
  }

  // Chaque morceau commence par du sol au niveau courant g (point de reprise sûr)
  const MORCEAUX = [
    { nom: "piques", min: 0, poids: 4, f(m, x, g, a) {
      const n = 1 + ((a() * 3) | 0); const l = 4 + n;
      sol(m, x, x + l * U, g);
      for (let i = 0; i < n; i++) pique(m, x + (2 + i) * U, yDe(g));
      if (a() < 0.3) boite(m, x + (2 + n / 2) * U, g + 3);
      return { l, g };
    } },
    { nom: "blocs", min: 0, poids: 6, f(m, x, g, a) {
      // bloc · piques · bloc OU piques · bloc · piques (échangés), 3 ou 5 éléments,
      // espaces de 2 à 3 cases, 1 à 3 piques, blocs simples, doubles ou larges
      const espace = () => 2 + ((a() * 3) | 0) * 0.5;
      let cx = 2, typeBloc = a() < 0.5, double = false;
      const hautes = [];
      const n = a() < 0.4 ? 5 : 3;
      for (let e = 0; e < n; e++) {
        if (e > 0) cx += espace();
        if (typeBloc) {
          const r = a(), larg = r < 0.25 ? 2 : 1, haut = r > 0.7 ? 2 : 1;
          if (haut === 2) double = true;
          for (let k = 1; k <= haut; k++) bloc(m, x + cx * U, g + k, larg * U);
          cx += larg;
        } else {
          const np = 1 + ((a() * 3) | 0);
          for (let i = 0; i < np; i++) pique(m, x + (cx + i) * U, yDe(g));
          // une fois sur deux, une bulle de saut au-dessus des piques
          if (a() < 0.5) {
            m.bulles.push({ id: m.id++, x: x + (cx + np / 2) * U, y: yDe(g + 2.5) });
            // environ une bulle sur trois a une boîte très haut : seulement avec le DOUBLE saut (bulle puis rappui)
            // (0,64 car on en retire près de la moitié : pas de boîte à côté d'un bloc double)
            if (a() < 0.64) hautes.push(x + (cx + np / 2 + 2.5) * U);
          }
          else if (a() < 0.25) boite(m, x + (cx + np / 2) * U, g + 3);
          cx += np;
        }
        typeBloc = !typeBloc;
      }
      // (pas de boîte du double saut à côté d'un bloc double : on l'attraperait d'un simple saut depuis dessus)
      if (!double) hautes.forEach((bx) => boite(m, bx, g + 7.2));
      const l = Math.ceil(cx + 2);
      sol(m, x, x + l * U, g);
      return { l, g };
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
    { nom: "escalier", min: 80, poids: 3, f(m, x, g, a) {
      bloc(m, x + 2 * U, g + 1, 2 * U, 1); bloc(m, x + 4 * U, g + 2, 2 * U, 2);
      const haut = { id: m.id++, x: x + 6 * U, y: yDe(g + 3), w: 2 * U, h: 3 * U, type: "bloc" };
      m.rects.push(haut);
      if (a() < 0.45) {
        // plateforme haute PLUS LOIN, séparée de l'escalier par du vide : on ne l'atteint qu'en sautant
        // du haut des marches (une boîte flotte dans le vide, au sommet du grand saut).
        // On peut aussi l'ignorer et passer en bas.
        const l = 29;
        sol(m, x, x + l * U, g);
        dalle(m, x + 15 * U, x + 25 * U, g + 5);
        pique(m, x + 13 * U, yDe(g)); pique(m, x + 20 * U, yDe(g));
        const s0 = sommetSautMax(haut);
        m.boites.push({ id: m.id++, x: s0.x + U / 2, y: s0.y + U / 2 });
        if (a() < 0.5) boite(m, x + 23 * U, g + 6.2);
        return { l, g };
      }
      // long tapis de piques après l'escalier : il FAUT le plus grand saut, depuis le haut des marches.
      // Une boîte n'est atteignable qu'avec le saut parfait (au tout dernier moment, appui maximal).
      const l = 19;
      sol(m, x, x + l * U, g);
      for (let i = 9; i < 16; i++) pique(m, x + i * U, yDe(g));
      const s0 = sommetSautMax(haut);
      m.boites.push({ id: m.id++, x: s0.x + U / 2 + 20, y: s0.y + U / 2 - 18 }); // réglé par simulation : grand saut bien placé (pas forcément parfait)
      return { l, g };
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
      // trois étages : en bas (piques), au milieu, en haut (boîtes) — plateformes bien espacées, peu de piques en haut
      const l = 30;
      sol(m, x, x + l * U, g);
      const dalle = (x1, x2, h) => m.rects.push({ id: m.id++, x: x1, y: yDe(h), w: x2 - x1, h: 0.5 * U, type: "bloc" });
      dalle(x + 3 * U, x + 9 * U, g + 2.5); dalle(x + 16 * U, x + 22 * U, g + 2.5);
      dalle(x + 10 * U, x + 15 * U, g + 5); dalle(x + 23 * U, x + 28 * U, g + 5);
      pique(m, x + 12 * U, yDe(g)); pique(m, x + 25 * U, yDe(g));
      if (a() < 0.5) pique(m, x + 19 * U, yDe(g + 2.5));
      boite(m, x + 12.5 * U, g + 6.3);
      if (a() < 0.5) boite(m, x + 25.5 * U, g + 6.3);
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
    { nom: "eboulement", min: 150, poids: 2, f(m, x, g, a) {
      // des cubes se détachent du plafond juste avant qu'on arrive : on saute par-dessus une fois tombés
      const l = 18, yb = yDe(g) - 5 * U;
      sol(m, x, x + l * U, g);
      plafond(m, x + 2 * U, x + 16 * U, yb);
      [5, 10, 14].forEach((i) => m.tombants.push({ id: m.id++, x: x + i * U, y0: yb, yFin: yDe(g) - U, w: U, h: U }));
      return { l, g };
    } },
    { nom: "ascenseurs", min: 200, poids: 2, f(m, x, g, a) {
      // plateformes qui montent et descendent au-dessus du vide
      sol(m, x, x + 2 * U, g);
      let cx = x + 3.5 * U;
      for (let i = 0; i < 3; i++) {
        m.mobiles.push({ id: m.id++, x: cx, w: 3 * U, h: 0.5 * U, yc: yDe(g + 0.5), amp: 1.5 * U, P: 2.2 + a() * 0.6, ph: a() * 6.283 });
        cx += 4.5 * U;
      }
      sol(m, cx, cx + 3 * U, g);
      return { l: (cx - x) / U + 3, g };
    } },
    { nom: "effondrement", min: 120, poids: 2, f(m, x, g, a) {
      // pont de dalles fissurées : elles tombent juste après notre passage
      sol(m, x, x + 2 * U, g);
      let cx = x + 2 * U;
      for (let i = 0; i < 12; i++) {
        if (i === 6) { cx += 2 * U; continue; }
        m.fragiles.push({ id: m.id++, x: cx, y: yDe(g), w: U, h: 0.4 * U });
        cx += U;
      }
      sol(m, cx, cx + 3 * U, g);
      return { l: (cx - x) / U + 3, g };
    } },
    { nom: "gravite", min: 300, poids: 2, possible: (g) => g <= 1, f(m, x, g, a) {
      // un portail retourne le cube : il court au plafond (trous et piques), un second portail le remet à l'endroit
      const l = 34, yb = yDe(g) - 4.5 * U;
      sol(m, x, x + l * U, g);
      plafond(m, x + 3 * U, x + 10 * U, yb); plafond(m, x + 12 * U, x + 20 * U, yb); plafond(m, x + 22.5 * U, x + 31 * U, yb);
      m.portails.push({ id: m.id++, x: x + 3.5 * U, haut: yb, bas: yDe(g), grav: -1 });
      pique(m, x + 15 * U, yb, true); pique(m, x + 16 * U, yb, true); pique(m, x + 26 * U, yb, true);
      if (a() < 0.5) boite(m, x + 7 * U, g + 2.5);
      m.portails.push({ id: m.id++, x: x + 30 * U, haut: yb, bas: yDe(g), grav: 1 });
      return { l, g };
    } },
    { nom: "envers", min: 250, poids: 2, f(m, x, g, a) {
      // entrée d'une partie du parcours À L'ENVERS : les obstacles habituels, retournés, au plafond
      const l = 9;
      sol(m, x, x + l * U, g);
      solHaut(m, x + U, x + l * U, g);
      m.portails.push({ id: m.id++, x: x + 2 * U, haut: MIROIR - yDe(g), bas: yDe(g), grav: -1 });
      m.envers = 4 + ((a() * 4) | 0);
      return { l, g };
    } },
    { nom: "tapis", min: 100, poids: 2, f(m, x, g, a) {
      // tapis roulants : vers l'avant (on file) puis vers l'arrière (on rame)
      const l = 17;
      sol(m, x, x + l * U, g);
      m.tapis.push({ id: m.id++, x: x + U, w: 6 * U, y: yDe(g), dir: 1 });
      pique(m, x + 9 * U, yDe(g)); pique(m, x + 10 * U, yDe(g));
      m.tapis.push({ id: m.id++, x: x + 12 * U, w: 5 * U, y: yDe(g), dir: -1 });
      pique(m, x + 14 * U, yDe(g));
      return { l, g };
    } },
    { nom: "mur-rebond", min: 250, poids: 2, possible: (g) => g <= 1, f(m, x, g, a) {
      // mur trop haut pour un seul saut : on rebondit contre lui (garder appuyé)
      const l = 13;
      sol(m, x, x + l * U, g);
      m.rects.push({ id: m.id++, x: x + 5 * U, y: yDe(g + 6), w: 2 * U, h: 6 * U, type: "rebond" });
      if (a() < 0.5) boite(m, x + 6 * U, g + 7.5);
      return { l, g };
    } },
    { nom: "lasers", min: 200, poids: 2, f(m, x, g, a) {
      // rayons qui s'allument en alternance : celui du bas (sauter) ou celui du haut (rester bas)
      const l = 22, P = 1.4, ph = a() * 6.283;
      sol(m, x, x + l * U, g);
      [5, 16].forEach((i, k) => { // deux portes bien éloignées : le temps de se replacer entre les deux
        const f = ph + k * 1.7;
        m.lasers.push({ id: m.id++, x: x + i * U + 12, w: 6, y1: yDe(g) - 1.6 * U, y2: yDe(g), P, ph: f });
        m.lasers.push({ id: m.id++, x: x + i * U + 12, w: 6, y1: yDe(g) - 5 * U, y2: yDe(g) - 2.2 * U, P, ph: f + Math.PI });
      });
      return { l, g };
    } },
    { nom: "pendules", min: 300, poids: 2, f(m, x, g, a) {
      // boules à piques qui se balancent juste au-dessus du sol : rester bas passe toujours,
      // mais la boîte « ? » entre les deux demande de sauter au bon moment
      const l = 16, yb = yDe(g) - 7.3 * U;
      sol(m, x, x + l * U, g);
      plafond(m, x + 3 * U, x + 13 * U, yb);
      [5.5, 10.5].forEach((i) => m.pendules.push({ id: m.id++, x: x + i * U, py: yb, L: 6 * U, amp: 0.7, P: 2.4, ph: a() * 6.283, r: 13 }));
      boite(m, x + 8 * U, g + 2.3);
      return { l, g };
    } },
    { nom: "porte", min: 150, poids: 2, f(m, x, g, a) {
      // un interrupteur sur un socle ouvre la porte ; sinon elle finit par s'ouvrir… après une attente
      const l = 13;
      sol(m, x, x + l * U, g);
      bloc(m, x + 3 * U, g + 2, 2 * U, 2);
      const porte = { id: m.id++, x: x + 9 * U, y: -400, w: 0.6 * U, h: yDe(g) + 400 };
      m.portes.push(porte);
      m.boutons.push({ id: m.id++, x: x + 3.5 * U, y: yDe(g + 2), w: U, porte: porte.id });
      return { l, g };
    } },
    { nom: "bulles", min: 250, poids: 2, f(m, x, g, a) {
      // grand vide : chaque bulle touchée donne un saut de plus (rappuyer en l'air)
      sol(m, x, x + 2 * U, g);
      const b = [[7, 2.5], [12.5, 3], [18, 2.5]];
      b.forEach(([i, h]) => m.bulles.push({ id: m.id++, x: x + i * U, y: yDe(g + h) }));
      sol(m, x + 21 * U, x + 24 * U, g);
      return { l: 24, g };
    } },
    { nom: "deux-voies", min: 200, poids: 2, possible: (g) => g <= 2, f(m, x, g, a) {
      // en haut : rapide avec quelques piques espacés ; en bas : sûr mais sur un tapis qui freine
      const l = 20;
      sol(m, x, x + l * U, g);
      m.rects.push({ id: m.id++, x: x + 3 * U, y: yDe(g + 3.5), w: 14 * U, h: 0.5 * U, type: "bloc" });
      [7, 13].forEach((i) => pique(m, x + i * U, yDe(g + 3.5)));
      m.tapis.push({ id: m.id++, x: x + 3 * U, w: 14 * U, y: yDe(g), dir: -1 });
      if (a() < 0.6) boite(m, x + 12.5 * U, g + 5.5);
      return { l, g };
    } },
    { nom: "sombre", min: 200, poids: 2, f(m, x, g, a) {
      // zone sombre : seul un halo autour du cube éclaire
      const l = 21;
      sol(m, x, x + l * U, g);
      m.sombres.push({ id: m.id++, x: x + 2 * U, w: 18 * U });
      pique(m, x + 5 * U, yDe(g)); pique(m, x + 9 * U, yDe(g)); pique(m, x + 10 * U, yDe(g));
      bloc(m, x + 13 * U, g + 1); pique(m, x + 17 * U, yDe(g));
      return { l, g };
    } },
    { nom: "vaisseau", min: 350, poids: 4, f(m, x, g, a) {
      // le cube devient un VAISSEAU (triangle) : appuyer = monter, relâcher = descendre.
      // Couloir entre sol et plafond : scies qui flottent, cubes en lévitation, passages serrés,
      // portes laser, zigzags.
      const sol0 = yDe(g), haut = sol0 - 8 * U, milieu = sol0 - 4 * U - U / 2;
      const yN = (n) => sol0 - n * U; // hauteur n (en blocs) au-dessus du sol du couloir
      const fixe = (x1, w, n1, n2) => m.rects.push({ id: m.id++, x: x1, y: yN(n2), w, h: (n2 - n1) * U, type: "bloc", fixe: true });
      m.portails.push({ id: m.id++, x: x + 3 * U, haut, bas: sol0, mode: "vaisseau" });
      let cx = x + 7 * U;
      const types = ["scies", "cubes", "serre", "lasers", "zigzag"];
      const n = 4 + ((a() * 2) | 0);
      let precedent = "";
      for (let k = 0; k < n; k++) {
        let t = types[(a() * types.length) | 0];
        if (t === precedent) t = types[(types.indexOf(t) + 1) % types.length];
        precedent = t;
        m.reperes.push({ x: cx, g, nom: "vaisseau-" + t, mode: "vaisseau", yv: milieu });
        if (t === "scies") {
          for (let i = 0; i < 3; i++) m.scies.push({ id: m.id++, x: cx + (3 + i * 4.5) * U, yc: yN(4), amp: 2.6 * U, P: 1.6 + a() * 0.8, ph: a() * 6.283, r: 14 });
          cx += 16 * U;
        } else if (t === "cubes") {
          // petits cubes en lévitation, en haut ou en bas, bien espacés
          for (let i = 0; i < 4; i++) {
            const bas = a() < 0.5;
            if (bas) fixe(cx + (2 + i * 4.5) * U, U, 0, 1.5 + a());
            else fixe(cx + (2 + i * 4.5) * U, U, 6 + a() * 0.5, 8);
          }
          cx += 20 * U;
        } else if (t === "serre" || t === "zigzag") {
          // couloir (4,5 blocs de haut) dont le centre monte et descend en pente douce
          const pas = 3, demi = 2.25;
          const chemin = t === "zigzag" ? [3, 3.5, 4, 4.5, 5, 5, 4.5, 4, 3.5, 3] : [];
          if (t === "serre") { let c = 4; for (let i = 0; i < 7; i++) { c = Math.max(3, Math.min(5, c + (a() < 0.5 ? -0.5 : 0.5))); chemin.push(c); } }
          chemin.forEach((c, i) => {
            fixe(cx + (1 + i * pas) * U, pas * U, 0, c - demi);
            fixe(cx + (1 + i * pas) * U, pas * U, c + demi, 8);
          });
          cx += (2 + chemin.length * pas) * U;
        } else {
          // portes laser sur TOUTE la hauteur du couloir, avec deux ouvertures qui se ferment à tour de rôle
          const ph = a() * 6.283;
          [3, 11].forEach((i, q) => {
            const f = ph + q * 1.9, lx = cx + i * U + 12;
            const a1 = 1.2 + a() * 1.3, b1 = 5 + a() * 1.2, o = 1.7; // bas des ouvertures A et B, hauteur 1,7 bloc
            const seg = (n1, n2, extra) => m.lasers.push(Object.assign({ id: m.id++, x: lx, w: 6, y1: yN(n2), y2: yN(n1), P: 1.6, ph: f }, extra));
            seg(0, a1, { toujours: true });
            seg(a1, a1 + o, { ph: f });                // ouverture A
            seg(a1 + o, b1, { toujours: true });
            seg(b1, b1 + o, { ph: f + Math.PI });      // ouverture B (fermée quand A est ouverte)
            seg(b1 + o, 8, { toujours: true });
          });
          cx += 15 * U;
        }
      }
      m.portails.push({ id: m.id++, x: cx + 2 * U, haut, bas: sol0, mode: "cube" });
      const l = Math.ceil((cx - x) / U) + 6;
      sol(m, x, x + l * U, g);
      plafond(m, x + 3 * U, cx + 3 * U, haut);
      return { l, g };
    } },
    { nom: "tremplin", min: 450, poids: 3, f(m, x, g, a) {
      const r = a();
      if (g === 0 && r < 0.25) {
        // le tremplin fait monter sur un sol 3 niveaux plus haut
        sol(m, x, x + 4 * U, 0); tremplin(m, x + 1.5 * U, 0);
        sol(m, x + 4 * U, x + 8 * U, 3);
        return { l: 8, g: 3 };
      }
      if (r < 0.7) {
        // le tremplin donne accès à une plateforme haute : un petit passage gardé
        // (scie, porte laser ou piques) protège une boîte « ? » au bout
        const l = 20, h = g + 5;
        sol(m, x, x + l * U, g); tremplin(m, x + 1.5 * U, g);
        dalle(m, x + 6 * U, x + 18 * U, h);
        pique(m, x + 9 * U, yDe(g)); pique(m, x + 13 * U, yDe(g));
        const garde = a();
        // les gardiens repoussent en arrière : sans bien jouer, on retombe de la plateforme
        if (garde < 0.34) { pique(m, x + 11 * U, yDe(h)); pique(m, x + 12 * U, yDe(h)); m.piques.slice(-2).forEach((p) => (p.repousse = true)); }
        else if (garde < 0.67) {
          const ph = a() * 6.283;
          m.lasers.push({ id: m.id++, x: x + 12 * U + 12, w: 6, y1: yDe(h) - 1.6 * U, y2: yDe(h), P: 1.4, ph, repousse: true });
          m.lasers.push({ id: m.id++, x: x + 12 * U + 12, w: 6, y1: yDe(h) - 5 * U, y2: yDe(h) - 2.2 * U, P: 1.4, ph: ph + Math.PI, repousse: true });
        } else m.pendules.push({ id: m.id++, x: x + 12 * U, py: yDe(h) - 6.9 * U, L: 6 * U, amp: 0.7, P: 2.4, ph: a() * 6.283, r: 13 });
        boite(m, x + 16 * U, h + 1.2);
        return { l, g };
      }
      sol(m, x, x + 10 * U, g); tremplin(m, x + 1.5 * U, g);
      for (let i = 3; i < 8; i++) pique(m, x + i * U, yDe(g));
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
  // Plateformes volantes (qui ne reposent ni sur le sol ni sur un autre bloc) : indestructibles,
  // sinon on ne pourrait plus passer certains obstacles (vide en dessous, étage du haut…)
  function marquerVolantes(rects, debut) {
    for (let i = debut; i < rects.length; i++) {
      const r = rects[i];
      if (r.type === "sol" || r.type === "plafond") continue;
      const base = r.y + r.h;
      const pose = rects.some((o) => o !== r && Math.abs(o.y - base) < 1 && o.x < r.x + r.w - 1 && o.x + o.w > r.x + 1);
      if (!pose) r.fixe = true;
    }
  }

  function etendre(m, xMax) {
    while (m.xGen < Math.min(xMax, m.fin + 20 * U)) {
      const d = m.xGen / U;
      if (m.xGen >= m.fin) { // après l'arrivée : sol plat (et on remet à l'endroit si besoin)
        if (m.envers) { solHaut(m, m.xGen, m.xGen + 6 * U, m.g); m.portails.push({ id: m.id++, x: m.xGen + 2 * U, haut: MIROIR - yDe(m.g), bas: yDe(m.g), grav: 1 }); m.envers = 0; }
        sol(m, m.xGen, m.xGen + 40 * U, m.g); m.xGen += 40 * U; break;
      }
      const envers = m.envers > 0;
      const dispo = MORCEAUX.filter((c) => c.min <= d && (!c.possible || c.possible(m.g)) && (envers ? ENVERS_OK.includes(c.nom) : true));
      let r = m.alea() * dispo.reduce((s, c) => s + c.poids, 0), choix = dispo[0];
      for (const c of dispo) { r -= c.poids; if (r <= 0) { choix = c; break; } }
      // il y a TOUJOURS au moins une partie à l'envers : si le hasard ne l'a pas encore amenée, on l'impose
      if (!envers && !m.dejaEnvers && d >= 280) choix = MORCEAUX.find((c) => c.nom === "envers") || choix;
      // … et toujours au moins un passage en vaisseau
      if (!envers && !m.dejaVaisseau && m.dejaEnvers && d >= 550 && choix.nom !== "envers") choix = MORCEAUX.find((c) => c.nom === "vaisseau") || choix;
      if (choix.nom === "envers") m.dejaEnvers = true;
      if (choix.nom === "vaisseau") m.dejaVaisseau = true;
      m.reperes.push({ x: m.xGen, g: m.g, nom: choix.nom, inv: envers });
      const tm = envers ? mondeTemp(m) : m;
      const debut = tm.rects.length;
      const res = choix.f(tm, m.xGen, m.g, m.alea);
      marquerVolantes(tm.rects, debut);
      if (envers) retourner(m, tm);
      m.xGen += res.l * U; m.g = res.g;
      // sol plat entre deux morceaux, court : on ne meurt pas, les obstacles peuvent être serrés
      const v = vitesseBase(m.xGen);
      const ecart = Math.max(0.12 * v, (2.5 - d / 1000) * U) + m.alea() * 1.2 * U;
      if (envers) {
        m.envers--;
        if (m.envers === 0) {
          // sortie : un portail remet à l'endroit, on retombe sur un sol normal
          m.reperes.push({ x: m.xGen, g: m.g, nom: "sortie", inv: true });
          solHaut(m, m.xGen, m.xGen + 5 * U, m.g);
          m.portails.push({ id: m.id++, x: m.xGen + 2 * U, haut: MIROIR - yDe(m.g), bas: yDe(m.g), grav: 1 });
          sol(m, m.xGen, m.xGen + 9 * U, m.g);
          m.xGen += 9 * U;
          m.reperes.push({ x: m.xGen, g: m.g, nom: "plat" });
          sol(m, m.xGen, m.xGen + ecart, m.g);
        } else {
          m.reperes.push({ x: m.xGen, g: m.g, nom: "plat", inv: true });
          solHaut(m, m.xGen, m.xGen + ecart, m.g);
        }
      } else {
        m.reperes.push({ x: m.xGen, g: m.g, nom: "plat", inv: !!m.envers });
        if (m.envers) solHaut(m, m.xGen, m.xGen + ecart, m.g); else sol(m, m.xGen, m.xGen + ecart, m.g);
      }
      m.xGen += ecart;
    }
  }

  const LISTES = ["rects", "piques", "tremplins", "anneaux", "boites", "flaques", "tombants", "mobiles", "fragiles", "portails", "tapis", "lasers", "pendules", "portes", "boutons", "bulles", "sombres", "scies"];

  // Oublie ce qui est loin derrière (le mode infini ne grossit pas sans fin)
  function nettoyer(m, xMin) {
    const garde = (o) => o.x + (o.w || U) > xMin;
    LISTES.forEach((k) => { m[k] = m[k].filter(garde); });
    m.reperes = m.reperes.filter((r) => r.x > xMin - 2000);
  }

  // ---------- Joueur ----------
  // On ne meurt jamais : une erreur fait perdre de la vitesse ou du temps.
  //   pique         → on trébuche : vitesse × 0,25, petit rebond, 0,7 s sans nouveau choc
  //   mur / bloc    → on est bloqué contre (vitesse 0) jusqu'à ce qu'on saute par-dessus
  //   trou          → on repart du dernier point de reprise (temps perdu)
  // La vitesse remonte toute seule (accélération), jusqu'à la vitesse de croisière.
  const ACCEL = 520;
  const VAISSEAU_MONTE = 1900, VAISSEAU_DESCEND = 1500, VAISSEAU_VMAX = 380;
  function nouveauJoueur() {
    return { x: 0, y: yDe(0) - U, vy: 0, v: 0, sol: true, rot: 0, bouclier: false, boost: 0, lent: 0, stun: 0, inv: 0,
      anneaux: [], flaques: [], boites: [], t: 0, recul: 0, elanT: 0, elanV: 0, tirage: null, mode: "cube", grav: 1, tenu: false, prec: false, charge: false, rebonds: 0, tapis: 0, trig: {}, attente: {}, bulles: [] };
  }
  // copie indépendante (pour les simulations)
  function copier(j) {
    return Object.assign({}, j, { anneaux: j.anneaux.slice(), flaques: j.flaques.slice(), boites: j.boites.slice(), bulles: j.bulles.slice(),
      trig: Object.assign({}, j.trig), attente: Object.assign({}, j.attente), croc: j.croc ? Object.assign({}, j.croc) : null, tirage: j.tirage ? Object.assign({}, j.tirage) : null });
  }

  // point de reprise : le dernier repère derrière le joueur (les pièges déclenchés sont remis en place)
  function reprise(j, m, x) {
    const ref = x == null ? j.x - U : x;
    const r = m.reperes.filter((p) => p.x <= ref).pop() || m.reperes[0] || { x: 0, g: 0 };
    placer(j, r);
  }
  function placer(j, r) { // à l'arrêt sur un point de reprise (au plafond si on est dans une partie à l'envers)
    Object.assign(j, { x: r.x + 2, y: r.mode === "vaisseau" ? r.yv : r.inv ? MIROIR - yDe(r.g) : yDe(r.g) - U, mode: r.mode || "cube",
      vy: 0, v: 0, sol: r.mode !== "vaisseau", rot: 0, tenu: false, croc: null, recul: 0, elanT: 0, tirage: null, grav: r.inv ? -1 : 1,
      charge: false, rebonds: 0, tapis: 0, trig: {}, attente: {}, bulles: [] });
  }

  const vitesseCroisiere = (j) => vitesseBase(j.x) * (j.boost > 0 ? 1.5 : 1) * (j.lent > 0 ? 0.6 : 1) * (j.tapis > 0 ? 1.6 : j.tapis < 0 ? 0.5 : 1);
  const vitesseJoueur = (j) => j.v;

  // ---------- Pièges animés (leur état dépend du temps du joueur et de ce qu'il a déclenché) ----------
  const CHUTE_DELAI = 0.55, FRAGILE_DELAI = 0.3, PORTE_ATTENTE = 0.25;
  function yTombant(o, j) { // haut du cube qui tombe
    const t0 = j.trig[o.id];
    if (t0 == null) return o.y0;
    const tau = j.t - t0;
    return Math.min(o.yFin, o.y0 + 0.5 * G * tau * tau);
  }
  const yMobile = (o, t) => o.yc + o.amp * Math.sin((2 * Math.PI * t) / o.P + o.ph);
  const yScie = (o, t) => o.yc + o.amp * Math.sin((2 * Math.PI * t) / o.P + o.ph);
  const laserActif = (o, t) => o.toujours || Math.sin((2 * Math.PI * t) / o.P + o.ph) > 0.15;
  function posPendule(o, t) {
    const th = o.amp * Math.sin((2 * Math.PI * t) / o.P + o.ph);
    return { x: o.x + o.L * Math.sin(th), y: o.py + o.L * Math.cos(th) };
  }
  const fragileTombe = (o, j) => j.trig[o.id] != null && j.t - j.trig[o.id] > FRAGILE_DELAI;
  const porteOuverte = (o, j) => j.trig[o.id] != null;

  // rectangles solides du moment pour ce joueur (pièges animés compris)
  function rectsDuMoment(m, j) {
    const l = m.rects.slice();
    m.tombants.forEach((o) => { if (!o.detruit) l.push({ x: o.x, y: yTombant(o, j), w: o.w, h: o.h, type: "tombant", src: o }); });
    m.mobiles.forEach((o) => l.push({ x: o.x, y: yMobile(o, j.t), w: o.w, h: o.h, type: "mobile", src: o }));
    m.fragiles.forEach((o) => { if (!fragileTombe(o, j)) l.push({ x: o.x, y: o.y, w: o.w, h: o.h, type: "fragile", src: o }); });
    m.portes.forEach((o) => { if (!o.detruit && !porteOuverte(o, j)) l.push({ x: o.x, y: o.y, w: o.w, h: o.h, type: "porte", src: o }); });
    return l;
  }

  // Un pas de physique. Renvoie la liste des événements : "choc", "bloque", "chute", "bouclier", "boite", "glisse", "fini"…
  function etape(j, m, dt, appui) {
    const ev = [];
    j.t += dt;
    const s = j.grav; // 1 = normal, -1 = la tête en bas
    const presse = appui && !j.prec; j.prec = appui;
    ["boost", "lent", "stun", "inv", "elanT"].forEach((k) => { if (j[k] > 0) j[k] = Math.max(0, j[k] - dt); });
    if (j.croc) { balancer(j, m, dt, ev); if (j.croc) { if (j.x >= m.fin) ev.push("fini"); return ev; } }
    // déclencheurs : cubes qui tombent quand on arrive
    for (const o of m.tombants) {
      if (j.trig[o.id] == null && o.x > j.x && (o.x - j.x) / Math.max(j.v, 60) < CHUTE_DELAI) j.trig[o.id] = j.t;
    }
    // vitesse horizontale : remonte vers la vitesse de croisière
    const cible = j.stun > 0 ? 0 : Math.max(vitesseCroisiere(j), j.elanT > 0 ? j.elanV : 0);
    if (j.v < cible) j.v = Math.min(cible, j.v + ACCEL * (j.boost > 0 ? 2.5 : 1) * (j.tapis > 0 ? 2 : 1) * dt);
    else j.v = Math.max(cible, j.v - ACCEL * 2 * dt);
    if (j.tirage) { // tiré par le grappin vers un adversaire : accélération croissante
      const q = j.tirage; q.t += dt; const f = Math.min(1, q.t / q.d);
      j.v = q.v0 + (q.vmax - q.v0) * f * f;
      if (f >= 1) { j.elanV = q.vmax; j.elanT = ELAN_DUREE; j.tirage = null; ev.push("lache"); }
    }
    const vaisseau = j.mode === "vaisseau";
    if (vaisseau) { /* le vaisseau ne saute pas : appuyer = monter, relâcher = descendre */ }
    else if (appui && j.sol && j.stun <= 0) { j.vy = SAUT_V * s; j.sol = false; j.tenu = true; }
    else if (presse && !j.sol && j.charge && j.stun <= 0) { j.vy = SAUT_V * s; j.charge = false; j.tenu = true; ev.push("bulle"); }
    if (j.tenu && !appui) j.tenu = false;
    if (j.vy * s >= 0) j.tenu = false;
    const xa = j.x, ya = j.y;
    if (j.recul > 0) { j.recul = Math.max(0, j.recul - dt); j.v = 0; j.x -= 480 * dt; } // repoussé en arrière par une scie
    else j.x += j.v * dt;
    if (vaisseau) { j.vy = Math.max(-VAISSEAU_VMAX, Math.min(VAISSEAU_VMAX, j.vy + (appui && j.stun <= 0 ? -VAISSEAU_MONTE : VAISSEAU_DESCEND) * dt)); j.tenu = false; }
    else j.vy += G * (j.tenu ? G_TENU : 1) * s * dt;
    j.y += j.vy * dt;
    j.sol = false;

    let contreMur = false;
    for (const r of rectsDuMoment(m, j)) {
      if (r.detruit) continue;
      const gx = j.x + 2, dx = j.x + U - 2;
      if (r.x > dx || r.x + r.w < gx) continue;
      if (j.y + U <= r.y || j.y >= r.y + r.h) continue;
      if (r.type === "tombant" && r.y < r.src.yFin) { // cube en train de tomber : il nous assomme
        if (j.inv <= 0 && !j.bouclier) { j.v *= 0.25; j.inv = 0.7; ev.push("choc"); }
        else if (j.bouclier && j.inv <= 0) { j.bouclier = false; r.src.detruit = true; ev.push("bouclier"); }
        continue;
      }
      const dessus = ya + U <= r.y + 12 && j.vy >= (r.type === "mobile" ? -200 : 0);
      const dessous = ya >= r.y + r.h - 12 && j.vy <= 0;
      if (dessus && !(s < 0 && j.vy < 0)) { j.y = r.y - U; j.vy = 0; if (s > 0) j.sol = true; else ev.push("cogne"); }
      else if (dessous) { j.y = r.y + r.h; j.vy = 0; if (s < 0) j.sol = true; }
      else if (r.type !== "sol" && r.type !== "plafond" && r.type !== "mobile" && r.type !== "fragile" && !r.fixe && j.boost > 0) {
        if (r.src) r.src.detruit = true; else r.detruit = true;
        ev.push("casse");
      } else {
        // de côté : on est bloqué contre (ou, repoussé en arrière, contre ce qui est derrière)
        if (j.recul > 0 && xa >= r.x + r.w - 3) { j.x = r.x + r.w - 1; j.recul = 0; continue; }
        j.x = Math.min(j.x, r.x - U + 1); j.v = 0; contreMur = true;
        if (r.type === "rebond" && !vaisseau && appui && !j.sol && j.rebonds < 4 && j.vy * s > -250) {
          j.vy = SAUT_V * s; j.tenu = true; j.rebonds++; ev.push("rebond");
        }
        if (!ev.includes("bloque")) ev.push("bloque");
      }
    }
    // porte fermée : le temps passé collé contre elle compte, et elle s'ouvre vite (on repart aussitôt à pleine vitesse)
    for (const o of m.portes) {
      if (o.detruit || j.trig[o.id] != null) continue;
      if (j.x + U >= o.x - 4 && j.x < o.x && j.y + U > o.y && j.y < o.y + o.h) {
        j.attente[o.id] = (j.attente[o.id] || 0) + dt;
        if (j.attente[o.id] > PORTE_ATTENTE) { j.trig[o.id] = j.t; j.v = vitesseCroisiere(j); ev.push("porte"); }
      }
    }
    if (j.sol) { j.rebonds = 0; j.charge = false; }
    // dalles fragiles : elles cèdent peu après qu'on a marché dessus
    for (const o of m.fragiles) {
      if (j.trig[o.id] == null && j.sol && Math.abs(j.y + U - o.y) < 2 && j.x + U - 2 > o.x && j.x + 2 < o.x + o.w) j.trig[o.id] = j.t;
    }
    // tapis roulants
    j.tapis = 0;
    if (j.sol) for (const o of m.tapis) if (Math.abs(j.y + U - o.y) < 3 && j.x + U / 2 > o.x && j.x + U / 2 < o.x + o.w) j.tapis = o.dir;

    const touche = (hx1, hx2, hy1, hy2) => j.x + U - 6 > hx1 && j.x + 6 < hx2 && j.y + U - 4 > hy1 && j.y + 4 < hy2;
    function aie(src, bas) {
      if (j.boost > 0 && src) { src.detruit = true; ev.push("casse"); return; }
      if (j.inv > 0) return;
      if (j.bouclier) { j.bouclier = false; if (src) src.detruit = true; ev.push("bouclier"); return; }
      j.v *= 0.25; j.inv = 0.7;
      j.vy = bas ? Math.max(j.vy, 250) : Math.min(j.vy, -380); // vers le bas (plafond) ou petit rebond
      ev.push("choc");
      if (src && src.repousse && j.recul <= 0) { j.recul = 0.35; j.v = 0; ev.push("recul"); } // gardien : repousse en arrière
    }
    for (const p of m.piques) {
      if (p.detruit || p.x > j.x + U || p.x + U < j.x) continue;
      // zone dangereuse plus petite que le dessin
      const hx1 = p.x + 9, hx2 = p.x + U - 9;
      const hy1 = p.bas ? p.y : p.y - U + 12, hy2 = p.bas ? p.y + U - 12 : p.y;
      if (j.x + U - 6 > hx1 && j.x + 6 < hx2 && j.y + U > hy1 && j.y < hy2) aie(p, p.bas);
    }
    for (const o of m.lasers) {
      if (o.detruit || o.x > j.x + U || o.x + o.w < j.x || !laserActif(o, j.t)) continue;
      if (touche(o.x, o.x + o.w, o.y1, o.y2)) aie(o, s < 0);
    }
    for (const o of m.pendules) {
      if (o.detruit || Math.abs(o.x - j.x) > o.L + U) continue;
      const b = posPendule(o, j.t);
      const cx = Math.max(j.x + 3, Math.min(b.x, j.x + U - 3)), cy = Math.max(j.y + 3, Math.min(b.y, j.y + U - 3));
      if ((cx - b.x) ** 2 + (cy - b.y) ** 2 < (o.r - 3) ** 2) {
        // une scie touchée repousse TOUJOURS en arrière (sauf avec le turbo, qui la casse)
        if (j.boost > 0) { o.detruit = true; ev.push("casse"); }
        else if (j.recul <= 0) {
          j.recul = 0.35; j.v = 0; j.inv = 0.7; j.vy = b.y < j.y + U / 2 ? Math.max(j.vy, 200) : -420;
          ev.push("choc", "recul");
        }
      }
    }
    for (const o of m.scies) {
      if (o.detruit || Math.abs(o.x - j.x) > 3 * U) continue;
      const y = yScie(o, j.t);
      const cx = Math.max(j.x + 3, Math.min(o.x, j.x + U - 3)), cy = Math.max(j.y + 3, Math.min(y, j.y + U - 3));
      if ((cx - o.x) ** 2 + (cy - y) ** 2 < (o.r - 3) ** 2) {
        if (j.boost > 0) { o.detruit = true; ev.push("casse"); }
        else if (j.recul <= 0) { j.recul = 0.3; j.v = 0; j.inv = 0.7; j.vy = y < j.y + U / 2 ? 200 : -200; ev.push("choc", "recul"); }
      }
    }
    if (j.y > H || j.y < -2 * U) {
      if (j.bouclier && s > 0) { j.bouclier = false; j.vy = SAUT_TREMPLIN * 1.1; j.y = H - 1; ev.push("bouclier"); }
      else { reprise(j, m, xa - U); j.stun = 0.35; ev.push("chute"); return ev; }
    }
    for (const o of m.portails) {
      if (!(xa + U / 2 < o.x && j.x + U / 2 >= o.x)) continue;
      if (o.mode) { if (j.mode !== o.mode) { j.mode = o.mode; j.vy *= 0.3; j.tenu = false; ev.push("portail"); } }
      else if (j.grav !== o.grav) { j.grav = o.grav; j.sol = false; j.tenu = false; ev.push("portail"); }
    }
    if (s > 0) for (const t of m.tremplins) {
      if (t.x > j.x + U || t.x + U < j.x) continue;
      if (j.y + U >= t.y - 8 && j.y + U <= t.y + 2 && j.vy >= 0) { j.vy = SAUT_TREMPLIN; j.sol = false; j.tenu = false; ev.push("tremplin"); }
    }
    for (const a of m.anneaux) {
      if (!appui || j.anneaux.includes(a.id)) continue;
      if (Math.abs(j.x + U / 2 - a.x) < U && Math.abs(j.y + U / 2 - a.y) < U) { j.vy = SAUT * s; j.tenu = false; j.anneaux.push(a.id); ev.push("anneau"); }
    }
    for (const o of m.bulles) {
      if (j.bulles.includes(o.id)) continue;
      if (Math.abs(j.x + U / 2 - o.x) < U * 0.95 && Math.abs(j.y + U / 2 - o.y) < U * 0.95) { j.bulles.push(o.id); j.charge = true; ev.push("bulle-prise"); }
    }
    for (const o of m.boutons) {
      if (j.trig[o.porte] != null) continue;
      if (j.x + U > o.x && j.x < o.x + o.w && j.y + U > o.y - 10 && j.y < o.y) { j.trig[o.porte] = j.t; ev.push("porte"); }
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
    if (j.mode === "vaisseau") j.rot = Math.atan2(j.vy, Math.max(j.v, 80)) * 0.8;
    else if (j.sol) j.rot = Math.round(j.rot / (Math.PI / 2)) * (Math.PI / 2);
    else j.rot += dt * 7.5 * s;
    if (j.x >= m.fin) ev.push("fini");
    return ev;
  }

  // Laser : détruit les obstacles (pas le sol) devant le joueur
  // Laser : rayon en LIGNE DROITE devant le cube, jusqu'au bord de l'écran (portee en px).
  // Il détruit les obstacles (pas le sol ni les plafonds) qui croisent la bande à hauteur du cube.
  function laser(j, m, portee) {
    const x1 = j.x + U, x2 = j.x + (portee || 620);
    const y1 = j.y - 1.5 * U, y2 = j.y + 2.5 * U;
    const dansX = (x, w) => x < x2 && x + (w || U) > x1;
    const dansY = (a, b) => a < y2 && b > y1;
    let n = 0;
    const casser = (o) => { o.detruit = true; n++; };
    m.rects.forEach((r) => { if (!r.detruit && !r.fixe && r.type !== "sol" && r.type !== "plafond" && dansX(r.x, r.w) && dansY(r.y, r.y + r.h)) casser(r); });
    m.piques.forEach((p) => { if (!p.detruit && dansX(p.x) && (p.bas ? dansY(p.y, p.y + U) : dansY(p.y - U, p.y))) casser(p); });
    m.tombants.forEach((o) => { const y = yTombant(o, j); if (!o.detruit && dansX(o.x, o.w) && dansY(y, y + o.h)) casser(o); });
    m.lasers.forEach((o) => { if (!o.detruit && dansX(o.x, o.w) && dansY(o.y1, o.y2)) casser(o); });
    m.pendules.forEach((o) => { const b = posPendule(o, j.t); if (!o.detruit && dansX(b.x - o.r, 2 * o.r) && dansY(b.y - o.r, b.y + o.r)) casser(o); });
    m.portes.forEach((o) => { if (!o.detruit && dansX(o.x, o.w) && dansY(o.y, o.y + o.h)) casser(o); });
    m.scies.forEach((o) => { const y = yScie(o, j.t); if (!o.detruit && dansX(o.x - o.r, 2 * o.r) && dansY(y - o.r, y + o.r)) casser(o); });
    return { x1, x2, y: j.y + U / 2, n };
  }

  // Grappin : un vrai BALANCIER. Le câble s'accroche au plafond devant et au-dessus du cube ;
  // le cube part en arrière du point d'accroche et accélère en descendant : vitesse MAXIMALE au point
  // le plus bas. Tant qu'on garde le bouton appuyé, on continue de se balancer ; en le lâchant, le cube
  // part avec sa vitesse du moment, qu'il GARDE pendant 1 s.
  const BALANCE_DEPART = -0.75, BALANCE_LEVAGE = 0.12, BALANCE_MAX = 3, ELAN_DUREE = 1;
  function accrocher(j, m) {
    const s = j.grav, cx = j.x + U / 2, cy = j.y + U / 2;
    const k = Math.sin(-BALANCE_DEPART);                // décalage horizontal relatif du point d'accroche
    let L = 6 * U, air = true;
    // plafond le plus proche au-dessus (ou au-dessous à l'envers) entre le cube et le point d'accroche
    let lim = s > 0 ? 0 : H;
    for (const r of m.rects) {
      if (r.detruit || r.x > cx + k * 7 * U || r.x + r.w < cx) continue;
      if (s > 0 && r.y + r.h <= j.y + 1) lim = Math.max(lim, r.y + r.h);
      if (s < 0 && r.y >= j.y + U - 1) lim = Math.min(lim, r.y);
    }
    const place = Math.abs(cy - lim);
    L = Math.max(3 * U, Math.min(6 * U, place)); air = place > 6 * U;
    // le point le plus bas du balancier est à la hauteur actuelle du cube
    const ax = cx + L * k, ay = cy - s * L;
    j.croc = { ax, ay, L, th: BALANCE_DEPART, w: Math.max(j.v, 150) / L, t: 0, tenu: true, air, s,
      x0: j.x, y0: j.y };
    j.sol = false; j.tenu = false; j.tirage = null;
  }
  function lacher(j, ev, bloque) {
    const c = j.croc, s = j.grav;
    const vx = bloque ? 0 : c.L * c.w * Math.cos(c.th);
    j.vy = bloque ? 0 : -s * c.L * c.w * Math.sin(c.th);
    j.v = Math.max(0, vx);
    if (j.v > vitesseCroisiere(j)) { j.elanV = j.v; j.elanT = ELAN_DUREE; } // l'élan reste 1 s
    j.croc = null; ev.push("lache");
  }
  function balancer(j, m, dt, ev) {
    const c = j.croc, s = j.grav;
    c.t += dt;
    const posA = (th) => ({ x: c.ax + c.L * Math.sin(th) - U / 2, y: c.ay + s * c.L * Math.cos(th) - U / 2 });
    if (c.t < BALANCE_LEVAGE) { // le câble se tend et soulève le cube jusqu'au départ du balancier
      const p = posA(c.th), f = c.t / BALANCE_LEVAGE;
      j.x = c.x0 + (p.x - c.x0) * f; j.y = c.y0 + (p.y - c.y0) * f;
      return;
    }
    if (!c.tenu || c.t > BALANCE_MAX) { lacher(j, ev, false); return; }
    c.w += -(G / c.L) * Math.sin(c.th) * dt; // pendule : accélère en descendant, ralentit en remontant
    c.th += c.w * dt;
    const p = posA(c.th);
    // l'élan casse les obstacles ; sol, plafonds et plateformes volantes arrêtent le balancement
    let heurte = false;
    for (const r of rectsDuMoment(m, j)) {
      if (r.detruit || (r.src && r.src.detruit) || !(p.x + U - 3 > r.x && p.x + 3 < r.x + r.w && p.y + U - 3 > r.y && p.y + 3 < r.y + r.h)) continue;
      if (r.fixe || ["sol", "plafond", "mobile", "fragile"].includes(r.type)) heurte = true;
      else { if (r.src) r.src.detruit = true; else r.detruit = true; if (!ev.includes("casse")) ev.push("casse"); }
    }
    if (heurte) { lacher(j, ev, true); return; }
    j.x = p.x; j.y = p.y;
    j.rot = c.th * s;
  }
  // Grappin sur un adversaire (course) : on est tiré de plus en plus vite, vitesse MAXIMALE à la fin
  function tirer(j, duree) {
    j.croc = null;
    j.tirage = { t: 0, d: duree || 0.5, v0: j.v, vmax: 1.9 * vitesseCroisiere(j) };
  }

  // sol sous une abscisse (pour poser une flaque)
  function solSous(m, x) {
    const r = m.rects.filter((r) => r.type === "sol" && !r.haut && r.x <= x && r.x + r.w >= x).sort((a, b) => a.y - b.y)[0];
    return r ? r.y : null;
  }

  const API = { U, SOL, H, X_CUBE, G, SAUT, SAUT_V, SAUT_TREMPLIN, SAUT_COUPE, vitesseBase, vitesseJoueur, vitesseCroisiere, yDe, mulberry32, creerMonde, etendre, nettoyer, nouveauJoueur, copier, reprise, placer, MIROIR, accrocher, tirer, etape, laser, solSous, MORCEAUX, LISTES,
    yTombant, yMobile, yScie, laserActif, posPendule, fragileTombe, porteOuverte };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.DashMoteur = API;
})(typeof window !== "undefined" ? window : globalThis);
