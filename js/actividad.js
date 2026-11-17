/**
 * ACTIVIDAD DEL USUARIO
 *
 * Ultima vez que el usuario toco la pagina (puntero, tecla, rueda, toque o
 * scroll). Lo usan los cambios que no tienen que interrumpir: el repintado de
 * los destacados (destacados.js, 1,5 s sin tocar) y la actualizacion de la app
 * (actualizacion-app.js, 60 s sin tocar).
 */

// Sin toques todavia: "nunca". Quien necesite que la carga misma cuente como
// actividad (actualizacion-app.js) lo exige aparte con performance.now()
let ultimoToque = -Infinity;
const anotar = () => { ultimoToque = performance.now(); };
['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
  .forEach(t => window.addEventListener(t, anotar, { capture: true, passive: true }));

/** true si el usuario no toco la pagina en los ultimos ms milisegundos */
export function sinTocarHace(ms) {
  return performance.now() - ultimoToque >= ms;
}
