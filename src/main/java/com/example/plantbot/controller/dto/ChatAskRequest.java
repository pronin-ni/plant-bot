package com.example.plantbot.controller.dto;

public record ChatAskRequest(
    String question,
    String photoBase64
) {
}
