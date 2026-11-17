package co.edu.fet.gym.gateway.infrastructure.graphql;

import graphql.GraphQLContext;
import graphql.execution.CoercedVariables;
import graphql.language.StringValue;
import graphql.language.Value;
import graphql.schema.Coercing;
import graphql.schema.CoercingParseLiteralException;
import graphql.schema.CoercingParseValueException;
import graphql.schema.CoercingSerializeException;
import graphql.schema.GraphQLScalarType;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.function.Function;

/** Escalares {@code DateTime} y {@code Date} del contrato: texto ISO 8601. */
final class IsoDateScalars {

    static final GraphQLScalarType DATE_TIME = scalar("DateTime", "Fecha y hora en formato ISO 8601.",
            OffsetDateTime.class, OffsetDateTime::parse, DateTimeFormatter.ISO_OFFSET_DATE_TIME::format);

    static final GraphQLScalarType DATE = scalar("Date", "Fecha calendario en formato ISO 8601.",
            LocalDate.class, LocalDate::parse, DateTimeFormatter.ISO_LOCAL_DATE::format);

    private IsoDateScalars() {
    }

    private static <T> GraphQLScalarType scalar(String name, String description, Class<T> type,
                                                Function<String, T> parser, Function<T, String> formatter) {
        return GraphQLScalarType.newScalar().name(name).description(description).coercing(new Coercing<T, String>() {

            @Override
            public String serialize(Object value, GraphQLContext context, Locale locale) {
                if (type.isInstance(value)) {
                    return formatter.apply(type.cast(value));
                }
                throw new CoercingSerializeException(name + " no puede serializar " + value.getClass().getName());
            }

            @Override
            public T parseValue(Object input, GraphQLContext context, Locale locale) {
                if (input instanceof String text) {
                    try {
                        return parser.apply(text);
                    } catch (DateTimeParseException e) {
                        throw new CoercingParseValueException(name + " inválido: " + text, e);
                    }
                }
                throw new CoercingParseValueException(name + " debe enviarse como texto ISO 8601");
            }

            @Override
            public T parseLiteral(Value<?> input, CoercedVariables variables, GraphQLContext context, Locale locale) {
                if (input instanceof StringValue text) {
                    try {
                        return parser.apply(text.getValue());
                    } catch (DateTimeParseException e) {
                        throw new CoercingParseLiteralException(name + " inválido: " + text.getValue(), e);
                    }
                }
                throw new CoercingParseLiteralException(name + " debe enviarse como texto ISO 8601");
            }
        }).build();
    }
}
