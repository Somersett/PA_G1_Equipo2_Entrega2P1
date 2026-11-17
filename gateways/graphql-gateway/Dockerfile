# Contexto de construcción: raíz del repositorio, porque el esquema se toma de contracts/graphql.
FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /workspace/gateways/graphql-gateway
COPY gateways/graphql-gateway/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY contracts/graphql/ /workspace/contracts/graphql/
COPY gateways/graphql-gateway/src/ src/
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:17-jre
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /workspace/gateways/graphql-gateway/target/graphql-gateway-*.jar /app/app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
