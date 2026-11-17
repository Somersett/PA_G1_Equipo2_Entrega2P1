package co.edu.fet.gym.queries.infrastructure.kafka;

import co.edu.fet.gym.queries.domain.event.AccessAttemptRecorded;
import co.edu.fet.gym.queries.domain.event.IntegrationEvent;
import co.edu.fet.gym.queries.domain.event.InvalidEventException;
import co.edu.fet.gym.queries.domain.event.MemberRegistered;
import co.edu.fet.gym.queries.domain.event.MembershipActivated;
import co.edu.fet.gym.queries.domain.event.MembershipCreated;
import co.edu.fet.gym.queries.domain.event.MembershipExpired;
import co.edu.fet.gym.queries.domain.model.AccessResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class IntegrationEventParserTest {

    private static final String EVENT_ID = "3f2b8a1e-7c4d-4e5f-9a6b-1c2d3e4f5a6b";

    private final IntegrationEventParser parser = new IntegrationEventParser(JsonMapper.builder().build());

    @Test
    void parsesMemberRegisteredWithOptionalEmailAndIgnoresUnknownFields() {
        IntegrationEvent event = parser.parse(KafkaTopics.MEMBERS, """
                {"eventId":"%s","eventType":"MEMBER_REGISTERED","occurredAt":"2026-10-01T08:00:00Z","version":1,
                 "memberId":7,"document":"1075000111","name":"Ana Ruiz","phone":"3001234567",
                 "createdAt":"2026-10-01T07:59:59-05:00","futureField":"ignored"}
                """.formatted(EVENT_ID));

        assertThat(event).isEqualTo(new MemberRegistered(UUID.fromString(EVENT_ID),
                OffsetDateTime.parse("2026-10-01T08:00:00Z"), 7, "1075000111", "Ana Ruiz", "3001234567", null,
                OffsetDateTime.parse("2026-10-01T07:59:59-05:00")));
    }

    @Test
    void parsesMembershipLifecycleEvents() {
        assertThat(parser.parse(KafkaTopics.MEMBERSHIPS, envelope("MEMBERSHIP_CREATED",
                "\"membershipId\":10,\"memberId\":7,\"planId\":3,\"status\":\"PENDING\"")))
                .isInstanceOfSatisfying(MembershipCreated.class, created -> {
                    assertThat(created.membershipId()).isEqualTo(10);
                    assertThat(created.planId()).isEqualTo(3);
                });

        assertThat(parser.parse(KafkaTopics.MEMBERSHIPS, envelope("MEMBERSHIP_ACTIVATED",
                "\"membershipId\":10,\"memberId\":7,\"status\":\"ACTIVE\",\"startDate\":\"2026-10-02\","
                        + "\"endDate\":\"2026-11-01\"")))
                .isInstanceOfSatisfying(MembershipActivated.class, activated -> {
                    assertThat(activated.startDate()).isEqualTo(LocalDate.parse("2026-10-02"));
                    assertThat(activated.endDate()).isEqualTo(LocalDate.parse("2026-11-01"));
                });

        assertThat(parser.parse(KafkaTopics.MEMBERSHIPS, envelope("MEMBERSHIP_EXPIRED",
                "\"membershipId\":10,\"memberId\":7,\"status\":\"EXPIRED\",\"endDate\":\"2026-11-01\"")))
                .isInstanceOf(MembershipExpired.class);
    }

    @Test
    void parsesAccessEventsUsingEnvelopeDateAsAttemptDate() {
        IntegrationEvent event = parser.parse(KafkaTopics.ACCESS, envelope("ACCESS_DENIED",
                "\"attemptId\":99,\"memberId\":7,\"result\":\"ACCESS_DENIED\",\"reason\":\"MEMBERSHIP_EXPIRED\""));

        assertThat(event).isInstanceOfSatisfying(AccessAttemptRecorded.class, attempt -> {
            assertThat(attempt.result()).isEqualTo(AccessResult.ACCESS_DENIED);
            assertThat(attempt.toAccessAttempt().occurredAt()).isEqualTo(OffsetDateTime.parse("2026-10-01T08:00:00Z"));
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "no-json", "[1,2]", "\"texto\""})
    void rejectsPayloadsThatAreNotJsonObjects(String payload) {
        assertInvalid(KafkaTopics.MEMBERS, payload, "");
    }

    @Test
    void rejectsEnvelopeViolations() {
        assertInvalid(KafkaTopics.ACCESS, """
                {"eventType":"ACCESS_GRANTED","occurredAt":"2026-10-01T08:00:00Z","version":1}""", "eventId");
        assertInvalid(KafkaTopics.ACCESS, """
                {"eventId":"not-a-uuid","eventType":"ACCESS_GRANTED","occurredAt":"2026-10-01T08:00:00Z","version":1}""",
                "UUID");
        assertInvalid(KafkaTopics.ACCESS, envelope("PAYMENT_REGISTERED", "\"paymentId\":1"), "desconocido");
        assertInvalid(KafkaTopics.MEMBERS, envelope("ACCESS_GRANTED", accessFields("ACCESS_GRANTED")),
                "no pertenece al tópico members.events");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED", accessFields("ACCESS_GRANTED"))
                .replace("\"version\":1", "\"version\":2"), "versión 2");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED", accessFields("ACCESS_GRANTED"))
                .replace("\"version\":1", "\"version\":\"1\""), "version debe ser un entero");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED", accessFields("ACCESS_GRANTED"))
                .replace("2026-10-01T08:00:00Z", "2026-10-01T08:00:00"), "occurredAt");
    }

    @Test
    void rejectsDomainFieldViolations() {
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED",
                "\"attemptId\":0,\"memberId\":7,\"result\":\"ACCESS_GRANTED\",\"reason\":\"OK\""), "attemptId");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED",
                "\"attemptId\":1.5,\"memberId\":7,\"result\":\"ACCESS_GRANTED\",\"reason\":\"OK\""), "attemptId");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED",
                "\"attemptId\":\"1\",\"memberId\":7,\"result\":\"ACCESS_GRANTED\",\"reason\":\"OK\""), "attemptId");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED", accessFields("ACCESS_DENIED")),
                "result debe ser ACCESS_GRANTED");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED",
                "\"attemptId\":1,\"memberId\":7,\"result\":\"ACCESS_GRANTED\""), "reason");
        assertInvalid(KafkaTopics.MEMBERSHIPS, envelope("MEMBERSHIP_CREATED",
                "\"membershipId\":10,\"memberId\":7,\"planId\":3,\"status\":\"ACTIVE\""), "status debe ser PENDING");
        assertInvalid(KafkaTopics.MEMBERSHIPS, envelope("MEMBERSHIP_ACTIVATED",
                "\"membershipId\":10,\"memberId\":7,\"status\":\"ACTIVE\",\"startDate\":\"2026-11-02\","
                        + "\"endDate\":\"2026-11-01\""), "endDate es anterior a startDate");
        assertInvalid(KafkaTopics.MEMBERSHIPS, envelope("MEMBERSHIP_EXPIRED",
                "\"membershipId\":10,\"memberId\":7,\"status\":\"EXPIRED\",\"endDate\":\"01/11/2026\""), "endDate");
        assertInvalid(KafkaTopics.MEMBERS, envelope("MEMBER_REGISTERED",
                "\"memberId\":7,\"document\":\"1\",\"name\":\"Ana\",\"phone\":\"3\",\"email\":5,"
                        + "\"createdAt\":\"2026-10-01T08:00:00Z\""), "email");
    }

    @Test
    void rejectsValuesThatPostgresWouldRejectOnEveryRetry() {
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED",
                "\"attemptId\":1,\"memberId\":7,\"result\":\"ACCESS_GRANTED\",\"reason\":\"x\\u0000\""), "NUL");
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED", accessFields("ACCESS_GRANTED"))
                .replace("2026-10-01T08:00:00Z", "+300000-01-01T00:00:00Z"), "occurredAt tiene un año fuera del rango");
        assertInvalid(KafkaTopics.MEMBERSHIPS, envelope("MEMBERSHIP_EXPIRED",
                "\"membershipId\":10,\"memberId\":7,\"status\":\"EXPIRED\",\"endDate\":\"+20000-01-01\""),
                "endDate tiene un año fuera del rango");
    }

    @Test
    void errorMessageIdentifiesTheEventOnceItsIdIsKnown() {
        assertInvalid(KafkaTopics.ACCESS, envelope("ACCESS_GRANTED", "\"memberId\":7"), EVENT_ID);
    }

    private void assertInvalid(String topic, String payload, String expectedMessagePart) {
        assertThatThrownBy(() -> parser.parse(topic, payload))
                .isInstanceOf(InvalidEventException.class)
                .hasMessageContaining(expectedMessagePart);
    }

    private static String envelope(String eventType, String domainFields) {
        return "{\"eventId\":\"" + EVENT_ID + "\",\"eventType\":\"" + eventType
                + "\",\"occurredAt\":\"2026-10-01T08:00:00Z\",\"version\":1," + domainFields + "}";
    }

    private static String accessFields(String result) {
        return "\"attemptId\":1,\"memberId\":7,\"result\":\"" + result + "\",\"reason\":\"OK\"";
    }
}
