# Detiene la plataforma. Los datos (miembros, pagos, eventos) se conservan para la próxima vez.
$ErrorActionPreference = 'Continue'
$infra = Join-Path (Split-Path -Parent $PSScriptRoot) 'infrastructure'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $desktopCli = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'
    if (Test-Path (Join-Path $desktopCli 'docker.exe')) { $env:Path = "$desktopCli;$env:Path" }
}

Write-Host ''
Write-Host '==> Deteniendo la plataforma' -ForegroundColor Cyan
Push-Location $infra
try {
    & docker compose --profile apps down
    if ($LASTEXITCODE -eq 0) {
        Write-Host '    Listo. Los datos se conservan; vuelve a abrirla con iniciar.bat.' -ForegroundColor Green
    } else {
        Write-Host '    No se pudo detener. ¿Está abierto Docker Desktop?' -ForegroundColor Yellow
    }
} finally { Pop-Location }
