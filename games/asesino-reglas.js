// games/asesino-reglas.js
// ─────────────────────────────────────────────────────────────────────────────
// «El asesino está entre nosotros» — LÓGICA PURA DEL JUEGO (Etapa 1)
//
// Este módulo NO usa Firebase, ni el DOM, ni ningún otro archivo de El Burdel.
// Solo recibe datos y devuelve datos, así se puede probar sin conexión y se
// reutiliza igual en el panel del conductor, en la interfaz de los jugadores
// y en el modo demo.
//
// Lo que está acá DEBE coincidir con el bloque de reglas `asesino`
// (asesino-bloque-reglas.json): cantidad 5–30, claves de la distribución,
// formato de rondaId/votacionId, orden de fases y formas de los datos.
// ─────────────────────────────────────────────────────────────────────────────

// ═════════════════════════ 1. CONSTANTES ═════════════════════════════════════

/** Límites de participantes (el conductor no cuenta). Para ampliar: cambiar acá,
 *  agregar una fila a TABLA_DISTRIBUCION y actualizar el máximo en las reglas. */
export const MIN_JUGADORES = 5;
export const MAX_JUGADORES = 30;

export const ROLES = Object.freeze({
  ASESINO: 'asesino',
  COMPLICE: 'complice',
  DETECTIVE: 'detective',
  MEDICO: 'medico',
  TESTIGO: 'testigo',
  SOSPECHOSO: 'sospechoso',
});
export const ROLES_LISTA = Object.freeze(Object.values(ROLES));

/** Claves de `control/distribucion` (mismas que exigen las reglas). */
export const CLAVES_DISTRIBUCION = Object.freeze([
  'asesinos', 'complices', 'detectives', 'medicos', 'testigos', 'sospechosos',
]);
const ROL_A_CLAVE = Object.freeze({
  asesino: 'asesinos', complice: 'complices', detective: 'detectives',
  medico: 'medicos', testigo: 'testigos', sospechoso: 'sospechosos',
});

export const EQUIPOS = Object.freeze({ ASESINOS: 'asesinos', INOCENTES: 'inocentes' });

/** Equipo de un rol: asesino y cómplice juegan juntos; el resto son inocentes. */
export function equipoDe(rol) {
  return rol === ROLES.ASESINO || rol === ROLES.COMPLICE ? EQUIPOS.ASESINOS : EQUIPOS.INOCENTES;
}

// ─── Fases (idénticas a las reglas) ───
export const FASES = Object.freeze({
  PREPARACION: 'preparacion',
  ROLES: 'roles',
  NOCHE: 'noche',
  CIERRE_NOCHE: 'cierre_noche',
  DESCUBRIMIENTO: 'descubrimiento',
  INTERROGATORIOS: 'interrogatorios',
  VOTACION: 'votacion',
  RESULTADO_VOTACION: 'resultado_votacion',
  FINALIZADA: 'finalizada',
  CANCELADA: 'cancelada',
});
export const FASES_LISTA = Object.freeze(Object.values(FASES));

/** Transiciones legales. Las reglas de Firebase validan exactamente este grafo. */
export const GRAFO_FASES = Object.freeze({
  preparacion: ['roles', 'cancelada'],
  roles: ['noche', 'cancelada'],
  noche: ['cierre_noche', 'cancelada'],
  cierre_noche: ['descubrimiento', 'cancelada'],
  descubrimiento: ['interrogatorios', 'finalizada', 'cancelada'],
  interrogatorios: ['votacion', 'cancelada'],
  votacion: ['resultado_votacion', 'cancelada'],
  resultado_votacion: ['noche', 'finalizada', 'cancelada'],
  finalizada: [],
  cancelada: [],
});

export function transicionPermitida(desde, hacia) {
  return Array.isArray(GRAFO_FASES[desde]) && GRAFO_FASES[desde].includes(hacia);
}
export function esFaseTerminal(fase) {
  return fase === FASES.FINALIZADA || fase === FASES.CANCELADA;
}

export const ETIQUETA_FASE = Object.freeze({
  preparacion: 'Preparación',
  roles: 'Reparto de roles',
  noche: 'Noche',
  cierre_noche: 'Procesando la noche',
  descubrimiento: 'Descubrimiento',
  interrogatorios: 'Interrogatorios',
  votacion: 'Votación',
  resultado_votacion: 'Resultado de la votación',
  finalizada: 'Partida finalizada',
  cancelada: 'Partida cancelada',
});

// ─── Identificadores (mismos formatos que las reglas) ───
export const RONDA_ID_RE = /^r[0-9]{1,3}$/;
export const VOTACION_ID_RE = /^r[0-9]{1,3}v[12]$/;
export const MAX_RONDAS = 999;

export function rondaId(numero) {
  if (!Number.isInteger(numero) || numero < 0 || numero > MAX_RONDAS) {
    throw new RangeError(`Número de ronda inválido: ${numero}`);
  }
  return `r${numero}`;
}
export function votacionId(numeroRonda, numeroVotacion) {
  if (numeroVotacion !== 1 && numeroVotacion !== 2) {
    throw new RangeError('La votación solo puede ser la 1 o la 2 (desempate).');
  }
  return `${rondaId(numeroRonda)}v${numeroVotacion}`;
}

export const SIN_VICTIMA = 'ninguna';
export const SIN_ELIMINADO = 'ninguno';

// ═════════════════════════ 2. CANTIDAD Y DISTRIBUCIÓN ════════════════════════

export function cantidadValida(n) {
  return Number.isInteger(n) && n >= MIN_JUGADORES && n <= MAX_JUGADORES;
}
function exigirCantidad(n) {
  if (!cantidadValida(n)) {
    throw new RangeError(`La cantidad de jugadores debe ser un entero entre ${MIN_JUGADORES} y ${MAX_JUGADORES} (recibido: ${n}).`);
  }
}

/** Distribución propuesta por rango. El resto siempre son sospechosos.
 *  Para ampliar el máximo en el futuro: agregar filas acá. */
const TABLA_DISTRIBUCION = [
  { hasta: 7,  asesinos: 1, complices: 0, detectives: 1, medicos: 1, testigos: 0 },
  { hasta: 15, asesinos: 1, complices: 1, detectives: 1, medicos: 1, testigos: 1 },
  { hasta: 20, asesinos: 2, complices: 1, detectives: 1, medicos: 1, testigos: 1 },
  { hasta: 25, asesinos: 3, complices: 2, detectives: 2, medicos: 1, testigos: 1 },
  { hasta: 30, asesinos: 3, complices: 2, detectives: 2, medicos: 2, testigos: 1 },
];

export function distribucionPorDefecto(n) {
  exigirCantidad(n);
  const fila = TABLA_DISTRIBUCION.find((f) => n <= f.hasta);
  const dist = {
    asesinos: fila.asesinos, complices: fila.complices, detectives: fila.detectives,
    medicos: fila.medicos, testigos: fila.testigos, sospechosos: 0,
  };
  dist.sospechosos = n - contarEspeciales(dist);
  return dist;
}

/** Roles que no son sospechosos. */
export function contarEspeciales(dist) {
  return CLAVES_DISTRIBUCION.filter((k) => k !== 'sospechosos')
    .reduce((acc, k) => acc + (Number.isFinite(dist?.[k]) ? dist[k] : 0), 0);
}

/** Devuelve una copia con los sospechosos recalculados como el resto (nunca negativos).
 *  Úsese cuando el conductor edita roles especiales. */
export function completarSospechosos(dist, n) {
  const copia = { ...dist };
  copia.sospechosos = Math.max(0, n - contarEspeciales(copia));
  return copia;
}

/**
 * Valida una distribución para n jugadores.
 * @returns {{ok:boolean, errores:string[], advertencias:string[]}}
 */
export function validarDistribucion(dist, n) {
  const errores = [];
  const advertencias = [];

  if (!cantidadValida(n)) {
    errores.push(`La cantidad de jugadores debe estar entre ${MIN_JUGADORES} y ${MAX_JUGADORES}.`);
    return { ok: false, errores, advertencias };
  }
  if (!dist || typeof dist !== 'object') {
    errores.push('Falta la distribución de roles.');
    return { ok: false, errores, advertencias };
  }
  for (const k of CLAVES_DISTRIBUCION) {
    const v = dist[k];
    if (!Number.isInteger(v) || v < 0) errores.push(`"${k}" debe ser un entero mayor o igual a 0.`);
  }
  if (errores.length) return { ok: false, errores, advertencias };

  if (dist.asesinos < 1) errores.push('Tiene que haber al menos un asesino.');

  const especiales = contarEspeciales(dist);
  if (especiales > n) {
    errores.push(`Los roles especiales (${especiales}) superan la cantidad de jugadores (${n}).`);
  } else if (especiales + dist.sospechosos !== n) {
    errores.push(`Los sospechosos deben ser el resto: tendrían que ser ${n - especiales}.`);
  }

  const malos = dist.asesinos + dist.complices;
  const inocentes = n - malos;
  if (malos >= inocentes && especiales <= n) {
    errores.push(`El equipo asesino (${malos}) igualaría o superaría a los inocentes (${inocentes}) desde el inicio: la partida terminaría antes de empezar.`);
  }

  if (dist.testigos > 1) advertencias.push('Hay más de un testigo: cada rol especial debería tener una función definida.');
  if (especiales > 0 && (especiales - dist.asesinos) / n > 0.4) {
    advertencias.push('Hay muchos roles especiales para esta cantidad de jugadores.');
  }
  return { ok: errores.length === 0, errores, advertencias };
}

// ═════════════════════════ 3. ALEATORIEDAD Y ASIGNACIÓN ═════════════════════

/** Entero uniforme en [0, maxExclusivo) con crypto.getRandomValues (muestreo por rechazo, sin sesgo). */
export function enteroAleatorio(maxExclusivo, fuente = globalThis.crypto) {
  if (!Number.isInteger(maxExclusivo) || maxExclusivo < 1 || maxExclusivo > 0x100000000) {
    throw new RangeError('maxExclusivo inválido.');
  }
  if (!fuente || typeof fuente.getRandomValues !== 'function') {
    throw new Error('Este navegador no ofrece crypto.getRandomValues; no se puede sortear de forma segura.');
  }
  if (maxExclusivo === 1) return 0;
  const buf = new Uint32Array(1);
  const limite = Math.floor(0x100000000 / maxExclusivo) * maxExclusivo;
  do { fuente.getRandomValues(buf); } while (buf[0] >= limite);
  return buf[0] % maxExclusivo;
}

/** Fisher–Yates. `rng(max)` debe devolver un entero en [0,max). Devuelve una copia. */
export function barajar(lista, rng = enteroAleatorio) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sortea los roles entre los jugadores.
 * @param {string[]} uids  jugadores (sin repetir; el conductor no va acá)
 * @param {object} dist    distribución ya validada
 * @returns {Object<string,string>} { uid: rol }
 */
export function asignarRoles(uids, dist, rng = enteroAleatorio) {
  if (!Array.isArray(uids)) throw new TypeError('uids debe ser una lista.');
  if (new Set(uids).size !== uids.length) throw new Error('Hay jugadores repetidos.');
  const v = validarDistribucion(dist, uids.length);
  if (!v.ok) throw new Error('Distribución inválida: ' + v.errores.join(' '));

  const bolsa = [];
  for (const rol of ROLES_LISTA) for (let i = 0; i < dist[ROL_A_CLAVE[rol]]; i++) bolsa.push(rol);
  const mezcla = barajar(bolsa, rng);
  const asignacion = {};
  uids.forEach((uid, i) => { asignacion[uid] = mezcla[i]; });
  return asignacion;
}

/** Cuenta cuántos hay de cada rol en una asignación (útil para el panel). */
export function contarRoles(asignacion) {
  const c = Object.fromEntries(ROLES_LISTA.map((r) => [r, 0]));
  for (const rol of Object.values(asignacion)) if (rol in c) c[rol]++;
  return c;
}

/** Deja un nick compatible con las reglas (2–24 caracteres, sin < > " \ /). */
export function nickSeguro(nick) {
  const limpio = String(nick ?? '').replace(/[<>"\\/]/g, '').trim().slice(0, 24);
  return limpio.length >= 2 ? limpio : 'Jugador';
}

/**
 * Qué equipo conoce cada miembro del bando asesino.
 * Cada asesino/cómplice recibe a SUS compañeros (no a sí mismo).
 * @returns {Object<string, Object<string,{nick:string,rol:string}>>} solo incluye a quien tenga compañeros.
 */
export function equiposPrivados(asignacion, nicks = {}) {
  const malos = Object.entries(asignacion).filter(([, rol]) => equipoDe(rol) === EQUIPOS.ASESINOS);
  const salida = {};
  for (const [uid] of malos) {
    const otros = {};
    for (const [uid2, rol2] of malos) {
      if (uid2 !== uid) otros[uid2] = { nick: nickSeguro(nicks[uid2]), rol: rol2 };
    }
    if (Object.keys(otros).length) salida[uid] = otros;
  }
  return salida;
}

// ═════════════════════════ 4. TIEMPOS ═══════════════════════════════════════

/** Tiempos sugeridos (segundos) según la cantidad. El conductor puede cambiarlos. */
export function tiemposPorDefecto(n) {
  exigirCantidad(n);
  const coartada = n <= 8 ? 45 : n <= 15 ? 30 : n <= 25 ? 20 : 15;
  const votacion = n <= 8 ? 60 : n <= 15 ? 75 : n <= 25 ? 90 : 120;
  return { coartada, votacion };
}
export function validarTiempos(t) {
  const errores = [];
  if (!t || !Number.isFinite(t.coartada) || t.coartada < 5 || t.coartada > 600) errores.push('La coartada debe durar entre 5 y 600 segundos.');
  if (!t || !Number.isFinite(t.votacion) || t.votacion < 5 || t.votacion > 900) errores.push('La votación debe durar entre 5 y 900 segundos.');
  return { ok: errores.length === 0, errores };
}
/** Minutos aproximados de una ronda de coartadas (informativo para el conductor). */
export function minutosEstimadosInterrogatorio(vivos, tiempos) {
  return Math.ceil((vivos * tiempos.coartada) / 60);
}

// ─── Temporizador (informativo: NUNCA cambia de fase solo) ───
// Forma guardada en `publico/timer`: { finAt, restante, corriendo } (todos obligatorios).
// `ahora` debe ser la hora del servidor (Date.now() + .info/serverTimeOffset).
export function timerIniciar(segundos, ahora) {
  return { finAt: ahora + segundos * 1000, restante: segundos * 1000, corriendo: true };
}
export function timerRestanteMs(t, ahora) {
  if (!t) return 0;
  return t.corriendo ? Math.max(0, t.finAt - ahora) : Math.max(0, t.restante ?? 0);
}
export function timerPausar(t, ahora) {
  return { finAt: 0, restante: timerRestanteMs(t, ahora), corriendo: false };
}
export function timerReanudar(t, ahora) {
  const rest = Math.max(0, t?.restante ?? 0);
  return { finAt: ahora + rest, restante: rest, corriendo: true };
}
export function timerDetener() {
  return { finAt: 0, restante: 0, corriendo: false };
}

// ═════════════════════════ 5. VIVOS Y VICTORIA ═══════════════════════════════

/** Lista de uids vivos a partir de `publico/jugadores`. */
export function vivosDe(jugadores) {
  return Object.entries(jugadores ?? {}).filter(([, j]) => j && j.vivo === true).map(([uid]) => uid);
}

/**
 * Condiciones de victoria (decididas por el usuario):
 *  1) Sin asesinos vivos → ganan los inocentes.
 *  2) Equipo asesino vivo (asesinos + cómplices) ≥ inocentes vivos → ganan asesinos y cómplices.
 * Se evalúa primero la 1.
 */
export function evaluarVictoria(roles, vivos) {
  let asesinosVivos = 0; let malosVivos = 0; let inocentesVivos = 0;
  for (const uid of vivos) {
    const rol = roles[uid];
    if (!rol) continue;
    if (rol === ROLES.ASESINO) asesinosVivos++;
    if (equipoDe(rol) === EQUIPOS.ASESINOS) malosVivos++; else inocentesVivos++;
  }
  let ganador = null;
  if (asesinosVivos === 0) ganador = EQUIPOS.INOCENTES;
  else if (malosVivos >= inocentesVivos) ganador = EQUIPOS.ASESINOS;
  return { terminada: ganador !== null, ganador, asesinosVivos, malosVivos, inocentesVivos };
}

// ═════════════════════════ 6. NOCHE ═════════════════════════════════════════

/** Rol y vivo de cada actor de una acción (para no confiar en el cliente). */
function actoresValidos(acciones, roles, vivosSet, tipo, rol) {
  return Object.entries(acciones ?? {})
    .filter(([uid, a]) => a && a.tipo === tipo && roles[uid] === rol && vivosSet.has(uid))
    .map(([uid, a]) => ({ uid, objetivo: a.objetivo }));
}

/**
 * Resumen de las propuestas de los asesinos (para el panel durante `cierre_noche`).
 * El conductor decide manualmente la víctima: acá NO se resuelve por mayoría.
 */
export function resumenPropuestas(acciones, roles, vivos) {
  const vivosSet = new Set(vivos);
  const asesinos = vivos.filter((u) => roles[u] === ROLES.ASESINO);
  const propuestas = actoresValidos(acciones, roles, vivosSet, 'matar', ROLES.ASESINO)
    .filter((p) => vivosSet.has(p.objetivo));
  const porObjetivo = {};
  for (const p of propuestas) (porObjetivo[p.objetivo] ??= []).push(p.uid);
  const proponentes = new Set(propuestas.map((p) => p.uid));
  return {
    porObjetivo,
    sinPropuesta: asesinos.filter((u) => !proponentes.has(u)),
    hayDesacuerdo: Object.keys(porObjetivo).length > 1,
  };
}

/** Quiénes todavía no enviaron su acción de la noche (informativo para el conductor). */
export function accionesPendientes(acciones, roles, vivos) {
  const hecho = new Set(Object.keys(acciones ?? {}));
  const pend = (rol) => vivos.filter((u) => roles[u] === rol && !hecho.has(u));
  return { asesinos: pend(ROLES.ASESINO), medicos: pend(ROLES.MEDICO), detectives: pend(ROLES.DETECTIVE) };
}

/**
 * Procesa la noche con la víctima que eligió el conductor.
 *
 * @param {object} p
 * @param {string} p.rondaId        ej. "r1"
 * @param {Object<string,string>} p.roles   { uid: rol } (todos los jugadores)
 * @param {string[]} p.vivos        uids vivos al empezar la noche
 * @param {Object<string,string>} p.nicks
 * @param {string} p.victima        uid elegido por el conductor, o "ninguna"
 * @param {Object<string,{tipo:string,objetivo:string}>} p.acciones  { uid: acción } de esta noche
 * @param {Object<string,string>} [p.autoprotecciones] { uid: rondaId } donde ya usó su autoprotección
 */
export function resolverNoche(p) {
  const { roles, nicks = {}, acciones = {}, autoprotecciones = {} } = p;
  if (!RONDA_ID_RE.test(p.rondaId)) throw new Error(`rondaId inválido: ${p.rondaId}`);
  const vivos = [...p.vivos];
  const vivosSet = new Set(vivos);
  const victima = p.victima;
  if (victima !== SIN_VICTIMA && !vivosSet.has(victima)) {
    throw new Error('La víctima elegida no es un jugador vivo.');
  }
  const nick = (u) => nickSeguro(nicks[u]);
  const advertencias = [];

  // Protecciones válidas del médico (la autoprotección es una sola vez por partida).
  const protecciones = [];
  const nuevasAutoprotecciones = {};
  for (const m of actoresValidos(acciones, roles, vivosSet, 'proteger', ROLES.MEDICO)) {
    if (!vivosSet.has(m.objetivo)) continue;
    if (m.objetivo === m.uid) {
      const usada = autoprotecciones[m.uid];
      if (usada && usada !== p.rondaId) { advertencias.push(`${nick(m.uid)} ya había usado su autoprotección.`); continue; }
      nuevasAutoprotecciones[m.uid] = p.rondaId;
    }
    protecciones.push(m);
  }

  const protegida = victima !== SIN_VICTIMA && protecciones.some((m) => m.objetivo === victima);
  const exito = victima !== SIN_VICTIMA && !protegida;
  const muertos = exito ? [victima] : [];
  const vivosDespues = vivos.filter((u) => !muertos.includes(u));

  if (exito && equipoDe(roles[victima]) === EQUIPOS.ASESINOS) {
    advertencias.push('La víctima elegida pertenece al equipo asesino.');
  }

  // Investigaciones: respuesta binaria. Un cómplice o cualquier otro rol => NO es asesino.
  const investigaciones = [];
  for (const d of actoresValidos(acciones, roles, vivosSet, 'investigar', ROLES.DETECTIVE)) {
    if (!vivosSet.has(d.objetivo) || d.objetivo === d.uid) continue;
    if (muertos.includes(d.uid)) {
      advertencias.push(`${nick(d.uid)} (detective) murió esta noche: su investigación no se entrega.`);
      continue;
    }
    investigaciones.push({
      detective: d.uid, objetivo: d.objetivo, objetivoNick: nick(d.objetivo),
      esAsesino: roles[d.objetivo] === ROLES.ASESINO,
    });
  }

  // Textos.
  let anuncio; let mensajeAsesinos;
  if (victima === SIN_VICTIMA) {
    anuncio = 'Amaneció. Nadie murió esta noche.';
    mensajeAsesinos = 'Esta noche no hubo víctima.';
  } else if (exito) {
    anuncio = `Amaneció. ${nick(victima)} fue eliminado y ahora es un fantasma.`;
    mensajeAsesinos = `Su equipo eliminó a ${nick(victima)}.`;
  } else {
    anuncio = 'Amaneció. Nadie murió esta noche.';
    mensajeAsesinos = `El ataque contra ${nick(victima)} fracasó: estaba protegido.`;
  }

  return {
    rondaId: p.rondaId,
    victima, exito, protegida, muertos, vivosDespues,
    nuevasAutoprotecciones,
    investigaciones,
    anuncio,
    mensajeAsesinos,
    destinatariosAsesinos: vivosDespues.filter((u) => roles[u] === ROLES.ASESINO),
    advertencias,
  };
}

// ═════════════════════════ 7. VOTACIÓN ══════════════════════════════════════

/**
 * Escrutinio de una votación.
 * @param {object} p
 * @param {Object<string,string>} p.votos   { votante: objetivo }
 * @param {string[]} p.candidatos
 * @param {string[]} p.votantes             jugadores vivos habilitados
 * @param {1|2} p.numero                    1 = primera votación, 2 = desempate
 * @returns resultado con ganador de la votación, empate y si hace falta una segunda votación.
 */
export function escrutar(p) {
  const { votos = {}, candidatos, votantes, numero } = p;
  if (numero !== 1 && numero !== 2) throw new RangeError('numero debe ser 1 o 2.');
  const cand = new Set(candidatos);
  const hab = new Set(votantes);
  const conteo = Object.fromEntries(candidatos.map((c) => [c, 0]));
  let validos = 0;
  for (const [votante, objetivo] of Object.entries(votos)) {
    if (!hab.has(votante) || !cand.has(objetivo) || objetivo === votante) continue;
    conteo[objetivo]++; validos++;
  }
  const maximo = Math.max(0, ...Object.values(conteo));
  const empatados = maximo > 0 ? candidatos.filter((c) => conteo[c] === maximo) : [];
  const empate = empatados.length > 1;
  const faltanVotar = votantes.filter((u) => !(u in votos));

  let eliminado = null; let segundaVotacion = false; let candidatosSegunda = [];
  if (empatados.length === 1) eliminado = empatados[0];
  else if (empate && numero === 1) { segundaVotacion = true; candidatosSegunda = empatados; }
  // empate en la 2ª votación, o nadie votó => nadie es eliminado (decisión del usuario).

  return { conteo, maximo, empatados, empate, eliminado, segundaVotacion, candidatosSegunda,
    sinVotos: validos === 0, votaron: validos, esperados: votantes.length, faltanVotar };
}

/** Forma exacta que guardan las reglas en `publico/votacion/resultado`. */
export function resultadoPublicoVotacion(res) {
  return { conteo: { ...res.conteo }, eliminado: res.eliminado ?? SIN_ELIMINADO, empate: res.empate };
}

export function textoResultadoVotacion(res, nicks = {}) {
  const nick = (u) => nickSeguro(nicks[u]);
  if (res.eliminado) return `Por mayoría de votos, ${nick(res.eliminado)} fue eliminado y ahora es un fantasma.`;
  if (res.segundaVotacion) {
    return `Hubo empate entre ${res.candidatosSegunda.map(nick).join(', ')}. Se abre una segunda votación solo entre ellos.`;
  }
  if (res.empate) return 'Volvió a haber empate. Nadie es eliminado y llega una nueva noche.';
  return 'Nadie recibió votos. Nadie es eliminado y llega una nueva noche.';
}

export function textoVictoria(ganador) {
  return ganador === EQUIPOS.INOCENTES
    ? 'Ganaron los inocentes: todos los asesinos fueron eliminados.'
    : 'Ganaron los asesinos y sus cómplices: igualaron en número a los inocentes.';
}

/** Los anuncios públicos no pueden pasar de 400 caracteres (límite de las reglas). */
export function recortarAnuncio(texto) {
  const t = String(texto ?? '');
  return t.length <= 400 ? t : t.slice(0, 397) + '…';
}

// ═════════════════════════ 8. VALIDACIONES DE PARTIDA ═══════════════════════

/** Nombre público de la partida (1–60 caracteres, sin < > " \ /). */
export function validarNombrePartida(nombre) {
  const t = String(nombre ?? '').trim();
  if (t.length < 1 || t.length > 60) return { ok: false, error: 'El nombre debe tener entre 1 y 60 caracteres.' };
  if (/[<>"\\/]/.test(t)) return { ok: false, error: 'El nombre no puede contener < > " \\ /' };
  return { ok: true, nombre: t };
}

/** Texto de una pista del testigo (5–300 caracteres, sin < > " \ /). */
export function validarTextoPista(texto) {
  const t = String(texto ?? '').trim();
  if (t.length < 5 || t.length > 300) return { ok: false, error: 'La pista debe tener entre 5 y 300 caracteres.' };
  if (/[<>"\\/]/.test(t)) return { ok: false, error: 'La pista no puede contener < > " \\ /' };
  return { ok: true, texto: t };
}

// ═════════════════════════ 9. TEXTOS DE ROLES (para la interfaz) ════════════

export const DESCRIPCION_ROL = Object.freeze({
  asesino: {
    nombre: 'Asesino', equipo: EQUIPOS.ASESINOS,
    resumen: 'Sos un asesino. Tu equipo gana si iguala en número a los inocentes.',
    instrucciones: [
      'Cada noche proponé una víctima. El conductor elige la definitiva.',
      'Conocés a tus compañeros de equipo. Coordinen por audio, nunca por escrito.',
      'Durante los interrogatorios, mentí, desviá sospechas y acusá a otros.',
    ],
  },
  complice: {
    nombre: 'Cómplice', equipo: EQUIPOS.ASESINOS,
    resumen: 'Sos cómplice. Jugás con los asesinos: ganás cuando ellos ganan.',
    instrucciones: [
      'Conocés a los asesinos, pero no tenés acción nocturna.',
      'Tu misión es protegerlos durante los interrogatorios.',
      'Si el detective te investiga, la respuesta es "NO ES ASESINO".',
    ],
  },
  detective: {
    nombre: 'Detective', equipo: EQUIPOS.INOCENTES,
    resumen: 'Sos detective. Cada noche investigás a un jugador.',
    instrucciones: [
      'Elegí a quién investigar. Recibís en privado: "ES ASESINO" o "NO ES ASESINO".',
      'La respuesta no revela el rol; un cómplice figura como "NO ES ASESINO".',
      'Podés revelar o reservar lo que descubriste durante los interrogatorios.',
    ],
  },
  medico: {
    nombre: 'Médico', equipo: EQUIPOS.INOCENTES,
    resumen: 'Sos médico. Cada noche protegés a un jugador.',
    instrucciones: [
      'Elegí a quién proteger. Si el asesinato recae sobre esa persona, fracasa.',
      'Podés protegerte a vos mismo una sola vez por partida.',
    ],
  },
  testigo: {
    nombre: 'Testigo', equipo: EQUIPOS.INOCENTES,
    resumen: 'Sos testigo. Podés recibir una pista del conductor.',
    instrucciones: [
      'El conductor te entregará una pista en privado cuando lo decida.',
      'Vos decidís si la compartís, y cuándo, durante la investigación.',
    ],
  },
  sospechoso: {
    nombre: 'Sospechoso', equipo: EQUIPOS.INOCENTES,
    resumen: 'Sos un sospechoso inocente. Ayudá a descubrir al asesino.',
    instrucciones: [
      'No tenés acción nocturna.',
      'Dá tu coartada, interrogá a los demás y votá con criterio.',
    ],
  },
});

// ═════════════════════════ 10. VERSIÓN ══════════════════════════════════════
export const VERSION_REGLAS = '1.0.0';
