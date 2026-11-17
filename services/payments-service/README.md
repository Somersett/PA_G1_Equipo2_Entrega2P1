# Payments Service

Proyecto Spring Boot independiente para registrar pagos administrativos o simulados mediante REST, con persistencia propia en `payments_db`.

Publica `PAYMENT_REGISTERED` en `payments.events` después del registro del pago.

Estructura inicial:

- `api/`: controladores y modelos de entrada/salida.
- `application/`: casos de uso y coordinación.
- `domain/`: entidades, reglas y puertos.
- `infrastructure/`: persistencia, Kafka y configuración Spring.
- `tests/`: pruebas unitarias y de integración.
