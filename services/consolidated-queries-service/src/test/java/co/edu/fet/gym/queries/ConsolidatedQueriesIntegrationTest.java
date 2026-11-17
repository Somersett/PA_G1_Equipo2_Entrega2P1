package co.edu.fet.gym.queries;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.kafka.core.KafkaTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Integración real: PostgreSQL 16 y Kafka 3.9 (mismas imágenes que infrastructure/docker-compose.yml),
 * eventos publicados en Kafka y verificación por la API HTTP con autenticación.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "queries.api.username=gateway-test",
        "queries.api.password=test-password-123"})
class ConsolidatedQueriesIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine"));

    @Container
    @ServiceConnection
    static final KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("apache/kafka:3.9.1"));

    private static final AtomicLong IDS = new AtomicLong(1000);
    private static final String AUTH = "Basic " + Base64.getEncoder()
            .encodeToString("gateway-test:test-password-123".getBytes(StandardCharsets.UTF_8));

    @LocalServerPort
    int port;

    @Autowired
    KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    JsonMapper jsonMapper;

    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    void buildsMemberOverviewFromEventsAndServesIt() throws Exception {
        long memberId = IDS.incrementAndGet();
        long membershipId = IDS.incrementAndGet();
        publishMember(UUID.randomUUID(), memberId, "Ana Ruiz");
        publishMembershipCreated(memberId, membershipId, "2026-10-01T08:00:00Z");
        publish("memberships.events", memberId, envelope(UUID.randomUUID(), "MEMBERSHIP_ACTIVATED", "2026-10-01T09:00:00Z")
                + ",\"membershipId\":" + membershipId + ",\"memberId\":" + memberId
                + ",\"status\":\"ACTIVE\",\"startDate\":\"2026-10-01\",\"endDate\":\"2026-10-31\"}");
        long firstAttempt = IDS.incrementAndGet();
        long secondAttempt = IDS.incrementAndGet();
        publishAccess(memberId, firstAttempt, "ACCESS_DENIED", "2026-10-01T07:00:00Z");
        publishAccess(memberId, secondAttempt, "ACCESS_GRANTED", "2026-10-01T10:00:00Z");

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            JsonNode overview = getJson("/member-overviews/" + memberId, 200);
            assertThat(overview.at("/member/name").stringValue()).isEqualTo("Ana Ruiz");
            assertThat(overview.at("/member/email").isNull()).isTrue();
            assertThat(overview.at("/membership/status").stringValue()).isEqualTo("ACTIVE");
            assertThat(getJson("/member-overviews/" + memberId + "/recent-accesses", 200).size()).isEqualTo(2);
        });

        JsonNode overview = getJson("/member-overviews/" + memberId, 200);
        assertThat(overview.at("/membership/id").longValue()).isEqualTo(membershipId);
        assertThat(overview.at("/membership/planId").longValue()).isEqualTo(3);
        assertThat(overview.at("/membership/startDate").stringValue()).isEqualTo("2026-10-01");
        assertThat(overview.at("/membership/endDate").stringValue()).isEqualTo("2026-10-31");
        assertThat(overview.at("/membership/createdAt").stringValue()).isEqualTo("2026-10-01T08:00:00Z");

        JsonNode accesses = getJson("/member-overviews/" + memberId + "/recent-accesses?limit=1", 200);
        assertThat(accesses.size()).isEqualTo(1);
        assertThat(accesses.get(0).get("attemptId").longValue()).as("el más reciente primero").isEqualTo(secondAttempt);
        assertThat(accesses.get(0).get("result").stringValue()).isEqualTo("ACCESS_GRANTED");
        assertThat(accesses.get(0).get("occurredAt").stringValue()).isEqualTo("2026-10-01T10:00:00Z");
    }

    @Test
    void duplicatedEventIdIsAcknowledgedWithoutApplyingItsEffectsTwice() throws Exception {
        long memberId = IDS.incrementAndGet();
        UUID eventId = UUID.randomUUID();
        publishMember(eventId, memberId, "Nombre original");
        publishMember(eventId, memberId, "Nombre del duplicado");
        long markerMember = IDS.incrementAndGet();
        publishMember(UUID.randomUUID(), markerMember, "Marcador");

        // Mismo tópico y misma clave de partición: cuando el marcador está proyectado, el duplicado ya se procesó.
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> getJson("/member-overviews/" + markerMember, 200));
        assertThat(getJson("/member-overviews/" + memberId, 200).at("/member/name").stringValue())
                .isEqualTo("Nombre original");
        assertThat(jdbc.sql("SELECT count(*) FROM processed_events WHERE event_id = :id")
                .param("id", eventId).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void outOfOrderMembershipEventsConvergeAndNeverMoveBackwards() throws Exception {
        long memberId = IDS.incrementAndGet();
        long membershipId = IDS.incrementAndGet();
        publishMember(UUID.randomUUID(), memberId, "Luis Pérez");
        publish("memberships.events", memberId, envelope(UUID.randomUUID(), "MEMBERSHIP_EXPIRED", "2026-11-01T00:00:00Z")
                + ",\"membershipId\":" + membershipId + ",\"memberId\":" + memberId
                + ",\"status\":\"EXPIRED\",\"endDate\":\"2026-10-31\"}");

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(jdbc
                .sql("SELECT status FROM memberships WHERE membership_id = :id").param("id", membershipId)
                .query(String.class).optional()).contains("EXPIRED"));
        assertThat(getJson("/member-overviews/" + memberId, 200).get("membership").isNull())
                .as("sin MEMBERSHIP_CREATED la membresía está incompleta y no se expone").isTrue();

        publishMembershipCreated(memberId, membershipId, "2026-10-01T08:00:00Z");
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
                getJson("/member-overviews/" + memberId, 200).at("/membership/status").stringValue()).isEqualTo("EXPIRED"));
    }

    @Test
    void invalidEventIsDiscardedWithoutBlockingLaterEvents() throws Exception {
        long memberId = IDS.incrementAndGet();
        UUID invalidEventId = UUID.randomUUID();
        publish("members.events", memberId, envelope(invalidEventId, "MEMBER_REGISTERED", "2026-10-01T08:00:00Z")
                + ",\"memberId\":" + memberId + "}");
        publishMember(UUID.randomUUID(), memberId, "Después del inválido");

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(
                getJson("/member-overviews/" + memberId, 200).at("/member/name").stringValue())
                .isEqualTo("Después del inválido"));
        assertThat(jdbc.sql("SELECT count(*) FROM processed_events WHERE event_id = :id")
                .param("id", invalidEventId).query(Long.class).single()).isZero();
    }

    @Test
    void apiRejectsUnknownMembersAndInvalidParameters() throws Exception {
        JsonNode notFound = getJson("/member-overviews/999999999", 404);
        assertThat(notFound.get("code").stringValue()).isEqualTo("MEMBER_NOT_FOUND");
        assertThat(getJson("/member-overviews/999999999/recent-accesses", 404).get("code").stringValue())
                .isEqualTo("MEMBER_NOT_FOUND");
        assertThat(getJson("/member-overviews/0", 400).get("code").stringValue()).isEqualTo("BAD_REQUEST");
        assertThat(getJson("/member-overviews/abc", 400).get("code").stringValue()).isEqualTo("BAD_REQUEST");
        assertThat(getJson("/member-overviews/1/recent-accesses?limit=0", 400).get("message").stringValue())
                .contains("limit");
        assertThat(getJson("/member-overviews/1/recent-accesses?limit=51", 400).get("message").stringValue())
                .contains("limit");
    }

    @Test
    void apiRequiresCredentialsExceptForHealth() throws Exception {
        HttpResponse<String> anonymous = send("/member-overviews/1", null);
        assertThat(anonymous.statusCode()).isEqualTo(401);
        assertThat(anonymous.headers().firstValue("WWW-Authenticate")).hasValueSatisfying(
                value -> assertThat(value).startsWith("Basic"));
        assertThat(anonymous.body()).contains("\"code\":\"UNAUTHORIZED\"");

        String wrongPassword = "Basic " + Base64.getEncoder().encodeToString("gateway-test:wrong-password".getBytes());
        assertThat(send("/member-overviews/1", wrongPassword).statusCode()).isEqualTo(401);

        HttpResponse<String> health = send("/actuator/health", null);
        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).isEqualTo("{\"groups\":[\"liveness\",\"readiness\"],\"status\":\"UP\"}");
        assertThat(send("/actuator/env", AUTH).statusCode()).as("solo health está expuesto").isEqualTo(404);
    }

    private void publishMember(UUID eventId, long memberId, String name) throws Exception {
        publish("members.events", memberId, envelope(eventId, "MEMBER_REGISTERED", "2026-10-01T08:00:00Z")
                + ",\"memberId\":" + memberId + ",\"document\":\"10750" + memberId + "\",\"name\":\"" + name
                + "\",\"phone\":\"3001234567\",\"email\":null,\"createdAt\":\"2026-10-01T08:00:00Z\"}");
    }

    private void publishMembershipCreated(long memberId, long membershipId, String occurredAt) throws Exception {
        publish("memberships.events", memberId, envelope(UUID.randomUUID(), "MEMBERSHIP_CREATED", occurredAt)
                + ",\"membershipId\":" + membershipId + ",\"memberId\":" + memberId
                + ",\"planId\":3,\"status\":\"PENDING\"}");
    }

    private void publishAccess(long memberId, long attemptId, String result, String occurredAt) throws Exception {
        publish("access.events", memberId, envelope(UUID.randomUUID(), result, occurredAt)
                + ",\"attemptId\":" + attemptId + ",\"memberId\":" + memberId + ",\"result\":\"" + result
                + "\",\"reason\":\"PRUEBA\"}");
    }

    private void publish(String topic, long key, String payload) throws Exception {
        kafkaTemplate.send(topic, "0", payload).get();
    }

    private static String envelope(UUID eventId, String eventType, String occurredAt) {
        return "{\"eventId\":\"" + eventId + "\",\"eventType\":\"" + eventType + "\",\"occurredAt\":\"" + occurredAt
                + "\",\"version\":1";
    }

    private JsonNode getJson(String path, int expectedStatus) throws Exception {
        HttpResponse<String> response = send(path, AUTH);
        assertThat(response.statusCode()).as("GET %s -> %s", path, response.body()).isEqualTo(expectedStatus);
        return jsonMapper.readTree(response.body());
    }

    private HttpResponse<String> send(String path, String authorization) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET();
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
