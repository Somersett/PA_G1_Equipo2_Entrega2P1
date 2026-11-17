package co.edu.fet.gym.gateway.infrastructure.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * HTTP Basic como autenticación inicial (RNF-07); el contrato no define roles, así que basta con
 * estar autenticado. Solo el health check es público. Sin sesión ni cookies, por lo que CSRF no aplica.
 */
@Configuration
class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .anyRequest().authenticated())
                .httpBasic(basic -> basic.realmName("graphql-gateway"));
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(GatewaySecurityProperties properties) {
        CorsConfiguration graphql = new CorsConfiguration();
        graphql.setAllowedOrigins(properties.allowedOrigins());
        graphql.setAllowedMethods(List.of(HttpMethod.POST.name()));
        graphql.setAllowedHeaders(List.of(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE, HttpHeaders.ACCEPT));
        graphql.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/graphql", graphql);
        return source;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    UserDetailsService graphqlClients(GatewaySecurityProperties properties, PasswordEncoder passwordEncoder) {
        return new InMemoryUserDetailsManager(User.withUsername(properties.clientUsername())
                .password(passwordEncoder.encode(properties.clientPassword()))
                .authorities(AuthorityUtils.NO_AUTHORITIES)
                .build());
    }
}
