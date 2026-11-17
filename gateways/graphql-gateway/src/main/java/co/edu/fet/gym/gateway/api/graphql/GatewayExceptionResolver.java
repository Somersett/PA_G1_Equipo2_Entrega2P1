package co.edu.fet.gym.gateway.api.graphql;

import co.edu.fet.gym.gateway.application.InvalidArgumentException;
import co.edu.fet.gym.gateway.domain.port.UpstreamRejectedException;
import co.edu.fet.gym.gateway.domain.port.UpstreamTimeoutException;
import co.edu.fet.gym.gateway.domain.port.UpstreamUnavailableException;
import graphql.ErrorClassification;
import graphql.GraphQLError;
import graphql.GraphqlErrorBuilder;
import graphql.schema.DataFetchingEnvironment;
import org.springframework.graphql.execution.DataFetcherExceptionResolverAdapter;
import org.springframework.graphql.execution.ErrorType;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Traduce los errores conocidos a errores GraphQL con mensajes que no revelan detalles internos
 * (hosts, puertos, trazas). Los rechazos de dominio conservan el código y el mensaje del servicio en
 * {@code extensions.code}. Las fallas de un servicio indican cuál falló en {@code extensions.upstream}
 * ({@code GYM_PLATFORM} o {@code CONSOLIDATED_QUERIES}) y, si se conoce, el motivo en {@code extensions.code}
 * ({@code STARTING}, {@code DATABASE_UNAVAILABLE}, {@code CIRCUIT_OPEN}...), para que el cliente explique el
 * problema y su posible solución. Los demás quedan en el resolver por defecto de Spring for GraphQL, que
 * responde INTERNAL_ERROR con un identificador de ejecución.
 */
@Component
class GatewayExceptionResolver extends DataFetcherExceptionResolverAdapter {

    @Override
    protected GraphQLError resolveToSingleError(Throwable exception, DataFetchingEnvironment environment) {
        if (exception instanceof InvalidArgumentException) {
            return error(environment, ErrorType.BAD_REQUEST, exception.getMessage(), Map.of());
        }
        if (exception instanceof UpstreamRejectedException rejected) {
            return error(environment, classify(rejected.status()), rejected.getMessage(), Map.of("code", rejected.code()));
        }
        if (exception instanceof UpstreamTimeoutException timeout) {
            return error(environment, GatewayErrorType.UPSTREAM_TIMEOUT, timeout.upstream().timeoutMessage(),
                    Map.of("upstream", timeout.upstream().name()));
        }
        if (exception instanceof UpstreamUnavailableException unavailable) {
            Map<String, Object> extensions = new LinkedHashMap<>();
            extensions.put("upstream", unavailable.upstream().name());
            if (unavailable.code() != null) {
                extensions.put("code", unavailable.code());
            }
            return error(environment, GatewayErrorType.UPSTREAM_UNAVAILABLE, unavailable.upstream().unavailableMessage(),
                    extensions);
        }
        return null;
    }

    private static ErrorClassification classify(int status) {
        return switch (status) {
            case 404 -> ErrorType.NOT_FOUND;
            case 409 -> GatewayErrorType.CONFLICT;
            default -> ErrorType.BAD_REQUEST;
        };
    }

    private static GraphQLError error(DataFetchingEnvironment environment, ErrorClassification type, String message,
                                      Map<String, Object> extensions) {
        return GraphqlErrorBuilder.newError(environment).errorType(type).message(message).extensions(extensions).build();
    }
}
