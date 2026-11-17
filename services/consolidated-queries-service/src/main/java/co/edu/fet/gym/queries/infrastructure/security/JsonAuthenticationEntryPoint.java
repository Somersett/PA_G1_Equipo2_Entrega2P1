package co.edu.fet.gym.queries.infrastructure.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** 401 con el cuerpo ErrorResponse {code, message} que usan los contratos del proyecto. */
class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private static final String BODY = "{\"code\":\"UNAUTHORIZED\",\"message\":\"Se requiere autenticación\"}";

    private final String realm;

    JsonAuthenticationEntryPoint(String realm) {
        this.realm = realm;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"" + realm + "\"");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(BODY);
    }
}
