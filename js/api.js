/**
 * ACCESO AL SERVIDOR
 *
 * Unico punto de contacto con el Apps Script. Google devuelve de vez en
 * cuando una pagina de error en lugar de datos, y a los pocos segundos
 * vuelve a responder: por eso se reintenta antes de dar el servicio por caido.
 * Reintentar un pedido es seguro: el servidor descarta los duplicados por id.
 */

const URL_API = 'https://script.google.com/macros/s/AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec';

const ESPERAS = [1500, 3000];

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function llamarApiDirecto(payload, reintentos = 2) {
  let ultimoError;

  for (let i = 0; i <= reintentos; i++) {
    try {
      const r = await fetch(URL_API, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });

      const texto = await r.text();

      // La falla pasajera de Google llega como pagina web, no como datos
      if (texto.trim().startsWith('<')) {
        // Guardar el titulo de la pagina: distingue una caida de Google de
        // un error en el propio script, que tambien llega como pagina web
        const titulo = (texto.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
        console.warn('[Api] respuesta HTML:', titulo.trim(), '|', texto.slice(0, 300));
        throw new Error('respuesta_html: ' + titulo.trim());
      }

      return JSON.parse(texto);

    } catch (e) {
      ultimoError = e;
      if (i < reintentos) {
        console.warn(`[Api] ${payload.accion}: intento ${i + 1} fallido, reintentando`);
        window.RegistroFallos?.registrarFallo(`reintento_${payload.accion}`, `intento ${i + 1}: ${e.message}`);
        await esperar(ESPERAS[i] || 3000);
      }
    }
  }

  throw ultimoError;
}

// Las consultas salen de a una: cuando llegaban varias juntas al servidor,
// Google rechazaba alguna con su pagina de error
let cola = Promise.resolve();

export function llamarApi(payload, reintentos = 2) {
  const tarea = cola.then(() => llamarApiDirecto(payload, reintentos));
  cola = tarea.catch(() => {});
  return tarea;
}

window.Api = { llamar: llamarApi, URL: URL_API };