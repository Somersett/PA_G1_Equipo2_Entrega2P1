package co.edu.fet.gym.queries.infrastructure.kafka;

import co.edu.fet.gym.queries.application.EventProjectionService;
import co.edu.fet.gym.queries.application.ProjectionOutcome;
import co.edu.fet.gym.queries.domain.event.IntegrationEvent;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Consume los eventos que alimentan MemberOverview. Con ack-mode RECORD el offset se confirma
 * cuando este método termina, es decir, después del commit de la transacción local.
 */
@Component
class MemberOverviewEventListener {

    static final String LISTENER_ID = "member-overview-projection";

    private static final Logger log = LoggerFactory.getLogger(MemberOverviewEventListener.class);

    private final IntegrationEventParser parser;
    private final EventProjectionService projectionService;

    MemberOverviewEventListener(IntegrationEventParser parser, EventProjectionService projectionService) {
        this.parser = parser;
        this.projectionService = projectionService;
    }

    @KafkaListener(
            id = LISTENER_ID,
            idIsGroup = false,
            topics = {KafkaTopics.MEMBERS, KafkaTopics.MEMBERSHIPS, KafkaTopics.ACCESS})
    void onEvent(ConsumerRecord<String, String> record) {
        IntegrationEvent event = parser.parse(record.topic(), record.value());
        ProjectionOutcome outcome = projectionService.project(event);
        if (outcome == ProjectionOutcome.DUPLICATE) {
            log.info("Evento duplicado {} {} reconocido sin aplicar efectos ({}-{}@{})",
                    event.eventType(), event.eventId(), record.topic(), record.partition(), record.offset());
        } else {
            log.info("Evento {} {} proyectado ({}-{}@{})",
                    event.eventType(), event.eventId(), record.topic(), record.partition(), record.offset());
        }
    }
}
