#!/usr/bin/env bash
# Prueba de integración de extremo a extremo:
#   eventos Kafka (contracts/kafka/events.yaml) -> Consolidated Queries Service -> queries_db
#   -> GraphQL Gateway -> cliente.
# Los productores (Members, Memberships, Access Control) aún no existen, así que el script publica
# los eventos con kafka-console-producer respetando el contrato.
# Requisitos: docker compose --profile apps up -d --build, infrastructure/.env, curl y jq.
set -euo pipefail

cd "$(dirname "$0")/.."
[[ -f .env ]] || { echo "Falta infrastructure/.env (copie .env.example)"; exit 1; }
set -a; source .env; set +a

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
BASE=$(( ($(date +%s) % 2000000) * 1000 ))   # ids únicos por ejecución, dentro del rango Int de GraphQL
MEMBER_ID=$((BASE + 1)); MEMBERSHIP_ID=$((BASE + 2)); ATTEMPT_1=$((BASE + 3)); ATTEMPT_2=$((BASE + 4))
FAILURES=0

pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILURES=$((FAILURES + 1)); }
check() { if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1 (esperado: '$3', obtenido: '$2')"; fi; }

publish() { # tópico, clave, json
  printf '%s|%s\n' "$2" "$3" | docker compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server localhost:9092 --topic "$1" --property parse.key=true --property key.separator='|' >/dev/null
}

gql() { # consulta GraphQL; credencial opcional como segundo argumento
  curl -sS -X POST "$GATEWAY_URL/graphql" -u "${2:-$GATEWAY_CLIENT_USERNAME:$GATEWAY_CLIENT_PASSWORD}" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "$(jq -cn --arg q "$1" '{query: $q}')"
}

uuid() { python3 -c 'import uuid; print(uuid.uuid4())'; }

FULL_QUERY="{ member(id: $MEMBER_ID) { member { id document name phone email createdAt }
  membership { id memberId planId status startDate endDate createdAt }
  recentAccesses { attemptId result reason occurredAt } } }"

echo "== Publicando eventos para el miembro $MEMBER_ID"
publish members.events "$MEMBER_ID" "{\"eventId\":\"$(uuid)\",\"eventType\":\"MEMBER_REGISTERED\",\"occurredAt\":\"2026-10-01T08:00:00Z\",\"version\":1,\"memberId\":$MEMBER_ID,\"document\":\"1075$MEMBER_ID\",\"name\":\"Ana Ruiz\",\"phone\":\"3001234567\",\"email\":\"ana@example.com\",\"createdAt\":\"2026-10-01T08:00:00Z\"}"
publish memberships.events "$MEMBER_ID" "{\"eventId\":\"$(uuid)\",\"eventType\":\"MEMBERSHIP_CREATED\",\"occurredAt\":\"2026-10-01T08:05:00Z\",\"version\":1,\"membershipId\":$MEMBERSHIP_ID,\"memberId\":$MEMBER_ID,\"planId\":3,\"status\":\"PENDING\"}"
publish memberships.events "$MEMBER_ID" "{\"eventId\":\"$(uuid)\",\"eventType\":\"MEMBERSHIP_ACTIVATED\",\"occurredAt\":\"2026-10-01T08:10:00Z\",\"version\":1,\"membershipId\":$MEMBERSHIP_ID,\"memberId\":$MEMBER_ID,\"status\":\"ACTIVE\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-31\"}"
DUPLICATED_EVENT_ID=$(uuid)
ACCESS_EVENT="{\"eventId\":\"$DUPLICATED_EVENT_ID\",\"eventType\":\"ACCESS_GRANTED\",\"occurredAt\":\"2026-10-02T12:00:00Z\",\"version\":1,\"attemptId\":$ATTEMPT_2,\"memberId\":$MEMBER_ID,\"result\":\"ACCESS_GRANTED\",\"reason\":\"MEMBERSHIP_ACTIVE\"}"
publish access.events "$MEMBER_ID" "{\"eventId\":\"$(uuid)\",\"eventType\":\"ACCESS_DENIED\",\"occurredAt\":\"2026-10-01T07:00:00Z\",\"version\":1,\"attemptId\":$ATTEMPT_1,\"memberId\":$MEMBER_ID,\"result\":\"ACCESS_DENIED\",\"reason\":\"NO_ACTIVE_MEMBERSHIP\"}"
publish access.events "$MEMBER_ID" "$ACCESS_EVENT"
publish access.events "$MEMBER_ID" "$ACCESS_EVENT"                      # duplicado: mismo eventId
publish access.events "$MEMBER_ID" '{"eventType":"ACCESS_GRANTED"}'     # inválido: se descarta

echo "== Esperando la proyección (consistencia eventual)"
for _ in $(seq 1 30); do
  RESPONSE=$(gql "$FULL_QUERY")
  if [[ "$(jq -r '.data.member.recentAccesses | length' <<<"$RESPONSE" 2>/dev/null)" == "2" ]]; then break; fi
  sleep 1
done
echo "$RESPONSE" | jq .

echo "== Consulta completa"
check "member.name" "$(jq -r '.data.member.member.name' <<<"$RESPONSE")" "Ana Ruiz"
check "member.email" "$(jq -r '.data.member.member.email' <<<"$RESPONSE")" "ana@example.com"
check "membership.status" "$(jq -r '.data.member.membership.status' <<<"$RESPONSE")" "ACTIVE"
check "membership.planId" "$(jq -r '.data.member.membership.planId' <<<"$RESPONSE")" "3"
check "membership.endDate" "$(jq -r '.data.member.membership.endDate' <<<"$RESPONSE")" "2026-10-31"
check "accesos: duplicado aplicado una sola vez" "$(jq -r '.data.member.recentAccesses | length' <<<"$RESPONSE")" "2"
check "accesos: más reciente primero" "$(jq -r '.data.member.recentAccesses[0].attemptId' <<<"$RESPONSE")" "$ATTEMPT_2"
check "sin errores" "$(jq -r '.errors // [] | length' <<<"$RESPONSE")" "0"

echo "== Argumentos, inexistentes y límites"
check "recentAccesses(limit: 1)" "$(gql "{ member(id: $MEMBER_ID) { recentAccesses(limit: 1) { attemptId } } }" | jq -r '.data.member.recentAccesses | length')" "1"
check "miembro inexistente -> null" "$(gql '{ member(id: 2147483000) { member { id } } }' | jq -c '.data.member')" "null"
check "id inválido -> BAD_REQUEST" "$(gql '{ member(id: 0) { member { id } } }' | jq -r '.errors[0].extensions.classification')" "BAD_REQUEST"
check "limit inválido -> BAD_REQUEST" "$(gql "{ member(id: $MEMBER_ID) { recentAccesses(limit: 500) { attemptId } } }" | jq -r '.errors[0].extensions.classification')" "BAD_REQUEST"
check "mutación inexistente -> ValidationError" "$(gql 'mutation { x }' | jq -r '.errors[0].extensions.classification')" "ValidationError"

echo "== Seguridad"
check "sin credenciales -> 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GATEWAY_URL/graphql" -H 'Content-Type: application/json' -d '{"query":"{__typename}"}')" "401"
check "clave incorrecta -> 401" "$(curl -s -o /dev/null -w '%{http_code}' -u "$GATEWAY_CLIENT_USERNAME:incorrecta" -X POST "$GATEWAY_URL/graphql" -H 'Content-Type: application/json' -d '{"query":"{__typename}"}')" "401"
check "health público" "$(curl -s -o /dev/null -w '%{http_code}' "$GATEWAY_URL/actuator/health")" "200"

echo "== Servicio de consultas caído"
docker compose stop consolidated-queries-service >/dev/null
check "UPSTREAM_UNAVAILABLE" "$(gql "$FULL_QUERY" | jq -r '.errors[0].extensions.classification')" "UPSTREAM_UNAVAILABLE"
docker compose start consolidated-queries-service >/dev/null
for _ in $(seq 1 60); do
  [[ "$(docker compose ps --format '{{.Health}}' consolidated-queries-service)" == "healthy" ]] && break; sleep 2
done
check "recuperación tras reinicio" "$(gql "$FULL_QUERY" | jq -r '.data.member.membership.status')" "ACTIVE"

echo
if (( FAILURES == 0 )); then echo "RESULTADO: todas las comprobaciones pasaron"; else echo "RESULTADO: $FAILURES comprobaciones fallaron"; exit 1; fi
