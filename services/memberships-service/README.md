# Memberships Service

Proyecto Spring Boot independiente para gestionar planes, membresías, activación y vencimiento, con persistencia propia en `memberships_db`.

Consume `PAYMENT_REGISTERED` desde `payments.events` y publica `MEMBERSHIP_CREATED`, `MEMBERSHIP_ACTIVATED` y `MEMBERSHIP_EXPIRED` en `memberships.events`.

Estructura inicial:

- `api/`: controladores y modelos de entrada/salida.
- `application/`: casos de uso y coordinación.
- `domain/`: entidades, reglas y puertos.
- `infrastructure/`: persistencia, Kafka y configuración Spring.
- `tests/`: pruebas unitarias y de integración.
