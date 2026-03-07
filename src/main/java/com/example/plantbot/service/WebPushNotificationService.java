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
    boolean atLeastOne = false;
    for (WebPushSubscription sub : subscriptions) {
      boolean sent = sendToSubscription(sub, payloadJson);
      if (sent) {
        atLeastOne = true;
      }
    }
    return atLeastOne;
  }

  private boolean sendToSubscription(WebPushSubscription subscription, String payloadJson) {
    try {
      PushService pushService = buildPushService();
      Notification notification = new Notification(
          subscription.getEndpoint(),
          Utils.loadPublicKey(subscription.getP256dh()),
          Base64.getUrlDecoder().decode(subscription.getAuth()),
          payloadJson.getBytes(StandardCharsets.UTF_8)
      );
      HttpResponse response = pushService.send(notification);
      int status = response.getStatusLine().getStatusCode();
      if (status == HttpStatus.SC_GONE || status == HttpStatus.SC_NOT_FOUND) {
        subscriptionRepository.delete(subscription);
        return false;
      }
      if (status >= 200 && status < 300) {
        subscription.setLastSuccessAt(Instant.now());
        subscription.setLastFailureAt(null);
        subscriptionRepository.save(subscription);
        return true;
      }
      subscription.setLastFailureAt(Instant.now());
      subscriptionRepository.save(subscription);
      return false;
    } catch (GeneralSecurityException | JoseException | IOException | ExecutionException ex) {
      log.warn("WebPush send failed for endpoint='{}': {}", subscription.getEndpoint(), ex.getMessage());
      subscription.setLastFailureAt(Instant.now());
      subscriptionRepository.save(subscription);
      return false;
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      subscription.setLastFailureAt(Instant.now());
      subscriptionRepository.save(subscription);
      return false;
    }
  }

  private PushService buildPushService() throws GeneralSecurityException, JoseException {
    PushService pushService = new PushService();
    pushService.setSubject(subject);
    pushService.setPublicKey(vapidPublicKey);
    pushService.setPrivateKey(vapidPrivateKey);
    return pushService;
  }

  private String toJson(Map<String, Object> payload) {
    try {
      return objectMapper.writeValueAsString(payload);
    } catch (JsonProcessingException ex) {
      return "{}";
    }
  }
}
