// ============================================================
//  El Burdel — Mundial 2026 — Lógica principal
//  Vanilla JS + Firebase Realtime Database
// ============================================================

import { auth, db } from '../js/firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  ref, onValue, set, get, update
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── Datos del torneo ────────────────────────────────────────
const ADMIN_UID = 'rRE0YhtRhqNvGWGFDkcbhNIwvOz1';

const GRUPOS = {
  A: { equipos: ['MEX','RSA','KOR','CZE'] },
  B: { equipos: ['CAN','BIH','QAT','SUI'] },
  C: { equipos: ['BRA','MAR','HAI','SCO'] },
  D: { equipos: ['USA','PAR','AUS','TUR'] },
  E: { equipos: ['GER','CUW','CIV','ECU'] },
  F: { equipos: ['NED','JPN','SWE','TUN'] },
  G: { equipos: ['BEL','EGY','IRN','NZL'] },
  H: { equipos: ['ESP','CPV','KSA','URU'] },
  I: { equipos: ['FRA','SEN','IRQ','NOR'] },
  J: { equipos: ['ARG','ALG','AUT','JOR'] },
  K: { equipos: ['POR','COD','UZB','COL'] },
  L: { equipos: ['ENG','CRO','GHA','PAN'] },
};

const EQUIPOS = {
  MEX:{ nombre:'México',            bandera:'🇲🇽' },
  RSA:{ nombre:'Sudáfrica',         bandera:'🇿🇦' },
  KOR:{ nombre:'Corea del Sur',     bandera:'🇰🇷' },
  CZE:{ nombre:'Rep. Checa',        bandera:'🇨🇿' },
  CAN:{ nombre:'Canadá',            bandera:'🇨🇦' },
  BIH:{ nombre:'Bosnia y Herz.',    bandera:'🇧🇦' },
  QAT:{ nombre:'Catar',             bandera:'🇶🇦' },
  SUI:{ nombre:'Suiza',             bandera:'🇨🇭' },
  BRA:{ nombre:'Brasil',            bandera:'🇧🇷' },
  MAR:{ nombre:'Marruecos',         bandera:'🇲🇦' },
  HAI:{ nombre:'Haití',             bandera:'🇭🇹' },
  SCO:{ nombre:'Escocia',           bandera:'🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  USA:{ nombre:'EE. UU.',           bandera:'🇺🇸' },
  PAR:{ nombre:'Paraguay',          bandera:'🇵🇾' },
  AUS:{ nombre:'Australia',         bandera:'🇦🇺' },
  TUR:{ nombre:'Turquía',           bandera:'🇹🇷' },
  GER:{ nombre:'Alemania',          bandera:'🇩🇪' },
  CUW:{ nombre:'Curazao',           bandera:'🇨🇼' },
  CIV:{ nombre:'Costa de Marfil',   bandera:'🇨🇮' },
  ECU:{ nombre:'Ecuador',           bandera:'🇪🇨' },
  NED:{ nombre:'Países Bajos',      bandera:'🇳🇱' },
  JPN:{ nombre:'Japón',             bandera:'🇯🇵' },
  SWE:{ nombre:'Suecia',            bandera:'🇸🇪' },
  TUN:{ nombre:'Túnez',             bandera:'🇹🇳' },
  BEL:{ nombre:'Bélgica',           bandera:'🇧🇪' },
  EGY:{ nombre:'Egipto',            bandera:'🇪🇬' },
  IRN:{ nombre:'RI de Irán',        bandera:'🇮🇷' },
  NZL:{ nombre:'Nueva Zelanda',     bandera:'🇳🇿' },
  ESP:{ nombre:'España',            bandera:'🇪🇸' },
  CPV:{ nombre:'Cabo Verde',        bandera:'🇨🇻' },
  KSA:{ nombre:'Arabia Saudí',      bandera:'🇸🇦' },
  URU:{ nombre:'Uruguay',           bandera:'🇺🇾' },
  FRA:{ nombre:'Francia',           bandera:'🇫🇷' },
  SEN:{ nombre:'Senegal',           bandera:'🇸🇳' },
  IRQ:{ nombre:'Irak',              bandera:'🇮🇶' },
  NOR:{ nombre:'Noruega',           bandera:'🇳🇴' },
  ARG:{ nombre:'Argentina',         bandera:'🇦🇷' },
  ALG:{ nombre:'Argelia',           bandera:'🇩🇿' },
  AUT:{ nombre:'Austria',           bandera:'🇦🇹' },
  JOR:{ nombre:'Jordania',          bandera:'🇯🇴' },
  POR:{ nombre:'Portugal',          bandera:'🇵🇹' },
  COD:{ nombre:'RD Congo',          bandera:'🇨🇩' },
  UZB:{ nombre:'Uzbekistán',        bandera:'🇺🇿' },
  COL:{ nombre:'Colombia',          bandera:'🇨🇴' },
  ENG:{ nombre:'Inglaterra',        bandera:'🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  CRO:{ nombre:'Croacia',           bandera:'🇭🇷' },
  GHA:{ nombre:'Ghana',             bandera:'🇬🇭' },
  PAN:{ nombre:'Panamá',            bandera:'🇵🇦' },
};

// Partidos de fase de grupos
const PARTIDOS = [
  // ─ Jornada 1 ─
  { id:'gA1', grupo:'A', local:'MEX', vis:'RSA',  j:1 },
  { id:'gA2', grupo:'A', local:'KOR', vis:'CZE',  j:1 },
  { id:'gB1', grupo:'B', local:'CAN', vis:'BIH',  j:1 },
  { id:'gB2', grupo:'B', local:'QAT', vis:'SUI',  j:1 },
  { id:'gC1', grupo:'C', local:'BRA', vis:'MAR',  j:1 },
  { id:'gC2', grupo:'C', local:'HAI', vis:'SCO',  j:1 },
  { id:'gD1', grupo:'D', local:'USA', vis:'PAR',  j:1 },
  { id:'gD2', grupo:'D', local:'AUS', vis:'TUR',  j:1 },
  { id:'gE1', grupo:'E', local:'GER', vis:'CUW',  j:1 },
  { id:'gE2', grupo:'E', local:'CIV', vis:'ECU',  j:1 },
  { id:'gF1', grupo:'F', local:'NED', vis:'JPN',  j:1 },
  { id:'gF2', grupo:'F', local:'SWE', vis:'TUN',  j:1 },
  { id:'gG1', grupo:'G', local:'BEL', vis:'EGY',  j:1 },
  { id:'gG2', grupo:'G', local:'IRN', vis:'NZL',  j:1 },
  { id:'gH1', grupo:'H', local:'ESP', vis:'CPV',  j:1 },
  { id:'gH2', grupo:'H', local:'KSA', vis:'URU',  j:1 },
  { id:'gI1', grupo:'I', local:'FRA', vis:'SEN',  j:1 },
  { id:'gI2', grupo:'I', local:'IRQ', vis:'NOR',  j:1 },
  { id:'gJ1', grupo:'J', local:'ARG', vis:'ALG',  j:1 },
  { id:'gJ2', grupo:'J', local:'AUT', vis:'JOR',  j:1 },
  { id:'gK1', grupo:'K', local:'POR', vis:'COD',  j:1 },
  { id:'gK2', grupo:'K', local:'UZB', vis:'COL',  j:1 },
  { id:'gL1', grupo:'L', local:'ENG', vis:'CRO',  j:1 },
  { id:'gL2', grupo:'L', local:'GHA', vis:'PAN',  j:1 },
  // ─ Jornada 2 ─
  { id:'gA3', grupo:'A', local:'CZE', vis:'RSA',  j:2 },
  { id:'gA4', grupo:'A', local:'MEX', vis:'KOR',  j:2 },
  { id:'gB3', grupo:'B', local:'SUI', vis:'BIH',  j:2 },
  { id:'gB4', grupo:'B', local:'CAN', vis:'QAT',  j:2 },
  { id:'gC3', grupo:'C', local:'SCO', vis:'MAR',  j:2 },
  { id:'gC4', grupo:'C', local:'BRA', vis:'HAI',  j:2 },
  { id:'gD3', grupo:'D', local:'USA', vis:'AUS',  j:2 },
  { id:'gD4', grupo:'D', local:'TUR', vis:'PAR',  j:2 },
  { id:'gE3', grupo:'E', local:'GER', vis:'CIV',  j:2 },
  { id:'gE4', grupo:'E', local:'ECU', vis:'CUW',  j:2 },
  { id:'gF3', grupo:'F', local:'NED', vis:'SWE',  j:2 },
  { id:'gF4', grupo:'F', local:'JPN', vis:'TUN',  j:2 },
  { id:'gG3', grupo:'G', local:'BEL', vis:'IRN',  j:2 },
  { id:'gG4', grupo:'G', local:'NZL', vis:'EGY',  j:2 },
  { id:'gH3', grupo:'H', local:'ESP', vis:'KSA',  j:2 },
  { id:'gH4', grupo:'H', local:'URU', vis:'CPV',  j:2 },
  { id:'gI3', grupo:'I', local:'FRA', vis:'IRQ',  j:2 },
  { id:'gI4', grupo:'I', local:'NOR', vis:'SEN',  j:2 },
  { id:'gJ3', grupo:'J', local:'ARG', vis:'AUT',  j:2 },
  { id:'gJ4', grupo:'J', local:'JOR', vis:'ALG',  j:2 },
  { id:'gK3', grupo:'K', local:'POR', vis:'UZB',  j:2 },
  { id:'gK4', grupo:'K', local:'COL', vis:'COD',  j:2 },
  { id:'gL3', grupo:'L', local:'ENG', vis:'GHA',  j:2 },
  { id:'gL4', grupo:'L', local:'PAN', vis:'CRO',  j:2 },
  // ─ Jornada 3 ─
  { id:'gA5', grupo:'A', local:'RSA', vis:'KOR',  j:3 },
  { id:'gA6', grupo:'A', local:'CZE', vis:'MEX',  j:3 },
  { id:'gB5', grupo:'B', local:'SUI', vis:'CAN',  j:3 },
  { id:'gB6', grupo:'B', local:'BIH', vis:'QAT',  j:3 },
  { id:'gC5', grupo:'C', local:'MAR', vis:'HAI',  j:3 },
  { id:'gC6', grupo:'C', local:'BRA', vis:'SCO',  j:3 },
  { id:'gD5', grupo:'D', local:'PAR', vis:'AUS',  j:3 },
  { id:'gD6', grupo:'D', local:'TUR', vis:'USA',  j:3 },
  { id:'gE5', grupo:'E', local:'CUW', vis:'CIV',  j:3 },
  { id:'gE6', grupo:'E', local:'ECU', vis:'GER',  j:3 },
  { id:'gF5', grupo:'F', local:'JPN', vis:'SWE',  j:3 },
  { id:'gF6', grupo:'F', local:'TUN', vis:'NED',  j:3 },
  { id:'gG5', grupo:'G', local:'CPV', vis:'KSA',  j:3 },
  { id:'gG6', grupo:'G', local:'URU', vis:'ESP',  j:3 },
  { id:'gH5', grupo:'H', local:'EGY', vis:'IRN',  j:3 },
  { id:'gH6', grupo:'H', local:'NZL', vis:'BEL',  j:3 },
  { id:'gI5', grupo:'I', local:'NOR', vis:'FRA',  j:3 },
  { id:'gI6', grupo:'I', local:'SEN', vis:'IRQ',  j:3 },
  { id:'gJ5', grupo:'J', local:'ALG', vis:'AUT',  j:3 },
  { id:'gJ6', grupo:'J', local:'JOR', vis:'ARG',  j:3 },
  { id:'gK5', grupo:'K', local:'COL', vis:'POR',  j:3 },
  { id:'gK6', grupo:'K', local:'COD', vis:'UZB',  j:3 },
  { id:'gL5', grupo:'L', local:'CRO', vis:'GHA',  j:3 },
  { id:'gL6', grupo:'L', local:'PAN', vis:'ENG',  j:3 },
];

// Partidos de playoffs (nombre de slots según posición final de grupo)
const PLAYOFFS = [
  // 16avos
  { id:'p73',  ronda:'16avos', slot1:'2A',       slot2:'2B'      },
  { id:'p74',  ronda:'16avos', slot1:'1E',        slot2:'3mejor'  },
  { id:'p75',  ronda:'16avos', slot1:'1F',        slot2:'2C'      },
  { id:'p76',  ronda:'16avos', slot1:'1E',        slot2:'2F'      },
  { id:'p77',  ronda:'16avos', slot1:'1I',        slot2:'3mejor'  },
  { id:'p78',  ronda:'16avos', slot1:'2E',        slot2:'2I'      },
  { id:'p79',  ronda:'16avos', slot1:'1A',        slot2:'3mejor'  },
  { id:'p80',  ronda:'16avos', slot1:'1L',        slot2:'3mejor'  },
  { id:'p81',  ronda:'16avos', slot1:'1D',        slot2:'3mejor'  },
  { id:'p82',  ronda:'16avos', slot1:'1G',        slot2:'3mejor'  },
  { id:'p83',  ronda:'16avos', slot1:'2K',        slot2:'2L'      },
  { id:'p84',  ronda:'16avos', slot1:'1H',        slot2:'2J'      },
  { id:'p85',  ronda:'16avos', slot1:'1B',        slot2:'3mejor'  },
  { id:'p86',  ronda:'16avos', slot1:'1J',        slot2:'2H'      },
  { id:'p87',  ronda:'16avos', slot1:'1K',        slot2:'3mejor'  },
  { id:'p88',  ronda:'16avos', slot1:'2D',        slot2:'2G'      },
  // Octavos
  { id:'p89', ronda:'Octavos',  cruceA:'p74', cruceB:'p77' },
  { id:'p90', ronda:'Octavos',  cruceA:'p73', cruceB:'p75' },
  { id:'p91', ronda:'Octavos',  cruceA:'p76', cruceB:'p78' },
  { id:'p92', ronda:'Octavos',  cruceA:'p79', cruceB:'p80' },
  { id:'p93', ronda:'Octavos',  cruceA:'p83', cruceB:'p84' },
  { id:'p94', ronda:'Octavos',  cruceA:'p81', cruceB:'p82' },
  { id:'p95', ronda:'Octavos',  cruceA:'p86', cruceB:'p88' },
  { id:'p96', ronda:'Octavos',  cruceA:'p85', cruceB:'p87' },
  // Cuartos
  { id:'p97',  ronda:'Cuartos', cruceA:'p89', cruceB:'p90' },
  { id:'p98',  ronda:'Cuartos', cruceA:'p93', cruceB:'p94' },
  { id:'p99',  ronda:'Cuartos', cruceA:'p91', cruceB:'p92' },
  { id:'p100', ronda:'Cuartos', cruceA:'p95', cruceB:'p96' },
  // Semis
  { id:'p101', ronda:'Semis',   cruceA:'p97',  cruceB:'p98'  },
  { id:'p102', ronda:'Semis',   cruceA:'p99',  cruceB:'p100' },
  // 3er puesto
  { id:'p103', ronda:'3er Puesto', cruceA:'p101', cruceB:'p102', perdedor:true },
  // Final
  { id:'p104', ronda:'Final',   cruceA:'p101', cruceB:'p102' },
];

// ── Estado global ────────────────────────────────────────────
let currentUser   = null;
let isAdmin       = false;
let resultados    = {};   // resultados[partidoId] = {local, vis, oficial}
let votos         = {};   // votos[partidoId]      = {local:N, empate:N, vis:N}
let misVotos      = {};   // misVotos[partidoId]   = 'local'|'empate'|'vis'
let grupoActivo   = 'A';
let tabActiva     = 'grupos';
let adminPartidoSel = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initGruposNav();
  renderGrupoActivo();

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      isAdmin = user.uid === ADMIN_UID;
      if (isAdmin) mostrarAdminFab();
      await cargarMisVotos();
    }
    suscribirseResultados();
    suscribirseVotos();
  });
});

// ── Tabs ─────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.mundial-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tabActiva = btn.dataset.tab;
      document.querySelectorAll('.mundial-tab').forEach(b => b.classList.toggle('active', b===btn));
      document.querySelectorAll('.mundial-section').forEach(s => {
        s.classList.toggle('active', s.id === 'sec-' + tabActiva);
      });
      if (tabActiva === 'bracket') renderBracket();
      if (tabActiva === 'terceros') renderTerceros();
    });
  });
}

// ── Grupos nav ───────────────────────────────────────────────
function initGruposNav() {
  const nav = document.getElementById('grupos-nav');
  if (!nav) return;
  Object.keys(GRUPOS).forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'grupo-btn' + (g === grupoActivo ? ' active' : '');
    btn.textContent = g;
    btn.addEventListener('click', () => {
      grupoActivo = g;
      nav.querySelectorAll('.grupo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrupoActivo();
    });
    nav.appendChild(btn);
  });
}

// ── Firebase: suscripciones ──────────────────────────────────
function suscribirseResultados() {
  onValue(ref(db, 'mundial/resultados'), snap => {
    resultados = snap.val() || {};
    renderGrupoActivo();
    if (tabActiva === 'bracket') renderBracket();
    if (tabActiva === 'terceros') renderTerceros();
  });
}

function suscribirseVotos() {
  onValue(ref(db, 'mundial/votos'), snap => {
    votos = snap.val() || {};
    renderGrupoActivo();
  });
}

async function cargarMisVotos() {
  if (!currentUser) return;
  const snap = await get(ref(db, `mundial/misvotos/${currentUser.uid}`));
  misVotos = snap.val() || {};
}

// ── Cálculo de tabla de posiciones ──────────────────────────
function calcularTabla(grupoId) {
  const equips = GRUPOS[grupoId].equipos;
  const tabla = {};
  equips.forEach(id => {
    tabla[id] = { id, pj:0, g:0, e:0, p:0, gf:0, gc:0, dg:0, pts:0 };
  });

  PARTIDOS.filter(p => p.grupo === grupoId).forEach(p => {
    const r = resultados[p.id];
    if (!r || r.gLocal == null) return;
    const { gLocal, gVis } = r;
    const tL = tabla[p.local];
    const tV = tabla[p.vis];
    if (!tL || !tV) return;

    tL.pj++; tV.pj++;
    tL.gf += gLocal; tL.gc += gVis;
    tV.gf += gVis;  tV.gc += gLocal;
    tL.dg = tL.gf - tL.gc;
    tV.dg = tV.gf - tV.gc;

    if (gLocal > gVis)      { tL.g++; tL.pts+=3; tV.p++; }
    else if (gLocal < gVis) { tV.g++; tV.pts+=3; tL.p++; }
    else                    { tL.e++; tL.pts++;  tV.e++; tV.pts++; }
  });

  return Object.values(tabla).sort((a,b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg  !== a.dg)  return b.dg  - a.dg;
    return b.gf - a.gf;
  });
}

// ── Cálculo de mejores terceros ──────────────────────────────
function calcularMejoresTerceros() {
  const terceros = [];
  Object.keys(GRUPOS).forEach(g => {
    const tabla = calcularTabla(g);
    if (tabla.length >= 3) {
      const t = { ...tabla[2], grupo: g };
      terceros.push(t);
    }
  });
  terceros.sort((a,b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg  !== a.dg)  return b.dg  - a.dg;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    return a.id.localeCompare(b.id);
  });
  return terceros;
}

// ── Render principal de grupo ────────────────────────────────
function renderGrupoActivo() {
  renderTabla(grupoActivo);
  renderPartidosGrupo(grupoActivo);
}

// ── Render tabla de posiciones ───────────────────────────────
function renderTabla(grupoId) {
  const cont = document.getElementById('tabla-cont');
  if (!cont) return;
  const tabla = calcularTabla(grupoId);

  cont.innerHTML = `
    <div class="tabla-card">
      <div class="tabla-header">
        <span class="tabla-header-titulo">GRUPO ${grupoId}</span>
      </div>
      <table class="tabla-table">
        <thead>
          <tr>
            <th style="text-align:left;padding-left:14px">Equipo</th>
            <th>PJ</th><th>G</th><th>E</th><th>P</th>
            <th>GF</th><th>GC</th><th>DG</th><th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${tabla.map((eq, i) => {
            let cls = '';
            if (i === 0) cls = 'clasificado-1';
            else if (i === 1) cls = 'clasificado-2';
            else if (i === 2) cls = 'clasificado-3';
            else cls = 'eliminado';
            const e = EQUIPOS[eq.id];
            return `
              <tr class="${cls}">
                <td>
                  <div class="equipo-cell">
                    <span class="eq-pos">${i+1}</span>
                    <span class="eq-bandera">${e?.bandera||'🏳️'}</span>
                    <span class="eq-nombre">${e?.nombre||eq.id}</span>
                  </div>
                </td>
                <td>${eq.pj}</td>
                <td>${eq.g}</td>
                <td>${eq.e}</td>
                <td>${eq.p}</td>
                <td>${eq.gf}</td>
                <td>${eq.gc}</td>
                <td>${eq.dg >= 0 ? '+' : ''}${eq.dg}</td>
                <td class="pts-cell">${eq.pts}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Render partidos del grupo ────────────────────────────────
function renderPartidosGrupo(grupoId) {
  const cont = document.getElementById('partidos-cont');
  if (!cont) return;
  const partidos = PARTIDOS.filter(p => p.grupo === grupoId);

  let html = `<div class="partidos-card"><div class="partidos-header">PARTIDOS — GRUPO ${grupoId}</div>`;

  [1,2,3].forEach(j => {
    const pts = partidos.filter(p => p.j === j);
    if (!pts.length) return;
    html += `<div class="jornada-label">Jornada ${j}</div>`;
    pts.forEach(p => { html += renderPartidoCard(p); });
  });

  html += '</div>';
  cont.innerHTML = html;

  // Eventos de votos
  cont.querySelectorAll('.voto-btn').forEach(btn => {
    btn.addEventListener('click', () => votar(btn.dataset.pid, btn.dataset.tipo));
  });
}

// ── Card de partido ──────────────────────────────────────────
function renderPartidoCard(p) {
  const r   = resultados[p.id] || {};
  const vp  = votos[p.id]     || { local:0, empate:0, vis:0 };
  const mv  = misVotos[p.id]  || null;
  const eL  = EQUIPOS[p.local];
  const eV  = EQUIPOS[p.vis];
  const oficial = r.gLocal != null;

  const totalVotos = (vp.local||0) + (vp.empate||0) + (vp.vis||0);
  const pctL = totalVotos ? Math.round((vp.local||0)/totalVotos*100) : 0;
  const pctE = totalVotos ? Math.round((vp.empate||0)/totalVotos*100) : 0;
  const pctV = totalVotos ? Math.round((vp.vis||0)/totalVotos*100) : 0;

  const scoreLocal = oficial ? r.gLocal : '<span class="score-num pendiente">–</span>';
  const scoreVis   = oficial ? r.gVis   : '<span class="score-num pendiente">–</span>';

  const estadoBadge = oficial
    ? `<span class="partido-estado-badge oficial"><span class="badge-dot"></span>Resultado oficial</span>`
    : `<span class="partido-estado-badge pendiente">⏳ Pendiente</span>`;

  // Barras de votos (siempre visibles si hay votos)
  const barrasHtml = totalVotos > 0 ? `
    <div class="voto-barras">
      <div class="voto-barra-row">
        <span class="voto-barra-label">${eL?.nombre||p.local}</span>
        <div class="voto-barra-track"><div class="voto-barra-fill local" style="width:${pctL}%"></div></div>
        <span class="voto-barra-pct">${pctL}%</span>
      </div>
      <div class="voto-barra-row">
        <span class="voto-barra-label">Empate</span>
        <div class="voto-barra-track"><div class="voto-barra-fill empate" style="width:${pctE}%"></div></div>
        <span class="voto-barra-pct">${pctE}%</span>
      </div>
      <div class="voto-barra-row">
        <span class="voto-barra-label">${eV?.nombre||p.vis}</span>
        <div class="voto-barra-track"><div class="voto-barra-fill visitante" style="width:${pctV}%"></div></div>
        <span class="voto-barra-pct">${pctV}%</span>
      </div>
      <div class="voto-total">${totalVotos} voto${totalVotos!==1?'s':''}</div>
    </div>` : '';

  // Resultado oficial diferenciado
  const ofBox = oficial ? `
    <div class="resultado-oficial-box">
      <span class="resultado-oficial-icon">✅</span>
      <span class="resultado-oficial-texto">
        <strong>${eL?.nombre||p.local} ${r.gLocal} — ${r.gVis} ${eV?.nombre||p.vis}</strong>
      </span>
    </div>` : '';

  // Botones de voto (sólo si no hay resultado oficial y el usuario está logueado)
  const botonesVoto = !oficial && currentUser ? `
    <div class="voto-section">
      <div class="voto-label">🗳 Tu pronóstico</div>
      <div class="voto-btns">
        <button class="voto-btn ${mv==='local'?'seleccionado':''} ${mv?'':''}${mv&&mv!=='local'?'':''}}"
          data-pid="${p.id}" data-tipo="local" ${mv?'disabled':''}>
          ${eL?.bandera||'🏳️'} ${eL?.nombre||p.local}
        </button>
        <button class="voto-btn ${mv==='empate'?'seleccionado':''}"
          data-pid="${p.id}" data-tipo="empate" ${mv?'disabled':''}>🤝 Empate</button>
        <button class="voto-btn ${mv==='vis'?'seleccionado':''}"
          data-pid="${p.id}" data-tipo="vis" ${mv?'disabled':''}>
          ${eV?.nombre||p.vis} ${eV?.bandera||'🏳️'}
        </button>
      </div>
    </div>` : '';

  return `
    <div class="partido-card" id="pcard-${p.id}">
      ${estadoBadge}
      <div class="partido-equipos">
        <div class="partido-equipo">
          <span class="partido-bandera">${eL?.bandera||'🏳️'}</span>
          <span class="partido-nombre">${eL?.nombre||p.local}</span>
        </div>
        <div class="partido-score-box">
          ${oficial
            ? `<span class="score-num">${r.gLocal}</span><span class="score-sep">:</span><span class="score-num">${r.gVis}</span>`
            : `<span class="score-num pendiente">vs</span>`
          }
        </div>
        <div class="partido-equipo visitante">
          <span class="partido-bandera">${eV?.bandera||'🏳️'}</span>
          <span class="partido-nombre">${eV?.nombre||p.vis}</span>
        </div>
      </div>
      ${ofBox}
      ${barrasHtml}
      ${botonesVoto}
    </div>`;
}

// ── Votar ────────────────────────────────────────────────────
async function votar(partidoId, tipo) {
  if (!currentUser) { toast('Inicia sesión para votar'); return; }
  if (misVotos[partidoId]) { toast('Ya votaste en este partido'); return; }
  if (resultados[partidoId]?.gLocal != null) { toast('El partido ya tiene resultado oficial'); return; }

  misVotos[partidoId] = tipo;

  // Guardar mi voto
  await set(ref(db, `mundial/misvotos/${currentUser.uid}/${partidoId}`), tipo);

  // Sumar al contador
  const vRef = ref(db, `mundial/votos/${partidoId}/${tipo}`);
  const snap = await get(vRef);
  await set(vRef, (snap.val() || 0) + 1);

  renderGrupoActivo();
  toast('¡Voto registrado!');
}

// ── Render mejores terceros ──────────────────────────────────
function renderTerceros() {
  const cont = document.getElementById('terceros-cont');
  if (!cont) return;
  const terceros = calcularMejoresTerceros();

  let html = `
    <div style="margin-bottom:16px">
      <p style="color:var(--crema-3);font-size:13px;line-height:1.7">
        Clasifican los <strong style="color:var(--dorado-claro)">8 mejores terceros</strong> 
        de los 12 grupos (ordenados por puntos, diferencia de gol y goles a favor).
      </p>
    </div>
    <div class="terceros-grid">`;

  terceros.forEach((eq, i) => {
    const clasifica = i < 8;
    const e = EQUIPOS[eq.id];
    html += `
      <div class="tercero-card ${clasifica ? 'clasifica' : 'elimina'}">
        <div class="tercero-rank">${i+1}</div>
        <div class="tercero-info">
          <div class="tercero-equipo">
            <span>${e?.bandera||'🏳️'}</span>
            <span>${e?.nombre||eq.id}</span>
            <span style="font-size:11px;color:var(--crema-3)">(Gr. ${eq.grupo})</span>
          </div>
          <div class="tercero-stats">${eq.pts} pts · DG ${eq.dg>=0?'+':''}${eq.dg} · GF ${eq.gf}</div>
        </div>
        <span class="tercero-badge ${clasifica ? 'pasa' : 'fuera'}">${clasifica ? 'PASA' : 'FUERA'}</span>
      </div>`;
  });

  html += '</div>';
  cont.innerHTML = html;
}

// ── Render Bracket ───────────────────────────────────────────
function renderBracket() {
  const cont = document.getElementById('bracket-cont');
  if (!cont) return;

  const rondas = ['16avos','Octavos','Cuartos','Semis','Final'];
  // Agrupar la final y el tercer puesto
  const extras = PLAYOFFS.filter(p => p.ronda === '3er Puesto');

  let html = '<div class="bracket-scroll"><div class="bracket-grid">';

  rondas.forEach(ronda => {
    const partidos = PLAYOFFS.filter(p => p.ronda === ronda);
    if (!partidos.length) return;

    html += `<div class="bracket-ronda">
      <div class="bracket-ronda-title">${ronda}</div>`;

    partidos.forEach(p => {
      html += renderBracketPartido(p);
    });
    html += '</div>';
  });

  // Tercer puesto
  if (extras.length) {
    html += `<div class="bracket-ronda">
      <div class="bracket-ronda-title">3° Puesto</div>`;
    extras.forEach(p => { html += renderBracketPartido(p); });
    html += '</div>';
  }

  html += '</div></div>';
  cont.innerHTML = html;

  // Eventos admin en bracket
  if (isAdmin) {
    cont.querySelectorAll('.bracket-partido').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        adminPartidoSel = PLAYOFFS.find(p => p.id === card.dataset.pid);
        if (adminPartidoSel) abrirAdminPanelPlayoff(adminPartidoSel);
      });
    });
  }
}

function renderBracketPartido(p) {
  const r = resultados[p.id] || {};
  const tieneRes = r.g1 != null;

  // Resolver equipos desde slots o cruces anteriores
  let eq1 = resolverSlot(p.slot1 || p.cruceA, p.perdedor);
  let eq2 = resolverSlot(p.slot2 || p.cruceB, p.perdedor);

  const e1 = EQUIPOS[eq1];
  const e2 = EQUIPOS[eq2];

  const slot1Html = eq1
    ? `<div class="bracket-slot ${tieneRes ? (r.ganador===eq1 ? 'ganador':'perdedor') : ''}">
        <span class="bracket-bandera">${e1?.bandera||'🏳️'}</span>
        <span class="bracket-nombre">${e1?.nombre||eq1}</span>
        ${tieneRes ? `<span class="bracket-goles">${r.g1}</span>` : ''}
      </div>`
    : `<div class="bracket-slot-tbd">Por definir</div>`;

  const slot2Html = eq2
    ? `<div class="bracket-slot ${tieneRes ? (r.ganador===eq2 ? 'ganador':'perdedor') : ''}">
        <span class="bracket-bandera">${e2?.bandera||'🏳️'}</span>
        <span class="bracket-nombre">${e2?.nombre||eq2}</span>
        ${tieneRes ? `<span class="bracket-goles">${r.g2}</span>` : ''}
      </div>`
    : `<div class="bracket-slot-tbd">Por definir</div>`;

  return `
    <div class="bracket-partido ${tieneRes ? 'tiene-resultado' : ''}" data-pid="${p.id}">
      ${slot1Html}
      <div class="bracket-sep"></div>
      ${slot2Html}
    </div>`;
}

// Resuelve qué equipo ocupa un slot en el bracket
function resolverSlot(slotKey, esPerdedor) {
  if (!slotKey) return null;

  // Slots de grupo: '1A', '2B', '3mejor' (los mejores terceros)
  const matchGrupo = slotKey.match(/^([123])([A-L])$/);
  if (matchGrupo) {
    const pos   = parseInt(matchGrupo[1]) - 1;
    const grupo = matchGrupo[2];
    const tabla = calcularTabla(grupo);
    return tabla[pos]?.id || null;
  }

  // Es una referencia a un partido anterior
  const r = resultados[slotKey];
  if (!r) return null;
  return esPerdedor ? r.perdedor : r.ganador;
}

// ── Admin: FAB y panel ───────────────────────────────────────
function mostrarAdminFab() {
  const fab = document.getElementById('admin-fab');
  if (fab) fab.classList.remove('hidden');
}

window.abrirAdminPanel = function() {
  document.getElementById('admin-panel').classList.add('open');
  poblarSelectorPartidos();
};

window.cerrarAdminPanel = function() {
  document.getElementById('admin-panel').classList.remove('open');
};

function poblarSelectorPartidos() {
  const sel = document.getElementById('admin-partido-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Elegí un partido —</option>';

  // Grupos primero
  PARTIDOS.forEach(p => {
    const eL = EQUIPOS[p.local];
    const eV = EQUIPOS[p.vis];
    const r  = resultados[p.id];
    const ok = r?.gLocal != null ? ' ✅' : '';
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `[Gr. ${p.grupo} J${p.j}] ${eL?.nombre||p.local} vs ${eV?.nombre||p.vis}${ok}`;
    sel.appendChild(opt);
  });

  // Playoffs
  PLAYOFFS.forEach(p => {
    const r = resultados[p.id];
    const ok = r?.g1 != null ? ' ✅' : '';
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `[${p.ronda}] ${p.id}${ok}`;
    sel.appendChild(opt);
  });
}

function abrirAdminPanelPlayoff(p) {
  document.getElementById('admin-panel').classList.add('open');
  const sel = document.getElementById('admin-partido-sel');
  poblarSelectorPartidos();
  setTimeout(() => {
    sel.value = p.id;
    sel.dispatchEvent(new Event('change'));
  }, 50);
}

// Cuando cambia el selector de partido
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('admin-partido-sel');
  if (!sel) return;

  sel.addEventListener('change', () => {
    const pid = sel.value;
    const formCont = document.getElementById('admin-form-cont');
    if (!pid || !formCont) { if(formCont) formCont.innerHTML=''; return; }

    const partido = PARTIDOS.find(p => p.id === pid) || PLAYOFFS.find(p => p.id === pid);
    if (!partido) return;

    const esGrupo = !!partido.grupo;

    if (esGrupo) {
      const eL = EQUIPOS[partido.local];
      const eV = EQUIPOS[partido.vis];
      const r  = resultados[pid] || {};

      formCont.innerHTML = `
        <div class="resultado-form">
          <div class="resultado-form-title">⚽ Resultado Oficial</div>
          <div class="resultado-form-row">
            <span class="resultado-form-equipo">${eL?.bandera||'🏳️'} ${eL?.nombre||partido.local}</span>
            <input type="number" id="admin-gl" min="0" max="30" value="${r.gLocal??''}" placeholder="0">
            <span style="color:var(--crema-3);font-size:20px">—</span>
            <input type="number" id="admin-gv" min="0" max="30" value="${r.gVis??''}" placeholder="0">
            <span class="resultado-form-equipo" style="flex-direction:row-reverse">${eV?.nombre||partido.vis} ${eV?.bandera||'🏳️'}</span>
          </div>
          <button class="btn-confirmar" onclick="confirmarResultadoGrupo('${pid}','${partido.local}','${partido.vis}')">
            CONFIRMAR RESULTADO
          </button>
          ${r.gLocal!=null ? `<button class="btn-reset-partido" onclick="resetarResultado('${pid}')">🗑 Borrar resultado</button>` : ''}
        </div>`;
    } else {
      // Partido de playoff
      const eq1 = resolverSlot(partido.slot1 || partido.cruceA);
      const eq2 = resolverSlot(partido.slot2 || partido.cruceB);
      const e1  = EQUIPOS[eq1];
      const e2  = EQUIPOS[eq2];
      const r   = resultados[pid] || {};

      if (!eq1 || !eq2) {
        formCont.innerHTML = `<p style="color:var(--crema-3);font-size:13px">⏳ Los equipos de este partido aún no están definidos.</p>`;
        return;
      }

      formCont.innerHTML = `
        <div class="resultado-form">
          <div class="resultado-form-title">⚽ Resultado Playoff</div>
          <div class="resultado-form-row">
            <span class="resultado-form-equipo">${e1?.bandera||'🏳️'} ${e1?.nombre||eq1}</span>
            <input type="number" id="admin-g1" min="0" max="30" value="${r.g1??''}" placeholder="0">
            <span style="color:var(--crema-3);font-size:20px">—</span>
            <input type="number" id="admin-g2" min="0" max="30" value="${r.g2??''}" placeholder="0">
            <span class="resultado-form-equipo" style="flex-direction:row-reverse">${e2?.nombre||eq2} ${e2?.bandera||'🏳️'}</span>
          </div>
          <button class="btn-confirmar" onclick="confirmarResultadoPlayoff('${pid}','${eq1}','${eq2}')">
            CONFIRMAR RESULTADO
          </button>
          ${r.g1!=null ? `<button class="btn-reset-partido" onclick="resetarResultado('${pid}')">🗑 Borrar resultado</button>` : ''}
        </div>`;
    }
  });
});

// Confirmar resultado de grupo
window.confirmarResultadoGrupo = async function(pid, localId, visId) {
  const gl = parseInt(document.getElementById('admin-gl').value);
  const gv = parseInt(document.getElementById('admin-gv').value);
  if (isNaN(gl) || isNaN(gv) || gl < 0 || gv < 0) { toast('Ingresá goles válidos'); return; }

  const ganador = gl > gv ? localId : gv > gl ? visId : null;
  await set(ref(db, `mundial/resultados/${pid}`), {
    gLocal: gl, gVis: gv, ganador, ts: Date.now()
  });
  toast('✅ Resultado guardado');
  document.getElementById('admin-partido-sel').dispatchEvent(new Event('change'));
};

// Confirmar resultado de playoff
window.confirmarResultadoPlayoff = async function(pid, eq1Id, eq2Id) {
  const g1 = parseInt(document.getElementById('admin-g1').value);
  const g2 = parseInt(document.getElementById('admin-g2').value);
  if (isNaN(g1) || isNaN(g2) || g1 < 0 || g2 < 0) { toast('Ingresá goles válidos'); return; }

  const ganador  = g1 > g2 ? eq1Id : g2 > g1 ? eq2Id : null;
  const perdedor = g1 > g2 ? eq2Id : g2 > g1 ? eq1Id : null;
  if (!ganador) { toast('No puede haber empate en playoff'); return; }

  await set(ref(db, `mundial/resultados/${pid}`), {
    g1, g2, ganador, perdedor, ts: Date.now()
  });
  toast('✅ Resultado playoff guardado');
  document.getElementById('admin-partido-sel').dispatchEvent(new Event('change'));
};

// Resetear resultado
window.resetarResultado = async function(pid) {
  if (!confirm('¿Borrar resultado?')) return;
  await set(ref(db, `mundial/resultados/${pid}`), null);
  toast('Resultado eliminado');
  document.getElementById('admin-partido-sel').dispatchEvent(new Event('change'));
};

// Reset torneo completo
window.resetarTorneo = async function() {
  if (!confirm('⚠️ ¿Resetear TODO el torneo? Se borran resultados y votos.')) return;
  await set(ref(db, 'mundial'), null);
  resultados = {}; votos = {}; misVotos = {};
  toast('Torneo reseteado');
  renderGrupoActivo();
};

// ── Toast ────────────────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('mundial-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
