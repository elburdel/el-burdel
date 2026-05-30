// games/millon.js — El Millonario · El Burdel
// Firebase structure:
//   millon/state    → { active, phase, round, millionaireUid, timerEndsAt, topic }
//   millon/players  → { uid: { nick, alive, immune, votesExtra, missionType, missionComplete } }
//   millon/missions → { uid: { text, difficulty, reward, isFake } }
//   millon/votes    → { uid: { voted } }
//   millon/history  → { push: { round, millionaire, eliminated, missionText, hadMillion } }

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, remove, push, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Refs ──
export const stateRef    = () => ref(db, "millon/state");
export const playersRef  = () => ref(db, "millon/players");
export const missionsRef = () => ref(db, "millon/missions");
export const votesRef    = () => ref(db, "millon/votes");
export const historyRef  = () => ref(db, "millon/history");
export const settingsRef = () => ref(db, "millon/settings");
export const playerRef   = (uid) => ref(db, `millon/players/${uid}`);
export const missionRef  = (uid) => ref(db, `millon/missions/${uid}`);
export const voteRef     = (uid) => ref(db, `millon/votes/${uid}`);
export const milRef      = () => ref(db, "millon");

// ── Listeners ──
export function listenState(cb) {
  return onValue(stateRef(), snap => cb(snap.exists() ? snap.val() : null));
}
export function listenPlayers(cb) {
  return onValue(playersRef(), snap => cb(snap.exists() ? snap.val() : {}));
}
export function listenVotes(cb) {
  return onValue(votesRef(), snap => cb(snap.exists() ? snap.val() : {}));
}
export function listenMyMission(uid, cb) {
  return onValue(missionRef(uid), snap => cb(snap.exists() ? snap.val() : null));
}

// ── Join (auto al entrar a la página) ──
export async function joinGame(uid, nick) {
  const snap = await get(playerRef(uid));
  const existing = snap.exists() ? snap.val() : {};
  await update(playerRef(uid), {
    nick,
    connected: true,
    alive: existing.alive !== undefined ? existing.alive : true,
    immune:      existing.immune      || false,
    votesExtra:  existing.votesExtra  || 0,
    missionType: existing.missionType || "none",
    missionComplete: existing.missionComplete || false,
  });
}

export async function setDisconnected(uid) {
  await update(playerRef(uid), { connected: false });
}

// ── Votar ──
export async function castVote(voterUid, targetUid) {
  const snap = await get(voteRef(voterUid));
  if (snap.exists()) return { ok: false, reason: "Ya votaste esta ronda." };
  await set(voteRef(voterUid), { voted: targetUid });
  return { ok: true };
}

// ── Admin: iniciar partida ──
export async function adminStartGame({ talkTime = 300, finalPlayers = 3 } = {}) {
  await set(settingsRef(), { talkTime, finalPlayers });
  const snap = await get(playersRef());
  const players = snap.exists() ? snap.val() : {};
  const uids = Object.keys(players).filter(uid => players[uid].alive !== false);
  if (uids.length < 3) return { ok: false, reason: "Se necesitan al menos 3 jugadores." };

  await set(votesRef(), null);

  await set(stateRef(), {
    active: true,
    phase: "talking",
    round: 1,
    millionaireUid: null,   // el admin lo asigna desde el panel
    timerEndsAt: Date.now() + talkTime * 1000,
    topic: "",
    totalPlayers: uids.length,
    finalPlayers,
  });
  return { ok: true };
}

// ── Admin: cambiar fase ──
export async function adminSetPhase(phase) {
  await update(stateRef(), { phase });
}

// ── Admin: tópico ──
export async function adminSetTopic(topic) {
  await update(stateRef(), { topic });
}

// ── Admin: extender timer ──
export async function adminExtendTimer(extraSecs) {
  const snap = await get(stateRef());
  if (!snap.exists()) return;
  const end = Math.max(snap.val().timerEndsAt || Date.now(), Date.now());
  await update(stateRef(), { timerEndsAt: end + extraSecs * 1000 });
}

// ── Admin: asignar millonario ──
export async function adminSetMillionaire(uid) {
  await update(stateRef(), { millionaireUid: uid });
}

// ── Admin: procesar votos → devuelve eliminado ──
export async function adminProcessVotes() {
  const [vSnap, pSnap, sSnap] = await Promise.all([
    get(votesRef()), get(playersRef()), get(stateRef())
  ]);
  const votes   = vSnap.exists() ? vSnap.val() : {};
  const players = pSnap.exists() ? pSnap.val() : {};
  const state   = sSnap.exists() ? sSnap.val() : {};

  const tally = {};
  Object.entries(votes).forEach(([voterUid, { voted }]) => {
    if (!voted) return;
    const extra = players[voterUid]?.votesExtra || 0;
    tally[voted] = (tally[voted] || 0) + 1 + extra;
  });

  // Inmunes no pueden ser eliminados
  Object.keys(players).forEach(uid => {
    if (players[uid]?.immune) delete tally[uid];
  });

  let eliminatedUid = null, maxVotes = 0;
  Object.entries(tally).forEach(([uid, count]) => {
    if (count > maxVotes && players[uid]?.alive !== false) {
      maxVotes = count; eliminatedUid = uid;
    }
  });

  const hadMillion = eliminatedUid === state.millionaireUid;
  const mSnap = state.millionaireUid ? await get(missionRef(state.millionaireUid)) : null;
  const missionText = mSnap?.exists() ? mSnap.val().text : "";

  await push(historyRef(), {
    round: state.round || 1,
    millionaire: state.millionaireUid,
    eliminated: eliminatedUid,
    missionText,
    hadMillion,
    tally,
  });

  return { eliminatedUid, hadMillion, tally, millionaireUid: state.millionaireUid };
}

// ── Admin: siguiente ronda ──
export async function adminNextRound(eliminatedUid, hadMillion) {
  const [pSnap, sSnap] = await Promise.all([get(playersRef()), get(stateRef())]);
  const players = pSnap.exists() ? pSnap.val() : {};
  const state   = sSnap.exists() ? sSnap.val() : {};

  if (eliminatedUid) await update(playerRef(eliminatedUid), { alive: false });

  const aliveUids = Object.keys(players).filter(
    uid => players[uid].alive !== false && uid !== eliminatedUid
  );

  if (aliveUids.length <= (state.finalPlayers || 3)) {
    await update(stateRef(), { phase: "final" });
    return { ended: true };
  }

  // Resetear votos, inmunidades, misiones
  await set(votesRef(), null);
  for (const uid of aliveUids) {
    await update(playerRef(uid), { immune: false, votesExtra: 0, missionComplete: false });
  }
  await set(missionsRef(), null);

  const snap = await get(settingsRef());
  const talkTime = snap.exists() ? (snap.val().talkTime || 300) : 300;

  await update(stateRef(), {
    phase: "talking",
    round: (state.round || 1) + 1,
    millionaireUid: null,  // admin elige de nuevo
    timerEndsAt: Date.now() + talkTime * 1000,
    topic: "",
  });

  return { ended: false };
}

// ── Admin: eliminar manualmente ──
export async function adminEliminatePlayer(uid) {
  await update(playerRef(uid), { alive: false });
}

// ── Admin: asignar misión ──
export async function adminAssignMission(uid, { text, difficulty, reward, isFake }) {
  await set(missionRef(uid), { text, difficulty, reward: reward || null, isFake: !!isFake });
}

// ── Admin: terminar ──
export async function adminEndGame() {
  await update(stateRef(), { active: false, phase: "ended" });
}

// ── Admin: resetear todo ──
export async function adminResetGame() {
  await set(milRef(), null);
}

export const REWARD_LABELS = {
  extra_vote: "+1 voto extra",
  immune: "Inmunidad esta ronda",
};
