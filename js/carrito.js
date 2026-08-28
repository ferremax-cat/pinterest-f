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

// ---------- interfaz: icono en la tarjeta ----------

const SVG_CARRITO = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
  <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
</svg>`;

export function ponerIcono(contenedor, sku) {
  if (!contenedor || !sku) return;

  let btn = contenedor.querySelector('.btn-carrito');
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'btn-carrito';
    btn.type = 'button';
        // Insertar antes del precio, no al final del contenedor
    const refPrecio = contenedor.querySelector('.price-tag');
    if (refPrecio) {
      contenedor.insertBefore(btn, refPrecio);
    } else {
      contenedor.appendChild(btn);
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirCampoCantidad(btn, btn.dataset.sku);
    });
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
  pop.innerHTML = `
    <input type="number" min="0" step="1" value="${actual || ''}" placeholder="0" class="input-cantidad">
    <button type="button" class="btn-ok-cantidad">OK</button>
    ${p?.bulto ? `<div class="nota-bulto">Bulto: ${p.bulto}</div>` : ''}
  `;

  btn.parentElement.appendChild(pop);

  const input = pop.querySelector('.input-cantidad');
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
  }, 10);
}

window.Carrito = {
  getClienteDestino, leer, agregar, quitar, vaciar,
  cantidadDe, cantidadItems, detalle, total, carritosAbiertos, ponerIcono
};