# Manual de instalación y uso

Guía para instalar la plataforma en un equipo nuevo y usar el panel administrativo. Las capturas se tomaron sobre una instalación limpia, hecha siguiendo solo estas instrucciones, con los datos ficticios de `datos-demo`.

## 1. Requisitos

| Requisito | Detalle |
| --- | --- |
| Sistema operativo | Windows 10 u 11, macOS o Linux |
| Software | [Docker Desktop](https://www.docker.com/products/docker-desktop/) (en Linux, Docker Engine con el complemento Docker Compose v2). No hace falta instalar Java, Node.js, PostgreSQL ni Kafka |
| Internet | Solo la primera vez, para descargar las imágenes base (Docker Hub) y las dependencias de Maven y npm |
| Recursos | {{RECURSOS}} |
| Puertos libres | 3000 (panel), 8080 (gateway), 5432 (PostgreSQL) y 9092 (Kafka). Si alguno está ocupado, `iniciar` elige otro libre automáticamente |

## 2. Instalación

1. **Obtener el proyecto.** Descomprimir el ZIP en una carpeta nueva o clonar el repositorio:
   `git clone https://github.com/Somersett/PA_G2_Equipo2_Entrega2P1.git`
2. **Abrir Docker Desktop** y esperar a que indique que el motor está en marcha. Si está cerrado, el script de inicio intenta abrirlo.
3. **Iniciar la plataforma.**
   - Windows: doble clic en `iniciar.bat`.
   - macOS o Linux: en una terminal dentro de la carpeta, `bash iniciar.sh`.
4. **Esperar el mensaje “Todo está en marcha”.** La primera vez tarda entre 5 y 15 minutos porque descarga imágenes y compila los servicios Java; después, menos de un minuto. El script crea `infrastructure/.env` a partir de `.env.example` si no existe.

![Arranque con iniciar.bat](evidencias/30-consola-iniciar.png)

5. **Abrir el panel** en <http://localhost:3000> (el script lo abre solo) e ingresar con el usuario `admin` y la contraseña `cambie-esta-clave-admin`, definidos en `infrastructure/.env`.
6. **Opcional: cargar datos ficticios.** Con la plataforma en marcha, doble clic en `datos-demo.bat` (o `bash datos-demo.sh`). Registra 8 miembros de prueba con membresías activas, pendientes y vencidas, pagos e intentos de ingreso. Se puede ejecutar varias veces sin duplicar datos.

![Carga de datos ficticios](evidencias/38-consola-datos-demo.png)

## 3. Uso del panel

### Ingreso

![Inicio de sesión](evidencias/01-login.png)

Si la contraseña es incorrecta, el panel lo indica y explica dónde está la clave:

![Contraseña incorrecta](evidencias/02-login-error.png)

### Tablero de inicio

Resume miembros, membresías activas, intentos de ingreso del día y recaudo del mes; lista lo que requiere atención y muestra el estado de los cinco componentes.

![Tablero de inicio](evidencias/03-inicio.png)

### Recorrido guiado (flujo principal en cinco pasos)

Menú **Recorrido guiado**. Cada paso indica qué servicio actúa y muestra en la columna derecha los eventos de Kafka en tiempo real.

1. **Registrar miembro:** nombre, documento, teléfono y correo opcional.

   ![Paso 1](evidencias/04-recorrido-paso1-miembro.png)

2. **Asignar plan:** elegir el plan; la membresía queda pendiente de pago.

   ![Paso 2](evidencias/05-recorrido-paso2-plan.png)

3. **Registrar pago:** el formulario sugiere el monto del plan y la fecha actual. La membresía se activa sola cuando llega el evento de Kafka.

   ![Paso 3](evidencias/06-recorrido-paso3-pago.png)
   ![Activación por Kafka](evidencias/07-recorrido-paso3-activacion.png)

4. **Validar ingreso:** el torniquete consulta a Access Control, que decide con su estado local.

   ![Paso 4](evidencias/08-recorrido-paso4-ingreso.png)

5. **Ver ficha consolidada:** la consulta GraphQL `member(id)` con su respuesta real.

   ![Paso 5](evidencias/09-recorrido-paso5-ficha.png)

Al terminar, el panel lista los nueve pasos del flujo y permite vencer la membresía para comprobar el ingreso denegado.

![Recorrido completo](evidencias/10-recorrido-completo.png)

### Control de acceso (torniquete)

Menú **Control de acceso**: buscar al miembro por nombre, documento o número y pulsar **Validar ingreso**. El resultado (permitido o denegado, con el motivo) queda en la lista de intentos recientes.

![Ingreso permitido](evidencias/11-control-acceso-permitido.png)
![Ingreso denegado](evidencias/12-control-acceso-denegado.png)

### Administración

- **Miembros:** listado con filtros por estado de membresía y búsqueda; cada fila abre la ficha del miembro.

  ![Miembros](evidencias/13-miembros.png)
  ![Ficha del miembro](evidencias/14-ficha-miembro.png)

- **Membresías:** estado y vigencia de cada una; permite registrar el pago de las pendientes, renovar las vencidas y forzar el vencimiento (demostración).

  ![Membresías](evidencias/15-membresias.png)

- **Pagos:** historial con el total recaudado.

  ![Pagos](evidencias/16-pagos.png)

- **Planes:** catálogo de planes y creación de nuevos.

  ![Planes](evidencias/17-planes.png)

### Eventos de Kafka

Muestra en vivo los mensajes de los cuatro tópicos, con su productor, consumidores y desplazamiento (*offset*).

![Eventos de Kafka](evidencias/18-eventos-kafka.png)

### Mensajes de error y avisos

Los formularios validan antes de enviar y muestran el error junto al campo que lo causó; si un componente falla, un aviso indica qué falla, qué se afecta y qué hacer, y el panel se recupera solo. Ejemplos en [pruebas y evidencias](pruebas-y-evidencias.md) (secciones 3 y 5).

## 4. Detener, reiniciar y borrar datos

| Acción | Windows | macOS o Linux |
| --- | --- | --- |
| Detener (los datos se conservan) | `detener.bat` | `bash detener.sh` |
| Volver a iniciar | `iniciar.bat` | `bash iniciar.sh` |
| Borrar todos los datos y empezar de cero | `borrar-datos.bat` | `bash borrar-datos.sh` |
| Cargar datos ficticios | `datos-demo.bat` | `bash datos-demo.sh` |
| Probar entrada única y tolerancia a fallos | `probar-fallos.bat` | — (ver la sección 6 de [`tolerancia-a-fallos.md`](tolerancia-a-fallos.md) para la prueba manual) |
| Generar un ZIP de la versión actual | `empaquetar.bat` | `git archive --format=zip -o proyecto.zip HEAD` |

## 5. Problemas frecuentes

Ver la tabla de solución de problemas del [manual técnico](manual-tecnico.md#11-solución-de-problemas).
