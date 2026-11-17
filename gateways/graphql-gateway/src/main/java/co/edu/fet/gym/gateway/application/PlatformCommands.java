package co.edu.fet.gym.gateway.application;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.NewMember;
import co.edu.fet.gym.gateway.domain.model.NewMembership;
import co.edu.fet.gym.gateway.domain.model.NewPayment;
import co.edu.fet.gym.gateway.domain.model.NewPlan;
import co.edu.fet.gym.gateway.domain.model.Payment;
import co.edu.fet.gym.gateway.domain.model.Plan;
import co.edu.fet.gym.gateway.domain.port.GymPlatformPort;
import org.springframework.stereotype.Service;

/**
 * Comandos que el gateway reenvía a cada servicio. Solo rechaza identificadores imposibles; las reglas de
 * negocio (documento único, una membresía abierta por miembro, monto del plan...) y la publicación de los
 * eventos Kafka siguen en el servicio dueño del dato.
 */
@Service
public class PlatformCommands {

    private final GymPlatformPort platform;

    public PlatformCommands(GymPlatformPort platform) {
        this.platform = platform;
    }

    public Member registerMember(NewMember member) {
        return platform.registerMember(member);
    }

    public Plan createPlan(NewPlan plan) {
        return platform.createPlan(plan);
    }

    public Membership createMembership(NewMembership membership) {
        requirePositive(membership.memberId(), "memberId");
        requirePositive(membership.planId(), "planId");
        return platform.createMembership(membership);
    }

    public Payment registerPayment(NewPayment payment) {
        requirePositive(payment.membershipId(), "membershipId");
        return platform.registerPayment(payment);
    }

    public AccessAttempt registerAccessAttempt(int memberId) {
        requirePositive(memberId, "memberId");
        return platform.registerAccessAttempt(memberId);
    }

    public Membership expireMembership(int membershipId) {
        requirePositive(membershipId, "id");
        return platform.expireMembership(membershipId);
    }

    private static void requirePositive(long id, String argument) {
        if (id < 1) {
            throw new InvalidArgumentException(argument + " debe ser mayor o igual que 1");
        }
    }
}