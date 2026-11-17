# Contexto de construcción: services/consolidated-queries-service
FROM maven:3.9.11-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src/ src/
# Las pruebas usan Testcontainers y se ejecutan fuera de la imagen (./mvnw test).
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:17-jre
RUN useradd --system --uid 10001 --no-create-home app
COPY --from=build /workspace/target/consolidated-queries-service-*.jar /app/app.jar
USER app
EXPOSE 8085
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
