package co.edu.fet.gym.gateway.infrastructure.client;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

/**
 * Disyuntor (circuit breaker) de un servicio. Tras {@code failureThreshold} fallos seguidos en los que el
 * servicio no respondió (conexión rechazada, red caída o timeout), deja de llamarlo durante
 * {@code openDuration}: las solicitudes fallan al instante en vez de esperar timeouts y el servicio caído no
 * recibe más carga. Pasado ese tiempo deja salir una sola llamada de prueba (semiabierto): si el servicio
 * responde, se cierra; si vuelve a fallar, se abre otra vez.
 *
 * <p>Una respuesta del servicio, aunque sea un error (4xx o 5xx), demuestra que está vivo y cuenta como éxito.
 */
final class CircuitBreaker {

    /** Fallos seguidos que abren el circuito. */
    static final int DEFAULT_FAILURE_THRESHOLD = 5;
    /** Tiempo que el circuito queda abierto antes de la llamada de prueba. */
    static final Duration DEFAULT_OPEN_DURATION = Duration.ofSeconds(5);

    enum State { CLOSED, OPEN, HALF_OPEN }

    private final int failureThreshold;
    private final Duration openDuration;
    private final Clock clock;

    private State state = State.CLOSED;
    private int consecutiveFailures;
    private Instant openedAt = Instant.MIN;
    private boolean trialInFlight;

    CircuitBreaker() {
        this(DEFAULT_FAILURE_THRESHOLD, DEFAULT_OPEN_DURATION, Clock.systemUTC());
    }

    CircuitBreaker(int failureThreshold, Duration openDuration, Clock clock) {
        if (failureThreshold < 1) {
            throw new IllegalArgumentException("failureThreshold debe ser mayor o igual que 1");
        }
        this.failureThreshold = failureThreshold;
        this.openDuration = openDuration;
        this.clock = clock;
    }

    /** {@code true} si la llamada puede salir hacia el servicio; {@code false} si el circuito la corta. */
    synchronized boolean tryAcquire() {
        return switch (state) {
            case CLOSED -> true;
            case OPEN -> {
                if (clock.instant().isBefore(openedAt.plus(openDuration))) {
                    yield false;
                }
                state = State.HALF_OPEN;
                trialInFlight = true;
                yield true;
            }
            case HALF_OPEN -> {
                if (trialInFlight) {
                    yield false;
                }
                trialInFlight = true;
                yield true;
            }
        };
    }

    /** El servicio respondió. */
    synchronized void onSuccess() {
        state = State.CLOSED;
        consecutiveFailures = 0;
        trialInFlight = false;
    }

    /** El servicio no respondió. */
    synchronized void onFailure() {
        trialInFlight = false;
        if (state == State.HALF_OPEN) {
            open();
            return;
        }
        consecutiveFailures++;
        if (consecutiveFailures >= failureThreshold) {
            open();
        }
    }

    synchronized State state() {
        return state;
    }

    private void open() {
        state = State.OPEN;
        openedAt = clock.instant();
        consecutiveFailures = 0;
    }
}
