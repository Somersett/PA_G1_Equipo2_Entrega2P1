package co.edu.fet.gym.gateway.infrastructure.security;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;

/**
 * Credencial HTTP Basic de los clientes GraphQL y orígenes CORS permitidos. Sin orígenes
 * configurados no se acepta ninguna petición entre orígenes.
 */
@Validated
@ConfigurationProperties(prefix = "gateway.security")
public record GatewaySecurityProperties(
        @NotBlank String clientUsername,
        @NotBlank @Size(min = 12, message = "debe tener al menos 12 caracteres") String clientPassword,
        List<String> corsAllowedOrigins) {

    public List<String> allowedOrigins() {
        return corsAllowedOrigins == null ? List.of()
                : corsAllowedOrigins.stream().map(String::trim).filter(origin -> !origin.isEmpty()).toList();
    }

    @Override
    public String toString() {
        return "GatewaySecurityProperties[clientUsername=" + clientUsername + ", clientPassword=****, "
                + "corsAllowedOrigins=" + allowedOrigins() + "]";
    }
}
