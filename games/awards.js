// ============================================================
//  BURDEL AWARDS 2026 — primera votación pública
//  Archivo: games/awards.js   (lo usa awards.html)
// ============================================================
//  - No exige cuenta. Cada navegador genera un token aleatorio y lo guarda localmente.
//  - Un voto por categoría y token: lo garantizan las reglas de Firebase (el voto se escribe
//    una sola vez y no se puede cambiar). El navegador también recuerda lo votado.
//  - El visitante solo lee: la etapa (awards/estado), las categorías (awards/ronda1) y los datos
//    públicos de cada nominado (awards/personas/{id}). Nunca ve votos ni conteos.
//  - Límite conocido: quien borre los datos del navegador obtiene un token nuevo y podría votar de
//    nuevo. Se acepta a propósito (decisión del admin: protección sencilla).
// ============================================================

import { db } from "../js/firebase-init.js";
import { ref, get, set, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { leerFase, leerCategorias, fotoValida, nuevoToken, tokenValido } from "./awards-datos.js";

const $ = (id) => document.getElementById(id);
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
const iniciales = (n) => { const p = String(n).trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

const LS_TOKEN = "burdel_awards26_token";
const LS_VOTOS = "burdel_awards26_votos";

// ── Almacenamiento local (puede no estar disponible: se sigue en memoria) ──
function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: queda en memoria */ } }

let token = lsGet(LS_TOKEN);
if (!tokenValido(token)) { token = nuevoToken(); lsSet(LS_TOKEN, token); }

let votosLocales = {};
try { const o = JSON.parse(lsGet(LS_VOTOS) || "{}"); if (o && typeof o === "object") votosLocales = o; } catch (e) { votosLocales = {}; }
const guardarVotosLocales = () => lsSet(LS_VOTOS, JSON.stringify(votosLocales));

// ── Estado de la pantalla ──
let fase = null;
let categorias = [];
let personas = {};     // pid -> {nombre, foto}
let cargada = false;   // ya se leyeron categorías y nominados
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
  if (fase === "ronda1_abierta") {
    $("awp-sub").textContent = "Elegí a tus favoritos en cada categoría. Un voto por categoría, y no se puede cambiar.";
    if (!cargada) { cargarRonda1(); return; }
    renderLista();
    return;
  }
  $("awp-lista").textContent = "";
  $("awp-progreso").classList.add("hidden");
  if (fase === "configuracion") {
    $("awp-sub").textContent = "Los premios de El Burdel.";
    aviso("Todavía no abrió la votación", "Volvé pronto. Cuando se abra, vas a poder votar desde acá.");
  } else {
    $("awp-sub").textContent = "Los premios de El Burdel.";
    aviso("La votación pública ya cerró", "¡Gracias por participar! Los resultados se conocerán en la entrega de premios.");
    if (fase === "ronda2_abierta") {
      const a = $("awp-aviso");
      a.appendChild(document.createElement("br"));
      a.appendChild(document.createTextNode("La votación final está abierta para los usuarios registrados de El Burdel. "));
      const l = document.createElement("a");
      l.href = "login.html";
      l.textContent = "Entrar";
      a.appendChild(l);
    }
  }
}

async function cargarRonda1() {
  if (cargando) return;
  cargando = true;
  $("awp-sub").textContent = "Cargando categorías...";
  try {
    const snap = await get(ref(db, "awards/ronda1"));
    categorias = leerCategorias(snap.val()).filter((c) => c.nominados.length);
    const ids = [...new Set(categorias.flatMap((c) => c.nominados.map((n) => n.pid)))];
    // Cada persona se lee por su id (la colección completa no es pública).
    await Promise.all(ids.map(async (pid) => {
      try {
        const s = await get(ref(db, `awards/personas/${pid}`));
        const v = s.val();
        if (v && typeof v.nombre === "string") personas[pid] = { nombre: v.nombre.slice(0, 40), foto: fotoValida(v.foto) ? v.foto : null };
      } catch (e) { /* esa persona no se muestra */ }
    }));
    cargada = true;
    $("awp-sub").textContent = "Elegí a tus favoritos en cada categoría. Un voto por categoría, y no se puede cambiar.";
    renderLista();
  } catch (e) {
    $("awp-sub").textContent = "";
    aviso("No se pudo cargar", "Revisá tu conexión y recargá la página.");
  } finally {
    cargando = false;
  }
}

// ── Votar ──
async function votar(cid, pid) {
  if (enviando || fase !== "ronda1_abierta") return;
  enviando = true;
  errorVoto = "";
  renderLista();
  try {
    await set(ref(db, `awards/votos1/${cid}/${token}`), { p: pid, ts: serverTimestamp() });
    votosLocales[cid] = pid;
    guardarVotosLocales();
    pendiente = null;
  } catch (e) {
    pendiente = null;
    if (fase !== "ronda1_abierta") {
      /* la votación cerró justo ahora: el aviso lo muestra onValue */
    } else if (/PERMISSION_DENIED/i.test(String((e && (e.code || e.message)) || ""))) {
      // Lo más probable: este navegador ya había votado en la categoría (se perdió el registro local).
      votosLocales[cid] = votosLocales[cid] || "?";
      guardarVotosLocales();
      errorVoto = "Ya habías votado en esta categoría desde este navegador.";
    } else {
      errorVoto = "No se pudo registrar el voto. Probá de nuevo.";
    }
  } finally {
    enviando = false;
    renderLista();
  }
}

// ── Pantalla ──
function tarjeta(c, n) {
  const p = personas[n.pid];
  if (!p) return null;
  const votada = !!votosLocales[c.id];
  const elegida = votosLocales[c.id] === n.pid;
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
  foto.appendChild(el("div", "awp-nombre", p.nombre));
  card.appendChild(foto);
  const acc = el("div", "awp-acc");
  if (elegida) acc.appendChild(el("div", "awp-ok", "✓ Tu voto"));
  else if (votada) { /* ya votó en esta categoría: sin botón */ }
  else if (pendiente && pendiente.cid === c.id && pendiente.pid === n.pid) {
    acc.appendChild(el("div", "awp-conf", `¿Votar por ${p.nombre}?`));
    const ok = el("button", "awp-btn primario", enviando ? "Enviando..." : "Confirmar");
    ok.type = "button";
    ok.disabled = enviando;
    ok.addEventListener("click", () => votar(c.id, n.pid));
    const no = el("button", "awp-btn", "Cancelar");
    no.type = "button";
    no.disabled = enviando;
    no.addEventListener("click", () => { pendiente = null; renderLista(); });
    acc.append(ok, no);
  } else {
    const b = el("button", "awp-btn", "Votar");
    b.type = "button";
    b.disabled = enviando;
    b.addEventListener("click", () => { pendiente = { cid: c.id, pid: n.pid }; errorVoto = ""; renderLista(); });
    acc.appendChild(b);
  }
  card.appendChild(acc);
  return card;
}

function renderLista() {
  const lista = $("awp-lista");
  lista.textContent = "";
  if (fase !== "ronda1_abierta") return;
  const visibles = categorias.filter((c) => c.nominados.some((n) => personas[n.pid]));
  if (!visibles.length) { aviso("Sin categorías", "Todavía no hay nada para votar."); return; }
  const hechas = visibles.filter((c) => votosLocales[c.id]).length;
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
    const sec = el("section", "awp-cat" + (votosLocales[c.id] ? " votada" : ""));
    sec.appendChild(el("h2", "awp-cat-titulo", c.nombre));
    sec.appendChild(el("div", "awp-cat-estado", votosLocales[c.id] ? "Voto registrado" : "Elegí uno"));
    const grid = el("div", "awp-grid");
    for (const n of c.nominados) { const t = tarjeta(c, n); if (t) grid.appendChild(t); }
    sec.appendChild(grid);
    lista.appendChild(sec);
  }
  if (errorVoto) lista.appendChild(el("div", "awp-error", errorVoto));
}

// ── Inicio: la etapa se escucha en vivo (si el admin cierra, la pantalla se actualiza sola) ──
onValue(ref(db, "awards/estado"), (snap) => {
  fase = leerFase(snap.val());
  mostrarSegunFase();
}, () => {
  $("awp-sub").textContent = "";
  aviso("No se pudo cargar", "Revisá tu conexión y recargá la página.");
});
