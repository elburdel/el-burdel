import { db } from "../js/firebase-init.js";
import {
  ref, set, get, update, push, onValue, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── ESTRUCTURA EN FIREBASE ──
// games/taboo/
//   deck/{cardId}        → { word, forbidden: [], createdAt }
//   state/               → { active, currentCard, currentDescriber, currentVeedor, timeLeft, timerRunning, penaltyWrong, penaltySkip }
//   scores/              → { rojo: 0, azul: 0 }
//   visibleTo/           → { [uid]: true }  — quiénes ven la tarjeta actual

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

// ── OBTENER MAZO COMPLETO ──
async function getDeck() {
  const snap = await get(ref(db, "games/taboo/deck"));
  if (!snap.exists()) return {};
  return snap.val();
}

// ── ENVIAR TARJETA ALEATORIA ──
async function sendRandomCard(describerUid, veedorUid, usedCards = []) {
  const deck = await getDeck();
  const cards = Object.entries(deck);
  if (cards.length === 0) throw new Error("El mazo está vacío.");

  const available = cards.filter(([id]) => !usedCards.includes(id));
  const pool = available.length > 0 ? available : cards;
  const [cardId, card] = pool[Math.floor(Math.random() * pool.length)];

  await update(ref(db, "games/taboo/state"), {
    currentCard: { id: cardId, ...card },
    currentDescriber: describerUid,
    currentVeedor: veedorUid,
    timerRunning: false
  });

  // Solo admin, describer y veedor ven la tarjeta
  await set(ref(db, "games/taboo/visibleTo"), {
    [describerUid]: true,
    [veedorUid]: true
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

// ── PASAR TARJETA (−N segundos) ──
async function skipCard(penaltySeconds, describerUid, veedorUid, usedCards) {
  const snap = await get(ref(db, "games/taboo/state/timeLeft"));
  const current = snap.val() || 0;
  const newTime = Math.max(0, current - penaltySeconds);
  await update(ref(db, "games/taboo/state"), { timeLeft: newTime, timerRunning: false });
  await sendRandomCard(describerUid, veedorUid, usedCards);
}

// ── CORRECTA: sumar punto ──
async function markCorrect(team) {
  const snap = await get(ref(db, `games/taboo/scores/${team}`));
  const current = snap.val() || 0;
  await set(ref(db, `games/taboo/scores/${team}`), current + 1);
}

// ── INCORRECTA: restar tiempo ──
async function markWrong(penaltySeconds) {
  const snap = await get(ref(db, "games/taboo/state/timeLeft"));
  const current = snap.val() || 0;
  const newTime = Math.max(0, current - penaltySeconds);
  await update(ref(db, "games/taboo/state"), { timeLeft: newTime });
}

// ── EDITAR PUNTAJE MANUALMENTE ──
async function setScore(team, value) {
  const v = parseInt(value);
  if (isNaN(v) || v < 0) throw new Error("Puntaje inválido.");
  await set(ref(db, `games/taboo/scores/${team}`), v);
}

// ── RESETEAR JUEGO ──
async function resetTaboo(defaultTime = 60) {
  await set(ref(db, "games/taboo/state"), {
    active: false,
    currentCard: null,
    currentDescriber: null,
    currentVeedor: null,
    timeLeft: defaultTime,
    timerRunning: false,
    penaltyWrong: 5,
    penaltySkip: 10
  });
  await set(ref(db, "games/taboo/scores"), { rojo: 0, azul: 0 });
  await set(ref(db, "games/taboo/visibleTo"), null);
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

function onVisibleTo(callback) {
  return onValue(ref(db, "games/taboo/visibleTo"), snap => callback(snap.val() || {}));
}

export {
  saveCard, deleteCard, getDeck,
  sendRandomCard, skipCard,
  setTimerRunning, setTimeLeft,
  markCorrect, markWrong, setScore,
  resetTaboo,
  onTabooState, onTabooScores, onTabooDeck, onVisibleTo
};
