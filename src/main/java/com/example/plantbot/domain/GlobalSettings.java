package com.example.plantbot.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "global_settings")
@Getter
@Setter
@NoArgsConstructor
public class GlobalSettings {
  @Id
  private Long id = 1L;

  // Значение хранится в зашифрованном виде (префикс enc::).
  @Column(name = "openrouter_api_key")
  private String openrouterApiKey;

  @Column(name = "chat_model")
  private String chatModel;

  // Упрощённая глобальная модель для всех текстовых OpenRouter-запросов.
  @Column(name = "openrouter_text_model")
  private String openrouterTextModel;

  @Column(name = "photo_recognition_model")
  private String photoRecognitionModel;

  // Упрощённая глобальная модель для всех photo/vision OpenRouter-запросов.
  @Column(name = "openrouter_photo_model")
  private String openrouterPhotoModel;

  @Column(name = "photo_diagnosis_model")
  private String photoDiagnosisModel;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @PrePersist
  void onCreate() {
    Instant now = Instant.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (updatedAt == null) {
      updatedAt = now;
    }
  }

  @PreUpdate
  void onUpdate() {
    updatedAt = Instant.now();
  }
}
