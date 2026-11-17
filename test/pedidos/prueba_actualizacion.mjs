// PRUEBA DE LA ACTUALIZACION DE LA APP con jsdom: la pagina compara su propia
// version (window.VERSION_APP, de js/version-app.js) con la publicada en
// json/version.json ("app"), muestra la franja, se recarga sola cuando esta
// quieta y no se mete en bucles (js/actualizacion-app.js); la version va en
// cada registro de fallos (js/registro-fallos.js). Ademas: el carrito, el
// pendiente, el alta y el cliente en vista sobreviven a la recarga (todo en
// localStorage y sessionStorage). Modulos reales; el reloj, fetch, la
// navegacion y las entradas de performance son simulados; datos sinteticos.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_actualizacion.mjs
import { JSDOM, prepararModulos } from './preparar.mjs';

// Una copia de los modulos por escenario: cada una agrega su limpieza al salir
process.setMaxListeners(50);

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const esperar = ms => new Promise(r => setTimeout(r, ms));
console.info = () => {};   // los avisos del modulo no ensucian la salida

// ---------- reloj simulado ----------
const reloj = { ahora: Date.parse('2026-11-17T15:00:00Z'), perf: 120000 };
const dateNowReal = Date.now;
Date.now = () => reloj.ahora;
let entradas = [];
Object.defineProperty(globalThis, 'performance', {
  configurable: true, writable: true,
  value: { now: () => reloj.perf, getEntriesByType: t => (t === 'resource' ? entradas : []) }
});
const iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const hace = min => iso(reloj.ahora - min * 60000);

const PROPIA = { huella: 'aaaaaaaaaaaa', generado: hace(24 * 60) };
const nueva = (min = 25) => ({ huella: 'bbbbbbbbbbbb', generado: hace(min) });

const CAMPO_VERSION = 'entry.1648740314';
const PAGINA = `<!doctype html><html><body>
  <nav><div class="input-container"><input type="text" placeholder="Buscar"></div></nav>
  <div id="menu-version"></div>
  <div class="gallery-container"></div>
</body></html>`;

/**
 * Una pestaña nueva: jsdom propio y copia propia de los modulos (el modulo lee
 * la version y la marca al cargar). Devuelve lo que se mira en las pruebas
 */
async function crear({ url = 'https://ferremax.test/catalogo.html', version = PROPIA, marca = null, html = PAGINA,
  antes = null } = {}) {
  const dom = new JSDOM(html, { url });
  const w = dom.window;
  const ctx = { w, d: w.document, oculto: false, scroll: 0, fetches: [], fallos: [], destinos: [], versionJson: {} };
  for (const k of ['window', 'document', 'location', 'history', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'FormData'])
    globalThis[k] = k === 'window' ? w : w[k];
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => ctx.oculto });
  Object.defineProperty(w, 'scrollY', { configurable: true, get: () => ctx.scroll });
  if (version) w.VERSION_APP = version;
  if (marca) w.sessionStorage.setItem('appRecarga', JSON.stringify(marca));
  if (antes) antes(ctx);
  globalThis.fetch = async (u, o = {}) => {
    const url = String(u);
    if (url.includes('formResponse')) {
      ctx.fallos.push(Object.fromEntries([...o.body.entries()]));
      return {};
    }
    ctx.fetches.push({ url, cache: o.cache });
    return { ok: true, json: async () => JSON.parse(JSON.stringify(ctx.versionJson)) };
  };
  const importar = prepararModulos(['actualizacion-app.js', 'actividad.js', 'registro-fallos.js']);
  await importar('actualizacion-app.js');
  ctx.A = w.ActualizacionApp;
  ctx.A.irA = destino => ctx.destinos.push(destino);
  ctx.leer = async app => { w.document.dispatchEvent(new w.CustomEvent('version:leida', { detail: { app } })); await tick(); };
  ctx.tocar = () => w.dispatchEvent(new w.Event('pointerdown'));
  ctx.franja = () => w.document.getElementById('app-franja-version');
  ctx.marca = () => JSON.parse(w.sessionStorage.getItem('appRecarga') || 'null');
  ctx.verVisibilidad = async oculto => {
    ctx.oculto = oculto;
    w.document.dispatchEvent(new w.Event('visibilitychange'));
    await tick();
  };
  return ctx;
}

// =====================================================================
// 1-4. Cuando hay una nueva
{
  const t = await crear();
  t.tocar();   // tocada recien: no se recarga sola, solo se mira la franja
  await t.leer(undefined);
  ver('1. version.json sin "app": nada', !t.franja() && !t.destinos.length && !t.A.estado().publicada);
  await t.leer({ ...PROPIA });
  ver('2. la misma huella: nada', !t.franja() && !t.A.estado().hayNueva);
  await t.leer(nueva(5));
  ver('3. otra huella hace 5 min: todavia no (margen de 20)', !t.franja() && !t.A.estado().hayNueva);
  await t.leer(nueva(19));
  ver('3. hace 19 min: todavia no', !t.franja());
  await t.leer(nueva(20));
  ver('3. hace 20 min: franja', !!t.franja() && t.A.estado().hayNueva);
  ver('3. texto de la franja', t.franja()?.querySelector('.app-franja-texto').textContent === 'Hay una versión nueva de la app.');
  ver('3. franja debajo del panel (9600) y de las hojas (9800)', Number(t.franja()?.style.zIndex) < 9600, t.franja()?.style.zIndex);
  ver('3. tocada recien: no se recargo sola', !t.destinos.length);
  await t.leer({ huella: 'cccccccccccc', generado: hace(48 * 60) });
  ver('4. publicada mas vieja que la propia (CDN atrasado): nada y se quita la franja', !t.franja() && !t.A.estado().hayNueva);
  await t.leer(nueva(25));
  t.franja().querySelector('.app-franja-cerrar').click();
  ver('3. la x saca la franja', !t.franja());
  await t.leer(nueva(25));
  ver('3. la proxima lectura la vuelve a mostrar', !!t.franja());
}
{
  const t = await crear({ version: null });
  await t.leer(nueva(25));
  ver('1. sin VERSION_APP: nada', !t.franja() && !t.destinos.length);
  ver('1. sin VERSION_APP: el menu dice "sin versión"', t.d.getElementById('menu-version').textContent === 'Versión sin versión');
}

// =====================================================================
// 5. El boton: cache, navegacion y marca
{
  entradas = [
    { name: 'https://ferremax.test/js/carrito.js' },
    { name: 'https://ferremax.test/css/hoja.css' },
    { name: 'https://ferremax.test/json/productos.json?v=x' },
    { name: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' }
  ];
  const t = await crear({ html: PAGINA.replace('<nav>', '<script src="js/precios.js"></script><link rel="stylesheet" href="estilos-copia.css"><nav>') });
  t.tocar();
  await t.leer(nueva(25));
  t.franja().querySelector('.app-franja-actualizar').click();
  await tick(20);
  const recargados = t.fetches.filter(f => f.cache === 'reload').map(f => f.url).sort();
  ver('5. refresca con cache reload los js y css de la pagina, mas version-app.js', JSON.stringify(recargados) === JSON.stringify([
    'https://ferremax.test/css/hoja.css', 'https://ferremax.test/estilos-copia.css', 'https://ferremax.test/js/carrito.js',
    'https://ferremax.test/js/precios.js', 'https://ferremax.test/js/version-app.js']), JSON.stringify(recargados));
  ver('5. no refresca otro origen ni json', !t.fetches.some(f => f.url.includes('cdnjs') || f.url.includes('.json')));
  ver('5. navega a ?v=<huella publicada>', t.destinos.length === 1 && t.destinos[0] === '/catalogo.html?v=bbbbbbbbbbbb', t.destinos);
  ver('5. anota el intento', t.marca()?.huella === 'bbbbbbbbbbbb' && t.marca().intentos === 1 && t.marca().ultimo === reloj.ahora);
  entradas = [];

  // Pedido enviandose: el boton no recarga y avisa
  t.d.body.dataset.enviandoPedido = '1';
  t.franja().querySelector('.app-franja-actualizar').click();
  await tick();
  ver('5. con un pedido enviandose: no recarga', t.destinos.length === 1);
  ver('5. con un pedido enviandose: avisa en la franja',
    t.franja().querySelector('.app-franja-texto').textContent === 'Esperá a que termine de guardarse el pedido.');
}

// =====================================================================
// 6. Al cargar despues de una recarga
{
  const t = await crear({ url: 'https://ferremax.test/catalogo.html?v=aaaaaaaaaaaa#x',
    marca: { huella: 'aaaaaaaaaaaa', intentos: 1, ultimo: reloj.ahora } });
  ver('6. saca ?v= de la direccion', t.w.location.href === 'https://ferremax.test/catalogo.html#x', t.w.location.href);
  ver('6. trajo la version buscada: borra la marca', t.marca() === null);
}
{
  const t = await crear({ url: 'https://ferremax.test/catalogo.html?v=bbbbbbbbbbbb',
    marca: { huella: 'bbbbbbbbbbbb', intentos: 1, ultimo: reloj.ahora } });
  ver('6. no trajo la version buscada: la marca queda', t.marca()?.intentos === 1);
}

// =====================================================================
// 7. Contra el bucle
{
  // Primer intento hace 5 minutos y la pagina sigue vieja
  const t = await crear({ marca: { huella: 'bbbbbbbbbbbb', intentos: 1, ultimo: reloj.ahora - 5 * 60000 } });
  await t.leer(nueva(25));
  ver('7. quieta, pero hace 5 min de la recarga anterior: no recarga', !t.destinos.length && !!t.franja());
  reloj.ahora += 20 * 60000;
  await t.leer(nueva(45));
  ver('7. a los 20 min: segundo intento', t.destinos.length === 1 && t.marca().intentos === 2);
  reloj.ahora -= 20 * 60000;
}
{
  const t = await crear({ marca: { huella: 'bbbbbbbbbbbb', intentos: 2, ultimo: reloj.ahora - 60 * 60000 } });
  await t.leer(nueva(90));
  ver('7. despues de 2 intentos: no recarga mas sola', !t.destinos.length);
  ver('7. la franja pide cerrar la pestaña',
    /Cerrá esta pestaña y volvé a abrir la app/.test(t.franja()?.textContent || ''), t.franja()?.textContent);
  ver('7. registra un fallo app_no_se_actualiza con las dos huellas', t.fallos.length === 1 &&
    t.fallos[0]['entry.2068454387'] === 'app_no_se_actualiza' && /aaaaaaaaaaaa.*bbbbbbbbbbbb/.test(t.fallos[0]['entry.1115975132']),
    JSON.stringify(t.fallos));
  await t.leer(nueva(90));
  ver('7. una sola vez', t.fallos.length === 1);
  t.franja().querySelector('.app-franja-actualizar').click();
  await tick(20);
  ver('7. el boton igual recarga', t.destinos.length === 1);
}

// =====================================================================
// 8. Sola cuando esta quieta
{
  const t = await crear();
  await t.leer(nueva(25));
  ver('8. quieta (60 s sin tocar, cargada hace 2 min, arriba): se recarga sola', t.destinos.length === 1, t.destinos);
}
const BLOQUEOS = [
  ['panel del carrito abierto', t => { t.d.body.insertAdjacentHTML('beforeend', '<div id="carrito-panel" style="display:flex"></div>'); }],
  ['una hoja abierta (observacion o alta)', t => { t.d.body.insertAdjacentHTML('beforeend', '<div class="hj-fondo"></div>'); }],
  ['un pedido enviandose', t => { t.d.body.dataset.enviandoPedido = '1'; }],
  ['el menu abierto', t => { t.w.menuFuncionalidades = { isOpen: true }; }],
  ['foco en un campo', t => { t.d.body.insertAdjacentHTML('beforeend', '<textarea id="ta"></textarea>'); t.d.getElementById('ta').focus(); }],
  ['texto en el buscador', t => { t.d.querySelector('nav .input-container input').value = 'tornillo'; }],
  ['scroll abajo', t => { t.scroll = 2000; }],
  ['un toque hace 59 s', t => { reloj.perf -= 59000; t.tocar(); reloj.perf += 59000; }],
  ['la pestaña oculta', t => { t.oculto = true; }],
  ['cargada hace 30 s', () => { reloj.perf = 30000; }]
];
for (const [nombre, bloquear] of BLOQUEOS) {
  reloj.perf = 120000;
  const t = await crear();
  bloquear(t);
  await t.leer(nueva(25));
  ver(`8. bloquea: ${nombre}`, !t.destinos.length && !!t.franja(), t.destinos);
}
reloj.perf = 120000;
{
  // El buscador aunque sea type="search"
  const t = await crear({ html: PAGINA.replace('type="text"', 'type="search"') });
  t.d.querySelector('nav .input-container input').value = 'tornillo';
  await t.leer(nueva(25));
  ver('8. bloquea: texto en el buscador con type="search"', !t.destinos.length);
}
{
  // Un pedido con confirmacion pendiente guardado NO bloquea: sobrevive a la recarga
  const t = await crear({ antes: c => c.w.localStorage.setItem('carrito::V1::7::pendiente', JSON.stringify({ id: 'X', pedido: {} })) });
  await t.leer(nueva(25));
  ver('8. un pendiente guardado no bloquea', t.destinos.length === 1);
}
{
  // Bloqueada y despues libre: el reintento (o la proxima lectura) la recarga
  const t = await crear();
  t.d.body.dataset.enviandoPedido = '1';
  await t.leer(nueva(25));
  delete t.d.body.dataset.enviandoPedido;
  await t.leer(nueva(25));
  ver('8. al quedar libre, se recarga', t.destinos.length === 1);
}

// =====================================================================
// 9. Vuelta a la pestaña despues de un rato oculta
{
  const t = await crear();
  t.scroll = 2000;   // no quieta: solo la vuelta la puede recargar
  await t.leer(nueva(25));
  ver('9. no quieta: no se recarga', !t.destinos.length);
  await t.verVisibilidad(true);
  reloj.perf += 2 * 60000;
  await t.verVisibilidad(false);
  await t.leer(nueva(25));
  ver('9. vuelta despues de 2 min: no', !t.destinos.length);
  await t.verVisibilidad(true);
  reloj.perf += 11 * 60000;
  await t.verVisibilidad(false);
  ver('9. vuelta despues de 11 min: se recarga sin esperar', t.destinos.length === 1, t.destinos);
}
{
  const t = await crear();
  t.scroll = 2000;
  await t.leer(nueva(25));
  await t.verVisibilidad(true);
  reloj.perf += 11 * 60000;
  t.d.body.insertAdjacentHTML('beforeend', '<div id="carrito-panel" style="display:flex"></div>');
  await t.verVisibilidad(false);
  await t.leer(nueva(25));
  ver('9. vuelta despues de 11 min con el panel abierto: no', !t.destinos.length);
  reloj.perf = 120000;
}
{
  // La lectura de version.json llega despues de volver: la ventana la espera
  const t = await crear();
  t.scroll = 2000;
  await t.verVisibilidad(true);
  reloj.perf += 11 * 60000;
  await t.verVisibilidad(false);
  reloj.perf += 3000;
  await t.leer(nueva(25));
  ver('9. la lectura llega 3 s despues de volver: se recarga', t.destinos.length === 1);
  reloj.perf = 120000;
}

// =====================================================================
// 10. Registro de fallos
const dos = n => String(n).padStart(2, '0');
const fecha = s => { const d = new Date(s); return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`; };
{
  const t = await crear();
  t.tocar();
  t.w.RegistroFallos.registrarFallo('prueba', 'detalle', 'u1');
  await tick();
  const f = t.fallos.at(-1) || {};
  ver('10. usuario, motivo y detalle iguales que siempre', f['entry.1626397435'] === 'u1' && f['entry.2068454387'] === 'prueba' &&
    f['entry.1115975132'] === 'detalle', JSON.stringify(f));
  ver('10. la version: huella completa y fecha', f[CAMPO_VERSION] === `aaaaaaaaaaaa ${fecha(PROPIA.generado)}`, f[CAMPO_VERSION]);
  ver('10. el campo va al final', Object.keys(f).at(-1) === CAMPO_VERSION);
  await t.leer(nueva(5));
  t.w.RegistroFallos.registrarFallo('prueba2', 'detalle', 'u1');
  await tick();
  ver('10. con otra publicada: " · publicada …"', t.fallos.at(-1)?.[CAMPO_VERSION] ===
    `aaaaaaaaaaaa ${fecha(PROPIA.generado)} · publicada bbbbbbbbbbbb`, t.fallos.at(-1)?.[CAMPO_VERSION]);
}
{
  const t = await crear({ version: null });
  t.w.RegistroFallos.registrarFallo('prueba', 'detalle', 'u1');
  await tick();
  ver('10. sin VERSION_APP: "sin versión" (no se omite el campo)', t.fallos.at(-1)?.[CAMPO_VERSION] === 'sin versión');
}

// =====================================================================
// 11. Menu
{
  const t = await crear();
  const menu = () => t.d.getElementById('menu-version');
  ver('11. el menu muestra la version', menu().textContent === `Versión ${fecha(PROPIA.generado)} · aaaaaa`, menu().textContent);
  t.tocar();
  await t.leer(nueva(25));
  ver('11. con una nueva: "hay una nueva: actualizar"', menu().textContent.endsWith('· hay una nueva: actualizar'), menu().textContent);
  menu().querySelector('a.version-actualizar').click();
  await tick(20);
  ver('11. "actualizar" del menu recarga', t.destinos.length === 1);
  ver('11. textoVersion sin version', t.A.textoVersion(null) === 'sin versión');
}

// =====================================================================
// 13. El carrito sobrevive a la recarga (antes de la bandeja: su lectura
// periodica queda andando hasta el final)
{
  const reemplazos = {
    'config.js': "export const SOLO_VENDEDORES = false;\nexport const CUENTAS_ALTA = ['157'];\n",
    'sesion.js': 'export const pedirToken = () => Promise.resolve(null);\n'
  };
  const pestaña = async (storage = null) => {
    const dom = new JSDOM('<!doctype html><html><body><nav><div class="input-container"><input type="text"></div></nav></body></html>',
      { url: 'https://ferremax.test/catalogo.html', pretendToBeVisual: true });
    const w = dom.window;
    for (const k of ['window', 'document', 'location', 'history', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement', 'Node',
      'getComputedStyle', 'requestAnimationFrame'])
      globalThis[k] = k === 'window' ? w : w[k];
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    if (storage) {
      // Lo que conserva el navegador al recargar la pestaña
      Object.entries(storage.local).forEach(([k, v]) => w.localStorage.setItem(k, v));
      Object.entries(storage.session).forEach(([k, v]) => w.sessionStorage.setItem(k, v));
    } else {
      w.sessionStorage.setItem('authRol', 'vendedor_estandar');
      w.sessionStorage.setItem('authToken', 't');
      w.sessionStorage.setItem('clienteVista', JSON.stringify({ cuenta: '7', lista: 'D', nombre: 'Cliente 7' }));
    }
    w.menuFuncionalidades = { usuarioActual: { clave: 'V1', rol: 'vendedor_estandar' } };
    w.productManager = { getProduct: s => ({ nombre: s, bulto: 1, precios: { D: 100, E: 90, F: 80 }, precio: 100 }), clientData: { priceList: 'D' } };
    w.productManagerInstance = { loadSpecificProducts: () => Promise.resolve({}) };
    const importar = prepararModulos(['precios.js', 'carrito.js', 'datos-catalogo.js'], reemplazos);
    await importar('precios.js');
    await importar('carrito.js');
    await tick();
    return w;
  };
  const copia = s => Object.fromEntries(Array.from({ length: s.length }, (_, i) => [s.key(i), s.getItem(s.key(i))]));

  const w1 = await pestaña();
  const C1 = w1.Carrito;
  C1.agregar('P1', 3);
  C1.agregar('P2', 5);
  C1.setAjustePedido({ descuento: 5, motivo: '', obsLibre: 'llamar antes', observaciones: [{ id: 'o1', clave: 'X', items: [] }] });
  C1.setAlta({ comercio: 'Ferreteria Nueva' });
  C1.setPendiente({ id: 'PED-1', lineas: [{ sku: 'P1', cantidad: 3 }] });
  const antes = { lineas: JSON.stringify(C1.leer()), ajuste: JSON.stringify(C1.getAjustePedido()), alta: JSON.stringify(C1.getAlta()),
    pendiente: JSON.stringify(C1.getPendiente()?.pedido), vista: JSON.stringify(w1.Precios.getClienteVista()) };
  ver('13. antes de recargar hay lineas y pendiente', C1.leer().length === 2 && !!C1.getPendiente());

  const w2 = await pestaña({ local: copia(w1.localStorage), session: copia(w1.sessionStorage) });
  const C2 = w2.Carrito;
  ver('13. despues de recargar: las mismas lineas', JSON.stringify(C2.leer()) === antes.lineas, JSON.stringify(C2.leer()));
  ver('13. despues de recargar: el mismo ajuste y observaciones', JSON.stringify(C2.getAjustePedido()) === antes.ajuste);
  ver('13. despues de recargar: la misma alta', JSON.stringify(C2.getAlta()) === antes.alta);
  ver('13. despues de recargar: el mismo pendiente, con su id', JSON.stringify(C2.getPendiente()?.pedido) === antes.pendiente &&
    C2.getPendiente()?.id === 'PED-1');
  ver('13. despues de recargar: el mismo cliente en vista', JSON.stringify(w2.Precios.getClienteVista()) === antes.vista, antes.vista);
}

// =====================================================================
// 12. Bandeja: lectura propia de version.json y su condicion
const BANDEJA = `<!doctype html><html><body>
  <div class="im-sinc"><button id="im-actualizar">Actualizar</button><span id="im-version">Versión</span></div>
  <input type="text" id="im-buscar">
</body></html>`;
{
  const t = await crear({ url: 'https://ferremax.test/imprimir.html', html: BANDEJA });
  ver('12. la bandeja muestra la version', t.d.getElementById('im-version').textContent.startsWith('Versión ') &&
    t.d.getElementById('im-version').textContent.endsWith('aaaaaa'));
  let seleccion = 1;
  t.A.agregarCondicion(() => seleccion === 0);
  t.versionJson = { app: nueva(25) };
  t.A.leerVersionCada(40);
  ver('12. no lee al arrancar', t.fetches.length === 0);
  await esperar(110); await tick();
  const lecturas = () => t.fetches.filter(f => f.url.includes('version.json'));
  ver('12. lee version.json periodicamente, sin cache', lecturas().length >= 2 && lecturas().every(f => f.cache === 'no-store'), lecturas().length);
  ver('12. con seleccion: franja y no se recarga', !!t.franja() && !t.destinos.length);
  ver('12. #im-version: "hay una nueva"', /hay una nueva: actualizar$/.test(t.d.getElementById('im-version').textContent));
  t.oculto = true;
  const n = lecturas().length;
  await esperar(110); await tick();
  ver('12. oculta: no lee', lecturas().length === n);
  await t.verVisibilidad(false);
  ver('12. al volver a la ventana: lee', lecturas().length === n + 1);
  seleccion = 0;
  await esperar(60); await tick();
  ver('12. sin seleccion y quieta: se recarga', t.destinos.length >= 1 && t.destinos[0] === '/imprimir.html?v=bbbbbbbbbbbb', t.destinos);
}
{
  const t = await crear({ url: 'https://ferremax.test/imprimir.html', html: BANDEJA });
  t.A.agregarCondicion(() => { throw new Error('cambio en la bandeja'); });
  const warn = console.warn; console.warn = () => {};
  await t.leer(nueva(25));
  console.warn = warn;
  ver('12. una condicion que lanza error cuenta como bloqueada', !t.destinos.length && !!t.franja());
}
{
  const t = await crear({ url: 'https://ferremax.test/imprimir.html', html: BANDEJA });
  t.A.agregarCondicion(() => undefined);
  await t.leer(nueva(25));
  ver('12. una condicion que no devuelve true bloquea', !t.destinos.length);
}
{
  const t = await crear({ url: 'https://ferremax.test/imprimir.html', html: BANDEJA });
  t.d.getElementById('im-buscar').value = 'ferreteria';
  // La condicion real de imprimir.js, con sus partes simuladas
  t.A.agregarCondicion(() => {
    const aviso = document.getElementById('ih-aviso');
    return true && true && !document.body.dataset.ocupadoBandeja && !(aviso && !aviso.hidden) &&
      !document.getElementById('im-buscar')?.value.trim();
  });
  await t.leer(nueva(25));
  ver('12. texto en el buscador de la bandeja: bloquea', !t.destinos.length);
  t.d.getElementById('im-buscar').value = '';
  t.d.body.dataset.ocupadoBandeja = '1';
  await t.leer(nueva(25));
  ver('12. bandeja ocupada (impresion en curso): bloquea', !t.destinos.length);
  delete t.d.body.dataset.ocupadoBandeja;
  t.d.body.insertAdjacentHTML('beforeend', '<div id="ih-aviso"></div>');
  await t.leer(nueva(25));
  ver('12. aviso de imprimir-hojas en pantalla: bloquea', !t.destinos.length);
  t.d.getElementById('ih-aviso').hidden = true;
  await t.leer(nueva(25));
  ver('12. aviso oculto y nada mas: se recarga', t.destinos.length === 1);
}

Date.now = dateNowReal;
console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
