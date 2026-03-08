package com.example.plantbot.service;

import com.example.plantbot.controller.dto.pwa.PwaPushSubscriptionRequest;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.User;
import com.example.plantbot.domain.WebPushSubscription;
import com.example.plantbot.repository.WebPushSubscriptionRepository;
import com.example.plantbot.util.WateringRecommendation;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Utils;
import org.apache.http.HttpResponse;
import org.apache.http.HttpStatus;
import org.jose4j.lang.JoseException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;

@Service
@RequiredArgsConstructor
@Slf4j
public class WebPushNotificationService {
  private final WebPushSubscriptionRepository subscriptionRepository;
  private final ObjectMapper objectMapper;

  @Value("${web-push.enabled:false}")
  private boolean enabled;

  @Value("${web-push.subject:mailto:plant-bot@example.com}")
  private String subject;

  @Value("${web-push.vapid.public-key:}")
  private String vapidPublicKey;

  @Value("${web-push.vapid.private-key:}")
  private String vapidPrivateKey;

  @Value("${app.public-base-url:http://localhost:8080}")
  private String publicBaseUrl;

  @Transactional(readOnly = true)
  public boolean isEnabled() {
    return enabled && !vapidPublicKey.isBlank() && !vapidPrivateKey.isBlank();
  }

  public String getPublicKey() {
    return isEnabled() ? vapidPublicKey : "";
  }

  @Transactional
  public int subscribe(User user, PwaPushSubscriptionRequest request) {
    if (request == null || request.endpoint() == null || request.endpoint().isBlank() || request.keys() == null
        || request.keys().p256dh() == null || request.keys().p256dh().isBlank()
        || request.keys().auth() == null || request.keys().auth().isBlank()) {
      throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Некорректная push-подписка");
    }

    WebPushSubscription subscription = subscriptionRepository.findByEndpoint(request.endpoint())
        .orElseGet(WebPushSubscription::new);
    subscription.setUser(user);
    subscription.setEndpoint(request.endpoint().trim());
    subscription.setP256dh(request.keys().p256dh().trim());
    subscription.setAuth(request.keys().auth().trim());
    subscription.setUserAgent(request.userAgent());
    if (subscription.getCreatedAt() == null) {
      subscription.setCreatedAt(Instant.now());
    }
    subscriptionRepository.save(subscription);
    return subscriptionRepository.findByUser(user).size();
  }

  @Transactional
  public int unsubscribe(User user, String endpoint) {
    if (endpoint == null || endpoint.isBlank()) {
      return subscriptionRepository.findByUser(user).size();
    }
    subscriptionRepository.deleteByUserAndEndpoint(user, endpoint);
    return subscriptionRepository.findByUser(user).size();
  }

  @Transactional(readOnly = true)
  public int countSubscriptions(User user) {
    return subscriptionRepository.findByUser(user).size();
  }

  @Transactional
  public boolean sendWateringReminder(Plant plant, WateringRecommendation rec) {
    if (!isEnabled() || plant == null || plant.getUser() == null) {
      return false;
    }
    List<WebPushSubscription> subscriptions = subscriptionRepository.findByUser(plant.getUser());
    if (subscriptions.isEmpty()) {
      return false;
    }

    String waterMl = String.valueOf(Math.max(1, (int) Math.round(rec.waterLiters() * 1000.0)));
    LocalDate dueDate = plant.getLastWateredDate().plusDays((long) Math.floor(rec.intervalDays()));

    Map<String, Object> payload = new HashMap<>();
    payload.put("title", "Пора поливать растение");
    payload.put("body", plant.getName() + " • " + waterMl + " мл • до " + dueDate.format(DateTimeFormatter.ofPattern("dd.MM")));
    payload.put("tag", "plant-watering-" + plant.getId());
    payload.put("url", publicBaseUrl + "/mini-app");
    payload.put("plantId", plant.getId());

    String payloadJson = toJson(payload);
    return countDelivered(sendPayload(subscriptions, payloadJson)) > 0;
  }

  @Transactional
  public SendResult sendTestNotification(User user, String title, String body) {
    if (user == null) {
      return new SendResult(0, 0, "Пользователь не найден", List.of());
    }
    if (!isEnabled()) {
      return new SendResult(0, 0, "Web Push отключен на сервере", List.of());
    }
    List<WebPushSubscription> subscriptions = subscriptionRepository.findByUser(user);
    if (subscriptions.isEmpty()) {
      return new SendResult(0, 0, "У пользователя нет активных push-подписок", List.of());
    }

    String safeTitle = title == null || title.isBlank() ? "Тестовое уведомление" : title.trim();
    String safeBody = body == null || body.isBlank()
        ? "Это тестовое push-сообщение из админ-панели."
        : body.trim();

    Map<String, Object> payload = new HashMap<>();
    payload.put("title", safeTitle);
    payload.put("body", safeBody);
    payload.put("tag", "admin-test-" + user.getId());
    payload.put("url", publicBaseUrl + "/pwa/");

    List<EndpointDeliveryResult> endpointResults = sendPayload(subscriptions, toJson(payload));
    int delivered = countDelivered(endpointResults);
    String message = delivered > 0
        ? "Тестовое push-сообщение отправлено"
        : "Не удалось доставить push-сообщение";
    return new SendResult(subscriptions.size(), delivered, message, endpointResults);
  }

  private List<EndpointDeliveryResult> sendPayload(List<WebPushSubscription> subscriptions, String payloadJson) {
    List<EndpointDeliveryResult> results = new java.util.ArrayList<>();
    for (WebPushSubscription sub : subscriptions) {
      log.info("WebPush send attempt: userId={} subscriptionId={} endpoint={}",
          sub.getUser() != null ? sub.getUser().getId() : null,
          sub.getId(),
          maskEndpoint(sub.getEndpoint()));
      results.add(sendToSubscription(sub, payloadJson));
    }
    return results;
  }

  private int countDelivered(List<EndpointDeliveryResult> results) {
    int delivered = 0;
    for (EndpointDeliveryResult result : results) {
      if (result.delivered()) {
        delivered++;
      }
    }
    return delivered;
  }

  private EndpointDeliveryResult sendToSubscription(WebPushSubscription subscription, String payloadJson) {
    String maskedEndpoint = maskEndpoint(subscription.getEndpoint());
    try {
      PushService pushService = buildPushService();
      Notification notification = new Notification(
          subscription.getEndpoint(),
          Utils.loadPublicKey(normalizeBase64Url(subscription.getP256dh())),
          decodeAuthSecret(subscription.getAuth()),
          payloadJson.getBytes(StandardCharsets.UTF_8)
      );
      HttpResponse response = pushService.send(notification);
      int status = response.getStatusLine().getStatusCode();
      log.info("WebPush send response: status={} endpoint={}", status, maskedEndpoint);
      if (status == HttpStatus.SC_GONE || status == HttpStatus.SC_NOT_FOUND) {
        subscriptionRepository.delete(subscription);
        return new EndpointDeliveryResult(maskedEndpoint, false, status, "Subscription is gone (removed)");
      }
      if (status >= 200 && status < 300) {
        subscription.setLastSuccessAt(Instant.now());
        subscription.setLastFailureAt(null);
        subscription.setLastFailureReason(null);
        subscriptionRepository.save(subscription);
        return new EndpointDeliveryResult(maskedEndpoint, true, status, null);
      }
      String reason = "HTTP " + status;
      log.warn("WebPush non-success status: status={} endpoint={}", status, maskedEndpoint);
      subscription.setLastFailureAt(Instant.now());
      subscription.setLastFailureReason(reason);
      subscriptionRepository.save(subscription);
      return new EndpointDeliveryResult(maskedEndpoint, false, status, reason);
    } catch (GeneralSecurityException | JoseException | IOException | ExecutionException ex) {
      String reason = trimReason(ex.getClass().getSimpleName() + ": " + ex.getMessage());
      log.warn("WebPush send failed for endpoint={}: {}", maskedEndpoint, reason);
      subscription.setLastFailureAt(Instant.now());
      subscription.setLastFailureReason(reason);
      subscriptionRepository.save(subscription);
      return new EndpointDeliveryResult(maskedEndpoint, false, 0, reason);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      String reason = "InterruptedException";
      subscription.setLastFailureAt(Instant.now());
      subscription.setLastFailureReason(reason);
      subscriptionRepository.save(subscription);
      return new EndpointDeliveryResult(maskedEndpoint, false, 0, reason);
    }
  }

  private PushService buildPushService() throws GeneralSecurityException, JoseException {
    PushService pushService = new PushService();
    pushService.setSubject(subject);
    pushService.setPublicKey(vapidPublicKey);
    pushService.setPrivateKey(vapidPrivateKey);
    return pushService;
  }

  private byte[] decodeAuthSecret(String auth) {
    String normalized = normalizeBase64Url(auth);
    int paddingNeeded = (4 - (normalized.length() % 4)) % 4;
    String padded = normalized + "=".repeat(paddingNeeded);
    return Base64.getUrlDecoder().decode(padded);
  }

  private String normalizeBase64Url(String value) {
    if (value == null) {
      return "";
    }
    return value.trim()
        .replace('+', '-')
        .replace('/', '_')
        .replace("=", "");
  }

  private String maskEndpoint(String endpoint) {
    if (endpoint == null || endpoint.isBlank()) {
      return "<empty>";
    }
    int keep = Math.min(36, endpoint.length());
    return endpoint.substring(0, keep) + "...";
  }

  private String trimReason(String reason) {
    if (reason == null) {
      return null;
    }
    String normalized = reason.trim();
    if (normalized.length() <= 400) {
      return normalized;
    }
    return normalized.substring(0, 400);
  }

  private String toJson(Map<String, Object> payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException ex) {
      return "{}";
    }
  }

  public record SendResult(int subscriptions, int delivered, String message, List<EndpointDeliveryResult> endpoints) {
  }

  public record EndpointDeliveryResult(String endpoint, boolean delivered, int status, String error) {
  }
}
