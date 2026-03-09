package com.example.plantbot.service.auth;

import java.time.Instant;

public interface EmailService {
  void sendMagicLinkEmail(String recipientEmail, String verifyUrl, Instant expiresAt);
}

