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
 *   await BuscadorV2.probarBusquedas()  corre casos_busqueda.json
 */
(function () {
  'use strict';

  // Interruptor general del motor nuevo
  const USAR_BUSQUEDA_V2 = true;

  const RUTA_INDICE = 'json/search/v2/indice.json';
  const RUTA_CASOS = 'js/search/v2/casos_normalizacion.json';
  const RUTA_CASOS_BUSQUEDA = 'js/search/v2/casos_busqueda.json';

  // ---------------------------------------------------------------------
  // Normalización y tokenización (idéntica a generar_indice_busqueda.py)
  // ---------------------------------------------------------------------
  const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'para', 'con',
                                   'en', 'por', 'al', 'un', 'una']);

  const RE_ACENTOS = /[\u0300-\u036f]/g;
  // Siglas con puntos (r.c.t -> rct) y letras sueltas con guion (h-h -> h/h), igual que en Python
  const RE_SIGLA = /(^|[^a-z0-9.])((?:[a-z]\.)+[a-z])\.?(?![a-z0-9])/g;
  const unirSigla = (todo, antes, sigla) => antes + sigla.replace(/\./g, '');
  const RE_LETRAS_GUION = /(^|[^a-z0-9-])([a-z](?:-[a-z])+)(?![a-z0-9-])/g;
  const unirGuion = (todo, antes, letras) => antes + letras.replace(/-/g, '/');
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
  const RE_TOKEN = /\d+-\d+\/\d+|\d+(?:[./]\d+)+[a-z]*|\d+[a-z]+\d*[a-z]*|\d+|[a-z](?:\/[a-z])+(?![a-z])|[a-z]+\d+[a-z\d]*|[a-z]+/g;
  const RE_PARTES = /\d+(?:[./]\d+)*|[a-z]+/g;
  const RE_SOLO_LETRAS = /^[a-z]+$/;
  const RE_TIENE_DIGITO = /\d/;
  const RE_TIENE_LETRA = /[a-z]/;

  function normalizar(texto) {
    let t = String(texto == null ? '' : texto).toLowerCase();
    t = t.normalize('NFD').replace(RE_ACENTOS, '');
    t = t.replace(RE_SIGLA, unirSigla);
    t = t.replace(RE_LETRAS_GUION, unirGuion);
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
  let pendiente = null;          // índice nuevo ya descargado, se usa en la próxima búsqueda nueva
  let descargandoNueva = null;   // huella que se está descargando

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
      primeros: new Map(),
      // término -> término principal de su grupo (diccionario_buscador.xlsx). Un índice
      // viejo sin equivalencias da un mapa vacío y todo sigue como antes
      canon: new Map((indice.equivalencias || []).flatMap((g) => g.map((t) => [t, g[0]])))
    };
  }

  // Índice nuevo publicado con la pestaña abierta (los vendedores la dejan toda
  // la jornada). frescura-precios.js lee json/version.json cada 15 minutos y
  // avisa con 'version:leida'. El índice se baja en segundo plano y queda
  // pendiente: se empieza a usar en la próxima búsqueda nueva, nunca en medio
  // del scroll de una búsqueda (ver buscar)
  function revisarVersion(e) {
    const huella = e.detail && e.detail.indice && e.detail.indice.huella;
    if (!huella || !datos || huella === datos.version) return;
    if ((pendiente && pendiente.version === huella) || descargandoNueva === huella) return;
    descargandoNueva = huella;
    // La huella en la URL evita la copia vieja de la cache del servidor
    fetch(RUTA_INDICE + '?v=' + encodeURIComponent(huella))
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' al cargar ' + RUTA_INDICE);
        return r.json();
      })
      .then((indice) => {
        // Si el servidor todavía da el anterior, se reintenta en la próxima revisión
        if (indice.version !== huella) return;
        pendiente = prepararDatos(indice);
        console.log('[BuscadorV2] índice nuevo ' + huella + ' listo; se usa en la próxima búsqueda');
      })
      .catch((err) => console.warn('[BuscadorV2] no se pudo bajar el índice nuevo:', err))
      .finally(() => { descargandoNueva = null; });
  }

  // Primera palabra del nombre de un producto (se calcula una vez y se guarda)
  function primerToken(d, id) {
    if (!d.primeros.has(id)) d.primeros.set(id, tokenizar(d.productos[id][1], false)[0] || '');
    return d.primeros.get(id);
  }

  const COLADOR = new Intl.Collator('es', { sensitivity: 'base' });
  // Códigos en orden natural: rdtf12320 < rdtf12400 < rdtf12500
  const COLADOR_CODIGO = new Intl.Collator('es', { numeric: true });
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
      .trim()
      // Cada palabra se lee como el término principal de su grupo: "ENTREROSCA BCE"
      // y "RCT RED BRNCE" se ordenan como "entrerosca bronce ..."
      .replace(/[a-z]+/g, (w) => d.canon.get(w) || w);
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
    categoriaPrefijo: 2,
    // Palabra de la consulta que es comienzo de código ("px" en "px cupla m-h"):
    // vale como una palabra del nombre para toda esa línea
    lineaCodigo: 10,
    // Si además es una palabra de los nombres ("cono", "tor", "pega", "ros"), vale
    // menos que esa palabra escrita en el nombre: los anafes CONO… o los adhesivos
    // PEGAL… no se adelantan a los productos que dicen CONO o PEGA
    lineaCodigoTambienPalabra: 5
  };
  // Orden de los grupos. "Es el artículo" = el nombre empieza con la primera palabra buscada:
  // todas las mangueras van antes que un acople "de manguera", aunque el acople tenga la medida.
  const GRUPO = {
    codigoExacto: 7,
    lineaCodigo: 6,          // el código empieza con la consulta, que es solo letras ("ros", "plasti")
    articuloCompleto: 5,     // es el artículo y tiene todas las palabras
    articuloParcial: 4,      // es el artículo, le falta una palabra
    menciona: 3,             // lo menciona y tiene todas las palabras
    codigoPrefijo: 2,        // el código empieza con la consulta, que tiene números
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
    // Las palabras del diccionario no se truncan: su grupo ya dice qué abreviaturas
    // valen ("termocupla" ya no encuentra "termo", los termos de mate)
    if (RE_SOLO_LETRAS.test(token) && token.length >= 6 && !d.canon.has(token)) {
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

    // Palabras que son el comienzo de algún código ("px" de POLIMEX, "rd" de REDECO).
    // En consultas de varias palabras cuentan como coincidencia para todos los
    // productos de esa línea, además de sus coincidencias normales en nombres y
    // categorías. Con una sola palabra no se usa: ahí manda la línea de código de siempre
    const lineaDe = new Map();   // palabra -> ids cuyo código empieza así
    if (n > 1) {
      for (const token of tokens) {
        if (!RE_SOLO_LETRAS.test(token) || token.length < 2 || lineaDe.has(token)) continue;
        const ids = new Set();
        d.compactos.forEach((c, id) => { if (c.startsWith(token)) ids.add(id); });
        if (ids.size) lineaDe.set(token, ids);
      }
    }

    tokens.forEach((token, k) => {
      const esPalabra = RE_TIENE_LETRA.test(token);
      const coincidencias = puntuarToken(d, token, k === n - 1);
      const linea = lineaDe.get(token);
      if (linea) {
        const puntosLinea = d.nombre[token] ? PUNTOS.lineaCodigoTambienPalabra : PUNTOS.lineaCodigo;
        for (const id of linea) {
          if ((coincidencias.get(id) || 0) < puntosLinea) coincidencias.set(id, puntosLinea);
        }
      }
      for (const [id, puntos] of coincidencias) {
        const a = acumulado.get(id) || { cubiertos: 0, palabras: 0, puntos: 0 };
        a.cubiertos++;
        if (esPalabra) a.palabras++;
        a.puntos += puntos;
        acumulado.set(id, a);
      }
    });

    // Códigos: exacto siempre. Prefijo con números ("isafix40"): desde 3 caracteres,
    // en su lugar de siempre. Prefijo solo letras ("rd", "rdtf", "plasti"): desde 2
    // caracteres y una sola palabra; es la línea que se busca y va primero, aun antes de los artículos
    const compacta = compactarCodigo(texto);
    const idCodigoExacto = d.codigos.has(compacta) ? d.codigos.get(compacta) : -1;
    const prefijoConNumeros = RE_TIENE_DIGITO.test(compacta);
    const buscarPrefijo = prefijoConNumeros ? compacta.length >= 3
                                            : compacta.length >= 2 && n <= 1;
    const prefijosCodigo = new Set();
    if (buscarPrefijo) {
      d.compactos.forEach((c, id) => {
        if (id !== idCodigoExacto && c.startsWith(compacta)) prefijosCodigo.add(id);
      });
    }

    // ¿El nombre empieza con la primera palabra buscada? (define si "es el artículo").
    // Se saltean las palabras del principio que son solo comienzo de código (no
    // aparecen en ningún nombre): en "px cupla m-h" el artículo es "cupla". "tor punta"
    // o "cono 1/2" no cambian, porque "tor" y "cono" también son palabras del catálogo
    const soloCodigo = (t) => lineaDe.has(t) && !d.nombre[t];
    let k0 = 0;
    while (k0 < n - 1 && soloCodigo(tokens[k0])) k0++;
    const primera = n > 0 && RE_TIENE_LETRA.test(tokens[k0]) ? tokens[k0] : null;
    const empiezaConPrimera = (id) => {
      if (!primera) return false;
      const t0 = primerToken(d, id);
      if (!t0) return false;
      // "rct" es el artículo de "ENTREROSCA ...": los equivalentes cuentan igual
      const canon = (t) => d.canon.get(t) || t;
      return t0 === primera || canon(t0) === canon(primera) ||
             (n === 1 && t0.startsWith(primera)) ||
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
      // Quien escribe las letras de un código ("ros", "plasti") busca esa línea:
      // va primero, aunque el producto también sea artículo
      else if (prefijosCodigo.has(id) && !prefijoConNumeros) grupo = GRUPO.lineaCodigo;
      else if (completo && articulo) grupo = GRUPO.articuloCompleto;
      else if (parcial && articulo) grupo = GRUPO.articuloParcial;
      else if (completo) grupo = GRUPO.menciona;
      else if (prefijosCodigo.has(id)) grupo = GRUPO.codigoPrefijo;
      else if (parcial) grupo = GRUPO.mencionaParcial;
      if (grupo) resultados.push({ id: id, grupo: grupo, puntos: a.puntos });
    }

    // Dentro de cada grupo: por nombre, leyendo la abreviatura como la palabra buscada
    // ("MANGUER PLAS REF" se ordena junto a "MANGUERA PLAS REF"), con números en orden natural
    for (const r of resultados) r.clave = claveOrden(d, r.id, primera);
    // La línea de código va solo por código, en orden natural, sin mirar los puntos
    // (los que además coinciden por descripción tienen puntos y desordenarían la línea).
    // Se usa el código original y no el compacto, para que ROS4182-1 quede junto a ROS4182
    const codigoOrden = (id) => String(d.productos[id][0]).toLowerCase();
    resultados.sort((x, y) => (y.grupo - x.grupo) ||
      (x.grupo === GRUPO.lineaCodigo
        ? COLADOR_CODIGO.compare(codigoOrden(x.id), codigoOrden(y.id))
        : (y.puntos - x.puntos) || COLADOR.compare(x.clave, y.clave)) ||
      (x.id - y.id));
    return resultados;
  }

  // Devuelve la lista ordenada de códigos originales (como figuran en productos.json).
  // opciones.primeraTanda: la búsqueda empieza de cero (no es el scroll de una
  // anterior). Recién ahí se pasa al índice nuevo, si hay uno listo: todas las
  // tandas de una misma búsqueda salen del mismo índice
  async function buscar(consulta, opciones) {
    if (pendiente && opciones && opciones.primeraTanda) {
      datos = pendiente;
      pendiente = null;
      console.log('[BuscadorV2] usando el índice ' + datos.version);
    }
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

  // Corre las búsquedas de casos_busqueda.json y dice cuáles pasan. Cada caso
  // puede pedir: primero (código en la posición 1), primerosEnGrupo {n, grupo},
  // enLosPrimeros {n, codigos}, fueraDelGrupo {grupo, codigos}, minimoResultados.
  // Los grupos se nombran como en GRUPO (articuloCompleto, lineaCodigo, ...)
  async function probarBusquedas() {
    const d = await cargar();
    const r0 = await fetch(RUTA_CASOS_BUSQUEDA, { cache: 'no-cache' });
    const casos = (await r0.json()).casos;
    const cod = (x) => d.productos[x.id][0];
    const filas = casos.map((c) => {
      const r = buscarEnDatos(d, c.consulta);
      const fallas = [];
      if (c.primero && (!r[0] || cod(r[0]) !== c.primero)) {
        fallas.push('primero ' + (r[0] ? cod(r[0]) : '(nada)') + ', se esperaba ' + c.primero);
      }
      if (c.primerosEnGrupo) {
        const g = GRUPO[c.primerosEnGrupo.grupo], n = c.primerosEnGrupo.n;
        if (!g) fallas.push('grupo desconocido ' + c.primerosEnGrupo.grupo);
        else if (r.length < n || r.slice(0, n).some((x) => x.grupo !== g)) {
          fallas.push('los primeros ' + n + ' no son todos ' + c.primerosEnGrupo.grupo);
        }
      }
      if (c.enLosPrimeros) {
        const top = new Set(r.slice(0, c.enLosPrimeros.n).map(cod));
        const faltan = c.enLosPrimeros.codigos.filter((x) => !top.has(x));
        if (faltan.length) fallas.push('faltan en los primeros ' + c.enLosPrimeros.n + ': ' + faltan.join(', '));
      }
      if (c.fueraDelGrupo) {
        const g = GRUPO[c.fueraDelGrupo.grupo];
        const enGrupo = new Set(r.filter((x) => x.grupo === g).map(cod));
        const sobran = c.fueraDelGrupo.codigos.filter((x) => enGrupo.has(x));
        if (sobran.length) fallas.push('no deberían estar en ' + c.fueraDelGrupo.grupo + ': ' + sobran.join(', '));
      }
      if (c.minimoResultados && r.length < c.minimoResultados) {
        fallas.push(r.length + ' resultados, se esperaban al menos ' + c.minimoResultados);
      }
      return { consulta: c.consulta, resultado: fallas.length ? 'FALLA' : 'ok', detalle: fallas.join('; ') };
    });
    console.table(filas);
    const ok = filas.filter((f) => f.resultado === 'ok').length;
    console.log('[BuscadorV2] casos de búsqueda: ' + ok + ' de ' + filas.length + ' correctos');
    return ok === filas.length;
  }

  async function probar(consulta, limite) {
    const d = await cargar();
    const inicio = performance.now();
    const resultados = buscarEnDatos(d, consulta);
    const ms = performance.now() - inicio;
    const nombresGrupo = {
      [GRUPO.codigoExacto]: 'código exacto',
      [GRUPO.articuloCompleto]: 'artículo, todas',
      [GRUPO.articuloParcial]: 'artículo, falta una',
      [GRUPO.menciona]: 'menciona, todas',
      [GRUPO.codigoPrefijo]: 'prefijo código',
      [GRUPO.mencionaParcial]: 'menciona, falta una',
      [GRUPO.lineaCodigo]: 'línea de código'
    };
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
    probarBusquedas: probarBusquedas,
    probar: probar,
    _buscarEnDatos: buscarEnDatos,
    _prepararDatos: prepararDatos
  };

  if (USAR_BUSQUEDA_V2 && typeof document !== 'undefined') {
    programarPrecarga();
    document.addEventListener('version:leida', revisarVersion);
  }
})();
