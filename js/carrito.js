/**
 * CARRITO DE COMPRAS FERREMAX
 *
 * Reglas que gobiernan este modulo:
 * - Guarda SKU y cantidad. El precio se pide siempre a js/precios.js
 *   y se resuelve al mostrar, nunca se congela aca.
 * - Cada par (operador, cliente destino) tiene su propio carrito, para que
 *   el vendedor pueda atender varios clientes en paralelo.
 * - El orden de carga se conserva: define el semaforo acumulativo.
 */

const PREFIJO = 'carrito::';



// Mapa de imagenes: se carga una vez y sirve para los productos que se
// agregan sin haber pasado por una tarjeta del catalogo
let mapaImagenes = null;

(async () => {
  try {
    const r = await fetch('./json/catalogo_imagenes.json');
    mapaImagenes = (await r.json()).images || {};
  } catch (e) {
    mapaImagenes = {};
  }
})();

// ---------- identidad ----------

/**
 * El vendedor necesita un cliente elegido: sin eso el pedido no tiene
 * destinatario y los precios que se muestran no son los de nadie.
 */
function faltaCliente() {

  if (sessionStorage.getItem('authDegradado') === '1') return true;  
  const rol = sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol
      || '';
  if (rol === 'cliente_estandar') return false;
  return !window.Precios?.getClienteVista();
}


function getOperador() {
  const u = window.menuFuncionalidades?.usuarioActual;
  return String(u?.clave || 'anonimo');
}

function getRol() {
  return sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol
      || '';
}

/**
 * Cliente al que se le esta cargando el pedido.
 * Para el vendedor es el que tenga seleccionado; para el cliente, el mismo.
 */
export function getClienteDestino() {
  if (getRol() !== 'cliente_estandar' && window.Precios) {
    const enVista = window.Precios.getClienteVista();
    if (enVista) return String(enVista.cuenta);
  }
  try {
    const cd = JSON.parse(localStorage.getItem('clientData') || '{}');
    return String(cd.account || '');
  } catch (e) {
    return '';
  }
}

function claveCarrito(cliente) {
  return PREFIJO + getOperador() + '::' + (cliente || getClienteDestino());
}

// ---------- lectura y escritura ----------

export function leer(cliente) {
  try {
    const raw = localStorage.getItem(claveCarrito(cliente));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[Carrito] No se pudo leer:', e);
    return [];
  }
}

function guardar(lineas, cliente) {
  try {
    localStorage.setItem(claveCarrito(cliente), JSON.stringify(lineas));
    document.dispatchEvent(new CustomEvent('carrito:cambio', {
      detail: { cliente: cliente || getClienteDestino(), lineas }
    }));
    return true;
  } catch (e) {
    console.error('[Carrito] No se pudo guardar:', e);
    return false;
  }
}

// ---------- operaciones ----------

export function agregar(sku, cantidad, cliente) {

  if (faltaCliente()) {
    document.dispatchEvent(new CustomEvent('carrito:sin-cliente'));
    return null;
  }

  const codigo = String(sku).trim().toUpperCase();
  const cant = Number(cantidad);
  if (!codigo || !cant || cant <= 0) return null;

  const lineas = leer(cliente);
  const existente = lineas.find(l => l.sku === codigo);

  if (existente) {
    existente.cantidad = cant;
  } else {
       
    const p = window.productManager?.getProduct(codigo);

    // Guardar la imagen que ya cargo el catalogo: si el usuario busca otra
    // cosa, la tarjeta desaparece y el carrito se queda sin la referencia
        // Primero la del catalogo si esta en pantalla; si no, el mapa de imagenes
        // Primero la del catalogo si esta en pantalla; si no, el mapa de imagenes
    let img = document.querySelector(`.price-tag[data-sku="${codigo}"]`)
      ?.closest('.container-img')?.querySelector('img')?.src || null;

    if (!img && mapaImagenes?.[codigo]) {
      img = `https://lh3.googleusercontent.com/d/${mapaImagenes[codigo]}`;
    }

    // Respaldo del precio: el manager carga productos bajo demanda y puede
    // no tenerlo mas adelante. El precio vigente se sigue pidiendo a Precios
    const precioResp = window.Precios?.precioLista(codigo) ?? null;  

    // Con que lista se calculo el respaldo: permite detectar despues si
    // corresponde al cliente correcto antes de guardar el pedido
    const listaResp = window.Precios?.getClienteVista()?.lista
      || JSON.parse(localStorage.getItem('clientData') || '{}').priceList
      || null;

    lineas.push({
      sku: codigo,
      cantidad: cant,
      orden: lineas.length,
      nombre: p?.nombre || '',
      bulto: p?.bulto || null,
      img,
      precioResp,
      listaResp,
      agregado: Date.now()
    });
  }

  guardar(lineas, cliente);
  return lineas;
}

export function quitar(sku, cliente) {
  const codigo = String(sku).trim().toUpperCase();
  const lineas = leer(cliente).filter(l => l.sku !== codigo);
  lineas.forEach((l, i) => { l.orden = i; });
  guardar(lineas, cliente);
  return lineas;
}

export function vaciar(cliente) {
  localStorage.removeItem(claveCarrito(cliente));
  localStorage.removeItem(claveCarrito(cliente) + '::origen');
  localStorage.removeItem(claveCarrito(cliente) + '::origenSkus');
  document.dispatchEvent(new CustomEvent('carrito:cambio', {
    detail: { cliente: cliente || getClienteDestino(), lineas: [] }
  }));
}

export function cantidadDe(sku, cliente) {
  const codigo = String(sku).trim().toUpperCase();
  const l = leer(cliente).find(x => x.sku === codigo);
  return l ? l.cantidad : 0;
}

export function cantidadItems(cliente) {
  return leer(cliente).length;
}

// ---------- totales ----------

/**
 * Devuelve las lineas con su precio resuelto AHORA.
 * El precio nunca sale de lo guardado: siempre de js/precios.js.
 */
export function detalle(cliente) {
  return leer(cliente)
    .sort((a, b) => a.orden - b.orden)
    .map(l => {
      const { base, aplicado } = preciosDeLinea(l);

      if (aplicado === null) {
        return { ...l, precioBase: null, precio: null, subtotal: null, descEfectivo: 0 };
      }

      // La promocion manda sobre cualquier ajuste: es un precio cerrado
      const promo = window.Promos?.promoDe(l.sku);
      const enPromo = !!promo && l.cantidad >= promo.cantidadMinima;

      if (enPromo) {
        const precio = promo.precio;
        return {
          ...l,
          precioBase: base,
          precio,
          subtotal: Math.round(precio * l.cantidad * 100) / 100,
          descEfectivo: base ? Math.round((1 - precio / base) * 1000) / 10 : 0,
          enPromo: true,
          cantidadMinima: promo.cantidadMinima
        };
      }

      const desc = Number(l.descuento) || 0;
      // Dos decimales: el sistema de facturacion calcula el unitario
      // con descuento y despues multiplica
      const precio = Math.round(aplicado * (1 - desc / 100) * 100) / 100;

      // Cuanto representa el precio final respecto del que le hubiera
      // correspondido al cliente por su lista: es el numero que se controla
      const descEfectivo = base ? (1 - precio / base) * 100 : 0;

      return {
        ...l,
        precioBase: base,
        precio,
        subtotal: Math.round(precio * l.cantidad * 100) / 100,
        descEfectivo: Math.round(descEfectivo * 10) / 10
      };
    });
}

export function total(cliente) {
  return detalle(cliente).reduce((acc, l) => acc + (l.subtotal || 0), 0);
}

// ---------- carritos abiertos (vendedor) ----------

export function carritosAbiertos() {
  const mio = PREFIJO + getOperador() + '::';
  const res = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(mio)) continue;
    const cliente = k.slice(mio.length);
    const lineas = leer(cliente);
    if (lineas.length) res.push({ cliente, items: lineas.length });
  }
  return res;
}

// ---------- interfaz: icono en la tarjeta ----------

const SVG_CARRITO = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
  <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
</svg>`;

export function ponerIcono(contenedor, sku) {
  if (!contenedor || !sku) return;

  // El icono vive sobre la imagen, no en la pildora: hay que buscarlo
  // en el mismo lugar donde se crea, si no se duplica en cada repintado
  const sobreImagen = contenedor.parentElement || contenedor;
  let btn = sobreImagen.querySelector(':scope > .btn-carrito');

  // Sin cliente elegido no se puede cargar nada: el icono no va
  if (faltaCliente()) {
    if (btn) btn.remove();
    return;
  }

  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'btn-carrito';
    btn.type = 'button';
    sobreImagen.appendChild(btn);
  }

  btn.dataset.sku = sku;
  refrescarIcono(btn, sku);
}

function refrescarIcono(btn, sku) {
  const cant = cantidadDe(sku);
  btn.innerHTML = SVG_CARRITO + (cant ? `<span class="badge-carrito">${cant}</span>` : '');
  btn.classList.toggle('con-items', cant > 0);
  btn.title = cant ? `${cant} en el pedido` : 'Agregar al pedido';
}

function abrirCampoCantidad(btn, sku) {
  document.querySelectorAll('.popover-cantidad').forEach(p => p.remove());

  const actual = cantidadDe(sku);
  const p = window.productManager?.getProduct(sku);

  const pop = document.createElement('div');
  pop.className = 'popover-cantidad';
  const promo = window.Promos?.promoDe(sku);

  pop.innerHTML = `
    <input type="number" min="0" step="1" value="${actual || ''}" placeholder="0" class="input-cantidad">
    <button type="button" class="btn-ok-cantidad">OK</button>
    <div class="aviso-promo"></div>
    ${p?.bulto ? `<div class="nota-bulto">Bulto: ${p.bulto}</div>` : ''}
  `;

  btn.parentElement.appendChild(pop);

  // El z-index del CSS queda pisado por otras reglas del contenedor
  pop.style.setProperty('z-index', '9000', 'important');

  // El teclado del celular tapa la mitad inferior: traer el campo a la vista
  setTimeout(() => pop.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);

  const input = pop.querySelector('.input-cantidad');

    // Aviso del ahorro: se actualiza mientras escribe, para que vea cuanto
  // le falta llegar al precio promocional
  const avisoPromo = pop.querySelector('.aviso-promo');

    function refrescarAviso() {
    if (!promo || !avisoPromo) return;

    const n = parseInt(input.value, 10) || 0;
    const lista = window.Precios?.precioLista(sku) || 0;
    const fmt = window.Precios.formatearPrecio;

    if (n >= promo.cantidadMinima) {
      const ahorro = (lista - promo.precio) * n;
      avisoPromo.innerHTML =
        `<b class="precio-promo">${fmt(promo.precio)}</b> c/u` +
        `<span class="linea-ahorro">Ahorrás ${fmt(ahorro)}</span>`;
      avisoPromo.className = 'aviso-promo activa';
    } else {
      avisoPromo.innerHTML =
        `x${promo.cantidadMinima} u. → <b class="precio-promo">${fmt(promo.precio)}</b> c/u`;
      avisoPromo.className = 'aviso-promo';
    }
  }

  input.addEventListener('input', refrescarAviso);
  refrescarAviso();

  input.focus();
  input.select();

  const confirmar = () => {
    const n = parseInt(input.value, 10);
    if (!n || n <= 0) { quitar(sku); } else { agregar(sku, n); }
    refrescarIcono(btn, sku);
    pop.remove();
  };

  pop.querySelector('.btn-ok-cantidad').addEventListener('click', confirmar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmar();
    if (e.key === 'Escape') pop.remove();
  });

  setTimeout(() => {
    document.addEventListener('click', function cerrar(ev) {
      if (!pop.contains(ev.target) && !btn.contains(ev.target)) {
        pop.remove();
        document.removeEventListener('click', cerrar);
      }
    });
  }, 500);
}

// ---------- boton flotante ----------

const SVG_CARRITO_GRANDE = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
  <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
</svg>`;

export function crearBotonFlotante() {
  if (document.getElementById('fab-carrito')) return;

  // Reutilizar el primer boton inferior, que quedo sin uso
  const cont = document.querySelector('.btn-inferiores');
  const existente = cont?.querySelector('a');

    // El segundo boton inferior no se usa: sacarlo libera espacio
  const segundo = cont?.querySelectorAll('a')[1];
  if (segundo) segundo.remove();

  let btn;
  if (existente) {
    btn = existente;
    btn.removeAttribute('href');
  } else {
    btn = document.createElement('button');
    document.body.appendChild(btn);
  }

  btn.id = 'fab-carrito';
  btn.className = 'fab-carrito';
  btn.title = 'Ver pedido';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('carrito:abrir'));
  });

  refrescarBotonFlotante();
}

export function refrescarBotonFlotante() {



  const btn = document.getElementById('fab-carrito');
  if (!btn) return;

  // Ocultar el boton flotante mientras no haya cliente elegido
  if (faltaCliente()) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';

  const n = cantidadItems();
  btn.innerHTML = SVG_CARRITO_GRANDE + (n ? `<span class="fab-badge">${n}</span>` : '');
  btn.classList.toggle('vacio', n === 0);
}

// Mantener el contador al dia
document.addEventListener('carrito:cambio', refrescarBotonFlotante);
document.addEventListener('DOMContentLoaded', crearBotonFlotante);
if (document.readyState !== 'loading') crearBotonFlotante();

/**
 * Mueve una linea a la posicion de otra. El orden define el semaforo
 * acumulado, asi que reordenar es decidir que entra en el cupo.
 */
export function reordenar(skuMovido, skuDestino, cliente) {
  const lineas = leer(cliente).sort((a, b) => a.orden - b.orden);
  const desde = lineas.findIndex(l => l.sku === skuMovido);
  const hasta = lineas.findIndex(l => l.sku === skuDestino);
  if (desde < 0 || hasta < 0) return;

  const [m] = lineas.splice(desde, 1);
  lineas.splice(hasta, 0, m);
  lineas.forEach((l, i) => { l.orden = i; });

  guardar(lineas, cliente);
  return lineas;
}

// Un solo manejador para todos los iconos: sobrevive a que las tarjetas
// se recreen, cosa que pasa en varias rutas de render
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-carrito');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  abrirCampoCantidad(btn, btn.dataset.sku);
});


// Mantener los iconos del catalogo al dia cuando el carrito cambia
// desde otro lado, por ejemplo el panel
document.addEventListener('carrito:cambio', () => {
  document.querySelectorAll('.btn-carrito').forEach(btn => {
    if (btn.dataset.sku) refrescarIcono(btn, btn.dataset.sku);
  });
});

// ---------- ajustes de precio (solo vendedor) ----------

/**
 * Guarda el ajuste de una linea. El precio se sigue derivando: aca solo
 * se registra COMO debe calcularse.
 *
 * @param {string} sku
 * @param {object} ajuste  { mecanismo, lista, precioLibre, descuento, motivo, obsLibre }
 *   mecanismo: 'lista_cliente' | 'otra_lista' | 'precio_libre'
 */
export function ajustarLinea(sku, ajuste, cliente) {
  const codigo = String(sku).trim().toUpperCase();
  const lineas = leer(cliente);
  const l = lineas.find(x => x.sku === codigo);
  if (!l) return null;

  l.mecanismo = ajuste.mecanismo || 'lista_cliente';
  l.listaForzada = ajuste.mecanismo === 'otra_lista' ? ajuste.lista : null;
  l.precioLibre = ajuste.mecanismo === 'precio_libre' ? Number(ajuste.precioLibre) || null : null;
  l.descuento = Number(ajuste.descuento) || 0;
  l.motivo = ajuste.motivo || '';
  l.obsLibre = ajuste.obsLibre || '';

  guardar(lineas, cliente);
  return l;
}

/**
 * Precio de una linea segun su mecanismo, ANTES del descuento de linea.
 * Devuelve tambien el precio que le hubiera correspondido al cliente,
 * que es la referencia contra la que se mide el descuento efectivo.
 */
function preciosDeLinea(l) {
  const base = window.Precios?.precioLista(l.sku) ?? l.precioResp ?? null;

  if (l.mecanismo === 'precio_libre' && l.precioLibre) {
    return { base, aplicado: l.precioLibre };
  }

  if (l.mecanismo === 'otra_lista' && l.listaForzada) {
    const p = window.productManager?.getProduct(l.sku);
    const otro = p?.precios?.[l.listaForzada];
    return { base, aplicado: otro ?? base };
  }

  return { base, aplicado: base };
}

// ---------- ajuste del pedido ----------

export function getAjustePedido(cliente) {
  try {
    const raw = localStorage.getItem(claveCarrito(cliente) + '::ajuste');
    return raw ? JSON.parse(raw) : { descuento: 0, motivo: '', obsLibre: '' };
  } catch (e) {
    return { descuento: 0, motivo: '', obsLibre: '' };
  }
}

export function setAjustePedido(ajuste, cliente) {
  localStorage.setItem(claveCarrito(cliente) + '::ajuste', JSON.stringify({
    descuento: Number(ajuste.descuento) || 0,
    motivo: ajuste.motivo || '',
    obsLibre: ajuste.obsLibre || ''
  }));
  document.dispatchEvent(new CustomEvent('carrito:cambio', {
    detail: { cliente: cliente || getClienteDestino() }
  }));
}

/**
 * Totales con la cascada: primero los descuentos de linea, despues el
 * descuento sobre el total. -5% y -10% dan 14,5%, no 15%.
 */
export function totales(cliente) {
  const lineas = detalle(cliente);
  const aj = getAjustePedido(cliente);

  const bruto = Math.round(lineas.reduce((a, l) => a + (l.subtotal || 0), 0) * 100) / 100;

  // Las lineas en promocion no admiten descuento: el porcentaje se aplica
  // solo sobre el resto del pedido
  const enPromo = Math.round(lineas.filter(l => l.enPromo)
    .reduce((a, l) => a + (l.subtotal || 0), 0) * 100) / 100;
  const descontable = bruto - enPromo;

  const neto = Math.round((enPromo + descontable * (1 - (aj.descuento || 0) / 100)) * 100) / 100;

  // Referencia: lo que hubiera costado a lista del cliente, sin ajustes
  const aLista = Math.round(lineas.reduce((a, l) => a + ((l.precioBase || 0) * l.cantidad), 0) * 100) / 100;
  const descGlobal = aLista ? Math.round((1 - neto / aLista) * 1000) / 10 : 0;

  return { bruto, neto, aLista, descGlobal, descuentoTotal: aj.descuento || 0, enPromo };
}

/**
 * Fuerza que todos los productos del carrito esten en memoria con la lista
 * del cliente actual, y devuelve el detalle con precios verificados.
 *
 * CRITICO: sin esto, un producto que salio de memoria usaria su precio de
 * respaldo, que puede haberse calculado con la lista de otro cliente.
 */
export async function detalleVerificado(cliente) {
  const lineas = leer(cliente);
  if (!lineas.length) return { ok: true, lineas: [] };

  const listaActual = window.Precios?.getClienteVista()?.lista
    || JSON.parse(localStorage.getItem('clientData') || '{}').priceList
    || null;

  // Traer a memoria los que falten, con la lista del cliente actual
  const faltantes = lineas
    .map(l => l.sku)
    .filter(sku => !window.productManager?.getProduct(sku));

  if (faltantes.length && window.productManagerInstance?.loadSpecificProducts) {
    try {
      await window.productManagerInstance.loadSpecificProducts(faltantes);
    } catch (e) {
      console.warn('[Carrito] No se pudieron cargar todos los productos:', e);
    }
  }

  // Verificar uno por uno: ninguno puede quedar sin precio confirmado
  const sinPrecio = [];
  const conListaVieja = [];

  lineas.forEach(l => {
    const p = window.productManager?.getProduct(l.sku);
    if (!p) { sinPrecio.push(l.sku); return; }
    if (l.listaResp && listaActual && l.listaResp !== listaActual) {
      conListaVieja.push(l.sku);
    }
  });

  if (sinPrecio.length) {
    return { ok: false, error: 'sin_precio', skus: sinPrecio };
  }

  return {
    ok: true,
    lineas: detalle(cliente),
    lista: listaActual,
    advertencias: conListaVieja
  };
}

let intentosReconexion = 0;

// Aviso permanente cuando el sistema de pedidos no responde, con opcion
// de reintentar sin tener que salir y volver a entrar
function avisarSinServicio() {
  const franja = document.getElementById('franja-sin-servicio');

  if (sessionStorage.getItem('authDegradado') !== '1') {
    franja?.remove();
    return;
  }
  if (franja) return;

  const f = document.createElement('div');
  f.id = 'franja-sin-servicio';
  f.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#dc2626;' +
      'color:#fff;padding:8px 14px;font-size:12px;text-align:center;z-index:9998;' +
      'display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;';
  f.innerHTML = `
    <span id="franja-texto">Sistema de pedidos no disponible — solo consulta de precios</span>
    <button id="franja-reintentar" style="background:#fff;color:#dc2626;border:none;
      border-radius:5px;padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;">
      Reintentar
    </button>`;
  document.body.appendChild(f);

  f.querySelector('#franja-reintentar').addEventListener('click', reintentarConexion);
}

async function reintentarConexion() {
  const btn = document.getElementById('franja-reintentar');
  const txt = document.getElementById('franja-texto');
  const clave = window.menuFuncionalidades?.usuarioActual?.clave;
  if (!btn || !clave) return;

  btn.disabled = true;
  btn.textContent = 'Conectando...';

  try {
    const auth = await window.Api.llamar({ accion: 'login', clave: String(clave) });

    if (!auth.ok || !auth.token) throw new Error(auth.error || 'sin token');

    // Conexion recuperada: guardar la sesion y habilitar el carrito
    sessionStorage.setItem('authToken', auth.token);
    sessionStorage.setItem('authRol', auth.rol);
    sessionStorage.setItem('authCodigo', auth.codigo || '');
    sessionStorage.setItem('authVence', String(auth.vence));
    sessionStorage.removeItem('authDegradado');
    sessionStorage.removeItem('authMotivo');
    intentosReconexion = 0;

    document.getElementById('franja-sin-servicio')?.remove();
    window.Precios?.repintarTodos();
    refrescarBotonFlotante();

  } catch (e) {
    intentosReconexion++;
    btn.disabled = false;
    btn.textContent = 'Reintentar';

    if (intentosReconexion >= 2) {
      txt.textContent = 'El sistema sigue sin responder. Esperá unos minutos y volvé a intentar.';
    } else {
      txt.textContent = 'No se pudo conectar. Probá de nuevo.';
    }
  }
}

setTimeout(avisarSinServicio, 2000);

// Si el login entro sin token, reintentarlo una vez en segundo plano:
// el usuario ya esta navegando y no espera nada
setTimeout(() => {
  if (sessionStorage.getItem('authDegradado') === '1') reintentarConexion();
}, 12000);

// ---------- revision de pedidos ----------

/**
 * Pedido del cliente que se esta revisando en este carrito, si lo hay.
 * Al confirmar, la revision queda vinculada a ese pedido.
 */
export function getOrigen(cliente) {
  return localStorage.getItem(claveCarrito(cliente) + '::origen') || '';
}

export function setOrigen(id, skus, cliente) {
  const k = claveCarrito(cliente) + '::origen';
  if (id) {
    localStorage.setItem(k, id);
    localStorage.setItem(k + 'Skus', JSON.stringify(skus || []));
  } else {
    localStorage.removeItem(k);
    localStorage.removeItem(k + 'Skus');
  }
}

/** Articulos que traia el pedido del cliente que se esta revisando. */
export function getOrigenSkus(cliente) {
  try {
    return JSON.parse(localStorage.getItem(claveCarrito(cliente) + '::origenSkus') || '[]');
  } catch (e) {
    return [];
  }
}

/**
 * El vendedor ya tenia este articulo cargado: queda la cantidad del cliente
 * y se recuerda la anterior, para mostrarle la diferencia.
 */
export function marcarPrevia(sku, cantidadPrevia, cliente) {
  const codigo = String(sku).trim().toUpperCase();
  const lineas = leer(cliente);
  const l = lineas.find(x => x.sku === codigo);
  if (!l) return;
  l.cantVendedor = cantidadPrevia;
  guardar(lineas, cliente);
}

window.Carrito = {
  getClienteDestino, leer, agregar, quitar, vaciar, reordenar,
  cantidadDe, cantidadItems, detalle, detalleVerificado, total, totales, carritosAbiertos,
  ponerIcono, crearBotonFlotante, refrescarBotonFlotante,
  ajustarLinea, getAjustePedido, setAjustePedido,
  getOrigen, setOrigen, marcarPrevia, getOrigenSkus
};