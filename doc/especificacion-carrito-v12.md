# Especificación funcional y técnica — Carrito de compras Ferremax

**Estado:** Etapas 0, 1, 3 y 3.5 completadas. Bloque de precios publicado en producción.
**Versión:** 1.2
**Fecha:** agosto 2026

> **Cambios respecto de la 1.1:** estado real de cada etapa (§15), cuatro hallazgos nuevos de código (§12), latencia medida del endpoint (§5.4), tamaño real del problema de claves (§6.3), Etapa 3.5 completada (§11), lecciones de diagnóstico (§19), plan de etapas reordenado.

---

## 1. Propósito de este documento

Consolidar las decisiones de diseño del carrito. Sirve para revisar si algo quedó mal entendido, para recordar por qué se decidió algo, y para retomar el proyecto tras una pausa sin reconstruir el razonamiento.

Cuando una decisión cambia, se actualiza acá.

---

## 2. Punto de partida

La aplicación ya funciona en producción. El carrito es una funcionalidad nueva que **no debe alterar el comportamiento existente**.

- Catálogo estático en GitHub Pages, ~9.236 productos.
- Datos en JSON versionados en el repositorio.
- Índices de búsqueda fragmentados, con carga bajo demanda.
- Tres roles: cliente, vendedor y administrador.
- Sistema de márgenes por cliente (P.L / P.V) y barra de salud financiera.
- Actualización de datos con script de Python local que genera JSON y se commitea.

---

## 3. Objetivo

Permitir que clientes y vendedores armen un pedido desde el catálogo y lo confirmen, dejando el pedido registrado como dato analizable.

Incluye precios especiales y descuentos del vendedor, semáforo de crédito por renglón visible solo para el vendedor, revisión de pedidos armados por clientes, y circuito de autorización para compras que exceden el crédito.

---

## 4. Principios de diseño

Ante una duda de implementación, se resuelve consultando esta sección.

**P1. Lo que cambia seguido no se versiona; lo que se versiona no cambia seguido.**
Código y catálogo a git. Finanzas, pedidos y autorizaciones a la planilla.

**P2. El carrito no calcula precios: se los pide a la fuente única.**
Duplicar la lógica garantiza que un día diverjan sin que nadie se entere.

**P3. Ningún control que viva solo en el navegador es un control.**
Rol, descuentos y crédito se validan en el servidor. El frontend avisa, no autoriza.

**P4. El catálogo no se toca.**
Navegación, buscador e índices siguen siendo estáticos y con carga bajo demanda. **No se carga el catálogo completo en memoria.**

**P5. Ninguna llamada de red bloquea el render.**
Única excepción aceptada: el login (§5.4).

**P6. El pedido es un evento inmutable.**
Una corrección genera una versión nueva vinculada, no una modificación.

**P7. El precio nunca se lee del DOM.**
La pantalla puede mostrar P.V; leer de ahí produce errores intermitentes e irrastreables.

**P8. Un solo punto de enganche, no muchos.**
Donde ya existe un patrón que cubre todos los caminos, se usa ese.

**P9. Cuando algo falla, medir antes de corregir.**
Ver §19.

---

## 5. Arquitectura

### 5.1 Componentes

| Componente | Rol | Tecnología |
|---|---|---|
| Frontend | Catálogo, carrito, interfaz | Estático en GitHub Pages |
| API | Único acceso a datos sensibles | Google Apps Script |
| Base de datos | Finanzas, pedidos, usuarios, config | Google Sheets |
| Carga de datos | Actualización de finanzas | Script Python local |

### 5.2 Configuración del Apps Script

Publicado como aplicación web, **ejecutándose como el propietario**, con **acceso para cualquier usuario**. Cuenta Gmail personal.

**Importante:** guardar el código en el editor no cambia lo que sirve la URL. Hay que actualizar el despliegue (Implementar → Gestionar implementaciones → Nueva versión).

La URL correcta termina en `/exec`. La que aparece en la barra del navegador tras abrirla (`googleusercontent.com/macros/echo`) es una redirección y no sirve.

### 5.3 Momentos de contacto con el servidor

1. Login (una vez por sesión).
2. Salud financiera y disponible de un cliente (una vez por cliente, cacheado).
3. Confirmación de pedido.
4. Solicitud o consulta de autorización.
5. Listado de pedidos pendientes de revisión (solo vendedor).

### 5.4 Latencia real (medida)

| Escenario | Tiempo |
|---|---|
| Endpoint, mediana | **~1.300 ms** |
| Rango observado | 869 a 2.720 ms |
| Antes de cachear usuarios | ~1.830 ms |

**El piso es ~1.300 ms** y corresponde al costo base de Apps Script. Cachear la hoja de usuarios ahorró ~500 ms; el resto no es optimizable desde nuestro lado.

**Decisión:** se acepta esa espera en el login, con warm-up al cargar la pantalla mientras el usuario escribe. Es el único punto donde se admite bloquear, porque el usuario entiende que está entrando.

**Episodio no reproducible:** dos mediciones de ~25 s el primer día. No volvió a ocurrir en ninguna condición (con y sin keep-alive, tras toda la noche). Causa desconocida. Las defensas de §5.5 lo cubren si reaparece.

### 5.5 Mitigación de latencia

- **Warm-up** al cargar la pantalla de login.
- **Caché de sesión:** una llamada por cliente.
- **Cálculo local:** el semáforo se recalcula sin red contra un número traído una vez.
- **`CacheService`** en Apps Script para datos de lectura frecuente (6 h).
- **Estado visible** en acciones que esperan.

### 5.6 El script de Python

No hay proceso nuevo: es el script actual con otro destino. Hoy escribe `clientes_finanzas.json` en el repo; pasará a escribir en la hoja `finanzas`. Durante la transición puede hacer las dos cosas.

La credencial de servicio va en `credenciales/`, con la entrada en `.gitignore` **commiteada antes de descargarla**.

---

## 6. Seguridad y roles

### 6.1 Estado actual

El login ya valida contra el endpoint: **el servidor decide quién entra y con qué rol**, y devuelve un token firmado con HMAC. El token es legible pero no alterable.

Interruptor de convivencia: `USAR_LOGIN_ENDPOINT` en `js/loginManager.js`.

Si el endpoint no responde, se sigue con la validación local para no dejar a nadie afuera. Transitorio, hasta que los permisos migren.

### 6.2 Pendiente: sacar los JSON del sitio

`clientes_permisos.json` sigue publicado y contiene las claves. El endpoint valida contra la planilla, así que leerlo ya no permite entrar por la puerta principal — pero el archivo debería desaparecer.

### 6.3 Problema abierto: claves adivinables

Las claves son el número de cuenta: **números cortos y consecutivos** (1, 3, 5, 11, 12). Cualquiera entra probando desde el 1.

Es deliberado: le facilita la vida al cliente. Pero **cifrar el archivo no lo resuelve** — si la clave es "5", da igual cómo esté guardada. Y cifrar en el navegador requiere que la llave viaje al navegador, así que es una demora, no una protección.

**Sube de gravedad con el carrito:** hoy quien adivina una clave ve precios; mañana podrá hacer pedidos a nombre de otro cliente.

**Opción sugerida:** mantener el número de cuenta como usuario y agregar un PIN corto entregado por el vendedor. Decisión operativa pendiente.

---

## 7. Modelo de datos

### 7.1 Carrito (en el navegador)

**Clave:** `carrito::<operador>::<cliente_destino>` — permite varios carritos abiertos en paralelo.

| Campo | Función |
|---|---|
| `sku` | Identificador canónico (puede contener espacios, ej. `EGAJ 03`) |
| `cantidad` | Ingresada por el usuario |
| `orden` | Posición de carga; define el semáforo acumulativo |
| `nombre`, `bulto` | Copia para dibujar sin depender del catálogo |
| `precio_respaldo` | Último conocido, solo para render inmediato |
| `version_catalogo` | Versión con la que se copiaron los datos |
| `lista_forzada`, `precio_libre`, `descuento_linea` | Opcionales, solo vendedor |
| `observacion_linea` | Opcional |

El precio autoritativo **siempre** se pide a la fuente única.

### 7.2 Hojas de la planilla

`usuarios` · `finanzas` · `pedidos_cabecera` · `pedidos_lineas` · `autorizaciones` · `config`

### 7.3 Cabecera de pedido

`id_pedido` (UUID del navegador), timestamp, cliente, vendedor, cant_lineas, total_bruto, desc_total_pct, total_neto, desc_efectivo_global, motivo_obs, obs_libre, estado, `id_pedido_origen`, `revision`.

### 7.4 Línea de pedido

`id_pedido`, `orden`, `sku`, nombre, cantidad, **lista_cliente**, **lista_aplicada**, mecanismo, precio_unitario, desc_efectivo_linea, subtotal, observación.

Guardar la lista que correspondía **y** la que se usó es lo que permite medir después.

---

## 8. Sistema de precios y descuentos

### 8.1 Listas

Tres listas: **D, E y F**. Cada cliente tiene una asignada en `clientes_permisos.json`. No existe lista C.

### 8.2 Fuente única (implementado)

`js/precios.js` es el único lugar que resuelve precios:

- **`precioLista(sku)`** — precio de lista del cliente vigente. Síncrono.
- **`precioMostrado(sku)`** — aplica P.V si corresponde. Solo presentación.
- **`pintarPrecio(elemento, sku)`** — pinta y marca `data-sku` y `data-precioLista`.
- **`setClienteVista(cuenta)` / `getClienteVista()`** — cliente activo del vendedor.
- **`repintarTodos()`** — repinta lo visible con la lista vigente.

**Todas las rutas de render migradas:** galería inicial, precarga, scroll y buscador.

### 8.3 Mecanismos del vendedor

1. Lista propia del cliente (por defecto).
2. Otra lista (D, E o F) para un artículo.
3. Precio libre para un artículo.
4. Porcentaje sobre un artículo.
5. Porcentaje sobre el total.

Porcentajes habituales: **-5%, -7%, -10%**.

### 8.4 Normalización: descuento efectivo

Sea cual sea el mecanismo, se calcula cuánto representa el precio final respecto del que le hubiera correspondido al cliente. Un solo número para controlar y analizar; el mecanismo original queda guardado para auditoría.

### 8.5 Cascada y orden de cálculo

Los descuentos **se encadenan**: -5% de línea con -10% de total da 14,5% efectivo, no 15%.

1. Resolver el precio de cada línea según su mecanismo.
2. Aplicar el descuento de línea.
3. Sumar subtotales → total bruto.
4. Aplicar el descuento de total sobre ese resultado → total neto.
5. Calcular el descuento efectivo global contra el total a lista.

### 8.6 Revendedores

El **-23%** es un descuento especial para clientes revendedores. **No es automático:** lo aplica el vendedor.

La ficha del cliente lleva una marca de revendedor que habilita la opción, la identifica con su propio motivo para separarla del análisis de erosión, y le da su propio techo.

### 8.7 Umbrales

Dos niveles (**aviso** en el navegador, **bloqueo** en el servidor), aplicados **por línea y sobre el pedido**.

**Arranque en modo observación:** solo registran. Se calibran después con la distribución real. Viven en la hoja `config`.

El caso que más justifica el control no es el abuso sino el **error de tipeo**: escribir 50 donde iba 5.

### 8.8 Observaciones

**Motivo codificado** (desde `config`, analizable) más **texto libre opcional**. Disponible en línea y en cabecera.

---

## 9. P.L / P.V

**P.L** es el precio al que Ferremax le vende. **Los pedidos se arman siempre con P.L.**

**P.V** es una herramienta del cliente: aplica su porcentaje de ganancia para ver a cuánto revendería. No tiene relación con el pedido.

- El carrito siempre muestra P.L, indicado explícitamente.
- La confirmación de agregado muestra el precio de lista aunque la pantalla esté en P.V.
- Señal visual clara mientras P.V está activo.
- El precio nunca se lee del DOM (P7).

**Oportunidad:** si el cliente cargó su porcentaje, el carrito puede mostrarle cuánto le cuesta el pedido, a cuánto lo vendería y cuánto ganaría. Para el vendedor esto no existe.

---

## 10. Crédito y semáforo

### 10.1 Estado de los datos

`clientes_finanzas.json` se sirve completo desde un repo público, y los Excel de origen también están versionados.

Riesgo acordado: nombres de fantasía, cuentas internas, rubro con baja investigación competitiva. **Prioridad normal, no urgencia.** Igual el dato se muda al endpoint, porque es la única forma de que el chequeo sea real. Al hacerlo hay que sacar **las dos** copias.

### 10.2 Campos

`Cliente_ID`, `Nombre_Cliente`, `Vendedor`, `Saldo_Total`, `CP_Este_Mes`, `PG_Prom_3M`, `PG_Este_Mes`, `Cupo_Mes`, `Ult_Operacion`.

### 10.3 Semáforo acumulativo

**Disponible = `Cupo_Mes` − `CP_Este_Mes`**

Los renglones se suman **en orden de carga** y cada uno se pinta según el acumulado incluyéndolo:

| Acumulado | Color |
|---|---|
| Dentro del disponible | Verde |
| Hasta 30% por encima | Amarillo |
| Más de 30% por encima | Rojo |

- El orden es el de carga, no el de pantalla.
- Se acumula sobre el precio neto.
- Si el disponible ya es cero o negativo, el primer renglón sale rojo con un mensaje aclaratorio.

**No rompe P3:** el disponible se pide una vez al seleccionar el cliente; el coloreado se calcula sin red. La validación autoritativa sigue en el servidor.

---

## 11. Cliente activo del vendedor (COMPLETADO)

El vendedor selecciona un cliente desde la búsqueda que ya existía —la que llena la barra de salud financiera— y **los precios pasan a ser los de ese cliente**, en galería y buscador.

**Implementación:** `setClienteVista(cuenta)` lee la lista de `clientes_permisos.json`, la guarda en `sessionStorage` y repinta. `precioLista` le da prioridad sobre la lista del usuario logueado.

**Reglas:**
- Solo vendedor y admin. Un cliente final ve siempre su lista.
- Se limpia en cada login.
- Muere al cerrar la pestaña.

**Valor inmediato:** los vendedores pueden pasar precios correctos desde ya, sin esperar el carrito. Y valida el mecanismo antes de que decida precios de pedidos reales.

---

## 12. Hallazgos en el código

### 12.1 Singleton que ignoraba el cliente (CORREGIDO)

`getInstance` devolvía siempre la primera instancia, descartando la configuración nueva. Al cambiar de cliente, `clientData` quedaba vacío y **los precios eran los del cliente anterior**.

Era la causa raíz del bug de precios cruzados. Corregido: refresca `clientData` cuando llega una configuración nueva.

### 12.2 Cuatro fuentes de precio (UNIFICADAS)

Convivían: `productos.json` vía ProductManager, un `priceMap` de una Google Sheet desactualizada, el campo `price` del índice de búsqueda, y el propio DOM. Ocho puntos escribían precios.

Ahora todas pasan por `js/precios.js`.

### 12.3 `productCodes` mal interpretado (CORREGIDO)

El manager filtraba el catálogo por los `productCodes` de `catalogo_grupos.json`, dejando **241 productos de 9.236** en memoria. Pero esa lista es una **precarga de destacados, no una restricción**. El filtro real son las `categories` de `clientes_permisos.json`.

**Corrección aplicada:** `loadSpecificProducts` ahora incorpora a memoria los productos que trae, con sus tres listas. El manager va conociendo más productos a medida que se usan, **sin cargar el catálogo completo** (P4).

### 12.4 Otros corregidos

- **`initialized` siempre en falso:** `#saveState()` se llamaba antes de poner el flag en `true`, y el corte anticipado de `initialize()` nunca se activaba.
- **`searchProducts` roto:** usaba `this.monitoringSystem`, propiedad inexistente; reventaba en su primera línea.
- **Filtro de precio roto:** leía `p.precios[...]` cuando esa propiedad no se guardaba.
- **`getPrice` sin `await`** en la carga de galería.
- **`"$0.00"`** como respaldo, que mostraba un precio falso.

### 12.5 Pendiente

- `sessionStorage` guarda el catálogo entero; al sumar `precios` crece. Medir.
- Sacar el `priceMap` de la planilla de imágenes (desactualizado, sin función).
- Sacar los precios del generador de índices.
- `excel_to_json.py` hace `requests.get` sin timeout: puede colgarse indefinidamente.

---

## 13. Interfaz

### 13.1 Ícono en cada producto

**No existe todavía**; hay un maquetado de referencia.

- Al hacer clic se abre un **campo de cantidad anclado a la tarjeta**, sin perder el scroll.
- Muestra el **bulto como referencia**. No se obliga a comprar por bulto.
- El ícono **cambia de estado** y muestra la cantidad cargada.
- Un nuevo clic **edita**, no duplica.
- Agregado **instantáneo**: cero red.

### 13.2 Estrategia de render

Las tarjetas se crean desde varias funciones. **No repetir el enfoque de interceptores** del sistema de márgenes.

Usar el `MutationObserver` que ya existe sobre `.gallery-container` (P8). Cuidados: evitar el bucle de mutaciones propias, no alterar la medición del layout, y definir el comportamiento en `modo-busqueda-clientes`.

**Nota sobre plantillas clonadas:** algunas rutas clonan un `template`. Hay que limpiar `data-processed` y `data-originalPrice` heredados, o las funciones viejas vuelven a procesar el elemento.

### 13.3 Botones flotantes

Los dos actuales no están en uso:

- **Botón 1:** acceso al carrito con contador.
- **Botón 2 (solo vendedor):** cliente activo, siempre visible.

El segundo protege contra el error más probable: cargar al carrito del cliente equivocado.

---

## 14. Ramas y publicación

GitHub Pages publica desde **`production`**, carpeta raíz. **`main` no se publica.**

| Rama | Rol |
|---|---|
| `feature/carrito` | Desarrollo diario. Sale de `main`. |
| `main` | Integración. Invisible para los clientes. |
| `production` | Publicación. Un merge acá es un lanzamiento. |

**Criterio:** se publica cuando una etapa está **terminada y probada**, no antes. Excepción justificada: un bug que afecte a los clientes ahora.

**Rutina diaria de datos:** `main` → `production`. El código del carrito no se mezcla.
**Al trabajar en el carrito:** `git pull` primero, siempre.

`.gitattributes` con `merge=theirs` para `json/**` y `excel/**` resuelve solos los conflictos de datos generados.

---

## 15. Plan por etapas — estado real

| # | Etapa | Estado |
|---|---|---|
| 0 | Preparación: rama, tags, planilla, credenciales | **Completada** |
| 1 | Login por endpoint con token | **Completada** (sin publicar) |
| 3 | Correcciones en `productManager.js` | **Completada y publicada** |
| — | Unificación del precio | **Completada** (parcialmente publicada) |
| 3.5 | Cliente activo del vendedor | **Completada** (sin publicar) |
| 2 | Finanzas por endpoint | Siguiente |
| 4 | Carrito (solo frontend) | Pendiente |
| 5 | Confirmación de pedidos | Pendiente |
| 6 | Semáforo, descuentos y crédito | Pendiente |
| 7 | Revisión de pedidos del cliente | Pendiente |
| 8 | Autorizaciones | Pendiente |
| 9 | Analítica | Pendiente |
| 10 | Permisos por endpoint | Pendiente |

**Sin publicar:** login por endpoint y cliente activo del vendedor. El segundo tiene valor inmediato para los vendedores; se puede publicar con `USAR_LOGIN_ENDPOINT = false`.

---

## 16. Revisión de pedidos del cliente

El vendedor revisa el pedido **ya confirmado** (no el carrito en curso, que evitaría sincronizar carritos con el servidor).

1. El cliente confirma su pedido.
2. El vendedor ve los pedidos de sus clientes pendientes de revisión (cruzando su sigla con el campo `Vendedor` de finanzas).
3. Lo carga en el carrito con el semáforo activo y lo ajusta.
4. Al confirmar se crea un **pedido nuevo** con `id_pedido_origen` y `revision`. El original queda intacto (P6).

**Valor analítico:** medir cuánto modifican los vendedores los pedidos de los clientes.

---

## 17. Autorizaciones

1. El semáforo da rojo y aparece "Solicitar autorización".
2. El pedido queda como **pendiente de autorización**.
3. Se registra en `autorizaciones` y sale un mail a los habilitados.
4. Un autorizador resuelve **editando la planilla**: estado, monto autorizado, su identificación. Sin pantalla de administración.
5. El vendedor ve la respuesta. Si el monto es **menor**, recorta el carrito.

Varias personas autorizan; la primera que resuelve cierra. La notificación se escribe como pieza intercambiable (WhatsApp más adelante).

---

## 18. Valor analítico

- Cuánto margen resigna cada vendedor por mes, cliente y categoría.
- Si el descuento por contado acelera el cobro o solo erosiona margen.
- Cuánto modifican los vendedores los pedidos de clientes.
- Conversión del catálogo y productos abandonados.
- Pedidos contra facturación real.

---

## 19. Lecciones de diagnóstico

Registradas porque costaron tiempo y se van a repetir.

**La causa raíz suele estar más abajo de donde se ve el síntoma.** Se migraron tres rutas de precios sin resultado; el problema era el singleton. Las rutas eran reales, pero ninguna era la causa.

**Medir antes de corregir.** Cada vez que se corrigió sin medir, la corrección falló. Las mediciones en consola resolvieron en minutos lo que las hipótesis no resolvían en horas.

**Verificar que el cambio esté aplicado.** Dos veces se diagnosticó sobre código que no se había guardado o que estaba en otra rama.

**Una variable por vez.** Cambiar código y medir latencia a la vez impide saber qué causó qué.

**Los datos del navegador sobreviven al código.** `localStorage` y `sessionStorage` conservan formatos viejos. Al cambiar la forma de lo guardado, hay que invalidar — pero verificando antes quién más lee esa clave.

**Confirmar el propósito antes de "arreglar".** `productCodes` parecía una restricción y era una precarga. Preguntar evitó romper algo que funcionaba.

---

## 20. Pendientes

| Tema | Estado |
|---|---|
| Umbrales de aviso y bloqueo | Calibrar con datos reales |
| Techo del descuento de revendedor | A definir |
| Lista de autorizadores | A definir |
| Motivos de observación | A definir |
| Claves adivinables | Decisión operativa (§6.3) |
| Cuota de `sessionStorage` | Medir |
| `priceMap` y precios en índices | Eliminar |
| Timeout en `excel_to_json.py` | Corregir |
| Ramas viejas sin limpiar | Tarea suelta |
| Mostrar "consultar" en vez de precio vacío | A evaluar |

---

## 21. Registro de decisiones

| Decisión | Motivo |
|---|---|
| Carrito indexado por (operador, cliente) | El vendedor atiende varios clientes en paralelo |
| El carrito guarda SKU y cantidad, no precios finales | Guardar precios produce totales mentirosos y silenciosos |
| Fuente única de precios (`js/precios.js`) | Cuatro fuentes convivían y se contradecían |
| Apps Script en lugar de archivos por cliente | Único camino que hace real el "solo lo ve el vendedor" |
| Login primero | Valida Apps Script con el caso más chico y habilita los privilegios |
| Aceptar 1,3 s en el login | Es el piso de Apps Script; el único punto donde bloquear tiene sentido |
| Pedidos en Sheets y no en git | Evita los conflictos por archivos generados |
| Descuentos normalizados a un número | Un solo tope, una sola columna que analizar |
| Umbrales en modo observación | Calibrar con datos en lugar de adivinar |
| Revendedor como marca del cliente | Evita aplicar el -23% por error y lo separa del análisis |
| Semáforo acumulativo y local | Muestra qué renglón rompió el límite, sin red |
| Revisión como versión nueva | Preserva inmutabilidad y habilita medir ajustes |
| Autorizaciones en la planilla | Evita construir una pantalla de administración |
| `MutationObserver` en vez de interceptores | Un punto de enganche en lugar de seis |
| Rama desde `main`, no desde `production` | `main` es integración; `production` solo publica |
| Cliente activo adelantado | Valor inmediato para vendedores y valida el mecanismo antes del carrito |
| Carga perezosa acumulativa | Respeta el diseño de índices sin traer 9.236 productos |
