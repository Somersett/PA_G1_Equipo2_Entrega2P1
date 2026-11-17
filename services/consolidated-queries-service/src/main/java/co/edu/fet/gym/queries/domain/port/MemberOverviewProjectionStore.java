package co.edu.fet.gym.queries.domain.port;

import co.edu.fet.gym.queries.domain.model.AccessAttempt;
import co.edu.fet.gym.queries.domain.model.Member;
import co.edu.fet.gym.queries.domain.model.MembershipProjection;

import java.util.Optional;

/** Escritura de la proyección MemberOverview en queries_db. */
public interface MemberOverviewProjectionStore {

    void upsertMember(Member member);

    /** Lee la membresía bloqueando la fila hasta el fin de la transacción. */
    Optional<MembershipProjection> findMembershipForUpdate(long membershipId);

    /** Falla si otra transacción insertó la misma membresía; el reintento la encontrará con {@link #findMembershipForUpdate}. */
    void insertMembership(MembershipProjection membership);

    void updateMembership(MembershipProjection membership);

    /** @return {@code false} si el intento ya estaba registrado */
    boolean insertAccessAttempt(AccessAttempt attempt);
}
