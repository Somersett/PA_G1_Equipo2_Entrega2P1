package co.edu.fet.gym.queries.domain.event;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record MembershipExpired(UUID eventId, OffsetDateTime occurredAt, long membershipId, long memberId, LocalDate endDate)
        implements MembershipEvent {

    @Override
    public EventType eventType() {
        return EventType.MEMBERSHIP_EXPIRED;
    }
}
