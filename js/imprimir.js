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

// Oficina imprime aunque no arme pedidos: no sirve Carrito.puedePedir()
const ROLES_IMPRESION = ['admin', 'vendedor_estandar', 'oficina'];

// Todas las fechas se arman y se muestran en hora de Argentina, sin
// importar la zona horaria de la computadora
const ZONA = 'America/Argentina/Buenos_Aires';

let modo = 'pendientes';
let pedidos = [];
const seleccion = new Set();

// Cada consulta lleva un numero: si el usuario cambia de pestaña antes de
// que llegue la respuesta, la vieja se descarta
let consultaActual = 0;

const $ = id => document.getElementById(id);

// ---------- formato ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtPesos(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  const f = new Date(iso);
  if (isNaN(f)) return '—';
  return f.toLocaleString('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
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

/** Unico lugar donde se leen los campos que manda el servidor. */
function aFila(p) {
  return {
    id: String(p.id),
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

async function consultar() {
  const n = ++consultaActual;

  pedidos = [];
  seleccion.clear();
  dibujar();

  const payload = {
    accion: 'pedidos_para_imprimir',
    token: sessionStorage.getItem('authToken'),
    modo
  };

  if (modo === 'impresos') {
    const desde = $('im-desde').value;
    const hasta = $('im-hasta').value;
    if (desde && hasta && desde > hasta) {
      mostrarEstado('La fecha "desde" es posterior a "hasta".');
      return;
    }
    if (desde) payload.desde = desde;
    if (hasta) payload.hasta = hasta;
  }

  mostrarEstado('Cargando...');

  let d;
  try {
    // La entrega de la respuesta puede demorar: 20 s por intento y 2 reintentos
    d = await window.Api.llamar(payload, 2, 20000);
  } catch (e) {
    if (n !== consultaActual) return;
    console.error('[Imprimir] Sin respuesta:', e);
    mostrarEstado('No se pudo conectar con el servidor. ' +
      '<button type="button" class="im-reintentar">Reintentar</button>');
    return;
  }

  if (n !== consultaActual) return;

  if (!d.ok) {
    if (d.error === 'token_invalido') {
      mostrarAviso('Tu sesión venció. Volvé a iniciar sesión.');
      return;
    }
    console.warn('[Imprimir] Error del servidor:', d.error);
    mostrarEstado('El servidor respondió con un error (' + esc(d.error) + '). ' +
      '<button type="button" class="im-reintentar">Reintentar</button>');
    return;
  }

  pedidos = (d.pedidos || []).map(aFila);
  dibujar();
  mostrarEstado(pedidos.length ? '' :
    modo === 'pendientes' ? 'No hay pedidos pendientes de imprimir.'
                          : 'No hay pedidos impresos en esas fechas.');
}

// ---------- tabla ----------

function dibujar() {
  const impresos = modo === 'impresos';

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

  $('im-tbody').innerHTML = pedidos.map(p => `
    <tr data-id="${esc(p.id)}">
      <td class="im-col-check"><input type="checkbox" class="im-check"></td>
      <td class="im-num c-numero">${esc(p.numero)}</td>
      <td class="c-fecha">${esc(p.fecha)}</td>
      <td class="im-num c-cuenta">${esc(p.cuenta)}</td>
      <td class="c-cliente">${esc(p.cliente)}</td>
      <td class="c-vendedor">${esc(p.vendedor)}</td>
      <td class="im-num c-lineas">${p.cantLineas}<span class="im-solo-cel"> ${p.cantLineas === 1 ? 'línea' : 'líneas'}</span></td>
      <td class="im-num c-total">${esc(p.totalNeto)}</td>
      ${impresos ? `<td class="c-impreso">${esc(p.fechaImpresion)}</td><td class="c-impreso-por">${esc(p.impresoPor)}</td>` : ''}
    </tr>`).join('');

  actualizarSeleccion();
}

function actualizarSeleccion() {
  document.querySelectorAll('#im-tbody tr').forEach(tr => {
    const marcado = seleccion.has(tr.dataset.id);
    tr.querySelector('.im-check').checked = marcado;
    tr.classList.toggle('seleccionado', marcado);
  });

  const n = seleccion.size;
  const todos = $('im-todos');
  todos.disabled = !pedidos.length;
  todos.checked = n > 0 && n === pedidos.length;
  todos.indeterminate = n > 0 && n < pedidos.length;

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
  document.querySelectorAll('.im-pestana').forEach(b => {
    b.classList.toggle('activa', b.dataset.modo === modo);
  });
  $('im-fechas').hidden = modo !== 'impresos';
  consultar();
}

function configurarEventos() {
  document.querySelectorAll('.im-pestana').forEach(b => {
    b.addEventListener('click', () => cambiarModo(b.dataset.modo));
  });

  $('im-desde').addEventListener('change', consultar);
  $('im-hasta').addEventListener('change', consultar);

  $('im-todos').addEventListener('change', e => {
    seleccion.clear();
    if (e.target.checked) pedidos.forEach(p => seleccion.add(p.id));
    actualizarSeleccion();
  });

  // Toda la fila marca la casilla, no solo el cuadradito
  $('im-tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) alternar(tr.dataset.id);
  });

  $('im-estado').addEventListener('click', e => {
    if (e.target.closest('.im-reintentar')) consultar();
  });

  $('im-imprimir').addEventListener('click', () => {
    // Las ids en el orden de la tabla, no en el orden en que se marcaron
    const ids = pedidos.map(p => p.id).filter(id => seleccion.has(id));
    console.log('[Imprimir] seleccionados:', ids);
  });
}

// ---------- inicio ----------

function iniciar() {
  const problema = problemaDeSesion();
  if (problema) {
    mostrarAviso(problema);
    return;
  }

  const rol = sessionStorage.getItem('authRol');
  const codigo = sessionStorage.getItem('authCodigo');
  $('im-usuario').textContent = codigo ? `${codigo} · ${rol}` : rol;

  // Por defecto, la ultima semana
  const hoy = hoyArgentina();
  $('im-hasta').value = hoy;
  $('im-desde').value = restarDias(hoy, 7);

  $('im-bandeja').hidden = false;
  configurarEventos();
  consultar();
}

iniciar();
