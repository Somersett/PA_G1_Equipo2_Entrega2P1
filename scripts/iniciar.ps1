# Levanta toda la plataforma con Docker Compose y abre el panel en el navegador.
# Uso: doble clic en iniciar.bat (raíz del proyecto) o: powershell -ExecutionPolicy Bypass -File scripts\iniciar.ps1

# 'Continue': en Windows PowerShell 5.1, 'Stop' convierte en excepción cualquier texto que docker escriba en
# stderr. Los errores se revisan con $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$infra = Join-Path $root 'infrastructure'
$envFile = Join-Path $infra '.env'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Write-Info($text) { Write-Host "    $text" -ForegroundColor Gray }
function Write-Problem($text) { Write-Host "    $text" -ForegroundColor Yellow }
function Stop-WithError($text) {
    Write-Host ''
    Write-Host "  [X] $text" -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '  FET Gym · Plataforma de membresías y control de acceso' -ForegroundColor White
Write-Host '  Grupo 2 - Equipo 2' -ForegroundColor DarkGray

# 1. Docker instalado y en marcha ---------------------------------------------------------------
Write-Step 'Revisando Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $desktopCli = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin'
    if (Test-Path (Join-Path $desktopCli 'docker.exe')) {
        $env:Path = "$desktopCli;$env:Path"
    } else {
        Write-Problem 'Docker Desktop no está instalado en este equipo.'
        Write-Info 'Descárgalo de https://www.docker.com/products/docker-desktop/ , instálalo, reinicia si te lo pide'
        Write-Info 'y vuelve a ejecutar iniciar.bat.'
        Start-Process 'https://www.docker.com/products/docker-desktop/'
        Stop-WithError 'Falta Docker Desktop.'
    }
}

function Test-DockerEngine {
    & docker info *> $null
    return $LASTEXITCODE -eq 0
}

if (-not (Test-DockerEngine)) {
    $desktopExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $desktopExe) {
        Write-Info 'Docker Desktop está cerrado. Abriéndolo...'
        Start-Process $desktopExe
    } else {
        Write-Problem 'Abre Docker Desktop manualmente.'
    }
    Write-Host '    Esperando a que Docker esté listo' -NoNewline -ForegroundColor Gray
    $deadline = (Get-Date).AddMinutes(4)
    while (-not (Test-DockerEngine)) {
        if ((Get-Date) -gt $deadline) {
            Write-Host ''
            Stop-WithError 'Docker no respondió en 4 minutos. Abre Docker Desktop, espera a que diga "Engine running" y vuelve a intentar.'
        }
        Write-Host '.' -NoNewline -ForegroundColor Gray
        Start-Sleep -Seconds 3
    }
    Write-Host ''
}
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Tu Docker no incluye "docker compose". Actualiza Docker Desktop.' }
Write-Ok 'Docker está en marcha.'

# 2. Archivo .env -----------------------------------------------------------------------------
Write-Step 'Revisando la configuración (infrastructure\.env)'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $infra '.env.example') $envFile
    Write-Ok 'Creado infrastructure\.env a partir de .env.example.'
} else {
    Write-Ok 'Se usa el infrastructure\.env existente.'
}

function Read-EnvFile {
    $values = @{}
    foreach ($line in [System.IO.File]::ReadAllLines($envFile, $utf8)) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
    }
    return $values
}

function Set-EnvValue($name, $value) {
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]][System.IO.File]::ReadAllLines($envFile, $utf8))
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$name\s*=") { $lines[$i] = "$name=$value"; $found = $true }
    }
    if (-not $found) { $lines.Add("$name=$value") }
    [System.IO.File]::WriteAllText($envFile, (($lines -join "`n") + "`n"), $utf8)
}

# 3. Puertos libres ---------------------------------------------------------------------------
Push-Location $infra
try {
    $running = (& docker compose --profile apps ps --status running -q 2>$null)
} finally { Pop-Location }

function Test-PortFree([int]$port) {
    foreach ($address in @([System.Net.IPAddress]::Any, [System.Net.IPAddress]::Loopback)) {
        try {
            $listener = [System.Net.Sockets.TcpListener]::new($address, $port)
            $listener.Start()
            $listener.Stop()
        } catch { return $false }
    }
    return $true
}

if (-not $running) {
    Write-Step 'Revisando que los puertos estén libres'
    $ports = [ordered]@{
        ADMIN_WEB_PORT     = @{ Default = 3000; Label = 'Panel administrativo' }
        GATEWAY_HOST_PORT  = @{ Default = 8080; Label = 'GraphQL Gateway' }
        POSTGRES_HOST_PORT = @{ Default = 5432; Label = 'PostgreSQL' }
        KAFKA_HOST_PORT    = @{ Default = 9092; Label = 'Kafka' }
    }
    $current = Read-EnvFile
    $taken = @{}
    foreach ($name in $ports.Keys) {
        $port = if ($current[$name]) { [int]$current[$name] } else { $ports[$name].Default }
        if ((Test-PortFree $port) -and -not $taken.ContainsKey($port)) {
            $taken[$port] = $true
            if (-not $current[$name]) { Set-EnvValue $name $port }
            continue
        }
        $candidate = $port + 1
        while (((-not (Test-PortFree $candidate)) -or $taken.ContainsKey($candidate)) -and $candidate -lt $port + 50) { $candidate++ }
        if ($candidate -ge $port + 50) { Stop-WithError "No encontré un puerto libre para $($ports[$name].Label) cerca de $port." }
        Set-EnvValue $name $candidate
        $taken[$candidate] = $true
        Write-Problem "El puerto $port ($($ports[$name].Label)) está ocupado por otro programa; se usará el $candidate."
    }
    Write-Ok 'Puertos listos.'
}

# 4. Levantar todo ------------------------------------------------------------------------------
Write-Step 'Construyendo y levantando los servicios'
Write-Info 'La primera vez tarda entre 5 y 15 minutos: descarga imágenes y compila los servicios Java.'
Write-Info 'Las siguientes veces tarda menos de un minuto.'
Write-Host ''
Push-Location $infra
try {
    & docker compose --profile apps up -d --build --wait
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-Host ''
        & docker compose --profile apps ps
        Stop-WithError ('Algún servicio no arrancó. Revisa sus logs con: cd infrastructure; docker compose --profile apps logs <servicio>')
    }
} finally { Pop-Location }

# 5. Listo ------------------------------------------------------------------------------------
$final = Read-EnvFile
$url = "http://localhost:$($final['ADMIN_WEB_PORT'])"
Write-Host ''
Write-Host '  ----------------------------------------------------------------' -ForegroundColor DarkGray
Write-Host '   Todo está en marcha.' -ForegroundColor Green
Write-Host ''
Write-Host "   Panel administrativo:  $url" -ForegroundColor White
Write-Host "   Usuario:               $($final['GATEWAY_CLIENT_USERNAME'])" -ForegroundColor White
Write-Host "   Contraseña:            $($final['GATEWAY_CLIENT_PASSWORD'])" -ForegroundColor White
Write-Host ''
Write-Host '   Para apagarlo: doble clic en detener.bat' -ForegroundColor DarkGray
Write-Host '  ----------------------------------------------------------------' -ForegroundColor DarkGray
Start-Process $url
