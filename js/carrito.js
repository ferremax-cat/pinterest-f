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

// ---------- identidad ----------

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
  const codigo = String(sku).trim().toUpperCase();
  const cant = Number(cantidad);
  if (!codigo || !cant || cant <= 0) return null;

  const lineas = leer(cliente);
  const existente = lineas.find(l => l.sku === codigo);

  if (existente) {
    existente.cantidad = cant;
  } else {
    const p = window.productManager?.getProduct(codigo);
    lineas.push({
      sku: codigo,
      cantidad: cant,
      orden: lineas.length,
      nombre: p?.nombre || '',
      bulto: p?.bulto || null,
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
      const precio = window.Precios?.precioLista(l.sku) ?? null;
      return {
        ...l,
        precio,
        subtotal: precio !== null ? precio * l.cantidad : null
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

window.Carrito = {
  getClienteDestino, leer, agregar, quitar, vaciar,
  cantidadDe, cantidadItems, detalle, total, carritosAbiertos
};