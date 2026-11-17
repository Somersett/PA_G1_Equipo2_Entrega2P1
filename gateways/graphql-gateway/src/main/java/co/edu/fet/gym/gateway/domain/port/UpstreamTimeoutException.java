package co.edu.fet.gym.gateway.domain.port;

/** El servicio no completó la conexión o la respuesta dentro de los timeouts configurados. */
public class UpstreamTimeoutException extends RuntimeException {

    private final Upstream upstream;

    public UpstreamTimeoutException(Upstream upstream, String message, Throwable cause) {
        super(message, cause);
        this.upstream = upstream;
    }

    public Upstream upstream() {
        return upstream;
    }
}