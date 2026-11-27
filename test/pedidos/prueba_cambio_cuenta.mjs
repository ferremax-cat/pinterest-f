// PRUEBA DEL CAMBIO DE CUENTA DE UN PEDIDO CONFIRMADO con jsdom.
// El calculo (js/cambio-cuenta-calculo.js) con promociones.js real:
// lineas de lista del cliente, otra lista, precio especial y promocion
// (se queda, sale, entra, tramo otorgado), actualizacion de precios de por
// medio, articulo sin precio, totales, resumen y lo que se manda; y que el
// servidor (apps-script/Codigo.gs, validarLineasCambio y totalesCambio)
// acepta lo que se manda y llega al mismo total. promociones.js sin la cuenta
// nueva sigue como antes. Las pantallas (js/cambio-cuenta.js): Mis pedidos,
// elegir el cliente (y el de otro vendedor), la vista previa (arriba lo que
// decide, lineas plegadas, "Los precios no cambian", avisos de impreso y de
// factura), que se manda exactamente lo que se mostro, que se cierra si se
// actualizan los precios, los errores y la apertura desde la bandeja
// (?cambiar=<id>). Datos sinteticos; no conecta a nada.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_cambio_cuenta.mjs
import { readFileSync } from 'fs';
import { join } from 'path';
import vm from 'vm';
import { JSDOM, RAIZ, prepararModulos } from './preparar.mjs';
const MODULOS = ['promociones.js', 'aviso-pedido.js', 'cambio-cuenta-calculo.js', 'cambio-cuenta.js', 'hoja.js'];
const importar = prepararModulos(MODULOS);

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://ferremax.test/catalogo.html' });
const w = dom.window;
for (const k of ['window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'history', 'location'])
  globalThis[k] = k === 'window' ? w : w[k];
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

// ---------- catalogo, grupos y promociones ----------
// Cliente viejo 7 (grupo G), cliente nuevo 8 (grupo H)
const catalogo = {
  A: { D: 100, E: 110 },              // lista del cliente, con -5% del vendedor
  B: { D: 100, E: 120, F: 90 },       // otra lista (F)
  C: { D: 100, E: 130 },              // precio especial
  P1: { D: 200, E: 220 },             // promocion solo del grupo G: sale
  P2: { D: 200, E: 220 },             // promocion de G y H con tramo: se queda
  P3: { D: 400, E: 420 },             // tramo otorgado por el vendedor: se conserva
  N1: { D: 60, E: 65 },               // promocion solo de H: entra
  U: { D: 105, E: 115 }               // se actualizo el precio (se guardo a 100)
};
const PROMOS = {
  P1: { precio: 180, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['G'] },
  P2: { precio: 150, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['G', 'H'], tramos: [{ desde: 5, desc: 10 }] },
  P3: { precio: 300, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['G', 'H'], tramos: [{ desde: 10, desc: 8 }] },
  N1: { precio: 50, cantidadMinima: 3, vigencia: '2099-12-31', grupos: ['H'] }
};
globalThis.fetch = async url => {
  const u = String(url);
  const resp = d => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(d)) });
  if (u.includes('grupos_clientes')) return resp({ groups: { G: ['7'], H: ['8'] } });
  if (u.includes('promociones')) return resp({ promotions: PROMOS });
  if (u.includes('clientes_nombres')) return resp({ clientes: { 7: { nombre: 'FERRETERIA SIETE', vendedor: 'V1' },
    8: { nombre: 'CORRALON OCHO', vendedor: 'V1' }, 9: { nombre: 'NUEVE SA', vendedor: 'V2' },
    10: { nombre: 'DIEZ SIN LISTA', vendedor: 'V1' }, 11: { nombre: 'ONCE', vendedor: 'V1' } } });
  if (u.includes('clientes_permisos')) return resp({ 7: { priceList: 'D' }, 8: { priceList: 'E' }, 9: { priceList: 'E' },
    11: { priceList: 'D' } });
  return resp({});
};
w.productManager = { getProduct: s => (catalogo[s] ? { precios: catalogo[s] } : null) };

const Promos = await importar('promociones.js');
w.Promos = Promos;
const { recalcularLineas, totalesPedido, resumenCambio, lineasParaEnviar } = await importar('cambio-cuenta-calculo.js');

// ---------- promociones.js: la cuenta como parametro, sin cambiar lo de antes ----------
sessionStorage.setItem('authRol', 'cliente_estandar');
localStorage.setItem('clientData', JSON.stringify({ account: '7' }));
ver('promos: sin cuenta, la activa (7, grupo G)', !!Promos.promoDe('P1') && Promos.promoDe('N1') === null);
ver('promos: con la cuenta 8 (grupo H)', Promos.promoDe('P1', '8') === null && !!Promos.promoDe('N1', '8'));
ver('promos: cuenta vacia, sin promocion', Promos.promoDe('P2', '') === null);
ver('promos: precioSegunCantidad con la cuenta', Promos.precioSegunCantidad('N1', 5, '8')?.precio === 50 &&
  Promos.precioSegunCantidad('N1', 5) === null);
ver('promos: precioDeEscalon con la cuenta', Promos.precioDeEscalon('P3', 10, '8')?.precio === 276 &&
  Promos.precioDeEscalon('P3', 10, '9') === null);

// ---------- el pedido guardado (lo que devuelve pedido_para_cambio) ----------
const g = (orden, sku, cantidad, mecanismo, listaAplicada, precioBase, precio, mas = {}) => ({ orden, sku, nombre: 'Art ' + sku,
  cantidad, listaAplicada, mecanismo, precioBase, precio, descuentoLinea: 0, precioPromo: null, promoDesde: null, ...mas });
const PEDIDO = [
  g(1, 'A', 2, 'lista_cliente', 'D', 100, 95, { descuentoLinea: 5 }),
  g(2, 'B', 1, 'otra_lista', 'F', 100, 90),
  g(3, 'C', 1, 'precio_libre', 'D', 100, 80),
  g(4, 'P1', 3, 'promocion', 'D', 200, 180, { precioPromo: 180 }),
  g(5, 'P2', 6, 'promocion', 'D', 200, 135, { descuentoLinea: 10, precioPromo: 150, promoDesde: 5 }),
  g(6, 'P3', 4, 'promocion', 'D', 400, 276, { descuentoLinea: 8, precioPromo: 300, promoDesde: 10 }),
  g(7, 'N1', 5, 'lista_cliente', 'D', 60, 60),
  g(8, 'U', 1, 'lista_cliente', 'D', 100, 100),
  g(9, 'X', 2, 'lista_cliente', 'D', 70, 70)          // ya no esta en productos.json
];
const n = recalcularLineas(PEDIDO, { listaVieja: 'D', listaNueva: 'E', cuentaNueva: '8' });
const por = sku => n.find(l => l.sku === sku) || {};
const j = x => JSON.stringify(x);

let l = por('A');
ver('A lista del cliente E con el mismo -5%', l.mecanismo === 'lista_cliente' && l.listaAplicada === 'E' && l.precioBase === 110 &&
  l.precio === 104.5 && l.descuentoLinea === 5 && l.subtotal === 209 && l.motivo === 'lista' && l.cambia && l.actualizado === null, j(l));
ver('A anterior: para la vista previa', l.anterior.precio === 95 && l.anterior.subtotal === 190 && l.anterior.mecanismo === 'lista_cliente', j(l.anterior));
l = por('B');
ver('B otra lista: mismo precio y lista; la referencia, la lista del cliente nuevo', l.mecanismo === 'otra_lista' &&
  l.listaAplicada === 'F' && l.precio === 90 && l.precioBase === 120 && l.descEfectivo === 25 && l.motivo === 'fija' && !l.cambia, j(l));
l = por('C');
ver('C precio especial: mismo precio; descuento efectivo contra la lista E', l.mecanismo === 'precio_libre' && l.precio === 80 &&
  l.precioBase === 130 && l.descEfectivo === 38.5 && l.motivo === 'fija' && !l.cambia, j(l));
l = por('P1');
ver('P1 promocion que el grupo nuevo no tiene: sale a la lista E, sin %', l.mecanismo === 'lista_cliente' && l.precio === 220 &&
  l.descuentoLinea === 0 && l.precioPromo === null && l.promoDesde === null && l.motivo === 'sale_promo' && l.cambia, j(l));
l = por('P2');
ver('P2 promocion que el grupo nuevo tiene: se queda (tramo de 5)', l.mecanismo === 'promocion' && l.precio === 135 &&
  l.descuentoLinea === 10 && l.precioPromo === 150 && l.promoDesde === 5 && l.motivo === 'promo' && !l.cambia &&
  l.listaAplicada === 'E', j(l));
l = por('P3');
ver('P3 tramo otorgado (4 de 10): se conserva', l.mecanismo === 'promocion' && l.precio === 276 && l.promoDesde === 10 &&
  l.descuentoLinea === 8 && !l.cambia, j(l));
l = por('N1');
ver('N1 lista del cliente que entra en la promocion del grupo nuevo', l.mecanismo === 'promocion' && l.precio === 50 &&
  l.precioPromo === 50 && l.promoDesde === null && l.descuentoLinea === 0 && l.motivo === 'entra_promo' && l.cambia, j(l));
l = por('U');
ver('U actualizacion de por medio: precio de hoy en la lista E, y marcada', l.precio === 115 && l.precioBase === 115 &&
  j(l.actualizado) === j({ antes: 100, hoy: 105, lista: 'D' }) && l.motivo === 'lista', j(l));
l = por('X');
ver('X sin precio hoy: queda igual y marcada', l.motivo === 'sin_precio' && l.precio === 70 && l.precioBase === 70 &&
  l.mecanismo === 'lista_cliente' && !l.cambia, j(l));
ver('promos sin actualizado (no toman la lista)', por('P2').actualizado === null && por('B').actualizado === null);

// Misma lista, con actualizacion: solo esa marca
const m = recalcularLineas([g(1, 'U', 2, 'lista_cliente', 'D', 100, 100), g(2, 'A', 1, 'lista_cliente', 'D', 100, 100)],
  { listaVieja: 'D', listaNueva: 'D', cuentaNueva: '8' });
ver('misma lista con actualizacion: cambia el precio y lo dice', m[0].precio === 105 && m[0].cambia &&
  j(m[0].actualizado) === j({ antes: 100, hoy: 105, lista: 'D' }), j(m[0]));
ver('misma lista sin actualizacion: nada cambia', !m[1].cambia && m[1].actualizado === null, j(m[1]));

// ---------- totales y resumen ----------
const pedido = { totalNeto: 1000, descTotalPct: 7, descExtraPct: 5 };
const t = totalesPedido(n, 7, 5);
const enPromo = 135 * 6 + 276 * 4 + 50 * 5;
const bruto = n.reduce((a, x) => a + x.subtotal, 0);
ver('totales: cascada solo sobre lo que no esta en promocion',
  t.neto === Math.round((enPromo + (bruto - enPromo) * ((1 - 7 / 100) * (1 - 5 / 100))) * 100) / 100, j(t));
const res = resumenCambio(pedido, n);
ver('resumen: lineas que cambian, fijas, sin precio y actualizadas',
  j(res.cambian.map(x => x.sku)) === j(['A', 'P1', 'N1', 'U']) && res.fijas === 2 && res.sinPrecio.length === 1 &&
  res.actualizadas.length === 1 && res.totalNuevo === t.neto && res.diferencia === Math.round((t.neto - 1000) * 100) / 100 &&
  !res.sinDiferencias, j({ ...res, cambian: undefined, sinPrecio: undefined, actualizadas: undefined }));
const igual = recalcularLineas([g(1, 'A', 1, 'lista_cliente', 'E', 110, 110)], { listaVieja: 'E', listaNueva: 'E', cuentaNueva: '8' });
const resIgual = resumenCambio({ totalNeto: 110 }, igual);
ver('resumen sin diferencias', resIgual.sinDiferencias && resIgual.cambian.length === 0 && resIgual.diferencia === 0, j(resIgual));

// ---------- lo que se manda, y el servidor ----------
const env = lineasParaEnviar(n);
ver('se manda solo lo del servidor', j(Object.keys(env[0]).sort()) === j(['cantidad', 'descuentoLinea', 'listaAplicada',
  'mecanismo', 'orden', 'precio', 'precioBase', 'precioPromo', 'promoDesde', 'sku']), j(Object.keys(env[0])));
const srv = {};
vm.createContext(srv);
vm.runInContext(readFileSync(join(RAIZ, 'apps-script', 'Codigo.gs'), 'utf8'), srv);
// Lo guardado, como lo lee el servidor (lineaGuardada)
const guardadas = PEDIDO.map(x => ({ ...x, sku: x.sku, listaCliente: 'D', descEfectivo: 0, subtotal: Math.round(x.precio * x.cantidad * 100) / 100,
  origenLinea: '' }));
const vl = srv.validarLineasCambio(env, guardadas, 'E');
ver('servidor: acepta las lineas recalculadas', !vl.error && vl.lineas.length === 9, j(vl.error));
const ts = vl.lineas ? srv.totalesCambio(vl.lineas, 7, 5) : {};
ver('servidor: mismo total que la vista previa', ts.neto === t.neto && ts.bruto === t.bruto, j([ts, t]));
ver('servidor: mismo descuento efectivo en cada linea', vl.lineas && vl.lineas.every((x, k) => x.descEfectivo === n[k].descEfectivo),
  j(vl.lineas && vl.lineas.map(x => x.descEfectivo)));

// =====================================================================
// Pantallas (js/cambio-cuenta.js)
// =====================================================================
const tick = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escribir = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const boton = t => $$('.hj-pie button').find(b => b.textContent === t);
sessionStorage.setItem('authRol', 'vendedor_estandar');
sessionStorage.setItem('authCodigo', 'V1');
sessionStorage.setItem('authToken', 'tok');
localStorage.removeItem('clientData');

const MIS = [
  { id: 'ped-1', numero: 'APP-50', cliente: '7', nombre: 'FERRETERIA SIETE', fecha: new Date().toISOString(), total: 1234.5,
    lineas: 9, impreso: 'si', cambiado: false, prueba: false },
  { id: 'ped-2', numero: 'APP-51', cliente: '11', nombre: 'ONCE', fecha: new Date().toISOString(), total: 99, lineas: 1,
    impreso: 'no', cambiado: true, prueba: false }
];
const PED = { ok: true, id: 'ped-1', numero: 'APP-50', cliente: '7', nombre: 'FERRETERIA SIETE', fecha: new Date().toISOString(),
  dias: 2, lista: 'D', descTotalPct: 0, descExtraPct: 0, totalNeto: 3000, impreso: 'si', fechaImpresion: '', lineas: PEDIDO };
let pedResp = PED;
const llamadas = [];
let respCambio = null;
w.Api = { llamar: async b => {
  llamadas.push(JSON.parse(JSON.stringify(b)));
  if (b.accion === 'mis_pedidos') return { ok: true, pedidos: MIS, dias: 14 };
  if (b.accion === 'pedido_para_cambio') return JSON.parse(JSON.stringify(pedResp));
  if (b.accion === 'cambiar_cuenta') return respCambio;
  return { ok: false, error: 'accion_desconocida' };
} };
const CC = await importar('cambio-cuenta.js');
const ultima = acc => llamadas.filter(x => x.accion === acc).at(-1);
const elegir = async cuenta => { escribir($('#cc-cli'), cuenta); $(`.cc-cli[data-cuenta="${cuenta}"]`).click(); await tick(); };

// Mis pedidos
await CC.abrirLista(); await tick();
ver('lista: titulo "Mis pedidos" y una tarjeta por pedido', $('.hj-titulo')?.textContent === 'Mis pedidos' && $$('.cc-pedido').length === 2);
const t1 = $$('.cc-pedido')[0]?.textContent.replace(/\s+/g, ' ') || '';
ver('lista: numero, cuenta, nombre, total y chip', t1.includes('N° APP-50') && t1.includes('7 · FERRETERIA SIETE') && t1.includes('Impreso') &&
  t1.includes('$1.234,5'), t1);
ver('lista: chip "Cliente cambiado" y Pendiente', ($$('.cc-pedido')[1]?.textContent || '').includes('Cliente cambiado') &&
  ($$('.cc-pedido')[1]?.textContent || '').includes('Pendiente'));
escribir($('.cc-buscar'), 'once');
ver('lista: el buscador filtra por nombre', $$('.cc-pedido').length === 1 && $('.cc-pedido').dataset.id === 'ped-2');
escribir($('.cc-buscar'), 'app-50');
ver('lista: y por numero', $$('.cc-pedido').length === 1 && $('.cc-pedido').dataset.id === 'ped-1');
$('.cc-pedido').click(); await tick();
ver('pedido: pide pedido_para_cambio con el id y el token', ultima('pedido_para_cambio')?.id === 'ped-1' && ultima('pedido_para_cambio')?.token === 'tok');
ver('pedido: cabecera con el cliente actual', ($('.cc-pedido-cab')?.textContent || '').includes('7 · FERRETERIA SIETE'));

// Elegir el cliente
escribir($('#cc-cli'), '9');
ver('cliente de otro vendedor: se ve, marcado', !!$('.cc-cli.cc-ajeno[data-cuenta="9"]') && $('.cc-cli.cc-ajeno').textContent.includes('de otro vendedor'));
$('.cc-cli.cc-ajeno').click();
ver('cliente de otro vendedor: dice que se lo pida a la oficina', ($('.cc-error')?.textContent || '').includes('Pedíselo a la oficina') &&
  $('.cc-error').textContent.includes('N° APP-50') && !$('.cc-decide'));
escribir($('#cc-cli'), 'siete');
ver('el cliente actual no se ofrece', !$('.cc-cli[data-cuenta="7"]'));
await elegir('10');
ver('cliente sin lista: avisa y no abre la vista previa', ($('.cc-error')?.textContent || '').includes('no tiene lista') && !$('.cc-decide'));
await elegir('8');

// Vista previa
const decide = $('.cc-decide');
ver('vista previa: arriba el cliente viejo tachado y el nuevo', !!decide && decide.querySelector('s')?.textContent === '7 · FERRETERIA SIETE' &&
  decide.querySelector('.cc-dec-nuevo')?.textContent.includes('8 · CORRALON OCHO'), decide?.innerHTML);
const esperado = resumenCambio(PED, recalcularLineas(PEDIDO, { listaVieja: 'D', listaNueva: 'E', cuentaNueva: '8' }));
ver('vista previa: total viejo -> nuevo, antes de las lineas', decide?.textContent.includes('$3.000') &&
  decide?.querySelector('.cc-dec-total')?.textContent === '$' + esperado.totalNuevo.toLocaleString('es-AR', { maximumFractionDigits: 2 }) &&
  !!(decide.compareDocumentPosition($('.cc-lineas')) & w.Node.DOCUMENT_POSITION_FOLLOWING), decide?.textContent);
ver('vista previa: lista D -> E', decide?.textContent.includes('Lista D → E'));
ver('vista previa: 4 lineas que cambian, plegadas (mas de 3)', !!$('.cc-lineas') && !$('.cc-lineas').open &&
  $$('.cc-linea').length === 4 && $('.cc-lineas summary').textContent === 'Las 4 líneas que cambian');
ver('vista previa: la actualizacion de precios aparte, en su linea', $$('.cc-lin-nota').length === 1 &&
  $('.cc-lin-nota').textContent.includes('además cambió de precio'));
ver('vista previa: motivos', ($('.cc-lineas')?.textContent || '').includes('sale de promoción') && $('.cc-lineas').textContent.includes('entra en promoción'));
ver('vista previa: fijas y sin precio', $$('.cc-nota').some(x => x.textContent.includes('2 líneas con otra lista o precio especial')) &&
  $$('.cc-nota').some(x => x.textContent.includes('Sin precio hoy')));
ver('vista previa: aviso de impreso; sin aviso de factura (2 dias)', $$('.cc-aviso').some(x => x.textContent.includes('Ya se imprimió')) &&
  !$('.cc-aviso-fuerte'));
ver('vista previa: sin "Los precios no cambian"', !$('.cc-sin-cambios'));

// Se actualizan los precios con la vista previa abierta: se cierra, no se manda nada
const cambiosAntes = llamadas.filter(x => x.accion === 'cambiar_cuenta').length;
document.dispatchEvent(new w.CustomEvent('precios:actualizados', { detail: { cambios: [] } })); await tick();
ver('precios actualizados: se cierra la vista previa y lo dice', !$('.cc-decide') && $('.hj-titulo')?.textContent === 'Cambiar el cliente' &&
  ($('.cc-aviso-fuerte')?.textContent || '').includes('se actualizaron mientras mirabas'));
ver('precios actualizados: no se mando nada', llamadas.filter(x => x.accion === 'cambiar_cuenta').length === cambiosAntes);
await elegir('8');
document.dispatchEvent(new w.CustomEvent('promos:actualizadas')); await tick();
ver('promociones actualizadas: tambien se cierra', !$('.cc-decide') && !!$('.cc-aviso-fuerte'));

// Se manda exactamente lo que se mostro (aunque los precios de memoria cambien sin aviso)
await elegir('8');
const calcVisto = CC.calcular(PED, { cuenta: '8', nombre: 'CORRALON OCHO', lista: 'E' });
catalogo.A = { D: 100, E: 999 };            // cambia en memoria, sin evento
respCambio = { ok: false, error: 'cuenta_de_otro_vendedor' };
boton('Cambiar el cliente').click(); await tick();
const env1 = ultima('cambiar_cuenta');
ver('envio: exactamente lo calculado al mostrar, sin recalcular', JSON.stringify({ ...env1, token: undefined }) ===
  JSON.stringify({ ...calcVisto.envio, token: undefined }) && env1.lineas.find(l => l.sku === 'A').precio === 104.5, JSON.stringify(env1?.lineas[0]));
ver('envio: id, cuenta, lista y total anterior', env1.id === 'ped-1' && env1.cuentaNueva === '8' && env1.lista === 'E' && env1.totalAnterior === 3000);
ver('error del servidor: texto claro, el boton vuelve', ($('.cc-error')?.textContent || '').includes('es de otro vendedor') &&
  !boton('Cambiar el cliente').disabled);
respCambio = { ok: true, id: 'ped-1', numero: 'APP-50', cuenta: '8', nombre: 'CORRALON OCHO', totalNeto: 2500, estabaImpreso: true, lineasCambiadas: 4 };
boton('Cambiar el cliente').click(); await tick();
const env2 = ultima('cambiar_cuenta');
ver('reintento: manda lo mismo', JSON.stringify(env2.lineas) === JSON.stringify(env1.lineas));
const listoTxt = $('.cc-listo')?.textContent.replace(/\s+/g, ' ') || '';
ver('listo: numero, cliente nuevo, total y aviso de reimprimir', listoTxt.includes('N° APP-50') && listoTxt.includes('8 · CORRALON OCHO') &&
  listoTxt.includes('$2.500') && listoTxt.includes('hay que reimprimirlo'), listoTxt);
ver('listo: volver a los pedidos (vino de la lista), sin "volver a la bandeja"', !!boton('Volver a los pedidos') && !boton('Volver a la bandeja'));
catalogo.A = { D: 100, E: 110 };
boton('Listo').click();

// Sin diferencias: se ve de entrada
pedResp = { ...PED, id: 'ped-3', lista: 'D', impreso: 'no', totalNeto: 200, lineas: [g(1, 'A', 2, 'lista_cliente', 'D', 100, 100)] };
await CC.abrirPedido('ped-3'); await tick();
await elegir('11');
ver('sin diferencias: "Los precios no cambian" arriba, sin total ni lineas', ($('.cc-decide .cc-sin-cambios')?.textContent || '')
  .includes('Los precios no cambian. Solo cambia el cliente') && !$('.cc-dec-total') && !$('.cc-lineas') && !$('.cc-aviso'), $('.cc-decide')?.innerHTML);
$('.hj-volver').click();

// Pedido de mas de una semana: el aviso de factura, arriba
pedResp = { ...PED, id: 'ped-4', dias: 9, fecha: new Date(Date.now() - 9 * 86400000).toISOString() };
await CC.abrirPedido('ped-4'); await tick();
await elegir('8');
const fuerte = $('.cc-aviso-fuerte');
ver('mas de 7 dias: aviso de factura antes de todo', !!fuerte && fuerte.textContent.includes('hace 9 días') &&
  fuerte.textContent.includes('Si ya se facturó, cambiar la cuenta acá no corrige la factura') &&
  !!(fuerte.compareDocumentPosition($('.cc-decide')) & w.Node.DOCUMENT_POSITION_FOLLOWING), fuerte?.textContent);
ver('mas de 7 dias: no bloquea', !!boton('Cambiar el cliente') && !boton('Cambiar el cliente').disabled);
$('.hj-volver').click();

// Pocas lineas que cambian: abiertas
pedResp = { ...PED, id: 'ped-5', impreso: 'no', lineas: [g(1, 'A', 1, 'lista_cliente', 'D', 100, 100)] };
await CC.abrirPedido('ped-5'); await tick();
await elegir('8');
ver('una linea que cambia: abierta', !!$('.cc-lineas')?.open && $('.cc-lineas summary').textContent === 'La línea que cambia');
$('.hj-volver').click();

// Errores al abrir y roles
pedResp = { ok: false, error: 'fuera_de_plazo' };
await CC.abrirPedido('ped-6'); await tick();
ver('abrir un pedido fuera de plazo: lo dice', ($('.cc-error')?.textContent || '').includes('más de 14 días'));
$('.hj-volver').click();
sessionStorage.setItem('authRol', 'cliente_estandar');
await CC.abrirLista(); await tick();
ver('un cliente: no se abre nada', !$('.hj-fondo'));
sessionStorage.setItem('authRol', 'oficina');
await CC.abrirLista(); await tick();
ver('oficina: titulo "Pedidos"', $('.hj-titulo')?.textContent === 'Pedidos');
$('.hj-volver').click();
sessionStorage.setItem('authRol', 'vendedor_estandar');

// Desde la bandeja: catalogo.html?cambiar=<id> (otra copia del modulo, con esa URL)
pedResp = PED;
w.history.replaceState(null, '', '/catalogo.html?cambiar=ped-9&x=1');
const importar2 = prepararModulos(MODULOS);
await importar2('cambio-cuenta.js'); await tick();
ver('?cambiar=: abre ese pedido', ultima('pedido_para_cambio')?.id === 'ped-9' && $('.hj-titulo')?.textContent === 'Cambiar el cliente');
ver('?cambiar=: se saca de la direccion (una recarga no lo reabre)', w.location.search === '?x=1', w.location.search);
respCambio = { ok: true, id: 'ped-9', numero: 'APP-50', cuenta: '8', nombre: 'CORRALON OCHO', totalNeto: 2500, estabaImpreso: false, lineasCambiadas: 4 };
await elegir('8');
boton('Cambiar el cliente').click(); await tick();
ver('?cambiar=: al terminar ofrece volver a la bandeja', !!boton('Volver a la bandeja'));

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
