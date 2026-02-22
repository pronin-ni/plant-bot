package com.example.plantbot.config;

import com.example.plantbot.bot.PlantTelegramBot;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.meta.TelegramBotsApi;
import org.telegram.telegrambots.meta.api.methods.commands.SetMyCommands;
import org.telegram.telegrambots.meta.api.objects.commands.BotCommand;
import org.telegram.telegrambots.meta.api.objects.commands.scope.BotCommandScopeDefault;
import org.telegram.telegrambots.updatesreceivers.DefaultBotSession;

import java.util.List;

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
      registerCommands();
      log.info("Telegram bot registered: {}", username);
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to register Telegram bot", ex);
    }
  }

  private void registerCommands() throws Exception {
    List<BotCommand> commands = List.of(
        new BotCommand("/start", "Главное меню"),
        new BotCommand("/add", "Добавить растение"),
        new BotCommand("/list", "Список растений"),
        new BotCommand("/delete", "Удалить растение"),
        new BotCommand("/calendar", "Календарь поливов"),
        new BotCommand("/stats", "Статистика"),
        new BotCommand("/learning", "Адаптация интервала"),
        new BotCommand("/setcity", "Установить город"),
        new BotCommand("/recalc", "Пересчитать норму"),
        new BotCommand("/clearcache", "Очистить кэш"),
        new BotCommand("/cancel", "Отменить текущее действие")
    );

    SetMyCommands setMyCommands = new SetMyCommands();
    setMyCommands.setCommands(commands);
    setMyCommands.setScope(new BotCommandScopeDefault());
    setMyCommands.setLanguageCode("ru");
    plantTelegramBot.execute(setMyCommands);
    log.info("Telegram commands registered automatically: {} commands", commands.size());
  }
}
