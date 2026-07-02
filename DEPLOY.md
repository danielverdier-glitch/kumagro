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

## Pendientes conocidos

- **Plantillas del convenio**: `backend\plantillas\convenio_semilla.html` y
  `convenio_up.html` son placeholders — hay que pegar el texto legal real de
  los Google Docs, conservando los marcadores `{{...}}`.
- **Login de usuarios**: la tabla `usuarios` existe pero la app no pide
  login todavía (el acceso lo protege la VPN). Se puede agregar después.
- Los KMZ y fotos suben a `storage\` pero los HTML todavía no linkean a
  `/archivos/...` para descargarlos (igual que antes con Drive).
