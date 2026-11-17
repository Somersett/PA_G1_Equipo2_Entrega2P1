package co.edu.fet.gym.gateway.infrastructure.client;

import co.edu.fet.gym.gateway.domain.port.Upstream;
import co.edu.fet.gym.gateway.domain.port.UpstreamTimeoutException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.util.Locale;
import java.util.function.Supplier;

/**
 * Tolerancia a fallos común a los clientes HTTP del gateway:
 * <ul>
 *   <li><b>Clasificación</b> de los fallos de red en indisponibilidad o timeout.</li>
 *   <li><b>Reintento</b> único de las lecturas (GET, idempotentes) cuando la conexión falla antes de obtener
 *       respuesta, por ejemplo una conexión reutilizada que el servicio ya había cerrado. Los comandos (POST)
 *       nunca se reintentan: podrían aplicarse dos veces.</li>
 *   <li><b>Disyuntor</b> ({@link CircuitBreaker}) por servicio: si el servicio deja de responder, el gateway
 *       corta las llamadas unos segundos y responde de inmediato en vez de acumular esperas.</li>
 * </ul>
 */
final class UpstreamCalls {

    private static final Logger log = LoggerFactory.getLogger(UpstreamCalls.class);
    static final Duration RETRY_DELAY = Duration.ofMillis(150);

    private UpstreamCalls() {
    }

    static <T> T read(Upstream upstream, CircuitBreaker breaker, String operation, Supplier<T> request) {
        return call(upstream, breaker, operation, 2, request);
    }

    static <T> T command(Upstream upstream, CircuitBreaker breaker, String operation, Supplier<T> request) {
        return call(upstream, breaker, operation, 1, request);
    }

    private static <T> T call(Upstream upstream, CircuitBreaker breaker, String operation, int attempts,
                              Supplier<T> request) {
        if (!breaker.tryAcquire()) {
            log.debug("{}: circuito abierto, no se llama al servicio", operation);
            throw new UpstreamUnavailableException(upstream, operation + ": circuito abierto", null,
                    UpstreamUnavailableException.CIRCUIT_OPEN);
        }
        boolean responded = true;
        try {
            return attempt(upstream, operation, attempts, request);
        } catch (UpstreamTimeoutException | NoResponseException failure) {
            responded = false;
            throw failure instanceof NoResponseException noResponse ? noResponse.unavailable : failure;
        } finally {
            if (responded) {
                breaker.onSuccess();
            } else {
                breaker.onFailure();
                if (breaker.state() == CircuitBreaker.State.OPEN) {
                    log.warn("{}: {}; el gateway deja de llamarlo por {} s", operation,
                            upstream.unavailableMessage(), CircuitBreaker.DEFAULT_OPEN_DURATION.toSeconds());
                }
            }
        }
    }

    private static <T> T attempt(Upstream upstream, String operation, int attempts, Supplier<T> request) {
        for (int attempt = 1; ; attempt++) {
            try {
                return classify(upstream, operation, request);
            } catch (NoResponseException failure) {
                if (attempt >= attempts) {
                    throw failure;
                }
                log.info("{}: la conexión falló ({}); se reintenta una vez", operation, failure.getMessage());
                pause();
            }
        }
    }

    /**
     * Clasifica los fallos de red. Un timeout al leer el cuerpo llega envuelto en RestClientException
     * (no en ResourceAccessException), por eso se inspecciona toda la cadena de causas. HttpURLConnection
     * usa SocketTimeoutException también al conectar ("Connect timed out"): no haber podido conectar es
     * indisponibilidad, no lentitud. Los errores de conversión (JSON inválido) se propagan tal cual.
     */
    private static <T> T classify(Upstream upstream, String operation, Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientException exception) {
            Throwable timeout = findCause(exception, SocketTimeoutException.class);
            if (timeout != null && !isConnectTimeout(timeout)) {
                log.warn("{}: {} ({})", operation, upstream.timeoutMessage(), timeout.getMessage());
                throw new UpstreamTimeoutException(upstream, operation + " excedió el timeout", exception);
            }
            if (exception instanceof ResourceAccessException || findCause(exception, IOException.class) != null) {
                log.warn("{}: {} ({})", operation, upstream.unavailableMessage(), exception.getMessage());
                throw new NoResponseException(new UpstreamUnavailableException(upstream,
                        operation + " no pudo completarse", exception));
            }
            throw exception;
        }
    }

    private static void pause() {
        try {
            Thread.sleep(RETRY_DELAY.toMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static Throwable findCause(Throwable exception, Class<? extends Throwable> type) {
        for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
            if (type.isInstance(cause)) {
                return cause;
            }
        }
        return null;
    }

    private static boolean isConnectTimeout(Throwable timeout) {
        String message = timeout.getMessage();
        return message != null && message.toLowerCase(Locale.ROOT).contains("connect timed out");
    }

    /**
     * Marca interna de "el servicio no respondió": distingue la falta de conexión (que cuenta para el
     * disyuntor y admite reintento) de un 5xx, en el que el servicio sí respondió.
     */
    private static final class NoResponseException extends RuntimeException {

        private final UpstreamUnavailableException unavailable;

        NoResponseException(UpstreamUnavailableException unavailable) {
            super(unavailable.getMessage(), unavailable.getCause(), false, false);
            this.unavailable = unavailable;
        }
    }
}
