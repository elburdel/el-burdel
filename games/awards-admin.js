// ============================================================
//  BURDEL AWARDS 2026 — administración (etapa 2: configuración)
//  Archivo: games/awards-admin.js   (lo usa admin-awards.html)
// ============================================================
//  - Personas nominadas: nombre, fotografía subida a mano y vínculo opcional con un usuario.
//    Se guardan en awards/personas/{id}. Pueden NO tener cuenta en El Burdel.
//  - Categorías (normales y la especial «Burdel de Oro») en awards/admin/categorias/{id},
//    con sus nominados ordenados. Una persona puede estar en varias categorías.
//  - Solo se edita mientras la etapa es «Configuración». Las etapas (abrir/cerrar votaciones)
//    se controlan en las etapas siguientes.
//  - Del perfil de usuario solo se usan uid y nick; nunca el email.
// ============================================================

import { auth, db } from "../js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, get, set, update, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  ADMIN_UID, FASES_ETIQUETA, leerFase, estructuraEditable, nuevoId, validarPersona, validarCategoria,
  leerPersonas, leerCategorias, proximoOrden, moverNominado, avisosConfiguracion, fotoDesdeArchivo,
  leerPlantel, yaCargada, fotoDesdePlantel,
  categoriasPublicables, validarApertura, armarApertura, contarVotos, armarRanking, sugerirFinalistas,
  hayEmpateEnCorte, armarFinalistas,
  armarNominados,
  oroEditable, personasEditable, leerFinalistas, categoriasRonda2, validarApertura2, armarApertura2, ordenarRonda2, contarParticipacion,
} from "./awards-datos.js";

const $ = (id) => document.getElementById(id);
function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
const iniciales = (n) => { const p = String(n).trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

let fase = "configuracion";
let personas = [];
let categorias = [];
let usuarios = []; // [{uid, nick}]
const formP = { editando: null, foto: null, fotoCambiada: false };
const formC = { editando: null };

const editable = () => estructuraEditable(fase);          // categorías y nominados de la 1ª votación
const personasOk = () => personasEditable(fase);           // alta/edición de personas
const oroOk = () => oroEditable(fase);                     // nominados de Burdel de Oro
const puedeNominar = (c) => (c.tipo === "oro" ? oroOk() : editable());
const personaPorId = (id) => personas.find((p) => p.id === id) || null;
const nickDe = (uid) => (usuarios.find((u) => u.uid === uid) || {}).nick || null;

function mensaje(donde, texto, tipo) {
  const m = $(donde);
  m.textContent = texto || "";
  m.className = "aw-msg" + (tipo ? " " + tipo : "");
}

function avatar(nombre, foto, clase) {
  const a = el("span", "aw-avatar" + (clase ? " " + clase : ""));
  a.appendChild(el("span", "aw-avatar-ini", iniciales(nombre)));
  if (foto) {
    const img = document.createElement("img");
    img.alt = "";
    img.src = foto;
    a.appendChild(img);
  }
  return a;
}

// ────────────────────────────────────────────────────────────
//  Carga de datos
// ────────────────────────────────────────────────────────────
async function cargarTodo() {
  const [fSnap, pSnap, cSnap] = await Promise.all([
    get(ref(db, "awards/estado")),
    get(ref(db, "awards/personas")),
    get(ref(db, "awards/admin/categorias")),
  ]);
  fase = leerFase(fSnap.val());
  personas = leerPersonas(pSnap.val());
  categorias = leerCategorias(cSnap.val());
}

async function cargarUsuarios() {
  try {
    const snap = await get(ref(db, "users"));
    const raw = snap.val() || {};
    usuarios = Object.entries(raw)
      .filter(([, u]) => u && typeof u.nick === "string")
      .map(([uid, u]) => ({ uid, nick: u.nick }))
      .sort((a, b) => a.nick.localeCompare(b.nick, "es"));
  } catch (e) {
    usuarios = []; // el vínculo con usuarios es opcional: si falla, se sigue sin él
  }
  const sel = $("aw-p-uid");
  sel.textContent = "";
  const o0 = el("option", "", "— Sin cuenta / sin vincular —");
  o0.value = "";
  sel.appendChild(o0);
  for (const u of usuarios) {
    const o = el("option", "", u.nick);
    o.value = u.uid;
    sel.appendChild(o);
  }
}

// ────────────────────────────────────────────────────────────
//  Encabezado: etapa y avisos
// ────────────────────────────────────────────────────────────
function renderEstado() {
  $("aw-fase").textContent = FASES_ETIQUETA[fase];
  renderEtapa();
  const bloqueado = !editable();
  const bloqueoTotal = bloqueado && !oroOk();
  const bq = $("aw-bloqueo");
  bq.classList.toggle("hidden", !bloqueado);
  bq.textContent = bloqueoTotal
    ? "La configuración está bloqueada porque la etapa ya no es «Configuración»."
    : "Las categorías y los nominados de la primera votación están bloqueados. Todavía podés cargar personas y armar los nominados de Burdel de Oro.";
  const avisos = avisosConfiguracion(categorias, personas);
  const cont = $("aw-avisos");
  cont.textContent = "";
  cont.classList.toggle("hidden", !avisos.length || bloqueado);
  for (const a of avisos) cont.appendChild(el("li", "", a));
  $("aw-resumen").textContent = `${categorias.length} categoría(s) · ${personas.length} persona(s) cargadas.`;
  $("aw-c-form").classList.toggle("aw-bloqueada", bloqueado);
  $("aw-p-form").classList.toggle("aw-bloqueada", !personasOk());
  for (const id of ["aw-c-nombre", "aw-c-orden", "aw-c-tipo", "aw-c-guardar"]) $(id).disabled = bloqueado;
  for (const id of ["aw-i-abrir", "aw-i-importar", "aw-i-marcar", "aw-p-nombre", "aw-p-uid", "aw-p-archivo", "aw-p-guardar", "aw-p-quitar-foto"]) $(id).disabled = !personasOk();
}

// ────────────────────────────────────────────────────────────
//  Personas
// ────────────────────────────────────────────────────────────
function categoriasDe(pid) {
  return categorias.filter((c) => c.nominados.some((n) => n.pid === pid));
}

function renderFormPersona() {
  const prev = $("aw-p-previa");
  prev.textContent = "";
  prev.appendChild(avatar($("aw-p-nombre").value || "?", formP.foto, "grande"));
  $("aw-p-form-titulo").textContent = formP.editando ? "Editar persona" : "Agregar persona";
  $("aw-p-guardar").textContent = formP.editando ? "Guardar cambios" : "Agregar";
  $("aw-p-cancelar").classList.toggle("hidden", !formP.editando);
  $("aw-p-quitar-foto").classList.toggle("hidden", !formP.foto);
}

function limpiarFormPersona() {
  formP.editando = null;
  formP.foto = null;
  formP.fotoCambiada = false;
  $("aw-p-nombre").value = "";
  $("aw-p-uid").value = "";
  $("aw-p-archivo").value = "";
  renderFormPersona();
}

function renderPersonas() {
  const cont = $("aw-p-lista");
  cont.textContent = "";
  const q = $("aw-p-buscar").value.trim().toLowerCase();
  const lista = personas.filter((p) => !q || p.nombre.toLowerCase().includes(q));
  if (!lista.length) {
    cont.appendChild(el("p", "aw-vacio", personas.length ? "Ninguna persona coincide con la búsqueda." : "Todavía no hay personas. Agregá la primera con el formulario."));
    return;
  }
  for (const p of lista) {
    const fila = el("div", "aw-fila");
    fila.appendChild(avatar(p.nombre, p.foto));
    const datos = el("div", "aw-datos");
    datos.appendChild(el("div", "aw-nombre", p.nombre));
    const cats = categoriasDe(p.id).map((c) => c.nombre);
    const partes = [cats.length ? `En: ${cats.join(", ")}` : "Sin categorías"];
    if (p.uid) partes.push(`Usuario: ${nickDe(p.uid) || "(no encontrado)"}`);
    if (!p.foto) partes.push("Sin foto");
    datos.appendChild(el("div", "aw-sub", partes.join(" · ")));
    fila.appendChild(datos);
    const acc = el("div", "aw-acciones");
    const be = el("button", "aw-btn", "Editar");
    be.type = "button";
    be.disabled = !personasOk();
    be.addEventListener("click", () => editarPersona(p.id));
    const bd = el("button", "aw-btn aw-btn-peligro", "Eliminar");
    bd.type = "button";
    bd.disabled = !personasOk();
    bd.addEventListener("click", () => eliminarPersona(p.id));
    acc.append(be, bd);
    fila.appendChild(acc);
    cont.appendChild(fila);
  }
}

function editarPersona(id) {
  const p = personaPorId(id);
  if (!p) return;
  formP.editando = id;
  formP.foto = p.foto;
  formP.fotoCambiada = false;
  $("aw-p-nombre").value = p.nombre;
  $("aw-p-uid").value = p.uid && usuarios.some((u) => u.uid === p.uid) ? p.uid : "";
  $("aw-p-archivo").value = "";
  renderFormPersona();
  mensaje("aw-p-msg", "");
  $("aw-p-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function onArchivoPersona(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  mensaje("aw-p-msg", "Procesando la foto...");
  try {
    formP.foto = await fotoDesdeArchivo(file);
    formP.fotoCambiada = true;
    mensaje("aw-p-msg", "Foto lista. Falta guardar.", "ok");
  } catch (err) {
    ev.target.value = "";
    mensaje("aw-p-msg", err.message || "No se pudo procesar la foto.", "error");
  }
  renderFormPersona();
}

function quitarFoto() {
  formP.foto = null;
  formP.fotoCambiada = true;
  $("aw-p-archivo").value = "";
  renderFormPersona();
}

async function guardarPersona() {
  if (!personasOk()) return;
  const nombre = $("aw-p-nombre").value;
  const err = validarPersona({ nombre });
  if (err) { mensaje("aw-p-msg", err, "error"); return; }
  const id = formP.editando || nuevoId("p");
  const cambios = { nombre: nombre.trim(), uid: $("aw-p-uid").value || null };
  if (!formP.editando || formP.fotoCambiada) cambios.foto = formP.foto || null;
  $("aw-p-guardar").disabled = true;
  try {
    await update(ref(db, `awards/personas/${id}`), cambios);
    await cargarTodo();
    limpiarFormPersona();
    renderTodo();
    mensaje("aw-p-msg", "Guardado.", "ok");
  } catch (e) {
    mensaje("aw-p-msg", errorLegible(e), "error");
  } finally {
    $("aw-p-guardar").disabled = !personasOk();
  }
}

async function eliminarPersona(id) {
  if (!personasOk()) return;
  const p = personaPorId(id);
  if (!p) return;
  const cats = categoriasDe(id);
  // Después de abrir la primera votación, quien está nominado en una categoría normal no se puede borrar.
  if (!editable() && cats.some((c) => c.tipo === "normal")) {
    mensaje("aw-p-msg", `«${p.nombre}» figura en la primera votación y no se puede eliminar en esta etapa.`, "error");
    return;
  }
  const aviso = cats.length ? `\n\nTambién se quitará de: ${cats.map((c) => c.nombre).join(", ")}.` : "";
  if (!window.confirm(`¿Eliminar a «${p.nombre}»?${aviso}`)) return;
  const cambios = { [`awards/personas/${id}`]: null };
  for (const c of cats) cambios[`awards/admin/categorias/${c.id}/nominados/${id}`] = null;
  try {
    await update(ref(db), cambios);
    await cargarTodo();
    if (formP.editando === id) limpiarFormPersona();
    renderTodo();
    mensaje("aw-p-msg", "Persona eliminada.", "ok");
  } catch (e) {
    mensaje("aw-p-msg", errorLegible(e), "error");
  }
}

// ────────────────────────────────────────────────────────────
//  Importar desde «Armá tu equipo»
// ────────────────────────────────────────────────────────────
let plantel = null;           // null = todavía no se cargó
const marcados = new Set();   // ids del plantel tildados

async function abrirPlantel() {
  mensaje("aw-i-msg", "Cargando el plantel...");
  try {
    const snap = await get(ref(db, "armaequipo/plantel"));
    plantel = leerPlantel(snap.val());
    marcados.clear();
    $("aw-i-panel").classList.remove("hidden");
    $("aw-i-abrir").textContent = "Actualizar plantel";
    mensaje("aw-i-msg", plantel.length ? "" : "El plantel de Armá tu equipo está vacío.");
    renderPlantel();
  } catch (e) {
    mensaje("aw-i-msg", /PERMISSION_DENIED/i.test(String((e && (e.code || e.message)) || "")) ? "Sin permiso para leer el plantel de Armá tu equipo." : "No se pudo cargar el plantel.", "error");
  }
}

function renderPlantel() {
  const cont = $("aw-i-grid");
  cont.textContent = "";
  if (!plantel) return;
  const q = $("aw-i-buscar").value.trim().toLowerCase();
  for (const j of plantel.filter((x) => !q || x.nombre.toLowerCase().includes(q))) {
    const ya = yaCargada(j.nombre, personas);
    const item = el("label", "aw-i-item" + (ya ? " ya" : ""));
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.disabled = ya || !personasOk();
    cb.checked = !ya && marcados.has(j.id);
    cb.addEventListener("change", () => { if (cb.checked) marcados.add(j.id); else marcados.delete(j.id); actualizarBotonImportar(); });
    item.appendChild(cb);
    item.appendChild(avatar(j.nombre, j.foto));
    const t = el("div", "aw-i-txt", j.nombre);
    const notas = [];
    if (ya) notas.push("Ya cargada");
    if (!j.foto) notas.push("Sin foto");
    if (!j.activo) notas.push("Desactivada");
    if (notas.length) t.appendChild(el("small", "", notas.join(" · ")));
    item.appendChild(t);
    cont.appendChild(item);
  }
  actualizarBotonImportar();
}

function actualizarBotonImportar() {
  const n = [...marcados].filter((id) => plantel && plantel.some((j) => j.id === id && !yaCargada(j.nombre, personas))).length;
  $("aw-i-importar").textContent = n ? `Importar seleccionados (${n})` : "Importar seleccionados";
  $("aw-i-importar").disabled = !personasOk() || !n;
}

function marcarFaltantes() {
  if (!plantel) return;
  for (const j of plantel) if (!yaCargada(j.nombre, personas)) marcados.add(j.id);
  renderPlantel();
}

async function importarSeleccionados() {
  if (!personasOk() || !plantel) return;
  const lista = plantel.filter((j) => marcados.has(j.id) && !yaCargada(j.nombre, personas));
  if (!lista.length) return;
  $("aw-i-importar").disabled = true;
  let sinFoto = 0, hechas = 0;
  try {
    for (let i = 0; i < lista.length; i += 10) {
      const lote = lista.slice(i, i + 10);
      const cambios = {};
      for (const j of lote) {
        mensaje("aw-i-msg", `Importando ${hechas + 1} de ${lista.length}...`);
        const obj = { nombre: j.nombre };
        if (j.foto) {
          try { obj.foto = await fotoDesdePlantel(j.foto); } catch (e) { sinFoto++; }
        } else sinFoto++;
        cambios[`awards/personas/${nuevoId("p")}`] = obj;
        hechas++;
      }
      await update(ref(db), cambios);
    }
    await cargarTodo();
    marcados.clear();
    renderTodo();
    renderPlantel();
    mensaje("aw-i-msg", `Se importaron ${hechas} persona(s).` + (sinFoto ? ` ${sinFoto} quedaron sin foto: podés subirla desde «Editar».` : ""), "ok");
  } catch (e) {
    await cargarTodo().catch(() => {});
    renderTodo();
    renderPlantel();
    mensaje("aw-i-msg", errorLegible(e), "error");
  }
}

// ────────────────────────────────────────────────────────────
//  Categorías y nominados
// ────────────────────────────────────────────────────────────
function renderFormCategoria() {
  $("aw-c-form-titulo").textContent = formC.editando ? "Editar categoría" : "Agregar categoría";
  $("aw-c-guardar").textContent = formC.editando ? "Guardar cambios" : "Agregar";
  $("aw-c-cancelar").classList.toggle("hidden", !formC.editando);
}

function limpiarFormCategoria() {
  formC.editando = null;
  $("aw-c-nombre").value = "";
  $("aw-c-tipo").value = "normal";
  $("aw-c-orden").value = String(proximoOrden(categorias));
  renderFormCategoria();
}

function editarCategoria(id) {
  const c = categorias.find((x) => x.id === id);
  if (!c) return;
  formC.editando = id;
  $("aw-c-nombre").value = c.nombre;
  $("aw-c-tipo").value = c.tipo;
  $("aw-c-orden").value = String(c.orden === 9999 ? "" : c.orden);
  renderFormCategoria();
  mensaje("aw-c-msg", "");
  $("aw-c-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function guardarCategoria() {
  if (!editable()) return;
  const datos = { nombre: $("aw-c-nombre").value.trim(), orden: Number($("aw-c-orden").value), tipo: $("aw-c-tipo").value };
  if ($("aw-c-orden").value.trim() === "") datos.orden = NaN;
  const err = validarCategoria(datos, categorias, formC.editando);
  if (err) { mensaje("aw-c-msg", err, "error"); return; }
  const id = formC.editando || nuevoId("c");
  $("aw-c-guardar").disabled = true;
  try {
    if (formC.editando) await update(ref(db, `awards/admin/categorias/${id}`), datos); // no toca los nominados
    else await set(ref(db, `awards/admin/categorias/${id}`), datos);
    await cargarTodo();
    limpiarFormCategoria();
    renderTodo();
    mensaje("aw-c-msg", "Guardado.", "ok");
  } catch (e) {
    mensaje("aw-c-msg", errorLegible(e), "error");
  } finally {
    $("aw-c-guardar").disabled = !editable();
  }
}

async function eliminarCategoria(id) {
  if (!editable()) return;
  const c = categorias.find((x) => x.id === id);
  if (!c) return;
  if (!window.confirm(`¿Eliminar la categoría «${c.nombre}» y su lista de nominados? Las personas no se borran.`)) return;
  try {
    await remove(ref(db, `awards/admin/categorias/${id}`));
    await cargarTodo();
    if (formC.editando === id) limpiarFormCategoria();
    renderTodo();
    mensaje("aw-c-msg", "Categoría eliminada.", "ok");
  } catch (e) {
    mensaje("aw-c-msg", errorLegible(e), "error");
  }
}

async function agregarNominado(cid, pid) {
  const c = categorias.find((x) => x.id === cid);
  if (!c || !puedeNominar(c) || !pid || c.nominados.some((n) => n.pid === pid)) return;
  try {
    await set(ref(db, `awards/admin/categorias/${cid}/nominados/${pid}`), { orden: proximoOrden(c.nominados) });
    await cargarTodo();
    renderTodo();
  } catch (e) {
    mensaje("aw-c-msg", errorLegible(e), "error");
  }
}

async function quitarNominado(cid, pid) {
  const c0 = categorias.find((x) => x.id === cid);
  if (!c0 || !puedeNominar(c0)) return;
  try {
    await remove(ref(db, `awards/admin/categorias/${cid}/nominados/${pid}`));
    await cargarTodo();
    renderTodo();
  } catch (e) {
    mensaje("aw-c-msg", errorLegible(e), "error");
  }
}

async function mover(cid, pid, delta) {
  const c = categorias.find((x) => x.id === cid);
  if (!c || !puedeNominar(c)) return;
  const cambios = moverNominado(c.nominados, pid, delta);
  const ids = Object.keys(cambios);
  if (!ids.length) return;
  const mapa = {};
  for (const id of ids) mapa[`${id}/orden`] = cambios[id];
  try {
    await update(ref(db, `awards/admin/categorias/${cid}/nominados`), mapa);
    await cargarTodo();
    renderTodo();
  } catch (e) {
    mensaje("aw-c-msg", errorLegible(e), "error");
  }
}

// Panel para tildar varias personas y agregarlas juntas a una categoría.
function panelVarios(c, libres) {
  const box = el("div", "aw-varios");
  const buscar = document.createElement("input");
  buscar.type = "search";
  buscar.className = "aw-input";
  buscar.placeholder = "Buscar persona...";
  buscar.autocomplete = "off";
  const grid = el("div", "aw-i-grid");
  const marcados = new Set();
  const btn = el("button", "aw-btn aw-btn-primario", "Agregar seleccionados");
  btn.type = "button";
  const actualizar = () => {
    btn.textContent = marcados.size ? `Agregar seleccionados (${marcados.size})` : "Agregar seleccionados";
    btn.disabled = !marcados.size || !puedeNominar(c);
  };
  const items = [];
  for (const p of libres) {
    const item = el("label", "aw-i-item");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => { if (cb.checked) marcados.add(p.id); else marcados.delete(p.id); actualizar(); });
    item.appendChild(cb);
    item.appendChild(avatar(p.nombre, p.foto));
    item.appendChild(el("div", "aw-i-txt", p.nombre));
    items.push({ p, item, cb });
    grid.appendChild(item);
  }
  const visible = ({ p }) => { const q = buscar.value.trim().toLowerCase(); return !q || p.nombre.toLowerCase().includes(q); };
  buscar.addEventListener("input", () => { for (const it of items) it.item.style.display = visible(it) ? "" : "none"; });
  const bt = el("button", "aw-btn", "Marcar todos");
  bt.type = "button";
  bt.addEventListener("click", () => { for (const it of items) if (visible(it)) { it.cb.checked = true; marcados.add(it.p.id); } actualizar(); });
  const bn = el("button", "aw-btn", "Desmarcar todo");
  bn.type = "button";
  bn.addEventListener("click", () => { for (const it of items) it.cb.checked = false; marcados.clear(); actualizar(); });
  btn.addEventListener("click", () => agregarVarios(c.id, [...marcados]));
  const fila = el("div", "aw-botones");
  fila.append(bt, bn, btn);
  box.append(buscar, grid, fila);
  actualizar();
  return box;
}

async function agregarVarios(cid, pids) {
  const c = categorias.find((x) => x.id === cid);
  if (!c || !puedeNominar(c) || !pids.length) return;
  const { cambios, cantidad } = armarNominados(c, pids, personas);
  if (!cantidad) return;
  try {
    await update(ref(db), cambios); // una sola escritura: se agregan todos o ninguno
    await cargarTodo();
    renderTodo();
    mensaje("aw-c-msg", `Se agregaron ${cantidad} nominado(s) a «${c.nombre}».`, "ok");
  } catch (e) {
    mensaje("aw-c-msg", errorLegible(e), "error");
  }
}

function renderCategorias() {
  const cont = $("aw-c-lista");
  cont.textContent = "";
  if (!categorias.length) {
    cont.appendChild(el("p", "aw-vacio", "Todavía no hay categorías. Agregá la primera con el formulario."));
    return;
  }
  for (const c of categorias) {
    const caja = el("section", "aw-cat" + (c.tipo === "oro" ? " oro" : ""));
    const cab = el("div", "aw-cat-cab");
    const tit = el("div", "aw-cat-tit");
    tit.appendChild(el("span", "aw-cat-nombre", c.nombre));
    if (c.tipo === "oro") tit.appendChild(el("span", "aw-badge", "Solo 2ª votación"));
    tit.appendChild(el("span", "aw-sub", `Orden ${c.orden === 9999 ? "—" : c.orden} · ${c.nominados.length} nominado(s)`));
    cab.appendChild(tit);
    const acc = el("div", "aw-acciones");
    const be = el("button", "aw-btn", "Editar");
    be.type = "button";
    be.disabled = !editable();
    be.addEventListener("click", () => editarCategoria(c.id));
    const bd = el("button", "aw-btn aw-btn-peligro", "Eliminar");
    bd.type = "button";
    bd.disabled = !editable();
    bd.addEventListener("click", () => eliminarCategoria(c.id));
    acc.append(be, bd);
    cab.appendChild(acc);
    caja.appendChild(cab);

    const lista = el("div", "aw-lista");
    if (!c.nominados.length) lista.appendChild(el("p", "aw-vacio", "Sin nominados todavía."));
    c.nominados.forEach((n, i) => {
      const p = personaPorId(n.pid);
      const fila = el("div", "aw-fila chica");
      fila.appendChild(avatar(p ? p.nombre : "?", p ? p.foto : null));
      const datos = el("div", "aw-datos");
      datos.appendChild(el("div", "aw-nombre", p ? p.nombre : "(persona eliminada)"));
      fila.appendChild(datos);
      const a2 = el("div", "aw-acciones");
      const bs = el("button", "aw-btn aw-btn-mini", "↑");
      bs.type = "button";
      bs.title = "Subir";
      bs.disabled = !puedeNominar(c) || i === 0;
      bs.addEventListener("click", () => mover(c.id, n.pid, -1));
      const bb = el("button", "aw-btn aw-btn-mini", "↓");
      bb.type = "button";
      bb.title = "Bajar";
      bb.disabled = !puedeNominar(c) || i === c.nominados.length - 1;
      bb.addEventListener("click", () => mover(c.id, n.pid, 1));
      const bq = el("button", "aw-btn aw-btn-mini aw-btn-peligro", "✕");
      bq.type = "button";
      bq.title = "Quitar de la categoría";
      bq.disabled = !puedeNominar(c);
      bq.addEventListener("click", () => quitarNominado(c.id, n.pid));
      a2.append(bs, bb, bq);
      fila.appendChild(a2);
      lista.appendChild(fila);
    });
    caja.appendChild(lista);

    // Agregar nominado: solo personas que todavía no están en esta categoría.
    const libres = personas.filter((p) => !c.nominados.some((n) => n.pid === p.id));
    const add = el("div", "aw-agregar");
    const sel = el("select", "aw-input");
    sel.disabled = !puedeNominar(c) || !libres.length;
    const o0 = el("option", "", libres.length ? "Agregar nominado..." : "No quedan personas para agregar");
    o0.value = "";
    sel.appendChild(o0);
    for (const p of libres) {
      const o = el("option", "", p.nombre);
      o.value = p.id;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => { if (sel.value) agregarNominado(c.id, sel.value); });
    add.appendChild(sel);
    if (libres.length) {
      const bv = el("button", "aw-btn", "Agregar varios...");
      bv.type = "button";
      bv.disabled = !puedeNominar(c);
      const panel = panelVarios(c, libres);
      panel.classList.add("hidden");
      bv.addEventListener("click", () => panel.classList.toggle("hidden"));
      add.appendChild(bv);
      caja.appendChild(add);
      caja.appendChild(panel);
    } else {
      caja.appendChild(add);
    }
    cont.appendChild(caja);
  }
}

// ────────────────────────────────────────────────────────────
//  Control de etapas (todo manual; nada avanza solo)
// ────────────────────────────────────────────────────────────
const AYUDA_ETAPA = {
  configuracion: "Cargá categorías, personas y nominados. Cuando estés listo, abrí la primera votación pública.",
  ronda1_abierta: "La votación pública está abierta: cualquiera con el enlace puede votar. Cerrala cuando quieras.",
  ronda1_cerrada: "La votación pública está cerrada. Revisá los votos en la pestaña «1ª votación», elegí los finalistas de cada categoría y confirmalos.",
  finalistas_definidos: "Finalistas definidos. Armá los nominados de Burdel de Oro en la pestaña «Categorías» y revisá la pestaña «2ª votación». Cuando estés listo, abrí la segunda votación (solo usuarios registrados).",
  ronda2_abierta: "Segunda votación abierta: solo la ven y la votan los usuarios registrados, desde su panel. Cerrala cuando quieras.",
  ronda2_cerrada: "Segunda votación cerrada. Los resultados siguen secretos: solo vos podés verlos. (La revisión de resultados y la publicación llegan en la próxima etapa.)",
  publicado: "Resultados publicados.",
};

function botonEtapa(texto, fn, clase) {
  const b = el("button", "aw-btn " + (clase || ""), texto);
  b.type = "button";
  b.addEventListener("click", async () => {
    for (const x of document.querySelectorAll("#aw-etapa-acciones button")) x.disabled = true;
    try { await fn(); } finally { renderEtapa(); }
  });
  return b;
}

function renderEtapa() {
  const cont = $("aw-etapa-acciones");
  cont.textContent = "";
  $("aw-etapa-ayuda").textContent = AYUDA_ETAPA[fase] || "";
  if (fase === "configuracion") cont.appendChild(botonEtapa("Abrir primera votación", abrirPrimera, "aw-btn-primario"));
  else if (fase === "ronda1_abierta") cont.appendChild(botonEtapa("Cerrar primera votación", cerrarPrimera, "aw-btn-primario"));
  else if (fase === "ronda1_cerrada") {
    cont.appendChild(botonEtapa("Reabrir primera votación", reabrirPrimera));
    cont.appendChild(botonEtapa("Confirmar finalistas", confirmarFinalistas, "aw-btn-primario"));
  } else if (fase === "finalistas_definidos") {
    cont.appendChild(botonEtapa("Volver a editar finalistas", volverAEditar));
    cont.appendChild(botonEtapa("Abrir segunda votación", abrirSegunda, "aw-btn-primario"));
  } else if (fase === "ronda2_abierta") cont.appendChild(botonEtapa("Cerrar segunda votación", cerrarSegunda, "aw-btn-primario"));
  else if (fase === "ronda2_cerrada") cont.appendChild(botonEtapa("Reabrir segunda votación", reabrirSegunda));
}

async function abrirPrimera() {
  if (fase !== "configuracion") return;
  const v = validarApertura(categorias, personas);
  if (v.error) { mensaje("aw-etapa-msg", v.error, "error"); return; }
  const n = categoriasPublicables(categorias).length;
  const texto = `Vas a ABRIR la primera votación pública con ${n} categoría(s).\n\n` + (v.avisos.length ? v.avisos.map((a) => "• " + a).join("\n") + "\n\n" : "") +
    "Mientras esté abierta no se podrá editar la configuración. ¿Abrir ahora?";
  if (!window.confirm(texto)) return;
  try {
    await update(ref(db), armarApertura(categorias).cambios); // una sola escritura: todo o nada
    fase = "ronda1_abierta";
    await cargarTodo();
    mensaje("aw-etapa-msg", "Primera votación abierta. Compartí el enlace de la pestaña «1ª votación».", "ok");
    renderTodo();
  } catch (e) {
    mensaje("aw-etapa-msg", errorLegible(e), "error");
  }
}

async function cerrarPrimera() {
  if (fase !== "ronda1_abierta") return;
  if (!window.confirm("¿Cerrar la primera votación? Nadie podrá votar más (podés reabrirla después si hace falta).")) return;
  try {
    await set(ref(db, "awards/estado"), "ronda1_cerrada"); // primero se cierra, después se cuenta
    fase = "ronda1_cerrada";
    renderTodo();
  } catch (e) {
    mensaje("aw-etapa-msg", errorLegible(e), "error");
    return;
  }
  try {
    votacion.cargado = false; // la selección de finalistas se vuelve a leer al abrir la pestaña
    await cargarVotos();
    await guardarSnapshot();
    mensaje("aw-etapa-msg", "Votación cerrada y votos contabilizados. Elegí los finalistas en la pestaña «1ª votación».", "ok");
  } catch (e) {
    mensaje("aw-etapa-msg", "La votación quedó cerrada, pero falló el conteo. Usá «Actualizar conteo» en la pestaña «1ª votación».", "error");
  }
  renderTodo();
  mostrarTab("votacion");
}

async function reabrirPrimera() {
  if (fase !== "ronda1_cerrada") return;
  if (!window.confirm("¿Reabrir la primera votación? Volverá a aceptar votos del público.")) return;
  try {
    await set(ref(db, "awards/estado"), "ronda1_abierta");
    fase = "ronda1_abierta";
    mensaje("aw-etapa-msg", "Primera votación reabierta.", "ok");
    renderTodo();
  } catch (e) { mensaje("aw-etapa-msg", errorLegible(e), "error"); }
}

async function volverAEditar() {
  if (fase !== "finalistas_definidos") return;
  if (!window.confirm("¿Volver a editar los finalistas? Los ya elegidos se conservan.")) return;
  try {
    await set(ref(db, "awards/estado"), "ronda1_cerrada");
    fase = "ronda1_cerrada";
    mensaje("aw-etapa-msg", "Podés editar los finalistas de nuevo.", "ok");
    renderTodo();
    cargarVotacion(true);
  } catch (e) { mensaje("aw-etapa-msg", errorLegible(e), "error"); }
}

// ────────────────────────────────────────────────────────────
//  Primera votación: conteo, ranking y elección de finalistas
// ────────────────────────────────────────────────────────────
let votacion = { conteo: null, seleccion: {}, cargado: false };

async function cargarVotos() {
  const snap = await get(ref(db, "awards/votos1")); // lectura de la colección completa (solo admin)
  votacion.conteo = contarVotos(snap.val(), categoriasPublicables(categorias));
}

async function guardarSnapshot() {
  const cats = {};
  let total = 0;
  for (const [cid, d] of Object.entries(votacion.conteo || {})) { cats[cid] = { total: d.total, conteo: d.conteo }; total += d.total; }
  await set(ref(db, "awards/resultados/ronda1"), { total, categorias: cats, cerradoEn: serverTimestamp() });
}

async function cargarVotacion(forzar) {
  if (fase === "configuracion") { renderVotacion(); return; }
  if (votacion.cargado && !forzar && fase !== "ronda1_abierta") { renderVotacion(); return; }
  mensaje("aw-v-msg", "Leyendo los votos...");
  try {
    await cargarVotos();
    const sel = await get(ref(db, "awards/admin/seleccion"));
    votacion.seleccion = {};
    const raw = sel.val() || {};
    for (const [cid, v] of Object.entries(raw)) if (v && typeof v === "object") votacion.seleccion[cid] = new Set(Object.keys(v));
    votacion.cargado = true;
    mensaje("aw-v-msg", "");
  } catch (e) {
    mensaje("aw-v-msg", errorLegible(e), "error");
  }
  renderVotacion();
  renderVotacion2();
}

function seleccionEfectiva(cat, ranking) {
  const guardada = votacion.seleccion[cat.id];
  return guardada && guardada.size ? guardada : new Set(sugerirFinalistas(ranking, 3));
}

async function alternarFinalista(cat, ranking, pid, marcado) {
  if (fase !== "ronda1_cerrada") return;
  const nueva = new Set(seleccionEfectiva(cat, ranking));
  if (marcado) nueva.add(pid); else nueva.delete(pid);
  const obj = {};
  for (const id of nueva) obj[id] = true;
  try {
    if (nueva.size) await set(ref(db, `awards/admin/seleccion/${cat.id}`), obj);
    else await remove(ref(db, `awards/admin/seleccion/${cat.id}`));
    votacion.seleccion[cat.id] = nueva;
    mensaje("aw-v-msg", "");
  } catch (e) {
    mensaje("aw-v-msg", errorLegible(e), "error");
  }
  renderVotacion();
}

async function usarSugerencia() {
  if (fase !== "ronda1_cerrada") return;
  if (!window.confirm("¿Descartar tu selección y usar la sugerencia del sistema (3 más votados y empates) en todas las categorías?")) return;
  try {
    await remove(ref(db, "awards/admin/seleccion"));
    votacion.seleccion = {};
    renderVotacion();
  } catch (e) { mensaje("aw-v-msg", errorLegible(e), "error"); }
}

function copiarEnlace() {
  const inp = $("aw-v-enlace");
  inp.select();
  try { navigator.clipboard.writeText(inp.value); mensaje("aw-v-msg", "Enlace copiado.", "ok"); } catch (e) { document.execCommand && document.execCommand("copy"); }
}

function renderVotacion() {
  const lista = $("aw-v-lista");
  lista.textContent = "";
  const abierta = fase === "ronda1_abierta", cerrada = fase === "ronda1_cerrada", definidos = fase === "finalistas_definidos";
  $("aw-v-sugerir").classList.toggle("hidden", !cerrada);
  $("aw-v-actualizar").classList.toggle("hidden", fase === "configuracion");
  const estados = {
    configuracion: "Todavía no se abrió la primera votación. El enlace de abajo mostrará un aviso hasta que la abras.",
    ronda1_abierta: "Abierta. Estos números son solo para vos: los visitantes no ven ningún conteo.",
    ronda1_cerrada: "Cerrada. Tildá los finalistas de cada categoría (pueden ser 3, 4, 5 o más) y después confirmalos arriba.",
    finalistas_definidos: "Finalistas confirmados. Para cambiarlos, usá «Volver a editar finalistas».",
  };
  $("aw-v-estado").textContent = estados[fase] || "La primera votación ya terminó.";
  if (fase === "configuracion" || !votacion.conteo) return;
  const pubs = categoriasPublicables(categorias);
  let totalVotos = 0;
  for (const c of pubs) totalVotos += (votacion.conteo[c.id] || { total: 0 }).total;
  lista.appendChild(el("p", "aw-resumen", `${totalVotos} voto(s) en total en ${pubs.length} categoría(s).`));
  for (const c of pubs) {
    const datos = votacion.conteo[c.id] || { total: 0, conteo: {} };
    const ranking = armarRanking(c, datos);
    const sel = seleccionEfectiva(c, ranking);
    const caja = el("section", "aw-rk-cat");
    const cab = el("div", "aw-rk-cab");
    cab.appendChild(el("span", "aw-cat-nombre", c.nombre));
    cab.appendChild(el("span", "aw-sub", `${datos.total} voto(s)` + ((cerrada || definidos) ? ` · ${sel.size} finalista(s)` : "")));
    caja.appendChild(cab);
    if ((cerrada || definidos) && hayEmpateEnCorte(ranking, 3)) {
      const corte = ranking[2].votos;
      const empatados = ranking.filter((r) => r.votos === corte).map((r) => (personaPorId(r.pid) || { nombre: "?" }).nombre);
      caja.appendChild(el("div", "aw-empate", `Empate en el puesto 3 con ${corte} voto(s): ${empatados.join(", ")}. Decidí vos quién pasa.`));
    }
    const maximo = ranking.length ? Math.max(1, ranking[0].votos) : 1;
    for (const r of ranking) {
      const p = personaPorId(r.pid);
      const fila = el("div", "aw-rk" + ((cerrada || definidos) && sel.has(r.pid) ? " sel" : ""));
      fila.appendChild(el("div", "aw-rk-pos", String(r.puesto)));
      fila.appendChild(avatar(p ? p.nombre : "?", p ? p.foto : null));
      const d = el("div", "aw-datos");
      d.appendChild(el("div", "aw-nombre", p ? p.nombre : "(persona eliminada)"));
      const barra = el("div", "aw-rk-barra");
      const i = document.createElement("i");
      i.style.width = Math.round((r.votos / maximo) * 100) + "%";
      barra.appendChild(i);
      d.appendChild(barra);
      fila.appendChild(d);
      fila.appendChild(el("div", "aw-rk-num", `${r.votos} · ${r.pct}%`));
      if (cerrada || definidos) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = sel.has(r.pid);
        cb.disabled = !cerrada;
        cb.title = "Finalista";
        cb.addEventListener("change", () => alternarFinalista(c, ranking, r.pid, cb.checked));
        fila.appendChild(cb);
      }
      caja.appendChild(fila);
    }
    lista.appendChild(caja);
  }
}

async function confirmarFinalistas() {
  if (fase !== "ronda1_cerrada") return;
  if (!votacion.cargado) await cargarVotacion(true);
  const pubs = categoriasPublicables(categorias);
  const finalistas = {};
  const resumen = [];
  for (const c of pubs) {
    const ranking = armarRanking(c, votacion.conteo[c.id] || { total: 0, conteo: {} });
    const sel = seleccionEfectiva(c, ranking);
    if (sel.size < 2) { mensaje("aw-etapa-msg", `«${c.nombre}» necesita al menos 2 finalistas (tiene ${sel.size}).`, "error"); return; }
    finalistas[c.id] = armarFinalistas(ranking, sel);
    resumen.push(`• ${c.nombre}: ${sel.size}`);
  }
  if (!window.confirm("Finalistas por categoría:\n" + resumen.join("\n") + "\n\n¿Confirmar? Todavía no se abre ninguna votación nueva.")) return;
  try {
    await update(ref(db), { "awards/admin/finalistas": finalistas, "awards/estado": "finalistas_definidos" });
    fase = "finalistas_definidos";
    mensaje("aw-etapa-msg", "Finalistas confirmados.", "ok");
    renderTodo();
  } catch (e) { mensaje("aw-etapa-msg", errorLegible(e), "error"); }
}

// ────────────────────────────────────────────────────────────
//  Segunda votación (solo usuarios registrados)
// ────────────────────────────────────────────────────────────
let finalistas = {};   // awards/admin/finalistas ya leído
let participacion = null;

async function cargarFinalistas() {
  const snap = await get(ref(db, "awards/admin/finalistas"));
  finalistas = leerFinalistas(snap.val());
}

async function abrirSegunda() {
  if (fase !== "finalistas_definidos") return;
  try { await cargarFinalistas(); } catch (e) { mensaje("aw-etapa-msg", errorLegible(e), "error"); return; }
  const v = validarApertura2(categorias, personas, finalistas);
  if (v.error) { mensaje("aw-etapa-msg", v.error, "error"); return; }
  const cats = ordenarRonda2(categoriasRonda2(categorias, finalistas));
  const texto = "Vas a ABRIR la segunda votación (solo usuarios registrados) con:\n" + cats.map((c) => `• ${c.nombre}: ${c.finalistas.length}`).join("\n") + "\n\n" +
    (v.avisos.length ? v.avisos.map((a) => "• " + a).join("\n") + "\n\n" : "") +
    "Cada usuario tendrá un voto por categoría que no podrá cambiar. Los resultados seguirán secretos. ¿Abrir ahora?";
  if (!window.confirm(texto)) return;
  try {
    await update(ref(db), armarApertura2(categorias, finalistas).cambios); // una sola escritura: todo o nada
    fase = "ronda2_abierta";
    await cargarTodo();
    mensaje("aw-etapa-msg", "Segunda votación abierta. Los usuarios registrados la ven en su panel.", "ok");
    renderTodo();
  } catch (e) {
    mensaje("aw-etapa-msg", errorLegible(e), "error");
  }
}

async function cerrarSegunda() {
  if (fase !== "ronda2_abierta") return;
  if (!window.confirm("¿Cerrar la segunda votación? Nadie podrá votar más. Los resultados siguen secretos (podés reabrirla después si hace falta).")) return;
  try {
    await set(ref(db, "awards/estado"), "ronda2_cerrada");
    fase = "ronda2_cerrada";
    mensaje("aw-etapa-msg", "Segunda votación cerrada.", "ok");
    renderTodo();
    cargarVotacion2(true);
  } catch (e) { mensaje("aw-etapa-msg", errorLegible(e), "error"); }
}

async function reabrirSegunda() {
  if (fase !== "ronda2_cerrada") return;
  if (!window.confirm("¿Reabrir la segunda votación? Los usuarios volverán a poder votar en lo que les falte.")) return;
  try {
    await set(ref(db, "awards/estado"), "ronda2_abierta");
    fase = "ronda2_abierta";
    mensaje("aw-etapa-msg", "Segunda votación reabierta.", "ok");
    renderTodo();
  } catch (e) { mensaje("aw-etapa-msg", errorLegible(e), "error"); }
}

async function cargarVotacion2(forzar) {
  if (fase !== "finalistas_definidos" && fase !== "ronda2_abierta" && fase !== "ronda2_cerrada") { renderVotacion2(); return; }
  try {
    await cargarFinalistas();
    if (fase === "ronda2_abierta" || fase === "ronda2_cerrada") {
      mensaje("aw-v2-msg", forzar ? "Leyendo votos..." : "");
      const snap = await get(ref(db, "awards/votos2")); // colección completa: solo el admin puede leerla
      participacion = contarParticipacion(snap.val(), categoriasRonda2(categorias, finalistas));
    }
    mensaje("aw-v2-msg", "");
  } catch (e) {
    mensaje("aw-v2-msg", errorLegible(e), "error");
  }
  renderVotacion2();
}

function renderVotacion2() {
  const lista = $("aw-v2-lista");
  lista.textContent = "";
  const estados = {
    configuracion: "Todavía no se definieron finalistas.",
    ronda1_abierta: "Todavía no se definieron finalistas.",
    ronda1_cerrada: "Definí los finalistas en la pestaña «1ª votación».",
    finalistas_definidos: "Esto es lo que se va a publicar al abrir la segunda votación. Burdel de Oro se arma en la pestaña «Categorías».",
    ronda2_abierta: "Segunda votación abierta. Estos números son solo participación: los resultados completos llegan en la próxima etapa.",
    ronda2_cerrada: "Segunda votación cerrada. Los resultados siguen secretos.",
    publicado: "Resultados publicados.",
  };
  $("aw-v2-estado").textContent = estados[fase] || "";
  $("aw-v2-actualizar").classList.toggle("hidden", !(fase === "ronda2_abierta" || fase === "ronda2_cerrada" || fase === "finalistas_definidos"));
  if (!(fase === "finalistas_definidos" || fase === "ronda2_abierta" || fase === "ronda2_cerrada")) return;
  const cats = ordenarRonda2(categoriasRonda2(categorias, finalistas));
  if (!cats.length) { lista.appendChild(el("p", "aw-vacio", "Sin datos todavía. Apretá «Actualizar».")); return; }
  const votos = fase === "ronda2_abierta" || fase === "ronda2_cerrada";
  if (votos && participacion) lista.appendChild(el("p", "aw-resumen", `${participacion.votantes} usuario(s) votaron en al menos una categoría.`));
  for (const c of cats) {
    const caja = el("section", "aw-cat" + (c.tipo === "oro" ? " oro" : ""));
    const cab = el("div", "aw-cat-cab");
    const tit = el("div", "aw-cat-tit");
    tit.appendChild(el("span", "aw-cat-nombre", c.nombre));
    if (c.tipo === "oro") tit.appendChild(el("span", "aw-badge", "Categoría especial"));
    tit.appendChild(el("span", "aw-sub", `${c.finalistas.length} ${c.tipo === "oro" ? "nominado(s)" : "finalista(s)"}` + (votos && participacion ? ` · ${participacion.porCategoria[c.id] || 0} voto(s) recibidos` : "")));
    cab.appendChild(tit);
    caja.appendChild(cab);
    const fl = el("div", "aw-lista");
    for (const f of c.finalistas) {
      const p = personaPorId(f.pid);
      const fila = el("div", "aw-fila chica");
      fila.appendChild(avatar(p ? p.nombre : "?", p ? p.foto : null));
      const d = el("div", "aw-datos");
      d.appendChild(el("div", "aw-nombre", p ? p.nombre : "(persona eliminada)"));
      fila.appendChild(d);
      fl.appendChild(fila);
    }
    caja.appendChild(fl);
    lista.appendChild(caja);
  }
}

// ────────────────────────────────────────────────────────────
//  Pantalla
// ────────────────────────────────────────────────────────────
function errorLegible(e) {
  const txt = String((e && (e.code || e.message)) || "");
  if (/PERMISSION_DENIED/i.test(txt)) return "Sin permiso. ¿Ya están publicadas las reglas de «awards» en este proyecto de Firebase?";
  return "No se pudo completar la operación. Probá de nuevo.";
}

function renderTodo() {
  renderEstado();
  renderPersonas();
  renderCategorias();
  renderFormPersona();
  renderFormCategoria();
  if (plantel) renderPlantel();
  renderVotacion();
}

function mostrarTab(cual) {
  $("aw-pane-categorias").classList.toggle("hidden", cual !== "categorias");
  $("aw-pane-personas").classList.toggle("hidden", cual !== "personas");
  $("aw-pane-votacion").classList.toggle("hidden", cual !== "votacion");
  $("aw-pane-votacion2").classList.toggle("hidden", cual !== "votacion2");
  for (const [id, k] of [["aw-tab-categorias", "categorias"], ["aw-tab-personas", "personas"], ["aw-tab-votacion", "votacion"], ["aw-tab-votacion2", "votacion2"]]) {
    $(id).classList.toggle("active", cual === k);
    $(id).setAttribute("aria-selected", cual === k ? "true" : "false");
  }
  if (cual === "votacion") cargarVotacion();
  if (cual === "votacion2") cargarVotacion2();
}

async function iniciar() {
  $("aw-tab-categorias").addEventListener("click", () => mostrarTab("categorias"));
  $("aw-tab-personas").addEventListener("click", () => mostrarTab("personas"));
  $("aw-tab-votacion").addEventListener("click", () => mostrarTab("votacion"));
  $("aw-tab-votacion2").addEventListener("click", () => mostrarTab("votacion2"));
  $("aw-v2-actualizar").addEventListener("click", () => cargarVotacion2(true));
  $("aw-v-actualizar").addEventListener("click", () => cargarVotacion(true));
  $("aw-v-sugerir").addEventListener("click", usarSugerencia);
  $("aw-v-copiar").addEventListener("click", copiarEnlace);
  $("aw-v-enlace").value = new URL("awards.html", window.location.href).href;
  $("aw-p-archivo").addEventListener("change", onArchivoPersona);
  $("aw-p-quitar-foto").addEventListener("click", quitarFoto);
  $("aw-p-guardar").addEventListener("click", guardarPersona);
  $("aw-p-cancelar").addEventListener("click", () => { limpiarFormPersona(); mensaje("aw-p-msg", ""); });
  $("aw-p-nombre").addEventListener("input", renderFormPersona);
  $("aw-p-buscar").addEventListener("input", renderPersonas);
  $("aw-i-abrir").addEventListener("click", abrirPlantel);
  $("aw-i-buscar").addEventListener("input", renderPlantel);
  $("aw-i-marcar").addEventListener("click", marcarFaltantes);
  $("aw-i-desmarcar").addEventListener("click", () => { marcados.clear(); renderPlantel(); });
  $("aw-i-importar").addEventListener("click", importarSeleccionados);
  $("aw-c-guardar").addEventListener("click", guardarCategoria);
  $("aw-c-cancelar").addEventListener("click", () => { limpiarFormCategoria(); mensaje("aw-c-msg", ""); });
  try {
    await Promise.all([cargarTodo(), cargarUsuarios()]);
    limpiarFormPersona();
    limpiarFormCategoria();
    renderTodo();
  } catch (e) {
    $("aw-resumen").textContent = errorLegible(e);
    $("aw-resumen").classList.add("aviso");
  }
}

function arrancar() {
  let iniciado = false;
  onAuthStateChanged(auth, (user) => {
    if (!user || user.uid !== ADMIN_UID) { window.location.href = "/login.html"; return; }
    if (iniciado) return;
    iniciado = true;
    document.body.classList.remove("aw-oculto"); // recién ahora se muestra la pantalla
    iniciar();
  });
}

if (typeof document !== "undefined" && document.getElementById("aw-c-lista")) arrancar();
