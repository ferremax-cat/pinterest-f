// PRUEBA DE LAS FOTOS (js/fotos.js) con jsdom, y GUARDIA DE LA GALERIA.
//
// 1. WebP: la deteccion (una imagen WebP de 1 x 1, simulada con un Image
//    falso) decide si las direcciones llevan -rw. Mientras no termina, o si
//    el navegador no lo soporta, salen como siempre. Si una foto -rw no carga,
//    un reintento sin -rw y recien despues el reemplazo.
// 2. Guardia: el 240px final de la pista "sizes" sale de la cuenta
//    max-width de .gallery-container (1260) / 5 columnas - 20 de separacion.
//    Falla si cambia el max-width (en cualquier hoja que carga catalogo.html
//    o en los estilos que inyecta), las columnas o la separacion de
//    positionPinterestLayout, o el box-sizing; asi el error salta aca y no en
//    la pantalla de un cliente (fotos borrosas o de mas). La guardia se prueba
//    a si misma contra textos alterados.
// 3. La pagina: sin XLSX, la plantilla de busqueda y el ultimo recurso de
//    catalogo.html usan Fotos, y las miniaturas de 120 piden por Fotos.url.
//
// Solo lee archivos del proyecto. Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_fotos.mjs
import { readFileSync } from 'fs';
import { join } from 'path';
import { RAIZ, JSDOM } from './preparar.mjs';

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const leer = r => readFileSync(join(RAIZ, r), 'utf8');

const BASE = 'https://lh3.googleusercontent.com/d/';
const FOTOS = leer('js/fotos.js');

/** Una pagina con fotos.js cargado; pruebas: las Image que creo (la deteccion) */
function pagina() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://ferremax.test/catalogo.html', runScripts: 'outside-only' });
  const w = dom.window;
  const pruebas = [];
  w.Image = class { constructor() { pruebas.push(this); } };
  w.eval(FOTOS);
  return { w, pruebas, img: () => w.document.createElement('img') };
}

// =====================================================================
// 1. WebP
{
  const { w, pruebas, img } = pagina();
  const F = w.Fotos;
  ver('1 la deteccion se hace una sola vez, con una imagen WebP incrustada', pruebas.length === 1 &&
    String(pruebas[0].src).startsWith('data:image/webp;base64,'), pruebas.length);
  ver('1 antes de terminar la deteccion: sin -rw', F.url('ID1', 240) === BASE + 'ID1=w240', F.url('ID1', 240));
  const temprana = img();
  F.poner(temprana, 'ID0', 0);
  ver('1 una foto puesta antes de terminar: srcset sin -rw', !temprana.getAttribute('srcset').includes('-rw'));

  pruebas[0].width = 1;
  pruebas[0].onload();
  ver('1 con WebP: =w240-rw', F.url('ID1', 240) === BASE + 'ID1=w240-rw', F.url('ID1', 240));
  ver('1 miniatura de 120 con WebP', F.url('ID1', 120) === BASE + 'ID1=w120-rw');
  ver('1 sin ancho: la direccion sola (sin -rw)', F.url('ID1') === BASE + 'ID1');
  ver('1 la foto puesta antes sigue como estaba', !temprana.getAttribute('srcset').includes('-rw'));

  // poner
  const a = img();
  F.poner(a, 'ID2', 0);
  const srcset = a.getAttribute('srcset');
  ver('1 poner: srcset con los tres anchos, todos con -rw', srcset ===
    `${BASE}ID2=w240-rw 240w, ${BASE}ID2=w360-rw 360w, ${BASE}ID2=w480-rw 480w`, srcset);
  ver('1 poner: src de respaldo =w480-rw', a.getAttribute('src') === BASE + 'ID2=w480-rw');
  ver('1 poner: guarda el id para el reintento', a.dataset.fotoId === 'ID2');
  ver('1 poner: inmediata las primeras, diferida despues', a.loading === 'eager' &&
    (() => { const b = img(); F.poner(b, 'X', 20); return b.loading === 'lazy'; })());

  // fallo: reintento sin -rw, despues el reemplazo
  a.onerror();
  ver('1 primer fallo: reintento sin -rw en srcset y src', a.getAttribute('srcset') ===
    `${BASE}ID2=w240 240w, ${BASE}ID2=w360 360w, ${BASE}ID2=w480 480w` &&
    a.getAttribute('src') === BASE + 'ID2=w480' && a.dataset.fotoSinWebp === '1', a.getAttribute('srcset'));
  ver('1 primer fallo: sigue esperando otro error', typeof a.onerror === 'function');
  a.onerror();
  ver('1 segundo fallo: el reemplazo, sin srcset ni sizes', a.getAttribute('src') === 'img/no-img.png' &&
    !a.hasAttribute('srcset') && !a.hasAttribute('sizes') && a.onerror === null);

  // poner de nuevo en el mismo <img> (otra tarjeta): vuelve a intentar con WebP
  F.poner(a, 'ID3', 0);
  ver('1 poner otra vez: limpia el reintento anterior', !a.dataset.fotoSinWebp && a.getAttribute('src') === BASE + 'ID3=w480-rw');

  // atributos (plantilla de busqueda, armada con innerHTML)
  const cont = w.document.createElement('div');
  cont.innerHTML = `<img alt="x" ${F.atributos('ID4', 0)} onerror="window.Fotos.fallo(this)">`;
  const t = cont.querySelector('img');
  ver('1 atributos: data-foto-id, sizes y srcset con -rw', t.dataset.fotoId === 'ID4' &&
    t.getAttribute('sizes') === a.getAttribute('sizes') && t.getAttribute('srcset').includes('ID4=w240-rw 240w'));
  F.fallo(t);
  ver('1 atributos + fallo: reintento sin -rw', t.getAttribute('src') === BASE + 'ID4=w480' && !t.getAttribute('srcset').includes('-rw'));
  F.fallo(t);
  ver('1 atributos + segundo fallo: el reemplazo', t.getAttribute('src') === 'img/no-img.png');

  // Sin id (la plantilla sin foto) o sin -rw: directo al reemplazo
  const s = img();
  s.setAttribute('src', 'img/no-img.png');
  F.fallo(s);
  ver('1 fallo sin id: el reemplazo, sin reintentos', s.getAttribute('src') === 'img/no-img.png' && s.onerror === null);

  // quitar: una tarjeta clonada no hereda nada
  const q = img();
  F.poner(q, 'ID5', 0);
  F.quitar(q);
  ver('1 quitar: sin foto, sin id, sin srcset', !q.dataset.fotoId && !q.hasAttribute('srcset') && q.getAttribute('src') === '');
}

{
  // Navegador sin WebP: la prueba da error (o carga sin tamano): todo como hoy
  const { w, pruebas, img } = pagina();
  pruebas[0].onerror?.();
  ver('1 sin WebP (error): sin -rw', w.Fotos.url('ID1', 240) === BASE + 'ID1=w240');
  const a = img();
  w.Fotos.poner(a, 'ID6', 0);
  ver('1 sin WebP: srcset de siempre', a.getAttribute('srcset') === `${BASE}ID6=w240 240w, ${BASE}ID6=w360 360w, ${BASE}ID6=w480 480w`);
  a.onerror();
  ver('1 sin WebP: un fallo va directo al reemplazo (no hay -rw que sacar)', a.getAttribute('src') === 'img/no-img.png');

  const otra = pagina();
  otra.pruebas[0].width = 0;
  otra.pruebas[0].onload();
  ver('1 la prueba carga sin tamano: sin -rw', otra.w.Fotos.url('ID1', 240) === BASE + 'ID1=w240');
}

// =====================================================================
// 2. Guardia de la galeria
const ESPERADO = { maxWidth: 1260, columnas: 5, separacion: 20, tope: 240 };

/** Reglas { selector, cuerpo, en, nivel, medios } de .gallery-container de un texto (CSS, o HTML
 *  con estilos inyectados). medios: los encabezados de los bloques que la contienen (@media ...) */
function reglasGaleria(texto, nombre) {
  const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
  // Encabezado de cada llave abierta, para saber dentro de que @media esta cada regla
  const abiertas = [], encabezadoEn = new Map();
  let desde = 0;
  for (let i = 0; i < sinComentarios.length; i++) {
    const ch = sinComentarios[i];
    if (ch === '{') { abiertas.push(sinComentarios.slice(desde, i).split(/[;`]/).pop().trim()); desde = i + 1; encabezadoEn.set(i, [...abiertas]); }
    else if (ch === '}') { abiertas.pop(); desde = i + 1; }
    else if (ch === ';') desde = i + 1;
  }
  const res = [];
  for (const m of sinComentarios.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1].split(/[;`]/).pop().trim();
    if (!selector.split(',').some(s => /\.gallery-container$/.test(s.trim()))) continue;
    const llave = m.index + m[0].indexOf('{');
    const medios = (encabezadoEn.get(llave) || []).slice(0, -1);
    res.push({ selector, cuerpo: m[2], en: nombre, nivel: medios.length, medios });
  }
  return res;
}

/** La regla puede regir con ventanas de mas de 1260 px: no esta dentro de un @media (max-width: N) con N <= 1260 */
const rigeEnGrande = r => !r.medios.some(e => /^@media/.test(e) &&
  [...e.matchAll(/max-width\s*:\s*(\d+)px/g)].some(m => Number(m[1]) <= ESPERADO.maxWidth));

/** Columnas y separacion de positionPinterestLayout (catalogo.html), con su propio codigo */
function columnasDe(html) {
  const ini = html.indexOf('function positionPinterestLayout');
  const desde = html.indexOf('let columnCount', ini);
  const gap = html.indexOf('const gap', desde);
  const hasta = html.indexOf(';', gap) + 1;
  if (ini < 0 || desde < 0 || gap < 0) return null;
  const codigo = html.slice(desde, hasta).replace('window.innerWidth', 'anchoVentana');
  return new Function('anchoVentana', codigo + '\nreturn [columnCount, gap];');
}

/** La pista sizes de js/fotos.js, tal cual */
function sizesDe(fotos) {
  const m = fotos.match(/const SIZES = ([\s\S]*?);\r?\n/);
  return m ? new Function('return ' + m[1])() : null;
}

/** Problemas (lista vacia: todo en orden). css: { nombre: texto } de las hojas que carga catalogo.html */
function guardia(css, html, fotos) {
  const p = [];
  const hoja = css['estilos-copia.css'] || '';
  if (!/\*\s*\{[^}]*box-sizing:\s*border-box/.test(hoja))
    p.push('estilos-copia.css: falta box-sizing: border-box en la regla *, y la cuenta lo supone');

  // max-width que rige con ventanas de mas de 1260 px (donde vale el 240px):
  // uno solo, 1260px, en el nivel de arriba de estilos-copia.css. Los de un
  // @media (max-width: 460px), por ejemplo, no participan de la cuenta
  const reglas = [...Object.entries(css).flatMap(([n, t]) => reglasGaleria(t, n)), ...reglasGaleria(html, 'catalogo.html')]
    .filter(rigeEnGrande);
  const maximos = reglas.flatMap(r => [...r.cuerpo.matchAll(/max-width\s*:\s*([^;!]+)/g)]
    .map(m => ({ valor: m[1].trim(), en: r.en, nivel: r.nivel })));
  if (maximos.length !== 1) p.push(`max-width de .gallery-container: ${maximos.length} declaraciones (se espera una): ` +
    maximos.map(m => `${m.valor} en ${m.en}`).join(', '));
  const max = maximos.find(m => m.en === 'estilos-copia.css' && m.nivel === 0);
  const maxWidth = max ? parseFloat(max.valor) : NaN;
  if (!max || max.valor !== `${ESPERADO.maxWidth}px`)
    p.push(`max-width de .gallery-container en estilos-copia.css: ${max ? max.valor : 'no esta'} (la cuenta usa ${ESPERADO.maxWidth}px)`);

  // Columnas y separacion: las mismas que la pista sizes, de a una franja
  const calc = columnasDe(html);
  if (!calc) p.push('catalogo.html: no se encontro la cuenta de columnas de positionPinterestLayout');
  else {
    const franjas = [[320, 2], [576, 2], [577, 3], [920, 3], [921, 4], [1000, 4], [1001, 5], [1260, 5], [1261, 5], [2560, 5]];
    for (const [ancho, col] of franjas) {
      const [c] = calc(ancho);
      if (c !== col) p.push(`positionPinterestLayout: ${c} columnas con ${ancho}px (la pista sizes supone ${col})`);
    }
    const [col, sep] = calc(ESPERADO.maxWidth + 1);
    if (sep !== ESPERADO.separacion) p.push(`positionPinterestLayout: separacion de ${sep}px con mas de 770 (la cuenta usa ${ESPERADO.separacion})`);
    // La cuenta, con los valores reales: el tope tiene que alcanzar y no sobrar
    const tarjeta = maxWidth / col - sep;
    const tope = parseFloat((sizesDe(fotos) || '').split(',').pop());
    if (!(tope >= tarjeta && tope - tarjeta < 20))
      p.push(`tope de sizes ${tope}px para una tarjeta de ${tarjeta}px (${maxWidth} / ${col} - ${sep}): rehacer la cuenta`);
  }
  const sizes = sizesDe(fotos) || '';
  if (!sizes.endsWith(`(max-width: ${ESPERADO.maxWidth}px) 20vw, ${ESPERADO.tope}px`))
    p.push(`js/fotos.js: la pista sizes no termina en "(max-width: ${ESPERADO.maxWidth}px) 20vw, ${ESPERADO.tope}px": ${sizes}`);
  return p;
}

const html = leer('catalogo.html');
const hojas = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1])
  .filter(h => !/^https?:/.test(h) && !h.includes('fontawesome'));
const css = Object.fromEntries(hojas.map(h => [h.replace(/^\.\//, ''), leer(h.replace(/^\.\//, ''))]));
ver('2 catalogo.html carga estilos-copia.css (de donde sale el max-width)', 'estilos-copia.css' in css, hojas);

const problemas = guardia(css, html, FOTOS);
ver('2 GUARDIA: la cuenta del 240px de sizes se sostiene', problemas.length === 0, '\n   ' + problemas.join('\n   '));

// La guardia se prueba a si misma: cada alteracion tiene que hacerla fallar
const conCss = (cambio) => ({ ...css, 'estilos-copia.css': cambio(css['estilos-copia.css']) });
const alteraciones = {
  'max-width 1400 en estilos-copia.css': [conCss(t => t.replace('max-width: 1260px', 'max-width: 1400px')), html, FOTOS],
  'sin max-width': [conCss(t => t.replace('max-width: 1260px;', '')), html, FOTOS],
  'otro max-width en un @media (min-width: 1500px)': [conCss(t => t + '\n@media (min-width: 1500px) { .gallery-container { max-width: 1600px; } }'), html, FOTOS],
  'otro max-width en un @media (max-width: 1300px)': [conCss(t => t + '\n@media screen and (max-width: 1300px) { .gallery-container { max-width: 1280px; } }'), html, FOTOS],
  'max-width en los estilos inyectados': [css, html.replace('.gallery-container {\r\n                    position: relative;',
    '.gallery-container {\r\n                    max-width: 1400px;\r\n                    position: relative;'), FOTOS],
  'box-sizing content-box': [conCss(t => t.replace('box-sizing: border-box;', 'box-sizing: content-box;')), html, FOTOS],
  '6 columnas desde 1000px': [css, html.replace('columnCount = 5; // 5 columnas a partir de 1000px', 'columnCount = 6;'), FOTOS],
  '4 columnas hasta 1100px': [css, html.replace('windowWidth <= 1000)', 'windowWidth <= 1100)'), FOTOS],
  'separacion de 30px': [css, html.replace('(windowWidth <= 770) ? 10 : 20', '(windowWidth <= 770) ? 10 : 30'), FOTOS],
  'tope de 200px en sizes': [css, html, FOTOS.replace("20vw, 240px'", "20vw, 200px'")],
};
// Y lo que NO tiene que detectar: un max-width solo para pantallas chicas
ver('2 la guardia ignora un max-width de un @media (max-width: 900px)',
  guardia(conCss(t => t + '\n@media (max-width: 900px) { .gallery-container { max-width: 5000px; } }'), html, FOTOS).length === 0);
for (const [nombre, [c, h, f]] of Object.entries(alteraciones)) {
  const alterado = h !== html || f !== FOTOS || c['estilos-copia.css'] !== css['estilos-copia.css'];
  ver(`2 la guardia detecta: ${nombre}`, alterado && guardia(c, h, f).length > 0,
    alterado ? 'no lo detecto' : 'la alteracion no encontro el texto a cambiar');
}

// =====================================================================
// 3. La pagina
ver('3 catalogo.html no carga XLSX', !/xlsx/i.test(html));
const busqueda = leer('js/search/search-engine.js');
ver('3 plantilla de busqueda: onerror por Fotos.fallo', busqueda.includes('onerror="window.Fotos.fallo(this)"') &&
  !busqueda.includes("this.src='img/no-img.png'"));
const ini = html.indexOf('async function cargarImagenes()');
const ultimo = html.slice(ini, html.indexOf('document.addEventListener(\'DOMContentLoaded\'', ini));
ver('3 cargarImagenes de ultimo recurso: pinta con Fotos.poner, sin la original', ultimo.includes('window.Fotos.poner(img,') &&
  !ultimo.includes('googleusercontent'), ultimo.length);
for (const [archivo, n] of [['js/carrito.js', 1], ['js/carrito-panel.js', 1], ['js/habituales.js', 1], ['js/observaciones.js', 1]]) {
  const t = leer(archivo);
  const usos = (t.match(/window\.Fotos\?\.url\([^)]*, 120\)/g) || []).length;
  ver(`3 ${archivo}: miniatura por Fotos.url(id, 120), con la de siempre si no esta Fotos`, usos === n && t.includes('=w120'), usos);
}
ver('3 carrito.js: ya no pide la foto original sin ancho', !/googleusercontent\.com\/d\/\$\{[^}]+\}`/.test(leer('js/carrito.js')));

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
