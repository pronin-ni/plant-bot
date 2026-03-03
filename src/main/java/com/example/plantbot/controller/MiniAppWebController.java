package com.example.plantbot.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class MiniAppWebController {
  @GetMapping({"/mini-app", "/mini-app/", "/mini-app/{path:[^\\.]*}", "/mini-app/**/{path:[^\\.]*}"})
  public String miniAppIndex() {
    // Отдаем Vite index.html для маршрутов Mini App (SPA fallback).
    return "forward:/mini-app/index.html";
  }
}
