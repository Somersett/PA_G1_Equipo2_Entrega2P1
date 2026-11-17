package co.edu.fet.gym.gateway.domain.model;

import java.time.OffsetDateTime;

public record Payment(long id, long membershipId, double amount, OffsetDateTime paidAt, OffsetDateTime createdAt) {
}