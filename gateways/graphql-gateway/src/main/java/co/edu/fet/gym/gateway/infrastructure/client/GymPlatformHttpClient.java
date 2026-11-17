package co.edu.fet.gym.gateway.infrastructure.client;

import co.edu.fet.gym.gateway.domain.model.AccessAttempt;
import co.edu.fet.gym.gateway.domain.model.AccessResult;
import co.edu.fet.gym.gateway.domain.model.ComponentStatus;
import co.edu.fet.gym.gateway.domain.model.KafkaEntry;
import co.edu.fet.gym.gateway.domain.model.KafkaFeed;
import co.edu.fet.gym.gateway.domain.model.Member;
import co.edu.fet.gym.gateway.domain.model.Membership;
import co.edu.fet.gym.gateway.domain.model.MembershipStatus;
import co.edu.fet.gym.gateway.domain.model.NewMember;
import co.edu.fet.gym.gateway.domain.model.NewMembership;
import co.edu.fet.gym.gateway.domain.model.NewPayment;
import co.edu.fet.gym.gateway.domain.model.NewPlan;
import co.edu.fet.gym.gateway.domain.model.Payment;
import co.edu.fet.gym.gateway.domain.model.Plan;
import co.edu.fet.gym.gateway.domain.model.SystemComponent;
import co.edu.fet.gym.gateway.domain.port.GymPlatformPort;
import co.edu.fet.gym.gateway.domain.port.Upstream;
import co.edu.fet.gym.gateway.domain.port.UpstreamRejectedException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse;
import org.springframework.web.client.RestClientException;

import java.io.IOException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Adaptador HTTP de {@link GymPlatformPort} según contracts/openapi/gym-platform-api.yaml, más las rutas
 * /sim/* del simulador. Un 4xx con ErrorResponse es un rechazo del dominio y llega al cliente con su código;
 * un 401, un 403 o una ruta inexistente son errores de configuración del gateway. Un 5xx es indisponibilidad
 * y conserva el código con que el servicio la explica (STARTING, DATABASE_UNAVAILABLE...).
 */
@Component
class GymPlatformHttpClient implements GymPlatformPort {

    private static final Logger log = LoggerFactory.getLogger(GymPlatformHttpClient.class);
    /** Código del servicio para una ruta que no existe; los recursos ausentes usan MEMBER_NOT_FOUND, etc. */
    private static final String ROUTE_NOT_FOUND = "NOT_FOUND";
    /** Solo se reenvían al cliente códigos con forma de constante, nunca texto libre del servicio. */
    private static final Pattern SERVICE_CODE = Pattern.compile("[A-Z][A-Z0-9_]{1,59}");

    private static final ParameterizedTypeReference<List<MemberPayload>> MEMBERS = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<MemberPayload> MEMBER = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<PlanPayload>> PLANS = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<PlanPayload> PLAN = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<MembershipPayload>> MEMBERSHIPS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<MembershipPayload> MEMBERSHIP = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<PaymentPayload>> PAYMENTS = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<PaymentPayload> PAYMENT = new ParameterizedTypeReference<>() {
    };
    private static final ParameterizedTypeReference<List<AccessAttemptPayload>> ACCESS_ATTEMPTS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<AccessAttemptPayload> ACCESS_ATTEMPT =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<SystemStatusPayload> SYSTEM_STATUS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<KafkaFeedPayload> KAFKA_FEED = new ParameterizedTypeReference<>() {
    };

    private final RestClient restClient;
    private final CircuitBreaker breaker = new CircuitBreaker();

    GymPlatformHttpClient(@Qualifier("gymPlatformRestClient") RestClient gymPlatformRestClient) {
        this.restClient = gymPlatformRestClient;
    }

    @Override
    public List<Member> findMembers() {
        return get(MEMBERS, "/members").stream().map(MemberPayload::toDomain).toList();
    }

    @Override
    public List<Plan> findPlans() {
        return get(PLANS, "/plans").stream().map(PlanPayload::toDomain).toList();
    }

    @Override
    public List<Membership> findMemberships() {
        return get(MEMBERSHIPS, "/memberships").stream().map(MembershipPayload::toDomain).toList();
    }

    /** MEMBERSHIP_NOT_FOUND no es un error: el tipo GraphQL es nullable. */
    @Override
    public Optional<Membership> findMembership(long membershipId) {
        try {
            return Optional.of(get(MEMBERSHIP, "/memberships/{membershipId}", membershipId).toDomain());
        } catch (UpstreamRejectedException rejected) {
            if (rejected.status() == HttpStatus.NOT_FOUND.value()) {
                return Optional.empty();
            }
            throw rejected;
        }
    }

    @Override
    public List<Payment> findPayments() {
        return get(PAYMENTS, "/payments").stream().map(PaymentPayload::toDomain).toList();
    }

    @Override
    public List<AccessAttempt> findAccessAttempts(int limit) {
        return get(ACCESS_ATTEMPTS, "/sim/access-attempts?limit={limit}", limit).stream()
                .map(AccessAttemptPayload::toDomain).toList();
    }

    @Override
    public List<SystemComponent> findPlatformComponents() {
        return get(SYSTEM_STATUS, "/sim/status").toDomain();
    }

    @Override
    public KafkaFeed findKafkaEvents(long after, int limit) {
        return get(KAFKA_FEED, "/sim/events?after={after}&limit={limit}", after, limit).toDomain();
    }

    @Override
    public Member registerMember(NewMember member) {
        return post(MEMBER, new MemberRequest(member.document(), member.name(), member.phone(), member.email()),
                "/members").toDomain();
    }

    @Override
    public Plan createPlan(NewPlan plan) {
        return post(PLAN, new PlanRequest(plan.name(), plan.durationDays(), plan.price()), "/plans").toDomain();
    }

    @Override
    public Membership createMembership(NewMembership membership) {
        return post(MEMBERSHIP, new MembershipRequest(membership.memberId(), membership.planId()), "/memberships")
                .toDomain();
    }

    /** paidAt viaja como texto ISO 8601 con zona, el formato date-time del contrato. */
    @Override
    public Payment registerPayment(NewPayment payment) {
        return post(PAYMENT, new PaymentRequest(payment.membershipId(), payment.amount(),
                DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(payment.paidAt())), "/payments").toDomain();
    }

    @Override
    public AccessAttempt registerAccessAttempt(long memberId) {
        return post(ACCESS_ATTEMPT, new AccessRequest(memberId), "/access-attempts").toDomain();
    }

    @Override
    public Membership expireMembership(long membershipId) {
        return post(MEMBERSHIP, null, "/sim/memberships/{membershipId}/expire", membershipId).toDomain();
    }

    /** Las lecturas son idempotentes: se reintentan una vez si la conexión falla. */
    private <T> T get(ParameterizedTypeReference<T> type, String uri, Object... variables) {
        String operation = "GET " + uri;
        RestClient.RequestHeadersSpec<?> request = restClient.get().uri(uri, variables);
        return UpstreamCalls.read(Upstream.GYM_PLATFORM, breaker, operation, () -> exchange(operation, request, type));
    }

    /** Los comandos nunca se reintentan: el servicio pudo aplicarlos aunque la respuesta se perdiera. */
    private <T> T post(ParameterizedTypeReference<T> type, Object body, String uri, Object... variables) {
        String operation = "POST " + uri;
        RestClient.RequestBodySpec request = restClient.post().uri(uri, variables);
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).body(body);
        }
        return UpstreamCalls.command(Upstream.GYM_PLATFORM, breaker, operation, () -> exchange(operation, request, type));
    }

    private static <T> T exchange(String operation, RestClient.RequestHeadersSpec<?> request,
                                  ParameterizedTypeReference<T> type) {
        return request
                .accept(MediaType.APPLICATION_JSON)
                .exchange((clientRequest, response) -> {
                    requireSuccess(operation, response);
                    return requireBody(response.bodyTo(type));
                });
    }

    private static void requireSuccess(String operation, ConvertibleClientHttpResponse response) throws IOException {
        HttpStatusCode status = response.getStatusCode();
        if (status.is2xxSuccessful()) {
            return;
        }
        if (status.is5xxServerError()) {
            ErrorPayload error = readError(response);
            String code = error != null && error.code() != null && SERVICE_CODE.matcher(error.code()).matches()
                    ? error.code() : null;
            log.warn("{}: el servicio respondió {}{}", operation, status.value(), code == null ? "" : " (" + code + ")");
            throw new UpstreamUnavailableException(Upstream.GYM_PLATFORM,
                    operation + " respondió " + status.value(), null, code);
        }
        ErrorPayload error = readError(response);
        if (isDomainRejection(status, error)) {
            throw new UpstreamRejectedException(status.value(), error.code(), error.message());
        }
        log.error("{}: respuesta inesperada {} del servicio; revise la URL y la credencial del gateway",
                operation, status.value());
        throw new IllegalStateException("Respuesta inesperada " + status.value() + " en " + operation);
    }

    private static boolean isDomainRejection(HttpStatusCode status, ErrorPayload error) {
        int value = status.value();
        return status.is4xxClientError()
                && value != HttpStatus.UNAUTHORIZED.value() && value != HttpStatus.FORBIDDEN.value()
                && error != null && error.code() != null && error.message() != null
                && !ROUTE_NOT_FOUND.equals(error.code());
    }

    private static ErrorPayload readError(ConvertibleClientHttpResponse response) {
        try {
            return response.bodyTo(ErrorPayload.class);
        } catch (RestClientException ignored) {
            // Cuerpo no JSON: se informa como respuesta inesperada.
            return null;
        }
    }

    private static <T> T requireBody(T body) {
        if (body == null) {
            throw new IllegalStateException("El servicio respondió sin cuerpo");
        }
        return body;
    }

    private static <T> T required(T value, String field) {
        return Objects.requireNonNull(value, () -> "Respuesta del servicio sin el campo " + field);
    }

    record ErrorPayload(String code, String message) {
    }

    record MemberRequest(String document, String name, String phone, String email) {
    }

    record PlanRequest(String name, int durationDays, double price) {
    }

    record MembershipRequest(long memberId, long planId) {
    }

    record PaymentRequest(long membershipId, double amount, String paidAt) {
    }

    record AccessRequest(long memberId) {
    }

    record MemberPayload(Long id, String document, String name, String phone, String email, OffsetDateTime createdAt) {

        Member toDomain() {
            return new Member(required(id, "id"), required(document, "document"), required(name, "name"),
                    required(phone, "phone"), email, required(createdAt, "createdAt"));
        }
    }

    record PlanPayload(Long id, String name, Integer durationDays, Double price, OffsetDateTime createdAt) {

        Plan toDomain() {
            return new Plan(required(id, "id"), required(name, "name"), required(durationDays, "durationDays"),
                    required(price, "price"), required(createdAt, "createdAt"));
        }
    }

    record MembershipPayload(Long id, Long memberId, Long planId, MembershipStatus status, LocalDate startDate,
                             LocalDate endDate, OffsetDateTime createdAt) {

        Membership toDomain() {
            return new Membership(required(id, "id"), required(memberId, "memberId"), required(planId, "planId"),
                    required(status, "status"), startDate, endDate, required(createdAt, "createdAt"));
        }
    }

    record PaymentPayload(Long id, Long membershipId, Double amount, OffsetDateTime paidAt, OffsetDateTime createdAt) {

        Payment toDomain() {
            return new Payment(required(id, "id"), required(membershipId, "membershipId"), required(amount, "amount"),
                    required(paidAt, "paidAt"), required(createdAt, "createdAt"));
        }
    }

    record AccessAttemptPayload(Long attemptId, Long memberId, AccessResult result, String reason,
                                OffsetDateTime occurredAt) {

        AccessAttempt toDomain() {
            return new AccessAttempt(required(attemptId, "attemptId"), required(memberId, "memberId"),
                    required(result, "result"), required(reason, "reason"), required(occurredAt, "occurredAt"));
        }
    }

    /** ready y checkedAt del simulador no se usan: el gateway calcula el estado global con todos los componentes. */
    record SystemStatusPayload(List<ComponentPayload> components) {

        List<SystemComponent> toDomain() {
            return required(components, "components").stream().map(ComponentPayload::toDomain).toList();
        }
    }

    /**
     * El simulador informa el estado en minúsculas ("up", "down"); el esquema usa el enum ComponentStatus. Un
     * valor desconocido se informa como UNKNOWN en vez de romper toda la consulta de estado.
     */
    record ComponentPayload(String id, String name, String role, String status) {

        SystemComponent toDomain() {
            return new SystemComponent(required(id, "component.id"), required(name, "component.name"),
                    required(role, "component.role"), parseStatus(required(status, "component.status")));
        }

        private static ComponentStatus parseStatus(String value) {
            try {
                return ComponentStatus.valueOf(value.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException unknown) {
                return ComponentStatus.UNKNOWN;
            }
        }
    }

    record KafkaFeedPayload(Long lastSeq, List<KafkaEntryPayload> events) {

        KafkaFeed toDomain() {
            return new KafkaFeed(required(lastSeq, "lastSeq"),
                    required(events, "events").stream().map(KafkaEntryPayload::toDomain).toList());
        }
    }

    record KafkaEntryPayload(Long seq, String topic, Integer partition, Long offset, String key,
                             OffsetDateTime timestamp, String eventType, Object payload, String raw) {

        KafkaEntry toDomain() {
            return new KafkaEntry(required(seq, "seq"), required(topic, "topic"), required(partition, "partition"),
                    required(offset, "offset"), key, required(timestamp, "timestamp"), eventType, payload, raw);
        }
    }
}
