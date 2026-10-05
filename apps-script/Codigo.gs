/**
 * Ferremax API v2 - Login por endpoint con token firmado
 */

const PLANILLA_ID = '1U91v6CVHmlaF3wjRhxSpyxtvP6RE0YNicZHrNRVMso4';
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbzuT4PB1Rqw935-AkjtMnd_nR0lR-bWQS56Dbvh-jVi-P-n0Kdca1Rez61DsYxc7f8/exec';

// Permisos por rol. Un rol que no figura en una lista no tiene ese permiso:
// asi, cualquier rol nuevo nace sin permisos hasta agregarlo aca
const ROLES_PEDIDO = ['admin', 'vendedor_estandar', 'cliente_estandar'];
const ROLES_IMPRIMIR = ['admin', 'vendedor_estandar', 'oficina'];
const ROLES_VER_TODOS = ['admin', 'oficina'];

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
  const cache = CacheService.getScriptCache();
  const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName('finanzas');
  const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();

  const claves = datos
    .map(f => String(f[0]).trim())
    .filter(Boolean)
    .map(c => 'fin_' + c);

  // removeAll acepta hasta 1000 claves por llamada
  for (let i = 0; i < claves.length; i += 500) {
    cache.removeAll(claves.slice(i, i + 500));
  }

  console.log('Cache de finanzas limpiada:', claves.length, 'clientes');
}


// ---------- configuracion ----------

function getConfig() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('config_mapa');
  if (guardado) return JSON.parse(guardado);

  const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName('config');
  const datos = hoja.getDataRange().getValues();
  const cfg = {};

  for (let i = 1; i < datos.length; i++) {
    const clave = String(datos[i][0]).trim();
    if (!clave) continue;
    cfg[clave] = String(datos[i][1]).trim();
  }

  cache.put('config_mapa', JSON.stringify(cfg), 3600);
  return cfg;
}

function accionConfig(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });

  const cfg = getConfig();

  return responder({
    ok: true,
    descuentosLinea: (cfg.descuentos_linea || '').split(/[,|]/).map(Number).filter(Boolean),
    descuentosTotal: (cfg.descuentos_total || '').split(/[,|]/).map(Number).filter(Boolean),
    descuentoRevendedor: Number(cfg.descuento_revendedor) || 0,
    observaciones: (cfg.observaciones || '').split('|').map(s => s.trim()).filter(Boolean),
    umbralAviso: Number(cfg.umbral_aviso) || 0,
    umbralBloqueo: Number(cfg.umbral_bloqueo) || 0,
    modoObservacion: String(cfg.modo_observacion).toUpperCase() === 'SI'
  });
}

function limpiarCacheConfig() {
  CacheService.getScriptCache().remove('config_mapa');
  console.log('Cache de configuracion limpiada');
}

// ---------- pedidos ----------

/**
 * Semaforo del pedido, calculado en el servidor para que valga igual
 * en los pedidos del vendedor y en los del cliente, que no recibe el cupo.
 * Acumula las lineas en orden: verde hasta el cupo, amarillo hasta un 30%
 * por encima, rojo mas alla.
 */
function calcularSemaforo(lineas, cupo) {
  const res = {
    cupo: cupo,
    verde: 0, amarillo: 0, rojo: 0,
    colores: [],
    peor: 'verde'
  };

  if (!cupo || cupo <= 0) {
    // Sin cupo disponible, todo el pedido queda en rojo
    lineas.forEach(l => {
      res.colores.push('rojo');
      res.rojo += Number(l.subtotal) || 0;
    });
    res.peor = lineas.length ? 'rojo' : 'verde';
    return res;
  }

  let acum = 0;
  lineas.forEach(l => {
    acum += Number(l.subtotal) || 0;
    let color;
    if (acum <= cupo) color = 'verde';
    else if (acum <= cupo * 1.3) color = 'amarillo';
    else color = 'rojo';

    res.colores.push(color);
    res[color] += Number(l.subtotal) || 0;

    if (color === 'rojo') res.peor = 'rojo';
    else if (color === 'amarillo' && res.peor === 'verde') res.peor = 'amarillo';
  });

  return res;
}

function accionGuardarPedido(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });

  
  if (!ROLES_PEDIDO.includes(String(p.rol || '').trim())) {
    return responder({ ok: false, error: 'rol_sin_permiso' });
  }

  const ped = body.pedido;
  if (!ped || !ped.lineas || !ped.lineas.length) {
    return responder({ ok: false, error: 'pedido_vacio' });
  }

  const cuenta = String(ped.cliente || '').trim();
  if (!cuenta) return responder({ ok: false, error: 'falta_cliente' });

  // Un vendedor solo puede pedir para sus clientes
  const datosCli = getFinanzasCliente(cuenta);

  // Semaforo calculado aca: el cliente no recibe el cupo, asi que su
  // navegador no puede calcularlo. Ademas el dato no depende del frontend.
  const sem = calcularSemaforo(ped.lineas, Number(datosCli ? datosCli.cupoMes : 0));
  const excedente = Math.round(((ped.totalNeto || 0) - sem.cupo) * 100) / 100;


  if (!datosCli) return responder({ ok: false, error: 'cliente_no_encontrado' });
  if (p.rol === 'vendedor_estandar' && datosCli.vendedor !== p.cod) {
    return responder({ ok: false, error: 'cliente_de_otro_vendedor' });
  }
  if (p.rol === 'cliente_estandar' && cuenta !== String(p.usr)) {
    return responder({ ok: false, error: 'no_autorizado' });
  }

  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const hCab = ss.getSheetByName('pedidos_cabecera');
  const hLin = ss.getSheetByName('pedidos_lineas');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    // Idempotencia: si ya existe ese id, no duplicar. Pero si el contenido
    // no coincide con lo guardado, avisar en vez de responder exito en silencio
    const filasCab = hCab.getRange(1, 1, Math.max(hCab.getLastRow(), 1), COL_NUMERO).getValues();
    for (let i = 1; i < filasCab.length; i++) {
      if (String(filasCab[i][0]).trim() === String(ped.id)) {
        const mismasLineas = Number(filasCab[i][7]) === ped.lineas.length;
        const mismoTotal = Math.abs(Number(filasCab[i][10]) - Number(ped.totalNeto || 0)) < 0.01;
        const numGuardado = etiquetaPedido(Number(filasCab[i][COL_NUMERO - 1]) || i);
        if (mismasLineas && mismoTotal) {
          return responder({ ok: true, duplicado: true, numero: numGuardado, id: ped.id });
        }
        return responder({ ok: false, error: 'id_con_otro_contenido', numero: numGuardado, id: ped.id });
      }
    }

    const ahora = new Date();
    const numero = siguienteNumeroPedido(hCab);

    hCab.appendRow([
      ped.id,
      ahora,
      cuenta,
      datosCli.nombre,
      p.cod || '',
      p.usr || '',
      ped.canal || 'app',
      ped.lineas.length,
      ped.totalBruto || 0,
      ped.descuentoTotal || 0,
      ped.totalNeto || 0,
      ped.descEfectivoGlobal || 0,
      ped.motivo || '',
      ped.obsLibre || '',
      'recibido',
      ped.idOrigen || '',
      ped.revision || 0,
      ped.lista || '',
      sem.cupo,
      excedente > 0 ? excedente : 0,
      sem.peor,
      Math.round(sem.verde * 100) / 100,
      Math.round(sem.amarillo * 100) / 100,
      Math.round(sem.rojo * 100) / 100,
      datosCli ? Number(datosCli.pgProm3M) || 0 : 0,
      '',                          // impreso
      '',                          // fecha_impresion
      '',                          // impreso_por
      String(p.rol || '').trim(),   // rol_creador
      numero                       // numero
    ]);

    const filas = ped.lineas.map((l, i) => ([
      ped.id,
      i + 1,
      l.sku,
      l.nombre || '',
      l.cantidad,
      ped.lista || '',
      l.listaAplicada || ped.lista || '',
      l.mecanismo || 'lista_cliente',
      l.precioBase || 0,
      l.precio || 0,
      l.descEfectivo || 0,
      l.subtotal || 0,
      l.origenLinea || '',
      sem.colores[i] || ''
    ]));

    if (filas.length) {
      hLin.getRange(hLin.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
    }

    return responder({
      ok: true,
      id: ped.id,
      numero: etiquetaPedido(numero),
      fecha: ahora.toISOString()
    });

  } catch (err) {
    return responder({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


// ---------- revision de pedidos ----------

/**
 * Pedidos que hizo un cliente y todavia no tienen revision.
 * Se deduce de la planilla: lo cargo el propio cliente (usuario = cuenta)
 * y ningun otro pedido lo tiene como origen.
 */
function accionPedidosPendientes(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });
  if (p.rol === 'cliente_estandar') return responder({ ok: false, error: 'no_autorizado' });

  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const cab = ss.getSheetByName('pedidos_cabecera').getDataRange().getValues();

  const revisados = new Set();
  for (let i = 1; i < cab.length; i++) {
    const origen = String(cab[i][15]).trim();
    if (origen) revisados.add(origen);
  }

  // Vendedor de cada cliente, para mostrar solo los propios
  const fin = ss.getSheetByName('finanzas').getDataRange().getValues();
  const vendedorDe = {};
  for (let i = 1; i < fin.length; i++) {
    vendedorDe[String(fin[i][0]).trim()] = String(fin[i][2]).trim();
  }

  const pedidos = [];
  for (let i = 1; i < cab.length; i++) {
    const f = cab[i];
    const id = String(f[0]).trim();
    const cliente = String(f[2]).trim();

    if (!id || revisados.has(id)) continue;
    if (String(f[5]).trim() !== cliente) continue;   // lo cargo un vendedor
    if (p.rol === 'vendedor_estandar' && vendedorDe[cliente] !== p.cod) continue;

    pedidos.push({
      id,
      fecha: f[1] instanceof Date ? f[1].toISOString() : String(f[1]),
      cliente,
      nombre: String(f[3]),
      lineas: Number(f[7]) || 0,
      total: Number(f[10]) || 0
    });
  }

  pedidos.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return responder({ ok: true, pedidos });
}

/**
 * Lineas de un pedido, para cargarlo en el carrito del vendedor.
 */
function accionPedidoDetalle(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });
  if (p.rol === 'cliente_estandar') return responder({ ok: false, error: 'no_autorizado' });

  const id = String(body.id || '').trim();
  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const cab = ss.getSheetByName('pedidos_cabecera').getDataRange().getValues();

  let cabecera = null;
  for (let i = 1; i < cab.length; i++) {
    if (String(cab[i][0]).trim() === id) { cabecera = cab[i]; break; }
  }
  if (!cabecera) return responder({ ok: false, error: 'no_encontrado' });

  const cliente = String(cabecera[2]).trim();
  if (p.rol === 'vendedor_estandar') {
    const datos = getFinanzasCliente(cliente);
    if (!datos || datos.vendedor !== p.cod) return responder({ ok: false, error: 'no_autorizado' });
  }

  const lin = ss.getSheetByName('pedidos_lineas').getDataRange().getValues();
  const lineas = [];
  for (let i = 1; i < lin.length; i++) {
    const f = lin[i];
    if (String(f[0]).trim() !== id) continue;
    lineas.push({
      orden: Number(f[1]),
      sku: String(f[2]).trim(),
      nombre: String(f[3]),
      cantidad: Number(f[4])
    });
  }
  lineas.sort((a, b) => a.orden - b.orden);

  return responder({ ok: true, id, cliente, nombre: String(cabecera[3]), lineas });
}

// ---------- entrada ----------

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const accion = body.accion;

    if (accion === 'login')   return accionLogin(body);
    if (accion === 'validar') return accionValidar(body);
    if (accion === 'finanzas') return accionFinanzas(body);
    if (accion === 'config')   return accionConfig(body);
    if (accion === 'guardar_pedido') return accionGuardarPedido(body);
    if (accion === 'pedidos_pendientes') return accionPedidosPendientes(body);
    if (accion === 'pedido_detalle')     return accionPedidoDetalle(body);
    if (accion === 'pedidos_para_imprimir') return accionPedidosParaImprimir(body);
    if (accion === 'marcar_impresos') return accionMarcarImpresos(body);
    if (accion === 'intento_impresion') return accionIntentoImpresion(body);

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
      return responder({ ok: true, version: 'v24-intento-de-otro' });
    }
    if (accion === 'limpiar_cache_fin') {
       limpiarCacheFinanzas();
       return responder({ ok: true, limpiado: true });
    }
    return responder({ ok: false, error: 'usar POST para acciones con datos' });
  } catch (err) {
    return responder({ ok: false, error: String(err) });
  }
}

// ---------- mantenimiento ----------

function mantenerCaliente() {
  // Solo en horario comercial: calentar de madrugada y fines de semana
  // consume cuota sin beneficio para nadie
  const ahora = new Date();
  const zona = 'America/Argentina/Buenos_Aires';
  const hora = Number(Utilities.formatDate(ahora, zona, 'H'));
  const dia = Number(Utilities.formatDate(ahora, zona, 'u'));

  if (dia > 5) return;               // sabado y domingo
  if (hora < 8 || hora >= 19) return;

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

function verConfigCruda() {
  const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName('config');
  const datos = hoja.getDataRange().getValues();
  datos.forEach(f => console.log(JSON.stringify(f[0]) + ' => ' + JSON.stringify(f[1]) + ' (' + typeof f[1] + ')'));
}

function limpiarCacheUsuarios() {
  CacheService.getScriptCache().remove('usuarios_mapa');
  console.log('Cache de usuarios limpiada');
}



// ---------- impresion de pedidos ----------

/**
 * Pedidos para la bandeja de impresion: pendientes o impresos en un rango
 * de fechas. Se arma cada pedido con una lista explicita de campos, asi los
 * datos internos (semaforo, cupo, excedente, colores) nunca salen del servidor.
 */
function accionPedidosParaImprimir(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });
  const rol = String(p.rol || '').trim();
  if (!ROLES_IMPRIMIR.includes(rol)) return responder({ ok: false, error: 'rol_sin_permiso' });

  const modo = body.modo === 'impresos' ? 'impresos' : 'pendientes';
  const verTodos = ROLES_VER_TODOS.includes(rol);

  // Impresos: por defecto la ultima semana; como maximo dos meses por consulta
  let desde = null, hasta = null;
  if (modo === 'impresos') {
    hasta = body.hasta ? new Date(body.hasta + 'T23:59:59') : new Date();
    desde = body.desde ? new Date(body.desde + 'T00:00:00')
                       : new Date(hasta.getTime() - 7 * 86400000);
    if (isNaN(desde) || isNaN(hasta) || desde > hasta) {
      return responder({ ok: false, error: 'fechas_invalidas' });
    }
    if (hasta - desde > 62 * 86400000) {
      return responder({ ok: false, error: 'rango_muy_amplio' });
    }
  }

  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const cab = ss.getSheetByName('pedidos_cabecera').getDataRange().getValues();
  const enc = cab[0].map(x => String(x).trim());
  const c = n => enc.indexOf(n);
  const I = {
    id: c('id_pedido'), ts: c('timestamp'), cliente: c('cliente'), nombre: c('nombre_cliente'),
    vendedor: c('vendedor'), canal: c('canal'), cant: c('cant_lineas'), bruto: c('total_bruto'),
    descPct: c('desc_total_pct'), neto: c('total_neto'), motivo: c('motivo_obs'),
    obs: c('obs_libre'), origen: c('id_pedido_origen'), revision: c('revision'), lista: c('lista'),
    impreso: c('impreso'), fechaImp: c('fecha_impresion'), impresoPor: c('impreso_por'),
    rolCreador: c('rol_creador'), numero: c('numero'),
    intento: c('intento_impresion'), intentoPor: c('intento_por')
  };
  if (I.impreso < 0 || I.fechaImp < 0 || I.rolCreador < 0) {
    return responder({ ok: false, error: 'faltan_columnas' });
  }

  const vendedorDe = {};   // cuenta -> vendedor, para no consultar dos veces
    // Clave de quien imprimio -> nombre. Si el usuario ya no existe o esta
  // inactivo, se muestra la clave para no dejar el dato vacio
  const nombreDe = {};
  const nombreUsuario = clave => {
    const c = String(clave || '').trim();
    if (!c) return '';
    if (!(c in nombreDe)) {
      const u = buscarUsuario(c);
      nombreDe[c] = u && u.nombre ? u.nombre : c;
    }
    return nombreDe[c];
  };
  const pedidos = [];

  for (let i = 1; i < cab.length; i++) {
    const f = cab[i];
    if (!f[I.id]) continue;

    // Solo pedidos armados o revisados por un vendedor o administrador
    const rc = String(f[I.rolCreador] || '').trim();
    if (!rc || rc === 'cliente_estandar') continue;

    const impreso = String(f[I.impreso] || '').trim().toUpperCase() === 'SI';
    if (modo === 'pendientes' && impreso) continue;
    if (modo === 'impresos') {
      if (!impreso) continue;
      // Se filtra por la fecha del pedido, que es la que recuerda el vendedor
      const fp = f[I.ts] instanceof Date ? f[I.ts] : new Date(f[I.ts]);
      if (isNaN(fp) || fp < desde || fp > hasta) continue;
    }

    const cuenta = String(f[I.cliente]).trim();
    if (!verTodos) {
      if (!(cuenta in vendedorDe)) {
        const d = getFinanzasCliente(cuenta);
        vendedorDe[cuenta] = d ? d.vendedor : null;
      }
      if (vendedorDe[cuenta] !== p.cod) continue;
    }

    const ts = f[I.ts] instanceof Date ? f[I.ts].toISOString() : String(f[I.ts]);
    pedidos.push({
      id: String(f[I.id]).trim(),
      numero: etiquetaPedido((I.numero >= 0 && Number(f[I.numero])) || i),
      fecha: ts,
      cliente: cuenta,
      nombreCliente: String(f[I.nombre] || ''),
      vendedor: String(f[I.vendedor] || ''),
      canal: String(f[I.canal] || ''),
      cantLineas: Number(f[I.cant]) || 0,
      totalBruto: Number(f[I.bruto]) || 0,
      descTotalPct: Number(f[I.descPct]) || 0,
      totalNeto: Number(f[I.neto]) || 0,
      motivo: String(f[I.motivo] || ''),
      obsLibre: String(f[I.obs] || ''),
      idOrigen: String(f[I.origen] || ''),
      revision: Number(f[I.revision]) || 0,
      lista: String(f[I.lista] || ''),
      fechaImpresion: f[I.fechaImp] instanceof Date ? f[I.fechaImp].toISOString() : '',
      impresoPor: nombreUsuario(f[I.impresoPor]),
      intentoImpresion: (I.intento >= 0 && f[I.intento] instanceof Date) ? f[I.intento].toISOString() : '',
      intentoPor: I.intentoPor >= 0 ? nombreUsuario(f[I.intentoPor]) : ''
    });
  }

  // Lineas de los pedidos elegidos, tambien con campos explicitos
  const ids = new Set(pedidos.map(x => x.id));
  const lin = ss.getSheetByName('pedidos_lineas').getDataRange().getValues();
  const encL = lin[0].map(x => String(x).trim());
  const cl = n => encL.indexOf(n);
  const L = {
    id: cl('id_pedido'), orden: cl('orden'), sku: cl('sku'), nombre: cl('nombre'),
    cant: cl('cantidad'), listaCli: cl('lista_cliente'), listaApl: cl('lista_aplicada'),
    mec: cl('mecanismo'), pu: cl('precio_unitario'), desc: cl('desc_efectivo_linea'),
    sub: cl('subtotal')
  };
  const porId = {};
  for (let i = 1; i < lin.length; i++) {
    const r = lin[i];
    const id = String(r[L.id]).trim();
    if (!ids.has(id)) continue;
    (porId[id] = porId[id] || []).push({
      orden: Number(r[L.orden]) || 0,
      sku: String(r[L.sku] || ''),
      nombre: String(r[L.nombre] || ''),
      cantidad: Number(r[L.cant]) || 0,
      listaCliente: String(r[L.listaCli] || ''),
      listaAplicada: String(r[L.listaApl] || ''),
      mecanismo: String(r[L.mec] || ''),
      precioUnitario: Number(r[L.pu]) || 0,
      descEfectivo: Number(r[L.desc]) || 0,
      subtotal: Number(r[L.sub]) || 0
    });
  }
  pedidos.forEach(pd => {
    pd.lineas = (porId[pd.id] || []).sort((a, b) => a.orden - b.orden);
  });

  return responder({ ok: true, modo, pedidos });
}

/**
 * Marca pedidos como impresos. Un pedido ya marcado conserva su primera
 * fecha: reimprimirlo no la cambia.
 */
function accionMarcarImpresos(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });
  const rol = String(p.rol || '').trim();
  if (!ROLES_IMPRIMIR.includes(rol)) return responder({ ok: false, error: 'rol_sin_permiso' });

  const ids = Array.isArray(body.ids)
    ? body.ids.map(x => String(x).trim()).filter(Boolean) : [];
  if (!ids.length) return responder({ ok: false, error: 'sin_ids' });
  const buscados = new Set(ids);
  const verTodos = ROLES_VER_TODOS.includes(rol);

  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const h = ss.getSheetByName('pedidos_cabecera');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const v = h.getDataRange().getValues();
    const enc = v[0].map(x => String(x).trim());
    const cId = enc.indexOf('id_pedido');
    const cCli = enc.indexOf('cliente');
    const cImp = enc.indexOf('impreso');
    const cFec = enc.indexOf('fecha_impresion');
    const cPor = enc.indexOf('impreso_por');
    if ([cImp, cFec, cPor].some(x => x < 0) || cFec !== cImp + 1 || cPor !== cImp + 2) {
      return responder({ ok: false, error: 'faltan_columnas' });
    }

    const ahora = new Date();
    const quien = String(p.usr || '');
    let marcados = 0, yaMarcados = 0, yaPropios = 0;

    for (let i = 1; i < v.length; i++) {
      const id = String(v[i][cId]).trim();
      if (!buscados.has(id)) continue;
      buscados.delete(id);

      if (!verTodos) {
        const d = getFinanzasCliente(String(v[i][cCli]).trim());
        if (!d || d.vendedor !== p.cod) continue;
      }
      if (String(v[i][cImp] || '').trim().toUpperCase() === 'SI') {
        // Si lo marco la misma persona, es su propio intento anterior (por
        // ejemplo, un reintento cuya primera respuesta no llego): no es alarma
        if (String(v[i][cPor] || '').trim() === quien) yaPropios++;
        else yaMarcados++;
        continue;
      }
      h.getRange(i + 1, cImp + 1, 1, 3).setValues([['SI', ahora, quien]]);
      marcados++;
    }

    return responder({ ok: true, marcados, yaMarcados, yaPropios, noEncontrados: Array.from(buscados) });

  } catch (err) {
    return responder({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}



// ---------- numero de pedido ----------

const PREFIJO_PEDIDO = 'APP-';
const COL_NUMERO = 30;   // columna AD de pedidos_cabecera

function etiquetaPedido(n) {
  return PREFIJO_PEDIDO + n;
}

/**
 * Siguiente numero de pedido. Sale de un contador propio, que no depende de
 * las filas: aunque se borren o archiven pedidos, nunca se repite un numero.
 * Como resguardo, nunca queda por debajo del mayor numero ya guardado.
 * Se llama siempre dentro del bloqueo de guardar_pedido.
 */
function siguienteNumeroPedido(hCab) {
  const props = PropertiesService.getScriptProperties();
  let ultimo = Number(props.getProperty('ultimo_numero_pedido')) || 0;

  const filas = hCab.getLastRow();
  if (filas > 1) {
    hCab.getRange(2, COL_NUMERO, filas - 1, 1).getValues().forEach(r => {
      const v = Number(r[0]) || 0;
      if (v > ultimo) ultimo = v;
    });
  }

  const siguiente = ultimo + 1;
  props.setProperty('ultimo_numero_pedido', String(siguiente));
  return siguiente;
}

/**
 * Para ejecutar a mano desde el editor, una sola vez, el dia del lanzamiento,
 * despues de borrar los pedidos de prueba. Si quedara algun pedido con numero,
 * el resguardo de siguienteNumeroPedido evita repetirlo igual.
 */
function reiniciarNumeracionPedidos() {
  PropertiesService.getScriptProperties().setProperty('ultimo_numero_pedido', '0');
  Logger.log('Numeracion de pedidos reiniciada');
}


/**
 * Registra o anula el intento de impresion de pedidos. Se registra antes de
 * abrir el dialogo de impresion: si la confirmacion nunca llega, el pedido
 * queda a la vista como "impresion sin confirmar" en lugar de depender de la
 * memoria de alguien. Se anula cuando la persona indica que no se imprimio.
 * Nunca toca pedidos ya marcados como impresos.
 */
function accionIntentoImpresion(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });
  const rol = String(p.rol || '').trim();
  if (!ROLES_IMPRIMIR.includes(rol)) return responder({ ok: false, error: 'rol_sin_permiso' });

  const anular = body.modo === 'anular';
  const ids = Array.isArray(body.ids)
    ? body.ids.map(x => String(x).trim()).filter(Boolean) : [];
  if (!ids.length) return responder({ ok: false, error: 'sin_ids' });
  const buscados = new Set(ids);
  const verTodos = ROLES_VER_TODOS.includes(rol);

  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const h = ss.getSheetByName('pedidos_cabecera');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const v = h.getDataRange().getValues();
    const enc = v[0].map(x => String(x).trim());
    const cId = enc.indexOf('id_pedido');
    const cCli = enc.indexOf('cliente');
    const cImp = enc.indexOf('impreso');
    const cInt = enc.indexOf('intento_impresion');
    const cPor = enc.indexOf('intento_por');
    if (cImp < 0 || cInt < 0 || cPor !== cInt + 1) {
      return responder({ ok: false, error: 'faltan_columnas' });
    }

    const ahora = new Date();
    const quien = String(p.usr || '');
    const valores = anular ? ['', ''] : [ahora, quien];
    let registrados = 0, yaImpresos = 0, deOtro = 0;

    for (let i = 1; i < v.length; i++) {
      const id = String(v[i][cId]).trim();
      if (!buscados.has(id)) continue;
      buscados.delete(id);

      if (!verTodos) {
        const d = getFinanzasCliente(String(v[i][cCli]).trim());
        if (!d || d.vendedor !== p.cod) continue;
      }
      if (String(v[i][cImp] || '').trim().toUpperCase() === 'SI') {
        yaImpresos++;
        continue;
      }

      const hayIntento = v[i][cInt] !== '' && v[i][cInt] !== null;
      const esPropio = String(v[i][cPor] || '').trim() === quien;
      if (hayIntento && !esPropio) {
        // Solo se anula el intento propio, nunca el de otra persona. Al
        // registrar, tampoco se pisa el de otra persona, salvo que se pida
        // reemplazarlo ("Imprimir de nuevo" desde la bandeja)
        if (anular || !body.reemplazar) {
          deOtro++;
          continue;
        }
      }

      h.getRange(i + 1, cInt + 1, 1, 2).setValues([valores]);
      registrados++;
    }

    return responder({ ok: true, registrados, yaImpresos, deOtro, noEncontrados: Array.from(buscados) });

  } catch (err) {
    return responder({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}