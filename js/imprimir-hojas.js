/**
 * HOJAS IMPRESAS DE PEDIDOS
 *
 * Arma, para cada pedido elegido en la bandeja, la hoja de preparacion
 * (deposito, sin precios, separada por piso) y la hoja de facturacion
 * (uso interno), y abre el dialogo de impresion del navegador.
 *
 * Rendimiento: todas las alturas son fijas en mm, asi que el paginado se
 * calcula con sumas, sin medir nada en pantalla. Las fotos se piden una vez
 * por producto, en miniatura, y se precargan mientras se usa la bandeja.
 */

const TAMANO_TANDA = 10;
const ESPERA_FOTOS_MS = 4000;      // limite total de descarga de fotos
const ESPERA_DIBUJO_MS = 2000;     // limite para que las <img> insertadas se carguen y decodifiquen
const DESCARGAS_SIMULTANEAS = 8;

// Preparacion y facturacion en una sola hoja solo si sobra este margen
const MARGEN_HOJA_UNICA = 0.92;

// Observaciones cuyos articulos llevan foto en la hoja de preparacion (las
// que el deposito prepara para el cliente). Para sumar otra, agregar su codigo
const OBS_CON_FOTO = ['113', '115'];

const PISO_PB = 'PLANTA BAJA';
const PISO_1 = '1ER PISO';
const PISO_SIN = 'SIN UBICACIÓN';
const ORDEN_PISOS = [PISO_PB, PISO_1, PISO_SIN];

// Excepciones al piso que sale de la categoria. Se revisan en orden y gana
// la primera que coincide. Una regla aplica si el codigo empieza con
// "prefijo" y, si tiene "rubros", ademas la categoria del producto empieza
// con alguno de ellos; sin "rubros", aplica a todo el prefijo. Mayusculas y
// espacios sobrantes no importan.
const EXCEPCIONES_PISO = [
  // ---------- Hacia PLANTA BAJA ----------

  // Todo el prefijo
  { prefijo: 'RUC',    piso: PISO_PB },  // Rubi: caños de PVC L/100 y L/110 (rubro 2, pero estan en planta baja)
  { prefijo: 'DUC',    piso: PISO_PB },  // caños de PPN bicapa, tricapa y K10 (rubro 2)
  { prefijo: 'LE',     piso: PISO_PB },  // caños de PVC L/100, referencia LE (rubro 2)
  { prefijo: 'FER',    piso: PISO_PB },  // accesorios para calefon electrico (rubro 1)

  // Solo algunos rubros del prefijo
  { prefijo: 'DAM',  rubros: ['1.CALEFON'],          piso: PISO_PB },  // accesorios para calefon: resistencias, kits y griferia (el resto de DAM, por categoria)
  { prefijo: 'TF',   rubros: ['1.DESLIZANTE'],       piso: PISO_PB },  // deslizante para caños (el resto de TF, por categoria)
  { prefijo: 'EVOL', rubros: ['2.TIJERA CORTATUBO'], piso: PISO_PB },  // tijera cortatubo de fusion

  // ---------- Hacia el 1ER PISO ----------

  // Todo el prefijo
  { prefijo: 'CRE',    piso: PISO_1 },  // Crecchio: separadores en cruz
  { prefijo: 'SB',     piso: PISO_1 },  // correas (rubro 8, pero estan en el 1er piso)
  { prefijo: 'GAG',    piso: PISO_1 },  // Gamma: maquinas, herramientas electricas y bombas
  { prefijo: 'ROCKY',  piso: PISO_1 },  // Rocky: calzado de seguridad
  { prefijo: 'PRO',    piso: PISO_1 },  // Proforce: botas de goma
  { prefijo: 'PERF',   piso: PISO_1 },  // Perfecto: abrazaderas
  { prefijo: 'TM',     piso: PISO_1 },  // sogas e hilos
  { prefijo: 'KO',     piso: PISO_1 },  // Komasa: bombas y motores
  { prefijo: 'UMI',    piso: PISO_1 },  // UMI: maquinas y accesorios
  { prefijo: 'MOI',    piso: PISO_1 },  // Moises: palas y cabos
  { prefijo: 'PLASTI', piso: PISO_1 },  // accesorios de riego, mangueras y caños cristal
  { prefijo: 'TORN',   piso: PISO_1 },  // Tornado: cargadores de bateria
  { prefijo: 'FT',     piso: PISO_1 },  // fratachos de pino y algarrobo, zarandas y cabos (rubro 8)
  { prefijo: 'CER',    piso: PISO_1 },  // separadores para ceramicas (rubro 8)
  { prefijo: 'EXT',    piso: PISO_1 },  // Extender: accesorios de cortina y placard, y tenders (rubro 8)
  { prefijo: 'TUC',    piso: PISO_1 },  // Tucan: rodillos, pinceles, pinceletas y bandeja de pintor (rubro 7)
  { prefijo: 'SF',     piso: PISO_1 },  // mangueras de riego, caños cristal Max-Agua, accesorios de pileta y reguladores de gas
  { prefijo: 'PV',     piso: PISO_1 },  // fratachos plasticos Tenda y escurridor de pintor (rubros 7 y 8)

  // Solo algunos rubros del prefijo
  { prefijo: 'ALI',  rubros: ['8.ESTUFA', '8.ANAFE'],           piso: PISO_1 },  // Aligas: estufas y anafes
  { prefijo: 'LOU',  rubros: ['8.AZADAS', '8.PALA', '8.PICOS'], piso: PISO_1 },  // azadas, palas y picos
  { prefijo: 'MIC',  rubros: ['8.SOPLETE'],                     piso: PISO_1 },  // sopletes
  { prefijo: 'EA',   rubros: ['8.AISLANTES'],                   piso: PISO_1 },  // aislantes
  { prefijo: 'LH',   rubros: ['8.TACO', '8.TARUGO'],            piso: PISO_1 },  // tacos y tarugos
  { prefijo: 'MAV',  rubros: ['9.CABLECANAL', '8.CALEFACCION'], piso: PISO_1 },  // cablecanal y calefaccion (el resto de MAV, en planta baja)
  { prefijo: 'WIM',  rubros: ['8.MAQ'],                         piso: PISO_1 },  // bordeadoras y accesorios
  { prefijo: 'EVOL', rubros: ['8.TEJIDO MOSQ'],                 piso: PISO_1 },  // tejido mosquitero de PVC y de aluminio
];

const normTexto = s => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

// La tabla normalizada una sola vez, al cargar el modulo
const REGLAS_PISO = EXCEPCIONES_PISO.map(e => ({
  piso: e.piso,
  prefijo: normTexto(e.prefijo),
  rubros: (e.rubros || []).map(normTexto)
}));

// Alturas en mm: unica fuente. Se pasan al CSS como variables --ih-*
const MM = {
  hoja: 280, cabPrep: 34, obs: 14, cabCont: 9, franja: 7, fila: 19,
  firmas: 40, pie: 6, cabFact: 26, filaFact: 5.5, totales: 26,
  firmasFact: 14, separador: 8, reimp: 9,
  // Recuadro de observaciones: titulo (con su margen y bordes) y cada renglon
  // en preparacion; en facturacion, el titulo de cada observacion
  obsCab: 8, obsFila: 5, obsFilaFoto: 12, obsTitFact: 4.5,
  // Titulo de piso en facturacion: un renglon fino, mas bajo que una linea
  pisoFact: 4
};

// Caracteres de codigo que entran en un renglon de la columna Codigo de
// facturacion (calculado con las letras mas anchas). Un codigo mas largo
// pasa a otro renglon y la linea ocupa el doble de alto en el paginado
const COD_POR_RENGLON = 14;

const ZONA = 'America/Argentina/Buenos_Aires';
const COLLATOR = new Intl.Collator('es', { numeric: true });

// ---------- formato ----------
// Repetidas de imprimir.js para no crear una importacion circular

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtPesos(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  const f = new Date(iso);
  if (isNaN(f)) return '—';
  // hourCycle h23: siempre 24 horas ("17:42"), nunca "05:42 p. m."
  return f.toLocaleString('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

const normSku = sku => String(sku ?? '').trim().toUpperCase();

// ---------- datos ----------

let datos = null;
let datosPromesa = null;

async function leerJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

let clientes = null;
let clientesPromesa = null;

/**
 * Padron de clientes (cuenta -> { name, ... }), una sola vez. Lo usa
 * tambien la bandeja para mostrar el nombre completo: el del servidor
 * puede llegar cortado. Si falla, devuelve un padron vacio y el proximo
 * pedido lo vuelve a intentar.
 */
export function cargarClientes() {
  if (!clientesPromesa) {
    clientesPromesa = leerJson('./json/clientes_permisos.json')
      .catch(() => { clientesPromesa = null; return {}; })
      .then(c => (clientes = c));
  }
  return clientesPromesa;
}

/** Nombre completo del padron, con el del servidor como respaldo. */
const nombreCliente = p =>
  clientes?.[String(p.cliente ?? '').trim()]?.name || p.nombreCliente || '';

/**
 * Productos, mapa de imagenes y clientes, una sola vez. Sin productos no
 * hay pisos, asi que ese es obligatorio; los otros dos tienen respaldo.
 */
function cargarDatos() {
  if (!datosPromesa) {
    datosPromesa = Promise.all([
      leerJson('./json/productos.json'),
      leerJson('./json/catalogo_imagenes.json').then(j => j.images || {}).catch(() => ({})),
      cargarClientes()
    ]).then(([productos, imagenes, clientes]) => {
      datos = { productos, imagenes, clientes };
      return datos;
    }).catch(e => {
      datosPromesa = null;   // permitir reintentar
      throw e;
    });
  }
  return datosPromesa;
}

function skusDe(pedidos) {
  const skus = new Set();
  pedidos.forEach(p => (p.lineas || []).forEach(l => {
    const sku = normSku(l.sku);
    if (sku) skus.add(sku);
  }));
  // Y los articulos de las observaciones con foto en la preparacion
  pedidos.forEach(p => (p.observaciones || []).forEach(o => {
    if (!OBS_CON_FOTO.includes(String(o.codigo).trim())) return;
    (o.items || []).forEach(it => {
      const sku = normSku(it.sku);
      if (sku) skus.add(sku);
    });
  }));
  return [...skus];
}

// ---------- fotos ----------
// Una descarga por producto, compartida entre la precarga y la impresion

const fotos = new Map();   // sku -> { estado, src, promesa, resolver }
let cola = [];
let activas = 0;
const medicion = { descargadas: 0, sinSufijo: 0, fallidas: 0 };

// Mismo mecanismo que el carrito, con el sufijo de miniatura que ya usa
// carrito-panel.js
function urlFoto(id, miniatura) {
  return `https://lh3.googleusercontent.com/d/${id}` + (miniatura ? '=w120' : '');
}

function probar(src) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(src);
    img.onerror = mal;
    img.src = src;
  });
}

function bajar(sku) {
  const f = fotos.get(sku);
  const id = datos.imagenes[sku];
  f.estado = 'bajando';
  activas++;

  probar(urlFoto(id, true))
    .catch(() => probar(urlFoto(id, false)).then(src => { medicion.sinSufijo++; return src; }))
    .then(
      src => { f.estado = 'ok'; f.src = src; medicion.descargadas++; },
      () => { f.estado = 'error'; medicion.fallidas++; }
    )
    .finally(() => {
      activas--;
      f.resolver();
      bombear();
    });
}

function bombear() {
  while (activas < DESCARGAS_SIMULTANEAS && cola.length) bajar(cola.shift());
}

/** Encola los sku con foto. Con prioridad, los que esperan pasan al frente. */
function encolar(skus, prioridad) {
  const adelante = [];
  skus.forEach(sku => {
    if (!datos.imagenes[sku]) return;
    let f = fotos.get(sku);
    if (!f) {
      f = { estado: 'cola' };
      f.promesa = new Promise(r => { f.resolver = r; });
      fotos.set(sku, f);
      (prioridad ? adelante : cola).push(sku);
    } else if (prioridad && f.estado === 'cola') {
      adelante.push(sku);
    }
  });

  if (adelante.length) {
    const set = new Set(adelante);
    cola = adelante.concat(cola.filter(s => !set.has(s)));
  }
  bombear();
}

/** Precarga en segundo plano: no se espera ni bloquea la bandeja. */
export function precargar(pedidos) {
  cargarDatos().then(() => {
    const skus = skusDe(pedidos);
    encolar(skus, false);
    console.log(`[Hojas] Precarga: ${skus.length} productos de ${pedidos.length} pedidos`);
  }).catch(e => console.warn('[Hojas] Precarga sin datos:', e));
}

// ---------- piso, orden y bulto ----------

function pisoDe(sku, categoria) {
  const cod = normTexto(sku);
  const cat = normTexto(categoria);
  const regla = REGLAS_PISO.find(r => cod.startsWith(r.prefijo) &&
    (!r.rubros.length || r.rubros.some(rubro => cat.startsWith(rubro))));
  if (regla) return regla.piso;

  // El numero antes del punto: "8.ALAMBRE..." -> 8
  const n = parseInt(String(categoria ?? '').trim(), 10);
  if (n >= 1 && n <= 5) return PISO_1;
  if (n >= 6 && n <= 9) return PISO_PB;
  return PISO_SIN;
}

/** Letras iniciales del codigo, antes del primer numero. */
const prefijoDe = sku => (sku.match(/^[^0-9]*/) || [''])[0];

function textoBulto(cant, bulk) {
  if (!bulk || bulk <= 1 || !cant) return '';
  if (cant < bulk) return `bulto x${fmtNum(bulk)}`;
  const n = Math.floor(cant / bulk);
  const resto = Math.round((cant - n * bulk) * 100) / 100;
  return `${n} ${n === 1 ? 'bulto' : 'bultos'}` + (resto ? ` + ${fmtNum(resto)} u.` : '');
}

/**
 * Leyenda del precio aplicado en la columna Tipo de la facturacion.
 * descLinea: el porcentaje que eligio el vendedor (0 sin descuento o en
 * promocion; null en los pedidos guardados antes de registrarlo, que
 * muestran lo mismo que antes, sin porcentaje).
 */
function tipoDe(l) {
  const letra = x => String(x ?? '').trim().toUpperCase();
  // Con coma decimal y sin decimales de mas: -5%, -12,5% (null o 0: nada)
  const pct = Number(l.descLinea) > 0 ? ` -${fmtNum(l.descLinea)}%` : '';

  switch (l.mecanismo) {
    case 'promocion': return 'Promo';
    case 'precio_libre': return 'Precio especial' + pct;
    case 'otra_lista': return ('Lista ' + letra(l.listaAplicada)).trim() + pct;
    case 'lista_cliente':
    case '':
    case undefined:
      // A lista del cliente no lleva leyenda, salvo que el vendedor haya elegido un descuento
      return pct ? ('Lista ' + letra(l.listaCliente || l.listaAplicada)).trim() + pct : '';
    default: return '';
  }
}

// ---------- orden por piso (las dos hojas) ----------

/**
 * Lineas agrupadas por piso, en el orden de la hoja de preparacion: planta
 * baja, 1er piso y sin ubicacion; dentro de cada piso, por prefijo y despues
 * por codigo. Es el unico lugar que decide el orden: la facturacion lo sigue
 * para que quien factura encuentre las lineas en el mismo lugar.
 * nuevoGrupo marca el cambio de prefijo (solo lo dibuja la preparacion).
 */
function agruparPorPiso(lineas) {
  return ORDEN_PISOS.map(nombre => {
    const items = lineas.filter(it => it.piso === nombre)
      .sort((a, b) => COLLATOR.compare(a.prefijo, b.prefijo) || COLLATOR.compare(a.sku, b.sku));
    items.forEach((it, i) => { it.nuevoGrupo = i > 0 && it.prefijo !== items[i - 1].prefijo; });
    return { nombre, items };
  }).filter(pi => pi.items.length);
}

/**
 * Renglones de la facturacion: el titulo de cada piso y sus lineas, en el
 * orden de agruparPorPiso. El paginado y la hoja unica miden esta misma lista.
 */
function filasFacturacion(pisos) {
  return pisos.flatMap(pi => [
    { tipo: 'piso', piso: pi.nombre, total: pi.items.length },
    ...pi.items.map(it => ({ tipo: 'linea', piso: pi.nombre, it }))
  ]);
}

// ---------- observaciones ----------

const EFECTO_OBS = { descuenta: 'Descuenta', suma: 'Suma', ajuste: 'Ajuste' };
const LADO_OBS = { facturado: 'Lo facturado', correspondia: 'Lo que correspondía' };

/**
 * Renglones del recuadro de observaciones, los mismos en las dos hojas: el
 * titulo de cada observacion y sus articulos (en la de ajuste, separados en
 * lo facturado y lo que correspondia). Las de Condiciones, solo el titulo.
 */
function filasObservaciones(obs) {
  return obs.flatMap(o => {
    const items = (o.items || []).map(it => {
      const sku = normSku(it.sku);
      return { ...it, sku, nombre: it.nombre || datos.productos[sku]?.name || '' };
    });
    const filas = [{ tipo: 'obsTit', o }];
    if (o.efecto === 'ajuste') {
      ['facturado', 'correspondia'].forEach(lado => {
        const del = items.filter(it => it.lado === lado);
        if (del.length) filas.push({ tipo: 'obsLado', texto: LADO_OBS[lado] }, ...del.map(it => ({ tipo: 'obsItem', o, it })));
      });
    } else {
      // foto: solo la usa la preparacion (OBS_CON_FOTO); la facturacion la ignora
      const foto = OBS_CON_FOTO.includes(String(o.codigo).trim());
      filas.push(...items.map(it => ({ tipo: 'obsItem', o, it, foto })));
    }
    return filas;
  });
}

const esTituloObs = f => f.tipo === 'obsTit' || f.tipo === 'obsLado';

/** Alto de un renglon del recuadro de preparacion: con foto o sin foto */
const altoFilaObs = f => (f.tipo === 'obsItem' && f.foto ? MM.obsFilaFoto : MM.obsFila);

// ---------- paginado ----------

/**
 * Reparte los pisos en hojas. Cada piso abre con su franja y sigue con
 * renglones de dos columnas; si no entra, continua en la hoja siguiente.
 */
function paginarPrep(pisos, conObs, conReimp, filasObs = []) {
  const hojas = [];
  const nueva = primera => {
    const cab = primera
      ? MM.cabPrep + (conObs ? MM.obs : 0) + (conReimp ? MM.reimp : 0)
      : MM.cabCont;
    const h = { primera, bloques: [], firmas: false, usado: cab + MM.pie };
    hojas.push(h);
    return h;
  };

  let hoja = nueva(true);

  // Recuadro de observaciones, arriba de los articulos. Si no entra, sigue en
  // la hoja siguiente ("continúa"); un titulo nunca queda solo al pie
  let k = 0;
  let sigue = false;
  while (k < filasObs.length) {
    const libre = MM.hoja - hoja.usado - MM.obsCab;
    let n = 0;
    let alto = 0;
    while (k + n < filasObs.length && alto + altoFilaObs(filasObs[k + n]) <= libre) {
      alto += altoFilaObs(filasObs[k + n]);
      n++;
    }
    if (n < 1) {
      // Resguardo: en una hoja recien empezada siempre entra un renglon
      if (!hoja.bloques.length && !hoja.primera) { n = 1; alto = altoFilaObs(filasObs[k]); }
      else { hoja = nueva(false); continue; }
    }
    while (k + n < filasObs.length && n > 1 && esTituloObs(filasObs[k + n - 1])) {
      n--;
      alto -= altoFilaObs(filasObs[k + n]);
    }
    hoja.bloques.push({ tipo: 'obs', filas: filasObs.slice(k, k + n), continua: sigue, alto });
    hoja.usado += MM.obsCab + alto;
    k += n;
    sigue = true;
    if (k < filasObs.length) hoja = nueva(false);
  }

  pisos.forEach(piso => {
    let i = 0;
    let continua = false;
    while (i < piso.items.length) {
      const filas = Math.floor((MM.hoja - hoja.usado - MM.franja) / MM.fila);
      if (filas < 1) { hoja = nueva(false); continue; }

      const k = Math.min(piso.items.length - i, filas * 2);
      const usadas = Math.ceil(k / 2);
      hoja.bloques.push({ tipo: 'franja', piso: piso.nombre, total: piso.items.length, continua });
      hoja.bloques.push({ tipo: 'grilla', filas: usadas, items: piso.items.slice(i, i + k) });
      hoja.usado += MM.franja + usadas * MM.fila;

      i += k;
      continua = true;
      if (i < piso.items.length) hoja = nueva(false);
    }
  });

  if (MM.hoja - hoja.usado < MM.firmas) hoja = nueva(false);
  hoja.firmas = true;
  hoja.usado += MM.firmas;
  return hojas;
}

/** Renglones que ocupa una linea en facturacion: el codigo va completo. */
const renglonesFact = it => Math.max(1, Math.ceil(it.sku.length / COD_POR_RENGLON));

/** Alto en mm de un renglon de facturacion: titulo de piso o linea */
// Titulos (piso, observaciones) en un renglon fino; lineas y articulos de observaciones, segun su codigo
const ALTO_TITULO_FACT = { piso: () => MM.pisoFact, obsLado: () => MM.pisoFact,
  obsCab: () => MM.obsTitFact, obsTit: () => MM.obsTitFact, obsNota: () => MM.pisoFact };
const altoFilaFact = f => (ALTO_TITULO_FACT[f.tipo] ? ALTO_TITULO_FACT[f.tipo]() : renglonesFact(f.it) * MM.filaFact);
const esTituloFact = f => f.tipo !== 'linea' && f.tipo !== 'obsItem';

/**
 * Hojas de facturacion: totales y firmas al final de la ultima.
 * Una hoja que empieza en medio de un piso repite su titulo ("continúa"),
 * igual que la preparacion. Un titulo nunca queda solo al pie de una hoja:
 * baja con su primera linea.
 */
// cierre: alto de los totales y las firmas
function paginarFact(filas, cierre = MM.totales + MM.firmasFact) {
  const hojas = [];
  let i = 0;
  let primera = true;

  for (;;) {
    // El encabezado de la tabla ocupa un renglon
    let libre = MM.hoja - (primera ? MM.cabFact : MM.cabCont) - MM.pie - MM.filaFact;

    const continua = i < filas.length && filas[i].tipo === 'linea' ? filas[i].piso : null;
    if (continua) libre -= MM.pisoFact;

    let alto = 0;
    let j = i;
    while (j < filas.length) {
      const a = altoFilaFact(filas[j]);
      const conSiguiente = esTituloFact(filas[j]) && j + 1 < filas.length
        ? altoFilaFact(filas[j + 1]) : 0;
      if (alto + a + conSiguiente > libre) break;
      alto += a;
      j++;
    }
    // Titulos que quedaron juntos al pie (una observacion y su lado): bajan
    // con su primer renglon. Un titulo de piso nunca llega aca solo
    while (j < filas.length && j - 1 > i && esTituloFact(filas[j - 1])) {
      j--;
      alto -= altoFilaFact(filas[j]);
    }
    // Resguardo: un renglon que no entra ni en una hoja vacia se pone igual,
    // para no repetir hojas vacias sin fin
    if (j === i && i < filas.length) { alto += altoFilaFact(filas[i]); j = i + 1; }

    // Entraron todas y tambien el cierre
    if (j === filas.length && alto + cierre <= libre) {
      hojas.push({ primera, desde: i, hasta: j, cierre: true, continua });
      return hojas;
    }

    // Si entraron todas pero no el cierre, el cierre va solo en la siguiente
    hojas.push({ primera, desde: i, hasta: j, cierre: false, continua });
    i = j;
    primera = false;
  }
}

// ---------- armado: preparacion ----------

function htmlFoto(sku) {
  const f = fotos.get(sku);
  if (f?.estado === 'ok') return `<img class="ih-foto" src="${esc(f.src)}" alt="">`;
  return `<span class="ih-foto ih-sinfoto">${esc(sku)}</span>`;
}

function htmlItem(it, grupo) {
  const bulto = textoBulto(it.cantidad, it.bulk);
  return `
    <div class="ih-item${grupo ? ' ih-grupo' : ''}">
      <span class="ih-ord">${it.n}</span>
      ${htmlFoto(it.sku)}
      <div class="ih-texto">
        <b class="ih-cod">${esc(it.sku)}</b>
        <span class="ih-desc">${esc(it.nombre)}</span>
        <span class="ih-reemp">Reemp.: ..................</span>
      </div>
      <div class="ih-cant"><b>${fmtNum(it.cantidad)}</b>${bulto ? `<small>${esc(bulto)}</small>` : ''}</div>
      <div class="ih-ok"><span>OK</span><i></i></div>
      <div class="ih-real"><span>REAL</span><i></i></div>
    </div>`;
}

function htmlGrilla(b) {
  // Columna izquierda completa y despues la derecha: la divisoria de
  // prefijo no va en el primer renglon de cada columna
  const items = b.items.map((it, i) =>
    htmlItem(it, it.nuevoGrupo && i !== 0 && i !== b.filas)).join('');
  return `<div class="ih-grilla" style="grid-template-rows:repeat(${b.filas},var(--ih-fila))">${items}</div>`;
}

function htmlFranja(b) {
  return `<div class="ih-franja"><b>${esc(b.piso)}</b>
    <span>${b.total} ${b.total === 1 ? 'línea' : 'líneas'}${b.continua ? ' · continúa' : ''}</span></div>`;
}

/** Recuadro de observaciones de la preparacion: alto fijo por renglon (MM.obsCab, MM.obsFila) */
function htmlObsPrep(b) {
  const filas = b.filas.map(f => {
    if (f.tipo === 'obsTit') {
      return `<div class="ih-obs-tit"><b>${esc(f.o.codigo)}</b> ${esc(f.o.texto)}` +
        `${EFECTO_OBS[f.o.efecto] ? ` <span>· ${EFECTO_OBS[f.o.efecto]}</span>` : ''}</div>`;
    }
    if (f.tipo === 'obsLado') return `<div class="ih-obs-lado">${esc(f.texto)}</div>`;
    // Cuadradito para tildar en el deposito, como OK en los articulos; en
    // las de OBS_CON_FOTO, con la foto (la misma de la grilla)
    return `<div class="ih-obs-item${f.foto ? ' ih-obs-item-foto' : ''}"><i></i>${f.foto ? htmlFoto(f.it.sku) : ''}` +
      `<b>${fmtNum(f.it.cantidad)}</b>` +
      `<span class="ih-obs-cod">${esc(f.it.sku)}</span><span class="ih-obs-nom">${esc(f.it.nombre)}</span></div>`;
  }).join('');
  // Alto: el titulo mas la suma de los renglones, la misma que midio paginarPrep
  return `<div class="ih-obs-caja" style="height:calc(var(--ih-obs-cab) - 1.5mm + ${b.alto}mm)">
    <div class="ih-obs-caja-tit">OBSERVACIONES${b.continua ? ' <span>· continúa</span>' : ''}</div>${filas}</div>`;
}

function htmlCabPrep(c, lineas) {
  return `
    <header class="ih-cab-prep">
      <div class="ih-cab-fila">
        <span class="ih-titulo">Hoja de preparación</span>
        <span class="ih-numero">N° ${esc(c.numero)}</span>
      </div>
      <div class="ih-cliente">${esc(c.cuenta)} · ${esc(c.nombre)}</div>
      <div class="ih-datos">
        <span><b>Fecha:</b> ${esc(c.fecha)}</span>
        <span><b>Vendedor:</b> ${esc(c.vendedor)}</span>
        ${c.soloObs ? '<span class="ih-solo-obs">SOLO OBSERVACIONES</span>' : `<span><b>Líneas:</b> ${lineas}</span>`}
      </div>
      <div class="ih-instr">OK: tildar si sale completa · REAL: cantidad entregada si falta · Reemp.: código entregado si se cambia de marca</div>
    </header>
    ${c.obs ? `<div class="ih-obs"><b>OBSERVACIONES</b> ${esc(c.obs)}</div>` : ''}`;
}

/** Franja de las hojas reimpresas, con la impresion original. */
function htmlReimp(p) {
  const f = p.fechaImpresion ? new Date(p.fechaImpresion) : null;
  let texto;
  if (f && !isNaN(f)) {
    const fecha = f.toLocaleDateString('es-AR',
      { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = f.toLocaleTimeString('es-AR',
      { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    texto = `impreso originalmente el ${fecha} a las ${hora}`;
  } else {
    texto = 'fecha de impresión original desconocida';
  }
  const por = String(p.impresoPor ?? '').trim();
  if (por) texto += ` por ${por}`;
  return `<div class="ih-reimp"><b>REIMPRESIÓN</b> · ${esc(texto)}</div>`;
}

function htmlCabCont(titulo, c) {
  return `<header class="ih-cab-cont"><b>${titulo}</b> · N° ${esc(c.numero)} · ${esc(c.cuenta)} · ${esc(c.nombre)} <span>(continuación)</span></header>`;
}

const FIRMAS_PREP = ['PREPARÓ', 'UBICACIÓN', 'CONTROLÓ', 'HORA', 'BULTOS', 'CAÑOS', 'BALDE / OTROS'];

function htmlFirmasPrep() {
  return `
    <div class="ih-firmas">
      <div class="ih-firmas-fila">${FIRMAS_PREP.map(t => `<div class="ih-caja"><span>${t}</span></div>`).join('')}</div>
      <div class="ih-caja ih-caja-ancha"><span>NOTAS PARA FACTURACIÓN</span></div>
    </div>`;
}

function htmlPie(c, k, total) {
  return `<footer class="ih-pie">Pedido N° ${esc(c.numero)} · ${esc(c.nombre)} · Hoja ${k} de ${total}</footer>`;
}

// ---------- armado: facturacion ----------

function htmlCabFact(c) {
  return `
    <header class="ih-cab-fact">
      <div class="ih-cab-fila">
        <span class="ih-titulo">Facturación <small>uso interno</small></span>
        <span class="ih-numero">N° ${esc(c.numero)}</span>
      </div>
      <div class="ih-cliente">${esc(c.cuenta)} · ${esc(c.nombre)}${c.lista ? ` · <span class="ih-lista">LISTA ${esc(c.lista)}</span>` : ''}</div>
      <div class="ih-datos">
        <span><b>Fecha:</b> ${esc(c.fecha)}</span>
        <span><b>Vendedor:</b> ${esc(c.vendedor)}</span>${c.soloObs ? '<span class="ih-solo-obs">SOLO OBSERVACIONES</span>' : ''}
        ${c.obs ? `<span class="ih-datos-obs"><b>Obs.:</b> ${esc(c.obs)}</span>` : ''}
      </div>
      <div class="ih-instr">N°: orden en el pedido</div>
    </header>`;
}

function htmlPisoFact(piso, total, continua) {
  return `<tr class="ih-piso-fact"><td colspan="7"><b>${esc(piso)}</b>
    <span>· ${continua ? 'continúa' : `${total} ${total === 1 ? 'línea' : 'líneas'}`}</span></td></tr>`;
}

function htmlObsTitFact(o) {
  return `<tr class="ih-obs-tit-fact"><td colspan="7"><b>${esc(o.codigo)}</b> ${esc(o.texto)}` +
    `${EFECTO_OBS[o.efecto] ? ` <span>· ${EFECTO_OBS[o.efecto]}</span>` : ''}</td></tr>`;
}

function htmlObsItemFact(f) {
  const renglones = renglonesFact(f.it);
  return `<tr class="ih-obs-item-fact"${renglones > 1 ? ` style="height:calc(var(--ih-fila-fact) * ${renglones})"` : ''}>
    <td class="ih-n"></td>
    <td class="ih-tcod">${esc(f.it.sku)}</td>
    <td class="ih-num">${fmtNum(f.it.cantidad)}</td>
    <td>${esc(f.it.nombre)}</td>
    <td></td><td></td><td></td>
  </tr>`;
}

// filas: renglones de filasFacturacion; continua: piso que sigue de la hoja anterior
function htmlTablaFact(filas, continua) {
  const cuerpo = (continua ? htmlPisoFact(continua, 0, true) : '') + filas.map(f => {
    if (f.tipo === 'piso') return htmlPisoFact(f.piso, f.total, false);
    if (f.tipo === 'obsCab') return '<tr class="ih-obs-cab-fact"><td colspan="7"><b>OBSERVACIONES</b></td></tr>';
    if (f.tipo === 'obsTit') return htmlObsTitFact(f.o);
    if (f.tipo === 'obsLado') return `<tr class="ih-obs-lado-fact"><td></td><td colspan="6">${esc(f.texto)}</td></tr>`;
    if (f.tipo === 'obsItem') return htmlObsItemFact(f);
    const it = f.it;
    const l = it.linea;
    const tipo = tipoDe(l);
    const renglones = renglonesFact(it);
    // Alto fijo segun los renglones del codigo: el mismo que usa el paginado.
    // N°: el de la linea en el pedido original, la referencia entre las dos hojas
    return `<tr${renglones > 1 ? ` style="height:calc(var(--ih-fila-fact) * ${renglones})"` : ''}>
      <td class="ih-n">${it.n}</td>
      <td class="ih-tcod">${esc(it.sku)}</td>
      <td class="ih-num">${fmtNum(it.cantidad)}</td>
      <td>${esc(it.nombre)}</td>
      <td class="ih-num">${fmtPesos(l.precioUnitario)}</td>
      <td class="ih-num">${fmtPesos(l.subtotal)}</td>
      <td>${tipo ? `<span class="ih-tipo">${esc(tipo)}</span>` : ''}</td>
    </tr>`;
  }).join('');

  return `
    <table class="ih-tabla">
      <colgroup><col class="c-n"><col class="c-cod"><col class="c-cant"><col>
        <col class="c-pu"><col class="c-sub"><col class="c-tipo"></colgroup>
      <thead><tr><th>N°</th><th>Código</th><th class="ih-num">Cant.</th><th>Descripción</th>
        <th class="ih-num">P. unit.</th><th class="ih-num">Subtotal</th><th>Tipo</th></tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>`;
}

function htmlCierreFact(t) {
  // Con segundo descuento: "7 % y además 5 %", en cascada
  const pcts = t.extra ? `${fmtNum(t.pct)} % y además ${fmtNum(t.extra)} %` : `${fmtNum(t.pct)} %`;
  const desc = t.pct || t.descuento
    ? `Descuento sobre el total (${pcts}, no alcanza a las promociones)`
    : 'Descuento sobre el total';
  // Pedido solo de observaciones: sin articulos no hay totales. Mismo alto
  // (MM.totales), asi el paginado no cambia. En la etapa 2 aca va el resumen
  // de importes de las observaciones
  const totales = t.soloObs
    ? `<div class="ih-totales ih-totales-solo-obs"><div class="ih-solo-obs-cierre">PEDIDO SOLO DE OBSERVACIONES</div></div>`
    : `<div class="ih-totales">
      <div><span>Total bruto</span><b>${fmtPesos(t.bruto)}</b></div>
      <div><span>Líneas en promoción</span><b>${fmtPesos(t.promo)}</b></div>
      <div><span>${desc}</span><b>${t.descuento ? '−' + fmtPesos(t.descuento) : '—'}</b></div>
      <div class="ih-neto"><span>TOTAL NETO</span><b>${fmtPesos(t.neto)}</b></div>
    </div>`;
  return `
    ${totales}
    <div class="ih-firmas-fact">
      <div class="ih-caja"><span>FACTURÓ</span></div>
      <div class="ih-caja"><span>N° DE FACTURA</span></div>
      <div class="ih-caja"><span>FECHA</span></div>
    </div>`;
}

function htmlBloqueFact(h, c, filas, totales) {
  return (h.primera ? htmlCabFact(c) : htmlCabCont('Facturación', c)) +
    (h.hasta > h.desde ? htmlTablaFact(filas.slice(h.desde, h.hasta), h.continua) : '') +
    (h.cierre ? htmlCierreFact(totales) : '');
}

// ---------- armado de un pedido ----------

// Pedido del cliente de prueba: marca de agua en cada hoja, de preparacion y
// de facturacion. Es texto con borde, no un fondo: sale impresa aunque el
// navegador no imprima graficos de fondo
const MARCA_PRUEBA = '<div class="ih-marca-prueba" aria-hidden="true"><b>PRUEBA</b><span>NO FACTURAR</span></div>';

function armarPedido(p, reimpresion) {
  const c = {
    numero: p.numero || '—',
    fecha: fmtFechaHora(p.fecha),
    cuenta: p.cliente ?? '',
    // El servidor puede mandar el nombre cortado: se prefiere el del padron
    nombre: nombreCliente(p),
    vendedor: p.vendedor || '—',
    lista: String(p.lista ?? '').trim(),
    // Pedidos con observaciones nuevas: van en el recuadro. Los viejos: el
    // renglon de siempre, con el motivo y la observacion libre
    obs: Array.isArray(p.observaciones) && p.observaciones.length ? ''
      : [p.motivo, p.obsLibre].map(s => String(s ?? '').trim()).filter(Boolean).join(' · '),
    soloObs: !(p.lineas || []).length && Array.isArray(p.observaciones) && p.observaciones.length > 0
  };
  const obs = Array.isArray(p.observaciones) ? p.observaciones : [];

  // Numero de orden: posicion en el pedido original, el mismo en las dos hojas
  const lineas = [...(p.lineas || [])]
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    .map((l, i) => {
      const sku = normSku(l.sku);
      const prod = datos.productos[sku];
      return {
        n: i + 1,
        sku,
        nombre: l.nombre || prod?.name || '',
        cantidad: Number(l.cantidad) || 0,
        bulk: Number(prod?.bulk) || 0,
        piso: pisoDe(sku, prod?.category),
        prefijo: prefijoDe(sku),
        linea: l
      };
    });

  // El mismo orden en las dos hojas: por piso, prefijo y codigo
  const pisos = agruparPorPiso(lineas);
  const filasObs = filasObservaciones(obs);
  // En facturacion, el recuadro va despues de los articulos, en la misma tabla
  const filasFact = filasFacturacion(pisos).concat(filasObs.length ? [{ tipo: 'obsCab' }, ...filasObs] : []);

  const sumaSub = lineas.reduce((a, it) => a + (Number(it.linea.subtotal) || 0), 0);
  const bruto = Number(p.totalBruto) || sumaSub;
  const neto = p.totalNeto != null && p.totalNeto !== '' ? Number(p.totalNeto) || 0 : bruto;
  const totales = {
    bruto,
    neto,
    promo: lineas.filter(it => it.linea.mecanismo === 'promocion')
      .reduce((a, it) => a + (Number(it.linea.subtotal) || 0), 0),
    pct: Number(p.descTotalPct) || 0,
    extra: Number(p.descTotalExtraPct) || 0,
    // Igual a lo que guardo el servidor
    descuento: Math.round((bruto - neto) * 100) / 100,
    soloObs: c.soloObs
  };

  const hojasPrep = paginarPrep(pisos, !!c.obs, reimpresion, filasObs);
  const ultima = hojasPrep[hojasPrep.length - 1];
  // Con los titulos de piso: la hoja unica mide lo mismo que el paginado
  const altoFact = MM.cabFact + MM.filaFact +
    filasFact.reduce((a, f) => a + altoFilaFact(f), 0) +
    MM.totales + MM.firmasFact;
  const unica = hojasPrep.length === 1 &&
    ultima.usado + MM.separador + altoFact <= MM.hoja * MARGEN_HOJA_UNICA;

  const hojasFact = unica ? [] : paginarFact(filasFact);
  const total = hojasPrep.length + hojasFact.length;

  const abrirHoja = p.prueba === true
    ? '<section class="ih-hoja ih-hoja-prueba">' + MARCA_PRUEBA
    : '<section class="ih-hoja">';

  let html = '';
  hojasPrep.forEach((h, i) => {
    let cuerpo = h.primera
      ? htmlCabPrep(c, lineas.length) + (reimpresion ? htmlReimp(p) : '')
      : htmlCabCont('Hoja de preparación', c);
    h.bloques.forEach(b => {
      cuerpo += b.tipo === 'franja' ? htmlFranja(b) : b.tipo === 'obs' ? htmlObsPrep(b) : htmlGrilla(b);
    });
    if (h.firmas) cuerpo += htmlFirmasPrep();
    if (unica) {
      cuerpo += '<div class="ih-separador">FACTURACIÓN · uso interno</div>' +
        htmlBloqueFact({ primera: true, desde: 0, hasta: filasFact.length, cierre: true }, c, filasFact, totales);
    }
    html += `${abrirHoja}${cuerpo}${htmlPie(c, i + 1, total)}</section>`;
  });

  hojasFact.forEach((h, i) => {
    html += `${abrirHoja}${htmlBloqueFact(h, c, filasFact, totales)}` +
      `${htmlPie(c, hojasPrep.length + i + 1, total)}</section>`;
  });

  return { html, hojas: total, lineas: lineas.length };
}

// ---------- pantalla: contenedor y aviso ----------

function contenedor() {
  let cont = document.getElementById('ih-hojas');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'ih-hojas';
    cont.setAttribute('aria-hidden', 'true');
    // Las alturas del paginado, para que el CSS use exactamente las mismas
    Object.entries(MM).forEach(([k, v]) => {
      cont.style.setProperty('--ih-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), v + 'mm');
    });
    document.body.appendChild(cont);
  }
  return cont;
}

/**
 * detalleHtml (opcional) va debajo del texto: ya tiene que venir escapado.
 * clase (opcional) se agrega a la caja, por ejemplo para mostrar el texto
 * como titulo de una pregunta.
 */
function mostrarAviso(texto, botones, detalleHtml, clase) {
  let av = document.getElementById('ih-aviso');
  if (!av) {
    av = document.createElement('div');
    av.id = 'ih-aviso';
    av.innerHTML = `
      <div class="ih-aviso-caja">
        <p class="ih-aviso-texto"></p>
        <div class="ih-aviso-detalle"></div>
        <div class="ih-aviso-botones"></div>
      </div>`;
    document.body.appendChild(av);
  }
  av.hidden = false;
  av.querySelector('.ih-aviso-caja').className = 'ih-aviso-caja' + (clase ? ' ' + clase : '');
  av.querySelector('.ih-aviso-texto').textContent = texto;
  av.querySelector('.ih-aviso-detalle').innerHTML = detalleHtml || '';

  const cont = av.querySelector('.ih-aviso-botones');
  cont.innerHTML = '';
  (botones || []).forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ih-btn' + (b.principal ? ' ih-btn-principal' : '');
    btn.textContent = b.texto;
    btn.addEventListener('click', b.accion);
    cont.appendChild(btn);
  });
}

function cerrar() {
  const av = document.getElementById('ih-aviso');
  if (av) av.hidden = true;
  const cont = document.getElementById('ih-hojas');
  if (cont) cont.innerHTML = '';
  tandas = [];
  // Respaldo por si el navegador no avisó el cierre del dialogo
  restaurarTitulo();

  // Al terminar o cancelar: la bandeja se actualiza con lo que se marco
  const alTerminar = opciones.alTerminar;
  const impresos = [...impresosConfirmados];
  opciones = {};
  impresosConfirmados = new Set();
  alTerminar?.({ impresos });
}

/**
 * Aunque esten en cache, Chrome puede abrir la impresion antes de dibujar
 * las imagenes y salir en blanco: se espera que carguen y se decodifiquen.
 */
function esperarDibujo() {
  const imgs = [...contenedor().querySelectorAll('img')];
  const listas = Promise.allSettled(imgs.map(img =>
    (img.complete ? Promise.resolve() : new Promise(r => {
      img.addEventListener('load', r, { once: true });
      img.addEventListener('error', r, { once: true });
    })).then(() => img.decode().catch(() => {}))
  )).then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  return Promise.race([listas, esperar(ESPERA_DIBUJO_MS)]);
}

// ---------- tandas ----------

let tandas = [];
let tandaActual = 0;
let trabajando = false;

// Hojas de la tanda impresa: total y por pedido (id -> hojas)
let infoTanda = { hojas: 0, porPedido: new Map() };

// reimpresion: hojas con la franja REIMPRESION y sin marcar nada
// alTerminar: se llama al cerrar, haya terminado o se haya cancelado
let opciones = {};

// Ids que el servidor confirmo como impresos en esta impresion (todas sus
// tandas): al cerrar se le pasan a la bandeja para sacarlos de Pendientes
let impresosConfirmados = new Set();

/** Arma e imprime los pedidos elegidos, en tandas de TAMANO_TANDA. */
export function imprimir(pedidos, opc = {}) {
  pedidos = (pedidos || []).filter(Boolean);
  if (!pedidos.length || trabajando) return;

  opciones = opc;
  impresosConfirmados = new Set();
  tandas = [];
  for (let i = 0; i < pedidos.length; i += TAMANO_TANDA) {
    tandas.push(pedidos.slice(i, i + TAMANO_TANDA));
  }
  tandaActual = 0;
  prepararTanda();
}

async function prepararTanda() {
  trabajando = true;
  const total = tandas.length;
  const peds = tandas[tandaActual];
  const etiqueta = total > 1 ? `Tanda ${tandaActual + 1} de ${total}` : 'Impresión';

  mostrarAviso(`${etiqueta} · cargando datos…`);
  const t0 = performance.now();

  try {
    await cargarDatos();
  } catch (e) {
    console.error('[Hojas] No se pudieron cargar los datos:', e);
    trabajando = false;
    mostrarAviso('No se pudieron cargar los datos de productos.', [
      { texto: 'Reintentar', principal: true, accion: prepararTanda },
      { texto: 'Cancelar', accion: cerrar }
    ]);
    return;
  }
  const t1 = performance.now();

  // Fotos de la tanda al frente de la cola, con limite de espera
  const skus = skusDe(peds);
  const conFoto = skus.filter(s => datos.imagenes[s]);
  const yaEnCache = conFoto.filter(s => fotos.get(s)?.estado === 'ok').length;
  const antes = { ...medicion };
  encolar(conFoto, true);

  let esperando = true;
  let listas = 0;
  const promesas = conFoto.map(s => fotos.get(s).promesa);
  const avance = () => {
    if (esperando) mostrarAviso(`${etiqueta} · preparando fotos ${listas} de ${conFoto.length}…`);
  };
  promesas.forEach(pr => pr.then(() => { listas++; avance(); }));
  avance();

  await Promise.race([Promise.all(promesas), esperar(ESPERA_FOTOS_MS)]);
  esperando = false;
  const t2 = performance.now();

  mostrarAviso(`${etiqueta} · armando hojas…`);
  let html = '';
  let hojas = 0;
  let lineas = 0;
  const porPedido = new Map();
  peds.forEach(p => {
    const r = armarPedido(p, !!opciones.reimpresion);
    html += r.html;
    hojas += r.hojas;
    lineas += r.lineas;
    porPedido.set(String(p.id), r.hojas);
  });
  contenedor().innerHTML = html;
  // Para la pregunta posterior: cuantas hojas tienen que haber salido
  infoTanda = { hojas, porPedido };
  const t3 = performance.now();

  await esperarDibujo();
  const t4 = performance.now();

  const sinFoto = skus.length - conFoto.filter(s => fotos.get(s)?.estado === 'ok').length;
  const ms = x => Math.round(x) + ' ms';
  console.log(`[Hojas] ${etiqueta}: ${peds.length} pedidos, ${lineas} líneas, ${hojas} hojas` +
    ` · datos ${ms(t1 - t0)} · espera fotos ${ms(t2 - t1)} · armado ${ms(t3 - t2)}` +
    ` · dibujo ${ms(t4 - t3)} · total ${ms(t4 - t0)}` +
    ` · fotos: ${medicion.descargadas - antes.descargadas} descargadas` +
    ` (${medicion.sinSufijo - antes.sinSufijo} sin sufijo), ${sinFoto} sin foto, ${yaEnCache} ya en caché`);

  registrarEImprimir();
}

const idsTanda = () => tandas[tandaActual].map(p => String(p.id));

/** reemplazar: pisar el intento de otra persona (solo "Imprimir de nuevo"). */
function llamarIntento(ids, anular, reemplazar) {
  return window.Api.llamar({
    accion: 'intento_impresion',
    token: sessionStorage.getItem('authToken'),
    ids,
    ...(anular ? { modo: 'anular' } : {}),
    ...(reemplazar && !anular ? { reemplazar: true } : {})
  }, 2, 20000);
}

/**
 * Antes de abrir el dialogo se registra el intento en el servidor: si la
 * confirmacion nunca llega, el pedido queda a la vista en la bandeja como
 * "impresion sin confirmar". Si no se puede registrar, no se imprime.
 * Las reimpresiones no registran nada.
 */
async function registrarEImprimir() {
  const total = tandas.length;
  const n = tandaActual + 1;
  const etiqueta = total > 1 ? `Tanda ${n} de ${total}` : 'Impresión';

  if (!opciones.reimpresion) {
    trabajando = true;
    const ids = idsTanda();
    mostrarAviso(`${etiqueta} · registrando la impresión…`);
    const t0 = performance.now();

    // Solo "Imprimir de nuevo" reemplaza el intento de otra persona, y solo
    // en la primera registracion: despues el intento ya es propio
    const reemplazar = !!opciones.reemplazarIntento;

    let d = null;
    try {
      d = await llamarIntento(ids, false, reemplazar);
    } catch (e) {
      console.error('[Hojas] Sin respuesta al registrar el intento:', e);
    }

    if (!d?.ok) {
      trabajando = false;
      if (d) console.warn('[Hojas] Error al registrar el intento:', d.error);
      mostrarAviso(d?.error === 'token_invalido'
        ? 'Tu sesión venció. Volvé a iniciar sesión: no se imprimió nada.'
        : 'No se pudo registrar la impresión, así que no se imprimió nada (' +
          (d ? `el servidor respondió con un error: ${d.error}` : 'no hay conexión con el servidor') + ').',
        [
          { texto: 'Reintentar', principal: true, accion: registrarEImprimir },
          { texto: 'Cancelar', accion: cerrar }
        ]);
      return;
    }

    opciones.reemplazarIntento = false;

    const yaImpresos = Number(d.yaImpresos) || 0;
    const deOtro = Number(d.deOtro) || 0;
    const noEncontrados = Array.isArray(d.noEncontrados) ? d.noEncontrados : [];
    console.log(`[Hojas] Intento tanda ${n}/${total}: registrados ${Number(d.registrados) || 0}` +
      ` · ya impresos ${yaImpresos} · de otro ${deOtro} · no encontrados ${noEncontrados.length}` +
      ` · reemplazar ${reemplazar ? 'sí' : 'no'} · ${Math.round(performance.now() - t0)} ms`);

    // Otra persona los imprimio, o los mando a imprimir y no confirmo,
    // mientras la bandeja estaba abierta: no se imprime la tanda y se anula
    // lo registrado (el servidor no toca los ya impresos ni los de otros)
    if (yaImpresos > 0 || deOtro > 0) {
      mostrarAviso('Anulando el registro de impresión…');
      let anulado = false;
      try {
        anulado = !!(await llamarIntento(ids, true))?.ok;
      } catch (e) {
        console.error('[Hojas] Sin respuesta al anular el intento:', e);
      }
      trabajando = false;
      mostrarAviso(textoTandaBloqueada(yaImpresos, deOtro),
        [{ texto: 'Actualizar bandeja', principal: true, accion: cerrar }],
        anulado ? '' : '<p class="ih-aviso-lista">No se pudo anular el registro: algunos pedidos ' +
          'pueden aparecer como «impresión sin confirmar»; se resuelven desde la bandeja.</p>');
      return;
    }
  }

  trabajando = false;
  mostrarAviso(`${etiqueta} · abriendo el diálogo de impresión…`);
  imprimirConTitulo();
  despuesDeImprimir();
}

/** Por que no se imprimio la tanda: ya impresos, intentos de otra persona o ambos. */
function textoTandaBloqueada(yaImpresos, deOtro) {
  const impresos = yaImpresos === 1
    ? '1 pedido ya fue impreso por otra persona'
    : `${yaImpresos} pedidos ya fueron impresos por otra persona`;

  if (!deOtro) {
    return `${impresos} mientras tenías la bandeja abierta. Actualizá la bandeja y volvé a seleccionar.`;
  }

  const salieron = deOtro === 1 ? 'salió' : 'salieron';

  if (!yaImpresos) {
    return deOtro === 1
      ? '1 pedido lo mandó a imprimir otra persona y todavía no confirmó si salió. Actualizá la bandeja: ' +
        'va a aparecer en «Impresión sin confirmar» con el nombre de quien lo mandó.'
      : `${deOtro} pedidos los mandó a imprimir otra persona y todavía no confirmó si salieron. ` +
        'Actualizá la bandeja: van a aparecer en «Impresión sin confirmar» con el nombre de quien los mandó.';
  }

  return `${impresos} y ${deOtro === 1 ? '1 lo mandó' : `${deOtro} los mandó`} a imprimir otra persona ` +
    `sin confirmar todavía si ${salieron}. Actualizá la bandeja y volvé a seleccionar: los que no se ` +
    'confirmaron van a aparecer en «Impresión sin confirmar» con el nombre de quien los mandó.';
}

/** "No se imprimio": se borra el intento registrado de la tanda. */
async function anularIntento() {
  const ids = idsTanda();
  mostrarAviso('Anulando el registro de impresión…');

  let d = null;
  try {
    d = await llamarIntento(ids, true);
  } catch (e) {
    console.error('[Hojas] Sin respuesta al anular el intento:', e);
  }

  if (d?.ok) {
    console.log(`[Hojas] Intento anulado: ${Number(d.registrados) || 0} pedidos`);
    cerrar();
    return;
  }

  if (d) console.warn('[Hojas] Error al anular el intento:', d.error);
  const texto = 'No se pudo anular el registro de impresión. Estos pedidos van a aparecer como ' +
    '«impresión sin confirmar»; se pueden resolver desde la bandeja.';
  mostrarAviso(d?.error === 'token_invalido' ? 'Tu sesión venció. ' + texto : texto,
    [{ texto: 'Cerrar', principal: true, accion: cerrar }]);
}

/**
 * Pedido con impresion sin confirmar: si alguien verifico que las hojas
 * estan en el deposito, pasa a Impresos sin volver a imprimirse. Se marca
 * con el mismo circuito que una tanda de un solo pedido.
 */
export function confirmarExistentes(pedido, opc = {}) {
  if (!pedido || trabajando) return;

  opciones = opc;
  impresosConfirmados = new Set();
  tandas = [[pedido]];
  tandaActual = 0;

  const por = String(pedido.intentoPor ?? '').trim();
  const lineas = Number(pedido.cantLineas) || 0;
  const ficha = `${esc(nombreCliente(pedido))} · ${plural(lineas, 'línea', 'líneas')}` +
    ` · Intento: ${esc(fmtFechaHora(pedido.intentoImpresion))}${por ? ` (${esc(por)})` : ''}`;

  mostrarAviso(`¿Las hojas del pedido N° ${pedido.numero || '—'} están en el depósito?`, [
    { texto: 'Cancelar', accion: cerrar },
    { texto: 'Sí, las hojas existen', principal: true, accion: () => marcarTanda() }
  ],
  '<p class="ih-aviso-explica">Si confirmás, el pedido pasa a Impresos sin volver a imprimirse. ' +
    'Hacelo solo si alguien verificó que las hojas existen; si no aparecen, usá Imprimir de nuevo.</p>' +
    `<div class="ih-aviso-ficha">${ficha}</div>`,
  'ih-aviso-pregunta');
}

/**
 * "Guardar como PDF" propone el titulo de la pagina como nombre de archivo:
 * mientras dura el dialogo, el titulo lleva la fecha y hora de Argentina.
 */
let tituloOriginal = null;

function restaurarTitulo() {
  if (tituloOriginal === null) return;
  document.title = tituloOriginal;
  tituloOriginal = null;
}

function imprimirConTitulo() {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: 'numeric', month: 'numeric', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(p => [p.type, p.value]));

  restaurarTitulo();
  tituloOriginal = document.title;
  document.title = 'Ferremax - Impresión de pedidos_' +
    `${partes.day}_${partes.month}_${partes.year}_${partes.hour}_${partes.minute}`;

  // Se restaura al cerrar el dialogo y no al volver de print(): en algunos
  // navegadores (Chrome en Android) print() vuelve antes de generar el PDF.
  // once: true, para que no se acumulen al repetir la impresion
  window.addEventListener('afterprint', restaurarTitulo, { once: true });
  window.print();
}

const siguienteTanda = () => { tandaActual++; prepararTanda(); };

/** Se llama al volver de print(): el dialogo ya se cerro. */
function despuesDeImprimir() {
  const total = tandas.length;
  const n = tandaActual + 1;
  const prefijo = total > 1 ? `Tanda ${n} de ${total}` : '';

  // Reimpresion: no se pregunta ni se marca nada
  if (opciones.reimpresion) {
    const repetir = { texto: 'Repetir', accion: imprimirConTitulo };
    if (n < total) {
      mostrarAviso(`${prefijo} reimpresa.`, [
        { texto: `Imprimir tanda ${n + 1}`, principal: true, accion: siguienteTanda },
        repetir,
        { texto: 'Cancelar', accion: cerrar }
      ]);
    } else {
      mostrarAviso(total > 1 ? `${prefijo} reimpresa. Listo.` : 'Pedidos reimpresos.', [
        { texto: 'Cerrar', principal: true, accion: cerrar },
        repetir
      ]);
    }
    return;
  }

  // Control por pedido: se cuentan las hojas y se destildan los incompletos
  const peds = tandas[tandaActual];
  const h = infoTanda.hojas;
  const encabezado = (prefijo ? prefijo + ' · ' : '') +
    `${plural(peds.length, 'pedido', 'pedidos')} · ${plural(h, 'hoja', 'hojas')}`;

  const renglones = peds.map(p => {
    const hp = infoTanda.porPedido.get(String(p.id)) || 0;
    return `<li><label>
      <input type="checkbox" checked data-id="${esc(p.id)}">
      <b class="ih-control-num">N° ${esc(p.numero || '—')}</b>
      <span class="ih-control-cli">${esc(nombreCliente(p))}</span>
      <span class="ih-control-hojas">${plural(hp, 'hoja', 'hojas')}</span>
    </label></li>`;
  }).join('');

  mostrarAviso(encabezado, [
    { texto: 'Marcar los tildados como impresos', principal: true, accion: resolverTanda },
    { texto: 'Repetir toda la tanda', accion: () => { imprimirConTitulo(); despuesDeImprimir(); } },
    { texto: 'No se imprimió nada', accion: anularIntento }
  ],
  `<p class="ih-aviso-explica">${h === 1
    ? 'Revisá que haya salido la hoja.'
    : `Revisá que hayan salido las ${h} hojas.`} Destildá los pedidos que no salieron completos.</p>
   <ul class="ih-control">${renglones}</ul>`,
  'ih-aviso-pregunta ih-aviso-control');

  // Sin ningun pedido tildado no hay nada que marcar
  const av = document.getElementById('ih-aviso');
  const principal = av.querySelector('.ih-btn-principal');
  const casillas = [...av.querySelectorAll('.ih-control input')];
  casillas.forEach(c => c.addEventListener('change', () => {
    principal.disabled = !casillas.some(x => x.checked);
  }));
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Marca los tildados y devuelve a Pendientes los destildados: se anula su
 * intento, asi no quedan como "impresion sin confirmar". La anulacion se
 * hace una sola vez; los reintentos de la marcacion no la repiten.
 */
async function resolverTanda() {
  const marcadas = new Set([...document.querySelectorAll('#ih-aviso .ih-control input')]
    .filter(c => c.checked).map(c => c.dataset.id));
  const peds = tandas[tandaActual];
  const tildados = peds.filter(p => marcadas.has(String(p.id)));
  const destildados = peds.filter(p => !marcadas.has(String(p.id)));
  if (!tildados.length) return;

  let anulacionFallida = false;
  if (destildados.length) {
    mostrarAviso('Devolviendo a Pendientes los que no salieron…');
    try {
      const d = await llamarIntento(destildados.map(p => String(p.id)), true);
      anulacionFallida = !d?.ok;
      if (!d?.ok) console.warn('[Hojas] Error al anular los destildados:', d?.error);
    } catch (e) {
      console.error('[Hojas] Sin respuesta al anular los destildados:', e);
      anulacionFallida = true;
    }
  }

  marcarTanda({ peds: tildados, destildados, anulacionFallida });
}

/**
 * Marca la tanda actual en el servidor. Repetirlo es seguro: el servidor
 * no cambia la fecha de un pedido ya marcado.
 */
async function marcarTanda(ctx) {
  // Sin ctx: la tanda completa (por ejemplo, "Las hojas existen")
  ctx = ctx || { peds: tandas[tandaActual], destildados: [], anulacionFallida: false };
  const { peds, destildados } = ctx;
  const ids = peds.map(p => String(p.id));
  const total = tandas.length;
  const n = tandaActual + 1;

  const reintentar = { texto: 'Reintentar marcar', principal: true, accion: () => marcarTanda(ctx) };
  const cancelar = { texto: 'Cancelar', accion: cerrar };

  // Sin botones mientras tanto: no se puede tocar dos veces
  mostrarAviso(`Marcando ${plural(ids.length, 'pedido como impreso', 'pedidos como impresos')}…`);
  const t0 = performance.now();

  let d;
  try {
    d = await window.Api.llamar({
      accion: 'marcar_impresos',
      token: sessionStorage.getItem('authToken'),
      ids
    }, 2, 20000);
  } catch (e) {
    console.error('[Hojas] Sin respuesta al marcar:', e);
    mostrarAviso('No se pudo marcar como impresos: no hay conexión con el servidor. ' +
      'Las hojas ya están impresas, no hace falta repetirlas.', [reintentar, cancelar]);
    return;
  }

  if (!d.ok) {
    console.warn('[Hojas] Error al marcar:', d.error);
    mostrarAviso(d.error === 'token_invalido'
      ? 'Tu sesión venció. Volvé a iniciar sesión: los pedidos siguen en Pendientes.'
      : `El servidor respondió con un error (${d.error}). Las hojas ya están impresas, no hace falta repetirlas.`,
      [reintentar, cancelar]);
    return;
  }

  // yaMarcados: los marco otra persona. yaPropios: los habia marcado esta
  // misma persona (por ejemplo, un intento anterior cuya respuesta no
  // llego): cuentan como marcados y sin alarma
  const marcados = Number(d.marcados) || 0;
  const yaMarcados = Number(d.yaMarcados) || 0;
  const yaPropios = Number(d.yaPropios) || 0;
  const noEncontrados = Array.isArray(d.noEncontrados) ? d.noEncontrados : [];

  // Marcados ahora, ya marcados por esta persona o por otra: todos quedan
  // impresos en el servidor. Los no encontrados, no
  const sinEncontrar = new Set(noEncontrados.map(String));
  ids.filter(id => !sinEncontrar.has(id)).forEach(id => impresosConfirmados.add(id));

  console.log(`[Hojas] Marcado tanda ${n}/${total}: ${ids.length} pedidos en ` +
    `${Math.round(performance.now() - t0)} ms · marcados ${marcados} · ya marcados ${yaMarcados}` +
    ` · ya propios ${yaPropios} · no encontrados ${noEncontrados.length}` +
    ` · destildados ${destildados.length}`);

  let texto = plural(marcados + yaPropios,
    'pedido marcado como impreso', 'pedidos marcados como impresos') + '.';
  let detalle = '';

  if (yaMarcados) {
    detalle += `<div class="ih-aviso-atencion"><b>ATENCIÓN</b>
      ${yaMarcados === 1 ? '1 pedido ya había sido marcado' : `${yaMarcados} pedidos ya habían sido marcados`}
      por otra persona. Revisá que no se preparen dos veces.</div>`;
  }

  if (noEncontrados.length) {
    const numeros = noEncontrados.map(id => {
      const p = peds.find(x => String(x.id) === String(id));
      return p?.numero ? `N° ${p.numero}` : String(id);
    });
    detalle += `<p class="ih-aviso-lista">No se encontraron en el servidor: ${esc(numeros.join(', '))}</p>`;
  }

  // Los que no salieron completos, nombrados por su N°
  if (destildados.length) {
    // El texto del aviso va con textContent: no se escapa
    const numeros = destildados.map(p => p.numero || p.id).join(', ');
    const k = destildados.length;
    if (!ctx.anulacionFallida) {
      texto += k === 1
        ? ` Volvió a Pendientes 1 pedido que no salió: ${numeros}.`
        : ` Volvieron a Pendientes ${k} pedidos que no salieron: ${numeros}.`;
    } else {
      texto += k === 1 ? ` 1 pedido no salió: ${numeros}.` : ` ${k} pedidos no salieron: ${numeros}.`;
      detalle += '<p class="ih-aviso-lista">No se pudieron devolver a Pendientes: van a aparecer como ' +
        '«impresión sin confirmar» y se resuelven desde la bandeja.</p>';
    }
  }

  if (total > 1) texto = `Tanda ${n} de ${total}: ${texto}`;

  // Recien despues de marcar se pasa a la tanda siguiente
  let botones;
  if (destildados.length) {
    // Los que faltaron, como tanda adicional inmediata con el circuito
    // completo; despues siguen las tandas que quedaban
    botones = [{
      texto: 'Imprimir los que faltaron', principal: true,
      accion: () => { tandas.splice(tandaActual + 1, 0, destildados); siguienteTanda(); }
    }];
    if (n < total) botones.push({ texto: `Seguir con la tanda ${n + 1}`, accion: siguienteTanda }, cancelar);
    else botones.push({ texto: 'Cerrar', accion: cerrar });
  } else {
    botones = n < total
      ? [{ texto: `Imprimir tanda ${n + 1}`, principal: true, accion: siguienteTanda }, cancelar]
      : [{ texto: 'Cerrar', principal: true, accion: cerrar }];
  }

  mostrarAviso(texto, botones, detalle);
}
