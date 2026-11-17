#!/usr/bin/env bash
# Carga datos ficticios de demostración (miembros, membresías, pagos e ingresos) por el GraphQL Gateway.
# Uso: bash datos-demo.sh con la plataforma en marcha (bash iniciar.sh). Es idempotente.
cd "$(dirname "$0")/infrastructure" || exit 1
printf '\n  FET Gym - Datos ficticios de demostración\n'
[[ -f .env ]] || { printf '  [X] Falta infrastructure/.env: ejecuta primero bash iniciar.sh\n'; exit 1; }
if docker compose --profile apps --profile herramientas run --rm herramientas; then
  printf '  Abre el panel y revisa Miembros, Membresías, Pagos y Control de acceso.\n'
else
  printf '  [X] No se pudieron cargar los datos. ¿Está en marcha la plataforma (bash iniciar.sh)?\n'
  exit 1
fi
