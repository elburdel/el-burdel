// ============================================================
//  El Burdel — Firma discreta "Desarrollado por ElevaLab"
// ============================================================
//  Inyecta una línea chica dentro del footer existente (.nav-bottom-inner),
//  sin tocar los créditos/links que ya tiene cada página.
//  No agrega banners ni bloques nuevos: una sola línea de texto.
// ============================================================

import { ELEVALAB_URL } from "./elevalab-config.js";

function inyectarCreditoElevaLab() {
  const contenedor = document.querySelector(".nav-bottom-inner");
  if (!contenedor) return;
  if (contenedor.querySelector(".nav-bottom-credit")) return; // evita duplicados

  const p = document.createElement("p");
  p.className = "nav-bottom-credit";
  p.innerHTML =
    'Desarrollado por <a href="' + ELEVALAB_URL + '" target="_blank" rel="noopener noreferrer" class="nav-bottom-credit-link">ElevaLab</a>';
  contenedor.appendChild(p);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inyectarCreditoElevaLab);
} else {
  inyectarCreditoElevaLab();
}
