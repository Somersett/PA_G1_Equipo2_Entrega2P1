package co.edu.fet.gym.gateway.domain.port;

/**
 * El servicio no acepta conexiones, respondió con un error 5xx o el gateway cortó la llamada porque el
 * servicio lleva varios fallos seguidos (circuito abierto). {@link #code()} lleva, si existe, el código con
 * que el servicio explicó el 5xx (por ejemplo {@code STARTING} o {@code DATABASE_UNAVAILABLE}) o
 * {@link #CIRCUIT_OPEN}.
 */
public class UpstreamUnavailableException extends RuntimeException {

    /** El gateway no llamó al servicio porque su circuito está abierto. */
    public static final String CIRCUIT_OPEN = "CIRCUIT_OPEN";

    private final Upstream upstream;
    private final String code;

    public UpstreamUnavailableException(Upstream upstream, String message, Throwable cause) {
        this(upstream, message, cause, null);
    }

    public UpstreamUnavailableException(Upstream upstream, String message, Throwable cause, String code) {
        super(message, cause);
        this.upstream = upstream;
        this.code = code;
    }

    public Upstream upstream() {
        return upstream;
    }

    /** Código del servicio o del gateway que explica la indisponibilidad; {@code null} si no hay. */
    public String code() {
        return code;
    }
}
