// PRUEBA DE LA FRESCURA CON LA PESTAÑA ABIERTA con jsdom:
//  1. imagenes: si cambia la huella de catalogo_imagenes.json, se baja una vez,
//     queda vigente para lo que se pinte despues y se repintan en el lugar las
//     tarjetas que no tenian esa foto (js/frescura-imagenes.js);
//  2. grupos de clientes: si cambia grupos_clientes.json, cambian las
//     promociones del cliente en vista, con un solo repintado (js/promociones.js);
//  3. panel del carrito abierto: se lee version.json igual, pero solo se avisa
//     la version de la app; lo demas se aplica al cerrar, sin leer otra vez
//     (js/frescura-precios.js);
//  4. configuracion del carrito (catalogo de observaciones): vale 30 minutos;
//     despues, al abrir el panel se revalida en segundo plano (js/carrito-panel.js).
// Modulos reales de js/; config.js y sesion.js son reemplazos minimos. Servidor,
// archivos, productManager y Fotos simulados; datos sinteticos.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_frescura.mjs
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RAIZ, JSDOM, prepararModulos } from './preparar.mjs';

const modulos = ['frescura-precios.js', 'datos-catalogo.js', 'aviso-pedido.js', 'destacados.js', 'actividad.js',
  'promociones.js', 'precios.js', 'historial-cliente.js', 'habituales.js', 'carrito.js', 'carrito-panel.js',
  'promo-panel.js', 'observaciones.js', 'hoja.js', 'alta-cliente.js'];
// Sin frescura-imagenes.js (control con el codigo anterior) se prueba igual lo que hay
const hayImagenes = existsSync(join(RAIZ, 'js', 'frescura-imagenes.js'));
if (hayImagenes) modulos.push('frescura-imagenes.js');
const importar = prepararModulos(modulos, {
  'config.js': '// Reemplazo minimo para la prueba\nexport const SOLO_VENDEDORES = false;\nexport const CUENTAS_ALTA = [\'157\'];\n',
  'sesion.js': '// Reemplazo minimo para la prueba\nexport const pedirToken = () => Promise.resolve(null);\n'
});

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

// ---------- pagina: tarjetas como las de catalogo.html ----------
// A: sin foto. B: con su foto. C: con una foto que cambia. D: con una foto que
// sale del mapa. E: oculta y sin foto
const tarjeta = (c, id, oculta) => `<div class="gallery-item" data-product-code="${c}"${oculta ? ' style="display:none"' : ''}>` +
  `<div class="container-img"><img alt=""${id ? ` data-foto-id="${id}" src="foto:${id}"` : ' src="img/no-img.png"'}>` +
  `<div class="top-row"><a href="">${c}</a></div><div class="bottom-row"><a href="">${c}</a>` +
  `<span class="price-tag" data-sku="${c}"></span></div></div></div>`;
const dom = new JSDOM(`<!doctype html><html><body>
  <nav><input type="text" placeholder="Buscar en catálogo de productos..."><div class="iconos"></div></nav>
  <div id="barra-salud-financiera" class="barra-salud-financiera"><div class="barra-salud-content">
    <div class="cliente-info"><div class="cliente-nombre"><span id="cliente-nombre">X</span></div>
    <div class="dato-item"><span class="cupo-valor">$0</span></div></div></div></div>
  <div class="gallery-container">${tarjeta('A')}${tarjeta('B', 'ID-B')}${tarjeta('C', 'ID-C1')}${tarjeta('D', 'ID-D')}${tarjeta('E', null, true)}</div>
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
const $ = s => document.querySelector(s);
const img = c => $(`.gallery-item[data-product-code="${c}"] img`);

// ---------- archivos del servidor ----------
const precio = d => ({ D: d, E: d, F: d });
const catalogo = { A: { name: 'A', category: 'x', bulk: 1, prices: precio(1000) }, B: { name: 'B', category: 'x', bulk: 1, prices: precio(1000) },
  P1: { name: 'CON PROMO EN G', category: 'x', bulk: 1, prices: precio(1000) }, Z: { name: 'SIN TARJETA', category: 'x', bulk: 1, prices: precio(500) } };
const PROMOS = { P1: { tipoLista: 'F', precio: 800, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['G'] },
  P2: { tipoLista: 'F', precio: 50, cantidadMinima: 1, vigencia: '2099-12-31', grupos: ['H'] } };
const GRUPOS = { G: ['7'], H: ['8'] };
const FOTOS = { A0: 'x', B: 'ID-B', C: 'ID-C1', D: 'ID-D' };
const archivos = {
  imagenes: { i2: { images: { A: 'ID-A', B: 'ID-B', C: 'ID-C2', E: 'ID-E', Z: 'ID-Z' } } },
  grupos: { g2: { groups: { G: ['8'], H: ['7'] } }, g3: { groups: { G: ['7'], H: ['8'] } } },
  promos: { p3: { promotions: { ...PROMOS, P2: { ...PROMOS.P2, precio: 40 } } } }
};
const estado = {};   // url que tiene que fallar -> status
const ahora = Date.now();
const iso = t => new Date(t).toISOString();
let version = {
  productos: { huella: 'pr0', generado: iso(ahora - 3 * 3600e3) },
  catalogo_grupos: { huella: 'cg0', generado: iso(ahora - 3 * 3600e3) },
  app: { huella: 'app0', generado: iso(ahora - 3 * 3600e3) }
};
const pedidos = [];
globalThis.fetch = async url => {
  const u = String(url);
  pedidos.push(u);
  const resp = (d, status = 200) => ({ ok: status === 200, status, json: async () => JSON.parse(JSON.stringify(d)) });
  const h = new URL(u, 'https://x/').searchParams.get('v');
  if (u.includes('version.json')) return resp(version);
  if (u.includes('catalogo_imagenes')) return h ? resp(archivos.imagenes[h] || {}, estado[u] || 200) : resp({ images: FOTOS });
  if (u.includes('grupos_clientes')) return h ? resp(archivos.grupos[h] || {}, estado[u] || 200) : resp({ groups: GRUPOS });
  if (u.includes('promociones')) return h ? resp(archivos.promos[h] || {}, estado[u] || 200) : resp({ promotions: PROMOS });
  if (u.includes('catalogo_grupos')) return resp({});
  return resp(catalogo);
};
const bajadas = parte => pedidos.filter(u => u.includes(parte)).length;

// ---------- sesion: vendedor con el cliente 7 en vista ----------
sessionStorage.setItem('authRol', 'vendedor_estandar');
sessionStorage.setItem('authToken', 't');
const CONFIG0 = { ok: true, descuentosLinea: [5, 7], descuentosTotal: [5, 7], observaciones: [],
  catalogoObservaciones: [{ clave: '113', codigo: '113', texto: 'VIEJA', grupo: 'condiciones', efecto: 'informativa' }] };
sessionStorage.setItem('configCarrito', JSON.stringify(CONFIG0));
sessionStorage.setItem('clienteVista', JSON.stringify({ cuenta: '7', lista: 'D', nombre: 'Cliente 7' }));
sessionStorage.setItem('disponibleCliente', '1000000');
sessionStorage.setItem('disponibleDeCuenta', '7');
sessionStorage.setItem('productos_cargados', String(ahora));
localStorage.setItem('clientData', JSON.stringify({ account: '1', groups: ['V'], productCodes: ['A', 'B', 'C', 'D', 'E'],
  lastLogin: iso(ahora), priceList: 'D' }));
w.menuFuncionalidades = { usuarioActual: { clave: 'V1', rol: 'vendedor_estandar' } };
let pedidosConfig = 0;
let configServidor = () => ({ ok: true });
w.Api = {
  llamar: async body => { if (body.accion === 'config') { pedidosConfig++; return configServidor(); } return { ok: true }; },
  llamarEnSegundoPlano: async () => ({ ok: true, articulos: [] })
};
let actualizados = 0;
w.productManager = {
  products: new Map([['A', {}]]),
  actualizarDesde: () => { actualizados++; return { actualizados: 1, cambios: [] }; },
  getProduct: s => (catalogo[s] ? { nombre: catalogo[s].name, bulto: 1, precios: catalogo[s].prices, precio: catalogo[s].prices.D } : null),
  clientData: { priceList: 'D' }
};
w.productManagerInstance = { loadSpecificProducts: () => Promise.resolve({}) };
// Fotos como js/fotos.js: poner deja el id en data-foto-id
let puestas = [];
w.Fotos = {
  poner: (el, id) => { puestas.push(id); el.dataset.fotoId = id; el.setAttribute('src', 'foto:' + id); },
  quitar: el => { delete el.dataset.fotoId; el.setAttribute('src', ''); },
  url: (id, ancho) => 'foto:' + id + '=w' + ancho
};
const leidas = [];
document.addEventListener('version:leida', e => leidas.push(e.detail));

// ---------- modulos reales ----------
await importar('precios.js');
const P = await importar('promociones.js');
await importar('historial-cliente.js');
await importar('habituales.js');
await importar('carrito.js');
await importar('carrito-panel.js');
await importar('promo-panel.js');
await importar('frescura-precios.js');
await tick();
await w.DatosCatalogo.imagenes();   // la galeria ya cargo el mapa
// La configuracion se carga sola al rato (reintentos de carrito-panel, 500 ms)
await new Promise(r => setTimeout(r, 600)); await tick();
const C = w.Carrito;
const leerVersion = (detalle) => { document.dispatchEvent(new w.CustomEvent('version:leida', { detail: detalle })); return tick(20); };

// =====================================================================
// 1. Imagenes
pedidos.length = 0;
await leerVersion({ imagenes: { huella: 'i1', generado: iso(ahora - 3 * 3600e3) } });
ver('1. huella generada antes de cargar la pagina: no baja nada', bajadas('catalogo_imagenes') === 0);
await leerVersion({ imagenes: { huella: 'i2', generado: iso(Date.now() + 1000) } });
ver('1. huella nueva: una descarga con la huella en la URL', bajadas('catalogo_imagenes.json?v=i2') === 1, pedidos);
ver('1. tarjeta sin foto: la recibe (data-foto-id)', img('A')?.dataset.fotoId === 'ID-A', img('A')?.outerHTML);
ver('1. tarjeta con la misma foto: no se toca', img('B')?.getAttribute('src') === 'foto:ID-B' && !puestas.includes('ID-B'));
ver('1. tarjeta con otra foto: se actualiza', img('C')?.dataset.fotoId === 'ID-C2');
ver('1. foto que salio del mapa: queda como estaba', img('D')?.dataset.fotoId === 'ID-D');
ver('1. tarjeta oculta: tambien la recibe (diferida)', img('E')?.dataset.fotoId === 'ID-E');
ver('1. lo que se pinte despues usa el mapa nuevo', (await w.DatosCatalogo.imagenes())?.images?.Z === 'ID-Z');
C.vaciar(); C.agregar('Z', 1);
ver('1. el carrito toma la foto del mapa nuevo (producto sin tarjeta)', String(C.leer().find(l => l.sku === 'Z')?.img || '').includes('ID-Z'),
  JSON.stringify(C.leer()));
C.vaciar();
ver('1. observaciones escucha imagenes:actualizadas',
  /imagenes:actualizadas/.test(readFileSync(join(RAIZ, 'js', 'observaciones.js'), 'utf8')));
const antesI = puestas.length;
await leerVersion({ imagenes: { huella: 'i2', generado: iso(Date.now()) } });
ver('1. la misma huella otra vez: ni descarga ni repintado', bajadas('catalogo_imagenes.json?v=i2') === 1 && puestas.length === antesI);
estado['./json/catalogo_imagenes.json?v=i3'] = 500;
await leerVersion({ imagenes: { huella: 'i3', generado: iso(Date.now() + 2000) } });
ver('1. HTTP 500: queda el mapa anterior', (await w.DatosCatalogo.imagenes())?.images?.Z === 'ID-Z' && puestas.length === antesI);

// =====================================================================
// 2. Grupos de clientes (y promociones a la vez)
let repintados = 0, actualizadas = 0;
const repintarOriginal = w.Precios.repintarTodos;
w.Precios.repintarTodos = () => { repintados++; return repintarOriginal(); };
document.addEventListener('promos:actualizadas', () => actualizadas++);
const textoAviso = () => $('.aviso-precios')?.textContent || '';
ver('2. antes: el cliente 7 (grupo G) tiene la promocion de P1', P.promoDe('P1')?.precio === 800 && !P.promoDe('P2'));
C.vaciar(); C.agregar('P1', 1); $$aviso();
pedidos.length = 0;
await leerVersion({ grupos_clientes: { huella: 'g1', generado: iso(ahora - 3 * 3600e3) } });
ver('2. huella generada antes de cargar: no baja nada', bajadas('grupos_clientes') === 0);
await leerVersion({ grupos_clientes: { huella: 'g2', generado: iso(Date.now() + 1000) } });
ver('2. huella nueva: una descarga con la huella en la URL', bajadas('grupos_clientes.json?v=g2') === 1, pedidos);
ver('2. el cliente 7 paso al grupo H: pierde P1 y gana P2', !P.promoDe('P1') && P.promoDe('P2')?.precio === 50);
ver('2. repinta una vez y avisa con promos:actualizadas', repintados === 1 && actualizadas === 1, { repintados, actualizadas });
ver('2. aviso: cambio el precio de la linea del pedido', textoAviso().includes('1 artículo de tu pedido cambió de precio'), textoAviso());
// Promociones y grupos a la vez: dos descargas y un solo repintado
repintados = 0; actualizadas = 0; $$aviso();
C.vaciar(); C.agregar('A', 1);
await leerVersion({ promociones: { huella: 'p3', generado: iso(Date.now() + 2000) },
  grupos_clientes: { huella: 'g3', generado: iso(Date.now() + 2000) } });
ver('2. las dos a la vez: dos descargas', bajadas('promociones.json?v=p3') === 1 && bajadas('grupos_clientes.json?v=g3') === 1);
ver('2. las dos a la vez: un solo repintado', repintados === 1 && actualizadas === 1, { repintados, actualizadas });
ver('2. las dos a la vez: vuelve a G y P2 trae el precio nuevo en memoria', P.promoDe('P1')?.precio === 800 && !P.promoDe('P2'));
ver('2. sin aviso si no cambio ningun precio del pedido', textoAviso() === '', textoAviso());
estado['./json/grupos_clientes.json?v=g4'] = 500;
await leerVersion({ grupos_clientes: { huella: 'g4', generado: iso(Date.now() + 3000) } });
ver('2. HTTP 500: quedan los grupos anteriores', P.promoDe('P1')?.precio === 800);
C.vaciar();
function $$aviso() { document.querySelectorAll('.aviso-precios').forEach(a => a.remove()); }

// =====================================================================
// 3. Panel del carrito abierto: se lee, se avisa solo la app, se aplica al cerrar
version = {
  ...version,
  productos: { huella: 'pr1', generado: iso(Date.now() + 5000) },
  promociones: { huella: 'p5', generado: iso(Date.now() + 5000) },
  imagenes: { huella: 'i5', generado: iso(Date.now() + 5000) },
  app: { huella: 'app1', generado: iso(Date.now() + 5000) }
};
archivos.promos.p5 = { promotions: { ...PROMOS, P1: { ...PROMOS.P1, precio: 700 } } };
archivos.imagenes.i5 = { images: { A: 'ID-A5', B: 'ID-B', C: 'ID-C2', E: 'ID-E', Z: 'ID-Z' } };
w.CarritoPanel.abrir(); await tick();
pedidos.length = 0; leidas.length = 0; actualizados = 0;
await w.FrescuraPrecios.revisar(); await tick(20);
ver('3. panel abierto: se lee version.json', bajadas('version.json') === 1, pedidos);
ver('3. panel abierto: el aviso lleva solo la version de la app',
  leidas.length === 1 && JSON.stringify(Object.keys(leidas[0] || {})) === '["app"]' && leidas[0].app?.huella === 'app1', JSON.stringify(leidas));
ver('3. panel abierto: no se bajan precios, promociones ni imagenes',
  bajadas('productos.json') === 0 && bajadas('promociones.json') === 0 && bajadas('catalogo_imagenes') === 0 && actualizados === 0, pedidos);
ver('3. panel abierto: las promociones siguen como estaban', P.promoDe('P1')?.precio === 800);
w.CarritoPanel.cerrar();
w.FrescuraPrecios.aplicarPendiente?.(); await tick(30);
ver('3. al cerrar: se aplica todo sin leer version.json otra vez', bajadas('version.json') === 1 && bajadas('productos.json?v=pr1') === 1 &&
  bajadas('promociones.json?v=p5') === 1 && bajadas('catalogo_imagenes.json?v=i5') === 1 && actualizados === 1, pedidos);
ver('3. al cerrar: el aviso completo y los datos nuevos', leidas.length === 2 && leidas[1]?.promociones?.huella === 'p5' &&
  P.promoDe('P1')?.precio === 700 && img('A')?.dataset.fotoId === 'ID-A5');
pedidos.length = 0;
w.FrescuraPrecios.aplicarPendiente?.(); await tick(20);
ver('3. aplicada una vez: no se repite', pedidos.length === 0);

// =====================================================================
// 4. Configuracion del carrito: 30 minutos y revalidacion al abrir
const cfg = () => JSON.parse(sessionStorage.getItem('configCarrito'));
const en = () => Number(sessionStorage.getItem('configCarritoEn'));
ver('4. configuracion sin hora (pestaña anterior): cuenta como leida al cargar, sin consultas',
  pedidosConfig === 0 && en() > 0 && Date.now() - en() < 60e3, { pedidosConfig, en: en() });
w.CarritoPanel.abrir(); await tick();
ver('4. antes de 30 minutos: abrir no consulta', pedidosConfig === 0);
w.CarritoPanel.cerrar();
// Vencida: abre enseguida con la guardada y revalida en segundo plano
const CONFIG1 = { ...CONFIG0, catalogoObservaciones: [{ clave: '170', codigo: '170', texto: 'NUEVA', grupo: 'condiciones', efecto: 'entrega' }] };
let soltar;
configServidor = () => new Promise(r => { soltar = () => r(JSON.parse(JSON.stringify(CONFIG1))); });
sessionStorage.setItem('configCarritoEn', String(Date.now() - 31 * 60e3));
w.CarritoPanel.abrir();
ver('4. vencida: el panel se dibuja enseguida, sin esperar al servidor', !!$('#carrito-panel .cp-cab'));
$('#carrito-panel .cp-caja')?.setAttribute('data-marca', 'vieja');
await tick();
ver('4. vencida: una consulta en segundo plano', pedidosConfig === 1, pedidosConfig);
soltar?.(); await tick(20);
ver('4. llega la nueva: se guarda con su hora', cfg().catalogoObservaciones?.[0]?.texto === 'NUEVA' && Date.now() - en() < 60e3);
ver('4. llega la nueva: el panel abierto se redibuja', !$('#carrito-panel .cp-caja[data-marca="vieja"]') && !!$('#carrito-panel .cp-cab'));
w.CarritoPanel.cerrar();
w.CarritoPanel.abrir(); await tick(20);
ver('4. recien revalidada: abrir otra vez no consulta', pedidosConfig === 1);
w.CarritoPanel.cerrar();
// Falla: queda la anterior, sin reintentos
configServidor = () => { throw new Error('sin conexion (simulada)'); };
sessionStorage.setItem('configCarritoEn', String(Date.now() - 31 * 60e3));
const guardada = sessionStorage.getItem('configCarrito');
w.CarritoPanel.abrir(); await tick(30);
await new Promise(r => setTimeout(r, 100)); await tick();
ver('4. falla: queda la anterior y no se reintenta', pedidosConfig === 2 && sessionStorage.getItem('configCarrito') === guardada, pedidosConfig);
w.CarritoPanel.cerrar();
// Con una hoja abierta (por ejemplo, la de observaciones) no se redibuja debajo
configServidor = () => ({ ...CONFIG1, catalogoObservaciones: [{ clave: '171', codigo: '171', texto: 'OTRA', grupo: 'condiciones', efecto: 'informativa' }] });
sessionStorage.setItem('configCarritoEn', String(Date.now() - 31 * 60e3));
w.CarritoPanel.abrir();
$('#carrito-panel .cp-caja')?.setAttribute('data-marca', 'vieja');
const hoja = document.createElement('div'); hoja.className = 'hj-fondo'; document.body.appendChild(hoja);
await tick(20);
ver('4. con una hoja abierta: guarda la nueva pero no redibuja debajo',
  pedidosConfig === 3 && cfg().catalogoObservaciones?.[0]?.texto === 'OTRA' && !!$('#carrito-panel .cp-caja[data-marca="vieja"]'), pedidosConfig);
hoja.remove();
w.CarritoPanel.cerrar();

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
