package co.edu.fet.gym.queries.application;

import co.edu.fet.gym.queries.domain.event.AccessAttemptRecorded;
import co.edu.fet.gym.queries.domain.event.IntegrationEvent;
import co.edu.fet.gym.queries.domain.event.MemberRegistered;
import co.edu.fet.gym.queries.domain.event.MembershipEvent;
import co.edu.fet.gym.queries.domain.model.MembershipProjection;
import co.edu.fet.gym.queries.domain.port.MemberOverviewProjectionStore;
import co.edu.fet.gym.queries.domain.port.ProcessedEventStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Aplica un evento a la proyección MemberOverview de forma idempotente.
 *
 * <p>El registro en el inbox y el efecto sobre la proyección se confirman en la misma transacción
 * local (RNF-09). Si el eventId ya estaba registrado para este consumidor, no se aplica ningún efecto.
 */
@Service
public class EventProjectionService {

    /** consumerName del inbox. Cambiarlo haría que se reprocesen todos los eventos. */
    public static final String CONSUMER_NAME = "consolidated-queries-service";

    private static final Logger log = LoggerFactory.getLogger(EventProjectionService.class);

    private final ProcessedEventStore processedEvents;
    private final MemberOverviewProjectionStore projection;

    public EventProjectionService(ProcessedEventStore processedEvents, MemberOverviewProjectionStore projection) {
        this.processedEvents = processedEvents;
        this.projection = projection;
    }

    @Transactional
    public ProjectionOutcome project(IntegrationEvent event) {
        if (!processedEvents.registerIfAbsent(CONSUMER_NAME, event.eventId())) {
            return ProjectionOutcome.DUPLICATE;
        }
        if (event instanceof MemberRegistered registered) {
            projection.upsertMember(registered.toMember());
        } else if (event instanceof MembershipEvent membershipEvent) {
            applyMembershipEvent(membershipEvent);
        } else if (event instanceof AccessAttemptRecorded attempt) {
            if (!projection.insertAccessAttempt(attempt.toAccessAttempt())) {
                log.warn("El intento de acceso {} ya estaba proyectado; el evento {} no lo modifica",
                        attempt.attemptId(), attempt.eventId());
            }
        } else {
            throw new IllegalStateException("Tipo de evento sin proyección: " + event.eventType());
        }
        return ProjectionOutcome.APPLIED;
    }

    private void applyMembershipEvent(MembershipEvent event) {
        Optional<MembershipProjection> current = projection.findMembershipForUpdate(event.membershipId());
        if (current.isPresent()) {
            projection.updateMembership(current.get().apply(event));
        } else {
            projection.insertMembership(MembershipProjection.from(event));
        }
    }
}
