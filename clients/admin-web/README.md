# Admin Web

Panel administrativo de la plataforma. Es una aplicación React (Vite + TypeScript) servida por nginx, que además actúa como proxy en el mismo origen.

**Todas las llamadas pasan por el GraphQL Gateway** (`/api/graphql`): consultas, mutaciones, estado del sistema y visor de Kafka. `src/api/client.ts` es el único lugar que hace `fetch`, y solo a esa ruta. nginx no expone ninguna otra ruta de API (responde 404), y los servicios (Consolidated Queries y el simulador) no publican puerto. El gateway resuelve `member(id)` contra Consolidated Queries y el resto contra Members, Memberships, Payments y Access Control.

## Manejo de errores

- `src/lib/errors.ts`: catálogo único. Convierte cualquier error (red, gateway, servicio caído, rechazo del dominio, falla de la interfaz) en *qué pasó*, *detalle* y *posible solución*, y decide si vale la pena reintentar.
- `components/ConnectionBanner.tsx`: aviso arriba del contenido cuando algún componente no responde (según `systemStatus`); se puede ocultar y, al recuperarse todo, avisa y refresca los datos.
- `components/ui.tsx`: `ErrorNotice` (aviso en línea, con *Reintentar*) y `ErrorState` (en lugar del contenido cuando no hay nada que mostrar, para no decir "no hay datos" cuando en realidad falló la consulta).
- `components/ErrorBoundary.tsx`: si una pantalla falla al dibujarse, muestra cómo seguir en vez de una página en blanco.
- nginx responde JSON (`GATEWAY_UNAVAILABLE` / `GATEWAY_TIMEOUT`) si no logra hablar con el gateway.

Detalle por escenario, incluido el recorrido guiado: `docs/tolerancia-a-fallos.md`.

El navegador solo habla con `http://localhost:3000`, así que no hace falta configurar CORS. El ingreso usa la credencial HTTP Basic de los clientes del gateway (`GATEWAY_CLIENT_USERNAME` / `GATEWAY_CLIENT_PASSWORD`). Se guarda solo en `sessionStorage` y se borra al cerrar la pestaña.

## Pantallas

| Pantalla | Qué muestra | Operaciones GraphQL |
| --- | --- | --- |
| Inicio | Indicadores, pendientes, últimos ingresos, estado del sistema y actividad en Kafka | `members`, `memberships`, `payments`, `accessAttempts`, `systemStatus`, `kafkaEvents` |
| Recorrido guiado | El flujo principal del PDF en 5 pasos, con los eventos de cada paso en vivo | mutaciones del flujo + `kafkaEvents` + `member(id)` |
| Control de acceso | Torniquete simulado y últimos intentos | `registerAccessAttempt`, `accessAttempts` |
| Miembros / ficha | Lista y ficha consolidada, con la consulta y la respuesta GraphQL a la vista | `members`, `member(id)` |
| Membresías, Pagos, Planes | Alta y consulta, con el siguiente paso sugerido al terminar cada acción | `createMembership`, `registerPayment`, `createPlan`, `expireMembership` y sus listas |
| Eventos Kafka | Los mensajes de los cuatro tópicos con su JSON, productor y consumidores | `kafkaEvents` |

Las operaciones están en `src/api/graphql.ts`.

## Desarrollo

Con el resto de la plataforma levantada (`iniciar.bat` o `docker compose --profile apps up -d`):

```bash
cd clients/admin-web
npm install
npm run dev        # http://localhost:5173 (proxy de /api/graphql a localhost:8080)
npm run build      # verificación de tipos + compilación a dist/
```

`GATEWAY_URL` cambia el destino del proxy de desarrollo.
