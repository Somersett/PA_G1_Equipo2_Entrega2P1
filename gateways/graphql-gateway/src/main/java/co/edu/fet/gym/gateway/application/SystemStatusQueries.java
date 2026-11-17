package co.edu.fet.gym.gateway.application;

import co.edu.fet.gym.gateway.domain.model.ComponentStatus;
import co.edu.fet.gym.gateway.domain.model.SystemComponent;
import co.edu.fet.gym.gateway.domain.model.SystemStatus;
import co.edu.fet.gym.gateway.domain.port.ConsolidatedQueriesPort;
import co.edu.fet.gym.gateway.domain.port.GymPlatformPort;
import co.edu.fet.gym.gateway.domain.port.UpstreamTimeoutException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Estado de la plataforma visto desde el gateway, el único punto de entrada de los clientes. El gateway
 * se informa a sí mismo, consulta la salud de Consolidated Queries y pregunta a los servicios de la
 * plataforma por ellos mismos, Kafka y PostgreSQL. Nunca falla: si un componente no responde, se informa
 * {@code DOWN}, y lo que solo ese componente podía informar queda {@code UNKNOWN}.
 */
@Service
public class SystemStatusQueries {

    static final String GATEWAY = "gateway";
    static final String PLATFORM = "simulator";
    static final String QUERIES = "queries";
    static final String KAFKA = "kafka";
    static final String POSTGRES = "postgres";

    private static final Logger log = LoggerFactory.getLogger(SystemStatusQueries.class);
    private static final Set<String> OWN_COMPONENTS = Set.of(GATEWAY, QUERIES);

    private final GymPlatformPort platform;
    private final ConsolidatedQueriesPort consolidatedQueries;

    public SystemStatusQueries(GymPlatformPort platform, ConsolidatedQueriesPort consolidatedQueries) {
        this.platform = platform;
        this.consolidatedQueries = consolidatedQueries;
    }

    public SystemStatus findSystemStatus() {
        List<SystemComponent> reported = platformComponents();
        List<SystemComponent> components = new ArrayList<>();
        components.add(new SystemComponent(GATEWAY, "GraphQL Gateway", "Punto de entrada único del panel",
                ComponentStatus.UP));
        reported.stream().filter(component -> PLATFORM.equals(component.id())).forEach(components::add);
        components.add(new SystemComponent(QUERIES, "Consolidated Queries Service", "Vista consolidada (queries_db)",
                queriesStatus()));
        reported.stream()
                .filter(component -> !PLATFORM.equals(component.id()) && !OWN_COMPONENTS.contains(component.id()))
                .forEach(components::add);
        boolean ready = components.stream().allMatch(component -> component.status() == ComponentStatus.UP);
        return new SystemStatus(ready, OffsetDateTime.now(ZoneOffset.UTC), List.copyOf(components));
    }

    private ComponentStatus queriesStatus() {
        try {
            return consolidatedQueries.isHealthy() ? ComponentStatus.UP : ComponentStatus.DOWN;
        } catch (UpstreamUnavailableException | UpstreamTimeoutException unreachable) {
            return ComponentStatus.DOWN;
        } catch (RuntimeException unexpected) {
            log.warn("No se pudo consultar la salud de Consolidated Queries: {}", unexpected.toString());
            return ComponentStatus.DOWN;
        }
    }

    private List<SystemComponent> platformComponents() {
        try {
            return platform.findPlatformComponents();
        } catch (UpstreamUnavailableException | UpstreamTimeoutException unreachable) {
            return unreachablePlatform();
        } catch (RuntimeException unexpected) {
            log.warn("No se pudo consultar el estado de los servicios de la plataforma: {}", unexpected.toString());
            return unreachablePlatform();
        }
    }

    /** Sin respuesta de los servicios de la plataforma no hay forma de saber cómo están Kafka y PostgreSQL. */
    private static List<SystemComponent> unreachablePlatform() {
        return List.of(
                new SystemComponent(PLATFORM, "Simulador de servicios", "Members, Memberships, Payments y Access Control",
                        ComponentStatus.DOWN),
                new SystemComponent(KAFKA, "Apache Kafka", "Mensajería de eventos", ComponentStatus.UNKNOWN),
                new SystemComponent(POSTGRES, "PostgreSQL", "Bases de datos por servicio", ComponentStatus.UNKNOWN));
    }
}
