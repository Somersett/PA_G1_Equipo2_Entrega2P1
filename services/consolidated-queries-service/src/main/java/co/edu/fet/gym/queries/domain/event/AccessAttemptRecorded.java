package co.edu.fet.gym.queries.domain.event;

import co.edu.fet.gym.queries.domain.model.AccessAttempt;
import co.edu.fet.gym.queries.domain.model.AccessResult;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * ACCESS_GRANTED o ACCESS_DENIED. Los eventos de acceso no traen fecha propia: la fecha del
 * intento es {@code occurredAt} del sobre.
 */
public record AccessAttemptRecorded(
        UUID eventId,
        OffsetDateTime occurredAt,
        long attemptId,
        long memberId,
        AccessResult result,
        String reason) implements IntegrationEvent {

    @Override
    public EventType eventType() {
        return result == AccessResult.ACCESS_GRANTED ? EventType.ACCESS_GRANTED : EventType.ACCESS_DENIED;
    }

    public AccessAttempt toAccessAttempt() {
        return new AccessAttempt(attemptId, memberId, result, reason, occurredAt);
    }
}
