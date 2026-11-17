package co.edu.fet.gym.queries.domain.model;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/** Parte Membership de MemberOverview. {@code startDate} y {@code endDate} son nulos mientras esté PENDING. */
public record Membership(
        long id,
        long memberId,
        long planId,
        MembershipStatus status,
        LocalDate startDate,
        LocalDate endDate,
        OffsetDateTime createdAt) {
}
