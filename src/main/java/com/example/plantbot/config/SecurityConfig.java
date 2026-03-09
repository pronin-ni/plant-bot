package com.example.plantbot.config;

import com.example.plantbot.security.JwtAuthenticationFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {
  private final JwtAuthenticationFilter jwtAuthenticationFilter;

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers(
                "/",
                "/mini-app/**",
                "/actuator/health",
                "/api/auth/email/**",
                "/api/pwa/auth/**",
                "/api/calendar/ics/**"
            ).permitAll()
            .requestMatchers(
                "/api/openrouter/models",
                "/api/openrouter/preferences",
                "/api/openrouter/preferences/**",
                "/api/openrouter/test"
            ).hasRole("ADMIN")
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .anyRequest().permitAll()
        )
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }
}
