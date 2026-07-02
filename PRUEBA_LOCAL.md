# Guía: probar el sistema en tu notebook Windows (antes de tocar la VM)

Objetivo: dejar el sistema corriendo completo en tu máquina, con datos de
prueba, para validar las 6 páginas y la generación de convenios. Adobe Sign
se puede probar al final (o saltearlo: sin token configurado, el sistema
funciona igual, solo que "Enviar" va a dar error y el polling queda apagado).

Tiempo estimado: 30–45 minutos la primera vez.

---

## Paso 1 — Instalar Node.js

1. Entrá a https://nodejs.org/es y descargá la versión **LTS** (botón verde).
2. Instalala con todo por defecto (siguiente, siguiente...).
3. Verificá: abrí **PowerShell** (Inicio → escribir "PowerShell") y corré:
   ```
   node --version
   ```
   Tiene que mostrar `v18.x` o superior. Si dice "no se reconoce", cerrá y
   volvé a abrir PowerShell.

## Paso 2 — Instalar PostgreSQL

1. Descargá el instalador de https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
   (Windows x86-64, la versión más nueva).
2. Durante la instalación:
   - Te va a pedir una **contraseña para el usuario `postgres`**: elegí una y
     **anotala** (la vas a necesitar en el paso 4).
   - Puerto: dejá **5432**.
   - Todo lo demás por defecto. No hace falta instalar "Stack Builder".
3. Verificá en PowerShell:
   ```
   psql --version
   ```
   Si dice "no se reconoce", agregá la carpeta `bin` de Postgres al PATH:
   Inicio → "Editar las variables de entorno del sistema" → Variables de
   entorno → Path → Editar → Nuevo → `C:\Program Files\PostgreSQL\17\bin`
   (ajustar el 17 a tu versión) → Aceptar, y reabrí PowerShell.

## Paso 3 — Descargar el proyecto

Opción A (con git): `git clone https://github.com/danielverdier-glitch/kumagro.git C:\kumagro`
y adentro `git checkout claude/web-app-vm-migration-785v6k`.

Opción B (sin git): en GitHub, en la rama `claude/web-app-vm-migration-785v6k`,
botón verde **Code → Download ZIP**, y descomprimilo en `C:\kumagro`.

## Paso 4 — Correr el instalador

En PowerShell **como administrador** (click derecho en PowerShell → "Ejecutar
como administrador"):

```powershell
cd C:\kumagro
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

El script te va a pedir:
- **Clave para el usuario 'kumagro' de PostgreSQL**: inventá una (es el
  usuario propio de la app, distinto de `postgres`).
- **Integration Key y Base URI de Adobe Sign**: apretá **Enter para saltear**
  (lo probamos después).
- **Clave del usuario 'postgres'**: la que anotaste en el paso 2.

Sobre NSSM: en tu notebook NO hace falta instalar el servicio de Windows
(eso es para la VM). Si el script avisa que falta NSSM, ignoralo y arrancá
la app a mano (paso 5). El resto (base de datos, migraciones, .env) ya quedó
hecho.

> Nota: `npm install` descarga también un Chromium (~150 MB) que usa la
> generación de PDF. Es normal que tarde unos minutos.

## Paso 5 — Arrancar la aplicación

```powershell
cd C:\kumagro\backend
npm start
```

Tiene que decir: `Kumagro SNGM escuchando en http://localhost:3000`.
Dejá esa ventana abierta (la app corre ahí; Ctrl+C la para).

## Paso 6 — Probar las páginas (sin datos todavía)

Abrí en el navegador:

- http://localhost:3000/carga_lote_SNGM.html
- http://localhost:3000/dashboard_SNGM.html
- http://localhost:3000/administrativo_SNGM.html
- (y las otras 3)

Al principio todo va a estar vacío. Prueba sugerida en este orden:

1. **Carga de lote**: creá un productor nuevo con el botón "Nuevo", cargá un
   lote con un KMZ real de los que ya tenés. Guardá.
2. **Dashboard**: recargá — el lote tiene que aparecer (KPIs, mapa).
3. **Visitas**: registrá una visita al lote, con una foto.
4. **Entregas**: cargá tn de embolse y alguna semana.
5. **Carga masiva**: editá el rinde del lote.
6. **Administrativo**: generá el convenio (modal completo + mapa). El PDF
   queda en `C:\kumagro\storage\pdf\` y se descarga desde el link del toast.
7. Verificá persistencia: cerrá el navegador, volvé a abrir — todo tiene que
   seguir estando (antes el estado de convenios se perdía por navegador;
   ahora vive en la base).

## Paso 7 — Importar tus datos reales (opcional pero recomendado)

Para probar con los datos verdaderos del programa:

1. En Google Sheets: Archivo → Descargar → **Valores separados por comas
   (.csv)** para cada hoja: lotes → `lotes.csv`, Visitas → `visitas.csv`,
   Entregas → `entregas.csv`, lista de clientes → `clientes.csv`.
2. Copiá los 4 archivos a `C:\kumagro\backend\importar\`.
3. En PowerShell:
   ```powershell
   cd C:\kumagro\backend
   npm run importar-csv
   ```
4. Recargá el dashboard: tienen que estar todos los lotes/visitas/entregas
   históricos.

Si algo de la importación sale mal, la base se puede vaciar y re-importar
sin drama (es una copia; los Sheets originales no se tocan).

## Paso 8 — Probar Adobe Sign (cuando tengas el token)

1. Conseguí la Integration Key (Acrobat Sign → Cuenta → Adobe Sign API →
   Información de API → Integration Key, con scopes `agreement_read`,
   `agreement_write`, `agreement_send`).
2. Editá `C:\kumagro\backend\.env` y completá `ADOBE_SIGN_TOKEN` y
   `ADOBE_SIGN_BASE_URI` (ej. `https://api.na1.adobesign.com`).
3. Reiniciá la app (Ctrl+C y `npm start`).
4. En administrativo: generá un convenio, poné **tu propio email** como
   contacto y tocá "Enviar". Te tiene que llegar el mail de Adobe para
   firmar. Firmalo y tocá el ✓/✗ de "Convenio firmado" para forzar la
   actualización (o esperá el ciclo de polling de 10 minutos).
5. El PDF firmado aparece solo en `C:\kumagro\storage\firmados\`.

## Para ver la base de datos por dentro

Instalá **DBeaver** (https://dbeaver.io/download) → Nueva conexión →
PostgreSQL → host `localhost`, base `kumagro`, usuario `kumagro` y la clave
que elegiste. Las tablas (`lotes`, `visitas`, `convenios`, etc.) se ven y
editan como planillas.

## Problemas comunes

| Síntoma | Causa probable / solución |
|---|---|
| `node no se reconoce` | Reabrir PowerShell después de instalar Node |
| `psql no se reconoce` | Agregar `C:\Program Files\PostgreSQL\XX\bin` al PATH |
| `password authentication failed` | La clave del `.env` no coincide con la del usuario `kumagro`; editar `backend\.env` |
| `EADDRINUSE :3000` | Otro programa usa el puerto 3000; cambiar `PORT` en `.env` |
| La generación de PDF falla | Puppeteer no descargó Chromium: correr `npm install` de nuevo, o poner `CHROME_PATH` en `.env` apuntando a tu Chrome instalado |
| Páginas vacías con error rojo | La app no está corriendo: revisar la ventana de `npm start` |
