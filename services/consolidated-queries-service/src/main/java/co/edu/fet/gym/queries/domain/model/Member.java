package co.edu.fet.gym.queries.domain.model;

import java.time.OffsetDateTime;

/** Parte Member de MemberOverview, alimentada por MEMBER_REGISTERED. {@code email} es opcional. */
public record Member(long id, String document, String name, String phone, String email, OffsetDateTime createdAt) {
}
