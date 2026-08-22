// tests-admin.js — Gestión (CRUD) del banco de Tests — SOLO ADMIN
// ============================================================
// Estructura Firebase (bloqueada por reglas, solo el admin lee/escribe):
//   tests/{testId}/meta      → { titulo, descripcion, estado, creado, actualizado }
//   tests/{testId}/preguntas/{qId} → { orden, texto, opciones: { A: {texto,puntos}, ... } }
//   tests/{testId}/resultados/{resId} → { min, max, titulo, descripcion }
//   tests/{testId}/sesiones/{sessionId} → historial completo (se llena desde el control en vivo, etapa 3)
//
// estado del test: "preparado" | "archivado"  (nunca se borra solo por dejar de usarlo)

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, remove, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Listado de tests (para la pantalla "Gestión de tests") ──

export function onTestsList(callback) {
  return onValue(ref(db, "tests"), (snap) => {
    const val = snap.val() || {};
    const lista = Object.entries(val).map(([id, t]) => {
      const preguntas = t.preguntas || {};
      const resultados = t.resultados || {};
      return {
        id,
        meta: t.meta || {},
        cantidadPreguntas: Object.keys(preguntas).length,
        cantidadResultados: Object.keys(resultados).length,
        tieneSesiones: !!(t.sesiones && Object.keys(t.sesiones).length),
      };
    }).sort((a, b) => (b.meta.actualizado || 0) - (a.meta.actualizado || 0));
    callback(lista);
  });
}

// ── Un test completo (para editar) ──

export function onTest(testId, callback) {
  return onValue(ref(db, `tests/${testId}`), (snap) => {
    callback(snap.val());
  });
}

export async function getTest(testId) {
  const snap = await get(ref(db, `tests/${testId}`));
  return snap.val();
}

// ── Crear / editar metadatos del test ──

export async function crearTest(titulo, descripcion) {
  const nuevaRef = push(ref(db, "tests"));
  const now = Date.now();
  await set(nuevaRef, {
    meta: {
      titulo: titulo || "Test sin título",
      descripcion: descripcion || "",
      estado: "preparado",
      creado: now,
      actualizado: now,
    },
  });
  return nuevaRef.key;
}

export async function actualizarMeta(testId, cambios) {
  await update(ref(db, `tests/${testId}/meta`), {
    ...cambios,
    actualizado: Date.now(),
  });
}

export async function toggleEstado(testId, nuevoEstado) {
  await update(ref(db, `tests/${testId}/meta`), {
    estado: nuevoEstado,
    actualizado: Date.now(),
  });
}

export async function eliminarTest(testId) {
  await remove(ref(db, `tests/${testId}`));
}

// Duplica un test completo (preguntas + resultados), sin arrastrar sesiones jugadas.
export async function duplicarTest(testId) {
  const original = await getTest(testId);
  if (!original) throw new Error("Test no encontrado");
  const nuevaRef = push(ref(db, "tests"));
  const now = Date.now();
  await set(nuevaRef, {
    meta: {
      titulo: `${original.meta?.titulo || "Test"} (copia)`,
      descripcion: original.meta?.descripcion || "",
      estado: "preparado",
      creado: now,
      actualizado: now,
    },
    preguntas: original.preguntas || {},
    resultados: original.resultados || {},
  });
  return nuevaRef.key;
}

// ── Preguntas ──

export async function agregarPregunta(testId, texto, ordenSiguiente) {
  const nuevaRef = push(ref(db, `tests/${testId}/preguntas`));
  await set(nuevaRef, {
    orden: ordenSiguiente,
    texto,
    opciones: {},
  });
  await tocarActualizado(testId);
  return nuevaRef.key;
}

export async function actualizarPregunta(testId, qId, texto) {
  await update(ref(db, `tests/${testId}/preguntas/${qId}`), { texto });
  await tocarActualizado(testId);
}

export async function eliminarPregunta(testId, qId) {
  await remove(ref(db, `tests/${testId}/preguntas/${qId}`));
  await tocarActualizado(testId);
}

// ── Opciones (dentro de una pregunta) ──
// Las letras (A, B, C...) son el id de cada opción — el mismo id que usa
// la vista pública (tests.js) para identificar qué opción se reveló y eligió.

export async function agregarOpcion(testId, qId, letra, texto, puntos) {
  await set(ref(db, `tests/${testId}/preguntas/${qId}/opciones/${letra}`), {
    texto,
    puntos: Number(puntos) || 0,
  });
  await tocarActualizado(testId);
}

export async function actualizarOpcion(testId, qId, letra, texto, puntos) {
  await update(ref(db, `tests/${testId}/preguntas/${qId}/opciones/${letra}`), {
    texto,
    puntos: Number(puntos) || 0,
  });
  await tocarActualizado(testId);
}

export async function eliminarOpcion(testId, qId, letra) {
  await remove(ref(db, `tests/${testId}/preguntas/${qId}/opciones/${letra}`));
  await tocarActualizado(testId);
}

// Calcula la próxima letra disponible (A, B, C...) para una pregunta dada
export function proximaLetra(opciones) {
  const usadas = Object.keys(opciones || {});
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const l of letras) {
    if (!usadas.includes(l)) return l;
  }
  return null; // 26 opciones ya es más que suficiente
}

// ── Resultados / perfiles ──

export async function agregarResultado(testId, { min, max, titulo, descripcion }) {
  const nuevaRef = push(ref(db, `tests/${testId}/resultados`));
  await set(nuevaRef, {
    min: Number(min) || 0,
    max: Number(max) || 0,
    titulo: titulo || "",
    descripcion: descripcion || "",
  });
  await tocarActualizado(testId);
  return nuevaRef.key;
}

export async function actualizarResultado(testId, resId, { min, max, titulo, descripcion }) {
  await update(ref(db, `tests/${testId}/resultados/${resId}`), {
    min: Number(min) || 0,
    max: Number(max) || 0,
    titulo: titulo || "",
    descripcion: descripcion || "",
  });
  await tocarActualizado(testId);
}

export async function eliminarResultado(testId, resId) {
  await remove(ref(db, `tests/${testId}/resultados/${resId}`));
  await tocarActualizado(testId);
}

// ── Helper interno ──

async function tocarActualizado(testId) {
  await update(ref(db, `tests/${testId}/meta`), { actualizado: Date.now() });
}
