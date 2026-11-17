package co.edu.fet.gym.gateway.domain.model;

import java.time.OffsetDateTime;

public record Member(long id, String document, String name, String phone, String email, OffsetDateTime createdAt) {
}
