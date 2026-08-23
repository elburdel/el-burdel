// historial-admin.js — Ver y limpiar el historial de Tests de cada usuario — SOLO ADMIN
// ============================================================
// historial/{uid}/{entryId} → { tituloTest, puntajeFinal, resultado, fecha }
// Es un nodo EXCLUSIVO de Tests (no lo comparte con Ruleta ni otros juegos,
// que guardan su propio historial adentro de su propio nodo de juego).
//
// Se lee historial/{uid} completo (para un uid puntual, ya conocido) — esto
// es lo mismo que ya hace onHistorial() en tests.js para el propio usuario;
// acá lo reusamos para poder mirar el de CUALQUIER usuario del roster.

import { db } from "../js/firebase-init.js";
import { ref, get, set, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export function onHistorialAdmin(uid, callback) {
  return onValue(
    ref(db, `historial/${uid}`),
    (snap) => {
      const val = snap.val();
      if (!val) return callback([]);
      const list = Object.entries(val)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.fecha || 0) - (a.fecha || 0));
      callback(list);
    },
    () => callback(null) // null = sin permiso / error, distinto de [] = sin entradas
  );
}

export async function contarHistorial(uid) {
  try {
    const snap = await get(ref(db, `historial/${uid}`));
    const val = snap.val();
    return val ? Object.keys(val).length : 0;
  } catch {
    return null; // sin permiso
  }
}

export async function eliminarEntradaHistorial(uid, entryId) {
  await remove(ref(db, `historial/${uid}/${entryId}`));
}

export async function vaciarHistorialUsuario(uid) {
  await set(ref(db, `historial/${uid}`), null);
}

export async function vaciarHistorialDeTodos(roster) {
  const resultados = [];
  for (const { uid, nick } of roster) {
    try {
      await set(ref(db, `historial/${uid}`), null);
      resultados.push({ uid, nick, ok: true });
    } catch (err) {
      resultados.push({ uid, nick, ok: false, error: err.message });
    }
  }
  return resultados;
}
