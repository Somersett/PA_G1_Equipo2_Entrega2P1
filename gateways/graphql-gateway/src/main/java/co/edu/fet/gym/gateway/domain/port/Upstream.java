package co.edu.fet.gym.gateway.domain.port;

/** Servicios que consulta el gateway, con los mensajes que ve el cliente cuando fallan. */
public enum Upstream {
    CONSOLIDATED_QUERIES(
            "El servicio de consultas consolidadas no está disponible",
            "El servicio de consultas consolidadas no respondió a tiempo"),
    GYM_PLATFORM(
            "Los servicios de miembros, membresías, pagos y accesos no están disponibles",
            "Los servicios de miembros, membresías, pagos y accesos no respondieron a tiempo");

    private final String unavailableMessage;
    private final String timeoutMessage;

    Upstream(String unavailableMessage, String timeoutMessage) {
        this.unavailableMessage = unavailableMessage;
        this.timeoutMessage = timeoutMessage;
    }

    public String unavailableMessage() {
        return unavailableMessage;
    }

    public String timeoutMessage() {
        return timeoutMessage;
    }
}