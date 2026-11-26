/*
 * Fotos de productos: dirección de Google Drive con el ancho justo para la
 * tarjeta y carga diferida. La usan catalogo.html y js/search/search-engine.js.
 *
 * Las fotos originales son PNG de unos 600 x 600 px (algunas de 1000 o 1600).
 * Google las achica con el sufijo =wNNN; si se pide más que el original,
 * devuelve el original. Con -rw (=w240-rw) las manda en WebP, más livianas.
 *
 * Fotos.url(id, 120) sirve también para las miniaturas (carrito, habituales,
 * observaciones): mismo criterio de WebP.
 */
(function () {
  const BASE = 'https://lh3.googleusercontent.com/d/';

  // Reemplazo para productos sin foto o fotos que no cargan
  const SIN_FOTO = 'img/no-img.png';

  // Anchos que se ofrecen; el navegador elige según el ancho de la tarjeta y la
  // densidad de la pantalla. 480 alcanza para un celular de densidad 3 con
  // 2 columnas (tarjetas de unos 170-195 px)
  const ANCHOS = [240, 360, 480];

  // Ancho de la tarjeta según las columnas de positionPinterestLayout
  // (catalogo.html): 2 hasta 576 px, 3 hasta 920, 4 hasta 1000 y 5 desde ahí.
  // EL 240px DEL FINAL: con la ventana de más de 1260 px la galería deja de
  // crecer, porque .gallery-container tiene max-width: 1260px (estilos-copia.css,
  // con box-sizing: border-box). Ahí la tarjeta mide 1260 / 5 columnas - 20 de
  // separación = 232 px, y 240 es el tope redondeado para arriba (nunca corto:
  // borroso). Depende de ese max-width, de las 5 columnas y de la separación de
  // 20 px de positionPinterestLayout: si cambia alguno, rehacer la cuenta.
  // test/pedidos/prueba_fotos.mjs falla si cambian sin tocar este valor
  const SIZES = '(max-width: 576px) 50vw, (max-width: 920px) 34vw, (max-width: 1000px) 25vw, ' +
    '(max-width: 1260px) 20vw, 240px';

  // Las primeras tarjetas se piden enseguida; las demás, cuando se acercan a la pantalla
  const INMEDIATAS = 10;

  // WebP (-rw): unos 25 % menos de datos. Solo si el navegador lo decodifica
  // (Safari recién desde fines de 2020): se prueba UNA vez al cargar, con una
  // imagen WebP de 1 x 1 incrustada. Mientras la prueba no termina, o si falla,
  // las direcciones salen como siempre, sin -rw. No se guarda: un iPhone que
  // se actualiza gana WebP en la carga siguiente
  let webp = false;
  try {
    const prueba = new Image();
    prueba.onload = () => { webp = prueba.width === 1; };
    prueba.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  } catch (e) { /* sin Image: sin WebP */ }

  // sinWebp: la dirección de siempre, aunque el navegador soporte WebP (reintento)
  function url(id, ancho, sinWebp) {
    return BASE + id + (ancho ? '=w' + ancho + (webp && !sinWebp ? '-rw' : '') : '');
  }

  function srcset(id, sinWebp) {
    return ANCHOS.map(a => url(id, a, sinWebp) + ' ' + a + 'w').join(', ');
  }

  // Si la foto no carga: si se pidió en WebP, un reintento sin -rw; si no (o
  // si el reintento también falla), el reemplazo. Hay que quitar el srcset:
  // si no, el navegador sigue usándolo aunque cambie src
  function fallo(img) {
    const id = img.dataset.fotoId;
    const pedida = (img.getAttribute('srcset') || '') + ' ' + (img.getAttribute('src') || '');
    if (id && !img.dataset.fotoSinWebp && pedida.includes('-rw')) {
      img.dataset.fotoSinWebp = '1';
      img.srcset = srcset(id, true);
      img.src = url(id, ANCHOS[ANCHOS.length - 1], true);
      return;
    }
    img.onerror = null;
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = SIN_FOTO;
  }

  // orden: posición de la tarjeta (0, 1, ...). Sin orden, la foto es diferida
  function carga(orden) {
    return orden < INMEDIATAS ? 'eager' : 'lazy';
  }

  // Pone la foto en un <img> existente. "loading" y el reemplazo van antes que
  // la dirección: si se ponen después, el navegador ya empezó a pedirla
  function poner(img, id, orden) {
    img.loading = carga(orden);
    img.dataset.fotoId = id;
    delete img.dataset.fotoSinWebp;
    img.onerror = () => fallo(img);
    img.sizes = SIZES;
    img.srcset = srcset(id);
    img.src = url(id, ANCHOS[ANCHOS.length - 1]);   // navegadores sin srcset
  }

  // Lo mismo como atributos, para tarjetas armadas con innerHTML (esa
  // plantilla pone onerror="window.Fotos.fallo(this)")
  function atributos(id, orden) {
    return 'loading="' + carga(orden) + '" data-foto-id="' + id + '" sizes="' + SIZES +
      '" srcset="' + srcset(id) + '" src="' + url(id, ANCHOS[ANCHOS.length - 1]) + '"';
  }

  // Deja el <img> sin foto: una tarjeta clonada no tiene que heredar la de otra
  function quitar(img) {
    img.onerror = null;
    delete img.dataset.fotoId;
    delete img.dataset.fotoSinWebp;
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = '';
  }

  window.Fotos = { url, poner, atributos, quitar, fallo };
})();
