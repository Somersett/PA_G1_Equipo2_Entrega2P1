package co.edu.fet.gym.queries.domain.event;

/**
 * El mensaje no cumple el contrato de eventos o contradice el estado proyectado. Reintentarlo no
 * cambia el resultado, por lo que el consumidor no lo reintenta.
 */
public class InvalidEventException extends RuntimeException {

    public InvalidEventException(String message) {
        super(message);
    }

    public InvalidEventException(String message, Throwable cause) {
        super(message, cause);
    }
}
