// PRUEBA DE LA BANDEJA DE IMPRESION (js/imprimir.js, js/imprimir-hojas.js) con
// jsdom: pedidos incompletos, impresion sin confirmar, lineas sin cabecera, altas
// el origen del precio anterior y los totales de observaciones con articulos a
// verificar en la hoja de facturacion.
// Servidor simulado. Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_bandeja.mjs
import { readFileSync } from 'fs';
import { join } from 'path';
import { RAIZ, JSDOM, prepararModulos } from './preparar.mjs';
const importar = prepararModulos(['imprimir.js', 'imprimir-hojas.js'],
  { 'sesion.js': 'export async function pedirToken() { return true; }\n' });

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

const html = readFileSync(join(RAIZ, 'imprimir.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://ferremax.test/imprimir.html', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame'])
  globalThis[k] = k === 'window' ? w : w[k];
// El padron (clientes_permisos.json) con una cuenta, para el aviso de cuenta existente
globalThis.fetch = async url => ({ ok: true, json: async () => (String(url).includes('clientes_permisos')
  ? { 5555: { name: 'Ferretería Vieja' } } : {}) });
sessionStorage.setItem('authToken', 't');
sessionStorage.setItem('authVence', String(Date.now() + 3600e3));
sessionStorage.setItem('authRol', 'oficina');

const linea = n => Array.from({ length: n }, (_, i) => ({ orden: i + 1, sku: 'S' + (i + 1), nombre: 'Art', cantidad: 1, subtotal: 10 }));
const ped = (id, numero, cant, llegan, extra = {}) => ({ id, numero, cliente: '100', nombreCliente: 'Cliente ' + id, vendedor: 'V1',
  fecha: '2026-11-09T12:00:00Z', cantLineas: cant, totalNeto: 100, lineas: linea(llegan), observaciones: [], ...extra });
const PEND = [
  ped('A', 'APP-1', 2, 2),
  ped('B', 'APP-2', 12, 0),                                            // el caso real
  ped('C', 'APP-3', 12, 3),
  ped('D', 'APP-4', 0, 0, { observaciones: [{ clave: 'PAGA', items: [] }] }),   // solo observaciones
  ped('E', 'APP-5', 1, 1, { intentoImpresion: '2026-11-09T13:00:00Z', intentoPor: 'Ofi' }),
  ped('F', 'APP-6', 4, 1, { intentoImpresion: '2026-11-09T13:00:00Z' })        // incompleto con intento
];
const IMPR = [ped('G', 'APP-7', 5, 5, { fechaImpresion: '2026-11-09T14:00:00Z' }), ped('H', 'APP-8', 12, 0, { fechaImpresion: '2026-11-09T14:00:00Z' })];
let respuesta = { pendientes: PEND, impresos: IMPR };
let huerf = null;   // lineasSinCabecera que manda el servidor (null: no lo manda)
w.Api = { llamar: async b => (b.accion === 'pedidos_para_imprimir' ? { ok: true, modo: b.modo, pedidos: respuesta[b.modo], ...(huerf ? { lineasSinCabecera: huerf } : {}) } : { ok: true }) };

await importar('imprimir.js');
const Hojas = await importar('imprimir-hojas.js');
await tick(20);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const filas = () => $$('#im-tbody tr').map(tr => tr.dataset.id);
const incomp = () => $$('#im-incompletos .im-sc-tarjeta').map(t => t.dataset.id);
const sinconf = () => $$('#im-sinconf .im-sc-tarjeta').map(t => t.dataset.id);

// Pendientes
ver('tabla: solo los completos (A y el de solo obs D)', JSON.stringify(filas()) === '["A","D"]', JSON.stringify(filas()));
ver('bloque incompletos: B, C y F (F aunque tenga intento)', JSON.stringify(incomp()) === '["B","C","F"]', JSON.stringify(incomp()));
ver('bloque sin confirmar: solo E', JSON.stringify(sinconf()) === '["E"]', JSON.stringify(sinconf()));
ver('bloque incompletos visible, arriba del de sin confirmar', !$('#im-incompletos').hidden &&
  !!($('#im-incompletos').compareDocumentPosition($('#im-sinconf')) & 4));
ver('titulo con la cantidad', $('#im-incompletos h2').textContent === 'Pedidos incompletos (3)');
ver('texto: avisar al vendedor', $('#im-incompletos .im-sc-texto').textContent.includes('Avisale al vendedor'));
const tB = $('#im-incompletos [data-id="B"]').textContent;
ver('tarjeta: N°, cliente y "llegaron 0 de 12 líneas"', tB.includes('N° APP-2') && tB.includes('Cliente B') && tB.includes('llegaron 0 de 12 líneas'), tB);
ver('tarjeta C: 3 de 12', $('#im-incompletos [data-id="C"]').textContent.includes('llegaron 3 de 12 líneas'));
ver('incompletos sin casillas ni botones', !$('#im-incompletos input, #im-incompletos button'));
ver('solo obs no es incompleto', !incomp().includes('D'));

// Seleccion
$('#im-todos').click();
ver('seleccionar todos: 2 (A y D)', $('#im-contador').textContent === '2 seleccionados', $('#im-contador').textContent);
$('#im-incompletos [data-id="B"]').click();
ver('tocar un incompleto no lo selecciona', $('#im-contador').textContent === '2 seleccionados');

// Filtro que no coincide: el bloque sigue a la vista
$('#im-buscar').value = 'zzz'; $('#im-buscar').dispatchEvent(new w.Event('input'));
ver('filtro: tabla vacia, incompletos a la vista', filas().length === 0 && incomp().length === 3 && !$('#im-incompletos').hidden);
$('#im-limpiar').click();

// Resguardo en imprimir-hojas: nunca imprime un incompleto
ver('esIncompleto', Hojas.esIncompleto(PEND[1]) && Hojas.esIncompleto(PEND[2]) && !Hojas.esIncompleto(PEND[0]) && !Hojas.esIncompleto(PEND[3]));
Hojas.imprimir([PEND[0], PEND[1]]);
await tick();
const aviso = $('#ih-aviso .ih-aviso-texto')?.textContent || '';
ver('imprimir con un incompleto: aviso y no imprime ninguno', aviso.includes('No se imprimió: el pedido N° APP-2 está incompleto') && !$('#ih-hojas')?.children.length, aviso);
$$('#ih-aviso button').find(b => b.textContent === 'Cerrar').click();
ver('Cerrar: aviso oculto', $('#ih-aviso').hidden);
Hojas.confirmarExistentes(PEND[5]);
ver('confirmarExistentes con incompleto: no hace nada', $('#ih-aviso').hidden);

// Impresos: el ya impreso incompleto (como el caso real)
$$('.im-pestana').find(b => b.dataset.modo === 'impresos').click();
await tick(20);
ver('impresos: tabla con G, bloque con H', JSON.stringify(filas()) === '["G"]' && JSON.stringify(incomp()) === '["H"]', JSON.stringify([filas(), incomp()]));
ver('impresos: "Figura como impreso"', $('#im-incompletos [data-id="H"]').textContent.includes('Figura como impreso'));

// Solo incompletos: mensaje de la lista
respuesta = { pendientes: [PEND[1]], impresos: [] };
$$('.im-pestana').find(b => b.dataset.modo === 'pendientes').click();
await tick(20);
$('#im-actualizar').click(); await tick(20);
ver('solo incompletos: "No hay otros pedidos para imprimir."', $('#im-estado').textContent.includes('No hay otros pedidos para imprimir.'), $('#im-estado').textContent);
ver('solo incompletos: imprimir deshabilitado', $('#im-imprimir').disabled);

// Sin incompletos: el bloque desaparece
respuesta = { pendientes: [PEND[0]], impresos: [] };
$('#im-actualizar').click(); await tick(20);
ver('sin incompletos: bloque oculto y vacio', $('#im-incompletos').hidden && !incomp().length);

// V9. Aviso de lineas sin cabecera (admin y oficina)
const huerfanos = n => ({ total: n, pedidos: Array.from({ length: Math.min(n, 20) }, (_, k) => ({ id: 'id-huerfano-' + (k + 1), lineas: k === 0 ? 13 : 1 })) });
ver('V9 sin el dato (vendedor o servidor viejo): bloque oculto', $('#im-huerfanas').hidden && !$('#im-huerfanas').innerHTML);
huerf = huerfanos(2);
$('#im-actualizar').click(); await tick(20);
const tH = $('#im-huerfanas').textContent;
ver('V9 bloque visible con titulo y cantidad', !$('#im-huerfanas').hidden && $('#im-huerfanas h2').textContent === 'Líneas guardadas sin cabecera (2 pedidos)', $('#im-huerfanas h2')?.textContent);
ver('V9 los ids con sus lineas', tH.includes('id-huerfano-1 (13 líneas)') && tH.includes('id-huerfano-2 (1 línea)'), tH);
ver('V9 texto: actualizar si acabás de guardar y avisar a sistemas', tH.includes('Si acabás de guardar un pedido, actualizá') && tH.includes('avisá a sistemas'));
ver('V9 arriba de todo, antes de incompletos', $('#im-huerfanas').nextElementSibling === $('#im-incompletos'));
ver('V9 sin casillas ni botones', !$('#im-huerfanas input, #im-huerfanas button'));
ver('V9 la tabla sigue igual', JSON.stringify(filas()) === '["A"]', JSON.stringify(filas()));
$('#im-buscar').value = 'zzz'; $('#im-buscar').dispatchEvent(new w.Event('input'));
ver('V9 un filtro no lo oculta', !$('#im-huerfanas').hidden);
$('#im-limpiar').click();
huerf = huerfanos(25);
$('#im-actualizar').click(); await tick(20);
ver('V9 con 25: muestra 20 ids y "y 5 más"', $$('#im-huerfanas li').length === 20 && $('#im-huerfanas').textContent.includes('y 5 más') &&
  $('#im-huerfanas h2').textContent.includes('(25 pedidos)'));
huerf = { total: 1, pedidos: [{ id: '<b>x</b>', lineas: 1 }] };
$('#im-actualizar').click(); await tick(20);
ver('V9 un pedido: "1 pedido" y el id escapado', $('#im-huerfanas h2').textContent.includes('(1 pedido)') && !$('#im-huerfanas b'));
huerf = { total: 0, pedidos: [] };
$('#im-actualizar').click(); await tick(20);
ver('V9 total 0: bloque oculto', $('#im-huerfanas').hidden && !$('#im-huerfanas').innerHTML);

// B. Clientes nuevos sin numero de cuenta (bloque "Falta número de cuenta")
{
  const antesB = ok + fallas;
  const llamadasB = [];
  let respAsignar = null;
  const apiAntes = w.Api.llamar;
  w.Api.llamar = async b => {
    llamadasB.push(b);
    if (b.accion === 'asignar_cuenta') return respAsignar;
    if (b.accion === 'marcar_alta_impresa') return { ok: true, marcados: 1 };
    return apiAntes(b);
  };
  let impresiones = 0;
  w.print = () => { impresiones++; };
  const datosAlta = { alta: 'ALTA-1', comercio: 'Ferretería <El> Tornillo', apellido: 'Gómez', contacto: 'Juan', domicilio: 'San Martín 123',
    localidad: 'Rafaela', telefono: '3492 555555', horario: '8 a 12', formula: 'E', cuentaPuente: '157', vendedor: 'V1',
    impresa: false, fechaImpresion: '', impresoPor: '' };
  const pAlta = ped('AL1', 'ALTA-1', 2, 2, { cliente: '157', faltaCuenta: true, alta: 'ALTA-1', datosAlta, totalNeto: 1234.5 });
  respuesta = { pendientes: [PEND[0], pAlta], impresos: [] };
  huerf = null;
  $('#im-actualizar').click(); await tick(20);
  const altasT = () => $$('#im-altas .im-sc-tarjeta').map(t => t.dataset.id);
  const tA = () => $('#im-altas [data-id="AL1"]');

  ver('B1 bloque "Falta número de cuenta (1)" con la tarjeta', !$('#im-altas').hidden && $('#im-altas h2').textContent === 'Falta número de cuenta (1)' &&
    JSON.stringify(altasT()) === '["AL1"]');
  ver('B1 el alta no esta en la tabla ni en incompletos', JSON.stringify(filas()) === '["A"]' && !incomp().includes('AL1'));
  const txt = tA().textContent;
  ver('B1 tarjeta: ALTA-1, comercio (escapado), localidad, vendedor, formula y total', txt.includes('ALTA-1') && txt.includes('Ferretería <El> Tornillo') &&
    !tA().querySelector('el') && txt.includes('Rafaela') && txt.includes('Vendedor V1') && txt.includes('Fórmula E') && txt.includes('1.234,50'), txt);
  ver('B1 "Hoja de alta sin imprimir" y botones: imprimir y cargar (oficina)', txt.includes('Hoja de alta sin imprimir') &&
    !!tA().querySelector('.im-alta-imprimir') && !!tA().querySelector('.im-alta-cargar'));
  ver('B1 orden: incompletos y altas antes de "sin confirmar"', !!($('#im-altas').compareDocumentPosition($('#im-sinconf')) & 4));
  $('#im-todos').click();
  ver('B1 "Seleccionar todos" no toma el alta', $('#im-contador').textContent === '1 seleccionado', $('#im-contador').textContent);
  $('#im-todos').click();

  // Hoja de alta
  tA().querySelector('.im-alta-imprimir').click(); await tick();
  const hoja = $('#ih-hojas').textContent;
  ver('B2 hoja de alta: titulo, ALTA-1, los datos, la formula y el total', hoja.includes('ALTA DE CLIENTE') && hoja.includes('ALTA-1') &&
    hoja.includes('Ferretería <El> Tornillo') && hoja.includes('3492 555555') && hoja.includes('8 a 12') && hoja.includes('Fórmula') &&
    hoja.includes('1.234,50') && hoja.includes('N° de cuenta asignado') && !$('#ih-hojas el'), hoja.slice(0, 200));
  ver('B2 se abrio el dialogo de impresion y pregunta si salio', impresiones === 1 && $('#ih-aviso .ih-aviso-texto').textContent === '¿Salió la hoja de alta ALTA-1?');
  const consultasAntes = llamadasB.filter(b => b.accion === 'pedidos_para_imprimir').length;
  $$('#ih-aviso button').find(b => b.textContent === 'Sí, salió').click(); await tick(20);
  const marca = llamadasB.find(b => b.accion === 'marcar_alta_impresa');
  ver('B2 "Sí, salió": registra la impresion de la hoja (marcar_alta_impresa con su id)', JSON.stringify(marca?.ids) === '["AL1"]');
  ver('B2 al cerrar: aviso oculto y la bandeja se actualiza', $('#ih-aviso').hidden &&
    llamadasB.filter(b => b.accion === 'pedidos_para_imprimir').length > consultasAntes);

  // Hoja impresa: la tarjeta lo dice
  pAlta.datosAlta = { ...datosAlta, impresa: true, fechaImpresion: '2026-11-10T13:05:00Z', impresoPor: 'Ana' };
  $('#im-actualizar').click(); await tick(20);
  ver('B2 tarjeta: "Hoja de alta impresa el ... (Ana)" y "Reimprimir"', /Hoja de alta impresa el 10\/11\/2026 a las 10:05 \(Ana\)/.test(tA().textContent) &&
    tA().querySelector('.im-alta-imprimir').textContent === 'Reimprimir hoja de alta', tA().textContent);

  // Cargar el numero de cuenta
  tA().querySelector('.im-alta-cargar').click();
  ver('B3 cargar: aparece el campo y desaparece el boton', !!tA().querySelector('.im-alta-cuenta') && !tA().querySelector('.im-alta-cargar'));
  tA().querySelector('.im-alta-cuenta').value = '43a';
  tA().querySelector('.im-alta-seguir').click();
  ver('B3 con letras: error y no avanza', tA().querySelector('.im-alta-error')?.textContent.includes('solo dígitos') && !!tA().querySelector('.im-alta-cuenta'));
  tA().querySelector('.im-alta-cuenta').value = '4321';
  tA().querySelector('.im-alta-seguir').click();
  ver('B3 confirmar: "¿Asignar la cuenta 4321 a Ferretería <El> Tornillo (ALTA-1)?" sin advertencia', tA().querySelector('.im-alta-pregunta')?.textContent ===
    '¿Asignar la cuenta 4321 a Ferretería <El> Tornillo (ALTA-1)?' && !tA().querySelector('.im-alta-error'), tA().querySelector('.im-alta-pregunta')?.textContent);
  tA().querySelector('.im-alta-volver').click();
  ver('B3 volver: el campo conserva 4321', tA().querySelector('.im-alta-cuenta')?.value === '4321');
  tA().querySelector('.im-alta-cuenta').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ver('B3 Enter en el campo equivale a Seguir', !!tA().querySelector('.im-alta-confirmar'));
  // Error del servidor
  respAsignar = { ok: false, error: 'ya_asignada' };
  tA().querySelector('.im-alta-confirmar').click(); await tick(10);
  ver('B3 error del servidor: mensaje en la tarjeta y sigue en confirmar', tA().querySelector('.im-alta-error')?.textContent.includes('ya tiene cuenta') &&
    !!tA().querySelector('.im-alta-confirmar'));
  // Exito: el pedido pasa a la tabla
  respAsignar = { ok: true, id: 'AL1', cuenta: '4321', numero: 'APP-9', alta: 'ALTA-1' };
  const asignado = ped('AL1', 'APP-9', 2, 2, { cliente: '4321', nombreCliente: 'Ferretería <El> Tornillo', faltaCuenta: false, alta: 'ALTA-1' });
  respuesta = { pendientes: [PEND[0], asignado], impresos: [] };
  tA().querySelector('.im-alta-confirmar').click(); await tick(20);
  const ult = llamadasB.filter(b => b.accion === 'asignar_cuenta').at(-1);
  ver('B3 asignar_cuenta con el id y la cuenta', ult?.id === 'AL1' && ult?.cuenta === '4321');
  ver('B3 aviso: "ALTA-1 quedó como pedido N° APP-9 (cuenta 4321)"', $('.im-aviso-breve')?.textContent.startsWith('ALTA-1 quedó como pedido N° APP-9 (cuenta 4321)'));
  ver('B3 la bandeja se actualiza: el pedido ya esta en la tabla y el bloque se va', filas().includes('AL1') && $('#im-altas').hidden);

  // Cuenta que ya existe en el padron
  respuesta = { pendientes: [PEND[0], pAlta], impresos: [] };
  $('#im-actualizar').click(); await tick(20);
  tA().querySelector('.im-alta-cargar').click();
  tA().querySelector('.im-alta-cuenta').value = '5555';
  tA().querySelector('.im-alta-seguir').click();
  ver('B4 cuenta que ya figura en el padron: advertencia con su nombre', tA().querySelector('.im-alta-error')?.textContent.includes('ya figura en el padrón como') &&
    tA().textContent.includes('«Ferretería Vieja»'), tA().textContent);
  tA().querySelector('.im-alta-volver').click();
  tA().querySelector('.im-alta-cancelar').click();
  ver('B4 cancelar: vuelve el boton', !!tA().querySelector('.im-alta-cargar') && !tA().querySelector('.im-alta-cuenta'));

  // Resguardo: el pedido sin cuenta no se imprime
  Hojas.imprimir([pAlta]); await tick();
  ver('B5 imprimir() con un alta sin cuenta: avisa y no imprime', $('#ih-aviso .ih-aviso-texto').textContent.includes('no tiene número de cuenta') && impresiones === 1);
  $$('#ih-aviso button').find(b => b.textContent === 'Cerrar').click();

  // Vendedor: imprime la hoja, no carga la cuenta
  sessionStorage.setItem('authRol', 'vendedor_estandar');
  $('#im-actualizar').click(); await tick(20);
  ver('B6 vendedor: ve el alta y la hoja, sin "Cargar número de cuenta"', !!tA()?.querySelector('.im-alta-imprimir') && !tA().querySelector('.im-alta-cargar') &&
    $('#im-altas .im-sc-texto').textContent.includes('oficina carga el número'));
  sessionStorage.setItem('authRol', 'oficina');

  w.Api.llamar = apiAntes;
  respuesta = { pendientes: PEND, impresos: IMPR };
  console.log(`Casos de altas en la bandeja: ${ok + fallas - antesB}`);
}

// =====================================================================
// PRECIO ANTERIOR EN LA HOJA DE FACTURACION (v38): de donde salio el precio
// (comprobante del sistema de gestion o pedido de la app), su aclaracion y
// VERIFICAR PRECIO. Datos sinteticos.
{
  const antesP = ok + fallas;
  w.print = () => {};
  // Fecha como la manda el servidor: el dia del DBF al mediodia de Argentina
  const hist = (numero, fecha, sinIva, desc = []) => ({ tipo: 'anterior', fuente: 'historial', numero, fecha: fecha + 'T12:00:00-03:00', sinIva, desc });
  const app = (numero, desc = []) => ({ tipo: 'anterior', fuente: 'app', numero, fecha: '2026-11-08T15:00:00Z', desc });
  const itm = (sku, cantidad, precio, origen, extra = {}) => ({ sku, nombre: 'Art ' + sku, cantidad, precio,
    importe: precio === null ? null : -precio * cantidad, origen, ...extra });
  // Como lo manda el servidor v40: el precio con el descuento aplicado y el del renglon aparte
  const v40 = (o, renglon, parcial = false) => ({ ...o, precioRenglon: renglon, descAplicado: o.desc.length > 0, descParcial: parcial });
  const o116 = { clave: '116', codigo: '116', texto: 'DEVUELVE', grupo: 'mercaderia', efecto: 'descuenta', importe: -1, verificar: false, items: [
    itm('EVO115TF', 2, 10327.53, v40(hist('PRa000000012345', '2026-11-05', 9177.58, [[7, 'contado']]), 11104.87)),
    itm('CAS1', 1, 53.46, v40(hist('FCa000000000500', '2026-09-10', 50, [[5, ''], [7, 'contado']]), 60.5)),
    itm('SKU1', 1, 181.5, v40(hist('PRb000000001033', '2026-10-01', 150), 181.5)),
    itm('SKU2', 1, 84.38, v40(app('APP-1', [[7, ''], [5, '']]), 95.5)),
    itm('SKU3', 1, 33, v40(app('APP-1'), 33))] };
  const o119 = { clave: '119', codigo: '119', texto: 'FALTANTE', grupo: 'mercaderia', efecto: 'descuenta', importe: null, verificar: true,
    items: [itm('NADA', 1, null, null)] };
  const o126 = { clave: '126', codigo: '126', texto: 'FACTURADO DISTINTO', grupo: 'mercaderia', efecto: 'ajuste', importe: 10327.53, verificar: true, items: [
    itm('EVO115TF', 1, 10327.53, v40(hist('PRa000000012345', '2026-11-05', 9177.58, [[7, 'contado']]), 11104.87), { lado: 'facturado' }),
    { ...itm('EVO115TF', 2, 10327.53, v40(hist('PRa000000012345', '2026-11-05', 9177.58, [[7, 'contado']]), 11104.87), { lado: 'correspondia' }), importe: 20655.06 }] };
  // Un servidor anterior: origen sin fuente ni aclaracion
  const oViejo = { clave: '116', codigo: '116', texto: 'DEVUELVE', grupo: 'mercaderia', efecto: 'descuenta', importe: -100, verificar: false,
    items: [itm('VIEJO', 1, 100, { tipo: 'anterior', numero: 'APP-3', fecha: '2026-11-01T15:00:00Z' })] };
  const P1 = ped('PA1', 'APP-21', 1, 1, { observaciones: [o116, o119, o126] });
  const P2 = ped('PA2', 'APP-22', 1, 1, { observaciones: [oViejo] });
  // Paginado: 60 articulos con aclaracion contra los mismos sin ella
  const muchos = conFuente => Array.from({ length: 60 }, (_, i) => itm('M' + i, 1, 10,
    conFuente ? hist('PRa000000000' + (100 + i), '2026-10-01', 8.26) : { tipo: 'anterior', numero: 'APP-3', fecha: '2026-11-01T15:00:00Z' }));
  const P3 = ped('PA3', 'APP-23', 1, 1, { observaciones: [{ ...oViejo, items: muchos(true) }] });
  const P4 = ped('PA4', 'APP-24', 1, 1, { observaciones: [{ ...oViejo, items: muchos(false) }] });
  // Un servidor v38: el precio del renglon y el descuento "no aplicado" (la app nueva lo muestra como antes)
  const P5 = ped('PA5', 'APP-25', 1, 1, { observaciones: [{ ...oViejo, importe: -11200.37, items: [
    itm('V38H', 1, 11104.87, hist('PRa000000012346', '2026-11-05', 9177.58, [[7, 'contado']])),
    itm('V38A', 1, 95.5, app('APP-2', [[7, ''], [5, '']]))] }] });
  // v40: descuento parcial en el comprobante y un pedido de la app con un solo descuento
  const P6 = ped('PA6', 'APP-26', 1, 1, { observaciones: [{ ...oViejo, importe: -159.03, verificar: true, items: [
    itm('PARC', 1, 112.53, v40(hist('PRa000000066666', '2026-11-02', 100, [[7, 'contado']]), 121, true)),
    itm('SKU4', 1, 46.5, v40(app('APP-3', [[7, '']]), 50))] }] });
  // v40 con los totales parciales (v39): un articulo con descuento y otro a verificar
  const P7 = ped('PA7', 'APP-27', 1, 1, { totalBruto: 100, totalNeto: 100, observaciones: [{ ...oViejo, importe: null, verificar: true, items: [
    itm('EVO115TF', 1, 10327.53, v40(hist('PRa000000012347', '2026-11-05', 9177.58, [[7, 'contado']]), 11104.87)),
    itm('NADA2', 1, null, null)] }] });

  Hojas.imprimir([P1, P2, P3, P4, P5, P6, P7]);
  await tick(60);
  const cont = document.getElementById('ih-hojas');
  const hojasDe = numero => [...cont.querySelectorAll('.ih-hoja, section, article')].filter(h => h.textContent.includes('N° ' + numero));
  const notas = [...cont.querySelectorAll('tr.ih-obs-nota-fact')].map(tr => tr.textContent.trim());
  const filaDe = (sku, n = 0) => [...cont.querySelectorAll('tr.ih-obs-item-fact')].filter(tr => tr.querySelector('.ih-tcod')?.textContent === sku)[n];
  const tipoDe = (sku, n) => filaDe(sku, n)?.lastElementChild.textContent.trim();
  ver('PA hojas armadas', !!cont && cont.querySelectorAll('tr.ih-obs-item-fact').length > 0, cont?.innerHTML.slice(0, 200));
  ver('PA1 historial: Tipo con el comprobante corto y el dia', tipoDe('EVO115TF') === 'PRa12345 05/11/26', tipoDe('EVO115TF'));
  ver('PA1 historial: P. unit. con el descuento aplicado y su importe', filaDe('EVO115TF')?.children[4].textContent === '$10.327,53' &&
    filaDe('EVO115TF')?.children[5].textContent === '−$20.655,06', filaDe('EVO115TF')?.textContent);
  ver('PA1 aclaracion: comprobante, dia, s/IVA y el -7% del comprobante aplicado (renglon)',
    notas.includes('Comprobante PRa000000012345 del 05/11/2026 · s/IVA $9.177,58 · con el −7 % del comprobante aplicado (renglón $11.104,87)'), JSON.stringify(notas));
  ver('PA1 aclaracion en cascada: -5% y -7% del comprobante aplicados',
    notas.includes('Comprobante FCa000000000500 del 10/09/2026 · s/IVA $50,00 · con el −5 % y −7 % del comprobante aplicados (renglón $60,50)'));
  ver('PA1 cascada: P. unit. 53,46', filaDe('CAS1')?.children[4].textContent === '$53,46');
  ver('PA1 comprobante sin descuento: aclaracion sin descuento',
    notas.includes('Comprobante PRb000000001033 del 01/10/2026 · s/IVA $150,00'));
  ver('PA1 de la app con descuento: Tipo con el pedido y aclaracion del descuento aplicado',
    tipoDe('SKU2') === 'APP-1 08/11/26' && notas.includes('Pedido APP-1 con −7 % y −5 % sobre el total aplicados (precio de la línea $95,50)') &&
    filaDe('SKU2')?.children[4].textContent === '$84,38', tipoDe('SKU2'));
  ver('PA1 ya no dice "(no aplicado)" con un servidor v40', !notas.some(t => t.includes('no aplicado') && !t.includes('12346') && !t.startsWith('Pedido APP-2')),
    JSON.stringify(notas));
  ver('PA1 de la app sin descuento: sin aclaracion', tipoDe('SKU3') === 'APP-1 08/11/26' &&
    filaDe('SKU3').nextElementSibling?.className !== 'ih-obs-nota-fact');
  ver('PA1 la aclaracion va justo debajo de su articulo', filaDe('EVO115TF').nextElementSibling?.textContent.includes('PRa000000012345'));
  ver('PA1 sin ninguna fuente: VERIFICAR PRECIO', tipoDe('NADA') === 'VERIFICAR PRECIO');
  const notasEvo = notas.filter(t => t.startsWith('Comprobante PRa000000012345')).length;
  ver('PA1 126: aclaracion solo en lo facturado (una en la 116 y una en la 126)', notasEvo === 2 &&
    tipoDe('EVO115TF', 1) === 'PRa12345 05/11/26' && tipoDe('EVO115TF', 2) === 'PRa12345 05/11/26' &&
    filaDe('EVO115TF', 2).nextElementSibling?.textContent.startsWith('Lo que correspondía'), notasEvo);
  ver('PA2 servidor anterior (sin fuente): como antes, sin aclaracion', tipoDe('VIEJO') === 'APP-3 01/11/26' &&
    filaDe('VIEJO').nextElementSibling?.className !== 'ih-obs-nota-fact');
  ver('PA5 servidor v38: el renglon y "(no aplicado)", como antes',
    notas.includes('Comprobante PRa000000012346 del 05/11/2026 · s/IVA $9.177,58 · con −7 % pago contado (no aplicado)') &&
    notas.includes('Pedido APP-2 con −7 % y −5 % sobre el total (no aplicado)') && filaDe('V38H')?.children[4].textContent === '$11.104,87', JSON.stringify(notas));
  ver('PA6 descuento parcial: aplicado y "verificar" en la aclaracion',
    notas.includes('Comprobante PRa000000066666 del 02/11/2026 · s/IVA $100,00 · con el −7 % del comprobante aplicado (renglón $121,00) · descuento parcial en el comprobante: verificar'),
    JSON.stringify(notas));
  ver('PA6 de la app con un descuento: "aplicado" en singular',
    notas.includes('Pedido APP-3 con −7 % sobre el total aplicado (precio de la línea $50,00)'), JSON.stringify(notas));
  const t7 = hojasDe('APP-27').map(h => h.querySelector('.ih-totales')).find(Boolean)?.textContent.replace(/\s+/g, ' ') || '';
  ver('PA7 totales parciales: lo confirmado ya con el descuento y el pendiente aparte', t7.includes('−$10.327,53') &&
    t7.includes('+ 1 artículo a verificar') && t7.includes('NETO PARCIAL'), t7);
  ver('PA la hoja de preparacion no lleva aclaraciones', ![...cont.querySelectorAll('.ih-obs-caja')].some(x => x.textContent.includes('Comprobante')));
  const cabFact = numero => [...cont.querySelectorAll('.ih-cab-fact, .ih-cab-cont')].filter(h => h.textContent.includes('Facturación') && h.textContent.includes('N° ' + numero)).length;
  ver('PA paginado: las aclaraciones ocupan lugar (mas hojas con aclaracion que sin)', cabFact('APP-23') > cabFact('APP-24') && cabFact('APP-24') >= 1,
    `${cabFact('APP-23')} vs ${cabFact('APP-24')}`);
  console.log(`Casos de precio anterior en la hoja: ${ok + fallas - antesP}`);
}

// =====================================================================
// TOTALES DE OBSERVACIONES CON ARTICULOS A VERIFICAR (v39): lo confirmado por
// grupo, la aclaracion de los pendientes, el neto parcial y el parcial en el
// titulo de cada observacion. Datos sinteticos.
{
  const antesT = ok + fallas;
  w.print = () => {};
  // La impresion anterior termina de armarse y pregunta si salio: se espera
  // (hasta 3 s) y se cierra con la ultima opcion ("No se imprimió nada")
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const cerrarAvisos = async () => {
    for (let k = 0; k < 60 && !$('#ih-aviso')?.hidden; k++) {
      const bs = $$('#ih-aviso button');
      if (bs.length) bs[bs.length - 1].click();
      await espera(50); await tick(10);
    }
  };
  const it = (sku, importe, extra = {}) => ({ sku, nombre: 'Art ' + sku, cantidad: 1, precio: importe === null ? null : Math.abs(importe),
    importe, origen: importe === null ? null : { tipo: 'lista' }, ...extra });
  // importe de la observacion como lo arma el servidor: null si falta algun precio
  const obsDe = (clave, efecto, items, extra = {}) => ({ clave, codigo: clave, texto: 'OBS ' + clave, grupo: 'mercaderia', efecto,
    importe: items.some(x => x.importe === null) ? null : Math.round(items.reduce((a, x) => a + x.importe, 0) * 100) / 100,
    verificar: efecto === 'ajuste' || items.some(x => x.importe === null), items, ...extra });
  const conObs = (id, numero, observaciones, extra = {}) => ped(id, numero, 1, 1, { totalBruto: 100, totalNeto: 100, observaciones, ...extra });
  const soloObs = (id, numero, observaciones) => ped(id, numero, 0, 0, { totalBruto: 0, totalNeto: 0, observaciones });

  // Primera tanda (se imprime de a 10)
  const casos = [
    // Todo confirmado en los tres grupos (la 126 con VERIFICAR PRECIOS en su titulo)
    conObs('T1', 'APP-31', [obsDe('116', 'descuenta', [it('A', -200)]), obsDe('117', 'suma', [it('B', 50)]),
      obsDe('126', 'ajuste', [it('C', -70, { lado: 'facturado' }), it('D', 100, { lado: 'correspondia' })])]),
    // El ejemplo real: una 116 con un articulo del historial y otro a verificar
    conObs('T2', 'APP-32', [obsDe('116', 'descuenta', [it('EVO115TF', -11104.87), it('NADA', null)])]),
    // Devoluciones todo a verificar
    conObs('T3', 'APP-33', [obsDe('116', 'descuenta', [it('N1', null), it('N2', null)])]),
    // Sumas parte a verificar
    conObs('T4', 'APP-34', [obsDe('117', 'suma', [it('B', 50), it('N3', null)])]),
    // Ajustes parte a verificar (lo facturado sin precio; lo que correspondia, a lista)
    conObs('T5', 'APP-35', [obsDe('126', 'ajuste', [it('N4', null, { lado: 'facturado' }), it('E', 300, { lado: 'correspondia' })])]),
    // Ajustes todo a verificar
    conObs('T6', 'APP-36', [obsDe('126', 'ajuste', [it('N5', null, { lado: 'facturado' }), it('N5', null, { lado: 'correspondia' })])]),
    // Varios grupos a la vez
    conObs('T7', 'APP-37', [obsDe('116', 'descuenta', [it('A', -100), it('N6', null)]), obsDe('117', 'suma', [it('B', 50), it('N7', null)]),
      obsDe('126', 'ajuste', [it('C', -70, { lado: 'facturado' }), it('D', 100, { lado: 'correspondia' })])]),
    // Solo observaciones: parte a verificar y todo a verificar
    soloObs('T8', 'APP-38', [obsDe('116', 'descuenta', [it('A', -100), it('N8', null)])]),
    soloObs('T9', 'APP-39', [obsDe('116', 'descuenta', [it('N9', null)])]),
    // Bonificado (precio 0): a verificar en su titulo, pero no es un articulo sin precio
    conObs('T10', 'APP-40', [obsDe('119', 'descuenta', [it('BON', 0)], { verificar: true })])
  ];
  // Segunda tanda
  const casos2 = [
    // Sin observaciones: -7% y ademas -5%, con una linea en promocion
    ped('T11', 'APP-41', 2, 2, { totalBruto: 1000, totalNeto: 883.5, descTotalPct: 7, descTotalExtraPct: 5,
      lineas: [{ orden: 1, sku: 'S1', nombre: 'Art', cantidad: 1, subtotal: 900 }, { orden: 2, sku: 'S2', nombre: 'Art', cantidad: 1, subtotal: 100, mecanismo: 'promocion' }] }),
    // De prueba, con articulos a verificar
    conObs('T12', 'PRU-5', [obsDe('116', 'descuenta', [it('A', -100), it('N10', null)])], { prueba: true }),
    // Paginado: 60 lineas, con articulos a verificar y sin
    ped('T13', 'APP-43', 60, 60, { totalBruto: 600, totalNeto: 600, observaciones: [obsDe('116', 'descuenta', [it('A', -100), it('N11', null)])] }),
    ped('T14', 'APP-44', 60, 60, { totalBruto: 600, totalNeto: 600, observaciones: [obsDe('116', 'descuenta', [it('A', -100), it('Z', -5)])] })
  ];

  let cont = null;
  const hojas = numero => [...cont.querySelectorAll('section.ih-hoja')].filter(s => s.textContent.includes('N° ' + numero));
  const caja = numero => hojas(numero).map(s => s.querySelector('.ih-totales')).find(Boolean);
  const renglon = (numero, rotulo) => [...(caja(numero)?.children || [])].find(d => d.querySelector('span')?.textContent.startsWith(rotulo));
  const imp = (numero, rotulo) => renglon(numero, rotulo)?.querySelector('b')?.textContent.trim();
  const acl = (numero, rotulo) => renglon(numero, rotulo)?.querySelector('small')?.textContent.trim() || '';
  // Rotulo e importe del neto, separados por " | "
  const neto = numero => {
    const n = caja(numero)?.querySelector('.ih-neto');
    return n ? n.querySelector('span').textContent.replace(/\s+/g, ' ').trim() + ' | ' + n.querySelector('b').textContent.trim() : '';
  };
  const titulo = (numero, clave) => [...cont.querySelectorAll('tr.ih-obs-tit-fact')].filter(tr => hojas(numero).some(s => s.contains(tr)))
    .find(tr => tr.firstElementChild.textContent.startsWith(clave + ' '));
  const titImp = (numero, clave) => titulo(numero, clave)?.children[1].textContent.trim();
  const titAlerta = (numero, clave) => titulo(numero, clave)?.children[2].textContent.trim();

  await cerrarAvisos();
  Hojas.imprimir(casos, { reimpresion: true });
  await tick(80);
  cont = document.getElementById('ih-hojas');
  ver('T hojas armadas', !!caja('APP-31'), cont?.innerHTML.slice(0, 200));
  // T1: todo confirmado, como hoy
  ver('T1 todo confirmado: los tres grupos con su importe, sin aclaracion', imp('APP-31', 'Devoluciones') === '−$200,00' &&
    imp('APP-31', 'Sumas') === '$50,00' && imp('APP-31', 'Ajustes') === '$30,00' && !caja('APP-31').textContent.includes('verificar'),
    caja('APP-31')?.textContent);
  ver('T1 NETO CON OBSERVACIONES con el total (100 - 200 + 50 + 30)', neto('APP-31') === 'NETO CON OBSERVACIONES | −$20,00', neto('APP-31'));
  ver('T1 titulos: importe de cada uno; la 126 sigue con VERIFICAR PRECIOS', titImp('APP-31', '116') === '−$200,00' && titAlerta('APP-31', '116') === '' &&
    titImp('APP-31', '126') === '$30,00' && titAlerta('APP-31', '126') === 'VERIFICAR PRECIOS');
  // T2: el ejemplo real
  ver('T2 Devoluciones: lo confirmado y "+ 1 artículo a verificar"', imp('APP-32', 'Devoluciones') === '−$11.104,87' &&
    acl('APP-32', 'Devoluciones') === '· + 1 artículo a verificar', `${imp('APP-32', 'Devoluciones')} | ${acl('APP-32', 'Devoluciones')}`);
  ver('T2 Sumas y Ajustes sin aclaracion', imp('APP-32', 'Sumas') === '—' && acl('APP-32', 'Sumas') === '' && acl('APP-32', 'Ajustes') === '');
  ver('T2 NETO PARCIAL (falta verificar 1 artículo) = 100 - 11.104,87', neto('APP-32') === 'NETO PARCIAL (falta verificar 1 artículo) | −$11.004,87', neto('APP-32'));
  ver('T2 ya no dice A VERIFICAR ni NETO CON OBSERVACIONES', !caja('APP-32').textContent.includes('A VERIFICAR') && !caja('APP-32').textContent.includes('NETO CON'));
  ver('T2 titulo de la 116: el parcial y "+ 1 A VERIFICAR"', titImp('APP-32', '116') === '−$11.104,87' && titAlerta('APP-32', '116') === '+ 1 A VERIFICAR',
    `${titImp('APP-32', '116')} | ${titAlerta('APP-32', '116')}`);
  ver('T2 la linea sin precio sigue con VERIFICAR PRECIO', hojas('APP-32').some(s => [...s.querySelectorAll('tr.ih-obs-item-fact')]
    .some(tr => tr.textContent.includes('NADA') && tr.lastElementChild.textContent.trim() === 'VERIFICAR PRECIO')));
  // T3: todo a verificar en un grupo
  ver('T3 Devoluciones todo a verificar: "—" y "+ 2 artículos a verificar"', imp('APP-33', 'Devoluciones') === '—' &&
    acl('APP-33', 'Devoluciones') === '· + 2 artículos a verificar');
  ver('T3 NETO PARCIAL con lo confirmado (los articulos: $100,00)', neto('APP-33') === 'NETO PARCIAL (falta verificar 2 artículos) | $100,00', neto('APP-33'));
  ver('T3 titulo sin nada confirmado: vacio y VERIFICAR PRECIOS', titImp('APP-33', '116') === '' && titAlerta('APP-33', '116') === 'VERIFICAR PRECIOS');
  // T4, T5, T6: sumas y ajustes
  ver('T4 Sumas parte a verificar', imp('APP-34', 'Sumas') === '$50,00' && acl('APP-34', 'Sumas') === '· + 1 artículo a verificar' &&
    titImp('APP-34', '117') === '$50,00' && titAlerta('APP-34', '117') === '+ 1 A VERIFICAR');
  ver('T5 Ajustes parte a verificar', imp('APP-35', 'Ajustes') === '$300,00' && acl('APP-35', 'Ajustes') === '· + 1 artículo a verificar' &&
    titImp('APP-35', '126') === '$300,00' && titAlerta('APP-35', '126') === '+ 1 A VERIFICAR');
  ver('T6 Ajustes todo a verificar', imp('APP-36', 'Ajustes') === '—' && acl('APP-36', 'Ajustes') === '· + 2 artículos a verificar' &&
    titAlerta('APP-36', '126') === 'VERIFICAR PRECIOS');
  // T7: varios grupos
  ver('T7 varios grupos: cada uno con lo suyo', imp('APP-37', 'Devoluciones') === '−$100,00' && acl('APP-37', 'Devoluciones').includes('1 artículo') &&
    imp('APP-37', 'Sumas') === '$50,00' && acl('APP-37', 'Sumas').includes('1 artículo') && imp('APP-37', 'Ajustes') === '$30,00' && acl('APP-37', 'Ajustes') === '');
  ver('T7 NETO PARCIAL: 100 - 100 + 50 + 30, falta verificar 2', neto('APP-37') === 'NETO PARCIAL (falta verificar 2 artículos) | $80,00', neto('APP-37'));
  // T8, T9: solo observaciones
  ver('T8 solo observaciones, parte a verificar: el recuadro y el neto parcial', caja('APP-38')?.textContent.includes('PEDIDO SOLO DE OBSERVACIONES') &&
    imp('APP-38', 'Devoluciones') === '−$100,00' && neto('APP-38') === 'NETO PARCIAL (falta verificar 1 artículo) | −$100,00', neto('APP-38'));
  ver('T9 solo observaciones, todo a verificar: A VERIFICAR con la aclaracion', imp('APP-39', 'Devoluciones') === '—' &&
    neto('APP-39') === 'NETO PARCIAL (falta verificar 1 artículo) | A VERIFICAR', neto('APP-39'));
  // T10: bonificado
  ver('T10 bonificado: no es un articulo a verificar (NETO CON OBSERVACIONES)', neto('APP-40').startsWith('NETO CON OBSERVACIONES') &&
    !caja('APP-40').textContent.includes('a verificar') && titAlerta('APP-40', '119') === 'VERIFICAR PRECIOS');
  // Reimpresion y hoja unica
  ver('T12 reimpresion: el renglon de reimpresion sigue en la preparacion', hojas('APP-32')[0]?.textContent.toLowerCase().includes('reimpres'));
  ver('T13 hoja unica: se decide igual con y sin pendientes', hojas('APP-32').length === hojas('APP-31').length);

  await cerrarAvisos();
  Hojas.imprimir(casos2, { reimpresion: true });
  await tick(80);
  cont = document.getElementById('ih-hojas');
  // T11: sin observaciones, como hoy
  const t11 = caja('APP-41')?.textContent.replace(/\s+/g, ' ');
  ver('T11 sin observaciones: bruto, promocion, descuento en cascada y TOTAL NETO', t11?.includes('Total bruto$1.000,00') &&
    t11.includes('Líneas en promoción$100,00') && t11.includes('Descuento sobre el total (7 % y además 5 %, no alcanza a las promociones)−$116,50') &&
    t11.includes('TOTAL NETO$883,50') && !t11.includes('observaciones') && !t11.includes('verificar'), t11);
  // T12: prueba
  ver('T12 de prueba: marca de agua y el mismo neto parcial', hojas('PRU-5').length > 0 && hojas('PRU-5').every(s => s.querySelector('.ih-marca-prueba')) &&
    neto('PRU-5') === 'NETO PARCIAL (falta verificar 1 artículo) | $0,00', neto('PRU-5'));
  // T13, T14: el paginado no cambia con los articulos a verificar
  const nFact = numero => [...cont.querySelectorAll('.ih-cab-fact, .ih-cab-cont')].filter(h => h.textContent.includes('Facturación') && h.textContent.includes('N° ' + numero)).length;
  ver('T13 paginado: las mismas hojas de facturacion con y sin articulos a verificar', nFact('APP-43') === nFact('APP-44') && nFact('APP-43') >= 1,
    `${nFact('APP-43')} vs ${nFact('APP-44')}`);
  console.log(`Casos de totales de observaciones: ${ok + fallas - antesT}`);
}

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
