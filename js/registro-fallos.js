/**
 * REGISTRO DE FALLOS
 *
 * Envia los fallos a un formulario de Google, que NO depende de Apps Script.
 * Asi queda constancia justo cuando el endpoint es el que falla.
 */

const URL_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLScyarOPC6tASZGWvX6nBF4ch29nK3wYGsNawCmrcXuWZWWH1A/formResponse';

const CAMPO_USUARIO = 'entry.1626397435';
const CAMPO_MOTIVO  = 'entry.2068454387';
const CAMPO_DETALLE = 'entry.1115975132';

// No repetir el mismo fallo en la misma sesion: alcanza con saber que paso
const yaRegistrados = new Set();

/**
 * Usuario para el registro. El menu de funcionalidades solo existe en el
 * catalogo (y aparece un segundo despues de cargar): en las demas paginas
 * se arma con lo que deja el login.
 */
function usuarioActual() {
  const u = window.menuFuncionalidades?.usuarioActual;
  if (u) return `${u.clave} ${u.nombre || ''} (${u.rol || ''})`;

  try {
    const cd = JSON.parse(localStorage.getItem('clientData') || '{}');
    const rol = sessionStorage.getItem('authRol') || '';
    const codigo = sessionStorage.getItem('authCodigo') || '';
    if (!cd.account && !rol && !codigo) return 'sin identificar';
    return `${cd.account || '?'} ${cd.name || ''} (${rol})` + (codigo ? ` · ${codigo}` : '');
  } catch (e) {
    return 'sin identificar';
  }
}

/**
 * opciones.repetir: registrar aunque el mismo motivo ya se haya registrado
 * en esta sesion (por ejemplo, cada llamada lenta cuenta para la medicion).
 */
export function registrarFallo(motivo, detalle, usuarioForzado, opciones = {}) {
  if (!opciones.repetir) {
    if (yaRegistrados.has(motivo)) return;
    yaRegistrados.add(motivo);
  }

  const usuario = usuarioForzado || usuarioActual();

  const datos = new FormData();
  datos.append(CAMPO_USUARIO, usuario);
  datos.append(CAMPO_MOTIVO, String(motivo));
  datos.append(CAMPO_DETALLE, String(detalle || '').slice(0, 500));

  // no-cors: el formulario no devuelve respuesta legible, pero registra igual
  fetch(URL_FORM, { method: 'POST', mode: 'no-cors', body: datos })
    .then(() => console.log('[Fallos] Registrado:', motivo))
    .catch(e => console.warn('[Fallos] No se pudo registrar:', e));
}

window.RegistroFallos = { registrarFallo };