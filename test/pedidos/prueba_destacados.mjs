// PRUEBA DE LA FRESCURA DE LOS DESTACADOS con jsdom: la revision de
// json/version.json (js/frescura-precios.js) detecta que cambio
// catalogo_grupos.json, guarda la lista nueva en clientData y repinta la
// galeria en el lugar, sin recargar y sin interrumpir al usuario
// (js/destacados.js). Modulos reales: frescura-precios, destacados y
// datos-catalogo. productManager, Precios, Fotos, HistorialCliente y el layout
// de la galeria son simulados; los datos son sinteticos.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_destacados.mjs
import { existsSync } from 'fs';
import { join } from 'path';
import { RAIZ, JSDOM, prepararModulos } from './preparar.mjs';

// Sin destacados.js (control con el codigo anterior) se prueba igual lo que hay
const modulos = ['frescura-precios.js', 'datos-catalogo.js'];
if (existsSync(join(RAIZ, 'js', 'destacados.js'))) modulos.push('destacados.js');
const importar = prepararModulos(modulos);

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };
const esperar = ms => new Promise(r => setTimeout(r, ms));

// ---------- pagina: 25 tarjetas como las de catalogo.html ----------
const cod = n => 'A' + String(n).padStart(2, '0');
const tarjeta = c => `<div class="gallery-item" data-product-code="${c}"><div class="container-img"><img alt="">` +
  `<div class="top-row"><a href="">${c.toLowerCase()} nombre</a></div>` +
  `<div class="bottom-row"><a href="">${c}</a><span class="price-tag"></span></div></div></div>`;
const dom = new JSDOM(`<!doctype html><html><body>
  <nav><input type="text" placeholder="Buscar en catálogo de productos..."></nav>
  <div class="gallery-container">${Array.from({ length: 25 }, (_, i) => tarjeta(cod(i + 1))).join('')}</div>
</body></html>`, { url: 'https://ferremax.test/catalogo.html', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement', 'Node'])
  globalThis[k] = k === 'window' ? w : w[k];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const galeria = $('.gallery-container');
const items = () => $$('.gallery-container .gallery-item');
const visibles = () => items().filter(i => i.style.display !== 'none');
const codigos = () => visibles().map(i => i.dataset.productCode);
let scrollY = 0;
Object.defineProperty(w, 'scrollY', { get: () => scrollY, configurable: true });

// ---------- catalogo, fotos y archivos del servidor ----------
const producto = (c, precio) => ({ name: c + ' NOMBRE', category: 'x', bulk: 1, prices: { D: precio, E: precio, F: precio } });
let productos = {};
for (let i = 1; i <= 40; i++) productos[cod(i)] = producto(cod(i), i);
for (const c of ['B01', 'B02', 'B04', 'B06', 'B07', 'B08', 'B09']) productos[c] = producto(c, 500);
// B03 no esta en productos.json: sin nombre ni precio
const fotos = { images: Object.fromEntries([...Array.from({ length: 40 }, (_, i) => cod(i + 1)), 'B02'].map(c => [c, 'I' + c])) };

const ahora = Date.now();
const iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
let version = {
  productos: { huella: 'p1', generado: iso(ahora - 2 * 3600e3) },
  indice: { huella: 'v2-x' },
  catalogo_grupos: { huella: 'g0', generado: iso(ahora - 3600e3) }
};
let grupos = {};              // huella -> contenido de catalogo_grupos.json
let estadoGrupos = {};        // huella -> status HTTP
let alBajarGrupos = null;     // se llama al servir catalogo_grupos.json
const pedidos = [];
globalThis.fetch = async (url) => {
  url = String(url);
  pedidos.push(url);
  const resp = (datos, status = 200) => ({ ok: status === 200, status, json: async () => JSON.parse(JSON.stringify(datos)) });
  if (url.includes('version.json')) return resp(version);
  if (url.includes('catalogo_grupos.json')) {
    const h = new URL(url, 'https://x/').searchParams.get('v');
    alBajarGrupos?.();
    return resp(grupos[h] || {}, estadoGrupos[h] || 200);
  }
  if (url.includes('productos.json')) return resp(productos);
  if (url.includes('catalogo_imagenes.json')) return resp(fotos);
  throw new Error('url inesperada ' + url);
};
const bajadas = filtro => pedidos.filter(u => u.includes(filtro)).length;

// ---------- usuario con sesion iniciada ----------
const listaInicial = Array.from({ length: 30 }, (_, i) => cod(i + 1));
localStorage.setItem('clientData', JSON.stringify({
  account: '7', name: 'Usuario', groups: ['G1'], priceList: 'D', productCodes: listaInicial, lastLogin: new Date(ahora).toISOString()
}));
sessionStorage.setItem('productos_cargados', String(ahora));
const cd = () => JSON.parse(localStorage.getItem('clientData'));

// ---------- productManager simulado (lo que usan frescura y destacados) ----------
const mapa = new Map(listaInicial.map(c => [c, { codigo: c, nombre: productos[c].name, precios: productos[c].prices }]));
let guardados = 0, actualizados = 0;
const cargas = [];
w.productManager = {
  products: mapa,
  clientData: { ...cd() },
  getProduct: c => mapa.get(String(c).toUpperCase()) || null,
  actualizarDesde: d => {
    actualizados++;
    for (const [c, p] of mapa) if (d[c]) p.precios = d[c].prices;
    return { actualizados: mapa.size, cambios: [] };
  },
  guardarEstado: () => { guardados++; }
};
// Como el real: lee el productos.json compartido y suma los que encuentra
w.productManagerInstance = {
  loadSpecificProducts: async lista => {
    cargas.push([...lista]);
    const d = await w.DatosCatalogo.productos();
    lista.forEach(c => { const p = d[c]; if (p) mapa.set(c, { codigo: c, nombre: p.name, precios: p.prices }); });
    return {};
  }
};

// Precios: como el real, sin precio devuelve false sin tocar el carrito ni la cinta
const promos = new Set(['A05']);
w.Precios = {
  pintarPrecio: (tag, sku) => {
    const p = w.productManager.getProduct(sku);
    if (!p?.precios) { tag.textContent = ''; return false; }
    tag.textContent = '$' + p.precios.D;
    tag.dataset.sku = sku;
    const cont = tag.parentElement.parentElement;
    let btn = cont.querySelector(':scope > .btn-carrito');
    if (!btn) { btn = document.createElement('button'); btn.className = 'btn-carrito'; cont.appendChild(btn); }
    btn.dataset.sku = sku;
    let cinta = cont.querySelector(':scope > .cinta-promo');
    if (promos.has(sku)) { if (!cinta) { cinta = document.createElement('div'); cinta.className = 'cinta-promo'; cont.appendChild(cinta); } }
    else cinta?.remove();
    return true;
  },
  repintarTodos: () => 0
};
let fotosPuestas = 0;
w.Fotos = {
  poner: (img, id) => { fotosPuestas++; img.setAttribute('src', 'foto:' + id); },
  quitar: img => { img.setAttribute('src', ''); }
};
const historial = [];
w.HistorialCliente = { pintar: item => historial.push(item.dataset.productCode) };
let layouts = 0;
w.applyPinterestLayout = () => { layouts++; };

// Lo que deja cargarGaleria al cargar: precio, carrito, cinta y foto de cada tarjeta
items().forEach(it => {
  w.Precios.pintarPrecio(it.querySelector('.price-tag'), it.dataset.productCode);
  w.Fotos.poner(it.querySelector('img'), 'I' + it.dataset.productCode);
});
items()[3].dataset.historial = '1';
fotosPuestas = 0;

let leidas = [];
document.addEventListener('version:leida', e => leidas.push(e.detail));

await importar('datos-catalogo.js');
await importar('frescura-precios.js');
const revisar = async () => { await w.FrescuraPrecios.revisar(); await tick(); };
const nuevaVersion = (h, gen = ahora + 1000) => { version = { ...version, catalogo_grupos: { huella: h, generado: iso(gen) } }; };

// ---------- 1 y 2. Base sin descarga, y sin cambios ----------
await revisar();
ver('2. base: sesion iniciada despues del cambio, no descarga catalogo_grupos.json', bajadas('catalogo_grupos') === 0, JSON.stringify(pedidos));
ver('2. base: anota la huella en clientData', cd().productCodesHuella === 'g0', JSON.stringify(cd().productCodesHuella));
ver('2. base: la galeria no cambia', codigos().join() === listaInicial.slice(0, 25).join() && layouts === 0);
pedidos.length = 0;
await revisar();
ver('1. sin cambios: solo version.json', pedidos.length === 1 && pedidos[0].includes('version.json'), JSON.stringify(pedidos));
ver('16. version:leida una vez por revision, con la clave nueva', leidas.length === 2 && leidas[1].catalogo_grupos?.huella === 'g0' && leidas[1].indice?.huella === 'v2-x');

// ---------- 3, 4 y 5. Cambio: descarga, guarda y repinta en el lugar ----------
// index 2: B01 (nuevo, sin foto); 4: B03 (sin producto, antes A05 con promo); 6: B02 (nuevo con foto)
const l1 = listaInicial.slice(0, 22).map((c, i) => (i === 2 ? 'B01' : i === 4 ? 'B03' : i === 6 ? 'b02' : c));
grupos.g1 = { G1: l1, OTRO: ['A40'] };
nuevaVersion('g1');
pedidos.length = 0;
const imgA01 = items()[0].querySelector('img');
await revisar();
ver('3. baja catalogo_grupos.json?v=g1 una vez', bajadas('catalogo_grupos.json?v=g1') === 1 && bajadas('catalogo_grupos') === 1, JSON.stringify(pedidos));
ver('3. clientData con la lista y la huella nuevas', JSON.stringify(cd().productCodes) === JSON.stringify(l1) && cd().productCodesHuella === 'g1');
ver('3. clientData conserva lo demas', cd().account === '7' && cd().priceList === 'D' && cd().lastLogin);
ver('3. productManager.clientData con la lista nueva', w.productManager.clientData.productCodes === l1 || JSON.stringify(w.productManager.clientData.productCodes) === JSON.stringify(l1));
ver('3. loadSpecificProducts solo con los que faltan', JSON.stringify(cargas) === JSON.stringify([['B01', 'B03', 'b02']]), JSON.stringify(cargas));
ver('3. guarda el estado de productManager', guardados === 1);
const it = items();
ver('4. codigos en el lugar, en orden', codigos().join() === l1.map(c => c.toUpperCase()).join(), codigos().join());
ver('4. nombre y precio del nuevo', it[2].querySelector('.top-row a').textContent === 'b01 nombre' &&
  it[2].querySelector('.bottom-row a').textContent === 'B01' && it[2].querySelector('.price-tag').textContent === '$500');
ver('4. foto nueva (B02) y quitada si no tiene (B01)', it[6].querySelector('img').getAttribute('src') === 'foto:IB02' &&
  it[2].querySelector('img').getAttribute('src') === '', it[2].querySelector('img').getAttribute('src'));
ver('4. solo se tocan las tarjetas que cambiaron (una foto puesta, A01 intacta)', fotosPuestas === 1 && items()[0].querySelector('img') === imgA01 &&
  imgA01.getAttribute('src') === 'foto:IA01', String(fotosPuestas));
ver('4. las que sobran quedan ocultas', visibles().length === 22 && items().slice(22).every(i => i.style.display === 'none'));
ver('4. una sola pasada del layout', layouts === 1, String(layouts));
ver('4. "Comprado" solo en la tarjeta que lo usa y no cambio: no se llama', historial.length === 0);
ver('5. sin precio: sin nombre, sin carrito, sin cinta y sin data-sku del anterior',
  it[4].querySelector('.top-row a').textContent === '' && !it[4].querySelector('.btn-carrito') &&
  !it[4].querySelector('.cinta-promo') && !it[4].querySelector('.price-tag').dataset.sku && it[4].querySelector('.price-tag').textContent === '');
ver('5. el carrito de las demas sigue con su codigo', it[2].querySelector('.btn-carrito').dataset.sku === 'B01');
ver('6. el scroll sigue con la lista nueva', w.allProducts?.length === 22 && w.allProducts[2] === 'B01');

// ---------- 7. Otro orden: repinta; la misma lista: no ----------
const l2 = [l1[1], l1[0], ...l1.slice(2)];
grupos.g2 = { G1: l2 };
nuevaVersion('g2');
await revisar();
ver('7. otro orden: repinta en el orden nuevo', codigos().slice(0, 2).join() === 'A02,A01' && layouts === 2);
grupos.g3 = { G1: [...l2] };
nuevaVersion('g3');
pedidos.length = 0;
await revisar();
ver('7. misma lista con otra huella: descarga, anota y no repinta', bajadas('catalogo_grupos') === 1 && cd().productCodesHuella === 'g3' && layouts === 2);

// ---------- 6. Lista mas larga que las tarjetas ----------
const l4 = [...l2, ...Array.from({ length: 8 }, (_, i) => cod(31 + i))];
grupos.g4 = { G1: l4 };
nuevaVersion('g4');
await revisar();
ver('6. mas larga: las ocultas vuelven con los codigos nuevos', visibles().length === 25 && codigos()[22] === 'A31', codigos().slice(20).join());
ver('6. allProducts con la lista completa para el scroll', w.allProducts.length === 30 && w.allProducts[29] === 'A38');

// ---------- 8. Con una busqueda escrita ----------
const l5 = ['B04', ...l4.slice(1)];
grupos.g5 = { G1: l5 };
nuevaVersion('g5');
$('nav input').value = 'taladro';
await revisar();
ver('8. con busqueda: no repinta', codigos()[0] === 'A02' && w.Destacados.pendientes()?.[0] === 'B04');
ver('8. con busqueda: la lista ya queda guardada', cd().productCodes[0] === 'B04' && cd().productCodesHuella === 'g5');
$('nav input').value = '';
w.Destacados.intentarPintar(); await tick();
ver('8. al vaciar la busqueda, se pinta', codigos()[0] === 'B04' && !w.Destacados.pendientes());

// ---------- 9. Modo clientes: la galeria guardada y vuelta a poner ----------
const l6 = ['B06', ...l5.slice(1)];
grupos.g6 = { G1: l6 };
nuevaVersion('g6');
document.body.classList.add('modo-busqueda-clientes');
const copia = galeria.innerHTML; galeria.innerHTML = '';
await revisar();
ver('9. modo clientes: no pinta', w.Destacados.pendientes()?.[0] === 'B06' && galeria.children.length === 0);
document.body.classList.remove('modo-busqueda-clientes');
galeria.innerHTML = copia;   // desactivar() restaura la galeria vieja
w.Destacados.intentarPintar(); await tick();
ver('9. al volver, el reintento repinta la galeria restaurada', codigos()[0] === 'B06' && !w.Destacados.pendientes());

// ---------- 10. No interrumpe ----------
const l7 = ['B07', ...l6.slice(1)];
grupos.g7 = { G1: l7 };
nuevaVersion('g7');
w.dispatchEvent(new w.Event('pointerdown'));
await revisar();
ver('10. tocado hace menos de 1,5 s: queda pendiente', codigos()[0] === 'B06' && w.Destacados.pendientes()?.[0] === 'B07');
await esperar(1600);
scrollY = 2000;
w.Destacados.intentarPintar(); await tick();
ver('10. scroll abajo: sigue pendiente', codigos()[0] === 'B06');
scrollY = 0;
const boton = document.createElement('button');
items()[5].querySelector('.container-img').appendChild(boton);
boton.focus();
w.Destacados.intentarPintar(); await tick();
ver('10. foco en una tarjeta: sigue pendiente', codigos()[0] === 'B06');
boton.blur(); boton.remove();
w.Destacados.intentarPintar(); await tick();
ver('10. quieto, arriba y sin foco: pinta', codigos()[0] === 'B07');
// Carrito abierto: la revision entera se posterga, como hoy
const panel = document.createElement('div'); panel.id = 'carrito-panel'; panel.style.display = 'flex';
document.body.appendChild(panel);
pedidos.length = 0;
await revisar();
ver('10. con el carrito abierto no se lee version.json', pedidos.length === 0);
panel.remove();

// ---------- 11. Galeria vaciada con la X ----------
const l8 = ['B08', ...l7.slice(1)];
grupos.g8 = { G1: l8 };
nuevaVersion('g8');
items().forEach(i => { i.style.display = 'none'; });
await revisar();
ver('11. galeria vaciada: no la vuelve a mostrar', visibles().length === 0 && w.Destacados.pendientes()?.[0] === 'B08');
items().forEach(i => { i.style.display = ''; });
w.Destacados.intentarPintar(); await tick();
ver('11. cuando vuelve a mostrarse, se pinta', codigos()[0] === 'B08');

// ---------- 12. Otra pestaña ya la guardo ----------
const l9 = ['B09', ...l8.slice(1)];
localStorage.setItem('clientData', JSON.stringify({ ...cd(), productCodes: l9, productCodesHuella: 'g9' }));
nuevaVersion('g9');
pedidos.length = 0;
await revisar();
ver('12. otra pestaña: no descarga', bajadas('catalogo_grupos') === 0, JSON.stringify(pedidos));
ver('12. otra pestaña: repinta igual', codigos()[0] === 'B09');

// ---------- 13. Cambio de cuenta durante la descarga ----------
grupos.g10 = { G1: ['A01', ...l9.slice(1)] };
nuevaVersion('g10');
alBajarGrupos = () => localStorage.setItem('clientData', JSON.stringify({ ...cd(), account: '8' }));
await revisar();
alBajarGrupos = null;
ver('13. otra cuenta: no escribe nada', cd().account === '8' && cd().productCodesHuella === 'g9' && cd().productCodes[0] === 'B09');
ver('13. otra cuenta: no repinta', codigos()[0] === 'B09');
localStorage.setItem('clientData', JSON.stringify({ ...cd(), account: '7' }));

// ---------- 14. Grupo vacio o ausente, y error HTTP ----------
grupos.g11 = { OTRO: ['A01'] };
nuevaVersion('g11');
const antes11 = localStorage.getItem('clientData');
await revisar();
ver('14. grupo ausente: clientData y galeria iguales', localStorage.getItem('clientData') === antes11 && codigos()[0] === 'B09');
pedidos.length = 0;
await revisar();
ver('14. grupo ausente: no vuelve a descargarlo', bajadas('catalogo_grupos') === 0);
grupos.g12 = { G1: [] };
nuevaVersion('g12');
await revisar();
ver('14. grupo vacio: no deja la galeria vacia', localStorage.getItem('clientData') === antes11 && visibles().length === 25);
estadoGrupos.g13 = 500;
grupos.g13 = { G1: ['A01', ...l9.slice(1)] };
nuevaVersion('g13');
pedidos.length = 0;
await revisar();
ver('14. HTTP 500: nada cambia', localStorage.getItem('clientData') === antes11 && codigos()[0] === 'B09');
estadoGrupos.g13 = 200;
await revisar();
ver('14. HTTP 500: la proxima revision reintenta', bajadas('catalogo_grupos.json?v=g13') === 2 && codigos()[0] === 'A01');

// ---------- 15. Precios y destacados cambian juntos ----------
productos = { ...productos, B05: producto('B05', 999) };
version = { ...version, productos: { huella: 'p2', generado: iso(Date.now()) } };
grupos.g14 = { G1: ['B05', ...l9.slice(1)] };
nuevaVersion('g14');
pedidos.length = 0;
await revisar();
const iP = pedidos.findIndex(u => u.includes('productos.json?v=p2')), iG = pedidos.findIndex(u => u.includes('catalogo_grupos.json?v=g14'));
ver('15. primero productos.json, despues catalogo_grupos.json', iP > -1 && iG > iP && actualizados === 1, JSON.stringify(pedidos));
ver('15. el destacado nuevo toma el precio nuevo', codigos()[0] === 'B05' && items()[0].querySelector('.price-tag').textContent === '$999');

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
