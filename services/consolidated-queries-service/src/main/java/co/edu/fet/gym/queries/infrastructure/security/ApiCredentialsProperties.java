package co.edu.fet.gym.queries.infrastructure.security;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Credencial HTTP Basic del cliente interno (GraphQL Gateway). Se inyecta por variables de entorno;
 * el servicio no arranca si falta.
 */
@Validated
@ConfigurationProperties(prefix = "queries.api")
public record ApiCredentialsProperties(
        @NotBlank String username,
        @NotBlank @Size(min = 12, message = "debe tener al menos 12 caracteres") String password) {

    @Override
    public String toString() {
        return "ApiCredentialsProperties[username=" + username + ", password=****]";
    }
}
