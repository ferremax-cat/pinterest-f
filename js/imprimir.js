/**
 * BANDEJA DE IMPRESION
 *
 * Lista los pedidos pendientes de imprimir y los ya impresos, para elegir
 * cuales imprimir. Por ahora solo arma la seleccion: las hojas impresas
 * vienen despues.
 *
 * Usa la sesion que dejo el login (authToken, authRol) y llama al
 * servidor con window.Api.llamar, igual que el catalogo.
 */

import { precargar, imprimir as imprimirHojas, confirmarExistentes, cargarClientes } from './imprimir-hojas.js';
import { pedirToken } from './sesion.js';

// Oficina imprime aunque no arme pedidos: no sirve Carrito.puedePedir()
const ROLES_IMPRESION = ['admin', 'vendedor_estandar', 'oficina'];

// Todas las fechas se arman y se muestran en hora de Argentina, sin
// importar la zona horaria de la computadora
const ZONA = 'America/Argentina/Buenos_Aires';

let modo = 'pendientes';
let pedidos = [];
const seleccion = new Set();

// Pendientes con un intento de impresion que nadie confirmo: van en un
// bloque aparte y no se pueden seleccionar
let sinConfirmar = [];

// Pedidos tal como llegan del servidor (id -> pedido): las hojas impresas
// necesitan las lineas y los totales, que la tabla no guarda
let crudos = new Map();

// Padron de clientes: llega en segundo plano. Mientras tanto se muestra el
// nombre del servidor, que puede venir cortado
let clientes = null;
const nombreDe = f => clientes?.[String(f.cuenta).trim()]?.name || f.cliente;

// Ultimo resultado de cada pestaña, solo en memoria: al volver a una pestaña
// se muestra enseguida y se actualiza en segundo plano. En Impresos vale
// solo para el mismo rango de fechas. Recargar la pagina empieza sin nada
const guardado = { pendientes: null, impresos: null };

// Ver pruebas (solo admin): el servidor devuelve otra lista, asi que viaja
// junto con el rango y lo guardado vale solo para la misma eleccion
let verPruebas = false;

// Estado de la actualizacion de cada pestaña: si se esta consultando (y si
// es en segundo plano), la hora de la ultima respuesta y si la ultima fallo
const sinc = {
  pendientes: { consultando: false, enFondo: false, hora: null, fallo: false },
  impresos: { consultando: false, enFondo: false, hora: null, fallo: false }
};

// Cada consulta lleva un numero por pestaña: de dos consultas de la misma
// pestaña vale solo la ultima. La de otra pestaña se guarda igual, aunque
// ya no se dibuje
const ultimaConsulta = { pendientes: 0, impresos: 0 };

// Al volver a la ventana se actualiza en segundo plano, salvo que la ultima
// respuesta sea de hace menos que esto (cambiar de ventana seguido no
// tiene que consultar cada vez)
const VOLVER_ACTUALIZA_MS = 60 * 1000;

// ---------- filtros ----------
// Busqueda por cliente o cuenta y vendedor, sobre los pedidos ya cargados.
// Cada pestaña tiene su propio filtro: uno puesto en Impresos no esconde
// nada en Pendientes. Al volver a una pestaña, su filtro esta como se lo
// dejo; se conservan al cambiar las fechas y al actualizar despues de
// imprimir. Viven solo en memoria: al recargar la pagina empiezan vacios
// (un filtro olvidado podria esconder pedidos pendientes). El bloque de
// impresion sin confirmar no se filtra
const ROLES_VER_TODOS = ['admin', 'oficina'];   // los mismos que en el servidor
const COLLATOR = new Intl.Collator('es', { numeric: true });

const filtros = {
  pendientes: { texto: '', vendedor: '' },
  impresos: { texto: '', vendedor: '' }
};

// El filtro de la pestaña actual: cambiarModo lo apunta al de la pestaña
// nueva. Todo el resto lee y escribe a traves de esta referencia
let filtro = filtros[modo];

// Mensaje de la ultima consulta (cargando, error o lista vacia); el de
// "ningun pedido coincide" se decide aparte, en pintarEstado
let estadoConsulta = '';

const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const veTodos = () => ROLES_VER_TODOS.includes(sessionStorage.getItem('authRol') || '');
const estaActivo = f => !!(f.texto.trim() || f.vendedor);
const filtroActivo = () => estaActivo(filtro);

/** La cuenta empieza con lo escrito o el nombre completo lo contiene, sin mayusculas ni acentos */
function pasaFiltro(p) {
  if (filtro.vendedor && String(p.vendedor).trim() !== filtro.vendedor) return false;
  const q = sinAcentos(filtro.texto);
  if (!q) return true;
  return sinAcentos(p.cuenta).startsWith(q) || sinAcentos(nombreDe(p)).includes(q);
}

/** Pedidos de la tabla que deja ver el filtro */
const visibles = () => pedidos.filter(pasaFiltro);

function cambiarFiltro(cambios) {
  Object.assign(filtro, cambios);
  dibujar();
}

function limpiarFiltros() {
  cambiarFiltro({ texto: '', vendedor: '' });
}

const $ = id => document.getElementById(id);

// ---------- formato ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtPesos(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  const f = new Date(iso);
  if (isNaN(f)) return '—';
  // hourCycle h23: siempre 24 horas ("17:42"), nunca "05:42 p. m."
  return f.toLocaleString('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
}

/** Fecha de hoy en Argentina, como AAAA-MM-DD. */
function hoyArgentina() {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

/** Resta dias a una fecha AAAA-MM-DD sin pasar por la zona horaria local. */
function restarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

/** Fecha (dd/mm/aaaa) y hora (hh:mm) de Argentina, por separado. */
function fechaYHora(iso) {
  const f = iso ? new Date(iso) : null;
  if (!f || isNaN(f)) return { fecha: '—', hora: '—' };
  return {
    fecha: f.toLocaleDateString('es-AR',
      { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: f.toLocaleTimeString('es-AR',
      { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  };
}

/** Unico lugar donde se leen los campos que manda el servidor. */
function aFila(p) {
  const intento = fechaYHora(p.intentoImpresion);
  return {
    intento: !!p.intentoImpresion,
    intentoFecha: intento.fecha,
    intentoHora: intento.hora,
    intentoPor: String(p.intentoPor ?? '').trim(),
    id: String(p.id),
    prueba: p.prueba === true,
    numero: p.numero ?? '',
    fecha: fmtFechaHora(p.fecha),
    cuenta: p.cliente ?? '',
    cliente: p.nombreCliente ?? '',
    vendedor: p.vendedor ?? '',
    // lineas es la lista de articulos: la cantidad viene aparte
    cantLineas: Number(p.cantLineas) || 0,
    totalNeto: fmtPesos(p.totalNeto),
    fechaImpresion: fmtFechaHora(p.fechaImpresion),
    impresoPor: p.impresoPor || '—'
  };
}

// ---------- sesion ----------

function mostrarAviso(texto) {
  $('im-bandeja').hidden = true;
  $('im-aviso-texto').textContent = texto;
  $('im-aviso').hidden = false;
}

/** Devuelve el motivo por el que no se puede usar la bandeja, o null. */
function problemaDeSesion() {
  const token = sessionStorage.getItem('authToken');
  const vence = Number(sessionStorage.getItem('authVence')) || 0;

  if (!token || sessionStorage.getItem('authDegradado') === '1' || vence < Date.now()) {
    return 'No hay una sesión activa. Iniciá sesión para ver la bandeja de impresión.';
  }
  if (!ROLES_IMPRESION.includes(sessionStorage.getItem('authRol') || '')) {
    return 'Tu usuario no tiene permiso para ver la bandeja de impresión.';
  }
  return null;
}

// ---------- consulta ----------

function mostrarEstado(html) {
  const est = $('im-estado');
  est.innerHTML = html;
  est.hidden = !html;
}

/** Mensaje de la consulta: se guarda y se combina con el de los filtros */
function fijarEstado(html) {
  estadoConsulta = html;
  pintarEstado();
}

function pintarEstado() {
  const sinCoincidencias = pedidos.length > 0 && filtroActivo() && !visibles().length;
  mostrarEstado(sinCoincidencias
    ? 'Ningún pedido coincide con el filtro. ' +
      '<button type="button" class="im-limpiar-filtros">Limpiar filtros</button>'
    : estadoConsulta);
}

/** Rango de fechas de la pestaña actual (vacio en Pendientes) */
function rangoActual() {
  return modo === 'impresos'
    ? { desde: $('im-desde').value, hasta: $('im-hasta').value, pruebas: verPruebas }
    : { desde: '', hasta: '', pruebas: verPruebas };
}

const mismoRango = (a, b) => a.desde === b.desde && a.hasta === b.hasta && a.pruebas === b.pruebas;

/** Mensaje cuando la consulta no trajo pedidos para la tabla */
function mensajeLista() {
  return pedidos.length ? '' :
    sinConfirmar.length ? 'No hay otros pedidos para imprimir.' :
    modo === 'pendientes' ? 'No hay pedidos pendientes de imprimir.'
                          : 'No hay pedidos impresos en esas fechas.';
}

/**
 * Pone a la vista un resultado (recien llegado o guardado). dibujar conserva
 * de la seleccion solo lo que sigue existiendo y esta a la vista, con el
 * filtro de la pestaña
 */
function aplicarResultado(r) {
  pedidos = r.pedidos;
  sinConfirmar = r.sinConfirmar;
  crudos = r.crudos;
  estadoConsulta = mensajeLista();
  dibujar();
}

/** "Actualizando…", "Actualizado a las hh:mm" o el aviso de falla, de la pestaña actual */
function pintarSinc() {
  const s = sinc[modo];
  const texto = $('im-sinc-texto');
  const btn = $('im-actualizar');
  const hora = s.hora ? fechaYHora(s.hora.toISOString()).hora : '';
  btn.disabled = s.consultando;
  btn.textContent = s.fallo && !s.consultando ? 'Reintentar' : 'Actualizar';
  texto.classList.toggle('im-sinc-fallo', s.fallo && !s.consultando);
  // En la primera carga ya se ve "Cargando..." en la tabla: aca, nada
  texto.textContent = s.consultando ? (s.enFondo ? 'Actualizando…' : '')
    : s.fallo ? (hora ? `No se pudo actualizar · datos de las ${hora}` : 'No se pudo actualizar')
    : hora ? `Actualizado a las ${hora}` : '';
}

/** Falla de una consulta: con una lista a la vista se mantiene y se avisa discreto */
function falloConsulta(pestana, enFondo, texto) {
  sinc[pestana].consultando = false;
  sinc[pestana].fallo = true;
  if (modo === pestana && !enFondo) {
    fijarEstado(texto + ' <button type="button" class="im-reintentar">Reintentar</button>');
  }
  pintarSinc();
}

/**
 * Consulta los pedidos de la pestaña actual.
 * enFondo: la lista que se ve queda mientras llega la respuesta (al volver a
 * una pestaña ya cargada, al volver a la ventana o con Actualizar); si falla,
 * se sigue viendo lo anterior con un aviso discreto. Sin enFondo, la lista
 * se vacia y se espera (primera carga, otras fechas, despues de imprimir).
 * La respuesta se guarda para su pestaña aunque ya se haya cambiado de
 * pestaña, pero solo se dibuja si sigue siendo la pestaña y el rango actual.
 */
async function consultar({ enFondo = false } = {}) {
  const pestana = modo;
  const n = ++ultimaConsulta[pestana];
  const rango = rangoActual();

  if (!enFondo) {
    pedidos = [];
    sinConfirmar = [];
    crudos = new Map();
    seleccion.clear();
    dibujar();
  }

  const payload = {
    accion: 'pedidos_para_imprimir',
    token: sessionStorage.getItem('authToken'),
    modo: pestana
  };

  if (pestana === 'impresos') {
    if (rango.desde && rango.hasta && rango.desde > rango.hasta) {
      sinc[pestana].consultando = false;
      pintarSinc();
      fijarEstado('La fecha "desde" es posterior a "hasta".');
      return;
    }
    if (rango.desde) payload.desde = rango.desde;
    if (rango.hasta) payload.hasta = rango.hasta;
  }
  if (rango.pruebas) payload.verPruebas = true;

  Object.assign(sinc[pestana], { consultando: true, enFondo, fallo: false });
  pintarSinc();
  if (!enFondo) fijarEstado('Cargando...');

  // De dos consultas de la misma pestaña, vale la ultima
  const vigente = () => n === ultimaConsulta[pestana];

  let d;
  try {
    // La entrega de la respuesta puede demorar: 20 s por intento y 2 reintentos
    d = await window.Api.llamar(payload, 2, 20000);
  } catch (e) {
    if (!vigente()) return;
    console.error('[Imprimir] Sin respuesta:', e);
    falloConsulta(pestana, enFondo, 'No se pudo conectar con el servidor.');
    return;
  }

  if (!vigente()) return;

  if (!d.ok) {
    if (d.error === 'token_invalido') {
      mostrarAviso('Tu sesión venció. Volvé a iniciar sesión.');
      return;
    }
    console.warn('[Imprimir] Error del servidor:', d.error);
    falloConsulta(pestana, enFondo, 'El servidor respondió con un error (' + esc(d.error) + ').');
    return;
  }

  // Un servidor sin esta opcion la ignora y devolveria los pedidos reales:
  // nunca mostrarlos como si fueran de prueba
  if (rango.pruebas && d.verPruebas !== true) {
    falloConsulta(pestana, enFondo, 'El servidor todavía no tiene la opción de pedidos de prueba.');
    return;
  }

  const filas = (d.pedidos || []).map(aFila);
  // En Pendientes, los de impresion sin confirmar van aparte
  const resultado = {
    pedidos: pestana === 'pendientes' ? filas.filter(f => !f.intento) : filas,
    sinConfirmar: pestana === 'pendientes' ? filas.filter(f => f.intento) : [],
    crudos: new Map((d.pedidos || []).map(p => [String(p.id), p])),
    rango
  };
  guardado[pestana] = resultado;
  Object.assign(sinc[pestana], { consultando: false, hora: new Date(), fallo: false });

  // Fotos y productos en segundo plano: no se espera
  if (pestana === 'pendientes') precargar(d.pedidos || []);

  // Solo si sigue siendo la pestaña y el rango de esta consulta
  if (modo === pestana && mismoRango(rangoActual(), rango)) aplicarResultado(resultado);
  pintarSinc();
}

/**
 * Despues de imprimir o confirmar desde Pendientes: lo guardado de Impresos
 * queda viejo (le faltan los recien impresos), asi que se descarta y la
 * proxima vez que se entre se espera la lista nueva. Pendientes se vacia y
 * se espera, para que los recien marcados desaparezcan enseguida
 */
function despuesDeImprimir() {
  guardado.impresos = null;
  consultar();
}

// ---------- tabla ----------

function dibujar() {
  const impresos = modo === 'impresos';
  const lista = visibles();

  // Lo que el filtro oculta deja de estar seleccionado: nunca se imprime
  // algo que no esta a la vista
  const aLaVista = new Set(lista.map(p => p.id));
  [...seleccion].forEach(id => { if (!aLaVista.has(id)) seleccion.delete(id); });

  // Las clases c-* ubican cada celda en la tarjeta del celular
  $('im-thead').innerHTML = `
    <tr>
      <th class="im-col-check"></th>
      <th class="im-num c-numero">N°</th>
      <th class="c-fecha">Fecha</th>
      <th class="im-num c-cuenta">Cuenta</th>
      <th class="c-cliente">Cliente</th>
      <th class="c-vendedor">Vendedor</th>
      <th class="im-num c-lineas">Líneas</th>
      <th class="im-num c-total">Total neto</th>
      ${impresos ? '<th class="c-impreso">Impreso</th><th class="c-impreso-por">Impreso por</th>' : ''}
    </tr>`;

  $('im-tbody').innerHTML = lista.map(p => `
    <tr data-id="${esc(p.id)}"${p.prueba ? ' class="im-prueba"' : ''}>
      <td class="im-col-check"><input type="checkbox" class="im-check"></td>
      <td class="im-num c-numero">${esc(p.numero)}${p.prueba ? ' <span class="im-marca-prueba">PRUEBA</span>' : ''}</td>
      <td class="c-fecha">${esc(p.fecha)}</td>
      <td class="im-num c-cuenta">${esc(p.cuenta)}</td>
      <td class="c-cliente">${esc(nombreDe(p))}</td>
      <td class="c-vendedor">${esc(p.vendedor)}</td>
      <td class="im-num c-lineas">${p.cantLineas}<span class="im-solo-cel"> ${p.cantLineas === 1 ? 'línea' : 'líneas'}</span></td>
      <td class="im-num c-total">${esc(p.totalNeto)}</td>
      ${impresos ? `<td class="c-impreso">${esc(p.fechaImpresion)}</td><td class="c-impreso-por">${esc(p.impresoPor)}</td>` : ''}
    </tr>`).join('');

  dibujarSinConfirmar();
  dibujarTitulo(lista.length);
  dibujarFiltros(lista.length);
  actualizarSeleccion();
  pintarEstado();
}

/**
 * Titulo de la lista: con impresion sin confirmar (separa la lista del
 * bloque) o con un filtro activo, con la proporcion: "Para imprimir (3 de 9)"
 */
function dibujarTitulo(nVisibles) {
  const titulo = $('im-titulo-lista');
  const mostrar = sinConfirmar.length > 0 || (filtroActivo() && pedidos.length > 0);
  titulo.hidden = !mostrar;
  if (!mostrar) return;
  const nombre = modo === 'impresos' ? 'Impresos' : 'Para imprimir';
  titulo.textContent = filtroActivo()
    ? `${nombre} (${nVisibles} de ${pedidos.length})`
    : `${nombre} (${pedidos.length})`;
}

/** Filtros a la vista: borde rojo si estan en uso, Limpiar, contador y vendedores */
function dibujarFiltros(nVisibles) {
  const buscar = $('im-buscar');
  // Solo si cambio (por ejemplo, al limpiar): reescribirlo moveria el cursor
  if (buscar.value !== filtro.texto) buscar.value = filtro.texto;
  buscar.classList.toggle('im-filtro-activo', !!filtro.texto.trim());
  $('im-buscar-borrar').hidden = !filtro.texto;

  const sel = $('im-vendedor');
  sel.hidden = !veTodos();
  if (veTodos()) {
    // Los vendedores de la lista, ordenados; el elegido queda aunque en esta
    // pestaña no tenga pedidos, para que se vea por que la lista esta vacia
    const vendedores = [...new Set(pedidos.map(p => String(p.vendedor).trim()).filter(Boolean))];
    if (filtro.vendedor && !vendedores.includes(filtro.vendedor)) vendedores.push(filtro.vendedor);
    vendedores.sort(COLLATOR.compare);
    const opciones = vendedores.join('|');
    if (sel.dataset.opciones !== opciones) {
      sel.dataset.opciones = opciones;
      sel.innerHTML = '<option value="">Todos los vendedores</option>' +
        vendedores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    }
    sel.value = filtro.vendedor;
    sel.classList.toggle('im-filtro-activo', !!filtro.vendedor);
  }

  // Punto rojo en cada pestaña con un filtro activo: al pasar a la otra, se
  // sigue viendo que la anterior quedo filtrada
  document.querySelectorAll('.im-pestana').forEach(b => {
    const activo = !!filtros[b.dataset.modo] && estaActivo(filtros[b.dataset.modo]);
    b.classList.toggle('con-filtro', activo);
    b.title = activo ? 'Esta pestaña tiene un filtro activo' : '';
  });

  $('im-limpiar').hidden = !filtroActivo();
  const cont = $('im-filtro-cont');
  cont.hidden = !filtroActivo() || !pedidos.length;
  cont.textContent = `Mostrando ${nVisibles} de ${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'}`;
}

const SVG_ADVERTENCIA = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
</svg>`;

/** Bloque "Impresion sin confirmar", arriba de la lista de Pendientes. */
function dibujarSinConfirmar() {
  const bloque = $('im-sinconf');
  const hay = sinConfirmar.length > 0;

  // No se filtra: un pedido en duda tiene que estar siempre a la vista
  bloque.hidden = !hay;
  if (!hay) {
    bloque.innerHTML = '';
    return;
  }

  const tarjetas = sinConfirmar.map(p => `
    <div class="im-sc-tarjeta" data-id="${esc(p.id)}">
      <div class="im-sc-info">
        <p class="im-sc-datos">
          <b class="im-sc-numero">N° ${esc(p.numero)}</b>
          <span class="im-sc-cliente">${esc(nombreDe(p))}</span>
          <span class="im-sc-meta">Cuenta ${esc(p.cuenta)} · Vendedor ${esc(p.vendedor)} ·
            ${p.cantLineas} ${p.cantLineas === 1 ? 'línea' : 'líneas'}</span>
        </p>
        <p class="im-sc-intento">Se mandó a imprimir el ${esc(p.intentoFecha)} a las ${esc(p.intentoHora)}${
          p.intentoPor ? ` (${esc(p.intentoPor)})` : ''}. No se confirmó si salió.</p>
      </div>
      <div class="im-sc-botones">
        <button type="button" class="im-sc-existen">Las hojas existen</button>
        <button type="button" class="im-sc-imprimir">Imprimir de nuevo</button>
      </div>
    </div>`).join('');

  bloque.innerHTML = `
    <div class="im-sc-cab">${SVG_ADVERTENCIA}<h2>Impresión sin confirmar (${sinConfirmar.length})</h2></div>
    <p class="im-sc-texto">Estos pedidos se mandaron a imprimir, pero nadie confirmó si las hojas salieron.
      Preguntá en el depósito si las hojas existen.</p>
    <div class="im-sc-lista">${tarjetas}</div>`;
}

function actualizarSeleccion() {
  document.querySelectorAll('#im-tbody tr').forEach(tr => {
    const marcado = seleccion.has(tr.dataset.id);
    tr.querySelector('.im-check').checked = marcado;
    tr.classList.toggle('seleccionado', marcado);
  });

  // La seleccion es siempre de pedidos visibles: dibujar quita los ocultos
  const nVisibles = visibles().length;
  const n = seleccion.size;
  const todos = $('im-todos');
  todos.disabled = !nVisibles;
  todos.checked = n > 0 && n === nVisibles;
  todos.indeterminate = n > 0 && n < nVisibles;

  $('im-contador').textContent = n === 1 ? '1 seleccionado' : `${n} seleccionados`;
  $('im-imprimir').disabled = n === 0;
}

function alternar(id) {
  if (seleccion.has(id)) seleccion.delete(id);
  else seleccion.add(id);
  actualizarSeleccion();
}

// ---------- eventos ----------

function cambiarModo(nuevo) {
  if (nuevo === modo) return;
  modo = nuevo;
  // Cada pestaña con su filtro: el campo, el selector, los bordes, Limpiar,
  // el contador y el titulo pasan a mostrar el de esta pestaña
  filtro = filtros[modo];
  document.querySelectorAll('.im-pestana').forEach(b => {
    b.classList.toggle('activa', b.dataset.modo === modo);
  });
  $('im-fechas').hidden = modo !== 'impresos';
  $('im-imprimir').textContent = modo === 'impresos' ? 'Reimprimir seleccionados' : 'Imprimir seleccionados';

  // Al cambiar de pestaña la seleccion se vacia, como siempre
  seleccion.clear();

  // Lo ultimo que se cargo, al instante (en Impresos, si es el mismo rango),
  // y la actualizacion en segundo plano; sin nada guardado, se espera
  const g = guardado[modo];
  if (g && mismoRango(g.rango, rangoActual())) {
    aplicarResultado(g);
    consultar({ enFondo: true });
  } else {
    consultar();
  }
}

/**
 * Al volver a la ventana (otra pestaña del navegador u otra aplicacion), se
 * actualiza en segundo plano lo que se ve, salvo que ya se este consultando
 * o la ultima respuesta sea muy reciente
 */
function alVolverALaVentana() {
  if (document.hidden || $('im-bandeja').hidden) return;
  const s = sinc[modo];
  if (s.consultando) return;
  if (s.hora && Date.now() - s.hora.getTime() < VOLVER_ACTUALIZA_MS) return;
  consultar({ enFondo: pedidos.length > 0 || sinConfirmar.length > 0 });
}

function configurarEventos() {
  document.querySelectorAll('.im-pestana').forEach(b => {
    b.addEventListener('click', () => cambiarModo(b.dataset.modo));
  });

  // Otro rango: lo guardado no sirve, se vacia y se espera
  $('im-desde').addEventListener('change', () => consultar());
  $('im-hasta').addEventListener('change', () => consultar());

  // Forzar la consulta: en segundo plano si hay algo a la vista
  $('im-actualizar').addEventListener('click', () =>
    consultar({ enFondo: pedidos.length > 0 || sinConfirmar.length > 0 }));

  document.addEventListener('visibilitychange', alVolverALaVentana);

  // Solo los pedidos visibles
  $('im-todos').addEventListener('change', e => {
    seleccion.clear();
    if (e.target.checked) visibles().forEach(p => seleccion.add(p.id));
    actualizarSeleccion();
  });

  $('im-buscar').addEventListener('input', e => cambiarFiltro({ texto: e.target.value }));
  $('im-buscar').addEventListener('keydown', e => {
    if (e.key === 'Escape' && filtro.texto) cambiarFiltro({ texto: '' });
  });
  $('im-buscar-borrar').addEventListener('click', () => {
    cambiarFiltro({ texto: '' });
    $('im-buscar').focus();
  });
  $('im-vendedor').addEventListener('change', e => cambiarFiltro({ vendedor: e.target.value }));
  $('im-limpiar').addEventListener('click', limpiarFiltros);

  // Otra lista del servidor: la seleccion y lo guardado no sirven, se vacia y se espera
  $('im-ver-pruebas').addEventListener('change', e => {
    verPruebas = e.target.checked;
    $('im-aviso-pruebas').hidden = !verPruebas;
    consultar();
  });

  // Toda la fila marca la casilla, no solo el cuadradito
  $('im-tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) alternar(tr.dataset.id);
  });

  $('im-sinconf').addEventListener('click', e => {
    const btn = e.target.closest('button');
    const crudo = crudos.get(btn?.closest('[data-id]')?.dataset.id);
    if (!crudo) return;

    // Los dos pasan el pedido a Impresos
    const alTerminar = despuesDeImprimir;
    if (btn.classList.contains('im-sc-existen')) confirmarExistentes(crudo, { alTerminar });
    // Imprimir de nuevo reemplaza el intento anterior, aunque sea de otra persona
    else if (btn.classList.contains('im-sc-imprimir')) {
      imprimirHojas([crudo], { alTerminar, reemplazarIntento: true });
    }
  });

  $('im-estado').addEventListener('click', e => {
    if (e.target.closest('.im-reintentar')) consultar();
    else if (e.target.closest('.im-limpiar-filtros')) limpiarFiltros();
  });

  $('im-imprimir').addEventListener('click', () => {
    // Las ids en el orden de la tabla, no en el orden en que se marcaron, y
    // solo de los pedidos a la vista (resguardo: dibujar ya quita los ocultos)
    const ids = visibles().map(p => p.id).filter(id => seleccion.has(id));
    console.log('[Imprimir] seleccionados:', ids);
    const reimpresion = modo === 'impresos';
    imprimirHojas(ids.map(id => crudos.get(id)), {
      reimpresion,
      // Al terminar o cancelar, los marcados pasan a Impresos
      alTerminar: reimpresion ? null : despuesDeImprimir
    });
  });
}

// ---------- inicio ----------

async function iniciar() {
  // El personal entra sin esperar el token: si todavia no llego, se pide
  // aca. Sin token la bandeja no puede consultar nada, asi que se espera
  if (sessionStorage.getItem('authDegradado') === '1' && !sessionStorage.getItem('authToken')) {
    mostrarAviso('Conectando con el servidor…');
    if (!await pedirToken()) {
      mostrarAviso('No se pudo conectar con el servidor. Probá de nuevo en unos minutos.');
      return;
    }
    $('im-aviso').hidden = true;
  }

  const problema = problemaDeSesion();
  if (problema) {
    mostrarAviso(problema);
    return;
  }

  const rol = sessionStorage.getItem('authRol');
  const codigo = sessionStorage.getItem('authCodigo');
  $('im-usuario').textContent = codigo ? `${codigo} · ${rol}` : rol;

  // Ver pruebas: solo admin (el servidor lo ignora para los demas roles)
  $('im-pruebas').hidden = rol !== 'admin';

  // Por defecto, la ultima semana
  const hoy = hoyArgentina();
  $('im-hasta').value = hoy;
  $('im-desde').value = restarDias(hoy, 7);

  // Bloque de impresion sin confirmar y titulo de la lista: debajo de las
  // pestañas, arriba de todo
  const bloque = document.createElement('section');
  bloque.id = 'im-sinconf';
  bloque.className = 'im-sinconf';
  bloque.hidden = true;
  const titulo = document.createElement('h2');
  titulo.id = 'im-titulo-lista';
  titulo.className = 'im-titulo-lista';
  titulo.hidden = true;
  // Arriba de los filtros: el bloque sin confirmar no se filtra
  $('im-filtros').before(bloque, titulo);

  $('im-bandeja').hidden = false;
  configurarEventos();
  consultar();

  // Sin esperarlo: cuando llega, se redibuja con los nombres completos
  cargarClientes().then(c => {
    clientes = c;
    dibujar();
  });
}

iniciar();
