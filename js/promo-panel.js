/**
 * PANEL DE PROMOCIONES
 *
 * Icono en la barra superior con el contador de promociones activas del
 * cliente. Al abrirlo muestra la lista y permite cargar la cantidad minima
 * de una vez, que es lo que el cliente quiere si le interesa la promo.
 */

const SVG_TAG = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
  <path d="M21.41 11.58l-9-9A2 2 0 0011 2H4a2 2 0 00-2 2v7a2 2 0 00.59 1.42l9 9a2 2 0 002.82 0l7-7a2 2 0 000-2.84zM6.5 8A1.5 1.5 0 118 6.5 1.5 1.5 0 016.5 8z"/>
</svg>`;

function fmt(n) {
  return '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function crearIcono() {

  if (!window.Carrito?.carritoHabilitado()) {
    document.getElementById('btn-promos')?.remove();
    return;
  }

  const activas = window.Promos?.promosActivas() || [];
  let btn = document.getElementById('btn-promos');

  if (!activas.length) {
    btn?.remove();
    return;
  }

  if (!btn) {
    const nav = document.querySelector('nav');
    const iconos = nav?.querySelector('.iconos');
    if (!nav) return;

    btn = document.createElement('button');
    btn.id = 'btn-promos';
    btn.type = 'button';
    btn.title = 'Promociones activas';
    btn.style.cssText = 'position:relative;width:32px;height:32px;border-radius:50%;' +
      'background:#639922;color:#fff;border:none;display:inline-flex;' +
      'align-items:center;justify-content:center;cursor:pointer;padding:0;' +
      'margin:0 4px;flex-shrink:0;';

    // Antes del bloque de iconos, para que quede a la derecha del resto
    if (iconos) nav.insertBefore(btn, iconos);
    else nav.appendChild(btn);

    btn.addEventListener('click', abrirPanel);
  }

  btn.innerHTML = SVG_TAG +
    `<span style="position:absolute;top:-5px;right:-5px;background:#fff;color:#639922;
      border:1.5px solid #639922;border-radius:9px;min-width:17px;height:17px;
      font-size:10px;font-weight:700;display:flex;align-items:center;
      justify-content:center;">${activas.length}</span>`;
}

// Espera maxima antes de mostrar la lista: productos.json pesa unos 2 MB y
// desde un celular con datos moviles puede tardar varios segundos
const ESPERA_CARGA_MS = 5000;
let abriendo = false;

function filasHtml(activas) {
  return activas.map(p => {
    const prod = window.productManager?.getProduct(p.sku);
    const lista = window.Precios?.precioLista(p.sku);
    const enCarrito = window.Carrito?.cantidadDe(p.sku) || 0;

    return `
      <div class="pp-fila">
        <div class="pp-desc">
          <p class="pp-nombre">${prod?.nombre || p.sku}</p>
          <p class="pp-meta">${p.sku}</p>
          <p class="pp-precio">
            <b>${fmt(p.precio)}</b> desde ${p.cantidadMinima} u.
            ${lista ? `<span class="pp-lista">lista ${fmt(lista)}</span>` : ''}
          </p>
        </div>
        <button class="pp-add ${enCarrito ? 'pp-cargado' : ''}" data-sku="${p.sku}"
                data-min="${p.cantidadMinima}" title="Cargar ${p.cantidadMinima} unidades">
          ${enCarrito ? enCarrito : '+'}
        </button>
      </div>`;
  }).join('');
}

async function abrirPanel() {
  const activas = window.Promos?.promosActivas() || [];
  if (!activas.length || abriendo) return;
  abriendo = true;

  document.getElementById('panel-promos')?.remove();

  const cont = document.createElement('div');
  cont.id = 'panel-promos';
  cont.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);' +
    'z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px;';

  const venceMin = activas.map(p => p.vigencia).filter(Boolean).sort()[0];

  // Se abre al instante con la cabecera; la lista llega cuando estan los datos
  cont.innerHTML = `
    <div class="pp-caja">
      <div class="pp-cab">
        <div>
          <p class="pp-titulo">Promociones activas</p>
          <p class="pp-sub">${activas.length} producto${activas.length !== 1 ? 's' : ''}${venceMin ? ' · hasta el ' + venceMin.split('-').reverse().join('/') : ''}</p>
        </div>
        <button class="pp-cerrar">&times;</button>
      </div>
      <div class="pp-lista"><p class="pp-meta" style="padding:16px 0;text-align:center">Cargando…</p></div>
    </div>`;

  document.body.appendChild(cont);

  cont.addEventListener('click', (e) => {
    if (e.target === cont) cont.remove();
  });
  cont.querySelector('.pp-cerrar').addEventListener('click', () => cont.remove());

  // Productos de las promociones que no estan en memoria: sin ellos la fila
  // queda sin nombre ni precio de lista. Espera breve; si no llegan, la
  // lista se muestra igual y se completa cuando terminen de cargar
  const faltan = activas.map(p => p.sku).filter(sku => !window.productManager?.getProduct(sku));
  const carga = faltan.length && window.productManager?.loadSpecificProducts
    ? window.productManager.loadSpecificProducts(faltan).catch(e => {
        console.warn('[Promos] No se pudieron cargar los productos del panel:', e);
      })
    : Promise.resolve();

  await Promise.race([carga, new Promise(r => setTimeout(r, ESPERA_CARGA_MS))]);
  abriendo = false;
  if (!cont.isConnected) return;   // se cerro mientras cargaba

  dibujarLista(cont, activas);
  carga.then(() => { if (cont.isConnected) dibujarLista(cont, activas); });
}

function dibujarLista(cont, activas) {
  cont.querySelector('.pp-lista').innerHTML = filasHtml(activas);

    cont.querySelectorAll('.pp-add').forEach(b => {
    b.addEventListener('click', async () => {
      const sku = b.dataset.sku;

      // El producto puede no estar en memoria: nunca se vio en el catalogo.
      // Sin cargarlo, la linea queda sin nombre ni precio de lista.
      if (!window.productManager?.getProduct(sku)) {
        b.disabled = true;
        b.textContent = '...';
        try {
          await window.productManager.loadSpecificProducts([sku]);
        } catch (e) {
          console.warn('[Promos] No se pudo cargar el producto:', e);
        }
        b.disabled = false;
      }

      const r = window.Carrito?.agregar(sku, Number(b.dataset.min));
      if (r) {
        b.textContent = b.dataset.min;
        b.classList.add('pp-cargado');
      } else {
        b.textContent = '+';
      }
    });
  });
}

// El icono depende del cliente activo: rehacerlo cuando cambia
document.addEventListener('carrito:cambio', crearIcono);
document.addEventListener('cliente:cambio', crearIcono);
setTimeout(crearIcono, 1800);

window.PromoPanel = { crearIcono, abrirPanel };