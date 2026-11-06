// games/asesino-admin.js
// Panel del conductor de «El asesino está entre nosotros» — Etapa 2:
// crear partida, invitar, configurar roles/tiempos, ver quién está listo, repartir roles y cancelar.
import * as R from './asesino-reglas.js';
import * as D from './asesino-datos.js';
import { h, vaciar, toast, confirmar, modoDemo, bannerDemo, fechaCorta, mensajeDeError, reloj } from './asesino-ui.js';

async function exigirAdmin() {
  const { auth } = await import('../js/firebase-init.js');
  const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
  const { ADMIN_UID } = await import('../js/auth.js');
  await new Promise((resolver) => {
    onAuthStateChanged(auth, (user) => {
      if (!user || user.uid !== ADMIN_UID) { window.location.href = '/login.html'; return; }
      resolver();
    });
  });
}

// ═════════════════ Editor de distribución y tiempos ═════════════════════════
const CAMPOS_ROL = [
  ['asesinos', 'Asesinos'], ['complices', 'Cómplices'], ['detectives', 'Detectives'],
  ['medicos', 'Médicos'], ['testigos', 'Testigos'],
];

export function crearEditorConfig({ n = 0, distribucion = null, tiempos = null, onCambio = () => {} } = {}) {
  let cantidad = n;
  let distManual = !!distribucion;
  let tiemposManual = !!tiempos;
  let valores = distribucion ? { ...distribucion } : null;
  let tm = tiempos ? { ...tiempos } : null;
  const inputs = {};
  const aviso = h('p', { class: 'as-muted' });
  const lblSospechosos = h('span', { class: 'as-sospechosos' });
  const lista = h('ul', { class: 'as-validacion' });

  const entero = (v) => { const x = parseInt(v, 10); return Number.isFinite(x) && x >= 0 ? x : 0; };

  const campo = (clave, etiqueta, alCambiar) => {
    const input = h('input', { class: 'as-input corto', type: 'number', min: '0', step: '1', inputmode: 'numeric', onInput: (e) => alCambiar(e.target.value) });
    inputs[clave] = input;
    return h('label', { class: 'as-campo' }, h('span', {}, etiqueta), input);
  };

  const rolesGrid = h('div', { class: 'as-grid-campos' },
    CAMPOS_ROL.map(([k, et]) => campo(k, et, (v) => {
      if (!valores) return;
      valores[k] = entero(v); distManual = true; pintarEstado(); onCambio();
    })),
    h('div', { class: 'as-campo' }, h('span', {}, 'Sospechosos (el resto)'), lblSospechosos));

  const tiemposGrid = h('div', { class: 'as-grid-campos' },
    campo('coartada', 'Coartada (segundos)', (v) => { if (!tm) return; tm.coartada = entero(v); tiemposManual = true; pintarEstado(); onCambio(); }),
    campo('votacion', 'Votación (segundos)', (v) => { if (!tm) return; tm.votacion = entero(v); tiemposManual = true; pintarEstado(); onCambio(); }));

  const btnReset = h('button', { type: 'button', class: 'as-btn sec small', onClick: () => { distManual = false; tiemposManual = false; aplicarDefaults(); pintarInputs(); pintarEstado(); onCambio(); } }, 'Restablecer sugeridos');

  const el = h('div', { class: 'as-editor' }, aviso,
    h('div', { class: 'as-sub' }, 'Roles'), rolesGrid,
    h('div', { class: 'as-sub' }, 'Tiempos'), tiemposGrid,
    h('div', { class: 'as-acciones' }, btnReset), lista);

  function aplicarDefaults() {
    if (!R.cantidadValida(cantidad)) return;
    if (!distManual || !valores) valores = R.distribucionPorDefecto(cantidad);
    if (!tiemposManual || !tm) tm = R.tiemposPorDefecto(cantidad);
  }
  function pintarInputs() {
    for (const [k] of CAMPOS_ROL) inputs[k].value = valores ? String(valores[k]) : '';
    inputs.coartada.value = tm ? String(tm.coartada) : '';
    inputs.votacion.value = tm ? String(tm.votacion) : '';
    for (const i of Object.values(inputs)) i.disabled = !valores;
  }
  function pintarEstado() {
    const v = leer();
    lblSospechosos.textContent = valores && R.cantidadValida(cantidad) ? String(v.distribucion.sospechosos) : '—';
    aviso.textContent = R.cantidadValida(cantidad)
      ? `Para ${cantidad} jugadores. Podés cambiar los roles; los sospechosos se calculan solos.`
      : `Elegí entre ${R.MIN_JUGADORES} y ${R.MAX_JUGADORES} participantes para ver la distribución sugerida.`;
    vaciar(lista);
    for (const e of v.validacion.errores) lista.append(h('li', { class: 'as-error' }, e));
    for (const w of v.validacion.advertencias) lista.append(h('li', { class: 'as-aviso' }, w));
  }

  function leer() {
    const ok = R.cantidadValida(cantidad) && valores && tm;
    const distribucion = ok ? R.completarSospechosos(valores, cantidad) : null;
    let validacion;
    if (!ok) validacion = { ok: false, errores: [`Elegí entre ${R.MIN_JUGADORES} y ${R.MAX_JUGADORES} participantes.`], advertencias: [] };
    else {
      validacion = R.validarDistribucion(distribucion, cantidad);
      const vt = R.validarTiempos(tm);
      validacion = { ok: validacion.ok && vt.ok, errores: [...validacion.errores, ...vt.errores], advertencias: validacion.advertencias };
    }
    return { n: cantidad, distribucion, tiempos: tm ? { ...tm } : null, validacion };
  }

  function setN(nuevo) { cantidad = nuevo; aplicarDefaults(); pintarInputs(); pintarEstado(); }
  function setValores({ distribucion: d, tiempos: t }) {
    if (d) { valores = { ...d }; distManual = true; }
    if (t) { tm = { ...t }; tiemposManual = true; }
    pintarInputs(); pintarEstado();
  }

  aplicarDefaults(); pintarInputs(); pintarEstado();
  return { el, setN, setValores, leer };
}

// ═════════════════ Panel ════════════════════════════════════════════════════
export async function iniciarAdmin(opciones = {}) {
  const raiz = document.getElementById('as-root');
  if (!raiz) throw new Error('Falta el contenedor #as-root.');
  const demo = opciones.demo ?? modoDemo();
  let b;
  if (opciones.backend) b = opciones.backend;
  else if (demo) {
    const { crearBackendDemo, DEMO_ADMIN_UID } = await import('./asesino-demo.js');
    b = crearBackendDemo(DEMO_ADMIN_UID);
  } else {
    await exigirAdmin();
    b = await D.crearBackendFirebase();
  }
  const modoDemoActivo = b.modo === 'demo';
  const limpiar = [];

  function ir(vista, pid = null) {
    limpiar.splice(0).forEach((f) => { try { f(); } catch { /* ya dado de baja */ } });
    vaciar(raiz);
    if (modoDemoActivo) {
      raiz.append(bannerDemo('para probar con jugadores abrí asesino.html?demo=1&yo=demo01 (demo02, demo03…) en otras pestañas de este mismo navegador.'));
    }
    if (vista === 'crear') return vistaCrear();
    if (vista === 'partida') return vistaPartida(pid);
    return vistaLista();
  }

  const cabecera = (titulo, atras) => h('div', { class: 'as-topbar' },
    h('div', {}, h('div', { class: 'as-kicker' }, 'Panel del conductor'), h('h1', { class: 'as-title' }, titulo)),
    atras ? h('button', { type: 'button', class: 'as-btn sec small', onClick: atras }, '← Partidas') : null);

  // ───── Lista ─────
  async function vistaLista() {
    raiz.append(cabecera('El asesino está entre nosotros'));
    const caja = h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, 'Partidas'), h('p', { class: 'as-muted' }, 'Cargando…'));
    raiz.append(h('div', { class: 'as-acciones' }, h('button', { type: 'button', class: 'as-btn', onClick: () => ir('crear') }, '➕ Nueva partida')), caja);
    try {
      const partidas = await D.listarPartidas(b);
      vaciar(caja); caja.append(h('div', { class: 'as-card-label' }, 'Partidas'));
      if (!partidas.length) caja.append(h('p', { class: 'as-muted' }, 'Todavía no hay partidas. Creá la primera.'));
      for (const p of partidas) {
        caja.append(h('button', { type: 'button', class: 'as-fila', onClick: () => ir('partida', p.pid) },
          h('span', { class: 'as-fila-nombre' }, p.nombre),
          h('span', { class: 'as-chip ' + p.fase }, R.ETIQUETA_FASE[p.fase] || p.fase),
          h('span', { class: 'as-muted' }, fechaCorta(p.creadaEn))));
      }
    } catch (e) {
      vaciar(caja); caja.append(h('div', { class: 'as-card-label' }, 'Partidas'), h('p', { class: 'as-error' }, mensajeDeError(e)));
    }
  }

  // ───── Crear ─────
  async function vistaCrear() {
    raiz.append(cabecera('Nueva partida', () => ir('lista')));
    const seleccion = new Set();
    let usuarios = [];
    const inputNombre = h('input', { class: 'as-input', type: 'text', maxlength: '60', placeholder: 'Ej.: Noche de brujas', onInput: () => validar() });
    const contador = h('div', { class: 'as-contador' });
    const listaUsuarios = h('div', { class: 'as-usuarios' }, h('p', { class: 'as-muted' }, 'Cargando usuarios…'));
    const mensajes = h('ul', { class: 'as-validacion' });
    const btnCrear = h('button', { type: 'button', class: 'as-btn', disabled: true, onClick: () => crear() }, 'Crear partida e invitar');
    const editor = crearEditorConfig({ n: 0, onCambio: () => validar(false) });

    raiz.append(
      h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, 'Nombre de la partida'), inputNombre),
      h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, `Participantes (${R.MIN_JUGADORES} a ${R.MAX_JUGADORES}; el conductor no cuenta)`),
        contador,
        h('div', { class: 'as-acciones' },
          h('button', { type: 'button', class: 'as-btn sec small', onClick: () => marcar(true) }, 'Elegir hasta completar'),
          h('button', { type: 'button', class: 'as-btn sec small', onClick: () => marcar(false) }, 'Ninguno')),
        listaUsuarios),
      h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, 'Roles y tiempos'), editor.el),
      h('div', { class: 'as-card' }, mensajes, h('div', { class: 'as-acciones' }, btnCrear)));

    function marcar(todos) {
      seleccion.clear();
      if (todos) usuarios.slice(0, R.MAX_JUGADORES).forEach((u) => seleccion.add(u.uid));
      pintarUsuarios(); validar();
    }
    function pintarUsuarios() {
      vaciar(listaUsuarios);
      if (!usuarios.length) { listaUsuarios.append(h('p', { class: 'as-muted' }, 'No hay usuarios activos para invitar.')); return; }
      const lleno = seleccion.size >= R.MAX_JUGADORES;
      for (const u of usuarios) {
        const marcado = seleccion.has(u.uid);
        listaUsuarios.append(h('label', { class: 'as-check' },
          h('input', { type: 'checkbox', checked: marcado, disabled: lleno && !marcado, onChange: (e) => {
            if (e.target.checked) seleccion.add(u.uid); else seleccion.delete(u.uid);
            pintarUsuarios(); validar();
          } }), h('span', {}, u.nick)));
      }
    }
    function validar(actualizarN = true) {
      const n = seleccion.size;
      if (actualizarN) editor.setN(n);
      contador.textContent = `${n} seleccionado${n === 1 ? '' : 's'}` + (n > 0 && !R.cantidadValida(n) ? ` — hacen falta entre ${R.MIN_JUGADORES} y ${R.MAX_JUGADORES}` : '');
      const nom = R.validarNombrePartida(inputNombre.value);
      const cfg = editor.leer();
      vaciar(mensajes);
      if (!nom.ok) mensajes.append(h('li', { class: 'as-aviso' }, nom.error));
      if (!R.cantidadValida(n)) mensajes.append(h('li', { class: 'as-aviso' }, `Elegí entre ${R.MIN_JUGADORES} y ${R.MAX_JUGADORES} participantes.`));
      else if (!cfg.validacion.ok) mensajes.append(h('li', { class: 'as-error' }, 'Corregí los roles y tiempos antes de crear la partida.'));
      btnCrear.disabled = !(nom.ok && R.cantidadValida(n) && cfg.validacion.ok);
    }
    async function crear() {
      const cfg = editor.leer();
      const miembros = usuarios.filter((u) => seleccion.has(u.uid));
      btnCrear.disabled = true;
      try {
        const pid = await D.crearPartida(b, { nombre: inputNombre.value, miembros, distribucion: cfg.distribucion, tiempos: cfg.tiempos });
        toast('Partida creada. Los jugadores ya pueden verla.');
        ir('partida', pid);
      } catch (e) { toast(mensajeDeError(e)); btnCrear.disabled = false; }
    }

    try { usuarios = await D.listarUsuariosHabilitados(b); pintarUsuarios(); validar(); }
    catch (e) { vaciar(listaUsuarios); listaUsuarios.append(h('p', { class: 'as-error' }, mensajeDeError(e))); }
  }

  // ───── Partida ─────
  async function vistaPartida(pid) {
    const cuerpo = h('div');
    raiz.append(cabecera('Partida', () => ir('lista')), cuerpo);
    let pub; let distrib = null; let listos = {}; let roles = null; let rolesCargados = false;
    let editor = null; let bajaListos = null; let uidsListos = '';
    let cargandoRoles = false;
    let btnGuardar = null; let btnIniciar = null;
    // Noche
    let acciones = {}; let bajaAcciones = null; let rondaAcciones = null;
    let victimaElegida = null; let borradorDe = null;
    let resultadoNoche = null; let resultadoDe = null; let leyendoResultado = false;
    // Interrogatorios y votación
    let orden = []; let turno = -1; let votos = {}; let bajaVotos = null; let vidVotos = null;
    const relojes = [];

    const mapaRoles = () => Object.fromEntries(Object.entries(roles || {}).filter(([, x]) => x && x.rol).map(([u, x]) => [u, x.rol]));
    const nickDe = (u) => pub?.jugadores?.[u]?.nick ?? u;

    // Al tipear en el editor NO se vuelve a dibujar todo (se perdería el foco): solo se actualizan los botones.
    function actualizarBotones() {
      const v = editor ? editor.leer() : null;
      if (btnGuardar) btnGuardar.disabled = !(v && v.validacion.ok);
      if (btnIniciar) btnIniciar.disabled = !distrib || !(v && v.validacion.ok);
    }

    async function cargarDistribucion() {
      try { distrib = await b.leer(D.RUTA.distribucion(pid)); } catch { distrib = null; }
      if (editor && distrib) editor.setValores({ distribucion: distrib });
    }
    async function cargarRoles() {
      if (cargandoRoles) return; cargandoRoles = true;
      try { roles = await D.leerRolesAdmin(b, pid, Object.keys(pub.jugadores || {})); rolesCargados = true; }
      catch (e) { toast(mensajeDeError(e)); } finally { cargandoRoles = false; }
      sincronizar(); pintar();
    }

    // Mantiene al día lo que depende de la ronda: acciones en vivo, borrador de la víctima y resultado.
    function sincronizar() {
      if (!pub || !rolesCargados) return;
      const enNoche = [R.FASES.NOCHE, R.FASES.CIERRE_NOCHE, R.FASES.DESCUBRIMIENTO].includes(pub.fase);
      if (enNoche && rondaAcciones !== pub.rondaId) {
        if (bajaAcciones) bajaAcciones();
        rondaAcciones = pub.rondaId; acciones = {};
        bajaAcciones = D.escucharAccionesAdmin(b, pid, pub.rondaId, D.actoresNocturnos(roles), (m) => { acciones = m; pintar(); });
      }
      if (pub.fase === R.FASES.CIERRE_NOCHE && borradorDe !== pub.rondaId) {
        borradorDe = pub.rondaId;
        D.leerBorradorNoche(b, pid, pub.rondaId).then((bor) => { if (bor && victimaElegida === null) { victimaElegida = bor.victima; pintar(); } }).catch(() => {});
      }
      if (pub.fase === R.FASES.VOTACION && pub.votacion && vidVotos !== pub.votacion.id) {
        if (bajaVotos) bajaVotos();
        vidVotos = pub.votacion.id; votos = {};
        bajaVotos = D.escucharVotosAdmin(b, pid, vidVotos, R.vivosDe(pub.jugadores), (m) => { votos = m; pintar(); });
      }
      if (pub.fase === R.FASES.DESCUBRIMIENTO && resultadoDe !== pub.rondaId && !leyendoResultado) {
        leyendoResultado = true;
        D.leerResultadoNoche(b, pid, pub, roles).then((r) => { resultadoNoche = r; resultadoDe = pub.rondaId; }).catch(() => {}).finally(() => { leyendoResultado = false; pintar(); });
      }
    }

    function alCambiarPublico(v) {
      const faseAntes = pub?.fase;
      pub = v;
      if (!pub) { pintar(); return; }
      const uids = Object.keys(pub.jugadores || {});
      const firma = uids.sort().join(',');
      if (firma !== uidsListos) {
        uidsListos = firma; if (bajaListos) bajaListos();
        bajaListos = D.escucharListos(b, pid, uids, (m) => { listos = m; pintar(); });
      }
      if (!editor && pub.fase === R.FASES.PREPARACION) {
        editor = crearEditorConfig({ n: pub.config.cantidad, distribucion: distrib, tiempos: pub.config.tiempos, onCambio: actualizarBotones });
        cargarDistribucion();
      }
      if (pub.fase !== R.FASES.PREPARACION && !rolesCargados) cargarRoles();
      // Al entrar en interrogatorios se sortea el orden de los turnos (solo vive en este panel).
      if (pub.fase === R.FASES.INTERROGATORIOS && faseAntes !== R.FASES.INTERROGATORIOS) { orden = R.barajar(R.vivosDe(pub.jugadores)); turno = -1; }
      // Una fase nueva invalida lo anterior de la víctima (el borrador de otra ronda no aplica).
      if (faseAntes && faseAntes !== pub.fase && pub.fase === R.FASES.NOCHE) { victimaElegida = null; resultadoNoche = null; resultadoDe = null; }
      // Roles se reparten desde el panel: los de este nodo se releen al pasar a "roles".
      if (faseAntes === R.FASES.PREPARACION && pub.fase !== R.FASES.PREPARACION) { rolesCargados = false; cargarRoles(); }
      sincronizar();
      pintar();
    }

    limpiar.push(D.escucharPublico(b, pid, alCambiarPublico, (e) => { vaciar(cuerpo); cuerpo.append(h('p', { class: 'as-error' }, mensajeDeError(e))); }));
    limpiar.push(() => { if (bajaListos) bajaListos(); if (bajaAcciones) bajaAcciones(); if (bajaVotos) bajaVotos(); relojes.splice(0).forEach((f) => f()); });

    // ── acciones del conductor ──
    async function guardarConfig() {
      const cfg = editor.leer();
      try { await D.guardarConfiguracion(b, pid, { distribucion: cfg.distribucion, tiempos: cfg.tiempos }); await cargarDistribucion(); toast('Configuración guardada'); pintar(); }
      catch (e) { toast(mensajeDeError(e)); }
    }
    async function iniciar() {
      const sin = Object.values(listos).filter((x) => !x).length;
      const texto = sin
        ? `Hay ${sin} jugador${sin === 1 ? '' : 'es'} sin marcar «listo». ¿Repartir los roles igual? No se puede deshacer.`
        : '¿Repartir los roles y empezar la partida? No se puede deshacer.';
      if (!(await confirmar(texto, { si: 'Repartir roles' }))) return;
      try { await D.iniciarPartida(b, pid); toast('Roles repartidos'); } catch (e) { toast(mensajeDeError(e)); }
    }
    async function cancelar() {
      if (!(await confirmar('¿Cancelar esta partida? Los jugadores verán que fue cancelada.', { si: 'Cancelar partida', no: 'Volver' }))) return;
      try { await D.cancelarPartida(b, pid); toast('Partida cancelada'); } catch (e) { toast(mensajeDeError(e)); }
    }
    async function comenzarNoche() {
      if (!(await confirmar(`¿Empezar la noche ${(pub.ronda ?? 0) + 1}? Los jugadores con acción nocturna podrán elegir.`, { si: 'Comenzar la noche' }))) return;
      try { await D.comenzarNoche(b, pid); toast('Cae la noche'); } catch (e) { toast(mensajeDeError(e)); }
    }
    async function cerrarNoche() {
      const pend = R.accionesPendientes(acciones, mapaRoles(), R.vivosDe(pub.jugadores));
      const total = pend.asesinos.length + pend.medicos.length + pend.detectives.length;
      const texto = total
        ? `Faltan acciones: asesinos ${pend.asesinos.length}, médicos ${pend.medicos.length}, detectives ${pend.detectives.length}. Si cerrás la noche ya nadie podrá enviarlas. ¿Cerrar igual?`
        : 'Todos enviaron su acción. ¿Cerrar la noche? Después ya no se podrán cambiar.';
      if (!(await confirmar(texto, { si: 'Cerrar la noche' }))) return;
      try { await D.cerrarNoche(b, pid); toast('Noche cerrada'); } catch (e) { toast(mensajeDeError(e)); }
    }
    function elegirVictima(valor) {
      victimaElegida = valor; pintar();
      D.guardarBorradorNoche(b, pid, pub.rondaId, valor).catch((e) => toast(mensajeDeError(e)));
    }
    async function procesarNoche() {
      if (victimaElegida === null) return;
      const quien = victimaElegida === R.SIN_VICTIMA ? 'sin víctima esta noche' : `la víctima será ${nickDe(victimaElegida)}`;
      if (!(await confirmar(`Vas a procesar la noche: ${quien}. Se aplican el resultado, el anuncio y las respuestas privadas. No se puede deshacer.`, { si: 'Procesar la noche' }))) return;
      try { await D.procesarNoche(b, pid, victimaElegida); toast('Noche procesada'); } catch (e) { toast(mensajeDeError(e)); }
    }


    // ── interrogatorios, votación y final ──
    const hacer = (fn, ok) => async () => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(mensajeDeError(e)); } };
    const victoria = () => (pub && rolesCargados ? D.victoriaActual(pub, roles) : { terminada: false });

    async function comenzarInterrogatorios() {
      if (!(await confirmar('¿Empezar los interrogatorios? Vas a dar la palabra de a uno.', { si: 'Comenzar interrogatorios' }))) return;
      await hacer(() => D.comenzarInterrogatorios(b, pid), 'Interrogatorios abiertos')();
    }
    async function darPalabra(i) {
      const vivosOrden = orden.filter((u) => pub.jugadores[u]?.vivo);
      if (!vivosOrden.length) return;
      const idx = Math.max(0, Math.min(i, vivosOrden.length - 1));
      turno = idx;
      try { await D.darLaPalabra(b, pid, { uid: vivosOrden[idx], numero: idx + 1, total: vivosOrden.length }); }
      catch (e) { toast(mensajeDeError(e)); }
      pintar();
    }
    const siguienteTurno = () => darPalabra(turno + 1);
    const timer = (accion, seg) => hacer(() => D.controlarTimer(b, pid, accion, seg));
    const abrirDebate = hacer(() => D.anunciar(b, pid, 'Debate abierto: todos pueden hablar. El conductor avisará cuándo termina.'), 'Debate anunciado');
    async function abrirVotacion() {
      const faltan = orden.filter((u) => pub.jugadores[u]?.vivo).length - (turno + 1);
      const texto = turno < 0 || faltan > 0 ? 'Todavía no todos dieron su coartada. ¿Abrir la votación igual?' : '¿Abrir la votación?';
      if (!(await confirmar(texto, { si: 'Abrir votación' }))) return;
      await hacer(() => D.abrirVotacion(b, pid), 'Votación abierta')();
    }
    async function cerrarVotacion() {
      const vivos = R.vivosDe(pub.jugadores); const faltan = vivos.length - Object.keys(votos).length;
      const texto = faltan > 0 ? `Faltan ${faltan} voto${faltan === 1 ? '' : 's'}. Si cerrás, ya no podrán votar. ¿Cerrar igual?` : 'Votaron todos. ¿Cerrar la votación?';
      if (!(await confirmar(texto, { si: 'Cerrar votación' }))) return;
      await hacer(() => D.cerrarVotacion(b, pid), 'Votación cerrada')();
    }
    async function escrutar() {
      try {
        const r = await D.escrutarVotacion(b, pid);
        toast(r.segundaVotacion ? 'Empate: se abrió la segunda votación' : 'Votos contados');
      } catch (e) { toast(mensajeDeError(e)); }
    }
    async function finalizar() {
      const v = victoria();
      const quien = v.ganador === R.EQUIPOS.INOCENTES ? 'los inocentes' : 'los asesinos y sus cómplices';
      if (!(await confirmar(`Se cumplió una condición de victoria: ganan ${quien}. ¿Declarar el fin de la partida?`, { si: 'Declarar ganadores' }))) return;
      await hacer(() => D.finalizarPartida(b, pid), 'Partida finalizada')();
    }

    // ── piezas de pantalla ──
    function filaAccion(uid, a) {
      return h('div', { class: 'as-accion-fila' }, h('span', {}, nickDe(uid)),
        a ? h('span', { class: 'as-chip listo' }, '→ ' + nickDe(a.objetivo)) : h('span', { class: 'as-chip espera' }, 'Sin acción'));
    }
    function gruposDeAcciones(vivos, mr) {
      return [['asesino', 'Asesinos (proponen una víctima)'], ['medico', 'Médicos (protegen)'], ['detective', 'Detectives (investigan)']].map(([rol, titulo]) => {
        const lista = vivos.filter((u) => mr[u] === rol);
        if (!lista.length) return null;
        return h('div', {}, h('div', { class: 'as-sub' }, titulo), lista.map((u) => filaAccion(u, acciones[u])));
      });
    }
    function panelNoche(vivos, mr) {
      return h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, `Noche ${pub.ronda} — acciones en vivo (solo lo ves vos)`),
        h('p', { class: 'as-muted' }, 'Los jugadores pueden cambiar su elección hasta que cierres la noche.'),
        gruposDeAcciones(vivos, mr),
        h('div', { class: 'as-acciones' }, h('button', { type: 'button', class: 'as-btn', onClick: cerrarNoche }, 'Cerrar la noche')));
    }
    function panelCierre(vivos, mr) {
      const resumen = R.resumenPropuestas(acciones, mr, vivos);
      const propuestasPorObjetivo = resumen.porObjetivo;
      const opciones = vivos.map((u) => {
        const prop = propuestasPorObjetivo[u]?.length || 0;
        return h('button', { type: 'button', class: 'as-opcion' + (victimaElegida === u ? ' sel' : ''), onClick: () => elegirVictima(u) },
          h('span', {}, nickDe(u)), prop ? h('small', {}, `propuesto por ${prop} asesino${prop === 1 ? '' : 's'}`) : null);
      });
      opciones.push(h('button', { type: 'button', class: 'as-opcion' + (victimaElegida === R.SIN_VICTIMA ? ' sel' : ''), onClick: () => elegirVictima(R.SIN_VICTIMA) }, h('span', {}, 'Sin víctima')));
      return h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, `Cierre de la noche ${pub.ronda} — elegí la víctima`),
        h('p', { class: 'as-muted' }, 'Las acciones ya están congeladas. La víctima la decidís vos: el sistema no resuelve por mayoría.'),
        resumen.hayDesacuerdo ? h('p', { class: 'as-aviso' }, 'Los asesinos no propusieron a la misma persona.') : null,
        resumen.sinPropuesta.length ? h('p', { class: 'as-aviso' }, `Sin propuesta: ${resumen.sinPropuesta.map(nickDe).join(', ')}.`) : null,
        gruposDeAcciones(vivos, mr),
        h('div', { class: 'as-sub' }, 'Víctima definitiva'),
        h('div', { class: 'as-opciones' }, opciones),
        h('div', { class: 'as-acciones' }, h('button', { type: 'button', class: 'as-btn', disabled: victimaElegida === null, onClick: procesarNoche }, 'Procesar la noche')));
    }
    function panelResultado() {
      const r = resultadoNoche;
      if (!r) return h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, `Resultado de la noche ${pub.ronda}`), h('p', { class: 'as-muted' }, 'Cargando el resultado…'));
      const v = r.victoria;
      let linea;
      if (r.victima === R.SIN_VICTIMA) linea = 'No hubo víctima esta noche.';
      else if (r.exito) linea = `${nickDe(r.victima)} fue eliminado y ahora es un fantasma.`;
      else linea = `El ataque contra ${nickDe(r.victima)} fracasó: el médico lo protegió.`;
      return h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, `Resultado de la noche ${pub.ronda} (solo lo ves vos)`),
        h('p', { class: 'as-anuncio' }, 'Anuncio público: ', pub.anuncio),
        h('p', {}, linea),
        r.investigaciones.length
          ? h('div', {}, h('div', { class: 'as-sub' }, 'Investigaciones'), r.investigaciones.map((i) => h('div', { class: 'as-accion-fila' },
            h('span', {}, `${nickDe(i.detective)} investigó a ${i.objetivoNick}`),
            h('span', { class: 'as-chip ' + (i.esAsesino ? 'rol-asesinos' : 'listo') }, i.esAsesino ? 'ES ASESINO' : 'NO ES ASESINO'))))
          : null,
        v.terminada
          ? h('p', { class: 'as-victoria' }, `Condición de victoria alcanzada: ganan ${v.ganador === R.EQUIPOS.INOCENTES ? 'los inocentes' : 'los asesinos y sus cómplices'}. Declará el fin de la partida con el botón de abajo.`)
          : h('p', { class: 'as-muted' }, `Siguen en juego ${v.inocentesVivos} inocentes y ${v.malosVivos} del equipo asesino (${v.asesinosVivos} asesino${v.asesinosVivos === 1 ? '' : 's'}).`));
    }


    function relojPublico() {
      const r = reloj(() => pub?.timer, () => b.ahora());
      relojes.push(r.detener);
      return r.el;
    }
    function panelInterrogatorios() {
      const vivosOrden = orden.filter((u) => pub.jugadores[u]?.vivo);
      const t = pub.timer;
      const filas = vivosOrden.map((u, i) => h('button', { type: 'button', class: 'as-turno' + (i === turno ? ' actual' : i < turno ? ' hablo' : ''), onClick: () => darPalabra(i) },
        h('span', {}, `${i + 1}. ${nickDe(u)}`), h('span', { class: 'as-chip ' + (i === turno ? 'listo' : 'espera') }, i === turno ? 'Habla ahora' : i < turno ? 'Ya habló' : 'Pendiente')));
      return h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, `Interrogatorios — ronda ${pub.ronda}`),
        h('p', { class: 'as-muted' }, 'Das la palabra de a uno. El tiempo es solo una guía: nada avanza solo.'),
        relojPublico(),
        h('div', { class: 'as-acciones' },
          h('button', { type: 'button', class: 'as-btn', onClick: siguienteTurno, disabled: turno >= vivosOrden.length - 1 && turno >= 0 }, turno < 0 ? 'Dar la palabra al primero' : 'Siguiente jugador'),
          turno >= 0 ? h('button', { type: 'button', class: 'as-btn sec', onClick: () => darPalabra(turno) }, 'Repetir turno') : null,
          t && t.corriendo ? h('button', { type: 'button', class: 'as-btn sec', onClick: timer('pausar') }, 'Pausar') : null,
          t && !t.corriendo && t.restante > 0 ? h('button', { type: 'button', class: 'as-btn sec', onClick: timer('reanudar') }, 'Reanudar') : null,
          t && (t.corriendo || t.restante > 0) ? h('button', { type: 'button', class: 'as-btn sec', onClick: timer('detener') }, 'Detener tiempo') : null),
        h('div', { class: 'as-sub' }, 'Turnos (tocá un nombre para darle la palabra)'), filas,
        h('p', { class: 'as-muted' }, 'Si recargás este panel, el orden de los turnos se vuelve a sortear.'),
        h('div', { class: 'as-acciones' },
          h('button', { type: 'button', class: 'as-btn sec', onClick: abrirDebate }, 'Anunciar debate libre'),
          h('button', { type: 'button', class: 'as-btn', onClick: abrirVotacion }, 'Abrir votación')));
    }
    function panelVotacion() {
      const v = pub.votacion; if (!v) return null;
      const vivos = R.vivosDe(pub.jugadores); const cands = Object.keys(v.candidatos || {});
      const votaron = Object.keys(votos); const faltan = vivos.filter((u) => !votos[u]);
      const conteo = Object.fromEntries(cands.map((c) => [c, 0])); Object.values(votos).forEach((o) => { if (o in conteo) conteo[o]++; });
      const segunda = v.id.endsWith('v2');
      return h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, segunda ? 'Segunda votación (desempate)' : `Votación — ronda ${pub.ronda}`),
        segunda ? h('p', { class: 'as-aviso' }, `Solo se vota entre: ${cands.map(nickDe).join(', ')}.`) : null,
        v.abierta ? relojPublico() : null,
        h('p', { class: 'as-muted' }, `${votaron.length} de ${vivos.length} votaron` + (v.abierta ? '' : ' (votación cerrada)')),
        h('div', { class: 'as-sub' }, 'Conteo en vivo (solo lo ves vos)'),
        cands.slice().sort((x, y) => conteo[y] - conteo[x]).map((c) => h('div', { class: 'as-accion-fila' }, h('span', {}, nickDe(c)), h('span', { class: 'as-chip ' + (conteo[c] ? 'rol-inocentes' : 'espera') }, `${conteo[c]} voto${conteo[c] === 1 ? '' : 's'}`))),
        h('div', { class: 'as-sub' }, 'Quién votó a quién (solo lo ves vos)'),
        votaron.length ? votaron.map((u) => h('div', { class: 'as-accion-fila' }, h('span', {}, nickDe(u)), h('span', { class: 'as-chip listo' }, '→ ' + nickDe(votos[u])))) : h('p', { class: 'as-muted' }, 'Todavía nadie votó.'),
        faltan.length ? h('p', { class: 'as-muted' }, `Faltan: ${faltan.map(nickDe).join(', ')}.`) : null,
        h('div', { class: 'as-acciones' },
          v.abierta ? h('button', { type: 'button', class: 'as-btn', onClick: cerrarVotacion }, 'Cerrar votación') : h('button', { type: 'button', class: 'as-btn', onClick: escrutar }, 'Contar los votos')));
    }
    function panelResultadoVotacion() {
      const r = pub.votacion?.resultado; const v = victoria();
      return h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, `Resultado de la votación — ronda ${pub.ronda}`),
        h('p', { class: 'as-anuncio' }, 'Anuncio público: ', pub.anuncio),
        r ? Object.entries(r.conteo).sort((x, y) => y[1] - x[1]).map(([u, n]) => h('div', { class: 'as-accion-fila' }, h('span', {}, nickDe(u)), h('span', { class: 'as-chip ' + (u === r.eliminado ? 'rol-asesinos' : 'espera') }, `${n} voto${n === 1 ? '' : 's'}` + (u === r.eliminado ? ' — eliminado' : '')))) : null,
        v.terminada
          ? h('p', { class: 'as-victoria' }, `Condición de victoria alcanzada: ganan ${v.ganador === R.EQUIPOS.INOCENTES ? 'los inocentes' : 'los asesinos y sus cómplices'}.`)
          : h('p', { class: 'as-muted' }, `Siguen en juego ${v.inocentesVivos} inocentes y ${v.malosVivos} del equipo asesino.`));
    }
    function panelFinal() {
      const g = pub.resultado?.ganador;
      return h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, 'Partida finalizada'),
        h('p', { class: 'as-victoria' }, g === 'inocentes' ? 'Ganaron los inocentes: todos los asesinos fueron eliminados.' : g === 'asesinos' ? 'Ganaron los asesinos y sus cómplices.' : 'La partida terminó.'),
        h('p', { class: 'as-muted' }, 'Los jugadores ya ven los roles de todos. La revelación completa (acciones, investigaciones y votos) llega en la próxima etapa.'));
    }

    function pintar() {
      relojes.splice(0).forEach((f) => f());
      const enfocado = editor && document.activeElement && editor.el.contains(document.activeElement) ? document.activeElement : null;
      btnGuardar = null; btnIniciar = null;
      vaciar(cuerpo);
      if (pub === undefined) { cuerpo.append(h('p', { class: 'as-muted' }, 'Cargando…')); return; }
      if (!pub) { cuerpo.append(h('p', { class: 'as-error' }, 'No se encontró la partida.')); return; }
      const uids = Object.keys(pub.jugadores || {});
      const enPrep = pub.fase === R.FASES.PREPARACION;
      const terminal = R.esFaseTerminal(pub.fase);
      const nListos = uids.filter((u) => listos[u]).length;
      const mr = mapaRoles();
      const vivos = R.vivosDe(pub.jugadores);

      cuerpo.append(h('div', { class: 'as-card' },
        h('div', { class: 'as-resumen' },
          h('div', {}, h('div', { class: 'as-card-label' }, 'Partida'), h('div', { class: 'as-resumen-nombre' }, pub.nombre)),
          h('span', { class: 'as-chip ' + pub.fase }, R.ETIQUETA_FASE[pub.fase] || pub.fase)),
        h('p', { class: 'as-muted' }, `${uids.length} jugadores · ${vivos.length} vivos` + (pub.ronda ? ` · ronda ${pub.ronda}` : '') + ` · creada ${fechaCorta(pub.creadaEn)}` + (enPrep ? ` · ${nListos} listos` : ''))));

      if (pub.fase === R.FASES.NOCHE && rolesCargados) cuerpo.append(panelNoche(vivos, mr));
      if (pub.fase === R.FASES.CIERRE_NOCHE && rolesCargados) cuerpo.append(panelCierre(vivos, mr));
      if (pub.fase === R.FASES.DESCUBRIMIENTO && rolesCargados) cuerpo.append(panelResultado());
      if (pub.fase === R.FASES.INTERROGATORIOS) cuerpo.append(panelInterrogatorios());
      if (pub.fase === R.FASES.VOTACION) { const p = panelVotacion(); if (p) cuerpo.append(p); }
      if (pub.fase === R.FASES.RESULTADO_VOTACION && rolesCargados) cuerpo.append(panelResultadoVotacion());
      if (pub.fase === R.FASES.FINALIZADA) cuerpo.append(panelFinal());

      const filas = uids.map((u) => ({ uid: u, ...pub.jugadores[u] })).sort((x, y) => x.nick.localeCompare(y.nick, 'es', { sensitivity: 'base' }));
      cuerpo.append(h('div', { class: 'as-card' },
        h('div', { class: 'as-card-label' }, enPrep ? 'Jugadores' : 'Jugadores y roles (solo lo ves vos)'),
        filas.map((j) => {
          const rol = roles?.[j.uid]?.rol;
          const info = rol ? R.DESCRIPCION_ROL[rol] : null;
          return h('div', { class: 'as-jugador' + (j.vivo ? '' : ' fantasma') },
            h('span', { class: 'as-jugador-nick' }, (j.vivo ? '' : '👻 ') + j.nick),
            enPrep
              ? h('span', { class: 'as-chip ' + (listos[j.uid] ? 'listo' : 'espera') }, listos[j.uid] ? 'Listo' : 'Sin marcar')
              : h('span', { class: 'as-chip rol-' + (info ? info.equipo : 'x') }, info ? info.nombre : '…'));
        }),
        !enPrep && roles ? h('p', { class: 'as-muted' }, resumenRoles(roles)) : null));

      if (enPrep && editor) {
        const v = editor.leer();
        cuerpo.append(h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, 'Configuración (editable hasta iniciar)'), editor.el,
          h('div', { class: 'as-acciones' }, (btnGuardar = h('button', { type: 'button', class: 'as-btn sec', disabled: !v.validacion.ok, onClick: guardarConfig }, 'Guardar configuración')))));
      } else if (!enPrep && distrib) {
        cuerpo.append(h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, 'Distribución usada'), h('p', { class: 'as-muted' }, textoDistribucion(distrib))));
      }

      const acc = h('div', { class: 'as-acciones' });
      if (enPrep) {
        const v = editor ? editor.leer() : null;
        btnIniciar = h('button', { type: 'button', class: 'as-btn', disabled: !distrib || (v && !v.validacion.ok), onClick: iniciar }, 'Repartir roles y empezar');
        acc.append(btnIniciar);
      }
      const vic = victoria();
      if (pub.fase === R.FASES.ROLES) acc.append(h('button', { type: 'button', class: 'as-btn', onClick: comenzarNoche }, 'Comenzar la noche'));
      if (pub.fase === R.FASES.RESULTADO_VOTACION && rolesCargados) {
        acc.append(vic.terminada
          ? h('button', { type: 'button', class: 'as-btn', onClick: finalizar }, 'Declarar ganadores')
          : h('button', { type: 'button', class: 'as-btn', onClick: comenzarNoche }, 'Comenzar la noche'));
      }
      if (pub.fase === R.FASES.DESCUBRIMIENTO && rolesCargados) {
        acc.append(vic.terminada
          ? h('button', { type: 'button', class: 'as-btn', onClick: finalizar }, 'Declarar ganadores')
          : h('button', { type: 'button', class: 'as-btn', onClick: comenzarInterrogatorios }, 'Comenzar interrogatorios'));
      }
      if (!terminal) acc.append(h('button', { type: 'button', class: 'as-btn peligro', onClick: cancelar }, 'Cancelar partida'));
      cuerpo.append(h('div', { class: 'as-card' }, h('div', { class: 'as-card-label' }, 'Acciones'),
        pub.fase === R.FASES.ROLES ? h('p', { class: 'as-muted' }, 'Los jugadores ya pueden ver su personaje. Cuando estén listos, empezá la noche.') : null,
        pub.fase === R.FASES.DESCUBRIMIENTO ? h('p', { class: 'as-muted' }, 'Anunciá el resultado por audio y después pasá a los interrogatorios (o declará a los ganadores si la partida terminó).') : null,
        acc));
      if (enfocado && document.body.contains(enfocado)) enfocado.focus();
    }

    pintar();
  }

  function textoDistribucion(d) {
    return `${d.asesinos} asesino(s), ${d.complices} cómplice(s), ${d.detectives} detective(s), ${d.medicos} médico(s), ${d.testigos} testigo(s), ${d.sospechosos} sospechoso(s).`;
  }
  function resumenRoles(roles) {
    const c = R.contarRoles(Object.fromEntries(Object.entries(roles).filter(([, x]) => x.rol).map(([u, x]) => [u, x.rol])));
    return `Asesinos ${c.asesino} · Cómplices ${c.complice} · Detectives ${c.detective} · Médicos ${c.medico} · Testigos ${c.testigo} · Sospechosos ${c.sospechoso}`;
  }

  ir('lista');
  return { ir };
}
