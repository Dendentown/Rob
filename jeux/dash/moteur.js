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
  // Appui bref ≈ 2,1 blocs, appui long = 3,1 blocs (réglé pour les sets de motifs) ; la hauteur grandit doucement avec la durée.
  const SAUT_V = -580, G_TENU = 0.674, SAUT_COUPE = -580;
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
      tombants: [], mobiles: [], fragiles: [], portails: [], tapis: [], lasers: [], pendules: [], portes: [], boutons: [], bulles: [], sombres: [], scies: [], courants: [], anneauxV: [], lasersH: [],
      fin: options.longueur ? options.longueur * U : Infinity,
      alea: mulberry32(graine >>> 0), xGen: 0, g: 0, id: 0, course: !!options.course,
    };
    sol(m, 0, 12 * U, 0);
    m.reperes.push({ x: 0, g: 0 });
    m.xGen = 12 * U;
    // Parties spéciales (À L'ENVERS ou VAISSEAU) tirées au hasard, séparées par du parcours normal :
    // jamais deux fois la même à la suite, et le normal est en moyenne plus long que chacune d'elles.
    m.speciales = true;
    m.prochaineSpeciale = 60 + m.alea() * 90; // (en blocs)
    m.derniereSpeciale = null;
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
  // boîte du double saut : juste au-dessus de la bulle (un peu en avant, là où le double saut monte)
  let DX_DOUBLE = 2, H_DOUBLE = 6.8;
  const MORCEAUX = [
    { nom: "piques", min: 0, poids: 4, f(m, x, g, a) {
      const n = 1 + ((a() * 3) | 0); const l = 4 + n;
      sol(m, x, x + l * U, g);
      for (let i = 0; i < n; i++) pique(m, x + (2 + i) * U, yDe(g));
      a(); // (plus de « ? » au-dessus de piques seuls)
      return { l, g };
    } },
    { nom: "blocs", min: 0, poids: 6, f(m, x, g, a) {
      // bloc · piques · bloc OU piques · bloc · piques (échangés), 3 ou 5 éléments,
      // espaces de 2 à 3 cases, 1 à 3 piques, blocs simples, doubles ou larges.
      // BULLES (double saut) au-dessus de certains piques, sans jamais punir celui qui les utilise :
      //  - après une bulle, les piques suivants ont aussi leur bulle (2 séries à la suite au plus),
      //    puis un espace de sol libre pour se réceptionner ;
      //  - une bulle qui n'est pas entre deux blocs a toujours un objet très haut au-dessus ;
      //    entre deux blocs, l'objet est seulement parfois là.
      const espace = () => 2 + ((a() * 3) | 0) * 0.5;
      const n = a() < 0.4 ? 5 : 3;
      let typeBloc = a() < 0.5;
      const elems = [];
      for (let e = 0; e < n; e++) {
        if (typeBloc) { const r = a(); elems.push({ bloc: true, larg: r < 0.25 ? 2 : 1, haut: r > 0.7 ? 2 : 1 }); }
        else elems.push({ bloc: false, np: 1 + ((a() * 3) | 0), entre: e > 0 && e < n - 1 });
        typeBloc = !typeBloc;
      }
      // à côté d'un bloc double, un objet haut s'attraperait d'un simple saut : pas de bulles alors
      const double = elems.some((o) => o.bloc && o.haut === 2);
      let cx = 2, chaine = 0; // chaine = nombre de séries piques + bulle à la suite (2 au plus)
      elems.forEach((o, e) => {
        if (e > 0) cx += espace();
        if (chaine >= 2) { cx += 8; chaine = 0; } // après 2 bulles : un espace pour se réceptionner
        if (o.bloc) {
          for (let k = 1; k <= o.haut; k++) bloc(m, x + cx * U, g + k, o.larg * U);
          cx += o.larg;
          return;
        }
        for (let i = 0; i < o.np; i++) pique(m, x + (cx + i) * U, yDe(g));
        const bx = x + (cx + o.np / 2) * U;
        if (!double && (chaine > 0 || a() < 0.45)) {
          chaine++;
          m.bulles.push({ id: m.id++, x: bx, y: yDe(g + 2.5) });
          if (!o.entre || a() < 1 / 3) boite(m, bx + DX_DOUBLE * U, g + H_DOUBLE);
        }
        cx += o.np;
      });
      // après une bulle, de la place pour retomber du double saut (pas de piques juste après)
      const l = Math.ceil(cx + (chaine > 0 ? 10 : 2));
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
      if (g <= 2 && a() < 0.45) {
        // plateforme haute séparée de l'escalier par un peu de vide : on ne l'atteint qu'en sautant
        // du haut des marches (une boîte flotte dans le vide, sur la trajectoire du saut).
        // Parfois DEUX plateformes en escalier (pique ou scie sur la première, un objet dans le vide à la fin).
        // On peut aussi tout ignorer et passer en bas.
        if (g <= 1 && a() < 0.5) {
          // DEUX plateformes en escalier : un pique ou une scie sur la première,
          // et un seul objet, dans le vide après la seconde : il faut sauter du bout pour l'attraper
          const l = 36;
          sol(m, x, x + l * U, g);
          dalle(m, x + 12 * U, x + 19 * U, g + 4.6);
          const p2 = { id: m.id++, x: x + 21.5 * U, y: yDe(g + 7), w: 5.5 * U, h: 0.5 * U, type: "bloc" };
          m.rects.push(p2);
          if (a() < 0.5) pique(m, x + 15.5 * U, yDe(g + 4.6));
          else m.pendules.push({ id: m.id++, x: x + 15.5 * U, py: yDe(g + 4.6) - 6.9 * U, L: 6 * U, amp: 0.7, P: 2.4, ph: a() * 6.283, r: 13 });
          pique(m, x + 13 * U, yDe(g)); pique(m, x + 22 * U, yDe(g)); pique(m, x + 30 * U, yDe(g));
          const s2 = sommetSautMax(p2);
          m.boites.push({ id: m.id++, x: s2.x + U / 2 - 0.5 * U, y: s2.y + U / 2 + 0.8 * U });
          return { l, g };
        }
        // trois plateformes : basse, HAUTE (avec l'objet), basse
        const l = 34;
        sol(m, x, x + l * U, g);
        dalle(m, x + 12 * U, x + 17 * U, g + 4.6);
        dalle(m, x + 19 * U, x + 24 * U, g + 6.6);
        dalle(m, x + 26 * U, x + 31 * U, g + 4.6);
        boite(m, x + 21.5 * U, g + 7.8);
        pique(m, x + 13 * U, yDe(g)); pique(m, x + 20 * U, yDe(g)); pique(m, x + 27 * U, yDe(g));
        return { l, g };
      }
      // long tapis de piques après l'escalier : il FAUT le plus grand saut, depuis le haut des marches.
      // Une boîte n'est atteignable qu'avec le saut parfait (au tout dernier moment, appui maximal).
      const l = 19;
      sol(m, x, x + l * U, g);
      for (let i = 9; i < 16; i++) pique(m, x + i * U, yDe(g));
      const s0 = sommetSautMax(haut);
      m.boites.push({ id: m.id++, x: s0.x + U / 2 + 6, y: s0.y + U / 2 + 6 }); // réglé par simulation : facile avec un bon grand saut
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
    { nom: "gravite", min: 300, poids: 0, possible: (g) => g <= 1, f(m, x, g, a) { // (désactivé : une seule partie à l'envers par course)
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
      m.envers = 1;
      m.enversFin = x + (m.longEnvers || 120) * U - 12 * U; // fin de la partie à l'envers (avant la sortie)
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
      const types = ["scies", "cubes", "serre", "lasers", "zigzag", "courant", "vitesse", "lasersH"];
      // longueur voulue (en blocs) : un quart de la course quand c'est LA partie vaisseau
      const longueur = m.longVaisseau || 100;
      let precedent = "";
      for (let k = 0; cx - x < (longueur - 30) * U; k++) {
        let t = types[(a() * types.length) | 0];
        if (t === precedent) t = types[(types.indexOf(t) + 1) % types.length];
        precedent = t;
        m.reperes.push({ x: cx, g, nom: "vaisseau-" + t, mode: "vaisseau", yv: milieu });
        if (t === "courant") {
          // COURANT D'AIR : une zone pousse le vaisseau vers le haut ou vers le bas (il faut compenser),
          // avec deux blocs en suspension à éviter
          // courant FORT (vers le haut : relâcher fait encore descendre lentement ; vers le bas : appuyer fait encore monter)
          const f = a() < 0.5 ? -1380 : 1680;
          m.courants.push({ id: m.id++, x: cx + U, w: 17 * U, y1: haut, y2: sol0, f });
          // des piques tout le long du sol et du plafond : impossible de se laisser plaquer
          for (let i = 1; i < 18; i++) { pique(m, cx + i * U, sol0); pique(m, cx + i * U, haut, true); }
          const flotte = (bx, n) => m.rects.push({ id: m.id++, x: bx, y: yN(n + 1), w: U, h: U, type: "bloc", fixe: true });
          flotte(cx + 6 * U, 3 + a());
          flotte(cx + 12 * U, f < 0 ? 5.5 : 2);
          cx += 19 * U;
        } else if (t === "vitesse") {
          // ANNEAUX DE VITESSE : passer dedans donne un élan (un bonus pour qui vise bien)
          // seulement 3 anneaux, alignés au milieu du couloir
          for (let i = 0; i < 3; i++) m.anneauxV.push({ id: m.id++, x: cx + (4 + i * 5) * U, y: yN(4), r: 0.9 * U });
          cx += 19 * U;
        } else if (t === "lasersH") {
          // LASER QUI SUIT : un rayon horizontal sur toute la zone ; il se charge en suivant la hauteur du joueur,
          // se bloque un instant (il clignote) puis tire et coupe la zone en deux : il faut s'écarter de la ligne
          const P = 1.8;
          m.lasersH.push({ id: m.id++, x: cx, w: 21 * U, y: milieu, P, ph: 0, suit: true });
          // et des lasers CONSTANTS le long du sol et du plafond : impossible de s'y coller
          m.lasersH.push({ id: m.id++, x: cx, w: 21 * U, y: sol0 - 5, P, ph: 0, toujours: true });
          m.lasersH.push({ id: m.id++, x: cx, w: 21 * U, y: haut + 5, P, ph: 0, toujours: true });
          cx += 22 * U;
        } else if (t === "scies") {
          // scies qui vont du sol jusqu'au plafond (amplitude = demi-hauteur du couloir moins leur rayon)
          for (let i = 0; i < 3; i++) m.scies.push({ id: m.id++, x: cx + (3 + i * 4.5) * U, yc: yN(4), amp: 4 * U - 14, P: 1.6 + a() * 0.8, ph: a() * 6.283, r: 14 });
          cx += 16 * U;
        } else if (t === "cubes") {
          // obstacles variés : piliers (sol ou plafond) parfois terminés par un pique, et blocs en suspension
          for (let i = 0; i < 5; i++) {
            const ox = cx + (2 + i * 4) * U, r = a();
            if (r < 0.35) { // pilier du sol
              const h = 1 + a() * 1.2;
              fixe(ox, U, 0, h);
              if (a() < 0.5) pique(m, ox, yN(h));
            } else if (r < 0.7) { // pilier du plafond
              const b = 6.3 + a() * 0.7;
              fixe(ox, U, b, 8);
              if (a() < 0.5) pique(m, ox, yN(b), true);
            } else { // bloc en suspension, au milieu du couloir
              const n1 = 2.8 + a() * 1.6;
              fixe(ox, U * (a() < 0.4 ? 2 : 1), n1, n1 + 1);
            }
          }
          cx += 22 * U;
        } else if (t === "serre" || t === "zigzag") {
          // couloir (4,5 blocs de haut) dont le centre monte et descend en pente douce
          const pas = 3;
          const chemin = t === "zigzag" ? [3, 3.5, 4, 4.5, 5, 5, 4.5, 4, 3.5, 3] : [];
          if (t === "serre") { let c = 4; for (let i = 0; i < 7; i++) { c = Math.max(3, Math.min(5, c + (a() < 0.5 ? -0.5 : 0.5))); chemin.push(c); } }
          chemin.forEach((c, i) => {
            // couloir de 4,5 blocs ; dans le zigzag il se resserre jusqu'à 2,6 blocs
            const demi = t === "zigzag" ? 2.25 - (0.95 * i) / (chemin.length - 1) : 2.25;
            fixe(cx + (1 + i * pas) * U, pas * U, 0, c - demi);
            fixe(cx + (1 + i * pas) * U, pas * U, c + demi, 8);
          });
          cx += (2 + chemin.length * pas) * U;
        } else {
          // portes laser comme en mode normal, mais sur toute la hauteur du couloir :
          // une moitié basse et une moitié haute qui s'allument à tour de rôle (jamais les deux à la fois),
          // deux portes espacées de 11 blocs, un peu décalées dans le temps
          const ph = a() * 6.283, P = 1.4;
          [4, 15].forEach((i, q) => {
            const f = ph + q * 1.7, lx = cx + i * U + 12;
            m.lasers.push({ id: m.id++, x: lx, w: 6, y1: yN(4), y2: yN(0), P, ph: f });
            m.lasers.push({ id: m.id++, x: lx, w: 6, y1: yN(8), y2: yN(4), P, ph: f + Math.PI });
          });
          cx += 20 * U;
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

  // ============================================================
  //  SETS DE MOTIFS (8 sets × 10 motifs, réglés en simulation avec Denis)
  //  Chaque motif est écrit en blocs depuis son début, sol au niveau 0.
  //  Les positions horizontales sont mises à l'échelle de la vitesse du moment (k),
  //  pour que les temps (fenêtres de saut) restent ceux réglés en simulation.
  // ============================================================
  function aides(m, x0, g0, k) {
    const X = (x) => x0 + (x - x0) * k, W = (w) => w * k, id = () => m.id++, Y = (g) => yDe(g0 + g);
    const h = {
      m,
      sol: (x1, x2, g) => m.rects.push({ id: id(), x: X(x1), y: Y(g), w: W(x2 - x1), h: H + 300 - Y(g), type: "sol" }),
      pilier: (x, gb, n, w) => m.rects.push({ id: id(), x: X(x), y: Y(gb + n), w: W((w || 1) * U), h: n * U, type: "bloc" }),
      pilierHaut: (x, gBas, w) => m.rects.push({ id: id(), x: X(x), y: -400, w: W((w || 1) * U), h: Y(gBas) + 400, type: "plafond" }),
      dalle: (x1, x2, g) => m.rects.push({ id: id(), x: X(x1), y: Y(g), w: W(x2 - x1), h: 0.5 * U, type: "bloc", fixe: true }),
      traverse: (x1, x2, g) => m.rects.push({ id: id(), x: X(x1), y: Y(g), w: W(x2 - x1), h: 0.5 * U, type: "bloc", fixe: true, traverse: true }),
      pique: (x, g) => m.piques.push({ id: id(), x: X(x), y: Y(g), bas: false }),
      piqueHaut: (x, gBas) => m.piques.push({ id: id(), x: X(x), y: Y(gBas), bas: true }),
      bulle: (x, g) => m.bulles.push({ id: id(), x: X(x), y: Y(g) }),
      objet: (x, g) => m.boites.push({ id: id(), x: X(x), y: Y(g) }),
      scie: (x, g, amp, P, ph) => m.scies.push({ id: id(), x: X(x), yc: Y(g), amp: (amp || 0) * U, P: P || 2, ph: ph || 0, r: 14 }),
      scieSync: (x, g, amp, P, ph, dist) => m.scies.push({ id: id(), x: X(x), yc: Y(g), amp: (amp || 0) * U, P: P || 2, ph: ph || 0, r: 14, sync: true, dist: (dist || 8) * U * k }),
      pendule: (x, gPivot, L, amp, P, ph) => m.pendules.push({ id: id(), x: X(x), py: Y(gPivot), L: L * U, amp, P, ph: ph || 0, r: 13 }),
      penduleSync: (x, gPivot, L, amp, P, ph, dist) => m.pendules.push({ id: id(), x: X(x), py: Y(gPivot), L: L * U, amp, P, ph: ph || 0, r: 13, sync: true, dist: (dist || 8) * U * k }),
      tapis: (x1, x2, g, dir) => m.tapis.push({ id: id(), x: X(x1), w: W(x2 - x1), y: Y(g), dir }),
      tremplin: (x, g) => m.tremplins.push({ id: id(), x: X(x), y: Y(g) }),
      // motif « à choix » : on ne place que les emplacements tirés (v = liste d'indices)
      place: (x, v, slots) => (v || []).forEach((i) => { const [c, g] = slots[i]; h.objet(x + c * U, g + 0.5); }),
    };
    return h;
  }
  const SETS = [];
  SETS.push((function () { // set 1
    return [
      { nom: "Tour", f(h, x) {
        h.sol(x, x + 15 * U, 0);
        h.bulle(x + 3.5 * U, 3);
        h.pilier(x + 6 * U, 0, 2, 3);   // marche collée au pilier : on peut monter sans la bulle
        h.pilier(x + 9 * U, 0, 4);
        return { l: 15, g: 0 };
      } },
      { nom: "Colonnade", f(h, x) {
        h.sol(x, x + 16 * U, 0);
        [[3, 1], [6, 2], [9, 1], [12, 2]].forEach(([c, n]) => h.pilier(x + c * U, 0, n));
        [4, 5, 7, 8, 10, 11].forEach((c) => h.pique(x + c * U, 0));
        return { l: 16, g: 0 };
      } },
      { nom: "Bulle relais", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        h.bulle(x + 7 * U, 2.8);
        h.sol(x + 12 * U, x + 15 * U, 0);
        return { l: 15, g: 0 };
      } },
      { nom: "Peigne", f(h, x) {
        h.sol(x, x + 19 * U, 0);
        [3, 7, 11, 15].forEach((c) => h.pilier(x + c * U, 0, 2, 2));
        [5, 6, 9, 10, 13, 14].forEach((c) => h.pique(x + c * U, 0));
        return { l: 19, g: 0 };
      } },
      { nom: "Ascenseur", f(h, x) {
        h.sol(x, x + 16 * U, 0);
        h.bulle(x + 3 * U, 2.8); h.bulle(x + 6.5 * U, 4.6);
        h.pilier(x + 7 * U, 0, 2.5, 3);   // marche collée au pilier
        h.pilier(x + 10 * U, 0, 5, 2);
        h.objet(x + 11 * U, 6.2);
        return { l: 16, g: 0 };
      } },
      { nom: "Portique", f(h, x) {
        h.sol(x, x + 12 * U, 0);
        h.pilier(x + 5 * U, 0, 1, 2); h.pilierHaut(x + 5 * U, 3.4, 2);
        [3, 4, 7, 8].forEach((c) => h.pique(x + c * U, 0));
        return { l: 12, g: 0 };
      } },
      { nom: "Toboggan", f(h, x) {
        h.sol(x, x + 18 * U, 0);
        h.pilier(x + 1 * U, 0, 2, 2); h.pilier(x + 3 * U, 0, 3, 2); h.pilier(x + 7 * U, 0, 2, 2); h.pilier(x + 11 * U, 0, 1, 2);
        [5, 6, 9, 10, 13, 14].forEach((c) => h.pique(x + c * U, 0));
        return { l: 18, g: 0 };
      } },
      { nom: "Choix", f(h, x) {
        h.sol(x, x + 14 * U, 0);
        h.pilier(x + 3 * U, 0, 1, 2); h.pilier(x + 9 * U, 0, 1, 2);
        [5, 6, 7, 8].forEach((c) => h.pique(x + c * U, 0));
        h.bulle(x + 6.5 * U, 3.4);
        h.objet(x + 9.5 * U, 5.2);
        return { l: 14, g: 0 };
      } },
      { nom: "Slalom", f(h, x) {
        h.sol(x, x + 22 * U, 0);
        h.scie(x + 3.5 * U, 0.7, 0, 2); h.pilierHaut(x + 8 * U, 3.2); h.scie(x + 8.5 * U, 2.7, 0, 2); h.scie(x + 12.5 * U, 0.7, 0, 2); h.pilierHaut(x + 17 * U, 3.2); h.scie(x + 17.5 * U, 2.7, 0, 2);   // scies au sol à sauter, piliers du plafond à passer dessous
        return { l: 22, g: 0 };
      } },
      { nom: "Saut de l'ange", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        h.pilier(x, 0, 2, 2); h.pilier(x + 2 * U, 0, 3, 2);
        h.bulle(x + 7 * U, 4); h.bulle(x + 13 * U, 4);
        h.objet(x + 10.5 * U, 5);
        h.sol(x + 18 * U, x + 22 * U, 0);
        return { l: 22, g: 0 };
      } },
    ];
  })());
  SETS.push((function () { // set 2
    return [
      { nom: "Marelle", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [4, 10, 16].forEach((c) => h.pilier(x + c * U, 0, 1, 3));
        h.sol(x + 22 * U, x + 25 * U, 0);
        return { l: 25, g: 0 };
      } },
      { nom: "Rideau", f(h, x) {
        h.sol(x, x + 19 * U, 0);
        [4, 9, 14].forEach((c) => { h.pilierHaut(x + c * U, 3.4, 2); h.pique(x + (c + 0.5) * U, 0); });
        return { l: 19, g: 0 };
      } },
      { nom: "Envol", f(h, x) {
        h.sol(x, x + 17 * U, 0);
        h.pilier(x + 2 * U, 0, 2, 2);
        h.bulle(x + 7 * U, 3.4);
        [6, 7, 8, 9, 10].forEach((c) => h.pique(x + c * U, 0));
        return { l: 17, g: 0 };
      } },
      { nom: "Pyramide", f(h, x) {
        h.sol(x, x + 23 * U, 0);
        [[2, 1], [5, 2], [8, 3], [11, 2], [14, 1]].forEach(([c, n]) => h.pilier(x + c * U, 0, n, 2));
        [4, 7, 10, 13, 16].forEach((c) => h.pique(x + c * U, 0));
        return { l: 20, g: 0 };
      } },
      { nom: "Passerelles", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[3, 2], [10, 3], [17, 2]].forEach(([c, g]) => { h.dalle(x + c * U, x + (c + 5) * U, g); h.pique(x + (c + 2.5) * U, g); });
        h.sol(x + 24 * U, x + 27 * U, 0);
        return { l: 27, g: 0 };
      } },
      { nom: "Triple bulle", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[6, 2.8], [11, 3], [16, 2.8]].forEach(([c, g]) => h.bulle(x + c * U, g));
        h.sol(x + 21 * U, x + 24 * U, 0);
        return { l: 24, g: 0 };
      } },
      { nom: "Descente", f(h, x) {
        h.sol(x, x + 7 * U, 0);
        h.pilier(x + 1 * U, 0, 2, 4); h.pilier(x + 5 * U, 0, 4, 2);
        h.bulle(x + 10 * U, 3.6); h.bulle(x + 15 * U, 2.4);
        h.objet(x + 13 * U, 3.6);
        h.sol(x + 18 * U, x + 22 * U, 0);
        return { l: 22, g: 0 };
      } },
      { nom: "Tunnel", f(h, x) {
        h.sol(x, x + 23 * U, 0);
        h.pilierHaut(x + 2 * U, 3.4, 19);
        [5, 11, 17].forEach((c) => h.pilier(x + c * U, 0, 1));
        return { l: 23, g: 0 };
      } },
      { nom: "Catapulte", f(h, x) {
        h.sol(x, x + 16 * U, 0);
        h.tremplin(x + 3 * U, 0);
        h.pilier(x + 6 * U, 0, 2, 3);   // marche collée à la tour
        h.pilier(x + 9 * U, 0, 4, 3);
        h.objet(x + 11.2 * U, 4.6);
        return { l: 16, g: 0 };
      } },
      { nom: "Métronome", f(h, x) {
        h.sol(x, x + 26 * U, 0);
        [3, 12, 21].forEach((c) => h.pilier(x + c * U, 0, 2, 2));
        [[5, 11], [14, 20]].forEach(([a, b]) => { for (let c = a; c <= b; c++) h.pique(x + c * U, 0); });
        h.bulle(x + 8 * U, 3.6); h.bulle(x + 17 * U, 3.6);
        return { l: 26, g: 0 };
      } },
    ];
  })());
  SETS.push((function () { // set 3
    const esc = (h, x, c0, hauts, w) => hauts.forEach((n, i) => h.pilier(x + (c0 + i * (w || 2)) * U, 0, n, w || 2));
    return [
      { nom: "Escalier", f(h, x) {
        h.sol(x, x + 22 * U, 0);
        esc(h, x, 2, [1, 2, 3], 3);
        [12, 13, 14, 15, 16].forEach((c) => h.pique(x + c * U, 0));
        return { l: 22, g: 0 };
      } },
      { nom: "Escalier à trous", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[4, 1], [8, 2], [12, 3], [16, 2]].forEach(([c, n]) => h.pilier(x + c * U, 0, n, 2));
        h.sol(x + 20 * U, x + 23 * U, 0);
        return { l: 23, g: 0 };
      } },
      { nom: "Descente", f(h, x) {
        h.sol(x, x + 20 * U, 0);
        esc(h, x, 1, [2, 3, 2, 1]);
        [9, 10, 11].forEach((c) => h.pique(x + c * U, 0));
        return { l: 20, g: 0 };
      } },
      { nom: "Mezzanine", f(h, x) {
        h.sol(x, x + 24 * U, 0);
        esc(h, x, 2, [1, 2]);
        h.dalle(x + 7 * U, x + 19 * U, 3);
        h.pique(x + 12.5 * U, 3);
        [8, 10, 12, 14, 16].forEach((c) => h.pique(x + c * U, 0));
        return { l: 24, g: 0 };
      } },
      { nom: "Zigzag", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[3.5, 2], [9, 1], [14.5, 2]].forEach(([c, g]) => h.dalle(x + c * U, x + (c + 3) * U, g));
        h.sol(x + 20 * U, x + 23 * U, 0);
        return { l: 23, g: 0 };
      } },
      { nom: "Échelle", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        h.dalle(x + 3.5 * U, x + 7 * U, 1);
        h.dalle(x + 9 * U, x + 14 * U, 2.2); h.pique(x + 11 * U, 2.2);
        h.bulle(x + 16 * U, 4);
        h.dalle(x + 18 * U, x + 22 * U, 4.6); h.objet(x + 21 * U, 5.6);
        h.sol(x + 22 * U, x + 30 * U, 0);
        [23, 24, 25, 26].forEach((c) => h.pique(x + c * U, 0));
        return { l: 30, g: 0 };
      } },
      { nom: "Balcon", f(h, x) {
        h.sol(x, x + 10 * U, 0);
        esc(h, x, 1, [1, 2, 3], 3);
        h.objet(x + 13 * U, 5);
        h.dalle(x + 15 * U, x + 19 * U, 1);
        h.sol(x + 20 * U, x + 23 * U, 0);
        return { l: 23, g: 0 };
      } },
      { nom: "Deux étages", f(h, x) {
        h.sol(x, x + 26 * U, 0);
        h.pilier(x + 2 * U, 0, 1, 2);
        h.dalle(x + 5 * U, x + 15 * U, 3);
        h.bulle(x + 17 * U, 4.2); h.bulle(x + 20 * U, 4.8);
        h.objet(x + 22.5 * U, 5.4);
        // voie basse : piques en rythme court · court · long
        [7, 10, 15].forEach((c) => h.pique(x + c * U, 0));
        return { l: 26, g: 0 };
      } },
      { nom: "Escalier-pont", f(h, x) {
        h.sol(x, x + 26 * U, 0);
        esc(h, x, 1, [1, 2, 3]);
        h.bulle(x + 10 * U, 4.6);
        h.objet(x + 12.5 * U, 5.6);
        h.dalle(x + 14 * U, x + 21 * U, 3.6);
        [10, 13, 16, 19].forEach((c) => h.pique(x + c * U, 0));
        return { l: 26, g: 0 };
      } },
      { nom: "Remparts", f(h, x) {
        h.sol(x, x + 26 * U, 0);
        h.pilier(x + 2 * U, 0, 2, 2);
        [[6, 9], [12, 15], [18, 21]].forEach(([a, b]) => h.dalle(x + a * U, x + b * U, 2.6));
        for (let c = 5; c <= 21; c++) h.pique(x + c * U, 0);
        return { l: 26, g: 0 };
      } },
    ];
  })());
  SETS.push((function () { // set 4
    const esc = (h, x, c0, hauts, w) => hauts.forEach((n, i) => h.pilier(x + (c0 + i * (w || 3)) * U, 0, n, w || 3));
    return [
      { nom: "Escalier gardé", f(h, x) {
        h.sol(x, x + 22 * U, 0);
        esc(h, x, 1, [1, 2, 3]);
        h.scieSync(x + 5.5 * U, 3.6, 1.2, 1.6, 4.8, 8);   // synchronisée : en plein sur le chemin           // monte et descend au-dessus de la 2e marche
        [11, 12, 13].forEach((c) => h.pique(x + c * U, 0));
        return { l: 22, g: 0 };
      } },
      { nom: "Balancier", f(h, x) {
        h.sol(x, x + 10 * U, 0);
        esc(h, x, 1, [1, 2, 3]);
        h.bulle(x + 13 * U, 4);
        h.pendule(x + 19.5 * U, 7.4, 2.8, 0.6, 2.4);
        h.dalle(x + 18 * U, x + 22 * U, 2);
        h.sol(x + 23 * U, x + 27 * U, 0);
        return { l: 27, g: 0 };
      } },
      { nom: "Sous la scie", f(h, x) {
        h.sol(x, x + 10 * U, 0);
        esc(h, x, 1, [1, 2, 3]);
        h.bulle(x + 12 * U, 4.2);
        h.scie(x + 15.5 * U, 6.6, 0.3, 1.6);
        h.dalle(x + 16 * U, x + 21 * U, 4);
        h.sol(x + 21 * U, x + 26 * U, 0);
        return { l: 26, g: 0 };
      } },
      { nom: "Ascension", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[3, 1.5], [9, 3], [15, 4.5]].forEach(([c, g]) => h.dalle(x + c * U, x + (c + 3) * U, g));
        h.scie(x + 7.5 * U, 2, 0.5, 2.2); h.scie(x + 13.5 * U, 3.5, 0.5, 2.2, 1.6);
        h.objet(x + 17 * U, 6);
        h.sol(x + 21 * U, x + 25 * U, 0);
        return { l: 25, g: 0 };
      } },
      { nom: "Rampe de bulles", f(h, x) {
        h.sol(x, x + 8 * U, 0);
        esc(h, x, 1, [1, 2]);
        h.bulle(x + 9.5 * U, 3.2); h.bulle(x + 12.5 * U, 4.2);
        h.dalle(x + 15 * U, x + 23 * U, 3.8);
        h.scie(x + 19 * U, 6.2, 0.4, 2);
        h.objet(x + 22 * U, 5);
        h.sol(x + 23 * U, x + 28 * U, 0);
        return { l: 28, g: 0 };
      } },
      { nom: "Double tranchant", f(h, x) {
        h.sol(x, x + 23 * U, 0);
        [[1, 1], [5, 2], [9, 3], [13, 2]].forEach(([c, n]) => h.pilier(x + c * U, 0, n, 3));
        h.scie(x + 2.5 * U, 1.6, 0.15, 2);   // basse : grand saut par-dessus
        h.scie(x + 6.5 * U, 4.6, 0.15, 2);   // haute : petit saut en dessous
        h.scie(x + 10.5 * U, 3.6, 0.15, 2);  // basse
        return { l: 23, g: 0 };
      } },
      { nom: "Scie-ascenseur", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        h.dalle(x + 3 * U, x + 8 * U, 2); h.dalle(x + 12 * U, x + 17 * U, 2);
        h.scieSync(x + 10 * U, 3.5, 1.6, 1.6, 5.4, 8);
        h.sol(x + 19 * U, x + 22 * U, 0);
        return { l: 22, g: 0 };
      } },
      { nom: "Couloir de scies", f(h, x) {
        h.sol(x, x + 26 * U, 0);
        esc(h, x, 1, [1, 2]);
        h.dalle(x + 7 * U, x + 21 * U, 2);
        h.scieSync(x + 11 * U, 3.2, 1.1, 1.6, 3.6, 8); h.scieSync(x + 16 * U, 3.2, 1.1, 1.6, 3.6 + 3.14, 8);
        [9, 12, 15, 18].forEach((c) => h.pique(x + c * U, 0));
        return { l: 26, g: 0 };
      } },
      { nom: "La cage", f(h, x) {
        h.sol(x, x + 26 * U, 0);
        h.pilier(x + 2 * U, 0, 1, 3);
        h.dalle(x + 7 * U, x + 16 * U, 2.6);
        h.scie(x + 9.5 * U, 4.7, 0.2, 2);          // scie d'entrée, au-dessus de la plateforme
        h.scie(x + 16.5 * U, 1.6, 0.3, 2, 3.14);   // scie de sortie, sous le bout de la plateforme
        h.bulle(x + 15 * U, 4.6); h.objet(x + 18 * U, 5.6);
        [9, 11, 13, 15].forEach((c) => h.pique(x + c * U, 0));
        return { l: 26, g: 0 };
      } },
      { nom: "Grand final", f(h, x) {
        h.sol(x, x + 8 * U, 0);
        esc(h, x, 1, [1, 2]);
        h.bulle(x + 9.5 * U, 3.8);
        h.dalle(x + 11 * U, x + 16 * U, 3.5);
        h.bulle(x + 18 * U, 5);
        h.scie(x + 20.5 * U, 7.2, 0.5, 2);
        h.objet(x + 20.5 * U, 5.8);
        h.sol(x + 11 * U, x + 30 * U, 0);
        [12, 13, 14, 15].forEach((c) => h.pique(x + c * U, 0));
        return { l: 30, g: 0 };
      } },
    ];
  })());
  SETS.push((function () { // set 5
    const D = (h, x, a, b, g) => h.dalle(x + a * U, x + b * U, g);
    return [
      { nom: "Archipel", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [5, 11, 17].forEach((c) => D(h, x, c, c + 3, 1));
        h.sol(x + 23 * U, x + 26 * U, 0);
        return { l: 26, g: 0 };
      } },
      { nom: "Vague", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[4, 1], [9.5, 2.6], [15, 1], [20.5, 2.6]].forEach(([c, g]) => D(h, x, c, c + 3, g));
        h.sol(x + 26 * U, x + 29 * U, 0);
        return { l: 29, g: 0 };
      } },
      { nom: "Dalle piégée", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 4, 20, 1.5);
        h.pique(x + 9 * U, 1.5); h.pique(x + 15 * U, 1.5);
        h.sol(x + 22 * U, x + 25 * U, 0);
        return { l: 25, g: 0 };
      } },
      { nom: "Relais", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 4, 8, 1.5);
        h.bulle(x + 11 * U, 3.4);
        D(h, x, 14, 18, 2);
        h.bulle(x + 21 * U, 3.8);
        h.objet(x + 24 * U, 4.6);
        h.sol(x + 27 * U, x + 30 * U, 0);
        return { l: 30, g: 0 };
      } },
      { nom: "Yo-yo", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 3, 7, 2);
        h.bulle(x + 10 * U, 1.6);          // basse : on s'y laisse tomber, puis on rappuie
        h.bulle(x + 13.5 * U, 4);          // plus haute, au-dessus du niveau de la plateforme
        h.objet(x + 16.5 * U, 4.8);
        D(h, x, 19, 23, 1);                // atterrissage un peu plus bas que la première bulle
        h.sol(x + 25 * U, x + 28 * U, 0);
        return { l: 28, g: 0 };
      } },
      { nom: "Saut de puce", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [4.5, 8, 11.5, 15].forEach((c) => D(h, x, c, c + 1.5, 1));
        h.sol(x + 18.5 * U, x + 22 * U, 0);
        return { l: 22, g: 0 };
      } },
      { nom: "Navette", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 3, 27, 1);
        D(h, x, 10, 16, 3.6); D(h, x, 19, 26, 3.6);
        [12, 13, 14, 15, 16].forEach((c) => h.pique(x + c * U, 1));   // en bas : il faut monter
        h.pique(x + 22 * U, 3.6);                                    // en haut ensuite : il faut redescendre
        h.objet(x + 17.5 * U, 4.4);
        h.sol(x + 29 * U, x + 32 * U, 0);
        return { l: 32, g: 0 };
      } },
      { nom: "Rebond", f(h, x) {
        h.sol(x, x + 8 * U, 0);
        h.tremplin(x + 4 * U, 0);
        D(h, x, 9, 19, 4);
        h.pique(x + 14 * U, 4);
        h.objet(x + 17 * U, 5);
        h.sol(x + 8 * U, x + 24 * U, 0);
        [9, 11, 13, 15, 17].forEach((c) => h.pique(x + c * U, 0));
        return { l: 24, g: 0 };
      } },
      { nom: "Pont suspendu", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 4, 9, 1.5); D(h, x, 13, 18, 1.5);
        h.penduleSync(x + 11 * U, 6.5, 3, 0.6, 2.2, 0.8, 8);
        h.sol(x + 20 * U, x + 23 * U, 0);
        return { l: 23, g: 0 };
      } },
      { nom: "Plongeon", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        h.bulle(x + 4 * U, 2.6);
        D(h, x, 6, 10, 3.6);
        D(h, x, 13, 16, 2.3); D(h, x, 19, 22, 1);
        h.objet(x + 11.5 * U, 4);
        h.sol(x + 24 * U, x + 27 * U, 0);
        return { l: 27, g: 0 };
      } },
    ];
  })());
  SETS.push((function () { // set 6
    // Motifs à choix : plateformes traversables par le bas, 2 objets au hasard parmi 3 emplacements
    // (variante k = on ne place que l'emplacement k, pour vérifier qu'il est atteignable ; -1 = aucun)
    const A = 1, B = 3.7, C = 6.5;
    const a = 1.2, b = 2.6, c = 4.0; // niveaux des motifs SANS choix (plateformes pleines)
    const T = (h, x, a, b, g) => h.traverse(x + a * U, x + b * U, g);
    const D = (h, x, a, b, g) => h.dalle(x + a * U, x + b * U, g);
    let PH = 0; // phase du pendule de « Trois couloirs » (réglée par balayage)
    return [
      { nom: "Étagère", emplacements: 3, f(h, x, g, v) {
        h.sol(x, x + 3 * U, 0);
        T(h, x, 4, 20, A); T(h, x, 6, 20, B); T(h, x, 8, 20, C);
        h.pique(x + 11 * U, A); h.pique(x + 12 * U, A); h.pique(x + 15 * U, B);
        h.place(x, v, [[17.5, A], [11, B], [14, C]]);
        h.sol(x + 22 * U, x + 26 * U, 0);
        return { l: 26, g: 0 };
      } },
      { nom: "Cascade", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        h.bulle(x + 4 * U, 3);
        D(h, x, 6, 14, c); D(h, x, 13, 20, b); D(h, x, 19, 26, a);
        h.pique(x + 11 * U, c); h.pique(x + 17 * U, b); h.pique(x + 23 * U, a);
        h.sol(x + 28 * U, x + 31 * U, 0);
        return { l: 31, g: 0 };
      } },
      { nom: "Aiguillage", emplacements: 3, f(h, x, g, v) {
        h.sol(x, x + 2 * U, 0);
        T(h, x, 2, 7, A); T(h, x, 9, 14, B);   // au bout : sauter vers le haut ou se laisser tomber
        T(h, x, 14.5, 22, C); T(h, x, 14.5, 25, A);
        h.pique(x + 18 * U, A);
        h.place(x, v, [[11, B], [20, C], [22.5, A]]);
        h.sol(x + 27 * U, x + 31 * U, 0);
        return { l: 31, g: 0 };
      } },
      { nom: "Mille-feuille", emplacements: 3, f(h, x, g, v) {
        h.sol(x, x + 2 * U, 0);
        T(h, x, 3, 24, A); T(h, x, 3, 24, C);
        T(h, x, 7, 9, B); T(h, x, 12.5, 14.5, B);
        [10, 11, 17].forEach((c) => h.pique(x + c * U, A));
        h.pique(x + 21 * U, C);
        h.place(x, v, [[15, A], [13.5, B], [18.5, C]]);
        h.sol(x + 26 * U, x + 30 * U, 0);
        return { l: 30, g: 0 };
      } },
      { nom: "Montée en bulles", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 3, 7, a); h.bulle(x + 9 * U, 2.2);
        D(h, x, 11, 14, b); h.bulle(x + 16 * U, 3.6);
        D(h, x, 18, 22, c); h.objet(x + 21 * U, c + 0.5);
        h.sol(x + 24 * U, x + 28 * U, 0);
        return { l: 28, g: 0 };
      } },
      { nom: "Trois couloirs", emplacements: 3, f(h, x, g, v) {
        h.sol(x, x + 33 * U, 0);
        T(h, x, 2, 16, A); T(h, x, 4.5, 16, B); T(h, x, 7.5, 16, C);
        T(h, x, 19, 27, A); T(h, x, 19, 27, B); T(h, x, 19, 27, C);
        [17, 18].forEach((c) => h.pique(x + c * U, 0));
        h.pique(x + 23 * U, A);
        h.penduleSync(x + 17.5 * U, 9.8, 4.8, 0.6, 2.2, PH, 8);
        h.place(x, v, [[20.5, A], [22.5, B], [22, C]]);
        return { l: 33, g: 0 };
      } },
      { nom: "Tisserand", emplacements: 3, f(h, x, g, v) {
        h.sol(x, x + 2 * U, 0);
        T(h, x, 3, 8, A); T(h, x, 10, 17, B); T(h, x, 12, 17, C);
        [13, 14, 15].forEach((c) => h.pique(x + c * U, B));
        T(h, x, 16, 24, A); T(h, x, 23, 28, B);
        h.place(x, v, [[15, C], [20, A], [26.5, B]]);
        h.sol(x + 30 * U, x + 33 * U, 0);
        return { l: 33, g: 0 };
      } },
      { nom: "Catapulte", emplacements: 3, f(h, x, g, v) {
        h.sol(x, x + 12 * U, 0);
        h.tremplin(x + 3 * U, 0);
        T(h, x, 6, 21, C); T(h, x, 13, 24, A);
        h.pique(x + 16 * U, A); h.pique(x + 19 * U, A);
        T(h, x, 26, 29, B);
        h.place(x, v, [[15, C], [21.5, A], [27.5, B]]);
        h.sol(x + 31 * U, x + 35 * U, 0);
        return { l: 35, g: 0 };
      } },
      { nom: "Arche", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[3, a], [8, b], [13, c], [18, b], [23, a]].forEach(([c, g]) => D(h, x, c, c + 3, g));
        h.objet(x + 14.5 * U, c + 1.5);
        h.sol(x + 28 * U, x + 31 * U, 0);
        return { l: 31, g: 0 };
      } },
      { nom: "Perchoir", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 3, 7, a); D(h, x, 10, 11.5, b); D(h, x, 15, 19, c);
        h.objet(x + 13 * U, c);
        h.sol(x + 21 * U, x + 25 * U, 0);
        return { l: 25, g: 0 };
      } },
    ];
  })());
  SETS.push((function () { // set 7
    const A = 1, B = 3.7;
    const D = (h, x, a, b, g) => h.dalle(x + a * U, x + b * U, g);
    const Tr = (h, x, a, b, g) => h.traverse(x + a * U, x + b * U, g);
    const tap = (h, x, a, b, g, d) => h.tapis(x + a * U, x + b * U, g, d);
    return [
      { nom: "Lance-pierre", f(h, x) {
        h.sol(x, x + 10 * U, 0); tap(h, x, 2, 10, 0, 1);
        h.objet(x + 14.5 * U, 3.2);
        h.sol(x + 19 * U, x + 23 * U, 0);   // trou de 9 blocs : impossible sans l'élan du tapis
        return { l: 23, g: 0 };
      } },
      { nom: "Ralenti", f(h, x) {
        h.sol(x, x + 20 * U, 0); tap(h, x, 3, 18, 0, -1);
        h.pique(x + 8 * U, 0); h.pique(x + 14 * U, 0);
        h.objet(x + 14.5 * U, 1.8);
        return { l: 20, g: 0 };
      } },
      { nom: "Coup de frein", f(h, x) {
        h.sol(x, x + 26 * U, 0); tap(h, x, 2, 11, 0, 1); tap(h, x, 11, 24, 0, -1);
        h.pique(x + 8 * U, 0); h.objet(x + 8.5 * U, 2.4);
        h.pique(x + 20 * U, 0);
        return { l: 26, g: 0 };
      } },
      { nom: "Plateformes roulantes", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 3, 8, 1.5); tap(h, x, 3, 8, 1.5, 1);
        h.objet(x + 11.5 * U, 3.2);
        D(h, x, 15, 19, 2); tap(h, x, 15, 19, 2, 1);
        h.sol(x + 27 * U, x + 31 * U, 0);
        return { l: 31, g: 0 };
      } },
      { nom: "Attente", f(h, x) {
        h.sol(x, x + 20 * U, 0); tap(h, x, 4, 13, 0, -1);
        h.scieSync(x + 15 * U, 1.6, 1.3, 1.8, 0, 9);
        return { l: 20, g: 0 };
      } },
      { nom: "Contre-courant", emplacements: 3, f(h, x, g, v) {
        const H = 4.2; // voie haute : hors de portée depuis le sol
        h.sol(x, x + 28 * U, 0); tap(h, x, 6, 26, 0, -1);
        Tr(h, x, 2, 6, 1.5);
        Tr(h, x, 6, 13, H); tap(h, x, 6, 13, H, 1);
        Tr(h, x, 18, 26, H); tap(h, x, 18, 26, H, 1);
        h.penduleSync(x + 15.5 * U, 4.5, 3.6, 0.7, 2, 0, 9);
        h.place(x, v, [[22, 0], [15.5, 6], [23, H]]);
        return { l: 28, g: 0 };
      } },
      { nom: "Escalier roulant", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        [[2, 1], [8, 2.2], [14, 3.4]].forEach(([c, g]) => { D(h, x, c, c + 3, g); tap(h, x, c, c + 3, g, 1); });
        h.objet(x + 20 * U, 5);
        h.sol(x + 24 * U, x + 28 * U, 0);
        return { l: 28, g: 0 };
      } },
      { nom: "Accordéon", f(h, x) {
        h.sol(x, x + 32 * U, 0);
        tap(h, x, 1, 8, 0, 1); tap(h, x, 8, 13, 0, -1); tap(h, x, 13, 20, 0, 1); tap(h, x, 20, 30, 0, -1);
        h.pique(x + 5.5 * U, 0); h.pique(x + 17 * U, 0); h.pique(x + 27 * U, 0);
        h.objet(x + 17.5 * U, 2.4);
        return { l: 32, g: 0 };
      } },
      { nom: "Recul", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        D(h, x, 3, 10, 1.5); tap(h, x, 3, 10, 1.5, -1); h.pique(x + 6.5 * U, 1.5);
        D(h, x, 12, 15, 1.5); tap(h, x, 12, 15, 1.5, 1); h.objet(x + 14 * U, 2.5);
        h.sol(x + 21 * U, x + 25 * U, 0);
        return { l: 25, g: 0 };
      } },
      { nom: "Envol final", f(h, x) {
        h.sol(x, x + 9 * U, 0);
        h.pilier(x, 0, 1.5, 4); h.pilier(x + 4 * U, 0, 3, 5); tap(h, x, 4, 9, 3, 1);
        h.bulle(x + 14 * U, 4.5); h.objet(x + 17 * U, 5.2);
        h.sol(x + 26 * U, x + 30 * U, 0);
        return { l: 30, g: 0 };
      } },
    ];
  })());
  SETS.push((function () { // set 8
    const bulles = (h, x, l) => l.forEach(([c, g]) => h.bulle(x + c * U, g));
    return [
      { nom: "Pont de bulles", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[5, 2.6], [9.5, 2.6], [14, 2.6]]);
        h.objet(x + 9.5 * U, 3.8);
        h.sol(x + 18.5 * U, x + 22.5 * U, 0);
        return { l: 22.5, g: 0 };
      } },
      { nom: "Montée", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[5, 2.2], [9, 3.2], [13, 4.2], [17, 5.2]]);
        h.objet(x + 19.5 * U, 6.4);
        h.sol(x + 25 * U, x + 29 * U, 0);
        return { l: 29, g: 0 };
      } },
      { nom: "Plafond de scies", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[6, 2.4], [11, 2.4], [16, 2.4]]);
        h.scie(x + 8.5 * U, 5.2, 0.15, 2); h.scie(x + 13.5 * U, 5.2, 0.15, 2, 3.14);
        h.objet(x + 13.5 * U, 3.6);
        h.sol(x + 21 * U, x + 25 * U, 0);
        return { l: 25, g: 0 };
      } },
      { nom: "Zigzag", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[5, 1.8], [9, 3.8], [13, 1.8]]);
        h.objet(x + 7 * U, 3.4);
        h.sol(x + 17 * U, x + 21 * U, 0);
        return { l: 21, g: 0 };
      } },
      { nom: "Scies battantes", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[5, 2.6], [10, 2.6], [15, 2.6]]);
        h.scieSync(x + 7.5 * U, 2.6, 1.4, 1.6, 0, 7); h.scieSync(x + 12.5 * U, 2.6, 1.4, 1.6, 0, 7);
        h.objet(x + 10 * U, 4);
        h.sol(x + 20 * U, x + 24 * U, 0);
        return { l: 24, g: 0 };
      } },
      { nom: "Deux chemins", emplacements: 3, f(h, x, g, v) {
        h.sol(x, x + 23 * U, 0);
        [6, 9.5, 13, 16.5].forEach((c) => h.pique(x + c * U, 0));
        bulles(h, x, [[5, 3.6], [9.5, 4.6], [14, 4.6]]);
        h.place(x, v, [[11.2, 0], [11.8, 5.6], [20, 0]]);
        return { l: 23, g: 0 };
      } },
      { nom: "Yo-yo", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[5, 3], [10, 0.8], [15, 3.4]]);
        h.objet(x + 12.5 * U, 3.4);
        h.sol(x + 20 * U, x + 24 * U, 0);
        return { l: 24, g: 0 };
      } },
      { nom: "Saut de foi", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[5, 2.4], [13, 2.4]]);
        h.scie(x + 9 * U, 1.2, 0.2, 2);
        h.objet(x + 9 * U, 4.4);
        h.sol(x + 18 * U, x + 22 * U, 0);
        return { l: 22, g: 0 };
      } },
      { nom: "Tapis de piques", f(h, x) {
        h.sol(x, x + 22 * U, 0);
        for (let c = 5; c <= 17; c++) h.pique(x + c * U, 0);
        bulles(h, x, [[6.5, 2.4], [10.5, 3], [14.5, 2.4]]);
        h.objet(x + 12.5 * U, 4.2);
        return { l: 22, g: 0 };
      } },
      { nom: "Grand huit", f(h, x) {
        h.sol(x, x + 2 * U, 0);
        bulles(h, x, [[4.5, 2], [8, 3.4], [11.5, 4.6], [17, 3.4], [20.5, 2]]);
        h.scieSync(x + 14.25 * U, 6.6, 0.6, 1.6, 0, 8);
        h.objet(x + 14.25 * U, 5);
        h.sol(x + 25 * U, x + 29 * U, 0);
        return { l: 29, g: 0 };
      } },
    ];
  })());
  // zones tampon (passages simples qui temporisent entre les motifs) et situations spéciales gardées
  const TAMPONS = ["montee", "descente", "multi-trous", "slalom"];
  const SITUATIONS = ["souterrain", "eboulement", "ascenseurs", "effondrement", "mur-rebond", "lasers", "pendules", "porte", "deux-voies", "sombre", "tremplin", "anneau"];
  let infosFaites = false;
  function infosMotifs() { // hauteur de chaque motif, et s'il peut servir dans une partie à l'envers
    if (infosFaites) return; infosFaites = true;
    SETS.forEach((set, s) => set.forEach((mo) => {
      const t = mondeTemp({ id: 0 });
      mo.f(aides(t, 0, 0, 1), 0, 0, mo.emplacements ? [...Array(mo.emplacements).keys()] : []);
      let haut = 0; const niv = (y) => (SOL - y) / U;
      t.rects.forEach((r) => { if (r.type !== "sol" && r.type !== "plafond") haut = Math.max(haut, niv(r.y)); });
      t.bulles.concat(t.boites).forEach((b) => (haut = Math.max(haut, niv(b.y))));
      t.scies.forEach((o) => (haut = Math.max(haut, niv(o.yc - o.amp))));
      if (t.tremplins.length) haut = Math.max(haut, 8);
      mo.haut = haut; mo.set = s;
      mo.enversOk = !["tapis", "scies", "pendules", "tremplins", "mobiles", "lasers"].some((k) => t[k].length) && !t.rects.some((r) => r.traverse);
    }));
  }
  const deuxParmi = (n, a) => { const i = (a() * n) | 0, j = (i + 1 + ((a() * (n - 1)) | 0)) % n; return [i, j]; };
  // Choix du prochain passage : surtout des motifs, en changeant de set à chaque fois (jamais deux fois
  // le même passage d'affilée), avec de temps en temps une zone tampon ou une situation spéciale.
  function choisirPassage(m, d, envers) {
    infosMotifs();
    const a = m.alea, der = m.dernierPassage || {};
    const ok = (c) => c.min <= d && (!c.possible || c.possible(m.g)) && c.nom !== der.nom;
    const motifsDe = (s) => SETS[s].filter((mo) => mo.nom !== der.nom && m.g + mo.haut <= 7.6 && (!envers || mo.enversOk));
    const sets = SETS.map((_, s) => s).filter((s) => s !== der.set && motifsDe(s).length);
    const tampons = MORCEAUX.filter((c) => TAMPONS.includes(c.nom) && ok(c));
    const situations = envers ? [] : MORCEAUX.filter((c) => SITUATIONS.includes(c.nom) && ok(c));
    const r = a();
    let type = "motif";
    if (der.type !== "tampon" && tampons.length && (r < 0.18 || !sets.length)) type = "tampon";
    else if (der.type !== "situation" && situations.length && (r < 0.4 || !sets.length)) type = "situation";
    else if (!sets.length) type = tampons.length ? "tampon" : "situation";
    let choix = null, motif = null, set = der.set;
    if (type === "motif") {
      set = sets[(a() * sets.length) | 0];
      const l = motifsDe(set); motif = l[(a() * l.length) | 0];
    } else {
      let l = type === "tampon" ? tampons : situations;
      if (!l.length) l = MORCEAUX.filter((c) => TAMPONS.includes(c.nom) && (!c.possible || c.possible(m.g)));
      let t = a() * l.reduce((s, c) => s + c.poids, 0); choix = l[0];
      for (const c of l) { t -= c.poids; if (t <= 0) { choix = c; break; } }
    }
    m.dernierPassage = { type, nom: motif ? motif.nom : choix.nom, set };
    return { choix, motif };
  }

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
      let choix = null, motif = null;
      // partie spéciale ? (pas trop près de l'arrivée ; jamais la même que la précédente)
      if (!envers && m.speciales && d >= m.prochaineSpeciale && m.fin / U - d > 90) {
        const nom = m.derniereSpeciale === "vaisseau" ? "envers" : m.derniereSpeciale === "envers" ? "vaisseau" : m.alea() < 0.5 ? "envers" : "vaisseau";
        const long = 60 + m.alea() * 90;                 // spéciale : 60 à 150 blocs (≈ 105 en moyenne)
        m.derniereSpeciale = nom;
        choix = MORCEAUX.find((c) => c.nom === nom);
        if (nom === "vaisseau") m.longVaisseau = Math.round(long); else m.longEnvers = Math.round(long);
        m.prochaineSpeciale = d + long + 90 + m.alea() * 120; // puis du normal : 90 à 210 blocs (≈ 150 en moyenne)
      }
      if (!choix) ({ choix, motif } = choisirPassage(m, d, envers));
      const derRep = m.reperes[m.reperes.length - 1];
      if (motif) {
        // un motif demande de l'élan : 3 blocs de plat de plus avant lui, et le point de reprise est AVANT ce plat
        // (on ne repart jamais à l'arrêt au pied du motif)
        if (derRep && derRep.nom === "plat" && derRep.inv === envers && derRep.g === m.g) derRep.nom = motif.nom;
        else m.reperes.push({ x: m.xGen, g: m.g, nom: motif.nom, inv: envers });
        if (envers) solHaut(m, m.xGen, m.xGen + 3 * U, m.g); else sol(m, m.xGen, m.xGen + 3 * U, m.g);
        m.xGen += 3 * U;
      } else m.reperes.push({ x: m.xGen, g: m.g, nom: choix.nom, inv: envers });
      const tm = envers ? mondeTemp(m) : m;
      const debut = tm.rects.length;
      let res;
      if (motif) {
        const k = vitesseBase(m.xGen) / 330;   // à la vitesse du moment, tout s'allonge d'autant : les temps restent les mêmes
        const r = motif.f(aides(tm, m.xGen, m.g, k), m.xGen, 0, motif.emplacements ? deuxParmi(motif.emplacements, m.alea) : []);
        res = { l: r.l * k, g: m.g + (r.g || 0) };
      } else res = choix.f(tm, m.xGen, m.g, m.alea);
      marquerVolantes(tm.rects, debut);
      if (envers) retourner(m, tm);
      m.xGen += res.l * U; m.g = res.g;
      // sol plat entre deux morceaux, court : on ne meurt pas, les obstacles peuvent être serrés
      const v = vitesseBase(m.xGen);
      const ecart = Math.max(0.12 * v, (2.5 - d / 1000) * U) + m.alea() * 1.2 * U;
      if (envers) {
        if (m.xGen >= m.enversFin) {
          m.envers = 0;
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

  const LISTES = ["rects", "piques", "tremplins", "anneaux", "boites", "flaques", "tombants", "mobiles", "fragiles", "portails", "tapis", "lasers", "pendules", "portes", "boutons", "bulles", "sombres", "scies", "courants", "anneauxV", "lasersH"];

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
      anneaux: [], flaques: [], boites: [], vites: [], t: 0, recul: 0, elanT: 0, elanV: 0, tirage: null, mode: "cube", grav: 1, tenu: false, prec: false, charge: false, rebonds: 0, tapis: 0, trig: {}, attente: {}, bulles: [], lazY: {} };
  }
  // copie indépendante (pour les simulations)
  function copier(j) {
    return Object.assign({}, j, { anneaux: j.anneaux.slice(), vites: (j.vites || []).slice(), flaques: j.flaques.slice(), boites: j.boites.slice(), bulles: j.bulles.slice(),
      trig: Object.assign({}, j.trig), lazY: Object.assign({}, j.lazY), attente: Object.assign({}, j.attente), croc: j.croc ? Object.assign({}, j.croc) : null, tirage: j.tirage ? Object.assign({}, j.tirage) : null });
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
      charge: false, rebonds: 0, tapis: 0, trig: {}, attente: {}, bulles: [], vites: [], lazY: {} });
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
  const laserHActif = (o, t) => o.toujours || Math.sin((2 * Math.PI * t) / o.P + o.ph) > -0.2;
  // laser qui suit (vaisseau) : charge 1,2 s (suit la hauteur du joueur) · bloqué 0,35 s · tir 0,6 s · pause 0,05 s
  const SUIT = { charge: 1.0, verrou: 1.35, feu: 1.95, P: 2.0 };
  function etatSuiveur(o, j) {
    const t0 = j.trig[o.id];
    if (t0 == null) return { etat: null, y: o.y };
    const f = (j.t - t0) % SUIT.P, y = j.lazY && j.lazY[o.id] != null ? j.lazY[o.id] : o.y;
    return { etat: f < SUIT.charge ? "charge" : f < SUIT.verrou ? "verrou" : f < SUIT.feu ? "feu" : null, y, f };
  }
  const laserActif = (o, t) => o.toujours || Math.sin((2 * Math.PI * t) / o.P + o.ph) > 0.15;
  // temps propre d'un piège : celui du joueur, ou (piège synchronisé) le temps depuis son déclenchement
  function tPiege(o, j) { return o.sync ? (j.trig[o.id] == null ? 0 : j.t - j.trig[o.id]) : j.t; }
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
    // scies et pendules synchronisés : ils démarrent quand le joueur arrive à o.dist pixels
    for (const o of m.scies) if (o.sync && j.trig[o.id] == null && o.x - j.x < o.dist) j.trig[o.id] = j.t;
    for (const o of m.pendules) if (o.sync && j.trig[o.id] == null && o.x - j.x < o.dist) j.trig[o.id] = j.t;
    // déclencheurs : cubes qui tombent quand on arrive
    for (const o of m.tombants) {
      if (j.trig[o.id] == null && o.x > j.x && (o.x - j.x) / Math.max(j.v, 60) < CHUTE_DELAI) j.trig[o.id] = j.t;
    }
    // vitesse horizontale : remonte vers la vitesse de croisière
    const cible = j.stun > 0 ? 0 : Math.max(vitesseCroisiere(j), j.elanT > 0 ? j.elanV : 0);
    if (j.v < cible) j.v = Math.min(cible, j.v + ACCEL * (j.boost > 0 ? 2.5 : 1) * (j.tapis > 0 ? 2 : 1) * dt);
    else if (j.sol || j.mode === "vaisseau" || j.stun > 0) j.v = Math.max(cible, j.v - ACCEL * 2 * dt); // en l'air (cube), on garde l'élan d'un tapis rapide
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
    if (vaisseau) {
      let pousse = 0;
      for (const o of m.courants) if (j.x + U / 2 > o.x && j.x + U / 2 < o.x + o.w) pousse += o.f; // courant d'air
      j.vy = Math.max(-VAISSEAU_VMAX, Math.min(VAISSEAU_VMAX, j.vy + ((appui && j.stun <= 0 ? -VAISSEAU_MONTE : VAISSEAU_DESCEND) + pousse) * dt));
      j.tenu = false;
    }
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
      if (r.traverse && !dessus) continue; // plateforme traversable par le bas : on ne s'y pose que par le dessus
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
      const b = posPendule(o, tPiege(o, j));
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
    for (const o of m.anneauxV) { // anneau de vitesse : élan (vitesse × 1,5 pendant 1,2 s)
      if (j.vites.includes(o.id)) continue;
      if (Math.abs(j.x + U / 2 - o.x) < U * 0.6 && Math.abs(j.y + U / 2 - o.y) < o.r) {
        j.vites.push(o.id); j.elanV = Math.max(j.elanV || 0, 1.5 * vitesseCroisiere(j)); j.elanT = 1.2; j.v = Math.max(j.v, j.elanV); ev.push("vitesse");
      }
    }
    for (const o of m.lasersH) { // laser horizontal allumé : choc
      if (o.suit) {
        // il démarre 0,6 s AVANT d'entrer dans la zone (quelle que soit la vitesse), il tire donc vers le milieu ; pendant la charge, il suit la hauteur du joueur
        if (j.trig[o.id] == null && j.x + Math.max(3 * U, j.v * 0.6) > o.x && j.x < o.x + o.w) j.trig[o.id] = j.t;
        if (j.trig[o.id] == null || j.x > o.x + o.w) continue;
        const e = etatSuiveur(o, j);
        if (e.etat === "charge" || (e.etat === null && j.lazY[o.id] == null)) { j.lazY = Object.assign({}, j.lazY, { [o.id]: j.y + U / 2 }); continue; }
        if (e.etat === "feu" && j.x + U > o.x && j.y + 4 < e.y + 3 && j.y + U - 4 > e.y - 3) aie(o, false);
        continue;
      }
      if (o.detruit || o.x > j.x + U || o.x + o.w < j.x || !laserHActif(o, j.t)) continue;
      if (j.y + 4 < o.y + 3 && j.y + U - 4 > o.y - 3) aie(o, false);
    }
    for (const o of m.scies) {
      if (o.detruit || Math.abs(o.x - j.x) > 3 * U) continue;
      const y = yScie(o, tPiege(o, j));
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
    for (const o of m.bulles) { // zone de prise élargie : 1,4 bloc autour de la bulle
      if (j.bulles.includes(o.id)) continue;
      if (Math.abs(j.x + U / 2 - o.x) < U * 1.4 && Math.abs(j.y + U / 2 - o.y) < U * 1.4) { j.bulles.push(o.id); j.charge = true; ev.push("bulle-prise"); }
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
  // Il ne détruit que ce qui est rose (piques, scies) et croise la bande à hauteur du cube.
  function laser(j, m, portee) {
    const x1 = j.x + U, x2 = j.x + (portee || 620);
    const y1 = j.y - 1.5 * U, y2 = j.y + 2.5 * U;
    const dansX = (x, w) => x < x2 && x + (w || U) > x1;
    const dansY = (a, b) => a < y2 && b > y1;
    let n = 0;
    const casser = (o) => { o.detruit = true; n++; };
    // le laser ne détruit que ce qui est ROSE : piques, scies (pendules et scies volantes)
    m.piques.forEach((p) => { if (!p.detruit && dansX(p.x) && (p.bas ? dansY(p.y, p.y + U) : dansY(p.y - U, p.y))) casser(p); });
    m.pendules.forEach((o) => { const b = posPendule(o, tPiege(o, j)); if (!o.detruit && dansX(b.x - o.r, 2 * o.r) && dansY(b.y - o.r, b.y + o.r)) casser(o); });
    m.scies.forEach((o) => { const y = yScie(o, tPiege(o, j)); if (!o.detruit && dansX(o.x - o.r, 2 * o.r) && dansY(y - o.r, y + o.r)) casser(o); });
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
    // le grappin ne casse rien : tout obstacle touché arrête le balancement
    const heurte = rectsDuMoment(m, j).some((r) => !r.detruit && !(r.src && r.src.detruit) && p.x + U - 3 > r.x && p.x + 3 < r.x + r.w && p.y + U - 3 > r.y && p.y + 3 < r.y + r.h);
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

  const API = { U, SOL, H, X_CUBE, G, SAUT, SAUT_V, SAUT_TREMPLIN, SAUT_COUPE, vitesseBase, vitesseJoueur, vitesseCroisiere, yDe, mulberry32, creerMonde, etendre, nettoyer, nouveauJoueur, copier, reprise, placer, MIROIR, accrocher, tirer, etape, laser, solSous, MORCEAUX, LISTES, reglerDouble: (dx, h) => { DX_DOUBLE = dx; H_DOUBLE = h; },
    yTombant, yMobile, yScie, tPiege, SETS, TAMPONS, laserActif, laserHActif, etatSuiveur, posPendule, fragileTombe, porteOuverte };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else racine.DashMoteur = API;
})(typeof window !== "undefined" ? window : globalThis);
