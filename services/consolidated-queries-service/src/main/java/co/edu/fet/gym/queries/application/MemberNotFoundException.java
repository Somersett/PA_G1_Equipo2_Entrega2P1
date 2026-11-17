package co.edu.fet.gym.queries.application;

public class MemberNotFoundException extends RuntimeException {

    private final long memberId;

    public MemberNotFoundException(long memberId) {
        super("No existe una vista consolidada para el miembro " + memberId);
        this.memberId = memberId;
    }

    public long memberId() {
        return memberId;
    }
}
