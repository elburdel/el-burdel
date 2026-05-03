import { onSession, getUserData } from "./auth.js";

export function initNavbar() {
  // Try to find the nav-top element. If not, create and prepend it.
  let navTop = document.getElementById("nav-top");
  
  // Calculate relative prefix. If we are in /games/, it should be ../
  // To be safe and simple for now, since we are in root mostly, or /games/
  // let's figure out path to root.
  const path = window.location.pathname;
  let prefix = "";
  if (path.includes("/games/") || path.includes("/css/")) {
    prefix = "../";
  } else if (path.includes("/modules/")) {
     // future proofing
    prefix = "../../";
  }

  if (!navTop) {
    navTop = document.createElement("nav");
    navTop.className = "nav-top";
    navTop.id = "nav-top";
    document.body.insertBefore(navTop, document.body.firstChild);
  }

  navTop.innerHTML = `
    <div class="nav-top-inner">
      <a href="${prefix}index.html" class="nav-brand">
        <img src="${prefix}assets/img/logo.png" alt="Logo" class="nav-brand-logo" />El Burdel
      </a>
      <div class="nav-links">
        <a href="${prefix}index.html#juegos" class="nav-link">Juegos</a>
        <a href="${prefix}index.html#galeria" class="nav-link">Galería</a>
        <a href="${prefix}index.html#clips" class="nav-link">Clips</a>
        <a href="${prefix}index.html#ranking" class="nav-link">Ranking</a>
      </div>
      <div id="nav-auth"></div>
    </div>
  `;

  // Auth Logic for Navbar
  onSession(async (user) => {
    const navAuth = document.getElementById("nav-auth");
    if (!navAuth) return;
    
    if (user) {
      const data = await getUserData(user.uid);
      if (!data) {
        navAuth.innerHTML = `<a href="${prefix}login.html" class="nav-cta">Entrar</a>`;
        return;
      }
      
      let href = `${prefix}dashboard.html`;
      if (data.role === "admin") href = `${prefix}admin.html`;
      else if (data.status === "pending") href = `${prefix}pending.html`;
      else if (data.status === "paused") href = `${prefix}paused.html`;

      navAuth.innerHTML = `
        <a href="${href}" class="nav-user-pill">
          <span class="nav-user-dot"></span>
          <span class="nav-user-nick">${data.nick}</span>
        </a>
      `;
    } else {
      navAuth.innerHTML = `<a href="${prefix}login.html" class="nav-cta">Entrar</a>`;
    }
  });
}
