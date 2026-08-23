// tests-live-admin.js — Control en vivo de un Test — SOLO ADMIN
// ============================================================
// Convive con testLive/ (el mismo árbol que lee la vista pública en games/tests.js)
// y con tests/{testId} (el banco de preguntas, gestionado en games/tests-admin.js).
//
// Flujo típico de una sesión en vivo:
//   1. activarTestVivo(testId)        → arranca la sesión con la primera pregunta publicada
//   2. revelarOpcion / revelarTodas   → el admin va mostrando las opciones a los participantes
//   3. cerrarPreguntaYPuntuar()       → congela las respuestas de la pregunta actual y reparte puntos
//   4. siguientePregunta()            → publica la próxima pregunta (repetir 2-3-4 hasta la última)
//   5. finalizarTest()                → calcula el resultado/perfil final de cada participante
//   6. cerrarSesionVivo()             → archiva la sesión completa en tests/{testId}/sesiones
//                                        y limpia testLive para poder jugar este test de nuevo
//
// Nada de esto se puede hacer desde el cliente de un participante: las reglas de
// Firebase solo permiten estas escrituras (tests/*, testLive/preguntasPublicas,
// testLive/miResultado, testLive/resultadoFinal, testLive/puntajes) al UID admin.

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getTest } from "./tests-admin.js";

const liveRef = () => ref(db, "testLive");

// ── Helper interno: preguntas del banco ordenadas por "orden" ──

function ordenarPreguntas(preguntas) {
  return Object.entries(preguntas || {}).sort((a, b) => (a[1].orden || 0) - (b[1].orden || 0));
}

async function actualizarRevelado(testId, qId) {
  const [bancoSnap, publicasSnap] = await Promise.all([
    get(ref(db, `tests/${testId}/preguntas/${qId}/opciones`)),
    get(ref(db, `testLive/preguntasPublicas/${qId}/opciones`)),
  ]);
  const totalBanco = Object.keys(bancoSnap.val() || {}).length;
  const totalPublicas = Object.keys(publicasSnap.val() || {}).length;
  await update(liveRef(), { revelado: totalBanco > 0 && totalBanco === totalPublicas });
}

// ── Listeners para el panel admin ──

// Estado completo de testLive (el admin sí puede leer el nodo entero).
export function onEstadoVivoAdmin(callback) {
  return onValue(liveRef(), (snap) => {
    callback(snap.val() || null);
  });
}

export function onParticipantesVivo(callback) {
  return onValue(ref(db, "testLive/participantes"), (snap) => {
    const val = snap.val() || {};
    callback(Object.entries(val).map(([uid, data]) => ({ uid, ...data })));
  });
}

export function onRespuestasPregunta(qId, callback) {
  if (!qId) return () => {};
  return onValue(ref(db, `testLive/respuestas/${qId}`), (snap) => {
    callback(snap.val() || {});
  });
}

export function onPuntajesVivo(callback) {
  return onValue(ref(db, "testLive/puntajes"), (snap) => {
    callback(snap.val() || {});
  });
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

  await set(liveRef(), {
    testId,
    estado: "activo",
    preguntaActualId: primeraQId,
    revelado: false,
    preguntasPublicas: {
      [primeraQId]: {
        texto: primeraPregunta.texto,
        orden: primeraPregunta.orden,
        opciones: {},
      },
    },
  });

  return { ok: true, primeraQId };
}

// ── 2. Revelar opciones de la pregunta actual ──

export async function revelarOpcion(testId, qId, letra) {
  const snap = await get(ref(db, `tests/${testId}/preguntas/${qId}/opciones/${letra}`));
  const opcion = snap.val();
  if (!opcion) return;
  await set(ref(db, `testLive/preguntasPublicas/${qId}/opciones/${letra}`), {
    texto: opcion.texto,
  });
  await actualizarRevelado(testId, qId);
}

export async function revelarTodasLasOpciones(testId, qId) {
  const snap = await get(ref(db, `tests/${testId}/preguntas/${qId}/opciones`));
  const opciones = snap.val() || {};
  const updates = {};
  Object.entries(opciones).forEach(([letra, o]) => {
    updates[`preguntasPublicas/${qId}/opciones/${letra}`] = { texto: o.texto };
  });
  if (Object.keys(updates).length) await update(liveRef(), updates);
  await actualizarRevelado(testId, qId);
}

// ── 3. Cerrar la pregunta actual y repartir puntos ──

export async function cerrarPreguntaYPuntuar(testId, qId) {
  const [respSnap, opcSnap, puntajesSnap] = await Promise.all([
    get(ref(db, `testLive/respuestas/${qId}`)),
    get(ref(db, `tests/${testId}/preguntas/${qId}/opciones`)),
    get(ref(db, "testLive/puntajes")),
  ]);

  const respuestas = respSnap.val() || {};
  const opciones = opcSnap.val() || {};
  const puntajes = puntajesSnap.val() || {};

  const resumen = [];
  const updates = {};

  Object.entries(respuestas).forEach(([uid, r]) => {
    const puntos = Number(opciones[r.opcionId]?.puntos) || 0;
    const nuevoTotal = (puntajes[uid] || 0) + puntos;
    updates[`puntajes/${uid}`] = nuevoTotal;
    updates[`miResultado/${uid}`] = { qId, opcionId: r.opcionId, puntos, puntajeTotal: nuevoTotal };
    resumen.push({ uid, opcionId: r.opcionId, puntos, puntajeTotal: nuevoTotal });
  });

  if (Object.keys(updates).length) await update(liveRef(), updates);
  return resumen;
}

// ── 4. Avanzar a la siguiente pregunta ──

export async function siguientePregunta(testId) {
  const test = await getTest(testId);
  const preguntas = ordenarPreguntas(test?.preguntas);
  const liveSnap = await get(ref(db, "testLive/preguntaActualId"));
  const actualId = liveSnap.val();

  const idxActual = preguntas.findIndex(([qId]) => qId === actualId);
  const siguiente = preguntas[idxActual + 1];
  if (!siguiente) return { ok: false, ultima: true };

  const [qId, pregunta] = siguiente;
  await update(liveRef(), {
    preguntaActualId: qId,
    revelado: false,
    [`preguntasPublicas/${qId}`]: {
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

// ── 5. Finalizar test: calcular resultado/perfil final de cada participante ──

export async function finalizarTest(testId) {
  const [test, puntajesSnap] = await Promise.all([
    getTest(testId),
    get(ref(db, "testLive/puntajes")),
  ]);

  const puntajes = puntajesSnap.val() || {};
  const resultados = Object.values(test?.resultados || {});
  const tituloTest = test?.meta?.titulo || "Test";

  const resultadosFinales = {};

  for (const [uid, puntaje] of Object.entries(puntajes)) {
    const perfil = resultados.find(r => puntaje >= (r.min ?? 0) && puntaje <= (r.max ?? 0));
    const resultadoFinal = {
      puntajeFinal: puntaje,
      perfil: perfil?.titulo || "Sin resultado asignado",
      descripcion: perfil?.descripcion || "",
    };
    resultadosFinales[uid] = resultadoFinal;

    await set(ref(db, `testLive/resultadoFinal/${uid}`), resultadoFinal);
    await push(ref(db, `historial/${uid}`), {
      tituloTest,
      puntajeFinal: puntaje,
      resultado: resultadoFinal.perfil,
      fecha: Date.now(),
    });
  }

  await update(liveRef(), { estado: "finalizado" });

  return { ok: true, resultadosFinales, totalParticipantes: Object.keys(puntajes).length };
}

// ── 6. Cerrar la sesión en vivo: archivar y limpiar testLive ──

export async function cerrarSesionVivo(testId) {
  const liveSnap = await get(liveRef());
  const liveData = liveSnap.val();
  if (liveData) {
    await push(ref(db, `tests/${testId}/sesiones`), {
      fecha: Date.now(),
      respuestas: liveData.respuestas || {},
      puntajes: liveData.puntajes || {},
      resultadoFinal: liveData.resultadoFinal || {},
      participantes: liveData.participantes || {},
    });
  }
  await set(liveRef(), null);
  return { ok: true };
}

// Cancelar la sesión sin guardar nada en el historial (por si el admin se equivocó de test)
export async function cancelarSesionVivo() {
  await set(liveRef(), null);
}
