package co.edu.fet.gym.gateway;

import co.edu.fet.gym.gateway.domain.port.ConsolidatedQueriesPort;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * GraphiQL solo existe con el perfil "local" y sigue protegido por HTTP Basic. Que esté desactivado
 * sin perfil lo comprueba GraphQlGatewayHttpTest#requiresCredentialsAndExposesOnlyHealth.
 */
@ActiveProfiles("local")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "gateway.security.client-username=admin-test",
        "gateway.security.client-password=admin-password-123",
        "gateway.consolidated-queries.username=unused",
        "gateway.consolidated-queries.password=unused",
        "gateway.gym-platform.username=unused",
        "gateway.gym-platform.password=unused"})
class GraphiQlLocalProfileTest {

    private static final String AUTH = "Basic " + Base64.getEncoder()
            .encodeToString("admin-test:admin-password-123".getBytes(StandardCharsets.UTF_8));

    @LocalServerPort
    int port;

    @MockitoBean
    ConsolidatedQueriesPort consolidatedQueries;

    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

    @Test
    void graphiqlRequiresBasicAuthentication() throws Exception {
        HttpResponse<String> anonymous = get("/graphiql?path=/graphql", null);

        assertThat(anonymous.statusCode()).isEqualTo(401);
        assertThat(anonymous.headers().firstValue("WWW-Authenticate"))
                .hasValueSatisfying(value -> assertThat(value).startsWith("Basic"));
        assertThat(anonymous.body()).doesNotContain("graphiql@");
    }

    @Test
    void graphiqlIsServedToAuthenticatedUsersPointingToTheSameOriginEndpoint() throws Exception {
        HttpResponse<String> redirect = get("/graphiql", AUTH);
        assertThat(redirect.statusCode()).isBetween(300, 399);
        assertThat(redirect.headers().firstValue("Location"))
                .hasValueSatisfying(location -> assertThat(location).contains("path=/graphql"));

        HttpResponse<String> page = get("/graphiql?path=/graphql", AUTH);
        assertThat(page.statusCode()).isEqualTo(200);
        assertThat(page.headers().firstValue("Content-Type"))
                .hasValueSatisfying(type -> assertThat(type).startsWith("text/html"));
        assertThat(page.body()).contains("https://esm.sh/graphiql@5.2.4", "integrity=\"sha384-");
        assertThat(page.headers().firstValue("X-Frame-Options")).contains("DENY");
        assertThat(page.headers().firstValue("X-Content-Type-Options")).contains("nosniff");
    }

    @Test
    void graphqlEndpointKeepsWorkingUnderTheLocalProfile() throws Exception {
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(uri("/graphql"))
                .header("Authorization", AUTH)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"query\":\"{ __schema { queryType { name } } }\"}"))
                .build(), HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"name\":\"Query\"");
    }

    private HttpResponse<String> get(String path, String authorization) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri(path)).GET();
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }
}
