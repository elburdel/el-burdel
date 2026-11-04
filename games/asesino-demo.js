// games/asesino-demo.js
// ─────────────────────────────────────────────────────────────────────────────
// MODO DEMO de «El asesino está entre nosotros»  —  HERRAMIENTA TEMPORAL DE DESARROLLO.
//
// Es una base de datos de juguete que vive en el localStorage de ESTE navegador:
//  • No usa Firebase, no toca la base real ni los usuarios reales.
//  • NO aplica las reglas de seguridad: cualquiera ve todo. No sirve para probar privacidad.
//  • NO es multijugador real: solo sincroniza entre pestañas del mismo navegador.
// Se activa con ?demo=1 (y ?yo=demo03 para elegir jugador en la pantalla de jugador).
// Cuando el juego esté listo, este archivo se puede borrar.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'asesino_demo_db_v1';
export const DEMO_ADMIN_UID = 'demoadmin';

const NOMBRES = ['Lucía', 'Mateo', 'Valentina', 'Santiago', 'Camila', 'Joaquín', 'Martina', 'Tomás', 'Sofía', 'Benjamín',
  'Julieta', 'Facundo', 'Agustina', 'Nicolás', 'Emilia', 'Lautaro', 'Catalina', 'Thiago', 'Renata', 'Bruno',
  'Milagros', 'Franco', 'Abril', 'Gael', 'Delfina', 'Ignacio', 'Pilar', 'Ramiro', 'Bianca', 'Dante'];

export const DEMO_USUARIOS = Object.freeze(Object.fromEntries(
  NOMBRES.map((nick, i) => ['demo' + String(i + 1).padStart(2, '0'), { nick, status: 'active', role: 'viewer' }]),
));

const clonar = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/** Como Firebase: no guarda nulos ni objetos vacíos. */
function normalizar(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) { const n = normalizar(x); if (n !== undefined) out[k] = n; }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

function sembrar() {
  return { users: { ...clonar(DEMO_USUARIOS), [DEMO_ADMIN_UID]: { nick: 'Conductor', status: 'active', role: 'admin' } } };
}

let cache = null;
const oyentes = new Set();

function cargar() {
  if (cache) return cache;
  try { const t = globalThis.localStorage?.getItem(CLAVE); if (t) { cache = JSON.parse(t); return cache; } } catch { /* sigue */ }
  cache = sembrar(); guardar();
  return cache;
}
function guardar() { try { globalThis.localStorage?.setItem(CLAVE, JSON.stringify(cache)); } catch { /* sin espacio */ } }

function partes(path) { return String(path).split('/').filter(Boolean); }
function obtener(raiz, path) {
  let x = raiz;
  for (const p of partes(path)) { if (x == null || typeof x !== 'object') return undefined; x = x[p]; }
  return x;
}
function fijar(raiz, path, valor) {
  const ps = partes(path);
  if (!ps.length) throw new Error('Ruta vacía');
  let x = raiz;
  for (let i = 0; i < ps.length - 1; i++) {
    if (x[ps[i]] == null || typeof x[ps[i]] !== 'object') x[ps[i]] = {};
    x = x[ps[i]];
  }
  const n = normalizar(valor);
  if (n === undefined) delete x[ps[ps.length - 1]]; else x[ps[ps.length - 1]] = n;
}
function podarVacios(o) {
  if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) { podarVacios(o[k]); if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k]; }
  }
}

function notificar() {
  for (const o of [...oyentes]) {
    const v = clonar(obtener(cargar(), o.path));
    const s = JSON.stringify(v);
    if (s !== o.ultimo) { o.ultimo = s; try { o.cb(v); } catch (e) { console.error(e); } }
  }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e) => { if (e.key === CLAVE) { cache = null; notificar(); } });
}

export function reiniciarDemo() {
  cache = null;
  try { globalThis.localStorage?.removeItem(CLAVE); } catch { /* nada */ }
  notificar();
}

const permisoDenegado = () => Object.assign(new Error('PERMISSION_DENIED (simulado en demo)'), { code: 'PERMISSION_DENIED' });

/** Backend con la misma forma que el de Firebase, pero en memoria/localStorage. */
export function crearBackendDemo(uid) {
  return {
    modo: 'demo',
    uid: () => uid,
    ahora: () => Date.now(),
    async leer(path) { return clonar(obtener(cargar(), path)); },
    escuchar(path, cb) {
      const o = { path, cb, ultimo: undefined };
      oyentes.add(o);
      queueMicrotask(() => {
        if (!oyentes.has(o)) return;
        const v = clonar(obtener(cargar(), path)); o.ultimo = JSON.stringify(v); cb(v);
      });
      return () => oyentes.delete(o);
    },
    async escribir(path, valor) { return this.actualizar({ [path]: valor }); },
    async actualizar(updates) {
      const raiz = cargar();
      // Simula el control de concurrencia de las reglas: `seq` solo puede subir de a 1.
      for (const [ruta, valor] of Object.entries(updates)) {
        const m = /^asesino\/partidas\/([^/]+)\/publico\/seq$/.exec(ruta);
        if (m) {
          const actual = obtener(raiz, ruta);
          if (valor !== (actual ?? -1) + 1) throw permisoDenegado();
        }
      }
      for (const [ruta, valor] of Object.entries(updates)) fijar(raiz, ruta, valor);
      podarVacios(raiz);
      guardar();
      notificar();
    },
    nuevaClave() {
      const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let s = 'demo';
      for (let i = 0; i < 12; i++) s += a[Math.floor(Math.random() * a.length)];
      return s;
    },
  };
}
