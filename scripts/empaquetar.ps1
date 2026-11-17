# Crea un .zip del proyecto listo para llevar a otro equipo, sin dependencias descargadas ni compilados
# (node_modules, dist, target) ni el archivo .env con claves. En el otro equipo basta con ejecutar iniciar.bat.
# Si el proyecto es un repositorio git, el .zip se genera con "git archive" a partir del último commit, de modo
# que corresponde exactamente a la versión publicada en el repositorio (el nombre incluye el commit).
param(
    # Carpeta donde se deja el .zip. Por defecto, la carpeta que contiene el proyecto.
    [string]$Destino
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$name = Split-Path -Leaf $root
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
if (-not $Destino) { $Destino = Split-Path -Parent $root }

Write-Host ''
Write-Host '==> Empaquetando el proyecto' -ForegroundColor Cyan

$git = Get-Command git -ErrorAction SilentlyContinue
$isRepo = $false
if ($git) {
    Push-Location $root
    try { $isRepo = ((& git rev-parse --is-inside-work-tree 2>$null) -eq 'true') } finally { Pop-Location }
}

if ($isRepo) {
    Push-Location $root
    try {
        $commit = (& git rev-parse --short HEAD).Trim()
        $pending = & git status --porcelain --untracked-files=no
        if ($pending) {
            Write-Host '    Atención: hay cambios sin confirmar (commit); el .zip contiene solo la versión del último commit.' -ForegroundColor Yellow
        }
        $zipPath = Join-Path $Destino "$name-$commit.zip"
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        & git archive --format=zip --prefix="$name/" -o $zipPath HEAD
        if ($LASTEXITCODE -ne 0) { throw 'git archive falló.' }
    } finally { Pop-Location }
    $sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
    Write-Host "    Listo: $zipPath ($sizeMb MB, commit $commit)" -ForegroundColor Green
    Write-Host '    En el otro equipo: descomprime, instala Docker Desktop y ejecuta iniciar.bat (o iniciar.sh).' -ForegroundColor Gray
    exit 0
}

# Sin git: se copian los archivos de la carpeta, excluyendo dependencias, compilados y secretos.
$zipPath = Join-Path $Destino "$name-$stamp.zip"
$excludedDirs = @('node_modules', 'dist', 'target', '.git', '.idea', '.vscode', '.claude', '.playwright-mcp')
$excludedFiles = @('.env')

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$files = Get-ChildItem -Path $root -Recurse -File -Force | Where-Object {
    $relative = $_.FullName.Substring($root.Length + 1)
    $parts = $relative -split '[\\/]'
    -not ($parts | Where-Object { $excludedDirs -contains $_ }) -and -not ($excludedFiles -contains $_.Name)
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        # Rutas con "/" para que el zip se abra igual en Windows, macOS y Linux.
        $entry = "$name/" + ($file.FullName.Substring($root.Length + 1) -replace '\\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $zip.Dispose()
}

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "    Listo: $zipPath ($sizeMb MB, $($files.Count) archivos)" -ForegroundColor Green
Write-Host '    En el otro equipo: descomprime, instala Docker Desktop y ejecuta iniciar.bat (o iniciar.sh).' -ForegroundColor Gray
