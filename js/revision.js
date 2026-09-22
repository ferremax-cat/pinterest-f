/**
 * REVISION DE PEDIDOS
 *
 * El vendedor ve los pedidos que confirmaron sus clientes y todavia no
 * reviso. Al elegir uno, se carga en su carrito con el cliente seleccionado,
 * y al confirmar queda guardado como revision vinculada al original.
 */

let pendientes = [];
let reintentoPendientes = false;

const SVG_BANDEJA = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
  <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 12h-4a3 3 0 01-6 0H5V5h14z"/>
</svg>`;

function esVendedor() {
  const rol = sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol || '';
  return rol && rol !== 'cliente_estandar';
}

function fmt(n) {
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

export async function consultarPendientes() {
  if (!esVendedor() || !sessionStorage.getItem('authToken')) {
    pendientes = [];
    pintarIcono();
    return;
  }
    try {
    const d = await window.Api.llamar({
      accion: 'pedidos_pendientes',
      token: sessionStorage.getItem('authToken')
    });
    pendientes = d.ok ? d.pedidos : [];
    reintentoPendientes = false;
  } catch (e) {
    pendientes = [];
    // Si fallo, un solo intento mas en medio minuto: sin esto el icono no
    // aparece hasta que el vendedor vuelve a entrar
    if (!reintentoPendientes) {
      reintentoPendientes = true;
      setTimeout(consultarPendientes, 30000);
    }
  }
  pintarIcono();
}

function pintarIcono() {
  let btn = document.getElementById('btn-revision');

  if (!pendientes.length) {
    btn?.remove();
    return;
  }

  if (!btn) {
    const nav = document.querySelector('nav');
    if (!nav) return;
    btn = document.createElement('button');
    btn.id = 'btn-revision';
    btn.type = 'button';
    btn.title = 'Pedidos de clientes para revisar';
    btn.style.cssText = 'position:relative;width:32px;height:32px;border-radius:50%;' +
      'background:#2563eb;color:#fff;border:none;display:inline-flex;' +
      'align-items:center;justify-content:center;cursor:pointer;padding:0;' +
      'margin:0 4px;flex-shrink:0;';
    const iconos = nav.querySelector('.iconos');
    if (iconos) nav.insertBefore(btn, iconos);
    else nav.appendChild(btn);
    btn.addEventListener('click', abrirPanel);
  }

  btn.innerHTML = SVG_BANDEJA +
    `<span style="position:absolute;top:-5px;right:-5px;background:#fff;color:#2563eb;
      border:1.5px solid #2563eb;border-radius:9px;min-width:17px;height:17px;
      font-size:10px;font-weight:700;display:flex;align-items:center;
      justify-content:center;">${pendientes.length}</span>`;
}

/**
 * El icono aparece sin consultar nada: la lista se pide recien al abrirlo.
 * Asi no se suma una consulta al entrar que muchas veces no se usa.
 */
function pintarIconoVacio() {
  if (document.getElementById('btn-revision')) return;
  const nav = document.querySelector('nav');
  if (!nav) return;

  const btn = document.createElement('button');
  btn.id = 'btn-revision';
  btn.type = 'button';
  btn.title = 'Pedidos de clientes para revisar';
  btn.style.cssText = 'position:relative;width:32px;height:32px;border-radius:50%;' +
    'background:#2563eb;color:#fff;border:none;display:inline-flex;' +
    'align-items:center;justify-content:center;cursor:pointer;padding:0;' +
    'margin:0 4px;flex-shrink:0;';
  btn.innerHTML = SVG_BANDEJA;

  const iconos = nav.querySelector('.iconos');
  if (iconos) nav.insertBefore(btn, iconos);
  else nav.appendChild(btn);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await consultarPendientes();
    btn.disabled = false;
    abrirPanel();
  });
}

function abrirPanel() {
  document.getElementById('panel-revision')?.remove();

  if (!pendientes.length) return;
  
  const cont = document.createElement('div');
  cont.id = 'panel-revision';
  cont.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);' +
    'z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px;';

  const filas = pendientes.map(p => {
    const fecha = new Date(p.fecha).toLocaleString('es-AR',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="pp-fila">
        <div class="pp-desc">
          <p class="pp-nombre">${p.nombre}</p>
          <p class="pp-meta">${p.cliente} · ${fecha} · ${p.lineas} artículo${p.lineas !== 1 ? 's' : ''}</p>
          <p class="pp-precio" style="color:#111"><b>${fmt(p.total)}</b></p>
        </div>
        <button class="rv-abrir" data-id="${p.id}">Revisar</button>
      </div>`;
  }).join('');

  cont.innerHTML = `
    <div class="pp-caja">
      <div class="pp-cab">
        <div>
          <p class="pp-titulo">Pedidos para revisar</p>
          <p class="pp-sub">${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="pp-cerrar">&times;</button>
      </div>
      <div class="pp-lista">${filas}</div>
    </div>`;

  document.body.appendChild(cont);

  cont.addEventListener('click', (e) => { if (e.target === cont) cont.remove(); });
  cont.querySelector('.pp-cerrar').addEventListener('click', () => cont.remove());
  cont.querySelectorAll('.rv-abrir').forEach(b => {
    b.addEventListener('click', () => revisar(b.dataset.id, b));
  });
}

async function revisar(id, boton) {
  boton.disabled = true;
  boton.textContent = 'Cargando...';

  try {
    const d = await window.Api.llamar({
      accion: 'pedido_detalle',
      token: sessionStorage.getItem('authToken'),
      id
    });
    if (!d.ok) throw new Error(d.error);

    // Seleccionar el cliente igual que desde el buscador: lista, barra y cupo
    await window.busquedaClientes.seleccionarCliente(d.cliente);

    // Traer los productos a memoria antes de cargarlos
    await window.productManager.loadSpecificProducts(d.lineas.map(l => l.sku));

    for (const l of d.lineas) {
      const previa = window.Carrito.cantidadDe(l.sku);
      window.Carrito.agregar(l.sku, l.cantidad);
      if (previa && previa !== l.cantidad) window.Carrito.marcarPrevia(l.sku, previa);
    }

    window.Carrito.setOrigen(id, d.lineas.map(l => String(l.sku).trim().toUpperCase()));
    document.getElementById('panel-revision')?.remove();
    window.CarritoPanel.abrir();

  } catch (e) {
    console.warn('[Revision] No se pudo abrir el pedido:', e);
    boton.disabled = false;
    boton.textContent = 'Reintentar';
  }
}

// Consultar despues de que la app termino de cargar, para no coincidir
// con las demas consultas del inicio
setTimeout(() => { if (esVendedor()) pintarIconoVacio(); }, 2000);

window.Revision = { consultarPendientes, abrirPanel };