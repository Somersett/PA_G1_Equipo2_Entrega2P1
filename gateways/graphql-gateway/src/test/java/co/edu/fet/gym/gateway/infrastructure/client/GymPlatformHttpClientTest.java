package co.edu.fet.gym.gateway.infrastructure.client;

import co.edu.fet.gym.gateway.domain.model.ComponentStatus;
import co.edu.fet.gym.gateway.domain.model.KafkaFeed;
import co.edu.fet.gym.gateway.domain.model.MembershipStatus;
import co.edu.fet.gym.gateway.domain.model.NewMember;
import co.edu.fet.gym.gateway.domain.model.NewPayment;
import co.edu.fet.gym.gateway.domain.port.UpstreamRejectedException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Cliente real contra un servidor HTTP local que simula el contrato REST de los servicios de la plataforma. */
class GymPlatformHttpClientTest {

    private static final String MEMBER = """
            {"id":8,"document":"1075000222","name":"Luis","phone":"3009876543","email":null,
             "createdAt":"2026-11-05T15:00:00.123Z"}""";

    private HttpServer server;
    private final AtomicReference<String> lastMethod = new AtomicReference<>();
    private final AtomicReference<String> lastUri = new AtomicReference<>();
    private final AtomicReference<String> lastBody = new AtomicReference<>();
    private final AtomicReference<String> lastAuthorization = new AtomicReference<>();
    private volatile Responder responder;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            lastMethod.set(exchange.getRequestMethod());
            lastUri.set(exchange.getRequestURI().toString());
            lastBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            lastAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            try {
                responder.respond(exchange);
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
    void listsAreMappedAndSendServiceCredentials() {
        responder = exchange -> reply(exchange, 200, "[" + MEMBER + "]");

        var members = client().findMembers();

        assertThat(members).singleElement().satisfies(member -> {
            assertThat(member.id()).isEqualTo(8);
            assertThat(member.email()).isNull();
            assertThat(member.createdAt()).isEqualTo(OffsetDateTime.parse("2026-11-05T15:00:00.123Z"));
        });
        assertThat(lastMethod.get()).isEqualTo("GET");
        assertThat(lastUri.get()).isEqualTo("/members");
        assertThat(lastAuthorization.get()).isEqualTo("Basic "
                + Base64.getEncoder().encodeToString("gateway:secret-password".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void commandsPostTheContractRequestBody() {
        responder = exchange -> reply(exchange, 201, MEMBER);

        client().registerMember(new NewMember("1075000222", "Luis", "3009876543", null));

        assertThat(lastMethod.get()).isEqualTo("POST");
        assertThat(lastUri.get()).isEqualTo("/members");
        assertThat(lastBody.get()).contains("\"document\":\"1075000222\"", "\"phone\":\"3009876543\"");
    }

    @Test
    void paymentDateIsSentAsIsoTextWithOffset() {
        responder = exchange -> reply(exchange, 201, """
                {"id":4,"membershipId":10,"amount":90000,"paidAt":"2026-11-05T14:30:00.000Z",
                 "createdAt":"2026-11-05T15:00:00.000Z"}""");

        var payment = client().registerPayment(
                new NewPayment(10, 90_000, OffsetDateTime.parse("2026-11-05T09:30:00-05:00")));

        assertThat(payment.amount()).isEqualTo(90_000);
        assertThat(lastBody.get()).contains("\"membershipId\":10", "\"paidAt\":\"2026-11-05T09:30:00-05:00\"");
    }

    @Test
    void domainRejectionKeepsTheServiceCodeAndMessage() {
        responder = exchange -> reply(exchange, 409,
                "{\"code\":\"DOCUMENT_ALREADY_REGISTERED\",\"message\":\"Ya existe un miembro con el documento 1075.\"}");

        assertThatThrownBy(() -> client().registerMember(new NewMember("1075", "Luis", "3009876543", null)))
                .isInstanceOfSatisfying(UpstreamRejectedException.class, rejected -> {
                    assertThat(rejected.status()).isEqualTo(409);
                    assertThat(rejected.code()).isEqualTo("DOCUMENT_ALREADY_REGISTERED");
                    assertThat(rejected.getMessage()).isEqualTo("Ya existe un miembro con el documento 1075.");
                });
    }

    @Test
    void missingMembershipIsEmptyButMissingRouteIsAConfigurationError() {
        responder = exchange -> reply(exchange, 404, "{\"code\":\"MEMBERSHIP_NOT_FOUND\",\"message\":\"No existe.\"}");
        assertThat(client().findMembership(5)).isEmpty();

        responder = exchange -> reply(exchange, 404, "{\"code\":\"NOT_FOUND\",\"message\":\"No existe la ruta.\"}");
        assertThatThrownBy(() -> client().findMembership(5)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void expireIsAPostWithoutBody() {
        responder = exchange -> reply(exchange, 200, """
                {"id":10,"memberId":8,"planId":1,"status":"EXPIRED","startDate":"2026-10-06",
                 "endDate":"2026-11-05","createdAt":"2026-10-06T15:00:00.000Z"}""");

        var membership = client().expireMembership(10);

        assertThat(membership.status()).isEqualTo(MembershipStatus.EXPIRED);
        assertThat(membership.endDate()).isEqualTo(LocalDate.parse("2026-11-05"));
        assertThat(lastMethod.get()).isEqualTo("POST");
        assertThat(lastUri.get()).isEqualTo("/sim/memberships/10/expire");
        assertThat(lastBody.get()).isEmpty();
    }

    @Test
    void statusAndKafkaFeedAreMapped() {
        responder = exchange -> reply(exchange, 200, """
                {"ready":false,"checkedAt":"2026-11-05T15:00:00.000Z",
                 "components":[{"id":"kafka","name":"Apache Kafka","role":"Mensajería","status":"down"},
                               {"id":"postgres","name":"PostgreSQL","role":"Bases","status":"degradado"}]}""");
        var components = client().findPlatformComponents();
        assertThat(components.get(0).status()).isEqualTo(ComponentStatus.DOWN);
        assertThat(components.get(1).status()).as("estado desconocido").isEqualTo(ComponentStatus.UNKNOWN);

        responder = exchange -> reply(exchange, 200, """
                {"lastSeq":4,"events":[{"seq":4,"topic":"members.events","partition":0,"offset":12,"key":"8",
                 "timestamp":"2026-11-05T15:00:00.000Z","eventType":"MEMBER_REGISTERED",
                 "payload":{"eventType":"MEMBER_REGISTERED","memberId":8},"raw":null}]}""");
        KafkaFeed feed = client().findKafkaEvents(3, 500);

        assertThat(lastUri.get()).isEqualTo("/sim/events?after=3&limit=500");
        assertThat(feed.events()).singleElement().satisfies(entry ->
                assertThat(entry.payload()).isEqualTo(Map.of("eventType", "MEMBER_REGISTERED", "memberId", 8)));
    }

    @Test
    void startingOrFailingServiceIsReportedAsUnavailableWithItsCode() {
        responder = exchange -> reply(exchange, 503, "{\"code\":\"STARTING\",\"message\":\"Arrancando.\"}");
        assertThatThrownBy(() -> client().findPlans())
                .isInstanceOfSatisfying(UpstreamUnavailableException.class,
                        unavailable -> assertThat(unavailable.code()).isEqualTo("STARTING"));

        responder = exchange -> reply(exchange, 500, "<html>error</html>");
        assertThatThrownBy(() -> client().findPlans())
                .isInstanceOfSatisfying(UpstreamUnavailableException.class,
                        unavailable -> assertThat(unavailable.code()).isNull());

        responder = exchange -> reply(exchange, 503, "{\"code\":\"texto libre <script>\",\"message\":\"x\"}");
        assertThatThrownBy(() -> client().findPlans())
                .isInstanceOfSatisfying(UpstreamUnavailableException.class,
                        unavailable -> assertThat(unavailable.code()).as("solo códigos con forma de constante").isNull());
    }

    @Test
    void serviceAnsweringWith5xxDoesNotOpenTheCircuit() {
        responder = exchange -> reply(exchange, 503, "{\"code\":\"DATABASE_UNAVAILABLE\",\"message\":\"x\"}");
        var client = client();

        for (int i = 0; i < CircuitBreaker.DEFAULT_FAILURE_THRESHOLD + 2; i++) {
            assertThatThrownBy(client::findPlans)
                    .isInstanceOfSatisfying(UpstreamUnavailableException.class,
                            unavailable -> assertThat(unavailable.code()).isEqualTo("DATABASE_UNAVAILABLE"));
        }
    }

    @Test
    void unreachableServiceOpensTheCircuitAndStopsBeingCalled() throws IOException {
        int closedPort;
        try (var socket = new java.net.ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        var client = client(URI.create("http://127.0.0.1:" + closedPort));

        for (int i = 0; i < CircuitBreaker.DEFAULT_FAILURE_THRESHOLD; i++) {
            assertThatThrownBy(client::findMembers)
                    .isInstanceOfSatisfying(UpstreamUnavailableException.class,
                            unavailable -> assertThat(unavailable.code()).isNull());
        }
        assertThatThrownBy(client::findMembers)
                .isInstanceOfSatisfying(UpstreamUnavailableException.class,
                        unavailable -> assertThat(unavailable.code()).isEqualTo(UpstreamUnavailableException.CIRCUIT_OPEN));
        assertThatThrownBy(() -> client.registerMember(new NewMember("1075", "Luis", "3009876543", null)))
                .as("el circuito es del servicio, no de la operación")
                .isInstanceOfSatisfying(UpstreamUnavailableException.class,
                        unavailable -> assertThat(unavailable.code()).isEqualTo(UpstreamUnavailableException.CIRCUIT_OPEN));
    }

    @Test
    void rejectedCredentialsAreAGatewayErrorNotADomainRejection() {
        responder = exchange -> reply(exchange, 401, "{\"code\":\"UNAUTHORIZED\",\"message\":\"Usuario incorrecto.\"}");

        assertThatThrownBy(() -> client().findPayments())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("401");
    }

    private GymPlatformHttpClient client() {
        return client(URI.create("http://127.0.0.1:" + server.getAddress().getPort()));
    }

    private static GymPlatformHttpClient client(URI baseUrl) {
        var properties = new GymPlatformClientProperties(baseUrl, "gateway", "secret-password",
                Duration.ofSeconds(1), Duration.ofSeconds(2));
        return new GymPlatformHttpClient(new GymPlatformClientConfig()
                .gymPlatformRestClient(RestClient.builder(), properties));
    }

    private static void reply(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    @FunctionalInterface
    private interface Responder {
        void respond(HttpExchange exchange) throws IOException;
    }
}
