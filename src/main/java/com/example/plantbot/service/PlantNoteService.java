package com.example.plantbot.service;

import com.example.plantbot.controller.dto.PlantNoteRequest;
import com.example.plantbot.controller.dto.PlantNoteResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantNote;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantNoteRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PlantNoteService {

    private final PlantNoteRepository noteRepository;
    private final PlantService plantService;

    public List<PlantNoteResponse> getNotes(Long plantId) {
        return noteRepository.findByPlantIdOrderByCreatedAtDesc(plantId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public PlantNoteResponse createNote(User user, Long plantId, PlantNoteRequest request) {
        Plant plant = plantService.getById(plantId);
        if (plant == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "Растение не найдено");
        }
        if (!plant.getUser().getId().equals(user.getId())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "Нет доступа к растению");
        }

        PlantNote note = new PlantNote();
        note.setId(UUID.randomUUID().toString());
        note.setPlant(plant);
        note.setType(request.type());
        note.setTitle(request.title());
        note.setAmount(request.amount());
        note.setText(request.text());

        note = noteRepository.save(note);
        return toResponse(note);
    }

    @Transactional
    public void deleteNote(User user, String noteId, Long plantId) {
        PlantNote note = noteRepository.findByIdAndPlantId(noteId, plantId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Заметка не найдена"));

        if (!note.getPlant().getUser().getId().equals(user.getId())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "Нет доступа к заметке");
        }

        noteRepository.delete(note);
    }

    private PlantNoteResponse toResponse(PlantNote note) {
        return new PlantNoteResponse(
                note.getId(),
                note.getType().name(),
                note.getTitle(),
                note.getAmount(),
                note.getText(),
                note.getCreatedAt()
        );
    }
}
