package co.edu.fet.gym.queries.domain.model;

import java.time.OffsetDateTime;

public record AccessAttempt(long attemptId, long memberId, AccessResult result, String reason, OffsetDateTime occurredAt) {
}
