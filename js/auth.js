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
const ADMIN_UID = "REEMPLAZAR_CON_TU_UID";

// Formatea el nick: primera letra mayúscula, resto minúscula, solo alfanumérico
function formatNick(nick) {
  const clean = nick.replace(/[^a-zA-Z0-9]/g, "");
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

// Validaciones
function validateNick(nick) {
  if (nick.length < 3) return "El nick debe tener al menos 3 caracteres.";
  if (nick.length > 20) return "El nick no puede superar 20 caracteres.";
  if (!/^[a-zA-Z0-9]+$/.test(nick)) return "El nick solo puede tener letras y números.";
  return null;
}

function validatePassword(pass) {
  if (pass.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  return null;
}

// Registro de usuario nuevo
async function registerUser(nick, email, password) {
  const formattedNick = formatNick(nick);
  const nickError = validateNick(formattedNick);
  if (nickError) throw new Error(nickError);
  const passError = validatePassword(password);
  if (passError) throw new Error(passError);

  // Verificar que el nick no esté tomado
  const nickRef = ref(db, `nicks/${formattedNick.toLowerCase()}`);
  const nickSnap = await get(nickRef);
  if (nickSnap.exists()) throw new Error("Ese nick ya está en uso. Elegí otro.");

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  // Guardar usuario en DB
  await set(ref(db, `users/${uid}`), {
    nick: formattedNick,
    email: email,
    role: uid === ADMIN_UID ? "admin" : "viewer",
    status: uid === ADMIN_UID ? "active" : "pending",
    team: null,
    createdAt: Date.now()
  });

  // Reservar el nick
  await set(ref(db, `nicks/${formattedNick.toLowerCase()}`), uid);

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
  window.location.href = "/el-burdel/index.html";
}

// Recuperar contraseña
async function recoverPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// Obtener datos del usuario desde DB
async function getUserData(uid) {
  const snap = await get(ref(db, `users/${uid}`));
  if (snap.exists()) return snap.val();
  return null;
}

// Redirigir según rol y estado
async function redirectByRole(user) {
  const data = await getUserData(user.uid);
  if (!data) {
    window.location.href = "/el-burdel/login.html";
    return;
  }
  if (data.status === "pending") {
    window.location.href = "/el-burdel/pending.html";
    return;
  }
  if (data.status === "paused") {
    window.location.href = "/el-burdel/paused.html";
    return;
  }
  if (data.role === "admin") {
    window.location.href = "/el-burdel/admin.html";
    return;
  }
  window.location.href = "/el-burdel/dashboard.html";
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
  redirectByRole,
  onSession,
  formatNick,
  ADMIN_UID
};
