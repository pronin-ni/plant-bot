package com.example.plantbot.service.auth;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
@Slf4j
public class ResendEmailService implements EmailService {
  private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(12);
  private static final DateTimeFormatter EXPIRES_FORMATTER =
      DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
          .withLocale(new Locale("ru", "RU"))
          .withZone(ZoneId.of("Europe/Moscow"));

  private final WebClient webClient;

  @Value("${resend.api-key:}")
  private String apiKey;

  @Value("${resend.from-email:resend-default@resend.dev}")
  private String fromEmail;

  @Value("${resend.domain-name:}")
  private String domainName;

  @Value("${resend.from-local-part:no-reply}")
  private String fromLocalPart;

  @Value("${resend.auto-from-enabled:true}")
  private boolean autoFromEnabled;

  @Value("${resend.auto-from-cache-seconds:600}")
  private long autoFromCacheSeconds;

  @Value("${app.name:Мои Растения}")
  private String appName;

  private volatile String cachedAutoFrom;
  private volatile Instant cachedAutoFromAt;

  public ResendEmailService(
      WebClient.Builder webClientBuilder,
      @Value("${resend.base-url:https://api.resend.com}") String baseUrl
  ) {
    this.webClient = webClientBuilder
        .baseUrl(baseUrl)
        .build();
  }

  @Override
  public void sendMagicLinkEmail(String recipientEmail, String verifyUrl, Instant expiresAt) {
    if (apiKey == null || apiKey.isBlank()) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Email отправка не настроена (resend.api-key)");
    }
    if (recipientEmail == null || recipientEmail.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email получателя не указан");
    }

    String senderEmail = resolveSenderEmail();
    String html = buildMagicLinkHtml(verifyUrl, expiresAt);
    Map<String, Object> body = Map.of(
        "from", senderEmail,
        "to", List.of(recipientEmail),
        "subject", "Вход в Мои Растения - просто кликните",
        "html", html
    );

    try {
      webClient.post()
          .uri("/emails")
          .header("Authorization", "Bearer " + apiKey)
          .contentType(MediaType.APPLICATION_JSON)
          .bodyValue(body)
          .retrieve()
          .onStatus(HttpStatusCode::isError, response -> response.bodyToMono(String.class)
              .defaultIfEmpty("")
              .flatMap(errorBody -> {
                log.warn("Resend send failed: status={}, body={}", response.statusCode().value(), errorBody);
                return Mono.error(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Не удалось отправить письмо со ссылкой"));
              }))
          .toBodilessEntity()
          .block(REQUEST_TIMEOUT);
    } catch (ResponseStatusException ex) {
      throw ex;
    } catch (Exception ex) {
      log.warn("Resend request error: {}", ex.getMessage());
      throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Сервис отправки писем временно недоступен");
    }
  }

  private String buildMagicLinkHtml(String verifyUrl, Instant expiresAt) {
    String safeAppName = escapeHtml(appName == null || appName.isBlank() ? "Мои Растения" : appName);
    String safeUrl = escapeHtml(verifyUrl);
    String expiresText = expiresAt == null ? "20 минут" : EXPIRES_FORMATTER.format(expiresAt) + " (МСК)";

    return """
        <div style="margin:0;padding:24px;background:#f4f8f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#183328;">
          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(26,93,56,0.12);">
            <tr>
              <td style="padding:28px 28px 12px 28px;background:linear-gradient(135deg,#e9f9ef,#f5fff8);">
                <div style="font-size:24px;font-weight:700;line-height:1.2;">%s</div>
                <div style="margin-top:8px;font-size:14px;color:#456b56;">Волшебная ссылка для входа без пароля</div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#2f4b3b;">
                  Нажмите на кнопку ниже, чтобы безопасно войти в приложение.
                </p>
                <a href="%s" style="display:inline-block;padding:14px 26px;border-radius:999px;background:linear-gradient(135deg,#2cae63,#1f8a4e);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">
                  Войти в приложение
                </a>
                <p style="margin:18px 0 0 0;font-size:13px;line-height:1.6;color:#5a7a67;">
                  Ссылка активна до <strong>%s</strong>.
                </p>
                <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#7f9a8b;">
                  Если кнопка не открывается, вставьте ссылку в браузер:<br/>
                  <span style="word-break:break-all;">%s</span>
                </p>
              </td>
            </tr>
          </table>
        </div>
        """.formatted(safeAppName, safeUrl, escapeHtml(expiresText), safeUrl);
  }

  private String resolveSenderEmail() {
    String configuredFrom = trimToNull(fromEmail);
    boolean canAutoResolve = autoFromEnabled && shouldAutoResolve(configuredFrom);
    if (!canAutoResolve) {
      return configuredFrom == null ? "resend-default@resend.dev" : configuredFrom;
    }

    String autoResolved = resolveFromVerifiedDomain();
    if (autoResolved != null) {
      return autoResolved;
    }

    if (configuredFrom != null && !shouldAutoResolve(configuredFrom)) {
      return configuredFrom;
    }

    log.warn("Resend auto from resolution unavailable, using fallback sender resend-default@resend.dev");
    return "resend-default@resend.dev";
  }

  private boolean shouldAutoResolve(String configuredFrom) {
    if (configuredFrom == null) {
      return true;
    }
    String normalized = configuredFrom.toLowerCase(Locale.ROOT);
    return "auto".equals(normalized) || normalized.endsWith("@resend.dev");
  }

  private String resolveFromVerifiedDomain() {
    long cacheSeconds = Math.max(1L, autoFromCacheSeconds);
    Instant now = Instant.now();
    String cached = cachedAutoFrom;
    Instant cachedAt = cachedAutoFromAt;
    if (cached != null && cachedAt != null && cachedAt.plusSeconds(cacheSeconds).isAfter(now)) {
      return cached;
    }

    String resolved = fetchFromVerifiedDomain();
    if (resolved != null) {
      cachedAutoFrom = resolved;
      cachedAutoFromAt = now;
    }
    return resolved;
  }

  private String fetchFromVerifiedDomain() {
    JsonNode root;
    try {
      root = webClient.get()
          .uri("/domains")
          .header("Authorization", "Bearer " + apiKey)
          .accept(MediaType.APPLICATION_JSON)
          .retrieve()
          .onStatus(HttpStatusCode::isError, response -> response.bodyToMono(String.class)
              .defaultIfEmpty("")
              .flatMap(errorBody -> {
                log.warn("Resend domains list failed: status={}, body={}", response.statusCode().value(), errorBody);
                return Mono.error(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Не удалось получить список доменов Resend"));
              }))
          .bodyToMono(JsonNode.class)
          .block(REQUEST_TIMEOUT);
    } catch (ResponseStatusException ex) {
      log.warn("Resend domains request rejected, fallback sender will be used: status={}, message={}",
          ex.getStatusCode().value(), ex.getReason());
      return null;
    } catch (Exception ex) {
      log.warn("Resend domains request error: {}", ex.getMessage());
      return null;
    }

    if (root == null || !root.has("data") || !root.get("data").isArray()) {
      return null;
    }

    String targetDomain = trimToNull(domainName);
    Optional<JsonNode> selected = Optional.empty();
    for (JsonNode domain : root.get("data")) {
      String candidateName = trimToNull(domain.path("name").asText(null));
      if (candidateName == null || !isVerified(domain)) {
        continue;
      }
      if (targetDomain != null && !candidateName.equalsIgnoreCase(targetDomain)) {
        continue;
      }
      selected = Optional.of(domain);
      break;
    }

    if (selected.isEmpty() && targetDomain == null) {
      for (JsonNode domain : root.get("data")) {
        String candidateName = trimToNull(domain.path("name").asText(null));
        if (candidateName != null && isVerified(domain)) {
          selected = Optional.of(domain);
          break;
        }
      }
    }

    if (selected.isEmpty()) {
      return null;
    }

    String selectedName = trimToNull(selected.get().path("name").asText(null));
    if (selectedName == null) {
      return null;
    }

    String localPart = trimToNull(fromLocalPart);
    if (localPart == null) {
      localPart = "no-reply";
    }
    localPart = localPart.replaceAll("[^a-zA-Z0-9._%+-]", "");
    if (localPart.isBlank()) {
      localPart = "no-reply";
    }
    return localPart + "@" + selectedName;
  }

  private boolean isVerified(JsonNode domain) {
    String status = domain.path("status").asText("");
    String normalized = status.trim().toLowerCase(Locale.ROOT);
    return normalized.contains("verified") || "active".equals(normalized);
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String escapeHtml(String value) {
    if (value == null) {
      return "";
    }
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;");
  }
}
