/**
 * DATOS DEL CATALOGO, COMPARTIDOS
 *
 * productos.json (unos 2 MB) y catalogo_imagenes.json (366 KB) se descargan
 * una sola vez por pagina y quedan en memoria para todos los que los usan:
 * ProductManager (carga inicial y loadSpecificProducts: busqueda, carrito,
 * promos, revision), la galeria y el scroll de catalogo.html y el carrito.
 * Si varios los piden a la vez, comparten la misma descarga. Si una descarga
 * falla no queda guardada: el proximo pedido vuelve a intentar.
 *
 * Cuando frescura-precios.js detecta un productos.json nuevo, lo descarga
 * una vez y lo deja aca con reemplazarProductos: lo que se cargue despues
 * (busqueda, carrito, promos) usa los precios nuevos.
 */

const RUTAS = {
  productos: './json/productos.json',
  imagenes: './json/catalogo_imagenes.json'
};

const promesas = {};

function leer(nombre) {
  if (!promesas[nombre]) {
    const p = fetch(RUTAS[nombre])
      .then(r => {
        if (!r.ok) throw new Error(`${RUTAS[nombre]}: HTTP ${r.status}`);
        return r.json();
      })
      .catch(e => {
        // Olvidar la descarga fallida, salvo que ya la hayan reemplazado
        if (promesas[nombre] === p) delete promesas[nombre];
        throw e;
      });
    promesas[nombre] = p;
  }
  return promesas[nombre];
}

/** productos.json: { CODIGO: { name, category, bulk, prices: { D, E, F } } } */
export const productos = () => leer('productos');

/** catalogo_imagenes.json completo: { version, lastUpdate, totalImages, images: { codigo: idDrive } } */
export const imagenes = () => leer('imagenes');

/** Deja vigente un productos.json ya descargado (lo usa frescura-precios.js) */
export function reemplazarProductos(datos) {
  promesas.productos = Promise.resolve(datos);
}

// Para revisar desde la consola
window.DatosCatalogo = { productos, imagenes, reemplazarProductos };
