# Simulador de servicios

Hace las veces de **Members, Memberships, Payments y Access Control** mientras sus servicios Spring Boot no estén implementados, para que el panel administrativo pueda demostrar el flujo completo del MVP. Solo lo llama el GraphQL Gateway (no publica puerto en Docker Compose). Respeta los mismos contratos, así que se puede retirar cambiando únicamente `GYM_PLATFORM_BASE_URL` en el gateway:

- **REST:** las 12 operaciones de `contracts/openapi/gym-platform-api.yaml`, con HTTP Basic (salvo `POST /access-attempts`) y respuestas de error `{ code, message }`.
- **Kafka:** produce y consume los eventos de `contracts/kafka/events.yaml` con el sobre común versionado.

Node.js 22 + Express + kafkajs + pg. Sin compilación.

## Cómo respeta la arquitectura

| Módulo | Base propia | Produce | Consume |
| --- | --- | --- | --- |
| Members | `members_db` | `MEMBER_REGISTERED` | — |
| Memberships | `memberships_db` | `MEMBERSHIP_CREATED`, `MEMBERSHIP_ACTIVATED`, `MEMBERSHIP_EXPIRED` | `PAYMENT_REGISTERED` |
| Payments | `payments_db` | `PAYMENT_REGISTERED` | — |
| Access Control | `access_db` | `ACCESS_GRANTED`, `ACCESS_DENIED` | `MEMBERSHIP_ACTIVATED`, `MEMBERSHIP_EXPIRED` |

- **Activación asíncrona (RF-06):** `POST /payments` no toca la membresía. Memberships la activa al consumir `PAYMENT_REGISTERED` y calcula la vigencia: empieza el día del pago y cubre `durationDays` días, incluido ese.
- **Decisión de acceso local (RNF-01, RNF-02):** Access Control decide solo con `access_state` (en `access_db`), alimentado por los eventos de membresía. Nunca consulta a otros módulos ni a `queries_db`. Concede el ingreso únicamente con estado `ACTIVE` y vigencia no terminada. Motivos: `MEMBERSHIP_ACTIVE`, `NO_ACTIVE_MEMBERSHIP` y `MEMBERSHIP_EXPIRED`.
- **Idempotencia (RNF-09):** cada consumidor registra el `eventId` en `processed_events` (único por `consumer_name + event_id`) en la misma transacción que el efecto. Un duplicado se reconoce sin efectos.
- **Outbox transaccional:** cada cambio guarda su evento en la tabla `outbox` de su base, dentro de la misma transacción. Un relay lo publica en Kafka, en orden, y lo reintenta si Kafka no está disponible.
- **Vencimiento (RF-07):** una tarea programada (cada 60 s) marca `EXPIRED` las membresías activas cuya vigencia terminó y publica `MEMBERSHIP_EXPIRED`.
- Las tablas viven en el esquema `simulator` de cada base, para no chocar con otras implementaciones.

**Tolerancia a fallos:**

- Si PostgreSQL no responde, las operaciones fallan en pocos segundos con `503 { code: "DATABASE_UNAVAILABLE" }` (conexión: 3 s; consulta: `DB_STATEMENT_TIMEOUT_MS`, 4 s por defecto), sin dejar nada a medias. El gateway lo informa con ese código y el panel explica la causa.
- Si Kafka no responde, los registros se siguen guardando: el outbox publica sus eventos cuando vuelve.
- Si kafkajs no puede reiniciar un consumidor, el proceso termina para que Docker lo reinicie (`restart: unless-stopped`) y retome desde el último offset confirmado; la idempotencia evita efectos dobles.

**Simplificación consciente:** las validaciones síncronas de existencia (`POST /memberships` verifica el miembro y el plan; `POST /payments` verifica la membresía y su precio) son llamadas en proceso entre módulos, equivalentes a una consulta REST entre servicios.

## Extensiones fuera del contrato (prefijo `/sim`)

El gateway las expone como operaciones GraphQL; el panel no las llama directamente.

| Ruta | Uso | Operación GraphQL |
| --- | --- | --- |
| `GET /sim/status` | Estado de lo que solo el simulador observa: él mismo, Kafka y PostgreSQL. El gateway lo combina con su propio estado y con la salud de Consolidated Queries; el simulador no conoce al gateway. | `systemStatus` |
| `GET /sim/events?after=<seq>` | Últimos mensajes de los cuatro tópicos, leídos con un grupo de consumidores propio. | `kafkaEvents` |
| `GET /sim/access-attempts?limit=` | Últimos intentos de acceso. | `accessAttempts` |
| `POST /sim/memberships/{id}/expire` | Demostración: vence hoy una membresía activa y publica `MEMBERSHIP_EXPIRED`. | `expireMembership` |

## Ejecutar fuera de Docker

Con PostgreSQL y Kafka de `infrastructure/docker-compose.yml` levantados:

```bash
cd simulator
npm install
DB_USERNAME=gym_user DB_PASSWORD=gym_password \
ADMIN_USERNAME=admin ADMIN_PASSWORD=cambie-esta-clave-admin npm start   # puerto 8090
npm test                                                                 # reglas de negocio
```

Variables: `PORT`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `KAFKA_BOOTSTRAP_SERVERS`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BUSINESS_TIMEZONE` (por defecto `America/Bogota`), `EXPIRATION_INTERVAL_MS`, `SEED_PLANS` (crea los planes Mensual, Trimestral y Anual si no hay ninguno) y `DB_STATEMENT_TIMEOUT_MS` (por defecto 4000).
