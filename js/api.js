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

export async function llamarApi(payload, reintentos = 2) {
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
      if (texto.trim().startsWith('<')) throw new Error('respuesta_html');

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

window.Api = { llamar: llamarApi, URL: URL_API };