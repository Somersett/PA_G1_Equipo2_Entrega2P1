# Consolidated Queries Service

Proyecto Spring Boot independiente que mantiene en `queries_db` la vista de lectura combinada de miembro, membresía y accesos recientes (`MemberOverview`). Su modelo admite consistencia eventual y no debe usarse para decidir el acceso.

- Consume `MEMBER_REGISTERED` (`members.events`), `MEMBERSHIP_CREATED/ACTIVATED/EXPIRED` (`memberships.events`) y `ACCESS_GRANTED/DENIED` (`access.events`) según `contracts/kafka/events.yaml`, con un parser estricto del sobre y de los campos obligatorios.
- Idempotencia (RNF-09): inbox `processed_events` con clave `(consumer_name, event_id)`, registrado en la misma transacción que el efecto; el offset se confirma después del commit (ack-mode `RECORD`).
- Orden de eventos: el estado de la membresía solo avanza y la membresía no se expone hasta recibir `MEMBERSHIP_CREATED`.
- Errores: los fallos transitorios se reintentan sin límite con espera exponencial (1–30 s); los eventos que incumplen el contrato se registran en ERROR y se descartan sin aplicar efectos. Es una política provisional mientras se definen los DLT.
- API interna de solo lectura (puerto 8085 dentro de la red de Docker, sin publicar en el equipo; HTTP Basic): `GET /member-overviews/{memberId}` y `GET /member-overviews/{memberId}/recent-accesses?limit=1..50`. Contrato: `contracts/openapi/consolidated-queries-api.yaml`. Solo la llama el GraphQL Gateway, que además consulta `/actuator/health` (incluye la conexión a `queries_db`) para informar el estado del sistema.
- Esquema: migración Flyway `src/main/resources/db/migration/V1__member_overview_projection.sql`.

Las capas `api/`, `application/`, `domain/` e `infrastructure/` son paquetes de `src/main/java/co/edu/fet/gym/queries`, y las pruebas están en `src/test`.

```bash
./mvnw test        # 24 pruebas: 18 unitarias + 6 de integración con Testcontainers (requiere Docker)
set -a; source ../../infrastructure/.env; set +a
./mvnw spring-boot:run
```

Documentación completa: `docs/api-gateway-graphql.md`.
