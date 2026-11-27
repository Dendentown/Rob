/* ============================================================
   PAGE DE JEU
   - agrandit / réduit le terrain (.cadre-jeu data-ratio="L/H") pour
     qu'il remplisse la place disponible sans jamais déborder
   - bouton 🏆 (#btn-classement) : ouvre / ferme #modal-classement
   ============================================================ */
(function () {
  function ajuster() {
    document.querySelectorAll(".cadre-jeu[data-ratio]").forEach((c) => {
      const zone = c.parentElement;
      const [w, h] = c.dataset.ratio.split("/").map(Number);
      const W = zone.clientWidth - 12, H = zone.clientHeight - 12; // place pour le liseré néon
      if (W <= 0 || H <= 0) return;
      const s = Math.min(W / w, H / h);
      c.style.width = Math.floor(w * s) + "px";
      c.style.height = Math.floor(h * s) + "px";
    });
  }
  addEventListener("resize", ajuster);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(ajuster);
    document.querySelectorAll(".zone-cadre").forEach((z) => ro.observe(z));
  }
  ajuster();
  if (document.fonts) document.fonts.ready.then(ajuster);

  const bouton = document.querySelector("#btn-classement");
  const modal = document.querySelector("#modal-classement");
  if (bouton && modal) {
    bouton.addEventListener("click", () => { modal.hidden = false; });
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-fermer]")) modal.hidden = true;
    });
    addEventListener("keydown", (e) => { if (e.key === "Escape") modal.hidden = true; });
  }

  window.Page = { ajuster };
})();
