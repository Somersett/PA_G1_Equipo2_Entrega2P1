package co.edu.fet.gym.gateway.application;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.KafkaFeed;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.Payment;
import co.edu.fet.gym.gateway.domain.model.Plan;
import co.edu.fet.gym.gateway.domain.port.GymPlatformPort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Consultas que el gateway resuelve contra Members, Memberships, Payments y Access Control. Solo valida
 * argumentos; los datos y sus reglas pertenecen a cada servicio.
 */
@Service
public class PlatformQueries {

    /** Valores por defecto y máximos de accessAttempts(limit) y kafkaEvents(limit) en el esquema. */
    public static final int DEFAULT_ACCESS_ATTEMPTS = 50;
    public static final int MAX_ACCESS_ATTEMPTS = 200;
    public static final int DEFAULT_KAFKA_EVENTS = 200;
    public static final int MAX_KAFKA_EVENTS = 500;

    private final GymPlatformPort platform;

    public PlatformQueries(GymPlatformPort platform) {
        this.platform = platform;
    }

    public List<Member> findMembers() {
        return platform.findMembers();
    }

    public List<Plan> findPlans() {
        return platform.findPlans();
    }

    public List<Membership> findMemberships() {
        return platform.findMemberships();
    }

    public Optional<Membership> findMembership(int membershipId) {
        if (membershipId < 1) {
            throw new InvalidArgumentException("id debe ser mayor o igual que 1");
        }
        return platform.findMembership(membershipId);
    }

    public List<Payment> findPayments() {
        return platform.findPayments();
    }

    /** Un {@code limit: null} explícito se trata como el valor por defecto del esquema. */
    public List<AccessAttempt> findAccessAttempts(Integer limit) {
        int effectiveLimit = limit == null ? DEFAULT_ACCESS_ATTEMPTS : limit;
        if (effectiveLimit < 1 || effectiveLimit > MAX_ACCESS_ATTEMPTS) {
            throw new InvalidArgumentException("limit debe estar entre 1 y " + MAX_ACCESS_ATTEMPTS);
        }
        return platform.findAccessAttempts(effectiveLimit);
    }

    public KafkaFeed findKafkaEvents(Integer after, Integer limit) {
        int effectiveAfter = after == null ? 0 : after;
        int effectiveLimit = limit == null ? DEFAULT_KAFKA_EVENTS : limit;
        if (effectiveAfter < 0) {
            throw new InvalidArgumentException("after debe ser mayor o igual que 0");
        }
        if (effectiveLimit < 1 || effectiveLimit > MAX_KAFKA_EVENTS) {
            throw new InvalidArgumentException("limit debe estar entre 1 y " + MAX_KAFKA_EVENTS);
        }
        return platform.findKafkaEvents(effectiveAfter, effectiveLimit);
    }
}