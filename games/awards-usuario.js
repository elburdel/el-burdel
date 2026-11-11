// ============================================================
//  BURDEL AWARDS 2026 — segunda votación (solo usuarios registrados)
//  Archivo: games/awards-usuario.js   (lo usa awards-usuario.html, enlazada desde el dashboard)
// ============================================================
//  - Exige sesión iniciada y cuenta activa (igual que el resto de las pantallas de socios).
//  - Un voto por categoría (incluida Burdel de Oro), en awards/votos2/{categoría}/{uid}.
//    Las reglas de Firebase impiden votar fuera de etapa, votar a quien no es finalista,
//    votar por otra persona y modificar o repetir un voto ya confirmado.
//  - Cada usuario solo puede leer su propio voto. Nunca ve conteos ni resultados.
//  - Los ganadores (cuando el admin los publique) se mostrarán en esta misma pantalla.
// ============================================================

import { initNavbar } from "../js/navbar.js";
import { onSession, getUserData } from "../js/auth.js";
import { db } from "../js/firebase-init.js";
import { ref, get, set, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { leerFase, leerRonda2, fotoValida } from "./awards-datos.js";

const $ = (id) => document.getElementById(id);
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
const iniciales = (n) => { const p = String(n).trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

let uid = null;
let fase = null;
let categorias = [];
let personas = {};     // pid -> {nombre, foto}
let misVotos = {};     // cid -> pid
let cargada = false;
let cargando = false;
let pendiente = null;  // {cid, pid} esperando confirmación
let enviando = false;
let errorVoto = "";

function aviso(titulo, texto) {
  const a = $("awp-aviso");
  a.textContent = "";
  a.appendChild(el("strong", "", titulo));
  a.appendChild(document.createTextNode(texto));
  a.classList.remove("hidden");
}

function mostrarSegunFase() {
  $("awp-aviso").classList.add("hidden");
  if (fase === "ronda2_abierta") {
    $("awp-sub").textContent = "Última ronda. Elegí un finalista por categoría: tu voto es secreto y no se puede cambiar.";
    if (!cargada) { cargarRonda2(); return; }
    renderLista();
    return;
  }
  $("awp-lista").textContent = "";
  $("awp-progreso").classList.add("hidden");
  $("awp-sub").textContent = "Los premios de El Burdel.";
  if (fase === "ronda2_cerrada") aviso("La votación ya cerró", "¡Gracias por votar! Los resultados se conocerán en la entrega de premios.");
  else if (fase === "publicado") aviso("Los resultados ya fueron publicados", "Muy pronto vas a poder ver acá a todos los ganadores.");
  else aviso("Todavía no hay votación abierta", "Cuando se abra la votación final, la vas a encontrar acá.");
}

async function cargarRonda2() {
  if (cargando) return;
  cargando = true;
  $("awp-sub").textContent = "Cargando categorías...";
  try {
    const snap = await get(ref(db, "awards/ronda2"));
    categorias = leerRonda2(snap.val());
    const ids = [...new Set(categorias.flatMap((c) => c.finalistas.map((f) => f.pid)))];
    await Promise.all(ids.map(async (pid) => {
      try {
        const s = await get(ref(db, `awards/personas/${pid}`));
        const v = s.val();
        if (v && typeof v.nombre === "string") personas[pid] = { nombre: v.nombre.slice(0, 40), foto: fotoValida(v.foto) ? v.foto : null };
      } catch (e) { /* esa persona no se muestra */ }
    }));
    // Mis votos: cada uno se lee por su ruta exacta (solo puedo leer el mío).
    await Promise.all(categorias.map(async (c) => {
      try {
        const s = await get(ref(db, `awards/votos2/${c.id}/${uid}`));
        const v = s.val();
        if (v && typeof v.p === "string" && c.finalistas.some((f) => f.pid === v.p)) misVotos[c.id] = v.p;
      } catch (e) { /* sin voto */ }
    }));
    cargada = true;
    $("awp-sub").textContent = "Última ronda. Elegí un finalista por categoría: tu voto es secreto y no se puede cambiar.";
    renderLista();
  } catch (e) {
    $("awp-sub").textContent = "";
    aviso("No se pudo cargar", "Revisá tu conexión y recargá la página.");
  } finally {
    cargando = false;
  }
}

async function votar(cid, pid) {
  if (enviando || fase !== "ronda2_abierta") return;
  enviando = true;
  errorVoto = "";
  renderLista();
  try {
    await set(ref(db, `awards/votos2/${cid}/${uid}`), { p: pid, ts: serverTimestamp() });
    misVotos[cid] = pid;
    pendiente = null;
  } catch (e) {
    pendiente = null;
    if (fase !== "ronda2_abierta") {
      /* la votación cerró justo ahora: el aviso lo muestra onValue */
    } else if (/PERMISSION_DENIED/i.test(String((e && (e.code || e.message)) || ""))) {
      try {
        const s = await get(ref(db, `awards/votos2/${cid}/${uid}`));
        const v = s.val();
        if (v && typeof v.p === "string") { misVotos[cid] = v.p; errorVoto = "Ya habías votado en esta categoría."; }
        else errorVoto = "No tenés permiso para votar ahora.";
      } catch (e2) { errorVoto = "No tenés permiso para votar ahora."; }
    } else {
      errorVoto = "No se pudo registrar el voto. Probá de nuevo.";
    }
  } finally {
    enviando = false;
    renderLista();
  }
}

function tarjeta(c, f) {
  const p = personas[f.pid];
  if (!p) return null;
  const votada = !!misVotos[c.id];
  const elegida = misVotos[c.id] === f.pid;
  const card = el("div", "awp-card" + (elegida ? " elegida" : ""));
  const foto = el("div", "awp-foto");
  foto.appendChild(el("div", "awp-ini", iniciales(p.nombre)));
  if (p.foto) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.src = p.foto;
    foto.appendChild(img);
  }
  card.appendChild(foto);
  card.appendChild(el("div", "awp-nombre", p.nombre)); // el nombre va debajo del círculo
  const acc = el("div", "awp-acc");
  if (elegida) acc.appendChild(el("div", "awp-ok", "✓ Tu voto"));
  else if (votada) { /* ya votó en esta categoría */ }
  else if (pendiente && pendiente.cid === c.id && pendiente.pid === f.pid) {
    acc.appendChild(el("div", "awp-conf", `¿Votar por ${p.nombre}?`));
    const ok = el("button", "awp-btn primario", enviando ? "Enviando..." : "Confirmar");
    ok.type = "button";
    ok.disabled = enviando;
    ok.addEventListener("click", () => votar(c.id, f.pid));
    const no = el("button", "awp-btn", "Cancelar");
    no.type = "button";
    no.disabled = enviando;
    no.addEventListener("click", () => { pendiente = null; renderLista(); });
    acc.append(ok, no);
  } else {
    const b = el("button", "awp-btn", "Votar");
    b.type = "button";
    b.disabled = enviando;
    b.addEventListener("click", () => { pendiente = { cid: c.id, pid: f.pid }; errorVoto = ""; renderLista(); });
    acc.appendChild(b);
  }
  card.appendChild(acc);
  return card;
}

function renderLista() {
  const lista = $("awp-lista");
  lista.textContent = "";
  if (fase !== "ronda2_abierta") return;
  const visibles = categorias.filter((c) => c.finalistas.some((f) => personas[f.pid]));
  if (!visibles.length) { aviso("Sin categorías", "Todavía no hay nada para votar."); return; }
  const hechas = visibles.filter((c) => misVotos[c.id]).length;
  const prog = $("awp-progreso");
  prog.classList.remove("hidden");
  prog.textContent = "";
  if (hechas === visibles.length) prog.appendChild(document.createTextNode("¡Listo! Votaste en todas las categorías. Gracias por participar."));
  else {
    prog.appendChild(document.createTextNode("Votaste en "));
    prog.appendChild(el("b", "", `${hechas} de ${visibles.length}`));
    prog.appendChild(document.createTextNode(" categorías"));
  }
  for (const c of visibles) {
    const sec = el("section", "awp-cat" + (c.tipo === "oro" ? " oro" : "") + (misVotos[c.id] ? " votada" : ""));
    sec.appendChild(el("h2", "awp-cat-titulo", c.nombre));
    sec.appendChild(el("div", "awp-cat-estado", misVotos[c.id] ? "Voto registrado" : (c.tipo === "oro" ? "Categoría especial · elegí uno" : "Elegí uno")));
    const grid = el("div", "awp-grid");
    for (const f of c.finalistas) { const t = tarjeta(c, f); if (t) grid.appendChild(t); }
    sec.appendChild(grid);
    lista.appendChild(sec);
  }
  if (errorVoto) lista.appendChild(el("div", "awp-error", errorVoto));
}

// ── Inicio: sesión + etapa en vivo ──
function arrancar() {
  initNavbar();
  let iniciado = false;
  onSession(async (user) => {
    if (!user) { window.location.href = "/login.html"; return; }
    const data = await getUserData(user.uid);
    if (!data) { window.location.href = "/login.html"; return; }
    if (data.status === "pending") { window.location.href = "/pending.html"; return; }
    if (data.status === "paused") { window.location.href = "/paused.html"; return; }
    if (data.status !== "active") { window.location.href = "/login.html"; return; }
    if (iniciado) return;
    iniciado = true;
    uid = user.uid;
    onValue(ref(db, "awards/estado"), (snap) => {
      fase = leerFase(snap.val());
      mostrarSegunFase();
    }, () => {
      $("awp-sub").textContent = "";
      aviso("No se pudo cargar", "Revisá tu conexión y recargá la página.");
    });
  });
}

if (typeof document !== "undefined" && document.getElementById("awp-lista")) arrancar();
