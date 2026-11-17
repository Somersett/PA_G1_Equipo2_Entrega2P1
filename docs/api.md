# Documentación de API

La plataforma expone **una sola API a los clientes: GraphQL**, en el gateway. Las APIs REST de los servicios y los eventos de Kafka son internos: solo los usa el gateway o los servicios entre sí. Los contratos formales son la fuente de verdad:

| Contrato | Archivo | Formato |
| --- | --- | --- |
| API GraphQL del gateway (clientes) | [`contracts/graphql/schema.graphqls`](../contracts/graphql/schema.graphqls) | GraphQL SDL |
| API REST de Members, Memberships, Payments y Access Control | [`contracts/openapi/gym-platform-api.yaml`](../contracts/openapi/gym-platform-api.yaml) | OpenAPI 3.0.3 |
| API interna de Consolidated Queries | [`contracts/openapi/consolidated-queries-api.yaml`](../contracts/openapi/consolidated-queries-api.yaml) | OpenAPI 3.0.3 |
| Eventos de Kafka | [`contracts/kafka/events.yaml`](../contracts/kafka/events.yaml) | YAML |

Los archivos OpenAPI se pueden abrir en <https://editor.swagger.io> (Archivo → Importar archivo) para verlos como documentación navegable. El detalle técnico del gateway (errores, límites, configuración y decisiones) está en [`api-gateway-graphql.md`](api-gateway-graphql.md).

Todos los ejemplos de este documento se ejecutaron contra la plataforma levantada con `iniciar.bat` y la credencial de ejemplo de `infrastructure/.env.example`; el resultado está en [pruebas y evidencias](pruebas-y-evidencias.md) (sección 4).

## 1. API GraphQL (gateway)

- **Endpoint:** `POST http://localhost:8080/graphql` (clientes externos) o `POST http://localhost:3000/api/graphql` (el mismo gateway, a través de nginx, como lo usa el panel).
- **Autenticación:** HTTP Basic con `GATEWAY_CLIENT_USERNAME` / `GATEWAY_CLIENT_PASSWORD` de `infrastructure/.env`. Sin credencial responde **401**.
- **Formato:** `Content-Type: application/json` con `{"query": "...", "variables": {...}}`.
- **Límites:** profundidad máxima 15 y complejidad máxima 60 por consulta.
- **Salud:** `GET http://localhost:8080/actuator/health` (sin autenticación).

### Consultas (`Query`)

| Operación | Devuelve | Resuelve contra |
| --- | --- | --- |
| `member(id: Int!)` | `MemberOverview`: miembro, membresía actual y `recentAccesses(limit: Int = 10)` | Consolidated Queries |
| `members` | `[Member!]!` | Members |
| `plans` | `[Plan!]!` | Memberships |
| `memberships` | `[Membership!]!` | Memberships |
| `membership(id: Int!)` | `Membership` o `null` | Memberships |
| `payments` | `[Payment!]!` | Payments |
| `accessAttempts(limit: Int = 50)` | `[AccessAttempt!]!` | Access Control |
| `systemStatus` | Estado de gateway, simulador, Consolidated Queries, Kafka y PostgreSQL. Nunca falla: lo que no responde se informa `DOWN` | Gateway |
| `kafkaEvents(after: Int = 0, limit: Int = 200)` | Últimos eventos de los cuatro tópicos | Simulador |

### Mutaciones (`Mutation`)

| Operación | Entrada | Efecto | Evento resultante |
| --- | --- | --- | --- |
| `registerMember(input)` | `document`, `name`, `phone`, `email?` | Crea el miembro | `MEMBER_REGISTERED` |
| `createPlan(input)` | `name`, `durationDays`, `price` | Crea un plan | — |
| `createMembership(input)` | `memberId`, `planId` | Crea la membresía en `PENDING` | `MEMBERSHIP_CREATED` |
| `registerPayment(input)` | `membershipId`, `amount`, `paidAt` | Registra el pago; la activación llega por Kafka | `PAYMENT_REGISTERED` → `MEMBERSHIP_ACTIVATED` |
| `registerAccessAttempt(memberId)` | id del miembro | Access Control decide y registra el intento | `ACCESS_GRANTED` o `ACCESS_DENIED` |
| `expireMembership(id)` | id de la membresía | Demostración: vence hoy una membresía activa | `MEMBERSHIP_EXPIRED` |

### Ejemplos (bash, Git Bash, macOS o Linux)

```bash
GW=http://localhost:8080/graphql
AUTH=admin:cambie-esta-clave-admin

# Planes disponibles
curl -s -u "$AUTH" -H 'Content-Type: application/json' "$GW" \
  -d '{"query":"{ plans { id name durationDays price } }"}'

# Registrar un miembro
curl -s -u "$AUTH" -H 'Content-Type: application/json' "$GW" \
  -d '{"query":"mutation($i: RegisterMemberInput!){ registerMember(input:$i){ id name } }","variables":{"i":{"document":"1075999001","name":"Persona De Prueba","phone":"3105559001"}}}'

# Ficha consolidada del miembro 1
curl -s -u "$AUTH" -H 'Content-Type: application/json' "$GW" \
  -d '{"query":"{ member(id: 1) { member { name } membership { status endDate } recentAccesses(limit: 3) { result reason occurredAt } } }"}'

# Sin credencial: HTTP 401
curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' "$GW" -d '{"query":"{ plans { id } }"}'
```

### Ejemplo (Windows PowerShell)

```powershell
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('admin:cambie-esta-clave-admin'))
$body = @{ query = '{ systemStatus { components { id status } } }' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:8080/graphql -Method Post -ContentType 'application/json' `
  -Headers @{ Authorization = $auth } -Body $body | ConvertTo-Json -Depth 5
```

### Errores

Las respuestas siguen el formato GraphQL: `data` y, si algo falla, `errors[]` con `extensions.classification` (tipo de error) y `extensions.code` (motivo del dominio o de la infraestructura). Ejemplo real de un documento repetido:

```json
{"errors":[{"message":"Ya existe un miembro con el documento 1075900101.","path":["registerMember"],
  "extensions":{"code":"DOCUMENT_ALREADY_REGISTERED","classification":"CONFLICT"}}],"data":null}
```

| `classification` | Cuándo | Códigos frecuentes en `extensions.code` |
| --- | --- | --- |
| `BAD_REQUEST` | Datos inválidos o rechazo de una regla | `AMOUNT_BELOW_PLAN_PRICE`, `PAYMENT_IN_FUTURE`, validaciones |
| `NOT_FOUND` | Miembro, plan o membresía inexistente | `MEMBER_NOT_FOUND`, `PLAN_NOT_FOUND`, `MEMBERSHIP_NOT_FOUND` |
| `CONFLICT` | Estado incompatible | `DOCUMENT_ALREADY_REGISTERED`, `PLAN_NAME_TAKEN`, `MEMBERSHIP_ALREADY_OPEN`, `MEMBERSHIP_NOT_PENDING`, `PAYMENT_ALREADY_REGISTERED`, `MEMBERSHIP_NOT_ACTIVE` |
| `UPSTREAM_UNAVAILABLE` | Un servicio no responde (`extensions.upstream` dice cuál) | `DATABASE_UNAVAILABLE`, `STARTING`, `CIRCUIT_OPEN` |
| `UPSTREAM_TIMEOUT` | Un servicio tardó más que el tiempo de espera | — |
| `INTERNAL_ERROR` | Error inesperado; el detalle queda solo en el log | — |

Los mensajes nunca exponen hosts, puertos ni trazas.

## 2. API REST de los servicios de dominio (interna)

Solo la invoca el gateway; en Docker Compose no tiene puerto publicado. Base: `http://services-simulator:8090` dentro de la red. Autenticación HTTP Basic administrativa, excepto `POST /access-attempts`, que representa al torniquete. Errores: `{ "code": "...", "message": "..." }`.

| Método | Ruta | Propósito | Respuestas |
| --- | --- | --- | --- |
| `POST` | `/members` | Registrar miembro | 201, 400, 401, 409, 422 |
| `GET` | `/members` | Consultar miembros | 200, 401 |
| `GET` | `/members/{memberId}` | Consultar miembro | 200, 400, 401, 404 |
| `POST` | `/plans` | Crear plan | 201, 400, 401, 409, 422 |
| `GET` | `/plans` | Listar planes | 200, 401 |
| `POST` | `/memberships` | Crear membresía `PENDING` | 201, 400, 401, 404, 409, 422 |
| `GET` | `/memberships` | Consultar membresías | 200, 401 |
| `GET` | `/memberships/{membershipId}` | Consultar membresía | 200, 400, 401, 404 |
| `POST` | `/payments` | Registrar pago | 201, 400, 401, 404, 409, 422 |
| `GET` | `/payments` | Consultar pagos | 200, 401 |
| `GET` | `/payments/{paymentId}` | Consultar pago | 200, 400, 401, 404 |
| `POST` | `/access-attempts` | Validar y registrar acceso | 200, 400, 404, 422 |

Extensiones del simulador fuera del contrato (prefijo `/sim`): `GET /sim/status`, `GET /sim/events`, `GET /sim/access-attempts` y `POST /sim/memberships/{id}/expire`; el gateway las expone como `systemStatus`, `kafkaEvents`, `accessAttempts` y `expireMembership`.

Para probarla sin publicar puertos, desde la carpeta `infrastructure`:

```bash
docker compose --profile apps exec graphql-gateway \
  curl -s -u admin:cambie-esta-clave-admin http://services-simulator:8090/plans
```

## 3. API interna de Consolidated Queries

| Método | Ruta | Propósito |
| --- | --- | --- |
| `GET` | `/member-overviews/{memberId}` | Vista consolidada: miembro, membresía y accesos recientes (`limit`, por defecto 10) |
| `GET` | `/member-overviews/{memberId}/recent-accesses` | Solo los accesos recientes (`limit`) |
| `GET` | `/actuator/health` | Salud (sin autenticación) |

Autenticación HTTP Basic interna (`QUERIES_API_USERNAME` / `QUERIES_API_PASSWORD`). Un miembro aún no proyectado responde 404 con `code = MEMBER_NOT_FOUND`.

```bash
docker compose --profile apps exec graphql-gateway \
  curl -s -u graphql-gateway:cambie-esta-clave-interna http://consolidated-queries-service:8085/member-overviews/1
```

## 4. Eventos de Kafka

Sobre común de todos los eventos: `eventId` (UUID), `eventType`, `occurredAt` (fecha y hora ISO 8601) y `version` (entero, inicia en 1). La clave del mensaje es el identificador del agregado.

| Evento | Tópico | Campos de dominio |
| --- | --- | --- |
| `MEMBER_REGISTERED` | `members.events` | `memberId`, `document`, `name`, `phone`, `email?`, `createdAt` |
| `PAYMENT_REGISTERED` | `payments.events` | `paymentId`, `membershipId`, `amount`, `paidAt` |
| `MEMBERSHIP_CREATED` | `memberships.events` | `membershipId`, `memberId`, `planId`, `status = PENDING` |
| `MEMBERSHIP_ACTIVATED` | `memberships.events` | `membershipId`, `memberId`, `status = ACTIVE`, `startDate`, `endDate` |
| `MEMBERSHIP_EXPIRED` | `memberships.events` | `membershipId`, `memberId`, `status = EXPIRED`, `endDate` |
| `ACCESS_GRANTED` | `access.events` | `attemptId`, `memberId`, `result`, `reason` |
| `ACCESS_DENIED` | `access.events` | `attemptId`, `memberId`, `result`, `reason` |

Para ver los mensajes reales: pantalla **Eventos Kafka** del panel, la consulta `kafkaEvents` o, desde `infrastructure`:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic members.events --from-beginning --timeout-ms 5000
```

En Git Bash para Windows, anteponga `MSYS_NO_PATHCONV=1` al comando: sin esa variable, Git Bash convierte la ruta `/opt/kafka/...` en una ruta de Windows y el contenedor no la encuentra. En PowerShell, macOS y Linux funciona tal cual.
