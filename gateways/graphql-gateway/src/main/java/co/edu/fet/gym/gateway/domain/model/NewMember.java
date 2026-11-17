package co.edu.fet.gym.gateway.domain.model;

/** Datos de RegisterMemberInput. Las reglas de validación son de Members Service, no del gateway. */
public record NewMember(String document, String name, String phone, String email) {
}