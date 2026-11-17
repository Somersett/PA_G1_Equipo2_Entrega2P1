# Crea un .zip del proyecto listo para llevar a otro equipo, sin dependencias descargadas ni compilados
# (node_modules, dist, target) ni el archivo .env con claves. En el otro equipo basta con ejecutar iniciar.bat.
param(
    # Carpeta donde se deja el .zip. Por defecto, la carpeta que contiene el proyecto.
    [string]$Destino
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$name = Split-Path -Leaf $root
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
if (-not $Destino) { $Destino = Split-Path -Parent $root }
$zipPath = Join-Path $Destino "$name-$stamp.zip"

$excludedDirs = @('node_modules', 'dist', 'target', '.git', '.idea', '.vscode', '.claude', '.playwright-mcp')
$excludedFiles = @('.env')

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host ''
Write-Host '==> Empaquetando el proyecto' -ForegroundColor Cyan

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
