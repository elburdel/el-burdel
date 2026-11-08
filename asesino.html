// games/asesino.js
// Pantalla del jugador de «El asesino está entre nosotros» — Etapa 2:
// ver la invitación, marcar "listo", ver (en privado) el personaje y el equipo, y — Etapa 3 — jugar la noche:
// elegir la acción del rol, recibir resultados privados y ver el estado de fantasma.
import * as R from './asesino-reglas.js';
import * as D from './asesino-datos.js';
import { h, vaciar, toast, modoDemo, bannerDemo, mensajeDeError, reloj } from './asesino-ui.js';

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
      h('div', { class: 'as-acciones centrado' },
        ultima && ultima.fase === R.FASES.FINALIZADA ? h('button', { type: 'button', class: 'as-btn', onClick: () => pantallaPartida(ultima.pid, true) }, `Ver el final de «${ultima.nombre}»`) : null,
        h('button', { type: 'button', class: 'as-btn sec', onClick: arrancar }, 'Volver a buscar'))));
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
    let miVoto = null; let vidEscuchado = null; let bajaVoto = null; let seleccionVoto = null; let votando = false;
    let revelacion = null; let bajaRev = null; const relojes = [];
    const cuerpo = h('div');
    raiz.append(cuerpo);

    limpiar.push(D.escucharPublico(b, pid, (v) => { pub = v; alCambiarPublico(); }, (e) => { vaciar(cuerpo); cuerpo.append(tarjeta('No se pudo cargar', h('p', { class: 'as-error' }, mensajeDeError(e)))); }));
    limpiar.push(D.escucharMiListo(b, pid, uid, (v) => { listo = v; pintar(); }));
    limpiar.push(D.escucharMiRol(b, pid, uid, (v) => { rol = v; pintar(); }));
    limpiar.push(D.escucharMiEquipo(b, pid, uid, (v) => { equipo = v; pintar(); }));
    limpiar.push(D.escucharMiNoche(b, pid, uid, (v) => { miNoche = v; pintar(); }));
    limpiar.push(D.escucharMisResultados(b, pid, uid, (v) => { misResultados = v; pintar(); }));
    limpiar.push(() => { if (bajaAccion) bajaAccion(); if (bajaVoto) bajaVoto(); if (bajaRev) bajaRev(); relojes.splice(0).forEach((f) => f()); });

    // Mi acción depende de la ronda: al cambiar de ronda se vuelve a escuchar.
    function alCambiarPublico() {
      if (pub && pub.rondaId && pub.rondaId !== rondaEscuchada && pub.rondaId !== 'r0') {
        if (bajaAccion) bajaAccion();
        rondaEscuchada = pub.rondaId; miAccion = null; seleccion = null;
        bajaAccion = D.escucharMiAccion(b, pid, pub.rondaId, uid, (v) => { miAccion = v; pintar(); });
      }
      // Mi voto depende de la votación vigente (r1v1, r1v2…): al cambiar se vuelve a escuchar.
      const vid = pub?.votacion?.id ?? null;
      if (vid !== vidEscuchado) {
        if (bajaVoto) bajaVoto();
        vidEscuchado = vid; miVoto = null; seleccionVoto = null; bajaVoto = null;
        if (vid) bajaVoto = D.escucharMiVoto(b, pid, vid, uid, (v) => { miVoto = v; pintar(); });
      }
      // La revelación solo se puede leer cuando la partida terminó.
      if (pub?.fase === R.FASES.FINALIZADA && !bajaRev) bajaRev = D.escucharRevelacion(b, pid, (v) => { revelacion = v; pintar(); });
      pintar();
    }

    async function votar() {
      if (!seleccionVoto || votando) return;
      votando = true; pintar();
      try {
        await D.enviarVoto(b, pid, { vid: pub.votacion.id, uid, objetivo: seleccionVoto, candidatos: Object.keys(pub.votacion.candidatos || {}) });
        toast('Voto registrado');
      } catch (e) { toast(mensajeDeError(e)); } finally { votando = false; pintar(); }
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


    function relojPublico() {
      const r = reloj(() => pub?.timer, () => b.ahora());
      relojes.push(r.detener);
      return r.el;
    }

    function tarjetaInterrogatorios(yoVivo) {
      return tarjeta('Interrogatorios', relojPublico(),
        h('p', {}, yoVivo ? 'Cuando el conductor te dé la palabra, tenés unos segundos para dar tu coartada. También podés interrogar, responder, acusar… y mentir.' : 'Escuchá con atención. Los fantasmas no pueden hablar.'));
    }

    function tarjetaVotacion(yoVivo) {
      const v = pub.votacion; if (!v) return null;
      const segunda = v.id.endsWith('v2');
      const titulo = segunda ? 'Segunda votación (desempate)' : 'Votación';
      if (!yoVivo) return tarjeta(titulo, h('p', { class: 'as-muted' }, 'Los fantasmas no votan. Esperá el resultado.'));
      if (!v.abierta) return tarjeta(titulo, h('p', { class: 'as-muted' }, miVoto ? `Tu voto: ${pub.jugadores?.[miVoto]?.nick ?? '…'}. La votación se cerró; esperá el resultado.` : 'La votación se cerró; esperá el resultado.'));
      if (miVoto) return tarjeta(titulo, relojPublico(), h('p', {}, `Tu voto quedó registrado: ${pub.jugadores?.[miVoto]?.nick ?? '…'}.`), h('p', { class: 'as-muted' }, 'El voto es definitivo y secreto. Esperá a que el conductor cierre la votación.'));
      const lista = Object.keys(v.candidatos || {}).filter((u) => u !== uid && pub.jugadores?.[u]?.vivo)
        .map((u) => ({ uid: u, nick: pub.jugadores[u].nick })).sort((x, y) => x.nick.localeCompare(y.nick, 'es', { sensitivity: 'base' }));
      return tarjeta(titulo, relojPublico(),
        h('p', { class: 'as-muted' }, segunda ? 'Hubo empate: votá solo entre los empatados.' : '¿Quién creés que es el asesino? Tu voto es secreto y definitivo.'),
        h('div', { class: 'as-opciones' }, lista.map((c) => h('button', { type: 'button', class: 'as-opcion' + (seleccionVoto === c.uid ? ' sel' : ''), onClick: () => { seleccionVoto = c.uid; pintar(); } }, h('span', {}, c.nick)))),
        h('div', { class: 'as-acciones centrado' }, h('button', { type: 'button', class: 'as-btn', disabled: !seleccionVoto || votando, onClick: votar }, votando ? 'Enviando…' : 'Votar')));
    }

    function tarjetaResultadoVotacion() {
      const r = pub.votacion?.resultado; if (!r) return null;
      const filas = Object.entries(r.conteo).sort((x, y) => y[1] - x[1]);
      return tarjeta('Resultado de la votación',
        filas.map(([u, n]) => h('div', { class: 'as-accion-fila' }, h('span', {}, pub.jugadores?.[u]?.nick ?? u),
          h('span', { class: 'as-chip ' + (u === r.eliminado ? 'rol-asesinos' : 'espera') }, `${n} voto${n === 1 ? '' : 's'}` + (u === r.eliminado ? ' — eliminado' : '')))));
    }

    function tarjetaFinal() {
      const g = pub.resultado?.ganador;
      const gano = rol && ((g === 'inocentes' && R.equipoDe(rol) === R.EQUIPOS.INOCENTES) || (g === 'asesinos' && R.equipoDe(rol) === R.EQUIPOS.ASESINOS));
      const filas = revelacion ? Object.values(revelacion.roles).sort((x, y) => x.nick.localeCompare(y.nick, 'es', { sensitivity: 'base' })) : [];
      return tarjeta('Fin de la partida',
        h('div', { class: 'as-rol-nombre ' + (g === 'asesinos' ? 'asesinos' : 'inocentes') }, g === 'inocentes' ? 'Ganan los inocentes' : g === 'asesinos' ? 'Ganan los asesinos' : 'Fin'),
        rol ? h('p', { class: 'as-aviso' }, gano ? '¡Tu equipo ganó!' : 'Tu equipo perdió esta vez.') : null,
        h('div', { class: 'as-sub' }, 'Los personajes de todos'),
        filas.length ? filas.map((f) => h('div', { class: 'as-accion-fila' + (f.vivo ? '' : ' fantasma'), }, h('span', {}, (f.vivo ? '' : '👻 ') + f.nick),
          h('span', { class: 'as-chip rol-' + (R.DESCRIPCION_ROL[f.rol]?.equipo ?? 'x') }, R.DESCRIPCION_ROL[f.rol]?.nombre ?? f.rol))) : h('p', { class: 'as-muted' }, 'Cargando la revelación…'));
    }

    function pintar() {
      relojes.splice(0).forEach((f) => f());
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
        if (pub.fase === R.FASES.INTERROGATORIOS) cuerpo.append(tarjetaInterrogatorios(yoVivo));
        if (pub.fase === R.FASES.VOTACION) { const c = tarjetaVotacion(yoVivo); if (c) cuerpo.append(c); }
        if (pub.fase === R.FASES.RESULTADO_VOTACION) { const c = tarjetaResultadoVotacion(); if (c) cuerpo.append(c); }
        if (pub.fase === R.FASES.FINALIZADA) cuerpo.append(tarjetaFinal());
        if (pub.fase === R.FASES.DESCUBRIMIENTO) {
          const priv = yoVivo ? tarjetaResultadoPrivado() : null;
          if (priv) cuerpo.append(priv);
        }
        cuerpo.append(tarjetaRol());
        if (pub.fase === R.FASES.ROLES) {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Esperá la señal del conductor: pronto empieza la noche.')));
        } else if (pub.fase === R.FASES.DESCUBRIMIENTO) {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Escuchá el anuncio del conductor y esperá a que dé la señal para seguir.')));
        } else if (pub.fase === R.FASES.RESULTADO_VOTACION) {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Escuchá al conductor: enseguida sigue la partida.')));
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
