# Kumagro SNGM — Despliegue en la VM Windows

Sistema migrado desde Google Apps Script + Sheets a un stack autoalojado:
**Node.js (Express) + PostgreSQL + archivos en disco local**, con firma de
convenios vía **Adobe Acrobat Sign** (polling, sin nada expuesto a Internet).

## Estructura

```
kumagro/
├── backend/
│   ├── src/                  código del servidor
│   │   ├── server.js          entrada (Express, puerto 3000)
│   │   ├── routes/gs.js       API compatible con las actions del Apps Script
│   │   ├── routes/convenios.js  envío a firmar + estado de firmas
│   │   ├── routes/exportar.js   exportación a Excel (.xlsx)
│   │   ├── services/adobeSign.js  cliente API Adobe Sign v6
│   │   ├── services/pdfConvenio.js  generación de PDF (plantillas HTML)
│   │   └── jobs/pollFirmas.js  polling del estado de firmas
│   ├── migrations/            esquema SQL (se aplica con npm run migrate)
│   ├── plantillas/            convenio_semilla.html / convenio_up.html
│   ├── scripts/importar_csv.js  importación única desde los CSV de Sheets
│   ├── importar/              poner aquí los CSV exportados (ver abajo)
│   └── .env                   credenciales (crear desde .env.example)
├── public/                    los 6 HTML (frontend)
├── storage/                   pdf/ kmz/ fotos/ firmados/  (se crea sola)
├── logs/                      logs del servicio
└── instalar.ps1               instalador (PowerShell como administrador)
```

## Instalación en la VM

1. Instalar **Node.js LTS** (https://nodejs.org/es) y
   **PostgreSQL** (https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
   Durante la instalación de Postgres anotar la clave del usuario `postgres`.
2. Instalar **NSSM** (https://nssm.cc/download): copiar `nssm.exe` (carpeta
   win64) a `C:\Windows\System32`.
3. Copiar esta carpeta del proyecto a la VM (ej. `C:\kumagro`).
4. Abrir PowerShell **como administrador** en esa carpeta y correr:
   `powershell -ExecutionPolicy Bypass -File .\instalar.ps1`
5. Probar: `http://localhost:3000/dashboard_SNGM.html`

El servicio queda registrado como **KumagroSNGM**: arranca solo al bootear y
se reinicia si el proceso se cae (`nssm restart KumagroSNGM` para reiniciarlo
a mano; logs en `logs\app.log` y `logs\error.log`).

## Importación de los datos históricos (una sola vez)

1. En Google Sheets, para cada hoja: Archivo → Descargar → **CSV**:
   - hoja principal de lotes → `lotes.csv`
   - hoja `Visitas` → `visitas.csv`
   - hoja `Entregas` → `entregas.csv`
   - la hoja de "lista de clientes" → `clientes.csv`
2. Poner los 4 archivos en `backend\importar\`.
3. `cd backend` y `npm run importar-csv`.
4. Copiar además los archivos existentes de Drive a mano:
   - KMZ → `storage\kmz\`
   - fotos de visitas → `storage\fotos\`
   - PDFs de convenios ya generados → `storage\pdf\`

## Adobe Acrobat Sign

1. En Acrobat Sign (usuario admin): Cuenta → Adobe Sign API → Información de
   API → **Integration Key**, con scopes `agreement_read`, `agreement_write`,
   `agreement_send`.
2. Completar `ADOBE_SIGN_TOKEN` y `ADOBE_SIGN_BASE_URI` en `backend\.env`
   (el base URI es el shard de la cuenta, ej. `https://api.na1.adobesign.com`;
   se ve en la URL del panel o con `GET /baseUris`).
3. Reiniciar el servicio: `nssm restart KumagroSNGM`.

Funcionamiento: "Enviar" en la página administrativa sube el PDF y crea el
agreement; Adobe le manda el email al firmante. Cada `POLL_MINUTOS` (default
10) el servidor consulta los agreements pendientes y actualiza los estados
(enviado → firmado/rechazado/expirado). Al firmarse, el PDF firmado se
descarga solo a `storage\firmados\`. Click en ✓/✗ en la página fuerza una
consulta inmediata.

## Acceso solo por VPN (firewall)

En "Firewall de Windows Defender con seguridad avanzada" → Reglas de entrada:

1. Nueva regla → Puerto → TCP 3000 → Permitir la conexión → aplicar.
2. En la regla → Propiedades → Ámbito → Dirección IP remota: agregar SOLO el
   rango de IPs de la VPN de la empresa (ej. `10.8.0.0/24`).
3. Igual para el puerto 5432 (PostgreSQL) si vas a conectarte con
   DBeaver/pgAdmin desde tu PC por VPN; si no, dejarlo cerrado
   (la app se conecta por localhost).

## Ver/editar los datos a mano

Instalar **DBeaver** (https://dbeaver.io) en tu PC y crear una conexión
PostgreSQL a la IP de la VM (por VPN), puerto 5432, base `kumagro`, usuario
`kumagro`. Las tablas se ven y editan como una planilla. También se puede
exportar a Excel desde la app: `http://<vm>:3000/api/exportar/lotes`
(también `/visitas`, `/entregas`, `/productores`, `/convenios`).

## Backup diario

Programador de tareas → Crear tarea básica → diaria → Acción "Iniciar un
programa":

- Programa: `C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`
- Argumentos: `-U kumagro -d kumagro -f C:\kumagro\backups\kumagro_%date:~-4%%date:~3,2%%date:~0,2%.sql`

(o un `.bat` que además copie `storage\` a otro disco/recurso de red).
Guardar la clave en `%APPDATA%\postgresql\pgpass.conf` como
`localhost:5432:kumagro:kumagro:LACLAVE` para que no la pida.

## Fase 2 — Autogestión del productor (carga de lotes por el cliente)

Proyecto: que cada productor cargue **sus propios lotes** (datos + KMZ) desde
un formulario público, sin VPN, en vez de que los cargue el equipo interno.

Diseño acordado (no bloqueante para la puesta en marcha; se construye una
vez que el sistema interno esté estable):

- **Dos zonas en el mismo servidor**: las páginas internas y la API siguen
  siendo solo-VPN/Tailscale; se expone públicamente (HTTPS, puerto 443) solo
  un HTML de carga de lotes + su endpoint mínimo. El reverse proxy decide
  qué ruta es pública; el resto no responde desde Internet.
- **Links con token por productor**: no hay URL pública "abierta". Desde la
  página administrativa se genera un link único por productor
  (`/cliente/carga?t=<token>`), con vencimiento. El token identifica al
  productor: el formulario ya sabe quién es y solo puede cargar lotes suyos.
- **Staging con aprobación**: lo que carga el productor va a una tabla
  `lotes_solicitudes` (pendiente/aprobado/rechazado), NUNCA directo a
  `lotes`. El equipo revisa cada solicitud en una pantalla nueva de la
  página administrativa (ver el polígono del KMZ en el mapa, corregir
  campos) y al aprobar recién se inserta en `lotes` (pasando por las mismas
  validaciones y el anti-duplicado de siempre).
- **Higiene del endpoint público**: HTTPS automático (Caddy/Let's Encrypt),
  rate limiting por IP, validación estricta de campos, tamaño máximo de
  upload acotado (el KMZ del cliente, no los 50 MB de la API interna),
  y solo se aceptan archivos .kmz/.kml (se parsean y validan en el servidor
  antes de guardar).
- La firma de convenios NO necesita nada de esto: Adobe Sign ya le manda el
  email al productor y firma en la página de Adobe.

## Pendientes conocidos

- **Plantillas del convenio**: `backend\plantillas\convenio_semilla.html` y
  `convenio_up.html` son placeholders — hay que pegar el texto legal real de
  los Google Docs, conservando los marcadores `{{...}}`.
- **Login de usuarios**: la tabla `usuarios` existe pero la app no pide
  login todavía (el acceso lo protege la VPN). Se puede agregar después.
- Los KMZ y fotos suben a `storage\` pero los HTML todavía no linkean a
  `/archivos/...` para descargarlos (igual que antes con Drive).
