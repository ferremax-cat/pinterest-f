// PRUEBA DE LA ENTREGA ESPECIAL (observacion con efecto 'entrega', la 170) con
// jsdom y los modulos reales:
//   1. js/datos-catalogo.js: la lista de vendedores (funcionalidades_usuarios.json)
//      y la de clientes (clientes_nombres.json, para "despues de quien")
//      con no-cache, el desfase del reloj, 30 minutos de vigencia, y que una
//      falla no quede guardada; productos e imagenes sin cambios.
//   2. js/observaciones.js y js/hoja.js: la hoja de la entrega (dias, otra
//      fecha, vendedores, sigla de la sesion, medianoche, reloj, domingo,
//      fecha pasada) y que la 117 y la 113 sigan con su editor.
//   3. js/carrito-panel.js con el carrito real: el envio, el rechazo
//      entrega_vencida en un reintento (a corregir, sin perder el carrito),
//      el exito con la fecha guardada y los rechazos legibles.
// La consola de la app (avisos esperados, como la falla simulada de la lista)
// se guarda en vez de mostrarse: los que importan se comprueban como casos, y
// si algo falla se muestra al final. Salida limpia = todo bien.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_entrega.mjs

// Antes de cargar jsdom: sin el aviso de punycode (deprecado) que trae
process.noDeprecation = true;
const { JSDOM, prepararModulos } = await import('./preparar.mjs');

let ok = 0, fallas = 0;
const escribir = (...a) => process.stdout.write(a.join(' ') + '\n');
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; escribir('FALLA:', nombre, extra); } };
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

// Consola de la app: guardada, no mostrada
const consola = [];
for (const k of ['log', 'warn', 'error', 'info']) console[k] = (...a) => consola.push([k, a.map(x => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')]);
const avisosCon = texto => consola.filter(([k, t]) => k === 'warn' && t.includes(texto)).length;

const DateReal = Date;
const fetchReal = globalThis.fetch;

// =====================================================================
// 1. LISTAS DE VENDEDORES Y DE CLIENTES (js/datos-catalogo.js)
{
  const antes = ok + fallas;
  const llamadas = [];
  let modo = 'falla';
  let ahora = new DateReal(2026, 10, 19, 10, 0).getTime();
  const nowReal = Date.now;
  Date.now = () => ahora;
  globalThis.window = {};
  globalThis.fetch = async (url, opc) => {
    llamadas.push([String(url), opc]);
    if (modo === 'falla') throw new Error('sin red (simulada)');
    if (modo === 'mal') return { ok: true, json: async () => { throw new SyntaxError('JSON roto'); }, headers: { get: () => null } };
    if (modo === '404') return { ok: false, status: 404, json: async () => ({}), headers: { get: () => null } };
    return { ok: true, json: async () => ({ url: String(url) }),
      headers: { get: k => (k === 'Date' ? new DateReal(ahora - 5000).toUTCString() : null) } };
  };
  const m = await prepararModulos(['datos-catalogo.js'])('datos-catalogo.js');
  const de = nombre => llamadas.filter(x => x[0].includes(nombre));

  await m.productos().catch(() => {});
  ver('1 productos: fetch sin opciones (como siempre)', llamadas[0][1] === undefined);
  modo = 'ok';
  await m.productos(); await m.imagenes(); await m.productos();
  ver('1 productos: la falla no quedo guardada, reintenta y despues no vuelve a pedir', de('productos').length === 2);
  ver('1 imagenes: fetch sin opciones', de('imagenes')[0][1] === undefined);

  modo = 'falla'; await m.usuarios().catch(() => {});
  modo = 'mal'; await m.usuarios().catch(() => {});
  modo = '404'; await m.usuarios().catch(() => {});
  modo = 'ok';
  const u = await m.usuarios();
  ver('1 usuarios: falla de red, JSON roto y 404 no quedan guardados; el cuarto lee', de('usuarios').length === 4 &&
    u.datos.url.includes('funcionalidades_usuarios'), JSON.stringify(de('usuarios')));
  ver('1 usuarios: siempre con cache no-cache', de('usuarios').every(x => x[1]?.cache === 'no-cache'));
  ver('1 usuarios: desfase del reloj medido con el encabezado Date (5 s)', u.desfaseMs === 5000, u.desfaseMs);
  await m.usuarios();
  ver('1 usuarios: dentro de 30 minutos no se vuelve a pedir', de('usuarios').length === 4);
  ahora += 31 * 60 * 1000;
  await m.usuarios();
  ver('1 usuarios: pasados 30 minutos se lee de nuevo', de('usuarios').length === 5);
  await m.productos();
  ver('1 productos: no vence (sigue la primera lectura buena)', de('productos').length === 2);
  ver('1 en window.DatosCatalogo', typeof globalThis.window.DatosCatalogo?.usuarios === 'function');

  // clientes_nombres.json: el mismo patron (no-cache, 30 minutos, una falla no queda guardada)
  modo = 'falla'; await m.clientes().catch(() => {});
  modo = 'ok';
  const cl = await m.clientes();
  ver('1 clientes: la falla no quedo guardada; el segundo lee clientes_nombres.json', de('clientes_nombres').length === 2 &&
    cl.url.includes('clientes_nombres.json'), JSON.stringify(de('clientes_nombres')));
  ver('1 clientes: siempre con cache no-cache', de('clientes_nombres').every(x => x[1]?.cache === 'no-cache'));
  await m.clientes();
  ver('1 clientes: dentro de 30 minutos no se vuelve a pedir', de('clientes_nombres').length === 2);
  ahora += 31 * 60 * 1000;
  await m.clientes();
  ver('1 clientes: pasados 30 minutos se lee de nuevo', de('clientes_nombres').length === 3);
  ver('1 clientes en window.DatosCatalogo', typeof globalThis.window.DatosCatalogo?.clientes === 'function');

  Date.now = nowReal;
  globalThis.fetch = fetchReal;
  escribir(`Casos de las listas de vendedores y de clientes: ${ok + fallas - antes}`);
}

// Pagina de jsdom para las secciones 2 y 3
function pagina(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://ferremax.test/catalogo.html', pretendToBeVisual: true });
  const w = dom.window;
  for (const k of ['window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame'])
    globalThis[k] = k === 'window' ? w : w[k];
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  return w;
}
const USU = { usuarios: {
  1: { rol: 'vendedor_estandar', codigo: 'RF', nombre: 'ROBERTO' }, 2: { rol: 'vendedor_estandar', codigo: 'JG', nombre: 'JAIME' },
  3: { rol: 'vendedor_estandar', codigo: 'CS', nombre: 'CHRISTIAN' }, 4: { rol: 'admin', nombre: 'HERNAN' },
  5: { rol: 'oficina', nombre: 'OFI' }, 6: { rol: 'cliente_estandar', codigo: '', nombre: 'X' } } };

// =====================================================================
// 2. HOJA DE LA ENTREGA (js/observaciones.js, js/hoja.js)
{
  const antes = ok + fallas;
  // Reloj simulado (hora local): martes 17/11/2026 23:58
  let ahora = new DateReal(2026, 10, 17, 23, 58).getTime();
  class FechaSimulada extends DateReal {
    constructor(...a) { if (a.length) super(...a); else super(ahora); }
    static now() { return ahora; }
  }
  globalThis.Date = FechaSimulada;
  const w = pagina();
  let modoUsu = 'ok', desfase = 0, modoCli = 'ok', pedidosClientes = 0;
  // clientes_nombres.json simulado: cuenta, nombre y vendedor (nada financiero), con una
  // cuenta puente y la de prueba, que no se pueden elegir
  const CLIENTES = { clientes: {
    949: { nombre: 'FERRETERIA X', vendedor: 'RF' }, 950: { nombre: 'FERRETERÍA ÑANDÚ', vendedor: 'JG' },
    1001: { nombre: 'CORRALON SUR', vendedor: 'CS' }, 157: { nombre: 'NUEVO CLIENTE RF', vendedor: 'RF' },
    999: { nombre: 'MS LIBERTAD FERRETERIA', vendedor: 'RF' } } };
  w.DatosCatalogo = { imagenes: async () => ({ images: {} }), productos: async () => ({}),
    usuarios: async () => {
      if (modoUsu === 'falla') throw new Error('sin red (simulada)');
      return { datos: modoUsu === 'vacia' ? { usuarios: {} } : USU, desfaseMs: desfase };
    },
    clientes: async () => {
      pedidosClientes++;
      if (modoCli === 'falla') throw new Error('sin red (simulada)');
      return JSON.parse(JSON.stringify(CLIENTES));
    } };
  // Ninguna consulta al servidor en la hoja (tampoco de finanzas)
  let llamadasApi = 0;
  w.Api = { llamar: async () => { llamadasApi++; return { ok: true }; } };
  w.Carrito = { precioAjustado: () => ({ precioBase: 100, precio: 100, precioAplicado: 100, descEfectivo: 0 }) };
  w.Precios = { getClienteVista: () => ({ lista: 'D' }) };
  w.productManager = { getProduct: () => ({}) };

  const Obs = await prepararModulos(['observaciones.js', 'hoja.js'])('observaciones.js');
  const DEFS = [
    { clave: '113', codigo: '113', texto: 'MERCADERIA EN MAL ESTADO', grupo: 'mercaderia', efecto: 'informativa' },
    { clave: '117', codigo: '117', texto: 'MERCADERIA ENTREGADA', grupo: 'mercaderia', efecto: 'suma' },
    { clave: '170', codigo: '170', texto: 'ENTREGA ESPECIAL', grupo: 'condiciones', efecto: 'entrega' }];
  const CONFIG = { catalogoObservaciones: DEFS };
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const clic = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const marcadas = () => $$('.ob-ent-vend.ob-ent-sel').map(b => b.dataset.quien).join();
  const abrirNueva = async (config = CONFIG) => {
    const res = {};
    Obs.abrirSelector(config, { actuales: [], alAgregar: o => { res.o = o; }, alGuardarExistente: () => {} });
    clic($('.ob-opcion[data-clave="170"]')); await tick();
    return res;
  };
  const elegirFecha = iso => {
    const inp = $('.ob-ent-fecha');
    inp.value = iso;
    inp.dispatchEvent(new w.Event('change', { bubbles: true }));
  };

  // Funciones puras
  ver('2 proximoDia: hoy incluido (martes -> ma = hoy)', Obs.proximoDia('ma', '2026-11-17') === '2026-11-17');
  ver('2 proximoDia: un jueves, lu es el lunes siguiente', Obs.proximoDia('lu', '2026-11-19') === '2026-11-23');
  ver('2 proximoDia: un domingo, todos de la semana siguiente', Obs.proximoDia('lu', '2026-11-22') === '2026-11-23' &&
    Obs.proximoDia('sa', '2026-11-22') === '2026-11-28');
  ver('2 vendedores: solo vendedor_estandar con sigla, por sigla', Obs.vendedores(USU).map(v => v.codigo).join() === 'CS,JG,RF');
  ver('2 vendedores: uno nuevo en el JSON aparece solo', Obs.vendedores({ usuarios: { ...USU.usuarios,
    9: { rol: 'vendedor_estandar', codigo: 'ab', nombre: 'NUEVO' } } }).map(v => v.codigo).join() === 'AB,CS,JG,RF');
  ver('2 fmtEntregaCorta: ju 19/11 · RF', Obs.fmtEntregaCorta({ fecha: '2026-11-19', quien: 'RF' }) === 'ju 19/11 · RF');
  ver('2 fmtEntregaLarga: jueves 19 de noviembre de 2026', Obs.fmtEntregaLarga('2026-11-19') === 'jueves 19 de noviembre de 2026');

  // Sin fila de efecto entrega: el selector no la ofrece
  Obs.abrirSelector({ catalogoObservaciones: DEFS.slice(0, 2) }, { actuales: [], alAgregar: () => {}, alGuardarExistente: () => {} });
  ver('2 sin fila de entrega: no se ofrece', !$('.ob-opcion[data-clave="170"]') && !!$('.ob-opcion[data-clave="113"]'));

  // Vendedor RF: preseleccionado; dias con su fecha; medianoche
  sessionStorage.setItem('authCodigo', 'RF');
  Obs.abrirSelector(CONFIG, { actuales: [], alAgregar: () => {}, alGuardarExistente: () => {} });
  ver('2 selector: la 170 con su efecto', /Día y quién entrega/.test($('.ob-opcion[data-clave="170"]')?.textContent || ''));
  let r = await abrirNueva();
  ver('2 vendedores RF JG CS por sigla, sin admin, oficina ni clientes', $$('.ob-ent-vend').map(b => b.dataset.quien).join() === 'CS,JG,RF');
  ver('2 la sigla de la sesion (RF) preseleccionada', marcadas() === 'RF');
  ver('2 seis dias lu a sa, sin domingo', $$('.ob-ent-dia').map(b => b.dataset.dia).join() === 'lu,ma,mi,ju,vi,sa');
  ver('2 dia grande y fecha chica: ma = hoy 17/11, lu = 23/11', $('.ob-ent-dia[data-dia="ma"] .ob-ent-nom').textContent === 'ma' &&
    $('.ob-ent-dia[data-dia="ma"] .ob-ent-chico').textContent === '17/11' && $('.ob-ent-dia[data-dia="lu"] .ob-ent-chico').textContent === '23/11');
  clic($('.ob-ent-dia[data-dia="ma"]'));
  ver('2 confirmacion con la fecha completa y el nombre', $('.ob-ent-resumen').textContent.includes('martes 17 de noviembre de 2026 · RF (Roberto)'),
    $('.ob-ent-resumen').textContent);
  ahora = new DateReal(2026, 10, 18, 0, 5).getTime();   // miercoles 00:05, con la hoja abierta
  clic($('.ob-guardar'));
  ver('2 medianoche: no guarda y avisa la fecha nueva', !r.o && /Cambió el día/.test($('.ob-ent-aviso')?.textContent || '') &&
    /martes 24 de noviembre/.test($('.ob-ent-aviso').textContent), $('.ob-ent-aviso')?.textContent);
  ver('2 medianoche: botones repintados (ma 24/11, mi 18/11)', $('.ob-ent-dia[data-dia="ma"]').textContent.includes('24/11') &&
    $('.ob-ent-dia[data-dia="mi"]').textContent.includes('18/11'));
  clic($('.ob-guardar'));
  ver('2 medianoche: el segundo Guardar guarda el martes 24', r.o?.entrega?.fecha === '2026-11-24' && r.o.entrega.dia === 'ma' &&
    r.o.entrega.quien === 'RF', JSON.stringify(r.o));
  ver('2 htmlLista: ma 24/11 · RF', Obs.htmlLista(CONFIG, [r.o]).includes('ma 24/11 · RF'));
  // Mismo dia de la semana despues de medianoche: si la fecha no cambia, guarda sin avisar
  ahora = new DateReal(2026, 10, 18, 23, 59).getTime();
  r = await abrirNueva();
  clic($('.ob-ent-dia[data-dia="ju"]'));
  ahora = new DateReal(2026, 10, 19, 0, 1).getTime();
  clic($('.ob-guardar'));
  ver('2 medianoche sin cambio de fecha (ju): guarda sin avisar', r.o?.entrega?.fecha === '2026-11-19' && !$('.ob-ent-aviso'));
  ahora = new DateReal(2026, 10, 18, 10, 0).getTime();   // miercoles 18/11 10:00 para lo que sigue

  // Admin sin sigla: nada marcado; sigla fuera de la lista: nada
  sessionStorage.setItem('authCodigo', '');
  r = await abrirNueva();
  ver('2 admin (sin sigla): ninguna marcada', marcadas() === '');
  clic($('.ob-ent-dia[data-dia="vi"]')); clic($('.ob-guardar'));
  ver('2 admin: no guarda sin quien entrega', !r.o && /Falta quién entrega/.test($('.ob-error')?.textContent || ''));
  clic($('.ob-ent-vend[data-quien="JG"]')); clic($('.ob-guardar'));
  ver('2 admin elige JG y guarda el viernes 20', r.o?.entrega?.quien === 'JG' && r.o.entrega.fecha === '2026-11-20', JSON.stringify(r.o));
  sessionStorage.setItem('authCodigo', 'ZZ');
  await abrirNueva();
  ver('2 sigla que no esta en la lista: ninguna marcada', marcadas() === '');

  // Falla de la lista (aviso de consola esperado y comprobado), reintento, lista vacia
  sessionStorage.setItem('authCodigo', 'CS');
  modoUsu = 'falla';
  const avisosAntes = avisosCon('No se pudo leer la lista de vendedores');
  r = await abrirNueva();
  ver('2 falla: aviso, Reintentar y sin vendedores', !!$('.ob-ent-reintentar') && !$$('.ob-ent-vend').length);
  ver('2 falla: queda registrada en la consola', avisosCon('No se pudo leer la lista de vendedores') === avisosAntes + 1);
  clic($('.ob-ent-dia[data-dia="lu"]')); clic($('.ob-guardar'));
  ver('2 falla: no guarda (falta quien entrega)', !r.o && /Falta quién entrega/.test($('.ob-error')?.textContent || ''));
  modoUsu = 'ok';
  clic($('.ob-ent-reintentar')); await tick();
  ver('2 reintento: llega la lista, CS marcado y el dia elegido se conserva', marcadas() === 'CS' &&
    $('.ob-ent-dia[data-dia="lu"]').classList.contains('ob-ent-sel'));
  modoUsu = 'vacia';
  await abrirNueva();
  ver('2 lista vacia: el mismo aviso con Reintentar', !!$('.ob-ent-reintentar') && !$$('.ob-ent-vend').length);
  modoUsu = 'ok';

  // Otra fecha, domingo, mas de 180 dias
  r = await abrirNueva();
  clic($('.ob-ent-otra'));
  ver('2 otra fecha: calendario de hoy a hoy + 180', $('.ob-ent-fecha')?.min === '2026-11-18' && $('.ob-ent-fecha')?.max === '2027-05-17',
    `${$('.ob-ent-fecha')?.min} ${$('.ob-ent-fecha')?.max}`);
  elegirFecha('2026-11-22'); clic($('.ob-guardar'));
  ver('2 domingo: no guarda', !r.o && /domingos no hay entrega/.test($('.ob-error')?.textContent || ''));
  elegirFecha('2027-06-01'); clic($('.ob-guardar'));
  ver('2 mas de 180 dias: no guarda', !r.o && /más de 180 días/.test($('.ob-error')?.textContent || ''));
  elegirFecha('2026-12-10'); clic($('.ob-guardar'));
  ver('2 otra fecha: guarda con dia vacio', r.o?.entrega?.fecha === '2026-12-10' && r.o.entrega.dia === '', JSON.stringify(r.o));

  // Aviso del reloj
  desfase = 13 * 3600 * 1000;
  await abrirNueva();
  ver('2 reloj corrido 13 h: aviso con la fecha del servidor', /parece estar mal/.test($('.ob-ent-reloj')?.textContent || ''));
  desfase = 3600 * 1000;
  await abrirNueva();
  ver('2 reloj corrido 1 h: sin aviso', !$('.ob-ent-reloj'));
  desfase = 0;

  // Una ya cargada: respeta su sigla; elegirla de nuevo edita la misma
  sessionStorage.setItem('authCodigo', 'RF');
  let guardada = null;
  Obs.abrirEditor(CONFIG, { id: 'x', clave: '170', items: [], entrega: { fecha: '2026-11-20', dia: 'vi', quien: 'JG' } },
    { alGuardar: o => { guardada = o; }, alQuitar: () => {} });
  await tick();
  ver('2 ya cargada: JG sigue marcada (no la de la sesion) y hay Quitar', marcadas() === 'JG' && !!$('.ob-quitar'));
  clic($('.ob-guardar'));
  ver('2 ya cargada: guarda igual', guardada?.entrega?.quien === 'JG');
  let otraVez = null, agregada = null;
  Obs.abrirSelector(CONFIG, { actuales: [{ id: 'x', clave: '170', items: [], entrega: { fecha: '2026-11-20', dia: 'vi', quien: 'JG' } }],
    alAgregar: o => { agregada = o; }, alGuardarExistente: o => { otraVez = o; } });
  clic($('.ob-opcion[data-clave="170"]')); await tick(); clic($('.ob-guardar'));
  ver('2 una por pedido: elegirla de nuevo edita la misma', otraVez?.id === 'x' && !agregada);

  // falta(): carrito viejo (fecha pasada), sin datos
  ver('2 falta: fecha pasada', /ya pasó/.test(Obs.falta(DEFS[2], { items: [], entrega: { fecha: '2026-11-17', dia: '', quien: 'RF' } })));
  ver('2 falta: sin entrega', Obs.falta(DEFS[2], { items: [] }) === 'falta el día');
  ver('2 htmlLista: lo que falta, marcado', /falta el día/.test(Obs.htmlLista(CONFIG, [{ id: 'y', clave: '170', items: [], entrega: { fecha: '', dia: '', quien: 'RF' } }])));

  // La 117 y la 113 siguen con su editor
  Obs.abrirEditor(CONFIG, { id: 'a', clave: '117', items: [{ sku: 'P1', nombre: 'Art', cantidad: 2, lado: '', mecanismo: 'lista_cliente', descuento: 0, descuentoExtra: 0 }] },
    { alGuardar: () => {}, alQuitar: () => {} });
  ver('2 la 117: cantidad, lista, descuento y buscador; nada de la entrega', !!$('.ob-cant') && !!$('.ob-lista') && !!$('.ob-desc') &&
    !!$('.ob-art-buscar') && !$('.ob-ent-dias'));
  Obs.abrirSelector(CONFIG, { actuales: [], alAgregar: () => {}, alGuardarExistente: () => {} });
  clic($('.ob-opcion[data-clave="113"]'));
  ver('2 la 113: carga de articulos', !!$('.ob-art-buscar') && /cantidad obligatoria/.test($('.ob-nota').textContent) && !$('.ob-ent-dias'));
  ver('2 la 113 sin articulos: falta igual que antes', Obs.falta(DEFS[0], { items: [] }) === 'faltan artículos');

  // ----- Repartidores de config y "despues de quien" (v43) -----
  const CFG = { repartidores: ['RF', 'CS', 'JG', 'IS'], repartidoresRecorrido: ['IS'], cuentasNoElegibles: ['157', '158', '159', '999'] };
  const ctxAlta = Obs.contextoEntrega(CFG, true);
  const ctxCliente = Obs.contextoEntrega(CFG, false);
  const abrirCon = async ctx => {
    const res = {};
    Obs.abrirSelector(CONFIG, { actuales: [], alAgregar: o => { res.o = o; }, alGuardarExistente: () => {}, ctx });
    clic($('.ob-opcion[data-clave="170"]')); await tick();
    return res;
  };
  const escribirEn = async (texto) => {
    const inp = $('.ob-ent-cli-buscar');
    inp.value = texto;
    inp.dispatchEvent(new w.Event('input', { bubbles: true }));
    await tick();
  };
  const resultados = () => $$('.ob-ent-cli').map(b => b.dataset.cuenta).join();

  // Contexto
  const vacio = Obs.contextoEntrega({}, true);
  ver('3x contexto de una config sin las claves: listas vacias', vacio.esAlta === true && !vacio.repartidores.length &&
    !vacio.recorrido.length && !vacio.noElegibles.length);
  ver('3x falta sin contexto: no pide "despues de quien" (como antes)',
    Obs.faltaEntrega({ fecha: '2026-11-20', dia: 'vi', quien: 'IS' }, '2026-11-18') === '');
  ver('3x falta con alta + IS: pide "despues de quien"',
    Obs.faltaEntrega({ fecha: '2026-11-20', dia: 'vi', quien: 'IS' }, '2026-11-18', ctxAlta) === 'falta después de quién');
  ver('3x falta con cliente existente + IS: no lo pide',
    Obs.faltaEntrega({ fecha: '2026-11-20', dia: 'vi', quien: 'IS' }, '2026-11-18', ctxCliente) === '');
  ver('3x fmtEntregaCorta con "despues de"', Obs.fmtEntregaCorta({ fecha: '2026-11-20', quien: 'IS', despuesDe: { cuenta: '949', nombre: 'X' } }) ===
    'vi 20/11 · IS · después de 949');

  // La lista sale de la config, en su orden; IS sin nombre (no es usuario); preseleccion de la sesion
  sessionStorage.setItem('authCodigo', 'RF');
  let r2 = await abrirCon(ctxAlta);
  ver('3x quien entrega: la lista de la config, en el orden de la celda', $$('.ob-ent-vend').map(b => b.dataset.quien).join() === 'RF,CS,JG,IS');
  ver('3x nombres del JSON de usuarios; IS solo la sigla', $('.ob-ent-vend[data-quien="RF"] .ob-ent-chico').textContent === 'Roberto' &&
    $('.ob-ent-vend[data-quien="IS"] .ob-ent-chico').textContent === '');
  ver('3x la sigla de la sesion preseleccionada (RF)', marcadas() === 'RF');
  ver('3x con RF no aparece "despues de quien"', !/Después de quién/.test(document.querySelector('.hj-cuerpo').textContent) &&
    !$('.ob-ent-cli-buscar'));
  ver('3x sin "despues de" no se pidio la lista de clientes', pedidosClientes === 0);

  // Con IS en un alta: el cuadro, el buscador y la lista sin puentes ni prueba
  clic($('.ob-ent-dia[data-dia="vi"]'));
  clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  ver('3x alta + IS: aparece "Despues de quien:" con el buscador', /Después de quién:/.test(document.querySelector('.hj-cuerpo').textContent) &&
    !!$('.ob-ent-cli-buscar'));
  await escribirEn('ferre');
  ver('3x buscar "ferre": los dos clientes por nombre, sin la cuenta de prueba (999)', resultados() === '950,949', resultados());
  ver('3x sin acentos: "nandu" encuentra FERRETERÍA ÑANDÚ', (await escribirEn('nandu'), resultados()) === '950');
  ver('3x por cuenta: "94" encuentra 949', (await escribirEn('94'), resultados()) === '949');
  ver('3x la cuenta puente (157) no se puede elegir', (await escribirEn('157'), resultados()) === '' && /Ningún cliente coincide/.test($('.ob-ent-cli-res').textContent));
  await escribirEn('corralon');
  ver('3x cada resultado: solo cuenta y nombre (ni la sigla del vendedor)', $('.ob-ent-cli').textContent.replace(/\s+/g, ' ').trim() === '1001 CORRALON SUR');
  clic($('.ob-guardar'));
  ver('3x sin elegir cliente no guarda: falta despues de quien', !r2.o && /Falta después de quién/.test($('.ob-error')?.textContent || ''));
  await escribirEn('ferre');
  clic($('.ob-ent-cli[data-cuenta="949"]'));
  ver('3x elegido: "949 · FERRETERIA X" con Cambiar', $('.ob-ent-elegido')?.textContent.replace(/\s+/g, ' ').includes('949 · FERRETERIA X') &&
    !!$('.ob-ent-cambiar'));
  ver('3x confirmacion con todo junto', $('.ob-ent-resumen').textContent.replace(/\s+/g, ' ').trim() ===
    'Entrega el viernes 20 de noviembre de 2026 · IS · después de 949 FERRETERIA X', $('.ob-ent-resumen').textContent);
  clic($('.ob-guardar'));
  ver('3x guarda con despuesDe { cuenta, nombre }', JSON.stringify(r2.o?.entrega) ===
    JSON.stringify({ fecha: '2026-11-20', dia: 'vi', quien: 'IS', despuesDe: { cuenta: '949', nombre: 'FERRETERIA X' } }), JSON.stringify(r2.o?.entrega));
  ver('3x ninguna consulta al servidor en toda la hoja', llamadasApi === 0);

  // Cambiar, Enter, y pasar a RF borra el dato
  let g2 = null;
  Obs.abrirEditor(CONFIG, r2.o, { alGuardar: o => { g2 = o; }, alQuitar: () => {}, ctx: ctxAlta });
  await tick();
  ver('3x reabierta: el elegido a la vista', $('.ob-ent-elegido')?.textContent.includes('949'));
  clic($('.ob-ent-cambiar')); await tick();
  ver('3x Cambiar: vuelve el buscador, con el cursor', !!$('.ob-ent-cli-buscar') && document.activeElement === $('.ob-ent-cli-buscar'));
  await escribirEn('corr');
  $('.ob-ent-cli-buscar').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ver('3x Enter elige el primero', $('.ob-ent-elegido')?.textContent.includes('1001'));
  clic($('.ob-ent-vend[data-quien="RF"]'));
  ver('3x pasar a RF: desaparece el cuadro', !$('.ob-ent-elegido') && !$('.ob-ent-cli-buscar'));
  clic($('.ob-guardar'));
  ver('3x con RF se guarda sin despuesDe (la entrega igual que antes)', JSON.stringify(g2?.entrega) ===
    JSON.stringify({ fecha: '2026-11-20', dia: 'vi', quien: 'RF' }), JSON.stringify(g2?.entrega));

  // Cliente existente + IS: nunca aparece
  r2 = await abrirCon(ctxCliente);
  clic($('.ob-ent-dia[data-dia="vi"]')); clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  ver('3x cliente existente + IS: no aparece el cuadro', !/Después de quién/.test(document.querySelector('.hj-cuerpo').textContent));
  clic($('.ob-guardar'));
  ver('3x cliente existente + IS: guarda sin despuesDe', JSON.stringify(r2.o?.entrega) === JSON.stringify({ fecha: '2026-11-20', dia: 'vi', quien: 'IS' }));

  // Falla la lista de clientes: Reintentar y no guarda
  modoCli = 'falla';
  r2 = await abrirCon(ctxAlta);
  clic($('.ob-ent-dia[data-dia="vi"]')); clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  ver('3x falla la lista de clientes: aviso y Reintentar', /No se pudo leer la lista de clientes/.test(document.querySelector('.hj-cuerpo').textContent) &&
    !!$('.ob-ent-cli-reintentar'));
  clic($('.ob-guardar'));
  ver('3x falla la lista de clientes: no guarda', !r2.o);
  modoCli = 'ok';
  clic($('.ob-ent-cli-reintentar')); await tick();
  ver('3x reintento: aparece el buscador', !!$('.ob-ent-cli-buscar'));

  // Falla el JSON de usuarios con la lista de la config: la lista igual esta
  modoUsu = 'falla';
  await abrirCon(ctxAlta);
  ver('3x falla el JSON de usuarios: la lista de la config igual, sin Reintentar', $$('.ob-ent-vend').map(b => b.dataset.quien).join() === 'RF,CS,JG,IS' &&
    !$('.ob-ent-reintentar') && marcadas() === 'RF');
  modoUsu = 'ok';

  // htmlLista con contexto: marca lo que falta
  ver('3x htmlLista: alta + IS sin "despues de" queda marcada', /falta después de quién/.test(Obs.htmlLista(CONFIG,
    [{ id: 'z', clave: '170', items: [], entrega: { fecha: '2026-11-20', dia: 'vi', quien: 'IS' } }], null, ctxAlta)));
  ver('3x htmlLista sin contexto: igual que antes', !/falta/.test(Obs.htmlLista(CONFIG,
    [{ id: 'z', clave: '170', items: [], entrega: { fecha: '2026-11-20', dia: 'vi', quien: 'IS' } }])));

  // ----- Viaje 1 o 2 en los dias de dos viajes (v44) -----
  // Hoy: miercoles 18/11/2026. lu = 23/11, ma = 24/11, ju = 19/11; 30/11 es lunes y 01/12 martes
  const CFGV = { ...CFG, diasDosViajes: ['lu', 'ju', 'sa'] };
  const ctxVCli = Obs.contextoEntrega(CFGV, false);
  const ctxVAlta = Obs.contextoEntrega(CFGV, true);
  const hayViaje = () => !!$('.ob-ent-viaje');
  const viajeMarcado = () => $$('.ob-ent-viaje.ob-ent-sel').map(b => b.dataset.viaje).join();
  const textoHoja = () => document.querySelector('.hj-cuerpo').textContent.replace(/\s+/g, ' ');

  // Funciones puras
  ver('4v contexto: los dias de dos viajes de la config', JSON.stringify(ctxVCli.diasDosViajes) === '["lu","ju","sa"]');
  ver('4v contexto sin la clave: lista vacia', JSON.stringify(Obs.contextoEntrega(CFG, false).diasDosViajes) === '[]');
  ver('4v pideViaje: lunes + IS, tambien a un cliente existente', Obs.pideViaje({ fecha: '2026-11-23', quien: 'IS' }, ctxVCli) &&
    Obs.pideViaje({ fecha: '2026-11-23', quien: 'IS' }, ctxVAlta));
  ver('4v pideViaje: por la fecha, aunque no haya boton (otra fecha 30/11, lunes)', Obs.pideViaje({ fecha: '2026-11-30', dia: '', quien: 'IS' }, ctxVCli));
  ver('4v pideViaje: martes, RF, sin dias o sin contexto: no', !Obs.pideViaje({ fecha: '2026-11-24', quien: 'IS' }, ctxVCli) &&
    !Obs.pideViaje({ fecha: '2026-11-23', quien: 'RF' }, ctxVCli) && !Obs.pideViaje({ fecha: '2026-11-23', quien: 'IS' }, ctxCliente) &&
    !Obs.pideViaje({ fecha: '2026-11-23', quien: 'IS' }, null));
  ver('4v falta: lunes + IS sin viaje', Obs.faltaEntrega({ fecha: '2026-11-23', dia: 'lu', quien: 'IS' }, '2026-11-18', ctxVCli) === 'falta el viaje (1 o 2)');
  ver('4v falta: con viaje, nada', Obs.faltaEntrega({ fecha: '2026-11-23', dia: 'lu', quien: 'IS', viaje: 2 }, '2026-11-18', ctxVCli) === '');
  ver('4v falta: alta lunes + IS con viaje y sin "despues de": falta despues de quien',
    Obs.faltaEntrega({ fecha: '2026-11-23', dia: 'lu', quien: 'IS', viaje: 1 }, '2026-11-18', ctxVAlta) === 'falta después de quién');
  ver('4v fmtEntregaCorta con viaje y "despues de"', Obs.fmtEntregaCorta({ fecha: '2026-11-23', quien: 'IS', viaje: 1,
    despuesDe: { cuenta: '949', nombre: 'X' } }) === 'lu 23/11 · IS · V1 · después de 949');
  ver('4v htmlLista: lunes + IS sin viaje queda marcada', /falta el viaje/.test(Obs.htmlLista(CONFIG,
    [{ id: 'v', clave: '170', items: [], entrega: { fecha: '2026-11-23', dia: 'lu', quien: 'IS' } }], null, ctxVCli)));

  // La hoja: cliente existente, lunes + IS
  sessionStorage.setItem('authCodigo', 'RF');
  let rv = await abrirCon(ctxVCli);
  clic($('.ob-ent-dia[data-dia="lu"]'));
  ver('4v lunes + RF: no aparece el viaje', !hayViaje());
  clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  ver('4v lunes + IS: aparece el viaje, con el dia en la nota y ninguno marcado', hayViaje() &&
    $$('.ob-ent-viaje').map(b => b.dataset.viaje).join() === '1,2' && viajeMarcado() === '' &&
    /El lunes 23\/11 el reparto sale en dos viajes/.test(textoHoja()), textoHoja());
  ver('4v cliente existente: sin "despues de quien"', !/Después de quién/.test(textoHoja()));
  clic($('.ob-guardar'));
  ver('4v sin viaje no guarda', !rv.o && /Falta el viaje/.test($('.ob-error')?.textContent || ''), $('.ob-error')?.textContent);
  clic($('.ob-ent-viaje[data-viaje="1"]'));
  ver('4v viaje 1 marcado y en el resumen', viajeMarcado() === '1' &&
    $('.ob-ent-resumen').textContent.replace(/\s+/g, ' ').trim() === 'Entrega el lunes 23 de noviembre de 2026 · IS · viaje 1',
    $('.ob-ent-resumen').textContent);
  clic($('.ob-guardar'));
  ver('4v guarda viaje: 1 (numero)', JSON.stringify(rv.o?.entrega) === JSON.stringify({ fecha: '2026-11-23', dia: 'lu', quien: 'IS', viaje: 1 }),
    JSON.stringify(rv.o?.entrega));

  // Cuando se borra: martes, otra sigla, y cada vez que cambia la fecha (cada dia se divide distinto)
  let gv = null;
  const reabrir = async ent => {
    gv = null;
    Obs.abrirEditor(CONFIG, { id: 'v', clave: '170', items: [], entrega: { ...ent } },
      { alGuardar: o => { gv = o; }, alQuitar: () => {}, ctx: ctxVCli });
    await tick();
  };
  await reabrir({ fecha: '2026-11-23', dia: 'lu', quien: 'IS', viaje: 1 });
  ver('4v reabierta: el viaje marcado', viajeMarcado() === '1');
  clic($('.ob-ent-dia[data-dia="ma"]'));
  ver('4v lunes -> martes: desaparece el viaje', !hayViaje());
  clic($('.ob-guardar'));
  ver('4v martes: se guarda sin viaje', JSON.stringify(gv?.entrega) === JSON.stringify({ fecha: '2026-11-24', dia: 'ma', quien: 'IS' }),
    JSON.stringify(gv?.entrega));
  await reabrir({ fecha: '2026-11-23', dia: 'lu', quien: 'IS', viaje: 2 });
  clic($('.ob-ent-dia[data-dia="ju"]'));
  ver('4v lunes -> jueves: el viaje sigue pidiendose pero se borra (otra division)', hayViaje() && viajeMarcado() === '' &&
    /El jueves 19\/11/.test(textoHoja()));
  clic($('.ob-guardar'));
  ver('4v lunes -> jueves: no guarda sin elegirlo de nuevo', !gv && /Falta el viaje/.test($('.ob-error')?.textContent || ''));
  await reabrir({ fecha: '2026-11-23', dia: 'lu', quien: 'IS', viaje: 2 });
  clic($('.ob-ent-dia[data-dia="lu"]'));
  ver('4v tocar el mismo dia (misma fecha): el viaje se conserva', viajeMarcado() === '2');
  clic($('.ob-ent-vend[data-quien="RF"]'));
  ver('4v IS -> RF: desaparece el viaje', !hayViaje());
  clic($('.ob-ent-vend[data-quien="IS"]'));
  ver('4v RF -> IS: vuelve el viaje, sin marcar (se borro)', hayViaje() && viajeMarcado() === '');

  // Otra fecha: se mira la fecha, no el boton
  rv = await abrirCon(ctxVCli);
  clic($('.ob-ent-vend[data-quien="IS"]'));
  clic($('.ob-ent-otra'));
  elegirFecha('2026-12-01');
  ver('4v otra fecha martes 01/12: no aparece el viaje', !hayViaje());
  elegirFecha('2026-11-30');
  ver('4v otra fecha lunes 30/11: aparece el viaje, con el dia en la nota', hayViaje() && /El lunes 30\/11/.test(textoHoja()), textoHoja());
  clic($('.ob-guardar'));
  ver('4v otra fecha lunes sin viaje: no guarda', !rv.o && /Falta el viaje/.test($('.ob-error')?.textContent || ''));
  clic($('.ob-ent-viaje[data-viaje="2"]'));
  elegirFecha('2026-12-07');
  ver('4v otra fecha: cambiar a otro lunes (07/12) tambien borra el viaje', hayViaje() && viajeMarcado() === '');
  clic($('.ob-ent-viaje[data-viaje="2"]'));
  clic($('.ob-guardar'));
  ver('4v otra fecha lunes con viaje 2: guarda con dia vacio', JSON.stringify(rv.o?.entrega) ===
    JSON.stringify({ fecha: '2026-12-07', dia: '', quien: 'IS', viaje: 2 }), JSON.stringify(rv.o?.entrega));

  // Sin la fila de config: nunca aparece
  rv = await abrirCon(ctxCliente);
  clic($('.ob-ent-dia[data-dia="lu"]')); clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  ver('4v sin diasDosViajes: lunes + IS no pide viaje', !hayViaje());
  clic($('.ob-guardar'));
  ver('4v sin diasDosViajes: guarda como antes', JSON.stringify(rv.o?.entrega) === JSON.stringify({ fecha: '2026-11-23', dia: 'lu', quien: 'IS' }));

  // Cliente nuevo, lunes + IS: los dos cuadros, viaje primero
  rv = await abrirCon(ctxVAlta);
  clic($('.ob-ent-dia[data-dia="lu"]')); clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  const t = textoHoja();
  ver('4v alta lunes + IS: Viaje y despues "Despues de quien"', hayViaje() && t.indexOf('Viaje') >= 0 &&
    t.indexOf('Viaje') < t.indexOf('Después de quién:'), t);
  clic($('.ob-ent-viaje[data-viaje="2"]'));
  await escribirEn('ferre');
  clic($('.ob-ent-cli[data-cuenta="949"]'));
  ver('4v alta: el resumen con las dos cosas', $('.ob-ent-resumen').textContent.replace(/\s+/g, ' ').trim() ===
    'Entrega el lunes 23 de noviembre de 2026 · IS · viaje 2 · después de 949 FERRETERIA X', $('.ob-ent-resumen').textContent);
  ver('4v alta: elegir el cliente no borra el viaje', viajeMarcado() === '2');
  clic($('.ob-guardar'));
  ver('4v alta: guarda viaje y despuesDe', JSON.stringify(rv.o?.entrega) === JSON.stringify({ fecha: '2026-11-23', dia: 'lu', quien: 'IS',
    viaje: 2, despuesDe: { cuenta: '949', nombre: 'FERRETERIA X' } }), JSON.stringify(rv.o?.entrega));

  // Medianoche con la hoja abierta: el dia recalculado sigue siendo lunes, el viaje se conserva
  ahora = new DateReal(2026, 10, 23, 23, 58).getTime();   // lunes 23/11 23:58
  rv = await abrirCon(ctxVCli);
  clic($('.ob-ent-dia[data-dia="lu"]')); clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  clic($('.ob-ent-viaje[data-viaje="1"]'));
  ahora = new DateReal(2026, 10, 24, 0, 2).getTime();
  clic($('.ob-guardar'));
  ver('4v medianoche: avisa el lunes nuevo y el viaje sigue marcado', !rv.o && /lunes 30 de noviembre/.test($('.ob-ent-aviso')?.textContent || '') &&
    viajeMarcado() === '1', $('.ob-ent-aviso')?.textContent);
  clic($('.ob-guardar'));
  ver('4v medianoche: el segundo Guardar guarda el lunes 30 con viaje 1', JSON.stringify(rv.o?.entrega) ===
    JSON.stringify({ fecha: '2026-11-30', dia: 'lu', quien: 'IS', viaje: 1 }), JSON.stringify(rv.o?.entrega));
  ahora = new DateReal(2026, 10, 18, 10, 0).getTime();

  // Celular: el buscador de clientes sube al enfocarlo, igual que el de articulos de la 117
  const subidas = [];
  const scrollReal = w.HTMLElement.prototype.scrollIntoView;
  w.HTMLElement.prototype.scrollIntoView = function () { subidas.push(this.className); };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });   // angosto
  const enfocar = async sel => { $(sel).focus(); await new Promise(rr => setTimeout(rr, 350)); };   // focus() dispara focusin
  await abrirCon(ctxAlta);
  clic($('.ob-ent-dia[data-dia="vi"]')); clic($('.ob-ent-vend[data-quien="IS"]')); await tick();
  await enfocar('.ob-ent-cli-buscar');
  Obs.abrirEditor(CONFIG, { id: 'a', clave: '117', items: [] }, { alGuardar: () => {}, alQuitar: () => {} });
  await enfocar('.ob-art-buscar');
  ver('3x celular: el buscador de clientes y el de articulos suben igual', subidas.length === 2 &&
    subidas[0].includes('ob-ent-cli-buscar') && subidas[1].includes('ob-art-buscar'), JSON.stringify(subidas));
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.HTMLElement.prototype.scrollIntoView = scrollReal;

  globalThis.Date = DateReal;
  escribir(`Casos de la hoja de la entrega: ${ok + fallas - antes}`);
}

// =====================================================================
// 3. PANEL DEL CARRITO (js/carrito-panel.js, carrito real)
{
  const antes = ok + fallas;
  const w = pagina('<!doctype html><html><body><nav><input type="text"><div class="iconos"></div></nav><div class="gallery-container"></div></body></html>');
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || (s => String(s)); globalThis.CSS = w.CSS;
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
  const importar = prepararModulos(
    ['promociones.js', 'precios.js', 'aviso-pedido.js', 'historial-cliente.js', 'habituales.js', 'carrito.js', 'carrito-panel.js',
      'promo-panel.js', 'observaciones.js', 'hoja.js', 'datos-catalogo.js', 'alta-cliente.js'],
    { 'config.js': "export const SOLO_VENDEDORES = false;\nexport const CUENTAS_ALTA = ['157'];\n",
      'sesion.js': 'export const pedirToken = () => Promise.resolve(null);\n' });
  const catalogo = { NORMAL: { name: 'SIN PROMO', category: 'x', bulk: 1, prices: { D: 1000, E: 1000, F: 1000 } } };
  globalThis.fetch = async url => {
    const u = String(url);
    const resp = d => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(JSON.stringify(d)) });
    if (u.includes('funcionalidades_usuarios')) return resp(USU);
    if (u.includes('clientes_nombres')) return resp({ clientes: { 949: { nombre: 'FERRETERIA X', vendedor: 'RF' } } });
    if (u.includes('grupos_clientes')) return resp({ groups: {} });
    if (u.includes('promociones')) return resp({ promotions: {} });
    if (u.includes('imagenes')) return resp({ images: {} });
    return resp(catalogo);
  };
  w.productManager = { getProduct: s => (catalogo[s] ? { nombre: catalogo[s].name, bulto: 1, precios: catalogo[s].prices, precio: 1000 } : null),
    clientData: { priceList: 'D' } };
  w.productManagerInstance = { loadSpecificProducts: () => Promise.resolve({}) };
  sessionStorage.setItem('authRol', 'vendedor_estandar');
  sessionStorage.setItem('authToken', 't');
  sessionStorage.setItem('authCodigo', 'RF');
  sessionStorage.setItem('configCarrito', JSON.stringify({ ok: true, descuentosLinea: [5, 7], descuentosTotal: [5, 7], observaciones: [],
    catalogoObservaciones: [{ clave: '170', codigo: '170', texto: 'ENTREGA ESPECIAL', grupo: 'condiciones', efecto: 'entrega' }] }));
  sessionStorage.setItem('clienteVista', JSON.stringify({ cuenta: '7', lista: 'D', nombre: 'Cliente 7' }));
  sessionStorage.setItem('disponibleCliente', '1000000');
  sessionStorage.setItem('disponibleDeCuenta', '7');
  w.menuFuncionalidades = { usuarioActual: { clave: 'V1', rol: 'vendedor_estandar' } };
  const enviados = [];
  let respuesta = () => ({ ok: true, numero: 'APP-1' });
  // accion config: lo que responde el servidor cuando el panel la vuelve a pedir
  let pedidosConfig = 0;
  let configServidor = () => ({ ok: true });
  w.Api = {
    llamar: async body => {
      if (body.accion === 'config') { pedidosConfig++; return configServidor(); }
      if (body.accion !== 'guardar_pedido') return { ok: true };
      enviados.push(JSON.parse(JSON.stringify(body.pedido)));
      return respuesta(body);
    },
    llamarEnSegundoPlano: async () => ({ ok: true, articulos: [] })
  };

  await importar('precios.js'); await importar('promociones.js'); await importar('historial-cliente.js'); await importar('habituales.js');
  await importar('carrito.js'); await importar('carrito-panel.js'); await importar('promo-panel.js');
  await tick();
  const C = w.Carrito;
  const $ = s => document.querySelector(s);
  const abrirPanel = async () => { w.CarritoPanel.abrir(); await tick(10); };
  const confirmar = async () => { $('#carrito-panel .cp-confirmar').click(); await tick(30); };
  const reintentar = async () => { $('#carrito-panel .cp-reintentar').click(); await tick(30); };
  const cerrarExito = async () => { $('#carrito-panel .cp-cerrar-exito')?.click(); await tick(); };
  const clave = fin => Object.keys(localStorage).find(k => k.endsWith(fin));
  const fechaEn = n => {
    const d = new Date(); d.setDate(d.getDate() + n);
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const ponerEntrega = fecha => C.setAjustePedido({ ...C.getAjustePedido(),
    observaciones: [{ id: 'e1', clave: '170', items: [], entrega: { fecha, dia: '', quien: 'RF' } }] });

  // Primer envio: viaja { fecha, dia, quien }; el exito muestra la entrega
  C.vaciar(); C.agregar('NORMAL', 2);
  const f1 = fechaEn(3);
  ponerEntrega(f1);
  await abrirPanel();
  await confirmar();
  ver('3 envio: la entrega con fecha, dia y quien (el texto lo arma el servidor)', JSON.stringify(enviados.at(-1).observaciones) ===
    JSON.stringify([{ clave: '170', entrega: { fecha: f1, dia: '', quien: 'RF' }, items: [] }]), JSON.stringify(enviados.at(-1).observaciones));
  ver('3 exito: renglon de la entrega, sin aviso de fecha pasada', /Entrega especial: .* · RF/.test($('#carrito-panel .cp-exito')?.textContent || '') &&
    !/ya pasó/.test($('#carrito-panel .cp-exito').textContent));
  await cerrarExito();

  // Pendiente sin respuesta, reintento dias despues con entrega_vencida
  C.agregar('NORMAL', 2); ponerEntrega(f1);
  respuesta = () => { throw new Error('sin conexion (simulada)'); };
  await abrirPanel();
  await confirmar();
  const idPend = C.getPendiente()?.id;
  ver('3 sin respuesta: queda pendiente con el carrito entero', !!idPend && C.leer().length === 1 && C.leer()[0].cantidad === 2);
  localStorage.setItem(clave('::mod'), String(Date.now() - 10 * 86400000));   // sin cambios hace 10 dias
  respuesta = () => ({ ok: false, error: 'entrega_vencida' });
  await reintentar();
  ver('3 entrega_vencida: el reintento reenvio el mismo id', enviados.at(-1).id === idPend);
  ver('3 entrega_vencida: sin pendiente', !C.getPendiente());
  ver('3 entrega_vencida: las lineas intactas', C.leer().length === 1 && C.leer()[0].cantidad === 2);
  const entAhora = C.getAjustePedido().observaciones[0].entrega;
  ver('3 entrega_vencida: la fecha vacia y quien se conserva', entAhora.fecha === '' && entAhora.dia === '' && entAhora.quien === 'RF',
    JSON.stringify(entAhora));
  ver('3 entrega_vencida: el carrito marcado como modificado hoy (la limpieza de 7 dias no lo descarta)',
    Date.now() - Number(localStorage.getItem(clave('::mod'))) < 60000);
  ver('3 entrega_vencida: aviso legible', /ya pasó y el pedido no se guardó/.test($('.cp-aviso')?.textContent || ''), $('.cp-aviso')?.textContent);
  ver('3 entrega_vencida: la hoja de la entrega abierta', !!$('.hj-fondo .ob-ent-dias'));
  ver('3 entrega_vencida: el panel muestra el carrito, no el pendiente', !!$('#carrito-panel .cp-confirmar') && !$('#carrito-panel .cp-reintentar'));
  ver('3 entrega_vencida: la observacion marcada con lo que falta', /falta el día/.test($('#carrito-panel .cp-obs-linea')?.textContent || ''));
  $('.ob-ent-dia[data-dia="vi"]').click(); $('.ob-guardar').click(); await tick(10);
  respuesta = () => ({ ok: true, numero: 'APP-2' });
  await confirmar();
  ver('3 corregida y confirmada: id nuevo y la fecha nueva', enviados.at(-1).id !== idPend &&
    enviados.at(-1).observaciones[0].entrega.dia === 'vi', JSON.stringify(enviados.at(-1).observaciones));
  await cerrarExito();

  // Duplicado de un pendiente de dias atras: el exito dice con que fecha quedo guardado
  C.agregar('NORMAL', 1); ponerEntrega(fechaEn(2));
  respuesta = () => { throw new Error('sin conexion (simulada)'); };
  await abrirPanel();
  await confirmar();
  const pend = JSON.parse(localStorage.getItem(clave('::pendiente')));
  pend.pedido.observaciones[0].entrega.fecha = '2026-01-05';
  localStorage.setItem(clave('::pendiente'), JSON.stringify(pend));
  respuesta = () => ({ ok: true, duplicado: true, numero: 'APP-9' });
  await reintentar();
  const txt = $('#carrito-panel .cp-exito')?.textContent || '';
  ver('3 duplicado vencido: el exito con la fecha guardada y el aviso', /lunes 5 de enero de 2026 · RF/.test(txt) &&
    /esa fecha ya pasó: así quedó guardado/.test(txt), txt);
  await cerrarExito();

  // Primer envio rechazado: sin pendiente y texto legible. Otro rechazo en un reintento: sigue pendiente
  C.agregar('NORMAL', 1); ponerEntrega(fechaEn(2));
  respuesta = () => ({ ok: false, error: 'entrega_fecha_invalida' });
  await abrirPanel();
  await confirmar();
  ver('3 primer envio con entrega_fecha_invalida: sin pendiente y texto legible', !C.getPendiente() &&
    /no es válida/.test($('.cp-aviso')?.textContent || ''), $('.cp-aviso')?.textContent);
  respuesta = () => { throw new Error('sin conexion (simulada)'); };
  await confirmar();
  respuesta = () => ({ ok: false, error: 'entrega_fecha_invalida' });
  await reintentar();
  ver('3 otro rechazo en un reintento: sigue pendiente (como antes)', !!C.getPendiente());
  ver('3 los envios sin respuesta quedaron registrados en la consola', consola.some(([k, t]) => k === 'error' && t.includes('sin conexion (simulada)')));
  C.borrarPendiente();
  await tick();

  // ----- Repartidores de config y "despues de quien" (v43) -----
  const cfgBase = JSON.parse(sessionStorage.getItem('configCarrito'));
  const cfgNueva = { ...cfgBase, repartidores: ['RF', 'CS', 'JG', 'IS'], repartidoresRecorrido: ['IS'], cuentasNoElegibles: ['157', '999'] };
  const entregaDe = () => C.getAjustePedido().observaciones[0].entrega;
  const ponerEnt = ent => C.setAjustePedido({ ...C.getAjustePedido(), observaciones: [{ id: 'e2', clave: '170', items: [], entrega: ent }] });
  const cerrarHoja = async () => { $('.hj-fondo .hj-volver')?.click(); await tick(); };
  const siglasHoja = () => [...document.querySelectorAll('.hj-fondo .ob-ent-vend')].map(b => b.dataset.quien).join();
  const fEnt = fechaEn(3);

  // Envio: "despues de" viaja con la cuenta sola; el exito lo muestra con el nombre del carrito
  C.vaciar(); C.agregar('NORMAL', 1);
  ponerEnt({ fecha: fEnt, dia: '', quien: 'IS', despuesDe: { cuenta: '949', nombre: 'FERRETERIA X' } });
  respuesta = () => ({ ok: true, numero: 'APP-3' });
  await abrirPanel();
  await confirmar();
  ver('3x envio: despuesDe solo con la cuenta', JSON.stringify(enviados.at(-1).observaciones[0].entrega) ===
    JSON.stringify({ fecha: fEnt, dia: '', quien: 'IS', despuesDe: '949' }), JSON.stringify(enviados.at(-1).observaciones[0].entrega));
  ver('3x exito: "· IS · después de 949 FERRETERIA X"', /· IS · después de 949 FERRETERIA X/.test($('#carrito-panel .cp-exito')?.textContent || ''),
    $('#carrito-panel .cp-exito')?.textContent);
  await cerrarExito();
  // Sin "despues de": el envio igual que antes, sin la clave
  C.agregar('NORMAL', 1); ponerEnt({ fecha: fEnt, dia: '', quien: 'RF' });
  await abrirPanel(); await confirmar();
  ver('3x envio sin "despues de": sin la clave (como antes)', !('despuesDe' in enviados.at(-1).observaciones[0].entrega));
  await cerrarExito();

  // Cliente nuevo (cuenta puente 157) con la config vieja de la pestaña (sin listas)
  sessionStorage.setItem('clienteVista', JSON.stringify({ cuenta: '157', lista: 'D', nombre: 'Cliente nuevo' }));
  sessionStorage.setItem('disponibleDeCuenta', '157');
  C.setAlta({ comercio: 'C', apellido: 'A', contacto: 'X', domicilio: 'D', localidad: 'L', telefono: '1', horario: 'H', formula: 'D' }, '157');
  C.agregar('NORMAL', 1); ponerEnt({ fecha: fEnt, dia: '', quien: 'IS' });
  configServidor = () => ({ ...cfgNueva });
  respuesta = () => ({ ok: false, error: 'entrega_falta_despues' });
  let antesCfg = pedidosConfig, antesEnv = enviados.length;
  await abrirPanel();
  await confirmar();
  ver('3x falta_despues: se envio (la config vieja no lo pedia)', enviados.length === antesEnv + 1 && enviados.at(-1).cliente === '157');
  ver('3x falta_despues: se volvio a pedir la config, una vez', pedidosConfig === antesCfg + 1);
  ver('3x falta_despues: la config nueva quedo guardada en la sesion',
    JSON.stringify(JSON.parse(sessionStorage.getItem('configCarrito')).repartidoresRecorrido) === '["IS"]');
  ver('3x falta_despues: sin pendiente, el carrito entero, quien se conserva', !C.getPendiente() && C.leer().length === 1 && entregaDe().quien === 'IS');
  ver('3x falta_despues: aviso legible', /Falta "después de quién"/.test($('.cp-aviso')?.textContent || ''), $('.cp-aviso')?.textContent);
  ver('3x falta_despues: la hoja abierta con la lista nueva y el cuadro "Después de quién"', siglasHoja() === 'RF,CS,JG,IS' &&
    /Después de quién/.test($('.hj-fondo')?.textContent || ''));
  ver('3x falta_despues: la observacion del panel marcada con lo que falta', /falta después de quién/.test($('#carrito-panel .cp-obs-linea')?.textContent || ''));
  await cerrarHoja();

  // Con la config nueva, Confirmar no envia sin "despues de"
  antesEnv = enviados.length;
  await confirmar();
  ver('3x alta + IS sin "despues de": Confirmar no envia y avisa', enviados.length === antesEnv &&
    /falta después de quién/.test($('.cp-aviso')?.textContent || ''), $('.cp-aviso')?.textContent);

  // entrega_despues_invalido: no se pide la config, se borra solo "despues de"
  ponerEnt({ fecha: fEnt, dia: '', quien: 'IS', despuesDe: { cuenta: '949', nombre: 'FERRETERIA X' } });
  respuesta = () => ({ ok: false, error: 'entrega_despues_invalido' });
  antesCfg = pedidosConfig;
  await abrirPanel(); await confirmar();
  ver('3x despues_invalido: no se pide la config', pedidosConfig === antesCfg);
  ver('3x despues_invalido: se borra solo "despues de"', JSON.stringify(entregaDe()) === JSON.stringify({ fecha: fEnt, dia: '', quien: 'IS' }),
    JSON.stringify(entregaDe()));
  ver('3x despues_invalido: la hoja abierta con el buscador de clientes', !!$('.hj-fondo .ob-ent-cli-buscar'));
  ver('3x despues_invalido: aviso legible', /no se puede usar/.test($('.cp-aviso')?.textContent || ''));
  await cerrarHoja();

  // entrega_quien_invalido en un reintento: se pide la config, se borran quien y "despues de"
  ponerEnt({ fecha: fEnt, dia: '', quien: 'IS', despuesDe: { cuenta: '949', nombre: 'FERRETERIA X' } });
  respuesta = () => { throw new Error('sin conexion (simulada)'); };
  await abrirPanel(); await confirmar();
  const idQ = C.getPendiente()?.id;
  respuesta = () => ({ ok: false, error: 'entrega_quien_invalido' });
  configServidor = () => ({ ...cfgNueva, repartidores: ['RF', 'CS'] });
  antesCfg = pedidosConfig;
  await reintentar();
  ver('3x quien_invalido en un reintento: mismo id y sin pendiente', enviados.at(-1).id === idQ && !C.getPendiente());
  ver('3x quien_invalido: se volvio a pedir la config', pedidosConfig === antesCfg + 1);
  ver('3x quien_invalido: se borran quien y "despues de", la fecha queda', JSON.stringify(entregaDe()) === JSON.stringify({ fecha: fEnt, dia: '', quien: '' }),
    JSON.stringify(entregaDe()));
  ver('3x quien_invalido: la hoja con la lista nueva, sin la sigla rechazada', siglasHoja() === 'RF,CS', siglasHoja());
  ver('3x quien_invalido: aviso legible', /ya no está en la lista de repartidores/.test($('.cp-aviso')?.textContent || ''));
  await cerrarHoja();

  // La config no llega (sin señal): se sigue con la que habia y la hoja se abre igual
  // (con RF: IS en un alta pediria "despues de" antes de enviar)
  ponerEnt({ fecha: fEnt, dia: '', quien: 'RF' });
  const cfgAntes = sessionStorage.getItem('configCarrito');
  configServidor = () => { throw new Error('sin conexion (simulada)'); };
  respuesta = () => ({ ok: false, error: 'entrega_quien_invalido' });
  await abrirPanel(); await confirmar();
  ver('3x config que no llega: la de la sesion queda igual', sessionStorage.getItem('configCarrito') === cfgAntes);
  ver('3x config que no llega: sin pendiente, hoja abierta y aviso', !C.getPendiente() && !!$('.hj-fondo .ob-ent-dias') &&
    /ya no está en la lista/.test($('.cp-aviso')?.textContent || ''));
  await cerrarHoja();
  // Una config rechazada (ok: false, la sesion vencida) tampoco reemplaza la que habia
  configServidor = () => ({ ok: false, error: 'token_invalido' });
  ponerEnt({ fecha: fEnt, dia: '', quien: 'RF' });
  antesEnv = enviados.length;
  await abrirPanel(); await confirmar();
  ver('3x config con error: se envio, y la de la sesion queda igual', enviados.length === antesEnv + 1 &&
    sessionStorage.getItem('configCarrito') === cfgAntes);
  await cerrarHoja();

  // ----- Viaje 1 o 2 (v44) -----
  // Cliente existente: el viaje se pide igual (no depende del alta)
  sessionStorage.setItem('clienteVista', JSON.stringify({ cuenta: '7', lista: 'D', nombre: 'Cliente 7' }));
  sessionStorage.setItem('disponibleDeCuenta', '7');
  const proximoDiaSem = n => { const d = new Date(); d.setDate(d.getDate() + 1); while (d.getDay() !== n) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fLunes = proximoDiaSem(1), fMartes = proximoDiaSem(2);
  const cfgViaje = { ...cfgNueva, diasDosViajes: ['lu', 'ju', 'sa'] };

  // La pestaña tiene la config sin los dias (se agrego la fila despues): envia sin viaje;
  // el servidor rechaza entrega_falta_viaje en un reintento: a corregir, pidiendo la config
  C.vaciar(); C.agregar('NORMAL', 1);
  ponerEnt({ fecha: fLunes, dia: '', quien: 'IS' });
  respuesta = () => { throw new Error('sin conexion (simulada)'); };
  await abrirPanel(); await confirmar();
  const idV = C.getPendiente()?.id;
  ver('4v sin los dias en la config: se envio sin viaje', !!idV && !('viaje' in enviados.at(-1).observaciones[0].entrega),
    JSON.stringify(enviados.at(-1).observaciones[0].entrega));
  respuesta = () => ({ ok: false, error: 'entrega_falta_viaje' });
  configServidor = () => ({ ...cfgViaje });
  antesCfg = pedidosConfig;
  await reintentar();
  ver('4v falta_viaje en un reintento: mismo id y sin pendiente', enviados.at(-1).id === idV && !C.getPendiente());
  ver('4v falta_viaje: se volvio a pedir la config, una vez', pedidosConfig === antesCfg + 1);
  ver('4v falta_viaje: la config nueva quedo guardada con los dias',
    JSON.stringify(JSON.parse(sessionStorage.getItem('configCarrito')).diasDosViajes) === '["lu","ju","sa"]');
  ver('4v falta_viaje: el carrito entero y la entrega sin tocar', C.leer().length === 1 &&
    JSON.stringify(entregaDe()) === JSON.stringify({ fecha: fLunes, dia: '', quien: 'IS' }), JSON.stringify(entregaDe()));
  ver('4v falta_viaje: aviso legible', /Falta el viaje \(1 o 2\)/.test($('.cp-aviso')?.textContent || ''), $('.cp-aviso')?.textContent);
  ver('4v falta_viaje: la hoja abierta con los botones del viaje', document.querySelectorAll('.hj-fondo .ob-ent-viaje').length === 2);
  ver('4v falta_viaje: la observacion del panel marcada con lo que falta', /falta el viaje/.test($('#carrito-panel .cp-obs-linea')?.textContent || ''));
  await cerrarHoja();

  // Con la config nueva, Confirmar no envia sin viaje (tambien un carrito armado antes de la actualizacion)
  antesEnv = enviados.length;
  await confirmar();
  ver('4v lunes + IS sin viaje: Confirmar no envia y avisa', enviados.length === antesEnv &&
    /falta el viaje/.test($('.cp-aviso')?.textContent || ''), $('.cp-aviso')?.textContent);

  // Con viaje: viaja el numero y el exito lo muestra
  ponerEnt({ fecha: fLunes, dia: '', quien: 'IS', viaje: 1 });
  respuesta = () => ({ ok: true, numero: 'APP-5' });
  await abrirPanel(); await confirmar();
  ver('4v envio: la entrega con viaje 1', JSON.stringify(enviados.at(-1).observaciones[0].entrega) ===
    JSON.stringify({ fecha: fLunes, dia: '', quien: 'IS', viaje: 1 }), JSON.stringify(enviados.at(-1).observaciones[0].entrega));
  ver('4v exito: "· IS · viaje 1"', /· IS · viaje 1/.test($('#carrito-panel .cp-exito')?.textContent || ''),
    $('#carrito-panel .cp-exito')?.textContent);
  await cerrarExito();

  // Un viaje que ya no corresponde (martes) no viaja
  C.agregar('NORMAL', 1); ponerEnt({ fecha: fMartes, dia: '', quien: 'IS', viaje: 2 });
  await abrirPanel(); await confirmar();
  ver('4v martes con un viaje viejo en el carrito: se envia sin viaje', !('viaje' in enviados.at(-1).observaciones[0].entrega),
    JSON.stringify(enviados.at(-1).observaciones[0].entrega));
  ver('4v martes: el exito sin viaje', !/viaje/.test($('#carrito-panel .cp-exito')?.textContent || ''));
  await cerrarExito();

  // entrega_viaje_invalido en el primer envio: sin pendiente y texto legible (no es "a corregir")
  C.agregar('NORMAL', 1); ponerEnt({ fecha: fLunes, dia: '', quien: 'IS', viaje: 2 });
  respuesta = () => ({ ok: false, error: 'entrega_viaje_invalido' });
  antesCfg = pedidosConfig;
  await abrirPanel(); await confirmar();
  ver('4v viaje_invalido: sin pendiente, texto legible, sin pedir la config', !C.getPendiente() &&
    /viaje de la entrega especial no es válido/.test($('.cp-aviso')?.textContent || '') && pedidosConfig === antesCfg,
    $('.cp-aviso')?.textContent);

  globalThis.fetch = fetchReal;
  escribir(`Casos del panel del carrito: ${ok + fallas - antes}`);
}

// Con alguna falla, la consola de la app para revisarla
if (fallas) {
  escribir('\nConsola de la app:');
  consola.forEach(([k, t]) => escribir(`  [${k}] ${t}`));
}
escribir(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
