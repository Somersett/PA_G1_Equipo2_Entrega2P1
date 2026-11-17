package co.edu.fet.gym.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class GraphQlGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(GraphQlGatewayApplication.class, args);
    }
}
