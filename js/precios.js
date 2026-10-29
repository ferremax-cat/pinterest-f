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
 * nombre: el de clientes_finanzas.json, que es el actual (se regenera desde
 * el sistema de gestion); si no viene, el de clientes_permisos.json.
 * La lista de precios sigue saliendo de clientes_permisos.json.
 * @returns {Promise<object|null>} datos del cliente aplicado
 */
export async function setClienteVista(cuenta, nombre) {
  const permisos = await cargarPermisos();
  const datos = permisos[String(cuenta)];

  if (!datos || !datos.priceList) {
    console.warn('[Precios] Sin lista de precios para la cuenta', cuenta);
    return null;
  }

  const info = { cuenta: String(cuenta), lista: datos.priceList, nombre: nombre || datos.name || '' };
  sessionStorage.setItem('clienteVista', JSON.stringify(info));
  // El disponible es de cada cliente: al cambiar hay que descartarlo
  sessionStorage.removeItem('disponibleCliente');
  repintarTodos();
  window.Carrito?.refrescarBotonFlotante();
  // Por ejemplo, para que el contador de carritos pendientes deje de contar
  // el del cliente elegido
  document.dispatchEvent(new CustomEvent('cliente:cambio'));
  return info;
}

export function limpiarClienteVista() {
  sessionStorage.removeItem('clienteVista');
  sessionStorage.removeItem('disponibleCliente');
  repintarTodos();
  // Sin cliente, el boton flotante se oculta (igual que en setClienteVista)
  window.Carrito?.refrescarBotonFlotante();
  // Por ejemplo, para que el icono de carritos pendientes vuelva a contarlos todos
  document.dispatchEvent(new CustomEvent('cliente:cambio'));
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
  return `$${valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
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
    acomodarPildoras();
    return false;
  }

    // Los centavos mas chicos: si van del mismo tamano, el precio se lee
  // como si fuera mucho mas caro de lo que es
  const txt = formatearPrecio(precioMostrado(sku));
  const coma = txt.lastIndexOf(',');
  if (coma > -1) {
    elemento.innerHTML = txt.slice(0, coma) +
      '<span class="centavos">' + txt.slice(coma + 1) + '</span>';
  } else {
    elemento.textContent = txt;
  }
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


    // Cinta de promocion: el precio de la pildora sigue siendo el de lista,
  // la cinta avisa que hay un precio especial por cantidad
  if (window.Promos && window.Carrito?.carritoHabilitado()) {
    const fila2 = elemento.parentElement;
    const cont2 = fila2?.parentElement;
    const promo = window.Promos.promoDe(sku);

    let cinta = cont2?.querySelector(':scope > .cinta-promo');
    

        if (promo && cont2) {
      if (!cinta) {
        cinta = document.createElement('div');
        cinta.className = 'cinta-promo';
        cinta.style.cssText = 'position:absolute !important;top:18px !important;' +
          'left:0 !important;width:auto !important;height:auto !important;' +
          'z-index:20 !important;background:#639922 !important;color:#fff !important;' +
          'font-size:11px !important;font-weight:600 !important;' +
          'padding:3px 10px 3px 8px !important;border-radius:0 12px 12px 0 !important;' +
          'box-shadow:0 1px 4px rgba(0,0,0,.3) !important;margin:0 !important;';
        cont2.appendChild(cinta);
      }
      // Actualizar siempre: la cantidad minima puede cambiar segun el cliente
      cinta.textContent = `Promo desde ${promo.cantidadMinima} u.`;
    } else {
      cinta?.remove();
    }
  }

  // El precio cambia el ancho disponible para el codigo y el alto de la
  // pildora: se acomoda en la proxima pasada, junto con los demas precios.
  // El ancho de la pildora tambien lo fija esa pasada, antes de pintar
  acomodarPildoras();
  return true;
}

/**
 * Ancla la pildora al borde inferior de la imagen y le da el ancho del
 * contenedor. Los valores fijos del CSS fallan segun la cantidad de columnas.
 *
 * Se puede llamar muchas veces seguidas (cada precio, cada imagen, cada item
 * de busqueda): todas las llamadas de un mismo cuadro hacen una sola pasada,
 * justo antes de que el navegador pinte.
 */
let pedido = 0;   // requestAnimationFrame de la proxima pasada
let repaso = 0;   // setTimeout de la segunda pasada
export function acomodarPildoras() {
  if (pedido) return;
  pedido = requestAnimationFrame(() => {
    pedido = 0;
    acomodarAhora();
    // Segundo pase, uno solo, 250 ms despues de la ultima pasada: al repintar
    // precios la pildora cambia de alto y el top calculado antes queda corto.
    // Sin esto la pildora se pega al borde. No se vuelve a programar solo
    clearTimeout(repaso);
    repaso = setTimeout(() => {
      repaso = 0;
      if (!pedido) acomodarAhora();
    }, 250);
  });
}

// Si un contenedor cambia de tamano (layout Pinterest, imagen que termina de
// cargar, galeria que vuelve a mostrarse) se acomoda de nuevo. Cubre lo que
// antes cubria el reintento cada 250 ms, sin correr con la pagina quieta
const observados = new Set();
const observador = typeof ResizeObserver === 'function'
  ? new ResizeObserver(() => acomodarPildoras())
  : null;

// Una pasada completa. En cada etapa primero se lee todo y despues se escribe
// todo, para no forzar un recalculo de diseno por tarjeta. El resultado es el
// mismo que cuando se hacia tarjeta por tarjeta
function acomodarAhora() {
  acomodarAhora.pasadas = (acomodarAhora.pasadas || 0) + 1;   // para medir

  // Dejar de observar las tarjetas que ya no estan (busqueda nueva, galeria restaurada)
  for (const c of observados) {
    if (!c.isConnected) { observador.unobserve(c); observados.delete(c); }
  }

  // 1. Leer el ancho de cada contenedor
  const filas = [];
  document.querySelectorAll('.bottom-row').forEach(fila => {
    const cont = fila.parentElement;
    if (!cont) return;
    if (observador && !observados.has(cont)) { observados.add(cont); observador.observe(cont); }
    const ancho = cont.offsetWidth;
    if (!ancho) return;
    filas.push({ fila, cont, ancho, cod: fila.querySelector('a'), precio: fila.querySelector('.price-tag') });
  });

  // 2. Escribir el ancho de la pildora y devolver el codigo a su tamano normal
  for (const f of filas) {
    f.fila.style.setProperty('min-width', '0', 'important');
    f.fila.style.setProperty('max-width', 'none', 'important');
    f.fila.style.setProperty('width', (f.ancho - 8) + 'px', 'important');
    f.fila.style.setProperty('margin-left', '4px', 'important');
    if (f.cod && f.precio) f.cod.style.fontSize = '';
  }

  // 3. Achicar el codigo solo si no entra: los normales conservan su tamano.
  // Medio punto por ronda hasta el minimo, como antes; cada ronda escribe en
  // todos los que no entran y despues los mide todos juntos
  const minimo = 9.5;
  let achicar = [];
  for (const f of filas) {
    if (!f.cod || !f.precio) continue;
    achicar.push({
      cod: f.cod,
      disponible: f.fila.offsetWidth - f.precio.offsetWidth - 10,
      tam: parseFloat(getComputedStyle(f.cod).fontSize),
      ancho: f.cod.scrollWidth
    });
  }
  while ((achicar = achicar.filter(a => a.ancho > a.disponible && a.tam > minimo)).length) {
    for (const a of achicar) {
      a.tam -= 0.5;
      a.cod.style.setProperty('font-size', a.tam + 'px', 'important');
    }
    for (const a of achicar) a.ancho = a.cod.scrollWidth;
  }

  // 4. Leer las alturas
  const anclas = [];
  for (const f of filas) {
    const img = f.cont.querySelector('img');
    if (!img || !img.offsetHeight || !f.cont.offsetHeight) continue;
    // Descartar valores fuera del contenedor: en la busqueda la funcion
    // corre antes de que el layout este listo y calcula posiciones absurdas
    const propuesto = img.offsetHeight - f.fila.offsetHeight - 10;
    if (propuesto < 0 || propuesto > f.cont.offsetHeight) continue;
    anclas.push([f.fila, propuesto]);
  }

  // 5. Anclar la pildora al borde inferior de la imagen
  for (const [fila, propuesto] of anclas) {
    fila.style.bottom = 'auto';
    fila.style.top = propuesto + 'px';
  }
}

let tempAcomodar;
window.addEventListener('resize', () => {
  clearTimeout(tempAcomodar);
  tempAcomodar = setTimeout(acomodarPildoras, 150);
});

// Cada imagen que termina de cargar pide una pasada; las que cargan en el
// mismo cuadro comparten una sola
document.addEventListener('load', (e) => {
  if (e.target.tagName === 'IMG') acomodarPildoras();
}, true);

// Al terminar de cargar la pagina y las fuentes: el ancho del codigo depende
// de la fuente (efecto que antes daba el reintento)
if (document.readyState === 'complete') acomodarPildoras();
else window.addEventListener('load', () => acomodarPildoras(), { once: true });
document.fonts?.ready.then(() => acomodarPildoras());


// Disponible tambien sin modulos, para las rutas que estan en catalogo.html.
// _acomodarAhora: una pasada inmediata, solo para medir desde la consola
window.Precios = { precioLista, precioMostrado, formatearPrecio, pintarPrecio,
setClienteVista, getClienteVista, limpiarClienteVista, repintarTodos, acomodarPildoras,
_acomodarAhora: acomodarAhora
 };