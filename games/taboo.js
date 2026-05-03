import { db } from "../js/firebase-init.js";
import {
  ref, set, get, update, push, onValue, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── ESTRUCTURA EN FIREBASE ──
// games/taboo/
//   deck/{cardId}        → { word, forbidden: [], createdAt }
//   state/               → { active, currentCard, currentDescriber, currentVeedor,
//                            currentTeam, timeLeft, timerRunning, penaltySkip,
//                            turnDuration, usedCards: [] }
//   scores/              → { rojo: 0, azul: 0 }

// ── CARGAR TARJETA EN FIREBASE ──
async function saveCard(word, forbidden) {
  const wordClean = word.trim().toLowerCase();
  // Verificar duplicado
  const snap = await get(ref(db, "games/taboo/deck"));
  if (snap.exists()) {
    const existing = Object.values(snap.val()).find(
      c => c.word.toLowerCase() === wordClean
    );
    if (existing) throw new Error(`La palabra "${word}" ya existe en el mazo.`);
  }
  const cardRef = push(ref(db, "games/taboo/deck"));
  await set(cardRef, {
    word: word.trim(),
    forbidden: forbidden.map(f => f.trim()).filter(f => f.length > 0),
    createdAt: Date.now()
  });
  return cardRef.key;
}

// ── ELIMINAR TARJETA ──
async function deleteCard(cardId) {
  await remove(ref(db, `games/taboo/deck/${cardId}`));
}

// ── EDITAR TARJETA ──
async function updateCard(cardId, word, forbidden) {
  const wordClean = word.trim().toLowerCase();
  // Verificar duplicado en otras tarjetas
  const snap = await get(ref(db, "games/taboo/deck"));
  if (snap.exists()) {
    const existing = Object.entries(snap.val()).find(
      ([id, c]) => id !== cardId && c.word.toLowerCase() === wordClean
    );
    if (existing) throw new Error(`La palabra "${word}" ya existe en el mazo.`);
  }
  await update(ref(db, `games/taboo/deck/${cardId}`), {
    word: word.trim(),
    forbidden: forbidden.map(f => f.trim()).filter(f => f.length > 0)
  });
}

// ── OBTENER MAZO COMPLETO ──
async function getDeck() {
  const snap = await get(ref(db, "games/taboo/deck"));
  if (!snap.exists()) return {};
  return snap.val();
}

// ── ENVIAR TARJETA ALEATORIA ──
// Ahora guarda la tarjeta en state.currentCard para que TODOS los roles la vean
async function sendRandomCard(describerUid, veedorUid, usedCards = []) {
  const deck = await getDeck();
  const cards = Object.entries(deck);
  if (cards.length === 0) throw new Error("El mazo está vacío.");

  const available = cards.filter(([id]) => !usedCards.includes(id));
  const pool = available.length > 0 ? available : cards;
  const [cardId, card] = pool[Math.floor(Math.random() * pool.length)];

  // Agregar a usedCards
  const newUsed = [...usedCards, cardId];

  await update(ref(db, "games/taboo/state"), {
    currentCard: { id: cardId, ...card },
    currentDescriber: describerUid,
    currentVeedor: veedorUid,
    usedCards: newUsed
  });

  return { cardId, card };
}

// ── INICIAR / PAUSAR TIMER ──
async function setTimerRunning(running) {
  await update(ref(db, "games/taboo/state"), { timerRunning: running });
}

async function setTimeLeft(seconds) {
  await update(ref(db, "games/taboo/state"), { timeLeft: seconds });
}

// ── PASAR TARJETA (−N segundos penalización) ──
// El usuario que describe la pasa → resta penalización + nueva tarjeta
async function skipCard(penaltySeconds, describerUid, veedorUid, usedCards) {
  const snap = await get(ref(db, "games/taboo/state/timeLeft"));
  const current = snap.val() || 0;
  const newTime = Math.max(0, current - penaltySeconds);
  await update(ref(db, "games/taboo/state"), { timeLeft: newTime });
  // Enviar nueva tarjeta sin pausar timer
  await sendRandomCard(describerUid, veedorUid, usedCards);
}

// ── CORRECTA: sumar punto + nueva tarjeta automáticamente ──
// No resta tiempo. Suma 1 punto al equipo y envía nueva tarjeta.
async function markCorrect(team, describerUid, veedorUid, usedCards) {
  const snap = await get(ref(db, `games/taboo/scores/${team}`));
  const current = snap.val() || 0;
  await set(ref(db, `games/taboo/scores/${team}`), current + 1);
  // Enviar nueva tarjeta automáticamente
  await sendRandomCard(describerUid, veedorUid, usedCards);
}

// ── INCORRECTA: solo enviar nueva tarjeta (sin restar tiempo ni puntos) ──
async function markWrong(describerUid, veedorUid, usedCards) {
  // No resta tiempo, no resta puntos. Solo pasa a la siguiente tarjeta.
  await sendRandomCard(describerUid, veedorUid, usedCards);
}

// ── EDITAR PUNTAJE MANUALMENTE ──
async function setScore(team, value) {
  const v = parseInt(value);
  if (isNaN(v) || v < 0) throw new Error("Puntaje inválido.");
  await set(ref(db, `games/taboo/scores/${team}`), v);
}

// ── CONFIGURAR TURNO ──
async function setTurnConfig(config) {
  await update(ref(db, "games/taboo/state"), config);
}

// ── RESETEAR JUEGO ──
async function resetTaboo(defaultTime = 60) {
  await set(ref(db, "games/taboo/state"), {
    active: false,
    currentCard: null,
    currentDescriber: null,
    currentVeedor: null,
    currentTeam: null,
    timeLeft: defaultTime,
    timerRunning: false,
    penaltySkip: 10,
    turnDuration: defaultTime,
    usedCards: []
  });
  await set(ref(db, "games/taboo/scores"), { rojo: 0, azul: 0 });
}

// ── LISTENERS ──
function onTabooState(callback) {
  return onValue(ref(db, "games/taboo/state"), snap => callback(snap.val() || {}));
}

function onTabooScores(callback) {
  return onValue(ref(db, "games/taboo/scores"), snap => callback(snap.val() || { rojo: 0, azul: 0 }));
}

function onTabooDeck(callback) {
  return onValue(ref(db, "games/taboo/deck"), snap => callback(snap.val() || {}));
}

export {
  saveCard, deleteCard, updateCard, getDeck,
  sendRandomCard, skipCard,
  setTimerRunning, setTimeLeft,
  markCorrect, markWrong, setScore,
  setTurnConfig, resetTaboo,
  onTabooState, onTabooScores, onTabooDeck
};
