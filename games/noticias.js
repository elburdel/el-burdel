// ============================================================
//  El Burdel — Noticias
//  Firebase Realtime Database + Google Drive (vía GAS)
// ============================================================

import { db } from "../js/firebase-init.js";
import {
  ref, onValue, set, remove, push, get, update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const GAS_URL      = "https://script.google.com/macros/s/AKfycbzIj-RX_YCbunbJs2zU4-y9GX4ZnRM6G7zenIw5x2_D19VAObu3YwQJTHiFNVmOj691/exec";
const NOTICIAS_REF = ref(db, "noticias");
const DIAS_REF     = ref(db, "noticiasDias"); // miniatura + label por día

// ── GAS ────────────────────────────────────────────────────
async function callGAS(payload) {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  const res  = await fetch(GAS_URL, { method: "POST", body: form });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error("Respuesta inválida: " + text.slice(0,150)); }
}

// ── Subir imagen ────────────────────────────────────────────
export async function uploadNoticiaImg(uid, b64, nombre, fecha) {
  const data = await callGAS({ action:"subirImagenNoticias", uid, b64, nombre, fecha });
  if (!data.ok) throw new Error(data.error || "Error al subir imagen");
  return { url: data.url, fileId: data.fileId || "" };
}

export async function deleteNoticiaImg(uid, fileId) {
  if (!fileId) return;
  await callGAS({ action:"eliminarImagenNoticias", uid, fileId });
}

// ── Guardar miniatura de un día ─────────────────────────────
export async function saveDia(fecha, miniatura, miniaturaId, label) {
  await set(ref(db, `noticiasDias/${fecha}`), {
    fecha,
    miniatura:   miniatura   || "",
    miniaturaId: miniaturaId || "",
    label:       label       || "",
    editadoEn:   Date.now()
  });
}

export async function getDias() {
  const snap = await get(DIAS_REF);
  return snap.val() || {};
}

// ── Guardar / editar noticia ────────────────────────────────
export async function saveNoticia(noticia) {
  const id = noticia.id || push(NOTICIAS_REF).key;

  // Nunca guardar undefined en Firebase
  const imgs = noticia.imgs || [];
  const payload = {
    id,
    fecha:       noticia.fecha   || "",
    titulo:      noticia.titulo  || "",
    texto:       noticia.texto   || "",
    visible:     noticia.visible !== false,
    img1:        imgs[0]?.url    || "",
    img1Id:      imgs[0]?.fileId || "",
    img2:        imgs[1]?.url    || "",
    img2Id:      imgs[1]?.fileId || "",
    img3:        imgs[2]?.url    || "",
    img3Id:      imgs[2]?.fileId || "",
    img4:        imgs[3]?.url    || "",
    img4Id:      imgs[3]?.fileId || "",
    creadoEn:    noticia.creadoEn  ? noticia.creadoEn  : Date.now(),
    editadoEn:   Date.now()
  };

  await set(ref(db, `noticias/${id}`), payload);
  return id;
}

export async function toggleNoticiaVisible(id, visible) {
  await set(ref(db, `noticias/${id}/visible`), visible);
}

export async function deleteNoticia(uid, id) {
  const snap = await get(ref(db, `noticias/${id}`));
  const n    = snap.val();
  if (!n) return;
  for (const campo of ["img1Id","img2Id","img3Id","img4Id"]) {
    if (n[campo]) await deleteNoticiaImg(uid, n[campo]).catch(()=>{});
  }
  await remove(ref(db, `noticias/${id}`));
}

// ── Listeners ────────────────────────────────────────────────
export function onNoticias(cb) {
  return onValue(NOTICIAS_REF, snap => cb(sortNoticias(snap.val() || {})));
}

export function onNoticiasVisibles(cb) {
  return onValue(NOTICIAS_REF, snap => {
    const raw = snap.val() || {};
    const arr = Object.values(raw)
      .filter(n => n.visible === true)
      .sort(cmpNoticia);
    cb(arr);
  });
}

export async function getNoticias() {
  const snap = await get(NOTICIAS_REF);
  return sortNoticias(snap.val() || {});
}

function sortNoticias(raw) {
  return Object.values(raw).sort(cmpNoticia);
}
function cmpNoticia(a, b) {
  if (b.fecha !== a.fecha) return b.fecha.localeCompare(a.fecha);
  return (b.creadoEn||0) - (a.creadoEn||0);
}
