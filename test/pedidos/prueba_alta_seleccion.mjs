// PRUEBA DE LA SELECCION DE UN CLIENTE NUEVO con jsdom: js/busqueda-clientes.js
// (script clasico, el real), js/precios.js, js/carrito.js, js/alta-cliente.js
// y js/hoja.js reales. Al elegir la cuenta puente se piden los datos del
// comercio antes de fijar el cliente, y la lista de precios es la formula
// elegida. Padron y finanzas simulados.
// Uso, desde la raiz del proyecto:
//   node test/pedidos/prueba_alta_seleccion.mjs
import { readFileSync } from 'fs';
import { join } from 'path';
import { RAIZ, JSDOM, prepararModulos } from './preparar.mjs';
const importar = prepararModulos(['precios.js', 'carrito.js', 'alta-cliente.js', 'hoja.js', 'datos-catalogo.js'], {
  'config.js': "export const SOLO_VENDEDORES = false;\nexport const CUENTAS_ALTA = ['157', '158', '159'];\n",
  'sesion.js': 'export const pedirToken = () => Promise.resolve(null);\n'
});

let ok = 0, fallas = 0;
const ver = (nombre, cond, extra = '') => { if (cond) ok++; else { fallas++; console.log('FALLA:', nombre, extra); } };
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

const dom = new JSDOM(`<!doctype html><html><body>
  <nav><div class="input-container"><i class="fa-search"></i><input type="text" placeholder="Buscar en catálogo de productos..."></div></nav>
  <div id="barra-info-contextual"><div class="barra-info-content"></div></div>
  <div class="container-img"><span class="price-tag" data-sku="P1"></span></div>
</body></html>`, { url: 'https://ferremax.test/catalogo.html', pretendToBeVisual: true, runScripts: 'outside-only' });
const w = dom.window;
for (const k of ['window', 'document', 'sessionStorage', 'localStorage', 'CustomEvent', 'Event', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame'])
  globalThis[k] = k === 'window' ? w : w[k];
w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

const FINANZAS = { clientes: {
  100: { nombre: 'Ferretería Centro', vendedor: 'V1', cupoMes: 1000 },
  157: { nombre: 'NUEVO CLIENTE RF', vendedor: 'V1', cupoMes: 0 } } };
const PERMISOS = { 100: { name: 'Ferretería Centro', priceList: 'D' }, 157: { name: 'NUEVO CLIENTE RF', priceList: 'F' } };
w.fetch = globalThis.fetch = async url => ({ ok: true, json: async () =>
  (String(url).includes('clientes_finanzas') ? FINANZAS : String(url).includes('clientes_permisos') ? PERMISOS : {}) });
sessionStorage.setItem('authRol', 'vendedor_estandar');
w.menuFuncionalidades = { usuarioActual: { rol: 'vendedor_estandar', codigo: 'V1' } };
w.productManager = { getProduct: () => ({ precios: { D: 100, E: 90, F: 80 }, precio: 100 }), clientData: {} };
const barras = [], actualizaciones = [];
w.BarraSaludFinanciera = { visible: true, mostrar: d => barras.push(d), actualizarDatos: d => actualizaciones.push(d) };
// El servidor de finanzas responde con el nombre de la cuenta puente
sessionStorage.setItem('authToken', 't');
w.Api = { llamar: async b => (b.accion === 'finanzas'
  ? { ok: true, nombre: b.cuenta === '157' ? 'NUEVO CLIENTE RF' : 'Ferretería Centro', disponible: 0, cupoMes: 0 } : { ok: false }) };

const Precios = await importar('precios.js');
await importar('carrito.js');
await importar('alta-cliente.js');
// El script clasico, tal cual lo carga catalogo.html
w.eval(readFileSync(join(RAIZ, 'js', 'busqueda-clientes.js'), 'utf8'));
await w.busquedaClientes.init();
await tick();
const $ = s => document.querySelector(s);
const B = w.busquedaClientes;
const vista = () => JSON.parse(sessionStorage.getItem('clienteVista') || 'null');
const llenar = d => {
  const f = $('.alta-form');
  Object.entries(d).forEach(([k, v]) => {
    if (k === 'formula') f.querySelector(`input[name="formula"][value="${v}"]`).checked = true;
    else f.elements[k].value = v;
  });
  f.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
};
const DATOS = { comercio: 'Ferretería El Tornillo', apellido: 'Gómez', contacto: 'Juan', domicilio: 'San Martín 123',
  localidad: 'Rafaela', telefono: '3492 555555', horario: '8 a 12', formula: 'E' };

// 1. Un cliente comun: sin formulario, lista del padron
await B.seleccionarCliente('100');
ver('cliente comun: sin formulario y con la lista del padron (D)', !$('.alta-form') && vista()?.cuenta === '100' && vista().lista === 'D' && !vista().alta);
ver('cliente comun: precio de la lista D', Precios.precioLista('P1') === 100);
Precios.limpiarClienteVista();

// 2. Cuenta puente: formulario antes de fijar el cliente
let p = B.seleccionarCliente('157');
await tick();
ver('cuenta puente: se abre el formulario', !!$('.alta-form'));
ver('mientras tanto no hay cliente elegido (ni precios del cliente)', vista() === null);
$('.hj-volver').click();
await p;
ver('cancelar: sigue sin cliente', vista() === null && !barras.some(b => b.nombre?.includes('NUEVO')));

p = B.seleccionarCliente('157');
await tick();
llenar(DATOS);
await p;
ver('completo: cliente 157, lista E (la formula, no la F del padron), marcado alta', vista()?.cuenta === '157' && vista().lista === 'E' && vista().alta === true, JSON.stringify(vista()));
ver('el nombre del cliente es el comercio', vista()?.nombre === 'Ferretería El Tornillo');
ver('precios con la formula E', Precios.precioLista('P1') === 90);
ver('la barra dice "Ferretería El Tornillo (cliente nuevo)"', barras.at(-1)?.nombre === 'Ferretería El Tornillo (cliente nuevo)');
await tick();
ver('la respuesta de finanzas no la pisa con "NUEVO CLIENTE RF"', actualizaciones.at(-1)?.nombre === 'Ferretería El Tornillo (cliente nuevo)',
  JSON.stringify(actualizaciones.at(-1)));
ver('los datos quedan con el carrito de la 157', w.Carrito.getAlta('157')?.formula === 'E');

// 3. Recarga: se restaura sin preguntar
await B.seleccionarCliente('157', { restaurando: true });
ver('recarga: sin formulario ni pregunta, sigue con la formula E', !$('.alta-form') && !$('.alta-pregunta') && vista()?.lista === 'E');

// 4. Recarga sin datos guardados: no se restaura
w.Carrito.vaciar('157');
await B.seleccionarCliente('157', { restaurando: true });
ver('recarga sin datos del comercio: no queda cliente elegido', vista() === null && !$('.alta-form'));

// 5. Cliente usuario (rol cliente): nunca hay formulario
sessionStorage.setItem('authRol', 'cliente_estandar');
await B.seleccionarCliente('157');
ver('rol cliente: sin formulario', !$('.alta-form'));
sessionStorage.setItem('authRol', 'vendedor_estandar');

console.log(`\n${ok}/${ok + fallas} pruebas bien`);
process.exit(fallas ? 1 : 0);
