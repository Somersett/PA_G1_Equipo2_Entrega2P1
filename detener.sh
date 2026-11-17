#!/usr/bin/env bash
# Detiene la plataforma. Los datos se conservan para la próxima vez. Uso: bash detener.sh
cd "$(dirname "$0")/infrastructure" || exit 1
printf '\n==> Deteniendo la plataforma\n'
if docker compose --profile apps down; then
  printf '    Listo. Los datos se conservan; vuelve a abrirla con: bash iniciar.sh\n'
else
  printf '    No se pudo detener. ¿Está abierto Docker?\n'
fi
