package com.example.plantbot.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class OpenRouterApiKeyCryptoService {
  private static final String ALGO = "AES";
  private static final String CIPHER = "AES/GCM/NoPadding";
  private static final int GCM_TAG_BITS = 128;
  private static final int NONCE_SIZE = 12;
  private static final int KEY_SIZE_BYTES = 32;

  private final SecretKeySpec keySpec;
  private final SecureRandom random = new SecureRandom();

  public OpenRouterApiKeyCryptoService(@Value("${openrouter.local-key-path:./data/openrouter-master.key}") String keyPath) {
    this.keySpec = new SecretKeySpec(loadOrCreateKey(keyPath), ALGO);
  }

  public String encrypt(String plainText) {
    try {
      byte[] nonce = new byte[NONCE_SIZE];
      random.nextBytes(nonce);
      Cipher cipher = Cipher.getInstance(CIPHER);
      cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_BITS, nonce));
      byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
      ByteBuffer buffer = ByteBuffer.allocate(nonce.length + encrypted.length);
      buffer.put(nonce);
      buffer.put(encrypted);
      return Base64.getEncoder().encodeToString(buffer.array());
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to encrypt OpenRouter key", ex);
    }
  }

  public String decrypt(String cipherText) {
    try {
      byte[] payload = Base64.getDecoder().decode(cipherText);
      ByteBuffer buffer = ByteBuffer.wrap(payload);
      byte[] nonce = new byte[NONCE_SIZE];
      buffer.get(nonce);
      byte[] encrypted = new byte[buffer.remaining()];
      buffer.get(encrypted);
      Cipher cipher = Cipher.getInstance(CIPHER);
      cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_BITS, nonce));
      byte[] plain = cipher.doFinal(encrypted);
      return new String(plain, StandardCharsets.UTF_8);
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to decrypt OpenRouter key", ex);
    }
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
      byte[] key = new byte[KEY_SIZE_BYTES];
      random.nextBytes(key);
      Files.writeString(path, Base64.getEncoder().encodeToString(key), StandardCharsets.UTF_8);
      return key;
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to initialize OpenRouter key storage", ex);
    }
  }

  private byte[] decodeKey(String base64) {
    byte[] decoded = Base64.getDecoder().decode(base64);
    if (decoded.length != KEY_SIZE_BYTES) {
      throw new IllegalStateException("OpenRouter crypto key must be 32 bytes (base64)");
    }
    return decoded;
  }
}

