// ============================================================
//  El Burdel — Galería del Inicio ("Acá pasan cosas")
//  Firebase Realtime Database + Google Drive (vía GAS)
//  Estructura Drive: WEB El Burdel / Galeria Landing /  (carpeta plana)
//  Firebase: /galeriaLanding/{id} = { url, fileId, nombre, orden, creadoEn }
// ============================================================

import { db } from "../js/firebase-init.js";
import {
  ref, onValue, set, remove, push, get, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const GAS_URL = "https://script.google.com/macros/s/AKfycbzIj-RX_YCbunbJs2zU4-y9GX4ZnRM6G7zenIw5x2_D19VAObu3YwQJTHiFNVmOj691/exec";
const LANDING_REF = ref(db, "galeriaLanding");

// ── GAS ────────────────────────────────────────────────────
async function callGAS(payload) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  const res  = await fetch(GAS_URL, { method: "POST", body: form });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error("Respuesta inválida: " + text.slice(0, 150)); }
}

// ── Subir / borrar foto en Drive ────────────────────────────
export async function uploadLandingImg(uid, b64, nombre) {
  const data = await callGAS({ action: "subirImagenLandingGaleria", uid, b64, nombre });
  if (!data.ok) throw new Error(data.error || "Error al subir imagen");
  return { url: data.url, fileId: data.fileId || "" };
}

export async function deleteLandingImg(uid, fileId) {
  if (!fileId) return;
  await callGAS({ action: "eliminarImagenLandingGaleria", uid, fileId });
}

// ── Fotos — CRUD en Firebase ────────────────────────────────
export async function saveLandingFoto({ url, fileId, nombre }) {
  const key = push(LANDING_REF).key;
  const snap = await get(LANDING_REF);
  const actuales = Object.values(snap.val() || {});
  const maxOrden = actuales.reduce((m, f) => Math.max(m, f.orden ?? 0), 0);
  await set(ref(db, `galeriaLanding/${key}`), {
    id: key,
    url: url || "",
    fileId: fileId || "",
    nombre: nombre || "",
    orden: maxOrden + 1,
    creadoEn: Date.now()
  });
  return key;
}

export async function removeLandingFoto(uid, id) {
  const snap = await get(ref(db, `galeriaLanding/${id}`));
  const f = snap.val();
  if (f?.fileId) await deleteLandingImg(uid, f.fileId).catch(() => {});
  await remove(ref(db, `galeriaLanding/${id}`));
}

// Intercambia el "orden" de una foto con la de arriba (-1) o abajo (+1)
// dentro de la lista ya ordenada.
export async function moverLandingFoto(id, direccion) {
  const fotos = await getLandingFotos();
  const idx = fotos.findIndex(f => f.id === id);
  const otroIdx = idx + direccion;
  if (idx === -1 || otroIdx < 0 || otroIdx >= fotos.length) return;

  const a = fotos[idx];
  const b = fotos[otroIdx];
  await update(ref(db), {
    [`galeriaLanding/${a.id}/orden`]: b.orden,
    [`galeriaLanding/${b.id}/orden`]: a.orden
  });
}

// ── Lectura ─────────────────────────────────────────────────
export async function getLandingFotos() {
  const snap = await get(LANDING_REF);
  return sortLandingFotos(snap.val() || {});
}

export function onLandingFotos(cb) {
  return onValue(LANDING_REF, snap => cb(sortLandingFotos(snap.val() || {})));
}

function sortLandingFotos(raw) {
  return Object.values(raw).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}
