package co.edu.fet.gym.queries.domain.port;

import java.util.UUID;

/** Inbox transaccional (ProcessedEvent) con unicidad sobre consumerName + eventId. */
public interface ProcessedEventStore {

    /**
     * Registra el evento como procesado dentro de la transacción en curso.
     *
     * @return {@code false} si ese consumidor ya había procesado el evento
     */
    boolean registerIfAbsent(String consumerName, UUID eventId);
}
