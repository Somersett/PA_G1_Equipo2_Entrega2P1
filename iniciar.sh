#!/usr/bin/env bash
# Levanta toda la plataforma con Docker Compose y abre el panel en el navegador (macOS y Linux).
# Uso: bash iniciar.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INFRA="$ROOT/infrastructure"
ENV_FILE="$INFRA/.env"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok() { printf '    \033[32m%s\033[0m\n' "$1"; }
info() { printf '    \033[90m%s\033[0m\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }
fail() { printf '\n  \033[31m[X] %s\033[0m\n' "$1"; exit 1; }

printf '\n  FET Gym · Plataforma de membresías y control de acceso\n  Grupo 2 - Equipo 2\n'

# 1. Docker instalado y en marcha
step 'Revisando Docker'
command -v docker >/dev/null 2>&1 || {
  warn 'Docker no está instalado. Descárgalo de https://www.docker.com/products/docker-desktop/'
  fail 'Falta Docker.'
}
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]]; then
    info 'Docker Desktop está cerrado. Abriéndolo...'
    open -a Docker || true
  else
    warn 'Inicia Docker (por ejemplo: sudo systemctl start docker).'
  fi
  printf '    Esperando a que Docker esté listo'
  for _ in $(seq 1 80); do
    docker info >/dev/null 2>&1 && break
    printf '.'
    sleep 3
  done
  echo
  docker info >/dev/null 2>&1 || fail 'Docker no respondió. Ábrelo, espera a que esté listo y vuelve a intentar.'
fi
docker compose version >/dev/null 2>&1 || fail 'Tu Docker no incluye "docker compose". Actualízalo.'
ok 'Docker está en marcha.'

# 2. Archivo .env
step 'Revisando la configuración (infrastructure/.env)'
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$INFRA/.env.example" "$ENV_FILE"
  ok 'Creado infrastructure/.env a partir de .env.example.'
else
  ok 'Se usa el infrastructure/.env existente.'
fi
# Quita retornos de carro por si el archivo se editó en Windows.
sed -i.bak 's/\r$//' "$ENV_FILE" && rm -f "$ENV_FILE.bak"

env_get() { grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '[:space:]'; }
env_set() {
  if grep -qE "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE"; then
    sed -i.bak -E "s|^[[:space:]]*$1[[:space:]]*=.*|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

# 3. Puertos libres (solo si la plataforma no está ya corriendo)
cd "$INFRA" || fail 'No encuentro la carpeta infrastructure.'
if [[ -z "$(docker compose --profile apps ps --status running -q 2>/dev/null)" ]]; then
  step 'Revisando que los puertos estén libres'
  taken=" "
  for spec in ADMIN_WEB_PORT:3000:Panel GATEWAY_HOST_PORT:8080:Gateway POSTGRES_HOST_PORT:5432:PostgreSQL KAFKA_HOST_PORT:9092:Kafka; do
    IFS=: read -r name default label <<< "$spec"
    port="$(env_get "$name")"
    port="${port:-$default}"
    candidate="$port"
    while port_busy "$candidate" || [[ "$taken" == *" $candidate "* ]]; do
      candidate=$((candidate + 1))
      (( candidate < port + 50 )) || fail "No encontré un puerto libre para $label cerca de $port."
    done
    [[ "$candidate" != "$port" ]] && warn "El puerto $port ($label) está ocupado por otro programa; se usará el $candidate."
    env_set "$name" "$candidate"
    taken="$taken$candidate "
  done
  ok 'Puertos listos.'
fi

# 4. Levantar todo
step 'Construyendo y levantando los servicios'
info 'La primera vez tarda entre 5 y 15 minutos: descarga imágenes y compila los servicios Java.'
info 'Las siguientes veces tarda menos de un minuto.'
echo
if ! docker compose --profile apps up -d --build --wait; then
  docker compose --profile apps ps
  fail 'Algún servicio no arrancó. Revisa sus logs con: cd infrastructure && docker compose --profile apps logs <servicio>'
fi

# 5. Listo
URL="http://localhost:$(env_get ADMIN_WEB_PORT)"
printf '\n  ----------------------------------------------------------------\n'
printf '   \033[32mTodo está en marcha.\033[0m\n\n'
printf '   Panel administrativo:  %s\n' "$URL"
printf '   Usuario:               %s\n' "$(env_get GATEWAY_CLIENT_USERNAME)"
printf '   Contraseña:            %s\n\n' "$(env_get GATEWAY_CLIENT_PASSWORD)"
printf '   Para apagarlo: bash detener.sh\n'
printf '  ----------------------------------------------------------------\n'
if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 & fi
