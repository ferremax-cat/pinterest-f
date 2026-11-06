/**
 * HABITUALES DEL CLIENTE ELEGIDO (solo vendedor y admin)
 *
 * Usa las dos listas que trae historial_cliente (js/historial-cliente.js), ya
 * armadas por scripts/historial_compras.py con 12 meses de compras:
 *  - habituales: hasta 10 articulos que compra seguido (3 compras o mas), con la
 *    cantidad que suele llevar y desde que fecha "le toca";
 *  - dejo: hasta 5 que compraba seguido y hace mas de 3 intervalos que no lleva
 *    (sin los de temporada fuera de su temporada). Solo informacion.
 * Muestra el icono "Habituales" en la barra del cliente (con un punto si hay
 * "dejo de comprar") con su lista, y arma la sugerencia "¿Se olvida algo?" del
 * carrito. No consulta al servidor: nombres y fotos salen de productos.json y
 * catalogo_imagenes.json, que la pagina ya descargo. Si el historial no llego,
 * no se muestra nada. Lo agregado desde aca queda marcado en la linea
 * (sugerido) y al confirmar va a origen_linea.
 */
import { productos, imagenes } from './datos-catalogo.js';
import { abrirHoja, esAncha } from './hoja.js';

const ROLES = ['admin', 'vendedor_estandar'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let listo = null;      // { cuenta, actualizado, habituales, dejo }, con nombre y foto
let turno = 0;         // descarta una preparacion vieja si cambio el cliente
let boton = null;      // icono de la barra
let abierto = null;    // lista abierta: { cuerpo, cerrar }
let todos = false;     // "Ver los 10"
// Celular: el bloque del carrito arranca plegado. Cuenta del cliente para el
// que el vendedor lo desplego (solo en memoria; al cambiar de cliente se pliega)
let desplegadoDe = null;
const angosta = () => window.matchMedia('(max-width: 600px)').matches;

// ---------- foco en el buscador de articulos ----------

const buscador = () => document.querySelector('nav input[type="text"]');

/** A la vista: ni el ni sus contenedores estan ocultos */
function visible(el) {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.hidden) return false;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  }
  return true;
}

/**
 * Despues de que el vendedor cierra la lista (o agrega desde el desplegable),
 * el cursor vuelve al buscador de articulos, listo para seguir cargando. No se
 * mueve si el buscador no esta a la vista o es el de clientes, si hay un panel
 * encima (carrito u hoja) o si el vendedor ya esta en otro campo. No borra ni
 * selecciona el texto, y no desplaza la pagina. Se llama dentro del toque: en
 * el iPhone, solo asi se abre el teclado.
 */
function enfocarBuscador() {
  const b = buscador();
  if (!b || b.disabled || document.body.classList.contains('modo-busqueda-clientes') || !visible(b)) return;
  if (document.getElementById('carrito-panel')?.style.display === 'flex' || document.querySelector('.hj-fondo')) return;
  const a = document.activeElement;
  if (a && a !== document.body && a !== b && a !== boton && !a.closest?.('.hab-desplegable')) return;
  try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
  // Si quedo texto seleccionado (por ejemplo, de antes), el cursor al final:
  // una tecla no reemplaza la busqueda
  try { if (b.selectionStart !== b.selectionEnd) b.setSelectionRange(b.value.length, b.value.length); } catch (e) {}
}

function puedeVer() {
  const rol = sessionStorage.getItem('authRol') || window.menuFuncionalidades?.usuarioActual?.rol || '';
  return ROLES.includes(rol);
}

function vigentes() {
  const cli = window.Precios?.getClienteVista();
  return listo && cli && String(cli.cuenta) === listo.cuenta && puedeVer() ? listo : null;
}

// ---------- fechas y textos ----------

const utc = iso => { const [a, m, d] = String(iso).split('-').map(Number); return Date.UTC(a, m - 1, d); };
function hoyUtc() { const h = new Date(); return Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()); }
const diasDesde = iso => Math.round((hoyUtc() - utc(iso)) / 864e5);
export const leToca = x => !!x.toca && hoyUtc() >= utc(x.toca);
export const cantidadSugerida = x => Math.max(1, Math.round(Number(x.tipica) || 1));

function hace(iso) {
  const n = diasDesde(iso);
  return n <= 0 ? 'hoy' : n === 1 ? 'hace 1 día' : `hace ${n} días`;
}
const marca = x => (leToca(x) ? '<span class="hab-toca">Le toca</span> · ' : '') + hace(x.ultima);
const fechaCorta = iso => { const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${String(a).slice(2)}`; };

/** La foto de la tarjeta si esta en pantalla; si no, la del catalogo de imagenes */
function fotoDe(x) {
  const img = document.querySelector(`.price-tag[data-sku="${CSS.escape(x.sku)}"]`)
    ?.closest('.container-img')?.querySelector('img');
  return img?.currentSrc || img?.src || x.foto || '';
}
const estiloFoto = x => { const f = fotoDe(x); return f ? ` style="background-image:url('${esc(f)}')"` : ''; };

// ---------- datos ----------

/**
 * Arma las listas del cliente elegido con nombre y foto. Con historial:listo y
 * con cliente:cambio: si es otro cliente, listas() da null y se oculta todo; si
 * es el mismo (el evento puede repetirse), se conservan.
 */
async function preparar() {
  const t = ++turno;
  const l = puedeVer() ? window.HistorialCliente?.listas() : null;
  if (!l || (!l.habituales.length && !l.dejo.length)) { listo = null; pintarIcono(); return; }

  let cat = {}, fotos = {};
  try { cat = await productos(); } catch (e) {}
  try { fotos = (await imagenes())?.images || {}; } catch (e) {}
  if (t !== turno) return;   // cambio el cliente mientras tanto

  // Los que ya no estan en el catalogo no se muestran
  const conDatos = x => {
    const p = cat[x.sku] || cat[x.sku.toUpperCase()];
    if (!p) return null;
    const id = fotos[x.sku] || fotos[x.sku.toUpperCase()] || fotos[x.sku.toLowerCase()];
    return { ...x, nombre: p.name || x.sku, foto: id ? `https://lh3.googleusercontent.com/d/${id}=w120` : '' };
  };
  listo = {
    cuenta: l.cuenta, actualizado: l.actualizado,
    habituales: l.habituales.map(conDatos).filter(Boolean),
    dejo: l.dejo.map(conDatos).filter(Boolean)
  };

  // En memoria, desde el productos.json ya descargado: al agregarlos tienen nombre y precio
  const faltan = listo.habituales.map(x => x.sku).filter(s => !window.productManager?.getProduct(s));
  if (faltan.length) window.productManagerInstance?.loadSpecificProducts(faltan)?.catch?.(() => {});

  pintarIcono();
  if (abierto) pintarLista();
  document.dispatchEvent(new CustomEvent('habituales:listo'));
}

/** Agrega un habitual con su cantidad tipica, marcado con su origen */
async function agregar(sku, origen) {
  const v = vigentes();
  const x = v?.habituales.find(h => h.sku === sku);
  if (!x) return;
  if (!window.productManager?.getProduct(sku)) {
    try { await window.productManagerInstance?.loadSpecificProducts([sku]); } catch (e) {}
  }
  if (vigentes()?.cuenta !== v.cuenta) return;   // cambio el cliente mientras tanto
  window.Carrito.agregar(sku, cantidadSugerida(x), undefined, { sugerido: origen });
}

// ---------- carrito ----------

/**
 * Hasta n habituales que no estan en el pedido ni en "dejo de comprar" (esos
 * casi nunca se compran ese dia: se muestran solo en la lista de la barra)
 */
export function sugerencias(enPedido, n = 3) {
  const v = vigentes();
  if (!v) return [];
  const ya = new Set([...enPedido, ...v.dejo.map(x => x.sku)].map(s => String(s).toUpperCase()));
  return v.habituales.filter(x => !ya.has(x.sku.toUpperCase())).slice(0, n);
}

/**
 * Bloque "¿Se olvida algo?" del panel del vendedor; '' si no hay nada que
 * sugerir. En el celular arranca plegado en una linea, y se despliega al tocarla
 */
export function htmlCarrito(enPedido) {
  const s = sugerencias(enPedido, 3);
  if (!s.length) return '';
  const plegable = angosta();
  const verFilas = !plegable || desplegadoDe === vigentes().cuenta;
  const cab = plegable
    ? `<button type="button" class="cp-sug-cab" aria-expanded="${verFilas}">
          <span>¿Se olvida algo? · ${s.length} ${s.length === 1 ? 'sugerencia' : 'sugerencias'}</span>
          <span class="cp-sug-flecha" aria-hidden="true">${verFilas ? '▴' : '▾'}</span>
        </button>`
    : '<p class="cp-sug-tit">¿Se olvida algo? Suele llevar:</p>';
  return `
      <div class="cp-sug${verFilas ? '' : ' cp-sug-plegado'}">
        ${cab}
        ${!verFilas ? '' : s.map(x => `
        <div class="cp-sug-fila">
          <div class="cp-sug-img"${estiloFoto(x)}></div>
          <div class="cp-sug-desc">
            <p class="cp-sug-nombre" title="${esc(x.nombre)}">${esc(x.nombre)}</p>
            <p class="cp-sug-meta">${x.veces} veces en el año · ${marca(x)}</p>
          </div>
          <button type="button" class="cp-sug-agregar" data-sku="${esc(x.sku)}"
            title="Agregar ${cantidadSugerida(x)}: la cantidad que suele llevar">+ ${cantidadSugerida(x)}</button>
        </div>`).join('')}
      </div>`;
}

export function conectarCarrito(cont) {
  const bloque = cont.querySelector('.cp-sug');
  if (!bloque) return;
  // Plegar o desplegar: se vuelve a armar solo el bloque, no el panel
  bloque.querySelector('.cp-sug-cab')?.addEventListener('click', () => {
    const v = vigentes();
    if (!v) return;
    desplegadoDe = desplegadoDe === v.cuenta ? null : v.cuenta;
    const padre = bloque.parentElement;
    bloque.insertAdjacentHTML('afterend', htmlCarrito((window.Carrito?.leer() || []).map(l => l.sku)));
    bloque.remove();
    conectarCarrito(padre);
    padre.querySelector('.cp-sug-cab')?.focus();
  });
  bloque.querySelectorAll('.cp-sug-agregar').forEach(b => b.addEventListener('click', () => {
    b.disabled = true;
    agregar(b.dataset.sku, 'habitual');   // carrito:cambio redibuja: entra el siguiente
  }));
}

// ---------- barra del cliente ----------

function crearIcono() {
  if (boton) return boton;
  const nombre = document.querySelector('#barra-salud-financiera .cliente-nombre');
  if (!nombre) return null;
  boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'hab-boton';
  boton.hidden = true;
  boton.setAttribute('aria-haspopup', 'dialog');
  boton.setAttribute('aria-expanded', 'false');
  boton.innerHTML = '<i class="fas fa-clipboard-list" aria-hidden="true"></i><span class="hab-punto" hidden></span>';
  boton.addEventListener('click', e => { e.stopPropagation(); abierto ? cerrarLista(true) : abrirLista(); });
  nombre.after(boton);
  return boton;
}

function pintarIcono() {
  const b = crearIcono();
  if (!b) return;
  const v = vigentes();
  b.hidden = !v || (!v.habituales.length && !v.dejo.length);
  b.querySelector('.hab-punto').hidden = !v?.dejo.length;
  const texto = v?.dejo.length ? 'Habituales (hay artículos que dejó de comprar)' : 'Habituales';
  b.title = texto;
  b.setAttribute('aria-label', texto);
  if (b.hidden) cerrarLista();
}

function htmlLista(v) {
  const enPedido = new Set((window.Carrito?.leer() || []).map(l => l.sku));
  const fila = (x, conBoton) => `
    <div class="hab-fila">
      <div class="hab-img"${estiloFoto(x)}></div>
      <div class="hab-desc">
        <p class="hab-nombre">${esc(x.nombre)}</p>
        <p class="hab-meta">${x.veces} veces en el año · ${conBoton ? marca(x) : 'última ' + hace(x.ultima)}</p>
      </div>
      ${!conBoton ? '' : enPedido.has(x.sku.toUpperCase())
        ? '<span class="hab-en">En el pedido</span>'
        : `<button type="button" class="hab-agregar" data-sku="${esc(x.sku)}"
             title="Agregar ${cantidadSugerida(x)}: la cantidad que suele llevar">+ ${cantidadSugerida(x)}</button>`}
    </div>`;
  const hab = todos ? v.habituales : v.habituales.slice(0, 3);
  return `
    ${v.habituales.length ? `
      <p class="hab-tit">Suele llevar</p>
      ${hab.map(x => fila(x, true)).join('')}
      ${!todos && v.habituales.length > 3 ? `<button type="button" class="hab-ver">Ver los ${v.habituales.length}</button>` : ''}` : ''}
    ${v.dejo.length ? `
      <p class="hab-tit">Dejó de comprar</p>
      <p class="hab-nota">Para preguntarle: hace más del triple de lo habitual que no lo lleva.</p>
      ${v.dejo.map(x => fila(x, false)).join('')}` : ''}
    <p class="hab-pie">Compras de los últimos 12 meses${v.actualizado ? ` · actualizado ${fechaCorta(v.actualizado)}` : ''}</p>`;
}

function pintarLista() {
  if (!abierto) return;
  const v = vigentes();
  if (!v) { cerrarLista(); return; }
  abierto.cuerpo.innerHTML = htmlLista(v);
  abierto.cuerpo.querySelector('.hab-ver')?.addEventListener('click', () => { todos = true; pintarLista(); });
  abierto.cuerpo.querySelectorAll('.hab-agregar').forEach(b => b.addEventListener('click', () => {
    b.disabled = true;
    const enDesplegable = !!abierto?.desplegable;
    agregar(b.dataset.sku, 'habitual_lista');   // carrito:cambio la vuelve a pintar
    // Computadora: el cursor al buscador y la lista sigue abierta. Celular: el
    // foco no se mueve (el teclado taparia la lista)
    if (enDesplegable) enfocarBuscador();
  }));
}

function abrirLista() {
  if (!vigentes() || !boton) return;
  todos = false;
  if (esAncha()) {
    // Computadora: desplegable debajo de la barra, alineado con el icono
    const caja = document.createElement('div');
    caja.className = 'hab-desplegable';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-label', 'Habituales del cliente');
    const barra = document.getElementById('barra-salud-financiera').getBoundingClientRect();
    caja.style.top = (barra.bottom + 4) + 'px';
    caja.style.left = Math.max(8, Math.min(boton.getBoundingClientRect().left, window.innerWidth - 396)) + 'px';
    document.body.appendChild(caja);
    const afuera = e => {
      if (caja.contains(e.target) || boton.contains(e.target)) return;
      cerrarLista();
      // El foco, en el clic de este mismo toque (sigue siendo del vendedor: en
      // una tablet abre el teclado). En pointerdown no sirve: el mousedown sobre
      // algo que no toma el foco lo vuelve a sacar. En burbuja: si lo tocado
      // abrio el carrito o tomo el foco, enfocarBuscador no lo roba. Sin clic
      // (arrastre o scroll), a los 700 ms
      const despues = () => {
        document.removeEventListener('click', despues);
        clearTimeout(espera);
        enfocarBuscador();
      };
      const espera = setTimeout(despues, 700);
      document.addEventListener('click', despues);
    };
    const tecla = e => { if (e.key === 'Escape') cerrarLista(true); };
    document.addEventListener('pointerdown', afuera, true);
    document.addEventListener('keydown', tecla);
    abierto = { cuerpo: caja, desplegable: true, cerrar: () => {
      document.removeEventListener('pointerdown', afuera, true);
      document.removeEventListener('keydown', tecla);
      caja.remove();
    } };
  } else {
    // Celular: la hoja aparte que ya usan las observaciones
    const nombre = window.Precios?.getClienteVista()?.nombre || '';
    const h = abrirHoja({ titulo: nombre ? `Habituales · ${nombre}` : 'Habituales',
      alCerrar: () => {
        // La cerro la hoja misma (flecha de volver o Escape): fue el vendedor.
        // Si la cerro cerrarLista, abierto ya esta en null y decide ella
        const delVendedor = abierto !== null;
        abierto = null;
        boton?.setAttribute('aria-expanded', 'false');
        if (delVendedor) enfocarBuscador();
      } });
    h.cuerpo.classList.add('hab-en-hoja');
    abierto = { cuerpo: h.cuerpo, cerrar: h.cerrar };
  }
  boton.setAttribute('aria-expanded', 'true');
  pintarLista();
}

/**
 * delVendedor: la cerro el vendedor (icono, Escape): el foco va al buscador.
 * Sin el (cambio de cliente, carrito abierto, sin listas), el foco no se mueve
 */
function cerrarLista(delVendedor = false) {
  const a = abierto;
  if (!a) return;
  abierto = null;
  a.cerrar();
  boton?.setAttribute('aria-expanded', 'false');
  if (delVendedor) enfocarBuscador();
}

// ---------- enganche ----------

document.addEventListener('historial:listo', preparar);
document.addEventListener('cliente:cambio', () => {
  // Otro cliente: el bloque del carrito vuelve a plegado
  if (desplegadoDe !== String(window.Precios?.getClienteVista()?.cuenta ?? '')) desplegadoDe = null;
  preparar();
});
document.addEventListener('carrito:cambio', () => { if (abierto) pintarLista(); });
document.addEventListener('carrito:abrir', () => cerrarLista());
preparar();
