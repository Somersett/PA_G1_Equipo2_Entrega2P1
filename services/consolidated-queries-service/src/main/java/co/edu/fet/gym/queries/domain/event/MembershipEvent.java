package co.edu.fet.gym.queries.domain.event;

public sealed interface MembershipEvent extends IntegrationEvent
        permits MembershipCreated, MembershipActivated, MembershipExpired {

    long membershipId();

    long memberId();
}
