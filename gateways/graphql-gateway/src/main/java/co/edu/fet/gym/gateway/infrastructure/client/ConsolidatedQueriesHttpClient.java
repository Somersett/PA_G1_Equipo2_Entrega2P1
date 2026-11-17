package co.edu.fet.gym.gateway.infrastructure.client;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.AccessResult;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.MemberOverview;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.MembershipStatus;
import co.edu.fet.gym.gateway.domain.port.ConsolidatedQueriesPort;
import co.edu.fet.gym.gateway.domain.port.Upstream;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * Adaptador HTTP de {@link ConsolidatedQueriesPort} según
 * contracts/openapi/consolidated-queries-api.yaml. Un 404 significa "sin proyección" y no es un error.
 */
@Component
class ConsolidatedQueriesHttpClient implements ConsolidatedQueriesPort {

    private static final Logger log = LoggerFactory.getLogger(ConsolidatedQueriesHttpClient.class);
    private static final String MEMBER_NOT_FOUND = "MEMBER_NOT_FOUND";
    private static final ParameterizedTypeReference<List<AccessAttemptPayload>> ACCESS_LIST =
            new ParameterizedTypeReference<>() {
            };

    private final RestClient restClient;
    private final CircuitBreaker breaker = new CircuitBreaker();

    ConsolidatedQueriesHttpClient(@Qualifier("consolidatedQueriesRestClient") RestClient consolidatedQueriesRestClient) {
        this.restClient = consolidatedQueriesRestClient;
    }

    @Override
    public Optional<MemberOverview> findMemberOverview(long memberId) {
        return call("GET /member-overviews/" + memberId, () -> restClient.get()
                .uri("/member-overviews/{memberId}", memberId)
                .accept(MediaType.APPLICATION_JSON)
                .exchange((request, response) -> {
                    if (isMemberNotFound(request.getURI().getPath(), response)) {
                        return Optional.<MemberOverview>empty();
                    }
                    requireSuccess(request.getURI().getPath(), response);
                    return Optional.of(requireBody(response.bodyTo(MemberOverviewPayload.class)).toDomain());
                }));
    }

    @Override
    public List<AccessAttempt> findRecentAccesses(long memberId, int limit) {
        return call("GET /member-overviews/" + memberId + "/recent-accesses", () -> restClient.get()
                .uri("/member-overviews/{memberId}/recent-accesses?limit={limit}", memberId, limit)
                .accept(MediaType.APPLICATION_JSON)
                .exchange((request, response) -> {
                    // La proyección del miembro pudo desaparecer entre llamadas: no hay accesos que mostrar.
                    if (isMemberNotFound(request.getURI().getPath(), response)) {
                        return List.<AccessAttempt>of();
                    }
                    requireSuccess(request.getURI().getPath(), response);
                    return requireBody(response.bodyTo(ACCESS_LIST)).stream()
                            .map(AccessAttemptPayload::toDomain).toList();
                }));
    }

    /**
     * Salud del servicio, incluida su conexión a queries_db (/actuator/health, público). Un 503 significa que
     * el servicio responde pero no está sano; los fallos de red se propagan como indisponibilidad.
     */
    @Override
    public boolean isHealthy() {
        return call("GET /actuator/health", () -> restClient.get()
                .uri("/actuator/health")
                .accept(MediaType.APPLICATION_JSON)
                .exchange((request, response) -> response.getStatusCode().is2xxSuccessful()));
    }

    /** Todas las operaciones son lecturas: se reintentan una vez si la conexión falla. */
    private <T> T call(String operation, Supplier<T> request) {
        return UpstreamCalls.read(Upstream.CONSOLIDATED_QUERIES, breaker, operation, request);
    }

    /**
     * Un 404 solo significa "sin proyección" si el servicio lo identifica como MEMBER_NOT_FOUND. Otro
     * 404 (por ejemplo, base-url mal configurada) es un error del gateway y no debe ocultarse como null.
     */
    private static boolean isMemberNotFound(String path, ConvertibleClientHttpResponse response) throws IOException {
        if (response.getStatusCode().value() != HttpStatus.NOT_FOUND.value()) {
            return false;
        }
        ErrorPayload error = null;
        try {
            error = response.bodyTo(ErrorPayload.class);
        } catch (RestClientException ignored) {
            // Cuerpo no JSON: se informa abajo como 404 inesperado.
        }
        if (error != null && MEMBER_NOT_FOUND.equals(error.code())) {
            return true;
        }
        log.error("GET {}: 404 sin código MEMBER_NOT_FOUND; revise la URL del servicio de consultas", path);
        throw new IllegalStateException("Ruta no encontrada en el servicio de consultas: " + path);
    }

    private static void requireSuccess(String path, ClientHttpResponse response) throws IOException {
        HttpStatusCode status = response.getStatusCode();
        if (status.is2xxSuccessful()) {
            return;
        }
        if (status.is5xxServerError()) {
            log.warn("GET {}: el servicio de consultas respondió {}", path, status.value());
            throw new UpstreamUnavailableException(Upstream.CONSOLIDATED_QUERIES,
                    "El servicio de consultas respondió " + status.value(), null);
        }
        // 400, 401 o 403 indican un error de configuración o de contrato del gateway, no del cliente.
        log.error("GET {}: respuesta inesperada {} del servicio de consultas", path, status.value());
        throw new IllegalStateException("Respuesta inesperada " + status.value() + " del servicio de consultas");
    }

    private static <T> T requireBody(T body) {
        if (body == null) {
            throw new IllegalStateException("El servicio de consultas respondió sin cuerpo");
        }
        return body;
    }

    private static <T> T required(T value, String field) {
        return Objects.requireNonNull(value, () -> "Respuesta del servicio de consultas sin el campo " + field);
    }

    record ErrorPayload(String code, String message) {
    }

    record MemberOverviewPayload(MemberPayload member, MembershipPayload membership) {

        MemberOverview toDomain() {
            return new MemberOverview(required(member, "member").toDomain(),
                    membership == null ? null : membership.toDomain());
        }
    }

    record MemberPayload(Long id, String document, String name, String phone, String email, OffsetDateTime createdAt) {

        Member toDomain() {
            return new Member(required(id, "member.id"), required(document, "member.document"),
                    required(name, "member.name"), required(phone, "member.phone"), email,
                    required(createdAt, "member.createdAt"));
        }
    }

    record MembershipPayload(Long id, Long memberId, Long planId, MembershipStatus status, LocalDate startDate,
                             LocalDate endDate, OffsetDateTime createdAt) {

        Membership toDomain() {
            return new Membership(required(id, "membership.id"), required(memberId, "membership.memberId"),
                    required(planId, "membership.planId"), required(status, "membership.status"), startDate, endDate,
                    required(createdAt, "membership.createdAt"));
        }
    }

    record AccessAttemptPayload(Long attemptId, Long memberId, AccessResult result, String reason,
                                OffsetDateTime occurredAt) {

        AccessAttempt toDomain() {
            return new AccessAttempt(required(attemptId, "attemptId"), required(memberId, "memberId"),
                    required(result, "result"), required(reason, "reason"), required(occurredAt, "occurredAt"));
        }
    }
}
