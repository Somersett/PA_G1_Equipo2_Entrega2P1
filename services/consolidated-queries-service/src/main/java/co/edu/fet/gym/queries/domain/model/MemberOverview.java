package co.edu.fet.gym.queries.domain.model;

/** Vista consolidada sin los accesos recientes, que se consultan aparte con su propio límite. */
public record MemberOverview(Member member, Membership membership) {
}
