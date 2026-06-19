// ruleta.js — Lógica Firebase para La Ruleta de El Burdel
// Estructura Firebase:
//   ruleta/config        → { modo: "1"|"2" }
//   ruleta/ruleta1       → { nombre, participantes:[], eliminarSalidos: bool, giro:{id,resultado,timestamp,duracion}, ultimoResultado, historial:[] }
//   ruleta/ruleta2       → (misma estructura)
//   ruleta/parejas       → [] (historial de parejas en modo 2)
//   ruleta/configs       → { $pushId: { nombre, lista:[] } } (listas guardadas)

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, onValue, push, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Listeners ──

export function onRuletaConfig(callback) {
  return onValue(ref(db, "ruleta/config"), snap => callback(snap.val() || { modo: "1" }));
}

export function onRuletaData(num, callback) {
  return onValue(ref(db, `ruleta/ruleta${num}`), snap => callback(snap.val() || {}));
}

export function onParejas(callback) {
  return onValue(ref(db, "ruleta/parejas"), snap => {
    const val = snap.val();
    callback(val ? Object.values(val) : []);
  });
}

export function onConfigsGuardadas(callback) {
  return onValue(ref(db, "ruleta/configs"), snap => {
    const val = snap.val();
    if (!val) return callback([]);
    const list = Object.entries(val).map(([id, data]) => ({ id, ...data }));
    callback(list);
  });
}

// ── Admin: configuración global ──

export async function setModo(modo) {
  await set(ref(db, "ruleta/config"), { modo });
}

// ── Admin: configurar una ruleta ──

export async function setRuletaParticipantes(num, { nombre, participantes, eliminarSalidos }) {
  await set(ref(db, `ruleta/ruleta${num}`), {
    nombre: nombre || `Ruleta ${num}`,
    participantes,
    eliminarSalidos: !!eliminarSalidos,
    giro: null,
    ultimoResultado: null,
    historial: []
  });
}

export async function setEliminarSalidos(num, value) {
  await update(ref(db, `ruleta/ruleta${num}`), { eliminarSalidos: value });
}

// ── Admin: girar ruleta ──
// forzados: null (aleatorio) | string[] (lista de elegibles)

export async function girarRuleta(num, forzados = null) {
  const snap = await get(ref(db, `ruleta/ruleta${num}`));
  const data = snap.val();
  if (!data || !data.participantes || data.participantes.length === 0) return null;

  const pool = forzados && forzados.length > 0 ? forzados : data.participantes;
  const resultado = pool[Math.floor(Math.random() * pool.length)];
  const giroId = Date.now().toString();

  await update(ref(db, `ruleta/ruleta${num}`), {
    giro: { id: giroId, resultado, timestamp: Date.now(), duracion: 5000 },
    ultimoResultado: resultado
  });

  return { giroId, resultado };
}

export async function girarAmbas(forzados1 = null, forzados2 = null) {
  const [r1, r2] = await Promise.all([
    girarRuleta(1, forzados1),
    girarRuleta(2, forzados2)
  ]);
  return { r1, r2 };
}

// ── Admin: eliminar resultado de participantes ──

export async function eliminarResultado(num) {
  const snap = await get(ref(db, `ruleta/ruleta${num}`));
  const data = snap.val();
  if (!data) return;

  const ultimo = data.ultimoResultado;
  if (!ultimo) return;

  // Agregar al historial
  const historial = data.historial || [];
  historial.push(ultimo);

  // Eliminar de participantes si la opción está activa
  let participantes = data.participantes || [];
  if (data.eliminarSalidos) {
    const idx = participantes.indexOf(ultimo);
    if (idx !== -1) participantes = [...participantes.slice(0, idx), ...participantes.slice(idx + 1)];
  }

  await update(ref(db, `ruleta/ruleta${num}`), {
    participantes,
    historial,
    ultimoResultado: null,
    giro: null
  });

  return participantes.length;
}

// ── Admin: registrar pareja (modo 2) ──

export async function registrarPareja(resultado1, resultado2) {
  await push(ref(db, "ruleta/parejas"), {
    r1: resultado1,
    r2: resultado2,
    timestamp: Date.now()
  });

  // Eliminar de cada ruleta si corresponde
  await eliminarResultado(1);
  await eliminarResultado(2);
}

// ── Admin: resetear ──

export async function resetRuleta(num) {
  await set(ref(db, `ruleta/ruleta${num}`), {
    nombre: `Ruleta ${num}`,
    participantes: [],
    eliminarSalidos: true,
    giro: null,
    ultimoResultado: null,
    historial: []
  });
}

export async function resetParejas() {
  await remove(ref(db, "ruleta/parejas"));
}

// ── Admin: configs guardadas ──

export async function guardarConfig(nombre, lista) {
  await push(ref(db, "ruleta/configs"), { nombre, lista, creadoEn: Date.now() });
}

export async function eliminarConfig(id) {
  await remove(ref(db, `ruleta/configs/${id}`));
}
