/**
 * HOJA DE OPCIONES DEL PEDIDO
 *
 * Una hoja aparte, encima del panel del carrito: pantalla completa en el
 * celular y ventana en la computadora (css/hoja.css). La usan las
 * observaciones, y sirve igual para otras opciones del pedido que necesiten
 * mas lugar que una linea del panel.
 *
 * abrirHoja({ titulo, alCerrar }) devuelve { cuerpo, pie, ponerTitulo, cerrar }:
 * quien la abre llena el cuerpo y el pie. Hay una sola hoja a la vez. La
 * flecha de volver, Escape o tocar afuera (en la computadora) la cierran.
 */

let abierta = null;

export function abrirHoja({ titulo = '', alCerrar } = {}) {
  abierta?.cerrar();

  const fondo = document.createElement('div');
  fondo.className = 'hj-fondo';
  fondo.innerHTML = `
    <div class="hj-caja" role="dialog" aria-modal="true" aria-labelledby="hj-titulo">
      <div class="hj-cab">
        <button type="button" class="hj-volver" aria-label="Volver">&#8592;</button>
        <p class="hj-titulo" id="hj-titulo"></p>
      </div>
      <div class="hj-cuerpo"></div>
      <div class="hj-pie" hidden></div>
    </div>`;
  document.body.appendChild(fondo);

  // Celular: la hoja ocupa solo lo que queda visible por encima del teclado,
  // asi el buscador y los primeros resultados nunca quedan tapados (ni el
  // iPhone ni Chrome en Android achican la pagina al abrir el teclado: solo
  // cambia visualViewport). En la computadora queda como siempre (css)
  const caja = fondo.querySelector('.hj-caja');
  const vv = window.visualViewport;
  function ajustarAlTeclado() {
    if (!vv || esAncha()) {
      fondo.style.top = fondo.style.bottom = fondo.style.height = caja.style.height = '';
      return;
    }
    fondo.style.top = vv.offsetTop + 'px';
    fondo.style.bottom = 'auto';
    fondo.style.height = vv.height + 'px';
    caja.style.height = '100%';
  }
  vv?.addEventListener('resize', ajustarAlTeclado);
  vv?.addEventListener('scroll', ajustarAlTeclado);
  ajustarAlTeclado();

  const foco = document.activeElement;
  const h = {
    cuerpo: fondo.querySelector('.hj-cuerpo'),
    pie: fondo.querySelector('.hj-pie'),
    ponerTitulo: t => { fondo.querySelector('.hj-titulo').textContent = t; },
    cerrar
  };
  h.ponerTitulo(titulo);

  // En captura: Escape cierra la hoja y no llega al panel de abajo
  function alTeclado(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    cerrar();
  }

  function cerrar() {
    if (abierta !== h) return;
    abierta = null;
    document.removeEventListener('keydown', alTeclado, true);
    vv?.removeEventListener('resize', ajustarAlTeclado);
    vv?.removeEventListener('scroll', ajustarAlTeclado);
    fondo.remove();
    foco?.focus?.();
    alCerrar?.();
  }

  fondo.querySelector('.hj-volver').addEventListener('click', cerrar);
  // Tocar afuera solo es posible en la ventana de la computadora
  fondo.addEventListener('click', e => { if (e.target === fondo) cerrar(); });
  document.addEventListener('keydown', alTeclado, true);

  abierta = h;
  return h;
}

/** Hay espacio de computadora: ahi se puede poner el foco sin abrir un teclado en pantalla */
export const esAncha = () => window.matchMedia('(min-width: 768px)').matches;
