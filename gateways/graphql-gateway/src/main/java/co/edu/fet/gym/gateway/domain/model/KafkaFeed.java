package co.edu.fet.gym.gateway.domain.model;

import java.util.List;

public record KafkaFeed(long lastSeq, List<KafkaEntry> events) {
}