package co.edu.fet.gym.gateway.domain.model;

import java.time.OffsetDateTime;

/**
 * Mensaje leído de un tópico. {@code payload} es el JSON ya decodificado (mapas y listas) y se expone con
 * el escalar JSON; {@code raw} conserva el texto cuando el mensaje no era JSON.
 */
public record KafkaEntry(
        long seq,
        String topic,
        int partition,
        long offset,
        String key,
        OffsetDateTime timestamp,
        String eventType,
        Object payload,
        String raw) {
}