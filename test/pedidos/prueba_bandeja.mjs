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
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
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
  $('#im-incompletos').nextElementSibling === $('#im-sinconf'));
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

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
