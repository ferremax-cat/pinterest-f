/**
 * HISTORIAL DE COMPRAS DEL CLIENTE ELEGIDO (solo vendedor y admin)
 *
 * Al elegir un cliente se pide al servidor (accion historial_cliente) lo que
 * compro en los ultimos 12 meses: codigo, fecha y cantidad de la ultima compra.
 * Se pide una sola vez, en segundo plano, y queda solo en la memoria de esta
 * pagina: nunca en localStorage ni en sessionStorage. Al cambiar de cliente se
 * descarta; al cerrar sesion o recargar, se pierde con la pagina.
 *
 * Lo usan:
 *  - search-engine.js: el buscador v2 pone primero, dentro de cada grupo de
 *    resultados, lo que el cliente ya compro (comprados). Si llega con una
 *    busqueda en pantalla, la rehace o muestra un aviso (historial:listo);
 *  - la tarjeta de resultados: "Comprado 28/10 · 2 u." debajo del nombre (pintar);
 *  - js/habituales.js: el icono Habituales de la barra y la sugerencia del
 *    carrito, con las listas que arma la rutina (listas()).
 * Mientras no llega, o si falla, todo funciona como hoy.
 */

const ROLES = ['admin', 'vendedor_estandar'];

// { cuenta, actualizado, articulos: Map(codigo -> { fecha, cantidad }),
//   habituales: [{ sku, veces, tipica, ultima, toca }], dejo: [{ sku, veces, tipica, ultima }] }
let actual = null;
let pidiendo = '';     // cuenta cuyo historial se esta pidiendo

function cuentaElegida() {
  const cli = window.Precios?.getClienteVista();
  return cli ? String(cli.cuenta) : '';
}

function puedeVer() {
  const rol = sessionStorage.getItem('authRol') || window.menuFuncionalidades?.usuarioActual?.rol || '';
  return ROLES.includes(rol);
}

async function pedir() {
  const cuenta = cuentaElegida();
  // Otro cliente, o ninguno: lo del anterior se descarta y se saca de las tarjetas
  if (actual && actual.cuenta !== cuenta) {
    actual = null;
    pintarTarjetas();
  }
  if (!cuenta || actual || pidiendo === cuenta || !puedeVer()) return;
  if (!sessionStorage.getItem('authToken')) return;   // se vuelve a intentar con auth:token-listo

  pidiendo = cuenta;
  try {
    // En segundo plano (api.js): sale con la cola vacia y cede el paso a
    // cualquier otra llamada, asi nunca demora un pedido, el cupo ni nada mas.
    // El token se toma al salir, por si se renovo mientras esperaba
    const d = await window.Api.llamarEnSegundoPlano(
      () => ({ accion: 'historial_cliente', token: sessionStorage.getItem('authToken'), cuenta }),
      () => cuentaElegida() === cuenta
    );
    // Mientras se esperaba, el vendedor eligio otro cliente: ya no sirve
    if (cuentaElegida() !== cuenta) return;
    if (!d?.ok) {
      console.warn('[Historial] No se pudo traer el historial:', d?.error);
      return;
    }
    // Con un servidor sin las listas llegan vacias
    const fila = x => ({ sku: String(x[0]), veces: Number(x[1]) || 0, tipica: Number(x[2]) || 0,
      ultima: String(x[3] || ''), toca: String(x[4] || '') });
    actual = {
      cuenta,
      actualizado: d.actualizado || '',
      articulos: new Map((d.articulos || []).map(a => [a[0], { fecha: a[1], cantidad: a[2] }])),
      // Ya armadas por la rutina; las muestra js/habituales.js
      habituales: (d.habituales || []).map(fila),
      dejo: (d.dejo || []).map(fila)
    };
    console.log(`[Historial] ${actual.articulos.size} artículos comprados (actualizado ${d.actualizado || '-'})`);
    pintarTarjetas();
    // search-engine.js: si hay una búsqueda en pantalla hecha sin historial, la
    // rehace o muestra el aviso "Ver primero lo que compró" (alLlegarHistorial)
    document.dispatchEvent(new CustomEvent('historial:listo'));
  } catch (err) {
    // cedido: no hubo un hueco sin otras llamadas; descartado: cambio el cliente.
    // Se vuelve a pedir con el proximo cliente:cambio o auth:token-listo
    console.warn('[Historial] Sin historial por ahora:', err?.message || err);
  } finally {
    if (pidiendo === cuenta) pidiendo = '';
  }
}

/** Lo que compró el cliente elegido (Map por código de productos.json), o null. */
function comprados() {
  return actual && actual.cuenta === cuentaElegida() ? actual.articulos : null;
}

// "28/10" si es de este año; si no, "28/10/25"
function fechaCorta(iso) {
  const [a, m, d] = String(iso).split('-');
  return a === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${a.slice(2)}`;
}

/**
 * Pone o saca "Comprado 28/10 · 2 u." en una tarjeta de resultados. Va en la
 * franja blanca del nombre, debajo de la foto: no toca la cinta de promo, el
 * carrito ni la pildora, que estan sobre la imagen. Todo con textContent
 */
function pintar(item) {
  const fila = item?.querySelector('.top-row');
  if (!fila) return;
  item.dataset.historial = '1';   // para que pintarTarjetas la vuelva a mirar
  const compra = comprados()?.get(item.dataset.productCode);
  let linea = fila.querySelector(':scope > .compra-cliente');
  if (!compra) {
    linea?.remove();
    fila.classList.remove('con-compra');
    return;
  }
  if (!linea) {
    linea = document.createElement('span');
    linea.className = 'compra-cliente';
    linea.title = 'Última compra de este cliente (últimos 12 meses)';
    fila.appendChild(linea);
  }
  const icono = document.createElement('i');
  icono.className = 'fas fa-history';
  icono.setAttribute('aria-hidden', 'true');
  const cantidad = Number(compra.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  linea.replaceChildren(icono, `Comprado ${fechaCorta(compra.fecha)} · ${cantidad} u.`);
  fila.classList.add('con-compra');
}

/** Repinta todas las tarjetas de resultados con el historial vigente. */
function pintarTarjetas() {
  document.querySelectorAll('.gallery-item[data-historial]').forEach(pintar);
}

/** Habituales y dejó de comprar del cliente elegido, o null si no llegaron. */
function listas() {
  return actual && actual.cuenta === cuentaElegida()
    ? { cuenta: actual.cuenta, actualizado: actual.actualizado, habituales: actual.habituales, dejo: actual.dejo }
    : null;
}

window.HistorialCliente = { comprados, listas, pintar, pintarTarjetas };

// setClienteVista y limpiarClienteVista (precios.js) avisan con cliente:cambio;
// el personal recibe el token un rato despues de entrar (sesion.js)
document.addEventListener('cliente:cambio', pedir);
document.addEventListener('auth:token-listo', pedir);
pedir();
