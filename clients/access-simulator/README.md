# Access Simulator

El simulador del punto de ingreso está implementado como la pantalla **Control de acceso** del panel administrativo (`clients/admin-web`, ruta `/acceso`). Como todo el panel, **pasa por el GraphQL Gateway**: envía la mutación `registerAccessAttempt(memberId)` (con la credencial HTTP Basic del panel) y el gateway la traduce a `POST /access-attempts` de Access Control, que no publica puerto. Muestra la decisión de Access Control: permitido o denegado, el motivo y qué hacer si se negó. No representa hardware biométrico ni torniquetes físicos.

Si la lista de miembros no se puede cargar, el torniquete sigue funcionando: basta con escribir el número del miembro y presionar Enter.
