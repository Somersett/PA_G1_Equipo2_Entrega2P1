package co.edu.fet.gym.gateway.application;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.MemberOverview;
import co.edu.fet.gym.gateway.domain.port.ConsolidatedQueriesPort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Valida los argumentos antes de llamar al servicio de consultas. No contiene reglas de negocio:
 * el gateway solo expone lo que el modelo consolidado ya tiene proyectado.
 */
@Service
public class MemberOverviewQueries {

    /** Valor por defecto de {@code recentAccesses(limit: Int = 10)} en el esquema. */
    public static final int DEFAULT_RECENT_ACCESSES = 10;
    /** Mismo máximo que acepta la API del servicio de consultas. */
    public static final int MAX_RECENT_ACCESSES = 50;

    private final ConsolidatedQueriesPort consolidatedQueries;

    public MemberOverviewQueries(ConsolidatedQueriesPort consolidatedQueries) {
        this.consolidatedQueries = consolidatedQueries;
    }

    public Optional<MemberOverview> findMemberOverview(int memberId) {
        if (memberId < 1) {
            throw new InvalidArgumentException("id debe ser mayor o igual que 1");
        }
        return consolidatedQueries.findMemberOverview(memberId);
    }

    /** Un {@code limit: null} explícito se trata como el valor por defecto del esquema. */
    public List<AccessAttempt> findRecentAccesses(long memberId, Integer limit) {
        int effectiveLimit = limit == null ? DEFAULT_RECENT_ACCESSES : limit;
        if (effectiveLimit < 1 || effectiveLimit > MAX_RECENT_ACCESSES) {
            throw new InvalidArgumentException("limit debe estar entre 1 y " + MAX_RECENT_ACCESSES);
        }
        return consolidatedQueries.findRecentAccesses(memberId, effectiveLimit);
    }
}
