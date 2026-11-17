package co.edu.fet.gym.gateway.infrastructure.client;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class CircuitBreakerTest {

    private final MutableClock clock = new MutableClock();
    private final CircuitBreaker breaker = new CircuitBreaker(3, Duration.ofSeconds(5), clock);

    @Test
    void opensAfterTheThresholdOfConsecutiveFailures() {
        fail(2);
        assertThat(breaker.state()).isEqualTo(CircuitBreaker.State.CLOSED);
        assertThat(breaker.tryAcquire()).isTrue();

        fail(1);
        assertThat(breaker.state()).isEqualTo(CircuitBreaker.State.OPEN);
        assertThat(breaker.tryAcquire()).as("abierto: corta la llamada").isFalse();
    }

    @Test
    void aSuccessResetsTheFailureCount() {
        fail(2);
        breaker.tryAcquire();
        breaker.onSuccess();
        fail(2);

        assertThat(breaker.state()).isEqualTo(CircuitBreaker.State.CLOSED);
    }

    @Test
    void afterTheOpenPeriodOnlyOneTrialCallGoesThroughAndItsResultDecides() {
        fail(3);
        clock.advance(Duration.ofSeconds(4));
        assertThat(breaker.tryAcquire()).isFalse();

        clock.advance(Duration.ofSeconds(1));
        assertThat(breaker.tryAcquire()).as("llamada de prueba").isTrue();
        assertThat(breaker.state()).isEqualTo(CircuitBreaker.State.HALF_OPEN);
        assertThat(breaker.tryAcquire()).as("solo una llamada de prueba a la vez").isFalse();

        breaker.onFailure();
        assertThat(breaker.state()).as("la prueba falló: vuelve a abrirse").isEqualTo(CircuitBreaker.State.OPEN);
        assertThat(breaker.tryAcquire()).isFalse();

        clock.advance(Duration.ofSeconds(5));
        assertThat(breaker.tryAcquire()).isTrue();
        breaker.onSuccess();
        assertThat(breaker.state()).as("la prueba respondió: se cierra").isEqualTo(CircuitBreaker.State.CLOSED);
        assertThat(breaker.tryAcquire()).isTrue();
    }

    private void fail(int times) {
        for (int i = 0; i < times; i++) {
            assertThat(breaker.tryAcquire()).isTrue();
            breaker.onFailure();
        }
    }

    private static final class MutableClock extends Clock {

        private Instant now = Instant.parse("2026-11-11T10:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
