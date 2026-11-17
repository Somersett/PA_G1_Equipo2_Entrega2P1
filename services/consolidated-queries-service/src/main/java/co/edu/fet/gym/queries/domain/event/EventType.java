package co.edu.fet.gym.queries.domain.event;

/** Tipos de evento de contracts/kafka/events.yaml que consume este servicio. */
public enum EventType {
    MEMBER_REGISTERED,
    MEMBERSHIP_CREATED,
    MEMBERSHIP_ACTIVATED,
    MEMBERSHIP_EXPIRED,
    ACCESS_GRANTED,
    ACCESS_DENIED
}
