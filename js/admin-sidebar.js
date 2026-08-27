// ============================================================
//  El Burdel — Sidebar de admin compartida
//  Se usa en todas las pantallas de juego standalone
//  (admin-taboo.html, admin-wordle.html, etc.) para que la
//  navegación lateral viaje con el admin sin importar en qué
//  pantalla esté. admin.html tiene su propia versión inline
//  porque ahí las secciones cambian sin recargar la página;
//  acá cada ítem es un link real a su propia pantalla.
// ============================================================

const ICONS = {
  crown: `<svg viewBox="0 0 48 48" fill="currentColor"><path d="M8 34l-3-16 9 7 10-13 10 13 9-7-3 16z"/><rect x="8" y="34" width="32" height="5" rx="1"/></svg>`,
  usuarios: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="16" r="8"/><path d="M8 40c0-8.8 7.2-16 16-16s16 7.2 16 16"/></svg>`,
  sesion: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="4" fill="currentColor" stroke="none"/><path d="M17 17a10 10 0 0 0 0 14"/><path d="M31 17a10 10 0 0 1 0 14"/><path d="M11 11a18 18 0 0 0 0 26"/><path d="M37 11a18 18 0 0 1 0 26"/></svg>`,
  musica: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 32V10l20-4v20"/><circle cx="14" cy="34" r="5" fill="currentColor" stroke="none"/><circle cx="34" cy="30" r="5" fill="currentColor" stroke="none"/></svg>`,
  tablon: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><rect x="8" y="10" width="32" height="24" rx="2"/><line x1="16" y1="18" x2="30" y2="18"/><line x1="16" y1="24" x2="26" y2="24"/><circle cx="24" cy="34" r="2" fill="currentColor" stroke="none"/><line x1="24" y1="36" x2="24" y2="41"/></svg>`,
  noticias: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><rect x="7" y="12" width="28" height="28" rx="2"/><path d="M35 18h6v18a4 4 0 0 1-4 4H12"/><line x1="13" y1="19" x2="24" y2="19"/><line x1="13" y1="25" x2="29" y2="25"/><line x1="13" y1="31" x2="29" y2="31"/></svg>`,
  galeria: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><rect x="6" y="8" width="36" height="32" rx="3"/><circle cx="17" cy="19" r="4"/><path d="M6 33l11-11 9 9 6-6 10 10"/></svg>`,
  horoscopo: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M29 8a16 16 0 1 0 11 27A12 12 0 0 1 29 8z"/><path d="M38 9l1.4 3.6L43 14l-3.6 1.4L38 19l-1.4-3.6L33 14l3.6-1.4z"/></svg>`,
  taboo: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="8" y="9" width="32" height="28" rx="3"/><line x1="14" y1="19" x2="34" y2="19"/><line x1="14" y1="26" x2="27" y2="26"/><line x1="9" y1="41" x2="39" y2="6"/></svg>`,
  wordle: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="20" y="6" width="12" height="12" rx="2" fill="currentColor" fill-opacity="0.25"/><rect x="34" y="6" width="8" height="12" rx="2"/><rect x="6" y="20" width="12" height="12" rx="2"/><rect x="20" y="20" width="12" height="12" rx="2"/><rect x="34" y="20" width="8" height="12" rx="2" fill="currentColor" fill-opacity="0.25"/></svg>`,
  impostor: `<svg viewBox="0 0 48 48" fill="currentColor"><path d="M24 6c-5 0-8 4-8 9 0 3 1 5 2 6-6 2-10 8-10 15v6h32v-6c0-7-4-13-10-15 1-1 2-3 2-6 0-5-3-9-8-9z"/></svg>`,
  quiensoyRonda: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><rect x="10" y="6" width="28" height="36" rx="4"/><path d="M19 18c0-3.3 2.2-5.5 5-5.5s5 2.2 5 5.5c0 3-2 4-4 6-1 1-1 2-1 3.2"/><circle cx="24" cy="33.5" r="1.6" fill="currentColor" stroke="none"/></svg>`,
  quiensoyCartas: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><rect x="7" y="12" width="28" height="28" rx="2"/><line x1="13" y1="19" x2="24" y2="19"/><line x1="13" y1="25" x2="29" y2="25"/><line x1="13" y1="31" x2="29" y2="31"/></svg>`,
  ruleta: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="3" fill="currentColor" stroke="none"/><line x1="24" y1="7" x2="24" y2="41"/><line x1="7" y1="24" x2="41" y2="24"/><line x1="12.4" y1="12.4" x2="35.6" y2="35.6"/><line x1="35.6" y1="12.4" x2="12.4" y2="35.6"/></svg>`,
  tests: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round"><path d="M19 6h10"/><path d="M21 6v11l-9.5 17.5A4 4 0 0 0 15 40h18a4 4 0 0 0 3.5-5.5L27 17V6"/><line x1="16.5" y1="29" x2="31.5" y2="29"/></svg>`,
};

const GROUPS = [
  {
    label: "Panel",
    items: [
      { key: "usuarios", label: "Usuarios", href: "admin.html#usuarios", icon: ICONS.usuarios },
      { key: "sesion",   label: "Sesión",   href: "admin.html#sesion",   icon: ICONS.sesion },
    ],
  },
  {
    label: "Contenido",
    items: [
      { key: "musica",    label: "Música",    href: "admin.html#musica",   icon: ICONS.musica,    gc: "var(--c-musica)" },
      { key: "tablon",    label: "Tablón",    href: "admin.html#tablon",   icon: ICONS.tablon },
      { key: "noticias",  label: "Noticias",  href: "admin.html#noticias", icon: ICONS.noticias,  gc: "var(--c-noticias)" },
      { key: "galeria",   label: "Galería",   href: "admin.html#galeria",  icon: ICONS.galeria,   gc: "var(--c-galeria)" },
      { key: "horoscopo", label: "Horóscopo", href: "admin-horoscopo.html", icon: ICONS.horoscopo, gc: "var(--c-horoscopo)" },
    ],
  },
  {
    label: "Juegos",
    items: [
      { key: "taboo",           label: "Taboo",                 href: "admin-taboo.html",          icon: ICONS.taboo,          gc: "var(--c-taboo)" },
      { key: "wordle",          label: "Wordle",                href: "admin-wordle.html",         icon: ICONS.wordle,         gc: "var(--c-wordle)" },
      { key: "impostor",        label: "Impostor",              href: "admin-impostor.html",       icon: ICONS.impostor,       gc: "var(--c-impostor)" },
      { key: "quiensoy-ronda",  label: "¿Quién Soy? — Ronda",   href: "admin-quiensoy-juego.html", icon: ICONS.quiensoyRonda,  gc: "var(--c-quiensoy)" },
      { key: "quiensoy-cartas", label: "¿Quién Soy? — Cartas",  href: "admin-quiensoy.html",       icon: ICONS.quiensoyCartas, gc: "var(--c-quiensoy)" },
      { key: "millon",          label: "El Millón",             href: "admin-millon.html",         icon: ICONS.crown,          gc: "var(--c-millon)" },
      { key: "ruleta",          label: "Ruleta",                href: "admin-ruleta.html",         icon: ICONS.ruleta,         gc: "var(--c-ruleta)" },
      { key: "tests",           label: "Tests",                 href: "admin-tests.html",          icon: ICONS.tests,          gc: "var(--c-tests)" },
    ],
  },
];

/**
 * Monta la sidebar de admin en la página actual y reubica el contenido
 * existente de <body> dentro de un contenedor flex (.admin-shell) para
 * que quede al lado, sin tocar el HTML de cada página a mano.
 *
 * @param {string} activeKey - key del item que corresponde a esta pantalla
 *   (ver GROUPS arriba), para marcarlo como activo.
 */
export function mountAdminSidebar(activeKey) {
  const navTop = document.getElementById("nav-top");
  const hasTopNav = !!navTop;

  const groupsHtml = GROUPS.map(group => `
    <div class="admin-sidebar-group">
      <span class="admin-sidebar-label">${group.label}</span>
      ${group.items.map(item => `
        <a class="admin-side-link${item.key === activeKey ? " active" : ""}"
           href="${item.href}"
           ${item.gc ? `style="--gc: ${item.gc};"` : ""}>
          ${item.icon}
          ${item.label}
        </a>
      `).join("")}
    </div>
  `).join("");

  const aside = document.createElement("aside");
  aside.className = "admin-sidebar";
  aside.innerHTML = `
    <div class="admin-sidebar-brand">
      ${ICONS.crown}
      <span>EL BURDEL</span>
    </div>
    <div class="admin-sidebar-groups">${groupsHtml}</div>
  `;

  const shell = document.createElement("div");
  shell.className = "admin-shell" + (hasTopNav ? " has-topnav" : "");

  // Movemos todo lo que ya está en <body> (menos el nav-top, el placeholder
  // muerto #navbar-container si existe, y los <script>) adentro del shell,
  // sin recrear nada — mismos nodos, mismos listeners, mismo estado.
  const toMove = Array.from(document.body.children).filter(el =>
    el !== navTop &&
    el.id !== "navbar-container" &&
    el.tagName !== "SCRIPT"
  );

  shell.appendChild(aside);
  toMove.forEach(el => shell.appendChild(el));
  document.body.appendChild(shell);
}
