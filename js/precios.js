/**
 * Fuente unica de verdad para los precios de Ferremax.
 *
 * REGLA: ningun lugar de la app calcula precios por su cuenta,
 * ni los lee del DOM, ni de planillas, ni de los indices de busqueda.
 * Todos llaman a estas funciones.
 */

// --- Cliente en vista (solo vendedor) ---
// Si el vendedor selecciona un cliente, los precios pasan a ser los de ese
// cliente. Se guarda en sessionStorage para que las rutas que pintan despues
// (scroll, busquedas) usen la lista correcta sin saber nada de esto.

let permisosCache = null;

async function cargarPermisos() {
  if (permisosCache) return permisosCache;
  const resp = await fetch('./json/clientes_permisos.json');
  permisosCache = await resp.json();
  return permisosCache;
}

export function getClienteVista() {
  // El rol sale del token si existe; si no, de menuFuncionalidades.
  // Asi funciona con o sin el login por endpoint.
  let rol = sessionStorage.getItem('authRol');
  if (!rol) {
    rol = window.menuFuncionalidades?.usuarioActual?.rol || '';
  }
  if (rol === 'cliente_estandar') return null;

  const raw = sessionStorage.getItem('clienteVista');
  return raw ? JSON.parse(raw) : null;
}

/**
 * Fija el cliente cuyos precios se muestran y repinta lo visible.
 * @returns {Promise<object|null>} datos del cliente aplicado
 */
export async function setClienteVista(cuenta) {
  const permisos = await cargarPermisos();
  const datos = permisos[String(cuenta)];

  if (!datos || !datos.priceList) {
    console.warn('[Precios] Sin lista de precios para la cuenta', cuenta);
    return null;
  }

  const info = { cuenta: String(cuenta), lista: datos.priceList, nombre: datos.name || '' };
  sessionStorage.setItem('clienteVista', JSON.stringify(info));
  repintarTodos();
  return info;
}

export function limpiarClienteVista() {
  sessionStorage.removeItem('clienteVista');
  repintarTodos();
}

/**
 * Repinta todos los precios visibles con la lista vigente.
 */
export function repintarTodos() {
  let n = 0;
  document.querySelectorAll('.price-tag[data-sku]').forEach(tag => {
    pintarPrecio(tag, tag.dataset.sku);
    n++;
  });
  console.log('[Precios] Repintados', n, 'precios');
  return n;
}


/**
 * Precio de lista del cliente activo.
 * Es el numero que manda: va al carrito, al pedido y a los calculos.
 * Sincrono: ProductManager ya tiene los productos en memoria.
 *
 * @param {string} sku
 * @returns {number|null} precio, o null si el producto no esta disponible
 */
export function precioLista(sku) {
  const pm = window.productManager;
  if (!pm) return null;

  const codigo = String(sku).trim().toUpperCase();
  const producto = pm.getProduct(codigo);
  if (!producto) return null;

  // El cliente en vista (elegido por el vendedor) tiene prioridad
  const enVista = getClienteVista();
  const lista = enVista ? enVista.lista : pm.clientData?.priceList;

  // Preferimos resolver desde las tres listas
  if (lista && producto.precios && producto.precios[lista] !== undefined) {
    return producto.precios[lista];
  }

  // Respaldo: el precio ya resuelto al cargar
  if (producto.precio !== undefined && producto.precio !== null) {
    return producto.precio;
  }

  return null;
}

/**
 * Precio para mostrar en pantalla.
 * Aplica el margen de reventa solo si el modo P.V esta activo.
 * NUNCA se usa para un pedido.
 *
 * @param {string} sku
 * @returns {number|null}
 */
export function precioMostrado(sku) {
  const base = precioLista(sku);
  if (base === null) return null;

  const modo = localStorage.getItem('precioModo') || 'lista';
  if (modo !== 'venta') return base;

  const margen = parseFloat(localStorage.getItem('margenCliente') || '0');
  if (!margen) return base;

  return Math.round(base * (1 + margen / 100));
}

/**
 * Formatea un precio para mostrar. Devuelve '' si no hay precio.
 */
export function formatearPrecio(valor) {
  if (valor === null || valor === undefined) return '';
  return `$${valor.toLocaleString('es-AR')}`;
}

/**
 * Pinta el precio en un elemento .price-tag.
 * Guarda el precio de lista en el dataset para auditoria,
 * pero NUNCA lo lee de ahi para calcular.
 */
export function pintarPrecio(elemento, sku) {
  const base = precioLista(sku);
  if (base === null) {
    elemento.textContent = '';
    return false;
  }

  elemento.textContent = formatearPrecio(precioMostrado(sku));
  elemento.dataset.precioLista = base;
  elemento.dataset.sku = sku;
  // Marcar como procesado para que el sistema viejo de margenes no lo
  // sobrescriba: precioMostrado ya aplica P.V cuando corresponde
  elemento.dataset.processed = 'true';
    // Clase del modo: el CSS pinta de naranja cuando esta en P.V
  const modo = localStorage.getItem('precioModo') || 'lista';
  elemento.className = 'price-tag ' + modo;

  // Icono del carrito: se coloca junto al precio, asi aparece en todas
  // las rutas de render sin tocar cada una
  if (window.Carrito) {
    window.Carrito.ponerIcono(elemento.parentElement, sku);
  }

    // Anclar la pildora al borde inferior de la imagen: el contenedor puede
  // ser mas alto que la imagen y el valor fijo la dejaba flotando
  const fila = elemento.parentElement;
  const img = fila?.parentElement?.querySelector('img');
  if (fila && img && img.offsetHeight) {
    fila.style.bottom = 'auto';
    fila.style.top = (img.offsetHeight - fila.offsetHeight - 10) + 'px';
  }

  return true;
}

/**
 * Reubica las pildoras al borde inferior de su imagen.
 * Hace falta recalcular: al cambiar la cantidad de columnas, las imagenes
 * cambian de alto y el valor anterior queda viejo.
 */
export function acomodarPildoras() {
  document.querySelectorAll('.bottom-row').forEach(fila => {
    const cont = fila.parentElement;
    const img = cont?.querySelector('img');
    if (!img || !img.offsetHeight || !cont.offsetHeight) return;

    const propuesto = img.offsetHeight - fila.offsetHeight - 10;

    // Descartar valores fuera del contenedor: en la busqueda la funcion
    // corre antes de que el layout este listo y calcula posiciones absurdas
    if (propuesto < 0 || propuesto > cont.offsetHeight) return;

    fila.style.bottom = 'auto';
    fila.style.top = propuesto + 'px';
  });
}

// Recalcular al redimensionar y al terminar de cargar cada imagen
let tempAcomodar;
window.addEventListener('resize', () => {
  clearTimeout(tempAcomodar);
  tempAcomodar = setTimeout(acomodarPildoras, 150);
});

document.addEventListener('load', (e) => {
  if (e.target.tagName === 'IMG') acomodarPildoras();
}, true);

// Disponible tambien sin modulos, para las rutas que estan en catalogo.html
window.Precios = { precioLista, precioMostrado, formatearPrecio, pintarPrecio,
setClienteVista, getClienteVista, limpiarClienteVista, repintarTodos,
  acomodarPildoras  
 };