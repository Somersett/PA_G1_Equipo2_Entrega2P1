package co.edu.fet.gym.gateway.infrastructure.graphql;

import graphql.analysis.MaxQueryComplexityInstrumentation;
import graphql.analysis.MaxQueryDepthInstrumentation;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.graphql.execution.RuntimeWiringConfigurer;

@Configuration
class GraphQlConfig {

    @Bean
    RuntimeWiringConfigurer isoDateScalars() {
        return wiring -> wiring.scalar(IsoDateScalars.DATE_TIME).scalar(IsoDateScalars.DATE).scalar(JsonScalar.JSON);
    }

    @Bean
    MaxQueryDepthInstrumentation maxQueryDepthInstrumentation(GraphQlLimitsProperties limits) {
        return new MaxQueryDepthInstrumentation(limits.maxQueryDepth());
    }

    /** Los campos de introspección (__schema, __type...) no cuentan: GraphiQL y las herramientas siguen funcionando. */
    @Bean
    MaxQueryComplexityInstrumentation maxQueryComplexityInstrumentation(GraphQlLimitsProperties limits) {
        return new MaxQueryComplexityInstrumentation(limits.maxQueryComplexity(), (environment, childComplexity) ->
                environment.getField().getName().startsWith("__")
                        || environment.getParentType().getName().startsWith("__") ? 0 : 1 + childComplexity);
    }
}
