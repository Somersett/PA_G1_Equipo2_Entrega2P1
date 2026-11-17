package co.edu.fet.gym.gateway.infrastructure.client;

import co.edu.fet.gym.gateway.domain.model.AccessResult;
import co.edu.fet.gym.gateway.domain.model.MemberOverview;
import co.edu.fet.gym.gateway.domain.model.MembershipStatus;
import co.edu.fet.gym.gateway.domain.port.UpstreamTimeoutException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Cliente real contra un servidor HTTP local (com.sun.net.httpserver) que simula al servicio de consultas. */
class ConsolidatedQueriesHttpClientTest {

    private static final String OVERVIEW = """
            {"member":{"id":7,"document":"1075","name":"Ana","phone":"300","email":null,"createdAt":"2026-10-01T08:00:00Z"},
             "membership":{"id":10,"memberId":7,"planId":3,"status":"ACTIVE","startDate":"2026-10-01",
                           "endDate":"2026-10-31","createdAt":"2026-10-01T08:00:00Z"}}""";

    private HttpServer server;
    private final AtomicReference<HttpExchange> lastRequest = new AtomicReference<>();
    private volatile Responder responder;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            lastRequest.set(exchange);
            try {
                responder.respond(exchange);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void mapsOverviewAndSendsServiceCredentials() {
        responder = exchange -> reply(exchange, 200, OVERVIEW);

        MemberOverview overview = client(Duration.ofSeconds(2)).findMemberOverview(7).orElseThrow();

        assertThat(overview.member().name()).isEqualTo("Ana");
        assertThat(overview.member().email()).isNull();
        assertThat(overview.membership().status()).isEqualTo(MembershipStatus.ACTIVE);
        assertThat(overview.membership().endDate()).isEqualTo(LocalDate.parse("2026-10-31"));
        assertThat(lastRequest.get().getRequestURI().getPath()).isEqualTo("/member-overviews/7");
        assertThat(lastRequest.get().getRequestHeaders().getFirst("Authorization")).isEqualTo("Basic "
                + Base64.getEncoder().encodeToString("gateway:secret-password".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void mapsRecentAccessesAndForwardsLimit() {
        responder = exchange -> reply(exchange, 200, """
                [{"attemptId":5,"memberId":7,"result":"ACCESS_DENIED","reason":"MEMBERSHIP_EXPIRED",
                  "occurredAt":"2026-10-02T07:30:00-05:00"}]""");

        var accesses = client(Duration.ofSeconds(2)).findRecentAccesses(7, 3);

        assertThat(accesses).singleElement().satisfies(attempt -> {
            assertThat(attempt.result()).isEqualTo(AccessResult.ACCESS_DENIED);
            assertThat(attempt.occurredAt()).isEqualTo(OffsetDateTime.parse("2026-10-02T07:30:00-05:00"));
        });
        assertThat(lastRequest.get().getRequestURI().toString()).isEqualTo("/member-overviews/7/recent-accesses?limit=3");
    }

    @Test
    void notFoundMeansNoProjection() {
        responder = exchange -> reply(exchange, 404, "{\"code\":\"MEMBER_NOT_FOUND\",\"message\":\"x\"}");

        assertThat(client(Duration.ofSeconds(2)).findMemberOverview(7)).isEmpty();
        assertThat(client(Duration.ofSeconds(2)).findRecentAccesses(7, 10)).isEmpty();
    }

    @Test
    void notFoundWithoutMemberNotFoundCodeIsAConfigurationError() {
        responder = exchange -> reply(exchange, 404, "<html>Not Found</html>");

        assertThatThrownBy(() -> client(Duration.ofSeconds(2)).findMemberOverview(7))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("/member-overviews/7");
    }

    @Test
    void credentialsAreSentInUtf8() {
        responder = exchange -> reply(exchange, 200, OVERVIEW);
        var properties = new ConsolidatedQueriesClientProperties(
                URI.create("http://127.0.0.1:" + server.getAddress().getPort()), "gateway", "contraseña-interna",
                Duration.ofSeconds(1), Duration.ofSeconds(2));
        var client = new ConsolidatedQueriesHttpClient(new ConsolidatedQueriesClientConfig()
                .consolidatedQueriesRestClient(RestClient.builder(), properties));

        client.findMemberOverview(7);

        String header = lastRequest.get().getRequestHeaders().getFirst("Authorization");
        assertThat(new String(Base64.getDecoder().decode(header.substring("Basic ".length())), StandardCharsets.UTF_8))
                .isEqualTo("gateway:contraseña-interna");
    }

    @Test
    void serverErrorIsReportedAsUnavailable() {
        responder = exchange -> reply(exchange, 503, "{}");

        assertThatThrownBy(() -> client(Duration.ofSeconds(2)).findMemberOverview(7))
                .isInstanceOf(UpstreamUnavailableException.class);
    }

    @Test
    void rejectedCredentialsAreAGatewayErrorNotAnOutage() {
        responder = exchange -> reply(exchange, 401, "{\"code\":\"UNAUTHORIZED\"}");

        assertThatThrownBy(() -> client(Duration.ofSeconds(2)).findMemberOverview(7))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("401");
    }

    @Test
    void responseWithoutRequiredFieldIsRejected() {
        responder = exchange -> reply(exchange, 200, "{\"member\":{\"id\":7},\"membership\":null}");

        assertThatThrownBy(() -> client(Duration.ofSeconds(2)).findMemberOverview(7))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("member.document");
    }

    @Test
    @Timeout(10)
    void slowResponseExceedsReadTimeout() {
        responder = exchange -> {
            Thread.sleep(3_000);
            reply(exchange, 200, OVERVIEW);
        };

        assertThatThrownBy(() -> client(Duration.ofMillis(300)).findMemberOverview(7))
                .isInstanceOf(UpstreamTimeoutException.class);
    }

    @Test
    @Timeout(10)
    void bodyStalledAfterHeadersExceedsReadTimeout() {
        responder = exchange -> {
            byte[] body = OVERVIEW.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            OutputStream out = exchange.getResponseBody();
            out.write(body, 0, 10);
            out.flush();
            Thread.sleep(3_000);
            out.write(body, 10, body.length - 10);
        };

        assertThatThrownBy(() -> client(Duration.ofMillis(300)).findMemberOverview(7))
                .isInstanceOf(UpstreamTimeoutException.class);
    }

    @Test
    void refusedConnectionIsReportedAsUnavailable() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        var client = client(URI.create("http://127.0.0.1:" + closedPort), Duration.ofSeconds(2));

        assertThatThrownBy(() -> client.findMemberOverview(7)).isInstanceOf(UpstreamUnavailableException.class);
    }

    private ConsolidatedQueriesHttpClient client(Duration readTimeout) {
        return client(URI.create("http://127.0.0.1:" + server.getAddress().getPort()), readTimeout);
    }

    private static ConsolidatedQueriesHttpClient client(URI baseUrl, Duration readTimeout) {
        var properties = new ConsolidatedQueriesClientProperties(baseUrl, "gateway", "secret-password",
                Duration.ofSeconds(1), readTimeout);
        RestClient restClient = new ConsolidatedQueriesClientConfig()
                .consolidatedQueriesRestClient(RestClient.builder(), properties);
        return new ConsolidatedQueriesHttpClient(restClient);
    }

    private static void reply(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    @FunctionalInterface
    private interface Responder {
        void respond(HttpExchange exchange) throws IOException, InterruptedException;
    }
}
