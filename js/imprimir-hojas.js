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

const PISO_PB = 'PLANTA BAJA';
const PISO_1 = '1ER PISO';
const PISO_SIN = 'SIN UBICACIÓN';
const ORDEN_PISOS = [PISO_PB, PISO_1, PISO_SIN];

// Excepciones por prefijo de codigo: se revisan antes que la categoria
const EXCEPCIONES_PISO = [
  { prefijo: 'CRE', piso: PISO_1 },
];

// Alturas en mm: unica fuente. Se pasan al CSS como variables --ih-*
const MM = {
  hoja: 280, cabPrep: 34, obs: 14, cabCont: 9, franja: 7, fila: 19,
  firmas: 40, pie: 6, cabFact: 26, filaFact: 5.5, totales: 26,
  firmasFact: 14, separador: 8, reimp: 9
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
  const exc = EXCEPCIONES_PISO.find(e => sku.startsWith(e.prefijo));
  if (exc) return exc.piso;

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

function tipoDe(l) {
  switch (l.mecanismo) {
    case 'promocion': return 'PROMO';
    case 'precio_libre': return 'PRECIO ESPECIAL';
    case 'otra_lista': return ('LISTA ' + String(l.listaAplicada ?? '').trim().toUpperCase()).trim();
    default: return '';
  }
}

// ---------- paginado ----------

/**
 * Reparte los pisos en hojas. Cada piso abre con su franja y sigue con
 * renglones de dos columnas; si no entra, continua en la hoja siguiente.
 */
function paginarPrep(pisos, conObs, conReimp) {
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

/** Hojas de facturacion: totales y firmas al final de la ultima. */
function paginarFact(lineas) {
  const hojas = [];
  const cierre = MM.totales + MM.firmasFact;
  let i = 0;
  let primera = true;

  for (;;) {
    // El encabezado de la tabla ocupa un renglon
    const libre = MM.hoja - (primera ? MM.cabFact : MM.cabCont) - MM.pie - MM.filaFact;

    let alto = 0;
    let j = i;
    while (j < lineas.length && alto + renglonesFact(lineas[j]) * MM.filaFact <= libre) {
      alto += renglonesFact(lineas[j]) * MM.filaFact;
      j++;
    }

    // Entraron todas y tambien el cierre
    if (j === lineas.length && alto + cierre <= libre) {
      hojas.push({ primera, desde: i, hasta: j, cierre: true });
      return hojas;
    }

    // Si entraron todas pero no el cierre, el cierre va solo en la siguiente
    hojas.push({ primera, desde: i, hasta: j, cierre: false });
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
        <span><b>Líneas:</b> ${lineas}</span>
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
        <span><b>Vendedor:</b> ${esc(c.vendedor)}</span>
        ${c.obs ? `<span class="ih-datos-obs"><b>Obs.:</b> ${esc(c.obs)}</span>` : ''}
      </div>
    </header>`;
}

function htmlTablaFact(lineas) {
  const filas = lineas.map(it => {
    const l = it.linea;
    const tipo = tipoDe(l);
    const renglones = renglonesFact(it);
    // Alto fijo segun los renglones del codigo: el mismo que usa el paginado
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
      <tbody>${filas}</tbody>
    </table>`;
}

function htmlCierreFact(t) {
  const desc = t.pct || t.descuento
    ? `Descuento sobre el total (${fmtNum(t.pct)} %, no alcanza a las promociones)`
    : 'Descuento sobre el total';
  return `
    <div class="ih-totales">
      <div><span>Total bruto</span><b>${fmtPesos(t.bruto)}</b></div>
      <div><span>Líneas en promoción</span><b>${fmtPesos(t.promo)}</b></div>
      <div><span>${desc}</span><b>${t.descuento ? '−' + fmtPesos(t.descuento) : '—'}</b></div>
      <div class="ih-neto"><span>TOTAL NETO</span><b>${fmtPesos(t.neto)}</b></div>
    </div>
    <div class="ih-firmas-fact">
      <div class="ih-caja"><span>FACTURÓ</span></div>
      <div class="ih-caja"><span>N° DE FACTURA</span></div>
      <div class="ih-caja"><span>FECHA</span></div>
    </div>`;
}

function htmlBloqueFact(h, c, lineas, totales) {
  return (h.primera ? htmlCabFact(c) : htmlCabCont('Facturación', c)) +
    (h.hasta > h.desde ? htmlTablaFact(lineas.slice(h.desde, h.hasta)) : '') +
    (h.cierre ? htmlCierreFact(totales) : '');
}

// ---------- armado de un pedido ----------

function armarPedido(p, reimpresion) {
  const c = {
    numero: p.numero || '—',
    fecha: fmtFechaHora(p.fecha),
    cuenta: p.cliente ?? '',
    // El servidor puede mandar el nombre cortado: se prefiere el del padron
    nombre: nombreCliente(p),
    vendedor: p.vendedor || '—',
    lista: String(p.lista ?? '').trim(),
    obs: [p.motivo, p.obsLibre].map(s => String(s ?? '').trim()).filter(Boolean).join(' · ')
  };

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

  const pisos = ORDEN_PISOS.map(nombre => {
    const items = lineas.filter(it => it.piso === nombre)
      .sort((a, b) => COLLATOR.compare(a.prefijo, b.prefijo) || COLLATOR.compare(a.sku, b.sku));
    items.forEach((it, i) => { it.nuevoGrupo = i > 0 && it.prefijo !== items[i - 1].prefijo; });
    return { nombre, items };
  }).filter(pi => pi.items.length);

  const sumaSub = lineas.reduce((a, it) => a + (Number(it.linea.subtotal) || 0), 0);
  const bruto = Number(p.totalBruto) || sumaSub;
  const neto = p.totalNeto != null && p.totalNeto !== '' ? Number(p.totalNeto) || 0 : bruto;
  const totales = {
    bruto,
    neto,
    promo: lineas.filter(it => it.linea.mecanismo === 'promocion')
      .reduce((a, it) => a + (Number(it.linea.subtotal) || 0), 0),
    pct: Number(p.descTotalPct) || 0,
    // Igual a lo que guardo el servidor
    descuento: Math.round((bruto - neto) * 100) / 100
  };

  const hojasPrep = paginarPrep(pisos, !!c.obs, reimpresion);
  const ultima = hojasPrep[hojasPrep.length - 1];
  const altoFact = MM.cabFact + MM.filaFact +
    lineas.reduce((a, it) => a + renglonesFact(it) * MM.filaFact, 0) +
    MM.totales + MM.firmasFact;
  const unica = hojasPrep.length === 1 &&
    ultima.usado + MM.separador + altoFact <= MM.hoja * MARGEN_HOJA_UNICA;

  const hojasFact = unica ? [] : paginarFact(lineas);
  const total = hojasPrep.length + hojasFact.length;

  let html = '';
  hojasPrep.forEach((h, i) => {
    let cuerpo = h.primera
      ? htmlCabPrep(c, lineas.length) + (reimpresion ? htmlReimp(p) : '')
      : htmlCabCont('Hoja de preparación', c);
    h.bloques.forEach(b => { cuerpo += b.tipo === 'franja' ? htmlFranja(b) : htmlGrilla(b); });
    if (h.firmas) cuerpo += htmlFirmasPrep();
    if (unica) {
      cuerpo += '<div class="ih-separador">FACTURACIÓN · uso interno</div>' +
        htmlBloqueFact({ primera: true, desde: 0, hasta: lineas.length, cierre: true }, c, lineas, totales);
    }
    html += `<section class="ih-hoja">${cuerpo}${htmlPie(c, i + 1, total)}</section>`;
  });

  hojasFact.forEach((h, i) => {
    html += `<section class="ih-hoja">${htmlBloqueFact(h, c, lineas, totales)}` +
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
  opciones = {};
  alTerminar?.();
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

// reimpresion: hojas con la franja REIMPRESION y sin marcar nada
// alTerminar: se llama al cerrar, haya terminado o se haya cancelado
let opciones = {};

/** Arma e imprime los pedidos elegidos, en tandas de TAMANO_TANDA. */
export function imprimir(pedidos, opc = {}) {
  pedidos = (pedidos || []).filter(Boolean);
  if (!pedidos.length || trabajando) return;

  opciones = opc;
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
  peds.forEach(p => {
    const r = armarPedido(p, !!opciones.reimpresion);
    html += r.html;
    hojas += r.hojas;
    lineas += r.lineas;
  });
  contenedor().innerHTML = html;
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

function llamarIntento(ids, anular) {
  return window.Api.llamar({
    accion: 'intento_impresion',
    token: sessionStorage.getItem('authToken'),
    ids,
    ...(anular ? { modo: 'anular' } : {})
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

    let d = null;
    try {
      d = await llamarIntento(ids, false);
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

    const yaImpresos = Number(d.yaImpresos) || 0;
    const noEncontrados = Array.isArray(d.noEncontrados) ? d.noEncontrados : [];
    console.log(`[Hojas] Intento tanda ${n}/${total}: registrados ${Number(d.registrados) || 0}` +
      ` · ya impresos ${yaImpresos} · no encontrados ${noEncontrados.length}` +
      ` · ${Math.round(performance.now() - t0)} ms`);

    // Otra persona los imprimio mientras la bandeja estaba abierta: no se
    // imprime la tanda y se anula lo registrado (el servidor no toca los
    // ya impresos)
    if (yaImpresos > 0) {
      mostrarAviso('Anulando el registro de impresión…');
      let anulado = false;
      try {
        anulado = !!(await llamarIntento(ids, true))?.ok;
      } catch (e) {
        console.error('[Hojas] Sin respuesta al anular el intento:', e);
      }
      trabajando = false;
      mostrarAviso((yaImpresos === 1
        ? '1 pedido ya fue impreso por otra persona mientras tenías la bandeja abierta.'
        : `${yaImpresos} pedidos ya fueron impresos por otra persona mientras tenías la bandeja abierta.`) +
        ' Actualizá la bandeja y volvé a seleccionar.',
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
  tandas = [[pedido]];
  tandaActual = 0;

  const por = String(pedido.intentoPor ?? '').trim();
  const lineas = Number(pedido.cantLineas) || 0;
  const ficha = `${esc(nombreCliente(pedido))} · ${plural(lineas, 'línea', 'líneas')}` +
    ` · Intento: ${esc(fmtFechaHora(pedido.intentoImpresion))}${por ? ` (${esc(por)})` : ''}`;

  mostrarAviso(`¿Las hojas del pedido N° ${pedido.numero || '—'} están en el depósito?`, [
    { texto: 'Cancelar', accion: cerrar },
    { texto: 'Sí, las hojas existen', principal: true, accion: () => marcarTanda(false) }
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

  mostrarAviso((prefijo ? prefijo + ' · ' : '') + '¿Las hojas salieron bien?', [
    { texto: 'Sí, marcar como impresos', principal: true, accion: () => marcarTanda(false) },
    { texto: 'No, repetir la impresión', accion: () => { imprimirConTitulo(); despuesDeImprimir(); } },
    { texto: 'No se imprimió', accion: anularIntento }
  ]);
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Marca la tanda actual en el servidor. Repetirlo es seguro: el servidor
 * no cambia la fecha de un pedido ya marcado.
 */
async function marcarTanda(esReintento) {
  const peds = tandas[tandaActual];
  const ids = peds.map(p => String(p.id));
  const total = tandas.length;
  const n = tandaActual + 1;

  const reintentar = { texto: 'Reintentar marcar', principal: true, accion: () => marcarTanda(true) };
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

  const marcados = Number(d.marcados) || 0;
  const yaMarcados = Number(d.yaMarcados) || 0;
  const noEncontrados = Array.isArray(d.noEncontrados) ? d.noEncontrados : [];

  console.log(`[Hojas] Marcado tanda ${n}/${total}: ${ids.length} pedidos en ` +
    `${Math.round(performance.now() - t0)} ms · marcados ${marcados} · ya marcados ${yaMarcados}` +
    ` · no encontrados ${noEncontrados.length}${esReintento ? ' · reintento' : ''}`);

  let texto;
  let detalle = '';

  if (esReintento) {
    // Los ya marcados casi seguro los marco el intento anterior, cuya
    // respuesta no llego: cuentan como marcados y sin alarma
    texto = plural(marcados + yaMarcados, 'pedido marcado como impreso', 'pedidos marcados como impresos') +
      (yaMarcados ? ' (algunos ya habían quedado marcados en el intento anterior).' : '.');
  } else {
    texto = plural(marcados, 'pedido marcado como impreso', 'pedidos marcados como impresos') + '.';
    if (yaMarcados) {
      detalle += `<div class="ih-aviso-atencion"><b>ATENCIÓN</b>
        ${yaMarcados === 1 ? '1 pedido ya había sido marcado' : `${yaMarcados} pedidos ya habían sido marcados`}
        por otra persona. Revisá que no se preparen dos veces.</div>`;
    }
  }

  if (noEncontrados.length) {
    const numeros = noEncontrados.map(id => {
      const p = peds.find(x => String(x.id) === String(id));
      return p?.numero ? `N° ${p.numero}` : String(id);
    });
    detalle += `<p class="ih-aviso-lista">No se encontraron en el servidor: ${esc(numeros.join(', '))}</p>`;
  }

  if (total > 1) texto = `Tanda ${n} de ${total}: ${texto}`;

  // Recien despues de marcar se pasa a la tanda siguiente
  mostrarAviso(texto, n < total
    ? [{ texto: `Imprimir tanda ${n + 1}`, principal: true, accion: siguienteTanda }, cancelar]
    : [{ texto: 'Cerrar', principal: true, accion: cerrar }],
    detalle);
}
