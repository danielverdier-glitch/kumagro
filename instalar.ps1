# ============================================================
#  Instalador del sistema Kumagro SNGM en la VM Windows
#  Correr en PowerShell COMO ADMINISTRADOR, parado en la
#  carpeta del proyecto:  .\instalar.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot

Write-Host "=== Kumagro SNGM - instalacion ===" -ForegroundColor Cyan

# ── 1. Prerequisitos ────────────────────────────────────────
function Chequear($cmd, $nombre, $urlAyuda) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "FALTA: $nombre no esta instalado o no esta en el PATH." -ForegroundColor Red
    Write-Host "  Instalalo desde: $urlAyuda"
    exit 1
  }
  Write-Host "OK: $nombre encontrado."
}
Chequear node "Node.js (v18 o superior)" "https://nodejs.org/es (version LTS)"
Chequear npm  "npm" "https://nodejs.org/es"
Chequear psql "PostgreSQL (cliente psql)" "https://www.enterprisedb.com/downloads/postgres-postgresql-downloads"

$nodeVersion = (node --version) -replace 'v',''
if ([int]($nodeVersion.Split('.')[0]) -lt 18) {
  Write-Host "FALTA: se necesita Node.js 18 o superior (tenes $nodeVersion)." -ForegroundColor Red
  exit 1
}

# ── 2. Dependencias ─────────────────────────────────────────
Write-Host "`nInstalando dependencias (npm install)..." -ForegroundColor Cyan
Push-Location "$raiz\backend"
npm install
Pop-Location

# ── 3. Configuracion (.env) ─────────────────────────────────
$envPath = "$raiz\backend\.env"
if (-not (Test-Path $envPath)) {
  Write-Host "`nConfiguracion inicial (.env):" -ForegroundColor Cyan
  $pgPass      = Read-Host "Clave para el usuario 'kumagro' de PostgreSQL"
  $adobeToken  = Read-Host "Integration Key de Adobe Acrobat Sign (Enter para configurar despues)"
  $adobeBase   = Read-Host "Base URI de Adobe Sign, ej. https://api.na1.adobesign.com (Enter para despues)"
  @"
PORT=3000
PGHOST=localhost
PGPORT=5432
PGDATABASE=kumagro
PGUSER=kumagro
PGPASSWORD=$pgPass
ADOBE_SIGN_TOKEN=$adobeToken
ADOBE_SIGN_BASE_URI=$adobeBase
POLL_MINUTOS=10
"@ | Set-Content -Encoding UTF8 $envPath
  Write-Host "Creado backend\.env"
} else {
  Write-Host "backend\.env ya existe, no se toca."
  $pgPass = (Get-Content $envPath | Where-Object { $_ -match '^PGPASSWORD=' }) -replace 'PGPASSWORD=',''
}

# ── 4. Base de datos ────────────────────────────────────────
Write-Host "`nCreando base de datos y usuario (si no existen)..." -ForegroundColor Cyan
$adminPass = Read-Host "Clave del usuario 'postgres' (superusuario de PostgreSQL)"
$env:PGPASSWORD = $adminPass
$existe = psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_roles WHERE rolname='kumagro'"
if ($existe -ne '1') {
  psql -U postgres -h localhost -c "CREATE ROLE kumagro LOGIN PASSWORD '$pgPass'"
}
$existeDb = psql -U postgres -h localhost -tAc "SELECT 1 FROM pg_database WHERE datname='kumagro'"
if ($existeDb -ne '1') {
  psql -U postgres -h localhost -c "CREATE DATABASE kumagro OWNER kumagro"
}
Remove-Item Env:\PGPASSWORD

Write-Host "Aplicando migraciones..." -ForegroundColor Cyan
Push-Location "$raiz\backend"
npm run migrate
Pop-Location

# ── 5. Servicio de Windows (NSSM) ───────────────────────────
Write-Host "`nRegistrando el servicio de Windows..." -ForegroundColor Cyan
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssm) {
  Write-Host "NSSM no esta instalado. Descargalo de https://nssm.cc/download," -ForegroundColor Yellow
  Write-Host "copia nssm.exe a C:\Windows\System32 y volve a correr este script." -ForegroundColor Yellow
  Write-Host "Mientras tanto podes arrancar a mano con:  cd backend; npm start" -ForegroundColor Yellow
} else {
  $servicio = 'KumagroSNGM'
  $yaExiste = Get-Service $servicio -ErrorAction SilentlyContinue
  if ($yaExiste) { nssm stop $servicio; nssm remove $servicio confirm }
  New-Item -ItemType Directory -Force -Path "$raiz\logs" | Out-Null
  nssm install $servicio (Get-Command node).Source "$raiz\backend\src\server.js"
  nssm set $servicio AppDirectory "$raiz\backend"
  nssm set $servicio AppStdout "$raiz\logs\app.log"
  nssm set $servicio AppStderr "$raiz\logs\error.log"
  nssm set $servicio AppRotateFiles 1
  nssm set $servicio Start SERVICE_AUTO_START
  nssm start $servicio
  Write-Host "Servicio '$servicio' instalado y corriendo (arranca solo al bootear)."
}

Write-Host "`n=== Listo ===" -ForegroundColor Green
Write-Host "Probar en el navegador:  http://localhost:3000/dashboard_SNGM.html"
Write-Host "Pasos manuales restantes (ver DEPLOY.md):"
Write-Host "  1. Importar los datos historicos: exportar las hojas a CSV -> backend\importar\ -> npm run importar-csv"
Write-Host "  2. Restringir el firewall de Windows al rango de la VPN"
Write-Host "  3. Programar el backup diario (Programador de tareas)"
Write-Host "  4. Pegar el texto legal real en backend\plantillas\convenio_*.html"
