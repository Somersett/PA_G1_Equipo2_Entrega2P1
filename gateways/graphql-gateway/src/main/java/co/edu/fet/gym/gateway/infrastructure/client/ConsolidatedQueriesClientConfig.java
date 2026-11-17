package co.edu.fet.gym.gateway.infrastructure.client;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

@Configuration
class ConsolidatedQueriesClientConfig {

    /**
     * HttpURLConnection con timeout de socket: el de lectura aplica a cada lectura, incluido el cuerpo
     * (verificado en ConsolidatedQueriesHttpClientTest#bodyStalledAfterHeadersExceedsReadTimeout).
     */
    @Bean
    RestClient consolidatedQueriesRestClient(RestClient.Builder builder, ConsolidatedQueriesClientProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.connectTimeout());
        requestFactory.setReadTimeout(properties.readTimeout());
        return builder.baseUrl(properties.baseUrl().toString())
                .requestFactory(requestFactory)
                // UTF-8, como lo decodifica Spring Security: la codificación por defecto es ISO-8859-1.
                .defaultHeaders(headers -> headers.setBasicAuth(properties.username(), properties.password(),
                        StandardCharsets.UTF_8))
                .build();
    }
}
