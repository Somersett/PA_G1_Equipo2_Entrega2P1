# Access Control Service

Proyecto Spring Boot independiente para decidir accesos con estado local y registrar todos los intentos en `access_db`.

Consume `MEMBERSHIP_ACTIVATED` y `MEMBERSHIP_EXPIRED` desde `memberships.events`. Publica `ACCESS_GRANTED` o `ACCESS_DENIED` en `access.events`. La decisión no debe realizar llamadas síncronas a los servicios administrativos.

Estructura inicial:

- `api/`: controlador y modelos de entrada/salida.
- `application/`: caso de uso de validación y coordinación.
- `domain/`: entidades, reglas y puertos.
- `infrastructure/`: persistencia, Kafka y configuración Spring.
- `tests/`: pruebas unitarias y de integración.
