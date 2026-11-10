/**
 * CLIENTE NUEVO (solo vendedor y admin)
 *
 * Para cargar el pedido de una ferreteria que todavia no es cliente, el
 * vendedor elige su cuenta puente (CUENTAS_ALTA en js/config.js; por ejemplo
 * 157 "NUEVO CLIENTE RF"). Antes de mostrar precios se piden los datos del
 * comercio y la formula (D, E o F): hasta completarlos no hay cliente elegido,
 * ni precios, ni carrito. La formula es la lista de precios del pedido y la
 * que despues se le asigna al cliente.
 *
 * Los datos quedan con el carrito de la cuenta puente (Carrito.getAlta), van
 * en el pedido (pedido.alta) y se borran al vaciarlo. Un alta a la vez por
 * vendedor: si al elegir la cuenta puente hay un alta a medias, se pregunta si
 * sigue con ese comercio o empieza otro (que descarta el carrito anterior).
 *
 * El servidor (guardar_pedido) guarda el pedido con estado falta_cuenta y un
 * numero de alta (ALTA-n); oficina o admin cargan despues la cuenta definitiva
 * desde la bandeja de impresion.
 */
import { CUENTAS_ALTA } from './config.js';
import { abrirHoja } from './hoja.js';

export const CAMPOS = [
  { clave: 'comercio', etiqueta: 'Nombre del comercio' },
  { clave: 'apellido', etiqueta: 'Apellido' },
  { clave: 'contacto', etiqueta: 'Contacto' },
  { clave: 'domicilio', etiqueta: 'Domicilio' },
  { clave: 'localidad', etiqueta: 'Localidad' },
  { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
  { clave: 'horario', etiqueta: 'Horario' }
];
export const FORMULAS = ['D', 'E', 'F'];
const MAX = 120;   // el mismo tope que el servidor

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const esCuentaAlta = cuenta => CUENTAS_ALTA.includes(String(cuenta ?? '').trim());

/** Los siete datos con texto y una formula valida */
export function completo(a) {
  return !!a && CAMPOS.every(c => String(a[c.clave] ?? '').trim()) && FORMULAS.includes(a.formula);
}

/** Lo que va en el pedido: los datos sin espacios de mas, con el tope del servidor */
export function paraPedido(a) {
  if (!completo(a)) return null;
  const r = { formula: a.formula };
  CAMPOS.forEach(c => { r[c.clave] = String(a[c.clave]).trim().slice(0, MAX); });
  return r;
}

/**
 * Datos del comercio de la cuenta puente, o null si el vendedor cancela.
 * restaurando (recarga de la pagina): sin preguntar, los guardados si estan
 * completos; si no, null (el cliente no se restaura).
 */
export async function pedirDatos(cuenta, { restaurando = false } = {}) {
  const C = window.Carrito;
  const previo = C?.getAlta(cuenta) || null;
  if (restaurando) return completo(previo) ? previo : null;

  // Un pedido de esta cuenta esperando confirmacion: no se cambia nada. Con
  // sus datos se vuelve a la pantalla del pendiente
  if (C?.getPendiente(cuenta)) return completo(previo) ? previo : null;

  let inicial = null;
  const lineas = (C?.leer(cuenta) || []).length;
  if (completo(previo) || lineas) {
    const sigue = await preguntarSiSigue(previo, lineas);
    if (sigue === null) return null;
    if (sigue) inicial = previo;
    else C?.vaciar(cuenta);
  }
  return formulario(cuenta, inicial, inicial ? lineas : 0);
}

/** true: sigue con el alta a medias; false: empieza otro; null: cancelo */
function preguntarSiSigue(previo, lineas) {
  return new Promise(resolver => {
    let respuesta = null;
    const h = abrirHoja({ titulo: 'Cliente nuevo', alCerrar: () => resolver(respuesta) });
    const nombre = previo?.comercio ? `«${esc(previo.comercio)}»` : 'un comercio sin nombre';
    h.cuerpo.innerHTML = `
      <div class="alta-pregunta">
        <p class="alta-texto">Tenés un alta a medias: ${nombre}${lineas ? `, con ${lineas} ${lineas === 1 ? 'artículo' : 'artículos'}` : ''}.</p>
        <p class="alta-texto">¿Seguís con ese comercio o empezás otro? <b>Empezar otro descarta el carrito y los datos anteriores.</b></p>
        <div class="alta-botones">
          <button type="button" class="alta-btn alta-btn-principal" data-r="seguir">Seguir con ${previo?.comercio ? esc(previo.comercio) : 'ese comercio'}</button>
          <button type="button" class="alta-btn alta-btn-peligro" data-r="otro">Empezar otro</button>
        </div>
      </div>`;
    h.cuerpo.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => {
      respuesta = b.dataset.r === 'seguir';
      h.cerrar();
    }));
  });
}

/** El formulario: resuelve con los datos guardados, o null si se cierra sin completar */
function formulario(cuenta, inicial, lineas) {
  return new Promise(resolver => {
    let listo = null;
    const h = abrirHoja({ titulo: 'Datos del cliente nuevo', alCerrar: () => resolver(listo) });
    const v = k => esc(inicial?.[k] ?? '');
    h.cuerpo.innerHTML = `
      <form class="alta-form" novalidate>
        <p class="alta-nota">Completá los datos del comercio y elegí la fórmula. Hasta entonces no se muestran precios.</p>
        ${CAMPOS.map(c => `
          <label class="alta-campo">
            <span>${c.etiqueta}</span>
            <input name="${c.clave}" type="${c.tipo || 'text'}" maxlength="${MAX}" value="${v(c.clave)}"
              autocomplete="off" required>
          </label>`).join('')}
        <fieldset class="alta-formula">
          <legend>Fórmula</legend>
          ${FORMULAS.map(f => `
            <label><input type="radio" name="formula" value="${f}"${inicial?.formula === f ? ' checked' : ''}> ${f}</label>`).join('')}
        </fieldset>
        ${lineas ? '<p class="alta-nota">Si cambiás la fórmula, cambian los precios de lo que ya está en el carrito.</p>' : ''}
        <p class="alta-error" hidden></p>
        <button type="submit" class="alta-btn alta-btn-principal">Continuar</button>
      </form>`;
    const form = h.cuerpo.querySelector('form');
    const error = form.querySelector('.alta-error');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const datos = {};
      CAMPOS.forEach(c => { datos[c.clave] = form.elements[c.clave].value.trim(); });
      datos.formula = form.querySelector('input[name="formula"]:checked')?.value || '';
      const faltan = CAMPOS.filter(c => !datos[c.clave]).map(c => c.etiqueta.toLowerCase());
      if (!datos.formula) faltan.push('la fórmula');
      form.querySelectorAll('.alta-campo input').forEach(i => i.classList.toggle('alta-falta', !i.value.trim()));
      if (faltan.length) {
        error.textContent = 'Falta completar: ' + faltan.join(', ') + '.';
        error.hidden = false;
        return;
      }
      if (!window.Carrito?.setAlta(datos, cuenta)) return;   // pedido pendiente: ya se aviso
      listo = datos;
      h.cerrar();
    });
    form.elements.comercio.focus?.();
  });
}

// busqueda-clientes.js (script clasico) lo usa por window
window.AltaCliente = { esCuentaAlta, pedirDatos, completo, paraPedido, CAMPOS, FORMULAS };
