/**
 * OBSERVACIONES DEL PEDIDO
 *
 * El vendedor agrega una o varias observaciones de la lista de la hoja
 * "observaciones" de la planilla. La lista llega con la configuracion del
 * carrito, una vez por sesion: aca no se consulta al servidor.
 * - Las de Mercaderia llevan articulos, elegidos con el buscador del
 *   catalogo (BuscadorV2), con cantidad obligatoria.
 * - La de ajuste (126) lleva lo facturado y lo que correspondia, por separado.
 * - Las de Condiciones no llevan nada mas.
 * - La de entrega especial (efecto 'entrega', la 170) lleva el dia y quien
 *   entrega: la reconoce el efecto, no el codigo.
 * Se guardan en el ajuste del carrito (Carrito.getAjustePedido().observaciones):
 *   { id, clave, items: [{ sku, nombre, cantidad, lado, mecanismo?, listaForzada?,
 *     precioLibre?, descuento?, descuentoExtra? }], entrega? }
 * (lado: 'facturado' o 'correspondia', solo en la de ajuste; los campos de
 * precio, los mismos que una linea del pedido, solo en la 117; entrega:
 * { fecha: 'AAAA-MM-DD', dia: 'lu'..'sa' o '' (otra fecha), quien: sigla,
 * viaje?: 1 o 2 (pideViaje), despuesDe?: { cuenta, nombre } (pideDespues) },
 * solo en la de entrega).
 */

import { abrirHoja, esAncha } from './hoja.js';

const LADOS = [
  { lado: 'facturado', titulo: 'Lo facturado' },
  { lado: 'correspondia', titulo: 'Lo que correspondía' }
];
const EFECTO_TEXTO = { informativa: 'Informativa', descuenta: 'Descuenta', suma: 'Suma', ajuste: 'Ajuste',
  entrega: 'Día y quién entrega' };
const MAX_RESULTADOS = 30;
// Resultados del buscador de clientes de "despues de quien"
const MAX_CLIENTES = 20;
const CLAVE_USO = 'obsUso';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nuevoId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtPesos = n => '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

// Fotos de los articulos: el mapa codigo -> id de Drive que la pagina ya
// cargo (catalogo_imagenes.json, una sola vez). Se pide al importar, asi al
// abrir la hoja ya esta en memoria; las fotos se bajan con carga diferida
const SIN_FOTO = 'img/no-img.png';
let fotos = {};
const fotosListas = (window.DatosCatalogo ? window.DatosCatalogo.imagenes() : Promise.resolve({}))
  .then(j => { fotos = j?.images || {}; })
  .catch(() => {});
// Fotos nuevas con la pagina abierta (frescura-imagenes.js): las miniaturas
// que se dibujen desde ahora usan el mapa nuevo
document.addEventListener('imagenes:actualizadas', e => {
  if (e.detail?.images) fotos = e.detail.images;
});

// Miniatura de 120 con WebP si se puede (js/fotos.js); sin Fotos, la de siempre
const urlFoto = sku => (fotos[sku]
  ? (window.Fotos?.url(fotos[sku], 120) ?? 'https://lh3.googleusercontent.com/d/' + fotos[sku] + '=w120')
  : SIN_FOTO);

/** Miniatura: si el mapa todavia no estaba, ponerFotos la completa al llegar */
const htmlFoto = sku => `<img class="ob-foto" data-sku="${esc(sku)}" src="${esc(urlFoto(sku))}" alt=""
  loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${SIN_FOTO}'">`;

function ponerFotos(cont) {
  cont.querySelectorAll('img.ob-foto[data-sku]').forEach(img => {
    const url = urlFoto(img.dataset.sku);
    if (url !== SIN_FOTO && !img.src.endsWith(url)) img.src = url;
  });
}

/** La lista de la planilla, o null si el servidor todavia no la manda */
export function catalogo(config) {
  return Array.isArray(config?.catalogoObservaciones) ? config.catalogoObservaciones : null;
}

export const defDe = (config, clave) => (catalogo(config) || []).find(d => d.clave === clave) || null;

/** "113 MERCADERIA ENTREGADA" */
export const nombreObs = def => (def.codigo ? def.codigo + ' ' : '') + def.texto;

// ---------- entrega especial (efecto 'entrega') ----------

/** La de entrega: el dia y quien entrega, sin articulos */
export const esEntrega = def => def?.efecto === 'entrega';

// Por getDay(): 0 = domingo (sin entrega). Los botones: lu a sa
const DIAS = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sa'];
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
// Hasta cuantos dias adelante (el mismo tope que el servidor)
const MAX_DIAS_ENTREGA = 180;
// Diferencia entre el reloj del dispositivo y el del servidor a partir de la cual se avisa
const RELOJ_MAL_MS = 12 * 3600 * 1000;

const dos = n => String(n).padStart(2, '0');
// Fechas 'AAAA-MM-DD' con la hora local del dispositivo (sin toISOString: no se corren por el UTC)
const aIso = d => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const deIso = iso => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const masDias = (iso, n) => {
  const d = deIso(iso);
  return aIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
/** Hoy en el dispositivo, 'AAAA-MM-DD' */
export const hoyIso = () => aIso(new Date());

/** La proxima vez que cae ese dia ('lu'..'sa') desde hoy, hoy incluido: 'AAAA-MM-DD' */
export function proximoDia(dia, hoy = hoyIso()) {
  const n = DIAS.indexOf(dia);
  return masDias(hoy, (n - deIso(hoy).getDay() + 7) % 7);
}

/**
 * "ju 20/11 · RF" (el renglon del panel); con viaje y "despues de quien":
 * "lu 24/11 · IS · V1 · después de 949"
 */
export function fmtEntregaCorta(e) {
  if (!e?.fecha) return '';
  const d = deIso(e.fecha);
  return `${DIAS[d.getDay()]} ${dos(d.getDate())}/${dos(d.getMonth() + 1)}${e.quien ? ' · ' + e.quien : ''}` +
    (e.viaje ? ` · V${e.viaje}` : '') +
    (e.despuesDe?.cuenta ? ` · después de ${e.despuesDe.cuenta}` : '');
}

/** "jueves 20 de noviembre de 2026" (la confirmacion de la hoja) */
export function fmtEntregaLarga(fecha) {
  const d = deIso(fecha);
  return `${NOMBRES_DIA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Vendedores de funcionalidades_usuarios.json: rol vendedor_estandar con
 * codigo (los clientes y los admin no tienen), sin repetir, por sigla:
 * [{ codigo: 'CS', nombre: 'CHRISTIAN' }, ...]
 */
export function vendedores(datos) {
  const vistos = new Set();
  return Object.values(datos?.usuarios || {})
    .filter(u => u && u.rol === 'vendedor_estandar')
    .map(u => ({ codigo: String(u.codigo || '').trim().toUpperCase(), nombre: String(u.nombre || '').trim() }))
    .filter(v => v.codigo && !vistos.has(v.codigo) && vistos.add(v.codigo))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * Contexto de la entrega que arma el panel: si el pedido es de un cliente
 * nuevo (esAlta) y, de la config del carrito, los repartidores, quienes hacen
 * el recorrido, las cuentas que no se pueden elegir en "despues de quien" y
 * los dias en que el reparto sale en dos viajes. Una config sin esas claves
 * (anterior, o sin las filas en la hoja) da listas vacias: la lista de quien
 * entrega sale de los vendedores y no se pide "despues de quien" ni el viaje,
 * como antes
 */
export function contextoEntrega(config, esAlta) {
  const lista = v => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []);
  return {
    esAlta: !!esAlta,
    repartidores: lista(config?.repartidores).map(x => x.toUpperCase()),
    recorrido: lista(config?.repartidoresRecorrido).map(x => x.toUpperCase()),
    noElegibles: lista(config?.cuentasNoElegibles),
    diasDosViajes: lista(config?.diasDosViajes).map(x => x.toLowerCase())
  };
}

/** Se pide "despues de quien": cliente nuevo y entrega quien hace el recorrido */
export const pideDespues = (e, ctx) => !!ctx?.esAlta && !!e?.quien && (ctx.recorrido || []).includes(e.quien);

/**
 * Se pide el viaje (1 o 2): el dia de la semana DE LA FECHA (no el boton: una
 * "otra fecha" que cae en lunes tambien) es de dos viajes y entrega quien hace
 * el recorrido. Sea el cliente nuevo o no: la zona hace falta en los dos casos
 */
export const pideViaje = (e, ctx) => !!e?.quien && /^\d{4}-\d{2}-\d{2}$/.test(e?.fecha || '') &&
  (ctx?.diasDosViajes || []).includes(DIAS[deIso(e.fecha).getDay()]) && (ctx.recorrido || []).includes(e.quien);

/**
 * Clientes para "despues de quien", de clientes_nombres.json: [{ cuenta, nombre }],
 * por nombre, sin las cuentas puente ni la de prueba (noElegibles). Solo cuenta
 * y nombre: el archivo no tiene datos financieros y la sigla del vendedor no se usa
 */
export function clientesElegibles(datos, noElegibles = []) {
  return Object.entries(datos?.clientes || {})
    .filter(([cuenta]) => !noElegibles.includes(String(cuenta)))
    .map(([cuenta, c]) => ({ cuenta: String(cuenta), nombre: String(c?.nombre || '').trim() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.cuenta.localeCompare(b.cuenta, 'es', { numeric: true }));
}

/** Clientes que coinciden con lo escrito: la cuenta empieza igual o el nombre lo contiene (sin acentos) */
export function buscarClientes(lista, texto, max = MAX_CLIENTES) {
  const q = sinAcentos(texto);
  if (!q) return [];
  return lista.filter(c => c.cuenta.startsWith(q) || sinAcentos(c.nombre).includes(q)).slice(0, max);
}

/**
 * Lo que le falta a la entrega para poder confirmar, o '' (hoy: para las
 * pruebas; ctx: contextoEntrega, sin el no se pide el viaje ni "despues de quien")
 */
export function faltaEntrega(e, hoy = hoyIso(), ctx = null) {
  if (!e?.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(e.fecha)) return 'falta el día';
  if (!e.quien) return 'falta quién entrega';
  if (pideViaje(e, ctx) && !e.viaje) return 'falta el viaje (1 o 2)';
  if (pideDespues(e, ctx) && !e.despuesDe?.cuenta) return 'falta después de quién';
  if (e.fecha < hoy) return 'la fecha de entrega ya pasó: elegí otro día';
  if (deIso(e.fecha).getDay() === 0) return 'los domingos no hay entrega';
  if (e.fecha > masDias(hoy, MAX_DIAS_ENTREGA)) return `la fecha de entrega es de más de ${MAX_DIAS_ENTREGA} días`;
  return '';
}

// ---------- mas usadas (en este navegador) ----------

function usos() {
  try { return JSON.parse(localStorage.getItem(CLAVE_USO) || '{}'); } catch (e) { return {}; }
}

/** Al confirmar un pedido: suma uso a cada observacion, para ponerlas arriba */
export function registrarUsos(observaciones) {
  const u = usos();
  observaciones.forEach(o => { u[o.clave] = (u[o.clave] || 0) + 1; });
  try { localStorage.setItem(CLAVE_USO, JSON.stringify(u)); } catch (e) {}
}

// ---------- validacion ----------

/**
 * Lo que le falta a una observacion para poder confirmar el pedido, o ''.
 * ctx (contextoEntrega, opcional): solo lo usa la entrega, para el viaje y "despues de quien"
 */
export function falta(def, o, ctx = null) {
  if (!def) return 'ya no está en la lista';
  if (esEntrega(def)) return faltaEntrega(o.entrega, hoyIso(), ctx);
  if (def.grupo !== 'mercaderia') return '';
  if (!o.items.length) return 'faltan artículos';
  if (def.efecto === 'ajuste') {
    const sinCargar = LADOS.find(l => !o.items.some(it => it.lado === l.lado));
    if (sinCargar) return sinCargar.lado === 'facturado' ? 'falta cargar lo facturado' : 'falta cargar lo que correspondía';
  }
  if (o.items.some(it => !(Number(it.cantidad) > 0))) return 'falta una cantidad';
  if (llevaPrecio(def)) {
    const it = o.items.find(x => faltaPrecioLibre(x) || precioItem(x).precio === null);
    if (it) return faltaPrecioLibre(it) ? 'falta escribir un precio especial'
      : `no se encontró el precio de ${it.sku} (elegí Precio especial o quitalo)`;
  }
  return '';
}

/** Lleva precio de lista actual: la 117 entera y lo que correspondia en la 126 */
export const llevaLista = (def, it) => def?.efecto === 'suma' || it.lado === 'correspondia';

// ---------- precio de la 117 (mercaderia entregada) ----------

// Descuentos propios de la 117: el -7% admite ademas -5% en cascada
// (-11,65%). El menu de las lineas del pedido no cambia
const DESC_117 = [
  { valor: '0', descuento: 0, extra: 0, texto: 'Sin descuento' },
  { valor: '5', descuento: 5, extra: 0, texto: '-5%' },
  { valor: '7', descuento: 7, extra: 0, texto: '-7%' },
  { valor: '7+5', descuento: 7, extra: 5, texto: '-7% y además -5% (-11,65%)' }
];
const LISTAS = ['D', 'E', 'F'];
// Un articulo nuevo de la 117 arranca a la lista del cliente, sin descuento
const PRECIO_INICIAL = { mecanismo: 'lista_cliente', listaForzada: null, precioLibre: null, descuento: 0, descuentoExtra: 0 };

/** La 117: el vendedor define el precio de cada articulo, y es el final */
export const llevaPrecio = def => def?.efecto === 'suma';

const listaCliente = () => window.Precios?.getClienteVista()?.lista || '';

/** Misma cuenta que las lineas del pedido (Carrito.precioAjustado) */
const precioItem = it => window.Carrito?.precioAjustado?.(it) || { precioBase: null, precio: null, descEfectivo: 0 };

/**
 * Trae a memoria los articulos que no estan (cache local, sin servidor) y
 * espera: el catalogo en memoria es solo el del grupo del cliente, y el
 * buscador del editor encuentra todo el catalogo. Lo mismo que hacen el
 * carrito y el panel al confirmar. Nunca lanza
 */
async function asegurarEnMemoria(skus) {
  const faltan = [...new Set(skus)].filter(s => !window.productManager?.getProduct(s));
  if (!faltan.length) return;
  try {
    await window.productManagerInstance?.loadSpecificProducts(faltan);
  } catch (e) {
    console.warn('[Observaciones] No se pudieron cargar los artículos:', e);
  }
}

/** Precio especial elegido sin escribir el precio */
const faltaPrecioLibre = it => it.mecanismo === 'precio_libre' && !(Number(it.precioLibre) > 0);

/** Descuento total del articulo: 7 y 5 en cascada dan 11,65 */
const descCombinado = it => Math.round((1 - (1 - (Number(it.descuento) || 0) / 100) *
  (1 - (Number(it.descuentoExtra) || 0) / 100)) * 10000) / 100;

/** Lo que viaja al servidor del precio de un articulo de la 117 */
export function envioPrecio(it) {
  const mecanismo = it.mecanismo || 'lista_cliente';
  return {
    mecanismo,
    listaAplicada: mecanismo === 'precio_libre' ? '' : mecanismo === 'otra_lista' ? it.listaForzada : listaCliente(),
    // Los dos en cascada, en un numero: 7 y 5 dan 11,65
    descuentoLinea: descCombinado(it),
    precio: faltaPrecioLibre(it) ? null : precioItem(it).precio
  };
}

/**
 * Importe de la 117 en el panel: el precio que definio el vendedor en cada
 * articulo, sin el descuento sobre el total. Las demas se calculan al imprimir: null
 */
export function importeEstimado(def, o) {
  if (!llevaPrecio(def)) return null;
  let total = 0;
  for (const it of o.items) {
    const p = faltaPrecioLibre(it) ? null : precioItem(it).precio;
    if (p === null || !(Number(it.cantidad) > 0)) return null;
    total += Math.round(p * Number(it.cantidad) * 100) / 100;
  }
  return Math.round(total * 100) / 100;
}

// ---------- lista compacta del panel ----------

/**
 * Una linea por observacion: codigo, nombre corto, cantidad de articulos e
 * importe si ya se conoce (importeDe). Al tocarla se abre para revisar,
 * corregir o quitar.
 */
// ctx: contextoEntrega (opcional), para lo que le falta a la entrega
export function htmlLista(config, lista, importeDe, ctx = null) {
  return lista.map(o => {
    const def = defDe(config, o.clave);
    const f = falta(def, o, ctx);
    const n = o.items.length;
    const imp = importeDe ? importeDe(o, def) : null;
    const det = f || (def?.grupo === 'mercaderia' ? `${n} ${n === 1 ? 'art.' : 'arts.'}`
      : esEntrega(def) ? fmtEntregaCorta(o.entrega) : '');
    return `
      <button type="button" class="cp-obs-linea${f ? ' cp-obs-falta' : ''}" data-obs="${esc(o.id)}">
        <span class="cp-obs-cod">${esc(def?.codigo || '')}</span>
        <span class="cp-obs-txt">${esc(def?.texto || o.clave)}</span>
        <span class="cp-obs-det">${esc(det)}${imp !== null && imp !== undefined ? ' · ' + esc(fmtPesos(imp)) : ''}</span>
        <span class="cp-obs-ir" aria-hidden="true">&#8250;</span>
      </button>`;
  }).join('');
}

// ---------- selector ----------

/**
 * Hoja para elegir una observacion: buscador por codigo o palabra, las mas
 * usadas arriba y las secciones de la columna grupo. Las de Condiciones se
 * agregan al tocarlas; las de Mercaderia pasan a la carga de articulos, en
 * la misma hoja.
 */
// actuales: las observaciones que ya tiene el pedido. alGuardarExistente:
// guarda una de esas, cuando se eligio de nuevo para sumarle articulos.
// ctx: contextoEntrega (solo lo usa la entrega)
export function abrirSelector(config, { actuales = [], alAgregar, alGuardarExistente, ctx = null }) {
  const defs = catalogo(config) || [];
  const u = usos();
  const h = abrirHoja({ titulo: 'Agregar observación' });

  h.cuerpo.innerHTML = `
    <input type="search" class="ob-buscar" placeholder="Buscar por código o palabra"
      autocomplete="off" enterkeyhint="search" aria-label="Buscar observación">
    <div class="ob-opciones"></div>`;
  const campo = h.cuerpo.querySelector('.ob-buscar');
  const cont = h.cuerpo.querySelector('.ob-opciones');

  const fila = d => `
    <button type="button" class="ob-opcion" data-clave="${esc(d.clave)}">
      <span class="ob-cod">${esc(d.codigo)}</span>
      <span class="ob-txt">${esc(d.texto)}</span>
      <span class="ob-efecto">${esc(EFECTO_TEXTO[d.efecto] || '')}${actuales.some(o => o.clave === d.clave) ? ' · ya en el pedido' : ''}</span>
    </button>`;

  // Secciones en el orden en que se ven: sin nada escrito, las mas usadas
  // arriba; despues las que coinciden, por grupo
  function secciones(q) {
    const coinciden = defs.filter(d => !q || sinAcentos(d.codigo).startsWith(q) || sinAcentos(d.texto).includes(q));
    const res = [];
    if (!q) {
      const usadas = defs.filter(d => u[d.clave]).sort((a, b) => u[b.clave] - u[a.clave]).slice(0, 3);
      if (usadas.length) res.push(['Más usadas', usadas]);
    }
    [['mercaderia', 'Mercadería'], ['condiciones', 'Condiciones']].forEach(([g, titulo]) => {
      const del = coinciden.filter(d => d.grupo === g);
      if (del.length) res.push([titulo, del]);
    });
    return res;
  }

  function pintar() {
    const s = secciones(sinAcentos(campo.value));
    cont.innerHTML = s.length
      ? s.map(([titulo, lista]) => `<p class="ob-seccion">${titulo}</p>` + lista.map(fila).join('')).join('')
      : '<p class="ob-vacio">Ninguna observación coincide.</p>';
  }

  /**
   * Condiciones: se agrega (si ya esta, no se repite). Mercaderia: pasa a la
   * carga de articulos, en la misma hoja; si ya esta en el pedido, se abre
   * esa misma para sumarle articulos, en lugar de crear otra
   */
  function elegir(def) {
    const existente = actuales.find(o => o.clave === def.clave);
    // Entrega: una por pedido; si ya esta, se corrige esa misma
    if (esEntrega(def)) {
      if (existente) {
        editarEntregaEn(h, def, JSON.parse(JSON.stringify(existente)), {
          alGuardar: o => { h.cerrar(); alGuardarExistente(o); }, ctx
        });
      } else {
        const nueva = { id: nuevoId(), clave: def.clave, items: [], entrega: { fecha: '', dia: '', quien: '' } };
        editarEntregaEn(h, def, nueva, { alGuardar: o => { h.cerrar(); alAgregar(o); }, ctx });
      }
      return;
    }
    if (def.grupo !== 'mercaderia') {
      h.cerrar();
      if (!existente) alAgregar({ id: nuevoId(), clave: def.clave, items: [] });
      return;
    }
    if (existente) {
      editarEn(h, def, JSON.parse(JSON.stringify(existente)), {
        alGuardar: o => { h.cerrar(); alGuardarExistente(o); }
      });
      return;
    }
    const nueva = { id: nuevoId(), clave: def.clave, items: [] };
    editarEn(h, def, nueva, { alGuardar: o => { h.cerrar(); alAgregar(o); } });
  }

  campo.addEventListener('input', pintar);
  // Enter: la del codigo exacto ("116") o, si no, la primera que se ve. Con
  // el buscador vacio no hace nada: un Enter sin querer no agrega ninguna
  campo.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const q = sinAcentos(campo.value);
    if (!q) return;
    const def = defs.find(d => d.codigo && sinAcentos(d.codigo) === q) || secciones(q)[0]?.[1][0];
    if (def) elegir(def);
  });
  cont.addEventListener('click', e => {
    const def = defs.find(d => d.clave === e.target.closest('.ob-opcion')?.dataset.clave);
    if (def) elegir(def);
  });

  pintar();
  // Cursor en el buscador, tambien en el celular: la hoja se abre desde un
  // toque, y dentro de ese toque el celular si abre el teclado
  campo.focus();
}

/** Hoja para revisar, corregir o quitar una observacion ya agregada (ctx: contextoEntrega, solo la entrega) */
export function abrirEditor(config, o, { alGuardar, alQuitar, ctx = null }) {
  const def = defDe(config, o.clave);
  const h = abrirHoja({ titulo: def ? nombreObs(def) : o.clave });
  // Se edita una copia: Volver descarta los cambios. La entrega tiene su propia hoja
  (esEntrega(def) ? editarEntregaEn : editarEn)(h, def, JSON.parse(JSON.stringify(o)), {
    alGuardar: x => { h.cerrar(); alGuardar(x); },
    alQuitar: () => { h.cerrar(); alQuitar(); },
    ctx
  });
}

/**
 * Celular: al entrar a un buscador de la hoja (selector), que quede arriba de
 * lo visible, con lugar para los resultados (se espera a que termine de abrir
 * el teclado). Lo usan el de articulos y el de clientes de "despues de quien"
 */
function subirAlEnfocar(h, selector) {
  h.cuerpo.addEventListener('focusin', e => {
    const campo = e.target.closest(selector);
    if (!campo || esAncha()) return;
    setTimeout(() => { if (document.activeElement === campo) campo.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 300);
  });
}

// ---------- carga de articulos ----------

/** Codigos que encuentra el buscador del catalogo, con su nombre */
async function buscarArticulos(q) {
  if (!window.BuscadorV2) return [];
  const [codigos, productos] = await Promise.all([
    window.BuscadorV2.buscar(q),
    window.DatosCatalogo ? window.DatosCatalogo.productos() : Promise.resolve({})
  ]);
  return codigos.slice(0, MAX_RESULTADOS).map(sku => ({ sku, nombre: productos[sku]?.name || '' }));
}

function editarEn(h, def, o, { alGuardar, alQuitar }) {
  h.ponerTitulo(def ? nombreObs(def) : o.clave);
  const lados = def?.efecto === 'ajuste' ? LADOS : [{ lado: '', titulo: 'Artículos' }];
  const consultas = {};   // lado -> numero de la ultima busqueda (vale solo la ultima)
  let error = '';
  const cargados = new Set();   // articulos cuya carga a memoria ya termino
  let guardando = false;

  // Espera la carga y actualiza solo el texto del precio de cada articulo:
  // redibujar le sacaria el cursor a la cantidad que se esta escribiendo
  async function cargarArticulos(skus) {
    await asegurarEnMemoria(skus);
    skus.forEach(s => cargados.add(s));
    h.cuerpo.querySelectorAll('.ob-precio-ref[data-k]').forEach(ref => {
      const it = o.items[ref.dataset.k];
      if (it) ref.textContent = refPrecio(it);
    });
  }

  function htmlItems(lado) {
    const del = o.items.map((it, k) => ({ it, k })).filter(x => (x.it.lado || '') === lado);
    if (!del.length) return '<p class="ob-sin-art">Todavía no hay artículos.</p>';
    return del.map(({ it, k }) => `
      <div class="ob-item">
        ${htmlFoto(it.sku)}
        <div class="ob-item-desc">
          <p class="ob-item-nom">${esc(it.nombre || it.sku)}</p>
          <p class="ob-item-cod">${esc(it.sku)}</p>
        </div>
        <input type="number" inputmode="numeric" min="1" step="1" class="ob-cant${Number(it.cantidad) > 0 ? '' : ' ob-mal'}"
          data-k="${k}" value="${esc(it.cantidad)}" placeholder="Cant." aria-label="Cantidad de ${esc(it.sku)}">
        <button type="button" class="ob-item-quitar" data-k="${k}" aria-label="Quitar ${esc(it.sku)}">&times;</button>
      </div>${llevaPrecio(def) ? htmlPrecio(it, k) : ''}`).join('');
  }

  // Precio de la 117: lista (la del cliente marcada), precio especial y
  // descuento, debajo de cada articulo, como el menu de las lineas
  function htmlPrecio(it, k) {
    const listaCli = listaCliente();
    const libre = it.mecanismo === 'precio_libre';
    const sel = libre ? 'libre' : (it.mecanismo === 'otra_lista' && it.listaForzada) || listaCli;
    const descSel = (DESC_117.find(d => d.descuento === (Number(it.descuento) || 0) &&
      d.extra === (Number(it.descuentoExtra) || 0)) || DESC_117[0]).valor;
    return `
      <div class="ob-precio">
        <select class="ob-lista" data-k="${k}" aria-label="Precio de ${esc(it.sku)}">
          ${LISTAS.map(x => `<option value="${x}"${sel === x ? ' selected' : ''}>Lista ${x}${x === listaCli ? ' (cliente)' : ''}</option>`).join('')}
          <option value="libre"${libre ? ' selected' : ''}>Precio especial</option>
        </select>
        <input type="number" inputmode="decimal" min="0" step="0.01" data-k="${k}"
          class="ob-precio-libre${faltaPrecioLibre(it) ? ' ob-mal' : ''}" value="${esc(it.precioLibre ?? '')}"
          placeholder="Precio" aria-label="Precio especial de ${esc(it.sku)}"${libre ? '' : ' hidden'}>
        <select class="ob-desc" data-k="${k}" aria-label="Descuento de ${esc(it.sku)}">
          ${DESC_117.map(d => `<option value="${d.valor}"${d.valor === descSel ? ' selected' : ''}>${d.texto}</option>`).join('')}
        </select>
        <span class="ob-precio-ref" data-k="${k}">${esc(refPrecio(it))}</span>
      </div>`;
  }

  /**
   * De donde sale el precio y que se cobra: "Lista E $8.001,03 −5% → se
   * cobra $7.600,98 por unidad · su lista D: $7.429,53". El primer importe
   * es el de partida (lista elegida o precio especial), el que sigue a "se
   * cobra" es el precio final por unidad, y "su lista" es lo que le
   * corresponde al cliente por su propia lista, sin descuento
   */
  function refPrecio(it) {
    const listaCli = listaCliente();
    const p = precioItem(it);
    const suLista = p.precioBase ? ` · su lista ${listaCli}: ${fmtPesos(p.precioBase)}` : '';
    if (faltaPrecioLibre(it)) return 'Escribí el precio especial' + suLista;
    if (p.precio === null) {
      return cargados.has(it.sku)
        ? 'No se encontró el precio: elegí Precio especial o quitá el artículo'
        : 'Buscando el precio…';
    }

    const libre = it.mecanismo === 'precio_libre';
    const lista = it.mecanismo === 'otra_lista' && it.listaForzada ? it.listaForzada : listaCli;
    const desc = descCombinado(it);
    const esSuLista = !libre && lista === listaCli;
    // Sin descuento y a su lista: el precio de partida es el que se cobra
    if (esSuLista && !desc) return `Se cobra ${fmtPesos(p.precio)} por unidad · es su lista ${listaCli}`;

    const partida = (libre ? 'Precio especial ' : `Lista ${lista} `) + fmtPesos(p.precioAplicado);
    return `${partida}${desc ? ` −${String(desc).replace('.', ',')}%` : ''} → se cobra ${fmtPesos(p.precio)} por unidad` +
      (esSuLista ? '' : suLista);
  }

  function pintar(enfocar) {
    if (!def || def.grupo !== 'mercaderia') {
      h.cuerpo.innerHTML = `<p class="ob-nota">${def ? 'Esta observación no lleva artículos.'
        : 'Esta observación ya no está en la lista: quitala del pedido.'}</p>`;
    } else {
      h.cuerpo.innerHTML = `<p class="ob-nota">${esc(EFECTO_TEXTO[def.efecto] || '')} · ${llevaPrecio(def)
        ? 'cantidad y precio en cada artículo · el precio es el final, sin el descuento del pedido'
        : 'cantidad obligatoria en cada artículo'}</p>` +
        lados.map(l => `
        <section class="ob-lado" data-lado="${l.lado}">
          <p class="ob-lado-tit">${esc(l.titulo)}</p>
          ${htmlItems(l.lado)}
          <input type="search" class="ob-art-buscar" data-lado="${l.lado}" autocomplete="off" enterkeyhint="search"
            placeholder="Agregar artículo: código o palabra" aria-label="Agregar artículo a ${esc(l.titulo)}">
          <div class="ob-art-res" data-lado="${l.lado}"></div>
        </section>`).join('') +
        (error ? `<p class="ob-error" role="alert">${esc(error.charAt(0).toUpperCase() + error.slice(1))}.</p>` : '');
    }
    h.pie.hidden = false;
    h.pie.innerHTML =
      (alQuitar ? '<button type="button" class="hj-btn-peligro ob-quitar">Quitar observación</button>' : '') +
      (def && def.grupo === 'mercaderia'
        ? '<button type="button" class="hj-btn ob-cancelar">Cancelar</button><button type="button" class="hj-btn-prim ob-guardar">Guardar</button>'
        : `<button type="button" class="hj-btn-prim ob-cancelar">${alQuitar ? 'Listo' : 'Cancelar'}</button>`);
    if (enfocar) h.cuerpo.querySelector(enfocar)?.focus();
  }

  function agregar(lado, sku, nombre) {
    const k = o.items.findIndex(it => it.sku === sku && (it.lado || '') === lado);
    if (k < 0) o.items.push({ sku, nombre, cantidad: '', lado, ...(llevaPrecio(def) ? PRECIO_INICIAL : {}) });
    // Si ya estaba, se va a su cantidad en lugar de repetirlo
    const n = k < 0 ? o.items.length - 1 : k;
    error = '';
    pintar(`.ob-cant[data-k="${n}"]`);
    // A memoria para su precio de lista: al llegar se completa el precio
    cargarArticulos([sku]);
  }

  h.cuerpo.addEventListener('input', async e => {
    const cant = e.target.closest('.ob-cant');
    if (cant) {
      o.items[cant.dataset.k].cantidad = cant.value;
      cant.classList.toggle('ob-mal', !(Number(cant.value) > 0));
      return;
    }
    // Precio especial de la 117: se guarda y se actualiza la referencia
    const libre = e.target.closest('.ob-precio-libre');
    if (libre) {
      const it = o.items[libre.dataset.k];
      it.precioLibre = Number(libre.value) > 0 ? Number(libre.value) : null;
      libre.classList.toggle('ob-mal', faltaPrecioLibre(it));
      const ref = h.cuerpo.querySelector(`.ob-precio-ref[data-k="${libre.dataset.k}"]`);
      if (ref) ref.textContent = refPrecio(it);
      return;
    }
    const campo = e.target.closest('.ob-art-buscar');
    if (!campo) return;
    const lado = campo.dataset.lado;
    const n = consultas[lado] = (consultas[lado] || 0) + 1;
    const res = h.cuerpo.querySelector(`.ob-art-res[data-lado="${lado}"]`);
    const q = campo.value.trim();
    if (!q) { res.innerHTML = ''; return; }
    const encontrados = await buscarArticulos(q);
    if (n !== consultas[lado]) return;
    res.innerHTML = encontrados.length ? encontrados.map(a => `
      <button type="button" class="ob-art" data-sku="${esc(a.sku)}" data-nombre="${esc(a.nombre)}">
        ${htmlFoto(a.sku)}
        <span>${esc(a.nombre || a.sku)}<small>${esc(a.sku)}</small></span>
      </button>`).join('') : '<p class="ob-sin-art">Ningún artículo coincide.</p>';
  });

  // Enter en el buscador de articulos: agrega el primer resultado (se busca
  // de nuevo, en memoria: vale aunque la lista todavia no se haya dibujado)
  h.cuerpo.addEventListener('keydown', async e => {
    const campo = e.target.closest('.ob-art-buscar');
    if (!campo || e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const q = campo.value.trim();
    if (!q) return;
    const [primero] = await buscarArticulos(q);
    // Si mientras tanto se escribio otra cosa o se cerro la hoja, no se agrega
    if (!primero || !campo.isConnected || campo.value.trim() !== q) return;
    agregar(campo.dataset.lado, primero.sku, primero.nombre);
  });

  // Enter en la cantidad (ya cargada): el cursor vuelve al buscador del mismo
  // lado, para cargar varios seguidos solo con el teclado (codigo, Enter,
  // cantidad, Enter...). Sin una cantidad valida, se queda para completarla
  h.cuerpo.addEventListener('keydown', e => {
    const cant = e.target.closest('.ob-cant');
    if (!cant || e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (!(Number(cant.value) > 0)) return;
    const lado = o.items[cant.dataset.k]?.lado || '';
    h.cuerpo.querySelector(`.ob-art-buscar[data-lado="${lado}"]`)?.focus();
  });

  // Precio de la 117: lo mismo que guarda ajustarLinea en una linea del pedido
  // (el precio especial se toma al escribir, en 'input', sin redibujar: si se
  // redibujara al salir del campo, el toque en Guardar se perderia)
  h.cuerpo.addEventListener('change', e => {
    const c = e.target.closest('.ob-lista, .ob-desc');
    if (!c) return;
    const k = Number(c.dataset.k);
    const it = o.items[k];
    error = '';
    if (c.classList.contains('ob-lista')) {
      const libre = c.value === 'libre';
      it.mecanismo = libre ? 'precio_libre' : (c.value === listaCliente() ? 'lista_cliente' : 'otra_lista');
      it.listaForzada = it.mecanismo === 'otra_lista' ? c.value : null;
      if (!libre) it.precioLibre = null;
      // Precio especial: el cursor al precio, para escribirlo directo
      pintar(libre ? `.ob-precio-libre[data-k="${k}"]` : null);
      return;
    }
    const d = DESC_117.find(x => x.valor === c.value) || DESC_117[0];
    it.descuento = d.descuento;
    it.descuentoExtra = d.extra;
    pintar();
  });
  // Enter en el precio especial: listo (cierra el teclado del celular)
  h.cuerpo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.ob-precio-libre')) { e.preventDefault(); e.target.blur(); }
  });

  // Celular: al entrar a un buscador, que quede arriba de lo visible, con
  // lugar para los resultados (se espera a que termine de abrir el teclado)
  subirAlEnfocar(h, '.ob-art-buscar');

  h.cuerpo.addEventListener('click', e => {
    const art = e.target.closest('.ob-art');
    if (art) {
      agregar(art.closest('.ob-art-res').dataset.lado, art.dataset.sku, art.dataset.nombre);
      return;
    }
    const q = e.target.closest('.ob-item-quitar');
    if (q) {
      o.items.splice(Number(q.dataset.k), 1);
      pintar();
    }
  });

  h.pie.addEventListener('click', async e => {
    if (e.target.closest('.ob-quitar')) { alQuitar(); return; }
    if (e.target.closest('.ob-cancelar')) { h.cerrar(); return; }
    const boton = e.target.closest('.ob-guardar');
    if (boton) {
      if (guardando) return;
      // Articulos sin precio todavia: se espera su carga antes de controlar
      const sinPrecio = llevaPrecio(def)
        ? o.items.filter(it => !faltaPrecioLibre(it) && precioItem(it).precio === null).map(it => it.sku)
        : [];
      if (sinPrecio.length) {
        guardando = true;
        boton.disabled = true;
        boton.textContent = 'Buscando precios…';
        try {
          await cargarArticulos(sinPrecio);
        } finally {
          guardando = false;
        }
        // Se cerro la hoja mientras tanto: no se guarda
        if (!h.cuerpo.isConnected) return;
        boton.disabled = false;
        boton.textContent = 'Guardar';
      }
      error = falta(def, o);
      if (error) { pintar(); return; }
      o.items = o.items.map(it => ({ ...it, cantidad: Number(it.cantidad) }));
      alGuardar(o);
    }
  });

  // Cursor en el buscador de articulos al cargar una nueva (tambien en el
  // celular). Al revisar una ya cargada (alQuitar), en el celular sin
  // teclado: tapara la mitad de los articulos que se quieren revisar
  const revisando = !!alQuitar;
  pintar(!revisando || esAncha() ? '.ob-art-buscar' : null);
  // Los articulos que ya trae (al reabrirla, o despues de recargar la pagina,
  // cuando en memoria quedo solo el grupo del cliente): a memoria para su precio
  if (o.items.length) cargarArticulos(o.items.map(it => it.sku));
  // Si el mapa de fotos todavia no habia llegado, se completan al llegar
  fotosListas.then(() => ponerFotos(h.cuerpo));
}

// ---------- hoja de la entrega ----------

/** "ROBERTO" -> "Roberto" */
const nombrePropio = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

/** La sigla de quien tiene la sesion abierta ('' si no tiene: un admin, la oficina) */
function siglaSesion() {
  try { return String(sessionStorage.getItem('authCodigo') || '').trim().toUpperCase(); } catch (e) { return ''; }
}

/**
 * Hoja de la entrega especial: el dia y quien entrega, los dos obligatorios.
 * - Dia: seis botones (lu a sa), cada uno la proxima vez que cae ese dia, hoy
 *   incluido, con la fecha en chico; "Otra fecha" abre un calendario. Siempre
 *   se guarda la fecha real.
 * - Quien: la lista de repartidores de la config (ctx.repartidores, en el
 *   orden de la celda) o, sin ella, los vendedores de funcionalidades_usuarios.json
 *   (DatosCatalogo.usuarios), como antes. Al tener la lista se marca la sigla
 *   de la sesion, si esta en ella y todavia no hay ninguna elegida. El JSON
 *   de usuarios da ademas los nombres y la hora del servidor; con la lista de
 *   la config, si falla, solo se pierden esos dos.
 * - "Despues de quien": solo con un cliente nuevo y quien hace el recorrido
 *   (pideDespues). Un buscador de clientes de clientes_nombres.json (cuenta y
 *   nombre, nada financiero, sin consultar al servidor); al elegir queda a la
 *   vista con "Cambiar". Si se cambia a quien no hace el recorrido, se borra.
 * - Viaje (1 o 2): en un dia de dos viajes con quien hace el recorrido
 *   (pideViaje), para cualquier cliente; va antes de "despues de quien". Nunca
 *   viene uno marcado. Se borra CADA VEZ que cambia la fecha, aunque el dia
 *   nuevo tambien sea de dos viajes (cada dia se divide distinto: el viaje 1
 *   del lunes no es la misma zona que el del jueves), y si deja de
 *   corresponder (otra sigla). La medianoche con la hoja abierta no lo borra:
 *   el dia de la semana es el mismo.
 * - Abajo, todo junto: la fecha completa (con el año), quien, el viaje y "despues de";
 *   y si el reloj del dispositivo difiere del servidor mas de 12 h, un aviso.
 * Se edita una copia. Guardar: si paso la medianoche desde que se pintaron
 * los botones, recalcula la fecha del dia elegido y, si cambio, avisa y no
 * guarda; despues controla con falta(), como la 117.
 */
function editarEntregaEn(h, def, o, { alGuardar, alQuitar, ctx = null }) {
  h.ponerTitulo(def ? nombreObs(def) : o.clave);
  const e = o.entrega = { fecha: '', dia: '', quien: '', ...(o.entrega || {}) };
  const deConfig = (ctx?.repartidores || []).length > 0;
  let otra = !!e.fecha && !e.dia;      // la fecha salio del calendario
  // De la lista de quien entrega: cargando, listo, vacia o error. La de la
  // config ya esta: los nombres llegan despues
  let estado = deConfig ? 'listo' : 'cargando';
  let lista = deConfig ? ctx.repartidores.map(codigo => ({ codigo, nombre: '' })) : [];
  let desfase = null;                  // reloj del dispositivo menos el del servidor (ms)
  let hoyPintado = '';                 // el dia con el que se calcularon los botones
  let error = '';
  let aviso = '';
  // "Despues de quien": la lista de clientes (null: no se pidio), su estado y lo escrito
  let clientes = null;
  let estadoClientes = 'sin_pedir';    // sin_pedir, cargando, listo o error
  let busqueda = '';
  // Cursor pedido para el buscador de clientes (Cambiar) que todavia no esta
  // (la lista de clientes no llego): se pone cuando aparece
  let focoPendiente = false;

  /** Marca la sigla de la sesion, si esta en la lista y no hay ninguna elegida */
  function preseleccionar() {
    if (e.quien || !lista.length) return;
    const propia = siglaSesion();
    if (propia && lista.some(v => v.codigo === propia)) e.quien = propia;
  }

  async function cargar() {
    if (!deConfig) estado = 'cargando';
    pintar();
    try {
      if (!window.DatosCatalogo?.usuarios) throw new Error('falta DatosCatalogo.usuarios');
      const r = await window.DatosCatalogo.usuarios();
      desfase = r.desfaseMs;
      if (deConfig) {
        // De la config: el JSON solo pone los nombres (IS no es usuario: queda la sigla)
        const nombres = {};
        Object.values(r.datos?.usuarios || {}).forEach(u => {
          const c = String(u?.codigo || '').trim().toUpperCase();
          if (c && !nombres[c]) nombres[c] = String(u.nombre || '').trim();
        });
        lista = lista.map(v => ({ ...v, nombre: nombres[v.codigo] || '' }));
      } else {
        lista = vendedores(r.datos);
        estado = lista.length ? 'listo' : 'vacia';
      }
    } catch (err) {
      console.warn('[Observaciones] No se pudo leer la lista de vendedores:', err);
      if (!deConfig) {
        lista = [];
        estado = 'error';
      }
    }
    // Se cerro la hoja mientras tanto
    if (!h.cuerpo.isConnected) return;
    if (estado === 'listo') preseleccionar();
    pintar();
  }

  /** La lista de clientes de "despues de quien", una vez (Reintentar la vuelve a pedir) */
  async function cargarClientes() {
    estadoClientes = 'cargando';
    pintar();
    try {
      if (!window.DatosCatalogo?.clientes) throw new Error('falta DatosCatalogo.clientes');
      clientes = clientesElegibles(await window.DatosCatalogo.clientes(), ctx?.noElegibles || []);
      estadoClientes = 'listo';
    } catch (err) {
      console.warn('[Observaciones] No se pudo leer la lista de clientes:', err);
      clientes = null;
      estadoClientes = 'error';
    }
    if (!h.cuerpo.isConnected) return;
    pintar();
  }

  function htmlQuien() {
    if (estado === 'cargando') return '<p class="ob-nota">Cargando vendedores…</p>';
    // La ya elegida que no esta en la lista (un vendedor que se dio de baja) se sigue viendo
    const botones = lista.concat(e.quien && !lista.some(v => v.codigo === e.quien) ? [{ codigo: e.quien, nombre: '' }] : []);
    const falla = estado === 'error' || estado === 'vacia'
      ? `<p class="ob-ent-falla">No se pudo leer la lista de vendedores.
           <button type="button" class="hj-btn ob-ent-reintentar">Reintentar</button></p>` : '';
    return falla + (botones.length ? `<div class="ob-ent-vends">${botones.map(v => `
      <button type="button" class="ob-ent-vend${v.codigo === e.quien ? ' ob-ent-sel' : ''}" data-quien="${esc(v.codigo)}"
        aria-pressed="${v.codigo === e.quien}">
        <span class="ob-ent-sigla">${esc(v.codigo)}</span><span class="ob-ent-chico">${esc(nombrePropio(v.nombre))}</span>
      </button>`).join('')}</div>` : '');
  }

  /** Viaje 1 o 2, solo si se pide; la nota dice el dia, por si salio del calendario */
  function htmlViaje() {
    if (!pideViaje(e, ctx)) return '';
    const d = deIso(e.fecha);
    const botones = [1, 2].map(n => `
      <button type="button" class="ob-ent-viaje${e.viaje === n ? ' ob-ent-sel' : ''}" data-viaje="${n}"
        aria-pressed="${e.viaje === n}">Viaje ${n}</button>`).join('');
    return `<p class="ob-lado-tit">Viaje</p>
      <p class="ob-nota">El ${NOMBRES_DIA[d.getDay()]} ${dos(d.getDate())}/${dos(d.getMonth() + 1)} el reparto sale en dos viajes: elegí en cuál va.</p>
      <div class="ob-ent-viajes">${botones}</div>`;
  }

  /** Cambia la fecha: el viaje elegido era de la otra (cada dia se divide distinto) */
  function ponerFecha(fecha) {
    if (fecha !== e.fecha) delete e.viaje;
    e.fecha = fecha;
  }

  /** Resultados del buscador de clientes: cuenta y nombre, nada mas */
  function htmlResultados() {
    if (!busqueda.trim()) return '';
    const res = buscarClientes(clientes || [], busqueda);
    return res.length ? res.map(c => `
      <button type="button" class="ob-ent-cli" data-cuenta="${esc(c.cuenta)}" data-nombre="${esc(c.nombre)}">
        <b>${esc(c.cuenta)}</b> <span>${esc(c.nombre)}</span>
      </button>`).join('') : '<p class="ob-sin-art">Ningún cliente coincide.</p>';
  }

  function htmlDespues() {
    if (!pideDespues(e, ctx)) return '';
    let cuerpo;
    if (e.despuesDe?.cuenta) {
      cuerpo = `<div class="ob-ent-elegido"><span><b>${esc(e.despuesDe.cuenta)}</b> · ${esc(e.despuesDe.nombre)}</span>
        <button type="button" class="hj-btn ob-ent-cambiar">Cambiar</button></div>`;
    } else if (estadoClientes === 'error') {
      cuerpo = `<p class="ob-ent-falla">No se pudo leer la lista de clientes.
        <button type="button" class="hj-btn ob-ent-cli-reintentar">Reintentar</button></p>`;
    } else if (estadoClientes !== 'listo') {
      cuerpo = '<p class="ob-nota">Cargando clientes…</p>';
    } else {
      cuerpo = `<input type="search" class="ob-ent-cli-buscar" autocomplete="off" enterkeyhint="search"
          placeholder="Cliente: nombre o cuenta" aria-label="Después de quién: buscar cliente" value="${esc(busqueda)}">
        <div class="ob-ent-cli-res">${htmlResultados()}</div>`;
    }
    return `<p class="ob-lado-tit">Después de quién:</p>
      <p class="ob-nota">Cliente nuevo: se le entrega justo después del cliente que elijas.</p>${cuerpo}`;
  }

  function pintar(enfocar) {
    // Si se estaba escribiendo en el buscador de clientes, sigue ahi despues de redibujar
    const enBuscador = document.activeElement?.classList?.contains('ob-ent-cli-buscar');
    const hoy = hoyIso();
    hoyPintado = hoy;
    const dias = DIAS.slice(1).map(d => {
      const f = deIso(proximoDia(d, hoy));
      const sel = !otra && e.dia === d;
      return `<button type="button" class="ob-ent-dia${sel ? ' ob-ent-sel' : ''}" data-dia="${d}" aria-pressed="${sel}">
        <span class="ob-ent-nom">${d}</span><span class="ob-ent-chico">${dos(f.getDate())}/${dos(f.getMonth() + 1)}</span>
      </button>`;
    }).join('');
    const v = lista.find(x => x.codigo === e.quien);
    const resumen = e.fecha
      ? `Entrega el <b>${esc(fmtEntregaLarga(e.fecha))}</b>${e.quien ? ` · ${esc(e.quien)}${v?.nombre ? ` (${esc(nombrePropio(v.nombre))})` : ''}` : ''}` +
        (e.viaje && pideViaje(e, ctx) ? ` · <b>viaje ${e.viaje}</b>` : '') +
        (e.despuesDe?.cuenta ? ` · después de <b>${esc(e.despuesDe.cuenta)} ${esc(e.despuesDe.nombre)}</b>` : '')
      : 'Elegí el día y quién entrega.';
    const relojMal = desfase !== null && Math.abs(desfase) > RELOJ_MAL_MS;
    const fechaServidor = relojMal ? new Date(Date.now() - desfase) : null;

    h.cuerpo.innerHTML = `
      <p class="ob-nota">Para una entrega fuera del día fijo del cliente.</p>
      ${relojMal ? `<p class="ob-ent-reloj" role="alert">La fecha de este dispositivo parece estar mal (hoy es
        ${dos(fechaServidor.getDate())}/${dos(fechaServidor.getMonth() + 1)}/${fechaServidor.getFullYear()}).
        Revisala antes de elegir el día.</p>` : ''}
      <p class="ob-lado-tit">Día</p>
      <div class="ob-ent-dias">${dias}</div>
      <button type="button" class="hj-btn ob-ent-otra${otra ? ' ob-ent-sel' : ''}" aria-pressed="${otra}">Otra fecha</button>
      ${otra ? `<input type="date" class="ob-ent-fecha" min="${hoy}" max="${masDias(hoy, MAX_DIAS_ENTREGA)}"
        value="${esc(e.fecha)}" aria-label="Fecha de entrega">` : ''}
      <p class="ob-lado-tit">Quién entrega</p>
      ${htmlQuien()}
      ${htmlViaje()}
      ${htmlDespues()}
      <p class="ob-ent-resumen">${resumen}</p>
      ${aviso ? `<p class="ob-ent-aviso" role="alert">${esc(aviso)}</p>` : ''}
      ${error ? `<p class="ob-error" role="alert">${esc(error.charAt(0).toUpperCase() + error.slice(1))}.</p>` : ''}`;
    h.pie.hidden = false;
    h.pie.innerHTML =
      (alQuitar ? '<button type="button" class="hj-btn-peligro ob-quitar">Quitar observación</button>' : '') +
      '<button type="button" class="hj-btn ob-cancelar">Cancelar</button><button type="button" class="hj-btn-prim ob-guardar">Guardar</button>';
    if (enfocar === '.ob-ent-cli-buscar') focoPendiente = true;
    const foco = enfocar || (enBuscador || focoPendiente ? '.ob-ent-cli-buscar' : null);
    const campo = foco && h.cuerpo.querySelector(foco);
    if (campo) {
      campo.focus();
      // El cursor al final de lo escrito
      if (foco === '.ob-ent-cli-buscar') {
        campo.setSelectionRange?.(campo.value.length, campo.value.length);
        focoPendiente = false;
      }
    }
    // Hace falta la lista de clientes y todavia no se pidio
    if (pideDespues(e, ctx) && !e.despuesDe?.cuenta && estadoClientes === 'sin_pedir') cargarClientes();
  }

  /** Elige un cliente para "despues de quien" */
  function elegirCliente(cuenta, nombre) {
    e.despuesDe = { cuenta, nombre };
    busqueda = '';
    error = '';
    pintar();
  }

  h.cuerpo.addEventListener('click', ev => {
    const dia = ev.target.closest('.ob-ent-dia');
    const vend = ev.target.closest('.ob-ent-vend');
    const cli = ev.target.closest('.ob-ent-cli');
    const viaje = ev.target.closest('.ob-ent-viaje');
    error = '';
    aviso = '';
    if (dia) {
      otra = false;
      e.dia = dia.dataset.dia;
      ponerFecha(proximoDia(e.dia, hoyIso()));
      pintar();
    } else if (ev.target.closest('.ob-ent-otra')) {
      // Del boton de un dia al calendario: la fecha se elige de nuevo
      if (!otra) { e.dia = ''; ponerFecha(''); }
      otra = true;
      pintar('.ob-ent-fecha');
    } else if (vend) {
      e.quien = vend.dataset.quien;
      // Quien no hace el recorrido no necesita el viaje ni "despues de quien"
      if (!pideViaje(e, ctx)) delete e.viaje;
      if (!pideDespues(e, ctx)) delete e.despuesDe;
      pintar();
    } else if (viaje) {
      e.viaje = Number(viaje.dataset.viaje);
      pintar();
    } else if (ev.target.closest('.ob-ent-reintentar')) {
      cargar();
    } else if (cli) {
      elegirCliente(cli.dataset.cuenta, cli.dataset.nombre);
    } else if (ev.target.closest('.ob-ent-cambiar')) {
      delete e.despuesDe;
      pintar('.ob-ent-cli-buscar');
    } else if (ev.target.closest('.ob-ent-cli-reintentar')) {
      cargarClientes();
    }
  });

  // Buscador de clientes: solo se actualizan los resultados (redibujar le
  // sacaria el teclado al celular mientras se escribe)
  h.cuerpo.addEventListener('input', ev => {
    const campo = ev.target.closest('.ob-ent-cli-buscar');
    if (!campo) return;
    busqueda = campo.value;
    const res = h.cuerpo.querySelector('.ob-ent-cli-res');
    if (res) res.innerHTML = htmlResultados();
  });
  // Enter: el primer cliente que coincide
  h.cuerpo.addEventListener('keydown', ev => {
    if (!ev.target.closest('.ob-ent-cli-buscar') || ev.key !== 'Enter' || ev.isComposing) return;
    ev.preventDefault();
    const [primero] = buscarClientes(clientes || [], busqueda);
    if (primero) elegirCliente(primero.cuenta, primero.nombre);
  });
  // Celular: el mismo comportamiento que el buscador de articulos de la 117
  subirAlEnfocar(h, '.ob-ent-cli-buscar');

  h.cuerpo.addEventListener('change', ev => {
    if (!ev.target.closest('.ob-ent-fecha')) return;
    ponerFecha(ev.target.value || '');
    e.dia = '';
    error = '';
    aviso = '';
    pintar();
  });

  h.pie.addEventListener('click', ev => {
    if (ev.target.closest('.ob-quitar')) { alQuitar(); return; }
    if (ev.target.closest('.ob-cancelar')) { h.cerrar(); return; }
    if (!ev.target.closest('.ob-guardar')) return;
    // Paso la medianoche con la hoja abierta: los botones tenian las fechas de
    // ayer. El dia elegido se recalcula; si cambia la fecha, se avisa y no se
    // guarda. El viaje queda: es el mismo dia de la semana, una semana despues
    const hoy = hoyIso();
    if (hoy !== hoyPintado) {
      const antes = e.fecha;
      if (e.dia) e.fecha = proximoDia(e.dia, hoy);
      if (e.fecha !== antes) {
        error = '';
        aviso = `Cambió el día mientras la hoja estaba abierta: "${e.dia}" ahora es el ` +
          `${fmtEntregaLarga(e.fecha)}. Revisalo y tocá Guardar de nuevo.`;
        pintar();
        return;
      }
    }
    // Un viaje o un "despues de quien" que ya no hacen falta no se guardan
    if (!pideViaje(e, ctx)) delete e.viaje;
    if (!pideDespues(e, ctx)) delete e.despuesDe;
    error = falta(def, o, ctx);
    if (error) { aviso = ''; pintar(); return; }
    alGuardar(o);
  });

  if (deConfig) preseleccionar();
  cargar();
}
