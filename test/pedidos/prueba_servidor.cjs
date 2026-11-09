// PRUEBA OFFLINE DEL SERVIDOR (apps-script/Codigo.gs): guardar_pedido,
// pedidos_para_imprimir y pedidos_pendientes, con las hojas simuladas en
// memoria y fallas de Google inyectadas (transitorias, ambiguas y "fantasma":
// Google acepta la escritura sin error pero no la guarda). No conecta a nada.
//
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_servidor.cjs                    prueba apps-script/Codigo.gs
//   node test/pedidos/prueba_servidor.cjs otra/copia.gs      prueba otra copia del servidor
//   node test/pedidos/prueba_servidor.cjs --contar           llamadas a la planilla de un guardado
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
  'semaforo_base', 'desc_total_extra_pct', 'intento_impresion', 'intento_por'];
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
    openById: () => { cuenta('openById'); return { getSheetByName: n => (cuenta('getSheetByName'), hojas[n] ? hoja(n) : null) }; },
    flush: () => { cuenta('flush'); revisarFalla('*', 'flush', () => {}); }
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in props ? props[k] : null),
    setProperty: (k, v) => { if (falloProp) throw new Error('Exception: Service error: Properties'); props[k] = v; }
  }) },
  Utilities: { sleep: ms => pausas.push(ms) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {}, removeAll() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => JSON.parse(t) }) }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(archivo, 'utf8'), ctx);

// ---------- usuarios, clientes, observaciones ----------
const tokens = { vend: { rol: 'vendedor_estandar', cod: 'V1', usr: 'V1' }, admin: { rol: 'admin', cod: 'ADM', usr: 'ADM' },
  cli: { rol: 'cliente_estandar', cod: '100', usr: '100' }, ofi: { rol: 'oficina', cod: 'OF', usr: 'OF' } };
ctx.verificarToken = t => tokens[t] || null;
ctx.getFinanzasCliente = c => ({ 100: { vendedor: 'V1', nombre: 'Cliente 100', cupoMes: 1000, pgProm3M: 5 },
  200: { vendedor: 'V1', nombre: 'Cliente 200', cupoMes: 0, pgProm3M: 0 },
  999: { vendedor: 'V1', nombre: 'Prueba', cupoMes: 500, pgProm3M: 0 } }[c] || null);
ctx.getConfig = () => ({ cuenta_prueba: '999' });
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
  g[4] === 3 && g[5] === 1200 && g[6] === filaDe(p.id) && g[7] === 'ok' && g[8] === 'v36-pedido-verificado' && typeof g[9] === 'number' && g[9] >= 0, JSON.stringify(g));
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

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
