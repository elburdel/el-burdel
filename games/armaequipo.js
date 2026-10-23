// ============================================================
//  Armá tu equipo — armado del equipo (vista del participante)
//  Archivo: games/armaequipo.js
// ============================================================
//  Estructura Firebase (nodo independiente "armaequipo"):
//    armaequipo/plantel/{id}   → { nombre, foto, activo, orden }   (lo gestiona el admin)
//        foto = ruta RELATIVA dentro del repositorio: assets/img/plantel/archivo.jpg
//    armaequipo/equipos/{uid}  → un único equipo por usuario:
//        { nick, formacion, capitan,
//          titulares: { p01..p11: idJugador },          p01 = arquero
//          suplentes: { s1..s7: { jugador, reemplaza } }, reemplaza = p01..p11
//          actualizadoEn }
//
//  Las validaciones de esta pantalla (9 formaciones, 11 titulares, 7 suplentes,
//  sin repetidos, capitán entre los titulares) las hace el navegador. Lo que
//  Firebase debe garantizar por su cuenta (dueño, usuario activo, plantel solo
//  del admin, sin borrados) se define en las reglas de la etapa siguiente.
//
//  Modo demostración: agregá ?demo=1 a la dirección para probar la pantalla con
//  integrantes de mentira, sin leer ni escribir nada en Firebase.
// ============================================================

import { initNavbar } from "../js/navbar.js";
import { onSession, getUserData } from "../js/auth.js";
import { db } from "../js/firebase-init.js";
import {
  ref, get, set, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ────────────────────────────────────────────────────────────
//  1. Formaciones y posiciones (lógica pura, sin DOM ni Firebase)
// ────────────────────────────────────────────────────────────

// Cada formación se describe por líneas, de la defensa al ataque.
export const FORMACIONES = {
  "4-4-2":   [4, 4, 2],
  "4-3-3":   [4, 3, 3],
  "4-2-3-1": [4, 2, 3, 1],
  "3-5-2":   [3, 5, 2],
  "3-4-3":   [3, 4, 3],
  "5-3-2":   [5, 3, 2],
  "5-4-1":   [5, 4, 1],
  "4-5-1":   [4, 5, 1],
  "4-1-4-1": [4, 1, 4, 1],
};
export const FORMACION_INICIAL = "4-4-2";
export const SLOTS_TIT = Array.from({ length: 11 }, (_, i) => "p" + String(i + 1).padStart(2, "0"));
export const SLOTS_SUP = Array.from({ length: 7 }, (_, i) => "s" + (i + 1));
export const ROLES_NOMBRE = { ARQ: "arquero", DEF: "defensor", MED: "mediocampista", DEL: "delantero" };

const RE_ID = /^[a-z0-9_]{1,30}$/;
const RE_FOTO = /^assets\/img\/plantel\/[a-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$/;

export function esFormacion(f) {
  return typeof f === "string" && Object.prototype.hasOwnProperty.call(FORMACIONES, f);
}

const cacheSlots = new Map();
// Devuelve los 11 puestos de una formación: [{ id, rol, etiqueta, x, y }] con x/y en % de la cancha
// (y = 0 arriba, el arco propio abajo). p01 es siempre el arquero.
export function construirSlots(formacion) {
  if (!esFormacion(formacion)) formacion = FORMACION_INICIAL;
  if (cacheSlots.has(formacion)) return cacheSlots.get(formacion);
  const lineas = FORMACIONES[formacion];
  const slots = [{ id: "p01", rol: "ARQ", x: 50, y: 90 }];
  const n = lineas.length;
  let contador = 2;
  lineas.forEach((cantidad, k) => {
    const rol = k === 0 ? "DEF" : (k === n - 1 ? "DEL" : "MED");
    const y = n === 1 ? 45 : 72 - k * (58 / (n - 1));
    for (let i = 0; i < cantidad; i++) {
      slots.push({ id: "p" + String(contador++).padStart(2, "0"), rol, x: ((i + 1) / (cantidad + 1)) * 100, y });
    }
  });
  const porRol = {};
  for (const s of slots) {
    porRol[s.rol] = (porRol[s.rol] || 0) + 1;
    s.etiqueta = s.rol === "ARQ" ? "ARQ" : `${s.rol} ${porRol[s.rol]}`;
  }
  cacheSlots.set(formacion, slots);
  return slots;
}

// ────────────────────────────────────────────────────────────
//  2. Estado del equipo y operaciones (mutan el estado recibido)
// ────────────────────────────────────────────────────────────

export function crearEstado(formacion = FORMACION_INICIAL) {
  const suplentes = {};
  for (const s of SLOTS_SUP) suplentes[s] = { jugador: null, reemplaza: null };
  return { formacion: esFormacion(formacion) ? formacion : FORMACION_INICIAL, titulares: {}, suplentes, capitan: null };
}

// posición = { tipo: "slot", id: "p03" } o { tipo: "sup", id: "s2" }
export function jugadorEn(estado, pos) {
  if (!pos) return null;
  if (pos.tipo === "slot") return estado.titulares[pos.id] || null;
  if (pos.tipo === "sup" && estado.suplentes[pos.id]) return estado.suplentes[pos.id].jugador || null;
  return null;
}

export function ubicacionDe(estado, pid) {
  for (const slot of SLOTS_TIT) if (estado.titulares[slot] === pid) return { tipo: "slot", id: slot };
  for (const s of SLOTS_SUP) if (estado.suplentes[s].jugador === pid) return { tipo: "sup", id: s };
  return null;
}

function poner(estado, pos, pid) {
  if (pos.tipo === "slot") {
    if (pid) estado.titulares[pos.id] = pid; else delete estado.titulares[pos.id];
  } else {
    estado.suplentes[pos.id].jugador = pid || null;
  }
}

// Mantiene la coherencia: el capitán debe ser titular y un suplente vacío no reemplaza a nadie.
export function normalizar(estado) {
  if (estado.capitan && !Object.values(estado.titulares).includes(estado.capitan)) estado.capitan = null;
  for (const s of SLOTS_SUP) if (!estado.suplentes[s].jugador) estado.suplentes[s].reemplaza = null;
}

// Ubica al jugador en la posición indicada. Si ya estaba en el equipo, se mueve (o se intercambia
// con quien ocupaba el destino). Un jugador nunca queda en dos lugares.
export function asignar(estado, pos, pid) {
  if (!pid) return;
  const origen = ubicacionDe(estado, pid);
  if (origen && origen.tipo === pos.tipo && origen.id === pos.id) return;
  const ocupante = jugadorEn(estado, pos);
  if (origen) poner(estado, origen, ocupante || null);
  poner(estado, pos, pid);
  normalizar(estado);
}

export function quitar(estado, pos) {
  poner(estado, pos, null);
  normalizar(estado);
}

export function alternarCapitan(estado, slotId) {
  const pid = estado.titulares[slotId];
  if (!pid) return;
  estado.capitan = estado.capitan === pid ? null : pid;
}

export function setReemplaza(estado, supId, slotId) {
  const sup = estado.suplentes[supId];
  if (!sup || !sup.jugador) return;
  sup.reemplaza = SLOTS_TIT.includes(slotId) ? slotId : null;
}

export function hayDistribucion(estado) {
  return Object.keys(estado.titulares).length > 0 || !!estado.capitan ||
    SLOTS_SUP.some((s) => estado.suplentes[s].reemplaza);
}

// Cambiar de formación reinicia la distribución de los titulares, el capitán y los reemplazos;
// los suplentes elegidos se conservan.
export function cambiarFormacion(estado, formacion) {
  if (!esFormacion(formacion)) return false;
  estado.formacion = formacion;
  estado.titulares = {};
  estado.capitan = null;
  for (const s of SLOTS_SUP) estado.suplentes[s].reemplaza = null;
  return true;
}

// plantel: Map id → { activo }. Devuelve { ok, checks }.
export function validar(estado, plantel) {
  const tit = SLOTS_TIT.map((s) => estado.titulares[s] || null);
  const sup = SLOTS_SUP.map((s) => estado.suplentes[s].jugador || null);
  const todos = [...tit, ...sup].filter(Boolean);
  const checks = {
    formacion: esFormacion(estado.formacion),
    titulares: tit.filter(Boolean).length,
    suplentes: sup.filter(Boolean).length,
    reemplazos: SLOTS_SUP.filter((s) => estado.suplentes[s].jugador && SLOTS_TIT.includes(estado.suplentes[s].reemplaza)).length,
    sinRepetidos: new Set(todos).size === todos.length,
    capitan: !!estado.capitan && tit.includes(estado.capitan),
    disponibles: todos.every((id) => plantel.has(id) && plantel.get(id).activo === true),
  };
  const ok = checks.formacion && checks.titulares === 11 && checks.suplentes === 7 && checks.reemplazos === 7 &&
    checks.sinRepetidos && checks.capitan && checks.disponibles;
  return { ok, checks };
}

// Objeto que se guarda en Firebase (sin la fecha, que se agrega al guardar).
export function armarEquipoPlano(estado, nick) {
  const titulares = {};
  for (const s of SLOTS_TIT) titulares[s] = estado.titulares[s];
  const suplentes = {};
  for (const s of SLOTS_SUP) suplentes[s] = { jugador: estado.suplentes[s].jugador, reemplaza: estado.suplentes[s].reemplaza };
  return { nick, formacion: estado.formacion, capitan: estado.capitan, titulares, suplentes };
}

// ────────────────────────────────────────────────────────────
//  3. Lectura tolerante de datos (los datos de Firebase pueden venir rotos)
// ────────────────────────────────────────────────────────────

export function sanitizarPlantel(raw) {
  const lista = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return lista;
  for (const [id, v] of Object.entries(raw)) {
    if (!RE_ID.test(id) || !v || typeof v !== "object") continue;
    const nombre = typeof v.nombre === "string" ? v.nombre.trim().slice(0, 40) : "";
    if (!nombre) continue;
    lista.push({
      id,
      nombre,
      foto: typeof v.foto === "string" && RE_FOTO.test(v.foto) ? v.foto : null,
      activo: v.activo === true,
      orden: Number.isFinite(v.orden) ? v.orden : 9999,
    });
  }
  lista.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}

// Devuelve null si el dato no es un objeto; si no, un estado válido con lo que se pudo rescatar.
export function sanitizarEquipo(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const avisos = [];
  const estado = crearEstado(esFormacion(raw.formacion) ? raw.formacion : FORMACION_INICIAL);
  if (!esFormacion(raw.formacion)) avisos.push("formación inválida");
  const usados = new Set();
  const idOk = (id) => typeof id === "string" && RE_ID.test(id);
  const tit = raw.titulares && typeof raw.titulares === "object" ? raw.titulares : {};
  for (const slot of SLOTS_TIT) {
    const id = tit[slot];
    if (id === undefined) continue;
    if (!idOk(id)) { avisos.push(`titular ${slot} inválido`); continue; }
    if (usados.has(id)) { avisos.push(`integrante repetido: ${id}`); continue; }
    usados.add(id);
    estado.titulares[slot] = id;
  }
  const sup = raw.suplentes && typeof raw.suplentes === "object" ? raw.suplentes : {};
  for (const s of SLOTS_SUP) {
    const x = sup[s];
    if (x === undefined) continue;
    if (!x || typeof x !== "object" || !idOk(x.jugador)) { avisos.push(`suplente ${s} inválido`); continue; }
    if (usados.has(x.jugador)) { avisos.push(`integrante repetido: ${x.jugador}`); continue; }
    usados.add(x.jugador);
    estado.suplentes[s].jugador = x.jugador;
    estado.suplentes[s].reemplaza = SLOTS_TIT.includes(x.reemplaza) ? x.reemplaza : null;
  }
  if (idOk(raw.capitan) && Object.values(estado.titulares).includes(raw.capitan)) estado.capitan = raw.capitan;
  else if (raw.capitan !== undefined) avisos.push("capitán inválido");
  return {
    estado,
    avisos,
    nick: typeof raw.nick === "string" ? raw.nick.slice(0, 24) : "",
    actualizadoEn: Number.isFinite(raw.actualizadoEn) ? raw.actualizadoEn : null,
  };
}

// ────────────────────────────────────────────────────────────
//  4. Firebase
// ────────────────────────────────────────────────────────────

async function cargarPlantel() {
  const snap = await get(ref(db, "armaequipo/plantel"));
  return sanitizarPlantel(snap.val());
}

async function cargarMiEquipo(uid) {
  const snap = await get(ref(db, `armaequipo/equipos/${uid}`));
  return snap.exists() ? sanitizarEquipo(snap.val()) : null;
}

async function guardarMiEquipo(uid, nick, estado) {
  const equipo = { ...armarEquipoPlano(estado, nick), actualizadoEn: serverTimestamp() };
  await set(ref(db, `armaequipo/equipos/${uid}`), equipo);
}

// ────────────────────────────────────────────────────────────
//  5. Pantalla
// ────────────────────────────────────────────────────────────

const DEMO_PLANTEL = Array.from({ length: 22 }, (_, i) => ({
  id: "demo" + String(i + 1).padStart(2, "0"),
  nombre: "Integrante " + String(i + 1).padStart(2, "0"),
  foto: null,
  activo: true,
  orden: i + 1,
}));

const $ = (id) => document.getElementById(id);
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
const sinAcentos = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nombreCorto = (n) => { const p = String(n).split(" ")[0]; return p.length > 10 ? p.slice(0, 9) + "…" : p; };
function iniciales(nombre) {
  const p = String(nombre || "?").trim().split(/\s+/).filter(Boolean);
  return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

let demo = false;
let estado = crearEstado();
let indice = new Map();      // id → integrante del plantel (activos y desactivados)
let activos = [];            // integrantes activos, ordenados
const ctx = { uid: null, nick: "", existente: false };
const ui = { seleccion: null, busqueda: "", guardando: false, mensaje: null };

function infoJugador(id) {
  return indice.get(id) || { id, nombre: "No disponible", foto: null, activo: false, desconocido: true };
}

function crearAvatar(j, clase) {
  const cont = el("span", "ae-avatar" + (clase ? " " + clase : ""));
  cont.appendChild(el("span", "ae-avatar-ini", iniciales(j.nombre)));
  if (j.foto) {
    const img = el("img");
    img.alt = "";
    img.decoding = "async";
    img.src = j.foto;
    img.addEventListener("error", () => img.remove()); // si la foto falla se ven las iniciales
    cont.appendChild(img);
  }
  return cont;
}

const slotsActuales = () => construirSlots(estado.formacion);
const seleccionEs = (tipo, id) => !!ui.seleccion && ui.seleccion.tipo === tipo && ui.seleccion.id === id;

// ── Interacción ──
function clickJugador(pid) {
  const sel = ui.seleccion;
  if (sel && (sel.tipo === "slot" || sel.tipo === "sup")) {
    asignar(estado, sel, pid);
    ui.seleccion = null;
  } else if (sel && sel.tipo === "jugador" && sel.id === pid) {
    ui.seleccion = null;
  } else {
    ui.seleccion = { tipo: "jugador", id: pid };
  }
  ui.mensaje = null;
  render();
}

function clickPos(pos) {
  const sel = ui.seleccion;
  if (sel && sel.tipo === "jugador") {
    asignar(estado, pos, sel.id);
    ui.seleccion = null;
  } else if (sel && (sel.tipo === "slot" || sel.tipo === "sup")) {
    if (sel.tipo === pos.tipo && sel.id === pos.id) {
      ui.seleccion = null;
    } else {
      const pidSel = jugadorEn(estado, sel);
      if (pidSel) { asignar(estado, pos, pidSel); ui.seleccion = null; } // mover o intercambiar
      else ui.seleccion = { tipo: pos.tipo, id: pos.id };
    }
  } else {
    ui.seleccion = { tipo: pos.tipo, id: pos.id };
  }
  ui.mensaje = null;
  render();
}

function onCambiarFormacion(select) {
  const nueva = select.value;
  if (nueva === estado.formacion) return;
  if (hayDistribucion(estado)) {
    const ok = window.confirm(
      "Cambiar la formación reinicia la distribución de los titulares, el capitán y las posiciones que reemplazan los suplentes. ¿Continuar?"
    );
    if (!ok) { select.value = estado.formacion; return; }
  }
  cambiarFormacion(estado, nueva);
  ui.seleccion = null;
  ui.mensaje = null;
  render();
}

function onReiniciar() {
  const vacio = Object.keys(estado.titulares).length === 0 && !SLOTS_SUP.some((s) => estado.suplentes[s].jugador);
  if (!vacio && !window.confirm("Se va a vaciar todo el equipo (titulares, suplentes y capitán). ¿Continuar?")) return;
  estado = crearEstado(estado.formacion);
  ui.seleccion = null;
  ui.mensaje = null;
  render();
}

function mensajeError(e) {
  const t = String((e && (e.code || e.message)) || "");
  if (/PERMISSION_DENIED/i.test(t)) return "No se pudo guardar: sin permiso (o el juego todavía no está habilitado).";
  return "No se pudo guardar el equipo. Probá de nuevo en un momento.";
}

async function onGuardar() {
  const v = validar(estado, indice);
  if (!v.ok) { ui.mensaje = { tipo: "error", texto: "Todavía falta completar el equipo." }; renderProgreso(); return; }
  if (demo) { ui.mensaje = { tipo: "error", texto: "Modo demostración: el equipo no se guarda." }; renderProgreso(); return; }
  ui.guardando = true;
  ui.mensaje = null;
  renderProgreso();
  try {
    await guardarMiEquipo(ctx.uid, ctx.nick, estado);
    ctx.existente = true;
    ui.mensaje = { tipo: "ok", texto: "¡Equipo guardado!" };
  } catch (e) {
    ui.mensaje = { tipo: "error", texto: mensajeError(e) };
  } finally {
    ui.guardando = false;
    renderProgreso();
  }
}

// ── Render ──
function renderCancha() {
  const cont = $("ae-slots");
  cont.replaceChildren();
  for (const s of slotsActuales()) {
    const pid = estado.titulares[s.id] || null;
    const info = pid ? infoJugador(pid) : null;
    const b = el("button", "ae-slot");
    b.type = "button";
    b.style.left = s.x + "%";
    b.style.top = s.y + "%";
    b.dataset.slot = s.id;
    if (pid) b.classList.add("ocupado");
    if (info && (info.desconocido || !info.activo)) b.classList.add("invalido");
    if (pid && estado.capitan === pid) b.classList.add("capitan");
    const sel = seleccionEs("slot", s.id);
    if (sel) b.classList.add("seleccionado");
    b.setAttribute("aria-pressed", String(sel));
    b.setAttribute("aria-label", `${ROLES_NOMBRE[s.rol]} (${s.etiqueta}): ${info ? info.nombre : "vacío"}${pid && estado.capitan === pid ? ", capitán" : ""}`);
    b.title = info ? info.nombre : `${s.etiqueta} (vacío)`;
    const circulo = el("span", "ae-slot-circulo");
    circulo.appendChild(info ? crearAvatar(info) : el("span", "ae-slot-mas", "+"));
    b.appendChild(circulo);
    b.appendChild(el("span", "ae-slot-rol", s.rol));
    if (info) b.appendChild(el("span", "ae-slot-nombre", nombreCorto(info.nombre)));
    if (pid && estado.capitan === pid) b.appendChild(el("span", "ae-slot-cap", "C"));
    b.addEventListener("click", () => clickPos({ tipo: "slot", id: s.id }));
    cont.appendChild(b);
  }
}

function renderSuplentes() {
  const cont = $("ae-suplentes");
  cont.replaceChildren();
  const slots = slotsActuales();
  SLOTS_SUP.forEach((sid, i) => {
    const sup = estado.suplentes[sid];
    const info = sup.jugador ? infoJugador(sup.jugador) : null;
    const fila = el("div", "ae-sup-fila");
    const btn = el("button", "ae-sup-btn");
    btn.type = "button";
    btn.dataset.sup = sid;
    if (info) btn.classList.add("ocupado");
    if (info && (info.desconocido || !info.activo)) btn.classList.add("invalido");
    const sel = seleccionEs("sup", sid);
    if (sel) btn.classList.add("seleccionado");
    btn.setAttribute("aria-pressed", String(sel));
    btn.appendChild(info ? crearAvatar(info, "chico") : el("span", "ae-avatar chico vacio", "+"));
    const textos = el("span", "ae-sup-textos");
    textos.appendChild(el("span", "ae-sup-titulo", `Suplente ${i + 1}`));
    textos.appendChild(el("span", "ae-sup-nombre", info ? info.nombre : "Elegir suplente"));
    btn.appendChild(textos);
    btn.addEventListener("click", () => clickPos({ tipo: "sup", id: sid }));
    fila.appendChild(btn);

    const sel2 = el("select", "ae-sup-reemplaza");
    sel2.dataset.sup = sid;
    sel2.setAttribute("aria-label", `Posición que reemplaza el suplente ${i + 1}`);
    sel2.disabled = !info;
    sel2.appendChild(Object.assign(el("option", null, "¿A quién reemplaza?"), { value: "" }));
    for (const s of slots) {
      const j = estado.titulares[s.id] ? infoJugador(estado.titulares[s.id]).nombre : "vacío";
      const op = el("option", null, `${s.etiqueta} — ${j}`);
      op.value = s.id;
      sel2.appendChild(op);
    }
    sel2.value = sup.reemplaza || "";
    sel2.addEventListener("change", () => { setReemplaza(estado, sid, sel2.value); ui.mensaje = null; render(); });
    fila.appendChild(sel2);
    cont.appendChild(fila);
  });
}

function renderPlantel() {
  const cont = $("ae-plantel");
  cont.replaceChildren();
  const q = sinAcentos(ui.busqueda.trim());
  const lista = activos.filter((j) => !q || sinAcentos(j.nombre).includes(q));
  if (!activos.length) { cont.appendChild(el("p", "ae-vacio", "El plantel todavía no tiene integrantes activos.")); return; }
  if (!lista.length) { cont.appendChild(el("p", "ae-vacio", "No hay integrantes que coincidan con la búsqueda.")); return; }
  for (const j of lista) {
    const ub = ubicacionDe(estado, j.id);
    const b = el("button", "ae-card");
    b.type = "button";
    b.dataset.jugador = j.id;
    if (ub) b.classList.add("usado");
    const sel = seleccionEs("jugador", j.id);
    if (sel) b.classList.add("seleccionado");
    b.setAttribute("aria-pressed", String(sel));
    b.appendChild(crearAvatar(j));
    b.appendChild(el("span", "ae-card-nombre", j.nombre));
    if (ub) b.appendChild(el("span", "ae-card-tag", ub.tipo === "slot" ? "Titular" : "Suplente"));
    b.addEventListener("click", () => clickJugador(j.id));
    cont.appendChild(b);
  }
}

function boton(texto, clase, fn) {
  const b = el("button", "ae-btn " + (clase || ""), texto);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}

function renderAcciones() {
  const cont = $("ae-acciones");
  cont.replaceChildren();
  const sel = ui.seleccion;
  const cancelar = boton("Cancelar", "", () => { ui.seleccion = null; render(); });
  if (!sel) {
    cont.appendChild(el("p", "ae-ayuda", "Tocá un integrante del plantel y después una posición de la cancha o un suplente. También podés tocar primero la posición."));
    return;
  }
  if (sel.tipo === "jugador") {
    cont.appendChild(el("p", "ae-ayuda", `Elegiste a ${infoJugador(sel.id).nombre}. Tocá una posición de la cancha o un suplente para ubicarlo.`));
    cont.appendChild(cancelar);
    return;
  }
  const pid = jugadorEn(estado, sel);
  if (!pid) {
    cont.appendChild(el("p", "ae-ayuda", "Posición vacía. Tocá un integrante del plantel para ubicarlo acá."));
    cont.appendChild(cancelar);
    return;
  }
  cont.appendChild(el("p", "ae-ayuda", infoJugador(pid).nombre));
  if (sel.tipo === "slot") {
    const esCap = estado.capitan === pid;
    cont.appendChild(boton(esCap ? "Quitar capitanía" : "👑 Hacer capitán", "", () => { alternarCapitan(estado, sel.id); render(); }));
  }
  cont.appendChild(boton("Quitar del equipo", "", () => { quitar(estado, sel); ui.seleccion = null; render(); }));
  cont.appendChild(cancelar);
}

function renderProgreso() {
  const v = validar(estado, indice);
  const c = v.checks;
  const chips = $("ae-progreso");
  chips.replaceChildren();
  const chip = (txt, ok) => { const e = el("span", "ae-chip" + (ok ? " ok" : ""), txt); chips.appendChild(e); };
  chip(`Titulares ${c.titulares}/11`, c.titulares === 11);
  chip(`Suplentes ${c.suplentes}/7`, c.suplentes === 7);
  chip(`Reemplazos ${c.reemplazos}/7`, c.reemplazos === 7);
  chip(c.capitan ? "Capitán ✓" : "Capitán —", c.capitan);

  const lista = $("ae-checks");
  lista.replaceChildren();
  const item = (txt, ok) => lista.appendChild(el("li", "ae-check" + (ok ? " ok" : ""), (ok ? "✓ " : "○ ") + txt));
  item("Formación elegida", c.formacion);
  item(`11 titulares (${c.titulares}/11)`, c.titulares === 11);
  item(`7 suplentes (${c.suplentes}/7)`, c.suplentes === 7);
  item(`Cada suplente tiene la posición que reemplaza (${c.reemplazos}/7)`, c.reemplazos === 7);
  item("Capitán elegido entre los titulares", c.capitan);
  item("Ningún integrante repetido", c.sinRepetidos);
  item("Todos los integrantes están disponibles", c.disponibles);

  const btn = $("ae-guardar");
  btn.disabled = !v.ok || ui.guardando;
  btn.textContent = ui.guardando ? "Guardando…" : (ctx.existente ? "Guardar cambios" : "Guardar equipo");

  const msg = $("ae-msg");
  msg.className = "ae-msg" + (ui.mensaje ? " " + ui.mensaje.tipo : "");
  msg.textContent = ui.mensaje ? ui.mensaje.texto : "";
}

function render() {
  $("ae-formacion").value = estado.formacion;
  renderCancha();
  renderSuplentes();
  renderPlantel();
  renderAcciones();
  renderProgreso();
}

function mostrarEstado(texto, esError) {
  const e = $("ae-estado");
  e.textContent = texto;
  e.classList.toggle("error", !!esError);
  e.classList.remove("hidden");
  $("ae-app").classList.add("hidden");
}

async function iniciar(user, data) {
  ctx.uid = user.uid;
  ctx.nick = data.nick;
  demo = new URLSearchParams(window.location.search).get("demo") === "1";

  let lista;
  let miEquipo = null;
  if (demo) {
    lista = DEMO_PLANTEL;
  } else {
    try {
      lista = await cargarPlantel();
      miEquipo = await cargarMiEquipo(user.uid);
    } catch (e) {
      const permiso = /PERMISSION_DENIED/i.test(String((e && (e.code || e.message)) || ""));
      mostrarEstado(permiso ? "Este juego todavía no está habilitado. Volvé a probar más tarde." : "No se pudo cargar el juego. Probá de nuevo en un momento.", true);
      return;
    }
  }

  indice = new Map(lista.map((j) => [j.id, j]));
  activos = lista.filter((j) => j.activo);

  if (miEquipo) {
    estado = miEquipo.estado;
    ctx.existente = true;
    if (miEquipo.avisos.length) ui.mensaje = { tipo: "error", texto: "Tu equipo guardado tenía datos inválidos; revisalo y guardalo de nuevo." };
  }

  $("ae-subtitulo").textContent = demo ? "Modo demostración: nada se guarda" : "Elegí la formación y armá tu once ideal";
  const select = $("ae-formacion");
  for (const f of Object.keys(FORMACIONES)) {
    const op = el("option", null, f);
    op.value = f;
    select.appendChild(op);
  }
  select.addEventListener("change", () => onCambiarFormacion(select));
  $("ae-reiniciar").addEventListener("click", onReiniciar);
  $("ae-guardar").addEventListener("click", onGuardar);
  $("ae-buscar").addEventListener("input", (e) => { ui.busqueda = e.target.value; renderPlantel(); });

  $("ae-estado").classList.add("hidden");
  $("ae-app").classList.remove("hidden");
  render();
}

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
    await iniciar(user, data);
  });
}

if (typeof document !== "undefined" && document.getElementById("ae-app")) arrancar();
