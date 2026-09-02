/**
 * PANEL DEL CARRITO
 *
 * Dos vistas segun el rol:
 * - Vendedor: ventana centrada, semaforo de credito, reordenar por prioridad.
 * - Cliente: lamina lateral con imagen, sin nada de credito.
 *
 * El precio se pide siempre a js/precios.js. Este modulo solo dibuja.
 */

const fmt = n => '$' + Math.round(n).toLocaleString('es-AR');

const VERDE = '#16a34a';
const NARANJA = '#ff9404';
const ROJO = '#dc2626';

let moviendo = null;   // sku de la linea que se esta reubicando

function esVendedor() {
  const rol = sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol
      || '';
  return rol !== 'cliente_estandar';
}

function getDisponible() {
  const v = sessionStorage.getItem('disponibleCliente');
  return v ? Number(v) : null;
}

function colorAcumulado(acum, disponible) {
  if (disponible === null) return null;
  if (acum <= disponible) return VERDE;
  if (acum <= disponible * 1.3) return NARANJA;
  return ROJO;
}

// ---------- armado ----------

function contenedor() {
  let cont = document.getElementById('carrito-panel');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'carrito-panel';
    document.body.appendChild(cont);
    cont.addEventListener('click', (e) => {
      if (e.target === cont) cerrar();
    });
  }
  return cont;
}

export function abrir() {
  const cont = contenedor();
  cont.className = esVendedor() ? 'cp-fondo cp-centrado' : 'cp-fondo cp-lateral';
  cont.style.display = 'flex';
  dibujar();
}

export function cerrar() {
  const cont = document.getElementById('carrito-panel');
  if (cont) cont.style.display = 'none';
}

function dibujar() {
  const cont = document.getElementById('carrito-panel');
  if (!cont || cont.style.display === 'none') return;
  cont.innerHTML = esVendedor() ? vistaVendedor() : vistaCliente();
  conectar(cont);
}

// ---------- vista del vendedor ----------

function vistaVendedor() {
  const lineas = window.Carrito.detalle();
  const disponible = getDisponible();
  const cliente = window.Precios?.getClienteVista();
  const total = lineas.reduce((a, l) => a + (l.subtotal || 0), 0);

  if (!lineas.length) return cajaVacia(cliente?.nombre || '');

  let acum = 0;
  let hayRojo = false;

  const filas = lineas.map((l, i) => {
    acum += l.subtotal || 0;
    const c = colorAcumulado(acum, disponible);
    if (c === ROJO) hayRojo = true;
    const col = c || 'inherit';

    if (moviendo && moviendo !== l.sku) {
      return `
        <div class="cp-fila cp-destino" data-destino="${l.sku}">
          <div class="cp-barra" style="background:${col}"></div>
          <div class="cp-desc">
            <p class="cp-nombre" style="color:${col}">${l.nombre || l.sku}</p>
            <p class="cp-meta">Colocar aquí</p>
          </div>
          <span></span>
          <span class="cp-sub" style="color:${col}">${l.subtotal !== null ? fmt(l.subtotal) : '--'}</span>
          <span></span><span></span>
        </div>`;
    }

    if (moviendo === l.sku) {
      return `
        <div class="cp-fila cp-movible">
          <div class="cp-barra" style="background:${col}"></div>
          <div class="cp-desc">
            <p class="cp-nombre" style="color:${col}">${l.nombre || l.sku}</p>
            <p class="cp-meta">Elegí dónde colocarlo</p>
          </div>
          <span></span>
          <span class="cp-sub" style="color:${col}">${l.subtotal !== null ? fmt(l.subtotal) : '--'}</span>
          <span></span>
          <button class="cp-cancelar-mover" title="Cancelar">&times;</button>
        </div>`;
    }

    return `
      <div class="cp-fila" data-i="${i}" data-sku="${l.sku}">
        <div class="cp-barra" style="background:${col}"></div>
        <div class="cp-desc">
          <p class="cp-nombre" style="color:${col}">${l.nombre || l.sku}</p>
          <p class="cp-meta">${l.sku}${l.bulto ? ' · bulto ' + l.bulto : ''}${disponible !== null ? ' · acum. ' + fmt(acum) : ''}</p>
        </div>
        <input type="number" min="1" class="cp-cant" value="${l.cantidad}" data-sku="${l.sku}">
        <span class="cp-sub" style="color:${col}">${l.subtotal !== null ? fmt(l.subtotal) : '--'}</span>
        <button class="cp-menu" data-sku="${l.sku}" title="Mas opciones">&#8942;</button>
        <button class="cp-quitar" data-sku="${l.sku}" title="Quitar">&times;</button>
      </div>`;
  }).join('');

  const exc = disponible !== null ? total - disponible : null;

  const cabecera = disponible === null ? '' : `
    <div class="cp-cupo" style="background:${exc > 0 ? 'rgba(220,38,38,.08)' : 'rgba(22,163,74,.08)'}">
      <span class="cp-cupo-rot">${exc > 0 ? 'Se pasa del cupo por' : 'Margen disponible'}</span>
      <span class="cp-cupo-num" style="color:${exc > 0 ? ROJO : VERDE}">${fmt(Math.abs(exc))}</span>
    </div>`;

  return `
    <div class="cp-caja">
      <div class="cp-cab">
        <div>
          <p class="cp-titulo">${cliente?.nombre || 'Pedido'}</p>
          <p class="cp-sub-titulo">${cliente ? 'Lista ' + cliente.lista + ' · ' : ''}${lineas.length} artículo${lineas.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="cp-cerrar" title="Cerrar">&times;</button>
      </div>
      ${cabecera}
      <div class="cp-lista">${filas}</div>
      <div class="cp-pie">
        <div>
          <span class="cp-total-rot">Total</span>
          <span class="cp-total-num">${fmt(total)}</span>
        </div>
        <div class="cp-acciones">
          <button class="cp-vaciar">Vaciar</button>
          <button class="cp-seguir">Seguir después</button>
          <button class="cp-confirmar" ${hayRojo ? 'disabled title="Hay artículos fuera del cupo"' : ''}>Confirmar pedido</button>
        </div>
      </div>
    </div>`;
}

// ---------- vista del cliente ----------

function vistaCliente() {
  const lineas = window.Carrito.detalle();
  const total = lineas.reduce((a, l) => a + (l.subtotal || 0), 0);

  if (!lineas.length) return cajaVacia('');

  const filas = lineas.map(l => `
    <div class="cp-fila-cli" data-sku="${l.sku}">
      <div class="cp-img" data-sku="${l.sku}"></div>
      <div class="cp-desc-cli">
        <p class="cp-nombre-cli">${l.nombre || l.sku}</p>
        <p class="cp-meta">${l.sku}${l.bulto ? ' · bulto ' + l.bulto : ''}</p>
        <div class="cp-linea-cli">
          <input type="number" min="1" class="cp-cant" value="${l.cantidad}" data-sku="${l.sku}">
          <span class="cp-unit">${l.precio !== null ? fmt(l.precio) : '--'} c/u</span>
          <span class="cp-sub-cli">${l.subtotal !== null ? fmt(l.subtotal) : '--'}</span>
          <button class="cp-quitar" data-sku="${l.sku}" title="Quitar">&times;</button>
        </div>
      </div>
    </div>`).join('');

  return `
    <div class="cp-caja">
      <div class="cp-cab">
        <div>
          <p class="cp-titulo">Mi pedido</p>
          <p class="cp-sub-titulo">${lineas.length} artículo${lineas.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="cp-cerrar" title="Cerrar">&times;</button>
      </div>
      <div class="cp-lista">${filas}</div>
      <div class="cp-pie">
        <div>
          <span class="cp-total-rot">Total</span>
          <span class="cp-total-num">${fmt(total)}</span>
        </div>
        <div class="cp-acciones">
          <button class="cp-seguir">Seguir comprando</button>  
          <button class="cp-confirmar">Confirmar pedido</button>
        </div>
      </div>
    </div>`;
}

function cajaVacia(nombre) {
  return `
    <div class="cp-caja">
      <div class="cp-cab">
        <div>
          <p class="cp-titulo">${nombre || 'Pedido'}</p>
          <p class="cp-sub-titulo">Sin artículos</p>
        </div>
        <button class="cp-cerrar" title="Cerrar">&times;</button>
      </div>
      <div class="cp-vacio">Agregá productos desde el catálogo tocando el carrito de cada tarjeta.</div>
    </div>`;
}

// ---------- eventos ----------

function conectar(cont) {
  cont.querySelector('.cp-cerrar')?.addEventListener('click', cerrar);

  cont.querySelectorAll('.cp-cant').forEach(inp => {
    inp.addEventListener('change', () => {
      const n = parseInt(inp.value, 10);
      if (!n || n <= 0) window.Carrito.quitar(inp.dataset.sku);
      else window.Carrito.agregar(inp.dataset.sku, n);
      dibujar();
    });
  });

  cont.querySelectorAll('.cp-quitar').forEach(b => {
    b.addEventListener('click', () => {
      window.Carrito.quitar(b.dataset.sku);
      dibujar();
    });
  });

  cont.querySelector('.cp-vaciar')?.addEventListener('click', () => {
    if (confirm('¿Vaciar el pedido?')) { window.Carrito.vaciar(); dibujar(); }
  });

  cont.querySelector('.cp-confirmar')?.addEventListener('click', mostrarResumen);

  // Menu de tres puntos: por ahora solo Mover y Quitar
  cont.querySelectorAll('.cp-menu').forEach(b => {
    b.addEventListener('click', () => abrirMenu(b));
  });

    // Imagenes de la vista cliente: se reutiliza la que ya cargo el catalogo,
  // asi no hay que resolver el id ni descargar nada de nuevo
  cont.querySelectorAll('.cp-img').forEach(d => {
    const sku = d.dataset.sku;
    const enCatalogo = document.querySelector(`.price-tag[data-sku="${sku}"]`)
      ?.closest('.container-img')?.querySelector('img')?.src;

    if (enCatalogo) {
      d.style.backgroundImage = `url(${enCatalogo})`;
      return;
    }

    const id = window.imageLoader?.imageMap?.[sku];
    if (id) d.style.backgroundImage = `url(https://lh3.googleusercontent.com/d/${id}=w120)`;
  });

    cont.querySelectorAll('.cp-destino').forEach(f => {
    f.addEventListener('click', () => {
      if (!moviendo) return;
      window.Carrito.reordenar(moviendo, f.dataset.destino);
      moviendo = null;
      dibujar();
    });
  });

  cont.querySelector('.cp-cancelar-mover')?.addEventListener('click', () => {
    moviendo = null;
    dibujar();
  });

  cont.querySelector('.cp-seguir')?.addEventListener('click', cerrar);    
}

function abrirMenu(btn) {
  document.querySelectorAll('.cp-panel-menu').forEach(p => p.remove());

  const fila = btn.closest('.cp-fila');
  const sku = btn.dataset.sku;
  const pan = document.createElement('div');
  pan.className = 'cp-panel-menu';
  pan.innerHTML = `
    <button class="cp-mover" data-sku="${sku}">Mover</button>
    <span class="cp-menu-nota">Los ajustes de precio llegan en la próxima entrega</span>`;
  fila.insertAdjacentElement('afterend', pan);

  pan.querySelector('.cp-mover').addEventListener('click', () => {
    moviendo = sku;
    dibujar();
  });
}

function mostrarResumen() {
  const lineas = window.Carrito.detalle();
  const cliente = window.Precios?.getClienteVista();
  const total = lineas.reduce((a, l) => a + (l.subtotal || 0), 0);

  const txt = lineas.map((l, i) =>
    `${i + 1}. ${l.sku} · ${l.nombre}\n   ${l.cantidad} x ${fmt(l.precio || 0)} = ${fmt(l.subtotal || 0)}`
  ).join('\n');

  alert(
    `RESUMEN DEL PEDIDO\n` +
    (cliente ? `Cliente: ${cliente.nombre} (${cliente.cuenta}) · Lista ${cliente.lista}\n` : '') +
    `\n${txt}\n\nTOTAL: ${fmt(total)}\n\n` +
    `(Todavia no se guarda: eso llega en la proxima etapa)`
  );
}

// ---------- enganche ----------

document.addEventListener('carrito:abrir', abrir);
document.addEventListener('carrito:cambio', dibujar);

window.CarritoPanel = { abrir, cerrar };