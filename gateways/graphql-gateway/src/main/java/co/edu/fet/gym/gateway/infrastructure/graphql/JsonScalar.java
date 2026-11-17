package co.edu.fet.gym.gateway.infrastructure.graphql;

import graphql.GraphQLContext;
import graphql.execution.CoercedVariables;
import graphql.language.Value;
import graphql.schema.Coercing;
import graphql.schema.CoercingParseLiteralException;
import graphql.schema.CoercingParseValueException;
import graphql.schema.GraphQLScalarType;

import java.util.Locale;

/**
 * Escalar {@code JSON} del contrato, solo de salida: entrega tal cual el valor ya decodificado (mapas,
 * listas, texto, números o booleanos), que Jackson serializa en la respuesta.
 */
final class JsonScalar {

    static final GraphQLScalarType JSON = GraphQLScalarType.newScalar()
            .name("JSON")
            .description("Valor JSON arbitrario (objeto, lista, texto, número o booleano). Solo de salida.")
            .coercing(new Coercing<Object, Object>() {

                @Override
                public Object serialize(Object value, GraphQLContext context, Locale locale) {
                    return value;
                }

                @Override
                public Object parseValue(Object input, GraphQLContext context, Locale locale) {
                    throw new CoercingParseValueException("JSON solo se usa en respuestas");
                }

                @Override
                public Object parseLiteral(Value<?> input, CoercedVariables variables, GraphQLContext context,
                                           Locale locale) {
                    throw new CoercingParseLiteralException("JSON solo se usa en respuestas");
                }
            })
            .build();

    private JsonScalar() {
    }
}
