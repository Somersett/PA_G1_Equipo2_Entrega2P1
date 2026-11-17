package co.edu.fet.gym.gateway.domain.model;

public enum ComponentStatus {
    UP,
    DOWN,
    /** No se pudo saber: el componente que lo informa no respondió. */
    UNKNOWN
}
