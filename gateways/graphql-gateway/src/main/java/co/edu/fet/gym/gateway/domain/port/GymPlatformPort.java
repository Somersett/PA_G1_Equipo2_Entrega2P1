package co.edu.fet.gym.gateway.domain.port;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.KafkaFeed;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.NewMember;
import co.edu.fet.gym.gateway.domain.model.NewMembership;
import co.edu.fet.gym.gateway.domain.model.NewPayment;
import co.edu.fet.gym.gateway.domain.model.NewPlan;
import co.edu.fet.gym.gateway.domain.model.Payment;
import co.edu.fet.gym.gateway.domain.model.Plan;
import co.edu.fet.gym.gateway.domain.model.SystemComponent;

import java.util.List;
import java.util.Optional;

/**
 * Operaciones de Members, Memberships, Payments y Access Control (contracts/openapi/gym-platform-api.yaml),
 * más las extensiones del simulador que usa el panel: intentos recientes, estado de sus componentes, visor
 * de Kafka y vencimiento anticipado. Las implementaciones lanzan {@link UpstreamRejectedException} cuando el
 * servicio rechaza la operación, y {@link UpstreamUnavailableException} o {@link UpstreamTimeoutException}
 * ante fallos de red.
 */
public interface GymPlatformPort {

    List<Member> findMembers();

    List<Plan> findPlans();

    List<Membership> findMemberships();

    Optional<Membership> findMembership(long membershipId);

    List<Payment> findPayments();

    List<AccessAttempt> findAccessAttempts(int limit);

    /** Estado que informan los servicios de la plataforma: ellos mismos, Kafka y PostgreSQL. */
    List<SystemComponent> findPlatformComponents();

    KafkaFeed findKafkaEvents(long after, int limit);

    Member registerMember(NewMember member);

    Plan createPlan(NewPlan plan);

    Membership createMembership(NewMembership membership);

    Payment registerPayment(NewPayment payment);

    AccessAttempt registerAccessAttempt(long memberId);

    Membership expireMembership(long membershipId);
}