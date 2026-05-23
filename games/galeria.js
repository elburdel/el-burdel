// ============================================================
//  El Burdel — Galería
//  Firebase Realtime Database + Google Drive (vía GAS)
//  Estructura Drive: WEB El Burdel / Galeria / {nombre-album} /
// ============================================================

import { db } from "../js/firebase-init.js";
import {
  ref, onValue, set, remove, push, get, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const GAS_URL    = "https://script.google.com/macros/s/AKfycbzIj-RX_YCbunbJs2zU4-y9GX4ZnRM6G7zenIw5x2_D19VAObu3YwQJTHiFNVmOj691/exec";
const GALERIA_REF = ref(db, "galeria");

// ── GAS ────────────────────────────────────────────────────
async function callGAS(payload) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  const res  = await fetch(GAS_URL, { method: "POST", body: form });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error("Respuesta inválida: " + text.slice(0, 150)); }
}

// ── Subir foto al Drive ─────────────────────────────────────
// Crea carpeta: WEB El Burdel / Galeria / {album} /
export async function uploadGaleriaImg(uid, b64, nombre, album) {
  const data = await callGAS({ action: "subirImagenGaleria", uid, b64, nombre, album });
  if (!data.ok) throw new Error(data.error || "Error al subir imagen");
  return { url: data.url, fileId: data.fileId || "" };
}

export async function deleteGaleriaImg(uid, fileId) {
  if (!fileId) return;
  await callGAS({ action: "eliminarImagenGaleria", uid, fileId });
}

// ── Álbumes — CRUD ──────────────────────────────────────────
export async function saveAlbum({ id, nombre, descripcion, miniatura, miniaturaId, visible }) {
  const key = id || push(ref(db, "galeria/albums")).key;
  const payload = {
    id:          key,
    nombre:      nombre       || "",
    descripcion: descripcion  || "",
    miniatura:   miniatura    || "",
    miniaturaId: miniaturaId  || "",
    visible:     visible !== false,
    editadoEn:   Date.now()
  };
  if (!id) payload.creadoEn = Date.now();
  await set(ref(db, `galeria/albums/${key}`), payload);
  return key;
}

export async function deleteAlbum(uid, id) {
  // Borrar todas las fotos del álbum primero
  const snap = await get(ref(db, `galeria/fotos`));
  const fotos = snap.val() || {};
  for (const [fid, f] of Object.entries(fotos)) {
    if (f.albumId === id) {
      if (f.fileId) await deleteGaleriaImg(uid, f.fileId).catch(() => {});
      await remove(ref(db, `galeria/fotos/${fid}`));
    }
  }
  // Borrar miniatura del álbum
  const albumSnap = await get(ref(db, `galeria/albums/${id}`));
  const album = albumSnap.val();
  if (album?.miniaturaId) await deleteGaleriaImg(uid, album.miniaturaId).catch(() => {});
  await remove(ref(db, `galeria/albums/${id}`));
}

export async function toggleAlbumVisible(id, visible) {
  await set(ref(db, `galeria/albums/${id}/visible`), visible);
}

// ── Fotos — CRUD ────────────────────────────────────────────
export async function saveFoto({ id, albumId, url, fileId, titulo, orden }) {
  const key = id || push(ref(db, "galeria/fotos")).key;
  await set(ref(db, `galeria/fotos/${key}`), {
    id:       key,
    albumId:  albumId  || "",
    url:      url      || "",
    fileId:   fileId   || "",
    titulo:   titulo   || "",
    orden:    orden    ?? Date.now(),
    ...(id ? {} : { creadoEn: Date.now() })
  });
  return key;
}

export async function deleteFoto(uid, id) {
  const snap = await get(ref(db, `galeria/fotos/${id}`));
  const f = snap.val();
  if (f?.fileId) await deleteGaleriaImg(uid, f.fileId).catch(() => {});
  await remove(ref(db, `galeria/fotos/${id}`));
}

export async function setFotoMiniatura(albumId, url, fileId) {
  await update(ref(db, `galeria/albums/${albumId}`), { miniatura: url, miniaturaId: fileId || "" });
}

// ── Lectura ─────────────────────────────────────────────────
export async function getAlbums() {
  const snap = await get(ref(db, "galeria/albums"));
  return sortAlbums(snap.val() || {});
}

export async function getFotosDeAlbum(albumId) {
  const snap = await get(ref(db, "galeria/fotos"));
  const all  = snap.val() || {};
  return Object.values(all)
    .filter(f => f.albumId === albumId)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

export function onAlbums(cb) {
  return onValue(ref(db, "galeria/albums"), snap => cb(sortAlbums(snap.val() || {})));
}

export function onFotos(cb) {
  return onValue(ref(db, "galeria/fotos"), snap => {
    cb(snap.val() || {});
  });
}

function sortAlbums(raw) {
  return Object.values(raw).sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
}
