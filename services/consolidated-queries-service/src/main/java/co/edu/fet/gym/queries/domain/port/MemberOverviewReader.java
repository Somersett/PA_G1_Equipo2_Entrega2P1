package co.edu.fet.gym.queries.domain.port;

import co.edu.fet.gym.queries.domain.model.AccessAttempt;
import co.edu.fet.gym.queries.domain.model.Member;
import co.edu.fet.gym.queries.domain.model.Membership;

import java.util.List;
import java.util.Optional;

/** Lectura de la proyección MemberOverview en queries_db. */
public interface MemberOverviewReader {

    Optional<Member> findMember(long memberId);

    /** Membresía completa más reciente del miembro (mayor createdAt; a igualdad, mayor id). */
    Optional<Membership> findCurrentMembership(long memberId);

    /** Intentos ordenados del más reciente al más antiguo. */
    List<AccessAttempt> findRecentAccessAttempts(long memberId, int limit);
}
