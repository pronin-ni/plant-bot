package com.example.plantbot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PlantBotApplication {
  public static void main(String[] args) {
    SpringApplication.run(PlantBotApplication.class, args);
  }
}
