# Kumagro · Programa SNGM — Documentación técnica

> Resumen técnico completo del proyecto: arquitectura, tecnologías, modelo de
> datos, lógica de cada página y decisiones de diseño. Pensado para que
> cualquier persona (o IA) que no participó del desarrollo pueda retomarlo
> sin perder contexto.

## 1. Qué es esto

Un set de **páginas HTML estáticas** (sin build, sin framework, sin backend
propio) que conforman un mini-sistema de gestión para el Programa SNGM de
Grobocopatel Hnos. (semilla/cultivo, seguimiento agronómico, logística de
entregas y administración de convenios con productores). Cada página es un
archivo `.html` autocontenido (HTML + CSS + JS embebidos, sin dependencias
locales aparte de algunas libs vía CDN).

## 2. Stack tecnológico

- **Frontend**: HTML5 + CSS3 (sin frameworks) + JavaScript vanilla (ES6+,
  `async/await`, `fetch`, módulos no usados — todo en `<script>` inline).
- **Gráficos**: [Chart.js](https://www.chartjs.org/) (CDN) — pies, líneas,
  barras en el dashboard.
- **Mapas**: [Leaflet 1.9.4](https://leafletjs.com/) (CDN) — visualización
  de polígonos de lotes (KMZ) sobre imágenes satelitales de Esri
  (`World_Imagery` + `World_Boundaries_and_Places` tile layers, sin API key).
- **Backend**: **Google Apps Script** (`apps_script_SNGM.gs`), publicado
  como Web App (`doGet`/`doPost`), actuando como API REST mínima sobre un
  **Google Sheet** que funciona como base de datos.
- **Almacenamiento de archivos**: **Google Drive** (carpetas fijas por ID)
  para los KMZ subidos y las fotos de visitas.
- **Persistencia de estado de UI** (placeholder, ver más abajo):
  `localStorage` del navegador.
- **Hosting**: **GitHub Pages**, desplegado automáticamente desde la rama
  `claude/great-cray-bang3u` (no desde `main`, que solo tiene el README).
  Cada push a esa rama dispara un workflow `pages build and deployment` que
  tarda ~1-2 minutos en propagarse.
- **Repositorio**: `danielverdier-glitch/kumagro` en GitHub.

No hay paso de build: lo que se pushea a la rama es exactamente lo que se
sirve. No hay `package.json`, ni bundler, ni transpilación.

## 3. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Pages (rama claude/great-cray-bang3u)                │
│                                                               │
│  dashboard_SNGM.html        carga_lote_SNGM.html             │
│  carga_masiva_SNGM.html     visitas_SNGM.html                │
│  entregas_SNGM.html         administrativo_SNGM.html         │
│                                                               │
│  (cada uno: HTML+CSS+JS embebido, sin build)                 │
└───────────────────────────┬───────────────────────────────────┘
                            │ fetch() GET/POST (CORS simple, mode:'no-cors' en escrituras)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Google Apps Script (apps_script_SNGM.gs) — Web App           │
│  doGet(action)  → lee hojas del Sheet y devuelve JSON          │
│  doPost(action) → agrega filas al Sheet / sube archivos a Drive│
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Google Sheet (SHEET_ID fijo) — "base de datos"                │
│  Hojas: Lotes (hoja activa) · Visitas · Entregas                │
└─────────────────────────────────────────────────────────────┘
        +  Google Drive: carpeta KMZ_FOLDER, carpeta IMG_FOLDER
```

Todas las páginas comparten:
- La misma constante `APPS_SCRIPT_URL` (URL del Web App de Apps Script).
- El mismo origen (GitHub Pages), por lo que **comparten `localStorage`**
  entre sí — esto se usa deliberadamente para que `administrativo_SNGM.html`
  y `dashboard_SNGM.html` lean el mismo estado de convenios sin necesidad de
  un backend para eso (ver sección 6.6).

## 4. Backend: `apps_script_SNGM.gs`

Un único script de Apps Script con dos entry points HTTP:

### `doGet(e)`
Lee la hoja correspondiente del Spreadsheet (`SHEET_ID`) y devuelve **todas
las filas como JSON**, usando la fila 1 como headers (cada fila → objeto
`{header: valor}`). No hay paginación ni filtros server-side: todo el
filtrado/agrupado se hace en el cliente.

- `?action=getLotes` (default si no se pasa `action`) → hoja activa
  ("Lotes").
- `?action=getVisitas` → hoja "Visitas".
- `?action=getEntregas` → hoja "Entregas" (con columnas dinámicas por
  semana, ver 5.3).

Las fechas se devuelven como ISO string si la celda es tipo `Date`.

### `doPost(e)`
Recibe `{action, data|...}` en el body (JSON). Usa
`LockService.getScriptLock()` (30s de espera) para serializar escrituras
concurrentes — necesario porque carga masiva, visitas y varios usuarios
pueden escribir casi al mismo tiempo, y sin lock dos ejecuciones podrían
pisarse.

Acciones soportadas:

| action         | Qué hace                                                                 | Usado por |
|----------------|---------------------------------------------------------------------------|-----------|
| `appendRow`    | Agrega una fila a la hoja "Lotes" (crea headers si está vacía)            | carga_lote_SNGM.html |
| `uploadKmz`    | Decodifica un `base64` y crea el archivo en la carpeta `KMZ_FOLDER` de Drive | carga_lote_SNGM.html |
| `uploadImagen` | Igual que `uploadKmz` pero a `IMG_FOLDER` (fotos de visitas)              | visitas_SNGM.html |
| `appendVisita` | Agrega una fila a la hoja "Visitas" (la crea si no existe)               | carga_masiva_SNGM.html, visitas_SNGM.html, administrativo_SNGM.html |
| `guardarEntrega` | Agrega/actualiza una fila en "Entregas", creando columnas dinámicas por semana si no existen | entregas_SNGM.html |

Las escrituras (`POST`) se hacen con `mode:'no-cors'` desde el cliente, por
lo que el frontend **no puede leer la respuesta** (no sabe si falló salvo
por excepción de red) — es una limitación conocida y aceptada del diseño
actual.

## 5. Modelo de datos (Google Sheet)

El "SHEET_ID" tiene 3 hojas relevantes. No hay tipos fuertes ni validación
server-side: todo es texto/número suelto en celdas, normalizado del lado
del cliente.

### 5.1 Hoja "Lotes" (hoja activa del Sheet)
Una fila = un lote inscripto. Es el dato "maestro" del programa — de dónde
viene todo lo demás (clientes, establecimientos, hectáreas, polígonos).

Columnas (en este orden, definidas en `appendRow` de `apps_script_SNGM.gs`):

```
id_lote, productor, nombre_campo, lote, variedad,
fecha_siembra_estimada, campana, provincia, departamento, area_ha,
poligono_geojson, fecha_carga, latitud_centroide, longitud_centroide,
kmz_filename, region, siembra
```

- `productor` = nombre del **cliente**.
- `nombre_campo` = nombre del **establecimiento** (campo).
- `campana` = string tipo `"25/26"` (ver lógica de campaña en 7).
- `poligono_geojson` = el polígono del lote (GeoJSON `Polygon`, generado a
  partir del KMZ subido) serializado como string.
- `latitud_centroide`/`longitud_centroide` = centroide del polígono.
- `departamento` = partido/departamento (etiquetado como "Partido" en la UI
  de administrativo).
- `siembra` = `"1ra"` o `"2da"`.

Se carga desde `carga_lote_SNGM.html` (alta manual lote por lote, con subida
de KMZ) — es el único punto de entrada de filas nuevas a esta hoja.

### 5.2 Hoja "Visitas"
Una fila = **un evento de actualización de dato** sobre un lote (visita
técnica real, carga masiva de datos de campaña, o un registro automático de
"inscripción"). Es un **log append-only**: nunca se edita ni borra una fila,
siempre se agrega una nueva. El dato vigente de un lote es **la fila más
reciente de "Visitas" para ese `id_lote`** (por `fecha_visita`).

Columnas:

```
id_visita, fecha_visita, tecnico, productor, nombre_campo,
id_lote, lote, lat_visita, lng_visita, lote_sembrado, fecha_siembra,
fecha_cosecha_estimada, estado_fenologico, estado_malezas, malezas_resistentes,
observacion_plagas, condicion_cultivo, rinde_estimado_qqha, notas, imagenes,
fecha_carga, lote_cosechado, tipo_registro, ha_plan, semilla_up, variedad, siembra
```

`tipo_registro` distingue el origen del dato:
- `'visita'` → visita técnica real (visitas_SNGM.html).
- `'carga_masiva'` → carga masiva por planilla/tabla (carga_masiva_SNGM.html).
- `'inscripcion'` → registro automático generado por
  `administrativo_SNGM.html` cuando detecta un lote sin `semilla_up`
  cargado (ver 6.5): no es una visita real, es un default persistido.

Varias filas pueden compartir el mismo `id_visita` (una visita a un campo
con varios lotes genera una fila por lote, mismo `id_visita`).

### 5.3 Hoja "Entregas"
Una fila por `id_campo` (= `productor + nombre_campo + campana`, ver
`idCampo()` en `entregas_SNGM.html`) con el **último estado cargado** de
entregas de ese campo. A diferencia de "Visitas", acá **sí se agrega una
fila nueva en cada guardado** (no se pisa), pero la página siempre toma la
última fila por `id_campo` como vigente — mismo patrón "log + última fila
gana" que en Visitas.

Columnas fijas: `id_campo, productor, nombre_campo, campana, tn_embolse,
fecha_actualizacion`. Además, **columnas dinámicas por semana**: cada
semana de entrega es una columna cuyo header es la fecha de inicio de esa
semana (`yyyy-MM-dd` como texto, forzado con `setNumberFormat('@')` para
que Sheets no la autoconvierta a fecha y rompa la comparación de strings).
Si una semana nueva no tiene columna todavía, `guardarEntrega` la crea.

### 5.4 No hay una hoja de "Convenios"
**Importante**: el estado de convenios (generado/enviado/firmado, email,
y los datos completados en el formulario — CUIT, representante, etc.) **no
se persiste en el Sheet**. Vive únicamente en `localStorage` del navegador
(clave `kumagro_admin_convenios`, ver 6.6). Es un placeholder explícito
hasta que se decida dónde debe vivir esto realmente (¿una hoja nueva?
¿un repositorio de documentos? ¿un servicio de firma electrónica?).

## 6. Páginas (frontend)

Todas comparten patrones: cargan datos con `fetch` al levantar la página,
normalizan/agrupan en JS, renderizan tabla/gráficos, y any escritura nueva
va por `POST` a Apps Script. Filtros tipo "se acotan entre sí" (las opciones
de un `<select>` se recalculan respetando los otros filtros activos pero
ignorando el propio) se repiten en varias páginas.

### 6.1 `carga_lote_SNGM.html` — Carga de lote
Alta manual de un lote nuevo: formulario con productor, campo, lote,
variedad, fecha de siembra, área, subida de **KMZ** (se parsea para extraer
el polígono y el centroide, y se sube el archivo crudo a Drive vía
`uploadKmz`). Calcula la campaña con `calcCampana(fechaSiembra)` (regla
**mes >= 5 → campaña nueva**, distinta de la regla "1° de julio" usada en
administrativo, ver sección 7 — quedan dos reglas de campaña coexistiendo,
una histórica por fecha real de siembra y otra para el default del
convenio). Al guardar, hace `POST action:'appendRow'` contra la hoja
"Lotes".

### 6.2 `carga_masiva_SNGM.html` — Carga masiva
Tabla editable tipo planilla para cargar/actualizar datos de **muchos
lotes a la vez** (rendimiento, producción, fechas de siembra/cosecha,
condición, etc.) sin tener que entrar lote por lote. Cada fila guardada
genera un `appendVisita` con `tipo_registro:'carga_masiva'`.
- Columna "Producción" expresada en **toneladas** (`rinde_qq_ha * area_ha /
  10`) — antes estaba en quintales; se convirtió dividiendo por 10 (incluye
  el cálculo en vivo al tipear rinde, el valor previo mostrado, y el header
  de la columna).

### 6.3 `visitas_SNGM.html` — Visitas técnicas
Formulario para que un técnico registre una visita a campo: estado
fenológico, malezas, plagas, condición del cultivo, rinde estimado, notas,
y fotos (subidas a Drive vía `uploadImagen`). Genera filas en "Visitas" con
`tipo_registro:'visita'`. Puede registrar varios lotes de un mismo campo en
una sola visita (mismo `id_visita`).

### 6.4 `entregas_SNGM.html` — Logística de entregas
Por campo y campaña, registra el `tn_embolse` (toneladas embolsadas/a
entregar) y el avance semana a semana de toneladas entregadas. Construye
las semanas del año de cosecha correspondiente a la campaña
(`anioCosechaDeCampana`) y guarda con `guardarEntrega` (agrega columnas de
semana dinámicamente si faltan).

### 6.5 `dashboard_SNGM.html` — Dashboard (la página más grande, ~2050 líneas)
Vista de **lectura** con varias solapas:
- **Principal**: KPI de hectáreas cargadas (+ "Plan" = total sin filtros),
  **velocímetro de convenios firmados/enviados** (nuevo, ver 6.6), gráfico
  de torta por variedad/siembra, ranking geográfico y por productor,
  evolución de siembra, evolución de cosecha (con termómetro visual),
  avance hoy (siembra/cosecha %).
- **Seguimiento**: KPIs de hectáreas inscriptas, visitas realizadas,
  semáforo de antigüedad del último dato cargado por lote (verde ≤10 días,
  amarillo 10-20, rojo >20), rendimiento promedio ponderado, % de cosecha.
- **Mapa de lotes**: Leaflet con todos los polígonos (o un pin si el
  polígono es muy chico en pantalla, umbral `UMBRAL_PIN_PX`), tooltip con
  productor/campo/variedad/has/campaña, color por campaña
  (`campanaColorMap`, paleta fija de 8 colores).
- **Comparativo entre campañas**: gráficos de barras/línea comparando
  campañas (hectáreas, toneladas, % avance de siembra/cosecha).
- **Logística**: gráficos de entregas proyectadas y cupo de camiones (30
  tn c/u), usando los datos de la hoja "Entregas".
- **Visitas** / **Campos**: tablas planas (todas las visitas; último dato
  por lote).

Carga `getLotes`, `getVisitas` y `getEntregas` en paralelo al levantar.
Sidebar de filtros (campaña, región, provincia, productor, campo, variedad,
siembra) afecta a casi todas las solapas vía la función `datos` filtrada
que recibe cada `render*`.

**Velocímetro de convenios** (agregado recientemente, primera fila, a la
derecha de "Hectáreas cargadas"): arco semicircular pintado (verde) = % de
clientes (productores, no establecimientos) con convenio **firmado**;
flecha roja sobre la escala = % con convenio **enviado**. El denominador es
el total de productores con lotes inscriptos dentro del filtro actual
(`datos` filtrada). Lee el estado desde `localStorage['kumagro_admin_convenios']`
— el mismo que escribe `administrativo_SNGM.html` (mismo origen → mismo
storage).

### 6.6 `administrativo_SNGM.html` — Administrativo · Convenios
Página de gestión de convenios por cliente. Es la pieza con más lógica de
negocio nueva del proyecto.

**Datos**: carga `getLotes` y `getVisitas`. Para cada `id_lote` calcula la
"última fila" en Visitas (`ultimaPorLote`, igual patrón que en otras
páginas) para superponer el dato editable más reciente (variedad,
semilla_up) sobre el dato estático de "Lotes".

**Auto-default de UP/semilla** (`asegurarSemillaUpPorDefecto`): al cargar,
busca lotes sin `semilla_up` cargado en su última visita y, para esos,
asume `"Semilla"` por defecto **y lo persiste** disparando un
`appendVisita` con `tipo_registro:'inscripcion'`. Como queda grabado, en la
siguiente carga el lote ya tiene el dato y la función no vuelve a
disparar — es auto-corrector, sin necesidad de un flag "ya se mandó".

**Agrupación**: `agruparPorClienteYEstablecimiento()` construye
`Map<cliente, Map<establecimiento, {has, variedades, semillasUp}>>` a
partir de los lotes filtrados. La tabla muestra **un cliente por bloque**
(el nombre del cliente solo aparece en la primera fila del bloque,
`fila-nuevo-cliente`) y, dentro de cada bloque, **un establecimiento por
fila**.

**Acciones de convenio — una sola fila por cliente**: las columnas
Convenio / Email / Enviar / Convenio enviado / Convenio firmado solo se
renderizan en la **última** fila del bloque de cada cliente (resto de
filas: celdas vacías). El estado se guarda por `cliente` (no por
establecimiento) en `localStorage['kumagro_admin_convenios']`:
```js
{
  "Nombre del cliente": {
    email: "...", generado: bool, enviado: bool, firmado: bool,
    formConvenio: { fecha, razonSocial, cuit, representante, rol,
                     domicilio, campana, plazo, comision,
                     variedades: { "Variedad A": kilos, ... } }
  },
  ...
}
```
`firmado`/`enviado` se pueden togglear manualmente clickeando el ícono
✓/✗ (placeholder hasta que haya una fuente real de verdad).

**Filtros**: cliente, campaña, y **estado del convenio** (derivado de los 3
booleans con prioridad: `firmado > enviado(no firmado) > generado(no
enviado) > sin_generar`, función `estadoConvenioDe`).

**KPIs** (Convenios generados/enviados/firmados): expresados en **%**, con
denominador = cantidad de **clientes** (no establecimientos) visibles según
los filtros actuales — la misma definición que usa el velocímetro del
dashboard.

**Modal de generación de convenio** (`abrirModalConvenio` /
`confirmarGenerarConvenio`): al clickear Generar/Regenerar se abre un
formulario emergente con:
- Fecha (texto largo tipo "24 de junio de 2026", editable,
  `formatearFechaLarga`).
- Razón social (default = nombre del cliente).
- CUIT, Representante, Rol, Domicilio (vacíos, editables).
- Tabla de solo lectura con los establecimientos del cliente (partido,
  provincia, centroide del polígono, has) — `obtenerEstablecimientosCliente`.
- Tabla editable de variedad → kilos de semilla, default `has × 60` —
  `obtenerVariedadesCliente`.
- Campaña (default según la regla "1° de julio", `campanaConvenioActual`,
  ver sección 7).
- Plazo máximo de entrega en días (default 120).
- Comisión de comercialización en % (default 2).
- Mapa Leaflet con los polígonos KMZ del cliente sobre imagen satelital
  (`renderMapaConvenio`) — la "imagen georreferenciada" pedida.

Al confirmar: genera un `.txt` de borrador (vía `Blob` + link de descarga,
**100% client-side**, no pasa por Apps Script) con todos los datos del
formulario, marca `generado:true` y guarda los valores completados en
`formConvenio` para prellenar el formulario la próxima vez (Regenerar).

**Enviar convenio**: simulado — valida que haya un email válido cargado y
marca `enviado:true`. No dispara ningún email real todavía.

## 7. Lógica de "campaña" (ojo: hay dos reglas distintas convivendo)

1. **`calcCampana(fechaSiembra)`** (en `carga_lote_SNGM.html`): a partir de
   la fecha de siembra real de un lote, `mes >= 5` → campaña
   `año/año+1`, sino `año-1/año`. Se usa para clasificar el lote al
   cargarlo.
2. **`campanaConvenioActual(fechaHoy)`** (en `administrativo_SNGM.html`,
   regla explícitamente pedida para el default del formulario de
   convenio): si la fecha actual es **≥ 1° de julio** del año en curso →
   campaña `año/año+1`; si es anterior al 1° de julio → `año-1/año`. Con la
   fecha de hoy (24/06/2026, anterior al corte), la campaña default que
   trae el formulario es **"25/26"**.

No son intercambiables: la primera clasifica datos históricos por fecha de
siembra real; la segunda solo decide qué campaña proponer **por defecto**
en un formulario nuevo, en una fecha de "hoy" que no tiene nada que ver con
la fecha de siembra de ningún lote en particular.

## 8. Decisiones de diseño / cosas a tener en cuenta

- **Sin backend propio ni base de datos relacional**: todo vive en un
  Google Sheet + Drive, accedido vía Apps Script. Esto es deliberado (cero
  infraestructura que mantener), pero implica límites de Apps Script
  (cuotas de ejecución, sin transacciones reales más allá del
  `LockService`, lectura siempre completa de la hoja — sin índices).
- **"Última fila gana"** es el patrón central para todo dato que cambia en
  el tiempo (Visitas, Entregas): nunca se actualiza una celda existente,
  siempre se agrega una fila nueva y el cliente decide cuál es la vigente.
  Esto da trazabilidad/historial gratis, a costa de que las hojas crecen
  indefinidamente y todo el cálculo de "vigente" se hace en el browser.
- **`localStorage` para estado de convenios es un placeholder explícito**
  (declarado en el banner naranja de `administrativo_SNGM.html`): no es
  multiusuario (cada navegador tiene su propio estado), no tiene backup, y
  se pierde si el usuario limpia datos del sitio. Está ahí para poder
  iterar la UX/lógica sin depender de definir todavía el storage
  definitivo.
- **Mismo origen entre páginas → localStorage compartido**: por eso el
  dashboard puede mostrar el velocímetro de convenios sin llamar a ningún
  backend nuevo — simplemente lee la misma clave que escribe
  administrativo. Si algún día el storage de convenios deja de ser
  `localStorage`, este acoplamiento implícito hay que migrarlo en los dos
  archivos a la vez.
- **Las escrituras (`POST`) van con `mode:'no-cors'`**: el cliente nunca ve
  si el guardado realmente tuvo éxito en el servidor (solo detecta errores
  de red, no errores de lógica del lado de Apps Script). Es una limitación
  conocida, no un bug pendiente de arreglar puntual.
- **Sin paso de build ni tests automatizados**: la verificación de cambios
  se hace extrayendo el contenido de `<script>` y corriendo
  `new Function(code)` en Node para detectar errores de sintaxis antes de
  commitear (no valida lógica, solo que el JS parsea).
- **Despliegue**: GitHub Pages builda desde `claude/great-cray-bang3u`, no
  desde `main`. Un push reciente puede tardar 1-2 minutos en estar
  disponible (404 transitorio mientras el workflow "pages build and
  deployment" está `in_progress`).

## 9. Pendientes / decisiones abiertas (señaladas explícitamente en la UI)

- De dónde debería venir realmente el estado de convenios (generado /
  enviado / firmado) — hoy es 100% manual/local.
- Reemplazar el "envío simulado" por un servicio de email real.
- Definir la plantilla real del documento de convenio (hoy es un `.txt`
  plano generado en el cliente, sin firma digital ni formato legal).
- Decidir si conviene mover el estado de convenios del `localStorage` a una
  hoja nueva del Sheet (para que sea multiusuario y persista de verdad).
