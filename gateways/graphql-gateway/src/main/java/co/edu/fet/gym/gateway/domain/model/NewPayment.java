package co.edu.fet.gym.gateway.domain.model;

import java.time.OffsetDateTime;

public record NewPayment(long membershipId, double amount, OffsetDateTime paidAt) {
}