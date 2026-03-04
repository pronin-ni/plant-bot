package com.example.plantbot.service;

import com.example.plantbot.domain.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class TelegramInitDataService {
  private final ObjectMapper objectMapper;
  private final UserService userService;

  @Value("${bot.token:}")
  private String botToken;

  @Value("${telegram.auth.max-age-seconds:86400}")
  private long maxAgeSeconds;

  @Value("${app.dev-auth-enabled:false}")
  private boolean devAuthEnabled;

  @Value("${app.dev-telegram-id:999000111}")
  private long devTelegramId;

  @Value("${app.dev-username:dev_user}")
  private String devUsername;

  public User validateAndResolveUser(String initData) {
    if (initData == null || initData.isBlank()) {
      if (devAuthEnabled) {
        return userService.getOrCreateByTelegramData(devTelegramId, devUsername, "Dev", "User");
      }
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "X-Telegram-Init-Data пустой");
    }
    if (botToken == null || botToken.isBlank()) {
      if (devAuthEnabled) {
        return userService.getOrCreateByTelegramData(devTelegramId, devUsername, "Dev", "User");
      }
      throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не настроен bot.token");
    }

    Map<String, String> params = parseQuery(initData);
    String hash = params.remove("hash");
    if (hash == null || hash.isBlank()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Отсутствует hash в initData");
    }

    long authDate = parseLong(params.get("auth_date"));
    if (authDate <= 0) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Некорректный auth_date");
    }
    long age = Math.abs(Instant.now().getEpochSecond() - authDate);
    if (age > Math.max(60, maxAgeSeconds)) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "initData просрочен");
    }

    String dataCheckString = params.entrySet().stream()
        .sorted(Comparator.comparing(Map.Entry::getKey))
        .map(entry -> entry.getKey() + "=" + entry.getValue())
        .reduce((a, b) -> a + "\n" + b)
        .orElse("");

    String calculated = calculateHash(dataCheckString, botToken);
    if (!constantTimeEquals(calculated, hash.toLowerCase())) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "initData hash не прошел проверку");
    }

    String userRaw = params.get("user");
    if (userRaw == null || userRaw.isBlank()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "В initData отсутствует user");
    }

    try {
      JsonNode userNode = objectMapper.readTree(userRaw);
      long telegramId = userNode.path("id").asLong(0);
      if (telegramId <= 0) {
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Некорректный telegram user id");
      }
      String username = blankToNull(userNode.path("username").asText(null));
      String firstName = blankToNull(userNode.path("first_name").asText(null));
      String lastName = blankToNull(userNode.path("last_name").asText(null));
      return userService.getOrCreateByTelegramData(telegramId, username, firstName, lastName);
    } catch (ResponseStatusException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Некорректный user в initData");
    }
  }

  private Map<String, String> parseQuery(String initData) {
    Map<String, String> result = new HashMap<>();
    String[] pairs = initData.split("&");
    for (String pair : pairs) {
      if (pair == null || pair.isBlank()) {
        continue;
      }
      int idx = pair.indexOf('=');
      if (idx <= 0) {
        continue;
      }
      String key = urlDecode(pair.substring(0, idx));
      String value = urlDecode(pair.substring(idx + 1));
      result.put(key, value);
    }
    return result;
  }

  private String urlDecode(String value) {
    return URLDecoder.decode(value, StandardCharsets.UTF_8);
  }

  private long parseLong(String value) {
    try {
      return Long.parseLong(value);
    } catch (Exception ex) {
      return -1;
    }
  }

  private String calculateHash(String dataCheckString, String token) {
    try {
      byte[] secret = hmacSha256("WebAppData".getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8));
      byte[] signature = hmacSha256(secret, dataCheckString.getBytes(StandardCharsets.UTF_8));
      return hex(signature);
    } catch (Exception ex) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Ошибка проверки подписи initData");
    }
  }

  private byte[] hmacSha256(byte[] key, byte[] data) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(key, "HmacSHA256"));
    return mac.doFinal(data);
  }

  private String hex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      sb.append(String.format("%02x", b));
    }
    return sb.toString();
  }

  private boolean constantTimeEquals(String a, String b) {
    if (a == null || b == null || a.length() != b.length()) {
      return false;
    }
    int result = 0;
    for (int i = 0; i < a.length(); i++) {
      result |= a.charAt(i) ^ b.charAt(i);
    }
    return result == 0;
  }

  private String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    return value.isBlank() ? null : value;
  }
}
