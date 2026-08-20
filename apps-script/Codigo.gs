/**
 * Ferremax API v2 - Login por endpoint con token firmado
 */

const PLANILLA_ID = '1U91v6CVHmlaF3wjRhxSpyxtvP6RE0YNicZHrNRVMso4';
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec';

const HORAS_VIGENCIA = 12;

// ---------- utilidades ----------

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSecreto() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRETO_TOKEN');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SECRETO_TOKEN', s);
  }
  return s;
}

function b64(str) {
  return Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
}

// ---------- token ----------

function firmar(payloadStr) {
  const bytes = Utilities.computeHmacSha256Signature(payloadStr, getSecreto());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function crearToken(usuario) {
  const payload = {
    cod: usuario.codigo,
    usr: usuario.id,
    rol: usuario.rol,
    exp: Date.now() + HORAS_VIGENCIA * 3600 * 1000
  };
  const p = JSON.stringify(payload);
  return b64(p) + '.' + firmar(p);
}

function verificarToken(token) {
  if (!token || token.indexOf('.') === -1) return null;

  const partes = token.split('.');
  let payloadStr;
  try {
    payloadStr = Utilities.newBlob(
      Utilities.base64DecodeWebSafe(partes[0])
    ).getDataAsString();
  } catch (e) {
    return null;
  }

  if (firmar(payloadStr) !== partes[1]) return null;

  const payload = JSON.parse(payloadStr);
  if (Date.now() > payload.exp) return null;

  return payload;
}

// ---------- usuarios ----------

function buscarUsuario(clave) {
  const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName('usuarios');
  const datos = hoja.getDataRange().getValues();
  const clv = String(clave).trim();

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][1]).trim() === clv) {
      if (String(datos[i][4]).trim().toUpperCase() !== 'SI') return null;
      return {
        codigo: String(datos[i][0]).trim(),
        id: clv,
        nombre: String(datos[i][2]).trim(),
        rol: String(datos[i][3]).trim()
      };
    }
  }
  return null;
}

// ---------- acciones ----------

function accionLogin(body) {
  const usuario = buscarUsuario(body.clave);

  if (!usuario) {
    Utilities.sleep(400);
    return responder({ ok: false, error: 'credenciales_invalidas' });
  }

  return responder({
    ok: true,
    nombre: usuario.nombre,
    rol: usuario.rol,
    codigo: usuario.codigo,
    token: crearToken(usuario),
    vence: Date.now() + HORAS_VIGENCIA * 3600 * 1000
  });
}

function accionValidar(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });
  return responder({ ok: true, rol: p.rol, usuario: p.usr, codigo: p.cod });
}

// ---------- entrada ----------

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const accion = body.accion;

    if (accion === 'login')   return accionLogin(body);
    if (accion === 'validar') return accionValidar(body);

    return responder({ ok: false, error: 'accion_desconocida' });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  const accion = (e && e.parameter && e.parameter.accion) || 'ping';
  try {
    if (accion === 'ping') {
      return responder({ ok: true, mensaje: 'API Ferremax operativa', hora: new Date().toISOString() });
    }
    return responder({ ok: false, error: 'usar POST para acciones con datos' });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

// ---------- mantenimiento ----------

function mantenerCaliente() {
  try {
    const resp = UrlFetchApp.fetch(URL_EXEC + '?accion=ping', {
      muteHttpExceptions: true, followRedirects: true
    });
    console.log('keep-alive: ' + resp.getResponseCode());
  } catch (err) {
    console.log('keep-alive fallo: ' + err);
  }
}

function generarSecreto() {
  console.log('Secreto: ' + getSecreto().substring(0, 8) + '...');
}