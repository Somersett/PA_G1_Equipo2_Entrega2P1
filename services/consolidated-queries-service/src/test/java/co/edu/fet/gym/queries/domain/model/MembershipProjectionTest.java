package co.edu.fet.gym.queries.domain.model;

import co.edu.fet.gym.queries.domain.event.InvalidEventException;
import co.edu.fet.gym.queries.domain.event.MembershipActivated;
import co.edu.fet.gym.queries.domain.event.MembershipCreated;
import co.edu.fet.gym.queries.domain.event.MembershipExpired;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MembershipProjectionTest {

    private static final OffsetDateTime CREATED_AT = OffsetDateTime.parse("2026-10-01T08:00:00Z");
    private static final LocalDate START = LocalDate.parse("2026-10-02");
    private static final LocalDate END = LocalDate.parse("2026-11-01");

    @Test
    void createdEventProducesCompletePendingMembership() {
        MembershipProjection projection = MembershipProjection.from(created());

        assertThat(projection.status()).isEqualTo(MembershipStatus.PENDING);
        assertThat(projection.toMembership()).contains(
                new Membership(10, 1, 3, MembershipStatus.PENDING, null, null, CREATED_AT));
    }

    @Test
    void activationAndExpirationAdvanceTheLifecycle() {
        MembershipProjection active = MembershipProjection.from(created()).apply(activated());
        assertThat(active.status()).isEqualTo(MembershipStatus.ACTIVE);
        assertThat(active.startDate()).isEqualTo(START);
        assertThat(active.endDate()).isEqualTo(END);

        MembershipProjection expired = active.apply(expired());
        assertThat(expired.status()).isEqualTo(MembershipStatus.EXPIRED);
        assertThat(expired.startDate()).isEqualTo(START);
        assertThat(expired.endDate()).isEqualTo(END);
    }

    @Test
    void activationBeforeCreationStaysHiddenUntilCreationArrives() {
        MembershipProjection early = MembershipProjection.from(activated());
        assertThat(early.status()).isEqualTo(MembershipStatus.ACTIVE);
        assertThat(early.isComplete()).isFalse();
        assertThat(early.toMembership()).isEmpty();

        MembershipProjection completed = early.apply(created());
        assertThat(completed.status()).as("MEMBERSHIP_CREATED atrasado no retrocede el estado")
                .isEqualTo(MembershipStatus.ACTIVE);
        assertThat(completed.toMembership()).contains(
                new Membership(10, 1, 3, MembershipStatus.ACTIVE, START, END, CREATED_AT));
    }

    @Test
    void lateActivationDoesNotReactivateAnExpiredMembership() {
        MembershipProjection projection = MembershipProjection.from(created()).apply(expired()).apply(activated());

        assertThat(projection.status()).isEqualTo(MembershipStatus.EXPIRED);
        assertThat(projection.startDate()).isEqualTo(START);
    }

    @Test
    void expirationEndDateWinsRegardlessOfArrivalOrder() {
        LocalDate expiredOn = END.minusDays(5);
        var expiredEarly = new MembershipExpired(UUID.randomUUID(), CREATED_AT.plusDays(26), 10, 1, expiredOn);

        MembershipProjection inOrder = MembershipProjection.from(created()).apply(activated()).apply(expiredEarly);
        MembershipProjection reversed = MembershipProjection.from(created()).apply(expiredEarly).apply(activated());

        assertThat(reversed).isEqualTo(inOrder);
        assertThat(reversed.endDate()).isEqualTo(expiredOn);
    }

    @Test
    void eventThatMovesMembershipToAnotherMemberIsRejected() {
        MembershipProjection projection = MembershipProjection.from(created());
        var otherMember = new MembershipActivated(UUID.randomUUID(), CREATED_AT, 10, 2, START, END);

        assertThatThrownBy(() -> projection.apply(otherMember))
                .isInstanceOf(InvalidEventException.class)
                .hasMessageContaining("miembro 2");
    }

    private static MembershipCreated created() {
        return new MembershipCreated(UUID.randomUUID(), CREATED_AT, 10, 1, 3);
    }

    private static MembershipActivated activated() {
        return new MembershipActivated(UUID.randomUUID(), CREATED_AT.plusDays(1), 10, 1, START, END);
    }

    private static MembershipExpired expired() {
        return new MembershipExpired(UUID.randomUUID(), CREATED_AT.plusDays(31), 10, 1, END);
    }
}
