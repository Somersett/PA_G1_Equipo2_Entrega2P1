package co.edu.fet.gym.queries.infrastructure.persistence;

import co.edu.fet.gym.queries.domain.model.AccessAttempt;
import co.edu.fet.gym.queries.domain.model.Member;
import co.edu.fet.gym.queries.domain.model.MembershipProjection;
import co.edu.fet.gym.queries.domain.model.MembershipStatus;
import co.edu.fet.gym.queries.domain.port.MemberOverviewProjectionStore;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Optional;

@Repository
class JdbcMemberOverviewProjectionStore implements MemberOverviewProjectionStore {

    private final JdbcClient jdbc;

    JdbcMemberOverviewProjectionStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void upsertMember(Member member) {
        jdbc.sql("""
                        INSERT INTO members (member_id, document, name, phone, email, created_at, updated_at)
                        VALUES (:memberId, :document, :name, :phone, :email, :createdAt, now())
                        ON CONFLICT (member_id) DO UPDATE SET
                            document = EXCLUDED.document,
                            name = EXCLUDED.name,
                            phone = EXCLUDED.phone,
                            email = EXCLUDED.email,
                            created_at = EXCLUDED.created_at,
                            updated_at = now()
                        """)
                .param("memberId", member.id())
                .param("document", member.document())
                .param("name", member.name())
                .param("phone", member.phone())
                .param("email", member.email(), Types.VARCHAR)
                .param("createdAt", member.createdAt())
                .update();
    }

    @Override
    public Optional<MembershipProjection> findMembershipForUpdate(long membershipId) {
        return jdbc.sql("""
                        SELECT membership_id, member_id, plan_id, status, start_date, end_date, created_at
                        FROM memberships
                        WHERE membership_id = :membershipId
                        FOR UPDATE
                        """)
                .param("membershipId", membershipId)
                .query((rs, rowNum) -> new MembershipProjection(
                        rs.getLong("membership_id"),
                        rs.getLong("member_id"),
                        rs.getObject("plan_id", Long.class),
                        MembershipStatus.valueOf(rs.getString("status")),
                        rs.getObject("start_date", LocalDate.class),
                        rs.getObject("end_date", LocalDate.class),
                        rs.getObject("created_at", OffsetDateTime.class)))
                .optional();
    }

    @Override
    public void insertMembership(MembershipProjection membership) {
        jdbc.sql("""
                        INSERT INTO memberships
                            (membership_id, member_id, plan_id, status, start_date, end_date, created_at, updated_at)
                        VALUES
                            (:membershipId, :memberId, :planId, :status, :startDate, :endDate, :createdAt, now())
                        """)
                .param("membershipId", membership.membershipId())
                .param("memberId", membership.memberId())
                .param("planId", membership.planId(), Types.BIGINT)
                .param("status", membership.status().name())
                .param("startDate", membership.startDate(), Types.DATE)
                .param("endDate", membership.endDate(), Types.DATE)
                .param("createdAt", membership.createdAt(), Types.TIMESTAMP_WITH_TIMEZONE)
                .update();
    }

    @Override
    public void updateMembership(MembershipProjection membership) {
        jdbc.sql("""
                        UPDATE memberships SET
                            plan_id = :planId,
                            status = :status,
                            start_date = :startDate,
                            end_date = :endDate,
                            created_at = :createdAt,
                            updated_at = now()
                        WHERE membership_id = :membershipId
                        """)
                .param("membershipId", membership.membershipId())
                .param("planId", membership.planId(), Types.BIGINT)
                .param("status", membership.status().name())
                .param("startDate", membership.startDate(), Types.DATE)
                .param("endDate", membership.endDate(), Types.DATE)
                .param("createdAt", membership.createdAt(), Types.TIMESTAMP_WITH_TIMEZONE)
                .update();
    }

    @Override
    public boolean insertAccessAttempt(AccessAttempt attempt) {
        int inserted = jdbc.sql("""
                        INSERT INTO access_attempts (attempt_id, member_id, result, reason, occurred_at)
                        VALUES (:attemptId, :memberId, :result, :reason, :occurredAt)
                        ON CONFLICT (attempt_id) DO NOTHING
                        """)
                .param("attemptId", attempt.attemptId())
                .param("memberId", attempt.memberId())
                .param("result", attempt.result().name())
                .param("reason", attempt.reason())
                .param("occurredAt", attempt.occurredAt())
                .update();
        return inserted == 1;
    }
}
