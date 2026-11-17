# Carga datos ficticios de demostración (miembros, membresías, pagos e ingresos) por el GraphQL Gateway.
# Uso: doble clic en datos-demo.bat con la plataforma en marcha (iniciar.bat). Es idempotente.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$infra = Join-Path $root 'infrastructure'

Write-Host ''
Write-Host '  FET Gym - Datos ficticios de demostración' -ForegroundColor White
if (-not (Test-Path (Join-Path $infra '.env'))) {
    Write-Host '  [X] Falta infrastructure\.env: ejecuta primero iniciar.bat.' -ForegroundColor Red
    exit 1
}
Push-Location $infra
try {
    & docker compose --profile apps --profile herramientas run --rm herramientas
    $code = $LASTEXITCODE
} finally { Pop-Location }
if ($code -ne 0) {
    Write-Host '  [X] No se pudieron cargar los datos. ¿Está en marcha la plataforma (iniciar.bat)?' -ForegroundColor Red
    exit 1
}
Write-Host '  Abre el panel y revisa Miembros, Membresías, Pagos y Control de acceso.' -ForegroundColor Green
