package co.edu.fet.gym.queries.domain.model;

/**
 * Estados de membresía definidos en los contratos. El orden de declaración es el
 * orden del ciclo de vida: PENDING -> ACTIVE -> EXPIRED.
 */
public enum MembershipStatus {
    PENDING,
    ACTIVE,
    EXPIRED;

    public boolean isAfter(MembershipStatus other) {
        return ordinal() > other.ordinal();
    }
}
