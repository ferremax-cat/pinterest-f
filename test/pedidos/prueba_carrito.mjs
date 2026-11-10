// PRUEBA DEL CARRITO Y LOS HABITUALES con jsdom: sugerencias "¿Se olvida algo?",
// lista de habituales, pendiente, origen_linea y mensajes de error del guardado
// (id_con_otro_contenido, lineas_con_otro_contenido, verificacion_fallida).
// Modulos reales de js/ (historial-cliente, habituales, carrito, carrito-panel,
// observaciones, hoja, datos-catalogo); config.js y sesion.js son reemplazos
// minimos. Servidor, catalogo y ProductManager simulados.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_carrito.mjs
import { join } from 'path';
import { RAIZ, JSDOM, prepararModulos } from './preparar.mjs';
const importar = prepararModulos(
  ['historial-cliente.js', 'habituales.js', 'carrito.js', 'carrito-panel.js', 'observaciones.js', 'hoja.js', 'datos-catalogo.js',
    'alta-cliente.js'],
  { 'config.js': '// Reemplazo minimo para la prueba\nexport const SOLO_VENDEDORES = false;\nexport const CUENTAS_ALTA = [\'157\'];\n',
    'sesion.js': '// Reemplazo minimo para la prueba\nexport const pedirToken = () => Promise.resolve(null);\n' });

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

// ---------- pagina ----------
const dom = new JSDOM(`<!doctype html><html><body>
  <nav><input type="text" placeholder="Buscar en catálogo de productos..." value="taladro"></nav>
  <div id="barra-salud-financiera" class="barra-salud-financiera"><div class="barra-salud-content">
    <div class="cliente-info"><div class="cliente-nombre"><span id="cliente-nombre">X</span></div>
    <div class="dato-item"><span class="cupo-valor">$0</span></div></div></div></div>
  <div class="galeria-prueba">tarjetas</div>
  <input id="otro" type="number">
</body></html>`, { url: 'https://ferremax.test/catalogo.html', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame'])
  globalThis[k] = k === 'window' ? w : w[k];
w.CSS = w.CSS || {};
w.CSS.escape = w.CSS.escape || (s => String(s).replace(/["\\]/g, '\\$&'));
globalThis.CSS = w.CSS;
// Ancho de pantalla simulado: 700 px (hoja aparte para la lista, bloque desplegado),
// 358 (celular: bloque plegable) o 1024 (computadora)
let anchoPx = 700;
w.matchMedia = q => {
  const min = /min-width:\s*(\d+)px/.exec(q), max = /max-width:\s*(\d+)px/.exec(q);
  return { matches: (!min || anchoPx >= +min[1]) && (!max || anchoPx <= +max[1]), addEventListener() {}, removeEventListener() {} };
};

// ---------- catalogo y productos ----------
const codigos = [...Array.from({ length: 30 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`),
  'H01', 'H02', 'H03', 'H04', 'H06', 'H07', 'H08', 'H09', 'H10', 'D1',            // H05 no esta
  ...Array.from({ length: 20 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`),   // clientes 9 a 12
  ...Array.from({ length: 10 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`)];  // X99 no esta
const catalogo = Object.fromEntries(codigos.map(c => [c, { name: c.startsWith('H') && c === 'H04'
  ? 'NOMBRE MUY LARGO DE ARTICULO DE FERRETERIA CON MEDIDAS 1/2" X 3/4" Y <MARCA> & COMPANIA' : 'Articulo ' + c,
  category: 'x', bulk: 1, prices: { D: 100, E: 90, F: 80 } }]));
globalThis.fetch = async url => ({ ok: true, json: async () => (String(url).includes('imagenes') ? { images: { H02: 'IMGH02' } } : catalogo) });
const sinMemoria = new Set();
let cargaPendiente = null;
w.productManager = { getProduct: s => (catalogo[s] && !sinMemoria.has(s) ? { nombre: catalogo[s].name, bulto: 1, precios: catalogo[s].prices, precio: 100 } : null) };
w.productManagerInstance = { loadSpecificProducts: skus => (cargaPendiente ? cargaPendiente.promesa.then(() => { skus.forEach(s => sinMemoria.delete(s)); return {}; }) : Promise.resolve({})) };
const diferida = () => { let resolver; const promesa = new Promise(r => { resolver = r; }); return { promesa, resolver }; };

// ---------- sesion, cliente y servidor ----------
sessionStorage.setItem('authRol', 'vendedor_estandar');
sessionStorage.setItem('authToken', 't');
sessionStorage.setItem('configCarrito', JSON.stringify({ ok: true, descuentosLinea: [5], descuentosTotal: [5, 7], observaciones: [] }));
w.menuFuncionalidades = { usuarioActual: { clave: 'V1', rol: 'vendedor_estandar' } };
let cuentaVista = '7';
const ponerCupo = c => { sessionStorage.setItem('disponibleCliente', '1000000'); sessionStorage.setItem('disponibleDeCuenta', c); };
ponerCupo('7');
w.Precios = { getClienteVista: () => (cuentaVista ? { cuenta: cuentaVista, lista: 'D', nombre: 'Cliente ' + cuentaVista } : null),
  precioLista: s => (w.productManager.getProduct(s) ? 100 : null) };
const hoy = new Date(); const iso = d => d.toISOString().slice(0, 10);
const dias = n => iso(new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - n * 864e5));
const HAB = [['H01', 30, 2, dias(3), dias(-4)], ['H02', 25, 2.6, dias(20), dias(10)], ['H03', 20, 1, dias(200), dias(190)],
  ['H04', 18, 6, dias(10), dias(2)], ['H05', 15, 1, dias(5), dias(1)], ['H06', 12, 1, dias(1), dias(-5)],
  ['H07', 10, 3, dias(15), dias(5)], ['H08', 8, 1, dias(15), dias(5)], ['H09', 6, 1, dias(15), dias(5)], ['H10', 4, 1, dias(15), dias(5)]];
const DEJ = [['H03', 20, 1, dias(200)], ['D1', 9, 4, dias(150)]];
const historial = {};   // cuenta -> diferida con la respuesta
const llamadas = [];
w.Api = {
  llamar: async body => { llamadas.push(body.accion); if (body.accion === 'guardar_pedido') { guardados.push(body.pedido); return { ok: true, numero: 'PRU-' + guardados.length }; } return { ok: true }; },
  llamarEnSegundoPlano: async (armar) => { const b = armar(); llamadas.push(b.accion); (historial[b.cuenta] ||= diferida()); return historial[b.cuenta].promesa; }
};
const guardados = [];
const responder = (cuenta, conListas = true) => { (historial[cuenta] ||= diferida()).resolver({ ok: true, cuenta, actualizado: iso(hoy),
  articulos: [['H01', dias(3), 2]], ...(conListas ? { habituales: HAB, dejo: DEJ } : {}) }); };

// ---------- modulos reales ----------
await importar('historial-cliente.js');
const Hab = await importar('habituales.js');
await importar('carrito.js');
await importar('carrito-panel.js');
await tick();
const C = w.Carrito;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const boton = () => $('.hab-boton');
const sugeridos = () => $$('#carrito-panel .cp-sug-agregar').map(b => b.dataset.sku);
const dibujar = () => document.dispatchEvent(new CustomEvent('carrito:cambio'));

// 1. Carrito con 30 lineas y H01, antes de que llegue el historial
for (const c of codigos.slice(0, 29)) C.agregar(c, 1);
C.agregar('H01', 2);
w.CarritoPanel.abrir();
await tick(10);
ver('panel abierto con las lineas', $$('#carrito-panel .cp-fila').length === 30);
ver('sin historial: sin bloque', !$('#carrito-panel .cp-sug'));
ver('sin historial: icono oculto', !boton() || boton().hidden);

const medir = n => { const t = performance.now(); for (let i = 0; i < n; i++) dibujar(); return (performance.now() - t) / n; };
const llamadasAntes = llamadas.length;

// 2. Llega el historial con el panel abierto y un campo con foco
const campo = $('#carrito-panel .cp-cant');
campo.focus(); campo.value = '7';
responder('7');
await tick(10);
ver('llega con el panel abierto: bloque agregado', !!$('#carrito-panel .cp-sug'));
ver('sin redibujar: el campo conserva foco y valor', document.activeElement === campo && campo.value === '7');
ver('E1 + pedido + catalogo: H02, H04, H06', JSON.stringify(sugeridos()) === JSON.stringify(['H02', 'H04', 'H06']), JSON.stringify(sugeridos()));
ver('icono visible con punto', boton() && !boton().hidden && !boton().querySelector('.hab-punto').hidden);
const fila04 = $$('#carrito-panel .cp-sug-fila')[1];
ver('nombre largo escapado y entero en title', fila04.querySelector('.cp-sug-nombre').title === catalogo.H04.name &&
  fila04.querySelector('.cp-sug-nombre').textContent === catalogo.H04.name && !fila04.querySelector('marca'));
ver('le toca (H04: toca hace 2 dias) y no le toca (H06)', fila04.querySelector('.hab-toca') && !$$('#carrito-panel .cp-sug-fila')[2].querySelector('.hab-toca'));
ver('foto del catalogo de imagenes (H02)', $$('#carrito-panel .cp-sug-img')[0].getAttribute('style')?.includes('IMGH02'));
ver('textos: veces y hace N dias', $$('#carrito-panel .cp-sug-meta')[0].textContent.includes('25 veces en el año') && $$('#carrito-panel .cp-sug-meta')[0].textContent.includes('hace 20 días'));
ver('boton con la cantidad tipica redondeada', $$('#carrito-panel .cp-sug-agregar')[0].textContent.trim() === '+ 3');
ver('el bloque va antes de "Al total"', $('#carrito-panel .cp-pie').firstElementChild.classList.contains('cp-sug'));

let t = performance.now(); for (let i = 0; i < 5000; i++) Hab.htmlCarrito(codigos); const soloBloque = (performance.now() - t) / 5000;

// 3. Agregar desde el bloque
$$('#carrito-panel .cp-sug-agregar')[0].click();
await tick();
let l = C.leer().find(x => x.sku === 'H02');
ver('agregado H02 con la cantidad tipica y marca habitual', l && l.cantidad === 3 && l.sugerido === 'habitual');
ver('entra el siguiente: H04, H06, H07', JSON.stringify(sugeridos()) === JSON.stringify(['H04', 'H06', 'H07']), JSON.stringify(sugeridos()));
ver('ninguna consulta nueva al abrir, dibujar y agregar', llamadas.length === llamadasAntes, JSON.stringify(llamadas.slice(llamadasAntes)));

// Tiempo de dibujar: el cliente 7 (con listas: bloque) y el 8 (sin listas, el
// historial no llego) con el mismo carrito de 31 lineas, en tandas alternadas
const lineas7 = C.leer().map(x => [x.sku, x.cantidad]);
cuentaVista = '8'; ponerCupo('8');
lineas7.forEach(([s, q]) => C.agregar(s, q));
const tandas = { con: [], sin: [] };
for (let r = 0; r < 12; r++) {
  cuentaVista = '7'; ponerCupo('7'); medir(5); const a = medir(40);
  ver('tanda con bloque', !!$('#carrito-panel .cp-sug') && $$('#carrito-panel .cp-fila').length === 31);
  cuentaVista = '8'; ponerCupo('8'); medir(5); const b = medir(40);
  ver('tanda sin bloque', !$('#carrito-panel .cp-sug') && $$('#carrito-panel .cp-fila').length === 31);
  if (r >= 2) { tandas.con.push(a); tandas.sin.push(b); }
}
const med = v => v.slice().sort((x, y) => x - y)[v.length >> 1];
const conBloque = med(tandas.con), sinBloque = med(tandas.sin);
C.vaciar();
cuentaVista = '7'; ponerCupo('7'); dibujar();
ver('ninguna consulta nueva al medir', llamadas.length === llamadasAntes);

// 4. Lista de la barra en el celular (hoja aparte)
boton().click();
await tick();
ver('celular: hoja aparte', !!$('.hj-fondo .hab-en-hoja') && !$('.hab-desplegable'));
// El cliente 7 simula una celda de la rutina anterior: H03 en las dos listas
ver('3 a la vista y "Ver los 9"; dejo sin H03 (1 fila)', $$('.hab-en-hoja .hab-fila').length === 3 + 1 && $('.hab-ver')?.textContent === 'Ver los 9' && $$('.hab-ver').length === 1);
ver('los del pedido dicen "En el pedido"', $$('.hab-en-hoja .hab-en').length === 2);
$('.hab-ver').click();
ver('ver los 9', $$('.hab-en-hoja .hab-fila').length === 9 + 1);
const filasDejo = $$('.hab-en-hoja .hab-fila').slice(-1);
ver('dejo de comprar sin boton (solo D1)', filasDejo.every(f => !f.querySelector('button')) && filasDejo[0].textContent.includes('última hace 150 días'));
const filasH03 = $$('.hab-en-hoja .hab-fila').filter(f => f.querySelector('.hab-nombre').textContent === 'Articulo H03');
ver('celda vieja: H03 una sola vez, en Suele llevar, con la marca fuerte', filasH03.length === 1 &&
  filasH03[0].querySelector('.hab-lejos')?.textContent === 'Hace mucho que no lo pide' &&
  filasH03[0].querySelector('.hab-meta').textContent.includes('(200 días)') && !filasH03[0].querySelector('.hab-toca'));
ver('celda vieja: H03 no esta en "Dejó de comprar"', !$$('.hab-en-hoja .hab-fila').slice(9).some(f => f.textContent.includes('Articulo H03')));
$$('.hab-en-hoja .hab-agregar').find(b => b.dataset.sku === 'H04').click();
await tick();
ver('desde la lista: habitual_lista', C.leer().find(x => x.sku === 'H04')?.sugerido === 'habitual_lista' && C.leer().find(x => x.sku === 'H04')?.cantidad === 6);
ver('la lista se repinta: H04 en el pedido', $$('.hab-en-hoja .hab-en').length === 3);
$('.hj-volver').click();
ver('hoja cerrada', !$('.hj-fondo') && boton().getAttribute('aria-expanded') === 'false');

// Computadora: desplegable, Escape lo cierra
anchoPx = 1024;
boton().click();
ver('computadora: desplegable', !!$('.hab-desplegable'));
document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
ver('Escape cierra el desplegable', !$('.hab-desplegable'));
anchoPx = 700;

// 5. Mismo cliente otra vez (cliente:cambio repetido): el icono sigue
document.dispatchEvent(new CustomEvent('cliente:cambio'));
await tick(10);
ver('cliente:cambio con el mismo cliente: icono sigue', !boton().hidden && sugeridos().length === 3);

// 6. Confirmar: origen_linea
$('#carrito-panel .cp-confirmar').click();
await tick(20);
const ped = guardados.at(-1);
const origen = s => ped?.lineas.find(x => x.sku === s)?.origenLinea;
ver('confirmar: habitual, habitual_lista y vacio', origen('H02') === 'habitual' && origen('H04') === 'habitual_lista' && origen('P001') === '' && origen('H01') === '', JSON.stringify(ped?.lineas.map(x => [x.sku, x.origenLinea]).slice(-4)));
ver('confirmar: una sola llamada nueva (guardar_pedido)', JSON.stringify(llamadas.slice(llamadasAntes)) === '["guardar_pedido"]', JSON.stringify(llamadas.slice(llamadasAntes)));
ver('pantalla de exito', !!$('#carrito-panel .cp-exito'));
document.dispatchEvent(new CustomEvent('cliente:cambio'));   // vuelve a avisar habituales:listo
await tick(10);
ver('habituales:listo no toca la pantalla de exito', !!$('#carrito-panel .cp-exito') && !$('#carrito-panel .cp-sug'));

// 7. Revision: cliente, ambos, vendedor y sugeridos
C.agregar('P001', 1); C.agregar('P002', 1);
C.agregar('H06', 1, undefined, { sugerido: 'habitual' });   // sugerido, pero lo traia el cliente
C.setOrigen('PED-1', ['P001', 'P002', 'H06']);
C.marcarPrevia('P002', 5);
C.agregar('P003', 1);
C.agregar('H07', 3, undefined, { sugerido: 'habitual' });
w.CarritoPanel.abrir();
await tick(10);
$('#carrito-panel .cp-confirmar').click();
await tick(20);
const rev = guardados.at(-1);
const o2 = s => rev?.lineas.find(x => x.sku === s)?.origenLinea;
ver('revision: cliente / ambos / vendedor', o2('P001') === 'cliente' && o2('P002') === 'ambos' && o2('P003') === 'vendedor', JSON.stringify(rev?.lineas.map(x => [x.sku, x.origenLinea])));
ver('revision: sugerido nuevo = habitual; sugerido que traia el cliente = cliente', o2('H07') === 'habitual' && o2('H06') === 'cliente');
$('#carrito-panel .cp-cerrar-exito')?.click();
cuentaVista = '7'; ponerCupo('7');

// 8. Carrera: agregar esperando el producto y el vendedor cambia de cliente
C.agregar('P001', 1);
w.CarritoPanel.abrir();
await tick(10);
ver('pedido nuevo (solo P001): H01, H02, H04', JSON.stringify(sugeridos()) === JSON.stringify(['H01', 'H02', 'H04']), JSON.stringify(sugeridos()));
sinMemoria.add('H01'); cargaPendiente = diferida();   // H01 no esta en memoria: agregar espera
const antesH = C.leer().length;
$$('#carrito-panel .cp-sug-agregar')[0].click();
cuentaVista = '8'; ponerCupo('8');
document.dispatchEvent(new CustomEvent('cliente:cambio'));
cargaPendiente.resolver(); cargaPendiente = null;
await tick(10);
cuentaVista = '7';
ver('carrera: no se agrega al cliente anterior', C.leer().length === antesH && !C.leer().some(x => x.sku === 'H01'));
cuentaVista = '8';
ver('otro cliente sin historial: icono oculto', boton().hidden);
ver('otro cliente: sin sugerencias', Hab.sugerencias([]).length === 0);

// 9. Servidor viejo: respuesta sin listas
responder('8', false);
await tick(10);
ver('servidor viejo: sin icono ni sugerencias', boton().hidden && Hab.sugerencias([]).length === 0 && !!w.HistorialCliente.comprados());

// 9b. Bloque plegable en el celular
cuentaVista = '7'; ponerCupo('7');
document.dispatchEvent(new CustomEvent('cliente:cambio'));
await tick(10);
w.CarritoPanel.abrir();
await tick(10);
const llamadasPleg = llamadas.length;
const bloque = () => $('#carrito-panel .cp-sug');
const cab = () => $('#carrito-panel .cp-sug-cab');
const filasSug = () => $$('#carrito-panel .cp-sug-fila');
anchoPx = 358; dibujar();
ver('celular: arranca plegado', bloque()?.classList.contains('cp-sug-plegado') && filasSug().length === 0);
ver('celular: una linea con la cantidad y la flecha', cab()?.textContent.replace(/\s+/g, ' ').trim() === '¿Se olvida algo? · 3 sugerencias ▾' && cab().getAttribute('aria-expanded') === 'false');
ver('plegado: sigue antes de "Al total"', $('#carrito-panel .cp-pie').firstElementChild === bloque());
const filaMarcada = $('#carrito-panel .cp-fila'); filaMarcada.dataset.marca = 'x';
cab().click();
ver('al tocar se despliega: 3 filas, ▴', filasSug().length === 3 && cab().getAttribute('aria-expanded') === 'true' && cab().textContent.includes('▴') && !bloque().classList.contains('cp-sug-plegado'));
ver('desplegar no redibuja el panel', $('#carrito-panel .cp-fila') === filaMarcada && filaMarcada.dataset.marca === 'x');
ver('el foco queda en la cabecera', document.activeElement === cab());
ver('pantallas bajas: la cabecera no cuenta como fila (nth-of-type)', bloque().querySelector(':scope > .cp-sug-fila:nth-of-type(3)') === filasSug()[2]);

// Titulo para el dedo: la hoja de estilos real, cargada en la pagina de prueba
const fs = await import('fs');
const estilo = document.createElement('style');
estilo.textContent = fs.readFileSync(join(RAIZ, 'css', 'habituales.css'), 'utf8');
document.head.appendChild(estilo);
const reglas = [...estilo.sheet.cssRules];
// El CSSOM de jsdom no tiene los nombres en camelCase: getPropertyValue
const prop = (sel, p) => reglas.find(r => r.selectorText === sel)?.style.getPropertyValue(p);
ver('css: la hoja se lee entera (sin reglas perdidas)', reglas.length >= 30, reglas.length);
ver('css: titulo de ancho completo, 32 px de alto minimo', prop('.cp-sug-cab', 'width') === '100%' && prop('.cp-sug-cab', 'min-height') === '32px');
const tactil = reglas.find(r => r.media && r.media.mediaText.includes('pointer: coarse'));
ver('css: 44 px en pantallas tactiles', tactil?.cssRules[0].selectorText === '.cp-sug-cab' && tactil.cssRules[0].style.getPropertyValue('min-height') === '44px');
ver('css: flecha de 28 px y 16 px de letra', prop('.cp-sug-flecha', 'width') === '28px' && prop('.cp-sug-flecha', 'height') === '28px' && prop('.cp-sug-flecha', 'font-size') === '16px');
ver('css: 8 px entre el titulo y la primera sugerencia', prop('.cp-sug-cab + .cp-sug-fila', 'margin-top') === '8px');
const cs = el => w.getComputedStyle(el);
ver('aplicado: el titulo ocupa el ancho y la primera fila esta separada 8 px', cs(cab()).width === '100%' && cs(filasSug()[0]).marginTop === '8px' && cs(filasSug()[1]).marginTop !== '8px');
ver('pantallas bajas: las reglas de menos filas siguen', reglas.some(r => r.media?.mediaText.includes('max-height: 640px')) && reglas.some(r => r.media?.mediaText.includes('max-height: 540px')));
// Tocar el texto o la flecha (no solo el boton) pliega y despliega, sin agregar nada
const lineasAntes = C.leer().length;
cab().querySelector('span').click();
ver('tocar el texto del titulo pliega', filasSug().length === 0 && C.leer().length === lineasAntes);
cab().querySelector('.cp-sug-flecha').click();
ver('tocar la flecha despliega', filasSug().length === 3 && C.leer().length === lineasAntes);
dibujar();
ver('redibujar: sigue desplegado', filasSug().length === 3);
C.agregar('P030', 1);
await tick();
ver('agregar un articulo: sigue desplegado', filasSug().length === 3);
const primera = filasSug()[0].querySelector('.cp-sug-agregar').dataset.sku;
filasSug()[0].querySelector('.cp-sug-agregar').click();
await tick();
ver('agregar desde el bloque: sigue desplegado y entra el siguiente', filasSug().length === 3 && C.leer().some(x => x.sku === primera) && !sugeridos().includes(primera));
cab().click();
ver('al tocar de nuevo se pliega', filasSug().length === 0 && cab().textContent.includes('▾'));
cab().click();
document.dispatchEvent(new CustomEvent('cliente:cambio'));   // mismo cliente
await tick(10);
dibujar();
ver('mismo cliente otra vez: sigue desplegado', filasSug().length === 3);
cuentaVista = '8'; ponerCupo('8');
document.dispatchEvent(new CustomEvent('cliente:cambio'));
await tick(10);
cuentaVista = '7'; ponerCupo('7');
document.dispatchEvent(new CustomEvent('cliente:cambio'));
await tick(10);
dibujar();
ver('cambiar de cliente y volver: plegado de nuevo', bloque()?.classList.contains('cp-sug-plegado') && filasSug().length === 0);
ver('una sola: "1 sugerencia"', Hab.htmlCarrito(['H01', 'H02', 'H04', 'H06', 'H07', 'H08', 'H09']).includes('· 1 sugerencia'));
anchoPx = 1024; dibujar();
ver('computadora: desplegado sin cabecera plegable', filasSug().length === 3 && !cab() && !!$('#carrito-panel .cp-sug-tit'));
anchoPx = 600; dibujar();
ver('600 px: todavia plegable', !!cab() && bloque().classList.contains('cp-sug-plegado'));
anchoPx = 601; dibujar();
ver('601 px: desplegado', !cab() && filasSug().length === 3);
console.log('Llamadas en la seccion de plegado:', JSON.stringify(llamadas.slice(llamadasPleg)));
ver('plegar y desplegar: solo las del cambio de cliente (historial de 8 y de 7)', JSON.stringify(llamadas.slice(llamadasPleg)) === '["historial_cliente","historial_cliente"]');
ver('nada en localStorage ni sessionStorage', ![...Object.keys(localStorage), ...Object.keys(sessionStorage)].some(k => /despleg|sug/i.test(k)));
anchoPx = 700;

// 9c. El foco vuelve al buscador de articulos
w.CarritoPanel.cerrar();
const busc = $('nav input[type="text"]');
const otro = $('#otro');
const llamadasFoco = llamadas.length;
const opcionesFoco = [];
const focoOriginal = busc.focus.bind(busc);
busc.focus = op => { opcionesFoco.push(op); focoOriginal(op); };
const soltar = () => { busc.blur(); otro.blur(); busc.setSelectionRange(busc.value.length, busc.value.length); };
const enBuscador = () => document.activeElement === busc;
const sinSeleccion = () => busc.selectionStart === busc.selectionEnd && busc.selectionStart === busc.value.length;
const esperarMs = ms => new Promise(r => setTimeout(r, ms));
ver('foco: hay iconos y listas para el cliente 7', !boton().hidden);

// Computadora (desplegable)
anchoPx = 1024;
soltar(); boton().click();
ver('foco: el desplegable abierto no mueve el foco', !!$('.hab-desplegable') && !enBuscador());
busc.setSelectionRange(0, busc.value.length); busc.blur();   // texto seleccionado de antes
opcionesFoco.length = 0;
boton().click();
ver('icono otra vez: cierra y foco al buscador', !$('.hab-desplegable') && enBuscador());
ver('sin borrar ni seleccionar: cursor al final', busc.value === 'taladro' && sinSeleccion());
ver('sin desplazar la pagina (preventScroll)', opcionesFoco[0]?.preventScroll === true);

soltar(); boton().click();
document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
ver('Escape: cierra y foco al buscador', !$('.hab-desplegable') && enBuscador());

soltar(); boton().click();
const galeria = $('.galeria-prueba');
galeria.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
ver('toque afuera: cierra en el pointerdown, sin foco todavia', !$('.hab-desplegable') && !enBuscador());
galeria.click();
ver('toque afuera: foco en el clic del mismo toque', enBuscador());

soltar(); boton().click();
galeria.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
await esperarMs(750);
ver('toque afuera sin clic (arrastre): foco a los 700 ms', enBuscador());

soltar(); boton().click();
otro.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
otro.focus(); otro.click();
await esperarMs(750);
ver('toque en otro campo: ese campo conserva el foco', document.activeElement === otro && !$('.hab-desplegable'));

soltar(); boton().click();
$$('.hab-desplegable .hab-agregar')[0].click();
await tick();
ver('agregar desde el desplegable: lista abierta y foco al buscador', !!$('.hab-desplegable') && enBuscador());
ver('agregar desde el desplegable: marcado habitual_lista', C.leer().some(x => x.sugerido === 'habitual_lista'));
otro.focus();
document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
ver('Escape con otro campo con foco: no se lo roba', !$('.hab-desplegable') && document.activeElement === otro);

// Celular (hoja aparte)
anchoPx = 700;
soltar(); boton().click();
ver('celular: hoja abierta', !!$('.hj-fondo .hab-en-hoja'));
$$('.hab-en-hoja .hab-agregar')[0].click();
await tick();
ver('agregar desde la hoja: sigue abierta y el foco no va al buscador', !!$('.hj-fondo') && !enBuscador());
$('.hj-volver').click();
ver('flecha de volver: cierra y foco al buscador', !$('.hj-fondo') && enBuscador());
soltar(); boton().click();
document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
ver('Escape en la hoja: cierra y foco al buscador', !$('.hj-fondo') && enBuscador());

// Cierres que no son del vendedor
anchoPx = 1024;
soltar(); boton().click();
cuentaVista = '8'; ponerCupo('8');
document.dispatchEvent(new CustomEvent('cliente:cambio'));
await tick(10);
ver('cambio de cliente: cierra sin mover el foco', !$('.hab-desplegable') && !enBuscador());
cuentaVista = '7'; ponerCupo('7');
document.dispatchEvent(new CustomEvent('cliente:cambio'));
await tick(10);
soltar(); boton().click();
document.dispatchEvent(new CustomEvent('carrito:abrir'));
await tick(10);
ver('abrir el carrito: cierra sin mover el foco', !$('.hab-desplegable') && !enBuscador());
w.CarritoPanel.cerrar();
document.body.classList.add('modo-busqueda-clientes');
soltar(); boton().click(); boton().click();
ver('modo busqueda de clientes: no mueve el foco', !$('.hab-desplegable') && !enBuscador());
document.body.classList.remove('modo-busqueda-clientes');
soltar(); boton().click();
$('nav').style.display = 'none';
boton().click();
ver('buscador oculto: no mueve el foco', !$('.hab-desplegable') && !enBuscador());
$('nav').style.display = '';
ver('foco: ninguna consulta nueva (solo el historial de los cambios de cliente)', llamadas.slice(llamadasFoco).every(a => a === 'historial_cliente'), JSON.stringify(llamadas.slice(llamadasFoco)));
busc.focus = focoOriginal;
anchoPx = 700;

// 9d. Topes 20 / 10, marca fuerte, "Ver los N" de cada lista y el punto
const llamadas9 = llamadas.length;
const G = n => `G${String(n).padStart(2, '0')}`;
// G01: exactamente 3 intervalos (10 dias, ultima hace 30). G02: un dia menos (le toca)
const HAB9 = [[G(1), 50, 1, dias(30), dias(20)], [G(2), 45, 1, dias(29), dias(19)],
  ...Array.from({ length: 18 }, (_, i) => [G(i + 3), 40 - i, 1, dias(2), dias(-8)])];
const DEJ9 = Array.from({ length: 10 }, (_, i) => [`K${String(i + 1).padStart(2, '0')}`, 9, 1, dias(100 + i)]);
const responderCon = (cuenta, hab, dej) => (historial[cuenta] ||= diferida()).resolver({ ok: true, cuenta, actualizado: iso(hoy),
  articulos: [], habituales: hab, dejo: dej });
const elegir = async (cuenta, hab, dej) => {
  cuentaVista = cuenta; ponerCupo(cuenta);
  document.dispatchEvent(new CustomEvent('cliente:cambio'));
  await tick(10);
  responderCon(cuenta, hab, dej);
  await tick(10);
};
const filasLista = () => $$('.hab-en-hoja .hab-fila');
const verTextos = () => $$('.hab-en-hoja .hab-ver').map(b => b.textContent);

anchoPx = 358;
await elegir('9', HAB9, DEJ9);
ver('cliente 9: icono con punto', !boton().hidden && !boton().querySelector('.hab-punto').hidden);
ver('carrito: no sugiere el lejos (G01); entra el siguiente, hasta 3', JSON.stringify(Hab.sugerencias([]).map(x => x.sku)) === JSON.stringify([G(2), G(3), G(4)]));
ver('carrito: el lejos tampoco si los demas estan en el pedido', JSON.stringify(Hab.sugerencias(HAB9.slice(1).map(x => x[0])).map(x => x.sku)) === '[]');
boton().click();
await tick();
ver('358 px: hoja aparte', !!$('.hj-fondo .hab-en-hoja'));
ver('3 + 3 a la vista, "Ver los 20" y "Ver los 10"', filasLista().length === 6 && JSON.stringify(verTextos()) === '["Ver los 20","Ver los 10"]', JSON.stringify(verTextos()));
const f1 = filasLista()[0], f2 = filasLista()[1];
ver('exactamente 3 intervalos: marca fuerte con los dias', f1.querySelector('.hab-lejos')?.textContent === 'Hace mucho que no lo pide' &&
  f1.querySelector('.hab-meta').textContent.includes('(30 días)') && !f1.querySelector('.hab-toca'), f1.querySelector('.hab-meta').textContent);
ver('un dia menos: "Le toca", sin la marca fuerte', !!f2.querySelector('.hab-toca') && !f2.querySelector('.hab-lejos'));
ver('el lejos se puede agregar desde la lista', !!f1.querySelector('.hab-agregar'));
$$('.hab-en-hoja .hab-ver').find(b => b.dataset.lista === 'hab').click();
ver('"Ver los 20": 20 + 3, sigue "Ver los 10"', filasLista().length === 23 && JSON.stringify(verTextos()) === '["Ver los 10"]');
$$('.hab-en-hoja .hab-agregar').find(b => b.dataset.sku === G(15)).click();
await tick();
ver('agregar con la lista entera: se repinta y siguen las 20', filasLista().length === 23 && C.leer().some(x => x.sku === G(15) && x.sugerido === 'habitual_lista'));
$('.hab-en-hoja .hab-ver').click();
ver('"Ver los 10": 20 + 10, sin enlaces', filasLista().length === 30 && verTextos().length === 0);
ver('los 10 de dejo sin boton', filasLista().slice(20).every(f => !f.querySelector('button')));
$('.hj-volver').click();
boton().click();
ver('al volver a abrir: 3 + 3 otra vez', filasLista().length === 6 && verTextos().length === 2);
$$('.hab-en-hoja .hab-ver').find(b => b.dataset.lista === 'dejo').click();
ver('cada enlace con lo suyo: "Ver los 10" solo abre dejo', filasLista().length === 3 + 10 && JSON.stringify(verTextos()) === '["Ver los 20"]');
$('.hj-volver').click();
// CSS real: la marca roja y la hoja que se desplaza
ver('css: .hab-lejos en rojo y negrita', /dc2626|220,\s*38,\s*38/.test(prop('.hab-lejos', 'color')) && prop('.hab-lejos', 'font-weight') === '700');
const estiloHoja = document.createElement('style');
estiloHoja.textContent = fs.readFileSync(join(RAIZ, 'css', 'hoja.css'), 'utf8');
document.head.appendChild(estiloHoja);
ver('css: la hoja se desplaza (overflow-y: auto)', [...estiloHoja.sheet.cssRules].find(r => r.selectorText === '.hj-cuerpo')?.style.getPropertyValue('overflow-y') === 'auto');

// Un habitual que no esta en el catalogo: "Ver los 19"
await elegir('10', [['X99', 60, 1, dias(2), dias(-8)], ...HAB9.slice(1)], []);
boton().click();
ver('cliente 10: "Ver los 19" (X99 no esta en el catalogo) y sin dejo', JSON.stringify(verTextos()) === '["Ver los 19"]' && !$$('.hab-en-hoja .hab-tit').some(t => t.textContent === 'Dejó de comprar'));
$('.hj-volver').click();

// El punto: con solo un lejos y dejo vacio, si; sin ninguno de los dos, no
await elegir('11', [HAB9[0], HAB9[2]], []);
ver('punto con solo un lejos', !boton().hidden && !boton().querySelector('.hab-punto').hidden && boton().title === 'Habituales (hay artículos que hace mucho que no pide)');
await elegir('12', [HAB9[1], HAB9[2]], []);
ver('sin dejo ni lejos: icono sin punto', !boton().hidden && boton().querySelector('.hab-punto').hidden && boton().title === 'Habituales');
// Celda nueva sin repetidos: dejo entero (3 a la vista)
await elegir('13', HAB9.slice(1, 4), DEJ9.slice(0, 4));
boton().click();
ver('dejo con 4: 3 a la vista y "Ver los 4"; con 3 habituales sin enlace', filasLista().length === 6 && JSON.stringify(verTextos()) === '["Ver los 4"]');
$('.hj-volver').click();
ver('9d: ninguna consulta nueva (solo el historial de cada cliente)', llamadas.slice(llamadas9).every(a => a === 'historial_cliente') && llamadas.slice(llamadas9).length === 5, JSON.stringify(llamadas.slice(llamadas9)));
anchoPx = 700;
cuentaVista = '7'; ponerCupo('7');

// 9z. guardar_pedido responde lineas_con_otro_contenido: mensaje propio y el pendiente sigue
{
  const llamarAntes = w.Api.llamar;
  w.Api.llamar = async body => (body.accion === 'guardar_pedido'
    ? { ok: false, error: 'lineas_con_otro_contenido', id: body.pedido.id } : llamarAntes(body));
  C.vaciar(); C.agregar('P001', 1);
  w.CarritoPanel.abrir(); await tick(10);
  $('#carrito-panel .cp-confirmar').click(); await tick(20);
  const txt = $('#carrito-panel').textContent;
  ver('lineas_con_otro_contenido: "guardado a medias" y consultar a la oficina',
    txt.includes('Este pedido quedó guardado a medias con otro contenido. Consultá con la oficina antes de continuar.'), txt.slice(0, 300));
  ver('lineas_con_otro_contenido: no dice "Tocá Reintentar en unos minutos"', !txt.includes('Tocá Reintentar en unos minutos'));
  ver('lineas_con_otro_contenido: el pedido sigue pendiente (no se vacia ni se borra)', !!C.getPendiente());
  C.borrarPendiente(); w.Api.llamar = llamarAntes; C.vaciar();
}

// V10. guardar_pedido responde verificacion_fallida: mensaje propio, el pendiente sigue y el reintento manda el mismo id
{
  const llamarAntes = w.Api.llamar;
  const ids = [];
  let fallar = true;
  w.Api.llamar = async body => {
    if (body.accion !== 'guardar_pedido') return llamarAntes(body);
    ids.push(body.pedido.id);
    return fallar ? { ok: false, error: 'verificacion_fallida', id: body.pedido.id } : { ok: true, numero: 'APP-9', id: body.pedido.id };
  };
  C.vaciar(); C.agregar('P001', 1);
  w.CarritoPanel.abrir(); await tick(10);
  $('#carrito-panel .cp-confirmar').click(); await tick(20);
  const txt = $('#carrito-panel').textContent;
  ver('verificacion_fallida: mensaje propio',
    txt.includes('No se pudo confirmar que el pedido quedó guardado completo. Tocá Reintentar en unos minutos: no se va a duplicar.'), txt.slice(0, 300));
  ver('verificacion_fallida: el pedido sigue pendiente', !!C.getPendiente());
  fallar = false;
  $$('#carrito-panel button').find(b => /Reintentar/.test(b.textContent))?.click(); await tick(20);
  ver('verificacion_fallida: el reintento manda el mismo id y termina en exito', ids.length === 2 && ids[0] === ids[1] &&
    !C.getPendiente() && $('#carrito-panel').textContent.includes('APP-9'), JSON.stringify(ids));
  w.Api.llamar = llamarAntes;
  $('#carrito-panel .cp-cerrar-exito')?.click();
  C.vaciar();
}

// P. Cliente nuevo (js/alta-cliente.js): formulario, alta a medias, pedido con los datos del comercio
{
  const antesP = ok + fallas;
  const AC = w.AltaCliente;
  const llenar = (datos) => {
    const f = $('.alta-form');
    Object.entries(datos).forEach(([k, v]) => {
      if (k === 'formula') { const r = f.querySelector(`input[name="formula"][value="${v}"]`); if (r) r.checked = true; }
      else f.elements[k].value = v;
    });
  };
  const enviar = () => $('.alta-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  const DATOS = { comercio: 'Ferretería <b>Nueva</b>', apellido: 'Gómez', contacto: 'Juan', domicilio: 'San Martín 123',
    localidad: 'Rafaela', telefono: '3492 555555', horario: '8 a 12', formula: 'E' };
  C.vaciar('157');

  ver('P1 cuentas puente: 157 si, 100 no', AC?.esCuentaAlta('157') === true && AC.esCuentaAlta('100') === false);

  // Formulario
  let prom = AC.pedirDatos('157');
  await tick();
  ver('P2 formulario: 7 campos y las formulas D, E, F', $$('.alta-form .alta-campo input').length === 7 &&
    JSON.stringify($$('.alta-form input[name="formula"]').map(r => r.value)) === '["D","E","F"]');
  enviar(); await tick();
  ver('P2 vacio: no se cierra y dice que falta', !!$('.alta-form') && $('.alta-error').textContent.startsWith('Falta completar: nombre del comercio') &&
    $('.alta-error').textContent.includes('la fórmula'), $('.alta-error')?.textContent);
  llenar({ ...DATOS, formula: '' });
  enviar(); await tick();
  ver('P2 sin formula: sigue pidiendola', !!$('.alta-form') && $('.alta-error').textContent === 'Falta completar: la fórmula.');
  llenar(DATOS);
  enviar(); await tick();
  let r = await prom;
  ver('P2 completo: devuelve los datos y cierra', r?.comercio === DATOS.comercio && r.formula === 'E' && !$('.alta-form'));
  ver('P2 quedan guardados con el carrito de la 157', C.getAlta('157')?.telefono === '3492 555555');

  // Cerrar sin completar
  C.vaciar('157');
  prom = AC.pedirDatos('157');
  await tick();
  $('.hj-volver').click();
  ver('P3 cerrar el formulario: null y nada guardado', (await prom) === null && C.getAlta('157') === null);

  // Alta a medias: seguir
  C.setAlta(DATOS, '157');
  C.agregar('P001', 2, '157');
  prom = AC.pedirDatos('157');
  await tick();
  ver('P4 alta a medias: pregunta con el comercio y los articulos', $('.alta-pregunta')?.textContent.includes('Tenés un alta a medias: «Ferretería <b>Nueva</b>», con 1 artículo') &&
    !$('.alta-pregunta b b') && $('.alta-pregunta').textContent.includes('Empezar otro descarta el carrito'), $('.alta-pregunta')?.textContent);
  $$('.alta-pregunta button').find(b => b.dataset.r === 'seguir').click(); await tick();
  ver('P4 seguir: el formulario con los datos y el aviso de la formula', $('.alta-form')?.elements.comercio.value === DATOS.comercio &&
    $('.alta-form input[value="E"]').checked && $('.alta-form').textContent.includes('cambian los precios'));
  enviar(); await tick();
  r = await prom;
  ver('P4 el carrito sigue con su articulo', r?.comercio === DATOS.comercio && C.leer('157').length === 1);

  // Alta a medias: empezar otro
  prom = AC.pedirDatos('157');
  await tick();
  $$('.alta-pregunta button').find(b => b.dataset.r === 'otro').click(); await tick();
  ver('P5 empezar otro: carrito y datos anteriores descartados, formulario vacio', C.leer('157').length === 0 && C.getAlta('157') === null &&
    $('.alta-form')?.elements.comercio.value === '');
  $('.hj-volver').click();
  ver('P5 y cerrar: null', (await prom) === null);

  // Restaurar (recarga)
  C.setAlta(DATOS, '157');
  ver('P6 restaurando: los guardados, sin preguntar', (await AC.pedirDatos('157', { restaurando: true }))?.comercio === DATOS.comercio && !$('.alta-pregunta'));
  C.vaciar('157');
  ver('P6 restaurando sin datos: null', (await AC.pedirDatos('157', { restaurando: true })) === null && !$('.alta-form'));

  // Pedido en la cuenta puente
  const precioAntes = w.Precios.getClienteVista;
  w.Precios.getClienteVista = () => ({ cuenta: '157', lista: 'E', nombre: DATOS.comercio, alta: true });
  ponerCupo('157');
  const apiAntes = w.Api.llamar;
  let enviado = null, respGuardar = { ok: true, id: 'x', numero: 'ALTA-1', alta: true };
  w.Api.llamar = async b => (b.accion === 'guardar_pedido' ? (enviado = b.pedido, respGuardar) : apiAntes(b));

  C.agregar('P001', 2, '157');
  w.CarritoPanel.abrir(); await tick(10);
  ver('P7 panel: el titulo es el comercio, escapado', $('#carrito-panel .cp-titulo')?.textContent === DATOS.comercio && !$('#carrito-panel .cp-titulo b'));
  $('#carrito-panel .cp-confirmar').click(); await tick(20);
  ver('P7 sin datos del comercio: avisa y no envia', !enviado && !C.getPendiente('157'));

  C.setAlta(DATOS, '157');
  $('#carrito-panel .cp-confirmar').click(); await tick(20);
  ver('P8 el pedido lleva los datos del comercio y la formula', enviado?.cliente === '157' && enviado.alta?.comercio === DATOS.comercio &&
    enviado.alta.formula === 'E' && enviado.alta.horario === '8 a 12' && enviado.lista === 'E', JSON.stringify(enviado?.alta));
  const exito = $('#carrito-panel .cp-exito')?.textContent || '';
  ver('P8 pantalla: "Alta registrada", "ALTA-1 · falta número de cuenta" y el aviso', exito.includes('Alta registrada') &&
    exito.includes('ALTA-1 · falta número de cuenta') && exito.includes('Oficina carga el número de cuenta'), exito);
  ver('P8 carrito vaciado y datos del comercio borrados', C.leer('157').length === 0 && C.getAlta('157') === null && !C.getPendiente('157'));
  $('#carrito-panel .cp-cerrar-exito')?.click();

  // Rechazo del servidor antes de escribir
  C.setAlta(DATOS, '157');
  C.agregar('P001', 1, '157');
  enviado = null;
  respGuardar = { ok: false, error: 'datos_alta_incompletos' };
  w.CarritoPanel.abrir(); await tick(10);
  $('#carrito-panel .cp-confirmar').click(); await tick(20);
  ver('P9 rechazo datos_alta_incompletos: no queda pendiente, el carrito sigue', !!enviado && !C.getPendiente('157') && C.leer('157').length === 1);
  C.vaciar('157');

  // Un pedido normal no lleva alta
  w.Precios.getClienteVista = precioAntes;
  w.Api.llamar = apiAntes;
  console.log(`Casos de cliente nuevo en la app: ${ok + fallas - antesP}`);
}

// 10. Usuario cliente: nada, y la foto de respaldo (E7)
sessionStorage.setItem('authRol', 'cliente_estandar');
w.menuFuncionalidades.usuarioActual = { clave: '9', rol: 'cliente_estandar' };
cuentaVista = null;
localStorage.setItem('clientData', JSON.stringify({ account: '9', priceList: 'D' }));
document.dispatchEvent(new CustomEvent('cliente:cambio'));
await tick(10);
w.imageLoader = { imageMap: new Map([['P010', 'IMGP010']]) };
C.agregar('P010', 1);
w.CarritoPanel.abrir();
await tick(10);
ver('cliente: vista cliente sin bloque ni icono', !!$('#carrito-panel .cp-fila-cli') && !$('#carrito-panel .cp-sug') && boton().hidden);
ver('E7: foto de respaldo desde imageMap (Map)', $('#carrito-panel .cp-img[data-sku="P010"]')?.style.backgroundImage.includes('IMGP010'));

console.log(`\nDibujar el panel (31 líneas, jsdom, mediana de 10 tandas alternadas de 40): sin bloque ${sinBloque.toFixed(2)} ms, con bloque ${conBloque.toFixed(2)} ms, diferencia ${(conBloque - sinBloque).toFixed(2)} ms`);
console.log(`Tandas sin: ${tandas.sin.map(x => x.toFixed(1)).join(' ')} | con: ${tandas.con.map(x => x.toFixed(1)).join(' ')}`);
console.log(`Armar solo el bloque (5000 veces): ${(soloBloque * 1000).toFixed(1)} µs`);
console.log(`${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
