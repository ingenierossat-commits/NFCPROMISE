import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, get, remove, onValue, push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyChMXx5ZcleAo5oqzPvo1K_Af_wgQkh-LQ",
  authDomain: "listify-16b5d.firebaseapp.com",
  databaseURL: "https://listify-16b5d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "listify-16b5d",
  storageBucket: "listify-16b5d.firebasestorage.app",
  messagingSenderId: "238610923350",
  appId: "1:238610923350:web:cd5c2c3fb23b5c0afba0f7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const MAX_MEMOS = 10;
const USER_KEY = "masmemoria_id";
let usuario = null;
let memos = [];
let micActivo = null;
let recognition = null;

function idDispositivo(){
  const params = new URLSearchParams(location.search);
  const idUrl = params.get("id");
  if(idUrl){
    localStorage.setItem(USER_KEY, idUrl);
    return idUrl;
  }
  let id = localStorage.getItem(USER_KEY);
  if(!id){
    id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2)));
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

// ── TOAST ──────────────────────────
let toastTimer;
function toast(txt, tipo = 'ok', ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = txt;
  el.className = 'toast show ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function actualizarContador(){
  const el = document.getElementById('hdrCounter');
  el.textContent = memos.length + '/' + MAX_MEMOS;
  el.classList.toggle('full', memos.length >= MAX_MEMOS);
}

// ── AUTO-RESIZE ────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}
function ocultarPlaceholder(el) { el.dataset.ph = el.placeholder; el.placeholder = ''; }
function restaurarPlaceholder(el, txt) { if (!el.value) el.placeholder = txt; }

// ── TECLAS ─────────────────────────
function keyGuardar(e)  { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); accionGuardar(); } }
function keyRecordar(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); accionRecordar(); } }
function keyBorrar(e)   { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); accionBorrar(); } }

// ── FECHA ──────────────────────────
const MESES = {
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12
};
function parsearFecha(txt) {
  const m = txt.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+(?:de\s+)?(\d{4}))?/i);
  if (!m) return null;
  const dia = parseInt(m[1]);
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  const hoy = new Date();
  let anyo = m[3] ? parseInt(m[3]) : hoy.getFullYear();
  const d = new Date(anyo, mes - 1, dia);
  if (!m[3] && d < hoy) d.setFullYear(anyo + 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
function fmtFecha(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtTs(ts) {
  return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── BÚSQUEDA CON RAÍZ ──────────────
function raiz(palabra) {
  let p = palabra.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sufijos = ['aciones','amiento','imientos','imiento','idades','ando','iendo',
    'adas','ados','idos','idas','uras','ura','eros','eras','ero','era',
    'istas','ista','mente','cion','nes','les','res','es','os','as','ar','er','ir','al'];
  for (const s of sufijos) {
    if (p.endsWith(s) && p.length - s.length >= 3) { p = p.slice(0, -s.length); break; }
  }
  return p;
}
function buscar(termino) {
  const palabras = termino.toLowerCase().split(/\s+/).filter(Boolean);
  return memos.filter(m => {
    const textoNorm = m.texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return palabras.every(p => {
      if (textoNorm.includes(p)) return true;
      const pRaiz = raiz(p);
      return textoNorm.split(/\s+/).some(w => {
        const wRaiz = raiz(w);
        return wRaiz.startsWith(pRaiz) || pRaiz.startsWith(wRaiz);
      });
    });
  });
}
function resaltar(html, termino) {
  const palabras = termino.split(/\s+/).filter(Boolean);
  return palabras.reduce((h, p) =>
    h.replace(new RegExp(escRx(p), 'gi'), s => `<mark>${s}</mark>`), html);
}
function esc(s)   { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escRx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function uid()    { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── FIREBASE: cargar / guardar ────
function cargarMemos(){
  const r = ref(db, `masmemoria/${usuario}/memos`);
  onValue(r, (snap) => {
    const data = snap.val();
    memos = data ? Object.values(data) : [];
    memos.sort((a,b) => a.ts - b.ts);
    actualizarContador();
  });
}
function guardarMemos(){
  const obj = {};
  memos.forEach(m => { obj[m.id] = m; });
  set(ref(db, `masmemoria/${usuario}/memos`), obj);
}

// ── ① GUARDAR ──────────────────────
function accionGuardar() {
  const txt = document.getElementById('txtGuardar').value.trim();
  if (!txt) return;

  if (memos.length >= MAX_MEMOS) {
    toast('⚠ Límite de 10 recuerdos alcanzado. Borra alguno primero.', 'err', 4000);
    return;
  }

  if (/^fecha[.\s:]/i.test(txt)) {
    const contenido = txt.replace(/^fecha[.\s:]*/i, '').trim();
    const fechaISO  = parsearFecha(contenido);
    if (!fechaISO) {
      toast('⚠ No entendí la fecha. Ej: "Fecha. dentista el 15 de abril"', 'err');
      return;
    }
    memos.push({ id: uid(), texto: contenido, ts: Date.now(), esFecha: true, fechaEvento: fechaISO });
    guardarMemos();
    const dStr = new Date(fechaISO + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    toast('✅ Guardado. Te avisaré el ' + dStr, 'ok', 4000);
  } else {
    memos.push({ id: uid(), texto: txt, ts: Date.now(), esFecha: false });
    guardarMemos();
    toast('✅ Guardado', 'ok');
  }

  limpiar('guardar');
}

// ── ② RECORDAR ────────────────────
function accionRecordar() {
  const txt = document.getElementById('txtRecordar').value.trim();
  if (!txt) return;

  const esBusquedaFecha = /^fecha[s]?$/i.test(txt.trim());
  let encontrados = [];

  if (esBusquedaFecha) {
    encontrados = memos.filter(m => m.esFecha);
  } else {
    const termino = txt
      .replace(/^[¿?]/, '')
      .replace(/[?]$/, '')
      .replace(/^(dónde|donde|está|están|es|hay|qué|que|quién|quien|tienes|recuerdas|muestrame|muéstrame|busca|cuándo|cuando)\s*/i, '')
      .trim();

    const palabras = (termino || txt).toLowerCase().split(/\s+/).filter(p => p.length > 2);
    if (termino) encontrados = buscar(termino);
    if (!encontrados.length) {
      for (const p of palabras) {
        encontrados = buscar(p);
        if (encontrados.length) break;
      }
    }
  }

  const resp = document.getElementById('respuesta');

  if (!encontrados.length) {
    resp.innerHTML = esBusquedaFecha ? 'No tienes ninguna fecha guardada.' : 'No encontré nada sobre eso.';
  } else if (esBusquedaFecha) {
    resp.innerHTML = `${encontrados.length} fecha${encontrados.length > 1 ? 's' : ''} activa${encontrados.length > 1 ? 's' : ''}:<br><br>` +
      encontrados
        .sort((a, b) => new Date(a.fechaEvento) - new Date(b.fechaEvento))
        .map((m, i) => `${i + 1}. 📅 ${esc(m.texto)} — <b>${fmtFecha(m.fechaEvento)}</b>`)
        .join('<br>');
  } else if (encontrados.length === 1) {
    resp.innerHTML = '📌 ' + esc(encontrados[0].texto);
  } else {
    resp.innerHTML = `Encontré ${encontrados.length} notas:<br><br>` +
      encontrados.map((m, i) => `${i + 1}. ${esc(m.texto)}`).join('<br>');
  }

  resp.classList.add('show');
  document.getElementById('btnOkRecordar').classList.add('activo');
  limpiar('recordar');
}

// ── ③ BORRAR ──────────────────────
function accionBorrar() {
  const txt = document.getElementById('txtBorrar').value.trim();
  if (!txt) return;

  const esBusquedaFecha = /^fecha$/i.test(txt.trim());
  const encontrados = esBusquedaFecha ? memos.filter(m => m.esFecha) : buscar(txt);
  const div = document.getElementById('resultados');
  const btnBorrar = document.getElementById('btnBorrarSel');

  if (!encontrados.length) {
    div.innerHTML = `<div style="color:var(--inkt);font-size:12px;padding:4px 0">No encontré entradas con "${esc(txt)}".</div>`;
    btnBorrar.style.display = 'none';
    limpiar('borrar');
    return;
  }

  div.innerHTML = encontrados.map(m => `
    <div class="res-item" id="ri_${m.id}">
      <input type="checkbox" class="res-check" id="chk_${m.id}" onchange="window.onCheck('${m.id}', this)">
      <div style="flex:1">
        <div class="res-text">${resaltar(esc(m.texto), txt)}</div>
        <div class="res-fecha">${fmtTs(m.ts)}${m.esFecha ? ' · 📅 ' + fmtFecha(m.fechaEvento) : ''}</div>
      </div>
    </div>
  `).join('');

  btnBorrar.style.display = 'block';
  btnBorrar.disabled = true;
  limpiar('borrar');
}

function onCheck(id, el) {
  document.getElementById('ri_' + id)?.classList.toggle('checked', el.checked);
  const alguna = document.querySelectorAll('.res-check:checked').length > 0;
  document.getElementById('btnBorrarSel').disabled = !alguna;
}

function borrarSeleccionadas() {
  const checks = document.querySelectorAll('.res-check:checked');
  if (!checks.length) return;
  const ids = Array.from(checks).map(c => c.id.replace('chk_', ''));
  memos = memos.filter(m => !ids.includes(m.id));
  guardarMemos();
  document.getElementById('resultados').innerHTML = '';
  document.getElementById('btnBorrarSel').style.display = 'none';
  toast(`🗑 ${ids.length} entrada${ids.length > 1 ? 's borradas' : ' borrada'}`, 'info');
}

// ── VOZ ────────────────────────────
function toggleMic(cual) {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    toast('Tu navegador no soporta reconocimiento de voz', 'err');
    return;
  }
  if (micActivo === cual && recognition) { recognition.stop(); return; }
  if (recognition) recognition.stop();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = true;

  micActivo = cual;
  const btnId = 'mic' + cual.charAt(0).toUpperCase() + cual.slice(1);
  const txtId = 'txt'  + cual.charAt(0).toUpperCase() + cual.slice(1);
  document.getElementById(btnId).classList.add('grabando');

  recognition.onresult = e => {
    let texto = '';
    for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript;
    document.getElementById(txtId).value = texto;
    autoResize(document.getElementById(txtId));
  };
  recognition.onend = () => {
    document.getElementById(btnId).classList.remove('grabando');
    micActivo = null;
    recognition = null;
  };
  recognition.onerror = () => {
    document.getElementById(btnId).classList.remove('grabando');
    micActivo = null;
    recognition = null;
    toast('Error en el micrófono', 'err');
  };
  recognition.start();
}

function cerrarRespuesta() {
  const resp = document.getElementById('respuesta');
  resp.innerHTML = '';
  resp.classList.remove('show');
  document.getElementById('btnOkRecordar').classList.remove('activo');
}
function limpiar(cual) {
  const id = 'txt' + cual.charAt(0).toUpperCase() + cual.slice(1);
  const el = document.getElementById(id);
  el.value = '';
  el.style.height = 'auto';
}

window.autoResize = autoResize;
window.ocultarPlaceholder = ocultarPlaceholder;
window.restaurarPlaceholder = restaurarPlaceholder;
window.keyGuardar = keyGuardar;
window.keyRecordar = keyRecordar;
window.keyBorrar = keyBorrar;
window.accionGuardar = accionGuardar;
window.accionRecordar = accionRecordar;
window.accionBorrar = accionBorrar;
window.onCheck = onCheck;
window.borrarSeleccionadas = borrarSeleccionadas;
window.toggleMic = toggleMic;
window.cerrarRespuesta = cerrarRespuesta;

usuario = idDispositivo();
cargarMemos();
