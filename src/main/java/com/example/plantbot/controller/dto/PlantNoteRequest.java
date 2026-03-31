package com.example.plantbot.controller.dto;

import com.example.plantbot.domain.PlantNote.NoteType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record PlantNoteRequest(
    @NotNull(message = "type обязателен")
    NoteType type,

    String title,

    String amount,

    @NotBlank(message = "text обязателен")
    String text
) {}
