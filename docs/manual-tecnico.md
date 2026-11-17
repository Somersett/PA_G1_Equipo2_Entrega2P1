# Manual técnico

Dirigido a quien necesite mantener, ejecutar en desarrollo o extender la plataforma. Para usarla como administrador, ver el [manual de instalación y uso](manual-instalacion-uso.md); para la vista general, ver la [arquitectura](arquitectura.md).

## 1. Tecnologías y versiones

| Capa | Tecnología | Versión | Dónde se define |
| --- | --- | --- | --- |
| Panel | React, TypeScript, Vite, TanStack Query, React Router | 19, 7, 8, 5, 8 | `clients/admin-web/package.json` |
| Servidor web del panel | nginx | 1.27 (Alpine) | `clients/admin-web/Dockerfile` |
| Gateway y servicio de consultas | Java, Spring Boot, Spring for GraphQL, Spring Kafka, Flyway | 17, 4.1.2 | `pom.xml` de cada proyecto |
| Simulador de servicios | Node.js, Express, kafkajs, pg | 22, 5, 2, 8 | `simulator/package.json` |
| Base de datos | PostgreSQL | 16 (Alpine) | `infrastructure/docker-compose.yml` |
| Mensajería | Apache Kafka (modo KRaft, sin ZooKeeper) | 3.9.0 | `infrastructure/docker-compose.yml` |
| Contenedores | Docker Engine con Docker Compose v2 | Docker Desktop actual | — |
| Pruebas | JUnit 5, Spring Boot Test, Testcontainers, `node:test` | — | `pom.xml`, `package.json` |

## 2. Estructura del repositorio

```text
.
├── README.md                     Guía principal: comandos, orden de ejecución, puertos, dependencias y limitaciones
├── iniciar / detener / borrar-datos / probar-fallos / datos-demo / empaquetar (.bat y .sh)
├── scripts/                      Lógica de los scripts de Windows (PowerShell) y herramientas/ (Node)
├── clients/admin-web/            Panel React + nginx (Dockerfile, nginx/default.conf.template)
├── clients/access-simulator/     Documentación del torniquete (implementado dentro del panel)
├── gateways/graphql-gateway/     GraphQL Gateway (Spring Boot, Maven Wrapper, Dockerfile)
├── services/consolidated-queries-service/   Vista consolidada (Spring Boot, Flyway, Dockerfile)
├── services/{members,memberships,payments,access-control}-service/   Pendientes: solo README
├── simulator/                    Members, Memberships, Payments y Access Control simulados (Node.js, Dockerfile)
├── contracts/                    OpenAPI, esquema GraphQL y catálogo de eventos de Kafka
├── infrastructure/               docker-compose.yml, .env.example, init de PostgreSQL, smoke test
└── docs/                         Arquitectura, API, manuales, pruebas, evidencias, diagramas e informe
```

Los proyectos Java siguen capas `api`, `application`, `domain` (con puertos) e `infrastructure`; el dominio no depende de Spring ni de Kafka.

## 3. Configuración

Toda la configuración local está en `infrastructure/.env`, que **no se versiona**. Los scripts `iniciar.*` lo crean copiando [`infrastructure/.env.example`](../infrastructure/.env.example), que solo trae valores de ejemplo para el entorno académico.

| Variable | Uso | Ejemplo |
| --- | --- | --- |
| `GATEWAY_CLIENT_USERNAME` / `GATEWAY_CLIENT_PASSWORD` | Credencial HTTP Basic del gateway y del panel. Mínimo 12 caracteres en la clave | `admin` / `cambie-esta-clave-admin` |
| `QUERIES_API_USERNAME` / `QUERIES_API_PASSWORD` | Credencial interna gateway → Consolidated Queries | `graphql-gateway` / `cambie-esta-clave-interna` |
| `QUERIES_DB_USERNAME` / `QUERIES_DB_PASSWORD` | Acceso a `queries_db` | `gym_user` / `gym_password` |
| `SIMULATOR_DB_USERNAME` / `SIMULATOR_DB_PASSWORD` | Acceso del simulador a sus cuatro bases | `gym_user` / `gym_password` |
| `GATEWAY_CORS_ALLOWED_ORIGINS` | Orígenes permitidos para CORS (vacío: ninguno) | — |
| `GATEWAY_SPRING_PROFILES_ACTIVE` | `local` habilita GraphiQL en `/graphiql` (solo desarrollo) | `default` |
| `BUSINESS_TIMEZONE` | Zona horaria para vigencias y vencimientos | `America/Bogota` |
| `ADMIN_WEB_PORT`, `GATEWAY_HOST_PORT`, `POSTGRES_HOST_PORT`, `KAFKA_HOST_PORT` | Puertos del equipo anfitrión | `3000`, `8080`, `5432`, `9092` |

Para un entorno distinto del local se deben cambiar todas las claves. Las variables propias de cada aplicación (tiempos de espera, límites de GraphQL, intervalo de vencimiento) están en [`api-gateway-graphql.md`](api-gateway-graphql.md) (sección 7) y en [`simulator/README.md`](../simulator/README.md).

## 4. Bases de datos y migraciones

| Paso | Archivo | Qué hace |
| --- | --- | --- |
| Creación de bases | [`infrastructure/postgres/init/01-create-databases.sql`](../infrastructure/postgres/init/01-create-databases.sql) | Crea `members_db`, `memberships_db`, `payments_db`, `access_db` y `queries_db` la primera vez que se crea el volumen `postgres-data` |
| Esquema de la vista consolidada | [`V1__member_overview_projection.sql`](../services/consolidated-queries-service/src/main/resources/db/migration/V1__member_overview_projection.sql) | Migración Flyway: `members`, `memberships`, `access_attempts` y `processed_events` en `queries_db` |
| Esquema de los servicios simulados | [`simulator/src/db.js`](../simulator/src/db.js) (constante `MIGRATIONS`) | Al arrancar crea, si no existen, las tablas del esquema `simulator` de cada base, incluidas `outbox` y `processed_events` |
| Datos iniciales | `simulator/src/modules/memberships.js` (`SEED_PLANS`, activo por defecto) | Crea los planes Mensual ($90.000, 30 días), Trimestral ($240.000, 90 días) y Anual ($850.000, 365 días) si no hay planes |
| Datos ficticios para pruebas | [`scripts/herramientas/datos-demo.json`](../scripts/herramientas/datos-demo.json) y `datos-demo.mjs` | `datos-demo.bat` / `bash datos-demo.sh` registran 8 miembros ficticios con membresías activas, pendientes y vencidas, pagos e intentos de ingreso |

Los datos ficticios se cargan **por el GraphQL Gateway**, no con SQL directo: así cada servicio publica sus eventos y las cinco bases quedan consistentes, igual que con el panel. La carga es idempotente (omite los documentos que ya existen). `borrar-datos` elimina el volumen y deja todo como recién instalado.

Para inspeccionar una base desde el equipo: `docker compose exec postgres psql -U gym_user -d access_db -c "select * from simulator.access_state"` (dentro de `infrastructure`).

## 5. Imágenes Docker

| Imagen | Dockerfile | Construcción |
| --- | --- | --- |
| `graphql-gateway` | `gateways/graphql-gateway/Dockerfile` | Multietapa: Maven 3.9 + Temurin 17 compila (copia el esquema de `contracts/graphql`), y una imagen Temurin 17 JRE lo ejecuta con un usuario sin privilegios |
| `consolidated-queries-service` | `services/consolidated-queries-service/Dockerfile` | Multietapa Maven → JRE 17, usuario sin privilegios. Las pruebas se ejecutan fuera de la imagen |
| `services-simulator` | `simulator/Dockerfile` | Node 22 Alpine, dependencias de producción, usuario `node` |
| `admin-web` | `clients/admin-web/Dockerfile` | Node 22 compila con Vite; nginx 1.27 sirve los archivos y reenvía `/api/graphql` al gateway |

## 6. Ejecución fuera de Docker (desarrollo)

Con PostgreSQL y Kafka levantados (`cd infrastructure && docker compose up -d postgres kafka`):

```bash
# Consolidated Queries (puerto 8085)
cd services/consolidated-queries-service
QUERIES_DB_USERNAME=gym_user QUERIES_DB_PASSWORD=gym_password \
QUERIES_API_USERNAME=graphql-gateway QUERIES_API_PASSWORD=cambie-esta-clave-interna ./mvnw spring-boot:run

# Simulador (puerto 8090)
cd simulator && npm install
DB_USERNAME=gym_user DB_PASSWORD=gym_password ADMIN_USERNAME=admin ADMIN_PASSWORD=cambie-esta-clave-admin npm start

# Gateway (puerto 8080)
cd gateways/graphql-gateway
GATEWAY_CLIENT_USERNAME=admin GATEWAY_CLIENT_PASSWORD=cambie-esta-clave-admin \
QUERIES_API_USERNAME=graphql-gateway QUERIES_API_PASSWORD=cambie-esta-clave-interna \
GYM_PLATFORM_USERNAME=admin GYM_PLATFORM_PASSWORD=cambie-esta-clave-admin ./mvnw spring-boot:run

# Panel (puerto 5173; Vite reenvía /api/graphql al gateway como lo hace nginx)
cd clients/admin-web && npm install && npm run dev
```

Requiere Java 17 y Node.js 22 en el equipo. Con Docker no hace falta ninguno de los dos.

## 7. Pruebas

| Suite | Comando | Requisitos |
| --- | --- | --- |
| Gateway (49 pruebas) | `cd gateways/graphql-gateway && ./mvnw test` | Java 17 |
| Consolidated Queries (24 pruebas) | `cd services/consolidated-queries-service && ./mvnw test` | Java 17 y Docker (Testcontainers levanta PostgreSQL y Kafka) |
| Simulador (11 pruebas) | `cd simulator && npm ci && npm test` | Node.js 22 |
| Panel (tipos y compilación) | `cd clients/admin-web && npm ci && npm run build` | Node.js 22 |
| Entrada única y tolerancia a fallos (35 comprobaciones) | `probar-fallos.bat` | Plataforma en marcha (Windows) |
| Extremo a extremo de la vista consolidada | `infrastructure/scripts/smoke-test-gateway.sh` | Plataforma en marcha, bash, curl, jq y python3 |
| Latencias medidas | `docker compose --profile apps --profile herramientas run --rm herramientas medir-latencias.mjs` (en `infrastructure`) | Plataforma en marcha |

Sin Java ni Node instalados, las suites se pueden ejecutar en contenedores; por ejemplo, desde la raíz del proyecto en bash:

```bash
docker run --rm -v "$PWD":/src -w /src/gateways/graphql-gateway maven:3.9.11-eclipse-temurin-17 mvn -B test
docker run --rm -v "$PWD/simulator":/app -w /app node:22-alpine sh -c "npm ci && npm test"
```

Resultados, matriz de pruebas y evidencias: [pruebas-y-evidencias.md](pruebas-y-evidencias.md).

## 8. Seguridad

- Todas las operaciones del gateway exigen HTTP Basic; las credenciales no tienen valor por defecto y la aplicación no arranca si faltan o son cortas.
- Los servicios internos no publican puertos; PostgreSQL y Kafka solo escuchan en `127.0.0.1` del equipo.
- Los errores no revelan hosts, puertos ni trazas. Las consultas abusivas (profundidad o complejidad excesivas) se rechazan antes de ejecutarse.
- `infrastructure/.env` está en `.gitignore`; el repositorio solo contiene `.env.example`.
- Pendiente: autenticación y autorización definitivas (por ejemplo, OAuth 2.0 u OpenID Connect) y TLS.

## 9. Observabilidad y diagnóstico

- Estado de todos los componentes: tablero del panel o consulta `systemStatus`.
- Salud: `GET /actuator/health` (gateway y Consolidated Queries), `GET /health` (simulador), `GET /healthz` (nginx).
- Registros: `docker compose --profile apps logs -f graphql-gateway` (o el servicio que corresponda), desde `infrastructure`.
- Mensajes de Kafka: pantalla *Eventos Kafka* del panel.

## 10. Reemplazar el simulador por servicios reales

1. Implementar cada servicio en `services/<nombre>-service` cumpliendo `contracts/openapi/gym-platform-api.yaml` y `contracts/kafka/events.yaml`, con su base propia, outbox e inbox (`processed_events`).
2. Agregarlos a `docker-compose.yml` con perfil `apps`, healthcheck y sin puerto publicado.
3. Cambiar `GYM_PLATFORM_BASE_URL` del gateway (hoy `http://services-simulator:8090`); si se separan en varios hosts, el cliente del gateway (`GymPlatformHttpClient`) debe enrutar por operación.
4. Ejecutar `probar-fallos.bat` y la matriz de pruebas como regresión.

## 11. Solución de problemas

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| `iniciar` dice que Docker no responde | Docker Desktop cerrado o iniciando | Abrir Docker Desktop y esperar a “Engine running” |
| Un puerto está ocupado | Otro programa usa 3000, 8080, 5432 o 9092 | `iniciar` elige otro libre y lo muestra; también se puede cambiar en `.env` |
| El panel dice “Sin conexión” | Gateway detenido o arrancando | Esperar unos segundos; revisar `docker compose --profile apps ps` |
| Una membresía pagada no se activa | Kafka o el simulador detenidos | Revisar *Estado del sistema*; al volver, el outbox publica los eventos pendientes |
| La primera ejecución tarda mucho | Descarga de imágenes y dependencias de Maven y npm | Es normal (5 a 15 minutos); las siguientes tardan menos de un minuto |
| Se quiere empezar de cero | Datos de pruebas anteriores | `borrar-datos.bat` o `bash borrar-datos.sh` |
