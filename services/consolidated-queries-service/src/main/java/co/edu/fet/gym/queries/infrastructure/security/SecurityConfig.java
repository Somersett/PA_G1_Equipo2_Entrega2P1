package co.edu.fet.gym.queries.infrastructure.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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

/**
 * HTTP Basic, mecanismo inicial de autenticación del proyecto (RNF-07). Solo el health check es
 * público; la API de lectura exige la credencial del cliente interno.
 */
@Configuration
class SecurityConfig {

    static final String REALM = "consolidated-queries-service";

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        var entryPoint = new JsonAuthenticationEntryPoint(REALM);
        http.csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .anyRequest().authenticated())
                .httpBasic(basic -> basic.realmName(REALM).authenticationEntryPoint(entryPoint))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(entryPoint));
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    UserDetailsService apiClients(ApiCredentialsProperties credentials, PasswordEncoder passwordEncoder) {
        return new InMemoryUserDetailsManager(User.withUsername(credentials.username())
                .password(passwordEncoder.encode(credentials.password()))
                .authorities(AuthorityUtils.NO_AUTHORITIES)
                .build());
    }
}
