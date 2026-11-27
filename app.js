// ============================================================
//  MENU + LOBBY
//  - n'importe quel joueur crée un lobby et devient l'hôte
//  - les autres le rejoignent avec le code (ou le QR code / le lien)
//  - seul l'hôte choisit le jeu et lance la partie : tout le monde
//    est alors envoyé sur la page du jeu
// ============================================================
(function () {
  const $ = (s) => document.querySelector(s);
  const montrer = (id) => document.querySelectorAll(".ecran").forEach((e) => (e.hidden = e.id !== id));
  const dire = (el, txt, ko) => { el.textContent = txt || ""; el.classList.toggle("ko", !!ko); };

  $("#nom-plateforme").textContent = PLATEFORME.nom;
  $("#sous-titre").textContent = PLATEFORME.sousTitre;
  document.title = PLATEFORME.nom + " — Mini-jeux";

  const parCat = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const jeuxDispo = JEUX.filter((j) => j.statut === "disponible" && j.dossier);
  const titreDe = (dossier) => (JEUX.find((j) => j.dossier === dossier) || {}).titre || dossier;

  // ---------- Pseudo (gardé d'une fois sur l'autre) ----------
  const champPseudo = $("#pseudo");
  try { champPseudo.value = localStorage.getItem("rob-pseudo") || ""; } catch (e) {}
  const lirePseudo = () => {
    const p = champPseudo.value.trim();
    try { localStorage.setItem("rob-pseudo", p); } catch (e) {}
    return p;
  };

  // ---------- Code dans l'adresse (QR code / lien d'invitation) ----------
  const champCode = $("#code");
  champCode.addEventListener("input", () => { champCode.value = Reseau.nettoyerCode(champCode.value); });
  const codeURL = new URLSearchParams(location.search).get("code");
  if (codeURL) {
    champCode.value = Reseau.nettoyerCode(codeURL);
    history.replaceState(null, "", location.pathname);
  }

  // ---------- MENU ----------
  const msgMenu = $("#msg-menu");
  function exigerPseudo() {
    const p = lirePseudo();
    if (!p) { dire(msgMenu, "Choisis d'abord un pseudo.", true); champPseudo.focus(); }
    return p;
  }

  $("#btn-creer").addEventListener("click", async () => {
    const p = exigerPseudo(); if (!p) return;
    dire(msgMenu, "Création du lobby…");
    try { ouvrirLobby(await Reseau.creerLobby(p)); }
    catch (e) { dire(msgMenu, "Connexion impossible. Essaie la 4G ou un autre wifi.", true); }
  });

  $("#form-rejoindre").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const p = exigerPseudo(); if (!p) return;
    const code = Reseau.nettoyerCode(champCode.value);
    if (!code) { dire(msgMenu, "Entre le code du lobby.", true); champCode.focus(); return; }
    dire(msgMenu, "Connexion au lobby…");
    try { ouvrirLobby(await Reseau.rejoindreLobby(code, p)); }
    catch (e) {
      dire(msgMenu, e.message === "Code inconnu" ? "Aucun lobby avec ce code." : "Connexion impossible. Essaie la 4G.", true);
    }
  });

  // ---------- LOBBY ----------
  let ecoute = null; // { ref, cb }
  let session = null;
  let estHote = false;
  let jeuChoisi = "";

  function fermerEcoute() { if (ecoute) { ecoute.ref.off("value", ecoute.cb); ecoute = null; } }

  function retourMenu(message) {
    fermerEcoute();
    session = null;
    montrer("ecran-menu");
    dire(msgMenu, message || "", !!message);
  }

  function ouvrirLobby(s) {
    session = s;
    dire(msgMenu, "");
    dire($("#msg-lobby"), "");
    montrer("ecran-lobby");
    $("#lobby-code").textContent = s.code;
    $("#lobby-qr").innerHTML = Reseau.qr(Reseau.lienInvitation(s.code));

    const ref = Reseau.lobby(s.code);
    let premier = true, lancementVu = null;
    const cb = (snap) => {
      const v = snap.val();
      if (!v) { Reseau.session.effacer(); retourMenu("Le lobby a été fermé par l'hôte."); return; }

      // une partie lancée AVANT mon arrivée ne doit pas me téléporter
      if (premier) { lancementVu = v.lancement ? v.lancement.t : null; premier = false; }
      if (v.lancement && v.lancement.t !== lancementVu && v.lancement.jeu) {
        fermerEcoute();
        Reseau.garderPresence(s);
        location.href = Reseau.lienJeu(v.lancement.jeu);
        return;
      }

      estHote = v.hote === s.id;
      jeuChoisi = v.jeu || "";
      afficherJoueurs(v);
      afficherJeu(v);
    };
    ref.on("value", cb);
    ecoute = { ref, cb };
  }

  function afficherJoueurs(v) {
    const joueurs = Object.entries(v.joueurs || {})
      .map(([id, j]) => ({ id, nom: j.nom, arrivee: j.arrivee || 0 }))
      .sort((a, b) => a.arrivee - b.arrivee);
    $("#nb-joueurs").textContent = joueurs.length;
    $("#liste-joueurs").replaceChildren(...joueurs.map((j) => {
      const li = document.createElement("li");
      if (j.id === v.hote) li.classList.add("hote");
      if (j.id === session.id) li.classList.add("moi");
      li.textContent = (j.id === v.hote ? "★ " : "") + j.nom + (j.id === session.id ? " (toi)" : "");
      return li;
    }));
    const hotePresent = joueurs.some((j) => j.id === v.hote);
    dire($("#msg-lobby"), hotePresent ? "" : "L'hôte s'est déconnecté… en attente de son retour.", !hotePresent);
  }

  function afficherJeu(v) {
    $("#choix-hote").hidden = !estHote;
    $("#attente-invite").hidden = estHote;

    if (!estHote) {
      $("#jeu-choisi").textContent = v.jeu ? "Jeu choisi : " + titreDe(v.jeu) : "L'hôte n'a pas encore choisi de jeu.";
      return;
    }

    $("#vide").hidden = jeuxDispo.length > 0;
    $("#grille").replaceChildren(...jeuxDispo.map((jeu) => carte(jeu, jeu.dossier === v.jeu)));
    $("#btn-lancer").hidden = jeuxDispo.length === 0;
    $("#btn-lancer").disabled = !jeuxDispo.some((j) => j.dossier === v.jeu);
  }

  function carte(jeu, choisi) {
    const cat = parCat[jeu.categorie] || { nom: jeu.categorie || "", emoji: "🎲", id: "autre" };
    const el = document.createElement("button");
    el.type = "button";
    el.className = "carte cat-" + cat.id + (choisi ? " choisie" : "");
    el.innerHTML = `
      <div class="carte-icone">${jeu.icone || cat.emoji}</div>
      <div class="carte-corps">
        <span class="etiquette"></span><h3></h3><p></p>
        <div class="carte-bas"><span class="niveau"></span><span class="action">${choisi ? "Choisi ✔" : "Choisir"}</span></div>
      </div>`;
    el.querySelector(".etiquette").textContent = cat.nom;
    el.querySelector("h3").textContent = jeu.titre;
    el.querySelector("p").textContent = jeu.description || "";
    el.querySelector(".niveau").textContent = jeu.niveau || "";
    el.addEventListener("click", () => Reseau.lobby(session.code).child("jeu").set(jeu.dossier));
    return el;
  }

  $("#btn-lancer").addEventListener("click", () => {
    if (!estHote || !session || !jeuxDispo.some((j) => j.dossier === jeuChoisi)) return;
    Reseau.lobby(session.code).child("lancement").set({ jeu: jeuChoisi, t: Date.now() });
  });

  $("#btn-copier").addEventListener("click", async () => {
    const lien = Reseau.lienInvitation(session.code);
    try { await navigator.clipboard.writeText(lien); dire($("#msg-lobby"), "Lien copié !"); }
    catch (e) { dire($("#msg-lobby"), lien); }
  });

  $("#btn-quitter").addEventListener("click", async () => {
    const s = session, hote = estHote;
    fermerEcoute();
    await Reseau.quitter(s, hote);
    retourMenu("");
  });

  // ---------- SCORES : score total dans le menu + écran Classements ----------
  let scores = {};          // tous les scores, mis à jour en direct (null = indisponible)
  let onglet = null;        // null = classement général, sinon dossier du jeu

  function afficherScoreTotal() {
    const p = champPseudo.value.trim();
    const moi = scores && p ? Scores.totaux(scores).find((l) => l.cle === Scores.cle(p)) : null;
    const nb = scores ? Scores.totaux(scores).length : 0;
    $("#score-total").textContent = moi ? moi.total : "—";
    $("#rang-total").textContent = moi ? Scores.rangTexte(moi.rang) + " / " + nb : (p ? "Joue pour être classé" : "");
  }
  champPseudo.addEventListener("input", afficherScoreTotal);

  function afficherClassements() {
    const onglets = [{ id: null, nom: "Général" }].concat(
      JEUX.filter((j) => j.dossier).map((j) => ({ id: j.dossier, nom: j.titre }))
    );
    $("#onglets").replaceChildren(...onglets.map((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filtre" + (o.id === onglet ? " actif" : "");
      b.textContent = o.nom;
      b.addEventListener("click", () => { onglet = o.id; afficherClassements(); });
      return b;
    }));
    $("#explication").textContent = onglet
      ? "Classement au meilleur score."
      : "Score total sur 1000 : moyenne de tes points à chaque jeu (selon ton rang), les jeux les plus joués comptant davantage."
        + (JEUX.some((j) => j.dossier) ? "" : " Aucun jeu pour l'instant.");
    Scores.tableau($("#tableau-scores"), scores, onglet, Scores.cle(champPseudo.value.trim()));
  }

  $("#btn-classements").addEventListener("click", () => { lirePseudo(); montrer("ecran-classements"); afficherClassements(); });
  $("#btn-retour-menu").addEventListener("click", () => montrer("ecran-menu"));

  Scores.ecouter((data) => {
    scores = data;
    afficherScoreTotal();
    if (!$("#ecran-classements").hidden) afficherClassements();
  });

  // ---------- Au chargement : revenir dans son lobby si on y était ----------
  const ancienne = Reseau.session.lire();
  if (ancienne) {
    Reseau.reprendre(ancienne).then(ouvrirLobby).catch(() => montrer("ecran-menu"));
  } else {
    montrer("ecran-menu");
  }
})();
