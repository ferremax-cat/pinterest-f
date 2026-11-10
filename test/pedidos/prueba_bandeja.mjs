// PRUEBA DE LA BANDEJA DE IMPRESION (js/imprimir.js, js/imprimir-hojas.js) con
// jsdom: pedidos incompletos, impresion sin confirmar y lineas sin cabecera.
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

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
