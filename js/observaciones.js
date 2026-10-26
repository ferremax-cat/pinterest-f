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
 * Se guardan en el ajuste del carrito (Carrito.getAjustePedido().observaciones):
 *   { id, clave, items: [{ sku, nombre, cantidad, lado }] }
 * (lado: 'facturado' o 'correspondia', solo en la de ajuste).
 */

import { abrirHoja, esAncha } from './hoja.js';

const LADOS = [
  { lado: 'facturado', titulo: 'Lo facturado' },
  { lado: 'correspondia', titulo: 'Lo que correspondía' }
];
const EFECTO_TEXTO = { informativa: 'Informativa', descuenta: 'Descuenta', suma: 'Suma', ajuste: 'Ajuste' };
const MAX_RESULTADOS = 30;
const CLAVE_USO = 'obsUso';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nuevoId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtPesos = n => '$' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** La lista de la planilla, o null si el servidor todavia no la manda */
export function catalogo(config) {
  return Array.isArray(config?.catalogoObservaciones) ? config.catalogoObservaciones : null;
}

export const defDe = (config, clave) => (catalogo(config) || []).find(d => d.clave === clave) || null;

/** "113 MERCADERIA ENTREGADA" */
export const nombreObs = def => (def.codigo ? def.codigo + ' ' : '') + def.texto;

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

/** Lo que le falta a una observacion para poder confirmar el pedido, o '' */
export function falta(def, o) {
  if (!def) return 'ya no está en la lista';
  if (def.grupo !== 'mercaderia') return '';
  if (!o.items.length) return 'faltan artículos';
  if (o.items.some(it => !(Number(it.cantidad) > 0))) return 'falta una cantidad';
  if (def.efecto === 'ajuste' && LADOS.some(l => !o.items.some(it => it.lado === l.lado))) {
    return 'faltan artículos en los dos lados';
  }
  return '';
}

// ---------- lista compacta del panel ----------

/**
 * Una linea por observacion: codigo, nombre corto, cantidad de articulos e
 * importe si ya se conoce (importeDe). Al tocarla se abre para revisar,
 * corregir o quitar.
 */
export function htmlLista(config, lista, importeDe) {
  return lista.map(o => {
    const def = defDe(config, o.clave);
    const f = falta(def, o);
    const n = o.items.length;
    const imp = importeDe ? importeDe(o, def) : null;
    const det = f || (def?.grupo === 'mercaderia' ? `${n} ${n === 1 ? 'art.' : 'arts.'}` : '');
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
export function abrirSelector(config, { alAgregar }) {
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
      <span class="ob-efecto">${esc(EFECTO_TEXTO[d.efecto] || '')}</span>
    </button>`;

  function pintar() {
    const q = sinAcentos(campo.value);
    const coinciden = defs.filter(d => !q || sinAcentos(d.codigo).startsWith(q) || sinAcentos(d.texto).includes(q));
    if (!coinciden.length) {
      cont.innerHTML = '<p class="ob-vacio">Ninguna observación coincide.</p>';
      return;
    }
    let html = '';
    if (!q) {
      const usadas = defs.filter(d => u[d.clave]).sort((a, b) => u[b.clave] - u[a.clave]).slice(0, 3);
      if (usadas.length) html += '<p class="ob-seccion">Más usadas</p>' + usadas.map(fila).join('');
    }
    [['mercaderia', 'Mercadería'], ['condiciones', 'Condiciones']].forEach(([g, titulo]) => {
      const del = coinciden.filter(d => d.grupo === g);
      if (del.length) html += `<p class="ob-seccion">${titulo}</p>` + del.map(fila).join('');
    });
    cont.innerHTML = html;
  }

  campo.addEventListener('input', pintar);
  cont.addEventListener('click', e => {
    const def = defs.find(d => d.clave === e.target.closest('.ob-opcion')?.dataset.clave);
    if (!def) return;
    const nueva = { id: nuevoId(), clave: def.clave, items: [] };
    if (def.grupo !== 'mercaderia') {
      h.cerrar();
      alAgregar(nueva);
      return;
    }
    editarEn(h, def, nueva, { alGuardar: o => { h.cerrar(); alAgregar(o); } });
  });

  pintar();
  if (esAncha()) campo.focus();
}

/** Hoja para revisar, corregir o quitar una observacion ya agregada */
export function abrirEditor(config, o, { alGuardar, alQuitar }) {
  const def = defDe(config, o.clave);
  const h = abrirHoja({ titulo: def ? nombreObs(def) : o.clave });
  // Se edita una copia: Volver descarta los cambios
  editarEn(h, def, JSON.parse(JSON.stringify(o)), {
    alGuardar: x => { h.cerrar(); alGuardar(x); },
    alQuitar: () => { h.cerrar(); alQuitar(); }
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

  function htmlItems(lado) {
    const del = o.items.map((it, k) => ({ it, k })).filter(x => (x.it.lado || '') === lado);
    if (!del.length) return '<p class="ob-sin-art">Todavía no hay artículos.</p>';
    return del.map(({ it, k }) => `
      <div class="ob-item">
        <div class="ob-item-desc">
          <p class="ob-item-nom">${esc(it.nombre || it.sku)}</p>
          <p class="ob-item-cod">${esc(it.sku)}</p>
        </div>
        <input type="number" inputmode="numeric" min="1" step="1" class="ob-cant${Number(it.cantidad) > 0 ? '' : ' ob-mal'}"
          data-k="${k}" value="${esc(it.cantidad)}" placeholder="Cant." aria-label="Cantidad de ${esc(it.sku)}">
        <button type="button" class="ob-item-quitar" data-k="${k}" aria-label="Quitar ${esc(it.sku)}">&times;</button>
      </div>`).join('');
  }

  function pintar(enfocar) {
    if (!def || def.grupo !== 'mercaderia') {
      h.cuerpo.innerHTML = `<p class="ob-nota">${def ? 'Esta observación no lleva artículos.'
        : 'Esta observación ya no está en la lista: quitala del pedido.'}</p>`;
    } else {
      h.cuerpo.innerHTML = `<p class="ob-nota">${esc(EFECTO_TEXTO[def.efecto] || '')} · cantidad obligatoria en cada artículo</p>` +
        lados.map(l => `
        <section class="ob-lado" data-lado="${l.lado}">
          <p class="ob-lado-tit">${esc(l.titulo)}</p>
          ${htmlItems(l.lado)}
          <input type="search" class="ob-art-buscar" data-lado="${l.lado}" autocomplete="off" enterkeyhint="search"
            placeholder="Agregar artículo: código o palabra" aria-label="Agregar artículo a ${esc(l.titulo)}">
          <div class="ob-art-res" data-lado="${l.lado}"></div>
        </section>`).join('') +
        (error ? `<p class="ob-error" role="alert">${esc(error)}</p>` : '');
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
    if (k < 0) o.items.push({ sku, nombre, cantidad: '', lado });
    // Si ya estaba, se va a su cantidad en lugar de repetirlo
    const n = k < 0 ? o.items.length - 1 : k;
    error = '';
    pintar(`.ob-cant[data-k="${n}"]`);
  }

  h.cuerpo.addEventListener('input', async e => {
    const cant = e.target.closest('.ob-cant');
    if (cant) {
      o.items[cant.dataset.k].cantidad = cant.value;
      cant.classList.toggle('ob-mal', !(Number(cant.value) > 0));
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
        ${esc(a.nombre || a.sku)}<small>${esc(a.sku)}</small>
      </button>`).join('') : '<p class="ob-sin-art">Ningún artículo coincide.</p>';
  });

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

  h.pie.addEventListener('click', e => {
    if (e.target.closest('.ob-quitar')) { alQuitar(); return; }
    if (e.target.closest('.ob-cancelar')) { h.cerrar(); return; }
    if (e.target.closest('.ob-guardar')) {
      error = falta(def, o);
      if (error) { pintar(); return; }
      o.items = o.items.map(it => ({ ...it, cantidad: Number(it.cantidad) }));
      alGuardar(o);
    }
  });

  pintar(esAncha() ? '.ob-art-buscar' : null);
}
