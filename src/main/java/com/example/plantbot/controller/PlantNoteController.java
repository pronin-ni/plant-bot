package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.PlantNoteRequest;
import com.example.plantbot.controller.dto.PlantNoteResponse;
import com.example.plantbot.domain.User;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.PlantNoteService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class PlantNoteController {

    private final PlantNoteService noteService;
    private final CurrentUserService currentUserService;

    @GetMapping("/plants/{plantId}/notes")
    public List<PlantNoteResponse> getNotes(
            @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
            Authentication authentication,
            @PathVariable Long plantId
    ) {
        User user = currentUserService.resolve(authentication, initData);
        return noteService.getNotes(plantId);
    }

    @PostMapping("/plants/{plantId}/notes")
    public PlantNoteResponse createNote(
            @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
            Authentication authentication,
            @PathVariable Long plantId,
            @Valid @RequestBody PlantNoteRequest request
    ) {
        User user = currentUserService.resolve(authentication, initData);
        return noteService.createNote(user, plantId, request);
    }

    @DeleteMapping("/plants/{plantId}/notes/{noteId}")
    public Map<String, Boolean> deleteNote(
            @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
            Authentication authentication,
            @PathVariable Long plantId,
            @PathVariable String noteId
    ) {
        User user = currentUserService.resolve(authentication, initData);
        noteService.deleteNote(user, noteId, plantId);
        return Map.of("ok", true);
    }
}
