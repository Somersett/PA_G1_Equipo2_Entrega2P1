package co.edu.fet.gym.gateway.api.graphql;

import graphql.ErrorClassification;

/** Clasificaciones propias, publicadas en {@code errors[].extensions.classification}. */
enum GatewayErrorType implements ErrorClassification {
    UPSTREAM_UNAVAILABLE,
    UPSTREAM_TIMEOUT,
    /** El servicio rechazó el comando por un conflicto con su estado (documento repetido, membresía abierta...). */
    CONFLICT
}
