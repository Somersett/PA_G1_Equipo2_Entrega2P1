package co.edu.fet.gym.queries.domain.event;

import co.edu.fet.gym.queries.domain.model.Member;

import java.time.OffsetDateTime;
import java.util.UUID;

public record MemberRegistered(
        UUID eventId,
        OffsetDateTime occurredAt,
        long memberId,
        String document,
        String name,
        String phone,
        String email,
        OffsetDateTime createdAt) implements IntegrationEvent {

    @Override
    public EventType eventType() {
        return EventType.MEMBER_REGISTERED;
    }

    public Member toMember() {
        return new Member(memberId, document, name, phone, email, createdAt);
    }
}
