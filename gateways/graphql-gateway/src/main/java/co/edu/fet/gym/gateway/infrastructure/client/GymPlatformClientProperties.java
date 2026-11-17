package co.edu.fet.gym.gateway.infrastructure.client;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.net.URI;
import java.time.Duration;

/**
 * Conexión con Members, Memberships, Payments y Access Control (hoy, el simulador que implementa su contrato
 * REST). La credencial es la que esos servicios exigen en sus operaciones administrativas.
 */
@Validated
@ConfigurationProperties(prefix = "gateway.gym-platform")
public record GymPlatformClientProperties(
        @NotNull URI baseUrl,
        @NotBlank String username,
        @NotBlank String password,
        @NotNull Duration connectTimeout,
        @NotNull Duration readTimeout) {

    @Override
    public String toString() {
        return "GymPlatformClientProperties[baseUrl=" + baseUrl + ", username=" + username
                + ", password=****, connectTimeout=" + connectTimeout + ", readTimeout=" + readTimeout + "]";
    }
}