# Detiene la plataforma y borra TODOS los datos (bases de datos y tópicos de Kafka) para empezar de cero.
$ErrorActionPreference = 'Continue'
$infra = Join-Path (Split-Path -Parent $PSScriptRoot) 'infrastructure'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $desktopCli = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'
    if (Test-Path (Join-Path $desktopCli 'docker.exe')) { $env:Path = "$desktopCli;$env:Path" }
}

Write-Host ''
Write-Host '  Esto borra todos los miembros, membresías, pagos, accesos y eventos.' -ForegroundColor Yellow
Write-Host '  Útil para empezar la demostración desde cero. No se puede deshacer.' -ForegroundColor Yellow
$answer = Read-Host '  Escribe BORRAR para confirmar'
if ($answer -cne 'BORRAR') {
    Write-Host '  Cancelado. No se borró nada.' -ForegroundColor Gray
    exit 0
}

Push-Location $infra
try {
    & docker compose --profile apps down -v
    if ($LASTEXITCODE -eq 0) {
        Write-Host '  Datos borrados. Ejecuta iniciar.bat para empezar de cero.' -ForegroundColor Green
    } else {
        Write-Host '  No se pudo completar. ¿Está abierto Docker Desktop?' -ForegroundColor Yellow
    }
} finally { Pop-Location }
