package co.edu.fet.gym.queries.infrastructure.persistence;

import co.edu.fet.gym.queries.domain.port.ProcessedEventStore;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
class JdbcProcessedEventStore implements ProcessedEventStore {

    private final JdbcClient jdbc;

    JdbcProcessedEventStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * ON CONFLICT DO NOTHING resuelve también las reentregas simultáneas: la segunda transacción
     * espera al índice único y, si la primera confirma, no inserta nada.
     */
    @Override
    public boolean registerIfAbsent(String consumerName, UUID eventId) {
        int inserted = jdbc.sql("""
                        INSERT INTO processed_events (consumer_name, event_id, processed_at)
                        VALUES (:consumerName, :eventId, now())
                        ON CONFLICT (consumer_name, event_id) DO NOTHING
                        """)
                .param("consumerName", consumerName)
                .param("eventId", eventId)
                .update();
        return inserted == 1;
    }
}
