// tests-live-admin.js — Control en vivo de un Test — SOLO ADMIN
// ============================================================
// MISMA REGLA QUE EN games/tests.js: no se puede leer ni escribir un nodo
// padre completo de testLive de una sola vez (las reglas de Firebase solo dan
// permiso campo por campo / uid por uid, no al padre). Por eso acá:
//
//   - El estado general (testId/estado/preguntaActualId/revelado) se lee
//     reusando onTestLiveState() de games/tests.js (ya probado y andando).
//   - Para "quién está conectado" y "quién respondió qué" NO hay forma de
//     pedirle a Firebase "dame todos los hijos de testLive/participantes"
//     sin permiso en el padre — así que en vez de eso pedimos la lista de
//     usuarios registrados ("users", que el admin ya lee entera en otras
//     pantallas) y consultamos UNO POR UNO cada uid puntual
//     (testLive/participantes/{uid}, testLive/respuestas/{qId}/{uid}, etc.),
//     que sí están permitidos.
//   - Todas las escrituras van con update() a rutas puntuales, nunca con un
//     set() sobre "testLive" completo.
//
// Si en algún momento algo de esto tira "permission_denied" en la consola,
// es porque falta un permiso puntual para el admin en esa ruta específica —
// fijate el path exacto del error y se agrega esa única regla puntual.

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getTest } from "./tests-admin.js";

// ── Helper interno: preguntas del banco ordenadas por "orden" ──

function ordenarPreguntas(preguntas) {
  return Object.entries(preguntas || {}).sort((a, b) => (a[1].orden || 0) - (b[1].orden || 0));
}

// ── Roster de participantes posibles (para poder consultar uid por uid) ──
// "users" es un nodo que el admin YA lee entero en otras pantallas (admin.html),
// así que esta lectura es segura.

export async function obtenerRoster() {
  const snap = await get(ref(db, "users"));
  const val = snap.val() || {};
  return Object.entries(val)
    .filter(([, u]) => u.role !== "admin")
    .map(([uid, u]) => ({ uid, nick: u.nick || "Jugador" }));
}

// ── 1. Arrancar sesión en vivo ──

export async function activarTestVivo(testId) {
  const test = await getTest(testId);
  if (!test) throw new Error("Test no encontrado.");
  const preguntas = ordenarPreguntas(test.preguntas);
  if (!preguntas.length) throw new Error("Este test no tiene preguntas cargadas.");
  const sinOpciones = preguntas.find(([, p]) => !p.opciones || !Object.keys(p.opciones).length);
  if (sinOpciones) throw new Error("Hay preguntas sin opciones cargadas. Completalas antes de arrancar.");

  const [primeraQId, primeraPregunta] = preguntas[0];

  // update() con rutas puntuales — nunca set() sobre "testLive" entero.
  await update(ref(db), {
    "testLive/testId": testId,
    "testLive/estado": "activo",
    "testLive/preguntaActualId": primeraQId,
    "testLive/revelado": false,
    [`testLive/preguntasPublicas/${primeraQId}`]: {
      texto: primeraPregunta.texto,
      orden: primeraPregunta.orden,
      opciones: {},
    },
  });

  return { ok: true, primeraQId };
}

// ── 2. Revelar opciones de la pregunta actual ──

async function actualizarRevelado(testId, qId) {
  const bancoSnap = await get(ref(db, `tests/${testId}/preguntas/${qId}/opciones`));
  const publicasSnap = await get(ref(db, `testLive/preguntasPublicas/${qId}/opciones`));
  const totalBanco = Object.keys(bancoSnap.val() || {}).length;
  const totalPublicas = Object.keys(publicasSnap.val() || {}).length;
  await update(ref(db), { "testLive/revelado": totalBanco > 0 && totalBanco === totalPublicas });
}

export async function revelarOpcion(testId, qId, letra) {
  const snap = await get(ref(db, `tests/${testId}/preguntas/${qId}/opciones/${letra}`));
  const opcion = snap.val();
  if (!opcion) return;
  await set(ref(db, `testLive/preguntasPublicas/${qId}/opciones/${letra}`), { texto: opcion.texto });
  await actualizarRevelado(testId, qId);
}

export async function revelarTodasLasOpciones(testId, qId) {
  const snap = await get(ref(db, `tests/${testId}/preguntas/${qId}/opciones`));
  const opciones = snap.val() || {};
  const updates = {};
  Object.entries(opciones).forEach(([letra, o]) => {
    updates[`testLive/preguntasPublicas/${qId}/opciones/${letra}`] = { texto: o.texto };
  });
  if (Object.keys(updates).length) await update(ref(db), updates);
  await actualizarRevelado(testId, qId);
}

// ── 3. Participantes conectados y respuestas en vivo (uid por uid) ──

// Devuelve una función para cancelar todos los listeners.
export function onParticipantesVivo(roster, callback) {
  const estado = {};
  const unsubs = roster.map(({ uid, nick }) =>
    onValue(
      ref(db, `testLive/participantes/${uid}`),
      (snap) => {
        const val = snap.val();
        if (val) estado[uid] = { uid, nick, ...val };
        else delete estado[uid];
        callback(Object.values(estado));
      },
      () => { /* sin permiso sobre este uid puntual — lo ignoramos, no rompe al resto */ }
    )
  );
  return () => unsubs.forEach((u) => u());
}

export function onRespuestasPregunta(qId, roster, callback) {
  if (!qId) return () => {};
  const estado = {};
  const unsubs = roster.map(({ uid }) =>
    onValue(
      ref(db, `testLive/respuestas/${qId}/${uid}`),
      (snap) => {
        const val = snap.val();
        if (val) estado[uid] = val;
        else delete estado[uid];
        callback({ ...estado });
      },
      () => {}
    )
  );
  return () => unsubs.forEach((u) => u());
}

export function onResultadosFinalesVivo(roster, callback) {
  const estado = {};
  const unsubs = roster.map(({ uid, nick }) =>
    onValue(
      ref(db, `testLive/resultadoFinal/${uid}`),
      (snap) => {
        const val = snap.val();
        if (val) estado[uid] = { uid, nick, ...val };
        else delete estado[uid];
        callback(Object.values(estado));
      },
      () => {}
    )
  );
  return () => unsubs.forEach((u) => u());
}

// ── 4. Cerrar la pregunta actual y repartir puntos ──
// El puntaje acumulado vive en testLive/miResultado/{uid}.puntajeTotal
// (no hay un nodo aparte "puntajes" — así reusamos un campo que el admin
// ya tiene permiso de escribir según el diseño original).

export async function cerrarPreguntaYPuntuar(testId, qId, roster) {
  const opcSnap = await get(ref(db, `tests/${testId}/preguntas/${qId}/opciones`));
  const opciones = opcSnap.val() || {};

  const resumen = [];

  for (const { uid, nick } of roster) {
    let respuesta = null;
    let anterior = null;
    try {
      const [rSnap, mSnap] = await Promise.all([
        get(ref(db, `testLive/respuestas/${qId}/${uid}`)),
        get(ref(db, `testLive/miResultado/${uid}`)),
      ]);
      respuesta = rSnap.val();
      anterior = mSnap.val();
    } catch (err) {
      console.error(`[tests-live-admin] no pude leer la respuesta de ${nick}:`, err.message);
      continue;
    }
    if (!respuesta) continue; // no contestó esta pregunta

    const puntos = Number(opciones[respuesta.opcionId]?.puntos) || 0;
    const puntajeTotal = (anterior?.puntajeTotal || 0) + puntos;

    try {
      await set(ref(db, `testLive/miResultado/${uid}`), {
        qId, opcionId: respuesta.opcionId, puntos, puntajeTotal,
      });
      resumen.push({ uid, nick, opcionId: respuesta.opcionId, puntos, puntajeTotal });
    } catch (err) {
      console.error(`[tests-live-admin] no pude guardar el puntaje de ${nick}:`, err.message);
    }
  }

  return resumen;
}

// ── 5. Avanzar a la siguiente pregunta ──

export async function siguientePregunta(testId) {
  const test = await getTest(testId);
  const preguntas = ordenarPreguntas(test?.preguntas);
  const actualSnap = await get(ref(db, "testLive/preguntaActualId"));
  const actualId = actualSnap.val();

  const idxActual = preguntas.findIndex(([qId]) => qId === actualId);
  const siguiente = preguntas[idxActual + 1];
  if (!siguiente) return { ok: false, ultima: true };

  const [qId, pregunta] = siguiente;
  await update(ref(db), {
    "testLive/preguntaActualId": qId,
    "testLive/revelado": false,
    [`testLive/preguntasPublicas/${qId}`]: {
      texto: pregunta.texto,
      orden: pregunta.orden,
      opciones: {},
    },
  });
  return { ok: true, qId };
}

export async function esUltimaPregunta(testId, qIdActual) {
  const test = await getTest(testId);
  const preguntas = ordenarPreguntas(test?.preguntas);
  const idx = preguntas.findIndex(([qId]) => qId === qIdActual);
  return idx === -1 || idx >= preguntas.length - 1;
}

// ── 6. Finalizar test: calcular resultado/perfil final de cada participante ──

export async function finalizarTest(testId, roster) {
  const test = await getTest(testId);
  const resultados = Object.values(test?.resultados || {});
  const tituloTest = test?.meta?.titulo || "Test";

  const resultadosFinales = [];

  for (const { uid, nick } of roster) {
    let miResultado = null;
    try {
      const snap = await get(ref(db, `testLive/miResultado/${uid}`));
      miResultado = snap.val();
    } catch (err) {
      console.error(`[tests-live-admin] no pude leer el puntaje final de ${nick}:`, err.message);
      continue;
    }
    if (!miResultado) continue; // no contestó nada en todo el test

    const puntaje = miResultado.puntajeTotal || 0;
    const perfil = resultados.find(r => puntaje >= (r.min ?? 0) && puntaje <= (r.max ?? 0));
    const resultadoFinal = {
      puntajeFinal: puntaje,
      perfil: perfil?.titulo || "Sin resultado asignado",
      descripcion: perfil?.descripcion || "",
    };

    try {
      await set(ref(db, `testLive/resultadoFinal/${uid}`), resultadoFinal);
      await push(ref(db, `historial/${uid}`), {
        tituloTest,
        puntajeFinal: puntaje,
        resultado: resultadoFinal.perfil,
        fecha: Date.now(),
      });
      resultadosFinales.push({ uid, nick, ...resultadoFinal });
    } catch (err) {
      console.error(`[tests-live-admin] no pude guardar el resultado final de ${nick}:`, err.message);
    }
  }

  await update(ref(db), { "testLive/estado": "finalizado" });
  return { ok: true, resultadosFinales };
}

// ── 7. Cerrar la sesión en vivo: archivar y resetear ──

export async function cerrarSesionVivo(testId, roster) {
  const test = await getTest(testId);
  const preguntas = ordenarPreguntas(test?.preguntas);

  const respuestasArchivo = {};
  const resultadoFinalArchivo = {};

  for (const [qId] of preguntas) {
    for (const { uid } of roster) {
      try {
        const snap = await get(ref(db, `testLive/respuestas/${qId}/${uid}`));
        if (snap.val()) {
          respuestasArchivo[qId] = respuestasArchivo[qId] || {};
          respuestasArchivo[qId][uid] = snap.val();
        }
      } catch { /* sin dato o sin permiso — se ignora */ }
    }
  }

  for (const { uid } of roster) {
    try {
      const snap = await get(ref(db, `testLive/resultadoFinal/${uid}`));
      if (snap.val()) resultadoFinalArchivo[uid] = snap.val();
    } catch { /* sin dato o sin permiso — se ignora */ }
  }

  await push(ref(db, `tests/${testId}/sesiones`), {
    fecha: Date.now(),
    respuestas: respuestasArchivo,
    resultadoFinal: resultadoFinalArchivo,
  });

  // Reseteamos los 4 campos de estado conocidos — nunca set(testLive, null).
  await update(ref(db), {
    "testLive/testId": null,
    "testLive/estado": "idle",
    "testLive/preguntaActualId": null,
    "testLive/revelado": false,
  });

  // Best-effort: intentamos limpiar también los datos de cada participante,
  // uid por uid. Si tu configuración de reglas no le da permiso de escritura
  // al admin sobre alguna de estas rutas puntuales, esto puede fallar en
  // silencio — no pasa nada salvo que vuelvas a arrancar ESTE MISMO test más
  // adelante, en cuyo caso algún participante podría ver "ya respondiste" de
  // la sesión anterior en esa pregunta puntual.
  for (const { uid } of roster) {
    try { await set(ref(db, `testLive/miResultado/${uid}`), null); } catch {}
    try { await set(ref(db, `testLive/resultadoFinal/${uid}`), null); } catch {}
    for (const [qId] of preguntas) {
      try { await set(ref(db, `testLive/respuestas/${qId}/${uid}`), null); } catch {}
    }
  }

  return { ok: true };
}

// Cancelar la sesión sin guardar nada en el historial de nadie
export async function cancelarSesionVivo() {
  await update(ref(db), {
    "testLive/testId": null,
    "testLive/estado": "idle",
    "testLive/preguntaActualId": null,
    "testLive/revelado": false,
  });
}
