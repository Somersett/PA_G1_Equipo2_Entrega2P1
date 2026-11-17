# GraphQL Gateway

**Punto de entrada único** de los clientes. Todas las llamadas del panel administrativo pasan por aquí:

- `member(id: Int!): MemberOverview` lee el modelo consolidado de Consolidated Queries Service (RF-10).
- Las demás consultas (`members`, `plans`, `memberships`, `membership(id)`, `payments`, `accessAttempts`, `systemStatus`, `kafkaEvents`) y todas las mutaciones (`registerMember`, `createPlan`, `createMembership`, `registerPayment`, `registerAccessAttempt`, `expireMembership`) se traducen a la operación REST equivalente de Members, Memberships, Payments y Access Control. Hoy las atiende el simulador (`simulator/`).

No tiene base de datos ni reglas de negocio. Solo valida argumentos (ids ≥ 1 y rangos de `limit`). Las reglas (documento único, una membresía abierta por miembro, monto del plan...) y la publicación de eventos Kafka siguen en el servicio dueño de cada dato.

- Esquema: `contracts/graphql/schema.graphqls`. Maven lo copia al classpath al compilar, así que no hay una copia que pueda divergir.
- Upstreams: `contracts/openapi/consolidated-queries-api.yaml` (timeouts de 2 s y 3 s) y `contracts/openapi/gym-platform-api.yaml` más las rutas `/sim/*` del simulador (timeouts de 2 s y 5 s). Cada uno con su credencial HTTP Basic de servicio.
- Seguridad: HTTP Basic para clientes (RNF-07), CORS por lista blanca, profundidad máxima 15 y complejidad máxima 60 por operación (la introspección no cuenta en la complejidad). GraphiQL solo se habilita con el perfil Spring `local` (`GATEWAY_SPRING_PROFILES_ACTIVE=local` en `infrastructure/.env`) y sigue exigiendo HTTP Basic. Instrucciones y avisos de seguridad en `docs/api-gateway-graphql.md`.
- Errores en `errors[].extensions.classification`: `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_TIMEOUT` e `INTERNAL_ERROR`. Cuando un servicio rechaza un comando, su código (por ejemplo `DOCUMENT_ALREADY_REGISTERED`) va en `extensions.code` y su mensaje en `message`. No se exponen hosts, puertos ni trazas.

```bash
./mvnw test                                   # clientes HTTP con servidor stub + gateway por HTTP con mocks
set -a; source ../../infrastructure/.env; set +a
export GYM_PLATFORM_USERNAME=$GATEWAY_CLIENT_USERNAME GYM_PLATFORM_PASSWORD=$GATEWAY_CLIENT_PASSWORD
./mvnw spring-boot:run                        # http://localhost:8080/graphql
SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run   # además GraphiQL en http://localhost:8080/graphiql
```

Limitación del contrato: GraphQL `Int` es de 32 bits y los contratos REST y Kafka usan `int64`. Si un id (miembro, membresía, plan, pago o intento) supera 2 147 483 647, la serialización falla y el campo afectado queda en `null` con un error.

Documentación completa: `docs/api-gateway-graphql.md`.
