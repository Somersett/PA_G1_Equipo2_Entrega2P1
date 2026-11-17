package co.edu.fet.gym.queries.infrastructure.kafka;

import co.edu.fet.gym.queries.domain.event.AccessAttemptRecorded;
import co.edu.fet.gym.queries.domain.event.EventType;
import co.edu.fet.gym.queries.domain.event.IntegrationEvent;
import co.edu.fet.gym.queries.domain.event.InvalidEventException;
import co.edu.fet.gym.queries.domain.event.MemberRegistered;
import co.edu.fet.gym.queries.domain.event.MembershipActivated;
import co.edu.fet.gym.queries.domain.event.MembershipCreated;
import co.edu.fet.gym.queries.domain.event.MembershipExpired;
import co.edu.fet.gym.queries.domain.model.AccessResult;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Convierte un mensaje Kafka en un {@link IntegrationEvent} validando el sobre común y los campos
 * de dominio obligatorios de contracts/kafka/events.yaml. Los campos desconocidos se ignoran para
 * admitir evolución compatible del contrato.
 */
@Component
public class IntegrationEventParser {

    static final int SUPPORTED_VERSION = 1;

    /**
     * Años admitidos en fechas. Fuera de este rango PostgreSQL rechazaría el valor en cada reintento y
     * bloquearía el consumidor; se trata como evento inválido.
     */
    private static final int MIN_YEAR = 1;
    private static final int MAX_YEAR = 9999;

    private static final Pattern UUID_FORMAT =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private static final Map<String, Set<EventType>> EVENTS_BY_TOPIC = Map.of(
            KafkaTopics.MEMBERS, EnumSet.of(EventType.MEMBER_REGISTERED),
            KafkaTopics.MEMBERSHIPS, EnumSet.of(
                    EventType.MEMBERSHIP_CREATED, EventType.MEMBERSHIP_ACTIVATED, EventType.MEMBERSHIP_EXPIRED),
            KafkaTopics.ACCESS, EnumSet.of(EventType.ACCESS_GRANTED, EventType.ACCESS_DENIED));

    private final JsonMapper jsonMapper;

    public IntegrationEventParser(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    public IntegrationEvent parse(String topic, String payload) {
        JsonNode root = readObject(payload);
        EventFields fields = new EventFields(root, null);
        UUID eventId = fields.uuid("eventId");
        fields = new EventFields(root, eventId);

        EventType eventType = fields.eventType();
        if (!EVENTS_BY_TOPIC.getOrDefault(topic, Set.of()).contains(eventType)) {
            throw fields.invalid(eventType + " no pertenece al tópico " + topic);
        }
        OffsetDateTime occurredAt = fields.dateTime("occurredAt");
        long version = fields.integer("version");
        if (version != SUPPORTED_VERSION) {
            throw fields.invalid("versión " + version + " no soportada; se esperaba " + SUPPORTED_VERSION);
        }

        return switch (eventType) {
            case MEMBER_REGISTERED -> new MemberRegistered(eventId, occurredAt,
                    fields.id("memberId"),
                    fields.text("document"),
                    fields.text("name"),
                    fields.text("phone"),
                    fields.optionalText("email"),
                    fields.dateTime("createdAt"));
            case MEMBERSHIP_CREATED -> {
                fields.requireConstant("status", "PENDING");
                yield new MembershipCreated(eventId, occurredAt,
                        fields.id("membershipId"), fields.id("memberId"), fields.id("planId"));
            }
            case MEMBERSHIP_ACTIVATED -> {
                fields.requireConstant("status", "ACTIVE");
                LocalDate startDate = fields.date("startDate");
                LocalDate endDate = fields.date("endDate");
                if (endDate.isBefore(startDate)) {
                    throw fields.invalid("endDate es anterior a startDate");
                }
                yield new MembershipActivated(eventId, occurredAt,
                        fields.id("membershipId"), fields.id("memberId"), startDate, endDate);
            }
            case MEMBERSHIP_EXPIRED -> {
                fields.requireConstant("status", "EXPIRED");
                yield new MembershipExpired(eventId, occurredAt,
                        fields.id("membershipId"), fields.id("memberId"), fields.date("endDate"));
            }
            case ACCESS_GRANTED, ACCESS_DENIED -> {
                fields.requireConstant("result", eventType.name());
                yield new AccessAttemptRecorded(eventId, occurredAt,
                        fields.id("attemptId"), fields.id("memberId"),
                        AccessResult.valueOf(eventType.name()), fields.text("reason"));
            }
        };
    }

    private JsonNode readObject(String payload) {
        if (payload == null || payload.isBlank()) {
            throw new InvalidEventException("Mensaje vacío");
        }
        JsonNode root;
        try {
            root = jsonMapper.readTree(payload);
        } catch (JacksonException e) {
            throw new InvalidEventException("El mensaje no es JSON válido", e);
        }
        if (root == null || !root.isObject()) {
            throw new InvalidEventException("El mensaje debe ser un objeto JSON");
        }
        return root;
    }

    /** Lectura tipada de campos; los mensajes de error identifican el evento cuando el eventId ya es conocido. */
    private record EventFields(JsonNode root, UUID eventId) {

        UUID uuid(String name) {
            String value = text(name);
            if (!UUID_FORMAT.matcher(value).matches()) {
                throw invalid(name + " no es un UUID");
            }
            return UUID.fromString(value);
        }

        EventType eventType() {
            String value = text("eventType");
            try {
                return EventType.valueOf(value);
            } catch (IllegalArgumentException e) {
                throw invalid("eventType desconocido: " + value);
            }
        }

        String text(String name) {
            JsonNode node = required(name);
            if (!node.isString() || node.stringValue().isBlank()) {
                throw invalid(name + " debe ser un texto no vacío");
            }
            return storable(name, node.stringValue());
        }

        String optionalText(String name) {
            JsonNode node = root.get(name);
            if (node == null || node.isNull()) {
                return null;
            }
            if (!node.isString()) {
                throw invalid(name + " debe ser texto o null");
            }
            return node.stringValue().isBlank() ? null : storable(name, node.stringValue());
        }

        long integer(String name) {
            JsonNode node = required(name);
            if (!node.isIntegralNumber() || !node.canConvertToLong()) {
                throw invalid(name + " debe ser un entero");
            }
            return node.longValue();
        }

        long id(String name) {
            long value = integer(name);
            if (value < 1) {
                throw invalid(name + " debe ser mayor o igual que 1");
            }
            return value;
        }

        OffsetDateTime dateTime(String name) {
            String value = text(name);
            OffsetDateTime parsed;
            try {
                parsed = OffsetDateTime.parse(value);
            } catch (DateTimeParseException e) {
                throw invalid(name + " debe tener formato date-time ISO 8601 con zona horaria");
            }
            requireYearInRange(name, parsed.getYear());
            return parsed;
        }

        LocalDate date(String name) {
            String value = text(name);
            LocalDate parsed;
            try {
                parsed = LocalDate.parse(value);
            } catch (DateTimeParseException e) {
                throw invalid(name + " debe tener formato date ISO 8601 (yyyy-MM-dd)");
            }
            requireYearInRange(name, parsed.getYear());
            return parsed;
        }

        void requireConstant(String name, String expected) {
            String value = text(name);
            if (!expected.equals(value)) {
                throw invalid(name + " debe ser " + expected + " y es " + value);
            }
        }

        /** PostgreSQL no admite el carácter NUL en columnas de texto. */
        private String storable(String name, String value) {
            if (value.indexOf('\u0000') >= 0) {
                throw invalid(name + " contiene el carácter NUL");
            }
            return value;
        }

        private void requireYearInRange(String name, int year) {
            if (year < MIN_YEAR || year > MAX_YEAR) {
                throw invalid(name + " tiene un año fuera del rango " + MIN_YEAR + "-" + MAX_YEAR);
            }
        }

        InvalidEventException invalid(String reason) {
            String prefix = eventId == null ? "Evento inválido: " : "Evento " + eventId + " inválido: ";
            return new InvalidEventException(prefix + reason);
        }

        private JsonNode required(String name) {
            JsonNode node = root.get(name);
            if (node == null || node.isNull()) {
                throw invalid("falta el campo obligatorio " + name);
            }
            return node;
        }
    }
}
