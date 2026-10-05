/**
 * PROMOCIONES
 *
 * Una promocion aplica si el cliente pertenece al grupo, la vigencia no
 * vencio, y la cantidad alcanza el minimo. El precio de lista sigue siendo
 * el que manda mientras no se llegue a esa cantidad.
 */

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
 * o el propio si es cliente.
 */
function cuentaActiva() {
  const enVista = window.Precios?.getClienteVista();
  if (enVista) return String(enVista.cuenta);
  try {
    return String(JSON.parse(localStorage.getItem('clientData') || '{}').account || '');
  } catch (e) {
    return '';
  }
}

/**
 * Promocion vigente de un producto para la cuenta activa, o null.
 * @returns {{precio:number, cantidadMinima:number, vigencia:string}|null}
 */
export function promoDe(sku) {
  if (!promosCache) return null;

  const promo = promosCache[String(sku).trim().toUpperCase()];
  if (!promo || !vigente(promo)) return null;

  const grupo = grupoDe(cuentaActiva());
  if (!grupo || !(promo.grupos || []).includes(grupo)) return null;

  return {
    precio: Number(promo.precio) || 0,
    cantidadMinima: Number(promo.cantidadMinima) || 1,
    vigencia: promo.vigencia
  };
}

/**
 * Precio que corresponde por cantidad: el promocional si alcanza el minimo,
 * o null para que el llamador use el de lista.
 */
export function precioPromo(sku, cantidad) {
  const p = promoDe(sku);
  if (!p) return null;
  return Number(cantidad) >= p.cantidadMinima ? p.precio : null;
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
    .map(([sku, p]) => ({
      sku,
      precio: Number(p.precio) || 0,
      cantidadMinima: Number(p.cantidadMinima) || 1,
      vigencia: p.vigencia
    }));
}

await cargarDatos();

window.Promos = { promoDe, precioPromo, promosActivas };