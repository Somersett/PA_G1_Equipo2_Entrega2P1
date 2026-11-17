package co.edu.fet.gym.gateway.domain.model;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public record Membership(
        long id,
        long memberId,
        long planId,
        MembershipStatus status,
        LocalDate startDate,
        LocalDate endDate,
        OffsetDateTime createdAt) {
}
