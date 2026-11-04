// games/asesino-ui.js
// Utilidades de interfaz compartidas por el panel del conductor y la pantalla del jugador.
// Todo el contenido dinámico (nicks, nombres) se inserta con textContent: nunca como HTML.

/** Crea un elemento: h('div', {class:'x', onClick: fn}, 'texto', otroNodo) */
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'disabled' || k === 'checked' || k === 'readOnly') el[k] = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function vaciar(el) { while (el.firstChild) el.removeChild(el.firstChild); }

export function modoDemo() {
  return new URLSearchParams(location.search).get('demo') === '1';
}

export function bannerDemo(texto) {
  return h('div', { class: 'as-demo-banner', role: 'note' },
    h('strong', {}, 'MODO DEMO'),
    ' — ', texto || 'los datos viven solo en este navegador. No es multijugador real y no aplica las reglas de seguridad.');
}

export function toast(msg) {
  const t = h('div', { class: 'as-toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2800);
}

/** Ventana de confirmación. Devuelve una promesa con true/false. */
export function confirmar(texto, { si = 'Confirmar', no = 'Cancelar' } = {}) {
  return new Promise((resolver) => {
    const cerrar = (r) => { overlay.remove(); resolver(r); };
    const overlay = h('div', { class: 'as-modal-overlay' },
      h('div', { class: 'as-modal', role: 'dialog' },
        h('p', { class: 'as-modal-texto' }, texto),
        h('div', { class: 'as-modal-acciones' },
          h('button', { type: 'button', class: 'as-btn sec', onClick: () => cerrar(false) }, no),
          h('button', { type: 'button', class: 'as-btn', onClick: () => cerrar(true) }, si))));
    document.body.append(overlay);
  });
}

export function fechaCorta(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

export function mensajeDeError(e) {
  if (e?.name === 'ErrorJuego') return e.message;
  if (e?.code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(String(e?.message ?? ''))) {
    return 'Firebase denegó el acceso. Si estás probando en producción, es normal: las reglas «asesino» todavía no están publicadas.';
  }
  return 'Ocurrió un error: ' + (e?.message ?? e);
}
