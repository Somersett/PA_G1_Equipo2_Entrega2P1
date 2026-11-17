package co.edu.fet.gym.queries.infrastructure.kafka;

/** Tópicos de contracts/kafka/events.yaml consumidos por este servicio. */
public final class KafkaTopics {

    public static final String MEMBERS = "members.events";
    public static final String MEMBERSHIPS = "memberships.events";
    public static final String ACCESS = "access.events";

    private KafkaTopics() {
    }
}
