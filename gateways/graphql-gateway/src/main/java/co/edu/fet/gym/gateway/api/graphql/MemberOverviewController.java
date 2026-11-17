package co.edu.fet.gym.gateway.api.graphql;

import co.edu.fet.gym.gateway.application.MemberOverviewQueries;
import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.MemberOverview;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import org.springframework.stereotype.Controller;

import java.util.List;

/**
 * Resolvers de {@code Query.member} y {@code MemberOverview.recentAccesses}. Cada campo llama al
 * servicio solo si el cliente lo selecciona. Como la raíz devuelve un único MemberOverview, no hay
 * patrón N+1 que agrupar.
 */
@Controller
class MemberOverviewController {

    private final MemberOverviewQueries queries;

    MemberOverviewController(MemberOverviewQueries queries) {
        this.queries = queries;
    }

    /** Un miembro sin proyección devuelve {@code null}, como permite el tipo nullable del contrato. */
    @QueryMapping
    MemberOverview member(@Argument int id) {
        return queries.findMemberOverview(id).orElse(null);
    }

    @SchemaMapping(typeName = "MemberOverview", field = "recentAccesses")
    List<AccessAttempt> recentAccesses(MemberOverview overview, @Argument Integer limit) {
        return queries.findRecentAccesses(overview.member().id(), limit);
    }
}
