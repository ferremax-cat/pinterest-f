/*
 * Buscador v2 — Catálogo Ferremax
 *
 * Decide QUÉ productos mostrar y en QUÉ orden. El dibujo sigue a cargo de
 * search-engine.js (displayResults), que recibe la lista de códigos.
 *
 * Usa json/search/v2/indice.json, generado por generar_indice_busqueda.py.
 * La normalización es una copia exacta de la de Python: cualquier cambio hay
 * que hacerlo en los dos lados y verificarlo con casos_normalizacion.json.
 *
 * Desde la consola del navegador:
 *   await BuscadorV2.probarCasos()      verifica la normalización contra Python
 *   await BuscadorV2.probar("fix 3.5")  muestra resultados, grupos y tiempo
 */
(function () {
  'use strict';

  // Interruptor general del motor nuevo
  const USAR_BUSQUEDA_V2 = true;

  const RUTA_INDICE = 'json/search/v2/indice.json';
  const RUTA_CASOS = 'js/search/v2/casos_normalizacion.json';

  // ---------------------------------------------------------------------
  // Normalización y tokenización (idéntica a generar_indice_busqueda.py)
  // ---------------------------------------------------------------------
  const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'para', 'con',
                                   'en', 'por', 'al', 'un', 'una']);

  const RE_ACENTOS = /[\u0300-\u036f]/g;
  const RE_COMA_DECIMAL = /(\d),(?=\d)/g;
  const RE_CEROS_FINALES = /(\d+\.\d*?[1-9])0+(?!\d)/g;
  const RE_DECIMAL_CERO = /(\d+)\.0+(?!\d)/g;
  const RE_FRACCION_MIXTA = /(^|\s)(\d{1,2})[\s.\-]+(\d+\/\d+)/g;
  const RE_FRACCION_PEGADA = /(^|[^\d/.])(\d)(\d)\/(\d{1,2})(?![\d/])/g;   // 11/2 -> 1-1/2
  const DENOMINADORES_PULGADA = new Set([2, 4, 8, 16]);

  function separarFraccionPegada(todo, antes, e, n, d) {
    const entero = +e, numerador = +n, denominador = +d;
    if (DENOMINADORES_PULGADA.has(denominador) && numerador < denominador &&
        entero * 10 + numerador > denominador) {
      return antes + e + '-' + n + '/' + d;
    }
    return todo;
  }
  const RE_X_ENTRE_MEDIDAS = /(\d[a-z"]{0,3})x(?=\d)/g;
  const RE_X_INICIAL = /(^|\s)x(?=\d)/g;
  const RE_TOKEN = /\d+-\d+\/\d+|\d+(?:[./]\d+)+[a-z]*|\d+[a-z]+\d*[a-z]*|\d+|[a-z]\/[a-z]|[a-z]+\d+[a-z\d]*|[a-z]+/g;
  const RE_PARTES = /\d+(?:[./]\d+)*|[a-z]+/g;
  const RE_SOLO_LETRAS = /^[a-z]+$/;
  const RE_TIENE_DIGITO = /\d/;
  const RE_TIENE_LETRA = /[a-z]/;

  function normalizar(texto) {
    let t = String(texto == null ? '' : texto).toLowerCase();
    t = t.normalize('NFD').replace(RE_ACENTOS, '');
    t = t.replace(RE_COMA_DECIMAL, '$1.');
    t = t.replace(RE_CEROS_FINALES, '$1');
    t = t.replace(RE_DECIMAL_CERO, '$1');
    t = t.replace(RE_FRACCION_MIXTA, '$1$2-$3');
    t = t.replace(RE_FRACCION_PEGADA, separarFraccionPegada);
    t = t.replace(RE_X_ENTRE_MEDIDAS, '$1 x ');
    t = t.replace(RE_X_INICIAL, '$1x ');
    return t;
  }

  function tokenizar(texto, expandir) {
    if (expandir === undefined) expandir = true;
    const salida = [];
    const vistos = new Set();
    const agregar = (tok) => {
      if (vistos.has(tok)) return;
      if (RE_SOLO_LETRAS.test(tok) && (tok.length < 2 || PALABRAS_VACIAS.has(tok))) return;
      vistos.add(tok);
      salida.push(tok);
    };
    const encontrados = normalizar(texto).match(RE_TOKEN) || [];
    for (const tok of encontrados) {
      agregar(tok);
      if (expandir && RE_TIENE_DIGITO.test(tok) && RE_TIENE_LETRA.test(tok)) {
        // 20mm -> 20 y mm; pn20 -> solo pn (igual que en Python)
        const empiezaConLetra = RE_TIENE_LETRA.test(tok[0]);
        for (const parte of (tok.match(RE_PARTES) || [])) {
          if (empiezaConLetra && RE_TIENE_DIGITO.test(parte[0])) continue;
          agregar(parte);
        }
      }
    }
    return salida;
  }

  // Código en forma compacta: "EGVL 20" y "egvl20" quedan iguales
  function compactarCodigo(codigo) {
    return String(codigo == null ? '' : codigo).toLowerCase()
      .normalize('NFD').replace(RE_ACENTOS, '')
      .replace(/[^a-z0-9]/g, '');
  }

  // ---------------------------------------------------------------------
  // Carga del índice (una sola descarga; si falla, se reintenta en la próxima)
  // ---------------------------------------------------------------------
  let promesaCarga = null;
  let datos = null;

  function cargar() {
    if (datos) return Promise.resolve(datos);
    if (promesaCarga) return promesaCarga;
    const inicio = performance.now();
    promesaCarga = fetch(RUTA_INDICE, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' al cargar ' + RUTA_INDICE);
        return r.json();
      })
      .then((indice) => {
        datos = prepararDatos(indice);
        console.log('[BuscadorV2] índice ' + indice.version + ': ' + indice.total +
                    ' productos en ' + Math.round(performance.now() - inicio) + ' ms');
        return datos;
      })
      .catch((err) => {
        promesaCarga = null;
        throw err;
      });
    return promesaCarga;
  }

  function prepararDatos(indice) {
    const codigos = new Map();
    const compactos = [];
    indice.productos.forEach((p, id) => {
      const c = compactarCodigo(p[0]);
      compactos.push(c);
      if (!codigos.has(c)) codigos.set(c, id);
    });
    return {
      version: indice.version,
      productos: indice.productos,
      nombre: indice.nombre,
      categoria: indice.categoria,
      tokensNombre: Object.keys(indice.nombre).sort(),
      tokensCategoria: Object.keys(indice.categoria).sort(),
      codigos: codigos,
      compactos: compactos,
      primeros: new Map()
    };
  }

  // Primera palabra del nombre de un producto (se calcula una vez y se guarda)
  function primerToken(d, id) {
    if (!d.primeros.has(id)) d.primeros.set(id, tokenizar(d.productos[id][1], false)[0] || '');
    return d.primeros.get(id);
  }

  const COLADOR = new Intl.Collator('es', { sensitivity: 'base' });
  const RE_NUMERO_ORDEN = /\d+-\d+\/\d+|\d+(?:\.\d+)?\/\d+|\d+(?:\.\d+)?/g;

  // Convierte cada número en un texto de largo fijo según su valor, para que
  // 1/2 < 3/4 < 1 < 1-1/4 < 1-1/2 < 2 y 1.8 < 2 < 2.5 al ordenar alfabéticamente
  function valorOrden(txt) {
    let v;
    if (txt.indexOf('-') > 0) {
      const [entero, fraccion] = txt.split('-');
      const [a, b] = fraccion.split('/');
      v = +entero + (+b ? +a / +b : 0);
    } else if (txt.indexOf('/') > 0) {
      const [a, b] = txt.split('/');
      v = +b ? +a / +b : 0;
    } else {
      v = +txt;
    }
    return ' ' + String(Math.round(v * 1000)).padStart(12, '0') + ' ';
  }

  function claveOrden(d, id, primera) {
    let clave = normalizar(d.productos[id][1])
      .replace(RE_NUMERO_ORDEN, valorOrden)
      .replace(/\s+/g, ' ')
      .trim();
    const t0 = primerToken(d, id);
    if (primera && t0 && t0 !== primera && t0.length >= 5 && primera.startsWith(t0) && clave.startsWith(t0)) {
      return primera + clave.slice(t0.length);
    }
    return clave;
  }

  // Tokens que empiezan con un prefijo, por búsqueda binaria en la lista ordenada
  function tokensConPrefijo(lista, prefijo) {
    let bajo = 0, alto = lista.length;
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1;
      if (lista[medio] < prefijo) bajo = medio + 1; else alto = medio;
    }
    const salida = [];
    for (let i = bajo; i < lista.length && lista[i].startsWith(prefijo); i++) salida.push(lista[i]);
    return salida;
  }

  // ---------------------------------------------------------------------
  // Búsqueda
  // ---------------------------------------------------------------------
  const PUNTOS = {
    nombreExacto: 10,
    nombreAbreviado: 10,
    nombrePrefijo: 6,
    categoriaExacta: 3,
    categoriaPrefijo: 2
  };
  // Orden de los grupos. "Es el artículo" = el nombre empieza con la primera palabra buscada:
  // todas las mangueras van antes que un acople "de manguera", aunque el acople tenga la medida.
  const GRUPO = {
    codigoExacto: 6,
    articuloCompleto: 5,     // es el artículo y tiene todas las palabras
    articuloParcial: 4,      // es el artículo, le falta una palabra
    menciona: 3,             // lo menciona y tiene todas las palabras
    codigoPrefijo: 2,
    mencionaParcial: 1       // lo menciona, le falta una palabra
  };

  function puntuarToken(d, token, esUltimo) {
    const mejor = new Map();
    const anotar = (ids, puntos) => {
      if (!ids) return;
      for (const id of ids) if ((mejor.get(id) || 0) < puntos) mejor.set(id, puntos);
    };
    anotar(d.nombre[token], PUNTOS.nombreExacto);
    anotar(d.categoria[token], PUNTOS.categoriaExacta);
    // Abreviaturas por truncamiento: "manguera" encuentra "manguer", "termofusion" encuentra "termof".
    // La abreviatura debe tener al menos 5 letras y la mitad de la palabra:
    // así "termofusion" no encuentra "termo".
    if (RE_SOLO_LETRAS.test(token) && token.length >= 6) {
      const desde = Math.max(5, Math.ceil(token.length / 2));
      for (let largo = desde; largo < token.length; largo++) {
        anotar(d.nombre[token.slice(0, largo)], PUNTOS.nombreAbreviado);
      }
    }
    if (esUltimo) {
      for (const t of tokensConPrefijo(d.tokensNombre, token)) {
        if (t !== token) anotar(d.nombre[t], PUNTOS.nombrePrefijo);
      }
      for (const t of tokensConPrefijo(d.tokensCategoria, token)) {
        if (t !== token) anotar(d.categoria[t], PUNTOS.categoriaPrefijo);
      }
    }
    return mejor;
  }

  function buscarEnDatos(d, consulta) {
    const texto = String(consulta == null ? '' : consulta).trim();
    if (!texto) return [];

    const tokens = tokenizar(texto, false);
    const n = tokens.length;
    const palabrasEnConsulta = tokens.filter((t) => RE_TIENE_LETRA.test(t)).length;
    const acumulado = new Map();   // id -> { cubiertos, palabras, puntos }

    tokens.forEach((token, k) => {
      const esPalabra = RE_TIENE_LETRA.test(token);
      for (const [id, puntos] of puntuarToken(d, token, k === n - 1)) {
        const a = acumulado.get(id) || { cubiertos: 0, palabras: 0, puntos: 0 };
        a.cubiertos++;
        if (esPalabra) a.palabras++;
        a.puntos += puntos;
        acumulado.set(id, a);
      }
    });

    // Códigos: exacto siempre; prefijo solo si la consulta tiene algún número
    const compacta = compactarCodigo(texto);
    const idCodigoExacto = d.codigos.has(compacta) ? d.codigos.get(compacta) : -1;
    const prefijosCodigo = new Set();
    if (compacta.length >= 3 && RE_TIENE_DIGITO.test(compacta)) {
      d.compactos.forEach((c, id) => {
        if (id !== idCodigoExacto && c.startsWith(compacta)) prefijosCodigo.add(id);
      });
    }

    // ¿El nombre empieza con la primera palabra buscada? (define si "es el artículo")
    const primera = n > 0 && RE_TIENE_LETRA.test(tokens[0]) ? tokens[0] : null;
    const empiezaConPrimera = (id) => {
      if (!primera) return false;
      const t0 = primerToken(d, id);
      if (!t0) return false;
      return t0 === primera || (n === 1 && t0.startsWith(primera)) ||
             (t0.length >= 5 && primera.startsWith(t0));
    };

    const minimo = Math.max(1, n - 1);
    const resultados = [];
    const candidatos = new Set([...acumulado.keys(), ...prefijosCodigo]);
    if (idCodigoExacto >= 0) candidatos.add(idCodigoExacto);

    for (const id of candidatos) {
      const a = acumulado.get(id) || { cubiertos: 0, palabras: 0, puntos: 0 };
      // Para "falta una" se exige al menos una palabra (no alcanza con coincidir
      // solo en una medida: "valvula 1/2" no debe traer todo lo que sea 1/2)
      const tienePalabra = palabrasEnConsulta === 0 || a.palabras > 0;
      const completo = n > 0 && a.cubiertos === n;
      const parcial = !completo && a.cubiertos >= minimo && tienePalabra;
      const articulo = (completo || parcial) && empiezaConPrimera(id);
      let grupo = 0;
      if (id === idCodigoExacto) grupo = GRUPO.codigoExacto;
      else if (completo) grupo = articulo ? GRUPO.articuloCompleto : GRUPO.menciona;
      else if (parcial && articulo) grupo = GRUPO.articuloParcial;
      else if (prefijosCodigo.has(id)) grupo = GRUPO.codigoPrefijo;
      else if (parcial) grupo = GRUPO.mencionaParcial;
      if (grupo) resultados.push({ id: id, grupo: grupo, puntos: a.puntos });
    }

    // Dentro de cada grupo: por nombre, leyendo la abreviatura como la palabra buscada
    // ("MANGUER PLAS REF" se ordena junto a "MANGUERA PLAS REF"), con números en orden natural
    for (const r of resultados) r.clave = claveOrden(d, r.id, primera);
    resultados.sort((x, y) => (y.grupo - x.grupo) || (y.puntos - x.puntos) ||
                              COLADOR.compare(x.clave, y.clave) || (x.id - y.id));
    return resultados;
  }

  // Devuelve la lista ordenada de códigos originales (como figuran en productos.json)
  async function buscar(consulta) {
    const d = await cargar();
    return buscarEnDatos(d, consulta).map((r) => d.productos[r.id][0]);
  }

  // ---------------------------------------------------------------------
  // Herramientas de verificación para la consola
  // ---------------------------------------------------------------------
  async function probarCasos() {
    const r = await fetch(RUTA_CASOS, { cache: 'no-cache' });
    const casos = (await r.json()).casos;
    let fallas = 0;
    for (const c of casos) {
      const obtenido = tokenizar(c.texto, c.expandir !== false);
      if (JSON.stringify(obtenido) !== JSON.stringify(c.tokens)) {
        fallas++;
        console.warn('FALLA', c.texto, '\n esperado:', c.tokens, '\n obtenido:', obtenido);
      }
    }
    console.log('[BuscadorV2] casos de normalización: ' + (casos.length - fallas) +
                ' de ' + casos.length + ' correctos');
    return fallas === 0;
  }

  async function probar(consulta, limite) {
    const d = await cargar();
    const inicio = performance.now();
    const resultados = buscarEnDatos(d, consulta);
    const ms = performance.now() - inicio;
    const nombresGrupo = { 6: 'código exacto', 5: 'artículo, todas', 4: 'artículo, falta una',
                           3: 'menciona, todas', 2: 'prefijo código', 1: 'menciona, falta una' };
    console.log('[BuscadorV2] "' + consulta + '" → tokens ' + JSON.stringify(tokenizar(consulta, false)) +
                ', ' + resultados.length + ' resultados en ' + ms.toFixed(1) + ' ms');
    console.table(resultados.slice(0, limite || 20).map((r) => ({
      codigo: d.productos[r.id][0],
      nombre: d.productos[r.id][1],
      grupo: nombresGrupo[r.grupo],
      puntos: r.puntos
    })));
  }

  // ---------------------------------------------------------------------
  // Precarga: al tocar el buscador o cuando el navegador queda libre
  // ---------------------------------------------------------------------
  function programarPrecarga() {
    const precargar = () => { cargar().catch((e) => console.warn('[BuscadorV2] precarga fallida:', e)); };
    document.addEventListener('DOMContentLoaded', () => {
      const campo = document.querySelector('input[type="text"]');
      if (campo) campo.addEventListener('focus', precargar, { once: true });
    });
    window.addEventListener('load', () => {
      if ('requestIdleCallback' in window) requestIdleCallback(precargar, { timeout: 5000 });
      else setTimeout(precargar, 2000);
    });
  }

  window.BuscadorV2 = {
    activo: USAR_BUSQUEDA_V2,
    buscar: buscar,
    cargar: cargar,
    tokenizar: tokenizar,
    normalizar: normalizar,
    probarCasos: probarCasos,
    probar: probar,
    _buscarEnDatos: buscarEnDatos,
    _prepararDatos: prepararDatos
  };

  if (USAR_BUSQUEDA_V2 && typeof document !== 'undefined') programarPrecarga();
})();
