/**
 * CAMBIO DE CUENTA DE UN PEDIDO CONFIRMADO: el calculo (sin pantalla)
 *
 * Recalcula las lineas de un pedido guardado (las de pedido_para_cambio) para
 * el cliente nuevo, con la misma cuenta que el carrito (carrito.js detalle y
 * precioAjustado):
 *   - otra lista o precio especial (decision del vendedor): el precio no
 *     cambia; solo la referencia (precioBase, la lista del cliente nuevo), para
 *     que el descuento efectivo quede medido contra el cliente correcto;
 *   - promocion: si el grupo del cliente nuevo tiene la promocion, el precio
 *     que corresponde hoy (por cantidad, o el tramo que otorgo el vendedor si
 *     la cantidad no lo alcanza); si no, sale a la lista nueva, sin %;
 *   - lista del cliente: si el grupo nuevo tiene una promocion que corresponde
 *     por cantidad, entra en promocion; si no, el precio de HOY de la lista
 *     nueva con el mismo % del vendedor (un precio que figura en la lista).
 * Cuando el precio de hoy en la lista vieja no es el que se guardo, hubo una
 * actualizacion de precios de por medio: la linea lo dice aparte
 * (actualizado). Sin precio hoy en la lista nueva, la linea queda igual y
 * marcada (sin_precio).
 * El servidor (cambiar_cuenta) controla las lineas y calcula los totales; los
 * de aca son para la vista previa y usan la misma cuenta.
 */

const r2c = x => Math.round(x * 100) / 100;   // el redondeo del carrito
const FIJOS = ['otra_lista', 'precio_libre'];

/** Descuento efectivo contra la lista del cliente, como el carrito (un decimal) */
const descEfectivo = (precio, base) => (base ? Math.round((1 - precio / base) * 1000) / 10 : 0);

/** Precio de hoy de un articulo en una lista (productos.json), o null */
function precioEnListaDe(pm) {
  return (sku, lista) => {
    const v = pm?.getProduct?.(String(sku).trim().toUpperCase())?.precios?.[lista];
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
  };
}

/**
 * lineas: las del pedido guardado ({ orden, sku, nombre, cantidad,
 * listaAplicada, mecanismo, precioBase, precio, descuentoLinea, precioPromo,
 * promoDesde }). opc: { listaVieja, listaNueva, cuentaNueva }.
 * dep (para las pruebas): { precioEnLista(sku, lista), promos } (por defecto,
 * window.productManager y window.Promos).
 * Devuelve una linea nueva por cada una, con lo que se manda al servidor y,
 * para la vista previa: anterior ({ mecanismo, precio, subtotal }), cambia
 * (cambio el precio o el mecanismo), motivo ('lista', 'entra_promo',
 * 'sale_promo', 'promo', 'fija', 'sin_precio') y actualizado ({ antes, hoy,
 * lista } o null).
 */
export function recalcularLineas(lineas, opc, dep = {}) {
  const precioEnLista = dep.precioEnLista || precioEnListaDe(window.productManager);
  const promos = dep.promos || window.Promos || null;
  const { listaVieja, listaNueva, cuentaNueva } = opc;
  const cuenta = String(cuentaNueva);

  return (lineas || []).map(g => {
    const cant = Number(g.cantidad) || 0;
    const anterior = { mecanismo: g.mecanismo || 'lista_cliente', precio: Number(g.precio) || 0,
      subtotal: r2c((Number(g.precio) || 0) * cant) };
    const hoyNueva = precioEnLista(g.sku, listaNueva);
    const hoyVieja = precioEnLista(g.sku, listaVieja);
    const base = hoyNueva ?? (Number(g.precioBase) || 0);
    // Actualizacion de precios desde que se cargo el pedido (solo importa en
    // las lineas que toman el precio de la lista)
    const actualizado = hoyVieja !== null && Math.abs(hoyVieja - (Number(g.precioBase) || 0)) > 0.005
      ? { antes: Number(g.precioBase) || 0, hoy: hoyVieja, lista: listaVieja } : null;
    const sinCambio = motivo => ({ ...g, precioBase: base, motivo });
    let n;

    if (FIJOS.includes(anterior.mecanismo)) {
      n = sinCambio('fija');
    } else {
      // La promocion del cliente nuevo: lo que corresponde por cantidad, o el
      // tramo que otorgo el vendedor si la cantidad todavia no lo alcanza
      const otorgado = anterior.mecanismo === 'promocion' && Number(g.promoDesde) > cant ? Number(g.promoDesde) : 0;
      const dado = otorgado ? promos?.precioDeEscalon?.(g.sku, otorgado, cuenta) || null : null;
      const pr = dado || promos?.precioSegunCantidad?.(g.sku, cant, cuenta) || null;
      if (pr) {
        n = { ...g, mecanismo: 'promocion', listaAplicada: listaNueva, precioBase: base, precio: pr.precio,
          descuentoLinea: pr.pct, precioPromo: pr.precioEspecial,
          promoDesde: (dado || pr.conTramos) ? pr.desde : null,
          motivo: anterior.mecanismo === 'promocion' ? 'promo' : 'entra_promo' };
      } else if (hoyNueva === null) {
        n = sinCambio('sin_precio');
      } else {
        // Sale de la promocion: sin %, el del tramo no era del vendedor
        const pct = anterior.mecanismo === 'promocion' ? 0 : Number(g.descuentoLinea) || 0;
        n = { ...g, mecanismo: 'lista_cliente', listaAplicada: listaNueva, precioBase: hoyNueva,
          precio: r2c(hoyNueva * (1 - pct / 100)), descuentoLinea: pct, precioPromo: null, promoDesde: null,
          motivo: anterior.mecanismo === 'promocion' ? 'sale_promo' : 'lista' };
      }
    }
    n.subtotal = r2c(n.precio * cant);
    n.descEfectivo = descEfectivo(n.precio, n.precioBase);
    n.anterior = anterior;
    n.cambia = n.mecanismo !== anterior.mecanismo || Math.abs(n.precio - anterior.precio) > 0.005;
    // La actualizacion se informa en las que toman el precio de la lista
    n.actualizado = n.motivo === 'lista' || n.motivo === 'sale_promo' ? actualizado : null;
    return n;
  });
}

/**
 * Totales con la misma cuenta que carrito.js totales() y el servidor: el
 * descuento sobre el total (y el segundo, en cascada) solo sobre las lineas
 * que no estan en promocion
 */
export function totalesPedido(lineas, d1 = 0, d2 = 0) {
  const bruto = r2c(lineas.reduce((a, l) => a + (l.subtotal || 0), 0));
  const enPromo = r2c(lineas.filter(l => l.mecanismo === 'promocion').reduce((a, l) => a + (l.subtotal || 0), 0));
  const factor = (1 - d1 / 100) * (1 - d2 / 100);
  return { bruto, neto: r2c(enPromo + (bruto - enPromo) * factor) };
}

/**
 * Resumen para la vista previa: lineas que cambian, las fijas (decision del
 * vendedor), las sin precio, las con actualizacion de precios y los totales.
 * pedido: lo de pedido_para_cambio (totalNeto, descTotalPct, descExtraPct)
 */
export function resumenCambio(pedido, nuevas) {
  const t = totalesPedido(nuevas, Number(pedido.descTotalPct) || 0, Number(pedido.descExtraPct) || 0);
  const totalAnterior = Number(pedido.totalNeto) || 0;
  return {
    cambian: nuevas.filter(l => l.cambia),
    fijas: nuevas.filter(l => l.motivo === 'fija').length,
    sinPrecio: nuevas.filter(l => l.motivo === 'sin_precio'),
    actualizadas: nuevas.filter(l => l.actualizado),
    totalAnterior,
    totalNuevo: t.neto,
    diferencia: r2c(t.neto - totalAnterior),
    sinDiferencias: !nuevas.some(l => l.cambia) && Math.abs(t.neto - totalAnterior) < 0.005
  };
}

/** Lo que se manda a cambiar_cuenta por cada linea (sin lo de la vista previa) */
export function lineasParaEnviar(nuevas) {
  return nuevas.map(l => ({ orden: l.orden, sku: l.sku, cantidad: l.cantidad, mecanismo: l.mecanismo,
    listaAplicada: l.listaAplicada, precioBase: l.precioBase, precio: l.precio,
    descuentoLinea: l.descuentoLinea ?? 0, precioPromo: l.precioPromo ?? null, promoDesde: l.promoDesde ?? null }));
}
