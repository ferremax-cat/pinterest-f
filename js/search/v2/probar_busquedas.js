#!/usr/bin/env node
/*
 * Prueba del buscador v2 sin navegador (Node, sin dependencias).
 *
 * Carga el mismo js/search/v2/buscador-v2.js que usa el catálogo y corre:
 *   - casos_normalizacion.json con la normalización de JavaScript (tiene que dar
 *     los mismos tokens que la de Python), y
 *   - casos_busqueda.json contra el índice json/search/v2/indice.json, y
 *   - el mapa del resaltado: normalizarConMapa tiene que dar el mismo texto que
 *     normalizar en todos los nombres y categorías del índice, y
 *   - el historial del cliente: _subirComprados con códigos inventados (sin
 *     ventas reales) no cambia los grupos, no saca resultados y deja el orden
 *     de antes entre los comprados y entre los demás.
 * Termina con código 1 si algún caso falla.
 *
 * Uso, desde la raíz del proyecto:
 *   node js/search/v2/probar_busquedas.js
 *   node js/search/v2/probar_busquedas.js --indice salida/indice_prueba.json
 *   node js/search/v2/probar_busquedas.js --casos salida/mis_casos.json   (otra lista de casos)
 * En el workflow, además:
 *   --resumen <archivo>   agrega el detalle al resumen de la corrida (GITHUB_STEP_SUMMARY)
 *   --culpa-del-diccionario <índice con el diccionario anterior>
 *       termina con 0 si la causa de las fallas es el diccionario nuevo (con el
 *       anterior fallan menos casos y ninguno que no falle ya), y con 1 si no
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const RUTA_BUSCADOR = path.join(__dirname, 'buscador-v2.js');
const RUTA_NORMALIZACION = path.join(__dirname, 'casos_normalizacion.json');
const RUTA_CASOS = path.join(__dirname, 'casos_busqueda.json');
const RUTA_INDICE = path.join(RAIZ, 'json', 'search', 'v2', 'indice.json');
const EN_GITHUB = process.env.GITHUB_ACTIONS === 'true';

function opcion(nombre) {
  const i = process.argv.indexOf(nombre);
  return i > 1 ? process.argv[i + 1] : undefined;
}

function leerJSON(ruta) {
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

// Ruta para mostrar, relativa a la carpeta desde donde se corre y con "/"
function mostrar(ruta) {
  return path.relative(process.cwd(), ruta).split(path.sep).join('/');
}

// Si falta un archivo, explica qué hacer en lugar de mostrar la traza de Node
function faltaArchivo(ruta, tipo) {
  if (fs.existsSync(ruta)) return false;
  let texto = 'No existe ' + tipo + ' ' + mostrar(ruta) + '.';
  if (tipo === 'el índice') {
    texto += ruta === RUTA_INDICE
      ? ' Generalo primero con: python generar_indice_busqueda.py'
      : ' Generalo primero con: python generar_indice_busqueda.py --salida ' + mostrar(ruta);
  }
  console.error(texto);
  if (EN_GITHUB) console.log('::error title=Prueba del buscador::' + texto);
  process.exitCode = 1;
  return true;
}

// buscador-v2.js en un contexto aparte: "window" es un objeto vacío y no hay
// "document", así que no programa la precarga ni descarga nada. En el navegador
// el archivo se usa igual que siempre
function cargarBuscador() {
  const contexto = { window: {}, console: console, performance: performance };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(RUTA_BUSCADOR, 'utf8'), contexto, { filename: RUTA_BUSCADOR });
  return contexto.window.BuscadorV2;
}

function evaluar(B, rutaIndice, casos) {
  return B._evaluarCasosBusqueda(B._prepararDatos(leerJSON(rutaIndice)), casos);
}

// Textos del índice (nombres y categorías) en los que normalizarConMapa no da lo
// mismo que normalizar: ahí el resaltado no podría marcar el nombre
function evaluarMapa(B, rutaIndice) {
  const fallas = [];
  let total = 0;
  for (const p of leerJSON(rutaIndice).productos) {
    for (const texto of [p[1], p[2]]) {
      total++;
      const m = B._normalizarConMapa(texto);
      const esperado = B.normalizar(texto);
      if (m.texto !== esperado || m.desde.length !== m.texto.length || m.hasta.length !== m.texto.length) {
        fallas.push({ codigo: p[0], texto: texto, esperado: esperado, obtenido: m.texto });
      }
    }
  }
  return { total: total, fallas: fallas };
}

// Historial del cliente: _subirComprados con códigos inventados, sin ventas
// reales. Dentro de cada grupo pone primero lo comprado: no cambia los grupos,
// no saca ni repite resultados y deja el orden de antes entre los comprados y
// entre los demás
function problemaDeOrden(d, entrada, comprados, salida) {
  if (!Array.isArray(salida) || salida.length !== entrada.length) return 'cambió la cantidad de resultados';
  const ids = new Set(salida.map((r) => r.id));
  if (ids.size !== salida.length || entrada.some((r) => !ids.has(r.id))) return 'sacó o repitió resultados';
  for (let i = 0; i < salida.length; i++) {
    if (salida[i].grupo !== entrada[i].grupo) return 'cambió los grupos (puesto ' + (i + 1) + ')';
  }
  const comprado = (r) => !!comprados && comprados.has(d.productos[r.id][0]);
  const puesto = new Map(entrada.map((r, i) => [r.id, i]));
  for (let i = 1; i < salida.length; i++) {
    const a = salida[i - 1], b = salida[i];
    if (a.grupo !== b.grupo) continue;
    if (!comprado(a) && comprado(b)) return 'un comprado quedó después de uno sin comprar (puesto ' + (i + 1) + ')';
    if (comprado(a) === comprado(b) && puesto.get(a.id) > puesto.get(b.id)) return 'cambió el orden de antes (puesto ' + (i + 1) + ')';
  }
  return '';
}

function evaluarSubirComprados(B, rutaIndice, casos) {
  const fallas = [];
  let total = 0;
  function controlar(nombre, d, entrada, comprados, esperado) {
    total++;
    const antes = JSON.stringify(entrada);
    let salida, problema;
    try {
      salida = B._subirComprados(d, entrada, comprados);
      problema = problemaDeOrden(d, entrada, comprados, salida) ||
        (JSON.stringify(entrada) !== antes ? 'modificó la lista que recibió' : '') ||
        (esperado && salida.map((r) => r.id).join(',') !== esperado.join(',')
          ? 'se esperaba ' + esperado.join(',') + ' y da ' + salida.map((r) => r.id).join(',') : '');
    } catch (e) {
      problema = 'error: ' + e.message;
    }
    if (problema) fallas.push({ caso: nombre, detalle: problema });
  }

  // Lista armada a mano: grupos 3, 2 y 1; los ids 6 y 7 son el mismo código, en
  // grupos distintos
  const d = { productos: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P6', 'P8'].map((c) => [c]) };
  const lista = [3, 3, 3, 3, 2, 2, 2, 1, 1].map((grupo, id) => ({ id: id, grupo: grupo }));
  const de = (...cods) => new Map(cods.map((c) => [c, { fecha: '2026-01-01', cantidad: 1 }]));
  controlar('sin historial', d, lista, null, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  controlar('historial vacío', d, lista, new Map(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  controlar('comprados en los tres grupos', d, lista, de('P2', 'P3', 'P5', 'P8'), [2, 3, 0, 1, 5, 4, 6, 8, 7]);
  controlar('todo comprado', d, lista, de('P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P8'), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  controlar('comprados que no están en los resultados', d, lista, de('ZZ1'), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  controlar('un Set en lugar de un Map', d, lista, new Set(['P1', 'P4']), [1, 0, 2, 3, 4, 5, 6, 7, 8]);
  controlar('el mismo código en dos grupos: sube en cada uno', d, lista, de('P6'), [0, 1, 2, 3, 6, 4, 5, 7, 8]);
  const d2 = { productos: ['P0', 'P1', 'P2', 'P2'].map((c) => [c]) };
  const lista2 = [1, 1, 1, 1].map((grupo, id) => ({ id: id, grupo: grupo }));
  controlar('el mismo código dos veces en un grupo', d2, lista2, de('P2'), [2, 3, 0, 1]);

  // 300 listas al azar, siempre las mismas (semilla fija)
  let semilla = 12345;
  const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  for (let k = 0; k < 300; k++) {
    const n = 1 + azar(60), grupos = 1 + azar(5);
    const dd = { productos: Array.from({ length: n }, () => ['C' + azar(n)]) };
    const cortes = Array.from({ length: n }, () => azar(grupos)).sort((a, b) => b - a);
    const ent = cortes.map((grupo, id) => ({ id: id, grupo: grupo }));
    const comp = new Set(dd.productos.filter(() => azar(10) < 3).map((p) => p[0]));
    controlar('lista al azar ' + (k + 1), dd, ent, comp);
  }

  // Las búsquedas de los casos sobre el índice, con un historial inventado
  // (uno de cada tres productos del índice)
  const datos = B._prepararDatos(leerJSON(rutaIndice));
  const inventado = new Set(datos.productos.filter((_, i) => i % 3 === 0).map((p) => p[0]));
  for (const c of casos) {
    controlar('búsqueda «' + c.consulta + '»', datos, B._buscarEnDatos(datos, c.consulta), inventado);
  }

  return { total: total, fallas: fallas };
}

function agregarResumen(texto) {
  const ruta = opcion('--resumen');
  if (ruta) fs.appendFileSync(ruta, texto + '\n');
}

// Decide si las fallas las causa el diccionario nuevo: el mismo catálogo con el
// diccionario anterior falla en menos casos, y en ninguno que no falle ya
function culpaDelDiccionario(B, rutaIndice, rutaAnterior, casos) {
  const fallan = (filas) => new Set(filas.filter((f) => f.resultado !== 'ok').map((f) => f.consulta));
  const conNuevo = fallan(evaluar(B, rutaIndice, casos));
  const conAnterior = fallan(evaluar(B, rutaAnterior, casos));
  const soloConNuevo = [...conNuevo].filter((q) => !conAnterior.has(q));
  const esCulpa = soloConNuevo.length > 0 && [...conAnterior].every((q) => conNuevo.has(q));
  const texto = esCulpa
    ? 'Las búsquedas ' + soloConNuevo.map((q) => '«' + q + '»').join(', ') +
      ' fallan con el diccionario nuevo y andan con el anterior. Se publica el índice con el ' +
      'catálogo de hoy y el diccionario anterior, hasta que se corrija el diccionario.'
    : 'Las fallas no las causa el diccionario: fallan igual con el diccionario anterior ' +
      '(por ejemplo, un producto de un caso cambió o se dio de baja). Se publica el índice nuevo.';
  console.log(texto);
  if (EN_GITHUB) console.log('::warning title=Índice del buscador::' + texto);
  agregarResumen('\n**Decisión:** ' + texto + '\n');
  return esCulpa;
}

function main() {
  const rutaIndice = path.resolve(opcion('--indice') || RUTA_INDICE);
  const rutaCasos = path.resolve(opcion('--casos') || RUTA_CASOS);
  const anterior = opcion('--culpa-del-diccionario');
  const rutaAnterior = anterior ? path.resolve(anterior) : null;

  // Todos los archivos que faltan se avisan juntos, y termina con código 1
  const faltan = [
    faltaArchivo(rutaIndice, 'el índice'),
    faltaArchivo(rutaCasos, 'el archivo de casos'),
    rutaAnterior ? faltaArchivo(rutaAnterior, 'el índice') : false,
    anterior ? false : faltaArchivo(RUTA_NORMALIZACION, 'el archivo de casos de normalización')
  ];
  if (faltan.some(Boolean)) return;

  const B = cargarBuscador();
  const casos = leerJSON(rutaCasos).casos;

  if (rutaAnterior) {
    process.exitCode = culpaDelDiccionario(B, rutaIndice, rutaAnterior, casos) ? 0 : 1;
    return;
  }

  const normalizacion = leerJSON(RUTA_NORMALIZACION).casos;
  const fallasNorm = B._evaluarCasosNormalizacion(normalizacion);
  const filas = evaluar(B, rutaIndice, casos);
  const fallasBusq = filas.filter((f) => f.resultado !== 'ok');
  const mapa = evaluarMapa(B, rutaIndice);
  const historial = evaluarSubirComprados(B, rutaIndice, casos);

  console.log('Casos de normalización: ' + (normalizacion.length - fallasNorm.length) + ' de ' +
              normalizacion.length + ' correctos');
  console.log('Casos de búsqueda: ' + (filas.length - fallasBusq.length) + ' de ' + filas.length +
              ' correctos (índice: ' + path.relative(RAIZ, rutaIndice) + ')');
  console.log('Mapa del resaltado: ' + (mapa.total - mapa.fallas.length) + ' de ' + mapa.total +
              ' nombres y categorías iguales a la normalización');
  console.log('Historial del cliente (_subirComprados): ' + (historial.total - historial.fallas.length) + ' de ' +
              historial.total + ' controles correctos');

  for (const f of fallasNorm) {
    const texto = 'Normalización de «' + f.texto + '»: se esperaba ' + JSON.stringify(f.esperado) +
                  ' y JavaScript da ' + JSON.stringify(f.obtenido) + '.';
    console.log('\n✗ ' + texto);
    if (EN_GITHUB) console.log('::error title=Normalización::' + texto);
  }
  for (const f of fallasBusq) {
    console.log('\n✗ Búsqueda «' + f.consulta + '»\n    ' + f.detalle);
    if (EN_GITHUB) console.log('::error title=Búsqueda «' + f.consulta + '»::' + f.detalle);
  }
  for (const f of mapa.fallas) {
    const texto = 'Mapa del resaltado de «' + f.texto + '» (' + f.codigo + '): normalizar da ' +
                  JSON.stringify(f.esperado) + ' y normalizarConMapa da ' + JSON.stringify(f.obtenido) + '.';
    console.log('\n✗ ' + texto);
    if (EN_GITHUB) console.log('::error title=Mapa del resaltado::' + texto);
  }
  for (const f of historial.fallas) {
    const texto = 'Historial del cliente, ' + f.caso + ': ' + f.detalle + '.';
    console.log('\n✗ ' + texto);
    if (EN_GITHUB) console.log('::error title=Historial del cliente::' + texto);
  }

  if (fallasNorm.length || fallasBusq.length || mapa.fallas.length || historial.fallas.length) {
    const tabla = ['### Buscador: casos que fallan', '',
      'Normalización: ' + (normalizacion.length - fallasNorm.length) + ' de ' + normalizacion.length +
      ' · Búsquedas: ' + (filas.length - fallasBusq.length) + ' de ' + filas.length +
      ' · Mapa del resaltado: ' + (mapa.total - mapa.fallas.length) + ' de ' + mapa.total +
      ' · Historial del cliente: ' + (historial.total - historial.fallas.length) + ' de ' + historial.total, '',
      '| Caso | Qué pasó |', '|---|---|']
      .concat(fallasNorm.map((f) => '| normalización «' + f.texto + '» | se esperaba ' +
        JSON.stringify(f.esperado) + ', da ' + JSON.stringify(f.obtenido) + ' |'))
      .concat(fallasBusq.map((f) => '| búsqueda «' + f.consulta + '» | ' + f.detalle.replace(/\|/g, '/') + ' |'))
      .concat(mapa.fallas.map((f) => '| mapa del resaltado «' + String(f.texto).replace(/\|/g, '/') + '» (' +
        f.codigo + ') | normalizar da ' + JSON.stringify(f.esperado).replace(/\|/g, '/') +
        ', normalizarConMapa da ' + JSON.stringify(f.obtenido).replace(/\|/g, '/') + ' |'))
      .concat(historial.fallas.map((f) => '| historial del cliente, ' + f.caso.replace(/\|/g, '/') + ' | ' +
        f.detalle.replace(/\|/g, '/') + ' |'));
    agregarResumen(tabla.join('\n'));
    process.exitCode = 1;
  } else {
    agregarResumen('### Buscador: los ' + filas.length + ' casos de búsqueda y los ' +
                   normalizacion.length + ' de normalización pasan, el mapa del resaltado coincide en los ' +
                   mapa.total + ' nombres y categorías, y los ' + historial.total +
                   ' controles del historial del cliente pasan');
  }
}

main();
