# Consolidated Queries Service

Proyecto Spring Boot independiente para mantener en `queries_db` la vista de lectura combinada de miembro, membresía y accesos recientes.

Consume `MEMBER_REGISTERED`, los eventos de membresía y los eventos de acceso definidos en `contracts/kafka/events.yaml`. Así construye las tres partes de `MemberOverview`. Su modelo admite consistencia eventual y no debe usarse para decidir el acceso.

Estructura inicial:

- `api/`: interfaz de consulta y modelos de salida.
- `application/`: coordinación de proyecciones y consultas.
- `domain/`: modelo de lectura y puertos.
- `infrastructure/`: persistencia, Kafka y configuración Spring.
- `tests/`: pruebas unitarias y de integración.
