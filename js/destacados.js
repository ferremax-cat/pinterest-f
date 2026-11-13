/**
 * FRESCURA DE LOS DESTACADOS
 *
 * Los destacados de la galeria (el grupo del usuario en catalogo_grupos.json)
 * se guardan en clientData al iniciar sesion y no se volvian a leer: con la
 * pestaña abierta, o recargandola, seguian los de ese dia. frescura-precios.js
 * lee json/version.json cada 15 minutos y llama a revisarDestacados con la
 * huella de catalogo_grupos.json: solo si cambio, lo baja una vez (en un tiempo
 * muerto), guarda la lista nueva en clientData y repinta la galeria en el
 * lugar, sin recargar.
 *
 * Para no molestar: solo se repinta la galeria de destacados (no resultados de
 * busqueda, ni el modo clientes, ni una galeria vaciada con la X), arriba de
 * todo y sin tocarla hace 1,5 s. Si no se puede, queda pendiente y se vuelve a
 * probar cada 30 s, sin consultas. La lista nueva ya queda guardada: una
 * recarga o "Limpiar" ya la usan.
 */
import { imagenes } from './datos-catalogo.js';

// Cache HTTP del servidor (unos 10 min), como en frescura-precios.js
const MARGEN_MS = 15 * 60 * 1000;
const QUIETO_MS = 1500;          // sin tocar la pagina, como el buscador
const REINTENTO_MS = 30 * 1000;  // pendiente: volver a mirar (sin consultas)

const may = c => String(c).trim().toUpperCase();
// Sin repetidos, en el orden de la lista (como cargarGaleria)
const unicos = l => { const v = new Set(); return l.filter(c => !v.has(may(c)) && v.add(may(c))); };
const mismos = (a, b) => a.length === b.length && a.every((c, i) => may(c) === may(b[i]));

function leerCliente() {
  try { return JSON.parse(localStorage.getItem('clientData') || 'null'); } catch (e) { return null; }
}

// Lo que pinta catalogo.html al cargar: lee la misma lista en DOMContentLoaded,
// despues de este modulo
let pintados = unicos(leerCliente()?.productCodes || []);
let huellaRevisada = null;   // ultima huella ya resuelta en esta pestaña
let pendientes = null;       // lista nueva que falta pintar
let reintento = 0;

// Ultima vez que el usuario toco la pagina
let ultimoToque = -Infinity;
const anotar = () => { ultimoToque = performance.now(); };
['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
  .forEach(t => window.addEventListener(t, anotar, { capture: true, passive: true }));
const conMouse = window.matchMedia?.('(hover: hover) and (pointer: fine)');

const enTiempoMuerto = () => new Promise(r =>
  window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 30000 }) : setTimeout(r, 0));

/**
 * g: version.catalogo_grupos ({ huella, generado }). No lanza: un error se
 * avisa en la consola y se vuelve a probar en la proxima revision.
 */
export async function revisarDestacados(g) {
  try {
    if (!g?.huella || g.huella === huellaRevisada) return;
    const cd = leerCliente();
    const grupo = cd?.groups?.[0];
    if (!grupo || !Array.isArray(cd.productCodes)) return;

    let codigos;
    if (cd.productCodesHuella === g.huella ||
        (!cd.productCodesHuella && Date.parse(g.generado) < Date.parse(cd.lastLogin) - MARGEN_MS)) {
      // Ya la guardo otra pestaña, o la sesion se inicio despues del cambio
      codigos = cd.productCodes;
    } else {
      await enTiempoMuerto();
      // La huella en la URL evita la copia vieja de la cache HTTP
      const r = await fetch(`./json/catalogo_grupos.json?v=${encodeURIComponent(g.huella)}`);
      if (!r.ok) return;
      const lista = (await r.json())?.[grupo];
      // Grupo vacio o que ya no esta: quedan los de ahora (no se deja la galeria vacia)
      if (!Array.isArray(lista) || !lista.length) { huellaRevisada = g.huella; return; }
      codigos = lista;
    }

    // Releer: otra pestaña o un cierre de sesion pudo cambiarlo mientras tanto
    const ahora = leerCliente();
    if (!ahora || String(ahora.account) !== String(cd.account)) return;
    // Hasta repintar, el scroll sigue con la lista que esta en pantalla
    if (!window.allProducts?.length) window.allProducts = [...pintados];
    if (ahora.productCodesHuella !== g.huella) {
      ahora.productCodes = codigos;
      ahora.productCodesHuella = g.huella;
      localStorage.setItem('clientData', JSON.stringify(ahora));
    }
    huellaRevisada = g.huella;
    const pm = window.productManager;
    if (pm?.clientData) pm.clientData.productCodes = codigos;

    const nuevos = unicos(codigos);
    if (mismos(nuevos, pendientes || pintados)) return;

    // La galeria toma nombre y precio de productManager: se suman los que falten
    const faltan = nuevos.filter(c => !pm?.getProduct(c));
    if (faltan.length) await window.productManagerInstance?.loadSpecificProducts(faltan);
    pm?.guardarEstado?.();

    pendientes = nuevos;
    console.info(`[Destacados] catalogo_grupos.json cambió: ${nuevos.length} destacados`);
    intentarPintar();
  } catch (e) {
    console.warn('[Destacados] No se pudo revisar:', e);
  }
}

/** La galeria muestra los destacados (y no una busqueda, clientes o vacia) */
function muestraDestacados(galeria) {
  if (document.body.classList.contains('modo-busqueda-clientes')) return false;
  if (document.querySelector('input[type="text"]')?.value.trim()) return false;
  if (document.getElementById('mensaje-busqueda')) return false;
  const antes = new Set(pintados.map(may));
  const visibles = [...galeria.querySelectorAll('.gallery-item')].filter(i => i.style.display !== 'none');
  return visibles.length > 0 && visibles.every(i => antes.has(may(i.dataset.productCode || '')));
}

/** Que el cambio no le mueva una tarjeta que esta mirando o por tocar */
function quieto(galeria) {
  if (document.getElementById('carrito-panel')?.style.display === 'flex') return false;
  if (performance.now() - ultimoToque < QUIETO_MS) return false;
  if (window.scrollY > window.innerHeight / 4) return false;
  if (conMouse?.matches && galeria.matches(':hover')) return false;
  return !galeria.contains(document.activeElement);
}

function intentarPintar() {
  clearTimeout(reintento);
  if (!pendientes) return;
  const galeria = document.querySelector('.gallery-container');
  if (galeria && muestraDestacados(galeria) && quieto(galeria)) pintar(galeria);
  else reintento = setTimeout(intentarPintar, REINTENTO_MS);
}

async function pintar(galeria) {
  let fotos = {};
  try { fotos = (await imagenes()).images || {}; } catch (e) {}
  // La espera pudo coincidir con algo del usuario
  if (!pendientes || !muestraDestacados(galeria) || !quieto(galeria)) {
    reintento = setTimeout(intentarPintar, REINTENTO_MS);
    return;
  }
  const lista = pendientes;
  let cambiadas = 0;
  [...galeria.querySelectorAll('.gallery-item')].forEach((item, i) => {
    const codigo = lista[i];
    // Las que sobran se ocultan, como en cargarGaleria
    if (!codigo) { item.style.display = 'none'; return; }
    const sku = may(codigo);
    if (item.style.display !== 'none' && may(item.dataset.productCode || '') === sku) return;   // la misma: no se toca
    cambiadas++;
    item.style.display = '';
    item.dataset.productCode = sku;
    const cod = item.querySelector('.bottom-row a');
    if (cod) cod.textContent = sku;
    const nombre = item.querySelector('.top-row a');
    const p = window.productManager?.getProduct(sku);
    if (nombre) nombre.textContent = p?.nombre ? String(p.nombre).toLowerCase() : '';

    // Foto: la del nuevo, o ninguna (que no quede la del anterior)
    const img = item.querySelector('img');
    if (img && window.Fotos) {
      const id = fotos[codigo] || fotos[sku] || fotos[sku.toLowerCase()];
      if (id) window.Fotos.poner(img, id, i); else window.Fotos.quitar(img);
      img.alt = sku;
    }

    // Precio, icono del carrito y cinta de promo (pintarPrecio pone los tres)
    const fila = item.querySelector('.bottom-row');
    if (fila && window.Precios) {
      let tag = fila.querySelector('.price-tag');
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'price-tag';
        fila.appendChild(tag);
      }
      delete tag.dataset.processed;
      delete tag.dataset.originalPrice;
      if (!window.Precios.pintarPrecio(tag, sku)) {
        // Sin precio: que no queden el carrito, la cinta ni el codigo del anterior
        delete tag.dataset.sku;
        fila.parentElement?.querySelector(':scope > .btn-carrito')?.remove();
        fila.parentElement?.querySelector(':scope > .cinta-promo')?.remove();
      }
    }
    // "Comprado ..." del cliente elegido, si la tarjeta lo usa
    if (item.dataset.historial) window.HistorialCliente?.pintar(item);
  });

  pintados = lista;
  pendientes = null;
  window.allProducts = [...lista];   // el scroll sigue con la lista nueva
  if (cambiadas) window.applyPinterestLayout?.();
  console.info(`[Destacados] Galería actualizada: ${cambiadas} tarjetas`);
}

// Para revisar desde la consola
window.Destacados = { pendientes: () => pendientes, intentarPintar };
