package co.edu.fet.gym.queries;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class ConsolidatedQueriesApplication {

    public static void main(String[] args) {
        SpringApplication.run(ConsolidatedQueriesApplication.class, args);
    }
}
