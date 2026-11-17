package co.edu.fet.gym.gateway.infrastructure.client;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

@Configuration
class GymPlatformClientConfig {

    /** Mismo cliente que el del servicio de consultas: timeout de socket por lectura y Basic en UTF-8. */
    @Bean
    RestClient gymPlatformRestClient(RestClient.Builder builder, GymPlatformClientProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.connectTimeout());
        requestFactory.setReadTimeout(properties.readTimeout());
        return builder.baseUrl(properties.baseUrl().toString())
                .requestFactory(requestFactory)
                .defaultHeaders(headers -> headers.setBasicAuth(properties.username(), properties.password(),
                        StandardCharsets.UTF_8))
                .build();
    }
}