package co.edu.fet.gym.gateway.infrastructure.client;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.net.URI;
import java.time.Duration;

/** Conexión con Consolidated Queries Service. La credencial es la del cliente interno del gateway. */
@Validated
@ConfigurationProperties(prefix = "gateway.consolidated-queries")
public record ConsolidatedQueriesClientProperties(
        @NotNull URI baseUrl,
        @NotBlank String username,
        @NotBlank String password,
        @NotNull Duration connectTimeout,
        @NotNull Duration readTimeout) {

    @Override
    public String toString() {
        return "ConsolidatedQueriesClientProperties[baseUrl=" + baseUrl + ", username=" + username
                + ", password=****, connectTimeout=" + connectTimeout + ", readTimeout=" + readTimeout + "]";
    }
}
