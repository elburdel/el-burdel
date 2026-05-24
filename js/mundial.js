// mundial.js — Fixture Mundial 2026 con Pronósticos Grupales
// ============================================================
// Estructura Firebase:
//   mundial/partidos/{id} → { local, visitante, grupo, jornada, estado, prediccion, real, votacionAbierta }
//   mundial/votos/{partidoId}/{uid} → { local: N, visitante: N, ts }
//   mundial/config → { fase }   (grupos | playoffs | terminado)
//
// Flujo:
//   1. Admin abre votación de un partido → users votan su marcador
//   2. Admin cierra votación → se revela el resultado más votado (prediccion)
//   3. Cuando el partido real se juega → admin carga resultado real
//   4. Ambos se muestran lado a lado

import { auth, db } from "./firebase-init.js";
import { onSession, getUserData, ADMIN_UID } from "./auth.js";
import {
  ref, get, set, update, onValue, push, remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ─────────────────────────────────────────
// DATOS ESTÁTICOS DEL FIXTURE
// ─────────────────────────────────────────

// Todas las banderas usan imágenes vía flagcdn.com para garantizar
// renderizado uniforme en PC y móvil (los emojis de subdivisión como
// Escocia/Inglaterra no renderizan en Windows/PC).
const BANDERAS_IMG = {
  "México":               "mx",
  "Sudáfrica":            "za",
  "República de Corea":   "kr",
  "Chequia":              "cz",
  "Canadá":               "ca",
  "Bosnia y Herzegovina": "ba",
  "Catar":                "qa",
  "Suiza":                "ch",
  "Brasil":               "br",
  "Marruecos":            "ma",
  "Haití":                "ht",
  "Escocia":              "gb-sct",
  "EE. UU.":              "us",
  "Paraguay":             "py",
  "Australia":            "au",
  "Turquía":              "tr",
  "Alemania":             "de",
  "Curazao":              "cw",
  "Costa de Marfil":      "ci",
  "Ecuador":              "ec",
  "Países Bajos":         "nl",
  "Japón":                "jp",
  "Suecia":               "se",
  "Túnez":                "tn",
  "Bélgica":              "be",
  "Egipto":               "eg",
  "RI de Irán":           "ir",
  "Nueva Zelanda":        "nz",
  "España":               "es",
  "Islas de Cabo Verde":  "cv",
  "Arabia Saudí":         "sa",
  "Uruguay":              "uy",
  "Francia":              "fr",
  "Senegal":              "sn",
  "Irak":                 "iq",
  "Noruega":              "no",
  "Argentina":            "ar",
  "Argelia":              "dz",
  "Austria":              "at",
  "Jordania":             "jo",
  "Portugal":             "pt",
  "RD Congo":             "cd",
  "Uzbekistán":           "uz",
  "Colombia":             "co",
  "Inglaterra":           "gb-eng",
  "Croacia":              "hr",
  "Ghana":                "gh",
  "Panamá":               "pa",
};

function bandera(eq) {
  const code = BANDERAS_IMG[eq];
  if (code) {
    return `<img src="https://flagcdn.com/24x18/${code}.png" alt="${eq}" style="width:24px;height:18px;object-fit:cover;border-radius:2px;vertical-align:middle;" />`;
  }
  return "🏳";
}

const GRUPOS_DATA = {
  A: ["México", "Sudáfrica", "República de Corea", "Chequia"],
  B: ["Canadá", "Bosnia y Herzegovina", "Catar", "Suiza"],
  C: ["Brasil", "Marruecos", "Haití", "Escocia"],
  D: ["EE. UU.", "Paraguay", "Australia", "Turquía"],
  E: ["Alemania", "Curazao", "Costa de Marfil", "Ecuador"],
  F: ["Países Bajos", "Japón", "Suecia", "Túnez"],
  G: ["Bélgica", "Egipto", "RI de Irán", "Nueva Zelanda"],
  H: ["España", "Islas de Cabo Verde", "Arabia Saudí", "Uruguay"],
  I: ["Francia", "Senegal", "Irak", "Noruega"],
  J: ["Argentina", "Argelia", "Austria", "Jordania"],
  K: ["Portugal", "RD Congo", "Uzbekistán", "Colombia"],
  L: ["Inglaterra", "Croacia", "Ghana", "Panamá"],
};

// Fixture completo: [local, visitante, grupo, jornada]
const FIXTURE_BASE = [
  // Jornada 1
  ["México","Sudáfrica","A",1], ["República de Corea","Chequia","A",1],
  ["Canadá","Bosnia y Herzegovina","B",1], ["EE. UU.","Paraguay","D",1],
  ["Catar","Suiza","B",1], ["Brasil","Marruecos","C",1],
  ["Haití","Escocia","C",1], ["Australia","Turquía","D",1],
  ["Alemania","Curazao","E",1], ["Países Bajos","Japón","F",1],
  ["Costa de Marfil","Ecuador","E",1], ["Suecia","Túnez","F",1],
  ["España","Islas de Cabo Verde","H",1], ["Bélgica","Egipto","G",1],
  ["Arabia Saudí","Uruguay","H",1], ["RI de Irán","Nueva Zelanda","G",1],
  ["Francia","Senegal","I",1], ["Irak","Noruega","I",1],
  ["Argentina","Argelia","J",1], ["Austria","Jordania","J",1],
  ["Portugal","RD Congo","K",1], ["Inglaterra","Croacia","L",1],
  ["Ghana","Panamá","L",1], ["Uzbekistán","Colombia","K",1],
  // Jornada 2
  ["Chequia","Sudáfrica","A",2], ["Suiza","Bosnia y Herzegovina","B",2],
  ["Canadá","Catar","B",2], ["México","República de Corea","A",2],
  ["EE. UU.","Australia","D",2], ["Escocia","Marruecos","C",2],
  ["Brasil","Haití","C",2], ["Turquía","Paraguay","D",2],
  ["Países Bajos","Suecia","F",2], ["Alemania","Costa de Marfil","E",2],
  ["Ecuador","Curazao","E",2], ["Túnez","Japón","F",2],
  ["España","Arabia Saudí","H",2], ["Bélgica","RI de Irán","G",2],
  ["Uruguay","Islas de Cabo Verde","H",2], ["Nueva Zelanda","Egipto","G",2],
  ["Argentina","Austria","J",2], ["Francia","Irak","I",2],
  ["Noruega","Senegal","I",2], ["Jordania","Argelia","J",2],
  ["Portugal","Uzbekistán","K",2], ["Inglaterra","Ghana","L",2],
  ["Panamá","Croacia","L",2], ["Colombia","RD Congo","K",2],
  // Jornada 3
  ["Suiza","Canadá","B",3], ["Bosnia y Herzegovina","Catar","B",3],
  ["Marruecos","Haití","C",3], ["Brasil","Escocia","C",3],
  ["Sudáfrica","República de Corea","A",3], ["Chequia","México","A",3],
  ["Curazao","Costa de Marfil","E",3], ["Ecuador","Alemania","E",3],
  ["Japón","Suecia","F",3], ["Túnez","Países Bajos","F",3],
  ["Paraguay","Australia","D",3], ["Turquía","EE. UU.","D",3],
  ["Noruega","Francia","I",3], ["Senegal","Irak","I",3],
  ["Islas de Cabo Verde","Arabia Saudí","H",3], ["Uruguay","España","H",3],
  ["Egipto","RI de Irán","G",3], ["Nueva Zelanda","Bélgica","G",3],
  ["Croacia","Ghana","L",3], ["Panamá","Inglaterra","L",3],
  ["Colombia","Portugal","K",3], ["RD Congo","Uzbekistán","K",3],
  ["Argelia","Austria","J",3], ["Jordania","Argentina","J",3],
];

// Partidos de playoffs (se completan dinámicamente)
const PLAYOFFS_TEMPLATE = [
  // 16avos (partidos 73-88)
  {id:"P73", ronda:"16avos", label:"2º Grupo A vs 2º Grupo B"},
  {id:"P74", ronda:"16avos", label:"1º Grupo E vs 3º A/B/C/D/F"},
  {id:"P75", ronda:"16avos", label:"1º Grupo F vs 2º Grupo C"},
  {id:"P76", ronda:"16avos", label:"1º Grupo E vs 2º Grupo F"},
  {id:"P77", ronda:"16avos", label:"1º Grupo I vs 3º C/D/F/G/H"},
  {id:"P78", ronda:"16avos", label:"2º Grupo E vs 2º Grupo I"},
  {id:"P79", ronda:"16avos", label:"1º Grupo A vs 3º C/E/F/H/I"},
  {id:"P80", ronda:"16avos", label:"1º Grupo L vs 3º E/H/I/J/K"},
  {id:"P81", ronda:"16avos", label:"1º Grupo D vs 3º B/E/F/I/J"},
  {id:"P82", ronda:"16avos", label:"1º Grupo G vs 3º A/E/H/I/J"},
  {id:"P83", ronda:"16avos", label:"2º Grupo K vs 2º Grupo L"},
  {id:"P84", ronda:"16avos", label:"1º Grupo H vs 2º Grupo J"},
  {id:"P85", ronda:"16avos", label:"1º Grupo B vs 3º E/F/G/I/J"},
  {id:"P86", ronda:"16avos", label:"1º Grupo J vs 2º Grupo H"},
  {id:"P87", ronda:"16avos", label:"1º Grupo K vs 3º D/E/I/J/L"},
  {id:"P88", ronda:"16avos", label:"2º Grupo D vs 2º Grupo G"},
  // Octavos (89-96)
  {id:"P89", ronda:"Octavos", label:"G.P74 vs G.P77"},
  {id:"P90", ronda:"Octavos", label:"G.P73 vs G.P75"},
  {id:"P91", ronda:"Octavos", label:"G.P76 vs G.P78"},
  {id:"P92", ronda:"Octavos", label:"G.P79 vs G.P80"},
  {id:"P93", ronda:"Octavos", label:"G.P83 vs G.P84"},
  {id:"P94", ronda:"Octavos", label:"G.P81 vs G.P82"},
  {id:"P95", ronda:"Octavos", label:"G.P86 vs G.P88"},
  {id:"P96", ronda:"Octavos", label:"G.P85 vs G.P87"},
  // Cuartos (97-100)
  {id:"P97", ronda:"Cuartos", label:"G.P89 vs G.P90"},
  {id:"P98", ronda:"Cuartos", label:"G.P93 vs G.P94"},
  {id:"P99", ronda:"Cuartos", label:"G.P91 vs G.P92"},
  {id:"P100", ronda:"Cuartos", label:"G.P95 vs G.P96"},
  // Semis (101-102)
  {id:"P101", ronda:"Semifinales", label:"G.P97 vs G.P98"},
  {id:"P102", ronda:"Semifinales", label:"G.P99 vs G.P100"},
  // 3er puesto
  {id:"P103", ronda:"3er Puesto", label:"Perdedor P101 vs Perdedor P102"},
  // Final
  {id:"P104", ronda:"Final", label:"G.P101 vs G.P102"},
];

// ─────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────

let currentUser = null;
let isAdmin = false;
let grupoActivo = "A";
let tabActiva = "grupos";
let partidosData = {};  // snapshot de Firebase
let votosData = {};     // votos del partido actual abierto

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────

onSession(async (user) => {
  if (!user) { window.location.href = "/el-burdel/login.html"; return; }
  const data = await getUserData(user.uid);
  if (!data || data.status !== "active") { window.location.href = "/el-burdel/pending.html"; return; }
  currentUser = user;
  isAdmin = (user.uid === ADMIN_UID);

  if (isAdmin) {
    document.getElementById("admin-fab")?.classList.remove("hidden");
  }

  iniciarListener();
  setupTabs();
  setupGrupoNav();
});

// ─────────────────────────────────────────
// LISTENER FIREBASE (tiempo real)
// ─────────────────────────────────────────

function iniciarListener() {
  onValue(ref(db, "mundial/partidos"), (snap) => {
    partidosData = snap.val() || {};
    renderVista();
    if (isAdmin) {
      // Si el panel está abierto, restaurar selección actual para no
      // interrumpir al admin mientras edita un partido
      const panelAbierto = document.getElementById("admin-panel")?.classList.contains("open");
      const sel = document.getElementById("admin-partido-sel");
      const valorActual = panelAbierto ? sel?.value : null;
      actualizarSelectAdmin();
      if (valorActual && sel) sel.value = valorActual;
    }
  });
}

// ─────────────────────────────────────────
// TABS
// ─────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll(".mundial-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mundial-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".mundial-section").forEach(s => s.classList.remove("active"));
      btn.classList.add("active");
      tabActiva = btn.dataset.tab;
      document.getElementById(`sec-${tabActiva}`)?.classList.add("active");
      renderVista();
    });
  });
}

// ─────────────────────────────────────────
// RENDER PRINCIPAL
// ─────────────────────────────────────────

function renderVista() {
  if (tabActiva === "grupos") renderGrupos();
  else if (tabActiva === "terceros") renderTerceros();
  else if (tabActiva === "bracket") renderBracket();
}

// ─────────────────────────────────────────
// SELECTOR DE GRUPOS
// ─────────────────────────────────────────

function setupGrupoNav() {
  const nav = document.getElementById("grupos-nav");
  if (!nav) return;
  nav.innerHTML = Object.keys(GRUPOS_DATA).map(g =>
    `<button class="grupo-btn${g === grupoActivo ? " active" : ""}" data-grupo="${g}">${g}</button>`
  ).join("");
  nav.querySelectorAll(".grupo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      grupoActivo = btn.dataset.grupo;
      nav.querySelectorAll(".grupo-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderGrupos();
    });
  });
}

// ─────────────────────────────────────────
// RENDER GRUPOS
// ─────────────────────────────────────────

function renderGrupos() {
  const tablaCont = document.getElementById("tabla-cont");
  const partidosCont = document.getElementById("partidos-cont");
  if (!tablaCont || !partidosCont) return;

  const equipos = GRUPOS_DATA[grupoActivo];
  const stats = calcularStats(grupoActivo);
  const partidosGrupo = getPartidosDeGrupo(grupoActivo);

  tablaCont.innerHTML = renderTabla(grupoActivo, equipos, stats);
  partidosCont.innerHTML = renderPartidosGrupo(partidosGrupo);

  // Event listeners de votos
  partidosCont.querySelectorAll(".btn-votar").forEach(btn => {
    btn.addEventListener("click", () => abrirModalVoto(btn.dataset.id));
  });
}

// ─────────────────────────────────────────
// CALCULAR STATS DE GRUPO
// ─────────────────────────────────────────

function calcularStats(grupo) {
  const equipos = GRUPOS_DATA[grupo];
  const stats = {};
  equipos.forEach(eq => {
    stats[eq] = { pj:0, g:0, e:0, p:0, gf:0, gc:0 };
  });

  Object.values(partidosData).forEach(p => {
    if (p.grupo !== grupo) return;
    // Usar resultado real si existe, si no prediccion
    const res = p.real || p.prediccion;
    if (!res || res.localGoles === undefined) return;
    const gl = res.localGoles, gv = res.visitanteGoles;
    if (!(p.local in stats) || !(p.visitante in stats)) return;
    stats[p.local].pj++;  stats[p.visitante].pj++;
    stats[p.local].gf += gl; stats[p.local].gc += gv;
    stats[p.visitante].gf += gv; stats[p.visitante].gc += gl;
    if (gl > gv) { stats[p.local].g++; stats[p.visitante].p++; }
    else if (gl < gv) { stats[p.visitante].g++; stats[p.local].p++; }
    else { stats[p.local].e++; stats[p.visitante].e++; }
  });

  return equipos.sort((a, b) => {
    const pa = stats[a], pb = stats[b];
    const ptA = pa.g*3 + pa.e, ptB = pb.g*3 + pb.e;
    if (ptA !== ptB) return ptB - ptA;
    const dgA = pa.gf - pa.gc, dgB = pb.gf - pb.gc;
    if (dgA !== dgB) return dgB - dgA;
    return pb.gf - pa.gf;
  }).map((eq, i) => ({ eq, pos: i+1, ...stats[eq], pts: stats[eq].g*3 + stats[eq].e, dg: stats[eq].gf - stats[eq].gc }));
}

// ─────────────────────────────────────────
// RENDER TABLA DE POSICIONES
// ─────────────────────────────────────────

function renderTabla(grupo, equipos, statsOrdenados) {
  const rows = statsOrdenados.map((s, i) => {
    let cls = "";
    if (i === 0 || i === 1) cls = "clasificado-1";
    else if (i === 2) cls = "clasificado-3";
    else cls = "eliminado";

    return `<tr class="${cls}">
      <td>
        <div class="equipo-cell">
          <span class="eq-pos">${s.pos}</span>
          <span class="eq-bandera">${bandera(s.eq)}</span>
          <span class="eq-nombre">${s.eq}</span>
        </div>
      </td>
      <td>${s.pj}</td>
      <td class="col-g">${s.g}</td>
      <td class="col-e">${s.e}</td>
      <td class="col-p">${s.p}</td>
      <td class="col-gf">${s.gf}</td>
      <td class="col-gc">${s.gc}</td>
      <td>${s.dg > 0 ? "+" : ""}${s.dg}</td>
      <td class="pts-cell">${s.pts}</td>
    </tr>`;
  }).join("");

  return `<div class="tabla-card">
    <div class="tabla-header">
      <span class="tabla-header-titulo">GRUPO ${grupo}</span>
    </div>
    <table class="tabla-table">
      <thead>
        <tr>
          <th style="text-align:left;padding-left:14px">Equipo</th>
          <th>PJ</th><th class="col-g">G</th><th class="col-e">E</th><th class="col-p">P</th>
          <th class="col-gf">GF</th><th class="col-gc">GC</th><th>DG</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ─────────────────────────────────────────
// OBTENER PARTIDOS DE UN GRUPO
// ─────────────────────────────────────────

function getPartidosDeGrupo(grupo) {
  return FIXTURE_BASE
    .filter(([,, g]) => g === grupo)
    .map(([local, visitante, g, jornada]) => {
      const id = makePartidoId(local, visitante);
      return { id, local, visitante, grupo: g, jornada, ...(partidosData[id] || {}) };
    });
}

function makePartidoId(local, visitante) {
  return `${local.replace(/\s/g,"_")}_vs_${visitante.replace(/\s/g,"_")}`;
}

// ─────────────────────────────────────────
// RENDER LISTA DE PARTIDOS DE UN GRUPO
// ─────────────────────────────────────────

function renderPartidosGrupo(partidos) {
  const porJornada = {};
  partidos.forEach(p => {
    if (!porJornada[p.jornada]) porJornada[p.jornada] = [];
    porJornada[p.jornada].push(p);
  });

  return `<div class="partidos-card">
    <div class="partidos-header">PARTIDOS</div>
    ${Object.entries(porJornada).map(([j, ps]) => `
      <div class="jornada-label">Jornada ${j}</div>
      ${ps.map(p => renderPartidoCard(p)).join("")}
    `).join("")}
  </div>`;
}

// ─────────────────────────────────────────
// RENDER CARD DE UN PARTIDO
// ─────────────────────────────────────────

function renderPartidoCard(p) {
  const tienePrediccion = p.prediccion && p.prediccion.localGoles !== undefined;
  const tieneReal = p.real && p.real.localGoles !== undefined;
  const votacionAbierta = p.votacionAbierta === true;
  const yaVote = p.miVoto; // se setea localmente luego

  // Score display
  const scorePrediccion = tienePrediccion
    ? `<span class="score-num">${p.prediccion.localGoles}</span><span class="score-sep">—</span><span class="score-num">${p.prediccion.visitanteGoles}</span>`
    : `<span class="score-num pendiente">?</span><span class="score-sep">:</span><span class="score-num pendiente">?</span>`;

  const scoreReal = tieneReal
    ? `<span class="score-num" style="color:var(--mund-verde)">${p.real.localGoles}</span><span class="score-sep">—</span><span class="score-num" style="color:var(--mund-verde)">${p.real.visitanteGoles}</span>`
    : null;

  // Badge estado
  let badgeHtml = "";
  if (tieneReal) {
    badgeHtml = `<span class="partido-estado-badge oficial"><span class="badge-dot"></span>RESULTADO OFICIAL</span>`;
  } else if (tienePrediccion) {
    badgeHtml = `<span class="partido-estado-badge" style="background:rgba(200,150,0,0.1);color:var(--dorado);border:1px solid rgba(200,150,0,0.25)">🔮 PRONÓSTICO DEL GRUPO</span>`;
  } else if (votacionAbierta) {
    badgeHtml = `<span class="partido-estado-badge" style="background:rgba(80,160,255,0.1);color:#64b5f6;border:1px solid rgba(80,160,255,0.25)"><span style="width:6px;height:6px;border-radius:50%;background:#64b5f6;display:inline-block;animation:pulse-verde 1.2s infinite"></span> VOTACIÓN ABIERTA</span>`;
  } else {
    badgeHtml = `<span class="partido-estado-badge pendiente">PENDIENTE</span>`;
  }

  // Sección de votación
  let votoHtml = "";
  if (votacionAbierta && currentUser) {
    // Verificar si ya votó (se checkea en loadMiVoto async pero renderizamos lo que sabemos)
    votoHtml = `
      <div class="voto-section" id="voto-${p.id}">
        <div class="voto-label">📊 Tu pronóstico — escribí el marcador</div>
        <div class="voto-input-row">
          <span class="voto-equipo-mini">${bandera(p.local)} ${p.local}</span>
          <input type="number" min="0" max="20" value="0" class="voto-score-input" id="voto-local-${p.id}" />
          <span style="color:var(--crema-3);font-size:18px">—</span>
          <input type="number" min="0" max="20" value="0" class="voto-score-input" id="voto-visit-${p.id}" />
          <span class="voto-equipo-mini">${bandera(p.visitante)} ${p.visitante}</span>
        </div>
        <button class="btn-votar" data-id="${p.id}" style="margin-top:8px">Confirmar voto</button>
      </div>`;
  } else if (tienePrediccion && !tieneReal) {
    // Mostrar distribución de votos
    votoHtml = renderDistribucionVotos(p);
  }

  // Si hay prediccion Y real, mostrar comparación
  let comparacionHtml = "";
  if (tienePrediccion && tieneReal) {
    comparacionHtml = `
      <div class="comparacion-row">
        <div class="comp-item">
          <span class="comp-label">Pronóstico del grupo</span>
          <span class="comp-score">${p.prediccion.localGoles}–${p.prediccion.visitanteGoles}</span>
        </div>
        <div class="comp-sep">vs</div>
        <div class="comp-item">
          <span class="comp-label">Resultado real</span>
          <span class="comp-score" style="color:var(--mund-verde)">${p.real.localGoles}–${p.real.visitanteGoles}</span>
        </div>
      </div>`;
  }

  return `<div class="partido-card">
    ${badgeHtml}
    <div class="partido-equipos">
      <div class="partido-equipo local">
        <span class="partido-bandera">${bandera(p.local)}</span>
        <span class="partido-nombre">${p.local}</span>
      </div>
      <div class="partido-score-box">
        ${tieneReal ? scoreReal : scorePrediccion}
      </div>
      <div class="partido-equipo visitante">
        <span class="partido-bandera">${bandera(p.visitante)}</span>
        <span class="partido-nombre">${p.visitante}</span>
      </div>
    </div>
    ${comparacionHtml}
    ${votoHtml}
  </div>`;
}

// ─────────────────────────────────────────
// DISTRIBUCIÓN DE VOTOS (post-cierre)
// ─────────────────────────────────────────

function renderDistribucionVotos(p) {
  if (!p.votos) return "";
  const votos = Object.values(p.votos);
  if (votos.length === 0) return "";

  // Agrupar por resultado
  const conteo = {};
  votos.forEach(v => {
    const k = `${v.localGoles}-${v.visitanteGoles}`;
    conteo[k] = (conteo[k] || 0) + 1;
  });

  const total = votos.length;
  const sorted = Object.entries(conteo).sort((a,b) => b[1]-a[1]).slice(0,5);

  const bars = sorted.map(([marcador, cant]) => {
    const pct = Math.round(cant/total*100);
    const [gl, gv] = marcador.split("-");
    const isMasVotado = marcador === `${p.prediccion?.localGoles}-${p.prediccion?.visitanteGoles}`;
    return `<div class="voto-barra-row">
      <span class="voto-barra-label" style="${isMasVotado?"color:var(--dorado-claro);font-weight:600":""}">${gl}–${gv}${isMasVotado?" 🏆":""}</span>
      <div class="voto-barra-track">
        <div class="voto-barra-fill local" style="width:${pct}%"></div>
      </div>
      <span class="voto-barra-pct">${pct}%</span>
    </div>`;
  }).join("");

  return `<div class="voto-barras">
    <div class="voto-label">Distribución de pronósticos</div>
    ${bars}
    <div class="voto-total">${total} voto${total!==1?"s":""}</div>
  </div>`;
}

// ─────────────────────────────────────────
// VOTAR
// ─────────────────────────────────────────

async function abrirModalVoto(partidoId) {
  if (!currentUser) return;
  const localGoles = parseInt(document.getElementById(`voto-local-${partidoId}`)?.value || 0);
  const visitanteGoles = parseInt(document.getElementById(`voto-visit-${partidoId}`)?.value || 0);

  try {
    await set(ref(db, `mundial/votos/${partidoId}/${currentUser.uid}`), {
      localGoles, visitanteGoles, ts: Date.now()
    });
    mostrarToast("¡Voto registrado! 🔮");
  } catch(e) {
    mostrarToast("Error al votar: " + e.message, true);
  }
}

// ─────────────────────────────────────────
// RENDER MEJORES TERCEROS
// ─────────────────────────────────────────

// Pools de rivales permitidos para cada líder de grupo (Anexo C FIFA)
const POOLS_TERCEROS = {
  A: ["C","E","F","H","I"],
  B: ["E","F","G","I","J"],
  D: ["B","E","F","I","J"],
  E: ["A","B","C","D","F"],
  G: ["A","E","H","I","J"],
  I: ["C","D","F","G","H"],
  K: ["D","E","I","J","L"],
  L: ["E","H","I","J","K"],
};

// Calcula los terceros clasificados y sus cruces usando la matriz FIFA
function calcularTerceros() {
  const terceros = [];
  Object.keys(GRUPOS_DATA).forEach(grupo => {
    const stats = calcularStats(grupo);
    const tercero = stats[2];
    if (tercero && tercero.pj > 0) {
      terceros.push({ grupo, ...tercero });
    }
  });

  // Ordenar por criterios FIFA: pts → dg → gf → fair play (sin data → sorteo)
  terceros.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg  !== a.dg)  return b.dg  - a.dg;
    return b.gf - a.gf;
  });

  return terceros;
}

// Asigna los cruces de los 8 mejores terceros contra los líderes
// usando las reglas hard-coded y los pools del Anexo C FIFA
function asignarCrucesTerceros(clasificados) {
  // clasificados: array de { grupo, eq, ... } de los 8 mejores terceros
  const grupos = clasificados.map(t => t.grupo);
  const asignacion = {}; // grupoLider → grupoTercero

  // Reglas hard-coded de alta probabilidad
  if (grupos.includes("K") && grupos.includes("L")) {
    asignacion["L"] = "K";
    asignacion["K"] = "L";
  } else if (grupos.includes("K")) {
    asignacion["L"] = "K";
  } else if (grupos.includes("L")) {
    asignacion["K"] = "L";
  }

  if (grupos.includes("B") && !asignacion["D"]) asignacion["D"] = "B";
  if (grupos.includes("A") && !asignacion["G"]) asignacion["G"] = "A";

  // Para los líderes sin asignar, aplicar pools
  const lideresLibres = ["A","B","D","E","G","I","K","L"].filter(g => !asignacion[g]);
  const tercerosLibres = grupos.filter(g => !Object.values(asignacion).includes(g));

  // Asignación greedy: para cada líder libre, buscar un tercero compatible
  for (const lider of lideresLibres) {
    const pool = POOLS_TERCEROS[lider] || [];
    const candidatos = tercerosLibres.filter(g => pool.includes(g) && !Object.values(asignacion).includes(g));
    if (candidatos.length > 0) {
      asignacion[lider] = candidatos[0];
      tercerosLibres.splice(tercerosLibres.indexOf(candidatos[0]), 1);
    }
  }

  // Cualquier tercero restante sin asignar (por edge cases): asignar al primer líder libre
  const sinAsignar = tercerosLibres.filter(g => !Object.values(asignacion).includes(g));
  const lideresSinCubrir = lideresLibres.filter(g => !asignacion[g]);
  sinAsignar.forEach((g, i) => {
    if (lideresSinCubrir[i]) asignacion[lideresSinCubrir[i]] = g;
  });

  return asignacion;
}

function renderTerceros() {
  const cont = document.getElementById("terceros-cont");
  if (!cont) return;

  const terceros = calcularTerceros();

  if (terceros.length === 0) {
    cont.innerHTML = `<p style="color:var(--crema-3);font-size:13px;padding:20px 0">Los mejores terceros aparecerán cuando avance la fase de grupos.</p>`;
    return;
  }

  const clasificados = terceros.slice(0, 8);
  const eliminados   = terceros.slice(8);
  const cruces = terceros.length >= 8 ? asignarCrucesTerceros(clasificados) : {};

  // Map grupoTercero → grupoLider para mostrar el cruce en la card
  const tercerosACruce = {};
  Object.entries(cruces).forEach(([lider, tercero]) => {
    tercerosACruce[tercero] = lider;
  });

  const htmlClasif = clasificados.map((t, i) => {
    const liderAsig = tercerosACruce[t.grupo];
    const cruceHtml = liderAsig
      ? `<div class="tercero-cruce">→ 16avos vs 1º Grupo ${liderAsig}</div>`
      : `<div class="tercero-cruce">→ cruce por determinar</div>`;
    return `<div class="tercero-card clasifica">
      <div class="tercero-rank">${i+1}</div>
      <div class="tercero-info">
        <div class="tercero-equipo">${bandera(t.eq)} ${t.eq}</div>
        <div class="tercero-stats">Grupo ${t.grupo} · ${t.pts} pts · DG ${t.dg>0?"+":""}${t.dg} · ${t.gf} GF</div>
        ${cruceHtml}
      </div>
      <span class="tercero-badge pasa">CLASIFICA</span>
    </div>`;
  }).join("");

  const htmlElim = eliminados.map((t, i) => `
    <div class="tercero-card elimina">
      <div class="tercero-rank">${8+i+1}</div>
      <div class="tercero-info">
        <div class="tercero-equipo">${bandera(t.eq)} ${t.eq}</div>
        <div class="tercero-stats">Grupo ${t.grupo} · ${t.pts} pts · DG ${t.dg>0?"+":""}${t.dg} · ${t.gf} GF</div>
      </div>
      <span class="tercero-badge fuera">FUERA</span>
    </div>`).join("");

  const notaCruces = terceros.length >= 8
    ? `<div style="font-size:11px;color:var(--crema-3);margin-bottom:16px;line-height:1.5">
        Los cruces se calculan según el Anexo C de FIFA (pools de rivales permitidos).
        Se actualizan automáticamente con los resultados reales o predicciones.
       </div>`
    : "";

  cont.innerHTML = `
    <div style="font-size:12px;color:var(--crema-3);letter-spacing:1px;margin-bottom:8px">
      Los 8 mejores terceros clasifican a 16avos de final
    </div>
    ${notaCruces}
    <div class="terceros-grid">${htmlClasif}${htmlElim}</div>`;
}

// ─────────────────────────────────────────
// RENDER BRACKET
// ─────────────────────────────────────────

function renderBracket() {
  const cont = document.getElementById("bracket-cont");
  if (!cont) return;

  const rondas = ["16avos", "Octavos", "Cuartos", "Semifinales", "Final"];
  const ronda3er = "3er Puesto";

  const html = `<div class="bracket-scroll">
    <div class="bracket-grid">
      ${rondas.map(ronda => {
        const partidos = PLAYOFFS_TEMPLATE.filter(p => p.ronda === ronda);
        return `<div class="bracket-ronda">
          <div class="bracket-ronda-title">${ronda}</div>
          ${partidos.map(p => {
            const datos = partidosData[p.id] || {};
            const res = datos.real || datos.prediccion;
            const tieneEquipos = datos.local && datos.visitante;
            return `<div class="bracket-partido ${res?"tiene-resultado":""}">
              ${tieneEquipos ? `
                <div class="bracket-slot ${res&&res.localGoles>res.visitanteGoles?"ganador":res?"perdedor":""}">
                  <span class="bracket-bandera">${bandera(datos.local)}</span>
                  <span class="bracket-nombre">${datos.local}</span>
                  ${res?`<span class="bracket-goles">${res.localGoles}</span>`:""}
                </div>
                <div class="bracket-sep"></div>
                <div class="bracket-slot ${res&&res.visitanteGoles>res.localGoles?"ganador":res?"perdedor":""}">
                  <span class="bracket-bandera">${bandera(datos.visitante)}</span>
                  <span class="bracket-nombre">${datos.visitante}</span>
                  ${res?`<span class="bracket-goles">${res.visitanteGoles}</span>`:""}
                </div>
              ` : `<div class="bracket-slot-tbd">${p.label}</div>`}
            </div>`;
          }).join("")}
        </div>`;
      }).join("")}
    </div>
    ${renderPartido3erPuesto()}
  </div>`;

  cont.innerHTML = html;
}

function renderPartido3erPuesto() {
  const p = PLAYOFFS_TEMPLATE.find(p => p.ronda === "3er Puesto");
  const datos = partidosData["P103"] || {};
  const res = datos.real || datos.prediccion;

  return `<div style="margin-top:24px">
    <div class="bracket-ronda-title" style="text-align:center;margin-bottom:12px">3er Puesto</div>
    <div style="max-width:240px;margin:0 auto">
      <div class="bracket-partido ${res?"tiene-resultado":""}">
        ${datos.local ? `
          <div class="bracket-slot">${bandera(datos.local)} ${datos.local} ${res?res.localGoles:""}</div>
          <div class="bracket-sep"></div>
          <div class="bracket-slot">${bandera(datos.visitante)} ${datos.visitante} ${res?res.visitanteGoles:""}</div>
        ` : `<div class="bracket-slot-tbd">${p.label}</div>`}
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────
// PANEL ADMIN
// ─────────────────────────────────────────

window.abrirAdminPanel = function() {
  document.getElementById("admin-panel")?.classList.add("open");
  actualizarSelectAdmin();
};

window.cerrarAdminPanel = function() {
  document.getElementById("admin-panel")?.classList.remove("open");
};

function actualizarSelectAdmin() {
  const sel = document.getElementById("admin-partido-sel");
  if (!sel) return;

  const grupos = Object.keys(GRUPOS_DATA);

  // Partidos de grupos
  const optGrupos = FIXTURE_BASE.map(([local, visitante, grupo, jornada]) => {
    const id = makePartidoId(local, visitante);
    const datos = partidosData[id] || {};
    const estado = datos.real ? "✅" : datos.prediccion ? "🔮" : datos.votacionAbierta ? "🗳" : "⏳";
    return `<option value="${id}" data-tipo="grupo" data-local="${local}" data-visitante="${visitante}" data-grupo="${grupo}">
      ${estado} [${grupo}] ${local} vs ${visitante}
    </option>`;
  }).join("");

  // Partidos de playoff
  const optPlayoffs = PLAYOFFS_TEMPLATE.map(p => {
    const datos = partidosData[p.id] || {};
    const estado = datos.real ? "✅" : datos.prediccion ? "🔮" : datos.votacionAbierta ? "🗳" : "⏳";
    return `<option value="${p.id}" data-tipo="playoff" data-label="${p.label}" data-ronda="${p.ronda}">
      ${estado} [${p.ronda}] ${datos.local && datos.visitante ? datos.local+" vs "+datos.visitante : p.label}
    </option>`;
  }).join("");

  sel.innerHTML = `<option value="">— Elegí un partido —</option>
    <optgroup label="──── FASE DE GRUPOS ────">${optGrupos}</optgroup>
    <optgroup label="──── PLAYOFFS ────">${optPlayoffs}</optgroup>`;

  sel.onchange = () => renderAdminForm(sel.value, sel.options[sel.selectedIndex]);
  document.getElementById("admin-form-cont").innerHTML = "";
}

function renderAdminForm(partidoId, option) {
  const cont = document.getElementById("admin-form-cont");
  if (!cont || !partidoId) return;

  const datos = partidosData[partidoId] || {};
  const tipo = option?.dataset?.tipo || "grupo";
  const local = datos.local || option?.dataset?.local || "";
  const visitante = datos.visitante || option?.dataset?.visitante || "";
  const votacionAbierta = datos.votacionAbierta === true;
  const tienePrediccion = datos.prediccion && datos.prediccion.localGoles !== undefined;
  const tieneReal = datos.real && datos.real.localGoles !== undefined;

  // Para playoffs: selector de equipos
  let equiposHtml = "";
  if (tipo === "playoff" && !local) {
    const todosEquipos = Object.values(GRUPOS_DATA).flat();
    equiposHtml = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--crema-3);margin-bottom:8px">Asignar equipos al partido</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="admin-local-sel" style="flex:1;background:var(--negro-3);border:1px solid rgba(200,150,0,0.3);border-radius:8px;color:var(--crema);padding:8px;font-family:var(--font-body);font-size:13px;outline:none">
            <option value="">Local...</option>
            ${todosEquipos.map(eq => `<option value="${eq}">${bandera(eq)} ${eq}</option>`).join("")}
          </select>
          <span style="color:var(--crema-3)">vs</span>
          <select id="admin-visitante-sel" style="flex:1;background:var(--negro-3);border:1px solid rgba(200,150,0,0.3);border-radius:8px;color:var(--crema);padding:8px;font-family:var(--font-body);font-size:13px;outline:none">
            <option value="">Visitante...</option>
            ${todosEquipos.map(eq => `<option value="${eq}">${bandera(eq)} ${eq}</option>`).join("")}
          </select>
        </div>
        <button onclick="asignarEquiposPlayoff('${partidoId}')" style="margin-top:8px;width:100%;padding:9px;background:rgba(200,150,0,0.1);border:1px solid rgba(200,150,0,0.3);border-radius:8px;color:var(--dorado-claro);font-family:var(--font-display);font-size:15px;cursor:pointer;letter-spacing:1px">
          ASIGNAR EQUIPOS
        </button>
      </div>`;
  }

  // Mostrar equipos actuales
  const equiposActualesHtml = (local && visitante) ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px 14px;background:rgba(200,150,0,0.05);border-radius:10px;border:1px solid rgba(200,150,0,0.15)">
      <span style="font-size:20px">${bandera(local)}</span>
      <span style="font-size:14px;font-weight:600;color:var(--crema)">${local}</span>
      <span style="color:var(--crema-3);margin:0 4px">vs</span>
      <span style="font-size:20px">${bandera(visitante)}</span>
      <span style="font-size:14px;font-weight:600;color:var(--crema)">${visitante}</span>
    </div>` : "";

  // Estado actual
  let estadoHtml = "";
  if (tieneReal) {
    estadoHtml = `<div style="font-size:12px;color:var(--mund-verde);margin-bottom:10px">✅ Resultado real: ${datos.real.localGoles}–${datos.real.visitanteGoles}</div>`;
  }
  if (tienePrediccion) {
    estadoHtml += `<div style="font-size:12px;color:var(--dorado);margin-bottom:10px">🔮 Pronóstico: ${datos.prediccion.localGoles}–${datos.prediccion.visitanteGoles}</div>`;
  }
  if (votacionAbierta) {
    estadoHtml += `<div style="font-size:12px;color:#64b5f6;margin-bottom:10px">🗳 Votación abierta</div>`;
  }

  cont.innerHTML = `
    <div class="resultado-form">
      <div class="resultado-form-title">⚙ ${option?.text?.replace(/^[^\[]*/, "") || partidoId}</div>
      ${equiposHtml}
      ${equiposActualesHtml}
      ${estadoHtml}

      <!-- BLOQUE 1: Control de votación -->
      ${local && visitante ? `
      <div style="border-top:1px solid rgba(200,150,0,0.1);padding-top:14px;margin-bottom:14px">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--crema-3);margin-bottom:10px">Control de votación</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${!votacionAbierta && !tienePrediccion ? `
            <button onclick="abrirVotacion('${partidoId}')" style="flex:1;padding:9px;background:rgba(80,160,255,0.1);border:1px solid rgba(80,160,255,0.3);border-radius:8px;color:#64b5f6;font-family:var(--font-display);font-size:15px;cursor:pointer;letter-spacing:1px">
              🗳 ABRIR VOTACIÓN
            </button>` : ""}
          ${votacionAbierta ? `
            <button onclick="cerrarVotacion('${partidoId}')" style="flex:1;padding:9px;background:rgba(200,150,0,0.1);border:1px solid rgba(200,150,0,0.3);border-radius:8px;color:var(--dorado-claro);font-family:var(--font-display);font-size:15px;cursor:pointer;letter-spacing:1px">
              🔮 CERRAR Y CALCULAR PRONÓSTICO
            </button>` : ""}
        </div>
      </div>

      <!-- BLOQUE 2: Cargar resultado real -->
      <div style="border-top:1px solid rgba(0,200,83,0.1);padding-top:14px">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--crema-3);margin-bottom:10px">Resultado real (Mundial)</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:13px;flex:1;color:var(--crema)">${bandera(local)} ${local}</span>
          <input type="number" min="0" max="20" value="${datos.real?.localGoles ?? 0}" id="real-local" style="width:54px;height:44px;background:var(--negro-3);border:1px solid rgba(0,200,83,0.3);border-radius:8px;color:var(--crema);font-family:var(--font-display);font-size:24px;text-align:center;outline:none;-moz-appearance:textfield" />
          <span style="color:var(--crema-3)">—</span>
          <input type="number" min="0" max="20" value="${datos.real?.visitanteGoles ?? 0}" id="real-visit" style="width:54px;height:44px;background:var(--negro-3);border:1px solid rgba(0,200,83,0.3);border-radius:8px;color:var(--crema);font-family:var(--font-display);font-size:24px;text-align:center;outline:none;-moz-appearance:textfield" />
          <span style="font-size:13px;flex:1;text-align:right;color:var(--crema)">${visitante} ${bandera(visitante)}</span>
        </div>
        <button onclick="guardarResultadoReal('${partidoId}')" class="btn-confirmar">
          ✅ GUARDAR RESULTADO REAL
        </button>
        ${tieneReal ? `<button onclick="borrarResultadoReal('${partidoId}')" class="btn-reset-partido" style="margin-top:8px">🗑 Borrar resultado real</button>` : ""}
      </div>
      ` : ""}

      <!-- RESET -->
      <button onclick="resetarPartido('${partidoId}')" class="btn-reset-partido">
        🗑 Resetear este partido
      </button>
    </div>`;
}

// ─────────────────────────────────────────
// ACCIONES ADMIN
// ─────────────────────────────────────────

window.asignarEquiposPlayoff = async function(partidoId) {
  const local = document.getElementById("admin-local-sel")?.value;
  const visitante = document.getElementById("admin-visitante-sel")?.value;
  if (!local || !visitante || local === visitante) {
    mostrarToast("Elegí dos equipos distintos", true); return;
  }
  await update(ref(db, `mundial/partidos/${partidoId}`), { local, visitante });
  mostrarToast("Equipos asignados 👍");
  actualizarSelectAdmin();
  renderAdminForm(partidoId, document.getElementById("admin-partido-sel")?.options[document.getElementById("admin-partido-sel")?.selectedIndex]);
};

window.abrirVotacion = async function(partidoId) {
  // Asegurarse que existen datos del partido en Firebase
  const datos = partidosData[partidoId] || {};
  const option = document.getElementById("admin-partido-sel")?.options[document.getElementById("admin-partido-sel")?.selectedIndex];
  const local = datos.local || option?.dataset?.local;
  const visitante = datos.visitante || option?.dataset?.visitante;
  const grupo = datos.grupo || option?.dataset?.grupo;

  const updates = { votacionAbierta: true };
  if (local) updates.local = local;
  if (visitante) updates.visitante = visitante;
  if (grupo) updates.grupo = grupo;

  await update(ref(db, `mundial/partidos/${partidoId}`), updates);
  mostrarToast("Votación abierta 🗳");
};

window.cerrarVotacion = async function(partidoId) {
  // Calcular resultado más votado
  const votosSnap = await get(ref(db, `mundial/votos/${partidoId}`));
  const votos = votosSnap.val() || {};
  const lista = Object.values(votos);

  let localGoles = 1, visitanteGoles = 0;

  if (lista.length > 0) {
    const conteo = {};
    lista.forEach(v => {
      const k = `${v.localGoles}-${v.visitanteGoles}`;
      conteo[k] = (conteo[k] || 0) + 1;
    });
    const ganador = Object.entries(conteo).sort((a,b) => b[1]-a[1])[0][0];
    [localGoles, visitanteGoles] = ganador.split("-").map(Number);
  }

  // Guardar votos en el partido y la prediccion
  const votosObj = votosSnap.val() || {};
  await update(ref(db, `mundial/partidos/${partidoId}`), {
    votacionAbierta: false,
    prediccion: { localGoles, visitanteGoles },
    votos: votosObj,
  });

  mostrarToast(`Pronóstico cerrado: ${localGoles}–${visitanteGoles} 🔮`);
};

window.guardarResultadoReal = async function(partidoId) {
  const localGoles = parseInt(document.getElementById("real-local")?.value || 0);
  const visitanteGoles = parseInt(document.getElementById("real-visit")?.value || 0);
  await update(ref(db, `mundial/partidos/${partidoId}`), {
    real: { localGoles, visitanteGoles }
  });
  mostrarToast("Resultado real guardado ✅");
};

window.borrarResultadoReal = async function(partidoId) {
  if (!confirm("¿Borrar el resultado real de este partido?")) return;
  await update(ref(db, `mundial/partidos/${partidoId}`), { real: null });
  mostrarToast("Resultado real borrado");
};

window.resetarPartido = async function(partidoId) {
  if (!confirm("¿Resetear completamente este partido?")) return;
  await remove(ref(db, `mundial/partidos/${partidoId}`));
  await remove(ref(db, `mundial/votos/${partidoId}`));
  mostrarToast("Partido reseteado");
};

window.resetarTorneo = async function() {
  if (!confirm("¿RESETEAR TODO EL TORNEO? Esto borra todos los resultados y votos.")) return;
  await remove(ref(db, "mundial/partidos"));
  await remove(ref(db, "mundial/votos"));
  mostrarToast("Torneo reseteado 🗑");
};

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────

function mostrarToast(msg, esError = false) {
  const toast = document.getElementById("mundial-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.borderColor = esError ? "rgba(200,50,50,0.5)" : "rgba(200,150,0,0.4)";
  toast.style.color = esError ? "#e57373" : "var(--dorado-claro)";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

// ─────────────────────────────────────────
// AUTO-ASIGNAR CRUCES DE TERCEROS AL BRACKET
// ─────────────────────────────────────────

// Mapa: partido de 16avos → grupo del líder que recibe un 3°
const LIDER_POR_PARTIDO = {
  P74: "E",
  P77: "I",
  P79: "A",
  P80: "L",
  P81: "D",
  P82: "G",
  P85: "B",
  P87: "K",
};

// Para obtener el primer clasificado de un grupo desde Firebase
function get1erGrupo(grupo) {
  const stats = calcularStats(grupo);
  return stats[0]?.eq || null;
}

function get2doGrupo(grupo) {
  const stats = calcularStats(grupo);
  return stats[1]?.eq || null;
}

// Llama esto desde el panel admin para auto-asignar todos los cruces de 3°
window.autoAsignarTerceros = async function() {
  const terceros = calcularTerceros();
  if (terceros.length < 8) {
    mostrarToast("Aún no hay 8 terceros clasificados", true);
    return;
  }
  const clasificados = terceros.slice(0, 8);
  const cruces = asignarCrucesTerceros(clasificados); // grupoLider → grupoTercero

  // Map grupoTercero → equipo
  const tercerosMap = {};
  clasificados.forEach(t => tercerosMap[t.grupo] = t.eq);

  const updates = {};

  // Asignar los 8 partidos de 16avos con 3°
  for (const [partidoId, grupoLider] of Object.entries(LIDER_POR_PARTIDO)) {
    const grupoTercero = cruces[grupoLider];
    const lider = get1erGrupo(grupoLider);
    const tercero = grupoTercero ? tercerosMap[grupoTercero] : null;
    if (lider && tercero) {
      updates[`mundial/partidos/${partidoId}/local`] = lider;
      updates[`mundial/partidos/${partidoId}/visitante`] = tercero;
      updates[`mundial/partidos/${partidoId}/grupo`] = `${grupoLider}v${grupoTercero}`;
    }
  }

  // También asignar los partidos de 2° que ya están fijos
  const SEGUNDOS_FIJOS = {
    P73: ["A", "B"],
    P75: ["F", "C"],
    P76: ["E", "F"],
    P78: ["E", "I"],
    P83: ["K", "L"],
    P84: ["H", "J"],
    P86: ["J", "H"],
    P88: ["D", "G"],
  };
  for (const [partidoId, [g1, g2]] of Object.entries(SEGUNDOS_FIJOS)) {
    const existente = partidosData[partidoId] || {};
    if (!existente.local) {
      const eq1 = get1erGrupo(g1) || get2doGrupo(g1);
      const eq2 = get2doGrupo(g2);
      if (eq1 && eq2) {
        updates[`mundial/partidos/${partidoId}/local`] = eq1;
        updates[`mundial/partidos/${partidoId}/visitante`] = eq2;
        updates[`mundial/partidos/${partidoId}/grupo`] = `${g1}v${g2}`;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    mostrarToast("No hay datos suficientes para asignar cruces", true);
    return;
  }

  await update(ref(db, "/"), updates);
  mostrarToast(`✅ Cruces asignados (${Object.keys(updates).length / 3} partidos)`);
};
