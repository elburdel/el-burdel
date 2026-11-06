// games/asesino.js
// Pantalla del jugador de «El asesino está entre nosotros» — Etapa 2:
// ver la invitación, marcar "listo", ver (en privado) el personaje y el equipo, y — Etapa 3 — jugar la noche:
// elegir la acción del rol, recibir resultados privados y ver el estado de fantasma.
import * as R from './asesino-reglas.js';
import * as D from './asesino-datos.js';
import { h, vaciar, toast, modoDemo, bannerDemo, mensajeDeError } from './asesino-ui.js';

export async function iniciarJugador(opciones = {}) {
  const raiz = document.getElementById('as-root');
  if (!raiz) throw new Error('Falta el contenedor #as-root.');
  const demo = opciones.demo ?? modoDemo();
  let b; let uid; let nick;

  if (opciones.backend) {
    b = opciones.backend; uid = b.uid(); nick = opciones.nick || 'Jugador';
  } else if (demo) {
    const dm = await import('./asesino-demo.js');
    uid = new URLSearchParams(location.search).get('yo') || 'demo01';
    b = dm.crearBackendDemo(uid); nick = dm.DEMO_USUARIOS[uid]?.nick || uid;
  } else {
    const { onSession, getUserData } = await import('../js/auth.js');
    const datos = await new Promise((resolver) => {
      onSession(async (user) => {
        if (!user) { window.location.href = '/login.html'; return; }
        const d = await getUserData(user.uid);
        if (!d || d.status !== 'active') { window.location.href = '/login.html'; return; }
        if (d.role === 'admin') { window.location.href = '/admin.html'; return; }
        resolver({ user, d });
      });
    });
    uid = datos.user.uid; nick = datos.d.nick; b = await D.crearBackendFirebase();
  }

  const limpiar = [];
  function reiniciarPantalla() {
    limpiar.splice(0).forEach((f) => { try { f(); } catch { /* ya dado de baja */ } });
    vaciar(raiz);
    if (b.modo === 'demo') raiz.append(bannerDemo(`jugás como ${nick} (${uid}). Probá con otro jugador cambiando ?yo=demo02 en la dirección.`));
    raiz.append(h('div', { class: 'as-header' },
      h('h1', { class: 'as-title chico' }, 'El asesino está entre nosotros'),
      h('span', { class: 'as-nick-pill' }, nick)));
  }

  const tarjeta = (etiqueta, ...contenido) => h('div', { class: 'as-card' }, etiqueta ? h('div', { class: 'as-card-label' }, etiqueta) : null, ...contenido);

  // ───── Elegir/abrir partida ─────
  async function arrancar() {
    reiniciarPantalla();
    raiz.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Buscando tu invitación…')));
    let invs;
    try { invs = await D.leerInvitaciones(b, uid); }
    catch (e) { reiniciarPantalla(); raiz.append(tarjeta('No se pudo cargar', h('p', { class: 'as-error' }, mensajeDeError(e)))); return; }

    const items = [];
    for (const [pid, inv] of Object.entries(invs)) {
      const pub = await D.leerPublicoSeguro(b, pid);
      if (pub) items.push({ pid, nombre: pub.nombre || inv.nombre, fase: pub.fase, creadaEn: inv.creadaEn || 0 });
    }
    items.sort((x, y) => y.creadaEn - x.creadaEn);
    const activas = items.filter((i) => !R.esFaseTerminal(i.fase));
    const pedida = new URLSearchParams(location.search).get('partida');
    if (pedida && items.some((i) => i.pid === pedida)) return pantallaPartida(pedida, false);
    if (activas.length === 1) return pantallaPartida(activas[0].pid, false);
    if (activas.length > 1) return pantallaElegir(activas);
    return pantallaSinInvitacion(items);
  }

  function pantallaSinInvitacion(items) {
    reiniciarPantalla();
    const ultima = items[0];
    raiz.append(tarjeta('Sin partida activa',
      h('div', { class: 'as-vacio-icono' }, '🕯️'),
      h('p', { class: 'as-centro' }, 'No tenés una invitación a una partida activa.'),
      h('p', { class: 'as-muted as-centro' }, 'Solo pueden entrar los jugadores que el conductor invitó. Cuando te invite, la partida va a aparecer acá.'),
      ultima ? h('p', { class: 'as-muted as-centro' }, `Tu última partida, «${ultima.nombre}», terminó (${R.ETIQUETA_FASE[ultima.fase] || ultima.fase}).`) : null,
      h('div', { class: 'as-acciones centrado' }, h('button', { type: 'button', class: 'as-btn sec', onClick: arrancar }, 'Volver a buscar'))));
  }

  function pantallaElegir(activas) {
    reiniciarPantalla();
    raiz.append(tarjeta('Tenés varias partidas', activas.map((p) => h('button', { type: 'button', class: 'as-fila', onClick: () => pantallaPartida(p.pid, true) },
      h('span', { class: 'as-fila-nombre' }, p.nombre), h('span', { class: 'as-chip ' + p.fase }, R.ETIQUETA_FASE[p.fase] || p.fase)))));
  }

  // ───── Partida ─────
  function pantallaPartida(pid, puedeVolver) {
    reiniciarPantalla();
    let pub; let listo = false; let rol = null; let equipo = null; let revelado = false;
    let miAccion = null; let rondaEscuchada = null; let bajaAccion = null;
    let miNoche = null; let misResultados = null; let seleccion = null; let enviando = false;
    const cuerpo = h('div');
    raiz.append(cuerpo);

    limpiar.push(D.escucharPublico(b, pid, (v) => { pub = v; alCambiarPublico(); }, (e) => { vaciar(cuerpo); cuerpo.append(tarjeta('No se pudo cargar', h('p', { class: 'as-error' }, mensajeDeError(e)))); }));
    limpiar.push(D.escucharMiListo(b, pid, uid, (v) => { listo = v; pintar(); }));
    limpiar.push(D.escucharMiRol(b, pid, uid, (v) => { rol = v; pintar(); }));
    limpiar.push(D.escucharMiEquipo(b, pid, uid, (v) => { equipo = v; pintar(); }));
    limpiar.push(D.escucharMiNoche(b, pid, uid, (v) => { miNoche = v; pintar(); }));
    limpiar.push(D.escucharMisResultados(b, pid, uid, (v) => { misResultados = v; pintar(); }));
    limpiar.push(() => { if (bajaAccion) bajaAccion(); });

    // Mi acción depende de la ronda: al cambiar de ronda se vuelve a escuchar.
    function alCambiarPublico() {
      if (pub && pub.rondaId && pub.rondaId !== rondaEscuchada && pub.rondaId !== 'r0') {
        if (bajaAccion) bajaAccion();
        rondaEscuchada = pub.rondaId; miAccion = null; seleccion = null;
        bajaAccion = D.escucharMiAccion(b, pid, pub.rondaId, uid, (v) => { miAccion = v; pintar(); });
      }
      pintar();
    }

    async function alternarListo() {
      try { await D.marcarListo(b, pid, uid, !listo); } catch (e) { toast(mensajeDeError(e)); }
    }
    async function enviar() {
      if (!seleccion || enviando) return;
      enviando = true; pintar();
      try {
        await D.enviarAccion(b, pid, { rondaId: pub.rondaId, uid, rol, objetivo: seleccion, vivos: R.vivosDe(pub.jugadores) });
        toast('Elección enviada');
      } catch (e) { toast(mensajeDeError(e)); } finally { enviando = false; pintar(); }
    }

    function tarjetaRol() {
      if (!rol || !R.DESCRIPCION_ROL[rol]) return tarjeta('Tu personaje', h('p', { class: 'as-muted' }, 'Todavía no se repartieron los roles.'));
      const info = R.DESCRIPCION_ROL[rol];
      if (!revelado) {
        return h('button', { type: 'button', class: 'as-reveal', onClick: () => { revelado = true; pintar(); } },
          h('span', { class: 'as-reveal-icono' }, '🎭'),
          h('span', { class: 'as-reveal-titulo' }, 'Tocá para ver tu personaje'),
          h('small', {}, 'Asegurate de que nadie esté mirando tu pantalla.'));
      }
      const companeros = equipo ? Object.values(equipo) : [];
      return h('div', { class: 'as-card as-rol ' + info.equipo },
        h('div', { class: 'as-card-label' }, 'Tu personaje (secreto)'),
        h('div', { class: 'as-rol-nombre' }, info.nombre),
        h('p', { class: 'as-rol-resumen' }, info.resumen),
        h('ul', { class: 'as-rol-lista' }, info.instrucciones.map((t) => h('li', {}, t))),
        companeros.length
          ? h('div', { class: 'as-equipo' }, h('div', { class: 'as-sub' }, 'Tu equipo'),
            companeros.map((c) => h('div', { class: 'as-equipo-fila' }, h('span', {}, c.nick), h('span', { class: 'as-chip rol-asesinos' }, R.DESCRIPCION_ROL[c.rol]?.nombre || c.rol))))
          : null,
        h('div', { class: 'as-acciones' }, h('button', { type: 'button', class: 'as-btn sec small', onClick: () => { revelado = false; pintar(); } }, 'Ocultar')));
    }

    const TEXTOS_ACCION = {
      asesino: { titulo: 'Proponé una víctima', ayuda: 'El conductor elegirá la víctima definitiva. Coordinen por audio con tu equipo.', boton: 'Enviar propuesta' },
      medico: { titulo: '¿A quién protegés esta noche?', ayuda: 'Si el asesinato recae sobre esa persona, fracasa. Podés protegerte a vos mismo una sola vez por partida.', boton: 'Enviar protección' },
      detective: { titulo: '¿A quién investigás?', ayuda: 'Cuando amanezca recibirás en privado: ES ASESINO o NO ES ASESINO.', boton: 'Enviar investigación' },
    };

    function candidatos() {
      const excluidos = new Set([...(rol === R.ROLES.ASESINO && equipo ? Object.keys(equipo) : [])]);
      return Object.entries(pub.jugadores || {})
        .filter(([u, j]) => j.vivo && (u !== uid || rol === R.ROLES.MEDICO) && !excluidos.has(u))
        .map(([u, j]) => ({ uid: u, nick: j.nick }))
        .sort((x, y) => x.nick.localeCompare(y.nick, 'es', { sensitivity: 'base' }));
    }

    function tarjetaNoche(yoVivo) {
      const abierta = pub.fase === R.FASES.NOCHE;
      if (!yoVivo) return tarjeta('Noche', h('p', { class: 'as-muted' }, 'Es de noche. Los fantasmas solo escuchan.'));
      if (!D.rolTieneAccion(rol)) {
        return tarjeta('Es de noche', h('div', { class: 'as-vacio-icono' }, '🌙'),
          h('p', { class: 'as-centro' }, abierta ? 'Cerrá los ojos y esperá. Esta noche no tenés acción.' : 'El conductor está procesando la noche.'));
      }
      const tx = TEXTOS_ACCION[rol];
      const nombreElegido = miAccion ? (pub.jugadores?.[miAccion.objetivo]?.nick ?? '…') : null;
      if (!abierta) {
        return tarjeta(tx.titulo,
          h('p', {}, nombreElegido ? `Tu elección fue ${nombreElegido}.` : 'No llegaste a enviar tu elección.'),
          h('p', { class: 'as-muted' }, 'La noche se cerró: el conductor está procesando el resultado.'));
      }
      const lista = candidatos();
      return tarjeta(tx.titulo, h('p', { class: 'as-muted' }, tx.ayuda),
        h('div', { class: 'as-opciones' }, lista.map((c) => h('button', { type: 'button',
          class: 'as-opcion' + ((seleccion ?? miAccion?.objetivo) === c.uid ? ' sel' : ''), onClick: () => { seleccion = c.uid; pintar(); } },
        h('span', {}, c.uid === uid ? 'Vos mismo' : c.nick)))),
        nombreElegido ? h('p', { class: 'as-aviso' }, `Elección enviada: ${nombreElegido}. Podés cambiarla hasta que el conductor cierre la noche.`) : null,
        h('div', { class: 'as-acciones centrado' }, h('button', { type: 'button', class: 'as-btn', disabled: !seleccion || enviando || seleccion === miAccion?.objetivo, onClick: enviar }, enviando ? 'Enviando…' : (miAccion ? 'Cambiar elección' : tx.boton))));
    }

    function tarjetaResultadoPrivado() {
      const rid = pub.rondaId;
      if (rol === R.ROLES.ASESINO && miNoche && miNoche[rid]) {
        return tarjeta('Resultado de la noche (privado)', h('p', {}, miNoche[rid]));
      }
      if (rol === R.ROLES.DETECTIVE && misResultados) {
        const claves = Object.keys(misResultados).sort((x, y) => Number(y.slice(1)) - Number(x.slice(1)));
        if (!claves.length) return null;
        return tarjeta('Tu investigación (privado)', claves.map((k) => {
          const r = misResultados[k];
          return h('div', { class: 'as-investigacion' },
            h('div', { class: 'as-muted' }, `Noche ${k.slice(1)} — investigaste a ${r.objetivoNick}`),
            h('div', { class: 'as-veredicto ' + (r.esAsesino ? 'si' : 'no') }, r.esAsesino ? 'ES ASESINO' : 'NO ES ASESINO'));
        }));
      }
      return null;
    }

    function pintar() {
      vaciar(cuerpo);
      if (pub === undefined) { cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Cargando la partida…'))); return; }
      if (!pub) { cuerpo.append(tarjeta('Partida', h('p', { class: 'as-error' }, 'No se encontró la partida.'))); return; }
      const yo = pub.jugadores?.[uid];
      const yoVivo = !yo || yo.vivo !== false;
      const jugadores = Object.values(pub.jugadores || {});

      cuerpo.append(h('div', { class: 'as-card' },
        h('div', { class: 'as-resumen' },
          h('div', {}, h('div', { class: 'as-card-label' }, 'Partida'), h('div', { class: 'as-resumen-nombre' }, pub.nombre)),
          h('span', { class: 'as-chip ' + pub.fase }, R.ETIQUETA_FASE[pub.fase] || pub.fase)),
        pub.anuncio ? h('p', { class: 'as-anuncio' }, pub.anuncio) : null));

      if (!yoVivo) {
        cuerpo.append(h('div', { class: 'as-fantasma' }, h('strong', {}, '👻 Sos un fantasma. '), 'Podés escuchar, pero no hablar, votar ni revelar información.'));
      }

      if (pub.fase === R.FASES.PREPARACION) {
        cuerpo.append(tarjeta('Preparación',
          h('p', {}, 'El conductor va a iniciar la partida cuando todos estén listos. Los roles se reparten al azar y son secretos.'),
          h('div', { class: 'as-acciones centrado' }, h('button', { type: 'button', class: 'as-btn' + (listo ? ' ok' : ''), onClick: alternarListo }, listo ? '✔ Estoy listo (tocá para desmarcar)' : 'Estoy listo'))));
      } else if (pub.fase === R.FASES.CANCELADA) {
        cuerpo.append(tarjeta('Partida cancelada', h('p', { class: 'as-muted' }, 'El conductor canceló esta partida.')));
      } else {
        if (pub.fase === R.FASES.NOCHE || pub.fase === R.FASES.CIERRE_NOCHE) cuerpo.append(tarjetaNoche(yoVivo));
        if (pub.fase === R.FASES.DESCUBRIMIENTO) {
          const priv = yoVivo ? tarjetaResultadoPrivado() : null;
          if (priv) cuerpo.append(priv);
        }
        cuerpo.append(tarjetaRol());
        if (pub.fase === R.FASES.ROLES) {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Esperá la señal del conductor: pronto empieza la noche.')));
        } else if (pub.fase === R.FASES.DESCUBRIMIENTO) {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Escuchá el anuncio del conductor. Los interrogatorios y la votación llegan en las próximas etapas.')));
        } else if (![R.FASES.NOCHE, R.FASES.CIERRE_NOCHE].includes(pub.fase)) {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, `La partida está en «${R.ETIQUETA_FASE[pub.fase] || pub.fase}». Esta versión todavía no muestra esa fase en tu pantalla: seguí las instrucciones del conductor por audio.`)));
        }
      }

      cuerpo.append(tarjeta(`Jugadores (${jugadores.length})`, h('div', { class: 'as-chips' }, jugadores.slice().sort((x, y) => x.nick.localeCompare(y.nick, 'es', { sensitivity: 'base' }))
        .map((j) => h('span', { class: 'as-chip nick' + (j.vivo ? '' : ' fantasma') }, (j.vivo ? '' : '👻 ') + j.nick)))));
      if (puedeVolver) cuerpo.append(h('div', { class: 'as-acciones centrado' }, h('button', { type: 'button', class: 'as-btn sec small', onClick: arrancar }, '← Mis partidas')));
    }
    pintar();
  }

  await arrancar();
  return { arrancar };
}
