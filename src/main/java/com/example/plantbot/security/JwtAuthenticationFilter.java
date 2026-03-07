package com.example.plantbot.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {
  private final JwtService jwtService;

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String authHeader = request.getHeader("Authorization");
    if (authHeader == null || !authHeader.startsWith("Bearer ")) {
      filterChain.doFilter(request, response);
      return;
    }

    String token = authHeader.substring(7).trim();
    try {
      Claims claims = jwtService.parse(token);
      Long userId = Long.parseLong(claims.getSubject());
      List<SimpleGrantedAuthority> authorities = jwtService.extractRoles(claims).stream()
          .map(SimpleGrantedAuthority::new)
          .toList();

      PwaPrincipal principal = new PwaPrincipal(
          userId,
          claims.get("username", String.class),
          claims.get("email", String.class),
          claims.get("telegramId", Long.class)
      );

      UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
          principal,
          null,
          authorities
      );
      authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
      SecurityContextHolder.getContext().setAuthentication(authentication);
    } catch (Exception ignored) {
      SecurityContextHolder.clearContext();
    }

    filterChain.doFilter(request, response);
  }
}
