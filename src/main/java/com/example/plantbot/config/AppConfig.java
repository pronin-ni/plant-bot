package com.example.plantbot.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class AppConfig {
  @Bean
  public RestTemplate restTemplate(
      RestTemplateBuilder builder,
      @Value("${http.client.connect-timeout-ms:5000}") int connectTimeoutMs,
      @Value("${http.client.read-timeout-ms:15000}") int readTimeoutMs
  ) {
    return builder
        .setConnectTimeout(Duration.ofMillis(Math.max(1000, connectTimeoutMs)))
        .setReadTimeout(Duration.ofMillis(Math.max(1000, readTimeoutMs)))
        .build();
  }
}
