import { auth, db } from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref,
  set,
  get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// UID del admin (reemplazá con tu UID real después del primer login)
const ADMIN_UID = "rRE0YhtRhqNvGWGFDkcbhNIwvOz1";

// Formatea el nick: elimina caracteres peligrosos, preserva emojis y acentos
function formatNick(nick) {
  return nick.replace(/[<>"'\/\\]/g, "").trim();
}

// Validaciones locales (sin tocar DB)
function validateNick(nick) {
  if (!nick || nick.length < 2) return "El nick debe tener al menos 2 caracteres.";
  if (nick.length > 24) return "El nick no puede superar 24 caracteres.";
  return null;
}

function validatePassword(pass) {
  if (pass.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  return null;
}

// Convierte un nick "lindo" en su clave de Firebase (alfanumérico + guión bajo)
function nickToKey(nick) {
  return nick.toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/\s+/g, "_") || `user_${Date.now()}`;
}

// Registro de usuario nuevo
async function registerUser(nick, email, password) {
  const formattedNick = formatNick(nick);

  // Validaciones locales primero (sin DB)
  const nickError = validateNick(formattedNick);
  if (nickError) throw new Error(nickError);
  const passError = validatePassword(password);
  if (passError) throw new Error(passError);

  // 1. Crear usuario en Firebase Auth (esto genera la sesión)
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  // Clave del nick en Firebase: solo alfanumérico + guión bajo (para compatibilidad)
  const nickKey = nickToKey(formattedNick);

  // 2. Ahora sí tenemos sesión — verificar nick duplicado
  const nickRef = ref(db, `nicks/${nickKey}`);
  const nickSnap = await get(nickRef);
  if (nickSnap.exists()) {
    // Nick tomado — borramos el usuario recién creado y lanzamos error
    await cred.user.delete();
    throw new Error("Ese nick ya está en uso. Elegí otro.");
  }

  // 3. Guardar usuario en DB
  await set(ref(db, `users/${uid}`), {
    nick: formattedNick,
    email: email,
    role: uid === ADMIN_UID ? "admin" : "viewer",
    status: uid === ADMIN_UID ? "active" : "pending",
    team: null,
    createdAt: Date.now()
  });

  // 4. Reservar el nick
  await set(ref(db, `nicks/${nickKey}`), uid);

  return cred.user;
}

// Login
async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// Logout
async function logoutUser() {
  await signOut(auth);
  window.location.href = "/index.html";
}

// Recuperar contraseña
async function recoverPassword(email) {
  await sendPasswordResetEmail(auth, email, { url: "https://elburdel.com.ar/auth-action.html" });
}

// Obtener datos del usuario desde DB
async function getUserData(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  if (snap.exists()) return snap.val();
  return null;
}

// Completa el perfil de una cuenta "huérfana": existe en Firebase Auth
// (login válido) pero no tiene nodo en users/. Pasa esto cuando una cuenta
// se creó pero el guardado en la DB no llegó a completarse, o cuando un
// admin la borró desde el panel (eso solo borra la DB, nunca el login).
// Deja al usuario en el mismo estado que un registro normal: "pending",
// para que quede en la lista de Usuarios esperando aprobación.
async function completeOrphanedProfile(nick) {
  const user = auth.currentUser;
  if (!user) throw new Error("No hay sesión activa.");

  const formattedNick = formatNick(nick);
  const nickError = validateNick(formattedNick);
  if (nickError) throw new Error(nickError);

  const nickKey = nickToKey(formattedNick);

  const nickRef = ref(db, `nicks/${nickKey}`);
  const nickSnap = await get(nickRef);
  if (nickSnap.exists()) {
    throw new Error("Ese nick ya está en uso. Elegí otro.");
  }

  await set(ref(db, `users/${user.uid}`), {
    nick: formattedNick,
    email: user.email,
    role: user.uid === ADMIN_UID ? "admin" : "viewer",
    status: user.uid === ADMIN_UID ? "active" : "pending",
    team: null,
    createdAt: Date.now()
  });

  await set(ref(db, `nicks/${nickKey}`), user.uid);

  return await getUserData(user.uid);
}

// Redirigir según rol y estado
async function redirectByRole(user) {
  const data = await getUserData(user.uid);
  if (!data) {
    // Sesión de Auth válida pero sin perfil en la DB (cuenta huérfana).
    // En vez de dejarlo mudo en login.html, lo mandamos a terminar el registro.
    window.location.href = "/completar-perfil.html";
    return;
  }
  if (data.status === "pending") {
    window.location.href = "/pending.html";
    return;
  }
  if (data.status === "paused") {
    window.location.href = "/paused.html";
    return;
  }
  if (data.role === "admin") {
    window.location.href = "/admin.html";
    return;
  }
  window.location.href = "/dashboard.html";
}

// Listener de sesión activa
function onSession(callback) {
  onAuthStateChanged(auth, callback);
}

export {
  registerUser,
  loginUser,
  logoutUser,
  recoverPassword,
  getUserData,
  completeOrphanedProfile,
  redirectByRole,
  onSession,
  formatNick,
  ADMIN_UID
};
