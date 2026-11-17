# Prueba de "entrada única por el gateway" y de tolerancia a fallos contra la plataforma en marcha.
# Uso: doble clic en probar-fallos.bat (con la plataforma ya iniciada con iniciar.bat).
#
# Qué hace: comprueba que solo el panel y el gateway estén expuestos, recorre el flujo principal y los
# rechazos del dominio, y luego detiene de a uno el simulador, PostgreSQL, Kafka, Consolidated Queries y el
# gateway para verificar que el sistema lo informa y se recupera solo. Al final todo queda en marcha.
# Deja algunos miembros de prueba ("Prueba Fallos", "Sin Kafka"); borrar-datos.bat los elimina si molestan.
# Tarda entre 3 y 6 minutos.

$ErrorActionPreference = 'Continue'
# Las respuestas del gateway son UTF-8; así se leen bien los mensajes con tildes que devuelve curl.exe.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) { Write-Host '  [X] Falta curl.exe (viene con Windows 10 y 11).' -ForegroundColor Red; exit 1 }
$root = Split-Path -Parent $PSScriptRoot
$infra = Join-Path $root 'infrastructure'
$envFile = Join-Path $infra '.env'
if (-not (Test-Path $envFile)) { Write-Host '  [X] Falta infrastructure\.env: ejecuta primero iniciar.bat.' -ForegroundColor Red; exit 1 }

$envValues = @{}
foreach ($line in Get-Content $envFile) { if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$') { $envValues[$Matches[1]] = $Matches[2].Trim() } }
$user = $envValues['GATEWAY_CLIENT_USERNAME']; $pass = $envValues['GATEWAY_CLIENT_PASSWORD']
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${user}:${pass}"))
$webPort = if ($envValues['ADMIN_WEB_PORT']) { $envValues['ADMIN_WEB_PORT'] } else { '3000' }
$panel = "http://localhost:$webPort/api/graphql"
$allUp = 'gateway=UP simulator=UP queries=UP kafka=UP postgres=UP'
$script:failures = 0

function Pass($t) { Write-Host "  OK     $t" -ForegroundColor Green }
function Fail($t) { Write-Host "  FALLA  $t" -ForegroundColor Red; $script:failures++ }
function Check($name, $actual, $expected) { if ("$actual" -eq "$expected") { Pass $name } else { Fail "$name (esperado '$expected', obtenido '$actual')" } }

# curl.exe (incluido en Windows 10/11): Windows PowerShell 5.1 no siempre deja leer el cuerpo de un error HTTP.
function Post($url, $body, [switch]$NoAuth) {
  $file = [IO.Path]::GetTempFileName()
  [IO.File]::WriteAllText($file, $body, (New-Object Text.UTF8Encoding $false))
  $headers = @('-H', 'Content-Type: application/json')
  if (-not $NoAuth) { $headers += @('-H', "Authorization: $auth") }
  $out = & curl.exe -s -m 25 -w "`n%{http_code}" -X POST $url @headers --data-binary "@$file"
  Remove-Item $file -Force
  $lines = @($out)
  return @{ status = [int]$lines[-1]; body = (($lines | Select-Object -SkipLast 1) -join "`n") }
}
function Gql($query, $variables = @{}) {
  $r = Post $panel (@{ query = $query; variables = $variables } | ConvertTo-Json -Depth 10 -Compress)
  if ($r.status -ne 200) { return [pscustomobject]@{ httpStatus = $r.status } }
  return $r.body | ConvertFrom-Json
}
function StatusLine { ((Gql '{ systemStatus { components { id status } } }').data.systemStatus.components | ForEach-Object { "$($_.id)=$($_.status)" }) -join ' ' }
function WaitFor($what, [scriptblock]$cond, $seconds = 90) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) { if (& $cond) { return $true }; Start-Sleep -Seconds 1 }
  Write-Host "         (tiempo agotado esperando: $what)" -ForegroundColor Yellow; return $false
}
function Compose { Push-Location $infra; & docker compose --profile apps @args 2>&1 | Out-Null; Pop-Location }
function Member($doc, $name) { (Gql 'mutation($i: RegisterMemberInput!){ registerMember(input:$i){ id } }' @{ i = @{ document = $doc; name = $name; phone = '3001234567' } }) }

Write-Host ''
Write-Host '  FET Gym - Prueba de entrada única y tolerancia a fallos' -ForegroundColor White
if ((Post $panel '{"query":"{__typename}"}').status -ne 200) { Write-Host '  [X] El panel no responde: ejecuta primero iniciar.bat.' -ForegroundColor Red; exit 1 }
Write-Host '  Esperando a que todos los componentes estén en línea...' -ForegroundColor DarkGray
$null = WaitFor 'todo en línea' { (StatusLine) -eq $allUp } 120

Write-Host ''; Write-Host '== 1. Entrada única: solo el panel y el gateway están expuestos' -ForegroundColor Cyan
foreach ($port in 8085, 8090) {
  $client = New-Object Net.Sockets.TcpClient
  try { $client.Connect('127.0.0.1', $port); Fail "el puerto $port (servicio interno) es accesible desde el equipo" } catch { Pass "puerto $port (servicio interno) cerrado: solo lo alcanza el gateway" } finally { $client.Close() }
}
Check 'nginx no expone otras rutas de API (/api/members -> 404)' (Post ($panel -replace '/api/graphql', '/api/members') '{}').status 404
Check 'el gateway exige credencial (401)' (Post $panel '{"query":"{__typename}"}' -NoAuth).status 401
Check 'el estado del sistema lo arma el gateway' (StatusLine) $allUp

Write-Host ''; Write-Host '== 2. Flujo principal y rechazos del dominio' -ForegroundColor Cyan
$doc = '9' + (Get-Date -Format 'MMddHHmmss')
$m = (Member $doc 'Prueba Fallos').data.registerMember
Check 'registrar miembro' ([bool]$m.id) 'True'
Check 'documento repetido -> DOCUMENT_ALREADY_REGISTERED' (Member $doc 'Otra Persona').errors[0].extensions.code 'DOCUMENT_ALREADY_REGISTERED'
Check 'datos inválidos -> BAD_REQUEST' (Member 'x' 'Ab').errors[0].extensions.classification 'BAD_REQUEST'
$plan = ((Gql '{ plans { id price } }').data.plans | Select-Object -First 1)
$ms = (Gql 'mutation($i: CreateMembershipInput!){ createMembership(input:$i){ id status } }' @{ i = @{ memberId = $m.id; planId = $plan.id } }).data.createMembership
Check 'asignar plan -> PENDING' $ms.status 'PENDING'
Check 'segunda membresía abierta -> MEMBERSHIP_ALREADY_OPEN' (Gql 'mutation($i: CreateMembershipInput!){ createMembership(input:$i){ id } }' @{ i = @{ memberId = $m.id; planId = $plan.id } }).errors[0].extensions.code 'MEMBERSHIP_ALREADY_OPEN'
$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$payQuery = 'mutation($i: RegisterPaymentInput!){ registerPayment(input:$i){ id } }'
Check 'monto menor al plan -> AMOUNT_BELOW_PLAN_PRICE' (Gql $payQuery @{ i = @{ membershipId = $ms.id; amount = 1; paidAt = $now } }).errors[0].extensions.code 'AMOUNT_BELOW_PLAN_PRICE'
Check 'registrar pago' ([bool](Gql $payQuery @{ i = @{ membershipId = $ms.id; amount = [double]$plan.price; paidAt = $now } }).data.registerPayment.id) 'True'
Check 'pago repetido se rechaza' ([bool](Gql $payQuery @{ i = @{ membershipId = $ms.id; amount = [double]$plan.price; paidAt = $now } }).errors[0].extensions.code) 'True'
Check 'activación asíncrona por Kafka' (WaitFor 'ACTIVE' { (Gql 'query($id:Int!){ membership(id:$id){ status } }' @{ id = $ms.id }).data.membership.status -eq 'ACTIVE' } 30) 'True'
Start-Sleep -Seconds 1
Check 'ingreso permitido' (Gql 'mutation($m:Int!){ registerAccessAttempt(memberId:$m){ result } }' @{ m = $m.id }).data.registerAccessAttempt.result 'ACCESS_GRANTED'

Write-Host ''; Write-Host '== 3. Simulador caído: el gateway sigue respondiendo y lo informa' -ForegroundColor Cyan
Compose stop services-simulator
Check 'estado: simulador caído, Kafka y PostgreSQL sin datos' (StatusLine) 'gateway=UP simulator=DOWN queries=UP kafka=UNKNOWN postgres=UNKNOWN'
$e = Gql '{ members { id } }'
Check 'consulta -> UPSTREAM_UNAVAILABLE de GYM_PLATFORM' "$($e.errors[0].extensions.classification) $($e.errors[0].extensions.upstream)" 'UPSTREAM_UNAVAILABLE GYM_PLATFORM'
Check 'el error no revela hosts ni puertos' ($e.errors[0].message -match '8090|services-simulator') 'False'
1..6 | ForEach-Object { $null = Gql '{ plans { id } }' }
Check 'disyuntor abierto tras fallos seguidos (CIRCUIT_OPEN)' (Gql '{ plans { id } }').errors[0].extensions.code 'CIRCUIT_OPEN'
Check 'la ficha consolidada sigue disponible' ((Gql 'query($id:Int!){ member(id:$id){ member { id } } }' @{ id = $m.id }).data.member.member.id) $m.id
Compose start services-simulator
Check 'recuperación sin intervención' (WaitFor 'simulador en línea' { (StatusLine) -eq $allUp } 90) 'True'

Write-Host ''; Write-Host '== 4. PostgreSQL caído: el motivo llega al panel (DATABASE_UNAVAILABLE)' -ForegroundColor Cyan
Compose stop postgres
Check 'estado: PostgreSQL caído' (WaitFor 'postgres DOWN' { (StatusLine) -match 'postgres=DOWN' } 20) 'True'
$e = Member ('8' + (Get-Date -Format 'MMddHHmmss')) 'Sin Base'
Check 'registrar -> DATABASE_UNAVAILABLE' $e.errors[0].extensions.code 'DATABASE_UNAVAILABLE'
Compose start postgres
Check 'recuperación sin intervención' (WaitFor 'todo en línea' { (StatusLine) -eq $allUp } 120) 'True'

Write-Host ''; Write-Host '== 5. Kafka caído: los registros se guardan y sus eventos salen al volver (outbox)' -ForegroundColor Cyan
Compose stop kafka
Check 'estado: Kafka caído' (WaitFor 'kafka DOWN' { (StatusLine) -match 'kafka=DOWN' } 30) 'True'
$m2 = (Member ('7' + (Get-Date -Format 'MMddHHmmss')) 'Sin Kafka').data.registerMember
Check 'registrar con Kafka caído funciona' ([bool]$m2.id) 'True'
Compose start kafka
Check 'el evento pendiente llega a la vista consolidada' (WaitFor 'proyección' { (Gql 'query($id:Int!){ member(id:$id){ member { id } } }' @{ id = $m2.id }).data.member.member.id -eq $m2.id } 120) 'True'

Write-Host ''; Write-Host '== 6. Consolidated Queries caído: solo la ficha consolidada se ve afectada' -ForegroundColor Cyan
Compose stop consolidated-queries-service
Check 'member(id) -> upstream CONSOLIDATED_QUERIES' (Gql 'query($id:Int!){ member(id:$id){ member { id } } }' @{ id = $m.id }).errors[0].extensions.upstream 'CONSOLIDATED_QUERIES'
Check 'estado: queries caído' (StatusLine) 'gateway=UP simulator=UP queries=DOWN kafka=UP postgres=UP'
Check 'el resto del panel funciona' ([bool](Gql '{ members { id } }').data.members) 'True'
Compose start consolidated-queries-service
Check 'recuperación sin intervención' (WaitFor 'queries en línea' { (StatusLine) -eq $allUp } 120) 'True'

Write-Host ''; Write-Host '== 7. Gateway caído: nginx responde un JSON que el panel entiende' -ForegroundColor Cyan
Compose stop graphql-gateway
$r = Post $panel '{"query":"{__typename}"}'
Check 'HTTP 502 o 504' ($r.status -in 502, 504) 'True'
Check 'código GATEWAY_UNAVAILABLE o GATEWAY_TIMEOUT' (($r.body | ConvertFrom-Json).code -in 'GATEWAY_UNAVAILABLE', 'GATEWAY_TIMEOUT') 'True'
Compose start graphql-gateway
Check 'recuperación sin intervención' (WaitFor 'gateway' { (Post $panel '{"query":"{__typename}"}').status -eq 200 } 120) 'True'

Write-Host ''; Write-Host '== 8. Caída inesperada de un proceso: Docker lo reinicia solo' -ForegroundColor Cyan
Push-Location $infra
$container = (& docker compose --profile apps ps -q services-simulator)
$before = [int](& docker inspect -f '{{.RestartCount}}' $container)
& docker compose --profile apps exec -T services-simulator kill 1 2>&1 | Out-Null
Pop-Location
Check 'el simulador vuelve sin intervención (restart: unless-stopped)' (WaitFor 'reinicio' { [int](& docker inspect -f '{{.RestartCount}}' $container) -gt $before -and (StatusLine) -eq $allUp } 90) 'True'

Write-Host ''
if ($script:failures -eq 0) {
  Write-Host '  RESULTADO: todas las comprobaciones pasaron.' -ForegroundColor Green
} else {
  Write-Host "  RESULTADO: $($script:failures) comprobaciones fallaron." -ForegroundColor Red
  exit 1
}
