/**
 * CAMBIO DE CUENTA DE UN PEDIDO CONFIRMADO: las pantallas
 *
 * "Mis pedidos" (menu de funcionalidades; para admin y oficina, "Pedidos"):
 * los pedidos de los ultimos dias (accion mis_pedidos) en tarjetas, con un
 * buscador. Al tocar uno: elegir el cliente correcto (clientes_nombres.json,
 * nada financiero) y ver la vista previa antes de cambiar. Tambien se abre
 * directo con un pedido: desde la pantalla de exito del carrito (el enlace
 * "Cambiar el cliente") y desde la bandeja (catalogo.html?cambiar=<id>).
 *
 * La vista previa se calcula UNA vez (cambio-cuenta-calculo.js) y lo que se
 * manda es exactamente ese resultado: al confirmar no se recalcula. Si con la
 * vista previa abierta se actualizan los precios o las promociones (se
 * refrescan solos), se cierra y se pide volver a abrirla: nunca se manda algo
 * distinto de lo que se vio.
 * En el celular, arriba lo que decide (cliente viejo -> nuevo y total viejo ->
 * nuevo, o "Los precios no cambian"); las lineas abajo, plegadas si son muchas.
 */
import { abrirHoja, esAncha } from './hoja.js';
import { recalcularLineas, resumenCambio, lineasParaEnviar } from './cambio-cuenta-calculo.js';

const ROLES = ['admin', 'vendedor_estandar', 'oficina'];
const DIAS_AVISO_FACTURA = 7;       // aviso "si ya se facturo" (no bloquea)
const MAX_LINEAS_ABIERTAS = 3;      // mas lineas que cambian: plegadas
const MAX_CLIENTES = 30;

const fmt = n => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fechaCorta = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); };
const rol = () => sessionStorage.getItem('authRol') || '';
const esVendedor = () => rol() === 'vendedor_estandar';
const llamar = payload => window.Api.llamar({ ...payload, token: sessionStorage.getItem('authToken') }, 2, 20000);

const MOTIVOS = { lista: 'lista nueva', entra_promo: 'entra en promoción', sale_promo: 'sale de promoción', promo: 'promoción' };

/** Texto para cada error del servidor (pedido: lo de pedido_para_cambio; cuenta: la elegida) */
export function textoError(error, pedido = {}, cuenta = '') {
  const num = pedido.numero ? `N° ${pedido.numero}` : 'el pedido';
  return ({
    cuenta_de_otro_vendedor: `La cuenta ${cuenta} es de otro vendedor, así que no podés pasarle el pedido vos. ` +
      `Pedíselo a la oficina, indicando el ${num} y la cuenta correcta.`,
    pedido_de_otro_vendedor: 'Este pedido lo cargó otro vendedor: solo él, la oficina o un administrador pueden cambiarlo.',
    fuera_de_plazo: `El ${num} tiene más de 14 días. Pedíselo a la oficina.`,
    misma_cuenta: 'El pedido ya es de esa cuenta.',
    cliente_no_encontrado: `No se encontró la cuenta ${cuenta}.`,
    cuenta_invalida: 'Esa cuenta no es válida.',
    cuenta_puente: 'Los clientes nuevos (cuentas puente) tienen su propio camino: la oficina les carga el número de cuenta.',
    cuenta_prueba: 'Los pedidos de prueba no se pasan a una cuenta real (ni al revés).',
    lista_invalida: `La cuenta ${cuenta} no tiene lista de precios cargada. Avisá a administración.`,
    anulado: 'El pedido está anulado.',
    pedido_de_cliente: 'Este pedido lo cargó el cliente: se corrige revisándolo.',
    pedido_cambiado: 'El pedido cambió mientras lo mirabas (otra persona lo modificó). Volvé a abrirlo para verlo como está ahora.',
    lineas_distintas: 'Las líneas no coinciden con las guardadas. Volvé a abrir el pedido.',
    faltan_columnas_cambio: 'Falta preparar la planilla para los cambios de cuenta. Avisá a administración.',
    verificacion_fallida: 'No se pudo confirmar que el cambio quedó guardado. Volvé a abrir el pedido para ver cómo está.',
    no_encontrado: 'No se encontró el pedido.',
    rol_sin_permiso: 'Tu usuario no puede cambiar pedidos.',
    token_invalido: 'La sesión venció. Volvé a entrar y probá de nuevo.'
  })[error] || `El servidor respondió con un error (${error}).`;
}

// ---------- datos de clientes (sin nada financiero) ----------
let clientesCache = null;
async function clientes() {
  if (clientesCache) return clientesCache;
  const [rn, rp] = await Promise.all([fetch('./json/clientes_nombres.json'), fetch('./json/clientes_permisos.json')]);
  const nombres = (await rn.json())?.clientes || {};
  const permisos = (await rp.json()) || {};
  clientesCache = Object.entries(nombres).map(([cuenta, c]) => ({ cuenta: String(cuenta),
    nombre: String(c?.nombre || '').trim(), vendedor: String(c?.vendedor || '').trim(),
    lista: permisos[cuenta]?.priceList || '' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return clientesCache;
}

/** Clientes que coinciden: la cuenta empieza igual o el nombre lo contiene (sin acentos) */
export function buscar(lista, texto, max = MAX_CLIENTES) {
  const q = sinAcentos(texto);
  if (!q) return [];
  return lista.filter(c => c.cuenta.startsWith(q) || sinAcentos(c.nombre).includes(q)).slice(0, max);
}

/** Productos del pedido en memoria (con sus tres listas), como el carrito antes de confirmar */
async function cargarProductos(skus) {
  const faltan = skus.filter(s => !window.productManager?.getProduct(s));
  if (faltan.length && window.productManagerInstance?.loadSpecificProducts) {
    try { await window.productManagerInstance.loadSpecificProducts(faltan); } catch (e) {
      console.warn('[CambioCuenta] No se pudieron cargar los productos:', e);
    }
  }
}

// ---------- la lista de pedidos ----------
export async function abrirLista() {
  if (!ROLES.includes(rol())) return;
  const h = abrirHoja({ titulo: esVendedor() ? 'Mis pedidos' : 'Pedidos' });
  h.cuerpo.innerHTML = '<p class="cc-cargando">Buscando los pedidos…</p>';
  let d;
  try { d = await llamar({ accion: 'mis_pedidos' }); } catch (e) { d = { ok: false, error: 'sin_conexion' }; }
  if (!d?.ok) {
    h.cuerpo.innerHTML = `<p class="cc-error">${d?.error === 'sin_conexion'
      ? 'No hay conexión. Probá de nuevo en un rato.' : esc(textoError(d?.error))}</p>`;
    return;
  }
  const pedidos = d.pedidos || [];
  h.cuerpo.innerHTML = `
    <input type="search" class="cc-buscar" placeholder="Buscar por número, cuenta o nombre" aria-label="Buscar pedido">
    <p class="cc-nota">Pedidos de los últimos ${Number(d.dias) || 14} días. Tocá uno para cambiarle el cliente.</p>
    <div class="cc-lista"></div>`;
  const cont = h.cuerpo.querySelector('.cc-lista');
  const pintar = q => {
    const t = sinAcentos(q);
    const vis = t ? pedidos.filter(p => sinAcentos(`${p.numero} ${p.cliente} ${p.nombre}`).includes(t)) : pedidos;
    cont.innerHTML = vis.length ? vis.map(p => `
      <button type="button" class="cc-pedido" data-id="${esc(p.id)}">
        <span class="cc-ped-fila"><b>N° ${esc(p.numero)}</b> · ${esc(fechaCorta(p.fecha))}
          <span class="cc-chip cc-chip-${p.impreso === 'si' ? 'imp' : p.impreso === 'intento' ? 'int' : 'pend'}">${
            p.impreso === 'si' ? 'Impreso' : p.impreso === 'intento' ? 'Sin confirmar' : 'Pendiente'}</span>
          ${p.prueba ? '<span class="cc-chip">PRUEBA</span>' : ''}${p.cambiado ? '<span class="cc-chip">Cliente cambiado</span>' : ''}</span>
        <span class="cc-ped-fila cc-ped-cli">${esc(p.cliente)} · ${esc(p.nombre)}<b class="cc-ped-total">${fmt(p.total)}</b></span>
      </button>`).join('') : `<p class="cc-nota">${t ? 'Ningún pedido coincide.' : 'No hay pedidos en estos días.'}</p>`;
  };
  pintar('');
  const inp = h.cuerpo.querySelector('.cc-buscar');
  inp.addEventListener('input', () => pintar(inp.value));
  cont.addEventListener('click', e => {
    const b = e.target.closest('.cc-pedido');
    if (b) abrirPedido(b.dataset.id, { hoja: h, alVolver: abrirLista });
  });
  if (esAncha()) inp.focus();
}

// ---------- un pedido: elegir el cliente ----------
/**
 * opc: { hoja (para seguir en la misma), alVolver (vuelve a la lista),
 * desdeBandeja (al terminar ofrece volver a la bandeja) }
 */
export async function abrirPedido(id, opc = {}) {
  if (!ROLES.includes(rol())) return;
  const h = opc.hoja || abrirHoja({ titulo: 'Cambiar el cliente' });
  h.ponerTitulo('Cambiar el cliente');
  h.pie.hidden = true;
  h.cuerpo.innerHTML = '<p class="cc-cargando">Abriendo el pedido…</p>';
  let ped;
  try { ped = await llamar({ accion: 'pedido_para_cambio', id }); } catch (e) { ped = { ok: false, error: 'sin_conexion' }; }
  if (!ped?.ok) {
    h.cuerpo.innerHTML = `<p class="cc-error">${ped?.error === 'sin_conexion'
      ? 'No hay conexión. Probá de nuevo en un rato.' : esc(textoError(ped?.error, ped))}</p>`;
    botonesPie(h, [opc.alVolver && ['Volver', 'hj-btn', () => opc.alVolver()]]);
    return;
  }
  const lista = await clientes().catch(() => []);
  h.cuerpo.innerHTML = `
    <div class="cc-pedido-cab">
      <p class="cc-ped-fila"><b>N° ${esc(ped.numero)}</b> · ${esc(fechaCorta(ped.fecha))} · ${fmt(ped.totalNeto)}</p>
      <p class="cc-ped-fila">Ahora: <b>${esc(ped.cliente)} · ${esc(ped.nombre)}</b> (lista ${esc(ped.lista)})</p>
    </div>
    <label class="cc-etiqueta" for="cc-cli">¿A qué cliente va?</label>
    <input type="search" id="cc-cli" class="cc-buscar" placeholder="Cuenta o nombre del cliente correcto" autocomplete="off">
    <div class="cc-clientes"></div>`;
  const inp = h.cuerpo.querySelector('#cc-cli');
  const res = h.cuerpo.querySelector('.cc-clientes');
  const cod = sessionStorage.getItem('authCodigo') || '';
  const pintar = () => {
    const encontrados = buscar(lista, inp.value).filter(c => c.cuenta !== ped.cliente);
    res.innerHTML = encontrados.map(c => {
      const ajeno = esVendedor() && c.vendedor && c.vendedor !== cod;
      return `<button type="button" class="cc-cli${ajeno ? ' cc-ajeno' : ''}" data-cuenta="${esc(c.cuenta)}">
        <b>${esc(c.cuenta)}</b> ${esc(c.nombre)}${ajeno ? '<small>de otro vendedor</small>' : ''}</button>`;
    }).join('') || (sinAcentos(inp.value) ? '<p class="cc-nota">Ningún cliente coincide.</p>' : '');
  };
  inp.addEventListener('input', pintar);
  res.addEventListener('click', e => {
    const b = e.target.closest('.cc-cli');
    if (!b) return;
    const c = lista.find(x => x.cuenta === b.dataset.cuenta);
    if (b.classList.contains('cc-ajeno')) {
      res.insertAdjacentHTML('afterbegin', `<p class="cc-error">${esc(textoError('cuenta_de_otro_vendedor', ped, c.cuenta))}</p>`);
      return;
    }
    if (!c.lista) {
      res.insertAdjacentHTML('afterbegin', `<p class="cc-error">${esc(textoError('lista_invalida', ped, c.cuenta))}</p>`);
      return;
    }
    vistaPrevia(h, ped, c, opc);
  });
  botonesPie(h, [opc.alVolver && ['Volver', 'hj-btn', () => opc.alVolver()]]);
  if (esAncha()) inp.focus();
}

function botonesPie(h, botones) {
  const bs = botones.filter(Boolean);
  h.pie.hidden = !bs.length;
  h.pie.innerHTML = bs.map(([t, cls], k) => `<button type="button" class="${cls}" data-k="${k}">${esc(t)}</button>`).join('');
  h.pie.querySelectorAll('button').forEach(b => b.addEventListener('click', () => bs[Number(b.dataset.k)][2](b)));
}

// ---------- vista previa ----------
/** El calculo, una sola vez: lo que se muestra y lo que se manda */
export function calcular(ped, cli) {
  const nuevas = recalcularLineas(ped.lineas, { listaVieja: ped.lista, listaNueva: cli.lista, cuentaNueva: cli.cuenta });
  return { ped, cli, nuevas, resumen: resumenCambio(ped, nuevas),
    envio: { accion: 'cambiar_cuenta', id: ped.id, cuentaNueva: cli.cuenta, lista: cli.lista,
      lineas: lineasParaEnviar(nuevas), totalAnterior: ped.totalNeto } };
}

/** HTML de la vista previa: arriba lo que decide, las lineas abajo */
export function htmlVistaPrevia(calc) {
  const { ped, cli, resumen: r } = calc;
  const dif = r.diferencia;
  const avisoFactura = Number(ped.dias) > DIAS_AVISO_FACTURA
    ? `<div class="cc-aviso cc-aviso-fuerte"><b>Este pedido es del ${esc(fechaCorta(ped.fecha))} (hace ${Number(ped.dias)} días).</b>
       Si ya se facturó, cambiar la cuenta acá no corrige la factura: avisale a facturación.</div>` : '';
  const avisoImpreso = ped.impreso !== 'no'
    ? `<div class="cc-aviso">${ped.impreso === 'si' ? 'Ya se imprimió' : 'Se mandó a imprimir'}: vuelve a pendientes y hay que reimprimirlo.
       La hoja vieja dice el cliente anterior; la nueva sale marcada como reemplazo.</div>` : '';
  const linea = l => `
    <li class="cc-linea">
      <span class="cc-lin-nom">${esc(l.nombre || l.sku)} <small>× ${esc(l.cantidad)}</small></span>
      <span class="cc-lin-precio">${fmt(l.anterior.precio)} → <b>${fmt(l.precio)}</b>
        ${MOTIVOS[l.motivo] ? `<small class="cc-motivo">${MOTIVOS[l.motivo]}</small>` : ''}</span>
      ${l.actualizado ? `<span class="cc-lin-nota">Este artículo además cambió de precio desde que se cargó el pedido
        (antes ${fmt(l.actualizado.antes)} en lista ${esc(l.actualizado.lista)}, hoy ${fmt(l.actualizado.hoy)}).</span>` : ''}
    </li>`;
  const cambian = r.cambian;
  const lineas = cambian.length ? `
    <details class="cc-lineas"${cambian.length <= MAX_LINEAS_ABIERTAS ? ' open' : ''}>
      <summary>${cambian.length === 1 ? 'La línea que cambia' : `Las ${cambian.length} líneas que cambian`}</summary>
      <ul>${cambian.map(linea).join('')}</ul>
    </details>` : '';
  const notas = [
    r.fijas ? `${r.fijas === 1 ? 'Una línea' : r.fijas + ' líneas'} con otra lista o precio especial elegido por el vendedor: no ${r.fijas === 1 ? 'cambia' : 'cambian'}.` : '',
    r.sinPrecio.length ? `Sin precio hoy (quedan igual, verificar): ${r.sinPrecio.map(l => esc(l.nombre || l.sku)).join(', ')}.` : ''
  ].filter(Boolean).map(t => `<p class="cc-nota">${t}</p>`).join('');
  return `
    ${avisoFactura}
    <div class="cc-decide">
      <p class="cc-dec-tit">Cliente</p>
      <p class="cc-dec-val"><s>${esc(ped.cliente)} · ${esc(ped.nombre)}</s></p>
      <p class="cc-dec-val cc-dec-nuevo">→ ${esc(cli.cuenta)} · ${esc(cli.nombre)}</p>
      ${cli.lista !== ped.lista ? `<p class="cc-nota">Lista ${esc(ped.lista)} → ${esc(cli.lista)}</p>` : ''}
      ${r.sinDiferencias
        ? '<p class="cc-sin-cambios"><b>Los precios no cambian.</b> Solo cambia el cliente.</p>'
        : `<p class="cc-dec-tit">Total</p>
           <p class="cc-dec-val">${fmt(r.totalAnterior)} → <b class="cc-dec-total">${fmt(r.totalNuevo)}</b>
             <small>(${dif > 0 ? '+' : ''}${fmt(dif).replace('$-', '−$')})</small></p>`}
    </div>
    ${avisoImpreso}
    ${lineas}
    ${notas}`;
}

function vistaPrevia(h, ped, cli, opc) {
  h.ponerTitulo('Revisá el cambio');
  h.cuerpo.innerHTML = '<p class="cc-cargando">Calculando…</p>';
  h.pie.hidden = true;
  let vigente = true;
  let calc = null;
  // Precios o promociones que se actualizan con la vista previa abierta: se
  // cierra y se pide volver a abrirla (no se recalcula por debajo)
  const alCambiarDatos = () => {
    if (!vigente) return;
    terminar();
    if (!h.cuerpo.isConnected) return;   // la hoja ya se cerro
    abrirPedidoConAviso(h, ped.id, opc,
      'Los precios o las promociones se actualizaron mientras mirabas. Volvé a elegir el cliente para ver la vista previa con los datos nuevos.');
  };
  const terminar = () => {
    vigente = false;
    document.removeEventListener('precios:actualizados', alCambiarDatos);
    document.removeEventListener('promos:actualizadas', alCambiarDatos);
  };
  document.addEventListener('precios:actualizados', alCambiarDatos);
  document.addEventListener('promos:actualizadas', alCambiarDatos);

  cargarProductos(ped.lineas.map(l => l.sku)).then(() => {
    if (!vigente) return;
    calc = calcular(ped, cli);
    h.cuerpo.innerHTML = htmlVistaPrevia(calc);
    botonesPie(h, [
      ['Volver', 'hj-btn', () => { terminar(); abrirPedido(ped.id, { ...opc, hoja: h }); }],
      ['Cambiar el cliente', 'hj-btn-prim', b => enviar(b)]
    ]);
  });

  async function enviar(b) {
    if (!vigente || !calc) return;
    b.disabled = true;
    b.textContent = 'Cambiando…';
    h.cuerpo.querySelector('.cc-error')?.remove();
    let d;
    // Exactamente lo que se mostro: calc.envio, sin recalcular
    try { d = await llamar(calc.envio); } catch (e) { d = { ok: false, error: 'sin_conexion' }; }
    if (!vigente) return;
    if (!d?.ok) {
      b.disabled = false;
      b.textContent = 'Cambiar el cliente';
      const texto = d?.error === 'sin_conexion'
        ? 'No hay conexión. Probá de nuevo: si el cambio ya se había hecho, no se repite.'
        : textoError(d?.error, ped, cli.cuenta);
      h.cuerpo.insertAdjacentHTML('afterbegin', `<p class="cc-error">${esc(texto)}</p>`);
      return;
    }
    terminar();
    listo(h, ped, cli, d, opc);
  }
}

async function abrirPedidoConAviso(h, id, opc, aviso) {
  await abrirPedido(id, { ...opc, hoja: h });
  h.cuerpo.insertAdjacentHTML('afterbegin', `<p class="cc-aviso cc-aviso-fuerte">${esc(aviso)}</p>`);
}

function listo(h, ped, cli, d, opc) {
  h.ponerTitulo('Cliente cambiado');
  h.cuerpo.innerHTML = `
    <div class="cc-listo">
      <div class="cc-check">&#10003;</div>
      <p class="cc-dec-val">El pedido <b>N° ${esc(d.numero || ped.numero)}</b> ahora es de</p>
      <p class="cc-dec-val cc-dec-nuevo">${esc(cli.cuenta)} · ${esc(d.nombre || cli.nombre)}</p>
      ${d.yaCambiada ? '' : `<p class="cc-dec-val">Total ${fmt(d.totalNeto)}</p>`}
      ${d.estabaImpreso ? '<div class="cc-aviso">Volvió a pendientes: hay que reimprimirlo. La hoja nueva sale marcada como reemplazo de la anterior.</div>' : ''}
    </div>`;
  botonesPie(h, [
    opc.desdeBandeja && ['Volver a la bandeja', 'hj-btn', () => { window.location.href = 'imprimir.html'; }],
    opc.alVolver && ['Volver a los pedidos', 'hj-btn', () => opc.alVolver()],
    ['Listo', 'hj-btn-prim', () => h.cerrar()]
  ]);
  document.dispatchEvent(new CustomEvent('pedido:cuenta-cambiada', { detail: { id: ped.id, cuenta: cli.cuenta } }));
}

// ---------- desde la bandeja: catalogo.html?cambiar=<id> ----------
async function abrirDesdeUrl() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('cambiar');
  if (!id) return;
  // Que una recarga no lo vuelva a abrir
  params.delete('cambiar');
  const resto = params.toString();
  history.replaceState(null, '', window.location.pathname + (resto ? '?' + resto : '') + window.location.hash);
  if (!sessionStorage.getItem('authToken')) {
    await new Promise(r => document.addEventListener('auth:token-listo', r, { once: true }));
  }
  if (!ROLES.includes(rol())) return;
  abrirPedido(id, { desdeBandeja: true });
}

window.CambioCuenta = { abrirLista, abrirPedido };
abrirDesdeUrl();
