package co.edu.fet.gym.gateway.domain.port;

/**
 * El servicio rechazó la operación con un ErrorResponse del contrato (400, 404, 409 o 422): una regla de
 * negocio o una validación del dominio. El código y el mensaje son del servicio y se entregan al cliente.
 */
public class UpstreamRejectedException extends RuntimeException {

    private final int status;
    private final String code;

    public UpstreamRejectedException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }
}