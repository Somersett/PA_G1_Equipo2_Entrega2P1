#!/usr/bin/env bash
# Detiene la plataforma y borra TODOS los datos (bases y tópicos de Kafka). Uso: bash borrar-datos.sh
cd "$(dirname "$0")/infrastructure" || exit 1
printf '\n  Esto borra todos los miembros, membresías, pagos, accesos y eventos.\n'
printf '  Útil para empezar la demostración desde cero. No se puede deshacer.\n'
read -r -p '  Escribe BORRAR para confirmar: ' answer
if [[ "$answer" != "BORRAR" ]]; then
  printf '  Cancelado. No se borró nada.\n'
  exit 0
fi
if docker compose --profile apps down -v; then
  printf '  Datos borrados. Ejecuta bash iniciar.sh para empezar de cero.\n'
else
  printf '  No se pudo completar. ¿Está abierto Docker?\n'
fi
