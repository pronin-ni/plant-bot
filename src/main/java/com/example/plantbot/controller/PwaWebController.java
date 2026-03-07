package com.example.plantbot.controller;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@ConditionalOnProperty(prefix = "app.features", name = "pwa-enabled", havingValue = "true", matchIfMissing = true)
public class PwaWebController {
  @GetMapping({"/pwa", "/pwa/", "/pwa/{path:[^\\.]*}", "/pwa/**/{path:[^\\.]*}"})
  public String pwaIndex() {
    // SPA fallback для PWA фронтенда.
    return "forward:/pwa/index.html";
  }
}
