// games/asesino.js
// Pantalla del jugador de «El asesino está entre nosotros» — Etapa 2:
// ver la invitación, marcar "listo", y ver (en privado) el personaje y el equipo cuando se reparten los roles.
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
    const cuerpo = h('div');
    raiz.append(cuerpo);

    limpiar.push(D.escucharPublico(b, pid, (v) => { pub = v; pintar(); }, (e) => { vaciar(cuerpo); cuerpo.append(tarjeta('No se pudo cargar', h('p', { class: 'as-error' }, mensajeDeError(e)))); }));
    limpiar.push(D.escucharMiListo(b, pid, uid, (v) => { listo = v; pintar(); }));
    limpiar.push(D.escucharMiRol(b, pid, uid, (v) => { rol = v; pintar(); }));
    limpiar.push(D.escucharMiEquipo(b, pid, uid, (v) => { equipo = v; pintar(); }));

    async function alternarListo() {
      try { await D.marcarListo(b, pid, uid, !listo); } catch (e) { toast(mensajeDeError(e)); }
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

    function pintar() {
      vaciar(cuerpo);
      if (pub === undefined) { cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Cargando la partida…'))); return; }
      if (!pub) { cuerpo.append(tarjeta('Partida', h('p', { class: 'as-error' }, 'No se encontró la partida.'))); return; }
      const yo = pub.jugadores?.[uid];
      const vivos = Object.values(pub.jugadores || {});

      cuerpo.append(h('div', { class: 'as-card' },
        h('div', { class: 'as-resumen' },
          h('div', {}, h('div', { class: 'as-card-label' }, 'Partida'), h('div', { class: 'as-resumen-nombre' }, pub.nombre)),
          h('span', { class: 'as-chip ' + pub.fase }, R.ETIQUETA_FASE[pub.fase] || pub.fase)),
        pub.anuncio ? h('p', { class: 'as-anuncio' }, pub.anuncio) : null));

      if (yo && yo.vivo === false) {
        cuerpo.append(h('div', { class: 'as-fantasma' }, h('strong', {}, '👻 Sos un fantasma. '), 'Podés escuchar, pero no hablar, votar ni revelar información.'));
      }

      if (pub.fase === R.FASES.PREPARACION) {
        cuerpo.append(tarjeta('Preparación',
          h('p', {}, 'El conductor va a iniciar la partida cuando todos estén listos. Los roles se reparten al azar y son secretos.'),
          h('div', { class: 'as-acciones centrado' }, h('button', { type: 'button', class: 'as-btn' + (listo ? ' ok' : ''), onClick: alternarListo }, listo ? '✔ Estoy listo (tocá para desmarcar)' : 'Estoy listo'))));
      } else if (pub.fase === R.FASES.CANCELADA) {
        cuerpo.append(tarjeta('Partida cancelada', h('p', { class: 'as-muted' }, 'El conductor canceló esta partida.')));
      } else {
        cuerpo.append(tarjetaRol());
        if (pub.fase !== R.FASES.ROLES) {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, `La partida está en «${R.ETIQUETA_FASE[pub.fase] || pub.fase}». Esta versión todavía no muestra esa fase en tu pantalla: seguí las instrucciones del conductor por audio.`)));
        } else {
          cuerpo.append(tarjeta(null, h('p', { class: 'as-muted' }, 'Esperá la señal del conductor: pronto empieza la noche.')));
        }
      }

      cuerpo.append(tarjeta(`Jugadores (${vivos.length})`, h('div', { class: 'as-chips' }, Object.values(pub.jugadores || {}).sort((x, y) => x.nick.localeCompare(y.nick, 'es', { sensitivity: 'base' }))
        .map((j) => h('span', { class: 'as-chip nick' + (j.vivo ? '' : ' fantasma') }, (j.vivo ? '' : '👻 ') + j.nick)))));
      if (puedeVolver) cuerpo.append(h('div', { class: 'as-acciones centrado' }, h('button', { type: 'button', class: 'as-btn sec small', onClick: arrancar }, '← Mis partidas')));
    }
    pintar();
  }

  await arrancar();
  return { arrancar };
}
