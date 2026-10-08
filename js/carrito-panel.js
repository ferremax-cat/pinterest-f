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
const SIN_CUPO = '#d1d5db';   // barra de las lineas cuando no hay semaforo

let moviendo = null;   // sku de la linea que se esta reubicando

let config = null;

async function cargarConfigInterna() {
  if (config) return config;

  const token = sessionStorage.getItem('authToken');
  if (!token) {
    // Sin endpoint: valores por defecto para poder trabajar igual
    config = { descuentosLinea: [5,7,10], descuentosTotal: [5,7,10],
               descuentoRevendedor: 23, observaciones: [], umbralAviso: 0,
               umbralBloqueo: 0, modoObservacion: true };
    return config;
  }

  // Guardada mientras dura la sesion: se pide una vez al entrar y cualquier
  // cambio en la planilla llega la proxima vez que el vendedor inicia sesion
  try {
    const guardada = sessionStorage.getItem('configCarrito');
    if (guardada) {
      config = JSON.parse(guardada);
      return config;
    }
  } catch (e) {}

  try {
    const d = await window.Api.llamar({ accion: 'config', token });
    if (d.ok) {
      config = d;
      sessionStorage.setItem('configCarrito', JSON.stringify(d));
    }
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


// Si ya hay una consulta en curso, esperarla: los reintentos programados
// al cargar la pagina lanzaban varias iguales al mismo tiempo
let configEnCurso = null;

async function cargarConfig() {
  if (config) return config;
  if (!configEnCurso) {
    configEnCurso = cargarConfigInterna().finally(() => { configEnCurso = null; });
  }
  return configEnCurso;
}

/**
 * Trae el disponible del cliente en vista. El panel no puede depender de
 * que la seleccion de cliente lo haya guardado: puede haber fallado.
 * Devuelve 'ok', 'fallo' (sin respuesta o con error) o 'sin_datos' (no hay
 * token o cliente elegido: no se consulto).
 */
async function asegurarDisponible() {
  // Solo sirve el disponible de este mismo cliente
  if (getDisponible() !== null) return 'ok';

  const token = sessionStorage.getItem('authToken');
  const cli = window.Precios?.getClienteVista();
    if (!token || !cli) {
    console.log('[Carrito] asegurarDisponible corta — token:', !!token, 'cliente:', cli);
    return 'sin_datos';
  }

    try {
    const d = await window.Api.llamar({ accion: 'finanzas', token, cuenta: String(cli.cuenta) });
    if (d.ok && d.disponible !== undefined) {
      sessionStorage.setItem('disponibleCliente', String(d.disponible));
      sessionStorage.setItem('disponibleDeCuenta', String(cli.cuenta));
      return 'ok';
    }
    console.warn('[Carrito] La consulta del cupo no trajo disponible:', d.error || d);
  } catch (e) {
    console.warn('[Carrito] No se pudo traer el disponible:', e);
  }
  return 'fallo';
}

// ---------- falla de la consulta del cupo ----------
// La falla se recuerda por cuenta: al cerrar y abrir el panel el aviso
// sigue, sin volver a consultar sola. Solo "Reintentar" consulta de nuevo.

let consultandoCupo = false;
// Cuenta para la que ya se arranco una consulta sin pedido del usuario:
// evita repetirla en cada redibujo si no hay token o cliente
let consultaAutoDe = null;

function cupoFallido() {
  const cli = window.Precios?.getClienteVista();
  return !!cli && sessionStorage.getItem('cupoFallidoDe') === String(cli.cuenta);
}

/**
 * Unica forma de consultar el cupo: guarda o borra la falla y redibuja.
 * mostrarConsultando: redibujar al empezar, para que el boton Reintentar
 * pase a "Consultando…" (no se usa al abrir, donde ya hay un spinner).
 */
async function pedirCupo(mostrarConsultando) {
  if (consultandoCupo) return;
  consultandoCupo = true;
  if (mostrarConsultando) dibujar();

  const cli = window.Precios?.getClienteVista();
  const r = await asegurarDisponible();
  consultandoCupo = false;

  if (cli && r === 'fallo') sessionStorage.setItem('cupoFallidoDe', String(cli.cuenta));
  if (r === 'ok') sessionStorage.removeItem('cupoFallidoDe');

  dibujar();
}

function esVendedor() {
  const rol = sessionStorage.getItem('authRol')
      || window.menuFuncionalidades?.usuarioActual?.rol
      || '';
  // Sin rol todavia se mantiene como antes; con rol, solo los que piden
  if (rol === 'cliente_estandar') return false;
  return rol === '' || window.Carrito.puedePedir();
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

  // Sin token no hay cupo ni confirmacion posible
    if (sessionStorage.getItem('authDegradado') === '1') {
    const motivo = sessionStorage.getItem('authMotivo');
    // token_pendiente: el token del personal se esta pidiendo (sesion.js);
    // al llegar, auth:token-listo vuelve a abrir el panel
    const [titulo, texto] =
      motivo === 'token_pendiente' ? ['Conectando con el sistema de pedidos…', 'Probá de nuevo en unos segundos.']
      : motivo === 'sin_servicio' ? ['El sistema de pedidos no está disponible', 'Podés seguir viendo el catálogo. Probá de nuevo en unos minutos.']
      : ['Tu sesión expiró', 'Salí y volvé a entrar para armar pedidos.'];
    cont.innerHTML = `
      <div class="cp-caja">
        <div class="cp-cargando">
          <p style="color:#dc2626;font-weight:600">${titulo}</p>
          <p>${texto}</p>
          <button class="cp-cerrar-exito">Entendido</button>
        </div>
      </div>`;
    cont.querySelector('.cp-cerrar-exito').addEventListener('click', cerrar);
    return;
  }

  // Carrito vacio: no hay semaforo que calcular, no hay que esperar nada
  if (!window.Carrito.leer().length) { dibujar(); return; }

  

  // Con el cupo y la configuracion ya cargados, abre sin esperar nada
  if (getDisponible() !== null && config) {
    console.log('[Carrito] camino rapido');
    dibujar();
    return;
  }

  // La consulta del cupo ya fallo para este cliente: se abre con el aviso
  // y no se vuelve a consultar sola (para eso esta el boton Reintentar)
  if (cupoFallido()) {
    console.log('[Carrito] cupo no disponible: abre con el aviso');
    if (config) dibujar();
    else cargarConfig().then(() => dibujar());
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

  Promise.all([cargarConfig(), pedirCupo()]).then(() => dibujar());
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

  const pend = window.Carrito?.getPendiente?.();
  if (pend) {
    dibujarPendiente(pend);
    return;
  }


  const cont = document.getElementById('carrito-panel');
  if (!cont || cont.style.display === 'none') return;

  // Conservar la posicion: al redibujar se perdia y el usuario tenia
  // que volver a buscar donde estaba
  const lista = cont.querySelector('.cp-lista');
  const scroll = lista ? lista.scrollTop : 0;

  cont.innerHTML = esVendedor() ? vistaVendedor() : vistaCliente();
  conectar(cont);

  const listaNueva = cont.querySelector('.cp-lista');
  if (listaNueva && scroll) listaNueva.scrollTop = scroll;

  ajustarAltura();
}

// ---------- vista del vendedor ----------

function vistaVendedor() {
  const lineas = window.Carrito.detalle();
  const disponible = getDisponible();
  const cliente = window.Precios?.getClienteVista();
  const total = lineas.reduce((a, l) => a + (l.subtotal || 0), 0);
  const tot = window.Carrito.totales();
  const aj = window.Carrito.getAjustePedido(); 
    // En una revision, marcar lo que el cliente no habia pedido
  const origenSkus = window.Carrito.getOrigen() ? window.Carrito.getOrigenSkus() : null; 

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
    // Sin cupo no hay semaforo: barra gris, nunca un color que sugiera
    // que la linea entra en el credito
    const barra = c || SIN_CUPO;

    if (moviendo && moviendo !== l.sku) {
      return `
        <div class="cp-fila cp-destino" data-destino="${l.sku}">
          <div class="cp-barra" style="background:${barra}"></div>
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
          <div class="cp-barra" style="background:${barra}"></div>
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
        <div class="cp-barra" style="background:${barra}"></div>
          <div class="cp-desc">
          <p class="cp-nombre" style="color:${col}">${l.nombre || l.sku}</p>
          <p class="cp-meta">${l.sku}${l.bulto ? ' · bulto ' + l.bulto : ''}${disponible !== null ? ' · acum. ' + fmt(acum) : ''}${l.enPromo ? ' · <span class="cp-promo">Promo</span>' : (l.descEfectivo ? ' · <span class="cp-ajustado">' + (l.listaForzada ? 'lista ' + l.listaForzada + ' · ' : '') + (l.descEfectivo > 0 ? '-' : '+') + Math.abs(l.descEfectivo) + '%</span>' : '')}${l.cantVendedor ? ' · <span class="cp-previa">vos tenías ' + l.cantVendedor + '</span>' : ''}${origenSkus && !origenSkus.includes(l.sku) ? ' · <span class="cp-previa">agregado por vos</span>' : ''}</p>
        </div>
        <input type="number" min="1" class="cp-cant" value="${l.cantidad}" data-sku="${l.sku}">
        <span class="cp-sub" style="color:${col}">${l.subtotal !== null ? fmt(l.subtotal) : '--'}</span>
        <button class="cp-menu" data-sku="${l.sku}" title="Mas opciones">&#8942;</button>
        <button class="cp-quitar" data-sku="${l.sku}" title="Quitar">&times;</button>
      </div>`;
  }).join('');

  // El excedente se mide contra el total NETO, ya con el descuento aplicado
  const exc = disponible !== null ? tot.neto - disponible : null;

  // Sin cupo: o fallo la consulta (aviso con Reintentar) o se esta
  // consultando. En ese ultimo caso, si nadie lo pidio todavia para este
  // cliente, se consulta una sola vez
  if (disponible === null && !cupoFallido() && !consultandoCupo) {
    const cuenta = String(cliente?.cuenta ?? '');
    if (consultaAutoDe !== cuenta) {
      consultaAutoDe = cuenta;
      setTimeout(() => pedirCupo(), 0);
    }
  }

    const cabecera = disponible === null && cupoFallido() ? `
    <div class="cp-cupo" style="background:#fff7ed;border-left:4px solid ${NARANJA};align-items:center;gap:12px">
      <span class="cp-cupo-rot" style="color:#1f2937;line-height:1.4">No se pudo consultar el cupo del cliente.
        El semáforo no está disponible: revisá el crédito antes de confirmar.</span>
      <button class="cp-cupo-reintentar" ${consultandoCupo ? 'disabled' : ''}
        style="flex-shrink:0;padding:6px 12px;border:1px solid ${ROJO};border-radius:6px;background:#fff;
        color:${ROJO};font-size:13px;font-weight:600;cursor:pointer">${consultandoCupo ? 'Consultando…' : 'Reintentar'}</button>
    </div>` : disponible === null ? `
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
          <span class="cp-total-rot">Al total</span>
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
          ${tot.enPromo ? `<span class="cp-nota-promo">${fmt(tot.enPromo)} en promoción, sin descuento</span>` : ''}
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
            <button class="cp-confirmar">Confirmar pedido</button>
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
        <p class="cp-meta">${l.sku}${l.bulto ? ' · bulto ' + l.bulto : ''}${l.enPromo ? ' · <span class="cp-promo">Promo</span>' : ''}</p>
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

  // Volver a consultar el cupo despues de una falla
  cont.querySelector('.cp-cupo-reintentar')?.addEventListener('click', () => pedirCupo(true));

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

  cont.querySelector('.cp-vaciar')?.addEventListener('click', confirmarVaciar);

  cont.querySelector('.cp-confirmar')?.addEventListener('click', confirmarPedido);

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
  const fila = btn.closest('.cp-fila');
  const sku = btn.dataset.sku;

  // Si el menu de esta linea ya esta abierto, cerrarlo
  const siguiente = fila.nextElementSibling;
  const yaAbierto = siguiente && siguiente.classList.contains('cp-panel-menu');

  document.querySelectorAll('.cp-panel-menu').forEach(p => p.remove());
  if (yaAbierto) return;

  const l = window.Carrito.detalle().find(x => x.sku === sku);
  if (!l) return;

  // Las lineas en promocion tienen precio cerrado: solo se puede mover o quitar
  if (l.enPromo) {
    const pan = document.createElement('div');
    pan.className = 'cp-panel-menu';
    pan.innerHTML = `
      <span class="cp-ref">Precio de promoción: no admite ajustes</span>
      <button class="cp-mover" data-sku="${sku}">Mover</button>`;
    fila.insertAdjacentElement('afterend', pan);
    pan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    pan.querySelector('.cp-mover').addEventListener('click', () => {
      moviendo = sku;
      dibujar();
    });
    return;
  }

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

function nuevoId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'PED-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}



// Motivo que se muestra en la vista de confirmacion pendiente
let motivoPendiente = '';

// Errores con los que el servidor rechaza el pedido antes de escribir nada
const RECHAZOS_PREVIOS = ['token_invalido', 'pedido_vacio', 'falta_cliente',
  'cliente_no_encontrado', 'cliente_de_otro_vendedor', 'no_autorizado',
  'rol_sin_permiso'];

/**
 * Vista del carrito mientras no se sabe si el pedido se guardo: no permite
 * editar, solo reintentar con el mismo pedido o cerrar el panel.
 */
function dibujarPendiente(pend) {
  const cont = document.getElementById('carrito-panel');
  if (!cont) return;

  // Los ultimos caracteres son los que distinguen un pedido de otro
  const idCorto = String(pend.id).slice(-8);
  const hora = new Date(pend.desde).toLocaleTimeString('es-AR',
    { hour: '2-digit', minute: '2-digit' });
  const texto = motivoPendiente
    || 'No pudimos confirmar si el pedido se guardó. Tocá Reintentar: si ya estaba guardado, no se va a duplicar.';

  cont.innerHTML = `
    <div class="cp-caja">
      <div class="cp-exito">
        <div class="cp-check" style="background:#ff9404">!</div>
        <p class="cp-exito-tit">Confirmación pendiente</p>
        <p class="cp-exito-det">${texto}</p>
        <p class="cp-exito-det">Pedido ${idCorto} · ${hora}</p>
        <button class="cp-reintentar cp-cerrar-exito">Reintentar confirmación</button>
        <button class="cp-pend-cerrar" style="display:block;margin:10px auto 0;background:none;border:none;text-decoration:underline;cursor:pointer">Cerrar</button>
      </div>
    </div>`;

  cont.querySelector('.cp-reintentar').addEventListener('click', confirmarPedido);
  cont.querySelector('.cp-pend-cerrar').addEventListener('click', cerrar);
}


/**
 * Aviso dentro del panel: los del navegador muestran la direccion del
 * sitio y quedan mal.
 */
function avisar(texto, tipo) {
  const cont = document.getElementById('carrito-panel');
  if (!cont) return;

  document.querySelectorAll('.cp-aviso').forEach(a => a.remove());

  const av = document.createElement('div');
  av.className = 'cp-aviso ' + (tipo === 'error' ? 'cp-aviso-error' : '');
  av.textContent = texto;
  cont.querySelector('.cp-caja')?.appendChild(av);

  setTimeout(() => av.remove(), 3000);
}

/**
 * Confirmacion de vaciar dentro del panel: confirm() del navegador muestra
 * la direccion del sitio y rompe el diseño. Cancelar es la opcion segura:
 * tiene el foco y tambien se cancela con Escape o tocando afuera.
 */
function confirmarVaciar() {
  const caja = document.querySelector('#carrito-panel .cp-caja');
  if (!caja || caja.querySelector('.cp-confirma')) return;

  const n = window.Carrito.cantidadItems();
  const cli = window.Precios?.getClienteVista();

  const capa = document.createElement('div');
  capa.className = 'cp-confirma';
  capa.innerHTML = `
    <div class="cp-confirma-caja" role="alertdialog" aria-modal="true" aria-labelledby="cp-confirma-tit">
      <p class="cp-confirma-tit" id="cp-confirma-tit">¿Vaciar el pedido?</p>
      <p class="cp-confirma-det"></p>
      <div class="cp-confirma-botones">
        <button type="button" class="cp-confirma-cancelar">Cancelar</button>
        <button type="button" class="cp-confirma-vaciar">Vaciar pedido</button>
      </div>
    </div>`;

  // Con textContent: el nombre del cliente no se interpreta como HTML
  capa.querySelector('.cp-confirma-det').textContent =
    `Se van a quitar ${n} artículo${n !== 1 ? 's' : ''}` +
    (cli?.nombre ? ` del pedido de ${cli.nombre}` : '') + '. No se puede deshacer.';

  caja.appendChild(capa);

  const alTeclado = e => {
    if (e.key === 'Escape') { e.stopPropagation(); cerrarConfirma(); }
  };
  const cerrarConfirma = () => {
    capa.remove();
    document.removeEventListener('keydown', alTeclado);
  };

  capa.querySelector('.cp-confirma-cancelar').addEventListener('click', cerrarConfirma);
  capa.querySelector('.cp-confirma-vaciar').addEventListener('click', () => {
    cerrarConfirma();
    window.Carrito.vaciar();
    dibujar();
  });
  // Tocar afuera de la tarjeta (sobre la capa) cancela
  capa.addEventListener('click', e => { if (e.target === capa) cerrarConfirma(); });
  document.addEventListener('keydown', alTeclado);

  capa.querySelector('.cp-confirma-cancelar').focus();
}

async function confirmarPedido() {

  window.__t0 = performance.now();
  const btn = document.querySelector('.cp-confirmar, .cp-reintentar');
  if (!btn || btn.disabled) return;

  const cli = window.Precios?.getClienteVista();
  const esVend = esVendedor();

  // Sin cliente elegido el pedido no tiene destinatario
  if (esVend && !cli) {
    avisar('Elegí un cliente antes de confirmar el pedido.', 'error');
    return;
  }

  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    // Con una confirmacion pendiente se reenvia exactamente el mismo pedido,
    // con el mismo id: el servidor lo reconoce y no lo duplica
    const pend = window.Carrito.getPendiente();
    const esReintento = !!(pend && pend.pedido);
    let pedido;

    if (esReintento) {
      pedido = pend.pedido;
    } else {
      const d = await window.Carrito.detalleVerificado();

      console.log('[Tiempos] verificación:', Math.round(performance.now() - window.__t0), 'ms');
      console.log('[Pedido] líneas:', d.lineas.map(l => ({ sku: l.sku, mecanismo: l.mecanismo, listaForzada: l.listaForzada, descuento: l.descuento, precioLibre: l.precioLibre, precioBase: l.precioBase, precio: l.precio })));

      if (!d.ok) {
        avisar('Faltan precios de ' + (d.skus || []).join(', ') + '. Probá de nuevo en unos segundos.', 'error');
        return;
      }

      const t = window.Carrito.totales();
      const aj = window.Carrito.getAjustePedido();
      const cd = JSON.parse(localStorage.getItem('clientData') || '{}');

      // En una revision, registrar de donde vino cada linea
      const origenSkus = window.Carrito.getOrigen() ? window.Carrito.getOrigenSkus() : null;
      const origenDe = (l) => !origenSkus ? ''
        : !origenSkus.includes(l.sku) ? 'vendedor'
        : (l.cantVendedor ? 'ambos' : 'cliente');

      pedido = {
        id: nuevoId(),
        cliente: esVend ? cli.cuenta : String(cd.account || ''),
        lista: d.lista,
        canal: 'app',
        idOrigen: window.Carrito.getOrigen() || '',
        revision: window.Carrito.getOrigen() ? 1 : 0,
        totalBruto: t.bruto,
        descuentoTotal: t.descuentoTotal,
        totalNeto: t.neto,
        descEfectivoGlobal: t.descGlobal,
        motivo: aj.motivo,
        obsLibre: aj.obsLibre,
        lineas: d.lineas.map(l => ({
          sku: l.sku,
          nombre: l.nombre,
          cantidad: l.cantidad,
          listaAplicada: l.listaForzada || d.lista,
          // Registrar la promocion: sin esto el precio rebajado queda sin motivo
          mecanismo: l.enPromo ? 'promocion' : (l.mecanismo || 'lista_cliente'),
          precioBase: l.precioBase,
          precio: l.precio,
          descEfectivo: l.descEfectivo,
          subtotal: l.subtotal,
          origenLinea: origenDe(l)
        }))
      };

      // Registrar el intento antes de enviarlo: si la respuesta no llega,
      // el carrito queda bloqueado con este mismo pedido
      window.Carrito.setPendiente(pedido);
    }

    let resp;
    try {
      // Guardar tarda mas que una consulta: 20 s por intento y 2 reintentos
      resp = await window.Api.llamar({
        accion: 'guardar_pedido',
        token: sessionStorage.getItem('authToken'),
        pedido
      }, 2, 20000);
    } catch (e) {
      // Sin respuesta: no se sabe si se guardo
      console.error('[Carrito] Sin respuesta al guardar:', e);
      motivoPendiente = '';
      dibujar();
      return;
    }

    console.log('[Tiempos] total con guardado:', Math.round(performance.now() - window.__t0), 'ms');
    console.log('[Pedido] respuesta del servidor:', resp);

    if (!resp.ok) {
      // Rechazado antes de escribir y sin intentos previos: no se guardo nada
      if (!esReintento && RECHAZOS_PREVIOS.includes(resp.error)) {
        window.Carrito.borrarPendiente();
        avisar('No se pudo guardar: ' + resp.error, 'error');
        return;
      }
      // En cualquier otro caso la duda sigue: el carrito queda bloqueado
      motivoPendiente = resp.error === 'token_invalido'
        ? 'Tu sesión venció. Volvé a iniciar sesión y tocá Reintentar.'
        : resp.error === 'id_con_otro_contenido'
          ? 'Este pedido figura guardado (N° ' + resp.numero + ') con otro contenido. Consultá con la oficina antes de continuar.'
          : 'El servidor respondió con un error (' + resp.error + '). Tocá Reintentar en unos minutos.';
      dibujar();
      return;
    }

    // Guardado confirmado (nuevo o ya existente)
    const totalConfirmado = pedido.totalNeto;
    const nombreCli = cli ? cli.nombre
      : (JSON.parse(localStorage.getItem('clientData') || '{}').name || '');

    motivoPendiente = '';
    window.Carrito.vaciar();
    // El pedido revisado deja de figurar como pendiente
    window.Revision?.consultarPendientes();
    window.Carrito.setAjustePedido({ descuento: 0, motivo: '', obsLibre: '' });

    const cont = document.getElementById('carrito-panel');
    cont.innerHTML = `
      <div class="cp-caja">
        <div class="cp-exito">
          <div class="cp-check">&#10003;</div>
          <p class="cp-exito-tit">Pedido confirmado</p>
          <p class="cp-exito-num">N° ${resp.numero}</p>
          <p class="cp-exito-det">${nombreCli}</p>
          <p class="cp-exito-total">${fmt(totalConfirmado)}</p>
          <button class="cp-cerrar-exito">Listo</button>
        </div>
      </div>`;
    cont.querySelector('.cp-cerrar-exito').addEventListener('click', cerrar);

  } catch (err) {
    console.error('[Carrito] Error al confirmar:', err);
    if (window.Carrito.getPendiente()) {
      dibujar();
    } else {
      avisar('No se pudo guardar el pedido. Revisá la conexión.', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}


/**
 * Ajusta el alto del panel a la altura visible real. En los celulares las
 * barras del navegador tapan el pie y ni vh ni dvh lo resuelven del todo.
 */
function ajustarAltura() {
  const caja = document.querySelector('#carrito-panel .cp-caja');
  if (!caja) return;

  // Reservar espacio para la barra del navegador: en algunos celulares
  // ni innerHeight ni visualViewport la descuentan
  const alto = (window.visualViewport?.height || window.innerHeight) - 60;
  caja.style.setProperty('height', window.innerHeight + 'px', 'important');
  caja.style.setProperty('max-height', window.innerHeight + 'px', 'important');
}

// ---------- enganche ----------

document.addEventListener('carrito:abrir', abrir);
document.addEventListener('carrito:cambio', dibujar);
// Intentar varias veces: el rol tarda en estar disponible al cargar
[500, 1500, 3000].forEach(ms => setTimeout(() => { if (!config && esVendedor()) cargarConfig(); }, ms));

// Llego el token del personal: la configuracion que se cargo sin token son
// los valores por defecto, se vuelve a pedir; y si el panel estaba abierto
// con el aviso de conexion, se vuelve a abrir para mostrar el carrito
document.addEventListener('auth:token-listo', () => {
  if (!sessionStorage.getItem('configCarrito')) config = null;
  if (esVendedor()) cargarConfig();
  if (document.getElementById('carrito-panel')?.style.display === 'flex') abrir();
});

window.addEventListener('resize', () => {
  if (document.getElementById('carrito-panel')?.style.display === 'flex') ajustarAltura();
});

// Aviso cuando se intenta cargar sin cliente elegido
document.addEventListener('carrito:sin-cliente', () => {
  document.querySelectorAll('.aviso-sin-cliente').forEach(a => a.remove());
  const av = document.createElement('div');
  av.className = 'aviso-sin-cliente';
  av.textContent = 'Elegí un cliente antes de cargar productos';
  av.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:80px;background:#dc2626;color:#fff;padding:12px 18px;' +
      'border-radius:8px;font-size:13px;z-index:99999;text-align:center;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.3)';
  document.body.appendChild(av);
  setTimeout(() => av.remove(), 3000);
});


// Aviso cuando se intenta modificar un carrito con confirmacion pendiente
document.addEventListener('carrito:bloqueado', () => {
  document.querySelectorAll('.aviso-bloqueado').forEach(a => a.remove());
  const av = document.createElement('div');
  av.className = 'aviso-bloqueado';
  av.textContent = 'Este cliente tiene un pedido sin confirmar. Tocá acá para abrir el carrito y reintentar.';
  av.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:80px;background:#ff9404;color:#fff;padding:12px 18px;' +
      'border-radius:8px;font-size:13px;z-index:99999;text-align:center;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer;max-width:90vw';
  av.addEventListener('click', () => { av.remove(); abrir(); });
  document.body.appendChild(av);
  setTimeout(() => av.remove(), 5000);
});


window.CarritoPanel = { abrir, cerrar };