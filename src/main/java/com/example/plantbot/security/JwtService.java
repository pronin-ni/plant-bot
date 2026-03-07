package com.example.plantbot.security;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Set;

@Service
public class JwtService {
  private final SecretKey key;
  private final long ttlSeconds;
  private final String issuer;

  public JwtService(
      @Value("${app.security.jwt.secret:change-me-change-me-change-me-change-me}") String secret,
      @Value("${app.security.jwt.ttl-seconds:2592000}") long ttlSeconds,
      @Value("${app.security.jwt.issuer:plant-care}") String issuer
  ) {
    byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
    if (bytes.length < 32) {
      bytes = String.format("%-32s", secret).replace(' ', '_').getBytes(StandardCharsets.UTF_8);
    }
    this.key = Keys.hmacShaKeyFor(bytes);
    this.ttlSeconds = Math.max(900, ttlSeconds);
    this.issuer = issuer;
  }

  public String issue(User user) {
    Instant now = Instant.now();
    Set<UserRole> roles = user.getRoles() == null || user.getRoles().isEmpty()
        ? Set.of(UserRole.ROLE_USER)
        : user.getRoles();
    return Jwts.builder()
        .subject(String.valueOf(user.getId()))
        .issuer(issuer)
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plusSeconds(ttlSeconds)))
        .claim("roles", roles.stream().map(Enum::name).toList())
        .claim("username", user.getUsername())
        .claim("telegramId", user.getTelegramId())
        .claim("email", user.getEmail())
        .signWith(key)
        .compact();
  }

  public Claims parse(String token) {
    return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
  }

  public long getTtlSeconds() {
    return ttlSeconds;
  }

  @SuppressWarnings("unchecked")
  public List<String> extractRoles(Claims claims) {
    Object raw = claims.get("roles");
    if (raw instanceof List<?> list) {
      return list.stream().map(String::valueOf).toList();
    }
    return List.of();
  }
}
