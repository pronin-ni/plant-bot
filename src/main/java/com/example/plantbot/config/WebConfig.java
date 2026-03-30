package com.example.plantbot.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
  private final AdminRateLimitInterceptor adminRateLimitInterceptor;

  public WebConfig(AdminRateLimitInterceptor adminRateLimitInterceptor) {
    this.adminRateLimitInterceptor = adminRateLimitInterceptor;
  }

  @Value("${web.cors.allowed-origins:*}")
  private String allowedOrigins;

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    String[] origins = allowedOrigins.split(",");
    registry.addMapping("/api/**")
        .allowedOriginPatterns(origins)
        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .allowedHeaders("*")
        .exposedHeaders("*");
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(adminRateLimitInterceptor).addPathPatterns("/api/admin/**");
  }
}
