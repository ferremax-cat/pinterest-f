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

  // Pasos de normalizar después de minúsculas y acentos, en orden. Los usan
  // normalizar y normalizarConMapa: así no pueden quedar distintos
  const PASOS_NORMALIZAR = [
    [RE_SIGLA, unirSigla],
    [RE_LETRAS_GUION, unirGuion],
    [RE_COMA_DECIMAL, '$1.'],
    [RE_CEROS_FINALES, '$1'],
    [RE_DECIMAL_CERO, '$1'],
    [RE_FRACCION_MIXTA, '$1$2-$3'],
    [RE_FRACCION_PEGADA, separarFraccionPegada],
    [RE_X_ENTRE_MEDIDAS, '$1 x '],
    [RE_X_INICIAL, '$1x ']
  ];

  function normalizar(texto) {
    let t = String(texto == null ? '' : texto).toLowerCase();
    t = t.normalize('NFD').replace(RE_ACENTOS, '');
    for (const [re, reemplazo] of PASOS_NORMALIZAR) t = t.replace(re, reemplazo);
    return t;
  }

  // normalizar, recordando de dónde sale cada carácter: desde[i] y hasta[i] son el
  // tramo del texto original que dio el carácter i del normalizado ("1 1/2" -> "1-1/2":
  // el guion sale del espacio). Lo usa el resaltado, para marcar en el nombre tal como
  // se muestra la palabra que coincidió en el normalizado
  function normalizarConMapa(texto) {
    const original = String(texto == null ? '' : texto);
    let t = '', desde = [], hasta = [];
    for (let i = 0; i < original.length; i++) {
      const c = original[i].toLowerCase().normalize('NFD').replace(RE_ACENTOS, '');
      for (let j = 0; j < c.length; j++) { desde.push(i); hasta.push(i + 1); }
      t += c;
    }
    for (const [re, reemplazo] of PASOS_NORMALIZAR) {
      let nuevo = '', ultimo = 0;
      const nd = [], nh = [];
      const copiar = (i) => { nd.push(desde[i]); nh.push(hasta[i]); };
      t.replace(re, function () {
        const args = arguments;
        const m = args[0], pos = args[args.length - 2];
        const r = typeof reemplazo === 'function' ? reemplazo.apply(null, args)
          : reemplazo.replace(/\$(\d)/g, (x, k) => args[+k] || '');
        for (let i = ultimo; i < pos; i++) copiar(i);
        // El principio y el final que no cambian conservan su tramo; lo del medio
        // toma el tramo de lo que reemplaza
        let p = 0;
        while (p < m.length && p < r.length && m[p] === r[p]) p++;
        let s = 0;
        while (s < m.length - p && s < r.length - p && m[m.length - 1 - s] === r[r.length - 1 - s]) s++;
        for (let i = 0; i < p; i++) copiar(pos + i);
        if (p < m.length - s) {
          const a = desde[pos + p], b = hasta[pos + m.length - s - 1];
          // Se borró ("3.50" -> "3.5"): el carácter anterior se queda con lo borrado
          if (p === r.length - s && nh.length) nh[nh.length - 1] = b;
          for (let i = p; i < r.length - s; i++) { nd.push(a); nh.push(b); }
        } else {
          // Se agregó ("11/2" -> "1-1/2"): lo nuevo no ocupa lugar en el original
          const a = pos + p > 0 ? hasta[pos + p - 1] : 0;
          for (let i = p; i < r.length - s; i++) { nd.push(a); nh.push(a); }
        }
        for (let i = m.length - s; i < m.length; i++) copiar(pos + i);
        nuevo += t.slice(ultimo, pos) + r;
        ultimo = pos + m.length;
        return r;
      });
      for (let i = ultimo; i < t.length; i++) copiar(i);
      t = nuevo + t.slice(ultimo);
      desde = nd; hasta = nh;
    }
    return { texto: t, desde: desde, hasta: hasta };
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
  // Nombres de los grupos para mostrar (probar, casos de búsqueda)
  const NOMBRE_GRUPO = {
    [GRUPO.codigoExacto]: 'código exacto',
    [GRUPO.lineaCodigo]: 'línea de código',
    [GRUPO.articuloCompleto]: 'artículo, todas',
    [GRUPO.articuloParcial]: 'artículo, falta una',
    [GRUPO.menciona]: 'menciona, todas',
    [GRUPO.codigoPrefijo]: 'prefijo código',
    [GRUPO.mencionaParcial]: 'menciona, falta una'
  };

  // Coincidencias de una palabra: id -> puntos. En "abreviados" quedan los que
  // coinciden solo porque una palabra de su nombre es una abreviatura de ella
  // ("TORNI" para "torniquete"): esos van después dentro de su grupo
  // claves (opcional): ahí se anotan las palabras del índice de nombres que
  // coincidieron, para el resaltado
  function puntuarToken(d, token, esUltimo, claves) {
    const mejor = new Map();
    const abreviados = new Set();
    const anotar = (ids, puntos) => {
      if (!ids) return;
      for (const id of ids) if ((mejor.get(id) || 0) < puntos) mejor.set(id, puntos);
    };
    // Palabra del índice de nombres: además de los puntos, se guarda para el resaltado
    const anotarNombre = (t, puntos, resaltar) => {
      if (claves && resaltar !== false && d.nombre[t]) claves.add(t);
      anotar(d.nombre[t], puntos);
    };
    anotarNombre(token, PUNTOS.nombreExacto);
    anotar(d.categoria[token], PUNTOS.categoriaExacta);
    if (esUltimo) {
      // Lo que empieza con 1 o 2 letras se encuentra, pero no se resalta: con "ma"
      // quedaría marcada media galería
      for (const t of tokensConPrefijo(d.tokensNombre, token)) {
        if (t !== token) anotarNombre(t, PUNTOS.nombrePrefijo, token.length >= 3);
      }
      for (const t of tokensConPrefijo(d.tokensCategoria, token)) {
        if (t !== token) anotar(d.categoria[t], PUNTOS.categoriaPrefijo);
      }
    }
    // Abreviaturas por truncamiento: "manguera" encuentra "manguer", "termofusion" encuentra "termof".
    // La abreviatura debe tener al menos 5 letras y la mitad de la palabra:
    // así "termofusion" no encuentra "termo".
    // Las palabras del diccionario no se truncan: su grupo ya dice qué abreviaturas
    // valen ("termocupla" ya no encuentra "termo", los termos de mate).
    // Va al final: solo es "abreviado" el que no coincidió de otra forma
    if (RE_SOLO_LETRAS.test(token) && token.length >= 6 && !d.canon.has(token)) {
      const desde = Math.max(5, Math.ceil(token.length / 2));
      for (let largo = desde; largo < token.length; largo++) {
        const t = token.slice(0, largo);
        const ids = d.nombre[t];
        if (!ids) continue;
        for (const id of ids) if (!mejor.has(id)) abreviados.add(id);
        anotarNombre(t, PUNTOS.nombreAbreviado);
      }
    }
    return { puntos: mejor, abreviados: abreviados };
  }

  // Palabras de la consulta, juntando dos seguidas que forman una palabra del
  // catálogo o del diccionario ("cubre cerco" -> "cubrecerco"). Cada una es
  // { token } o { token: junta, partes: [a, b] }. Las dos partes tienen que ser
  // solo letras y de 3 o más (así "ros ca" no se vuelve "rosca")
  function unirCompuestas(d, tokens) {
    const unidades = [];
    for (let k = 0; k < tokens.length; k++) {
      const a = tokens[k], b = tokens[k + 1];
      if (b !== undefined && RE_SOLO_LETRAS.test(a) && RE_SOLO_LETRAS.test(b) &&
          a.length >= 3 && b.length >= 3 && (d.nombre[a + b] || d.canon.has(a + b))) {
        unidades.push({ token: a + b, partes: [a, b] });
        k++;
      } else {
        unidades.push({ token: a });
      }
    }
    return unidades;
  }

  // Coincidencias de una palabra compuesta: la palabra junta ("CUBRECERCO", "CUBREC")
  // o sus dos partes en el mismo nombre ("CUBRE CERCO"). Quien tiene una sola de las
  // partes queda en "mitades": no es lo buscado (CUBRE AGUJERO no es un cubrecerco)
  function puntuarCompuesta(d, u, esUltimo, claves) {
    const junta = puntuarToken(d, u.token, esUltimo, claves);
    const a = puntuarToken(d, u.partes[0], false, claves);
    const b = puntuarToken(d, u.partes[1], esUltimo, claves);
    const puntos = new Map();
    const abreviados = new Set();
    const mitades = new Map();
    for (const [id, p] of junta.puntos) {
      puntos.set(id, 2 * p);   // vale lo que las dos palabras
      if (junta.abreviados.has(id)) abreviados.add(id);
    }
    for (const [id, p] of a.puntos) {
      const q = b.puntos.get(id);
      if (q !== undefined) {
        if ((puntos.get(id) || 0) < p + q) {
          puntos.set(id, p + q);
          if (a.abreviados.has(id) || b.abreviados.has(id)) abreviados.add(id); else abreviados.delete(id);
        }
      } else if (!puntos.has(id)) {
        mitades.set(id, p);
      }
    }
    for (const [id, q] of b.puntos) {
      if (!puntos.has(id) && !a.puntos.has(id)) mitades.set(id, q);
    }
    return { puntos: puntos, abreviados: abreviados, mitades: mitades };
  }

  // marcas (opcional): se completa con nombre(texto) y codigo(codigo), que dan los
  // tramos a resaltar en cada resultado (ver rangosNombre y rangosCodigo)
  function buscarEnDatos(d, consulta, marcas) {
    const texto = String(consulta == null ? '' : consulta).trim();
    if (!texto) return [];

    const tokens = tokenizar(texto, false);
    const unidades = unirCompuestas(d, tokens);
    const n = unidades.length;
    const palabrasEnConsulta = unidades.filter((u) => RE_TIENE_LETRA.test(u.token)).length;
    const acumulado = new Map();   // id -> { cubiertos, palabras, puntos, abreviadas, mitades }
    const nuevo = () => ({ cubiertos: 0, palabras: 0, puntos: 0, abreviadas: 0, mitades: 0 });
    // Palabras del índice de nombres que coincidieron, para el resaltado (solo si se pide)
    const claves = marcas ? new Set() : null;

    // Palabras que son el comienzo de algún código ("px" de POLIMEX, "rd" de REDECO).
    // En consultas de varias palabras cuentan como coincidencia para todos los
    // productos de esa línea, además de sus coincidencias normales en nombres y
    // categorías. Con una sola palabra no se usa: ahí manda la línea de código de siempre.
    // Una compuesta no se mira como comienzo de código
    const lineaDe = new Map();   // palabra -> ids cuyo código empieza así
    if (tokens.length > 1) {
      for (const u of unidades) {
        const token = u.token;
        if (u.partes || !RE_SOLO_LETRAS.test(token) || token.length < 2 || lineaDe.has(token)) continue;
        const ids = new Set();
        d.compactos.forEach((c, id) => { if (c.startsWith(token)) ids.add(id); });
        if (ids.size) lineaDe.set(token, ids);
      }
    }

    unidades.forEach((u, k) => {
      const token = u.token;
      const esPalabra = RE_TIENE_LETRA.test(token);
      const c = u.partes ? puntuarCompuesta(d, u, k === n - 1, claves) : puntuarToken(d, token, k === n - 1, claves);
      const coincidencias = c.puntos;
      const linea = lineaDe.get(token);
      if (linea) {
        const puntosLinea = d.nombre[token] ? PUNTOS.lineaCodigoTambienPalabra : PUNTOS.lineaCodigo;
        for (const id of linea) {
          if ((coincidencias.get(id) || 0) < puntosLinea) {
            coincidencias.set(id, puntosLinea);
            c.abreviados.delete(id);
          }
        }
      }
      for (const [id, puntos] of coincidencias) {
        const a = acumulado.get(id) || nuevo();
        a.cubiertos++;
        if (esPalabra) a.palabras++;
        if (c.abreviados.has(id)) a.abreviadas++;
        a.puntos += puntos;
        acumulado.set(id, a);
      }
      for (const [id, puntos] of (c.mitades || [])) {
        const a = acumulado.get(id) || nuevo();
        a.mitades++;
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
                                            : compacta.length >= 2 && tokens.length <= 1;
    const prefijosCodigo = new Set();
    if (buscarPrefijo) {
      d.compactos.forEach((c, id) => {
        if (id !== idCodigoExacto && c.startsWith(compacta)) prefijosCodigo.add(id);
      });
    }

    // ¿El nombre empieza con la primera palabra buscada? (define si "es el artículo").
    // Se saltean las palabras del principio que son solo comienzo de código (no
    // aparecen en ningún nombre): en "px cupla m-h" el artículo es "cupla". "tor punta"
    // o "cono 1/2" no cambian, porque "tor" y "cono" también son palabras del catálogo.
    // Si la primera es compuesta, el nombre puede empezar con ella o con su primera
    // parte ("CUBRE CERCO ..." para "cubre cerco")
    const soloCodigo = (t) => lineaDe.has(t) && !d.nombre[t];
    let k0 = 0;
    while (k0 < n - 1 && soloCodigo(unidades[k0].token)) k0++;
    const primera = n > 0 && RE_TIENE_LETRA.test(unidades[k0].token) ? unidades[k0].token : null;
    const primeraParte = n > 0 && unidades[k0].partes ? unidades[k0].partes[0] : null;
    const empiezaConPrimera = (id) => {
      if (!primera) return false;
      const t0 = primerToken(d, id);
      if (!t0) return false;
      // "rct" es el artículo de "ENTREROSCA ...": los equivalentes cuentan igual
      const canon = (t) => d.canon.get(t) || t;
      return t0 === primera || canon(t0) === canon(primera) || t0 === primeraParte ||
             (n === 1 && t0.startsWith(primera)) ||
             (t0.length >= 5 && primera.startsWith(t0));
    };

    const minimo = Math.max(1, n - 1);
    const resultados = [];
    const candidatos = new Set([...acumulado.keys(), ...prefijosCodigo]);
    if (idCodigoExacto >= 0) candidatos.add(idCodigoExacto);

    for (const id of candidatos) {
      const a = acumulado.get(id) || nuevo();
      // Para "falta una" se exige al menos una palabra (no alcanza con coincidir
      // solo en una medida: "valvula 1/2" no debe traer todo lo que sea 1/2)
      const tienePalabra = palabrasEnConsulta === 0 || a.palabras > 0 || a.mitades > 0;
      const completo = n > 0 && a.cubiertos === n;
      // Una compuesta a medias (CUBRE AGUJERO para "cubre cerco") cuenta como la
      // palabra que falta, pero nunca como artículo
      const parcial = !completo && a.cubiertos + (a.mitades ? 1 : 0) >= minimo && tienePalabra;
      const articulo = (completo || (parcial && !a.mitades)) && empiezaConPrimera(id);
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
      if (grupo) resultados.push({ id: id, grupo: grupo, puntos: a.puntos, abreviadas: a.abreviadas });
    }

    // Dentro de cada grupo: primero los que tienen las palabras escritas completas
    // (o recién empezadas), después los que las tienen solo abreviadas ("TORNI" para
    // "torniquete"); luego por puntos y por nombre, leyendo la abreviatura como la
    // palabra buscada ("MANGUER PLAS REF" se ordena junto a "MANGUERA PLAS REF"), con
    // números en orden natural
    for (const r of resultados) r.clave = claveOrden(d, r.id, primera);
    // La línea de código va solo por código, en orden natural, sin mirar los puntos
    // (los que además coinciden por descripción tienen puntos y desordenarían la línea).
    // Se usa el código original y no el compacto, para que ROS4182-1 quede junto a ROS4182
    const codigoOrden = (id) => String(d.productos[id][0]).toLowerCase();
    resultados.sort((x, y) => (y.grupo - x.grupo) ||
      (x.grupo === GRUPO.lineaCodigo
        ? COLADOR_CODIGO.compare(codigoOrden(x.id), codigoOrden(y.id))
        : (x.abreviadas - y.abreviadas) || (y.puntos - x.puntos) || COLADOR.compare(x.clave, y.clave)) ||
      (x.id - y.id));

    // Resaltado: qué marcar en el nombre y en el código de cada resultado que se dibuje
    if (marcas) {
      const canonicas = new Set();
      for (const t of claves) if (d.canon.has(t)) canonicas.add(d.canon.get(t));
      const prefijos = [...lineaDe.keys()];
      if (idCodigoExacto >= 0 || buscarPrefijo) prefijos.push(compacta);
      marcas.nombre = (texto) => rangosNombre(d, claves, canonicas, texto);
      marcas.codigo = (codigo) => rangosCodigo(prefijos, codigo);
    }
    return resultados;
  }

  // Tramos [inicio, fin) del nombre original que coincidieron con la búsqueda: cada
  // palabra del nombre que está entre las claves, o que es equivalente a una por el
  // diccionario ("ENTREROSCA" para "rct"). En 20MM se mira también "20" y "mm", como
  // en el índice. null si el nombre no se pudo mapear (search-engine.js resalta como antes)
  function rangosNombre(d, claves, canonicas, texto) {
    const n = normalizarConMapa(texto);
    if (n.texto !== normalizar(texto)) return null;
    const coincide = (t) => claves.has(t) || canonicas.has(d.canon.get(t));
    const rangos = [];
    const marcar = (ini, fin) => rangos.push([n.desde[ini], n.hasta[fin - 1]]);
    const re = new RegExp(RE_TOKEN.source, 'g');
    let m;
    while ((m = re.exec(n.texto))) {
      const tok = m[0];
      if (coincide(tok)) { marcar(m.index, m.index + tok.length); continue; }
      // 20mm también está como "20" y "mm"; pn20, solo como "pn" (igual que tokenizar)
      if (RE_TIENE_DIGITO.test(tok) && RE_TIENE_LETRA.test(tok)) {
        const empiezaConLetra = RE_TIENE_LETRA.test(tok[0]);
        const rp = new RegExp(RE_PARTES.source, 'g');
        let p;
        while ((p = rp.exec(tok))) {
          if (empiezaConLetra && RE_TIENE_DIGITO.test(p[0][0])) continue;
          if (coincide(p[0])) marcar(m.index + p.index, m.index + p.index + p[0].length);
        }
      }
    }
    return rangos;
  }

  // Tramo del código original que coincidió: el comienzo más largo entre el código
  // buscado (exacto o prefijo) y las líneas de código de la consulta ("px", "rd")
  function rangosCodigo(prefijos, codigo) {
    const original = String(codigo == null ? '' : codigo);
    const c = compactarCodigo(original);
    let largo = 0;
    for (const p of prefijos) if (p.length > largo && c.startsWith(p)) largo = p.length;
    if (!largo) return [];
    let k = 0, i = 0;
    while (i < original.length && k < largo) k += compactarCodigo(original[i++]).length;
    return [[0, i]];
  }

  // Devuelve la lista ordenada de códigos originales (como figuran en productos.json).
  // opciones.primeraTanda: la búsqueda empieza de cero (no es el scroll de una
  // anterior). Recién ahí se pasa al índice nuevo, si hay uno listo: todas las
  // tandas de una misma búsqueda salen del mismo índice.
  // opciones.marcas: un objeto que se completa con nombre(texto) y codigo(codigo),
  // que devuelven los tramos a resaltar (ver buscarEnDatos).
  // opciones.comprados: lo que ya compró el cliente elegido (ver subirComprados)
  async function buscar(consulta, opciones) {
    if (pendiente && opciones && opciones.primeraTanda) {
      datos = pendiente;
      pendiente = null;
      console.log('[BuscadorV2] usando el índice ' + datos.version);
    }
    const d = await cargar();
    const resultados = buscarEnDatos(d, consulta, opciones && opciones.marcas);
    return subirComprados(d, resultados, opciones && opciones.comprados).map((r) => d.productos[r.id][0]);
  }

  // Historial del cliente (variante a): dentro de cada grupo de relevancia, primero
  // los artículos que el cliente ya compró. Entre ellos, y entre los demás, queda el
  // orden de siempre; no cambia los grupos ni saca resultados. comprados: un Map o
  // Set con los códigos de productos.json (los de historial-cliente.js)
  function subirComprados(d, resultados, comprados) {
    if (!comprados || !comprados.size) return resultados;
    const salida = [];
    for (let i = 0; i < resultados.length;) {
      let j = i;
      while (j < resultados.length && resultados[j].grupo === resultados[i].grupo) j++;
      const otros = [];
      for (let k = i; k < j; k++) {
        (comprados.has(d.productos[resultados[k].id][0]) ? salida : otros).push(resultados[k]);
      }
      for (const r of otros) salida.push(r);
      i = j;
    }
    return salida;
  }

  // ---------------------------------------------------------------------
  // Herramientas de verificación para la consola
  // ---------------------------------------------------------------------
  // Casos de normalización: los que no dan los tokens esperados. Sin fetch: la
  // usan probarCasos (navegador) y js/search/v2/probar_busquedas.js (Node)
  function evaluarCasosNormalizacion(casos) {
    const fallas = [];
    for (const c of casos) {
      const obtenido = tokenizar(c.texto, c.expandir !== false);
      if (JSON.stringify(obtenido) !== JSON.stringify(c.tokens)) {
        fallas.push({ texto: c.texto, esperado: c.tokens, obtenido: obtenido });
      }
    }
    return fallas;
  }

  // Casos de búsqueda (casos_busqueda.json) sobre unos datos ya preparados. Cada caso
  // puede pedir: primero (código en el puesto 1), primerosEnGrupo {n, grupo},
  // enLosPrimeros {n, codigos}, fueraDelGrupo {grupo, codigos}, minimoResultados.
  // Los grupos se nombran como en GRUPO (articuloCompleto, lineaCodigo, ...).
  // El detalle está escrito para quien no lee código. Sin fetch: la usan
  // probarBusquedas (navegador) y probar_busquedas.js (Node)
  function evaluarCasosBusqueda(d, casos) {
    const codigo = (x) => d.productos[x.id][0];
    const describir = (cod) => {
      const p = d.productos.find((q) => q[0] === cod);
      return p ? cod + ' (' + String(p[1]).trim() + ')' : cod;
    };
    const dondeEsta = (r, cod) => {
      const i = r.findIndex((x) => codigo(x) === cod);
      if (i >= 0) return 'está en el puesto ' + (i + 1) + ', en el grupo "' + NOMBRE_GRUPO[r[i].grupo] + '"';
      return d.productos.some((p) => p[0] === cod) ? 'no aparece en los resultados' : 'ya no existe en el catálogo';
    };
    return casos.map((c) => {
      const r = buscarEnDatos(d, c.consulta);
      const fallas = [];
      if (c.primero && (!r[0] || codigo(r[0]) !== c.primero)) {
        fallas.push('Se esperaba primero ' + describir(c.primero) + ', pero ' +
          (r[0] ? 'sale primero ' + describir(codigo(r[0])) : 'no hay resultados') +
          '; ' + c.primero + ' ' + dondeEsta(r, c.primero) + '.');
      }
      if (c.primerosEnGrupo) {
        const g = GRUPO[c.primerosEnGrupo.grupo], n = c.primerosEnGrupo.n;
        if (!g) {
          fallas.push('El caso pide un grupo que no existe: "' + c.primerosEnGrupo.grupo + '".');
        } else if (r.length < n) {
          fallas.push('Se esperaban al menos ' + n + ' resultados en "' + NOMBRE_GRUPO[g] +
            '", pero hay ' + r.length + ' resultados en total.');
        } else {
          const i = r.slice(0, n).findIndex((x) => x.grupo !== g);
          if (i >= 0) {
            fallas.push('Se esperaba que los primeros ' + n + ' fueran "' + NOMBRE_GRUPO[g] +
              '", pero el puesto ' + (i + 1) + ' es ' + describir(codigo(r[i])) +
              ', en "' + NOMBRE_GRUPO[r[i].grupo] + '".');
          }
        }
      }
      if (c.enLosPrimeros) {
        const top = new Set(r.slice(0, c.enLosPrimeros.n).map(codigo));
        for (const cod of c.enLosPrimeros.codigos) {
          if (!top.has(cod)) {
            fallas.push(describir(cod) + ' tendría que estar entre los primeros ' + c.enLosPrimeros.n +
              ' y ' + dondeEsta(r, cod) + '.');
          }
        }
      }
      if (c.fueraDelGrupo) {
        const g = GRUPO[c.fueraDelGrupo.grupo];
        for (const cod of c.fueraDelGrupo.codigos) {
          const i = r.findIndex((x) => codigo(x) === cod && x.grupo === g);
          if (i >= 0) {
            fallas.push(describir(cod) + ' no debería estar en "' + NOMBRE_GRUPO[g] +
              '" y está ahí, en el puesto ' + (i + 1) + '.');
          }
        }
      }
      if (c.minimoResultados && r.length < c.minimoResultados) {
        fallas.push('Se esperaban al menos ' + c.minimoResultados + ' resultados y hay ' + r.length + '.');
      }
      return { consulta: c.consulta, resultado: fallas.length ? 'FALLA' : 'ok', detalle: fallas.join(' ') };
    });
  }

  async function probarCasos() {
    const r = await fetch(RUTA_CASOS, { cache: 'no-cache' });
    const casos = (await r.json()).casos;
    const fallas = evaluarCasosNormalizacion(casos);
    for (const f of fallas) {
      console.warn('FALLA', f.texto, '\n esperado:', f.esperado, '\n obtenido:', f.obtenido);
    }
    console.log('[BuscadorV2] casos de normalización: ' + (casos.length - fallas.length) +
                ' de ' + casos.length + ' correctos');
    return fallas.length === 0;
  }

  // Corre las búsquedas de casos_busqueda.json con el índice cargado y dice cuáles pasan
  async function probarBusquedas() {
    const d = await cargar();
    const r0 = await fetch(RUTA_CASOS_BUSQUEDA, { cache: 'no-cache' });
    const filas = evaluarCasosBusqueda(d, (await r0.json()).casos);
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
    console.log('[BuscadorV2] "' + consulta + '" → tokens ' + JSON.stringify(tokenizar(consulta, false)) +
                ', ' + resultados.length + ' resultados en ' + ms.toFixed(1) + ' ms');
    console.table(resultados.slice(0, limite || 20).map((r) => ({
      codigo: d.productos[r.id][0],
      nombre: d.productos[r.id][1],
      grupo: NOMBRE_GRUPO[r.grupo],
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
    _evaluarCasosBusqueda: evaluarCasosBusqueda,
    _evaluarCasosNormalizacion: evaluarCasosNormalizacion,
    _prepararDatos: prepararDatos,
    _normalizarConMapa: normalizarConMapa,
    _subirComprados: subirComprados
  };

  if (USAR_BUSQUEDA_V2 && typeof document !== 'undefined') {
    programarPrecarga();
    document.addEventListener('version:leida', revisarVersion);
  }
})();
