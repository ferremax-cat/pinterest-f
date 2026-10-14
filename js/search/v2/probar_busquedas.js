#!/usr/bin/env node
/*
 * Prueba del buscador v2 sin navegador (Node, sin dependencias).
 *
 * Carga el mismo js/search/v2/buscador-v2.js que usa el catálogo y corre:
 *   - casos_normalizacion.json con la normalización de JavaScript (tiene que dar
 *     los mismos tokens que la de Python), y
 *   - casos_busqueda.json contra el índice json/search/v2/indice.json.
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

  console.log('Casos de normalización: ' + (normalizacion.length - fallasNorm.length) + ' de ' +
              normalizacion.length + ' correctos');
  console.log('Casos de búsqueda: ' + (filas.length - fallasBusq.length) + ' de ' + filas.length +
              ' correctos (índice: ' + path.relative(RAIZ, rutaIndice) + ')');

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

  if (fallasNorm.length || fallasBusq.length) {
    const tabla = ['### Buscador: casos que fallan', '',
      'Normalización: ' + (normalizacion.length - fallasNorm.length) + ' de ' + normalizacion.length +
      ' · Búsquedas: ' + (filas.length - fallasBusq.length) + ' de ' + filas.length, '',
      '| Caso | Qué pasó |', '|---|---|']
      .concat(fallasNorm.map((f) => '| normalización «' + f.texto + '» | se esperaba ' +
        JSON.stringify(f.esperado) + ', da ' + JSON.stringify(f.obtenido) + ' |'))
      .concat(fallasBusq.map((f) => '| búsqueda «' + f.consulta + '» | ' + f.detalle.replace(/\|/g, '/') + ' |'));
    agregarResumen(tabla.join('\n'));
    process.exitCode = 1;
  } else {
    agregarResumen('### Buscador: los ' + filas.length + ' casos de búsqueda y los ' +
                   normalizacion.length + ' de normalización pasan');
  }
}

main();
