package com.example.plantbot.service.ha;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class AesTokenCryptoService {
  private static final String ALGO = "AES";
  private static final String CIPHER = "AES/GCM/NoPadding";
  private static final int GCM_TAG_BITS = 128;
  private static final int NONCE_SIZE = 12;
  private static final int KEY_SIZE_BYTES = 32;

  private final SecretKeySpec keySpec;
  private final SecureRandom secureRandom = new SecureRandom();

  public AesTokenCryptoService(@Value("${home-assistant.local-key-path:./data/ha-master.key}") String localKeyPath) {
    byte[] key = loadOrCreateLocalKey(localKeyPath);
    this.keySpec = new SecretKeySpec(key, ALGO);
  }

  private byte[] loadOrCreateLocalKey(String localKeyPath) {
    try {
      Path path = Path.of(localKeyPath);
      if (Files.exists(path)) {
        String encoded = Files.readString(path, StandardCharsets.UTF_8).trim();
        return decodeAndValidateKey(encoded);
      }

      Path parent = path.getParent();
      if (parent != null) {
        Files.createDirectories(parent);
      }
      byte[] key = new byte[KEY_SIZE_BYTES];
      secureRandom.nextBytes(key);
      Files.writeString(path, Base64.getEncoder().encodeToString(key), StandardCharsets.UTF_8);
      return key;
    } catch (IOException ex) {
      throw new IllegalStateException("Не удалось загрузить/создать локальный ключ Home Assistant", ex);
    }
  }

  private byte[] decodeAndValidateKey(String base64Key) {
    byte[] key = Base64.getDecoder().decode(base64Key);
    if (key.length != KEY_SIZE_BYTES) {
      throw new IllegalStateException("home-assistant.crypto-key must be 32 bytes (base64). Current: " + key.length);
    }
    return key;
  }

  private void assertKeyConfigured() {
    // keySpec всегда инициализируется в конструкторе.
  }

  public String encrypt(String plainText) {
    assertKeyConfigured();
    try {
      byte[] nonce = new byte[NONCE_SIZE];
      secureRandom.nextBytes(nonce);

      Cipher cipher = Cipher.getInstance(CIPHER);
      cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(GCM_TAG_BITS, nonce));
      byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

      ByteBuffer buffer = ByteBuffer.allocate(nonce.length + encrypted.length);
      buffer.put(nonce);
      buffer.put(encrypted);
      return Base64.getEncoder().encodeToString(buffer.array());
    } catch (Exception ex) {
      throw new IllegalStateException("Unable to encrypt Home Assistant token", ex);
    }
  }

  public String decrypt(String cipherText) {
    assertKeyConfigured();
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
      throw new IllegalStateException("Unable to decrypt Home Assistant token", ex);
    }
  }
}
