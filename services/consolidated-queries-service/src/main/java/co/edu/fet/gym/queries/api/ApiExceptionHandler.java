package co.edu.fet.gym.queries.api;

import co.edu.fet.gym.queries.application.InvalidQueryException;
import co.edu.fet.gym.queries.application.MemberNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.stream.Collectors;

/**
 * Traduce los errores esperados a ErrorResponse. Los inesperados quedan en el manejo por defecto de
 * Spring Boot, que no expone mensajes ni trazas.
 */
@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(MemberNotFoundException.class)
    ResponseEntity<ErrorResponse> memberNotFound(MemberNotFoundException exception) {
        return error(HttpStatus.NOT_FOUND, "MEMBER_NOT_FOUND", exception.getMessage());
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ErrorResponse> invalidParameters(HandlerMethodValidationException exception) {
        String detail = exception.getParameterValidationResults().stream()
                .map(result -> result.getMethodParameter().getParameterName() + ": " + result.getResolvableErrors()
                        .stream().map(error -> error.getDefaultMessage()).collect(Collectors.joining(", ")))
                .collect(Collectors.joining("; "));
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Parámetros inválidos: " + detail);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ErrorResponse> typeMismatch(MethodArgumentTypeMismatchException exception) {
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST",
                "El parámetro " + exception.getName() + " debe ser un número entero");
    }

    @ExceptionHandler(InvalidQueryException.class)
    ResponseEntity<ErrorResponse> invalidQuery(InvalidQueryException exception) {
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", exception.getMessage());
    }

    private static ResponseEntity<ErrorResponse> error(HttpStatus status, String code, String message) {
        return ResponseEntity.status(status).body(new ErrorResponse(code, message));
    }
}
