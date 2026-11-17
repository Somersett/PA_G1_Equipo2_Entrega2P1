package co.edu.fet.gym.gateway.infrastructure.graphql;

import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Límites de profundidad y complejidad por operación, para acotar las llamadas al servicio de consultas. */
@Validated
@ConfigurationProperties(prefix = "gateway.graphql")
public record GraphQlLimitsProperties(@Min(1) int maxQueryDepth, @Min(1) int maxQueryComplexity) {
}
