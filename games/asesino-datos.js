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
  accion: (pid, rid, uid) => `${A}/partidas/${pid}/acciones/${rid}/${uid}`,
  noche: (pid, uid) => `${A}/partidas/${pid}/privado/${uid}/noche`,
  resultados: (pid, uid) => `${A}/partidas/${pid}/privado/${uid}/resultados`,
  controlNoche: (pid, rid) => `${A}/partidas/${pid}/control/noche/${rid}`,
  autoprotecciones: (pid) => `${A}/partidas/${pid}/control/autoprotecciones`,
  voto: (pid, vid, uid) => `${A}/partidas/${pid}/votos/${vid}/${uid}`,
  controlVotacion: (pid, vid) => `${A}/partidas/${pid}/control/votaciones/${vid}`,
  revelacion: (pid) => `${A}/partidas/${pid}/revelacion`,
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


// ═════════════════════════ NOCHE (ETAPA 3) ══════════════════════════════════

/** Acción nocturna que corresponde a cada rol (los demás roles no tienen acción). */
export const TIPO_ACCION = Object.freeze({ asesino: 'matar', medico: 'proteger', detective: 'investigar' });
export function rolTieneAccion(rol) { return Object.prototype.hasOwnProperty.call(TIPO_ACCION, rol); }

/** Roles que actúan de noche, a partir del mapa { uid: {rol} } del conductor. */
export function actoresNocturnos(roles) {
  return Object.entries(roles).filter(([, x]) => x && rolTieneAccion(x.rol)).map(([uid]) => uid);
}

function mapaDeRoles(rolesAdmin) {
  return Object.fromEntries(Object.entries(rolesAdmin).filter(([, x]) => x && x.rol).map(([uid, x]) => [uid, x.rol]));
}

/** Roles → Noche (o Resultado de votación → Noche de la ronda siguiente). */
export async function comenzarNoche(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.ROLES && pub.fase !== R.FASES.RESULTADO_VOTACION) {
    throw new ErrorJuego('Solo se puede empezar una noche después del reparto de roles o de una votación.');
  }
  if (pub.fase === R.FASES.RESULTADO_VOTACION) {
    const { roles, vivos } = await rolesYVivos(b, pid, pub);
    if (R.evaluarVictoria(roles, vivos).terminada) throw new ErrorJuego('La partida ya tiene ganadores: declaralos en lugar de empezar otra noche.');
  }
  const numero = (pub.ronda ?? 0) + 1;
  let rid;
  try { rid = R.rondaId(numero); } catch { throw new ErrorJuego('Se alcanzó el máximo de rondas.'); }
  await aplicarCambioDeFase(b, {
    [`${RUTA.publico(pid)}/fase`]: R.FASES.NOCHE,
    [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
    [`${RUTA.publico(pid)}/ronda`]: numero,
    [`${RUTA.publico(pid)}/rondaId`]: rid,
    [`${RUTA.publico(pid)}/anuncio`]: `Cae la noche (ronda ${numero}). Todos cierran los ojos.`,
    [`${RUTA.publico(pid)}/timer`]: R.timerDetener(),
    [`${RUTA.indicePartida(pid)}/fase`]: R.FASES.NOCHE,
  });
  return rid;
}

/** Acciones de la noche (las puede leer solo el conductor). */
export async function leerAccionesAdmin(b, pid, rondaId, uids) {
  const filas = await Promise.all(uids.map(async (uid) => [uid, await b.leer(RUTA.accion(pid, rondaId, uid))]));
  return Object.fromEntries(filas.filter(([, a]) => a));
}

/** Escucha en vivo qué envió cada actor. cb recibe { uid: {tipo, objetivo} }. */
export function escucharAccionesAdmin(b, pid, rondaId, uids, cb) {
  const estado = {};
  const bajas = uids.map((uid) => b.escuchar(RUTA.accion(pid, rondaId, uid), (v) => {
    if (v) estado[uid] = v; else delete estado[uid];
    cb({ ...estado });
  }, () => {}));
  return () => bajas.forEach((f) => f && f());
}

/** Noche → Cierre de noche: congela las acciones (los jugadores ya no pueden cambiarlas). */
export async function cerrarNoche(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.NOCHE) throw new ErrorJuego('La noche ya no está abierta.');
  await aplicarCambioDeFase(b, {
    [`${RUTA.publico(pid)}/fase`]: R.FASES.CIERRE_NOCHE,
    [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
    [`${RUTA.publico(pid)}/anuncio`]: 'El conductor está procesando la noche…',
    [`${RUTA.indicePartida(pid)}/fase`]: R.FASES.CIERRE_NOCHE,
  });
}

/** Guarda la víctima elegida como borrador (sirve para recuperar si se cierra el navegador). */
export async function guardarBorradorNoche(b, pid, rondaId, victima) {
  await b.escribir(RUTA.controlNoche(pid, rondaId), { victima, estado: 'borrador', actualizadoEn: b.ahora() });
}
export async function leerBorradorNoche(b, pid, rondaId) {
  return b.leer(RUTA.controlNoche(pid, rondaId));
}

/**
 * Cierre de noche → Descubrimiento, TODO en una sola escritura atómica:
 * muerte de la víctima (si no fue protegida), anuncio público, mensaje privado para los asesinos,
 * respuestas del detective, autoprotecciones usadas y cambio de fase.
 * @param {string} victima uid elegido por el conductor, o "ninguna"
 */
export async function procesarNoche(b, pid, victima) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.CIERRE_NOCHE) throw new ErrorJuego('Primero hay que cerrar la noche.');
  const uids = Object.keys(pub.jugadores || {});
  const rolesAdmin = await leerRolesAdmin(b, pid, uids);
  const roles = mapaDeRoles(rolesAdmin);
  const vivos = R.vivosDe(pub.jugadores);
  if (victima !== R.SIN_VICTIMA && !vivos.includes(victima)) throw new ErrorJuego('La víctima elegida no es un jugador vivo.');

  const actores = vivos.filter((u) => rolTieneAccion(roles[u]));
  const acciones = await leerAccionesAdmin(b, pid, pub.rondaId, actores);
  const autoprotecciones = (await b.leer(RUTA.autoprotecciones(pid))) || {};
  const nicks = Object.fromEntries(uids.map((u) => [u, pub.jugadores[u].nick]));

  const out = R.resolverNoche({ rondaId: pub.rondaId, roles, vivos, nicks, victima, acciones, autoprotecciones });

  const updates = {};
  for (const muerto of out.muertos) updates[`${RUTA.publico(pid)}/jugadores/${muerto}/vivo`] = false;
  for (const uid of out.destinatariosAsesinos) updates[`${RUTA.noche(pid, uid)}/${pub.rondaId}`] = R.recortarAnuncio(out.mensajeAsesinos).slice(0, 300);
  for (const inv of out.investigaciones) {
    updates[`${RUTA.resultados(pid, inv.detective)}/${pub.rondaId}`] = { objetivo: inv.objetivo, objetivoNick: inv.objetivoNick, esAsesino: inv.esAsesino };
  }
  for (const [uid, rid] of Object.entries(out.nuevasAutoprotecciones)) updates[`${RUTA.autoprotecciones(pid)}/${uid}`] = rid;
  updates[RUTA.controlNoche(pid, pub.rondaId)] = { victima, estado: 'aplicada', actualizadoEn: b.ahora() };
  updates[`${RUTA.publico(pid)}/anuncio`] = R.recortarAnuncio(out.anuncio);
  updates[`${RUTA.publico(pid)}/fase`] = R.FASES.DESCUBRIMIENTO;
  updates[`${RUTA.publico(pid)}/seq`] = pub.seq + 1;
  updates[`${RUTA.indicePartida(pid)}/fase`] = R.FASES.DESCUBRIMIENTO;
  await aplicarCambioDeFase(b, updates);
  return { resultado: out, victoria: R.evaluarVictoria(roles, out.vivosDespues) };
}

/**
 * Reconstruye el resultado de una noche ya procesada (por si el conductor recarga la página).
 * Se deduce de: víctima elegida, quién sigue vivo y las respuestas guardadas de los detectives.
 */
export async function leerResultadoNoche(b, pid, pub, rolesAdmin) {
  const rid = pub.rondaId;
  const reg = await b.leer(RUTA.controlNoche(pid, rid));
  if (!reg || reg.estado !== 'aplicada') return null;
  const roles = mapaDeRoles(rolesAdmin);
  const victima = reg.victima;
  const sigueVivo = victima !== R.SIN_VICTIMA && pub.jugadores?.[victima]?.vivo === true;
  const detectives = Object.keys(roles).filter((u) => roles[u] === R.ROLES.DETECTIVE);
  const investigaciones = [];
  for (const d of detectives) {
    let r = null;
    try { r = await b.leer(`${RUTA.resultados(pid, d)}/${rid}`); } catch { r = null; }
    if (r) investigaciones.push({ detective: d, objetivo: r.objetivo, objetivoNick: r.objetivoNick, esAsesino: r.esAsesino });
  }
  const vivos = R.vivosDe(pub.jugadores);
  return {
    rondaId: rid, victima, exito: victima !== R.SIN_VICTIMA && !sigueVivo, protegida: sigueVivo,
    investigaciones, victoria: R.evaluarVictoria(roles, vivos),
  };
}

// ───── Jugador: acción de la noche ─────

/**
 * Envía (o cambia, mientras la noche siga abierta) la acción del rol.
 * @param {string[]} vivos uids vivos (para validar antes de escribir)
 */
export async function enviarAccion(b, pid, { rondaId, uid, rol, objetivo, vivos }) {
  if (!rolTieneAccion(rol)) throw new ErrorJuego('Tu personaje no tiene acción de noche.');
  if (!vivos.includes(objetivo)) throw new ErrorJuego('Esa persona ya no está en juego.');
  if (objetivo === uid && rol !== R.ROLES.MEDICO) throw new ErrorJuego('No podés elegirte a vos mismo.');
  try {
    await b.escribir(RUTA.accion(pid, rondaId, uid), { tipo: TIPO_ACCION[rol], objetivo });
  } catch (e) {
    if (esPermisoDenegado(e)) {
      throw new ErrorJuego(objetivo === uid
        ? 'No se pudo enviar. Si te elegiste a vos mismo, puede que ya hayas usado tu autoprotección (solo una vez por partida), o que la noche ya se haya cerrado.'
        : 'No se pudo enviar: puede que la noche ya se haya cerrado.', 'accion');
    }
    throw e;
  }
}

export function escucharMiAccion(b, pid, rondaId, uid, cb) { return b.escuchar(RUTA.accion(pid, rondaId, uid), cb, () => cb(null)); }
/** Mensajes privados de la noche (asesinos): { rondaId: texto }. Solo lo lee quien sigue vivo. */
export function escucharMiNoche(b, pid, uid, cb) { return b.escuchar(RUTA.noche(pid, uid), cb, () => cb(null)); }
/** Respuestas del detective: { rondaId: {objetivoNick, esAsesino} }. Solo lo lee quien sigue vivo. */
export function escucharMisResultados(b, pid, uid, cb) { return b.escuchar(RUTA.resultados(pid, uid), cb, () => cb(null)); }


// ═════════════════════════ INTERROGATORIOS, VOTACIÓN Y VICTORIA (ETAPA 4) ═══

/** Roles de todos { uid: rol } (solo el conductor los puede leer). */
async function rolesYVivos(b, pid, pub) {
  const rolesAdmin = await leerRolesAdmin(b, pid, Object.keys(pub.jugadores || {}));
  const roles = mapaDeRoles(rolesAdmin);
  return { rolesAdmin, roles, vivos: R.vivosDe(pub.jugadores) };
}

/** Estado de victoria actual de una partida (para el panel del conductor). */
export function victoriaActual(pub, rolesAdmin) {
  return R.evaluarVictoria(mapaDeRoles(rolesAdmin), R.vivosDe(pub.jugadores));
}

/** Descubrimiento → Interrogatorios (si la partida no terminó). */
export async function comenzarInterrogatorios(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.DESCUBRIMIENTO) throw new ErrorJuego('Los interrogatorios empiezan después del descubrimiento.');
  const { roles, vivos } = await rolesYVivos(b, pid, pub);
  if (R.evaluarVictoria(roles, vivos).terminada) throw new ErrorJuego('La partida ya tiene ganadores: declaralos en lugar de seguir.');
  await aplicarCambioDeFase(b, {
    [`${RUTA.publico(pid)}/fase`]: R.FASES.INTERROGATORIOS,
    [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
    [`${RUTA.publico(pid)}/anuncio`]: 'Comienzan los interrogatorios. Esperá a que el conductor te dé la palabra.',
    [`${RUTA.publico(pid)}/timer`]: R.timerDetener(),
    [`${RUTA.indicePartida(pid)}/fase`]: R.FASES.INTERROGATORIOS,
  });
}

/** Cambia el anuncio público (por ejemplo, para abrir el debate). */
export async function anunciar(b, pid, texto) {
  const t = String(texto ?? '').trim();
  if (!t) throw new ErrorJuego('El anuncio no puede estar vacío.');
  await b.escribir(`${RUTA.publico(pid)}/anuncio`, R.recortarAnuncio(t));
}

/** Da la palabra a un jugador: anuncia su turno y arranca el temporizador de coartada. Nada avanza solo. */
export async function darLaPalabra(b, pid, { uid, numero, total }) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub || pub.fase !== R.FASES.INTERROGATORIOS) throw new ErrorJuego('No estamos en interrogatorios.');
  const j = pub.jugadores?.[uid];
  if (!j || !j.vivo) throw new ErrorJuego('Ese jugador no está en juego.');
  const seg = pub.config.tiempos.coartada;
  await b.actualizar({
    [`${RUTA.publico(pid)}/anuncio`]: R.recortarAnuncio(`Turno de ${j.nick} (${numero} de ${total}). Tiene ${seg} segundos para dar su coartada.`),
    [`${RUTA.publico(pid)}/timer`]: R.timerIniciar(seg, b.ahora()),
  });
}

/** Controles del temporizador: pausar, reanudar, detener o iniciar uno de N segundos. */
export async function controlarTimer(b, pid, accion, segundos) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  const t = pub.timer || R.timerDetener();
  const ahora = b.ahora();
  let nuevo;
  if (accion === 'pausar') nuevo = R.timerPausar(t, ahora);
  else if (accion === 'reanudar') nuevo = R.timerReanudar(t, ahora);
  else if (accion === 'detener') nuevo = R.timerDetener();
  else if (accion === 'iniciar') {
    if (!Number.isFinite(segundos) || segundos < 5 || segundos > 900) throw new ErrorJuego('El tiempo debe estar entre 5 y 900 segundos.');
    nuevo = R.timerIniciar(segundos, ahora);
  } else throw new ErrorJuego('Acción de temporizador desconocida.');
  await b.escribir(`${RUTA.publico(pid)}/timer`, nuevo);
}

/** Interrogatorios → Votación (primera votación de la ronda, entre todos los vivos). */
export async function abrirVotacion(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.INTERROGATORIOS) throw new ErrorJuego('La votación se abre después de los interrogatorios.');
  const vivos = R.vivosDe(pub.jugadores);
  if (vivos.length < 2) throw new ErrorJuego('Hacen falta al menos dos jugadores vivos para votar.');
  const vid = R.votacionId(pub.ronda, 1);
  await aplicarCambioDeFase(b, {
    [`${RUTA.publico(pid)}/votacion`]: { id: vid, abierta: true, candidatos: Object.fromEntries(vivos.map((u) => [u, true])) },
    [RUTA.controlVotacion(pid, vid)]: { rondaId: pub.rondaId, numero: 1, estado: 'abierta', creadaEn: b.ahora() },
    [`${RUTA.publico(pid)}/fase`]: R.FASES.VOTACION,
    [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
    [`${RUTA.publico(pid)}/anuncio`]: 'Se abrió la votación. Cada jugador vivo vota en privado a quien cree que es el asesino.',
    [`${RUTA.publico(pid)}/timer`]: R.timerIniciar(pub.config.tiempos.votacion, b.ahora()),
    [`${RUTA.indicePartida(pid)}/fase`]: R.FASES.VOTACION,
  });
  return vid;
}

/** Votos de la votación actual (solo el conductor los ve). cb recibe { uid: objetivo }. */
export function escucharVotosAdmin(b, pid, vid, uids, cb) {
  const estado = {};
  const bajas = uids.map((uid) => b.escuchar(RUTA.voto(pid, vid, uid), (v) => {
    if (v) estado[uid] = v.objetivo; else delete estado[uid];
    cb({ ...estado });
  }, () => {}));
  return () => bajas.forEach((f) => f && f());
}

/** Voto definitivo del jugador (uno por votación; sin autovoto ni voto en blanco). */
export async function enviarVoto(b, pid, { vid, uid, objetivo, candidatos }) {
  if (!candidatos.includes(objetivo)) throw new ErrorJuego('Esa persona no es candidata en esta votación.');
  if (objetivo === uid) throw new ErrorJuego('No podés votarte a vos mismo.');
  try {
    await b.escribir(RUTA.voto(pid, vid, uid), { objetivo });
  } catch (e) {
    if (esPermisoDenegado(e)) throw new ErrorJuego('No se pudo registrar tu voto: la votación puede haberse cerrado o ya votaste.', 'voto');
    throw e;
  }
}
export function escucharMiVoto(b, pid, vid, uid, cb) { return b.escuchar(RUTA.voto(pid, vid, uid), (v) => cb(v ? v.objetivo : null), () => cb(null)); }

/** Cierra la votación (nadie puede votar más) sin cambiar de fase. */
export async function cerrarVotacion(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.VOTACION || !pub.votacion?.abierta) throw new ErrorJuego('No hay una votación abierta.');
  await b.actualizar({
    [`${RUTA.publico(pid)}/votacion/abierta`]: false,
    [`${RUTA.publico(pid)}/timer`]: R.timerDetener(),
    [`${RUTA.publico(pid)}/anuncio`]: 'Se cerró la votación. El conductor está contando los votos.',
    [`${RUTA.controlVotacion(pid, pub.votacion.id)}/estado`]: 'cerrada',
  });
}

/**
 * Cuenta los votos de una votación cerrada.
 *  • Empate en la 1ª votación → se abre la 2ª solo entre los empatados.
 *  • Si no, queda un eliminado (o nadie, si hay empate en la 2ª o nadie votó) y se pasa al resultado.
 */
export async function escrutarVotacion(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.VOTACION) throw new ErrorJuego('No estamos en una votación.');
  if (!pub.votacion || pub.votacion.abierta) throw new ErrorJuego('Primero cerrá la votación.');
  const vid = pub.votacion.id;
  const numero = Number(vid.slice(-1));
  const vivos = R.vivosDe(pub.jugadores);
  const votos = {};
  await Promise.all(vivos.map(async (u) => { const v = await b.leer(RUTA.voto(pid, vid, u)); if (v) votos[u] = v.objetivo; }));
  const nicks = Object.fromEntries(Object.keys(pub.jugadores).map((u) => [u, pub.jugadores[u].nick]));
  const res = R.escrutar({ votos, candidatos: Object.keys(pub.votacion.candidatos), votantes: vivos, numero });
  const texto = R.recortarAnuncio(R.textoResultadoVotacion(res, nicks));

  if (res.segundaVotacion) {
    const vid2 = R.votacionId(pub.ronda, 2);
    await aplicarCambioDeFase(b, {
      [`${RUTA.publico(pid)}/votacion`]: { id: vid2, abierta: true, candidatos: Object.fromEntries(res.candidatosSegunda.map((u) => [u, true])) },
      [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
      [`${RUTA.publico(pid)}/anuncio`]: texto,
      [`${RUTA.publico(pid)}/timer`]: R.timerIniciar(pub.config.tiempos.votacion, b.ahora()),
      [`${RUTA.controlVotacion(pid, vid)}/estado`]: 'escrutada',
      [RUTA.controlVotacion(pid, vid2)]: { rondaId: pub.rondaId, numero: 2, estado: 'abierta', creadaEn: b.ahora() },
    });
    return { res, segundaVotacion: true, victoria: null };
  }

  const updates = {
    [`${RUTA.publico(pid)}/votacion/resultado`]: R.resultadoPublicoVotacion(res),
    [`${RUTA.publico(pid)}/fase`]: R.FASES.RESULTADO_VOTACION,
    [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
    [`${RUTA.publico(pid)}/anuncio`]: texto,
    [`${RUTA.publico(pid)}/timer`]: R.timerDetener(),
    [`${RUTA.controlVotacion(pid, vid)}/estado`]: 'escrutada',
    [`${RUTA.indicePartida(pid)}/fase`]: R.FASES.RESULTADO_VOTACION,
  };
  if (res.eliminado) updates[`${RUTA.publico(pid)}/jugadores/${res.eliminado}/vivo`] = false;
  await aplicarCambioDeFase(b, updates);
  const { roles } = await rolesYVivos(b, pid, pub);
  const vivosDespues = vivos.filter((u) => u !== res.eliminado);
  return { res, segundaVotacion: false, victoria: R.evaluarVictoria(roles, vivosDespues) };
}

/**
 * Declara el fin de la partida cuando se cumplió una condición de victoria
 * (desde Descubrimiento o Resultado de la votación). Guarda el ganador y los roles para la revelación.
 */
export async function finalizarPartida(b, pid) {
  const pub = await b.leer(RUTA.publico(pid));
  if (!pub) throw new ErrorJuego('La partida no existe.');
  if (pub.fase !== R.FASES.DESCUBRIMIENTO && pub.fase !== R.FASES.RESULTADO_VOTACION) {
    throw new ErrorJuego('La partida solo puede terminar después del descubrimiento o de una votación.');
  }
  const { roles, vivos } = await rolesYVivos(b, pid, pub);
  const v = R.evaluarVictoria(roles, vivos);
  if (!v.terminada) throw new ErrorJuego('Todavía no se cumplió ninguna condición de victoria.');
  const revelacionRoles = Object.fromEntries(Object.keys(pub.jugadores).map((u) => [u, { nick: pub.jugadores[u].nick, rol: roles[u], vivo: pub.jugadores[u].vivo === true }]));
  await aplicarCambioDeFase(b, {
    [RUTA.revelacion(pid)]: { ganador: v.ganador, roles: revelacionRoles },
    [`${RUTA.publico(pid)}/resultado`]: { ganador: v.ganador },
    [`${RUTA.publico(pid)}/fase`]: R.FASES.FINALIZADA,
    [`${RUTA.publico(pid)}/seq`]: pub.seq + 1,
    [`${RUTA.publico(pid)}/anuncio`]: R.textoVictoria(v.ganador),
    [`${RUTA.publico(pid)}/timer`]: R.timerDetener(),
    [`${RUTA.indicePartida(pid)}/fase`]: R.FASES.FINALIZADA,
  });
  return v;
}

/** Revelación final (solo se puede leer cuando la partida está finalizada). */
export function escucharRevelacion(b, pid, cb) { return b.escuchar(RUTA.revelacion(pid), cb, () => cb(null)); }
