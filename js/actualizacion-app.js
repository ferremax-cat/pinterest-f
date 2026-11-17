/**
 * ACTUALIZACION DE LA APP
 *
 * Los vendedores dejan la app abierta todo el dia: una pestaña sigue
 * ejecutando el JavaScript que cargo a la mañana aunque ya se haya publicado
 * otro. La pagina lleva escrita su propia version (js/version-app.js, que
 * genera scripts/version_app.py) y aca se compara con la publicada en
 * json/version.json ("app"). Nunca se compara con la primera que leyo la
 * pestaña: esa seria la nueva si el navegador corre codigo viejo.
 *
 * Lectura: en el catalogo, la de frescura-precios.js (evento version:leida,
 * cada 15 minutos, sin consultas nuevas); en la bandeja, leerVersionCada.
 *
 * Hay una nueva si la huella publicada es otra, se genero despues que la
 * propia (si no, el CDN esta atrasado con version.json) y hace 20 minutos o
 * mas (margen de la cache de GitHub Pages y de la segunda publicacion del
 * bot). Entonces:
 *   - una franja arriba, con "Actualizar";
 *   - se actualiza sola si la app esta quieta (quieta) o si se vuelve a la
 *     pestaña despues de 10 minutos o mas oculta y nada esta abierto (libre).
 * Actualizar refresca la cache HTTP de los js y css de la pagina y navega a
 * ?v=<huella> (el HTML nuevo). Sola, como mucho 2 intentos por version
 * publicada, con 20 minutos entre uno y otro; despues, solo la franja.
 *
 * Lo carga tambien imprimir.html: no importa nada que exista solo en el
 * catalogo. Lo del carrito y el menu se mira en el DOM o por window.
 */

import { sinTocarHace } from './actividad.js';
import { registrarFallo } from './registro-fallos.js';

const MARGEN_MS = 20 * 60 * 1000;        // desde el generado publicado
const QUIETO_MS = 60 * 1000;             // sin tocar la pagina (y cargada hace tanto)
const OCULTA_MS = 10 * 60 * 1000;        // vuelta a la pestaña "a la mañana siguiente"
const VUELTA_MS = 15 * 1000;             // ventana para actualizar despues de esa vuelta
const REINTENTO_MS = 30 * 1000;          // con una nueva: volver a mirar, sin consultas
const INTENTOS_MAX = 2;                  // recargas solas por version publicada
const ENTRE_INTENTOS_MS = 20 * 60 * 1000;
const TOPE_CACHE_MS = 5000;              // refresco de la cache antes de recargar
const AVISO_ENVIO_MS = 4000;
// Debajo del panel del carrito (9600) y de las hojas (9800): no tapa nada abierto
const Z_FRANJA = 9500;
const CLAVE_MARCA = 'appRecarga';

/** La version escrita en esta pagina, o null */
function versionPropia() {
  const v = window.VERSION_APP;
  return v && typeof v.huella === 'string' && v.huella ? v : null;
}

let publicada = null;        // ultima "app" leida de version.json
let hayNueva = false;
let franjaOculta = false;    // la x: hasta la proxima lectura
let actualizando = false;
let reintento = 0;
let ocultaDesde = document.hidden ? performance.now() : null;
let vueltaHasta = 0;         // hasta cuando vale la vuelta despues de estar oculta
const condiciones = [];      // las de cada pagina (agregarCondicion)

// ---------- marca de recarga (sessionStorage, por pestaña) ----------

function leerMarca() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_MARCA) || 'null'); } catch (e) { return null; }
}

function guardarMarca(m) {
  try { sessionStorage.setItem(CLAVE_MARCA, JSON.stringify(m)); } catch (e) {}
}

function borrarMarca() {
  try { sessionStorage.removeItem(CLAVE_MARCA); } catch (e) {}
}

/** 'ok', 'esperar' (entre intentos) o 'agotado', para la version publicada */
function estadoIntentos() {
  const m = leerMarca();
  if (!m || !publicada || m.huella !== publicada.huella) return 'ok';
  if ((m.intentos || 0) >= INTENTOS_MAX) return 'agotado';
  if (Date.now() - (m.ultimo || 0) < ENTRE_INTENTOS_MS) return 'esperar';
  return 'ok';
}

// ---------- detectar ----------

function esNueva(app) {
  const propia = versionPropia();
  if (!propia || !app?.huella || app.huella === propia.huella) return false;
  const pub = Date.parse(app.generado);
  const mia = Date.parse(propia.generado);
  // Anterior a la propia (o sin fecha): el CDN esta atrasado con version.json
  if (!(pub > mia)) return false;
  return Date.now() - pub >= MARGEN_MS;
}

/** app: version.app ({ huella, generado }). Sin "app", no se hace nada */
export function revisarVersion(app) {
  if (!app?.huella) return;
  publicada = { huella: String(app.huella), generado: String(app.generado || '') };
  hayNueva = esNueva(publicada);
  pintarEnMenu();
  if (!hayNueva) {
    clearTimeout(reintento);
    quitarFranja();
    return;
  }
  franjaOculta = false;
  mostrarFranja();
  intentarSola();
}

// ---------- cuando se puede recargar ----------

/** Nada abierto ni a medio hacer: panel, hoja, envio, menu y lo de cada pagina */
function libre() {
  if (document.getElementById('carrito-panel')?.style.display === 'flex') return false;
  if (document.querySelector('.hj-fondo')) return false;   // observacion, alta, cualquier hoja
  if (document.body?.dataset.enviandoPedido) return false;
  if (window.menuFuncionalidades?.isOpen) return false;
  // Cada una ya viene protegida por agregarCondicion: un error cuenta como bloqueada
  return condiciones.every(c => c());
}

function escribiendo() {
  const a = document.activeElement;
  return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
}

/** Libre y ademas quieta: como destacados.js, pero 60 s (una recarga borra lo que se mira) */
function quieta() {
  if (document.hidden || !libre() || escribiendo()) return false;
  // La carga cuenta como actividad: recien abierta o recargada no esta quieta
  if (performance.now() < QUIETO_MS || !sinTocarHace(QUIETO_MS)) return false;
  // El buscador del catalogo (catalogo.html: nav > .input-container, sin id ni
  // clase propia). Sin tipo en el selector: sigue valiendo si pasa a type="search".
  // Es el mismo campo del modo clientes. En la bandeja no existe
  if (document.querySelector('nav .input-container input')?.value.trim()) return false;
  if (window.scrollY > window.innerHeight / 4) return false;
  return true;
}

function intentarSola() {
  clearTimeout(reintento);
  if (!hayNueva || actualizando) return;
  const estado = estadoIntentos();
  if (estado === 'agotado') {
    avisarAgotado();
    mostrarFranja();
    return;
  }
  if (estado === 'ok') {
    const vuelta = performance.now() < vueltaHasta && !document.hidden && libre() && !escribiendo();
    if (vuelta || quieta()) {
      actualizar({ sola: true });
      return;
    }
  }
  reintento = setTimeout(intentarSola, REINTENTO_MS);
}

/** Una sola vez por version publicada y pestaña: la recarga no trajo lo nuevo */
function avisarAgotado() {
  const m = leerMarca();
  if (!m || m.avisado) return;
  guardarMarca({ ...m, avisado: true });
  registrarFallo('app_no_se_actualiza',
    `propia ${versionPropia()?.huella || '-'} · publicada ${publicada?.huella || '-'} · intentos ${m.intentos || 0}`,
    undefined, { repetir: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ocultaDesde = performance.now();
    return;
  }
  const estuvo = ocultaDesde == null ? 0 : performance.now() - ocultaDesde;
  ocultaDesde = null;
  // La lectura de version.json de la vuelta llega un poco despues: la ventana la espera
  if (estuvo >= OCULTA_MS) {
    vueltaHasta = performance.now() + VUELTA_MS;
    intentarSola();
  }
});

// ---------- actualizar ----------

/** Los js y css del mismo origen que uso esta pagina, mas version-app.js */
function archivosDeLaPagina() {
  const urls = new Set();
  const sumar = ref => {
    try {
      const u = new URL(ref, location.href);
      if (u.origin === location.origin && /\.(js|css)$/i.test(u.pathname)) urls.add(u.origin + u.pathname);
    } catch (e) {}
  };
  (performance.getEntriesByType?.('resource') || []).forEach(e => sumar(e.name));
  document.querySelectorAll('script[src]').forEach(s => sumar(s.getAttribute('src')));
  document.querySelectorAll('link[rel="stylesheet"][href]').forEach(l => sumar(l.getAttribute('href')));
  sumar('js/version-app.js');
  return [...urls];
}

/**
 * cache 'reload' va a la red y reemplaza la copia guardada: la carga
 * siguiente toma lo nuevo aunque la copia no haya vencido (max-age=600)
 */
async function refrescarCache() {
  const pedidos = archivosDeLaPagina().map(u => fetch(u, { cache: 'reload' }).catch(() => null));
  await Promise.race([Promise.all(pedidos), new Promise(r => setTimeout(r, TOPE_CACHE_MS))]);
}

/**
 * Refresca la cache y recarga con ?v=<huella> (la URL distinta trae el HTML
 * nuevo). sola: la recarga automatica (vuelve a mirar que siga libre). Nunca
 * con un pedido enviandose: recargar cortaria la llamada.
 */
export async function actualizar({ sola = false } = {}) {
  if (actualizando || !publicada?.huella) return false;
  if (document.body?.dataset.enviandoPedido) {
    if (!sola) avisoEnFranja('Esperá a que termine de guardarse el pedido.');
    return false;
  }
  actualizando = true;
  try {
    const huella = publicada.huella;
    await refrescarCache();
    // La espera pudo coincidir con algo del usuario
    if (sola && (!libre() || escribiendo())) {
      reintento = setTimeout(intentarSola, REINTENTO_MS);
      return false;
    }
    if (document.body?.dataset.enviandoPedido) return false;
    const m = leerMarca();
    const intentos = m?.huella === huella ? (m.intentos || 0) + 1 : 1;
    guardarMarca({ huella, intentos, ultimo: Date.now(), ...(m?.huella === huella && m.avisado ? { avisado: true } : {}) });
    console.info(`[App] Actualizando a ${huella} (${sola ? 'sola' : 'botón'}, intento ${intentos})`);
    window.ActualizacionApp.irA(location.pathname + '?v=' + encodeURIComponent(huella));
    return true;
  } finally {
    actualizando = false;
  }
}

// ---------- franja ----------

function quitarFranja() {
  document.getElementById('app-franja-version')?.remove();
}

function mostrarFranja(texto) {
  if (franjaOculta && !texto) return;
  let f = document.getElementById('app-franja-version');
  if (!f) {
    f = document.createElement('div');
    f.id = 'app-franja-version';
    f.setAttribute('role', 'status');
    f.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:${Z_FRANJA};` +
      'display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;' +
      'padding:5px 36px 5px 12px;background:#1f3a5f;color:#fff;font-size:13px;' +
      'line-height:1.3;box-shadow:0 2px 8px rgba(0,0,0,.25);text-align:center';
    f.innerHTML = '<span class="app-franja-texto"></span>' +
      '<button type="button" class="app-franja-actualizar" style="background:#fff;color:#1f3a5f;' +
      'border:0;border-radius:4px;padding:3px 10px;font-size:13px;font-weight:600;cursor:pointer">Actualizar</button>' +
      '<button type="button" class="app-franja-cerrar" aria-label="Cerrar" style="position:absolute;right:6px;' +
      'top:50%;transform:translateY(-50%);background:none;border:0;color:#fff;font-size:18px;cursor:pointer">&times;</button>';
    f.querySelector('.app-franja-actualizar').addEventListener('click', () => actualizar());
    f.querySelector('.app-franja-cerrar').addEventListener('click', () => {
      franjaOculta = true;
      quitarFranja();
    });
    document.body.appendChild(f);
  }
  f.querySelector('.app-franja-texto').textContent = texto || (estadoIntentos() === 'agotado'
    ? 'Hay una versión nueva, pero el navegador sigue trayendo la anterior. Cerrá esta pestaña y volvé a abrir la app.'
    : 'Hay una versión nueva de la app.');
}

function avisoEnFranja(texto) {
  franjaOculta = false;
  mostrarFranja(texto);
  setTimeout(() => { if (hayNueva && document.getElementById('app-franja-version')) mostrarFranja(); }, AVISO_ENVIO_MS);
}

// ---------- version a la vista ----------

const dos = n => String(n).padStart(2, '0');

/** "17/11 14:32 · a1b2c3", en hora local; sin version, "sin versión" */
export function textoVersion(v = versionPropia()) {
  if (!v?.huella) return 'sin versión';
  const d = new Date(v.generado);
  const fecha = isNaN(d) ? '' : `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())} · `;
  return fecha + v.huella.slice(0, 6);
}

/** Pinta la version en el menu del catalogo (#menu-version) y en la bandeja (#im-version) */
export function pintarEnMenu() {
  ['menu-version', 'im-version'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = 'Versión ' + textoVersion();
    if (!hayNueva) return;
    el.appendChild(document.createTextNode(' · hay una nueva: '));
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'version-actualizar';
    a.textContent = 'actualizar';
    a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); actualizar(); });
    el.appendChild(a);
  });
}

// ---------- para cada pagina ----------

/**
 * Condicion de la pagina para la recarga sola (por ejemplo, la seleccion de la
 * bandeja): libre solo si devuelve true. Si lanza un error (por ejemplo, por un
 * cambio futuro en la pagina) cuenta como BLOQUEADA: lo peor que puede pasar es
 * que no se actualice sola, nunca que recargue en medio de una impresion
 */
export function agregarCondicion(fn) {
  if (typeof fn !== 'function') return;
  condiciones.push(() => {
    try {
      return fn() === true;
    } catch (e) {
      console.warn('[App] Una condición de la página falló: no se actualiza sola', e);
      return false;
    }
  });
}

let lecturaPropia = 0;

/**
 * Para las paginas sin frescura-precios.js (la bandeja): lee version.json
 * cada ms, solo con la pestaña visible, y al volver a ella. Emite version:leida
 */
export function leerVersionCada(ms = 15 * 60 * 1000) {
  const leer = async () => {
    if (document.hidden) return;
    try {
      const r = await fetch('./json/version.json', { cache: 'no-store' });
      if (!r.ok) return;
      document.dispatchEvent(new CustomEvent('version:leida', { detail: await r.json() }));
    } catch (e) {
      console.warn('[App] No se pudo leer version.json:', e);
    }
  };
  if (!lecturaPropia) document.addEventListener('visibilitychange', () => { if (!document.hidden) leer(); });
  clearInterval(lecturaPropia);
  lecturaPropia = setInterval(leer, ms);
}

/** { propia, publicada, hayNueva }: lo usa registro-fallos.js */
export function estado() {
  return { propia: versionPropia(), publicada, hayNueva };
}

// ---------- al cargar ----------

// Vuelta de una recarga: sacar ?v= de la direccion y, si trajo la version
// buscada, borrar la marca
try {
  const url = new URL(location.href);
  if (url.searchParams.has('v')) {
    url.searchParams.delete('v');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
} catch (e) {}
{
  const m = leerMarca();
  if (m && m.huella === versionPropia()?.huella) borrarMarca();
}

document.addEventListener('version:leida', e => revisarVersion(e.detail?.app));

window.ActualizacionApp = {
  estado, textoVersion, actualizar, agregarCondicion, leerVersionCada, pintarEnMenu, revisarVersion,
  // Navegacion de la recarga (las pruebas la reemplazan)
  irA: url => location.replace(url)
};

pintarEnMenu();
