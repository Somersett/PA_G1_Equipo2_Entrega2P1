package co.edu.fet.gym.queries.infrastructure.persistence;

import co.edu.fet.gym.queries.domain.model.AccessAttempt;
import co.edu.fet.gym.queries.domain.model.AccessResult;
import co.edu.fet.gym.queries.domain.model.Member;
import co.edu.fet.gym.queries.domain.model.Membership;
import co.edu.fet.gym.queries.domain.model.MembershipStatus;
import co.edu.fet.gym.queries.domain.port.MemberOverviewReader;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
class JdbcMemberOverviewReader implements MemberOverviewReader {

    private final JdbcClient jdbc;

    JdbcMemberOverviewReader(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Member> findMember(long memberId) {
        return jdbc.sql("""
                        SELECT member_id, document, name, phone, email, created_at
                        FROM members
                        WHERE member_id = :memberId
                        """)
                .param("memberId", memberId)
                .query((rs, rowNum) -> new Member(
                        rs.getLong("member_id"),
                        rs.getString("document"),
                        rs.getString("name"),
                        rs.getString("phone"),
                        rs.getString("email"),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .optional();
    }

    @Override
    public Optional<Membership> findCurrentMembership(long memberId) {
        return jdbc.sql("""
                        SELECT membership_id, member_id, plan_id, status, start_date, end_date, created_at
                        FROM memberships
                        WHERE member_id = :memberId
                          AND plan_id IS NOT NULL
                          AND created_at IS NOT NULL
                        ORDER BY created_at DESC, membership_id DESC
                        LIMIT 1
                        """)
                .param("memberId", memberId)
                .query((rs, rowNum) -> new Membership(
                        rs.getLong("membership_id"),
                        rs.getLong("member_id"),
                        rs.getLong("plan_id"),
                        MembershipStatus.valueOf(rs.getString("status")),
                        rs.getObject("start_date", LocalDate.class),
                        rs.getObject("end_date", LocalDate.class),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .optional();
    }

    @Override
    public List<AccessAttempt> findRecentAccessAttempts(long memberId, int limit) {
        return jdbc.sql("""
                        SELECT attempt_id, member_id, result, reason, occurred_at
                        FROM access_attempts
                        WHERE member_id = :memberId
                        ORDER BY occurred_at DESC, attempt_id DESC
                        LIMIT :limit
                        """)
                .param("memberId", memberId)
                .param("limit", limit)
                .query((rs, rowNum) -> new AccessAttempt(
                        rs.getLong("attempt_id"),
                        rs.getLong("member_id"),
                        AccessResult.valueOf(rs.getString("result")),
                        rs.getString("reason"),
                        rs.getObject("occurred_at", OffsetDateTime.class)))
                .list();
    }
}
