package com.example.plantbot.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PwaWebController {
  @GetMapping({"/pwa", "/pwa/", "/pwa/{path:[^\\.]*}", "/pwa/**/{path:[^\\.]*}"})
  public String pwaIndex() {
    // SPA fallback для PWA фронтенда.
    return "forward:/pwa/index.html";
  }
}

