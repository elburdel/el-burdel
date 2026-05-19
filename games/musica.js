// ============================================================
//  El Burdel — Música
//  Firebase Realtime Database + Google Drive (vía GAS)
// ============================================================

import { db } from "../js/firebase-init.js";
import {
  ref, onValue, set, remove, push, get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const GAS_URL   = "https://script.google.com/macros/s/AKfycbzIj-RX_YCbunbJs2zU4-y9GX4ZnRM6G7zenIw5x2_D19VAObu3YwQJTHiFNVmOj691/exec";
const MUSIC_REF = ref(db, "musica");

// ── Helper GAS ──
async function callGAS(payload) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  const res  = await fetch(GAS_URL, { method: "POST", body: form });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error("Respuesta inválida del servidor: " + text.slice(0, 100)); }
}

// ── Subir MP3 → Drive → Firebase ──
export async function uploadTrack(uid, b64, titulo, artista, letra) {
  const data = await callGAS({
    action: "subirMusicaBurdel",
    uid,
    b64,
    nombre: titulo
  });
  if (!data.ok) throw new Error(data.error || "Error al subir el archivo");

  const trackRef = push(MUSIC_REF);
  await set(trackRef, {
    id:        trackRef.key,
    titulo:    titulo,
    artista:   artista  || "",
    letra:     letra    || "",
    url:       data.url,
    fileId:    data.fileId,
    creadoEn:  Date.now()
  });

  return { id: trackRef.key, url: data.url };
}

// ── Eliminar track ──
export async function deleteTrack(uid, trackId, fileId) {
  if (fileId) {
    await callGAS({ action: "eliminarMusicaBurdel", uid, fileId });
  }
  await remove(ref(db, `musica/${trackId}`));
}

// ── Listener en tiempo real ──
export function onTracks(cb) {
  return onValue(MUSIC_REF, snap => cb(snap.val() || {}));
}

// ── Get una vez ──
export async function getTracks() {
  const snap = await get(MUSIC_REF);
  return snap.val() || {};
}
