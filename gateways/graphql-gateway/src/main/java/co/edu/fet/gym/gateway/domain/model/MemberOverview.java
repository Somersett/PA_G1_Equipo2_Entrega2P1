package co.edu.fet.gym.gateway.domain.model;

/**
 * Tipo MemberOverview del esquema. {@code recentAccesses} no es un componente: se resuelve por campo
 * y solo se consulta al servicio cuando el cliente lo pide.
 */
public record MemberOverview(Member member, Membership membership) {
}
