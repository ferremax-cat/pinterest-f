/**
 * PANEL DEL CARRITO
 *
 * Dos vistas segun el rol:
 * - Vendedor: ventana centrada, semaforo de credito, reordenar por prioridad.
 * - Cliente: lamina lateral con imagen, sin nada de credito.
 *
 * El precio se pide siempre a js/precios.js. Este modulo solo dibuja.
 */

const fmt = n => '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

const VERDE = '#16a34a';
const NARANJA = '#ff9404';
const ROJO = '#dc2626';

let moviendo = null;   // sku de la linea que se esta reubicando

let config = null;

async function cargarConfig() {
  if (config) return config;

  const token = sessionStorage.getItem('authToken');
  if (!token) {
    // Sin endpoint: valores por defecto para poder trabajar igual
    config = { descuentosLinea: [5,7,10], descuentosTotal: [5,7,10],
               descuentoRevendedor: 23, observaciones: [], umbralAviso: 0,
               umbralBloqueo: 0, modoObservacion: true };
    return config;
  }

  try {
    const URL_API = 'https://script.google.com/macros/s/AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec';
    const r = await fetch(URL_API, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'config', token })
    });
    const d = await r.json();
    if (d.ok) config = d;
  } catch (e) {
    console.warn('[Carrito] No se pudo traer la configuracion:', e);
  }

  if (!config) {
    config = { descuentosLinea: [5,7,10], descuentosTotal: [5,7,10],
               descuentoRevendedor: 23, observaciones: [], umbralAviso: 0,
               umbralBloqueo: 0, modoObservacion: true };
  }
  window.__cfgCheck = true;
  return config;
}


/**
 * Trae el disponible del cliente en vista. El panel no puede depender de
 * que la seleccion de cliente lo haya guardado: puede haber fallado.
 */
async function asegurarDisponible() {
  if (sessionStorage.getItem('disponibleCliente')) return true;

  const token = sessionStorage.getItem('authToken');
  const cli = window.Precios?.getClienteVista();
    if (!token || !cli) {
    console.log('[Carrito] asegurarDisponible corta — token:', !!token, 'cliente:', cli);
    return false;
  }

  try {
    const URL_API = 'https://script.google.com/macros/s/AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec';
    const r = await fetch(URL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'finanzas', token, cuenta: String(cli.cuenta) })
    });
    const d = await r.json();
    if (d.ok && d.disponible !== undefined) {
      sessionStorage.setItem('disponibleCliente', String(d.disponible));
      sessionStorage.setItem('disponibleDeCuenta', String(cli.cuenta));
      return true;
    }
  } catch (e) {
    console.warn('[Carrito] No se pudo traer el disponible:', e);
  }
  console.log('[Carrito] asegurarDisponible: la respuesta no trajo disponible');
  return false;
}

function esVendedor() {
  const rol = sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol
      || '';
  return rol !== 'cliente_estandar';
}

function getDisponible() {
  // El disponible se guarda junto con la cuenta a la que pertenece:
  // asi nunca se usa el de un cliente para otro
  const v = sessionStorage.getItem('disponibleCliente');
  const de = sessionStorage.getItem('disponibleDeCuenta');
  const cli = window.Precios?.getClienteVista();

  if (v === null) return null;
  if (cli && de && String(cli.cuenta) !== String(de)) return null;
  return Number(v);
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
  document.body.style.overflow = 'hidden';

  if (!esVendedor()) { dibujar(); return; }

  // Carrito vacio: no hay semaforo que calcular, no hay que esperar nada
  if (!window.Carrito.leer().length) { dibujar(); return; }

  // Con el cupo y la configuracion ya cargados, abre sin esperar nada
  if (sessionStorage.getItem('disponibleCliente') && config) {
    console.log('[Carrito] camino rapido');
    dibujar();
    return;
  }

  console.log('[Carrito] camino lento — disponible:', !!sessionStorage.getItem('disponibleCliente'), 'config:', !!config);

  // Sin el cupo no hay semaforo, y mostrar el panel a medias confunde:
  // esperamos el dato con un aviso claro
  cont.innerHTML = `
    <div class="cp-caja">
      <div class="cp-cargando">
        <div class="cp-spinner"></div>
        <p>Consultando el cupo del cliente...</p>
      </div>
    </div>`;

  Promise.all([cargarConfig(), asegurarDisponible()]).then(() => dibujar());
}

export function cerrar() {
  const cont = document.getElementById('carrito-panel');
  if (cont) cont.style.display = 'none';
  document.body.style.overflow = '';

  // Foco en el buscador con el texto seleccionado: el usuario escribe
  // su proxima busqueda sin tener que borrar lo anterior
  const buscador = document.querySelector('input[placeholder*="Buscar en cat"]');
  if (buscador) {
    buscador.focus();
    buscador.select();
  }
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
  const tot = window.Carrito.totales();
  const aj = window.Carrito.getAjustePedido();  

  if (!lineas.length) return cajaVacia(cliente?.nombre || '');

  let acum = 0;
  let hayRojo = false;

  const filas = lineas.map((l, i) => {
        // El acumulado se mide sobre el neto: si hay descuento de total,
    // los renglones tienen que reflejarlo
    const factor = tot.bruto ? tot.neto / tot.bruto : 1;
    acum += (l.subtotal || 0) * factor;
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
          <p class="cp-meta">${l.sku}${l.bulto ? ' · bulto ' + l.bulto : ''}${disponible !== null ? ' · acum. ' + fmt(acum) : ''}${l.descEfectivo ? ' · <span class="cp-ajustado">' + (l.listaForzada ? 'lista ' + l.listaForzada + ' · ' : '') + (l.descEfectivo > 0 ? '-' : '+') + Math.abs(l.descEfectivo) + '%</span>' : ''}</p>
        </div>
        <input type="number" min="1" class="cp-cant" value="${l.cantidad}" data-sku="${l.sku}">
        <span class="cp-sub" style="color:${col}">${l.subtotal !== null ? fmt(l.subtotal) : '--'}</span>
        <button class="cp-menu" data-sku="${l.sku}" title="Mas opciones">&#8942;</button>
        <button class="cp-quitar" data-sku="${l.sku}" title="Quitar">&times;</button>
      </div>`;
  }).join('');

  // El excedente se mide contra el total NETO, ya con el descuento aplicado
  const exc = disponible !== null ? tot.neto - disponible : null;

    const cabecera = disponible === null ? `
    <div class="cp-cupo" style="background:#f4f4f4">
      <span class="cp-cupo-rot">Consultando cupo del cliente...</span>
      <span class="cp-cupo-num" style="color:#999">--</span>
    </div>` : `
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
        <div class="cp-desc-total">
          <span class="cp-total-rot">Sobre el total</span>
          <select class="cp-desc-pedido">
            <option value="0">Sin descuento</option>
            ${(config?.descuentosTotal || [5,7,10]).map(d =>
              `<option value="${d}" ${tot.descuentoTotal === d ? 'selected' : ''}>-${d}%</option>`).join('')}
          </select>
          <select class="cp-obs-pedido">
            <option value="">Sin observación</option>
            ${(config?.observaciones || []).map(o =>
              `<option value="${o}" ${aj.motivo === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="cp-pie-abajo">
          <div>
            <div>
              <span class="cp-total-rot">Total</span>
              <span class="cp-total-num">${fmt(tot.neto)}</span>
            </div>
            ${tot.descGlobal !== 0 ? `<p class="cp-ref-total">de lista ${fmt(tot.aLista)} · <b>${tot.descGlobal > 0 ? '-' : '+'}${Math.abs(tot.descGlobal)}% efectivo</b></p>` : ''}
          </div>
          <div class="cp-acciones">
            <button class="cp-vaciar">Vaciar</button>
            <button class="cp-seguir">Volver al catálogo</button>
            <button class="cp-confirmar" ${hayRojo ? 'disabled title="Hay artículos fuera del cupo"' : ''}>Confirmar pedido</button>
          </div>
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
    <div class="cp-img" data-sku="${l.sku}"${l.img ? ` style="background-image:url(${l.img})"` : ''}></div>
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

    // Seleccionar al entrar: se escribe la cantidad nueva sin borrar
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('click', () => inp.select());
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
  
    cont.querySelector('.cp-desc-pedido')?.addEventListener('change', (e) => {
    const aj = window.Carrito.getAjustePedido();
    window.Carrito.setAjustePedido({ ...aj, descuento: e.target.value });
    dibujar();
  });

  cont.querySelector('.cp-obs-pedido')?.addEventListener('change', (e) => {
    const aj = window.Carrito.getAjustePedido();
    window.Carrito.setAjustePedido({ ...aj, motivo: e.target.value });
    dibujar();
  });
}

function abrirMenu(btn) {
  document.querySelectorAll('.cp-panel-menu').forEach(p => p.remove());

  const fila = btn.closest('.cp-fila');
  const sku = btn.dataset.sku;
  const l = window.Carrito.detalle().find(x => x.sku === sku);
  if (!l) return;

  const cfg = config || { descuentosLinea: [5,7,10], observaciones: [] };
  const cli = window.Precios?.getClienteVista();
  const listaCli = cli?.lista || '';

  const mec = l.mecanismo || 'lista_cliente';  

  // Un solo desplegable: las tres listas mas precio especial
  const valorSel = mec === 'precio_libre' ? 'libre'
                 : (l.listaForzada || listaCli);

  const opcListas = ['D','E','F'].map(x =>
    `<option value="${x}" ${valorSel === x ? 'selected' : ''}>Lista ${x}${x === listaCli ? ' (cliente)' : ''}</option>`
  ).join('') +
  `<option value="libre" ${valorSel === 'libre' ? 'selected' : ''}>Precio especial</option>`;

    const opcDesc = (cfg.descuentosLinea || []).map(d =>
    `<option value="${d}" ${Number(l.descuento) === d ? 'selected' : ''}>-${d}%</option>`
  ).join('');

 

  

  const pan = document.createElement('div');
  pan.className = 'cp-panel-menu';
  pan.innerHTML = `
    
    <select class="cp-lista" data-sku="${sku}">${opcListas}</select>
    <input type="number" class="cp-precio-libre" data-sku="${sku}" placeholder="Precio"
    value="${l.precioLibre || ''}" style="display:${mec === 'precio_libre' ? '' : 'none'}">
    <button class="cp-ok-precio" title="Confirmar precio" style="display:${mec === 'precio_libre' ? '' : 'none'}">&#10003;</button>
    <select class="cp-desc-linea" data-sku="${sku}">
      <option value="0">Sin descuento</option>${opcDesc}
    </select>
    
    <button class="cp-mover" data-sku="${sku}">Mover</button>
    <span class="cp-ref">de lista ${fmt(l.precioBase || 0)}${l.descEfectivo ? ' · <b style="color:#ff9404">' + (l.descEfectivo > 0 ? '-' : '+') + Math.abs(l.descEfectivo) + '% efectivo</b>' : ''}</span>`;
  fila.insertAdjacentElement('afterend', pan);

    // Si el panel queda fuera de la vista, traerlo: en pantallas chicas
  // se abre debajo del borde y parece que no paso nada
  pan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Si ya hay precio especial, dejarlo seleccionado para reescribir directo
  const inpPrecio = pan.querySelector('.cp-precio-libre');
  if (mec === 'precio_libre' && inpPrecio.value) {
    inpPrecio.focus();
    inpPrecio.select();
  }

    const aplicar = () => {
    const sel = pan.querySelector('.cp-lista').value;
    const esLibre = sel === 'libre';

    window.Carrito.ajustarLinea(sku, {
      mecanismo: esLibre ? 'precio_libre' : (sel === listaCli ? 'lista_cliente' : 'otra_lista'),
      lista: esLibre ? null : sel,
      precioLibre: pan.querySelector('.cp-precio-libre').value,
      descuento: pan.querySelector('.cp-desc-linea').value,
      
    });
    dibujar();
  };

    pan.querySelector('.cp-lista').addEventListener('change', (e) => {
    const esLibre = e.target.value === 'libre';
    pan.querySelector('.cp-precio-libre').style.display = esLibre ? '' : 'none';
    pan.querySelector('.cp-ok-precio').style.display = esLibre ? '' : 'none';
    if (esLibre) {
      pan.querySelector('.cp-precio-libre').focus();
      pan.querySelector('.cp-precio-libre').select();
    } else {
      aplicar();
    }
  });

  pan.querySelector('.cp-precio-libre').addEventListener('change', aplicar);

  pan.querySelector('.cp-precio-libre').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aplicar();
  });

  pan.querySelector('.cp-ok-precio').addEventListener('click', aplicar);

  pan.querySelector('.cp-desc-linea').addEventListener('change', aplicar);

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
// Intentar varias veces: el rol tarda en estar disponible al cargar
[500, 1500, 3000].forEach(ms => setTimeout(() => { if (!config && esVendedor()) cargarConfig(); }, ms));

window.CarritoPanel = { abrir, cerrar };