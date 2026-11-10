// PRUEBA OFFLINE DEL SERVIDOR (apps-script/Codigo.gs): guardar_pedido,
// pedidos_para_imprimir y pedidos_pendientes, con las hojas simuladas en
// memoria y fallas de Google inyectadas (transitorias, ambiguas y "fantasma":
// Google acepta la escritura sin error pero no la guarda). No conecta a nada.
//
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_servidor.cjs                    prueba apps-script/Codigo.gs
//   node test/pedidos/prueba_servidor.cjs otra/copia.gs      prueba otra copia del servidor
//   node test/pedidos/prueba_servidor.cjs --contar           llamadas a la planilla de un guardado
// Tambien el precio anterior de las observaciones (116, 119, 126): historial del
// sistema de gestion (hoja historial, columna compras, con datos sinteticos) y
// pedidos impresos de la app.
// Termina con codigo 1 si alguna prueba falla.
const fs = require('fs');
const vm = require('vm');

const path = require('path');
const archivo = process.argv.slice(2).find(a => !a.startsWith('--')) ||
  path.join(__dirname, '..', '..', 'apps-script', 'Codigo.gs');
const SOLO_CASO_REAL = process.argv.includes('--caso-real');
const CONTAR = process.argv.includes('--contar');
let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };

// ---------- hojas simuladas ----------
const ENC_CAB = ['id_pedido', 'timestamp', 'cliente', 'nombre_cliente', 'vendedor', 'usuario', 'canal', 'cant_lineas',
  'total_bruto', 'desc_total_pct', 'total_neto', 'desc_efectivo_global', 'motivo_obs', 'obs_libre', 'estado',
  'id_pedido_origen', 'revision', 'lista', 'cupo', 'excedente', 'semaforo', 'verde', 'amarillo', 'rojo', 'pg_prom_3m',
  'impreso', 'fecha_impresion', 'impreso_por', 'rol_creador', 'numero',
  'semaforo_base', 'desc_total_extra_pct', 'intento_impresion', 'intento_por', 'alta'];
const ENC_ALTAS = ['id_pedido', 'alta', 'fecha', 'vendedor', 'cuenta_puente', 'comercio', 'apellido', 'contacto',
  'domicilio', 'localidad', 'telefono', 'horario', 'formula', 'total_neto', 'cuenta_asignada', 'fecha_asignacion',
  'asignada_por', 'numero_pedido', 'impreso', 'fecha_impresion', 'impreso_por'];
const ENC_LIN = ['id_pedido', 'orden', 'sku', 'nombre', 'cantidad', 'lista_cliente', 'lista_aplicada', 'mecanismo',
  'precio_base', 'precio_unitario', 'desc_efectivo_linea', 'subtotal', 'origen_linea', 'color', 'desc_linea_pct'];
const ENC_OBS = ['id_pedido', 'fecha', 'cliente', 'numero', 'orden_obs', 'clave', 'codigo', 'texto', 'grupo', 'efecto',
  'lado', 'orden_item', 'sku', 'nombre', 'cantidad', 'precio_lista', 'mecanismo', 'lista_aplicada', 'desc_linea_pct', 'precio_unitario'];

const ENC_REG = ['fecha_hora', 'id_pedido', 'numero', 'cuenta', 'cant_lineas', 'total_neto', 'fila_cabecera', 'verificacion', 'version', 'duracion_ms'];
let hojas, registro, inyectar, pausas, props, falloProp, llamadas = 0;
function reiniciar() {
  hojas = {
    pedidos_cabecera: [ENC_CAB.slice()],
    pedidos_lineas: [ENC_LIN.slice()],
    pedidos_observaciones: [ENC_OBS.slice()],
    registro_guardados: [ENC_REG.slice()],
    altas_clientes: [ENC_ALTAS.slice()],
    finanzas: [['cuenta', 'nombre', 'vendedor'], ['100', 'Cliente 100', 'V1'], ['200', 'Cliente 200', 'V1'], ['999', 'Prueba', 'V1']]
  };
  registro = [];      // [hoja, operacion] de cada escritura que se hizo
  inyectar = [];      // { hoja, op, veces, escribe, msg }
  pausas = [];
  props = {};
  falloProp = false;
}
// Una falla inyectada: escribe=true escribe y despues falla (Google informa error aunque escribio)
function falla(hoja, op, opc = {}) {
  inyectar.push({ hoja, op, veces: opc.veces ?? 1, escribe: !!opc.escribe, fantasma: !!opc.fantasma, saltar: opc.saltar ?? 0,
    msg: opc.msg ?? 'Exception: El servicio Hojas de cálculo falló al acceder al documento con el ID 1U91v6.' });
}
function revisarFalla(hoja, op, escribir, largo) {
  const f = inyectar.find(x => x.hoja === hoja && x.op === op && x.veces > 0);
  if (f && f.saltar > 0) { f.saltar--; escribir(); registro.push([hoja, op, largo]); return; }
  if (!f) { escribir(); registro.push([hoja, op, largo]); return; }
  f.veces--;
  // Google acepta la escritura sin error, pero no la guarda
  if (f.fantasma) { registro.push([hoja, op + ' (fantasma)', largo]); return; }
  if (f.escribe) { escribir(); registro.push([hoja, op]); }
  throw new Error(f.msg);
}

// Llamadas que van a la planilla (leen o escriben valores, buscan, confirman) y
// las que solo arman objetos en el script (no viajan)
const A_LA_PLANILLA = ['getValues', 'getValue', 'setValues', 'setValue', 'appendRow', 'findAll', 'findNext',
  'flush', 'getLastRow', 'getLastColumn', 'getDataRange'];
let porOp = {};
const cuenta = op => { llamadas++; porOp[op] = (porOp[op] || 0) + 1; };
// Hojas abiertas (getSheetByName) y una que falla al abrirse, para el precio anterior
const hojasPedidas = [];
let hojaQueFalla = null;
// Cache del script: apagada salvo en los casos del precio anterior (los demas
// casos la usaban vacia, como antes)
const cacheSim = { activa: false, datos: {}, getAll: null };

function hoja(nombre) {
  const filas = () => hojas[nombre];
  const ancho = () => Math.max(...filas().map(r => r.length));
  const escribirCelda = (r, c, v) => {
    while (filas().length < r) filas().push([]);
    const fila = filas()[r - 1];
    while (fila.length < c - 1) fila.push('');
    fila[c - 1] = v;
  };
  // r, c, nr, nc; o un rango abierto en A1 ("A2:A": de la fila 2 al final, columna A)
  const rango = (r, c, nr = 1, nc = 1) => {
    let abierto = false;
    if (typeof r === 'string') {
      const m = /^A(\d+):A$/.exec(r);
      if (!m) throw new Error('rango A1 no simulado: ' + r);
      abierto = true; r = Number(m[1]); c = 1; nc = 1;
    }
    const filasDe = () => (abierto ? Math.max(filas().length - r + 1, 0) : nr);
    return {
      getValues: () => { cuenta('getValues');
        return Array.from({ length: filasDe() }, (_, i) => Array.from({ length: nc }, (_, j) => {
          const v = filas()[r - 1 + i]?.[c - 1 + j]; return v === undefined ? '' : v;
        })); },
      getValue: () => { cuenta('getValue'); const v = filas()[r - 1]?.[c - 1]; return v === undefined ? '' : v; },
      setValues: vals => { cuenta('setValues'); revisarFalla(nombre, 'setValues', () =>
        vals.forEach((fila, i) => fila.forEach((v, j) => escribirCelda(r + i, c + j, v)))); },
      setValue: v => { cuenta('setValue'); revisarFalla(nombre, 'setValue', () => escribirCelda(r, c, v)); },
      createTextFinder: txt => {
        cuenta('createTextFinder');
        const buscar = () => {
          const res = [];
          for (let i = 0; i < filasDe(); i++) {
            const v = filas()[r - 1 + i]?.[c - 1];
            if (v !== undefined && String(v) === String(txt)) res.push({ getRow: () => r + i });
          }
          return res;
        };
        const tf = {
          matchEntireCell: () => tf, matchCase: () => tf,
          findAll: () => { cuenta('findAll'); return buscar(); },
          findNext: () => { cuenta('findNext'); return buscar()[0] || null; }
        };
        return tf;
      }
    };
  };
  return {
    getLastRow: () => { cuenta('getLastRow'); return filas().length; },
    getLastColumn: () => { cuenta('getLastColumn'); return ancho(); },
    getRange: (...a) => { cuenta('getRange'); return rango(...a); },
    getDataRange: () => { cuenta('getDataRange'); return rango(1, 1, filas().length, ancho()); },
    appendRow: fila => { cuenta('appendRow'); revisarFalla(nombre, 'appendRow', () => filas().push(fila.slice()), fila.length); }
  };
}

const ctx = {
  console: { log() {}, warn() {}, error: console.error },
  Logger: { log() {} },
  SpreadsheetApp: {
    openById: () => { cuenta('openById'); return { getSheetByName: n => {
      cuenta('getSheetByName'); hojasPedidas.push(n);
      if (n === hojaQueFalla) throw new Error('Exception: Service Spreadsheets failed');
      return hojas[n] ? hoja(n) : null;
    } }; },
    flush: () => { cuenta('flush'); revisarFalla('*', 'flush', () => {}); }
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in props ? props[k] : null),
    setProperty: (k, v) => { if (falloProp) throw new Error('Exception: Service error: Properties'); props[k] = v; }
  }) },
  Utilities: {
    sleep: ms => pausas.push(ms),
    base64Decode: t => Buffer.from(String(t), 'base64'),
    newBlob: bytes => ({ bytes }),
    ungzip: blob => ({ getDataAsString: () => require('zlib').gunzipSync(blob.bytes).toString('utf8') }),
    formatDate: (d, zona, formato) => {
      if (formato !== 'yyyy-MM-dd') throw new Error('formato no simulado: ' + formato);
      return new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(d);
    }
  },
  CacheService: { getScriptCache: () => ({
    get: k => (cacheSim.activa && k in cacheSim.datos ? cacheSim.datos[k] : null),
    getAll: ks => { if (cacheSim.getAll) cacheSim.getAll(ks);
      const r = {}; if (cacheSim.activa) ks.forEach(k => { if (k in cacheSim.datos) r[k] = cacheSim.datos[k]; }); return r; },
    put: (k, v) => { if (cacheSim.activa) cacheSim.datos[k] = v; },
    putAll: o => { if (cacheSim.activa) Object.assign(cacheSim.datos, o); },
    remove: k => { delete cacheSim.datos[k]; },
    removeAll: ks => { ks.forEach(k => { delete cacheSim.datos[k]; }); } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => JSON.parse(t) }) }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(archivo, 'utf8'), ctx);

// ---------- usuarios, clientes, observaciones ----------
const tokens = { vend: { rol: 'vendedor_estandar', cod: 'V1', usr: 'V1' }, vend2: { rol: 'vendedor_estandar', cod: 'V2', usr: 'V2' }, admin: { rol: 'admin', cod: 'ADM', usr: 'ADM' },
  cli: { rol: 'cliente_estandar', cod: '100', usr: '100' }, ofi: { rol: 'oficina', cod: 'OF', usr: 'OF' } };
ctx.verificarToken = t => tokens[t] || null;
ctx.getFinanzasCliente = c => ({ 100: { vendedor: 'V1', nombre: 'Cliente 100', cupoMes: 1000, pgProm3M: 5 },
  200: { vendedor: 'V1', nombre: 'Cliente 200', cupoMes: 0, pgProm3M: 0 },
  999: { vendedor: 'V1', nombre: 'Prueba', cupoMes: 500, pgProm3M: 0 },
  157: { vendedor: 'V1', nombre: 'NUEVO CLIENTE RF', cupoMes: 0, pgProm3M: 0 },
  158: { vendedor: 'V2', nombre: 'NUEVO CLIENTE JG', cupoMes: 0, pgProm3M: 0 } }[c] || null);
ctx.getConfig = () => ({ cuenta_prueba: '999', cuentas_alta: '157,158,159' });
ctx.buscarUsuario = c => ({ nombre: 'Usuario ' + c });
ctx.getObservaciones = () => [
  { clave: '113', codigo: '113', texto: 'MERCADERIA EN MAL ESTADO', grupo: 'mercaderia', efecto: 'informativa', activa: true },
  { clave: 'PAGA', codigo: '', texto: 'PAGA TOTAL DE BOLETA', grupo: 'condiciones', efecto: 'informativa', activa: true }];

let nId = 0;
function pedido(n = 3, extra = {}) {
  const lineas = Array.from({ length: n }, (_, i) => ({ sku: 'SKU' + (i + 1), nombre: 'Art ' + (i + 1), cantidad: i + 1,
    listaAplicada: 'D', mecanismo: 'lista_cliente', precioBase: 100, precio: 100, descEfectivo: 0,
    subtotal: 400, origenLinea: '', descuentoLinea: 0 }));
  const bruto = lineas.reduce((a, l) => a + l.subtotal, 0);
  return { id: 'ped-' + (++nId), cliente: '100', lista: 'D', canal: 'app', idOrigen: '', revision: 0,
    totalBruto: bruto, descuentoTotal: 0, descuentoExtra: 0, totalNeto: bruto, descEfectivoGlobal: 0,
    motivo: '', obsLibre: '', observaciones: [], lineas, ...extra };
}
const guardar = (ped, token = 'vend') => ctx.accionGuardarPedido({ token, pedido: JSON.parse(JSON.stringify(ped)) });
const cab = () => hojas.pedidos_cabecera.slice(1);
const lin = id => hojas.pedidos_lineas.slice(1).filter(r => r[0] === id);
const obsDe = id => hojas.pedidos_observaciones.slice(1).filter(r => r[0] === id);
const cabDe = id => cab().filter(r => r[0] === id);
const C = n => ENC_CAB.indexOf(n);

// =====================================================================
if (SOLO_CASO_REAL) {
  // El caso real con el servidor de hoy: cabecera escrita, lineas fallan
  reiniciar();
  const p = pedido(12);
  falla('pedidos_lineas', 'setValues');
  const r1 = guardar(p);
  const r2 = guardar(p);
  console.log('SERVIDOR ACTUAL, caso real:');
  console.log('  1er envío:', JSON.stringify(r1).slice(0, 140));
  console.log('  reintento:', JSON.stringify(r2));
  console.log(`  quedó: ${cabDe(p.id).length} cabecera con cant_lineas ${cabDe(p.id)[0]?.[C('cant_lineas')]}, ${lin(p.id).length} líneas`);
  process.exit(0);
}


// V11. Llamadas a Sheets de un guardado normal (3 lineas) y uno con observaciones
if (CONTAR) {
  for (const [nom, ped0] of [['3 lineas', pedido(3)], ['2 lineas + 1 obs con 2 articulos', pedido(2, { observaciones: [{ clave: '113', items: [{ sku: 'A1', cantidad: 2 }, { sku: 'A2', cantidad: 1 }] }] })]]) {
    reiniciar();
    for (let k = 0; k < 5; k++) guardar(pedido(2));
    llamadas = 0; porOp = {};
    const rr = guardar(ped0);
    const plan = Object.entries(porOp).filter(([k]) => A_LA_PLANILLA.includes(k));
    const loc = Object.entries(porOp).filter(([k]) => !A_LA_PLANILLA.includes(k));
    const suma = l => l.reduce((s, [, n]) => s + n, 0);
    const det = l => l.sort().map(([k, n]) => k + ' ' + n).join(', ');
    console.log(`${archivo} | ${nom} (${rr.ok ? 'ok' : rr.error}): ${llamadas} en total`);
    console.log(`   a la planilla: ${suma(plan)}  [${det(plan)}]`);
    console.log(`   locales:       ${suma(loc)}  [${det(loc)}]`);
    // El reenvio identico (la respuesta se perdio): duplicado sin nada que completar
    llamadas = 0; porOp = {};
    const rd = guardar(ped0);
    const planD = Object.entries(porOp).filter(([k]) => A_LA_PLANILLA.includes(k));
    console.log(`   reenvío (${rd.duplicado ? 'duplicado' : rd.error}): a la planilla ${suma(planD)}  [${det(planD)}]`);
  }
  process.exit(0);
}

// 1. Pedido normal
reiniciar();
let p = pedido(3);
let r = guardar(p);
ver('normal: ok y APP-1', r.ok && r.numero === 'APP-1' && !r.duplicado, JSON.stringify(r));
ver('normal: 3 lineas, orden 1..3', lin(p.id).map(x => x[1]).join() === '1,2,3');
ver('normal: 1 cabecera con 3 lineas', cabDe(p.id).length === 1 && cabDe(p.id)[0][C('cant_lineas')] === 3);
ver('normal: la cabecera se escribe despues de las lineas',
  registro.findIndex(x => x[0] === 'pedidos_cabecera') > registro.findIndex(x => x[0] === 'pedidos_lineas'), JSON.stringify(registro));
ver('normal: la cabecera como el v34: appendRow de 30 y semaforo_base por nombre',
  registro.filter(x => x[0] === 'pedidos_cabecera').map(x => x[1] + (x[2] ? ':' + x[2] : '')).join() === 'appendRow:30,setValue', JSON.stringify(registro));
const f1 = cabDe(p.id)[0];
ver('normal: rol_creador y numero', f1[C('rol_creador')] === 'vendedor_estandar' && f1[C('numero')] === 1);
ver('normal: semaforo_base neto y columnas nuevas vacias', f1[C('semaforo_base')] === 'neto' &&
  (f1[C('desc_total_extra_pct')] ?? '') === '' && (f1[C('intento_impresion')] ?? '') === '');
ver('normal: estado recibido', f1[C('estado')] === 'recibido');
ver('normal: contador guardado', props.ultimo_numero_pedido === '1');
// Semaforo: cupo 1000, lineas de 400: verde, amarillo (800 <= 1000 verde; 1200 <= 1300 amarillo)
ver('semaforo: colores por linea', lin(p.id).map(x => x[13]).join() === 'verde,verde,amarillo', lin(p.id).map(x => x[13]).join());
ver('semaforo: cabecera (peor, verde, amarillo, excedente)', f1[C('semaforo')] === 'amarillo' && f1[C('verde')] === 800 &&
  f1[C('amarillo')] === 400 && f1[C('excedente')] === 200 && f1[C('cupo')] === 1000);
ver('totales: bruto y neto', f1[C('total_bruto')] === 1200 && f1[C('total_neto')] === 1200);

// 2. Descuento extra, en su columna por nombre
p = pedido(2, { descuentoTotal: 7, descuentoExtra: 5, totalNeto: 700 });
r = guardar(p);
ver('desc extra: APP-2 y desc_total_extra_pct = 5', r.numero === 'APP-2' && cabDe(p.id)[0][C('desc_total_extra_pct')] === 5);

// 3. Reenvio identico (respuesta perdida): duplicado, sin escribir nada
const escrituras = () => registro.filter(x => x[1] !== 'flush' && x[0] !== 'registro_guardados').length;
const antes = escrituras();
r = guardar(p);
ver('duplicado completo: duplicado true, mismo numero, sin completadas', r.ok && r.duplicado && r.numero === 'APP-2' && !r.completadas, JSON.stringify(r));
ver('duplicado completo: no escribe nada', escrituras() === antes);

// 4. Total distinto con el mismo id
r = guardar({ ...p, totalNeto: 999 });
ver('id_con_otro_contenido como hoy', !r.ok && r.error === 'id_con_otro_contenido' && r.numero === 'APP-2');

// 5. Falla transitoria en las lineas (antes de escribir): reintenta y sale bien
reiniciar();
p = pedido(3);
falla('pedidos_lineas', 'setValues');
r = guardar(p);
ver('falla transitoria: ok', r.ok && r.numero === 'APP-1', JSON.stringify(r));
ver('falla transitoria: 3 lineas, sin duplicar', lin(p.id).length === 3);
ver('falla transitoria: una pausa de 1 s', JSON.stringify(pausas) === '[1000]');

// 6. Google informa falla aunque escribio (lineas): el reintento no duplica
reiniciar();
p = pedido(3);
falla('pedidos_lineas', 'setValues', { escribe: true });
r = guardar(p);
ver('falla ambigua en lineas: ok y 3 lineas (no 6)', r.ok && lin(p.id).length === 3, lin(p.id).length);

// 7. Falla ambigua al confirmar la cabecera (flush): una sola cabecera
reiniciar();
p = pedido(3);
falla('pedidos_cabecera', 'appendRow', { escribe: true });
r = guardar(p);
ver('falla ambigua en cabecera: ok y 1 cabecera', r.ok && cabDe(p.id).length === 1, JSON.stringify(r));
reiniciar();
p = pedido(2);
falla('*', 'flush', { veces: 1 });
r = guardar(p);
ver('falla en flush: ok, 2 lineas y 1 cabecera', r.ok && lin(p.id).length === 2 && cabDe(p.id).length === 1);

// 8. Falla persistente en la cabecera: error, sin cabecera, sin consumir numero
reiniciar();
const previo = pedido(1);
guardar(previo);                                   // APP-1
p = pedido(3);
falla('pedidos_cabecera', 'appendRow', { veces: 3 });
r = guardar(p);
ver('falla persistente: responde error con el mensaje de Google', !r.ok && /falló al acceder/.test(r.error), JSON.stringify(r));
ver('falla persistente: 3 intentos (pausas 1 s y 2 s)', JSON.stringify(pausas) === '[1000,2000]', JSON.stringify(pausas));
ver('falla persistente: sin cabecera, lineas escritas', cabDe(p.id).length === 0 && lin(p.id).length === 3);
ver('falla persistente: el contador no avanza', props.ultimo_numero_pedido === '1');
r = guardar(p);
ver('reintento de la app: ok, no duplicado, APP-2', r.ok && !r.duplicado && r.numero === 'APP-2', JSON.stringify(r));
ver('reintento de la app: 3 lineas (no 6) y 1 cabecera', lin(p.id).length === 3 && cabDe(p.id).length === 1);

// 9. Error que no es transitorio: no se reintenta
reiniciar();
p = pedido(2);
falla('pedidos_lineas', 'setValues', { msg: 'Exception: Las coordenadas del rango están fuera de las dimensiones de la hoja.' });
r = guardar(p);
ver('error no transitorio: sin pausas, error y sin cabecera', !r.ok && pausas.length === 0 && cabDe(p.id).length === 0, JSON.stringify(r));

// 10. EL CASO REAL: cabecera escrita por el servidor viejo, 0 de 12 lineas
reiniciar();
p = pedido(12);
guardar(pedido(1));                                // APP-1, para tener numeracion
hojas.pedidos_lineas = hojas.pedidos_lineas.filter((x, i) => i === 0 || true);
const filaVieja = Array(30).fill('');
Object.assign(filaVieja, { [C('id_pedido')]: p.id, [C('cliente')]: '100', [C('cant_lineas')]: 12,
  [C('total_neto')]: p.totalNeto, [C('estado')]: 'recibido', [C('rol_creador')]: 'vendedor_estandar', [C('numero')]: 2 });
hojas.pedidos_cabecera.push(filaVieja);
props.ultimo_numero_pedido = '2';
r = guardar(p);
ver('caso real: ok, duplicado, APP-2 y completadas 12', r.ok && r.duplicado && r.numero === 'APP-2' && r.completadas === 12, JSON.stringify(r));
ver('caso real: 12 lineas, orden 1..12', lin(p.id).length === 12 && lin(p.id).map(x => x[1]).join() === Array.from({ length: 12 }, (_, i) => i + 1).join());
r = guardar(p);
ver('caso real: otro reintento ya no completa nada', r.ok && r.duplicado && !r.completadas && lin(p.id).length === 12);

// 11. Cabecera con 1 de 3 lineas: completa las 2 que faltan
reiniciar();
p = pedido(3);
guardar(p);
hojas.pedidos_lineas.splice(2, 2);                 // quedan la 1 sola
r = guardar(p);
ver('parcial: completadas 2 y lineas 1..3 sin repetir', r.completadas === 2 && lin(p.id).map(x => x[1]).sort().join() === '1,2,3', JSON.stringify(r));

// 12. Lineas huerfanas con otro contenido: no escribe nada
reiniciar();
p = pedido(3);
hojas.pedidos_lineas.push([p.id, 1, 'OTRO', 'x', 1]);
const antesL = hojas.pedidos_lineas.length;
r = guardar(p);
ver('huerfanas con otro articulo: lineas_con_otro_contenido', !r.ok && r.error === 'lineas_con_otro_contenido', JSON.stringify(r));
ver('huerfanas con otro articulo: sin cabecera ni lineas nuevas', cabDe(p.id).length === 0 && hojas.pedidos_lineas.length === antesL);
hojas.pedidos_lineas.push([p.id + 'x', 1, 'SKU1', 'x', 1]);   // id parecido no cuenta
reiniciar(); p = pedido(2); hojas.pedidos_lineas.push([p.id + '0', 1, 'OTRO', 'x', 9]);
r = guardar(p);
ver('otro id que empieza igual no se toma como del pedido', r.ok && lin(p.id).length === 2);

// 13. Cliente de prueba: numeracion PRU aparte
reiniciar();
guardar(pedido(1));                                // APP-1
r = guardar(pedido(1, { cliente: '999' }));
ver('prueba: PRU-1 y no toca el contador real', r.ok && r.prueba && r.numero === 'PRU-1' && props.ultimo_numero_pedido === '1' && props.ultimo_numero_prueba === '1', JSON.stringify(r));
r = guardar(pedido(1));
ver('real despues de prueba: APP-2', r.numero === 'APP-2');
const pp = pedido(1, { cliente: '999' });
falla('pedidos_cabecera', 'appendRow', { veces: 3 });
guardar(pp);
ver('prueba con falla: no consume PRU', props.ultimo_numero_prueba === '1');
r = guardar(pp);
ver('prueba reintento: PRU-2', r.numero === 'PRU-2', JSON.stringify(r));

// 14. Solo observaciones (sin lineas)
reiniciar();
p = pedido(0, { observaciones: [{ clave: 'PAGA', items: [] }], totalBruto: 0, totalNeto: 0 });
r = guardar(p);
ver('solo obs: ok, 0 lineas, 1 fila de obs, cant_lineas 0', r.ok && lin(p.id).length === 0 && obsDe(p.id).length === 1 &&
  cabDe(p.id)[0][C('cant_lineas')] === 0, JSON.stringify(r));
ver('solo obs: motivo_obs con el resumen', cabDe(p.id)[0][C('motivo_obs')] === 'PAGA TOTAL DE BOLETA');
r = guardar(p);
ver('solo obs: reenvio duplicado sin filas de mas', r.duplicado && obsDe(p.id).length === 1);

// 15. Observacion con articulos y falla ambigua al escribirlas: sin duplicar
reiniciar();
p = pedido(2, { observaciones: [{ clave: '113', items: [{ sku: 'A1', cantidad: 2 }, { sku: 'A2', cantidad: 1 }] }] });
falla('pedidos_observaciones', 'setValues', { escribe: true });
r = guardar(p);
ver('obs con articulos y falla ambigua: 2 filas (no 4)', r.ok && obsDe(p.id).length === 2, obsDe(p.id).length);
ver('obs: numero APP-1 en la fila', obsDe(p.id).every(x => x[3] === 'APP-1'));

// 16. Obs escritas, cabecera falla, otro pedido toma el numero: se corrige el numero de las obs
reiniciar();
p = pedido(1, { observaciones: [{ clave: 'PAGA', items: [] }] });
falla('pedidos_cabecera', 'appendRow', { veces: 3 });
guardar(p);                                        // obs escritas con APP-1, sin cabecera
ver('obs huerfanas con APP-1', obsDe(p.id)[0][3] === 'APP-1');
guardar(pedido(1));                                // otro pedido toma APP-1
r = guardar(p);
ver('reintento: APP-2 y las obs corregidas a APP-2, sin duplicar', r.numero === 'APP-2' && obsDe(p.id).length === 1 && obsDe(p.id)[0][3] === 'APP-2', JSON.stringify(obsDe(p.id)));

// 17. Falla al guardar el contador: el pedido ya esta, se responde ok
reiniciar();
falloProp = true;
p = pedido(1);
r = guardar(p);
ver('contador que falla: ok igual', r.ok && r.numero === 'APP-1' && cabDe(p.id).length === 1);
falloProp = false;
r = guardar(pedido(1));
ver('el resguardo por la hoja evita repetir el numero', r.numero === 'APP-2');

// 18. Pedido del cliente: rol_creador cliente_estandar
reiniciar();
p = pedido(2);
r = guardar(p, 'cli');
ver('cliente: rol_creador cliente_estandar y usuario = cuenta', r.ok && cabDe(p.id)[0][C('rol_creador')] === 'cliente_estandar' && cabDe(p.id)[0][C('usuario')] === '100');

// 19. Rechazos de antes de escribir: igual que hoy, sin escribir nada
reiniciar();
ver('rechazo: pedido vacio', guardar(pedido(0)).error === 'pedido_vacio');
ver('rechazo: cliente de otro vendedor', ctx.accionGuardarPedido({ token: 'vend', pedido: { ...pedido(1), cliente: '555' } }).error === 'cliente_no_encontrado');
ver('rechazo: nada escrito', registro.filter(x => x[1] !== 'flush').length === 0);

// 20. pedidos_para_imprimir: anulados fuera, en cualquier forma de escribirlo
reiniciar();
const pedidosImp = ['recibido', 'anulado', 'Anulado: incompleto', '  ANULADO por oficina', 'anulación pedida'].map(est => {
  const x = pedido(1); guardar(x); cabDe(x.id)[0][C('estado')] = est; return x.id;
});
const imp = ctx.accionPedidosParaImprimir({ token: 'ofi', modo: 'pendientes' });
const vistos = new Set(imp.pedidos.map(x => x.id));
ver('imprimir: se ven "recibido" y "anulación pedida"', vistos.has(pedidosImp[0]) && vistos.has(pedidosImp[4]), JSON.stringify(imp.error));
ver('imprimir: no se ven anulado / Anulado: / ANULADO', !vistos.has(pedidosImp[1]) && !vistos.has(pedidosImp[2]) && !vistos.has(pedidosImp[3]));
ver('imprimir: trae las lineas', imp.pedidos.find(x => x.id === pedidosImp[0]).lineas.length === 1);
cabDe(pedidosImp[2])[0][C('impreso')] = 'SI';
const impr = ctx.accionPedidosParaImprimir({ token: 'ofi', modo: 'impresos' });
ver('imprimir: un anulado impreso tampoco sale en Impresos', !impr.pedidos.some(x => x.id === pedidosImp[2]));

// 21. pedidos_pendientes: anulados fuera; una revision anulada libera al original
reiniciar();
const delCli = pedido(1); guardar(delCli, 'cli');
const delCli2 = pedido(1); guardar(delCli2, 'cli');
const delCli3 = pedido(1); guardar(delCli3, 'cli');
const rev = pedido(1, { idOrigen: delCli.id, revision: 1 }); guardar(rev);
const rev2 = pedido(1, { idOrigen: delCli2.id, revision: 1 }); guardar(rev2);
cabDe(rev2.id)[0][C('estado')] = 'Anulado - incompleto';
cabDe(delCli3.id)[0][C('estado')] = 'anulado';
const pend = ctx.accionPedidosPendientes({ token: 'vend' });
const ids = pend.pedidos.map(x => x.id);
ver('pendientes: el revisado no aparece', !ids.includes(delCli.id), JSON.stringify(ids));
ver('pendientes: con la revision anulada vuelve a aparecer', ids.includes(delCli2.id));
ver('pendientes: el del cliente anulado no aparece', !ids.includes(delCli3.id));

// ===================== casos nuevos del v36 =====================
const reg = () => hojas.registro_guardados.slice(1);
const regDe = id => reg().filter(r => r[1] === id);
const filaDe = id => hojas.pedidos_cabecera.findIndex(r => r[0] === id) + 1;   // fila de la hoja (1 = encabezado)
const antesNuevos = ok + fallas;

// V1. Cabecera fantasma una vez: la segunda pasada la escribe
reiniciar();
p = pedido(3);
falla('pedidos_cabecera', 'appendRow', { fantasma: true });
r = guardar(p);
ver('V1 cabecera fantasma una vez: ok APP-1, 1 cabecera, 3 lineas', r.ok && r.numero === 'APP-1' && cabDe(p.id).length === 1 && lin(p.id).length === 3, JSON.stringify(r));
ver('V1 numero consumido y registro ok', props.ultimo_numero_pedido === '1' && regDe(p.id)[0]?.[7] === 'ok', JSON.stringify(regDe(p.id)));

// V2. Cabecera fantasma siempre: error, sin numero; el reintento de la app lo guarda
reiniciar();
guardar(pedido(1));                                 // APP-1
p = pedido(3);
falla('pedidos_cabecera', 'appendRow', { fantasma: true, veces: 99 });
r = guardar(p);
ver('V2 cabecera fantasma siempre: verificacion_fallida', !r.ok && r.error === 'verificacion_fallida', JSON.stringify(r));
ver('V2 no consume el numero', props.ultimo_numero_pedido === '1');
ver('V2 sin cabecera y las lineas quedan (3, sin duplicar)', cabDe(p.id).length === 0 && lin(p.id).length === 3);
ver('V2 registro: error sin cabecera, con APP-2 calculado', regDe(p.id)[0]?.[7] === 'error: sin cabecera' && regDe(p.id)[0]?.[2] === 'APP-2', JSON.stringify(regDe(p.id)));
inyectar = [];
r = guardar(p);
ver('V2 reintento de la app: ok APP-2, 1 cabecera, 3 lineas', r.ok && !r.duplicado && r.numero === 'APP-2' && cabDe(p.id).length === 1 && lin(p.id).length === 3, JSON.stringify(r));
ver('V2 ahora si consume el numero', props.ultimo_numero_pedido === '2');

// V3. Lineas fantasma
reiniciar();
p = pedido(3);
falla('pedidos_lineas', 'setValues', { fantasma: true });
r = guardar(p);
ver('V3 lineas fantasma una vez: ok y 3 lineas', r.ok && lin(p.id).length === 3, JSON.stringify(r));
reiniciar();
p = pedido(3);
falla('pedidos_lineas', 'setValues', { fantasma: true, veces: 99 });
r = guardar(p);
ver('V3 lineas fantasma siempre: verificacion_fallida, sin numero', !r.ok && r.error === 'verificacion_fallida' && !props.ultimo_numero_pedido, JSON.stringify(r));
ver('V3 registro: lineas 0 de 3', regDe(p.id)[0]?.[7] === 'error: lineas 0 de 3', JSON.stringify(regDe(p.id)));
ver('V3 la cabecera quedo escrita (el reintento la reconoce)', cabDe(p.id).length === 1);
inyectar = [];
r = guardar(p);
ver('V3 reintento: duplicado que completa las 3 lineas', r.ok && r.duplicado && r.completadas === 3 && lin(p.id).length === 3, JSON.stringify(r));

// V4. Observaciones fantasma
reiniciar();
p = pedido(1, { observaciones: [{ clave: '113', items: [{ sku: 'A1', cantidad: 2 }, { sku: 'A2', cantidad: 1 }] }] });
falla('pedidos_observaciones', 'setValues', { fantasma: true });
r = guardar(p);
ver('V4 obs fantasma una vez: ok y 2 filas de obs', r.ok && obsDe(p.id).length === 2, JSON.stringify(r));
reiniciar();
p = pedido(0, { observaciones: [{ clave: 'PAGA', items: [] }], totalBruto: 0, totalNeto: 0 });
falla('pedidos_observaciones', 'setValues', { fantasma: true, veces: 99 });
r = guardar(p);
ver('V4 solo obs, obs fantasma siempre: error y registro obs 0 de 1', !r.ok && r.error === 'verificacion_fallida' && regDe(p.id)[0]?.[7] === 'error: obs 0 de 1', JSON.stringify(regDe(p.id)));
reiniciar();
p = pedido(0, { observaciones: [{ clave: 'PAGA', items: [] }], totalBruto: 0, totalNeto: 0 });
r = guardar(p);
ver('V4 solo obs normal: ok, 0 lineas, 1 obs, registro ok', r.ok && lin(p.id).length === 0 && obsDe(p.id).length === 1 && regDe(p.id)[0]?.[7] === 'ok');

// V5. Duplicado con lineas que no se pueden completar
reiniciar();
p = pedido(3);
guardar(p);
hojas.pedidos_lineas.splice(1, 3);                 // se pierden las 3
falla('pedidos_lineas', 'setValues', { fantasma: true, veces: 99 });
r = guardar(p);
ver('V5 duplicado sin poder completar: verificacion_fallida', !r.ok && r.error === 'verificacion_fallida', JSON.stringify(r));
ver('V5 registro: lineas 0 de 3 con el numero guardado', regDe(p.id).at(-1)?.[7] === 'error: lineas 0 de 3' && regDe(p.id).at(-1)?.[2] === 'APP-1');

// V6. Forma de la cabecera y fila correcta aunque haya contenido mas abajo
reiniciar();
p = pedido(2, { descuentoTotal: 7, descuentoExtra: 5, totalNeto: 700 });
hojas.pedidos_cabecera.push(Array(32).fill('').concat(['nota suelta']));
r = guardar(p);
const fc = hojas.pedidos_cabecera[filaDe(p.id) - 1];
ver('V6 appendRow de 30 valores', registro.some(x => x[0] === 'pedidos_cabecera' && x[1] === 'appendRow' && x[2] === 30));
ver('V6 semaforo_base y desc_total_extra_pct en la fila del pedido', fc[C('semaforo_base')] === 'neto' && fc[C('desc_total_extra_pct')] === 5);
ver('V6 la fila de la nota suelta no se toca', hojas.pedidos_cabecera[1][C('semaforo_base')] === '' && hojas.pedidos_cabecera[1][32] === 'nota suelta');
ver('V6 registro: fila_cabecera = la fila real del pedido', regDe(p.id)[0]?.[6] === filaDe(p.id) && filaDe(p.id) === 3, JSON.stringify([regDe(p.id)[0]?.[6], filaDe(p.id)]));

// V7. Registro de guardados
reiniciar();
p = pedido(3);
r = guardar(p);
const g = regDe(p.id)[0] || [];
ver('V7 una fila con las 10 columnas', regDe(p.id).length === 1 && g.length === 10);
ver('V7 valores: fecha, id, numero, cuenta, lineas, neto, fila, ok, version, duracion', Object.prototype.toString.call(g[0]) === '[object Date]' && g[1] === p.id && g[2] === 'APP-1' && g[3] === '100' &&
  g[4] === 3 && g[5] === 1200 && g[6] === filaDe(p.id) && g[7] === 'ok' && /^v\d+-/.test(g[8]) && typeof g[9] === 'number' && g[9] >= 0, JSON.stringify(g));
guardar(p);
ver('V7 reenvio: "duplicado"', regDe(p.id).at(-1)?.[7] === 'duplicado');
guardar({ ...p, totalNeto: 1 });
ver('V7 otro contenido: "id_con_otro_contenido"', regDe(p.id).at(-1)?.[7] === 'id_con_otro_contenido');
const pe = pedido(1);
falla('pedidos_cabecera', 'appendRow', { veces: 3 });
guardar(pe);
ver('V7 error de Google: "error: ..." con el mensaje', /^error: .*falló al acceder/.test(regDe(pe.id)[0]?.[7] || ''), JSON.stringify(regDe(pe.id)));
const ph = pedido(2);
hojas.pedidos_lineas.push([ph.id, 1, 'OTRO', 'x', 1]);
guardar(ph);
ver('V7 lineas_con_otro_contenido registrado', regDe(ph.id)[0]?.[7] === 'lineas_con_otro_contenido');
const filasReg = reg().length;
guardar(pedido(0));
ver('V7 rechazo antes del bloqueo (pedido vacio): sin registro', reg().length === filasReg);
// Sin la hoja
reiniciar();
delete hojas.registro_guardados;
p = pedido(2);
r = guardar(p);
ver('V7 sin la hoja: ok y sin errores', r.ok && r.numero === 'APP-1' && cabDe(p.id).length === 1);
// La escritura del registro falla
reiniciar();
falla('registro_guardados', 'appendRow', { veces: 99 });
p = pedido(2);
r = guardar(p);
ver('V7 registro que falla al escribir: ok igual', r.ok && r.numero === 'APP-1' && cabDe(p.id).length === 1 && props.ultimo_numero_pedido === '1');
// Falla el flush del registro (el ultimo flush del guardado)
reiniciar();
let flushes = 0;
{ const f0 = ctx.SpreadsheetApp.flush; ctx.SpreadsheetApp.flush = () => { flushes++; f0(); }; guardar(pedido(1)); ctx.SpreadsheetApp.flush = f0; }
reiniciar();
falla('*', 'flush', { saltar: flushes - 1, msg: 'Exception: Service error: Spreadsheets' });
p = pedido(1);
r = guardar(p);
ver('V7 flush del registro que falla: ok igual, con cabecera', r.ok && cabDe(p.id).length === 1 && inyectar[0].veces === 0, JSON.stringify([r, flushes]));

// V8. pedidos_para_imprimir: lineas sin cabecera
reiniciar();
const conCab = pedido(1); guardar(conCab);
const anul = pedido(1); guardar(anul); cabDe(anul.id)[0][C('estado')] = 'anulado';
const deCli = pedido(1); guardar(deCli, 'cli');
const prue = pedido(1, { cliente: '999' }); guardar(prue);
hojas.pedidos_lineas.push(['huerf-1', 1, 'S', 'x', 1], ['huerf-1', 2, 'S', 'x', 1], ['huerf-2', 1, 'S', 'x', 1]);
const sc = t => ctx.accionPedidosParaImprimir({ token: t, modo: 'pendientes' });
const so = sc('ofi'), sa = sc('admin'), sv = sc('vend');
ver('V8 oficina: 2 pedidos sin cabecera con su cantidad de lineas', so.lineasSinCabecera?.total === 2 &&
  JSON.stringify(so.lineasSinCabecera.pedidos) === '[{"id":"huerf-1","lineas":2},{"id":"huerf-2","lineas":1}]', JSON.stringify(so.lineasSinCabecera));
ver('V8 admin tambien', sa.lineasSinCabecera?.total === 2);
ver('V8 vendedor no lo recibe', sv.ok && !('lineasSinCabecera' in sv));
ver('V8 con cabecera (anulado, del cliente, prueba) no cuentan', !so.lineasSinCabecera.pedidos.some(x => [conCab.id, anul.id, deCli.id, prue.id].includes(x.id)));
ver('V8 tambien en Impresos', ctx.accionPedidosParaImprimir({ token: 'ofi', modo: 'impresos' }).lineasSinCabecera?.total === 2);
for (let k = 3; k <= 25; k++) hojas.pedidos_lineas.push(['huerf-' + k, 1, 'S', 'x', 1]);
const tope = sc('ofi').lineasSinCabecera;
ver('V8 tope de 20 ids, total real 25', tope.total === 25 && tope.pedidos.length === 20);
reiniciar();
guardar(pedido(2));
ver('V8 sin huerfanas: total 0', sc('ofi').lineasSinCabecera?.total === 0 && sc('ofi').lineasSinCabecera.pedidos.length === 0);
console.log(`Casos nuevos del v36: ${ok + fallas - antesNuevos}`);

// V12. Optimizaciones del v36b (solo si el servidor las tiene)
if (typeof ctx.guardarFaltantes === 'function') {
  const antes12 = ok + fallas;
  const medir = f => { llamadas = 0; porOp = {}; const res = f(); const plan = Object.entries(porOp)
    .filter(([k]) => A_LA_PLANILLA.includes(k)).reduce((s, [, n]) => s + n, 0); return { res, plan, op: { ...porOp } }; };
  reiniciar();
  for (let k = 0; k < 3; k++) guardar(pedido(2));
  p = pedido(3);
  let m = medir(() => guardar(p));
  ver('V12 pedido de 3 lineas: 13 llamadas a la planilla o menos', m.res.ok && m.plan <= 13, JSON.stringify(m.op));
  ver('V12 dos flush: uno antes de verificar y uno antes de responder', m.op.flush === 2, JSON.stringify(m.op));
  ver('V12 la cabecera se lee una sola vez de entrada (getDataRange), sin getLastColumn', m.op.getDataRange === 1 && !m.op.getLastColumn);
  ver('V12 el numero sale de esa lectura: sin leer la columna numero aparte', (m.op.getValues || 0) <= 2);
  ver('V12 la verificacion relee cabecera y lineas despues del flush',
    registro.map(x => x[1]).lastIndexOf('flush') > registro.findIndex(x => x[0] === 'pedidos_cabecera' && x[1] === 'appendRow'));
  m = medir(() => guardar(p));
  ver('V12 reenvio identico: duplicado con 6 llamadas o menos y un solo flush (el final)', m.res.duplicado && m.plan <= 6 && m.op.flush === 1, JSON.stringify(m.op));
  // Falla transitoria en el flush despues de escribir todo: el reintento relee
  // (incluida la cabecera) y no duplica nada
  reiniciar();
  p = pedido(3);
  falla('*', 'flush', { msg: 'Exception: Service error: Spreadsheets' });
  r = guardar(p);
  ver('V12 falla en el flush unico: ok, 1 cabecera y 3 lineas', r.ok && cabDe(p.id).length === 1 && lin(p.id).length === 3, JSON.stringify(r));
  // Las columnas por nombre que fallan despues de verificar no cambian la respuesta
  reiniciar();
  p = pedido(2);
  falla('pedidos_cabecera', 'setValue', { msg: 'Exception: Las coordenadas del rango no son validas' });
  r = guardar(p);
  ver('V12 columnas por nombre que fallan: ok igual, numero consumido, registro ok', r.ok && props.ultimo_numero_pedido === '1' && regDe(p.id)[0]?.[7] === 'ok', JSON.stringify(r));
  // El flush final que falla no cambia la respuesta
  reiniciar();
  let fl = 0;
  { const f0 = ctx.SpreadsheetApp.flush; ctx.SpreadsheetApp.flush = () => { fl++; f0(); }; guardar(pedido(1)); ctx.SpreadsheetApp.flush = f0; }
  reiniciar();
  falla('*', 'flush', { saltar: fl - 1, veces: 1, msg: 'Exception: Service error: Spreadsheets' });
  p = pedido(1);
  r = guardar(p);
  ver('V12 flush final que falla: ok igual', r.ok && cabDe(p.id).length === 1 && inyectar[0].veces === 0, JSON.stringify(r));
  console.log(`Casos de optimizacion (v36b): ${ok + fallas - antes12}`);
}

// V13. Clientes nuevos (altas): cuenta puente, ALTA-n, bandeja, hoja de alta y asignacion de cuenta
{
  const antes13 = ok + fallas;
  const COLA = ENC_ALTAS;
  const A = n => COLA.indexOf(n);
  const altaDe = id => hojas.altas_clientes.slice(1).filter(r => r[0] === id);
  const datos = (formula = 'E', extra = {}) => ({ comercio: 'Ferretería El Tornillo', apellido: 'Gómez', contacto: 'Juan',
    domicilio: 'San Martín 123', localidad: 'Rafaela', telefono: '3492 555555', horario: '8 a 12 y 16 a 20', formula, ...extra });
  const pedAlta = (n = 2, extra = {}) => pedido(n, { cliente: '157', lista: 'E', alta: datos('E'), ...extra });
  const escr = () => registro.filter(x => x[1] !== 'flush' && x[0] !== 'registro_guardados').length;

  // Rechazos antes de escribir
  reiniciar();
  ver('A1 cuenta puente sin datos del comercio: faltan_datos_alta', guardar(pedido(1, { cliente: '157', lista: 'E' })).error === 'faltan_datos_alta');
  ver('A1 datos incompletos (sin telefono): datos_alta_incompletos', guardar(pedAlta(1, { alta: datos('E', { telefono: '  ' }) })).error === 'datos_alta_incompletos');
  ver('A1 formula distinta de la lista del pedido: formula_alta_invalida', guardar(pedAlta(1, { alta: datos('D') })).error === 'formula_alta_invalida');
  ver('A1 formula que no existe: formula_alta_invalida', guardar(pedAlta(1, { lista: 'Z', alta: datos('Z') })).error === 'formula_alta_invalida');
  ver('A1 datos de alta en una cuenta normal: alta_no_permitida', guardar(pedido(1, { alta: datos('D'), lista: 'D' })).error === 'alta_no_permitida');
  ver('A1 cuenta puente de otro vendedor: cliente_de_otro_vendedor', guardar(pedAlta(1, { cliente: '158' })).error === 'cliente_de_otro_vendedor');
  ver('A1 rechazos: nada escrito', escr() === 0);

  // Alta valida
  reiniciar();
  let pa = pedAlta(3, { observaciones: [{ clave: 'PAGA', items: [] }] });
  let r = guardar(pa);
  const fa = cabDe(pa.id)[0] || [];
  ver('A2 alta: ok, ALTA-1 y alta true', r.ok && r.numero === 'ALTA-1' && r.alta === true && !r.duplicado, JSON.stringify(r));
  ver('A2 cabecera: cuenta puente, comercio, falta_cuenta, numero = ALTA-1 (sin APP)', fa[C('cliente')] === '157' && fa[C('nombre_cliente')] === 'Ferretería El Tornillo' &&
    fa[C('estado')] === 'falta_cuenta' && fa[C('numero')] === 'ALTA-1' && fa[C('alta')] === 'ALTA-1', JSON.stringify(fa));
  ver('A2 semaforo rojo (sin cupo) y lista E', fa[C('semaforo')] === 'rojo' && fa[C('cupo')] === 0 && fa[C('lista')] === 'E' &&
    lin(pa.id).every(x => x[13] === 'rojo'));
  ver('A2 lineas y observacion escritas (obs con ALTA-1)', lin(pa.id).length === 3 && obsDe(pa.id).length === 1 && obsDe(pa.id)[0][3] === 'ALTA-1');
  const fal = altaDe(pa.id)[0] || [];
  ver('A2 fila de altas_clientes con los datos del comercio', fal[A('alta')] === 'ALTA-1' && fal[A('vendedor')] === 'V1' && fal[A('cuenta_puente')] === '157' &&
    fal[A('comercio')] === 'Ferretería El Tornillo' && fal[A('telefono')] === '3492 555555' && fal[A('formula')] === 'E' && fal[A('total_neto')] === 1200 &&
    fal[A('cuenta_asignada')] === '' && fal.length === COLA.length, JSON.stringify(fal));
  ver('A2 la fila del alta va antes que la cabecera', registro.findIndex(x => x[0] === 'altas_clientes') < registro.findIndex(x => x[0] === 'pedidos_cabecera'));
  ver('A2 no consume numero APP; si el de altas', !props.ultimo_numero_pedido && props.ultimo_numero_alta === '1');
  ver('A2 registro: ALTA-1, "ok, alta sin cuenta"', regDe(pa.id)[0]?.[2] === 'ALTA-1' && regDe(pa.id)[0]?.[7] === 'ok, alta sin cuenta');
  r = guardar(pa);
  ver('A2 reenvio: duplicado con ALTA-1 y alta true, sin escribir', r.ok && r.duplicado && r.numero === 'ALTA-1' && r.alta === true && altaDe(pa.id).length === 1);
  ver('A2 un pedido normal despues: APP-1 (la numeracion no se movio)', guardar(pedido(1)).numero === 'APP-1');
  ver('A2 la segunda alta: ALTA-2', guardar(pedAlta(1)).numero === 'ALTA-2');

  // Texto que empieza con = + - @: queda como texto
  reiniciar();
  const ps = pedAlta(1, { alta: datos('E', { comercio: '=HIPERVINCULO("x")', telefono: '+54 9 3492 555555' }) });
  guardar(ps);
  ver('A3 comercio y telefono que empiezan con = o +: con apostrofo (texto)', altaDe(ps.id)[0]?.[A('comercio')] === "'=HIPERVINCULO(\"x\")" &&
    altaDe(ps.id)[0]?.[A('telefono')] === "'+54 9 3492 555555" && cabDe(ps.id)[0][C('nombre_cliente')] === "'=HIPERVINCULO(\"x\")");

  // Fila del alta "fantasma"
  reiniciar();
  pa = pedAlta(2);
  falla('altas_clientes', 'appendRow', { fantasma: true });
  r = guardar(pa);
  ver('A4 fila del alta fantasma una vez: ok y 1 fila', r.ok && altaDe(pa.id).length === 1 && cabDe(pa.id).length === 1, JSON.stringify(r));
  reiniciar();
  pa = pedAlta(2);
  falla('altas_clientes', 'appendRow', { fantasma: true, veces: 99 });
  r = guardar(pa);
  ver('A4 siempre: verificacion_fallida, sin consumir ALTA, registro "sin datos del alta"', !r.ok && r.error === 'verificacion_fallida' &&
    !props.ultimo_numero_alta && /sin datos del alta/.test(regDe(pa.id)[0]?.[7] || ''), JSON.stringify([r, regDe(pa.id)[0]?.[7]]));
  inyectar = [];
  r = guardar(pa);
  ver('A4 reintento de la app: duplicado que completa la fila del alta', r.ok && r.duplicado && r.numero === 'ALTA-1' && altaDe(pa.id).length === 1, JSON.stringify(r));
  reiniciar();
  const pfa = pedAlta(1);
  falla('altas_clientes', 'appendRow', { fantasma: true, veces: 99 });
  guardar(pfa);
  inyectar = [];
  ver('A4 otra alta mientras la fallida espera su reintento: ALTA-2 (no repite el numero)', guardar(pedAlta(1)).numero === 'ALTA-2');
  ver('A4 la fallida reintenta y conserva su ALTA-1', guardar(pfa).numero === 'ALTA-1' && altaDe(pfa.id)[0]?.[A('alta')] === 'ALTA-1');
  reiniciar();
  delete hojas.altas_clientes;
  ver('A4 sin la hoja altas_clientes: faltan_columnas_alta, sin escribir', guardar(pedAlta(1)).error === 'faltan_columnas_alta' && escr() === 0);

  // Bandeja
  reiniciar();
  const pAlta = pedAlta(2, { observaciones: [{ clave: 'PAGA', items: [] }] }); guardar(pAlta);
  const pNorm = pedido(1); guardar(pNorm);
  const imp = t => ctx.accionPedidosParaImprimir({ token: t, modo: 'pendientes' });
  let bo = imp('ofi').pedidos.find(x => x.id === pAlta.id);
  ver('A5 bandeja: falta cuenta, numero ALTA-1, alta ALTA-1', bo?.faltaCuenta === true && bo.numero === 'ALTA-1' && bo.alta === 'ALTA-1', JSON.stringify(bo && { n: bo.numero, f: bo.faltaCuenta }));
  ver('A5 bandeja: datos del comercio y hoja sin imprimir', bo?.datosAlta?.comercio === 'Ferretería El Tornillo' && bo.datosAlta.formula === 'E' &&
    bo.datosAlta.horario === '8 a 12 y 16 a 20' && bo.datosAlta.impresa === false && bo.datosAlta.cuentaPuente === '157', JSON.stringify(bo?.datosAlta));
  ver('A5 bandeja: trae sus lineas', bo?.lineas.length === 2);
  ver('A5 el normal no tiene datos de alta', imp('ofi').pedidos.find(x => x.id === pNorm.id)?.faltaCuenta === false);
  ver('A5 su vendedor lo ve; otro vendedor no', imp('vend').pedidos.some(x => x.id === pAlta.id) && !imp('vend2').pedidos.some(x => x.id === pAlta.id));
  ver('A5 pedidos de clientes para revisar: no aparece', !ctx.accionPedidosPendientes({ token: 'vend' }).pedidos.some(x => x.id === pAlta.id));

  // No se imprime el pedido
  r = ctx.accionMarcarImpresos({ token: 'ofi', ids: [pAlta.id] });
  ver('A6 marcar impresos: no lo marca (faltaCuenta 1)', r.ok && r.marcados === 0 && r.faltaCuenta === 1 && cabDe(pAlta.id)[0][C('impreso')] === '');
  r = ctx.accionIntentoImpresion({ token: 'ofi', ids: [pAlta.id] });
  ver('A6 intento de impresion: no lo registra (faltaCuenta 1)', r.ok && r.registrados === 0 && r.faltaCuenta === 1);

  // Hoja de alta impresa
  ver('A7 otro vendedor no marca la hoja de alta ajena', ctx.accionMarcarAltaImpresa({ token: 'vend2', ids: [pAlta.id] }).marcados === 0);
  r = ctx.accionMarcarAltaImpresa({ token: 'ofi', ids: [pAlta.id] });
  const fai = altaDe(pAlta.id)[0];
  ver('A7 oficina marca la hoja de alta: SI, fecha y quien', r.ok && r.marcados === 1 && fai[A('impreso')] === 'SI' &&
    Object.prototype.toString.call(fai[A('fecha_impresion')]) === '[object Date]' && fai[A('impreso_por')] === 'OF');
  const primera = fai[A('fecha_impresion')];
  r = ctx.accionMarcarAltaImpresa({ token: 'admin', ids: [pAlta.id] });
  ver('A7 reimprimir: conserva la primera fecha y quien', r.yaMarcados === 1 && altaDe(pAlta.id)[0][A('fecha_impresion')] === primera && altaDe(pAlta.id)[0][A('impreso_por')] === 'OF');
  bo = imp('ofi').pedidos.find(x => x.id === pAlta.id);
  ver('A7 la bandeja muestra quien y cuando imprimio la hoja', bo.datosAlta.impresa === true && bo.datosAlta.impresoPor === 'Usuario OF' && !!bo.datosAlta.fechaImpresion);

  // Asignar la cuenta
  const asig = (t, cuenta, id = pAlta.id) => ctx.accionAsignarCuenta({ token: t, id, cuenta });
  ver('A8 el vendedor no asigna cuentas', asig('vend', '4321').error === 'rol_sin_permiso');
  ver('A8 cuenta con letras: cuenta_invalida', asig('ofi', '43a1').error === 'cuenta_invalida');
  ver('A8 otra cuenta puente: cuenta_puente', asig('ofi', '158').error === 'cuenta_puente');
  ver('A8 la cuenta de prueba: cuenta_prueba', asig('ofi', '999').error === 'cuenta_prueba');
  ver('A8 un id que no existe: no_encontrado', asig('ofi', '4321', 'nada').error === 'no_encontrado');
  ver('A8 un pedido normal (ya tiene cuenta): ya_asignada', asig('ofi', '4321', pNorm.id).error === 'ya_asignada');
  r = asig('ofi', '4321');
  const fc2 = cabDe(pAlta.id)[0];
  ver('A8 asignada: ok, APP-2 (el siguiente) y ALTA-1', r.ok && r.numero === 'APP-2' && r.alta === 'ALTA-1' && r.cuenta === '4321', JSON.stringify(r));
  ver('A8 cabecera: cuenta 4321, nombre del comercio, recibido, numero 2, alta sigue', fc2[C('cliente')] === '4321' &&
    fc2[C('nombre_cliente')] === 'Ferretería El Tornillo' && fc2[C('estado')] === 'recibido' && fc2[C('numero')] === 2 && fc2[C('alta')] === 'ALTA-1');
  ver('A8 semaforo sigue rojo y el alta lo distingue', fc2[C('semaforo')] === 'rojo' && fc2[C('alta')] === 'ALTA-1');
  const fa2 = altaDe(pAlta.id)[0];
  ver('A8 altas_clientes: cuenta asignada, fecha, quien y numero de pedido', fa2[A('cuenta_asignada')] === '4321' && fa2[A('asignada_por')] === 'OF' &&
    fa2[A('numero_pedido')] === 'APP-2' && Object.prototype.toString.call(fa2[A('fecha_asignacion')]) === '[object Date]');
  ver('A8 observaciones: cliente 4321 y numero APP-2', obsDe(pAlta.id).every(o => o[2] === '4321' && o[3] === 'APP-2'));
  ver('A8 lineas sin cambios', lin(pAlta.id).length === 2);
  ver('A8 consume el numero APP y registra', props.ultimo_numero_pedido === '2' && regDe(pAlta.id).at(-1)?.[7] === 'cuenta asignada (ALTA-1, antes 157)');
  ver('A8 repetir con la misma cuenta: ok, mismo numero, yaAsignada', (() => { const x = asig('ofi', '4321'); return x.ok && x.yaAsignada && x.numero === 'APP-2'; })());
  ver('A8 otra cuenta despues: ya_asignada', asig('ofi', '5555').error === 'ya_asignada');
  bo = imp('ofi').pedidos.find(x => x.id === pAlta.id);
  ver('A8 bandeja: ahora es un pedido normal, APP-2, cuenta 4321', bo && !bo.faltaCuenta && bo.numero === 'APP-2' && bo.cliente === '4321');
  ver('A8 su vendedor lo sigue viendo aunque 4321 no este en finanzas', imp('vend').pedidos.some(x => x.id === pAlta.id));
  r = ctx.accionMarcarImpresos({ token: 'ofi', ids: [pAlta.id] });
  ver('A8 ahora si se marca impreso', r.marcados === 1);
  r = guardar(pAlta);
  ver('A8 reenvio tardio de la app: duplicado con APP-2', r.ok && r.duplicado && r.numero === 'APP-2' && !r.alta, JSON.stringify(r));

  // Asignar con la cabecera "fantasma": no se confirma, no consume numero
  reiniciar();
  const pf = pedAlta(1); guardar(pf);
  falla('pedidos_cabecera', 'setValue', { fantasma: true, veces: 99 });
  r = asig('ofi', '4321', pf.id);
  ver('A9 asignar sin poder verificar: verificacion_fallida, sin consumir numero', !r.ok && r.error === 'verificacion_fallida' && !props.ultimo_numero_pedido, JSON.stringify(r));
  inyectar = [];
  r = asig('ofi', '4321', pf.id);
  ver('A9 reintento: ok APP-1', r.ok && r.numero === 'APP-1', JSON.stringify(r));

  console.log(`Casos de altas: ${ok + fallas - antes13}`);
}

// =====================================================================
// PRECIO ANTERIOR (v38): historial del sistema de gestion (columna compras de
// la hoja historial) y, de respaldo, los pedidos impresos de la app. Datos
// sinteticos: ninguna cuenta ni comprobante real.
if (!SOLO_CASO_REAL) {
  const antesH = ok + fallas;
  const zlib = require('zlib');
  // Dia de Argentina, n dias atras (negativo: adelante)
  const dia = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date(Date.now() - n * 86400000));
  const celda = obj => zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8')).toString('base64');
  const COMPRAS_100 = { v: 1, act: dia(0),
    k: [['PRa12345', dia(5), [[7, 'contado']]], ['PRb1033', dia(40)], ['FCa500', dia(60), [[5, ''], [7, 'contado']]],
        ['PRa80000', dia(0)], ['PRa90000', dia(-1)], ['PRa1', dia(100)],
        ['PRa55555', dia(12), [[5, '']]],                           // 6: el ejemplo, con -5 %
        ['PRa66666', dia(8), [[7, 'contado']], 1]],                 // 7: descuento parcial en el comprobante
    c: { EVO115TF: [[3, 1, 9999], [0, 2, 9177.58], [1, 1, 8000]],   // la de hoy no cuenta: queda la del dia 5
         SKU1: [[1, 1, 150]],                                         // tambien esta en un pedido impreso de la app
         CAS1: [[2, 3, 50]],                                          // comprobante con -5% y -7% en cascada
         BONIF: [[1, 2, 0]],                                          // bonificado
         FUT: [[4, 1, 1], [5, 1, 20]],                                // la de manana no cuenta
         'tyro41f-16-5662': [[1, 1, 10]],                             // clave en minusculas
         IVA105: [[1, 1, 100, 10.5]],                                 // IVA distinto de 21
         SOLOHOY: [[3, 1, 5]],                                        // solo del dia del pedido: va a la app o a verificar
         EJEMPLO: [[6, 1, 257347.11]],                                // renglon 311.390,00 con -5 %: 295.820,50
         PARC: [[7, 1, 100]],                                         // renglon 121,00 con -7 % parcial
         MEDIO: [[1, 1, 0.124]] } };                                  // 0,15 por 2,5: 0,375 redondea a 0,38
  const ENC_HIST = ['cuenta', 'actualizado', 'articulos', 'historial', 'compras'];
  const filaD = celda({ v: 3, act: dia(0), a: [['EVO115TF', dia(5), 2, 10327.2, 3, 20, 2]], hab: [], dej: [] });
  const ponerHistorial = (compras = celda(COMPRAS_100), enc = ENC_HIST) => {
    hojas.historial = [enc.slice(), ['100', dia(0), 8, filaD, compras], ['200', dia(0), 1, filaD, celda({ v: 1, act: dia(0), k: [['PRa5', dia(3)]], c: { SKU1: [[0, 1, 77]] } })]]
      .map(f => f.slice(0, enc.length));
  };
  ctx.getObservaciones = () => [
    { clave: '116', codigo: '116', texto: 'DEVUELVE', grupo: 'mercaderia', efecto: 'descuenta', activa: true },
    { clave: '119', codigo: '119', texto: 'FALTANTE', grupo: 'mercaderia', efecto: 'descuenta', activa: true },
    { clave: '126', codigo: '126', texto: 'FACTURADO DISTINTO', grupo: 'mercaderia', efecto: 'ajuste', activa: true },
    { clave: '113', codigo: '113', texto: 'MERCADERIA EN MAL ESTADO', grupo: 'mercaderia', efecto: 'informativa', activa: true },
    { clave: 'PAGA', codigo: '', texto: 'PAGA TOTAL DE BOLETA', grupo: 'condiciones', efecto: 'informativa', activa: true }];
  const configAntes = ctx.getConfig;
  ctx.getConfig = () => ({ cuenta_prueba: '999', cuentas_alta: '157,158,159', historial_prueba: '100' });
  const bandeja = (t = 'ofi', extra = {}) => ctx.accionPedidosParaImprimir({ token: t, modo: 'pendientes', ...extra });
  const obsDePedido = (r, id) => (r.pedidos.find(x => x.id === id) || {}).observaciones || [];
  const item = (o, sku, lado) => o.items.find(x => x.sku === sku && (!lado || x.lado === lado));
  const ayer = () => new Date(Date.now() - 86400000);

  // Un pedido impreso de la app de ayer, con -7% y ademas -5%, y una linea en promocion
  reiniciar(); ponerHistorial();
  const pApp = pedido(3, { descuentoTotal: 7, descuentoExtra: 5 });
  pApp.lineas[0].precio = 120;               // SKU1: la app dice 120, el historial 150
  pApp.lineas[1].precio = 95.5;              // SKU2: solo en la app
  pApp.lineas[2].mecanismo = 'promocion';    // SKU3: en promocion, sin descuento sobre el total
  pApp.lineas[2].precio = 33;
  let r = guardar(pApp);
  ver('H0 pedido de la app guardado', r.ok, JSON.stringify(r));
  hojas.pedidos_cabecera.find(f => f[0] === pApp.id)[C('timestamp')] = ayer();
  ctx.accionMarcarImpresos({ token: 'ofi', ids: [pApp.id] });

  // El pedido que se imprime: 116 con varios articulos
  const p1 = pedido(1, { observaciones: [{ clave: '116', items: ['EVO115TF', 'SKU1', 'SKU2', 'SKU3', 'CAS1', 'TYRO41F-16-5662', 'FUT', 'IVA105']
    .map((sku, i) => ({ sku, cantidad: sku === 'EVO115TF' ? 2 : 1 })) }] });
  r = guardar(p1);
  ver('H0 pedido con la 116 guardado', r.ok, JSON.stringify(r));
  const p2 = pedido(1, { observaciones: [{ clave: '116', items: [{ sku: 'NADA', cantidad: 1 }, { sku: 'SOLOHOY', cantidad: 1 }] }] });
  guardar(p2);
  const p3 = pedido(1, { observaciones: [{ clave: '119', items: [{ sku: 'BONIF', cantidad: 2 }] }] });
  guardar(p3);
  const p4 = pedido(1, { observaciones: [{ clave: '126', items: [{ sku: 'EVO115TF', cantidad: 1, lado: 'facturado' },
    { sku: 'EVO115TF', cantidad: 2, lado: 'correspondia', precioLista: 12000 }] }] });
  guardar(p4);
  const p5 = pedido(2, { cliente: '200' });   // sin observaciones
  guardar(p5);
  const p6 = pedido(1, { observaciones: [{ clave: '119', items: [{ sku: 'EVO115TF', cantidad: 1 }, { sku: 'EJEMPLO', cantidad: 1 }] }] });
  guardar(p6);
  const p7 = pedido(1, { observaciones: [{ clave: '119', items: [{ sku: 'PARC', cantidad: 1 }] }] });
  guardar(p7);
  const p8 = pedido(1, { observaciones: [{ clave: '126', items: [{ sku: 'EVO115TF', cantidad: 1, lado: 'facturado' },
    { sku: 'OTRO', cantidad: 1, lado: 'correspondia', precioLista: 500 }] }] });
  guardar(p8);
  const p9 = pedido(1, { observaciones: [{ clave: '116', items: [{ sku: 'MEDIO', cantidad: 2.5 }] }] });
  guardar(p9);

  const pedidasCache = [];
  cacheSim.activa = true; cacheSim.datos = {}; cacheSim.getAll = keys => pedidasCache.push(...keys);
  hojasPedidas.length = 0;
  let b = bandeja();
  let o = obsDePedido(b, p1.id)[0];
  let it = item(o, 'EVO115TF');
  ver('H1 del historial con el -7 % del comprobante aplicado: 11.104,87 x 0,93 = 10.327,53', it?.precio === 10327.53, JSON.stringify(it));
  ver('H1 importe negativo de 2 unidades: -20.655,06', it?.importe === -20655.06, it?.importe);
  ver('H1 renglon sin el descuento: 11.104,87, descuento aplicado', it?.origen?.precioRenglon === 11104.87 && it.origen.descAplicado === true &&
    it.origen.descParcial === false, JSON.stringify(it?.origen));
  ver('H1 origen: historial, comprobante de 15, fecha, s/IVA', it?.origen?.tipo === 'anterior' && it.origen.fuente === 'historial' &&
    it.origen.numero === 'PRa000000012345' && it.origen.fecha === dia(5) + 'T12:00:00-03:00' && it.origen.sinIva === 9177.58, JSON.stringify(it?.origen));
  ver('H2 la compra del mismo dia del pedido no cuenta (factura de este pedido)', it?.origen?.numero !== 'PRa000000080000');
  ver('H3 el -7% pago contado del comprobante, aplicado', JSON.stringify(it?.origen?.desc) === '[[7,"contado"]]' && it.precio === 10327.53);
  it = item(o, 'SKU1');
  ver('H4 el historial manda sobre el pedido impreso de la app', it?.precio === 181.5 && it.origen.fuente === 'historial' && it.origen.numero === 'PRb000000001033', JSON.stringify(it));
  ver('H4 comprobante sin descuento: desc vacio', Array.isArray(it?.origen?.desc) && it.origen.desc.length === 0);
  ver('H4 sin descuento: el precio es el del renglon, sin descuento aplicado', it?.origen?.precioRenglon === 181.5 && it.origen.descAplicado === false);
  it = item(o, 'SKU2');
  ver('H5 de la app con -7 % y -5 % en cascada: 95,50 -> 88,82 -> 84,38', it?.precio === 84.38 && it.origen.fuente === 'app' && it.origen.numero === 'APP-1' &&
    it.origen.precioRenglon === 95.5 && it.origen.descAplicado === true, JSON.stringify(it));
  ver('H5 de la app: aclaracion -7% y -5% del pedido', JSON.stringify(it?.origen?.desc) === '[[7,""],[5,""]]', JSON.stringify(it?.origen?.desc));
  ver('H5 de la app: sin s/IVA', it?.origen && !('sinIva' in it.origen));
  it = item(o, 'SKU3');
  ver('H6 de la app en promocion: sin descuento', it?.precio === 33 && it.origen.fuente === 'app' && it.origen.desc.length === 0 &&
    it.origen.descAplicado === false, JSON.stringify(it));
  it = item(o, 'CAS1');
  ver('H7 en cascada, redondeando cada paso: 60,50 -> 57,48 (57,475) -> 53,46', it?.precio === 53.46 && it.origen.precioRenglon === 60.5 &&
    JSON.stringify(it.origen.desc) === '[[5,""],[7,"contado"]]', JSON.stringify(it));
  it = item(o, 'TYRO41F-16-5662');
  ver('H8 codigo en minusculas en la celda: se encuentra igual', it?.precio === 12.1 && it.origen.fuente === 'historial', JSON.stringify(it));
  it = item(o, 'FUT');
  ver('H9 la compra de manana no cuenta: la anterior', it?.precio === 24.2 && it.origen.numero === 'PRa000000000001' && it.origen.fecha === dia(100) + 'T12:00:00-03:00', JSON.stringify(it));
  it = item(o, 'IVA105');
  ver('H10 IVA 10,5: 110,50', it?.precio === 110.5, JSON.stringify(it));
  ver('H11 la observacion: importe completo (con los descuentos) y sin verificar', o.importe === -21154.2 && o.verificar === false, `${o.importe} ${o.verificar}`);

  o = obsDePedido(b, p2.id)[0];
  ver('H12 sin ninguna fuente: precio null, origen null, importe null, a verificar', item(o, 'NADA')?.precio === null &&
    item(o, 'NADA').origen === null && o.importe === null && o.verificar === true, JSON.stringify(o));
  ver('H12 solo comprado el mismo dia: tampoco (VERIFICAR PRECIO)', item(o, 'SOLOHOY')?.origen === null);
  o = obsDePedido(b, p3.id)[0];
  ver('H13 119 bonificado (precio 0): a verificar', item(o, 'BONIF')?.precio === 0 && item(o, 'BONIF').origen.fuente === 'historial' && o.verificar === true, JSON.stringify(o));
  o = obsDePedido(b, p4.id)[0];
  ver('H14 126: lo facturado y lo que correspondia, del mismo comprobante y con el mismo descuento', item(o, 'EVO115TF', 'facturado')?.precio === 10327.53 &&
    item(o, 'EVO115TF', 'correspondia')?.precio === 10327.53 && item(o, 'EVO115TF', 'correspondia').origen.numero === 'PRa000000012345' &&
    o.importe === 10327.53 && o.verificar === true, JSON.stringify(o));
  // v40: descuento del comprobante aplicado
  o = obsDePedido(b, p6.id)[0];
  ver('D1 119 con el descuento del comprobante: -10.327,53', item(o, 'EVO115TF')?.importe === -10327.53, JSON.stringify(item(o, 'EVO115TF')));
  it = item(o, 'EJEMPLO');
  ver('D2 el ejemplo: renglon 311.390,00 con -5 % = 295.820,50, s/IVA del renglon', it?.precio === 295820.5 && it.origen.precioRenglon === 311390 &&
    it.origen.sinIva === 257347.11 && it.importe === -295820.5, JSON.stringify(it));
  ver('D2 sin descuento parcial: la 119 no queda a verificar', o.verificar === false && item(o, 'EJEMPLO').origen.descParcial === false);
  o = obsDePedido(b, p7.id)[0];
  it = item(o, 'PARC');
  ver('D3 descuento parcial: se aplica igual (121 x 0,93 = 112,53), marcado y a verificar', it?.precio === 112.53 && it.origen.descParcial === true &&
    o.verificar === true && o.importe === -112.53, JSON.stringify(o));
  o = obsDePedido(b, p8.id)[0];
  ver('D4 126 con otro articulo: lo facturado con descuento, lo que correspondia a lista actual sin descuento',
    item(o, 'EVO115TF', 'facturado')?.precio === 10327.53 && item(o, 'OTRO', 'correspondia')?.precio === 500 &&
    item(o, 'OTRO', 'correspondia').origen?.tipo === 'lista' && o.importe === Math.round((500 - 10327.53) * 100) / 100, JSON.stringify(o));
  o = obsDePedido(b, p9.id)[0];
  ver('D5 redondeo de un importe negativo con ,5: 0,15 x 2,5 = 0,375 -> -0,38 (no -0,37)', item(o, 'MEDIO')?.importe === -0.38 && item(o, 'MEDIO').precio === 0.15,
    JSON.stringify(item(o, 'MEDIO')));
  ver('H15 solo se piden las compras de los clientes que lo necesitan', JSON.stringify(pedidasCache) === '["comp_100"]', JSON.stringify(pedidasCache));
  ver('H15 y quedan en la cache', typeof cacheSim.datos.comp_100 === 'string' && !('comp_200' in cacheSim.datos));
  const lecturas1 = hojasPedidas.filter(n => n === 'historial').length;
  ver('H15 la hoja historial se abre una vez', lecturas1 === 1, lecturas1);

  hojasPedidas.length = 0;
  const b2 = bandeja();
  ver('H16 segunda consulta desde la cache: sin abrir la hoja historial, mismos precios', !hojasPedidas.includes('historial') &&
    JSON.stringify(obsDePedido(b2, p1.id)) === JSON.stringify(obsDePedido(b, p1.id)));

  // El vendedor ve lo mismo de su cliente
  const bv = bandeja('vend');
  ver('H17 el vendedor del cliente ve el mismo origen', item(obsDePedido(bv, p1.id)[0], 'EVO115TF')?.origen?.numero === 'PRa000000012345');

  // historial_cliente no devuelve nada de la columna compras
  const hc = ctx.accionHistorialCliente({ token: 'admin', cuenta: '100' });
  ver('H18 historial_cliente: los mismos campos, sin compras ni comprobantes', hc.ok && JSON.stringify(Object.keys(hc)) ===
    '["ok","cuenta","actualizado","articulos","habituales","dejo"]' && !JSON.stringify(hc).includes('PRa') && JSON.stringify(hc.articulos) === `[["EVO115TF","${dia(5)}",2]]`, JSON.stringify(hc));

  // Sin observaciones de precio anterior: ningun acceso nuevo
  reiniciar(); ponerHistorial();
  guardar(pedido(2)); guardar(pedido(1, { observaciones: [{ clave: '113', items: [{ sku: 'A1', cantidad: 1 }] }] }));
  cacheSim.datos = {}; pedidasCache.length = 0; hojasPedidas.length = 0;
  llamadas = 0; bandeja(); const conHist = llamadas;
  ver('H19 sin 116/119/126: ni la hoja historial ni la cache', !hojasPedidas.includes('historial') && pedidasCache.length === 0);
  delete hojas.historial;
  llamadas = 0; bandeja();
  ver('H19 y las mismas llamadas a la planilla que sin historial', llamadas === conHist, `${llamadas} vs ${conHist}`);

  // Celda danada, columna compras que todavia no existe, hoja que falla: cae a la app sin error
  for (const [nombre, preparar] of [['celda dañada', () => ponerHistorial('esto no es gzip')],
    ['rutina anterior (sin columna compras)', () => ponerHistorial(undefined, ENC_HIST.slice(0, 4))],
    ['sin hoja historial', () => { delete hojas.historial; }]]) {
    reiniciar(); preparar(); cacheSim.datos = {};
    const pa = pedido(1); pa.lineas[0].sku = 'EVO115TF'; pa.lineas[0].precio = 11000;
    guardar(pa); hojas.pedidos_cabecera.find(f => f[0] === pa.id)[C('timestamp')] = ayer();
    ctx.accionMarcarImpresos({ token: 'ofi', ids: [pa.id] });
    const pb = pedido(1, { observaciones: [{ clave: '116', items: [{ sku: 'EVO115TF', cantidad: 1 }] }] });
    guardar(pb);
    let rb;
    try { rb = bandeja(); } catch (e) { rb = { ok: false, error: String(e) }; }
    const x = rb.ok && item(obsDePedido(rb, pb.id)[0], 'EVO115TF');
    ver(`H20 ${nombre}: sin error, precio de la app`, x && x.precio === 11000 && x.origen.fuente === 'app', JSON.stringify(rb.ok ? x : rb));
  }
  // La hoja falla al leer: tampoco queda guardado "sin historial" en la cache
  reiniciar(); ponerHistorial(); cacheSim.datos = {};
  hojaQueFalla = 'historial';
  const pc = pedido(1, { observaciones: [{ clave: '116', items: [{ sku: 'EVO115TF', cantidad: 1 }] }] });
  guardar(pc);
  r = bandeja();
  ver('H21 la hoja historial falla: VERIFICAR PRECIO, sin error y sin guardar en la cache', r.ok &&
    item(obsDePedido(r, pc.id)[0], 'EVO115TF').origen === null && !('comp_100' in cacheSim.datos), JSON.stringify(cacheSim.datos));
  hojaQueFalla = null;
  r = bandeja();
  ver('H21 cuando vuelve: del historial', item(obsDePedido(r, pc.id)[0], 'EVO115TF')?.origen?.fuente === 'historial');

  // Pedido de prueba: el historial de la cuenta de historial_prueba (config)
  reiniciar(); ponerHistorial(); cacheSim.datos = {};
  const pp = pedido(1, { cliente: '999', observaciones: [{ clave: '116', items: [{ sku: 'EVO115TF', cantidad: 1 }] }] });
  r = guardar(pp, 'admin');
  r = bandeja('admin', { verPruebas: true });
  ver('H22 pedido de prueba: usa el historial de historial_prueba', item(obsDePedido(r, pp.id)[0], 'EVO115TF')?.origen?.numero === 'PRa000000012345', JSON.stringify(obsDePedido(r, pp.id)));
  ctx.getConfig = () => ({ cuenta_prueba: '999', cuentas_alta: '157,158,159' });
  cacheSim.datos = {};
  r = bandeja('admin', { verPruebas: true });
  ver('H22 sin historial_prueba: VERIFICAR PRECIO', item(obsDePedido(r, pp.id)[0], 'EVO115TF')?.origen === null);
  ctx.getConfig = () => ({ cuenta_prueba: '999', cuentas_alta: '157,158,159', historial_prueba: '100' });

  // Alta sin cuenta: no busca en el historial de la cuenta puente
  reiniciar(); ponerHistorial(); cacheSim.datos = {}; pedidasCache.length = 0;
  hojas.historial.push(['157', dia(0), 1, filaD, celda(COMPRAS_100)]);
  const datosAlta = { comercio: 'Ferretería El Tornillo', apellido: 'Gómez', contacto: 'Juan', domicilio: 'San Martín 123',
    localidad: 'Rafaela', telefono: '3492 555555', horario: '8 a 12', formula: 'E' };
  const pAl = pedido(1, { cliente: '157', lista: 'E', alta: datosAlta, observaciones: [{ clave: '116', items: [{ sku: 'EVO115TF', cantidad: 1 }] }] });
  r = guardar(pAl);
  ver('H23 alta guardada', r.ok && r.alta, JSON.stringify(r));
  r = bandeja();
  ver('H23 alta sin cuenta: no lee el historial de la cuenta puente', item(obsDePedido(r, pAl.id)[0], 'EVO115TF')?.origen === null && pedidasCache.length === 0, JSON.stringify(pedidasCache));

  // limpiar_cache_hist borra tambien las compras
  cacheSim.datos = { comp_100: 'x', hist_100: 'y' };
  ponerHistorial();
  ctx.limpiarCacheHistorial();
  ver('H24 limpiar la cache del historial borra tambien las compras', !('comp_100' in cacheSim.datos) && !('hist_100' in cacheSim.datos));

  cacheSim.activa = false; cacheSim.datos = {}; cacheSim.getAll = null;
  ctx.getConfig = configAntes;
  console.log(`Casos de precio anterior: ${ok + fallas - antesH}`);
}

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
