// games/millon.js — Lógica Firebase para El Millón · El Burdel
// Estructura Firebase:
//   millon/state    → { active, phase, round, millionaireUid, timerEndsAt, topic, enrollmentOpen }
//   millon/players  → { uid: { nick, alive, votesExtra, immune, connected, enrolled } }
//   millon/missions → { uid: { text, difficulty, reward, completed, detected, isFake } }
//   millon/votes    → { uid: { voted } }
//   millon/history  → { round1: { millionaire, eliminated, mission, success } }
//   millon/settings → { talkTime, minPlayers, finalPlayers, revealVotes, allowTransfer }

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, onValue, remove, push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ══════════════════════════════════════════
// BANCO DE MISIONES
// ══════════════════════════════════════════

export const MISSIONS = {
  easy: [
    { text: 'Hacé que alguien diga "literal"', reward: "extra_vote" },
    { text: 'Hacé que alguien diga "pará"', reward: "extra_vote" },
    { text: "Hacé reír a alguien", reward: "extra_vote" },
    { text: 'Hacé que alguien diga "nah bueno"', reward: "extra_vote" },
    { text: 'Hacé que alguien pregunte "¿qué dijiste?"', reward: "extra_vote" },
    { text: "Mencioná un animal en la charla de forma natural", reward: "extra_vote" },
    { text: "Usá una palabra en inglés en la conversación", reward: "extra_vote" },
    { text: 'Hacé que alguien diga "no entendí"', reward: "extra_vote" },
    { text: "Decí tres veces el nombre de alguien", reward: "extra_vote" },
    { text: "Mencioná un país de forma random en la conversación", reward: "extra_vote" },
    { text: 'Hacé que alguien diga "es cine"', reward: "extra_vote" },
    { text: "Hacé que alguien te corrija en algo", reward: "extra_vote" },
  ],
  medium: [
    { text: "Dejá un silencio incómodo de al menos 5 segundos", reward: "extra_vote" },
    { text: "Hacé que dos personas hablen al mismo tiempo", reward: "extra_vote" },
    { text: "Lograá que alguien cuente una anécdota vergonzosa", reward: "extra_vote" },
    { text: "Cambiá el tema de conversación sin que nadie lo note", reward: "extra_vote" },
    { text: "Hacé que alguien se contradiga con lo que dijo antes", reward: "extra_vote" },
    { text: "Generá una mini discusión entre dos personas", reward: "extra_vote" },
    { text: "Respondé todo con preguntas durante 2 minutos", reward: "extra_vote" },
    { text: "Hablá muchísimo durante al menos 2 minutos seguidos", reward: "extra_vote" },
    { text: "No hablés durante 1 minuto entero", reward: "extra_vote" },
    { text: "Interrumpí exactamente 3 veces", reward: "extra_vote" },
    { text: 'Hacé que alguien diga "yo no fui"', reward: "extra_vote" },
    { text: "Coincidí con todo lo que diga una persona", reward: "extra_vote" },
  ],
  hard: [
    { text: "Convencé a alguien de cambiar su voto", reward: "immune" },
    { text: "Instalá sospecha sobre un inocente", reward: "immune" },
    { text: "Hacé que alguien te defienda activamente", reward: "immune" },
    { text: "Mentí durante toda la ronda sin que te descubran", reward: "immune" },
    { text: "Sobrevivé una ronda hablando muy poco", reward: "immune" },
    { text: "Convencé a dos personas de cosas opuestas", reward: "immune" },
    { text: "Hacé que otro dude de su aliado", reward: "immune" },
    { text: "Acusá a alguien sin pruebas y que al menos uno te siga", reward: "immune" },
  ],
  fake: [
    { text: "Tu misión no existe. Solo actuá normal.", reward: null, isFake: true },
    { text: "No tenés misión esta ronda. Observá y confundí.", reward: null, isFake: true },
  ]
};

export const REWARD_LABELS = {
  extra_vote:      "+1 Voto extra",
  immune:          "Inmunidad esta ronda",
  double_vote:     "+2 Votos",
  transfer_million:"Pasar el millón",
  block_vote:      "Bloquear un voto",
  reveal_suspect:  "Ver quién sospecha de vos",
};

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickMission(difficulty = "easy") {
  const pool = MISSIONS[difficulty] || MISSIONS.easy;
  const mission = { ...pickRandom(pool) };
  mission.completed = false;
  mission.detected  = false;
  mission.difficulty = difficulty;
  if (!mission.isFake) mission.isFake = false;
  return mission;
}

export function pickMissionWithFakeChance(difficulty = "easy") {
  if (Math.random() < 0.15) {
    const fake = { ...pickRandom(MISSIONS.fake) };
    fake.difficulty = difficulty;
    fake.completed  = false;
    fake.detected   = false;
    return fake;
  }
  return pickMission(difficulty);
}

export function getDifficultyForRound(playersAlive, totalPlayers) {
  const ratio = playersAlive / totalPlayers;
  if (ratio > 0.7) return "easy";
  if (ratio > 0.5) return "medium";
  return "hard";
}

// ══════════════════════════════════════════
// FIREBASE REFS
// ══════════════════════════════════════════

export const milRef       = () => ref(db, "millon");
export const stateRef     = () => ref(db, "millon/state");
export const playersRef   = () => ref(db, "millon/players");
export const missionsRef  = () => ref(db, "millon/missions");
export const votesRef     = () => ref(db, "millon/votes");
export const historyRef   = () => ref(db, "millon/history");
export const settingsRef  = () => ref(db, "millon/settings");
export const playerRef    = (uid) => ref(db, `millon/players/${uid}`);
export const missionRef   = (uid) => ref(db, `millon/missions/${uid}`);
export const voteRef      = (uid) => ref(db, `millon/votes/${uid}`);

// ══════════════════════════════════════════
// SETTINGS DEFAULT
// ══════════════════════════════════════════

export const DEFAULT_SETTINGS = {
  talkTime:     300,
  minPlayers:   4,
  finalPlayers: 3,
  revealVotes:  false,
  allowTransfer: true,
};

// ══════════════════════════════════════════
// ESTADO PÚBLICO
// ══════════════════════════════════════════

export async function getPublicState() {
  const snap = await get(stateRef());
  return snap.exists() ? snap.val() : null;
}

export async function getPlayers() {
  const snap = await get(playersRef());
  return snap.exists() ? snap.val() : {};
}

export async function getSettings() {
  const snap = await get(settingsRef());
  if (snap.exists()) return { ...DEFAULT_SETTINGS, ...snap.val() };
  return { ...DEFAULT_SETTINGS };
}

// ══════════════════════════════════════════
// INSCRIPCIÓN — JUGADOR
// Se llama solo cuando el jugador presiona "Quiero jugar"
// ══════════════════════════════════════════

export async function enrollPlayer(uid, nick) {
  // Verificar que las inscripciones estén abiertas
  const stateSnap = await get(stateRef());
  const state = stateSnap.exists() ? stateSnap.val() : {};
  if (!state.enrollmentOpen) {
    return { ok: false, reason: "Las inscripciones están cerradas." };
  }
  // Verificar que no haya partida activa
  if (state.active && state.phase !== "ended") {
    return { ok: false, reason: "Ya hay una partida en curso." };
  }

  const snap = await get(playerRef(uid));
  const existing = snap.exists() ? snap.val() : {};
  await update(playerRef(uid), {
    nick:       nick || existing.nick || "Jugador",
    connected:  true,
    alive:      true,
    enrolled:   true,
    votesExtra: 0,
    immune:     false,
    ready:      false,
  });
  return { ok: true };
}

export async function unenrollPlayer(uid) {
  const snap = await get(playerRef(uid));
  if (!snap.exists()) return;
  await update(playerRef(uid), { enrolled: false, connected: false });
}

// Registrar presencia sin inscribir al jugador en la partida
// (para jugadores que llegan a la página pero aún no presionaron "Quiero jugar")
export async function registerPresence(uid, nick) {
  const snap = await get(playerRef(uid));
  const existing = snap.exists() ? snap.val() : {};
  // Solo actualizamos connected y nick; enrolled permanece como estaba
  await update(playerRef(uid), {
    nick:      nick || existing.nick || "Jugador",
    connected: true,
    enrolled:  existing.enrolled || false,
    alive:     existing.alive !== undefined ? existing.alive : false,
  });
}

export async function setDisconnected(uid) {
  await update(playerRef(uid), { connected: false });
}

// Compat: joinGame sigue funcionando durante la partida activa
export async function joinGame(uid, nick) {
  const snap = await get(playerRef(uid));
  const existing = snap.exists() ? snap.val() : {};
  await update(playerRef(uid), {
    nick:       nick || existing.nick || "Jugador",
    connected:  true,
    alive:      existing.alive !== undefined ? existing.alive : true,
    enrolled:   existing.enrolled !== undefined ? existing.enrolled : false,
    votesExtra: existing.votesExtra || 0,
    immune:     existing.immune || false,
    ready:      existing.ready || false,
  });
}

export async function setReady(uid, value) {
  await update(playerRef(uid), { ready: value });
}

// ══════════════════════════════════════════
// MISIÓN PROPIA
// ══════════════════════════════════════════

export async function getMyMission(uid) {
  const snap = await get(missionRef(uid));
  return snap.exists() ? snap.val() : null;
}

// ══════════════════════════════════════════
// VOTAR
// ══════════════════════════════════════════

export async function castVote(voterUid, targetUid) {
  const snap = await get(voteRef(voterUid));
  if (snap.exists()) return { ok: false, reason: "Ya votaste esta ronda." };
  await set(voteRef(voterUid), { voted: targetUid });
  return { ok: true };
}

export async function getMyVote(uid) {
  const snap = await get(voteRef(uid));
  return snap.exists() ? snap.val().voted : null;
}

// ══════════════════════════════════════════
// LISTENERS TIEMPO REAL
// ══════════════════════════════════════════

export function listenState(callback) {
  return onValue(stateRef(), (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}

export function listenPlayers(callback) {
  return onValue(playersRef(), (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}

export function listenMyMission(uid, callback) {
  return onValue(missionRef(uid), (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}

export function listenVotes(callback) {
  return onValue(votesRef(), (snap) => {
    callback(snap.exists() ? snap.val() : {});
  });
}

// ══════════════════════════════════════════
// ADMIN — ABRIR / CERRAR INSCRIPCIONES
// ══════════════════════════════════════════

export async function adminOpenEnrollment() {
  // Resetea jugadores anteriores y abre inscripciones
  await set(playersRef(), null);
  await set(stateRef(), {
    active:          false,
    phase:           "lobby",
    enrollmentOpen:  true,
    round:           0,
    millionaireUid:  null,
    timerEndsAt:     null,
    topic:           "",
  });
  return { ok: true };
}

export async function adminCloseEnrollment() {
  await update(stateRef(), { enrollmentOpen: false });
  return { ok: true };
}

export async function adminKickPlayer(uid) {
  await update(playerRef(uid), { enrolled: false, connected: false });
}

// ══════════════════════════════════════════
// ADMIN — INICIAR PARTIDA
// Solo los jugadores con enrolled:true participan
// ══════════════════════════════════════════

export async function adminStartGame(settings = {}) {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
  await set(settingsRef(), mergedSettings);

  const playersSnap = await get(playersRef());
  const allPlayers  = playersSnap.exists() ? playersSnap.val() : {};

  // Solo los inscriptos
  const uids = Object.keys(allPlayers).filter(uid => allPlayers[uid].enrolled === true);

  if (uids.length < mergedSettings.minPlayers) {
    return { ok: false, reason: `Se necesitan al menos ${mergedSettings.minPlayers} jugadores inscriptos.` };
  }

  // Elegir millonario — respetar override del admin si existe
  const millionaireUid = (mergedSettings.millionaireOverride && uids.includes(mergedSettings.millionaireOverride))
    ? mergedSettings.millionaireOverride
    : pickRandom(uids);

  // Asignar misiones
  const missionsUpdate = {};
  uids.forEach(uid => {
    const difficulty = getDifficultyForRound(uids.length, uids.length);
    missionsUpdate[uid] = pickMissionWithFakeChance(difficulty);
  });
  await set(missionsRef(), missionsUpdate);

  // Resetear votos
  await set(votesRef(), null);

  // Resetear jugadores inscriptos
  const playersUpdate = {};
  uids.forEach(uid => {
    playersUpdate[uid] = {
      ...allPlayers[uid],
      alive:      true,
      votesExtra: 0,
      immune:     false,
      enrolled:   true,
    };
  });
  await set(playersRef(), playersUpdate);

  // Setear estado
  await set(stateRef(), {
    active:          true,
    phase:           "talking",
    enrollmentOpen:  false,
    round:           1,
    millionaireUid,
    timerEndsAt:     Date.now() + mergedSettings.talkTime * 1000,
    topic:           "",
    totalPlayers:    uids.length,
  });

  return { ok: true, millionaireUid };
}

// ══════════════════════════════════════════
// ADMIN — CAMBIAR FASE
// ══════════════════════════════════════════

export async function adminSetPhase(phase) {
  await update(stateRef(), { phase });
}

export async function adminOpenVoting() {
  await update(stateRef(), { phase: "voting" });
}

export async function adminSetTopic(topic) {
  await update(stateRef(), { topic });
}

// ══════════════════════════════════════════
// ADMIN — PROCESAR VOTACIÓN Y RESULTADOS
// ══════════════════════════════════════════

export async function adminProcessVotes() {
  const [votesSnap, playersSnap, stateSnap] = await Promise.all([
    get(votesRef()),
    get(playersRef()),
    get(stateRef()),
  ]);

  const votes   = votesSnap.exists() ? votesSnap.val() : {};
  const players = playersSnap.exists() ? playersSnap.val() : {};
  const state   = stateSnap.exists() ? stateSnap.val() : {};

  // Contar votos (con extra_vote)
  const tally = {};
  Object.entries(votes).forEach(([voterUid, { voted }]) => {
    if (!voted) return;
    const extra = players[voterUid]?.votesExtra || 0;
    tally[voted] = (tally[voted] || 0) + 1 + extra;
  });

  // Inmunidad
  Object.keys(players).forEach(uid => {
    if (players[uid]?.immune) delete tally[uid];
  });

  // Más votado
  let eliminatedUid = null;
  let maxVotes = 0;
  Object.entries(tally).forEach(([uid, count]) => {
    if (count > maxVotes && players[uid]?.alive) {
      maxVotes = count;
      eliminatedUid = uid;
    }
  });

  const hadMillion = eliminatedUid === state.millionaireUid;

  // Guardar en historial
  const missionSnap = eliminatedUid ? await get(missionRef(state.millionaireUid)) : null;
  const missionText = missionSnap?.exists() ? missionSnap.val().text : "";

  await push(historyRef(), {
    round:       state.round,
    millionaire: state.millionaireUid,
    eliminated:  eliminatedUid,
    mission:     missionText,
    success:     !hadMillion,
    tally,
  });

  return {
    eliminatedUid,
    hadMillion,
    tally,
    millionaireUid: state.millionaireUid,
  };
}

// ══════════════════════════════════════════
// ADMIN — SIGUIENTE RONDA
// ══════════════════════════════════════════

// ── Paso 1: eliminar jugador y preparar la siguiente ronda
// Devuelve los datos necesarios para que el admin configure antes de iniciar
export async function adminPrepareNextRound(eliminatedUid) {
  const [playersSnap, stateSnap, settingsSnap] = await Promise.all([
    get(playersRef()),
    get(stateRef()),
    get(settingsRef()),
  ]);

  const players  = playersSnap.exists() ? playersSnap.val() : {};
  const state    = stateSnap.exists() ? stateSnap.val() : {};
  const settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.exists() ? settingsSnap.val() : {}) };

  // Marcar eliminado
  if (eliminatedUid) {
    await update(playerRef(eliminatedUid), { alive: false });
  }

  const aliveUids = Object.keys(players).filter(
    uid => players[uid].enrolled && players[uid].alive !== false && uid !== eliminatedUid
  );

  const isFinal = aliveUids.length <= settings.finalPlayers;

  if (isFinal) {
    await update(stateRef(), { phase: "pregame", active: true, nextIsFinal: true });
  } else {
    await update(stateRef(), { phase: "pregame", active: true, nextIsFinal: false });
  }

  return {
    aliveUids,
    currentMillionaire: state.millionaireUid,
    isFinal,
    round: (state.round || 1) + 1,
    talkTime: settings.talkTime,
  };
}

// ── Paso 2: el admin confirmó configuración → lanzar ronda
// config: { millionaireUid, talkTime, missions: { uid: { text, reward, difficulty } } }
export async function adminLaunchRound(config) {
  const [playersSnap, stateSnap, settingsSnap] = await Promise.all([
    get(playersRef()),
    get(stateRef()),
    get(settingsRef()),
  ]);

  const players  = playersSnap.exists() ? playersSnap.val() : {};
  const state    = stateSnap.exists() ? stateSnap.val() : {};
  const settings = { ...DEFAULT_SETTINGS, ...(settingsSnap.exists() ? settingsSnap.val() : {}) };

  const talkTime = config.talkTime || settings.talkTime || 300;
  const aliveUids = Object.keys(players).filter(
    uid => players[uid].enrolled && players[uid].alive !== false
  );

  const isFinal = state.nextIsFinal || aliveUids.length <= settings.finalPlayers;

  // Missions: usar las del config, o auto-generar para los que no tengan
  const missionsUpdate = {};
  aliveUids.forEach(uid => {
    if (config.missions && config.missions[uid]) {
      missionsUpdate[uid] = {
        ...config.missions[uid],
        completed: false,
        detected:  false,
        isFake:    false,
      };
    } else {
      const difficulty = getDifficultyForRound(aliveUids.length, state.totalPlayers || aliveUids.length);
      missionsUpdate[uid] = pickMissionWithFakeChance(difficulty);
    }
  });

  await set(missionsRef(), missionsUpdate);
  await set(votesRef(), null);

  // Resetear players vivos
  const playersUpdate = {};
  aliveUids.forEach(uid => {
    playersUpdate[uid] = {
      ...players[uid],
      alive:      true,
      immune:     false,
      votesExtra: 0,
      blockVote:  false,
    };
  });
  await set(playersRef(), playersUpdate);

  const newRound = (state.round || 1);
  await update(stateRef(), {
    phase:          isFinal ? "final" : "talking",
    round:          newRound,
    millionaireUid: config.millionaireUid,
    timerEndsAt:    Date.now() + talkTime * 1000,
    nextIsFinal:    isFinal,
    totalPlayers:   state.totalPlayers || aliveUids.length,
  });

  return { ok: true, isFinal, millionaireUid: config.millionaireUid };
}

// Compat: versión simplificada sin configuración previa
export async function adminNextRound(eliminatedUid, hadMillion) {
  const prep = await adminPrepareNextRound(eliminatedUid);
  const { aliveUids, currentMillionaire, isFinal, talkTime } = prep;

  if (isFinal) return { ended: true };

  // Sin configuración manual: elegir millonario automáticamente si tenía el millón
  let newMillionaire = currentMillionaire;
  if (hadMillion) {
    const candidates = aliveUids.filter(uid => uid !== currentMillionaire);
    if (candidates.length > 0) newMillionaire = pickRandom(candidates);
  }

  const result = await adminLaunchRound({
    millionaireUid: newMillionaire,
    talkTime,
    missions: null, // auto-generar
  });

  return { ended: false, newMillionaire, rotated: newMillionaire !== currentMillionaire };
}

// ── Declarar ganador de la ronda final
export async function adminDeclareFinalWinner(millionaireWon) {
  await update(stateRef(), {
    phase:           "ended",
    active:          false,
    millionaireWon,
  });
  return { ok: true };
}

// ══════════════════════════════════════════
// ADMIN — ROTAR MILLÓN MANUALMENTE
// ══════════════════════════════════════════

export async function adminRotateMillion(targetUid = null) {
  const playersSnap = await get(playersRef());
  const players = playersSnap.exists() ? playersSnap.val() : {};
  const stateSnap = await get(stateRef());
  const state = stateSnap.exists() ? stateSnap.val() : {};

  const aliveUids = Object.keys(players).filter(uid => players[uid].alive && players[uid].enrolled);
  const newMillionaire = targetUid || pickRandom(aliveUids.filter(uid => uid !== state.millionaireUid));

  await update(stateRef(), { millionaireUid: newMillionaire });
  return { newMillionaire };
}

// ══════════════════════════════════════════
// ADMIN — ELIMINAR JUGADOR MANUALMENTE
// ══════════════════════════════════════════

export async function adminEliminatePlayer(uid) {
  await update(playerRef(uid), { alive: false });
}

// ══════════════════════════════════════════
// ADMIN — ASIGNAR MISIÓN MANUALMENTE
// ══════════════════════════════════════════

export async function adminAssignMission(uid, missionData) {
  await set(missionRef(uid), {
    ...missionData,
    completed: false,
    detected:  false,
  });
}

// ══════════════════════════════════════════
// ADMIN — TERMINAR PARTIDA
// ══════════════════════════════════════════

export async function adminEndGame() {
  await update(stateRef(), { active: false, phase: "ended" });
}

// ══════════════════════════════════════════
// ADMIN — RESETEAR TODO
// ══════════════════════════════════════════

export async function adminResetGame() {
  await set(milRef(), null);
}

// ══════════════════════════════════════════
// ADMIN — VALIDAR MISIONES Y APLICAR RECOMPENSAS
// ══════════════════════════════════════════

// validations: { uid: true/false }  (true = cumplió)
export async function adminValidateMissions(validations) {
  const [missionsSnap, playersSnap] = await Promise.all([
    get(missionsRef()),
    get(playersRef()),
  ]);

  const missions = missionsSnap.exists() ? missionsSnap.val() : {};
  const players  = playersSnap.exists()  ? playersSnap.val()  : {};

  const missionUpdates  = {};
  const playerUpdates   = {};
  const rewardsApplied  = [];

  Object.entries(validations).forEach(([uid, completed]) => {
    const mission = missions[uid];
    if (!mission) return;

    // Marcar misión como completada/no completada
    missionUpdates[uid] = { ...mission, completed };

    if (!completed) return;
    if (mission.isFake) return;

    const reward  = mission.reward;
    const player  = players[uid] || {};
    const nick    = player.nick || uid;

    switch (reward) {
      case "extra_vote":
        playerUpdates[uid] = {
          ...player,
          votesExtra: (player.votesExtra || 0) + 1,
        };
        rewardsApplied.push({ uid, nick, reward, label: "+1 voto extra" });
        break;

      case "double_vote":
        playerUpdates[uid] = {
          ...player,
          votesExtra: (player.votesExtra || 0) + 2,
        };
        rewardsApplied.push({ uid, nick, reward, label: "+2 votos" });
        break;

      case "immune":
        playerUpdates[uid] = { ...player, immune: true };
        rewardsApplied.push({ uid, nick, reward, label: "Inmunidad" });
        break;

      case "block_vote":
        playerUpdates[uid] = { ...player, blockVote: true };
        rewardsApplied.push({ uid, nick, reward, label: "Bloqueo de voto" });
        break;

      case "transfer_million":
        // El admin decide a quién — solo se marca, el admin la ejecuta con adminRotateMillion
        rewardsApplied.push({ uid, nick, reward, label: "Puede pasar el millón (manual)" });
        break;

      case "reveal_suspect":
        rewardsApplied.push({ uid, nick, reward, label: "Sabe quién lo sospecha (ver admin)" });
        break;

      default:
        break;
    }
  });

  // Escribir en Firebase
  if (Object.keys(missionUpdates).length) {
    await set(missionsRef(), missionUpdates);
  }
  for (const [uid, data] of Object.entries(playerUpdates)) {
    await update(playerRef(uid), data);
  }

  return { ok: true, rewardsApplied };
}

// ══════════════════════════════════════════
// ADMIN — ASIGNAR MISIÓN DESDE BIBLIOTECA
// ══════════════════════════════════════════

export async function adminAssignMissionFromLibrary(uid, difficulty, reward) {
  const mission = pickMission(difficulty);
  mission.reward = reward || mission.reward;
  await set(missionRef(uid), { ...mission, completed: false, detected: false });
  return { ok: true, mission };
}

// ══════════════════════════════════════════
// ADMIN — EXTENDER TIMER
// ══════════════════════════════════════════

export async function adminExtendTimer(extraSeconds = 60) {
  const snap = await get(stateRef());
  if (!snap.exists()) return;
  const state = snap.val();
  const currentEnd = state.timerEndsAt || Date.now();
  await update(stateRef(), {
    timerEndsAt: Math.max(currentEnd, Date.now()) + extraSeconds * 1000
  });
}
