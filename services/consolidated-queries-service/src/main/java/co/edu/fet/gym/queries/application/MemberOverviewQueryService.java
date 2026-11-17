package co.edu.fet.gym.queries.application;

import co.edu.fet.gym.queries.domain.model.AccessAttempt;
import co.edu.fet.gym.queries.domain.model.MemberOverview;
import co.edu.fet.gym.queries.domain.port.MemberOverviewReader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Consulta de la vista consolidada. Solo responde lo que ya está proyectado: el modelo admite
 * consistencia eventual y no debe usarse para decidir accesos (RNF-06).
 */
@Service
public class MemberOverviewQueryService {

    public static final int DEFAULT_RECENT_ACCESSES = 10;
    public static final int MAX_RECENT_ACCESSES = 50;

    private final MemberOverviewReader reader;

    public MemberOverviewQueryService(MemberOverviewReader reader) {
        this.reader = reader;
    }

    @Transactional(readOnly = true)
    public MemberOverview getOverview(long memberId) {
        var member = reader.findMember(memberId).orElseThrow(() -> new MemberNotFoundException(memberId));
        return new MemberOverview(member, reader.findCurrentMembership(memberId).orElse(null));
    }

    @Transactional(readOnly = true)
    public List<AccessAttempt> getRecentAccesses(long memberId, int limit) {
        if (limit < 1 || limit > MAX_RECENT_ACCESSES) {
            throw new InvalidQueryException("limit debe estar entre 1 y " + MAX_RECENT_ACCESSES);
        }
        if (reader.findMember(memberId).isEmpty()) {
            throw new MemberNotFoundException(memberId);
        }
        return reader.findRecentAccessAttempts(memberId, limit);
    }
}
