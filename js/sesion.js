/**
 * SESION DEL PERSONAL
 *
 * El personal entra sin esperar el token (loginManager.js): se pide desde la
 * pagina que queda abierta (catalogo o bandeja de impresion), en segundo
 * plano. Pedirlo desde el login no sirve: al cambiar de pagina el navegador
 * corta la llamada y la respuesta no le llega a nadie.
 *
 * Al llegar el token se avisa con el evento auth:token-listo, para que lo
 * que lo necesita (carrito, revision, finanzas) se actualice solo.
 */

import { llamarApi, registrarRenovador } from './api.js';
import { registrarFallo } from './registro-fallos.js';

// La clave del que entro: la deja el login en clientData, disponible desde
// el primer momento (el menu del catalogo tarda un segundo en cargarse)
function clavePropia() {
  try {
    return String(JSON.parse(localStorage.getItem('clientData') || '{}').account || '').trim();
  } catch (e) {
    return '';
  }
}

// Se avisa a la app solo si alguien pidio el token porque faltaba; una
// renovacion de un token que ya estaba no cambia nada para la app (y avisar
// reabriria el panel del carrito, por ejemplo en medio de guardar un pedido)
let avisarAlLlegar = false;

function guardarSesion(auth) {
  sessionStorage.setItem('authToken', auth.token);
  sessionStorage.setItem('authRol', auth.rol);
  sessionStorage.setItem('authCodigo', auth.codigo || '');
  sessionStorage.setItem('authVence', String(auth.vence));
  sessionStorage.removeItem('authDegradado');
  sessionStorage.removeItem('authMotivo');

  // Lo que necesita token puede arrancar ahora
  if (avisarAlLlegar) document.dispatchEvent(new CustomEvent('auth:token-listo'));
}

let pidiendo = null;

/**
 * Pide el token al servidor. Devuelve true si quedo guardado. Nunca saca al
 * usuario que ya entro: si el servidor rechaza la clave o no responde, la
 * sesion sigue degradada y queda registrado.
 * renovacion: el token ya estaba y se renueva (api.js): no se avisa a la app.
 */
export function pedirToken({ renovacion = false } = {}) {
  if (!renovacion) avisarAlLlegar = true;
  if (pidiendo) return pidiendo;

  const clave = clavePropia();
  if (!clave) return Promise.resolve(false);

  pidiendo = llamarApi({ accion: 'login', clave }, 2, 12000)
    .then(auth => {
      if (!auth.ok) {
        // Clave rechazada: el usuario sigue adentro, sin token
        console.warn('[Auth] El servidor rechazó la clave', clave, '—', auth.error);
        sessionStorage.setItem('authMotivo', 'rechazado');
        registrarFallo('login_rechazado', `clave ${clave}: ${auth.error}`);
        return false;
      }
      if (!auth.token) {
        // Nunca guardar un token vacio: deja la sesion rota sin aviso
        console.error('[Auth] Respuesta sin token:', auth);
        sessionStorage.setItem('authMotivo', 'sin_servicio');
        return false;
      }
      guardarSesion(auth);
      console.log('[Auth] Token listo:', auth.rol, auth.nombre || '');
      return true;
    })
    .catch(err => {
      console.warn('[Auth] Sin respuesta al pedir el token:', err);
      sessionStorage.setItem('authMotivo', 'sin_servicio');
      registrarFallo('endpoint_caido', String(err), `clave ${clave}`);
      return false;
    })
    .finally(() => { pidiendo = null; avisarAlLlegar = false; });

  return pidiendo;
}

// api.js renueva el token cuando esta por vencer o ya vencio
registrarRenovador(() => pedirToken({ renovacion: true }));
