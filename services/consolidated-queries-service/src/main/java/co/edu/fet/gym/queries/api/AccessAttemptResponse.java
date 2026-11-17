package co.edu.fet.gym.queries.api;

import co.edu.fet.gym.queries.domain.model.AccessAttempt;
import co.edu.fet.gym.queries.domain.model.AccessResult;

import java.time.OffsetDateTime;

record AccessAttemptResponse(long attemptId, long memberId, AccessResult result, String reason, OffsetDateTime occurredAt) {

    static AccessAttemptResponse from(AccessAttempt attempt) {
        return new AccessAttemptResponse(attempt.attemptId(), attempt.memberId(), attempt.result(), attempt.reason(),
                attempt.occurredAt());
    }
}
