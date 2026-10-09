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
 * cambian una vez por dia), nunca con el panel del carrito abierto, y la
 * descarga se hace en un tiempo muerto del navegador. Solo se avisa si
 * cambio el precio de algo que el usuario tiene en el carrito.
 */

const PRIMERA_MS = 10 * 60 * 1000;     // primera revision despues de cargar
const CADA_MS = 15 * 60 * 1000;        // revision periodica
const REINTENTO_PANEL_MS = 30 * 1000;  // con el panel abierto, volver a probar
// Margen por la cache HTTP del servidor (unos 10 min): si el archivo se
// genero poco antes de cargar los precios, la copia cargada pudo ser la vieja
const MARGEN_MS = 15 * 60 * 1000;
const AVISO_MS = 5000;

let revisando = false;
let reintentoProgramado = false;

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

  // No competir con lo que el usuario esta haciendo en el carrito
  if (panelAbierto()) {
    if (!reintentoProgramado) {
      reintentoProgramado = true;
      setTimeout(() => { reintentoProgramado = false; revisar(); }, REINTENTO_PANEL_MS);
    }
    return;
  }

  revisando = true;
  try {
    const r = await fetch('./json/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.json())?.productos;
    if (!v?.huella || !v.generado) return;

    const generado = Date.parse(v.generado);
    const cargados = Number(sessionStorage.getItem('productos_cargados')) || 0;
    if (generado < cargados - MARGEN_MS) return;   // ya estan al dia

    await enTiempoMuerto();

    // La huella en la URL evita la copia vieja de la cache HTTP
    const datos = await (await fetch(`./json/productos.json?v=${encodeURIComponent(v.huella)}`)).json();
    const { actualizados, cambios } = pm.actualizarDesde(datos);

    window.Precios?.repintarTodos();
    document.dispatchEvent(new CustomEvent('precios:actualizados', { detail: { cambios } }));
    console.info(`[Precios] productos.json cambió (${v.generado}): ${actualizados} productos ` +
      `actualizados, ${cambios.length} con otro precio`);

    avisarSiCambioElPedido(cambios);
  } catch (e) {
    console.warn('[Precios] No se pudo revisar la versión de productos:', e);
  } finally {
    revisando = false;
  }
}

/**
 * Avisa solo si cambio el precio de algun articulo del carrito actual, con
 * la lista que se le aplica (la del cliente en vista o la del usuario). Si
 * no hay nada cargado o no cambio, la actualizacion queda en silencio.
 */
function avisarSiCambioElPedido(cambios) {
  if (!cambios.length || !window.Carrito) return;

  const enCarrito = new Set(window.Carrito.leer().map(l => String(l.sku).toUpperCase()));
  if (!enCarrito.size) return;

  const lista = window.Precios?.getClienteVista()?.lista || window.productManager?.clientData?.priceList;
  const n = cambios.filter(c => enCarrito.has(c.codigo) &&
    (lista ? Number(c.antes[lista]) !== Number(c.despues[lista]) : true)).length;
  if (!n) return;

  // Mismo estilo que los avisos flotantes de la app, en gris informativo
  const av = document.createElement('div');
  av.className = 'aviso-precios';
  av.textContent = n === 1
    ? 'Se actualizaron los precios: 1 artículo de tu pedido cambió de precio.'
    : `Se actualizaron los precios: ${n} artículos de tu pedido cambiaron de precio.`;
  av.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:80px;background:#333;color:#fff;padding:12px 18px;' +
      'border-radius:8px;font-size:13px;z-index:99999;text-align:center;' +
      'max-width:90vw;box-shadow:0 4px 14px rgba(0,0,0,.3)';
  document.querySelectorAll('.aviso-precios').forEach(a => a.remove());
  document.body.appendChild(av);
  setTimeout(() => av.remove(), AVISO_MS);
}

// Primera revision a los 10 minutos; despues, cada 15
setTimeout(revisar, PRIMERA_MS);
setInterval(revisar, CADA_MS);
// Al volver a la pestaña (por ejemplo, a la mañana siguiente)
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });

// Para probar desde la consola: window.FrescuraPrecios.revisar()
window.FrescuraPrecios = { revisar: () => revisar({ manual: true }) };
