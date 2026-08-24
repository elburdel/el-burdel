// horoscopo.js — Lógica Firebase para la sección Horóscopo (vista participante)
// Este archivo va en la carpeta games/ del proyecto (games/horoscopo.js)
// ============================================================
// Estructura Firebase:
//   horoscopo/diario/{YYYY-MM-DD}/{signo}   → texto del horóscopo de ese día para ese signo
//   horoscopo/mensual/{YYYY-MM}/{signo}     → texto del horóscopo de ese mes para ese signo
//   users/{uid}/signoZodiacal               → signo elegido por el usuario (se recuerda)
//
// El día y el mes se resuelven siempre en base a la fecha actual del cliente
// (hora de Argentina, que es la que usa la comunidad) — no hace falta "cerrar"
// ni "limpiar" nada al cambiar de día o de mes: simplemente cambia la clave
// que se lee. Los días/meses anteriores quedan guardados en Firebase pero esta
// vista no los consulta (no hay historial todavía).

import { db } from "../js/firebase-init.js";
import {
  ref, set, get, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export const SIGNOS = [
  { key: "aries",        nombre: "Aries",        icono: "♈" },
  { key: "tauro",        nombre: "Tauro",        icono: "♉" },
  { key: "geminis",      nombre: "Géminis",      icono: "♊" },
  { key: "cancer",       nombre: "Cáncer",       icono: "♋" },
  { key: "leo",          nombre: "Leo",          icono: "♌" },
  { key: "virgo",        nombre: "Virgo",        icono: "♍" },
  { key: "libra",        nombre: "Libra",        icono: "♎" },
  { key: "escorpio",     nombre: "Escorpio",     icono: "♏" },
  { key: "sagitario",    nombre: "Sagitario",    icono: "♐" },
  { key: "capricornio",  nombre: "Capricornio",  icono: "♑" },
  { key: "acuario",      nombre: "Acuario",      icono: "♒" },
  { key: "piscis",       nombre: "Piscis",       icono: "♓" },
];

function pad2(n) { return String(n).padStart(2, "0"); }

// ── Claves de fecha (locales, no UTC) ──

export function getFechaHoy() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function getMesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// ── Lectura en tiempo real ──

export function onHoroscopoDiario(signo, callback) {
  const fecha = getFechaHoy();
  return onValue(ref(db, `horoscopo/diario/${fecha}/${signo}`), (snap) => {
    callback(snap.val() || null);
  });
}

export function onHoroscopoMensual(signo, callback) {
  const mes = getMesActual();
  return onValue(ref(db, `horoscopo/mensual/${mes}/${signo}`), (snap) => {
    callback(snap.val() || null);
  });
}

// ── Preferencia de signo del usuario ──

export async function getSignoUsuario(uid) {
  const snap = await get(ref(db, `users/${uid}/signoZodiacal`));
  return snap.exists() ? snap.val() : null;
}

export async function guardarSignoUsuario(uid, signoKey) {
  await set(ref(db, `users/${uid}/signoZodiacal`), signoKey);
}

export function getSignoInfo(signoKey) {
  return SIGNOS.find(s => s.key === signoKey) || null;
}
