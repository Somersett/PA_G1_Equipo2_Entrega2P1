package co.edu.fet.gym.gateway.domain.model;

import java.time.OffsetDateTime;
import java.util.List;

public record SystemStatus(boolean ready, OffsetDateTime checkedAt, List<SystemComponent> components) {
}