package co.edu.fet.gym.queries.domain.event;

import java.time.OffsetDateTime;
import java.util.UUID;

/** MEMBERSHIP_CREATED no trae createdAt: la proyección usa {@code occurredAt} del sobre. */
public record MembershipCreated(UUID eventId, OffsetDateTime occurredAt, long membershipId, long memberId, long planId)
        implements MembershipEvent {

    @Override
    public EventType eventType() {
        return EventType.MEMBERSHIP_CREATED;
    }
}
