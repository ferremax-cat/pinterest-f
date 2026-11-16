// PRUEBA DE LAS PROMOCIONES CON TRAMOS POR CANTIDAD con jsdom: la cuenta unica
// (promociones.js), el precio de la linea al subir y bajar la cantidad desde la
// tarjeta y desde el panel, otorgar un tramo o el precio especial desde el menu
// de la linea, el ajuste de linea dormido, lo que se envia al confirmar, la
// cinta de la tarjeta, el panel de promociones y la frescura de
// promociones.json. Modulos reales de js/ (promociones, precios, carrito,
// carrito-panel, promo-panel, aviso-pedido, datos-catalogo y los que importan);
// config.js y sesion.js son reemplazos minimos. Servidor, catalogo y
// ProductManager simulados; datos sinteticos.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_promos.mjs
import { JSDOM, prepararModulos } from './preparar.mjs';
const importar = prepararModulos(
  ['promociones.js', 'precios.js', 'aviso-pedido.js', 'historial-cliente.js', 'habituales.js', 'carrito.js', 'carrito-panel.js',
    'promo-panel.js', 'observaciones.js', 'hoja.js', 'datos-catalogo.js', 'alta-cliente.js'],
  { 'config.js': '// Reemplazo minimo para la prueba\nexport const SOLO_VENDEDORES = false;\nexport const CUENTAS_ALTA = [\'157\'];\n',
    'sesion.js': '// Reemplazo minimo para la prueba\nexport const pedirToken = () => Promise.resolve(null);\n' });

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

// ---------- pagina: buscador, barra y una tarjeta por articulo ----------
const SKUS = ['ROD125', 'UNO', 'SF', 'EA', 'NORMAL', 'VENC', 'OTRO'];
const tarjeta = s => `<div class="gallery-item" data-product-code="${s}"><div class="container-img"><img alt="">` +
  `<div class="top-row"><a href="">${s}</a></div><div class="bottom-row"><a href="">${s}</a>` +
  `<span class="price-tag" id="t-${s}"></span></div></div></div>`;
const dom = new JSDOM(`<!doctype html><html><body>
  <nav><input type="text" placeholder="Buscar en catálogo de productos..."><div class="iconos"></div></nav>
  <div id="barra-salud-financiera" class="barra-salud-financiera"><div class="barra-salud-content">
    <div class="cliente-info"><div class="cliente-nombre"><span id="cliente-nombre">X</span></div>
    <div class="dato-item"><span class="cupo-valor">$0</span></div></div></div></div>
  <div class="gallery-container">${SKUS.map(tarjeta).join('')}</div>
</body></html>`, { url: 'https://ferremax.test/catalogo.html', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame'])
  globalThis[k] = k === 'window' ? w : w[k];
w.CSS = w.CSS || {};
w.CSS.escape = w.CSS.escape || (s => String(s).replace(/["\\]/g, '\\$&'));
globalThis.CSS = w.CSS;
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};

// ---------- catalogo, promociones y servidor ----------
const precio = d => ({ D: d, E: d, F: d });
const catalogo = {
  ROD125: { name: 'TANZA', category: 'x', bulk: 1, prices: precio(16833.24) },
  UNO: { name: 'UN TRAMO', category: 'x', bulk: 1, prices: precio(1200) },
  SF: { name: 'SIN TRAMOS', category: 'x', bulk: 1, prices: { D: 8000, E: 8500, F: 7500 } },
  EA: { name: 'ESPUMANTA', category: 'x', bulk: 1, prices: precio(31959.25) },
  NORMAL: { name: 'SIN PROMO', category: 'x', bulk: 1, prices: precio(1000) },
  VENC: { name: 'VENCIDA', category: 'x', bulk: 1, prices: precio(500) },
  OTRO: { name: 'OTRO GRUPO', category: 'x', bulk: 1, prices: precio(500) }
};
const PROMOS = {
  ROD125: { tipoLista: 'F', precio: 15755.9, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['G'],
    tramos: [{ desde: 5, desc: 5 }, { desde: 10, desc: 8 }] },
  UNO: { tipoLista: 'F', precio: 1000, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['G'], tramos: [{ desde: 5, desc: 5 }] },
  SF: { tipoLista: 'F', precio: 7186, cantidadMinima: 30, vigencia: '2099-12-31', grupos: ['G'] },
  EA: { tipoLista: 'F', precio: 29500.9, cantidadMinima: 3, vigencia: '2099-12-31', grupos: ['G'], tramos: [{ desde: 5, desc: 5 }] },
  VENC: { tipoLista: 'F', precio: 100, cantidadMinima: 1, vigencia: '2020-01-01', grupos: ['G'] },
  OTRO: { tipoLista: 'F', precio: 100, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['H'] }
};
let promos = JSON.parse(JSON.stringify(PROMOS));
let estadoPromos = 200;
const pedidosUrl = [];
globalThis.fetch = async url => {
  const u = String(url);
  pedidosUrl.push(u);
  const resp = (d, status = 200) => ({ ok: status === 200, status, json: async () => JSON.parse(JSON.stringify(d)) });
  if (u.includes('grupos_clientes')) return resp({ groups: { G: ['7'], H: ['8'] } });
  if (u.includes('promociones')) return resp({ promotions: promos }, estadoPromos);
  if (u.includes('imagenes')) return resp({ images: {} });
  return resp(catalogo);
};
const bajadasPromos = () => pedidosUrl.filter(u => u.includes('promociones.json?v=')).length;
w.productManager = { getProduct: s => (catalogo[s] ? { nombre: catalogo[s].name, bulto: 1, precios: catalogo[s].prices, precio: catalogo[s].prices.D } : null),
  clientData: { priceList: 'D' } };
w.productManagerInstance = { loadSpecificProducts: () => Promise.resolve({}) };

// ---------- sesion: vendedor con el cliente 7 (grupo G) en vista ----------
sessionStorage.setItem('authRol', 'vendedor_estandar');
sessionStorage.setItem('authToken', 't');
sessionStorage.setItem('configCarrito', JSON.stringify({ ok: true, descuentosLinea: [5, 7], descuentosTotal: [5, 7], observaciones: [] }));
sessionStorage.setItem('clienteVista', JSON.stringify({ cuenta: '7', lista: 'D', nombre: 'Cliente 7' }));
sessionStorage.setItem('disponibleCliente', '1000000');
sessionStorage.setItem('disponibleDeCuenta', '7');
w.menuFuncionalidades = { usuarioActual: { clave: 'V1', rol: 'vendedor_estandar' } };
const guardados = [];
w.Api = {
  llamar: async body => { if (body.accion === 'guardar_pedido') { guardados.push(body.pedido); return { ok: true, numero: 'PRU-' + guardados.length }; } return { ok: true }; },
  llamarEnSegundoPlano: async () => ({ ok: true, articulos: [] })
};

// ---------- modulos reales ----------
await importar('precios.js');
const P = (await importar('promociones.js'));
await importar('historial-cliente.js');
await importar('habituales.js');
await importar('carrito.js');
await importar('carrito-panel.js');
await importar('promo-panel.js');
await tick();
const C = w.Carrito;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const linea = sku => C.detalle().find(x => x.sku === sku);
const guardada = sku => C.leer().find(x => x.sku === sku);
const fila = sku => $(`#carrito-panel .cp-fila[data-sku="${sku}"]`);
const meta = sku => fila(sku)?.querySelector('.cp-meta')?.textContent.replace(/\s+/g, ' ').trim() || '';
const abrirPanel = async () => { w.CarritoPanel.abrir(); await tick(10); };
const abrirMenuDe = async sku => {
  document.querySelectorAll('.cp-panel-menu').forEach(p => p.remove());
  fila(sku).querySelector('.cp-menu').click(); await tick();
  return $('#carrito-panel .cp-panel-menu');
};
const elegirTramo = async (sku, valor) => {
  const sel = (await abrirMenuDe(sku)).querySelector('.cp-promo-tramo');
  sel.value = String(valor);
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  await tick();
};
const confirmar = async () => {
  $('#carrito-panel .cp-confirmar').click(); await tick(30);
  const ped = guardados.at(-1);
  $('#carrito-panel .cp-cerrar-exito')?.click(); await tick();
  return ped;
};
const r2 = x => Math.round(x * 100) / 100;

// =====================================================================
// 1. La cuenta unica (promociones.js)
const pc = (s, n) => P.precioSegunCantidad(s, n)?.precio ?? null;
ver('ROD125 x1 y x4: precio especial', pc('ROD125', 1) === 15755.9 && pc('ROD125', 4) === 15755.9);
ver('ROD125 x5 y x9: -5 % = 14.968,11', pc('ROD125', 5) === 14968.11 && pc('ROD125', 9) === 14968.11, pc('ROD125', 5));
ver('ROD125 x10 y x100: -8 % = 14.495,43', pc('ROD125', 10) === 14495.43 && pc('ROD125', 100) === 14495.43);
ver('sin tramos: por debajo del minimo null (lista), en el minimo el especial', pc('SF', 29) === null && pc('SF', 30) === 7186);
ver('minimo 3 con tramo en 5: 2 lista, 3 especial, 5 -5 %', pc('EA', 2) === null && pc('EA', 3) === 29500.9 && pc('EA', 5) === 28025.86);
ver('escalon inexistente: null', P.precioDeEscalon('ROD125', 7) === null && P.precioDeEscalon('ROD125', 1)?.precio === 15755.9);
ver('siguiente tramo', P.siguienteTramo('ROD125', 6)?.desde === 10 && P.siguienteTramo('ROD125', 10) === null);
ver('sin promocion: vencida y de otro grupo', P.promoDe('VENC') === null && P.promoDe('OTRO') === null && P.promoDe('NORMAL') === null);
ver('precioPromo como antes', P.precioPromo('SF', 29) === null && P.precioPromo('SF', 30) === 7186);

// =====================================================================
// 2. Subir y bajar cruzando tramos desde la tarjeta (dialogo de cantidad)
for (const s of SKUS) w.Precios.pintarPrecio($('#t-' + s), s);
const btnTarjeta = s => $('#t-' + s).closest('.container-img').querySelector(':scope > .btn-carrito');
const desdeTarjeta = async (s, n) => {
  btnTarjeta(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick();
  const pop = $('.popover-cantidad');
  const inp = pop.querySelector('.input-cantidad');
  inp.value = String(n); inp.dispatchEvent(new w.Event('input'));
  const aviso = pop.querySelector('.aviso-promo').textContent.replace(/\s+/g, ' ').trim();
  pop.querySelector('.btn-ok-cantidad').click(); await tick();
  return aviso;
};
C.setAjustePedido({ descuento: 7, descuentoExtra: 5 });
const esperado = { 4: [15755.9, 0], 5: [14968.11, 5], 10: [14495.43, 8], 9: [14968.11, 5], 1: [15755.9, 0] };
for (const n of [4, 5, 10, 9, 4, 1]) {
  const aviso = await desdeTarjeta('ROD125', n);
  const l = linea('ROD125');
  const [pu, pct] = esperado[n];
  const t = C.totales();
  ver(`tarjeta ROD125 x${n}: precio, subtotal y tramo`, l.cantidad === n && l.precio === pu && l.subtotal === r2(pu * n) &&
    l.enPromo === true && l.promoPct === pct && !l.otorgado, JSON.stringify(l));
  ver(`tarjeta ROD125 x${n}: fuera del descuento sobre el total`, t.enPromo === l.subtotal && t.neto === r2(t.enPromo + (t.bruto - t.enPromo) * 0.93 * 0.95),
    JSON.stringify(t));
  if (n === 4) ver('dialogo x4: precio especial y el siguiente tramo', aviso.includes('$15.755') && aviso.includes('Desde 5 u.: −5 %') && !aviso.includes('(−'), aviso);
  if (n === 5) ver('dialogo x5: precio con el tramo, ahorro y el siguiente', aviso.includes('$14.968') && aviso.includes('(−5 %)') &&
    aviso.includes('Ahorrás') && aviso.includes('Desde 10 u.: −8 %'), aviso);
  if (n === 10) ver('dialogo x10: ultimo tramo, sin siguiente', aviso.includes('(−8 %)') && !aviso.includes('Desde'), aviso);
}
const aviso2 = await desdeTarjeta('EA', 2);
ver('dialogo por debajo del minimo: "x3 u. → $… c/u" y el tramo siguiente', aviso2.startsWith('x3 u. →') && aviso2.includes('Desde 5 u.: −5 %'), aviso2);
ver('EA x2: por debajo del minimo, lista del cliente', linea('EA').enPromo !== true && linea('EA').precio === 31959.25);
C.quitar('EA');

// =====================================================================
// 3. Desde el panel (casillero de cantidad) y la meta de la linea
await abrirPanel();
const cambiarEnPanel = async (sku, n) => {
  const inp = fila(sku).querySelector('.cp-cant');
  inp.value = String(n); inp.dispatchEvent(new w.Event('change')); await tick();
};
await cambiarEnPanel('ROD125', 4);
ver('panel x4: "Promo" sin porcentaje', meta('ROD125').includes('Promo') && !meta('ROD125').includes('−'), meta('ROD125'));
await cambiarEnPanel('ROD125', 5);
ver('panel x5: "Promo −5 %" y el subtotal', meta('ROD125').includes('Promo −5 %') && linea('ROD125').subtotal === 74840.55, meta('ROD125'));
await cambiarEnPanel('ROD125', 4);
ver('panel vuelve a x4: "Promo" y especial', !meta('ROD125').includes('−') && linea('ROD125').precio === 15755.9, meta('ROD125'));

// =====================================================================
// 4. Otorgar desde el menu de la linea
C.vaciar(); C.setAjustePedido({ descuento: 0 });
C.agregar('EA', 3);
await abrirPanel();
let men = await abrirMenuDe('EA');
const ops = [...men.querySelectorAll('.cp-promo-tramo option')].map(o => [o.value, o.textContent, o.disabled]);
ver('menu de linea en promocion: solo el selector y Mover', !!men.querySelector('.cp-promo-tramo') && !!men.querySelector('.cp-mover') &&
  !men.querySelector('.cp-lista') && !men.querySelector('.cp-desc-linea'), men.innerHTML);
ver('selector: "Por cantidad" y el tramo de 5 (sin "Precio de promoción": ya alcanza el minimo)',
  JSON.stringify(ops.map(o => o[0])) === JSON.stringify(['', '5']), JSON.stringify(ops));
await elegirTramo('EA', 5);
ver('otorga el tramo 5 con 3: -5 %, otorgado, promoDesde 5', linea('EA').precio === 28025.86 && linea('EA').otorgado === true &&
  linea('EA').promoDesde === 5 && guardada('EA').promoOtorgado === 5, JSON.stringify(linea('EA')));
ver('meta: "Promo −5 % otorgado"', meta('EA').includes('Promo −5 % otorgado'), meta('EA'));
ver('el selector queda en el tramo otorgado', (await abrirMenuDe('EA')).querySelector('.cp-promo-tramo').value === '5');
ver('sobrevive a una recarga (queda en el carrito guardado)', JSON.parse(localStorage.getItem(
  Object.keys(localStorage).find(k => k.endsWith('::7')) || '""')).find(x => x.sku === 'EA')?.promoOtorgado === 5);
C.agregar('ROD125', 3);
await abrirPanel();
men = await abrirMenuDe('ROD125');
const opsR = [...men.querySelectorAll('.cp-promo-tramo option')].map(o => [o.value, o.disabled]);
ver('cualquier tramo, no solo el siguiente: 5 y 10 habilitados con 3', JSON.stringify(opsR) === JSON.stringify([['', false], ['5', false], ['10', false]]),
  JSON.stringify(opsR));
await elegirTramo('ROD125', 10);
ver('con 3 elige el tramo de 10: -8 %', linea('ROD125').precio === 14495.43 && linea('ROD125').otorgado && linea('ROD125').promoDesde === 10);
C.agregar('ROD125', 6);
men = await abrirMenuDe('ROD125');
const opsR6 = [...men.querySelectorAll('.cp-promo-tramo option')];
ver('tramo ya alcanzado: deshabilitado y "(ya corresponde)"', opsR6.find(o => o.value === '5')?.disabled === true &&
  opsR6.find(o => o.value === '5').textContent.includes('(ya corresponde)') && opsR6.find(o => o.value === '10')?.disabled === false);
await elegirTramo('ROD125', '');
ver('"Por cantidad" vuelve al automatico', !linea('ROD125').otorgado && linea('ROD125').promoPct === 5 && guardada('ROD125').promoOtorgado === undefined);
C.otorgarPromo('ROD125', 5);
ver('no se puede otorgar un tramo que ya corresponde', guardada('ROD125').promoOtorgado === undefined);
C.otorgarPromo('ROD125', 7);
ver('no se puede otorgar un escalon que no existe', guardada('ROD125').promoOtorgado === undefined);

// Precio especial por debajo del minimo (SF: minimo 30)
C.agregar('SF', 20);
await abrirPanel();
men = await abrirMenuDe('SF');
ver('por debajo del minimo: el selector ofrece "Precio de promoción" y los ajustes de siempre',
  [...men.querySelectorAll('.cp-promo-tramo option')].some(o => o.value === '30' && o.textContent === 'Precio de promoción') &&
  !!men.querySelector('.cp-desc-linea') && !!men.querySelector('.cp-lista'));
await elegirTramo('SF', 30);
const tSF = (() => { C.setAjustePedido({ descuento: 7 }); const t = C.totales(); C.setAjustePedido({ descuento: 0 }); return t; })();
ver('precio especial otorgado con 20 (minimo 30): enPromo, promoDesde 30', linea('SF').precio === 7186 && linea('SF').enPromo &&
  linea('SF').otorgado && linea('SF').promoDesde === 30 && meta('SF').includes('Promo otorgado'), meta('SF'));
ver('la linea otorgada queda fuera del descuento sobre el total', tSF.enPromo >= linea('SF').subtotal, JSON.stringify(tSF));

// Pedido pendiente: no deja otorgar
C.setPendiente({ id: 'x' });
C.otorgarPromo('EA', null);
ver('pedido pendiente: no deja otorgar (no cambia)', guardada('EA').promoOtorgado === 5);
C.borrarPendiente();

// =====================================================================
// 5. Subir hasta que corresponda y volver a bajar
C.vaciar();
C.agregar('UNO', 3); C.otorgarPromo('UNO', 5);
ver('paso 1: otorgado el tramo 5 con 3: -5 %', linea('UNO').precio === 950 && linea('UNO').otorgado);
C.agregar('UNO', 6);
ver('paso 2: sube a 6, mismo precio, por cantidad y se borra promoOtorgado', linea('UNO').precio === 950 && !linea('UNO').otorgado &&
  guardada('UNO').promoOtorgado === undefined);
C.agregar('UNO', 10);
ver('paso 3: sube a 10, sigue la escalera (-5 %: es el unico tramo)', linea('UNO').precio === 950 && linea('UNO').promoPct === 5);
C.agregar('UNO', 3);
ver('paso 4: baja a 3, el descuento NO vuelve solo (precio especial)', linea('UNO').precio === 1000 && !linea('UNO').otorgado &&
  guardada('UNO').promoOtorgado === undefined, JSON.stringify(linea('UNO')));
C.otorgarPromo('UNO', 5);
ver('paso 5: otorgado otra vez desde el menu: -5 % otorgado', linea('UNO').precio === 950 && linea('UNO').otorgado);

// =====================================================================
// 6. Ajuste de linea dormido (SF: minimo 30, 20 unidades)
for (const variante of ['descuento', 'lista E']) {
  C.vaciar(); C.setAjustePedido({ descuento: 7 });
  C.agregar('SF', 20);
  if (variante === 'descuento') C.ajustarLinea('SF', { mecanismo: 'lista_cliente', descuento: 7 });
  else C.ajustarLinea('SF', { mecanismo: 'otra_lista', lista: 'E', descuento: 0 });
  await abrirPanel();
  const conAjuste = variante === 'descuento' ? 7440 : 8500;
  ver(`dormido (${variante}) 1: el ajuste se aplica y se ve`, linea('SF').precio === conAjuste && !linea('SF').enPromo &&
    (variante === 'descuento' ? meta('SF').includes('-7%') : meta('SF').includes('lista E')), meta('SF'));
  men = await abrirMenuDe('SF');
  ver(`dormido (${variante}) 1: el desplegable muestra el ajuste`, variante === 'descuento'
    ? men.querySelector('.cp-desc-linea').value === '7' : men.querySelector('.cp-lista').value === 'E');
  await elegirTramo('SF', 30);
  ver(`dormido (${variante}) 2: precio especial, el ajuste no se aplica`, linea('SF').precio === 7186 && linea('SF').subtotal === 143720 &&
    linea('SF').precio === linea('SF').precioEspecial);
  ver(`dormido (${variante}) 2: la meta no muestra el ajuste`, meta('SF').includes('Promo otorgado') && !meta('SF').includes('-7%') &&
    !meta('SF').includes('lista E'), meta('SF'));
  men = await abrirMenuDe('SF');
  ver(`dormido (${variante}) 2: el menu muestra solo el selector y Mover`, !!men.querySelector('.cp-promo-tramo') &&
    !men.querySelector('.cp-desc-linea') && !men.querySelector('.cp-lista') && !!men.querySelector('.cp-mover'));
  const t = C.totales();
  ver(`dormido (${variante}) 2: fuera del descuento sobre el total`, t.enPromo === 143720 && t.neto === 143720, JSON.stringify(t));
  const ped = await confirmar();
  const lS = ped?.lineas.find(x => x.sku === 'SF');
  ver(`dormido (${variante}) 2: al confirmar, mecanismo promocion, descuentoLinea 0 y la lista del cliente`, lS?.mecanismo === 'promocion' &&
    lS.descuentoLinea === 0 && lS.listaAplicada === 'D' && lS.precio === 7186, JSON.stringify(lS));
  // Vuelve a "Por cantidad": el ajuste vuelve a regir
  C.agregar('SF', 20);
  if (variante === 'descuento') C.ajustarLinea('SF', { mecanismo: 'lista_cliente', descuento: 7 });
  else C.ajustarLinea('SF', { mecanismo: 'otra_lista', lista: 'E', descuento: 0 });
  C.otorgarPromo('SF', 30);
  await abrirPanel();
  await elegirTramo('SF', '');
  ver(`dormido (${variante}) 3: el ajuste vuelve a aplicarse`, linea('SF').precio === conAjuste && !linea('SF').enPromo);
  men = await abrirMenuDe('SF');
  ver(`dormido (${variante}) 3: el desplegable lo muestra otra vez`, variante === 'descuento'
    ? men.querySelector('.cp-desc-linea').value === '7' : men.querySelector('.cp-lista').value === 'E');
  ver(`dormido (${variante}) 3: la meta lo muestra`, variante === 'descuento' ? meta('SF').includes('-7%') : meta('SF').includes('lista E'), meta('SF'));
  const ped2 = await confirmar();
  const lS2 = ped2?.lineas.find(x => x.sku === 'SF');
  ver(`dormido (${variante}) 3: al confirmar, el ajuste`, variante === 'descuento'
    ? lS2?.descuentoLinea === 7 && lS2.mecanismo === 'lista_cliente' && lS2.precioPromo === null
    : lS2?.listaAplicada === 'E' && lS2.mecanismo === 'otra_lista', JSON.stringify(lS2));
}

// =====================================================================
// 7. Lo que se envia al confirmar
C.vaciar(); C.setAjustePedido({ descuento: 0 });
C.agregar('ROD125', 6);                   // por cantidad, tramo 5
C.agregar('EA', 3); C.otorgarPromo('EA', 5);   // otorgado
C.agregar('SF', 30);                      // sin tramos, por cantidad
C.agregar('UNO', 2);                      // con tramos, por debajo del primero
C.agregar('NORMAL', 1);                   // sin promocion
await abrirPanel();
const pe = await confirmar();
const env = s => pe?.lineas.find(x => x.sku === s) || {};
ver('envio por cantidad: precio, % del tramo, precio especial y promoDesde', env('ROD125').mecanismo === 'promocion' && env('ROD125').precio === 14968.11 &&
  env('ROD125').descuentoLinea === 5 && env('ROD125').precioPromo === 15755.9 && env('ROD125').promoDesde === 5, JSON.stringify(env('ROD125')));
ver('envio otorgado: promoDesde 5 con 3 unidades', env('EA').precio === 28025.86 && env('EA').descuentoLinea === 5 && env('EA').promoDesde === 5 &&
  env('EA').cantidad === 3 && env('EA').precioPromo === 29500.9, JSON.stringify(env('EA')));
ver('envio sin tramos: promoDesde null', env('SF').precioPromo === 7186 && env('SF').promoDesde === null && env('SF').descuentoLinea === 0,
  JSON.stringify(env('SF')));
ver('envio con tramos, por debajo del primero: promoDesde = minimo', env('UNO').promoDesde === 1 && env('UNO').descuentoLinea === 0);
ver('envio linea normal: precioPromo y promoDesde null', env('NORMAL').mecanismo === 'lista_cliente' && env('NORMAL').precioPromo === null &&
  env('NORMAL').promoDesde === null, JSON.stringify(env('NORMAL')));

// =====================================================================
// 8. Cinta de la tarjeta y panel de promociones
C.vaciar();
for (const s of SKUS) w.Precios.pintarPrecio($('#t-' + s), s);
const cinta = s => $('#t-' + s).closest('.container-img').querySelector(':scope > .cinta-promo');
ver('cinta sin tramos: "Promo desde 30 u."', cinta('SF')?.textContent === 'Promo desde 30 u.', cinta('SF')?.textContent);
ver('cinta con un tramo', cinta('UNO')?.textContent === 'Promo desde 1 u. · 5+: extra −5 %', cinta('UNO')?.textContent);
ver('cinta con dos tramos', cinta('ROD125')?.textContent === 'Promo desde 1 u. · 5+: extra −5 % · 10+: −8 %', cinta('ROD125')?.textContent);
C.agregar('ROD125', 6);
ver('cinta con cantidad cargada', cinta('ROD125')?.textContent === 'Promo desde 1 u. · 6 u.: $14.968,11 c/u', cinta('ROD125')?.textContent);
ver('cinta: el title es el texto completo', cinta('ROD125').title === cinta('ROD125').textContent);
ver('cinta: no tapa el carrito (ancho maximo hasta el icono)', cinta('ROD125').style.maxWidth === 'calc(100% - 48px)' &&
  cinta('ROD125').style.boxSizing === 'border-box' && cinta('ROD125').style.whiteSpace === 'normal');
ver('sin promocion: sin cinta', !cinta('NORMAL') && !cinta('VENC') && !cinta('OTRO'));
ver('la pildora sigue con la lista', $('#t-ROD125').dataset.precioLista === '16833.24');
w.PromoPanel.crearIcono();
await w.PromoPanel.abrirPanel(); await tick();
const filaPP = sku => [...$$('#panel-promos .pp-fila')].find(f => f.querySelector('.pp-add')?.dataset.sku === sku);
ver('panel de promociones: los tramos en la fila', filaPP('ROD125')?.textContent.includes('Extra por cantidad: 5 o más: −5 % · 10 o más: −8 %'),
  filaPP('ROD125')?.textContent.replace(/\s+/g, ' '));
ver('panel de promociones: sin tramos, sin esa linea', !filaPP('SF')?.textContent.includes('Extra por cantidad'));
ver('panel de promociones: el "+" carga el minimo', filaPP('EA')?.querySelector('.pp-add').dataset.min === '3' &&
  filaPP('SF')?.querySelector('.pp-add').dataset.min === '30');
$('#panel-promos')?.remove();

// =====================================================================
// 9. Frescura de promociones.json (version:leida de frescura-precios.js)
const version = (huella, generadoMs) => document.dispatchEvent(new w.CustomEvent('version:leida',
  { detail: { promociones: { huella, generado: new Date(generadoMs).toISOString() } } }));
let actualizadas = 0, repintados = 0;
document.addEventListener('promos:actualizadas', () => actualizadas++);
const repintarOriginal = w.Precios.repintarTodos;
w.Precios.repintarTodos = () => { repintados++; return repintarOriginal(); };
const textoAviso = () => $('.aviso-precios')?.textContent || '';

version('h0', Date.now() - 3 * 3600e3); await tick(10);
ver('frescura: pagina cargada despues de generado, no descarga', bajadasPromos() === 0 && actualizadas === 0);
version('h0', Date.now() - 3 * 3600e3); await tick(10);
ver('frescura: misma huella, nada', bajadasPromos() === 0);

C.vaciar();
C.agregar('EA', 3); C.otorgarPromo('EA', 5); C.agregar('NORMAL', 1);
$$('.aviso-precios').forEach(a => a.remove());
// Promociones nuevas que no tocan el pedido: SF cambia de precio
promos = JSON.parse(JSON.stringify(PROMOS)); promos.SF.precio = 7000;
version('h1', Date.now() + 1000); await tick(10);
ver('frescura: huella nueva, una descarga con la huella en la URL', bajadasPromos() === 1 && pedidosUrl.some(u => u.includes('promociones.json?v=h1')));
ver('frescura: promociones nuevas en memoria', P.promoDe('SF').precio === 7000);
ver('frescura: repinta y avisa con promos:actualizadas', repintados >= 1 && actualizadas === 1);
ver('frescura: sin aviso si no cambio ningun precio del pedido', textoAviso() === '', textoAviso());
// El tramo otorgado de EA deja de existir
promos = JSON.parse(JSON.stringify(PROMOS)); delete promos.EA.tramos; promos.SF.precio = 7000;
version('h2', Date.now() + 2000); await tick(10);
ver('frescura: el tramo otorgado que ya no existe vuelve al automatico y se borra', guardada('EA').promoOtorgado === undefined &&
  linea('EA').precio === 29500.9 && !linea('EA').otorgado, JSON.stringify(linea('EA')));
ver('frescura: aviso con el precio que cambio y "ya no existe"', textoAviso().includes('Se actualizaron las promociones: 1 artículo de tu pedido cambió de precio.') &&
  textoAviso().includes('1 tramo otorgado ya no existe'), textoAviso());
// HTTP 500: no cambia nada; la proxima revision reintenta
estadoPromos = 500;
promos = JSON.parse(JSON.stringify(PROMOS)); promos.SF.precio = 6000;
version('h3', Date.now() + 3000); await tick(10);
ver('frescura: HTTP 500, quedan las anteriores', P.promoDe('SF').precio === 7000 && bajadasPromos() === 3);
estadoPromos = 200;
version('h3', Date.now() + 3000); await tick(10);
ver('frescura: la proxima revision reintenta y toma las nuevas', P.promoDe('SF').precio === 6000 && bajadasPromos() === 4);

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
