// horoscopo-admin.js — Lógica Firebase para el panel de administración de Horóscopo
// Este archivo va en la carpeta games/ del proyecto (games/horoscopo-admin.js)
// ============================================================
// Reutiliza la lista de signos y las claves de fecha/mes del archivo público
// games/horoscopo.js, para no duplicar esa información.
//
// Guardar = publicar: no hay un paso separado de "borrador". Al guardar texto
// en un signo, ese texto queda visible al instante para los usuarios (mismo
// patrón que ya usan en Tests). Si se guarda vacío, se borra el signo (vuelve
// a quedar "sin publicar") en vez de guardar un texto vacío.

import { db } from "../js/firebase-init.js";
import {
  ref, set, get, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export { SIGNOS, getFechaHoy, getMesActual } from "./horoscopo.js";

// ── Lectura puntual (una vez, para precargar el panel) ──

export async function getHoroscopoDiarioSigno(fecha, signo) {
  const snap = await get(ref(db, `horoscopo/diario/${fecha}/${signo}`));
  return snap.exists() ? snap.val() : "";
}

export async function getHoroscopoMensualSigno(mes, signo) {
  const snap = await get(ref(db, `horoscopo/mensual/${mes}/${signo}`));
  return snap.exists() ? snap.val() : "";
}

// ── Guardado (= publicación inmediata) ──

export async function guardarHoroscopoDiario(fecha, signo, texto) {
  const limpio = (texto || "").trim();
  if (limpio) {
    await set(ref(db, `horoscopo/diario/${fecha}/${signo}`), limpio);
  } else {
    await remove(ref(db, `horoscopo/diario/${fecha}/${signo}`));
  }
  return !!limpio;
}

export async function guardarHoroscopoMensual(mes, signo, texto) {
  const limpio = (texto || "").trim();
  if (limpio) {
    await set(ref(db, `horoscopo/mensual/${mes}/${signo}`), limpio);
  } else {
    await remove(ref(db, `horoscopo/mensual/${mes}/${signo}`));
  }
  return !!limpio;
}
