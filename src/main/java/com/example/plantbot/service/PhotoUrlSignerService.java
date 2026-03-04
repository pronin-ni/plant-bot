package com.example.plantbot.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

@Service
public class PhotoUrlSignerService {
  private static final String HMAC_ALGO = "HmacSHA256";
  private static final int KEY_SIZE_BYTES = 32;

  private final byte[] key;
  private final long ttlSeconds;

  public PhotoUrlSignerService(@Value("${app.photo-url-signing-key-path:./data/photo-signing.key}") String keyPath,
                               @Value("${app.photo-url-ttl-seconds:300}") long ttlSeconds) {
    this.key = loadOrCreateKey(keyPath);
    this.ttlSeconds = Math.max(30, ttlSeconds);
  }

  public String buildSignedPhotoUrl(Long plantId, String photoRef) {
    long exp = Instant.now().getEpochSecond() + ttlSeconds;
    String sig = sign(plantId, photoRef, exp);
    return "/api/plants/" + plantId + "/photo?exp=" + exp + "&sig=" + sig;
  }

  public boolean isValid(Long plantId, String photoRef, Long exp, String sig) {
    if (exp == null || sig == null || sig.isBlank()) {
      return false;
    }
    long now = Instant.now().getEpochSecond();
    if (exp < now) {
      return false;
    }
    String expected = sign(plantId, photoRef, exp);
    return constantTimeEquals(expected, sig);
  }

  private String sign(Long plantId, String photoRef, long exp) {
    try {
      Mac mac = Mac.getInstance(HMAC_ALGO);
      mac.init(new SecretKeySpec(key, HMAC_ALGO));
      String payload = plantId + "|" + (photoRef == null ? "" : photoRef) + "|" + exp;
      byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to sign photo URL", ex);
    }
  }

  private boolean constantTimeEquals(String a, String b) {
    byte[] left = a.getBytes(StandardCharsets.UTF_8);
    byte[] right = b.getBytes(StandardCharsets.UTF_8);
    if (left.length != right.length) {
      return false;
    }
    int result = 0;
    for (int i = 0; i < left.length; i++) {
      result |= left[i] ^ right[i];
    }
    return result == 0;
  }

  private byte[] loadOrCreateKey(String keyPath) {
    try {
      Path path = Path.of(keyPath);
      if (Files.exists(path)) {
        return decodeKey(Files.readString(path, StandardCharsets.UTF_8).trim());
      }
      Path parent = path.getParent();
      if (parent != null) {
        Files.createDirectories(parent);
      }
      byte[] created = new byte[KEY_SIZE_BYTES];
      new SecureRandom().nextBytes(created);
      Files.writeString(path, Base64.getEncoder().encodeToString(created), StandardCharsets.UTF_8);
      return created;
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to initialize photo signing key", ex);
    }
  }

  private byte[] decodeKey(String base64) {
    byte[] decoded = Base64.getDecoder().decode(base64);
    if (decoded.length != KEY_SIZE_BYTES) {
      throw new IllegalStateException("photo signing key must be 32 bytes (base64)");
    }
    return decoded;
  }
}

