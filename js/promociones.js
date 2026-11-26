/**
 * PROMOCIONES
 *
 * Una promocion aplica si el cliente pertenece al grupo y la vigencia no
 * vencio. Por cantidad del renglon (en unidades sueltas, las del casillero
 * del vendedor; el bulto es solo una referencia):
 *   - por debajo de cantidadMinima: no hay promocion (lista del cliente);
 *   - desde cantidadMinima: el precio especial;
 *   - desde cada tramo ("desde"): el precio especial con el % del tramo. Se
 *     aplica el tramo de mayor "desde" que alcance la cantidad.
 * La unica cuenta del precio de promocion es precioDeEscalon: la usan el
 * carrito (detalle), el dialogo de cantidad, la cinta y el panel de promos.
 *
 * Frescura: con la pagina abierta, frescura-precios.js lee json/version.json
 * cada 15 minutos y avisa con 'version:leida'; si cambio la huella de
 * promociones.json o la de grupos_clientes.json (un cliente cambiado de
 * grupo), se baja de nuevo lo que cambio y se repinta lo visible una sola vez
 * (revisarPromos).
 */

import { preciosDelPedido, avisarCambiosDelPedido } from './aviso-pedido.js';

let promosCache = null;
let gruposCache = null;

async function cargarDatos() {
  if (promosCache && gruposCache) return;

  try {
    const [rp, rg] = await Promise.all([
      fetch('./json/promociones.json'),
      fetch('./json/grupos_clientes.json')
    ]);
    promosCache = (await rp.json()).promotions || {};
    gruposCache = (await rg.json()).groups || {};
  } catch (e) {
    console.warn('[Promos] No se pudieron cargar:', e);
    promosCache = {};
    gruposCache = {};
  }
}

/**
 * Grupo al que pertenece la cuenta. Cada cliente esta en uno solo.
 */
function grupoDe(cuenta) {
  if (!gruposCache) return null;
  const c = String(cuenta);
  for (const [nombre, cuentas] of Object.entries(gruposCache)) {
    if (cuentas.includes(c)) return nombre;
  }
  return null;
}

function vigente(promo) {
  if (!promo.vigencia) return true;
  const hasta = new Date(promo.vigencia + 'T23:59:59');
  return !isNaN(hasta) && hasta >= new Date();
}

/**
 * Cuenta a la que se le arma el pedido: el cliente en vista si es vendedor,
 * o el propio si es cliente. Un vendedor sin cliente elegido no tiene
 * cuenta activa: usar la suya mostraba las promociones de SU grupo, que
 * no son las del cliente al que le va a vender.
 */
function cuentaActiva() {
  const enVista = window.Precios?.getClienteVista();
  if (enVista) return String(enVista.cuenta);

  const rol = sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol || '';
  if (rol !== 'cliente_estandar') return '';

  try {
    return String(JSON.parse(localStorage.getItem('clientData') || '{}').account || '');
  } catch (e) {
    return '';
  }
}

/** Tramos validos de una promocion del JSON, ordenados por cantidad */
function tramosDe(promo) {
  return (Array.isArray(promo.tramos) ? promo.tramos : [])
    .map(t => ({ desde: Math.floor(Number(t?.desde)) || 0, desc: Number(t?.desc) || 0 }))
    .filter(t => t.desde >= 1 && t.desc > 0 && t.desc < 100)
    .sort((a, b) => a.desde - b.desde);
}

/** Lo que devuelven promoDe y promosActivas */
function datosDe(sku, promo) {
  return {
    sku,
    precio: Number(promo.precio) || 0,
    cantidadMinima: Number(promo.cantidadMinima) || 1,
    vigencia: promo.vigencia,
    tramos: tramosDe(promo)
  };
}

/**
 * Promocion vigente de un producto para la cuenta activa, o null.
 * @returns {{sku:string, precio:number, cantidadMinima:number, vigencia:string,
 *   tramos:Array<{desde:number, desc:number}>}|null}
 */
export function promoDe(sku) {
  if (!promosCache) return null;

  const codigo = String(sku).trim().toUpperCase();
  const promo = promosCache[codigo];
  if (!promo || !vigente(promo)) return null;

  const grupo = grupoDe(cuentaActiva());
  if (!grupo || !(promo.grupos || []).includes(grupo)) return null;

  return datosDe(codigo, promo);
}

// Dos decimales sin el error de coma flotante (como el servidor)
const r2 = x => Math.round(Number((x * 100).toFixed(6))) / 100;

/**
 * Precio de un escalon de la promocion: desde = cantidadMinima (el precio
 * especial, sin descuento) o el "desde" de un tramo (precio especial menos el
 * % del tramo, a dos decimales por unidad). null si la promocion no esta
 * vigente para la cuenta o ese escalon no existe.
 * Es la unica cuenta del precio de promocion.
 */
export function precioDeEscalon(sku, desde) {
  const p = promoDe(sku);
  if (!p) return null;
  const d = Number(desde);
  const t = p.tramos.find(x => x.desde === d);
  if (!t && d !== p.cantidadMinima) return null;
  return {
    precio: t ? r2(p.precio * (1 - t.desc / 100)) : p.precio,
    precioEspecial: p.precio,
    pct: t ? t.desc : 0,
    desde: d,
    cantidadMinima: p.cantidadMinima,
    conTramos: p.tramos.length > 0
  };
}

/**
 * Lo que corresponde por cantidad: el tramo de mayor "desde" que alcance la
 * cantidad, o el precio especial desde el minimo. null sin promocion o por
 * debajo de cantidadMinima (el llamador usa la lista del cliente).
 */
export function precioSegunCantidad(sku, cantidad) {
  const p = promoDe(sku);
  const n = Number(cantidad) || 0;
  if (!p || n < p.cantidadMinima) return null;
  const t = p.tramos.filter(x => n >= x.desde).pop();
  return precioDeEscalon(sku, t ? t.desde : p.cantidadMinima);
}

/**
 * Precio que corresponde por cantidad: el de promocion si alcanza el minimo,
 * o null para que el llamador use el de lista.
 */
export function precioPromo(sku, cantidad) {
  return precioSegunCantidad(sku, cantidad)?.precio ?? null;
}

/** El proximo tramo por encima de la cantidad ({desde, desc}), o null */
export function siguienteTramo(sku, cantidad) {
  const p = promoDe(sku);
  const n = Number(cantidad) || 0;
  return p?.tramos.find(t => t.desde > n) || null;
}

const fmtPct = d => String(d).replace('.', ',');

/**
 * Los tramos en texto: "5 o más: −5 % · 10 o más: −8 %"; corto (cinta):
 * "5+: extra −5 % · 10+: −8 %" ("extra" solo en el primero: el tramo se suma
 * al precio de promocion, que ya rige desde el minimo). Sin tramos, ''.
 * Nunca "x5": se leeria como que el articulo viene de a 5, como el bulto.
 */
export function textoTramos(p, corto = false) {
  return (p?.tramos || []).map((t, i) => corto
    ? `${t.desde}+: ${i === 0 ? 'extra ' : ''}−${fmtPct(t.desc)} %`
    : `${t.desde} o más: −${fmtPct(t.desc)} %`).join(' · ');
}

/**
 * Todas las promociones vigentes para la cuenta activa.
 */
export function promosActivas() {
  if (!promosCache) return [];
  const grupo = grupoDe(cuentaActiva());
  if (!grupo) return [];

  return Object.entries(promosCache)
    .filter(([, p]) => vigente(p) && (p.grupos || []).includes(grupo))
    .map(([sku, p]) => datosDe(sku, p));
}

// ---------- frescura (ver frescura-precios.js) ----------

// Margen por la cache HTTP del servidor (unos 10 min), como precios y destacados
const MARGEN_MS = 15 * 60 * 1000;
const cargadasEn = Date.now();
let huellaPromos = null;
let huellaGrupos = null;

const enTiempoMuerto = () => new Promise(r =>
  window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 30000 }) : setTimeout(r, 0));

/** Cargado despues de generarse ese archivo: ya esta al dia (la primera vez) */
const alDia = (v, vista) => !vista && !!v?.huella && Date.parse(v.generado) < cargadasEn - MARGEN_MS;

/** La clave del JSON de esa URL, o null si no llego bien (se reintenta en la proxima revision) */
async function bajar(url, clave) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = (await r.json())?.[clave];
    return d && typeof d === 'object' ? d : null;
  } catch (e) {
    console.warn('[Promos] No se pudo bajar ' + url + ':', e);
    return null;
  }
}

/**
 * version: lo que leyo frescura-precios.js ({ promociones, grupos_clientes,
 * ... }, cada uno { huella, generado }). Si cambio alguno, baja lo que cambio,
 * lo reemplaza en memoria y repinta lo visible una sola vez. Los tramos
 * otorgados que ya no existen (o que el cliente ya no tiene, por estar en otro
 * grupo) vuelven al precio por cantidad. Avisa solo si cambio el precio de
 * alguna linea del pedido. No lanza.
 */
async function revisarPromos(version) {
  try {
    const p = version?.promociones, g = version?.grupos_clientes;
    if (alDia(p, huellaPromos)) huellaPromos = p.huella;
    if (alDia(g, huellaGrupos)) huellaGrupos = g.huella;
    const bajarPromos = !!p?.huella && p.huella !== huellaPromos;
    const bajarGrupos = !!g?.huella && g.huella !== huellaGrupos;
    if (!bajarPromos && !bajarGrupos) return;

    await enTiempoMuerto();
    // La huella en la URL evita la copia vieja de la cache HTTP
    const [nuevas, grupos] = await Promise.all([
      bajarPromos ? bajar(`./json/promociones.json?v=${encodeURIComponent(p.huella)}`, 'promotions') : null,
      bajarGrupos ? bajar(`./json/grupos_clientes.json?v=${encodeURIComponent(g.huella)}`, 'groups') : null
    ]);
    if (!nuevas && !grupos) return;

    const antes = preciosDelPedido();
    if (nuevas) { promosCache = nuevas; huellaPromos = p.huella; }
    if (grupos) { gruposCache = grupos; huellaGrupos = g.huella; }
    const quitados = window.Carrito?.limpiarOtorgadosInvalidos?.() || 0;

    window.Precios?.repintarTodos?.();
    document.dispatchEvent(new CustomEvent('promos:actualizadas'));
    console.info('[Promos] ' + [nuevas && `promociones.json cambió: ${Object.keys(nuevas).length} promociones`,
      grupos && `grupos_clientes.json cambió: ${Object.keys(grupos).length} grupos`].filter(Boolean).join('; '));
    avisarCambiosDelPedido(antes, 'las promociones', quitados);
  } catch (e) {
    console.warn('[Promos] No se pudieron actualizar:', e);
  }
}

document.addEventListener('version:leida', e => revisarPromos(e.detail));

await cargarDatos();

window.Promos = {
  promoDe, precioDeEscalon, precioSegunCantidad, precioPromo, siguienteTramo, textoTramos, promosActivas
};
