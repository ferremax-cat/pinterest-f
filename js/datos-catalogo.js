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
 *
 * funcionalidades_usuarios.json (la lista de vendedores de la observacion de
 * entrega, js/observaciones.js) se lee distinto: siempre revalidando con el
 * servidor (no-cache, una respuesta 304 si no cambio) y, ademas de los datos,
 * devuelve cuanto difiere el reloj del dispositivo del de GitHub Pages
 * (encabezado Date). Vale 30 minutos: despues se vuelve a leer, asi un
 * vendedor nuevo aparece sin recargar la pagina.
 */

const RUTAS = {
  productos: './json/productos.json',
  imagenes: './json/catalogo_imagenes.json',
  usuarios: './json/funcionalidades_usuarios.json'
};

// Opciones de fetch por archivo: solo usuarios; los demas, como siempre (sin opciones)
const OPCIONES = { usuarios: { cache: 'no-cache' } };
// Cuanto vale una lectura que salio bien (sin entrada: toda la vida de la pagina)
const VIGENCIA_MS = { usuarios: 30 * 60 * 1000 };

const promesas = {};
const leidoEn = {};

// convertir: de la respuesta (ok) a lo que se guarda; por defecto, el JSON
function leer(nombre, convertir = r => r.json()) {
  const vence = VIGENCIA_MS[nombre];
  if (promesas[nombre] && vence && Date.now() - leidoEn[nombre] > vence) delete promesas[nombre];
  if (!promesas[nombre]) {
    const p = fetch(RUTAS[nombre], OPCIONES[nombre])
      .then(r => {
        if (!r.ok) throw new Error(`${RUTAS[nombre]}: HTTP ${r.status}`);
        return convertir(r);
      })
      .catch(e => {
        // Olvidar la descarga fallida, salvo que ya la hayan reemplazado
        if (promesas[nombre] === p) delete promesas[nombre];
        throw e;
      });
    promesas[nombre] = p;
    leidoEn[nombre] = Date.now();
  }
  return promesas[nombre];
}

/** productos.json: { CODIGO: { name, category, bulk, prices: { D, E, F } } } */
export const productos = () => leer('productos');

/** catalogo_imagenes.json completo: { version, lastUpdate, totalImages, images: { codigo: idDrive } } */
export const imagenes = () => leer('imagenes');

/**
 * funcionalidades_usuarios.json: { datos: { usuarios: { clave: { nombre, rol,
 * codigo } } }, desfaseMs }. desfaseMs: reloj del dispositivo menos hora del
 * servidor, medido al llegar la respuesta (null sin encabezado Date). Se mide
 * una vez: sigue valiendo despues, salvo que alguien cambie la hora del equipo
 */
export const usuarios = () => leer('usuarios', async r => {
  const datos = await r.json();
  const servidor = Date.parse(r.headers.get('Date') || '');
  return { datos, desfaseMs: Number.isNaN(servidor) ? null : Date.now() - servidor };
});

/** Deja vigente un productos.json ya descargado (lo usa frescura-precios.js) */
export function reemplazarProductos(datos) {
  promesas.productos = Promise.resolve(datos);
}

// Para revisar desde la consola
window.DatosCatalogo = { productos, imagenes, usuarios, reemplazarProductos };
