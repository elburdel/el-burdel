// games/asesino-datos.js
// ─────────────────────────────────────────────────────────────────────────────
// «El asesino está entre nosotros» — CAPA DE DATOS (Etapa 2)
//
// Todo lo que habla con Firebase pasa por acá, a través de un "backend" con esta forma:
//   uid()                      → uid del usuario actual
//   ahora()                    → hora del servidor (ms)
//   leer(path)                 → Promise<valor|null>
//   escuchar(path, cb, errCb)  → función para dejar de escuchar
//   escribir(path, valor)      → Promise
//   actualizar({ruta: valor})  → Promise (multi-ruta, atómico; null borra)
//   nuevaClave(path)           → clave nueva (push id)
//
// Hay dos backends: el real (Firebase, más abajo) y el modo demo (games/asesino-demo.js).
// Las funciones de este archivo no saben cuál están usando.
//
// IMPORTANTE: el código solo lee y escribe en las rutas que permite el bloque de reglas
// `asesino`: nunca lee un nodo padre (partidas, privado, acciones…), siempre hojas/unidades.
// ─────────────────────────────────────────────────────────────────────────────
import * as R from './asesino-reglas.js';

export class ErrorJuego extends Error {
  constructor(mensaje, codigo = 'juego') { super(mensaje); this.name = 'ErrorJuego'; this.codigo = codigo; }
}

export function esPermisoDenegado(e) {
  return e?.code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(String(e?.message ?? ''));
}

// ═════════════════════════ RUTAS ════════════════════════════════════════════
const A = 'asesino';
export const RUTA = Object.freeze({
  indice: `${A}/indice`,
  indicePartida: (pid) => `${A}/indice/${pid}`,
  invitaciones: (uid) => `${A}/invitaciones/${uid}`,
  invitacion: (uid, pid) => `${A}/invitaciones/${uid}/${pid}`,
  miembro: (pid, uid) => `${A}/partidas/${pid}/miembros/${uid}`,
  publico: (pid) => `${A}/partidas/${pid}/publico`,
  listo: (pid, uid) => `${A}/partidas/${pid}/listos/${uid}`,
  rol: (pid, uid) => `${A}/partidas/${pid}/privado/${uid}/rol`,
  equipo: (pid, uid) => `${A}/partidas/${pid}/privado/${uid}/equipo`,
  distribucion: (pid) => `${A}/partidas/${pid}/control/distribucion`,
  sesion: (pid) => `${A}/partidas/${pid}/control/sesion`,
});

const UID_RE = /^[A-Za-z0-9]{1,40}$/;
const ALFABETO = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function generarSesionId(largo = 16) {
  let s = '';
  for (let i = 0; i < largo; i++) s += ALFABETO[R.enteroAleatorio(ALFABETO.length)];
  return s;
}

// ═════════════════════════ BACKEND REAL (FIREBASE) ══════════════════════════
// Los imports son dinámicos para que este archivo se pueda cargar sin conexión (pruebas, modo demo).
export async function crearBackendFirebase() {
  const [{ auth, db }, fb] = await Promise.all([
    import('../js/firebase-init.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'),
  ]);
  const { ref, get, set, update, onValue, push } = fb;
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  return {
    modo: 'firebase',
    uid: () => auth.currentUser?.uid ?? null,
    ahora: () => Date.now() + offset,
    async leer(path) { return (await get(ref(db, path))).val(); },
    escuchar(path, cb, errCb) { return onValue(ref(db, path), (s) => cb(s.val()), (e) => errCb && errCb(e)); },
    async escribir(path, valor) { await set(ref(db, path), valor); },
    async actualizar(updates) { await update(ref(db), updates); },
    nuevaClave(path) { return push(ref(db, path)).key; },
  };
}

// ═════════════════════════ CONDUCTOR ════════════════════════════════════════

/** Usuarios que se pueden invitar: activos y que no son el admin. */
export async function listarUsuariosHabilitados(b) {
  const users = (await b.leer('users')) || {};
  return Object.entries(users)
    .filter(([uid, u]) => u && u.status === 'active' && u.role !== 'admin' && UID_RE.test(uid))
    .map(([uid, u]) => ({ uid, nick: R.nickSeguro(u.nick) }))
    .sort((x, y) => x.nick.localeCompare(y.nick, 'es', { sensitivity: 'base' }));
}

/** Partidas del índice, la más nueva primero. */
export async function listarPartidas(b) {
  const idx = (await b.leer(RUTA.indice)) || {};
  return Object.entries(idx)
    .map(([pid, p]) => ({ pid, nombre: p.nombre, fase: p.fase, creadaEn: p.creadaEn }))
    .sort((x, y) => (y.creadaEn || 0) - (x.creadaEn || 0));
}

function limpiarDistribucion(dist) {
  return Object.fromEntries(R.CLAVES_DISTRIBUCION.map((k) => [k, dist[k]]));
}

/**
 * Crea la partida, las invitaciones y la configuración.
 * Son DOS escrituras porque la regla de `control/distribucion` compara la suma con
 * `publico/config/cantidad`, y esa lectura solo ve lo que ya existía antes de la escritura.
 * Si la segunda falla, la partida queda creada sin distribución: se puede fijar desde el panel.
 */
export async function crearPartida(b, { nombre, miembros, distribucion, tiempos }) {
  const nom = R.validarNombrePartida(nombre);
  if (!nom.ok) throw new ErrorJuego(nom.error);
  if (!Array.isArray(miembros)) throw new ErrorJuego('Faltan los participantes.');
  const n = miembros.length;
  if (!R.cantidadValida(n)) throw new ErrorJuego(`Tiene que haber entre ${R.MIN_JUGADORES} y ${R.MAX_JUGADORES} participantes (elegiste ${n}).`);
  const uids = miembros.map((m) => m.uid);
  if (new Set(uids).size !== n) throw new ErrorJuego('Hay participantes repetidos.');
  if (!uids.every((u) => UID_RE.test(u))) throw new ErrorJuego('Hay un participante con un identificador inválido.');
  const vd = R.validarDistribucion(distribucion, n);
  if (!vd.ok) throw new ErrorJuego('Distribución inválida: ' + vd.errores.join(' '));
  const vt = R.validarTiempos(tiempos);
  if (!vt.ok) throw new ErrorJuego(vt.errores.join(' '));

  const pid = b.nuevaClave(`${A}/partidas`);
  const ahora = b.ahora();
  const dist = limpiarDistribucion(distribucion);

  const paso1 = {};
  paso1[RUTA.publico(pid)] = {
    nombre: nom.nombre, creadaEn: ahora, fase: R.FASES.PREPARACION, rondaId: R.rondaId(0), ronda: 0, seq: 0,
    anuncio: 'La partida está en preparación. Esperá a que el conductor la inicie.',
    config: { cantidad: n, tiempos: { coartada: Number(tiempos.coartada), votacion: Number(tiempos.votacion) } },
    jugadores: Object.fromEntries(miembros.map((m) => [m.uid, { nick: R.nickSeguro(m.nick), vivo: true }])),
  };
  paso1[RUTA.indicePartida(pid)] = { nombre: nom.nombre, fase: R.FASES.PREPARACION, creadaEn: ahora };
  for (const uid of uids) {
    paso1[RUTA.miembro(pid, uid)] = true;
    paso1[RUTA.invitacion(uid, pid)] = { nombre: nom.nombre, creadaEn: ahora };
  }
  await b.actualizar(paso1);

  const paso2 = {};
  paso2[RUTA.distribucion(pid)] = dist;
  paso2[RUTA.sesion(pid)] = { id: generarSesionId(), vistoEn: ahora };
  await b.actualizar(paso2);
  return pid;
}

/** Lee lo necesario para pintar el panel de una partida (solo unidades permitidas). */
export async function leerPartidaAdmin(b, pid) {
  const [publico, distribucion] = await Promise.all([b.leer(RUTA.publico(pid)), b.leer(RUTA.distribucion(pid))]);
  return { publico, distribucion };
}

/** Escucha las marcas "listo" de cada jugador. cb recibe { uid: boolean }. */
export function escucharListos(b, pid, uids, cb) {
  const estado = Object.fromEntries(uids.map((u) => [u, false]));
  const bajas = uids.map((uid) => b.escuchar(RUTA.listo(pid, uid), (v) => { estado[uid] = v === true; cb({ ...estado }); }, () => {}));
  return () => bajas.forEach((f) => f && f());
}

/** Roles y equipos de todos (el conductor puede leerlos; nadie más). */
export async function leerRolesAdmin(b, pid, uids) {
  const filas = await Promise.all(uids.map(async (uid) => {
    const [rol, equipo] = await Promise.all([b.leer(RUTA.rol(pid, uid)), b.leer(RUTA.equipo(pid, uid))]);
    return [uid, { rol, equipo }];
  }));
  return Object.fromEntries(filas);
}

/** Cambia distribución y tiempos mientras la partida sigue en preparación. */
export async function guardarConfiguracion(b, pid, { distribucion, tiempos }) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.PREPARACION) throw new ErrorJuego('Solo se puede cambiar la configuración durante la preparación.');
  const n = Object.keys(pub.jugadores || {}).length;
  const vd = R.validarDistribucion(distribucion, n);
  if (!vd.ok) throw new ErrorJuego('Distribución inválida: ' + vd.errores.join(' '));
  const vt = R.validarTiempos(tiempos);
  if (!vt.ok) throw new ErrorJuego(vt.errores.join(' '));
  await b.actualizar({
    [RUTA.distribucion(pid)]: limpiarDistribucion(distribucion),
    [`${RUTA.publico(pid)}/config/tiempos`]: { coartada: Number(tiempos.coartada), votacion: Number(tiempos.votacion) },
  });
}

async function aplicarCambioDeFase(b, updates) {
  try { await b.actualizar(updates); } catch (e) {
    if (esPermisoDenegado(e)) {
      throw new ErrorJuego('No se pudo aplicar el cambio: otra pestaña del conductor ya lo hizo, o la fase cambió. Recargá la partida.', 'concurrencia');
    }
    throw e;
  }
}

/** Preparación → Roles: sortea los roles y los guarda en privado, todo en una sola escritura atómica. */
export async function iniciarPartida(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.PREPARACION) throw new ErrorJuego('La partida ya no está en preparación.');
  const dist = await b.leer(RUTA.distribucion(pid));
  if (!dist) throw new ErrorJuego('Falta la distribución de roles: guardala antes de iniciar.');
  const uids = Object.keys(pub.jugadores || {});
  if (uids.length !== pub.config.cantidad) throw new ErrorJuego('La cantidad de jugadores no coincide con la configurada.');
  const v = R.validarDistribucion(dist, uids.length);
  if (!v.ok) throw new ErrorJuego('Distribución inválida: ' + v.errores.join(' '));

  const nicks = Object.fromEntries(uids.map((u) => [u, pub.jugadores[u].nick]));
  const asignacion = R.asignarRoles(uids, dist);
  const equipos = R.equiposPrivados(asignacion, nicks);

  const updates = {};
  for (const uid of uids) {
    updates[RUTA.rol(pid, uid)] = asignacion[uid];
    if (equipos[uid]) updates[RUTA.equipo(pid, uid)] = equipos[uid];
  }
  updates[`${RUTA.publico(pid)}/fase`] = R.FASES.ROLES;
  updates[`${RUTA.publico(pid)}/seq`] = pub.seq + 1;
  updates[`${RUTA.publico(pid)}/anuncio`] = 'Los roles fueron repartidos. Mirá tu personaje en privado.';
  updates[`${RUTA.indicePartida(pid)}/fase`] = R.FASES.ROLES;
  await aplicarCambioDeFase(b, updates);
  return asignacion;
}

/** Cancela la partida (desde cualquier fase no terminal). */
export async function cancelarPartida(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (!R.transicionPermitida(pub.fase, R.FASES.CANCELADA)) throw new ErrorJuego('Esta partida ya terminó.');
  await aplicarCambioDeFase(b, {
    [`${RUTA.publico(pid)}/fase`]: R.FASES.CANCELADA,
    [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
    [`${RUTA.publico(pid)}/anuncio`]: 'La partida fue cancelada por el conductor.',
    [`${RUTA.publico(pid)}/resultado`]: { ganador: 'cancelada' },
    [`${RUTA.indicePartida(pid)}/fase`]: R.FASES.CANCELADA,
  });
}

// ═════════════════════════ JUGADOR ══════════════════════════════════════════

/** Invitaciones del usuario: { pid: {nombre, creadaEn} } (solo las suyas). */
export async function leerInvitaciones(b, uid) {
  return (await b.leer(RUTA.invitaciones(uid))) || {};
}

/** Lee `publico` de una partida; devuelve null si no existe o no se puede leer. */
export async function leerPublicoSeguro(b, pid) {
  try { return await b.leer(RUTA.publico(pid)); } catch (e) { if (esPermisoDenegado(e)) return null; throw e; }
}

export function escucharPublico(b, pid, cb, errCb) { return b.escuchar(RUTA.publico(pid), cb, errCb); }
export function escucharMiListo(b, pid, uid, cb) { return b.escuchar(RUTA.listo(pid, uid), (v) => cb(v === true), () => {}); }
export function escucharMiRol(b, pid, uid, cb) { return b.escuchar(RUTA.rol(pid, uid), cb, () => cb(null)); }
/** El equipo solo lo puede leer quien sigue vivo: si no, se informa null. */
export function escucharMiEquipo(b, pid, uid, cb) { return b.escuchar(RUTA.equipo(pid, uid), cb, () => cb(null)); }

export async function marcarListo(b, pid, uid, valor) {
  await b.escribir(RUTA.listo(pid, uid), !!valor);
}
