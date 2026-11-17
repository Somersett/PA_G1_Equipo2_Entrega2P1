# Plataforma distribuida de membresías y control de acceso

**Identificación:** Grupo 2 - Equipo 2

Entrega técnica inicial para la gestión de miembros, planes, membresías, pagos y control de acceso de un gimnasio. Este paquete materializa los contratos y la infraestructura descritos en el PDF principal, sin ampliar el MVP ni afirmar que los componentes de aplicación ya están implementados.

## Alcance del MVP

- Registrar y consultar miembros.
- Crear y consultar planes de membresía.
- Asignar un plan y crear una membresía en estado `PENDING`.
- Registrar un pago y activar automáticamente la membresía correspondiente.
- Marcar membresías vencidas como `EXPIRED`.
- Validar y registrar intentos de acceso con el estado local de Access Control.
- Consultar mediante GraphQL la vista consolidada de miembro, membresía y accesos recientes.

Quedan fuera del alcance la pasarela de pago real, tarjetas, hardware biométrico o torniquetes, aplicación móvil, autoservicio, múltiples sedes, notificaciones, facturación electrónica, contabilidad y SSO.

## Arquitectura y responsabilidades

| Componente | Responsabilidad | Persistencia e integración |
| --- | --- | --- |
| Members Service | Registrar y consultar miembros; publicar su registro para el modelo consolidado | REST + `members_db` + Kafka |
| Memberships Service | Gestionar planes, membresías, activación y vencimiento | REST + `memberships_db` + Kafka |
| Payments Service | Registrar pagos administrativos o simulados | REST + `payments_db` + Kafka |
| Access Control Service | Decidir accesos con estado local y registrar intentos | REST + `access_db` + Kafka |
| Consolidated Queries Service | Mantener el modelo de lectura combinado | Spring Boot + `queries_db` + Kafka |
| GraphQL Gateway | Exponer la consulta consolidada de solo lectura | GraphQL sobre el servicio de consultas |

Los cinco componentes backend se proyectan como proyectos Java/Spring Boot independientes. Ningún servicio debe acceder directamente a la base de otro dominio.

## Contratos incluidos

- `contracts/openapi/gym-platform-api.yaml`: OpenAPI 3.0.3 con 12 operaciones REST.
- `contracts/graphql/schema.graphqls`: consulta `member(id: Int!)`; no define mutaciones.
- `contracts/kafka/events.yaml`: cuatro tópicos y siete tipos de evento con sobre común versionado e idempotencia definida.

Las operaciones REST administrativas declaran HTTP Basic como mecanismo inicial. `POST /access-attempts` no exige esa autenticación porque representa al simulador del punto de ingreso. El mecanismo definitivo de autenticación y autorización sigue pendiente.

### Operaciones REST

| Método | Ruta | Propósito |
| --- | --- | --- |
| `POST` | `/members` | Registrar miembro |
| `GET` | `/members` | Consultar miembros |
| `GET` | `/members/{memberId}` | Consultar miembro por ID |
| `POST` | `/plans` | Crear plan |
| `GET` | `/plans` | Listar planes |
| `POST` | `/memberships` | Crear membresía `PENDING` |
| `GET` | `/memberships` | Consultar membresías |
| `GET` | `/memberships/{membershipId}` | Consultar membresía por ID |
| `POST` | `/payments` | Registrar pago |
| `GET` | `/payments` | Consultar pagos |
| `GET` | `/payments/{paymentId}` | Consultar pago por ID |
| `POST` | `/access-attempts` | Validar y registrar acceso |

### Tópicos Kafka

| Tópico | Productor | Consumidores | Eventos |
| --- | --- | --- | --- |
| `members.events` | Members Service | Consolidated Queries Service | `MEMBER_REGISTERED` |
| `payments.events` | Payments Service | Memberships Service | `PAYMENT_REGISTERED` |
| `memberships.events` | Memberships Service | Access Control Service y Consolidated Queries Service, según el evento | `MEMBERSHIP_CREATED`, `MEMBERSHIP_ACTIVATED`, `MEMBERSHIP_EXPIRED` |
| `access.events` | Access Control Service | Consolidated Queries Service | `ACCESS_GRANTED`, `ACCESS_DENIED` |

El sobre común contiene `eventId`, `eventType`, `occurredAt` y `version` (inicia en `1`), además de los campos propios de cada evento.

### Idempotencia de consumidores

Kafka se utiliza con semántica de entrega al menos una vez. Cada consumidor mantiene en su propia base lógica una tabla de eventos procesados con una restricción única sobre `consumerName + eventId`. La actualización del dominio o de la proyección y el registro del `eventId` deben confirmarse en la misma transacción local. Si un evento llega duplicado, se reconoce sin volver a aplicar sus efectos; el offset se confirma después de completar la transacción.

## Estructura

```text
PA_G2_Equipo2_Entrega2P1/
|-- PA_G2_Equipo2_Entrega2P1.pdf
|-- README.md
|-- services/
|   |-- members-service/
|   |-- memberships-service/
|   |-- payments-service/
|   |-- access-control-service/
|   `-- consolidated-queries-service/
|-- gateways/
|   `-- graphql-gateway/
|-- clients/
|   |-- admin-web/
|   `-- access-simulator/
|-- contracts/
|   |-- openapi/gym-platform-api.yaml
|   |-- graphql/schema.graphqls
|   `-- kafka/events.yaml
|-- infrastructure/
|   |-- docker-compose.yml
|   `-- postgres/init/01-create-databases.sql
`-- docs/
```

Cada directorio de `services/` incluye la estructura interna mínima `api/`, `application/`, `domain/`, `infrastructure/` y `tests/`. Son carpetas iniciales; no contienen una implementación funcional en esta entrega.

## Infraestructura local

Requisitos: Docker con soporte para Docker Compose.

Desde la raíz del paquete:

```bash
cd infrastructure
docker compose up -d
```

La infraestructura expone:

- PostgreSQL 16 Alpine en `localhost:5432`.
- Apache Kafka 3.9.0 en modo KRaft en `localhost:9092`.

Las credenciales locales de PostgreSQL son `gym_user` / `gym_password`. El script de inicialización crea `members_db`, `memberships_db`, `payments_db`, `access_db` y `queries_db`. Estas credenciales y la topología de broker único corresponden únicamente al entorno académico local.

Para detener la infraestructura:

```bash
cd infrastructure
docker compose down
```

## Flujo principal

1. Members Service registra el miembro y publica `MEMBER_REGISTERED` para crear la parte `Member` de `MemberOverview`.
2. Payments Service registra el pago y publica `PAYMENT_REGISTERED`.
3. Memberships Service consume el evento, activa la membresía y publica `MEMBERSHIP_ACTIVATED`.
4. Access Control Service actualiza su estado local en `access_db`.
5. El simulador solicita `POST /access-attempts`.
6. Access Control decide con su estado local y publica `ACCESS_GRANTED` o `ACCESS_DENIED`.
7. Consolidated Queries Service consume los eventos de miembro, membresía y acceso para actualizar completamente `queries_db`.

La decisión de acceso no depende de llamadas síncronas a Members, Memberships o Payments. `queries_db` admite consistencia eventual y no debe usarse para autorizar el ingreso.

## Estado y pendientes

Esta entrega define contratos, infraestructura y estructura de proyectos. No incluye contenedores de aplicaciones aún no implementadas.

Permanecen pendientes:

- Mecanismo definitivo de autenticación y autorización administrativa.
- Reintentos, mensajes no procesables y dead-letter topics de Kafka.
- Particiones y factor de réplica fuera del broker académico local.
- Tecnología del panel administrativo.
- Formato definitivo de trazas y correlación.
