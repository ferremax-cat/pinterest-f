/**
 * FRESCURA DE PRECIOS
 *
 * productManager guarda los productos en la sesion y no vuelve a leer
 * productos.json mientras la pestaña viva: los precios del dia anterior
 * seguian en pantalla. Aca se revisa json/version.json (menos de 100 bytes,
 * sin cache) y, solo si productos.json cambio despues de cargar los
 * precios, se descarga una vez y se actualiza la memoria en segundo plano.
 *
 * Para no molestar: la primera revision es a los 10 minutos (los precios
 * cambian una vez por dia) y la descarga se hace en un tiempo muerto del
 * navegador. Solo se avisa si cambio el precio de algo que el usuario tiene
 * en el carrito.
 *
 * La misma lectura de version.json revisa tambien los destacados de la
 * galeria (catalogo_grupos.json, ver destacados.js) y, con 'version:leida',
 * la version de la app, el indice del buscador, las promociones y grupos de
 * clientes (promociones.js) y las fotos (frescura-imagenes.js).
 *
 * Con el panel del carrito abierto se lee igual, pero no se cambia nada debajo
 * del pedido que se esta armando: 'version:leida' lleva solo la version de la
 * app (que nunca recarga con el panel abierto, solo muestra la franja) y lo
 * demas queda pendiente. Se aplica al cerrar el panel (se mira cada 30 s, sin
 * consultas), sin volver a leer version.json. Antes, con el panel abierto no
 * se leia nada: la pestaña quedaba congelada, tambien para la app.
 */

import { reemplazarProductos } from './datos-catalogo.js';
import { revisarDestacados } from './destacados.js';
import { preciosDelPedido, avisarCambiosDelPedido } from './aviso-pedido.js';
// Escucha 'version:leida' (fotos nuevas con la pestaña abierta)
import './frescura-imagenes.js';

const PRIMERA_MS = 10 * 60 * 1000;     // primera revision despues de cargar
const CADA_MS = 15 * 60 * 1000;        // revision periodica
const REINTENTO_PANEL_MS = 30 * 1000;  // con el panel abierto, volver a probar
// Margen por la cache HTTP del servidor (unos 10 min): si el archivo se
// genero poco antes de cargar los precios, la copia cargada pudo ser la vieja
const MARGEN_MS = 15 * 60 * 1000;

let revisando = false;
let reintentoProgramado = false;
let pendiente = null;   // version leida con el panel abierto, sin aplicar

const panelAbierto = () => document.getElementById('carrito-panel')?.style.display === 'flex';

// Un tiempo muerto del navegador; si no hay forma de saberlo, el proximo turno
const enTiempoMuerto = () => new Promise(r =>
  window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 30000 }) : setTimeout(r, 0));

/**
 * manual: llamada desde la consola (window.FrescuraPrecios.revisar()) para
 * probar sin esperar los 10 minutos de la primera revision.
 */
async function revisar({ manual = false } = {}) {
  const pm = window.productManager;
  if (revisando || document.hidden) return;
  if (!manual && performance.now() < PRIMERA_MS) return;
  if (!pm?.products?.size || !pm.actualizarDesde) return;

  revisando = true;
  try {
    const r = await fetch('./json/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const version = await r.json();
    // No cambiar nada debajo del pedido que se esta armando: solo la version
    // de la app (franja); lo demas, al cerrar el panel
    if (panelAbierto()) {
      document.dispatchEvent(new CustomEvent('version:leida', { detail: { app: version?.app } }));
      pendiente = version;
      esperarCierre();
      return;
    }
    pendiente = null;
    await aplicar(version);
  } catch (e) {
    console.warn('[Precios] No se pudo revisar la versión de productos:', e);
  } finally {
    revisando = false;
  }
}

/** Lo que trae una lectura de version.json: todo, en este orden */
async function aplicar(version) {
  // La misma lectura le sirve al buscador v2 (indice), a la app, a las
  // promociones y grupos de clientes y a las fotos
  document.dispatchEvent(new CustomEvent('version:leida', { detail: version }));
  try {
    await actualizarPrecios(version?.productos);
  } catch (e) {
    console.warn('[Precios] No se pudo actualizar los precios:', e);
  }
  // Despues de los precios: si cambiaron los dos, los destacados nuevos toman
  // los precios nuevos. No lanza
  await revisarDestacados(version?.catalogo_grupos);
}

/** Con una version pendiente, mirar cada 30 s (sin consultas) si ya se cerro el panel */
function esperarCierre() {
  if (reintentoProgramado) return;
  reintentoProgramado = true;
  setTimeout(() => { reintentoProgramado = false; aplicarPendiente(); }, REINTENTO_PANEL_MS);
}

/**
 * Aplica la version leida con el panel abierto, si ya se cerro. Con la
 * pestaña oculta no hace nada: al volver a ella se lee de nuevo
 */
async function aplicarPendiente() {
  if (!pendiente || document.hidden) return;
  if (panelAbierto() || revisando) { esperarCierre(); return; }
  const version = pendiente;
  pendiente = null;
  revisando = true;
  try {
    await aplicar(version);
  } catch (e) {
    console.warn('[Precios] No se pudo aplicar la versión pendiente:', e);
  } finally {
    revisando = false;
  }
}

/** v: version.productos. Si productos.json cambio, lo baja y actualiza la memoria */
async function actualizarPrecios(v) {
  const pm = window.productManager;
  if (!v?.huella || !v.generado) return;

  const generado = Date.parse(v.generado);
  const cargados = Number(sessionStorage.getItem('productos_cargados')) || 0;
  if (generado < cargados - MARGEN_MS) return;   // ya estan al dia

  await enTiempoMuerto();

  // La huella en la URL evita la copia vieja de la cache HTTP
  const datos = await (await fetch(`./json/productos.json?v=${encodeURIComponent(v.huella)}`)).json();
  // La misma descarga queda como copia compartida: lo que se cargue despues
  // (busqueda, carrito, promos) usa los precios nuevos sin bajarlo otra vez
  reemplazarProductos(datos);
  // Foto de los precios del pedido antes de cambiarlos, para el aviso
  const antes = preciosDelPedido();
  const { actualizados, cambios } = pm.actualizarDesde(datos);

  window.Precios?.repintarTodos();
  document.dispatchEvent(new CustomEvent('precios:actualizados', { detail: { cambios } }));
  console.info(`[Precios] productos.json cambió (${v.generado}): ${actualizados} productos ` +
    `actualizados, ${cambios.length} con otro precio`);

  // Solo si cambio el precio de alguna linea del pedido en vista (aviso-pedido.js)
  avisarCambiosDelPedido(antes, 'los precios');
}

// Primera revision a los 10 minutos; despues, cada 15
setTimeout(revisar, PRIMERA_MS);
setInterval(revisar, CADA_MS);
// Al volver a la pestaña (por ejemplo, a la mañana siguiente)
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });

// Para probar desde la consola: window.FrescuraPrecios.revisar(). Las pruebas
// usan aplicarPendiente para no esperar los 30 s
window.FrescuraPrecios = { revisar: () => revisar({ manual: true }), aplicarPendiente, pendiente: () => pendiente };
