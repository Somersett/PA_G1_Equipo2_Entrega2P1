package co.edu.fet.gym.gateway.api.graphql;

import co.edu.fet.gym.gateway.application.PlatformCommands;
import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.NewMember;
import co.edu.fet.gym.gateway.domain.model.NewMembership;
import co.edu.fet.gym.gateway.domain.model.NewPayment;
import co.edu.fet.gym.gateway.domain.model.NewPlan;
import co.edu.fet.gym.gateway.domain.model.Payment;
import co.edu.fet.gym.gateway.domain.model.Plan;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.stereotype.Controller;

/** Resolvers de las mutaciones. Los tipos input del esquema se enlazan a los records del dominio. */
@Controller
class PlatformMutationController {

    private final PlatformCommands commands;

    PlatformMutationController(PlatformCommands commands) {
        this.commands = commands;
    }

    @MutationMapping
    Member registerMember(@Argument NewMember input) {
        return commands.registerMember(input);
    }

    @MutationMapping
    Plan createPlan(@Argument NewPlan input) {
        return commands.createPlan(input);
    }

    @MutationMapping
    Membership createMembership(@Argument NewMembership input) {
        return commands.createMembership(input);
    }

    @MutationMapping
    Payment registerPayment(@Argument NewPayment input) {
        return commands.registerPayment(input);
    }

    @MutationMapping
    AccessAttempt registerAccessAttempt(@Argument int memberId) {
        return commands.registerAccessAttempt(memberId);
    }

    @MutationMapping
    Membership expireMembership(@Argument int id) {
        return commands.expireMembership(id);
    }
}