// ============================================================
//  ¿Quién Soy? — Lógica del juego
//  Firebase Realtime Database
// ============================================================

import { db } from "../js/firebase-init.js";
import {
  ref, onValue, set, update, remove, get, push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const GAS_URL = "https://script.google.com/macros/s/AKfycbzIj-RX_YCbunbJs2zU4-y9GX4ZnRM6G7zenIw5x2_D19VAObu3YwQJTHiFNVmOj691/exec";

// ── Rutas Firebase ──
const STATE_REF  = ref(db, "quiensoy/state");
const CARDS_REF  = ref(db, "quiensoy/cards");

// ============================================================
//  CARTAS — admin
// ============================================================

// ── Helper para llamar al GAS (evita CORS con FormData) ──
async function callGAS(payload) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  const res = await fetch(GAS_URL, { method: "POST", body: form });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error("Respuesta inválida del servidor: " + text.slice(0, 100)); }
}

export async function uploadCard(uid, b64, nombre, categoria) {
  // 1. Subir imagen al GAS → Drive → URL lh3
  const data = await callGAS({ action: "subirImagenQuienSoy", uid, b64, nombre });
  if (!data.ok) throw new Error(data.error || "Error al subir imagen");

  // 2. Guardar carta en Firebase
  const cardRef = push(CARDS_REF);
  await set(cardRef, {
    id:        cardRef.key,
    nombre:    nombre,
    categoria: categoria || "General",
    url:       data.url,
    fileId:    data.fileId,
    creadoEn:  Date.now()
  });

  return { id: cardRef.key, url: data.url };
}

export async function deleteCard(uid, cardId, fileId) {
  if (fileId) {
    await callGAS({ action: "eliminarImagenQuienSoy", uid, fileId });
  }
  await remove(ref(db, `quiensoy/cards/${cardId}`));
}

export async function getCards() {
  const snap = await get(CARDS_REF);
  return snap.val() || {};
}

export function onCards(cb) {
  return onValue(CARDS_REF, snap => cb(snap.val() || {}));
}

// ============================================================
//  ESTADO DEL JUEGO — admin controla
// ============================================================

// Estado inicial / reset
export async function resetQuienSoy() {
  await set(STATE_REF, {
    phase:       "waiting",   // waiting | playing | result
    cardId:      null,
    guesserUid:  null,        // quién adivina (no recibe imagen)
    guesserNick: null,
    guesserTeam: null,
    timerSecs:   60,
    timerStart:  null,
    timerActive: false,
    roundScore:  null         // "adivinó" | "noAdivinó"
  });
}

// Iniciar turno: elegir carta y jugador que adivina
export async function startQuienSoyRound({ cardId, guesserUid, guesserNick, guesserTeam, timerSecs }) {
  await set(STATE_REF, {
    phase:       "playing",
    cardId,
    guesserUid,
    guesserNick,
    guesserTeam,
    timerSecs:   timerSecs || 60,
    timerStart:  Date.now(),
    timerActive: true,
    roundScore:  null
  });
}

// Admin pausa/reanuda el timer
export async function setTimerActive(active) {
  await update(STATE_REF, {
    timerActive: active,
    timerStart:  active ? Date.now() : null
  });
}

// Admin fuerza nuevo tiempo (reinicia el timer)
export async function resetTimer(secs) {
  await update(STATE_REF, {
    timerSecs:   secs,
    timerStart:  Date.now(),
    timerActive: true
  });
}

// Admin cierra el turno con resultado
export async function resolveRound(guesserUid, guesserTeam, adivinó) {
  await update(STATE_REF, {
    phase:       "result",
    timerActive: false,
    roundScore:  adivinó ? "adivinó" : "noAdivinó"
  });

  if (adivinó && guesserTeam) {
    // Sumar al marcador de sesión (equipo)
    const teamScoreRef = ref(db, `session/scores/${guesserTeam}`);
    const snapTeam = await get(teamScoreRef);
    await set(teamScoreRef, (snapTeam.val() || 0) + 1);
  }

  if (adivinó && guesserUid) {
    // Sumar punto al usuario individual para el ranking general
    const userPointsRef = ref(db, `users/${guesserUid}/quienSoyPoints`);
    const snapUser = await get(userPointsRef);
    await set(userPointsRef, (snapUser.val() || 0) + 1);
  }
}

// ============================================================
//  LISTENERS — jugadores
// ============================================================

export function onQuienSoyState(cb) {
  return onValue(STATE_REF, snap => cb(snap.val() || { phase: "waiting" }));
}

// Obtener datos de una carta específica
export async function getCard(cardId) {
  if (!cardId) return null;
  const snap = await get(ref(db, `quiensoy/cards/${cardId}`));
  return snap.val();
}
