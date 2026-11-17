package co.edu.fet.gym.gateway.api.graphql;

import co.edu.fet.gym.gateway.application.PlatformQueries;
import co.edu.fet.gym.gateway.application.SystemStatusQueries;
import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.KafkaFeed;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.Payment;
import co.edu.fet.gym.gateway.domain.model.Plan;
import co.edu.fet.gym.gateway.domain.model.SystemStatus;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.stereotype.Controller;

import java.util.List;

/** Resolvers de las consultas sobre Members, Memberships, Payments y Access Control. */
@Controller
class PlatformQueryController {

    private final PlatformQueries queries;
    private final SystemStatusQueries systemStatus;

    PlatformQueryController(PlatformQueries queries, SystemStatusQueries systemStatus) {
        this.queries = queries;
        this.systemStatus = systemStatus;
    }

    @QueryMapping
    List<Member> members() {
        return queries.findMembers();
    }

    @QueryMapping
    List<Plan> plans() {
        return queries.findPlans();
    }

    @QueryMapping
    List<Membership> memberships() {
        return queries.findMemberships();
    }

    /** Una membresía inexistente devuelve {@code null}, como permite el tipo nullable del esquema. */
    @QueryMapping
    Membership membership(@Argument int id) {
        return queries.findMembership(id).orElse(null);
    }

    @QueryMapping
    List<Payment> payments() {
        return queries.findPayments();
    }

    @QueryMapping
    List<AccessAttempt> accessAttempts(@Argument Integer limit) {
        return queries.findAccessAttempts(limit);
    }

    /** Lo arma el gateway: responde aunque algún servicio esté caído. */
    @QueryMapping
    SystemStatus systemStatus() {
        return systemStatus.findSystemStatus();
    }

    @QueryMapping
    KafkaFeed kafkaEvents(@Argument Integer after, @Argument Integer limit) {
        return queries.findKafkaEvents(after, limit);
    }
}