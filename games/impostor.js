// impostor.js — Lógica Firebase para El Impostor de El Burdel
// Estructura Firebase:
//   impostor/state    → { phase, word, impostorUid, impostorFakeWord, roundId, startedAt }
//   impostor/players  → { uid: { nick, role, hasSeenWord } }
//   impostor/result   → { winner, revealedUid, impostorUid, impostorNick, word, roundId }

import { db } from "../js/firebase-init.js";
import {
  ref, get, set, update, onValue, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Banco de palabras por categoría ──
export const WORD_BANK = {
  "Lugares": [
    "Playa", "Montaña", "Aeropuerto", "Hospital", "Supermercado",
    "Zoológico", "Estadio", "Biblioteca", "Casino", "Restaurante",
    "Escuela", "Cementerio", "Parque", "Discoteca", "Museo",
    "Peluquería", "Ferretería", "Farmacia", "Comisaría", "Iglesia",
    "Tren", "Puerto", "Cuartel", "Embajada", "Circo"
  ],
  "Objetos": [
    "Heladera", "Televisor", "Paraguas", "Linterna", "Termómetro",
    "Brújula", "Escalera", "Espejo", "Maletín", "Telescopio",
    "Microscopio", "Calculadora", "Mochila", "Candado", "Sacacorchos",
    "Ancla", "Boomerang", "Palanca", "Sextante", "Metrónomo",
    "Ventosa", "Tridente", "Catafalco", "Bisturí", "Desfibrilador"
  ],
  "Comidas": [
    "Milanesa", "Empanada", "Asado", "Sushi", "Pizza",
    "Helado", "Medialunas", "Locro", "Humita", "Alfajor",
    "Torta", "Flan", "Churrasco", "Ravioles", "Choripán",
    "Mondongo", "Matambre", "Provoleta", "Facturas", "Chimichurri",
    "Carbonada", "Puchero", "Revuelto Gramajo", "Dulce de Leche", "Mazamorra"
  ],
  "Animales": [
    "Pingüino", "Cocodrilo", "Flamenco", "Murciélago", "Camaleón",
    "Pulpo", "Nutria", "Cóndor", "Jaguar", "Delfín",
    "Avestruz", "Tortuga", "Loro", "Castor", "Mantarraya",
    "Ornitorrinco", "Axolote", "Tarántula", "Anaconda", "Capibara",
    "Glotón", "Narval", "Komodo", "Pangolín", "Tapir"
  ],
  "Profesiones": [
    "Astronauta", "Sommelier", "Taxidermista", "Carnicero", "Árbitro",
    "Domador", "Buzo", "Locutor", "Marionetista", "Geólogo",
    "Bombero", "Piloto", "Cirujano", "Detective", "Mago",
    "Trapecista", "Tasador", "Embalsamador", "Crupier", "Pirotécnico",
    "Cartógrafo", "Herrero", "Ventrílocuo", "Espía", "Verdugo"
  ],
  "Películas / Series": [
    "Titanic", "Matrix", "El Padrino", "Pulp Fiction", "Breaking Bad",
    "Game of Thrones", "La Casa de Papel", "Avatar", "Interstellar", "Joker",
    "El Rey León", "Friends", "Squid Game", "Inception", "Gladiador",
    "Chernobyl", "Oppenheimer", "Succession", "True Detective", "Narcos",
    "El Silencio de los Inocentes", "Mad Max", "The Wire", "Severance", "Euphoria"
  ],
  "Deportes": [
    "Polo", "Rugby", "Waterpolo", "Esgrima", "Curling",
    "Sumo", "Kendo", "Canotaje", "Biatlón", "Pelota Vasca",
    "Críquet", "Lacrosse", "Squash", "Pentatlón", "Bobsled",
    "Escalada", "Skate", "Natación Sincronizada", "Tiro con Arco", "Lucha Grecorromana"
  ],
  "Personajes Históricos": [
    "Napoleón", "Cleopatra", "Einstein", "Darwin", "Freud",
    "Maradona", "Evita", "San Martín", "Borges", "Gardel",
    "Gandhi", "Julio César", "Marco Polo", "Copérnico", "Espartaco",
    "Vlad el Empalador", "Rasputín", "Atila", "Juana de Arco", "Gengis Kan"
  ],
  "Cosas que se hacen con las manos": [
    "Tejer", "Amasar", "Aplaudir", "Escribir a máquina", "Tocar el piano",
    "Hacer origami", "Soldar", "Esculpir", "Malabarismo", "Boxear",
    "Hacer señas", "Tatuar", "Afeitar", "Manicuría", "Cirugía",
    "Tocar la guitarra", "Hacer point", "Manejar", "Hacer punto", "Abrir una caja fuerte"
  ],
  "Eventos / Situaciones": [
    "Casamiento", "Velorio", "Asado", "Cumpleaños", "Juicio",
    "Examen", "Entrevista de trabajo", "Bautismo", "Divorcio", "Graduación",
    "Primer día de trabajo", "Cita a ciegas", "Secuestro", "Motín", "Operativo policial",
    "Maratón", "Consejo de guerra", "Subasta", "Desfile militar", "Sepelio"
  ],
  "Cosas que se encuentran en...": [
    "Una heladería", "Un barco pirata", "Una sala de cirugía", "Un casino",
    "Una iglesia", "Un zoológico", "Una cárcel", "Un circo",
    "Una cueva", "Un submarino", "Una farmacia", "Un cuartel",
    "Un velorio", "Una cancha de fútbol", "Una estación espacial",
    "Una peluquería", "Un laboratorio secreto", "Un búnker", "Una morgue", "Un palacio"
  ],
  "Música": [
    "Cumbia", "Tango", "Reggaetón", "Ópera", "Heavy Metal",
    "Bossa Nova", "Flamenco", "Jazz", "Trap", "Folklore",
    "Vals", "Salsa", "Murga", "Cuarteto", "Candombe",
    "Funk", "Gospel", "Techno", "Bolero", "Chamamé"
  ],
  "Cosas que dan miedo": [
    "Payaso", "Muñeco de ventrílocuo", "Sótano oscuro", "Araña gigante", "Palmada en el hombro a las 3am",
    "Dentista", "Examen de conducir", "Suegra", "Deuda en dólares", "Silencio en el grupo familiar",
    "Nota del colegio", "Cita a ciegas", "Resultado del médico", "El jefe que 'quiere charlar'", "Mensaje de voz de 8 minutos"
  ]
};

// ── Listeners ──

export function onImpostorState(callback) {
  return onValue(ref(db, "impostor/state"), (snap) => {
    callback(snap.val() || {});
  });
}

export function onImpostorPlayers(callback) {
  return onValue(ref(db, "impostor/players"), (snap) => {
    callback(snap.val() || {});
  });
}

export function onImpostorResult(callback) {
  return onValue(ref(db, "impostor/result"), (snap) => {
    callback(snap.val() || null);
  });
}

// ── Admin: iniciar ronda ──
// word: palabra para todos, impostorUid: uid del impostor, impostorFakeWord: palabra falsa (o null)
export async function startImpostorRound({ word, impostorUid, impostorFakeWord }) {
  const roundId = Date.now().toString();
  await set(ref(db, "impostor/state"), {
    phase: "playing",
    word: word.trim(),
    impostorUid,
    impostorFakeWord: impostorFakeWord?.trim() || null,
    roundId,
    startedAt: Date.now()
  });
  // Limpiar resultado anterior
  await remove(ref(db, "impostor/result"));
}

// ── Admin: revelar resultado ──
// accusedUid: a quién votaron, winners: "players" | "impostor"
export async function revealImpostorResult({ accusedUid, accusedNick, winner }) {
  const stateSnap = await get(ref(db, "impostor/state"));
  const state = stateSnap.val();
  if (!state) return;

  // Obtener nick del impostor
  const impostorSnap = await get(ref(db, `users/${state.impostorUid}`));
  const impostorNick = impostorSnap.val()?.nick || "—";

  await set(ref(db, "impostor/result"), {
    winner,           // "players" | "impostor"
    accusedUid,
    accusedNick,
    impostorUid: state.impostorUid,
    impostorNick,
    word: state.word,
    roundId: state.roundId,
    revealedAt: Date.now()
  });

  await update(ref(db, "impostor/state"), { phase: "reveal" });
}

// ── Admin: otorgar puntos y cerrar ronda ──
export async function giveImpostorPoints({ winner, impostorUid, playerUids }) {
  const updates = {};

  if (winner === "impostor") {
    // El impostor gana → 3 puntos al impostor
    const snap = await get(ref(db, `users/${impostorUid}/points`));
    const current = snap.val() || 0;
    updates[`users/${impostorUid}/points`] = current + 3;
  } else {
    // Los jugadores ganan → 1 punto a cada jugador (no impostor)
    for (const uid of playerUids) {
      if (uid === impostorUid) continue;
      const snap = await get(ref(db, `users/${uid}/points`));
      const current = snap.val() || 0;
      updates[`users/${uid}/points`] = current + 1;
    }
  }

  await update(ref(db), updates);
}

// ── Admin: resetear juego ──
export async function resetImpostor() {
  await set(ref(db, "impostor/state"), { phase: "waiting" });
  await remove(ref(db, "impostor/result"));
}

// ── Jugador: marcar que vio la palabra ──
export async function markPlayerSeenWord(uid, nick) {
  await update(ref(db, `impostor/players/${uid}`), { nick, hasSeenWord: true, seenAt: Date.now() });
}

// ── Obtener datos de la ronda para un jugador ──
// Retorna: { isImpostor, word } según el uid
export async function getPlayerRoundData(uid) {
  const stateSnap = await get(ref(db, "impostor/state"));
  const state = stateSnap.val();
  if (!state || state.phase === "waiting") return null;

  const isImpostor = state.impostorUid === uid;

  return {
    isImpostor,
    word: isImpostor
      ? (state.impostorFakeWord || null)
      : state.word,
    phase: state.phase,
    roundId: state.roundId
  };
}
