// ruleta.js — Lógica Firebase para La Ruleta de El Burdel

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

// ── Calcular ángulo absoluto final para un resultado ──
// El puntero está arriba (−π/2). Necesitamos que el CENTRO del segmento ganador quede ahí.
// Usamos un ángulo de BASE fijo (0) + vueltas completas para que gire bastante.
// Este cálculo es DETERMINISTA: mismo resultado + misma lista = mismo ángulo siempre.
export function calcAnguloFinal(participantes, resultado, vueltas = 8) {
  const n = participantes.length;
  const idx = participantes.indexOf(resultado);
  if (idx === -1 || n === 0) return Math.PI * 2 * vueltas;
  const slice = (Math.PI * 2) / n;
  // Ángulo del centro del segmento idx, partiendo desde 0
  const centroSegmento = idx * slice + slice / 2;
  // Para que el centro quede arriba (−π/2), el ángulo de rotación del canvas tiene que ser:
  const anguloBase = -Math.PI / 2 - centroSegmento;
  // Normalizamos a positivo para que siempre gire hacia adelante
  const normalizado = ((anguloBase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  // Sumamos vueltas completas (siempre parte desde 0, va a normalizado + N vueltas)
  return normalizado + Math.PI * 2 * vueltas;
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

  // Calcular ángulo final aquí, en el admin, y guardarlo en Firebase
  const anguloFinal = calcAnguloFinal(data.participantes, resultado);

  await update(ref(db, `ruleta/ruleta${num}`), {
    giro: {
      id: giroId,
      resultado,
      anguloFinal,           // ← todos los clientes usan este valor exacto
      timestamp: Date.now(),
      duracion: 5000
    },
    ultimoResultado: resultado
  });

  return { giroId, resultado, anguloFinal };
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

  const historial = data.historial || [];
  historial.push(ultimo);

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
