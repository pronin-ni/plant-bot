package com.example.plantbot.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

public final class AiResponseContentExtractor {
  private AiResponseContentExtractor() {
  }

  public static String extractTextContent(JsonNode payload) {
    if (payload == null || payload.isMissingNode()) {
      return "";
    }

    String direct = textValue(payload.path("choices").path(0).path("message").path("content"));
    if (!direct.isBlank()) {
      return direct;
    }

    String outputText = textValue(payload.path("output_text"));
    if (!outputText.isBlank()) {
      return outputText;
    }

    String choiceText = textValue(payload.path("choices").path(0).path("text"));
    if (!choiceText.isBlank()) {
      return choiceText;
    }

    return textValue(payload.path("choices").path(0).path("message").path("refusal"));
  }

  public static boolean hasTextContent(JsonNode payload) {
    return !extractTextContent(payload).isBlank();
  }

  private static String textValue(JsonNode node) {
    if (node == null || node.isMissingNode() || node.isNull()) {
      return "";
    }
    if (node.isTextual()) {
      return node.asText("").trim();
    }
    if (node.isArray()) {
      List<String> parts = new ArrayList<>();
      for (JsonNode item : node) {
        String text = textValue(item);
        if (!text.isBlank()) {
          parts.add(text);
        }
      }
      return String.join("\n", parts).trim();
    }
    if (node.isObject()) {
      String text = textValue(node.path("text"));
      if (!text.isBlank()) {
        return text;
      }
      text = textValue(node.path("value"));
      if (!text.isBlank()) {
        return text;
      }
      text = textValue(node.path("output_text"));
      if (!text.isBlank()) {
        return text;
      }
      return textValue(node.path("content"));
    }
    return node.asText("").trim();
  }
}
