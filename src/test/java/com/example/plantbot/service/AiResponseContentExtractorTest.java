package com.example.plantbot.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiResponseContentExtractorTest {
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void shouldExtractTextFromStructuredContentArray() throws Exception {
    var payload = objectMapper.readTree("""
        {
          "choices": [
            {
              "message": {
                "content": [
                  {"type": "text", "text": "Первая строка"},
                  {"type": "text", "text": {"value": "Вторая строка"}}
                ]
              }
            }
          ]
        }
        """);

    assertEquals("Первая строка\nВторая строка", AiResponseContentExtractor.extractTextContent(payload));
  }

  @Test
  void shouldFallbackToOutputTextWhenChoicesAreMissing() throws Exception {
    var payload = objectMapper.readTree("""
        {
          "output_text": "ok"
        }
        """);

    assertEquals("ok", AiResponseContentExtractor.extractTextContent(payload));
  }
}
