// PRUEBA DE LA ENTREGA ESPECIAL (observacion con efecto 'entrega', la 170) con
// jsdom y los modulos reales:
//   1. js/datos-catalogo.js: la lista de vendedores (funcionalidades_usuarios.json)
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
// 1. LISTA DE VENDEDORES (js/datos-catalogo.js)
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

  Date.now = nowReal;
  globalThis.fetch = fetchReal;
  escribir(`Casos de la lista de vendedores: ${ok + fallas - antes}`);
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
  let modoUsu = 'ok', desfase = 0;
  w.DatosCatalogo = { imagenes: async () => ({ images: {} }), productos: async () => ({}),
    usuarios: async () => {
      if (modoUsu === 'falla') throw new Error('sin red (simulada)');
      return { datos: modoUsu === 'vacia' ? { usuarios: {} } : USU, desfaseMs: desfase };
    } };
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
  w.Api = {
    llamar: async body => {
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
