/**
 * ACCESO AL SERVIDOR
 *
 * Unico punto de contacto con el Apps Script. Google devuelve de vez en
 * cuando una pagina de error en lugar de datos, y a los pocos segundos
 * vuelve a responder: por eso se reintenta antes de dar el servicio por caido.
 * Reintentar un pedido es seguro: el servidor descarta los duplicados por id.
 */

import { registrarFallo } from './registro-fallos.js';

// Medicion: una llamada que tarda mas que esto (sin contar la cola) se
// registra en el formulario de fallos como lenta_<accion>
const UMBRAL_LENTA_MS = 5000;

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

/** intentos: se anota la duracion y el resultado de cada intento. */
async function llamarApiDirecto(payload, reintentos = 3, margen = TIEMPO_MAXIMO, intentos = []) {
  let ultimoError;
  let tiemposAgotados = 0;

  for (let i = 0; i <= reintentos; i++) {
    const tIntento = performance.now();

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

      const datos = JSON.parse(texto);
      intentos.push({ ms: performance.now() - tIntento, estado: 'ok' });
      return datos;

    } catch (e) {
      clearTimeout(corte);
      const porTiempo = e.name === 'AbortError';
      ultimoError = porTiempo ? new Error('tiempo_agotado') : e;
      if (porTiempo) tiemposAgotados++;

      intentos.push({
        ms: performance.now() - tIntento,
        estado: porTiempo ? 'corte'
          : String(e.message || '').startsWith('respuesta_html') ? 'html' : 'error'
      });

      // Las demas fallas (pagina HTML de error, red) usan todos los reintentos
      if (tiemposAgotados > REINTENTOS_POR_TIEMPO) break;

      if (i < reintentos) {
        console.warn(`[Api] ${payload.accion}: intento ${i + 1} fallido (${ultimoError.message}), reintentando`);
        registrarFallo(`reintento_${payload.accion}`, `intento ${i + 1}: ${ultimoError.message}`);
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
  const med = { pedido: performance.now(), inicio: 0, intentos: [] };

  const tarea = cola.then(() => {
    med.inicio = performance.now();
    return llamarApiDirecto(payload, reintentos, margen, med.intentos);
  });
  cola = tarea.catch(() => {});

  // Rama aparte: no cambia lo que recibe quien llamo ni demora su respuesta
  tarea.then(
    r => medirLenta(payload, med, r?.ok === false ? `ok:false (${r.error})` : 'ok'),
    e => medirLenta(payload, med, `falla: ${e?.message || e}`)
  );

  return tarea;
}

/**
 * Registra la llamada si tardo mas que UMBRAL_LENTA_MS: cuanto espero en la
 * cola, cuanto tardo la llamada (reintentos y esperas incluidos) y cada
 * intento. Se hace despues, aparte, y si algo falla se ignora.
 */
function medirLenta(payload, med, resultado) {
  const fin = performance.now();
  setTimeout(() => {
    try {
      const llamada = Math.round(fin - med.inicio);
      if (llamada <= UMBRAL_LENTA_MS) return;

      const intentos = med.intentos.map(x => `${Math.round(x.ms)} ${x.estado}`).join(', ');
      const detalle = `${llamada} ms · cola ${Math.round(med.inicio - med.pedido)} ms` +
        ` · intentos ${med.intentos.length} (${intentos}) · resultado ${resultado}`;
      const tipo = `lenta_${payload.accion}`;

      console.info(`[Api] ${tipo}: ${detalle}`);
      // Cada llamada lenta cuenta para la medicion: sin filtrar repetidos
      registrarFallo(tipo, detalle, undefined, { repetir: true });
    } catch (e) {
      // La medicion nunca afecta a la aplicacion
    }
  }, 0);
}

window.Api = { llamar: llamarApi, URL: URL_API };