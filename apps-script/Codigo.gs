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
    modoObservacion: String(cfg.modo_observacion).toUpperCase() === 'SI',
    // Observaciones de la hoja "observaciones": solo las activas. La lista de
    // texto de arriba (observaciones) queda para la app anterior
    catalogoObservaciones: getObservaciones().filter(o => o.activa).map(o => ({
      clave: o.clave, codigo: o.codigo, texto: o.texto, grupo: o.grupo, efecto: o.efecto
    }))
  });
}

function limpiarCacheConfig() {
  // Tambien la lista de observaciones: se edita en la misma planilla
  CacheService.getScriptCache().removeAll(['config_mapa', 'obs_catalogo']);
  console.log('Cache de configuracion y observaciones limpiada');
}

// ---------- observaciones del pedido ----------

const HOJA_OBS = 'observaciones';
const HOJA_PED_OBS = 'pedidos_observaciones';
// Columnas de pedidos_observaciones, en este orden: una fila por articulo
// (las observaciones sin articulos, una fila sin sku)
const COLS_PED_OBS = ['id_pedido', 'fecha', 'cliente', 'numero', 'orden_obs', 'clave',
  'codigo', 'texto', 'grupo', 'efecto', 'lado', 'orden_item', 'sku', 'nombre',
  'cantidad', 'precio_lista', 'mecanismo', 'lista_aplicada', 'desc_linea_pct', 'precio_unitario'];
// Precio de la 117: mecanismos y descuentos que acepta (11,65 = -7% y ademas -5%)
const MECANISMOS_117 = ['lista_cliente', 'otra_lista', 'precio_libre'];
const DESC_117 = [0, 5, 7, 11.65];
const EFECTOS_OBS = ['informativa', 'descuenta', 'suma', 'ajuste'];
const MAX_OBS = 20;
const MAX_ITEMS_OBS = 60;

function normalizarObs(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Lista de la hoja "observaciones" (codigo, texto, grupo, efecto, activa),
 * incluidas las inactivas: guardar_pedido las necesita para rechazarlas.
 * clave: el codigo, o el texto si no tiene (las de Condiciones).
 * Sin la hoja: lista vacia, y la app no ofrece las observaciones nuevas.
 */
function getObservaciones() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('obs_catalogo');
  if (guardado) return JSON.parse(guardado);

  const lista = [];
  const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName(HOJA_OBS);
  if (hoja) {
    const datos = hoja.getDataRange().getValues();
    const enc = datos[0].map(normalizarObs);
    const I = { codigo: enc.indexOf('codigo'), texto: enc.indexOf('texto'), grupo: enc.indexOf('grupo'),
                efecto: enc.indexOf('efecto'), activa: enc.indexOf('activa') };
    for (let i = 1; i < datos.length; i++) {
      const f = datos[i];
      const texto = I.texto >= 0 ? String(f[I.texto] || '').trim() : '';
      if (!texto) continue;
      const codigo = I.codigo >= 0 ? String(f[I.codigo] || '').trim() : '';
      const efecto = normalizarObs(f[I.efecto]);
      lista.push({
        clave: codigo || texto,
        codigo,
        texto,
        // Las de Mercaderia llevan articulos; las de Condiciones, nada mas
        grupo: normalizarObs(f[I.grupo]) === 'mercaderia' ? 'mercaderia' : 'condiciones',
        efecto: EFECTOS_OBS.indexOf(efecto) >= 0 ? efecto : 'informativa',
        activa: I.activa < 0 || String(f[I.activa]).trim().toUpperCase() === 'SI'
      });
    }
  }
  cache.put('obs_catalogo', JSON.stringify(lista), 3600);
  return lista;
}

/**
 * Observaciones de un pedido, validadas contra la hoja: texto, grupo y
 * efecto salen de la planilla, nunca del navegador. Del navegador se toman
 * solo la clave, los articulos (codigo, nombre y cantidad), el lado en la de
 * ajuste, el precio de lista actual (etapa 2) y, en la 117, el precio que
 * definio el vendedor. Devuelve { obs } o { error }.
 */
function validarObservaciones(entrada) {
  if (!entrada) return { obs: [] };
  if (!Array.isArray(entrada) || entrada.length > MAX_OBS) return { error: 'observaciones_invalidas' };

  const catalogo = {};
  getObservaciones().forEach(o => { catalogo[o.clave] = o; });

  const obs = [];
  for (let k = 0; k < entrada.length; k++) {
    const e = entrada[k] || {};
    const def = catalogo[String(e.clave || '').trim()];
    if (!def || !def.activa) return { error: 'observacion_inactiva' };

    const items = [];
    if (def.grupo === 'mercaderia') {
      if (!Array.isArray(e.items) || !e.items.length || e.items.length > MAX_ITEMS_OBS) {
        return { error: 'observacion_sin_articulos' };
      }
      for (let j = 0; j < e.items.length; j++) {
        const it = e.items[j] || {};
        const sku = String(it.sku || '').trim().toUpperCase();
        const cantidad = Number(it.cantidad);
        if (!sku || !(cantidad > 0)) return { error: 'observacion_sin_cantidad' };
        const precio = Number(it.precioLista);
        const item = {
          sku,
          nombre: String(it.nombre || '').slice(0, 200),
          cantidad,
          // Lado solo en la de ajuste
          lado: def.efecto === 'ajuste' ? (it.lado === 'correspondia' ? 'correspondia' : 'facturado') : '',
          precioLista: precio > 0 ? Math.round(precio * 100) / 100 : '',
          mecanismo: '', listaAplicada: '', descLinea: '', precioUnitario: ''
        };
        // La 117: el precio que definio el vendedor es el final, sin el
        // descuento sobre el total. Un navegador sin actualizar no lo manda:
        // queda como antes (lista actual con el descuento del pedido)
        if (def.efecto === 'suma' && it.precio !== undefined) {
          const mec = String(it.mecanismo || '');
          const pu = Number(it.precio);
          const dsc = Number(it.descuentoLinea) || 0;
          if (MECANISMOS_117.indexOf(mec) < 0 || !(pu > 0) || DESC_117.indexOf(dsc) < 0) {
            return { error: 'observacion_sin_precio' };
          }
          item.mecanismo = mec;
          item.listaAplicada = mec === 'precio_libre' ? '' : String(it.listaAplicada || '').trim().toUpperCase().slice(0, 2);
          item.descLinea = dsc;
          item.precioUnitario = Math.round(pu * 100) / 100;
        }
        items.push(item);
      }
      if (def.efecto === 'ajuste' &&
          !(items.some(i => i.lado === 'facturado') && items.some(i => i.lado === 'correspondia'))) {
        return { error: 'ajuste_incompleto' };
      }
    }
    obs.push({ clave: def.clave, codigo: def.codigo, texto: def.texto, grupo: def.grupo,
               efecto: def.efecto, items });
  }
  return { obs };
}

/** Resumen de texto para motivo_obs (compatibilidad): "113 MERCADERIA ... (2 art.) · PAGA TOTAL DE BOLETA" */
function resumenObservaciones(obs) {
  return obs.map(o => (o.codigo ? o.codigo + ' ' : '') + o.texto +
    (o.items.length ? ' (' + o.items.length + ' art.)' : '')).join(' · ');
}

/**
 * Observaciones de los pedidos elegidos, leidas de pedidos_observaciones de
 * una vez. Devuelve id -> [{ orden, clave, codigo, texto, grupo, efecto,
 * items: [{ orden, lado, sku, nombre, cantidad, precioLista }] }]
 */
function leerObservacionesDe(ss, ids) {
  const res = {};
  const hoja = ss.getSheetByName(HOJA_PED_OBS);
  if (!hoja || hoja.getLastRow() < 2 || !ids.size) return res;

  const C = {};
  COLS_PED_OBS.forEach((n, k) => { C[n] = k; });
  const v = hoja.getRange(2, 1, hoja.getLastRow() - 1, COLS_PED_OBS.length).getValues();

  v.forEach(r => {
    const id = String(r[C.id_pedido]).trim();
    if (!ids.has(id)) return;
    const lista = res[id] = res[id] || [];
    const orden = Number(r[C.orden_obs]) || 0;
    // La misma observacion repetida en un pedido (por ejemplo, dos 116, una
    // por articulo) se junta bajo un solo titulo, con todos sus articulos
    const clave = String(r[C.clave] || '').trim() || '#' + orden;
    let o = lista.find(x => x.clave === clave);
    if (!o) {
      o = { orden, clave, codigo: String(r[C.codigo] || ''),
            texto: String(r[C.texto] || ''), grupo: String(r[C.grupo] || ''),
            efecto: String(r[C.efecto] || 'informativa'), items: [] };
      lista.push(o);
    }
    o.orden = Math.min(o.orden, orden);
    if (String(r[C.sku] || '').trim()) {
      o.items.push({
        // Primero por observacion y despues por articulo: al juntar dos, los
        // articulos quedan en el orden en que se cargaron
        orden: orden * 1000 + (Number(r[C.orden_item]) || 0),
        lado: String(r[C.lado] || ''),
        sku: String(r[C.sku]).trim(),
        nombre: String(r[C.nombre] || ''),
        cantidad: Number(r[C.cantidad]) || 0,
        precioLista: Number(r[C.precio_lista]) || null,
        mecanismo: String(r[C.mecanismo] || ''),
        listaAplicada: String(r[C.lista_aplicada] || ''),
        descLinea: r[C.desc_linea_pct] === '' ? null : Number(r[C.desc_linea_pct]) || 0,
        // Precio que definio el vendedor en la 117 (los pedidos de antes: null)
        precioAcordado: Number(r[C.precio_unitario]) || null
      });
    }
  });

  Object.keys(res).forEach(id => {
    res[id].sort((a, b) => a.orden - b.orden);
    res[id].forEach(o => o.items.sort((a, b) => a.orden - b.orden));
  });
  return res;
}

/**
 * Precio e importe de cada articulo de una observacion, con su origen
 * ({ tipo: 'anterior', numero, fecha } o { tipo: 'lista' }; null: verificar).
 * - descuenta (116, 119): precio anterior; importe negativo.
 * - suma (117): el precio que definio el vendedor en cada articulo (lista,
 *   otra lista o precio especial, con su descuento), y es el final: sin el
 *   descuento sobre el total. Los pedidos de antes, sin ese precio: lista
 *   actual (la que mando el navegador) con el descuento sobre el total.
 * - ajuste (126): lo que correspondia menos lo facturado. Lo facturado, a
 *   precio anterior; lo que correspondia, al mismo precio anterior si es el
 *   mismo articulo, si no a lista actual sin descuentos. Siempre a verificar.
 * o.importe: con signo (negativo descuenta), o null si falta algun precio o
 * si es informativa. Siempre se define: la app lo usa para saber que el
 * servidor ya calcula importes.
 * anterior(sku): { precio, numero, fecha } o null.
 */
function calcularImportesObs(o, factorTotal, anterior) {
  o.importe = null;
  o.verificar = o.efecto === 'ajuste';
  if (o.efecto === 'informativa' || !o.items.length) return;

  let total = 0;
  let completo = true;
  const desde = a => (a ? { tipo: 'anterior', numero: a.numero, fecha: a.fecha } : null);
  const poner = (it, precio, origen, signo) => {
    it.precio = precio;
    it.origen = precio === null ? null : origen;
    it.importe = precio === null ? null : Math.round(signo * precio * it.cantidad * 100) / 100;
    if (it.importe === null) completo = false;
    else total += it.importe;
  };

  const facturado = {};   // sku -> precio anterior de lo facturado (en la de ajuste)
  o.items.forEach(it => {
    if (o.efecto === 'suma') {
      if (it.precioAcordado) {
        // El precio que definio el vendedor: es el final, sin el descuento sobre el total
        poner(it, it.precioAcordado, { tipo: 'acordado', mecanismo: it.mecanismo,
          lista: it.listaAplicada, desc: it.descLinea }, 1);
      } else {
        // Pedidos de antes: lista actual con el descuento sobre el total, como hasta ahora
        const p = it.precioLista ? Math.round(it.precioLista * factorTotal * 100) / 100 : null;
        poner(it, p, { tipo: 'lista' }, 1);
      }
    } else if (o.efecto === 'descuenta' || it.lado === 'facturado') {
      const a = anterior(it.sku);
      if (it.lado === 'facturado') facturado[it.sku] = a;
      poner(it, a ? a.precio : null, desde(a), -1);
    }
  });
  if (o.efecto === 'ajuste') {
    o.items.filter(it => it.lado === 'correspondia').forEach(it => {
      if (it.sku in facturado) {
        const a = facturado[it.sku];
        poner(it, a ? a.precio : null, desde(a), 1);
      } else {
        poner(it, it.precioLista || null, { tipo: 'lista' }, 1);
      }
    });
  }

  o.importe = completo ? Math.round(total * 100) / 100 : null;
  if (!completo) o.verificar = true;
}

// ---------- pedidos ----------

/**
 * Factor del descuento sobre el total (uno o dos en cascada) para las lineas
 * que no estan en promocion: (neto - promo) / (bruto - promo). Sale de los
 * totales del pedido, asi que vale aunque el navegador no mande los
 * porcentajes, y las franjas suman el total neto guardado. Es la misma
 * cuenta que hace el panel del vendedor (carrito-panel.js, vistaVendedor).
 */
function factorDescuentoTotal(lineas, totalNeto) {
  let bruto = 0, promo = 0;
  lineas.forEach(l => {
    const s = Number(l.subtotal) || 0;
    bruto += s;
    if (l.mecanismo === 'promocion') promo += s;
  });
  const descontable = bruto - promo;
  const neto = Number(totalNeto);
  if (!(descontable > 0) || !(neto > 0)) return 1;
  const f = (neto - promo) / descontable;
  // Resguardo: un total inconsistente no puede inflar ni anular las lineas
  return f > 0 && f <= 1 ? f : 1;
}

/**
 * Semaforo del pedido, calculado en el servidor para que valga igual
 * en los pedidos del vendedor y en los del cliente, que no recibe el cupo.
 * Acumula las lineas en orden: verde hasta el cupo, amarillo hasta un 30%
 * por encima, rojo mas alla.
 * Mide contra el neto: el cupo es capacidad de pago y lo que compromete el
 * credito es lo que el cliente va a pagar. El descuento sobre el total no
 * alcanza a las lineas en promocion.
 */
function calcularSemaforo(lineas, cupo, totalNeto) {
  const res = {
    cupo: cupo,
    verde: 0, amarillo: 0, rojo: 0,
    colores: [],
    peor: 'verde'
  };

  const factor = factorDescuentoTotal(lineas, totalNeto);
  const netoDe = l => (Number(l.subtotal) || 0) * (l.mecanismo === 'promocion' ? 1 : factor);

  if (!cupo || cupo <= 0) {
    // Sin cupo disponible, todo el pedido queda en rojo
    lineas.forEach(l => {
      res.colores.push('rojo');
      res.rojo += netoDe(l);
    });
    res.peor = lineas.length ? 'rojo' : 'verde';
    return res;
  }

  let acum = 0;
  lineas.forEach(l => {
    const neto = netoDe(l);
    acum += neto;
    let color;
    if (acum <= cupo) color = 'verde';
    else if (acum <= cupo * 1.3) color = 'amarillo';
    else color = 'rojo';

    res.colores.push(color);
    res[color] += neto;

    if (color === 'rojo') res.peor = 'rojo';
    else if (color === 'amarillo' && res.peor === 'verde') res.peor = 'amarillo';
  });

  return res;
}

// ---------- guardar pedido: orden de escritura, reintentos e idempotencia ----------
// Orden: lineas, observaciones y al final la cabecera. Que exista la cabecera
// confirma que el pedido esta completo. Cada escritura revisa antes lo que ya
// esta con ese id y escribe solo lo que falta: asi se puede reintentar sin
// duplicar (Google puede informar una falla aunque haya escrito).

// "El servicio Hojas de calculo fallo al acceder al documento" y parecidos:
// se reintenta dentro del mismo bloqueo, con pausas cortas (3 intentos)
const VERSION_API = 'v36-pedido-verificado';
// Registro de cada guardado (solo se agregan filas). Si la hoja no existe se
// omite: se crea una vez desde el editor con crearRegistroGuardados()
const HOJA_REGISTRO = 'registro_guardados';
const COLS_REGISTRO = ['fecha_hora', 'id_pedido', 'numero', 'cuenta', 'cant_lineas', 'total_neto',
  'fila_cabecera', 'verificacion', 'version', 'duracion_ms'];
const PAUSAS_REINTENTO_MS = [1000, 2000];
const ERROR_TRANSITORIO = /Hojas de c[aá]lculo fall[oó]|Spreadsheets failed|timed out|tiempo de espera|se agot[oó] el tiempo|Internal error|error interno|Service error|error del servicio|Service unavailable|vuelve a intentarlo|try again/i;

/**
 * Corre escribir(intento) y, ante un error transitorio, lo repite. escribir
 * relee lo que ya esta y termina con su propio flush: asi la falla aparece
 * dentro del reintento, y repetir nunca duplica
 */
function conReintentos(escribir, que) {
  for (let i = 0; ; i++) {
    try {
      return escribir(i);
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (i >= PAUSAS_REINTENTO_MS.length || !ERROR_TRANSITORIO.test(msg)) throw err;
      console.warn('guardar_pedido: reintento ' + (i + 1) + ' (' + que + '): ' + msg);
      Utilities.sleep(PAUSAS_REINTENTO_MS[i]);
    }
  }
}

/**
 * Numeros de fila con ese id exacto en la columna A (desde la fila 2). Una sola
 * llamada a la planilla: TextFinder sobre la columna abierta (A2:A), sin
 * preguntar antes la ultima fila
 */
function filasDeId(hoja, id) {
  return hoja.getRange('A2:A').createTextFinder(String(id)).matchEntireCell(true).matchCase(true)
    .findAll().map(c => c.getRow());
}

/**
 * Filas de una hoja con ese id en la columna A, como [numero de fila, valores].
 * Se lee solo el tramo entre la primera y la ultima que aparece (pedidos_lineas
 * es la mas grande). Sin coincidencias, no lee nada
 */
function filasConId(hoja, id, nCols) {
  const nums = filasDeId(hoja, id);
  if (!nums.length) return [];
  const desde = Math.min.apply(null, nums);
  const hasta = Math.max.apply(null, nums);
  return hoja.getRange(desde, 1, hasta - desde + 1, nCols).getValues()
    .map((v, k) => [desde + k, v])
    .filter(x => String(x[1][0]).trim() === String(id));
}

/** Filas de pedidos_lineas de un pedido (orden 1..n), con el color de cada una */
function filasLineasPedido(ped, sem) {
  return ped.lineas.map((l, i) => ([
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
    sem.colores[i] || '',
    // desc_linea_pct (columna O): el porcentaje que eligio el vendedor.
    // Sin el dato (navegador sin actualizar) queda vacio, no 0
    l.descuentoLinea === undefined || l.descuentoLinea === null || l.descuentoLinea === ''
      ? '' : Number(l.descuentoLinea) || 0
  ]));
}

/** La hoja de observaciones de pedidos, si tiene las columnas en orden; si no, null */
function hojaObsPedidos(ss) {
  const h = ss.getSheetByName(HOJA_PED_OBS);
  if (!h) return null;
  const enc = h.getRange(1, 1, 1, COLS_PED_OBS.length).getValues()[0].map(x => String(x).trim());
  return COLS_PED_OBS.some((n, k) => enc[k] !== n) ? null : h;
}

/** Filas de pedidos_observaciones: una por articulo; las que no llevan articulos, una sin sku */
function filasObsPedido(id, fecha, cuenta, etiqueta, obs) {
  const filas = [];
  obs.forEach((o, k) => {
    (o.items.length ? o.items : [null]).forEach((it, j) => filas.push([
      id, fecha, cuenta, etiqueta, k + 1, o.clave, o.codigo, o.texto, o.grupo, o.efecto,
      it ? it.lado : '', it ? j + 1 : '', it ? it.sku : '', it ? it.nombre : '',
      it ? it.cantidad : '', it ? it.precioLista : '',
      it ? it.mecanismo : '', it ? it.listaAplicada : '', it ? it.descLinea : '', it ? it.precioUnitario : ''
    ]));
  });
  return filas;
}

/**
 * Lo que ya esta escrito de un pedido: filas de la cabecera (solo si
 * buscarCab), lineas ([fila, [id, orden, sku, nombre, cantidad]]) y filas de
 * observaciones. Se lee una vez y sirve para escribir solo lo que falta
 */
function leerEstado(hCab, hLin, hObs, id, buscarCab) {
  return {
    cab: buscarCab ? filasDeId(hCab, id) : [],
    lin: filasConId(hLin, id, 5),
    obs: hObs ? filasConId(hObs, id, COLS_PED_OBS.length) : []
  };
}

/**
 * Escribe lo que falta segun el estado leido: las lineas por su orden (si una
 * ya escrita tiene otro sku u otra cantidad, no escribe nada y lanza
 * 'lineas_con_otro_contenido'), las observaciones por orden_obs + orden_item
 * (corrigiendo el numero de las que dejo un intento anterior) y, al final, la
 * cabecera (appendRow con las 30 columnas, como el v34) si filaCab y no esta.
 * Sin flush: lo hace quien llama, una vez. Devuelve { n: filas de lineas y
 * observaciones que escribio, escribio: si escribio algo }.
 */
function escribirFaltantes(hCab, hLin, hObs, est, filasLin, filasObs, etiqueta, filaCab) {
  let escribio = false;
  const porOrden = {};
  filasLin.forEach(f => { porOrden[f[1]] = f; });
  const yaL = new Set();
  est.lin.forEach(x => {
    const v = x[1];
    const orden = Number(v[1]) || 0;
    const f = porOrden[orden];
    if (f && (String(v[2]).trim().toUpperCase() !== String(f[2]).trim().toUpperCase() ||
              Number(v[4]) !== Number(f[4]))) {
      throw new Error('lineas_con_otro_contenido');
    }
    yaL.add(orden);
  });
  const faltanL = filasLin.filter(f => !yaL.has(f[1]));

  let faltanO = [], obsOtroNumero = [];
  if (hObs && filasObs.length) {
    const clave = f => f[4] + '|' + f[11];
    const yaO = new Set();
    est.obs.forEach(x => {
      yaO.add(clave(x[1]));
      if (String(x[1][3]) !== String(etiqueta)) obsOtroNumero.push(x[0]);
    });
    faltanO = filasObs.filter(f => !yaO.has(clave(f)));
  }

  // Primero todas las lecturas (donde agregar) y despues todas las escrituras:
  // una lectura en medio obligaria a Google a confirmar lo pendiente
  const ultLin = faltanL.length ? hLin.getLastRow() : 0;
  const ultObs = faltanO.length ? hObs.getLastRow() : 0;
  if (faltanL.length) {
    hLin.getRange(ultLin + 1, 1, faltanL.length, faltanL[0].length).setValues(faltanL);
    escribio = true;
  }
  obsOtroNumero.forEach(fila => { hObs.getRange(fila, 4).setValue(etiqueta); escribio = true; });
  if (faltanO.length) {
    hObs.getRange(ultObs + 1, 1, faltanO.length, COLS_PED_OBS.length).setValues(faltanO);
    escribio = true;
  }

  // La cabecera, al final: que exista confirma que el pedido esta completo
  if (filaCab && !est.cab.length) { hCab.appendRow(filaCab); escribio = true; }
  return { n: faltanL.length + faltanO.length, escribio };
}

/**
 * Lineas, observaciones y cabecera que falten, con un solo flush al final (y
 * solo si escribio algo). Cada intento relee lo que ya esta (salvo la cabecera
 * en el primer intento de un pedido nuevo: se sabe que no esta por la lectura
 * del principio, dentro del bloqueo). Devuelve { n, escribio, est }: est es el
 * estado leido en el ultimo intento.
 */
function guardarFaltantes(hCab, hLin, hObs, id, filasLin, filasObs, etiqueta, filaCab, cabSabidaAusente) {
  return conReintentos(i => {
    const est = leerEstado(hCab, hLin, hObs, id, !!filaCab && !(cabSabidaAusente && i === 0));
    const r = escribirFaltantes(hCab, hLin, hObs, est, filasLin, filasObs, etiqueta, filaCab);
    if (r.escribio) SpreadsheetApp.flush();
    return { ...r, est };
  }, 'pedido');
}

/**
 * Escribe en una fila los valores por nombre de encabezado (los que existan),
 * como el v34. enc: los encabezados, ya leidos
 */
function escribirPorEncabezado(hoja, fila, valores, enc) {
  Object.keys(valores).forEach(k => {
    const c = enc.indexOf(k);
    if (c >= 0) hoja.getRange(fila, c + 1).setValue(valores[k]);
  });
}

/**
 * Relee lo escrito, despues del flush: la fila de la cabecera (0 si no esta;
 * filaSabida: ya se leyo dentro del bloqueo, no se busca), cuantas lineas del
 * pedido hay (ordenes 1..n distintos) y cuantas filas de observaciones.
 * ok: esta todo. texto: que falta, para el registro.
 */
function verificarGuardado(hCab, hLin, hObs, id, nLineas, nObs, filaSabida) {
  const fila = filaSabida || filasDeId(hCab, id)[0] || 0;
  const lin = nLineas ? filasConId(hLin, id, 2) : [];
  const obs = nObs && hObs ? filasDeId(hObs, id).length : 0;
  return resultadoVerificacion(fila, lin, obs, nLineas, nObs);
}

/**
 * La misma verificacion con el estado que se acaba de leer, cuando no se
 * escribio nada: esa lectura (dentro del bloqueo) ya es la relectura
 */
function verificarDesdeEstado(est, nLineas, nObs, filaSabida) {
  return resultadoVerificacion(filaSabida || est.cab[0] || 0, est.lin, est.obs.length, nLineas, nObs);
}

function resultadoVerificacion(fila, lin, obs, nLineas, nObs) {
  const ordenes = new Set();
  lin.forEach(x => {
    const o = Number(x[1][1]) || 0;
    if (o >= 1 && o <= nLineas) ordenes.add(o);
  });
  const v = { fila, lineas: ordenes.size, obs };
  const faltas = [];
  if (!v.fila) faltas.push('sin cabecera');
  if (v.lineas < nLineas) faltas.push('lineas ' + v.lineas + ' de ' + nLineas);
  if (v.obs < nObs) faltas.push('obs ' + v.obs + ' de ' + nObs);
  v.ok = !faltas.length;
  v.texto = v.ok ? 'ok' : 'error: ' + faltas.join(', ');
  return v;
}

/**
 * Agrega una fila a registro_guardados. Nunca impide guardar: si la hoja no
 * existe se omite, y si Google falla queda solo un aviso en el registro de
 * ejecuciones. Sin flush propio: lo confirma confirmarEscrituras, antes de responder
 */
function registrarGuardado(ss, r) {
  try {
    const h = ss.getSheetByName(HOJA_REGISTRO);
    if (!h) return;
    h.appendRow([new Date(), r.id, r.numero || '', r.cuenta || '', r.lineas, r.neto, r.fila || '',
      r.verificacion, VERSION_API, Date.now() - r.inicio]);
  } catch (e) {
    console.warn('registro_guardados: ' + e);
  }
}

/**
 * Un flush antes de responder, para lo que queda despues de verificar (las
 * columnas por nombre y el registro). Si falla no cambia la respuesta: el
 * pedido ya se verifico, y una falla no puede aparecer despues de responder
 */
function confirmarEscrituras() {
  try {
    SpreadsheetApp.flush();
  } catch (e) {
    console.warn('guardar_pedido: flush final: ' + e);
  }
}

/** Para ejecutar una vez desde el editor: crea registro_guardados con sus encabezados */
function crearRegistroGuardados() {
  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  if (ss.getSheetByName(HOJA_REGISTRO)) { Logger.log('Ya existe ' + HOJA_REGISTRO); return; }
  const h = ss.insertSheet(HOJA_REGISTRO);
  h.getRange(1, 1, 1, COLS_REGISTRO.length).setValues([COLS_REGISTRO]);
  h.setFrozenRows(1);
  Logger.log('Creada ' + HOJA_REGISTRO);
}

/** Estado "anulado..." (a mano, en la planilla): el pedido no se muestra para imprimir ni revisar */
function esAnulado(estado) {
  return String(estado || '').trim().toLowerCase().indexOf('anulado') === 0;
}

function accionGuardarPedido(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });

  
  if (!ROLES_PEDIDO.includes(String(p.rol || '').trim())) {
    return responder({ ok: false, error: 'rol_sin_permiso' });
  }

  const ped = body.pedido;
  if (!ped || !Array.isArray(ped.lineas)) {
    return responder({ ok: false, error: 'pedido_vacio' });
  }

  // Observaciones: solo de un vendedor o admin, y validadas contra la hoja
  const conObs = Array.isArray(ped.observaciones) && ped.observaciones.length > 0;
  if (conObs && String(p.rol || '').trim() === 'cliente_estandar') {
    return responder({ ok: false, error: 'observaciones_no_permitidas' });
  }
  const vo = validarObservaciones(conObs ? ped.observaciones : null);
  if (vo.error) return responder({ ok: false, error: vo.error });
  const obs = vo.obs;

  // Sin articulos solo si tiene al menos una observacion (pedido solo de observaciones)
  if (!ped.lineas.length && !obs.length) {
    return responder({ ok: false, error: 'pedido_vacio' });
  }

  const cuenta = String(ped.cliente || '').trim();
  if (!cuenta) return responder({ ok: false, error: 'falta_cliente' });

  // Un vendedor solo puede pedir para sus clientes
  const datosCli = getFinanzasCliente(cuenta);

  // Semaforo calculado aca: el cliente no recibe el cupo, asi que su
  // navegador no puede calcularlo. Ademas el dato no depende del frontend.
  // Sobre el neto: el mismo total con el que se calcula el excedente
  const sem = calcularSemaforo(ped.lineas, Number(datosCli ? datosCli.cupoMes : 0), ped.totalNeto);
  const excedente = Math.round(((ped.totalNeto || 0) - sem.cupo) * 100) / 100;


  if (!datosCli) return responder({ ok: false, error: 'cliente_no_encontrado' });
  if (p.rol === 'vendedor_estandar' && datosCli.vendedor !== p.cod) {
    return responder({ ok: false, error: 'cliente_de_otro_vendedor' });
  }
  if (p.rol === 'cliente_estandar' && cuenta !== String(p.usr)) {
    return responder({ ok: false, error: 'no_autorizado' });
  }

  const inicio = Date.now();
  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const hCab = ss.getSheetByName('pedidos_cabecera');
  const hLin = ss.getSheetByName('pedidos_lineas');
  const filasLin = filasLineasPedido(ped, sem);
  // Datos del registro de guardados; numero, fila y verificacion se completan despues
  const reg = { inicio, id: ped.id, cuenta, lineas: ped.lineas.length, neto: ped.totalNeto || 0 };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    // Una sola lectura de la cabecera, dentro del bloqueo: sirve para saber si
    // el pedido ya existe, para los encabezados (columnas por nombre) y para el
    // numero (el mayor ya guardado)
    const filasCab = hCab.getDataRange().getValues();
    const encCab = filasCab[0].map(x => String(x).trim());

    // Idempotencia: si ya existe la cabecera con ese id, no se duplica. Si el
    // contenido no coincide, se avisa en vez de responder exito en silencio.
    // Si coincide, se completan las lineas y observaciones que falten, se
    // verifica y se responde exito
    for (let i = 1; i < filasCab.length; i++) {
      if (String(filasCab[i][0]).trim() === String(ped.id)) {
        const mismasLineas = Number(filasCab[i][7]) === ped.lineas.length;
        const mismoTotal = Math.abs(Number(filasCab[i][10]) - Number(ped.totalNeto || 0)) < 0.01;
        const numGuardado = etiquetaGuardada(filasCab[i][COL_NUMERO - 1], i);
        reg.numero = numGuardado;
        if (!mismasLineas || !mismoTotal) {
          registrarGuardado(ss, { ...reg, fila: i + 1, verificacion: 'id_con_otro_contenido' });
          confirmarEscrituras();
          return responder({ ok: false, error: 'id_con_otro_contenido', numero: numGuardado, id: ped.id });
        }
        const hObsDup = obs.length ? hojaObsPedidos(ss) : null;
        const fechaCab = filasCab[i][1] instanceof Date ? filasCab[i][1] : new Date();
        const filasObsDup = hObsDup ? filasObsPedido(ped.id, fechaCab, cuenta, numGuardado, obs) : [];
        let completadas = 0, vd = null;
        for (let pasada = 1; pasada <= 2; pasada++) {
          const g = guardarFaltantes(hCab, hLin, hObsDup, ped.id, filasLin, filasObsDup, numGuardado, null, false);
          completadas += g.n;
          vd = g.escribio
            ? verificarGuardado(hCab, hLin, hObsDup, ped.id, filasLin.length, filasObsDup.length, i + 1)
            : verificarDesdeEstado(g.est, filasLin.length, filasObsDup.length, i + 1);
          if (vd.ok) break;
          console.warn('guardar_pedido: verificacion ' + pasada + ' (duplicado) ' + ped.id + ': ' + vd.texto);
        }
        if (!vd.ok) {
          registrarGuardado(ss, { ...reg, fila: vd.fila, verificacion: vd.texto });
          confirmarEscrituras();
          return responder({ ok: false, error: 'verificacion_fallida', id: ped.id });
        }
        if (completadas) console.warn('guardar_pedido: ' + ped.id + ' completado con ' + completadas + ' filas');
        registrarGuardado(ss, { ...reg, fila: vd.fila,
          verificacion: completadas ? 'duplicado, completadas ' + completadas : 'duplicado' });
        confirmarEscrituras();
        return responder({ ok: true, duplicado: true, numero: numGuardado, id: ped.id,
                           ...(completadas ? { completadas } : {}) });
      }
    }

    // Con observaciones, su hoja tiene que estar bien armada antes de escribir nada
    const hObs = obs.length ? hojaObsPedidos(ss) : null;
    if (obs.length && !hObs) {
      return responder({ ok: false, error: 'faltan_columnas_obs' });
    }

    const ahora = new Date();
    // El cliente de prueba lleva su propia numeracion (PRU-n, guardada como
    // texto): no consume ni altera la de los pedidos reales. El contador se
    // guarda recien despues de verificar: un intento fallido no consume numero
    const prueba = cuenta === cuentaPrueba();
    const numero = prueba ? siguienteNumeroPrueba(filasCab) : siguienteNumeroPedido(filasCab);
    const etiqueta = prueba ? numero : etiquetaPedido(numero);
    reg.numero = etiqueta;
    const filasObs = obs.length ? filasObsPedido(ped.id, ahora, cuenta, etiqueta, obs) : [];

    // La cabecera: 30 columnas por posicion (appendRow, como el v34) y despues
    // las de nombre. semaforo_base: criterio del semaforo (vacio en los pedidos
    // viejos, que se midieron sobre el bruto). desc_total_extra_pct: segundo
    // descuento sobre el total, en cascada (solo junto con el -7%)
    const extra = Number(ped.descuentoExtra) || 0;
    const porNombre = { semaforo_base: 'neto' };
    if (extra) porNombre.desc_total_extra_pct = extra;
    const filaCab = [
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
      obs.length ? resumenObservaciones(obs) : (ped.motivo || ''),
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
    ];

    // 1. Lineas, observaciones y cabecera que falten, con un flush; 2. releer y
    // confirmar que esta todo. Si falta algo, una segunda pasada escribe solo lo
    // que falta. Si sigue faltando: error, sin grabar el numero (la app deja el
    // pedido pendiente)
    let v = null;
    for (let pasada = 1; pasada <= 2; pasada++) {
      guardarFaltantes(hCab, hLin, hObs, ped.id, filasLin, filasObs, etiqueta, filaCab, pasada === 1);
      v = verificarGuardado(hCab, hLin, hObs, ped.id, filasLin.length, filasObs.length, 0);
      if (v.ok) break;
      console.warn('guardar_pedido: verificacion ' + pasada + ' ' + ped.id + ': ' + v.texto);
    }
    if (!v.ok) {
      registrarGuardado(ss, { ...reg, fila: v.fila, verificacion: v.texto });
      confirmarEscrituras();
      return responder({ ok: false, error: 'verificacion_fallida', id: ped.id });
    }

    guardarUltimoNumero(prueba, numero);
    // Lo que va despues de verificar (columnas por nombre y registro), con un
    // solo flush antes de responder
    try {
      escribirPorEncabezado(hCab, v.fila, porNombre, encCab);
    } catch (e) {
      console.warn('guardar_pedido: columnas por nombre de ' + ped.id + ': ' + e);
    }
    registrarGuardado(ss, { ...reg, fila: v.fila, verificacion: 'ok' });
    confirmarEscrituras();
    return responder({
      ok: true,
      id: ped.id,
      numero: etiqueta,
      prueba,
      fecha: ahora.toISOString()
    });

  } catch (err) {
    const msg = String((err && err.message) || err);
    registrarGuardado(ss, { ...reg, verificacion: msg === 'lineas_con_otro_contenido' ? msg : 'error: ' + msg });
    confirmarEscrituras();
    if (msg === 'lineas_con_otro_contenido') return responder({ ok: false, error: msg, id: ped.id });
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

  // Una revision anulada no cuenta: el pedido del cliente vuelve a quedar
  // para revisar. Columna estado: O (14)
  const revisados = new Set();
  for (let i = 1; i < cab.length; i++) {
    const origen = String(cab[i][15]).trim();
    if (origen && !esAnulado(cab[i][14])) revisados.add(origen);
  }

  // Vendedor de cada cliente, para mostrar solo los propios
  const fin = ss.getSheetByName('finanzas').getDataRange().getValues();
  const vendedorDe = {};
  for (let i = 1; i < fin.length; i++) {
    vendedorDe[String(fin[i][0]).trim()] = String(fin[i][2]).trim();
  }

  // Los pedidos de prueba los ve solo un admin, marcados
  const cp = cuentaPrueba();
  const esAdmin = String(p.rol || '').trim() === 'admin';

  const pedidos = [];
  for (let i = 1; i < cab.length; i++) {
    const f = cab[i];
    const id = String(f[0]).trim();
    const cliente = String(f[2]).trim();

    if (!id || revisados.has(id)) continue;
    if (esAnulado(f[14])) continue;                  // anulado a mano en la planilla
    if (String(f[5]).trim() !== cliente) continue;   // lo cargo un vendedor
    if (p.rol === 'vendedor_estandar' && vendedorDe[cliente] !== p.cod) continue;
    const prueba = esPedidoPrueba(f[COL_NUMERO - 1], cliente, cp);
    if (prueba && !esAdmin) continue;

    pedidos.push({
      id,
      prueba,
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

// ---------- historial de compras del cliente ----------

// Una fila por cliente: cuenta, actualizado, articulos y el historial de 12
// meses comprimido (gzip y base64). La escribe scripts/historial_compras.py
const HOJA_HISTORIAL = 'historial';
const ROLES_HISTORIAL = ['admin', 'vendedor_estandar'];
// En la cache, para un cliente sin fila: asi no se busca en la hoja cada vez
const SIN_HISTORIAL = '-';

/**
 * Historial descomprimido de una cuenta, o null si no tiene. Formato v2:
 * { v: 2, act, a: [[codigo, fecha, cantidad, precio, veces, intervalo,
 * cantidadTipica], ...] }. Se lee solo la fila de la cuenta, y el texto
 * comprimido queda 6 horas en la cache.
 */
function getHistorialCliente(cuenta) {
  const cache = CacheService.getScriptCache();
  const clave = 'hist_' + cuenta;

  let comprimido = cache.get(clave);
  if (comprimido === null) {
    comprimido = SIN_HISTORIAL;
    const hoja = SpreadsheetApp.openById(PLANILLA_ID).getSheetByName(HOJA_HISTORIAL);
    if (hoja && hoja.getLastRow() > 1) {
      const celda = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1)
        .createTextFinder(cuenta).matchEntireCell(true).findNext();
      if (celda) comprimido = String(hoja.getRange(celda.getRow(), 4).getValue()) || SIN_HISTORIAL;
    }
    cache.put(clave, comprimido, 21600);
  }
  if (comprimido === SIN_HISTORIAL) return null;

  const blob = Utilities.newBlob(Utilities.base64Decode(comprimido), 'application/x-gzip');
  return JSON.parse(Utilities.ungzip(blob).getDataAsString('UTF-8'));
}

/**
 * Lo que compro un cliente en los ultimos 12 meses, para el buscador, la
 * tarjeta y los habituales: solo a un admin o al vendedor del cliente. Ni el
 * precio, ni el intervalo, ni los comprobantes salen del servidor: el navegador
 * recibe codigo, fecha y cantidad de la ultima compra de cada articulo, y las
 * dos listas que arma la rutina (celda v3): habituales [codigo, veces, cantidad
 * tipica, ultima, desde cuando le toca] y dejo de comprar [codigo, veces,
 * cantidad tipica, ultima]. Con una celda v2 las listas van vacias.
 */
function accionHistorialCliente(body) {
  const p = verificarToken(body.token);
  if (!p) return responder({ ok: false, error: 'token_invalido' });
  const rol = String(p.rol || '').trim();
  if (!ROLES_HISTORIAL.includes(rol)) return responder({ ok: false, error: 'rol_sin_permiso' });

  const cuenta = String(body.cuenta || '').trim();
  if (!cuenta) return responder({ ok: false, error: 'falta_cuenta' });

  // Un vendedor solo ve SUS clientes: el mismo control que finanzas, con el
  // codigo del token firmado contra la columna Vendedor de la planilla
  if (rol === 'vendedor_estandar') {
    const datos = getFinanzasCliente(cuenta);
    if (!datos || datos.vendedor !== p.cod) return responder({ ok: false, error: 'cliente_de_otro_vendedor' });
  }

  // Cliente de prueba, solo para un admin: con la clave historial_prueba de
  // config, recibe el historial de esa cuenta, para probar el carrito con
  // datos reales y pedidos de prueba (PRU). Vacia: no cambia nada
  let fuente = cuenta;
  if (rol === 'admin') {
    const cp = cuentaPrueba();
    const de = String(getConfig().historial_prueba || '').trim();
    if (cp && de && cuenta === cp) fuente = de;
  }

  const h = getHistorialCliente(fuente);
  return responder({
    ok: true,
    cuenta: cuenta,
    actualizado: h ? h.act : '',
    // Campo por campo, nombrados uno por uno: lo que se agregue a la celda
    // despues (precios, comprobantes) tampoco sale
    articulos: h ? h.a.map(x => [x[0], x[1], x[2]]) : [],
    habituales: h && Array.isArray(h.hab) ? h.hab.map(x => [x[0], x[1], x[2], x[3], x[4]]) : [],
    dejo: h && Array.isArray(h.dej) ? h.dej.map(x => [x[0], x[1], x[2], x[3]]) : []
  });
}

function limpiarCacheHistorial() {
  // Las cuentas con historial y todas las de finanzas: las que no tenian
  // fila tienen guardada la marca SIN_HISTORIAL
  const ss = SpreadsheetApp.openById(PLANILLA_ID);
  const claves = new Set();
  [HOJA_HISTORIAL, 'finanzas'].forEach(nombre => {
    const hoja = ss.getSheetByName(nombre);
    if (!hoja || hoja.getLastRow() < 2) return;
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues().forEach(f => {
      const c = String(f[0]).trim();
      if (c) claves.add('hist_' + c);
    });
  });

  const lista = [...claves];
  const cache = CacheService.getScriptCache();
  for (let i = 0; i < lista.length; i += 500) cache.removeAll(lista.slice(i, i + 500));
  console.log('Cache de historial limpiada:', lista.length, 'cuentas');
}

function probarHistorial() {
  const h = getHistorialCliente('40147');
  console.log('Cuenta 40147: ' + (h ? h.a.length + ' articulos, actualizado ' + h.act : 'sin historial'));
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
    if (accion === 'historial_cliente') return accionHistorialCliente(body);

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
      return responder({ ok: true, version: VERSION_API });
    }
    if (accion === 'limpiar_cache_fin') {
       limpiarCacheFinanzas();
       return responder({ ok: true, limpiado: true });
    }
    if (accion === 'limpiar_cache_usr') {
       limpiarCacheUsuarios();
       return responder({ ok: true, limpiado: true });
    }
    if (accion === 'limpiar_cache_hist') {
       limpiarCacheHistorial();
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

  // Pedidos de prueba: fuera de Pendientes e Impresos, salvo que un admin
  // pida verlos; entonces se ven solo esos
  const soloPruebas = rol === 'admin' && body.verPruebas === true;
  const cp = cuentaPrueba();

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
    descPct: c('desc_total_pct'), descExtra: c('desc_total_extra_pct'), neto: c('total_neto'), motivo: c('motivo_obs'),
    obs: c('obs_libre'), origen: c('id_pedido_origen'), revision: c('revision'), lista: c('lista'),
    impreso: c('impreso'), fechaImp: c('fecha_impresion'), impresoPor: c('impreso_por'),
    rolCreador: c('rol_creador'), numero: c('numero'),
    intento: c('intento_impresion'), intentoPor: c('intento_por'),
    // Sin el encabezado, la columna O, donde la escribe guardar_pedido
    estado: c('estado') >= 0 ? c('estado') : 14
  };
  // Ids de todas las cabeceras (anulados, pruebas e impresos incluidos), para
  // el aviso de lineas sin cabecera (solo admin y oficina)
  const idsCab = verTodos ? new Set(cab.slice(1).map(f => String(f[I.id]).trim())) : null;
  const sinCab = {};
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
  const previos = {};   // id -> pedido impreso con articulos (para el precio anterior)

  for (let i = 1; i < cab.length; i++) {
    const f = cab[i];
    if (!f[I.id]) continue;

    // Anulado a mano en la planilla ("anulado", "Anulado: incompleto"...): no
    // aparece en ninguna pestaña ni en el bloque de incompletos, ni sirve de
    // precio anterior para las observaciones
    if (esAnulado(f[I.estado])) continue;

    // Solo pedidos armados o revisados por un vendedor o administrador
    const rc = String(f[I.rolCreador] || '').trim();
    if (!rc || rc === 'cliente_estandar') continue;

    const prueba = esPedidoPrueba(I.numero >= 0 ? f[I.numero] : '', f[I.cliente], cp);
    const impreso = String(f[I.impreso] || '').trim().toUpperCase() === 'SI';

    // Para el precio anterior de las observaciones: los pedidos ya impresos,
    // armados o revisados por un vendedor o admin (filtro de arriba), con
    // articulos (los de solo observaciones no). Se elige al recorrer las lineas
    if (impreso && Number(f[I.cant]) > 0) {
      previos[String(f[I.id]).trim()] = {
        cliente: String(f[I.cliente]).trim(),
        prueba,
        ts: f[I.ts] instanceof Date ? f[I.ts] : new Date(f[I.ts]),
        numero: etiquetaGuardada(I.numero >= 0 ? f[I.numero] : '', i),
        neto: Number(f[I.neto]) || 0
      };
    }

    if (prueba !== soloPruebas) continue;
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
      numero: etiquetaGuardada(I.numero >= 0 ? f[I.numero] : '', i),
      prueba,
      fecha: ts,
      cliente: cuenta,
      nombreCliente: String(f[I.nombre] || ''),
      vendedor: String(f[I.vendedor] || ''),
      canal: String(f[I.canal] || ''),
      cantLineas: Number(f[I.cant]) || 0,
      totalBruto: Number(f[I.bruto]) || 0,
      descTotalPct: Number(f[I.descPct]) || 0,
      descTotalExtraPct: I.descExtra >= 0 ? Number(f[I.descExtra]) || 0 : 0,
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

  // Observaciones de los pedidos elegidos (los viejos no tienen: lista vacia)
  const obsPorId = leerObservacionesDe(ss, ids);
  pedidos.forEach(pd => { pd.observaciones = obsPorId[pd.id] || []; });

  // Articulos que necesitan precio anterior, por cliente y entorno: un pedido
  // de prueba busca solo entre los de prueba, y uno real, solo entre los reales
  const claveBusqueda = (cliente, prueba, sku) =>
    cliente + '|' + (prueba ? 1 : 0) + '|' + String(sku).trim().toUpperCase();
  const buscados = {};
  const clientesBuscan = new Set();
  pedidos.forEach(pd => pd.observaciones.forEach(o => o.items.forEach(it => {
    if (o.efecto === 'descuenta' || (o.efecto === 'ajuste' && it.lado === 'facturado')) {
      buscados[claveBusqueda(pd.cliente, pd.prueba, it.sku)] = true;
      clientesBuscan.add(pd.cliente);
    }
  })));

  const lin = ss.getSheetByName('pedidos_lineas').getDataRange().getValues();
  const encL = lin[0].map(x => String(x).trim());
  const cl = n => encL.indexOf(n);
  const L = {
    id: cl('id_pedido'), orden: cl('orden'), sku: cl('sku'), nombre: cl('nombre'),
    cant: cl('cantidad'), listaCli: cl('lista_cliente'), listaApl: cl('lista_aplicada'),
    mec: cl('mecanismo'), pu: cl('precio_unitario'), desc: cl('desc_efectivo_linea'),
    sub: cl('subtotal'), descSel: cl('desc_linea_pct')
  };
  const porId = {};
  const sumas = {};        // id previo -> { bruto, promo }: su descuento sobre el total
  const apariciones = {};  // clave de busqueda -> [{ id, pu, enPromo }]
  for (let i = 1; i < lin.length; i++) {
    const r = lin[i];
    const id = String(r[L.id]).trim();

    // Lineas sin cabecera: un pedido que no termino de guardarse
    if (idsCab && id && !idsCab.has(id)) sinCab[id] = (sinCab[id] || 0) + 1;

    // Solo los pedidos previos de los clientes que lo necesitan
    const pv = previos[id];
    if (pv && clientesBuscan.has(pv.cliente)) {
      const sub = Number(r[L.sub]) || 0;
      const enPromo = String(r[L.mec] || '') === 'promocion';
      const s = sumas[id] = sumas[id] || { bruto: 0, promo: 0 };
      s.bruto += sub;
      if (enPromo) s.promo += sub;
      const k = claveBusqueda(pv.cliente, pv.prueba, r[L.sku]);
      if (buscados[k]) (apariciones[k] = apariciones[k] || []).push({ id, pu: Number(r[L.pu]) || 0, enPromo });
    }

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
      // Porcentaje elegido por el vendedor; null en los pedidos sin ese dato
      descLinea: L.descSel >= 0 && r[L.descSel] !== '' && r[L.descSel] !== null
        ? Number(r[L.descSel]) || 0 : null,
      subtotal: Number(r[L.sub]) || 0
    });
  }
  /**
   * Precio neto unitario del pedido impreso mas reciente del cliente con ese
   * articulo, anterior al pedido que se imprime (una reimpresion da el mismo
   * precio): precio_unitario con el descuento sobre el total, que sale de los
   * totales del pedido (los dos descuentos en cascada); las lineas en
   * promocion no lo llevan
   */
  function precioAnterior(pd, sku) {
    const antesDe = new Date(pd.fecha);
    let mejor = null;
    (apariciones[claveBusqueda(pd.cliente, pd.prueba, sku)] || []).forEach(a => {
      const t = previos[a.id].ts;
      if (a.id === pd.id || !(t < antesDe)) return;
      if (!mejor || t > previos[mejor.id].ts) mejor = a;
    });
    if (!mejor) return null;
    const pv = previos[mejor.id];
    const s = sumas[mejor.id];
    const factor = mejor.enPromo ? 1 : factorDescuentoTotal(
      [{ subtotal: s.bruto - s.promo }, { subtotal: s.promo, mecanismo: 'promocion' }], pv.neto);
    return { precio: Math.round(mejor.pu * factor * 100) / 100, numero: pv.numero, fecha: pv.ts.toISOString() };
  }

  pedidos.forEach(pd => {
    pd.lineas = (porId[pd.id] || []).sort((a, b) => a.orden - b.orden);
    // La 117 de antes (sin precio del vendedor) lleva el descuento sobre el
    // total del pedido, en cascada
    const factorTotal = (1 - pd.descTotalPct / 100) * (1 - pd.descTotalExtraPct / 100);
    pd.observaciones.forEach(o => calcularImportesObs(o, factorTotal, sku => precioAnterior(pd, sku)));
  });

  const huerfanos = Object.keys(sinCab);
  return responder({ ok: true, modo, verPruebas: soloPruebas, pedidos,
    ...(idsCab ? { lineasSinCabecera: { total: huerfanos.length,
      pedidos: huerfanos.slice(0, 20).map(id => ({ id, lineas: sinCab[id] })) } } : {}) });
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



// ---------- cliente de prueba ----------

/**
 * Cuenta del cliente de prueba: clave cuenta_prueba de la hoja config. Sus
 * pedidos llevan numeracion propia (PRU-n) y no aparecen en la bandeja ni en
 * los pendientes de revision, salvo para un admin. Vacia: no hay cliente de
 * prueba y todo funciona como siempre.
 * Cualquier calculo nuevo sobre pedidos (precio anterior, estadisticas) tiene
 * que descartar los de prueba con esPedidoPrueba.
 */
function cuentaPrueba() {
  return String(getConfig().cuenta_prueba || '').trim();
}

/** El valor de la columna numero es de un pedido de prueba ("PRU-3") */
function esNumeroPrueba(valor) {
  return String(valor || '').trim().indexOf(PREFIJO_PRUEBA) === 0;
}

/**
 * Pedido de prueba: numerado PRU-, o de la cuenta de prueba actual (por si
 * entro con numero APP- antes de que se renovara la cache de config).
 * cp: cuentaPrueba(), leida una vez por consulta
 */
function esPedidoPrueba(valorNumero, cuenta, cp) {
  return esNumeroPrueba(valorNumero) || (!!cp && String(cuenta).trim() === cp);
}


// ---------- numero de pedido ----------

const PREFIJO_PEDIDO = 'APP-';
const PREFIJO_PRUEBA = 'PRU-';
const COL_NUMERO = 30;   // columna AD de pedidos_cabecera

function etiquetaPedido(n) {
  return PREFIJO_PEDIDO + n;
}

/**
 * Etiqueta de un pedido guardado. Los de prueba guardan en la columna numero
 * el texto completo ("PRU-3"); los reales, solo el numero. respaldo: el
 * numero a mostrar si la celda esta vacia (pedidos anteriores a la columna)
 */
function etiquetaGuardada(valor, respaldo) {
  if (esNumeroPrueba(valor)) return String(valor).trim();
  return etiquetaPedido(Number(valor) || respaldo);
}

/**
 * Siguiente numero de pedido, con los valores de pedidos_cabecera ya leidos
 * (filasCab). Sale de un contador propio, que no depende de
 * las filas: aunque se borren o archiven pedidos, nunca se repite un numero.
 * Como resguardo, nunca queda por debajo del mayor numero ya guardado.
 * Los pedidos de prueba ("PRU-n", texto) no cuentan: Number() les da 0.
 * Solo lo calcula: el contador se guarda con guardarUltimoNumero, despues de
 * escribir la cabecera (un intento fallido no consume numero). Se llama
 * siempre dentro del bloqueo de guardar_pedido.
 */
function siguienteNumeroPedido(filasCab) {
  let ultimo = Number(PropertiesService.getScriptProperties().getProperty('ultimo_numero_pedido')) || 0;
  for (let i = 1; i < filasCab.length; i++) {
    const v = Number(filasCab[i][COL_NUMERO - 1]) || 0;
    if (v > ultimo) ultimo = v;
  }
  return ultimo + 1;
}

/**
 * Siguiente numero de prueba ("PRU-n"), con su propio contador: nunca toca
 * el de los pedidos reales. El mismo resguardo: nunca por debajo del mayor
 * PRU- ya guardado. Solo lo calcula, como siguienteNumeroPedido.
 */
function siguienteNumeroPrueba(filasCab) {
  let ultimo = Number(PropertiesService.getScriptProperties().getProperty('ultimo_numero_prueba')) || 0;
  for (let i = 1; i < filasCab.length; i++) {
    const r = filasCab[i][COL_NUMERO - 1];
    if (!esNumeroPrueba(r)) continue;
    const v = Number(String(r).trim().slice(PREFIJO_PRUEBA.length)) || 0;
    if (v > ultimo) ultimo = v;
  }
  return PREFIJO_PRUEBA + (ultimo + 1);
}

/**
 * Guarda el contador despues de escribir la cabecera. Si Google falla aca, el
 * pedido ya esta guardado: no se responde error (el resguardo por el mayor
 * numero de la hoja evita repetirlo)
 */
function guardarUltimoNumero(prueba, numero) {
  try {
    const n = prueba ? Number(String(numero).slice(PREFIJO_PRUEBA.length)) : Number(numero);
    PropertiesService.getScriptProperties()
      .setProperty(prueba ? 'ultimo_numero_prueba' : 'ultimo_numero_pedido', String(n));
  } catch (e) {
    console.warn('guardar_pedido: no se guardo el contador de numero: ' + e);
  }
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