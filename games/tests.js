// tests.js — Lógica Firebase para la sección Tests (vista participante)
// ============================================================
// Estructura Firebase (participante solo lee/escribe lo siguiente):
//   testLive/testId               → id del test activo
//   testLive/estado                → "idle" | "activo" | "finalizado"
//   testLive/preguntaActualId      → id de la pregunta que se está jugando
//   testLive/preguntasPublicas/{qId} → SOLO lo que el admin ya reveló
//       { texto, orden, opciones: { A: {texto}, B: {texto}, ... } }
//       (nunca contiene puntos, ni preguntas futuras, ni opciones no reveladas)
//   testLive/respuestas/{qId}/{uid}   → { opcionId, ts }  (una sola vez, por reglas)
//   testLive/miResultado/{uid}        → { qId, opcionId, puntos, puntajeTotal }
//   testLive/resultadoFinal/{uid}     → { puntajeFinal, perfil, descripcion }
//   historial/{uid}/{entryId}         → historial mínimo del participante
//
// El banco completo de preguntas (tests/{testId}) NO es legible por el
// participante — eso lo garantizan las reglas de Firebase, no este archivo.

import { db } from "../js/firebase-init.js";
import {
  ref, set, update, get, onValue, push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Estado general del vivo ──

export function onTestLiveState(callback) {
  return onValue(ref(db, "testLive"), (snap) => {
    const val = snap.val() || {};
    callback({
      testId: val.testId || null,
      estado: val.estado || "idle",
      preguntaActualId: val.preguntaActualId || null,
      revelado: !!val.revelado,
    });
  });
}

// ── Pregunta pública actual (solo lo revelado) ──

export function onPreguntaPublica(qId, callback) {
  return onValue(ref(db, `testLive/preguntasPublicas/${qId}`), (snap) => {
    callback(snap.val() || null);
  });
}

// ── Mi respuesta a una pregunta puntual (para saber si ya contesté) ──

export function onMiRespuesta(qId, uid, callback) {
  return onValue(ref(db, `testLive/respuestas/${qId}/${uid}`), (snap) => {
    callback(snap.val() || null);
  });
}

// Envía mi respuesta. Si ya había respondido, Firebase rechaza la escritura
// (regla !data.exists()) — se captura el error y se avisa que ya había respuesta.
export async function enviarRespuesta(qId, uid, opcionId) {
  try {
    await set(ref(db, `testLive/respuestas/${qId}/${uid}`), {
      opcionId,
      ts: Date.now(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, yaRespondida: true };
  }
}

// ── Resultado puntual de mi respuesta (lo calcula y escribe el admin) ──

export function onMiResultado(uid, callback) {
  return onValue(ref(db, `testLive/miResultado/${uid}`), (snap) => {
    callback(snap.val() || null);
  });
}

// ── Resultado final del test (cuando el admin revela) ──

export function onResultadoFinal(uid, callback) {
  return onValue(ref(db, `testLive/resultadoFinal/${uid}`), (snap) => {
    callback(snap.val() || null);
  });
}

// ── Registro de presencia como participante ──

export async function registrarParticipante(uid, nick) {
  await update(ref(db, `testLive/participantes/${uid}`), {
    nick,
    conectado: true,
  });
}

// ── Historial mínimo del participante ("Mis Tests") ──

export function onHistorial(uid, callback) {
  return onValue(ref(db, `historial/${uid}`), (snap) => {
    const val = snap.val();
    if (!val) return callback([]);
    const list = Object.entries(val)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
    callback(list);
  });
}
