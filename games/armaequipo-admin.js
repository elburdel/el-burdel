// ============================================================
//  Armá tu equipo — administración del plantel
//  Archivo: games/armaequipo-admin.js   (lo usa admin-armaequipo.html)
// ============================================================
//  - Alta y edición de integrantes (nombre, orden, foto).
//  - Las fotos se suben desde esta pantalla: el navegador las recorta a un cuadrado de
//    160 px y las comprime a JPEG (unos pocos KB); se guardan junto al integrante en
//    armaequipo/plantel/{id}/foto como imagen en base64. No usa Apps Script ni Storage.
//  - Los integrantes NUNCA se borran: solo se desactivan o se reactivan, para conservar
//    el historial de los equipos ya guardados.
//  - Todo se guarda reemplazando el integrante completo (set), nunca con cambios parciales.
// ============================================================

import { auth, db } from "../js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const ADMIN_UID = "rRE0YhtRhqNvGWGFDkcbhNIwvOz1";
const LADO_FOTO = 160;
export const MAX_FOTO_CHARS = 40000;
const MINIMO_PARA_ARMAR = 18; // 11 titulares + 7 suplentes
const RE_ID = /^[a-z0-9_]{1,30}$/;
const RE_FOTO_RUTA = /^assets\/img\/plantel\/[a-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$/;
const RE_FOTO_DATA = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const RE_NOMBRE_PROHIBIDO = /[<>"\\/]/;

// ────────────────────────────────────────────────────────────
//  Lógica pura
// ────────────────────────────────────────────────────────────

export function fotoValida(f) {
  return typeof f === "string" && (RE_FOTO_RUTA.test(f) || (f.length <= MAX_FOTO_CHARS && RE_FOTO_DATA.test(f)));
}

// Prueba calidades decrecientes hasta que la imagen entre en el tope; lanza error si no entra.
export function ajustarCalidad(generar, maxChars = MAX_FOTO_CHARS) {
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    const url = generar(q);
    if (typeof url === "string" && url.startsWith("data:image/jpeg;base64,") && url.length <= maxChars) return url;
  }
  throw new Error("La foto es demasiado pesada incluso comprimida. Probá con otra.");
}

export function nuevoId() {
  const g = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(2)) : null;
  const azar = g ? (g[0].toString(36) + g[1].toString(36)).slice(0, 6) : Math.random().toString(36).slice(2, 8);
  return ("m" + Date.now().toString(36) + azar).slice(0, 30);
}

// Devuelve un texto de error o null si el formulario es válido.
export function validarFormulario({ nombre, orden }) {
  const n = String(nombre || "").trim();
  if (n.length < 1) return "Falta el nombre.";
  if (n.length > 40) return "El nombre puede tener hasta 40 caracteres.";
  if (RE_NOMBRE_PROHIBIDO.test(n)) return "El nombre no puede tener los caracteres < > \" \\ /";
  if (!Number.isFinite(orden)) return "El orden debe ser un número.";
  return null;
}

// Objeto completo que se guarda en Firebase (la foto es opcional).
export function armarIntegrante({ nombre, orden, activo, foto }) {
  const o = { nombre: String(nombre).trim(), activo: !!activo, orden: Number(orden) };
  if (fotoValida(foto)) o.foto = foto;
  return o;
}

export function leerPlantel(raw) {
  const lista = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return lista;
  for (const [id, v] of Object.entries(raw)) {
    if (!RE_ID.test(id) || !v || typeof v !== "object") continue;
    const nombre = typeof v.nombre === "string" ? v.nombre.trim().slice(0, 40) : "";
    if (!nombre) continue;
    lista.push({ id, nombre, foto: fotoValida(v.foto) ? v.foto : null, activo: v.activo === true, orden: Number.isFinite(v.orden) ? v.orden : 9999 });
  }
  lista.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}

// Recorta al cuadrado central, reduce a 160 px y comprime a JPEG. Devuelve un data URL.
export async function fotoDesdeArchivo(file) {
  if (!file || !String(file.type).startsWith("image/")) throw new Error("El archivo no es una imagen.");
  if (file.size > 20 * 1024 * 1024) throw new Error("La imagen es demasiado grande (máximo 20 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado) throw new Error("No se pudo leer la imagen.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = LADO_FOTO;
    const g = canvas.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, LADO_FOTO, LADO_FOTO);
    g.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO_FOTO, LADO_FOTO);
    return ajustarCalidad((q) => canvas.toDataURL("image/jpeg", q));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ────────────────────────────────────────────────────────────
//  Pantalla
// ────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
const iniciales = (n) => { const p = String(n).trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

let plantel = [];
const form = { editando: null, foto: null, fotoCambiada: false };

function avatar(j, clase) {
  const a = el("span", "aea-avatar" + (clase ? " " + clase : ""));
  a.appendChild(el("span", "aea-avatar-ini", iniciales(j.nombre)));
  if (j.foto) {
    const img = el("img");
    img.alt = "";
    img.src = j.foto;
    img.addEventListener("error", () => img.remove());
    a.appendChild(img);
  }
  return a;
}

function mensaje(texto, tipo) {
  const m = $("aea-msg");
  m.textContent = texto || "";
  m.className = "aea-msg" + (tipo ? " " + tipo : "");
}
function textoError(e) {
  const t = String((e && (e.code || e.message)) || "");
  if (/PERMISSION_DENIED/i.test(t)) return "Sin permiso para guardar. ¿Ya están publicadas las reglas de «armaequipo»?";
  return "No se pudo guardar. Probá de nuevo en un momento.";
}

function renderResumen() {
  const act = plantel.filter((j) => j.activo).length;
  const r = $("aea-resumen");
  r.textContent = `Activos: ${act} · Desactivados: ${plantel.length - act}. Para armar un equipo hacen falta al menos ${MINIMO_PARA_ARMAR} activos (11 titulares + 7 suplentes).`;
  r.classList.toggle("aviso", act < MINIMO_PARA_ARMAR);
}

function renderLista() {
  const cont = $("aea-lista");
  cont.replaceChildren();
  if (!plantel.length) { cont.appendChild(el("p", "aea-vacio", "Todavía no hay integrantes. Agregá el primero con el formulario.")); return; }
  for (const j of plantel) {
    const fila = el("div", "aea-fila" + (j.activo ? "" : " inactivo"));
    fila.dataset.id = j.id;
    fila.appendChild(avatar(j));
    const datos = el("div", "aea-datos");
    datos.appendChild(el("div", "aea-nombre", j.nombre));
    datos.appendChild(el("div", "aea-sub", `Orden ${j.orden} · ${j.activo ? "Activo" : "Desactivado"}`));
    fila.appendChild(datos);
    const acciones = el("div", "aea-acciones");
    const bEditar = el("button", "aea-btn", "Editar");
    bEditar.type = "button";
    bEditar.addEventListener("click", () => editar(j.id));
    const bEstado = el("button", "aea-btn", j.activo ? "Desactivar" : "Reactivar");
    bEstado.type = "button";
    bEstado.addEventListener("click", () => cambiarEstado(j.id));
    acciones.appendChild(bEditar);
    acciones.appendChild(bEstado);
    fila.appendChild(acciones);
    cont.appendChild(fila);
  }
}

function renderPrevia() {
  const p = $("aea-previa");
  p.replaceChildren();
  const nombre = $("aea-nombre").value || "?";
  p.appendChild(avatar({ nombre, foto: form.foto }, "grande"));
}

function limpiarForm() {
  form.editando = null;
  form.foto = null;
  form.fotoCambiada = false;
  $("aea-nombre").value = "";
  $("aea-orden").value = String(plantel.reduce((m, j) => Math.max(m, j.orden === 9999 ? 0 : j.orden), 0) + 1);
  $("aea-archivo").value = "";
  $("aea-form-titulo").textContent = "Agregar integrante";
  $("aea-guardar").textContent = "Agregar";
  $("aea-cancelar").classList.add("hidden");
  renderPrevia();
}

function editar(id) {
  const j = plantel.find((x) => x.id === id);
  if (!j) return;
  form.editando = id;
  form.foto = j.foto;
  form.fotoCambiada = false;
  $("aea-nombre").value = j.nombre;
  $("aea-orden").value = String(j.orden);
  $("aea-archivo").value = "";
  $("aea-form-titulo").textContent = `Editar: ${j.nombre}`;
  $("aea-guardar").textContent = "Guardar cambios";
  $("aea-cancelar").classList.remove("hidden");
  mensaje("");
  renderPrevia();
  $("aea-form").scrollIntoView?.({ behavior: "smooth", block: "start" });
}

async function recargar() {
  const snap = await get(ref(db, "armaequipo/plantel"));
  plantel = leerPlantel(snap.val());
  renderResumen();
  renderLista();
}

async function onArchivo(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  mensaje("Procesando la foto...");
  try {
    form.foto = await fotoDesdeArchivo(file);
    form.fotoCambiada = true;
    mensaje("");
  } catch (err) {
    form.foto = null;
    $("aea-archivo").value = "";
    mensaje(err.message || "No se pudo procesar la foto.", "error");
  }
  renderPrevia();
}

async function onGuardar() {
  const nombre = $("aea-nombre").value;
  const ordenTxt = $("aea-orden").value.trim();
  const orden = ordenTxt === "" ? NaN : Number(ordenTxt); // Number("") daría 0: un orden vacío debe rechazarse
  const error = validarFormulario({ nombre, orden });
  if (error) { mensaje(error, "error"); return; }
  const previo = form.editando ? plantel.find((x) => x.id === form.editando) : null;
  let id = form.editando || nuevoId();
  if (!form.editando) while (plantel.some((x) => x.id === id)) id = nuevoId(); // nunca pisar a un integrante existente
  const obj = armarIntegrante({ nombre, orden, activo: previo ? previo.activo : true, foto: form.foto });
  $("aea-guardar").disabled = true;
  try {
    await set(ref(db, `armaequipo/plantel/${id}`), obj);
    mensaje(previo ? "Cambios guardados." : "Integrante agregado.", "ok");
    await recargar();
    limpiarForm();
  } catch (e) {
    mensaje(textoError(e), "error");
  } finally {
    $("aea-guardar").disabled = false;
  }
}

async function cambiarEstado(id) {
  const j = plantel.find((x) => x.id === id);
  if (!j) return;
  if (j.activo && !window.confirm(`¿Desactivar a ${j.nombre}? Deja de poder elegirse en equipos nuevos; los equipos ya guardados no se tocan.`)) return;
  try {
    await set(ref(db, `armaequipo/plantel/${id}`), armarIntegrante({ nombre: j.nombre, orden: j.orden, activo: !j.activo, foto: j.foto }));
    mensaje(j.activo ? `${j.nombre} desactivado.` : `${j.nombre} reactivado.`, "ok");
    await recargar();
  } catch (e) {
    mensaje(textoError(e), "error");
  }
}

async function iniciar() {
  try {
    await recargar();
  } catch (e) {
    mensaje(/PERMISSION_DENIED/i.test(String((e && (e.code || e.message)) || "")) ? "Sin permiso para leer el plantel. ¿Ya están publicadas las reglas de «armaequipo»?" : "No se pudo cargar el plantel.", "error");
  }
  $("aea-nombre").addEventListener("input", renderPrevia);
  $("aea-archivo").addEventListener("change", onArchivo);
  $("aea-guardar").addEventListener("click", onGuardar);
  $("aea-cancelar").addEventListener("click", () => { limpiarForm(); mensaje(""); });
  limpiarForm();
}

function arrancar() {
  let iniciado = false;
  onAuthStateChanged(auth, (user) => {
    if (!user || user.uid !== ADMIN_UID) { window.location.href = "/login.html"; return; }
    if (iniciado) return;
    iniciado = true;
    iniciar();
  });
}

if (typeof document !== "undefined" && document.getElementById("aea-lista")) arrancar();
