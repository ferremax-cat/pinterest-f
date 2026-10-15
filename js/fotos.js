/*
 * Fotos de productos: dirección de Google Drive con el ancho justo para la
 * tarjeta y carga diferida. La usan catalogo.html y js/search/search-engine.js.
 *
 * Las fotos originales son PNG de unos 600 x 600 px (algunas de 1000 o 1600).
 * Google las achica con el sufijo =wNNN; si se pide más que el original,
 * devuelve el original.
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
  // (catalogo.html): 2 hasta 576 px, 3 hasta 920, 4 hasta 1000 y 5 desde ahí
  const SIZES = '(max-width: 576px) 50vw, (max-width: 920px) 34vw, (max-width: 1000px) 25vw, 20vw';

  // Las primeras tarjetas se piden enseguida; las demás, cuando se acercan a la pantalla
  const INMEDIATAS = 10;

  function url(id, ancho) {
    return BASE + id + (ancho ? '=w' + ancho : '');
  }

  function srcset(id) {
    return ANCHOS.map(a => url(id, a) + ' ' + a + 'w').join(', ');
  }

  // orden: posición de la tarjeta (0, 1, ...). Sin orden, la foto es diferida
  function carga(orden) {
    return orden < INMEDIATAS ? 'eager' : 'lazy';
  }

  // Pone la foto en un <img> existente. "loading" y el reemplazo van antes que
  // la dirección: si se ponen después, el navegador ya empezó a pedirla
  function poner(img, id, orden) {
    img.loading = carga(orden);
    // Si la foto no carga, el reemplazo. Hay que quitar el srcset: si no, el
    // navegador sigue usándolo aunque cambie src
    img.onerror = () => {
      img.onerror = null;
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = SIN_FOTO;
    };
    img.sizes = SIZES;
    img.srcset = srcset(id);
    img.src = url(id, ANCHOS[ANCHOS.length - 1]);   // navegadores sin srcset
  }

  // Lo mismo como atributos, para tarjetas armadas con innerHTML (el reemplazo
  // por error va en el onerror de esa plantilla)
  function atributos(id, orden) {
    return 'loading="' + carga(orden) + '" sizes="' + SIZES + '" srcset="' + srcset(id) +
      '" src="' + url(id, ANCHOS[ANCHOS.length - 1]) + '"';
  }

  // Deja el <img> sin foto: una tarjeta clonada no tiene que heredar la de otra
  function quitar(img) {
    img.onerror = null;
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.src = '';
  }

  window.Fotos = { url, poner, atributos, quitar };
})();
