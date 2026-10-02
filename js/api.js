/**
 * ACCESO AL SERVIDOR
 *
 * Unico punto de contacto con el Apps Script. Google devuelve de vez en
 * cuando una pagina de error en lugar de datos, y a los pocos segundos
 * vuelve a responder: por eso se reintenta antes de dar el servicio por caido.
 * Reintentar un pedido es seguro: el servidor descarta los duplicados por id.
 */

const URL_API = 'https://script.google.com/macros/s/AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec';
const ESPERAS = [2000, 4000, 6000];

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const TIEMPO_MAXIMO = 15000;

// Tras un tiempo agotado se permite un solo reintento mas por esa causa:
// el servidor suele haber respondido y es Google el que demora la entrega,
// asi que cortar y repetir solo duplica el trabajo
const REINTENTOS_POR_TIEMPO = 1;

async function llamarApiDirecto(payload, reintentos = 3, margen = TIEMPO_MAXIMO) {
  let ultimoError;
  let tiemposAgotados = 0;

  for (let i = 0; i <= reintentos; i++) {
    // Si Google no responde en 15 segundos, cortar: una falla lenta hacia
    // esperar un minuto antes de volver a probar
    const control = new AbortController();
    const corte = setTimeout(() => control.abort(), margen);

    try {
      const r = await fetch(URL_API, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: control.signal
      });

      const texto = await r.text();
      clearTimeout(corte);

      if (texto.trim().startsWith('<')) {
        const titulo = (texto.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
        console.warn('[Api] respuesta HTML:', titulo.trim());
        throw new Error('respuesta_html: ' + titulo.trim());
      }

      return JSON.parse(texto);

    } catch (e) {
      clearTimeout(corte);
      const porTiempo = e.name === 'AbortError';
      ultimoError = porTiempo ? new Error('tiempo_agotado') : e;
      if (porTiempo) tiemposAgotados++;

      // Las demas fallas (pagina HTML de error, red) usan todos los reintentos
      if (tiemposAgotados > REINTENTOS_POR_TIEMPO) break;

      if (i < reintentos) {
        console.warn(`[Api] ${payload.accion}: intento ${i + 1} fallido (${ultimoError.message}), reintentando`);
        window.RegistroFallos?.registrarFallo(`reintento_${payload.accion}`, `intento ${i + 1}: ${ultimoError.message}`);
        await esperar(ESPERAS[i] || 4000);
      }
    }
  }

  throw ultimoError;
}

// Las consultas salen de a una: cuando llegaban varias juntas al servidor,
// Google rechazaba alguna con su pagina de error
let cola = Promise.resolve();

export function llamarApi(payload, reintentos = 3, margen) {
  const tarea = cola.then(() => llamarApiDirecto(payload, reintentos, margen));
  cola = tarea.catch(() => {});
  return tarea;
}

window.Api = { llamar: llamarApi, URL: URL_API };