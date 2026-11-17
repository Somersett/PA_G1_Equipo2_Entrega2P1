package co.edu.fet.gym.queries.api;

/** Mismo formato que ErrorResponse en contracts/openapi/gym-platform-api.yaml. */
record ErrorResponse(String code, String message) {
}
