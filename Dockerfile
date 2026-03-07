# syntax=docker/dockerfile:1

FROM node:20-alpine AS miniapp-build
WORKDIR /frontend-mini
COPY plant-care-mini-app/package.json ./
RUN npm install
COPY plant-care-mini-app ./
RUN npm run build

FROM node:20-alpine AS pwa-build
ARG VITE_API_BASE_URL=
ARG VITE_TELEGRAM_BOT_USERNAME=
ARG VITE_PWA_URL=
WORKDIR /frontend-pwa
COPY plant-care-pwa/package.json ./
RUN npm install
COPY plant-care-pwa ./
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_TELEGRAM_BOT_USERNAME=${VITE_TELEGRAM_BOT_USERNAME}
ENV VITE_PWA_URL=${VITE_PWA_URL}
RUN npm run build

FROM gradle:8.6-jdk17 AS build
WORKDIR /app
COPY build.gradle settings.gradle gradle.properties ./
COPY src ./src
COPY --from=miniapp-build /frontend-mini/dist ./src/main/resources/static/mini-app
COPY --from=pwa-build /frontend-pwa/dist ./src/main/resources/static/pwa
RUN gradle -q bootJar

FROM eclipse-temurin:17-jre
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/build/libs/plant-bot-0.1.0.jar /app/app.jar
ENV JAVA_OPTS=""
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
