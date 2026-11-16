/**
 * AVISO DE CAMBIOS EN EL PEDIDO
 *
 * Aviso flotante comun para cuando algo cambia el precio de las lineas del
 * pedido con la pagina abierta: los precios nuevos (frescura-precios.js), las
 * promociones nuevas (promociones.js) o un tramo otorgado que dejo de existir.
 * Se toma una foto de los precios antes del cambio (preciosDelPedido) y se
 * compara despues: solo se avisa si cambio el precio de alguna linea del
 * pedido en vista. Si no hay nada cargado o no cambio, queda en silencio.
 */

const AVISO_MS = 5000;

/** sku -> precio de las lineas del pedido en vista (Carrito.detalle), o un mapa vacio */
export function preciosDelPedido() {
  try {
    return new Map((window.Carrito?.detalle() || []).map(l => [l.sku, l.precio]));
  } catch (e) {
    return new Map();
  }
}

/** Mismo estilo que los avisos flotantes de la app, en gris informativo */
export function avisoFlotante(texto) {
  const av = document.createElement('div');
  av.className = 'aviso-precios';
  av.textContent = texto;
  av.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:80px;background:#333;color:#fff;padding:12px 18px;' +
      'border-radius:8px;font-size:13px;z-index:99999;text-align:center;' +
      'max-width:90vw;box-shadow:0 4px 14px rgba(0,0,0,.3)';
  document.querySelectorAll('.aviso-precios').forEach(a => a.remove());
  document.body.appendChild(av);
  setTimeout(() => av.remove(), AVISO_MS);
}

/**
 * Avisa si cambio el precio de alguna linea del pedido (comparando con la foto
 * "antes") o si hubo tramos otorgados que dejaron de existir.
 * que: 'los precios' o 'las promociones'. Devuelve el texto avisado, o ''.
 */
export function avisarCambiosDelPedido(antes, que, tramosQuitados = 0) {
  const despues = preciosDelPedido();
  let n = 0;
  despues.forEach((precio, sku) => {
    if (antes.has(sku) && Number(antes.get(sku)) !== Number(precio)) n++;
  });
  if (!n && !tramosQuitados) return '';

  const partes = [];
  if (n) {
    partes.push(n === 1
      ? `Se actualizaron ${que}: 1 artículo de tu pedido cambió de precio.`
      : `Se actualizaron ${que}: ${n} artículos de tu pedido cambiaron de precio.`);
  }
  if (tramosQuitados) {
    partes.push(tramosQuitados === 1
      ? '1 tramo otorgado ya no existe: volvió al precio por cantidad.'
      : `${tramosQuitados} tramos otorgados ya no existen: volvieron al precio por cantidad.`);
  }
  const texto = partes.join(' ');
  avisoFlotante(texto);
  return texto;
}
