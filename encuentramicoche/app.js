import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, get, remove, onValue
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

const USER_KEY = "encuentramicoche_usuario";
let usuario = null;
let ubicacionActual = null;

function slug(s){
  return s.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
}

function toast(txt, tipo=""){
  const t = document.getElementById("toast");
  t.textContent = txt;
  t.className = "toast show" + (tipo ? " "+tipo : "");
  setTimeout(()=> t.className = "toast", 2600);
}

function entrar(){
  const val = document.getElementById("inputNombre").value.trim();
  if(!val){ toast("Escribe tu nombre", "err"); return; }
  usuario = slug(val);
  localStorage.setItem(USER_KEY, JSON.stringify({slug: usuario, nombre: val}));
  iniciarApp(val);
}

function cambiarUsuario(){
  localStorage.removeItem(USER_KEY);
  location.reload();
}

function iniciarApp(nombreVisible){
  document.getElementById("user-screen").style.display = "none";
  document.getElementById("hdrUser").textContent = nombreVisible + " · salir";
  cargarUbicacion();
}

function cargarUbicacion(){
  const r = ref(db, `encuentramicoche/${usuario}/actual`);
  onValue(r, (snap) => {
    const data = snap.val();
    renderEstado(data);
  });
}

function renderEstado(data){
  const empty = document.getElementById("statusEmpty");
  const filled = document.getElementById("statusFilled");
  const btnGuardar = document.getElementById("btnGuardar");
  const btnVolver = document.getElementById("btnVolver");
  const btnBorrar = document.getElementById("btnBorrar");
  const fieldNota = document.getElementById("fieldNota");

  if(!data){
    empty.style.display = "block";
    filled.style.display = "none";
    btnVolver.style.display = "none";
    btnBorrar.style.display = "none";
    fieldNota.style.display = "block";
    fieldNota.value = "";
    btnGuardar.textContent = "📍 Aparqué aquí";
    ubicacionActual = null;
    return;
  }

  ubicacionActual = data;
  empty.style.display = "none";
  filled.style.display = "block";
  btnVolver.style.display = "block";
  btnBorrar.style.display = "block";
  fieldNota.style.display = "none";
  btnGuardar.textContent = "📍 Actualizar ubicación";

  document.getElementById("statusTime").textContent = data.nombre || "Ubicación guardada";
  document.getElementById("statusSub").textContent = tiempoTranscurrido(data.ts) + " · " + fmtHora(data.ts);

  const notaEl = document.getElementById("statusNote");
  notaEl.style.display = "none";

  actualizarReloj();
}

let relojId = null;
function actualizarReloj(){
  if(relojId) clearInterval(relojId);
  relojId = setInterval(()=>{
    if(ubicacionActual) document.getElementById("statusSub").textContent = tiempoTranscurrido(ubicacionActual.ts) + " · " + fmtHora(ubicacionActual.ts);
  }, 30000);
}

function tiempoTranscurrido(ts){
  const min = Math.floor((Date.now() - ts) / 60000);
  if(min < 1) return "ahora mismo";
  if(min < 60) return "hace " + min + " min";
  const h = Math.floor(min/60);
  const m = min % 60;
  return "hace " + h + "h " + (m ? m+"min" : "");
}

function fmtHora(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString("es-ES", {hour:"2-digit", minute:"2-digit"});
}

function guardarUbicacion(){
  if(!navigator.geolocation){
    toast("Tu navegador no soporta geolocalización", "err");
    return;
  }
  const btnGuardar = document.getElementById("btnGuardar");
  btnGuardar.textContent = "Buscando ubicación...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const nombre = document.getElementById("fieldNota").value.trim();
      const data = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        ts: Date.now(),
        nombre: nombre || null
      };
      set(ref(db, `encuentramicoche/${usuario}/actual`), data)
        .then(()=> toast("Ubicación guardada", "ok"))
        .catch(()=> toast("Error al guardar", "err"));
    },
    (err) => {
      toast("No se pudo obtener tu ubicación", "err");
      document.getElementById("btnGuardar").textContent = "📍 Aparqué aquí";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function comoVolver(){
  if(!ubicacionActual) return;
  const { lat, lng } = ubicacionActual;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  window.open(url, "_blank");
}

function borrarUbicacion(){
  if(!confirm("¿Borrar la ubicación guardada?")) return;
  remove(ref(db, `encuentramicoche/${usuario}/actual`))
    .then(()=> toast("Ubicación borrada", "ok"));
}

window.entrar = entrar;
window.cambiarUsuario = cambiarUsuario;
window.guardarUbicacion = guardarUbicacion;
window.comoVolver = comoVolver;
window.borrarUbicacion = borrarUbicacion;

(function init(){
  const saved = localStorage.getItem(USER_KEY);
  if(saved){
    try{
      const { slug: s, nombre } = JSON.parse(saved);
      usuario = s;
      iniciarApp(nombre);
    }catch{
      document.getElementById("user-screen").style.display = "flex";
    }
  }
})();
