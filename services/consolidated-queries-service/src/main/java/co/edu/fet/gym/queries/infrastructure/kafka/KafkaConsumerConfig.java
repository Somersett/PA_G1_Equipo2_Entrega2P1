package co.edu.fet.gym.queries.infrastructure.kafka;

import co.edu.fet.gym.queries.domain.event.InvalidEventException;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

/**
 * Política provisional de errores del consumidor, mientras el equipo define reintentos y
 * dead-letter topics (pendiente en events.yaml):
 * <ul>
 *   <li>Fallos transitorios (base de datos caída, carreras de inserción): se reintenta sin límite con
 *       espera exponencial de 1 s a 30 s. El consumidor (un único hilo para los tres tópicos) se
 *       detiene hasta que el fallo desaparece, pero no se pierde ningún evento ni se altera el orden.
 *       Por eso el parser rechaza como inválido todo valor que la base rechazaría siempre.</li>
 *   <li>{@link InvalidEventException}: reintentar no cambia nada. Se registra en ERROR con su
 *       ubicación (tópico, partición, offset) y se confirma el offset sin aplicar efectos.</li>
 * </ul>
 */
@Configuration
class KafkaConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(KafkaConsumerConfig.class);

    @Bean
    DefaultErrorHandler kafkaErrorHandler() {
        ExponentialBackOff backOff = new ExponentialBackOff(1_000L, 2.0);
        backOff.setMaxInterval(30_000L);
        DefaultErrorHandler handler = new DefaultErrorHandler(KafkaConsumerConfig::discardInvalidEvent, backOff);
        handler.addNotRetryableExceptions(InvalidEventException.class);
        return handler;
    }

    private static void discardInvalidEvent(ConsumerRecord<?, ?> record, Exception exception) {
        log.error("Evento descartado sin aplicar efectos ({}-{}@{}): {}",
                record.topic(), record.partition(), record.offset(),
                NestedExceptionUtils.getMostSpecificCause(exception).getMessage());
    }
}
