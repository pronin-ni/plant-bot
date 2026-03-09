package com.example.plantbot.security;

import com.example.plantbot.domain.User;
import com.example.plantbot.domain.UserRole;
import com.example.plantbot.repository.UserRepository;
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
import java.util.Set;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {
  private final JwtService jwtService;
  private final UserRepository userRepository;

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
      User user = userRepository.findById(userId).orElse(null);

      List<SimpleGrantedAuthority> authorities;
      String username;
      String email;
      Long telegramId;

      if (user != null) {
        Set<UserRole> roles = user.getRoles() == null || user.getRoles().isEmpty()
            ? Set.of(UserRole.ROLE_USER)
            : user.getRoles();
        authorities = roles.stream()
            .map(Enum::name)
            .map(SimpleGrantedAuthority::new)
            .toList();
        username = user.getUsername();
        email = user.getEmail();
        telegramId = user.getTelegramId();
      } else {
        authorities = jwtService.extractRoles(claims).stream()
            .map(SimpleGrantedAuthority::new)
            .toList();
        username = claims.get("username", String.class);
        email = claims.get("email", String.class);
        telegramId = claims.get("telegramId", Long.class);
      }

      PwaPrincipal principal = new PwaPrincipal(
          userId,
          username,
          email,
          telegramId
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
