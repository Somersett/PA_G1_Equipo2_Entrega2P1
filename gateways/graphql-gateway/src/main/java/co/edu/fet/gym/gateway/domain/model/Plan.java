package co.edu.fet.gym.gateway.domain.model;

import java.time.OffsetDateTime;

public record Plan(long id, String name, int durationDays, double price, OffsetDateTime createdAt) {
}