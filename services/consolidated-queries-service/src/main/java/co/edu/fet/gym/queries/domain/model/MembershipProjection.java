package co.edu.fet.gym.queries.domain.model;

import co.edu.fet.gym.queries.domain.event.InvalidEventException;
import co.edu.fet.gym.queries.domain.event.MembershipActivated;
import co.edu.fet.gym.queries.domain.event.MembershipCreated;
import co.edu.fet.gym.queries.domain.event.MembershipEvent;
import co.edu.fet.gym.queries.domain.event.MembershipExpired;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Estado proyectado de una membresía a partir de MEMBERSHIP_CREATED, _ACTIVATED y _EXPIRED.
 *
 * <p>El contrato no fija clave de partición, así que los eventos de una misma membresía pueden
 * llegar desordenados. Dos reglas mantienen la proyección convergente:
 * <ul>
 *   <li>el estado solo avanza (PENDING -> ACTIVE -> EXPIRED); un evento atrasado no lo retrocede;</li>
 *   <li>{@code planId} y {@code createdAt} solo llegan con MEMBERSHIP_CREATED. Hasta entonces la
 *       proyección está incompleta y no se expone como {@link Membership}.</li>
 * </ul>
 */
public record MembershipProjection(
        long membershipId,
        long memberId,
        Long planId,
        MembershipStatus status,
        LocalDate startDate,
        LocalDate endDate,
        OffsetDateTime createdAt) {

    public static MembershipProjection from(MembershipEvent event) {
        return new MembershipProjection(event.membershipId(), event.memberId(), null, MembershipStatus.PENDING,
                null, null, null).apply(event);
    }

    public MembershipProjection apply(MembershipEvent event) {
        if (event.membershipId() != membershipId) {
            throw new IllegalArgumentException("El evento " + event.eventId() + " pertenece a la membresía "
                    + event.membershipId() + ", no a " + membershipId);
        }
        if (event.memberId() != memberId) {
            throw new InvalidEventException("El evento " + event.eventId() + " asocia la membresía " + membershipId
                    + " al miembro " + event.memberId() + ", pero la proyección la asocia al miembro " + memberId);
        }
        if (event instanceof MembershipCreated created) {
            return new MembershipProjection(membershipId, memberId, created.planId(), status, startDate, endDate,
                    created.occurredAt());
        }
        if (event instanceof MembershipActivated activated) {
            // Si ya venció, la fecha de fin vigente es la de MEMBERSHIP_EXPIRED, llegue en el orden que llegue.
            LocalDate effectiveEnd = status == MembershipStatus.EXPIRED ? endDate : activated.endDate();
            return new MembershipProjection(membershipId, memberId, planId, advanceTo(MembershipStatus.ACTIVE),
                    activated.startDate(), effectiveEnd, createdAt);
        }
        if (event instanceof MembershipExpired expired) {
            return new MembershipProjection(membershipId, memberId, planId, advanceTo(MembershipStatus.EXPIRED),
                    startDate, expired.endDate(), createdAt);
        }
        throw new IllegalStateException("Evento de membresía no soportado: " + event.eventType());
    }

    public boolean isComplete() {
        return planId != null && createdAt != null;
    }

    public Optional<Membership> toMembership() {
        if (!isComplete()) {
            return Optional.empty();
        }
        return Optional.of(new Membership(membershipId, memberId, planId, status, startDate, endDate, createdAt));
    }

    private MembershipStatus advanceTo(MembershipStatus candidate) {
        return candidate.isAfter(status) ? candidate : status;
    }
}
