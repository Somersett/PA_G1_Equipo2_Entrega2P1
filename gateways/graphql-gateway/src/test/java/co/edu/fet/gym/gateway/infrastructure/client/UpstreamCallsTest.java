package co.edu.fet.gym.gateway.infrastructure.client;

import co.edu.fet.gym.gateway.domain.port.Upstream;
import co.edu.fet.gym.gateway.domain.port.UpstreamRejectedException;
import co.edu.fet.gym.gateway.domain.port.UpstreamTimeoutException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Reglas de reintento y de disyuntor, sin red: el "servicio" es un Supplier que cuenta sus llamadas. */
class UpstreamCallsTest {

    private static final Upstream UPSTREAM = Upstream.GYM_PLATFORM;

    private final CircuitBreaker breaker = new CircuitBreaker();
    private final AtomicInteger calls = new AtomicInteger();

    @Test
    void aReadIsRetriedOnceWhenTheConnectionFails() {
        String result = UpstreamCalls.read(UPSTREAM, breaker, "GET /plans", () -> {
            if (calls.incrementAndGet() == 1) {
                throw refused();
            }
            return "ok";
        });

        assertThat(result).isEqualTo("ok");
        assertThat(calls).hasValue(2);
        assertThat(breaker.state()).isEqualTo(CircuitBreaker.State.CLOSED);
    }

    @Test
    void aCommandIsNeverRetried() {
        assertThatThrownBy(() -> UpstreamCalls.command(UPSTREAM, breaker, "POST /payments", counting(this::refused)))
                .isInstanceOf(UpstreamUnavailableException.class);

        assertThat(calls).as("un POST repetido podría registrar dos pagos").hasValue(1);
    }

    @Test
    void aTimeoutIsNotRetried() {
        assertThatThrownBy(() -> UpstreamCalls.read(UPSTREAM, breaker, "GET /plans", counting(() ->
                new ResourceAccessException("I/O error", new SocketTimeoutException("Read timed out")))))
                .isInstanceOf(UpstreamTimeoutException.class);

        assertThat(calls).hasValue(1);
    }

    @Test
    void consecutiveFailuresOpenTheCircuitAndLaterCallsDoNotReachTheService() {
        for (int i = 0; i < CircuitBreaker.DEFAULT_FAILURE_THRESHOLD; i++) {
            assertThatThrownBy(() -> UpstreamCalls.command(UPSTREAM, breaker, "POST /members", counting(this::refused)))
                    .isInstanceOf(UpstreamUnavailableException.class);
        }
        int before = calls.get();

        assertThatThrownBy(() -> UpstreamCalls.read(UPSTREAM, breaker, "GET /members", counting(this::refused)))
                .isInstanceOfSatisfying(UpstreamUnavailableException.class, unavailable -> {
                    assertThat(unavailable.code()).isEqualTo(UpstreamUnavailableException.CIRCUIT_OPEN);
                    assertThat(unavailable.upstream()).isEqualTo(UPSTREAM);
                });
        assertThat(calls).as("con el circuito abierto no se llama al servicio").hasValue(before);
    }

    @Test
    void answersFromTheServiceKeepTheCircuitClosedEvenIfTheyAreErrors() {
        for (int i = 0; i < CircuitBreaker.DEFAULT_FAILURE_THRESHOLD * 2; i++) {
            assertThatThrownBy(() -> UpstreamCalls.read(UPSTREAM, breaker, "GET /plans", counting(() ->
                    new UpstreamUnavailableException(UPSTREAM, "503", null, "STARTING"))))
                    .isInstanceOf(UpstreamUnavailableException.class);
            assertThatThrownBy(() -> UpstreamCalls.command(UPSTREAM, breaker, "POST /members", counting(() ->
                    new UpstreamRejectedException(409, "DOCUMENT_ALREADY_REGISTERED", "Repetido"))))
                    .isInstanceOf(UpstreamRejectedException.class);
        }

        assertThat(breaker.state()).isEqualTo(CircuitBreaker.State.CLOSED);
        assertThat(calls).as("un 5xx no se reintenta: el servicio sí respondió")
                .hasValue(CircuitBreaker.DEFAULT_FAILURE_THRESHOLD * 4);
    }

    private ResourceAccessException refused() {
        return new ResourceAccessException("I/O error", new ConnectException("Connection refused"));
    }

    private Supplier<String> counting(Supplier<? extends RuntimeException> failure) {
        return () -> {
            calls.incrementAndGet();
            throw failure.get();
        };
    }
}
