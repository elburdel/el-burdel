// wordle.js — Lógica Firebase para El Wordle de El Burdel
// Maneja: palabra del día (5 y 6 letras), resultados por usuario, ranking global

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { WORDS_5, WORDS_6, VALID_5, VALID_6 } from "./words.js";

const MAX_ATTEMPTS = 6;

// ── Fecha de hoy como clave (YYYY-MM-DD, zona horaria local) ──
export function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Palabra del día ──
// Primero busca si el admin forzó una palabra; si no, la deriva del hash de la fecha.
export async function getWordOfDay(mode) {
  // mode: "5" o "6"
  const today = getTodayKey();

  // 1. Verificar si el admin forzó una palabra para hoy
  const forcedSnap = await get(ref(db, `wordle/forced/${today}/${mode}`));
  if (forcedSnap.exists()) {
    const w = forcedSnap.val();
    if (w && w.length === parseInt(mode)) return w.toUpperCase();
  }

  // 2. Derivar la palabra del día a partir de la fecha (determinista)
  const list = mode === "5" ? WORDS_5 : WORDS_6;
  const hash = await dateHash(today + mode);
  return list[hash % list.length];
}

// Hash numérico simple de un string
async function dateHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return hashArray[0] * 256 + hashArray[1];
}

// ── Puntaje según intentos ──
export function calcPoints(attempts) {
  // attempts: número de intento en que acertó (1–6), o 0 si no adivinó
  const table = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1, 0: 0 };
  return table[attempts] ?? 0;
}

// ── Guardar resultado del día ──
// Llamar cuando el usuario termina (ganó o agotó intentos)
export async function saveResult(uid, mode, { won, attempts, word }) {
  const today = getTodayKey();
  const points = won ? calcPoints(attempts) : 0;

  // Guardar resultado del día en wordle/results/{uid}/{today}/{mode}
  await set(ref(db, `wordle/results/${uid}/${today}/${mode}`), {
    won,
    attempts,
    word,
    points,
    timestamp: Date.now()
  });

  // Actualizar stats globales del usuario en users/{uid}/wordleStats
  const statsSnap = await get(ref(db, `users/${uid}/wordleStats`));
  const stats = statsSnap.val() || {
    totalPoints: 0,
    played: 0,
    won: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastWonDate: null
  };

  stats.played += 1;
  stats.totalPoints += points;

  if (won) {
    stats.won += 1;
    // Racha: si ganó ayer o es la primera, suma; si no, resetea
    const yesterday = getYesterdayKey();
    if (stats.lastWonDate === today || stats.lastWonDate === yesterday) {
      stats.currentStreak += 1;
    } else {
      stats.currentStreak = 1;
    }
    if (stats.currentStreak > stats.bestStreak) {
      stats.bestStreak = stats.currentStreak;
    }
    stats.lastWonDate = today;
  } else {
    // Solo rompe la racha si ya no tiene más partidas del día
    // (puede seguir con el otro modo)
  }

  await update(ref(db, `users/${uid}/wordleStats`), stats);
}

// ── Obtener resultado del usuario para hoy ──
export async function getTodayResult(uid, mode) {
  const today = getTodayKey();
  const snap = await get(ref(db, `wordle/results/${uid}/${today}/${mode}`));
  return snap.exists() ? snap.val() : null;
}

// ── Ya jugó hoy este modo? ──
export async function hasPlayedToday(uid, mode) {
  const result = await getTodayResult(uid, mode);
  return result !== null;
}

// ── Ranking global (escucha en tiempo real) ──
export function onRanking(callback) {
  onValue(ref(db, "users"), (snap) => {
    const users = snap.val() || {};
    const ranking = Object.entries(users)
      .filter(([, u]) => u.role !== "admin" && u.status === "active")
      .map(([uid, u]) => ({
        uid,
        nick: u.nick || "—",
        team: u.team || null,
        totalPoints: u.wordleStats?.totalPoints || 0,
        played: u.wordleStats?.played || 0,
        won: u.wordleStats?.won || 0,
        currentStreak: u.wordleStats?.currentStreak || 0,
        bestStreak: u.wordleStats?.bestStreak || 0
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
    callback(ranking);
  });
}

// ── Admin: forzar palabra del día ──
export async function forceWordOfDay(mode, word) {
  const today = getTodayKey();
  const list = mode === "5" ? WORDS_5 : WORDS_6;
  const upper = word.toUpperCase();
  if (upper.length !== parseInt(mode)) {
    throw new Error(`La palabra debe tener ${mode} letras.`);
  }
  await set(ref(db, `wordle/forced/${today}/${mode}`), upper);
}

// ── Validar si una palabra está en la lista de palabras aceptadas ──
export function isValidWord(word, mode) {
  const upper = word.toUpperCase();
  const validSet = mode === "5" ? VALID_5 : VALID_6;
  return validSet.has(upper);
}

// ── Evaluar un intento: devuelve array de estados por letra ──
// Estado: "correct" | "present" | "absent"
export function evaluateGuess(guess, target) {
  const g = guess.toUpperCase().split("");
  const t = target.toUpperCase().split("");
  const result = Array(g.length).fill("absent");
  const targetCount = {};

  // Primera pasada: correctas en posición
  for (let i = 0; i < g.length; i++) {
    if (g[i] === t[i]) {
      result[i] = "correct";
      targetCount[t[i]] = (targetCount[t[i]] || 0) - 1;
    } else {
      targetCount[t[i]] = (targetCount[t[i]] || 0) + 1;
    }
  }

  // Segunda pasada: presentes en otra posición
  for (let i = 0; i < g.length; i++) {
    if (result[i] === "correct") continue;
    if (targetCount[g[i]] > 0) {
      result[i] = "present";
      targetCount[g[i]]--;
    }
  }

  return result;
}

// ── Helper: ayer como clave ──
function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export { MAX_ATTEMPTS };
