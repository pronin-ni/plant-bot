package com.example.plantbot.config;

import com.example.plantbot.bot.PlantTelegramBot;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;

@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramConfig {
  private final PlantTelegramBot plantTelegramBot;

  @PostConstruct
  public void registerBot() {
    String token = plantTelegramBot.getBotToken();
    String username = plantTelegramBot.getBotUsername();
    if (token == null || token.isBlank()) {
      throw new IllegalStateException("TELEGRAM_BOT_TOKEN is empty");
    }
    if (username == null || username.isBlank()) {
      throw new IllegalStateException("TELEGRAM_BOT_USERNAME is empty");
    }
    try {
      TelegramBotsApi botsApi = new TelegramBotsApi(DefaultBotSession.class);
      botsApi.registerBot(plantTelegramBot);
      log.info("Telegram bot registered: {}", username);
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to register Telegram bot", ex);
    }
  }
}
