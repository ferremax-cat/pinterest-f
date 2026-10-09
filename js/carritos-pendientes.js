/**
 * CARRITOS PENDIENTES (vendedor)
 *
 * Icono en la barra superior con los carritos a medio armar de otros
 * clientes: el vendedor salta entre clientes y se olvida de los que dejo.
 * Todo sale del navegador (carrito.js → carritosAbiertos): no consulta al
 * servidor. No cuenta el carrito del cliente elegido en este momento.
 */

const SVG_CARRITO = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
  <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
</svg>`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Solo vendedores (y admin): mismo criterio que la revision de pedidos
function esVendedor() {
  const rol = sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol || '';
  return !!window.Carrito?.puedePedir() && rol !== 'cliente_estandar';
}

function nombreDe(cuenta) {
  return window.busquedaClientes?.clientesData?.[cuenta]?.nombre || `Cuenta ${cuenta}`;
}

function haceCuanto(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 60) return min <= 1 ? 'hace un momento' : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

/** Carritos con articulos, sin el del cliente elegido, del mas reciente al mas viejo. */
function pendientes() {
  const actual = String(window.Precios?.getClienteVista()?.cuenta ?? '');
  return (window.Carrito?.carritosAbiertos() || [])
    .filter(c => String(c.cliente) !== actual)
    .sort((a, b) => (b.modificado || 0) - (a.modificado || 0));
}

function pintarIcono() {
  let btn = document.getElementById('btn-carritos');
  const lista = esVendedor() ? pendientes() : [];

  if (!lista.length) {
    btn?.remove();
    return;
  }

  if (!btn) {
    const nav = document.querySelector('nav');
    if (!nav) return;
    btn = document.createElement('button');
    btn.id = 'btn-carritos';
    btn.type = 'button';
    btn.title = 'Pedidos a medio armar';
    btn.style.cssText = 'position:relative;width:32px;height:32px;border-radius:50%;' +
      'background:#ff9404;color:#fff;border:none;display:inline-flex;' +
      'align-items:center;justify-content:center;cursor:pointer;padding:0;' +
      'margin:0 4px;flex-shrink:0;';
    const iconos = nav.querySelector('.iconos');
    if (iconos) nav.insertBefore(btn, iconos);
    else nav.appendChild(btn);
    btn.addEventListener('click', abrirPanel);
  }

  btn.innerHTML = SVG_CARRITO +
    `<span style="position:absolute;top:-5px;right:-5px;background:#fff;color:#ff9404;
      border:1.5px solid #ff9404;border-radius:9px;min-width:17px;height:17px;
      font-size:10px;font-weight:700;display:flex;align-items:center;
      justify-content:center;">${lista.length}</span>`;
}

function abrirPanel() {
  document.getElementById('panel-carritos')?.remove();
  const lista = pendientes();
  if (!lista.length) return;

  const cont = document.createElement('div');
  cont.id = 'panel-carritos';
  cont.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);' +
    'z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px;';

  const filas = lista.map(c => `
    <div class="pp-fila">
      <div class="pp-desc">
        <p class="pp-nombre">${esc(nombreDe(c.cliente))}</p>
        <p class="pp-meta">Cuenta ${esc(c.cliente)} · ${c.items} artículo${c.items !== 1 ? 's' : ''}` +
          `${c.modificado ? ' · ' + haceCuanto(c.modificado) : ''}` +
          `${c.pendiente ? ' · <b style="color:#ff9404">confirmación pendiente</b>' : ''}</p>
      </div>
      <button class="rv-abrir" data-cuenta="${esc(c.cliente)}">Abrir</button>
    </div>`).join('');

  cont.innerHTML = `
    <div class="pp-caja">
      <div class="pp-cab">
        <div>
          <p class="pp-titulo">Pedidos a medio armar</p>
          <p class="pp-sub">${lista.length} cliente${lista.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="pp-cerrar">&times;</button>
      </div>
      <div class="pp-lista">${filas}</div>
    </div>`;

  document.body.appendChild(cont);
  cont.addEventListener('click', e => { if (e.target === cont) cont.remove(); });
  cont.querySelector('.pp-cerrar').addEventListener('click', () => cont.remove());
  cont.querySelectorAll('.rv-abrir').forEach(b => {
    b.addEventListener('click', () => abrirCarrito(b.dataset.cuenta, b, cont));
  });
}

/** Selecciona el cliente como desde el buscador y abre su carrito. */
async function abrirCarrito(cuenta, boton, panel) {
  if (!window.busquedaClientes?.clientesData?.[cuenta]) {
    boton.textContent = 'No disponible';
    boton.disabled = true;
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Abriendo…';
  await window.busquedaClientes.seleccionarCliente(cuenta);
  panel.remove();

  // seleccionarCliente no aplica el cliente si no tiene lista de precios
  if (String(window.Precios?.getClienteVista()?.cuenta) === String(cuenta)) {
    document.dispatchEvent(new CustomEvent('carrito:abrir'));
  }
}

// ---------- arranque ----------
// El operador del carrito sale del menu, que aparece un segundo despues de
// cargar: antes, carritosAbiertos buscaria con otro prefijo

function iniciar(intento = 0) {
  if (!window.menuFuncionalidades?.usuarioActual) {
    if (intento < 10) setTimeout(() => iniciar(intento + 1), 500);
    return;
  }
  if (esVendedor()) window.Carrito?.descartarViejos();
  pintarIcono();
}

setTimeout(iniciar, 1500);

document.addEventListener('carrito:cambio', pintarIcono);
document.addEventListener('cliente:cambio', pintarIcono);
document.addEventListener('auth:token-listo', pintarIcono);
