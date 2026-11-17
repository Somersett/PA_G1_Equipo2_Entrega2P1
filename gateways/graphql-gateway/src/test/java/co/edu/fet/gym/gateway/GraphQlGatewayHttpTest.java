package co.edu.fet.gym.gateway;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.AccessResult;
import co.edu.fet.gym.gateway.domain.model.ComponentStatus;
import co.edu.fet.gym.gateway.domain.model.KafkaEntry;
import co.edu.fet.gym.gateway.domain.model.KafkaFeed;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.MemberOverview;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.MembershipStatus;
import co.edu.fet.gym.gateway.domain.model.NewMember;
import co.edu.fet.gym.gateway.domain.model.NewPayment;
import co.edu.fet.gym.gateway.domain.model.Payment;
import co.edu.fet.gym.gateway.domain.model.Plan;
import co.edu.fet.gym.gateway.domain.model.SystemComponent;
import co.edu.fet.gym.gateway.domain.port.ConsolidatedQueriesPort;
import co.edu.fet.gym.gateway.domain.port.GymPlatformPort;
import co.edu.fet.gym.gateway.domain.port.Upstream;
import co.edu.fet.gym.gateway.domain.port.UpstreamRejectedException;
import co.edu.fet.gym.gateway.domain.port.UpstreamTimeoutException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Gateway completo sobre HTTP real (seguridad, CORS, esquema del contrato, resolvers, errores y límites)
 * con los puertos hacia el servicio de consultas y los servicios REST sustituidos por mocks. No es una
 * prueba de integración con los servicios reales: esa se ejecuta con infrastructure/scripts/smoke-test-gateway.sh.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "gateway.security.client-username=admin-test",
        "gateway.security.client-password=admin-password-123",
        "gateway.security.cors-allowed-origins=http://localhost:5173",
        "gateway.consolidated-queries.username=unused",
        "gateway.consolidated-queries.password=unused",
        "gateway.gym-platform.username=unused",
        "gateway.gym-platform.password=unused"})
class GraphQlGatewayHttpTest {

    private static final String AUTH = basic("admin-test", "admin-password-123");
    private static final String FULL_QUERY = """
            query($id: Int!) { member(id: $id) {
              member { id document name phone email createdAt }
              membership { id memberId planId status startDate endDate createdAt }
              recentAccesses { attemptId memberId result reason occurredAt } } }""";

    @LocalServerPort
    int port;

    @Autowired
    JsonMapper jsonMapper;

    @MockitoBean
    ConsolidatedQueriesPort consolidatedQueries;

    @MockitoBean
    GymPlatformPort platform;

    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    void resolvesFullMemberOverviewWithContractScalarsAndDefaultLimit() throws Exception {
        when(consolidatedQueries.findMemberOverview(7)).thenReturn(Optional.of(overview()));
        when(consolidatedQueries.findRecentAccesses(7, 10)).thenReturn(List.of(new AccessAttempt(5, 7,
                AccessResult.ACCESS_GRANTED, "MEMBERSHIP_ACTIVE", OffsetDateTime.parse("2026-10-02T12:30:00Z"))));

        JsonNode response = graphql(FULL_QUERY, Map.of("id", 7));

        assertThat(response.has("errors")).as(response.toString()).isFalse();
        JsonNode member = response.at("/data/member");
        assertThat(member.at("/member/name").stringValue()).isEqualTo("Ana Ruiz");
        assertThat(member.at("/member/email").isNull()).isTrue();
        assertThat(member.at("/member/createdAt").stringValue()).isEqualTo("2026-10-01T08:00:00Z");
        assertThat(member.at("/membership/status").stringValue()).isEqualTo("ACTIVE");
        assertThat(member.at("/membership/startDate").stringValue()).isEqualTo("2026-10-01");
        assertThat(member.at("/recentAccesses/0/result").stringValue()).isEqualTo("ACCESS_GRANTED");
        assertThat(member.at("/recentAccesses/0/occurredAt").stringValue()).isEqualTo("2026-10-02T12:30:00Z");
        verify(consolidatedQueries).findRecentAccesses(7, 10);
    }

    @Test
    void doesNotCallTheServiceForFieldsThatWereNotRequested() throws Exception {
        when(consolidatedQueries.findMemberOverview(7)).thenReturn(Optional.of(overview()));

        JsonNode response = graphql("{ member(id: 7) { member { name } } }", Map.of());

        assertThat(response.at("/data/member/member/name").stringValue()).isEqualTo("Ana Ruiz");
        verify(consolidatedQueries, never()).findRecentAccesses(anyLong(), anyInt());
    }

    @Test
    void unknownMemberResolvesToNullWithoutErrors() throws Exception {
        when(consolidatedQueries.findMemberOverview(99)).thenReturn(Optional.empty());

        JsonNode response = graphql("{ member(id: 99) { member { id } } }", Map.of());

        assertThat(response.at("/data/member").isNull()).isTrue();
        assertThat(response.has("errors")).isFalse();
    }

    @Test
    void invalidArgumentsAreRejectedBeforeCallingTheService() throws Exception {
        JsonNode badId = graphql("{ member(id: 0) { member { id } } }", Map.of());
        assertThat(classification(badId)).isEqualTo("BAD_REQUEST");
        assertThat(badId.at("/errors/0/message").stringValue()).contains("id");

        when(consolidatedQueries.findMemberOverview(7)).thenReturn(Optional.of(overview()));
        JsonNode badLimit = graphql("{ member(id: 7) { recentAccesses(limit: 51) { attemptId } } }", Map.of());
        assertThat(classification(badLimit)).isEqualTo("BAD_REQUEST");
        assertThat(badLimit.at("/errors/0/message").stringValue()).contains("limit");

        JsonNode wrongType = graphql("{ member(id: \"7\") { member { id } } }", Map.of());
        assertThat(classification(wrongType)).isEqualTo("ValidationError");
        verify(consolidatedQueries, never()).findRecentAccesses(anyLong(), anyInt());
    }

    @Test
    void mutationTypeOnlyAcceptsItsOwnFields() throws Exception {
        JsonNode response = graphql("mutation { member(id: 1) { member { id } } }", Map.of());

        assertThat(classification(response)).isEqualTo("ValidationError");
        verifyNoInteractions(consolidatedQueries, platform);
    }

    @Test
    void listQueriesAreResolvedAgainstThePlatform() throws Exception {
        when(platform.findPlans()).thenReturn(List.of(
                new Plan(1, "Mensual", 30, 90_000.5, OffsetDateTime.parse("2026-11-01T10:00:00Z"))));
        when(platform.findMembership(99)).thenReturn(Optional.empty());

        JsonNode response = graphql("{ plans { id name durationDays price createdAt } membership(id: 99) { id } }",
                Map.of());

        assertThat(response.has("errors")).as(response.toString()).isFalse();
        assertThat(response.at("/data/plans/0/name").stringValue()).isEqualTo("Mensual");
        assertThat(response.at("/data/plans/0/durationDays").intValue()).isEqualTo(30);
        assertThat(response.at("/data/plans/0/price").doubleValue()).isEqualTo(90_000.5);
        assertThat(response.at("/data/plans/0/createdAt").stringValue()).isEqualTo("2026-11-01T10:00:00Z");
        assertThat(response.at("/data/membership").isNull()).isTrue();
    }

    @Test
    void mutationsBindInputsAndReturnTheServiceResult() throws Exception {
        when(platform.registerMember(new NewMember("1075000222", "Luis Gómez", "3009876543", null)))
                .thenReturn(new Member(8, "1075000222", "Luis Gómez", "3009876543", null,
                        OffsetDateTime.parse("2026-11-05T15:00:00Z")));
        when(platform.registerPayment(any())).thenReturn(new Payment(4, 10, 90_000,
                OffsetDateTime.parse("2026-11-05T14:30:00Z"), OffsetDateTime.parse("2026-11-05T15:00:00Z")));

        JsonNode member = graphql("""
                mutation($input: RegisterMemberInput!) { registerMember(input: $input) { id name email } }""",
                Map.of("input", Map.of("document", "1075000222", "name", "Luis Gómez", "phone", "3009876543")));
        JsonNode payment = graphql("""
                mutation { registerPayment(input: {membershipId: 10, amount: 90000,
                                                   paidAt: "2026-11-05T09:30:00-05:00"}) { id paidAt } }""",
                Map.of());

        assertThat(member.has("errors")).as(member.toString()).isFalse();
        assertThat(member.at("/data/registerMember/id").intValue()).isEqualTo(8);
        assertThat(member.at("/data/registerMember/email").isNull()).isTrue();
        assertThat(payment.at("/data/registerPayment/paidAt").stringValue()).isEqualTo("2026-11-05T14:30:00Z");
        verify(platform).registerPayment(
                new NewPayment(10, 90_000, OffsetDateTime.parse("2026-11-05T09:30:00-05:00")));
    }

    @Test
    void rejectedCommandsKeepTheServiceCodeAndMessage() throws Exception {
        when(platform.registerMember(any())).thenThrow(new UpstreamRejectedException(409,
                "DOCUMENT_ALREADY_REGISTERED", "Ya existe un miembro con el documento 1075000222."));
        when(platform.registerPayment(any())).thenThrow(new UpstreamRejectedException(422,
                "AMOUNT_BELOW_PLAN_PRICE", "El monto no cubre el valor del plan Mensual (90000)."));

        JsonNode conflict = graphql("""
                mutation { registerMember(input: {document: "1075000222", name: "Ana", phone: "3001234567"}) { id } }""",
                Map.of());
        JsonNode rejected = graphql("""
                mutation { registerPayment(input: {membershipId: 10, amount: 1,
                                                   paidAt: "2026-11-05T09:30:00-05:00"}) { id } }""",
                Map.of());

        assertThat(classification(conflict)).isEqualTo("CONFLICT");
        assertThat(conflict.at("/errors/0/extensions/code").stringValue()).isEqualTo("DOCUMENT_ALREADY_REGISTERED");
        assertThat(conflict.at("/errors/0/message").stringValue())
                .isEqualTo("Ya existe un miembro con el documento 1075000222.");
        assertThat(conflict.at("/data").isNull()).isTrue();
        assertThat(classification(rejected)).isEqualTo("BAD_REQUEST");
        assertThat(rejected.at("/errors/0/extensions/code").stringValue()).isEqualTo("AMOUNT_BELOW_PLAN_PRICE");
    }

    @Test
    void invalidPlatformArgumentsAreRejectedBeforeCallingTheServices() throws Exception {
        JsonNode badMember = graphql("mutation { registerAccessAttempt(memberId: 0) { attemptId } }", Map.of());
        JsonNode badLimit = graphql("{ accessAttempts(limit: 201) { attemptId } }", Map.of());

        assertThat(classification(badMember)).isEqualTo("BAD_REQUEST");
        assertThat(badMember.at("/errors/0/message").stringValue()).contains("memberId");
        assertThat(classification(badLimit)).isEqualTo("BAD_REQUEST");
        verifyNoInteractions(platform);
    }

    @Test
    void systemStatusAndKafkaEventsUseTheirContractTypes() throws Exception {
        when(platform.findPlatformComponents()).thenReturn(List.of(
                new SystemComponent("simulator", "Simulador de servicios", "Servicios", ComponentStatus.UP),
                new SystemComponent("kafka", "Apache Kafka", "Mensajería de eventos", ComponentStatus.DOWN),
                new SystemComponent("postgres", "PostgreSQL", "Bases de datos", ComponentStatus.UP)));
        when(consolidatedQueries.isHealthy()).thenReturn(true);
        when(platform.findKafkaEvents(3, 200)).thenReturn(new KafkaFeed(4, List.of(new KafkaEntry(4,
                "members.events", 0, 12, "8", OffsetDateTime.parse("2026-11-05T15:00:00Z"), "MEMBER_REGISTERED",
                Map.of("eventType", "MEMBER_REGISTERED", "memberId", 8, "contact", Map.of("phone", "300")), null))));

        JsonNode response = graphql("""
                { systemStatus { ready checkedAt components { id status } }
                  kafkaEvents(after: 3) { lastSeq events { seq topic offset eventType payload raw } } }""",
                Map.of());

        assertThat(response.has("errors")).as(response.toString()).isFalse();
        assertThat(response.at("/data/systemStatus/ready").booleanValue()).isFalse();
        assertThat(componentStatuses(response)).containsExactly(
                "gateway=UP", "simulator=UP", "queries=UP", "kafka=DOWN", "postgres=UP");
        JsonNode event = response.at("/data/kafkaEvents/events/0");
        assertThat(event.at("/payload/memberId").intValue()).isEqualTo(8);
        assertThat(event.at("/payload/contact/phone").stringValue()).isEqualTo("300");
        assertThat(event.at("/raw").isNull()).isTrue();
    }

    @Test
    void systemStatusIsAnsweredByTheGatewayEvenWhenEveryServiceIsDown() throws Exception {
        when(platform.findPlatformComponents()).thenThrow(new UpstreamUnavailableException(
                Upstream.GYM_PLATFORM, "GET /sim/status refused", null));
        when(consolidatedQueries.isHealthy()).thenThrow(
                new UpstreamTimeoutException(Upstream.CONSOLIDATED_QUERIES, "read timeout", null));

        JsonNode response = graphql("{ systemStatus { ready components { id name status } } }", Map.of());

        assertThat(response.has("errors")).as(response.toString()).isFalse();
        assertThat(response.at("/data/systemStatus/ready").booleanValue()).isFalse();
        assertThat(componentStatuses(response)).containsExactly(
                "gateway=UP", "simulator=DOWN", "queries=DOWN", "kafka=UNKNOWN", "postgres=UNKNOWN");
    }

    @Test
    void upstreamFailuresAreClassifiedWithoutLeakingInternals() throws Exception {
        when(consolidatedQueries.findMemberOverview(1)).thenThrow(new UpstreamUnavailableException(
                Upstream.CONSOLIDATED_QUERIES, "GET http://consolidated-queries-service:8085 refused", null));
        when(consolidatedQueries.findMemberOverview(2)).thenThrow(
                new UpstreamTimeoutException(Upstream.CONSOLIDATED_QUERIES, "read timeout", null));
        when(consolidatedQueries.findMemberOverview(3)).thenThrow(new IllegalStateException("secreto interno"));
        when(platform.findMembers()).thenThrow(new UpstreamUnavailableException(
                Upstream.GYM_PLATFORM, "GET http://services-simulator:8090/members refused", null));
        when(platform.findPlans()).thenThrow(new UpstreamUnavailableException(
                Upstream.GYM_PLATFORM, "GET /plans respondió 503", null, "DATABASE_UNAVAILABLE"));

        JsonNode unavailable = graphql("{ member(id: 1) { member { id } } }", Map.of());
        assertThat(classification(unavailable)).isEqualTo("UPSTREAM_UNAVAILABLE");
        assertThat(unavailable.at("/errors/0/extensions/upstream").stringValue()).isEqualTo("CONSOLIDATED_QUERIES");
        assertThat(unavailable.at("/errors/0/extensions/code").isMissingNode()).isTrue();
        assertThat(unavailable.at("/data/member").isNull()).isTrue();
        assertThat(unavailable.toString()).doesNotContain("8085", "consolidated-queries-service:");

        JsonNode timeout = graphql("{ member(id: 2) { member { id } } }", Map.of());
        assertThat(classification(timeout)).isEqualTo("UPSTREAM_TIMEOUT");
        assertThat(timeout.at("/errors/0/extensions/upstream").stringValue()).isEqualTo("CONSOLIDATED_QUERIES");

        JsonNode databaseDown = graphql("{ plans { id } }", Map.of());
        assertThat(classification(databaseDown)).isEqualTo("UPSTREAM_UNAVAILABLE");
        assertThat(databaseDown.at("/errors/0/extensions/upstream").stringValue()).isEqualTo("GYM_PLATFORM");
        assertThat(databaseDown.at("/errors/0/extensions/code").stringValue()).isEqualTo("DATABASE_UNAVAILABLE");

        JsonNode unexpected = graphql("{ member(id: 3) { member { id } } }", Map.of());
        assertThat(classification(unexpected)).isEqualTo("INTERNAL_ERROR");
        assertThat(unexpected.toString()).doesNotContain("secreto interno");

        JsonNode platformDown = graphql("{ members { id } }", Map.of());
        assertThat(classification(platformDown)).isEqualTo("UPSTREAM_UNAVAILABLE");
        assertThat(platformDown.at("/errors/0/message").stringValue()).contains("miembros");
        assertThat(platformDown.toString()).doesNotContain("8090", "services-simulator");
    }

    @Test
    void abusiveQueriesAreRejectedBeforeExecution() throws Exception {
        StringBuilder aliases = new StringBuilder("{");
        for (int i = 0; i < 20; i++) {
            aliases.append(" m").append(i).append(": member(id: 7) { recentAccesses { attemptId reason } }");
        }
        JsonNode response = graphql(aliases.append(" }").toString(), Map.of());

        assertThat(response.at("/errors/0/message").stringValue()).containsIgnoringCase("complexity");
        verify(consolidatedQueries, never()).findMemberOverview(anyLong());
    }

    @Test
    void standardIntrospectionQueryIsAllowed() throws Exception {
        JsonNode response = graphql(graphql.introspection.IntrospectionQuery.INTROSPECTION_QUERY, Map.of());

        assertThat(response.has("errors")).as(response.path("errors").toString()).isFalse();
        assertThat(response.at("/data/__schema/queryType/name").stringValue()).isEqualTo("Query");
    }

    @Test
    void requiresCredentialsAndExposesOnlyHealth() throws Exception {
        assertThat(post("/graphql", "{\"query\":\"{ __typename }\"}", null, Map.of()).statusCode()).isEqualTo(401);
        assertThat(post("/graphql", "{\"query\":\"{ __typename }\"}", basic("admin-test", "wrong-password"), Map.of())
                .statusCode()).isEqualTo(401);
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(get("/actuator/env", AUTH).statusCode()).isEqualTo(404);
        assertThat(get("/graphiql", AUTH).statusCode()).as("GraphiQL desactivado por defecto").isEqualTo(404);
    }

    @Test
    void corsAllowsOnlyConfiguredOrigins() throws Exception {
        HttpResponse<String> allowed = preflight("http://localhost:5173");
        assertThat(allowed.statusCode()).isEqualTo(200);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:5173");

        assertThat(preflight("https://evil.example").statusCode()).isEqualTo(403);
    }

    private static MemberOverview overview() {
        return new MemberOverview(
                new Member(7, "1075000111", "Ana Ruiz", "3001234567", null, OffsetDateTime.parse("2026-10-01T08:00:00Z")),
                new Membership(10, 7, 3, MembershipStatus.ACTIVE, LocalDate.parse("2026-10-01"),
                        LocalDate.parse("2026-10-31"), OffsetDateTime.parse("2026-10-01T08:00:00Z")));
    }

    private JsonNode graphql(String query, Map<String, Object> variables) throws Exception {
        String body = jsonMapper.writeValueAsString(Map.of("query", query, "variables", variables));
        HttpResponse<String> response = post("/graphql", body, AUTH, Map.of());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return jsonMapper.readTree(response.body());
    }

    private static String classification(JsonNode response) {
        return response.at("/errors/0/extensions/classification").stringValue();
    }

    private static List<String> componentStatuses(JsonNode response) {
        List<String> statuses = new java.util.ArrayList<>();
        response.at("/data/systemStatus/components").forEach(component ->
                statuses.add(component.at("/id").stringValue() + "=" + component.at("/status").stringValue()));
        return statuses;
    }

    private HttpResponse<String> post(String path, String body, String authorization, Map<String, String> headers)
            throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        headers.forEach(request::header);
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> get(String path, String authorization) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET();
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> preflight(String origin) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/graphql"))
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type")
                .build(), HttpResponse.BodyHandlers.ofString());
    }

    private static String basic(String user, String password) {
        return "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8));
    }
}
