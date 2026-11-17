# Members Service

Proyecto Spring Boot independiente para registrar y consultar miembros mediante REST, con persistencia propia en `members_db`.

Después de registrar un miembro publica `MEMBER_REGISTERED` en `members.events`; Consolidated Queries Service consume este evento para crear la parte `Member` de `MemberOverview`.

Estructura inicial:

- `api/`: controladores y modelos de entrada/salida.
- `application/`: casos de uso y coordinación.
- `domain/`: entidades, reglas y puertos.
- `infrastructure/`: persistencia y configuración Spring.
- `tests/`: pruebas unitarias y de integración.
