// ============================================================
//  BURDEL AWARDS 2026 — lógica pura y constantes compartidas
//  Archivo: games/awards-datos.js
// ============================================================
//  Sin Firebase: solo constantes, validaciones y lectura tolerante de datos.
//  Lo usan admin-awards.html (games/awards-admin.js) y, más adelante, la
//  votación pública y la vista de ganadores.
//
//  Estructura en Firebase (nodo "awards"):
//    awards/estado                              etapa actual (texto)
//    awards/personas/{pid}                      {nombre, foto?, uid?, r1?, r2?}   (foto en base64 JPEG)
//    awards/admin/categorias/{cid}              {nombre, orden, tipo, nominados:{pid:{orden}}}
//    (las demás ramas —ronda1, ronda2, votos, resultados, publicados— llegan en etapas siguientes)
// ============================================================

export const ADMIN_UID = "rRE0YhtRhqNvGWGFDkcbhNIwvOz1";
export const NOMBRE_OFICIAL = "BURDEL AWARDS 2026";

export const FASES = [
  "configuracion",
  "ronda1_abierta",
  "ronda1_cerrada",
  "finalistas_definidos",
  "ronda2_abierta",
  "ronda2_cerrada",
  "publicado",
];

export const FASES_ETIQUETA = {
  configuracion: "Configuración",
  ronda1_abierta: "Primera votación abierta",
  ronda1_cerrada: "Primera votación cerrada",
  finalistas_definidos: "Finalistas definidos",
  ronda2_abierta: "Segunda votación abierta",
  ronda2_cerrada: "Segunda votación cerrada",
  publicado: "Resultados publicados",
};

export const RE_ID = /^[a-z0-9_]{1,30}$/;
const RE_NOMBRE_PROHIBIDO = /[<>"\\/]/;
const RE_FOTO_DATA = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

export const LADO_FOTO = 480;           // lado mayor de la foto, en píxeles
export const MAX_FOTO_CHARS = 140000;   // las reglas aceptan hasta 150000

// Si el nodo todavía no existe (o tiene un valor raro) se considera "configuracion".
export function leerFase(valor) {
  return FASES.includes(valor) ? valor : "configuracion";
}

// La estructura (categorías, personas, nominados) solo se edita en configuración.
export function estructuraEditable(fase) {
  return leerFase(fase) === "configuracion";
}

export function nuevoId(prefijo = "x") {
  const g = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(2)) : null;
  const azar = g ? (g[0].toString(36) + g[1].toString(36)).slice(0, 6) : Math.random().toString(36).slice(2, 8);
  return (prefijo + Date.now().toString(36) + azar).slice(0, 30);
}

export function fotoValida(f) {
  return typeof f === "string" && f.length <= MAX_FOTO_CHARS && RE_FOTO_DATA.test(f);
}

// Devuelve un texto de error o null.
export function validarNombre(nombre, max) {
  const n = String(nombre || "").trim();
  if (n.length < 1) return "Falta el nombre.";
  if (n.length > max) return `El nombre puede tener hasta ${max} caracteres.`;
  if (RE_NOMBRE_PROHIBIDO.test(n)) return "El nombre no puede tener los caracteres < > \" \\ /";
  return null;
}

export function validarPersona({ nombre }) {
  return validarNombre(nombre, 40);
}

// categorias: lista ya leída (leerCategorias). editandoId: id de la que se está editando, si hay.
export function validarCategoria({ nombre, orden, tipo }, categorias, editandoId) {
  const e = validarNombre(nombre, 60);
  if (e) return e;
  if (!Number.isFinite(orden)) return "El orden debe ser un número.";
  if (tipo !== "normal" && tipo !== "oro") return "Tipo de categoría inválido.";
  if (tipo === "oro" && categorias.some((c) => c.tipo === "oro" && c.id !== editandoId)) {
    return "Ya existe la categoría especial Burdel de Oro. Solo puede haber una.";
  }
  return null;
}

// ── Lectura tolerante (los datos pueden venir incompletos o con basura) ──

export function leerPersonas(raw) {
  const lista = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return lista;
  for (const [id, v] of Object.entries(raw)) {
    if (!RE_ID.test(id) || !v || typeof v !== "object") continue;
    const nombre = typeof v.nombre === "string" ? v.nombre.trim().slice(0, 40) : "";
    if (!nombre) continue;
    lista.push({
      id,
      nombre,
      foto: fotoValida(v.foto) ? v.foto : null,
      uid: typeof v.uid === "string" && v.uid ? v.uid : null,
    });
  }
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}

export function leerCategorias(raw) {
  const lista = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return lista;
  for (const [id, v] of Object.entries(raw)) {
    if (!RE_ID.test(id) || !v || typeof v !== "object") continue;
    const nombre = typeof v.nombre === "string" ? v.nombre.trim().slice(0, 60) : "";
    if (!nombre) continue;
    const nominados = [];
    if (v.nominados && typeof v.nominados === "object") {
      for (const [pid, n] of Object.entries(v.nominados)) {
        if (!RE_ID.test(pid)) continue;
        nominados.push({ pid, orden: n && Number.isFinite(n.orden) ? n.orden : 9999 });
      }
    }
    nominados.sort((a, b) => (a.orden - b.orden) || a.pid.localeCompare(b.pid));
    lista.push({
      id,
      nombre,
      orden: Number.isFinite(v.orden) ? v.orden : 9999,
      tipo: v.tipo === "oro" ? "oro" : "normal",
      nominados,
    });
  }
  lista.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}

export function proximoOrden(items) {
  return items.reduce((m, x) => Math.max(m, Number.isFinite(x.orden) && x.orden !== 9999 ? x.orden : 0), 0) + 1;
}

// Mueve un nominado una posición (delta -1 sube, +1 baja) y devuelve los cambios
// {pid: nuevoOrden} necesarios para dejar los órdenes como 1..n. Objeto vacío si no hay cambio.
export function moverNominado(nominados, pid, delta) {
  const ids = nominados.map((n) => n.pid);
  const i = ids.indexOf(pid);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return {};
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const cambios = {};
  ids.forEach((id, k) => {
    const actual = nominados.find((n) => n.pid === id).orden;
    if (actual !== k + 1) cambios[id] = k + 1;
  });
  return cambios;
}

// Avisos para el admin antes de abrir la primera votación (no bloquean nada).
export function avisosConfiguracion(categorias, personas) {
  const avisos = [];
  const normales = categorias.filter((c) => c.tipo === "normal");
  if (!normales.length) avisos.push("Todavía no hay categorías para la primera votación.");
  for (const c of normales) {
    if (c.nominados.length < 2) avisos.push(`«${c.nombre}» tiene menos de 2 nominados.`);
  }
  const ids = new Set(personas.map((p) => p.id));
  for (const c of categorias) {
    if (c.nominados.some((n) => !ids.has(n.pid))) avisos.push(`«${c.nombre}» tiene nominados que ya no existen.`);
  }
  const usadas = new Set(categorias.flatMap((c) => c.nominados.map((n) => n.pid)));
  const sinFoto = personas.filter((p) => usadas.has(p.id) && !p.foto).length;
  if (sinFoto) avisos.push(`${sinFoto} nominado(s) sin fotografía.`);
  return avisos;
}

// ── Fotografía (solo navegador) ──
// Reduce el lado mayor a 480 px (o menos si hace falta) y comprime a JPEG hasta que entre en el tope.
export async function fotoDesdeArchivo(file) {
  if (!file || !String(file.type).startsWith("image/")) throw new Error("El archivo no es una imagen.");
  if (file.size > 25 * 1024 * 1024) throw new Error("La imagen es demasiado grande (máximo 25 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error("No se pudo leer la imagen.");
    for (const lado of [LADO_FOTO, 400, 320, 240]) {
      const k = Math.min(1, lado / Math.max(w0, h0));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w0 * k));
      canvas.height = Math.max(1, Math.round(h0 * k));
      const g = canvas.getContext("2d");
      g.fillStyle = "#000";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const data = canvas.toDataURL("image/jpeg", q);
        if (data.startsWith("data:image/jpeg;base64,") && data.length <= MAX_FOTO_CHARS) return data;
      }
    }
    throw new Error("La foto es demasiado pesada incluso comprimida. Probá con otra.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Importación desde «Armá tu equipo» ──
// armaequipo/plantel/{id} = {nombre, foto, activo, orden}. La foto puede ser una ruta del repositorio
// (assets/img/plantel/x.jpg) o una imagen JPEG en base64 subida desde el admin de ese juego.
const RE_FOTO_RUTA = /^assets\/img\/plantel\/[a-z0-9_-]{1,60}\.(jpg|jpeg|png|webp)$/;

export function leerPlantel(raw) {
  const lista = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return lista;
  for (const [id, v] of Object.entries(raw)) {
    if (!RE_ID.test(id) || !v || typeof v !== "object") continue;
    const nombre = typeof v.nombre === "string" ? v.nombre.trim().slice(0, 40) : "";
    if (!nombre) continue;
    const f = v.foto;
    const foto = typeof f === "string" && (RE_FOTO_RUTA.test(f) || (f.length <= 60000 && RE_FOTO_DATA.test(f))) ? f : null;
    lista.push({ id, nombre, foto, activo: v.activo === true, orden: Number.isFinite(v.orden) ? v.orden : 9999 });
  }
  lista.sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"));
  return lista;
}

// Para detectar a quien ya está cargado: sin mayúsculas, acentos ni espacios de más.
export function normalizarNombre(n) {
  return String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function yaCargada(nombre, personas) {
  const k = normalizarNombre(nombre);
  return personas.some((p) => normalizarNombre(p.nombre) === k);
}

// Devuelve una foto lista para Awards (JPEG base64 dentro del tope) a partir de la del plantel.
// - Si ya es una imagen base64, se copia tal cual.
// - Si es una ruta del repositorio, se descarga del propio sitio y se recomprime.
// Lanza un Error si no se puede.
export async function fotoDesdePlantel(foto) {
  if (!foto) throw new Error("Sin foto");
  if (foto.startsWith("data:image/jpeg;base64,")) {
    if (foto.length > MAX_FOTO_CHARS) throw new Error("Foto demasiado pesada");
    return foto;
  }
  const resp = await fetch("/" + foto, { cache: "no-store" });
  if (!resp.ok) throw new Error("No se pudo descargar la foto");
  const blob = await resp.blob();
  return fotoDesdeArchivo(blob);
}

// ════════════════════════════════════════════════════════════
//  ETAPA 3 — Primera votación pública
// ════════════════════════════════════════════════════════════

// Categorías que entran en la primera votación: normales y con al menos un nominado.
export function categoriasPublicables(categorias) {
  return categorias.filter((c) => c.tipo === "normal" && c.nominados.length >= 1);
}

// Controles antes de abrir la primera votación. {error, avisos}
export function validarApertura(categorias, personas) {
  const pub = categoriasPublicables(categorias);
  if (!pub.length) return { error: "No hay ninguna categoría normal con nominados. Cargalas antes de abrir la votación.", avisos: [] };
  const ids = new Set(personas.map((p) => p.id));
  for (const c of pub) {
    if (c.nominados.some((n) => !ids.has(n.pid))) return { error: `«${c.nombre}» tiene nominados que ya no existen. Corregilo antes de abrir.`, avisos: [] };
  }
  const avisos = [];
  const vacias = categorias.filter((c) => c.tipo === "normal" && !c.nominados.length);
  if (vacias.length) avisos.push(`No se publicarán por no tener nominados: ${vacias.map((c) => c.nombre).join(", ")}.`);
  const chicas = pub.filter((c) => c.nominados.length < 2);
  if (chicas.length) avisos.push(`Tienen un solo nominado: ${chicas.map((c) => c.nombre).join(", ")}.`);
  const usadas = new Set(pub.flatMap((c) => c.nominados.map((n) => n.pid)));
  const sinFoto = personas.filter((p) => usadas.has(p.id) && !p.foto).length;
  if (sinFoto) avisos.push(`${sinFoto} nominado(s) no tienen foto (se verán con sus iniciales).`);
  const oro = categorias.find((c) => c.tipo === "oro");
  if (oro) avisos.push("Burdel de Oro NO se publica: aparece recién en la segunda votación.");
  return { error: null, avisos };
}

// Cambios (una sola escritura atómica) para abrir la primera votación.
// Solo se marcan visibles (r1) las personas nominadas en categorías normales:
// quien esté únicamente en Burdel de Oro nunca queda público.
export function armarApertura(categorias) {
  const cambios = {};
  const visibles = new Set();
  for (const c of categoriasPublicables(categorias)) {
    const nominados = {};
    for (const n of c.nominados) { nominados[n.pid] = { orden: n.orden }; visibles.add(n.pid); }
    cambios[`awards/ronda1/${c.id}`] = { nombre: c.nombre, orden: c.orden, nominados };
  }
  for (const pid of visibles) cambios[`awards/personas/${pid}/r1`] = true;
  cambios["awards/estado"] = "ronda1_abierta";
  return { cambios, visibles: [...visibles] };
}

// raw = awards/votos1  →  {cid: {token: {p, ts}}}.
// Solo cuenta votos a nominados reales de esa categoría. Devuelve {cid: {total, conteo:{pid:n}}}.
export function contarVotos(raw, publicables) {
  const out = {};
  for (const c of publicables) {
    const validos = new Set(c.nominados.map((n) => n.pid));
    const conteo = {};
    for (const n of c.nominados) conteo[n.pid] = 0;
    let total = 0;
    const votos = raw && typeof raw === "object" && raw[c.id] && typeof raw[c.id] === "object" ? raw[c.id] : {};
    for (const v of Object.values(votos)) {
      if (v && typeof v.p === "string" && validos.has(v.p)) { conteo[v.p]++; total++; }
    }
    out[c.id] = { total, conteo };
  }
  return out;
}

// Ranking de una categoría: [{pid, votos, pct, puesto}] de más a menos votado (empates comparten puesto).
export function armarRanking(categoria, datos) {
  const total = datos ? datos.total : 0;
  const filas = categoria.nominados.map((n) => ({
    pid: n.pid,
    votos: datos && datos.conteo[n.pid] ? datos.conteo[n.pid] : 0,
    orden: n.orden,
  }));
  filas.sort((a, b) => (b.votos - a.votos) || (a.orden - b.orden));
  let puesto = 0, prev = null;
  return filas.map((f, i) => {
    if (f.votos !== prev) { puesto = i + 1; prev = f.votos; }
    return { pid: f.pid, votos: f.votos, pct: total ? Math.round((f.votos / total) * 1000) / 10 : 0, puesto };
  });
}

// Sugerencia: los 3 más votados + todos los que empaten con el tercero.
export function sugerirFinalistas(ranking, n = 3) {
  if (ranking.length <= n) return ranking.map((r) => r.pid);
  const corte = ranking[n - 1].votos;
  return ranking.filter((r, i) => i < n || r.votos === corte).map((r) => r.pid);
}

// ¿Hay un empate que afecta quién entra entre los primeros n?
export function hayEmpateEnCorte(ranking, n = 3) {
  return ranking.length > n && ranking[n - 1].votos === ranking[n].votos;
}

// Finalistas definitivos de una categoría: {pid: {orden}} siguiendo el orden del ranking.
export function armarFinalistas(ranking, seleccion) {
  const out = {};
  let k = 1;
  for (const r of ranking) if (seleccion.has(r.pid)) out[r.pid] = { orden: k++ };
  return out;
}

// ── Votante público (sin cuenta) ──
export function tokenValido(t) {
  return typeof t === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t);
}
export function nuevoToken() {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(32)) : Array.from({ length: 32 }, () => Math.floor(Math.random() * 256));
  let t = "";
  for (let i = 0; i < 32; i++) t += abc[bytes[i] % abc.length];
  return t;
}

// ════════════════════════════════════════════════════════════
//  ETAPA 4 — Burdel de Oro y segunda votación (solo registrados)
// ════════════════════════════════════════════════════════════

// Burdel de Oro y las personas se pueden editar también después de cerrar la primera votación,
// porque Oro se arma recién en esa etapa. El resto de la estructura sigue bloqueada.
export function oroEditable(fase) {
  const f = leerFase(fase);
  return f === "configuracion" || f === "ronda1_cerrada" || f === "finalistas_definidos";
}
// Las personas se pueden cargar/editar mientras se arma Oro y también con la primera votación abierta
// (para sumar categorías nuevas).
export function personasEditable(fase) {
  const f = leerFase(fase);
  return oroEditable(f) || f === "ronda1_abierta";
}

// awards/admin/finalistas → {cid: [{pid, orden}]}
export function leerFinalistas(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [cid, v] of Object.entries(raw)) {
    if (!RE_ID.test(cid) || !v || typeof v !== "object") continue;
    const lista = [];
    for (const [pid, f] of Object.entries(v)) {
      if (RE_ID.test(pid)) lista.push({ pid, orden: f && Number.isFinite(f.orden) ? f.orden : 9999 });
    }
    lista.sort((a, b) => (a.orden - b.orden) || a.pid.localeCompare(b.pid));
    out[cid] = lista;
  }
  return out;
}

// Categorías de la segunda votación: las normales con sus finalistas, y Burdel de Oro al final
// (con todos sus nominados, sin tope).
export function categoriasRonda2(categorias, finalistas) {
  const lista = categoriasPublicables(categorias).filter((c) => finalistas && finalistas[c.id]).map((c) => ({
    id: c.id, nombre: c.nombre, orden: c.orden, tipo: "normal", finalistas: finalistas[c.id],
  }));
  const oro = categorias.find((c) => c.tipo === "oro" && c.nominados.length >= 1);
  if (oro) lista.push({ id: oro.id, nombre: oro.nombre, orden: oro.orden, tipo: "oro", finalistas: oro.nominados.map((n) => ({ pid: n.pid, orden: n.orden })) });
  return lista;
}

export function validarApertura2(categorias, personas, finalistas) {
  const lista = categoriasRonda2(categorias, finalistas);
  const normales = lista.filter((c) => c.tipo === "normal");
  if (!normales.length) return { error: "No hay categorías con finalistas definidos.", avisos: [] };
  const ids = new Set(personas.map((p) => p.id));
  for (const c of lista) {
    if (c.finalistas.length < 2) return { error: `«${c.nombre}» necesita al menos 2 ${c.tipo === "oro" ? "nominados" : "finalistas"} para abrir la votación.`, avisos: [] };
    if (c.finalistas.some((f) => !ids.has(f.pid))) return { error: `«${c.nombre}» tiene personas que ya no existen.`, avisos: [] };
  }
  const avisos = [];
  const omitidas = categoriasPublicables(categorias).filter((c) => !(finalistas && finalistas[c.id]));
  if (omitidas.length) avisos.push(`No se votaron en la primera ronda y no estarán en la segunda: ${omitidas.map((c) => c.nombre).join(", ")}.`);
  if (!lista.some((c) => c.tipo === "oro")) avisos.push("Burdel de Oro no tiene nominados: no aparecerá en la segunda votación.");
  const usadas = new Set(lista.flatMap((c) => c.finalistas.map((f) => f.pid)));
  const sinFoto = personas.filter((p) => usadas.has(p.id) && !p.foto).length;
  if (sinFoto) avisos.push(`${sinFoto} finalista(s)/nominado(s) no tienen foto (se verán con sus iniciales).`);
  return { error: null, avisos };
}

// Una sola escritura atómica para abrir la segunda votación.
export function armarApertura2(categorias, finalistas) {
  const cambios = {};
  const visibles = new Set();
  for (const c of categoriasRonda2(categorias, finalistas)) {
    const fin = {};
    for (const f of c.finalistas) { fin[f.pid] = { orden: f.orden }; visibles.add(f.pid); }
    cambios[`awards/ronda2/${c.id}`] = { nombre: c.nombre, orden: c.orden, tipo: c.tipo, finalistas: fin };
  }
  for (const pid of visibles) cambios[`awards/personas/${pid}/r2`] = true;
  cambios["awards/estado"] = "ronda2_abierta";
  return { cambios, visibles: [...visibles] };
}

// Orden de presentación en la segunda votación: normales por orden, Burdel de Oro siempre al final.
export function ordenarRonda2(cats) {
  return [...cats].sort((a, b) => ((a.tipo === "oro") - (b.tipo === "oro")) || (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"));
}

// Participación en la segunda votación (solo el administrador la ve):
// raw = awards/votos2 → {cid: {uid: {p, ts}}}. Devuelve {porCategoria:{cid:n}, votantes:n}.
export function contarParticipacion(raw, cats) {
  const porCategoria = {};
  const votantes = new Set();
  for (const c of cats) {
    const validos = new Set(c.finalistas.map((f) => f.pid));
    let n = 0;
    const votos = raw && typeof raw === "object" && raw[c.id] && typeof raw[c.id] === "object" ? raw[c.id] : {};
    for (const [uid, v] of Object.entries(votos)) {
      if (v && typeof v.p === "string" && validos.has(v.p)) { n++; votantes.add(uid); }
    }
    porCategoria[c.id] = n;
  }
  return { porCategoria, votantes: votantes.size };
}

// awards/ronda2 (lo que ve el usuario registrado) → [{id, nombre, orden, tipo, finalistas:[{pid, orden}]}]
// con las categorías normales por orden y Burdel de Oro al final.
export function leerRonda2(raw) {
  const lista = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return lista;
  for (const [id, v] of Object.entries(raw)) {
    if (!RE_ID.test(id) || !v || typeof v !== "object") continue;
    const nombre = typeof v.nombre === "string" ? v.nombre.trim().slice(0, 60) : "";
    if (!nombre) continue;
    const finalistas = [];
    if (v.finalistas && typeof v.finalistas === "object") {
      for (const [pid, f] of Object.entries(v.finalistas)) {
        if (RE_ID.test(pid)) finalistas.push({ pid, orden: f && Number.isFinite(f.orden) ? f.orden : 9999 });
      }
    }
    finalistas.sort((a, b) => (a.orden - b.orden) || a.pid.localeCompare(b.pid));
    if (!finalistas.length) continue;
    lista.push({ id, nombre, orden: Number.isFinite(v.orden) ? v.orden : 9999, tipo: v.tipo === "oro" ? "oro" : "normal", finalistas });
  }
  return ordenarRonda2(lista);
}

// Agregar varios nominados de una sola vez a una categoría.
// Devuelve {cambios, cantidad}: una escritura multi-ruta con los órdenes seguidos a los ya existentes.
// Ignora ids repetidos, ya nominados o que no existen.
export function armarNominados(categoria, pids, personas, espejarRonda1 = false) {
  const existentes = new Set(categoria.nominados.map((n) => n.pid));
  const validos = new Set(personas.map((p) => p.id));
  const nuevos = [];
  for (const pid of pids) {
    if (validos.has(pid) && !existentes.has(pid) && !nuevos.includes(pid)) nuevos.push(pid);
  }
  let orden = proximoOrden(categoria.nominados);
  const cambios = {};
  for (const pid of nuevos) {
    const o = orden++;
    cambios[`awards/admin/categorias/${categoria.id}/nominados/${pid}`] = { orden: o };
    // Si la categoría ya está en la votación pública, el nominado nuevo se refleja ahí en la misma escritura.
    if (espejarRonda1) {
      cambios[`awards/ronda1/${categoria.id}/nominados/${pid}`] = { orden: o };
      cambios[`awards/personas/${pid}/r1`] = true;
    }
  }
  return { cambios, cantidad: nuevos.length };
}


// ════════════════════════════════════════════════════════════
//  Publicación parcial: sumar categorías con la primera votación ya abierta
// ════════════════════════════════════════════════════════════

// Con la votación abierta solo se editan las categorías que todavía no se publicaron
// (así los votos ya emitidos nunca quedan sobre una lista que cambió).
export function categoriaEditable(fase, c, publicadas) {
  const f = leerFase(fase);
  if (f === "configuracion") return true;
  if (f === "ronda1_abierta") return c.tipo === "normal" && !publicadas.has(c.id);
  return false;
}

export function puedeCrearCategoria(fase) {
  const f = leerFase(fase);
  return f === "configuracion" || f === "ronda1_abierta";
}

// Categorías normales con nominados que ya están en la votación pública.
export function categoriasVotadas(categorias, publicadas) {
  return categorias.filter((c) => c.tipo === "normal" && c.nominados.length >= 1 && publicadas.has(c.id));
}

// Categorías normales con nominados que todavía no se publicaron.
export function categoriasPendientes(categorias, publicadas) {
  return categorias.filter((c) => c.tipo === "normal" && c.nominados.length >= 1 && !publicadas.has(c.id));
}

export function validarPublicacionNuevas(categorias, personas, publicadas) {
  const pend = categoriasPendientes(categorias, publicadas);
  if (!pend.length) return { error: "No hay categorías nuevas con nominados para publicar.", avisos: [] };
  const ids = new Set(personas.map((p) => p.id));
  for (const c of pend) {
    if (c.nominados.some((n) => !ids.has(n.pid))) return { error: `«${c.nombre}» tiene nominados que ya no existen.`, avisos: [] };
  }
  const avisos = [];
  const chicas = pend.filter((c) => c.nominados.length < 2);
  if (chicas.length) avisos.push(`Tienen un solo nominado: ${chicas.map((c) => c.nombre).join(", ")}.`);
  const usadas = new Set(pend.flatMap((c) => c.nominados.map((n) => n.pid)));
  const sinFoto = personas.filter((p) => usadas.has(p.id) && !p.foto).length;
  if (sinFoto) avisos.push(`${sinFoto} nominado(s) no tienen foto (se verán con sus iniciales).`);
  return { error: null, avisos };
}

// Una sola escritura atómica: suma las categorías nuevas a la votación (no cambia la etapa ni toca lo ya publicado).
export function armarPublicacionNuevas(categorias, publicadas) {
  const cambios = {};
  const visibles = new Set();
  const ids = [];
  for (const c of categoriasPendientes(categorias, publicadas)) {
    const nominados = {};
    for (const n of c.nominados) { nominados[n.pid] = { orden: n.orden }; visibles.add(n.pid); }
    cambios[`awards/ronda1/${c.id}`] = { nombre: c.nombre, orden: c.orden, nominados };
    ids.push(c.id);
  }
  for (const pid of visibles) cambios[`awards/personas/${pid}/r1`] = true;
  return { cambios, ids, visibles: [...visibles] };
}

// ════════════════════════════════════════════════════════════
//  Reinicio de la primera votación (la segunda es la definitiva y no se reinicia)
// ════════════════════════════════════════════════════════════

export const TEXTO_REINICIO = "REINICIAR";

// Solo se puede reiniciar mientras la segunda votación no empezó.
export function reiniciable(fase) {
  const f = leerFase(fase);
  return f === "ronda1_abierta" || f === "ronda1_cerrada" || f === "finalistas_definidos";
}

// Una sola escritura atómica que deja el sistema listo para abrir la primera votación de nuevo.
// Se conservan categorías, nominados (incluido Burdel de Oro), personas y fotos.
// Se borran: votos, conteo, finalistas y su borrador, lo publicado en la votación pública y las marcas de visibilidad.
// Se sube la «edición» para que los navegadores de los visitantes olviden el voto que recordaban.
export function armarReinicio(pids, edicionNueva) {
  const cambios = {
    "awards/estado": "configuracion",
    "awards/votos1": null,
    "awards/resultados/ronda1": null,
    "awards/admin/seleccion": null,
    "awards/admin/finalistas": null,
    "awards/ronda1": null,
    "awards/edicion": edicionNueva,
  };
  for (const pid of pids) cambios[`awards/personas/${pid}/r1`] = null;
  return cambios;
}

// Contenido del archivo de respaldo que se descarga antes de borrar.
export function armarRespaldo({ fase, edicion, votos1, resultados1, seleccion, finalistas, ronda1 }) {
  return {
    sistema: NOMBRE_OFICIAL,
    tipo: "respaldo de la primera votación",
    exportadoEn: new Date().toISOString(),
    etapa: leerFase(fase),
    edicion: Number.isFinite(edicion) ? edicion : 1,
    votos1: votos1 || null,
    resultados1: resultados1 || null,
    seleccionBorrador: seleccion || null,
    finalistas: finalistas || null,
    categoriasPublicadas: ronda1 || null,
  };
}

// Edición vigente (1 si todavía no existe).
export function leerEdicion(valor) {
  return Number.isInteger(valor) && valor >= 1 && valor <= 1000 ? valor : 1;
}

// Votos recordados en el navegador del visitante: {ed, v:{categoría: persona}}.
// Acepta el formato anterior (solo {categoría: persona}), que se considera de la edición 1.
export function leerVotosLocales(texto) {
  let o = null;
  try { o = JSON.parse(texto || "{}"); } catch (e) { o = null; }
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ed: 1, v: {} };
  if (o.v && typeof o.v === "object" && Number.isInteger(o.ed)) return { ed: o.ed, v: { ...o.v } };
  return { ed: 1, v: { ...o } };
}


// Con la primera votación abierta, las categorías YA publicadas se pueden ampliar (sumar nominados,
// reordenarlos, cambiar nombre u orden). No se pueden quitar nominados ni borrarlas: se perderían votos.
export function categoriaAmpliable(fase, c, publicadas) {
  return leerFase(fase) === "ronda1_abierta" && c.tipo === "normal" && publicadas.has(c.id);
}


// Orden alfabético de los nominados de una categoría (sin distinguir mayúsculas ni acentos).
// Devuelve {pid: nuevoOrden} solo con los que cambian de lugar (órdenes 1..n); vacío si ya estaban ordenados.
export function ordenarAlfabeticamente(nominados, personas) {
  const nombre = (pid) => { const p = personas.find((x) => x.id === pid); return p ? p.nombre : "\uffff"; };
  const lista = [...nominados].sort((a, b) => nombre(a.pid).localeCompare(nombre(b.pid), "es", { sensitivity: "base" }) || a.pid.localeCompare(b.pid));
  const cambios = {};
  lista.forEach((n, i) => { if (n.orden !== i + 1) cambios[n.pid] = i + 1; });
  return cambios;
}
