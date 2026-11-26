/**
 * FRESCURA DE LAS FOTOS
 *
 * catalogo_imagenes.json (codigo -> id de Drive) se bajaba una sola vez por
 * pagina: una foto subida con la pestaña abierta no aparecia hasta cerrarla.
 * frescura-precios.js lee json/version.json cada 15 minutos y avisa con
 * 'version:leida'. Si cambio la huella de "imagenes" (scripts/excel_to_json.py:
 * solo el mapa, sin la fecha), se baja una vez, en un tiempo muerto, y:
 *   - queda vigente para lo que se pinte despues (datos-catalogo.js);
 *   - se avisa 'imagenes:actualizadas' (el carrito y las observaciones guardan
 *     su propia copia del mapa);
 *   - se repintan en el lugar las tarjetas de la galeria cuya foto no es la
 *     del mapa nuevo (sin foto, u otra). La foto queda diferida: el navegador
 *     la baja cuando la tarjeta esta o se acerca a la pantalla.
 * No se borra una foto que salio del mapa: si el archivo de Drive ya no
 * existe, Fotos.fallo pone la de reemplazo.
 *
 * Con el panel del carrito abierto, frescura-precios.js avisa solo la version
 * de la app: esto espera a que se cierre (no compite con el pedido).
 */
import { reemplazarImagenes } from './datos-catalogo.js';

// Margen por la cache HTTP del servidor (unos 10 min), como precios y promociones
const MARGEN_MS = 15 * 60 * 1000;
const cargadasEn = Date.now();
let huellaVista = null;
let revisando = false;

const enTiempoMuerto = () => new Promise(r =>
  window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 30000 }) : setTimeout(r, 0));

/** El id del mapa para una tarjeta (el codigo tal cual, en mayusculas o en minusculas) */
const idDe = (mapa, codigo) => mapa[codigo] || mapa[codigo.toUpperCase()] || mapa[codigo.toLowerCase()];

/**
 * Pone la foto del mapa en cada tarjeta de la galeria que no la tiene.
 * Devuelve cuantas cambio.
 */
export function repintarFotos(mapa) {
  if (!window.Fotos || !mapa) return 0;
  let cambiadas = 0;
  document.querySelectorAll('.gallery-container .gallery-item[data-product-code]').forEach(item => {
    const codigo = String(item.dataset.productCode || '').trim();
    const id = codigo && idDe(mapa, codigo);
    const img = id && item.querySelector('img');
    if (!img || img.dataset.fotoId === id) return;   // sin foto nueva, o ya es la misma
    window.Fotos.poner(img, id);   // sin posicion: diferida
    cambiadas++;
  });
  return cambiadas;
}

/**
 * v: version.imagenes ({ huella, generado }). Si cambio, baja el mapa, lo deja
 * vigente y repinta. No lanza: un error se avisa en la consola y la proxima
 * revision vuelve a probar.
 */
export async function revisarImagenes(v) {
  if (!v?.huella || v.huella === huellaVista || revisando) return;
  // Cargadas despues de generarse: ya estan al dia
  if (!huellaVista && Date.parse(v.generado) < cargadasEn - MARGEN_MS) {
    huellaVista = v.huella;
    return;
  }
  revisando = true;
  try {
    await enTiempoMuerto();
    // La huella en la URL evita la copia vieja de la cache HTTP
    const r = await fetch(`./json/catalogo_imagenes.json?v=${encodeURIComponent(v.huella)}`);
    if (!r.ok) return;   // se vuelve a probar en la proxima revision
    const datos = await r.json();
    const mapa = datos?.images;
    if (!mapa || typeof mapa !== 'object') return;

    reemplazarImagenes(datos);
    huellaVista = v.huella;
    const cambiadas = repintarFotos(mapa);
    document.dispatchEvent(new CustomEvent('imagenes:actualizadas', { detail: { images: mapa } }));
    console.info(`[Fotos] catalogo_imagenes.json cambió: ${Object.keys(mapa).length} fotos, ` +
      `${cambiadas} tarjetas repintadas`);
  } catch (e) {
    console.warn('[Fotos] No se pudo actualizar el catálogo de imágenes:', e);
  } finally {
    revisando = false;
  }
}

document.addEventListener('version:leida', e => revisarImagenes(e.detail?.imagenes));
