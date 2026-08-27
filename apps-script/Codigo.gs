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
  const cache = CacheService.getScriptCache();
  let mapa = cache.get('usuarios_mapa');

  if (mapa) {
    mapa = JSON.parse(mapa);
  } else {
    const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName('usuarios');
    const datos = hoja.getDataRange().getValues();
    mapa = {};
    for (let i = 1; i < datos.length; i++) {
      const clv = String(datos[i][1]).trim();
      if (!clv) continue;
      mapa[clv] = {
        codigo: String(datos[i][0]).trim(),
        id: clv,
        nombre: String(datos[i][2]).trim(),
        rol: String(datos[i][3]).trim(),
        activo: String(datos[i][4]).trim().toUpperCase() === 'SI'
      };
    }
    // 6 horas
    cache.put('usuarios_mapa', JSON.stringify(mapa), 21600);
  }

  const u = mapa[String(clave).trim()];
  if (!u || !u.activo) return null;
  return u;
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

// ---------- finanzas ----------

function getFinanzasCliente(cuenta) {
  const cache = CacheService.getScriptCache();
  const clave = 'fin_' + cuenta;

  const guardado = cache.get(clave);
  if (guardado) return JSON.parse(guardado);

  const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName('finanzas');
  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]).trim() !== String(cuenta).trim()) continue;

    const c = {
      cuenta: String(datos[i][0]).trim(),
      nombre: String(datos[i][1]).trim(),
      vendedor: String(datos[i][2]).trim(),
      saldoTotal: Number(datos[i][3]) || 0,
      comproMes: Number(datos[i][4]) || 0,
      pgProm3M: Number(datos[i][5]) || 0,
      pagoMes: Number(datos[i][6]) || 0,
      cupoMes: Number(datos[i][7]) || 0,
      ultOperacion: String(datos[i][8]).trim(),
      esRevendedor: String(datos[i][9]).trim().toUpperCase() === 'SI'
    };

    cache.put(clave, JSON.stringify(c), 3600);
    return c;
  }

  return null;
}

function accionFinanzas(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });

  const cuenta = String(body.cuenta || '').trim();
  if (!cuenta) return responder({ ok: false, error: 'falta_cuenta' });

  // Un cliente solo puede pedir SUS datos. El rol viene del token firmado,
  // no de lo que declare el navegador.
  if (p.rol === 'cliente_estandar' && cuenta !== String(p.usr)) {
    return responder({ ok: false, error: 'no_autorizado' });
  }

    const datos = getFinanzasCliente(cuenta);
  if (!datos) return responder({ ok: false, error: 'cliente_no_encontrado' });

  // Un vendedor solo ve SUS clientes. El codigo del vendedor viene del
  // token firmado y se compara con la columna Vendedor de la planilla.
  if (p.rol === 'vendedor_estandar' && datos.vendedor !== p.cod) {
    return responder({ ok: false, error: 'cliente_de_otro_vendedor' });
  }

  // cupoMes ya viene calculado desde el Excel: es el disponible
  const disponible = datos.cupoMes;

  // El cliente final no recibe el disponible ni el semaforo
  if (p.rol === 'cliente_estandar') {
    return responder({
      ok: true,
      cuenta: datos.cuenta,
      nombre: datos.nombre,
      saldoTotal: datos.saldoTotal,
      comproMes: datos.comproMes,
      pgProm3M: datos.pgProm3M,
      pagoMes: datos.pagoMes,
      cupoMes: datos.cupoMes,
      ultOperacion: datos.ultOperacion
    });
  }

  // Vendedor y admin: todo, mas el disponible
  return responder({
    ok: true,
    cuenta: datos.cuenta,
    nombre: datos.nombre,
    vendedor: datos.vendedor,
    saldoTotal: datos.saldoTotal,
    comproMes: datos.comproMes,
    pgProm3M: datos.pgProm3M,
    pagoMes: datos.pagoMes,
    cupoMes: datos.cupoMes,
    ultOperacion: datos.ultOperacion,
    esRevendedor: datos.esRevendedor,
    disponible: disponible
  });
}

function limpiarCacheFinanzas() {
  CacheService.getScriptCache().remove('finanzas_mapa');
  console.log('Cache de finanzas limpiada');
}


// ---------- entrada ----------

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const accion = body.accion;

    if (accion === 'login')   return accionLogin(body);
    if (accion === 'validar') return accionValidar(body);
    if (accion === 'finanzas') return accionFinanzas(body);

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
    if (accion === 'version') {
      return responder({ ok: true, version: 'v3-finanzas' });
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



function probarFinanzas() {
  const c = getFinanzasCliente('20271');
  console.log('Cuenta 20271: ' + JSON.stringify(c));
}