package co.edu.fet.gym.queries.domain.event;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Sobre común de los eventos Kafka (version 1). */
public sealed interface IntegrationEvent permits MemberRegistered, MembershipEvent, AccessAttemptRecorded {

    UUID eventId();

    EventType eventType();

    OffsetDateTime occurredAt();
}
