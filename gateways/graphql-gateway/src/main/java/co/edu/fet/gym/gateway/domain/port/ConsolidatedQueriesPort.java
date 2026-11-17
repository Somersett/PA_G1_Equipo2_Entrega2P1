package co.edu.fet.gym.gateway.domain.port;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.MemberOverview;

import java.util.List;
import java.util.Optional;

/**
 * Lectura del modelo consolidado mantenido por Consolidated Queries Service. Las implementaciones
 * lanzan {@link UpstreamUnavailableException} o {@link UpstreamTimeoutException} ante fallos de red.
 */
public interface ConsolidatedQueriesPort {

    Optional<MemberOverview> findMemberOverview(long memberId);

    List<AccessAttempt> findRecentAccesses(long memberId, int limit);

    /** {@code true} si el servicio informa que está sano (incluye su conexión a queries_db). */
    boolean isHealthy();
}
