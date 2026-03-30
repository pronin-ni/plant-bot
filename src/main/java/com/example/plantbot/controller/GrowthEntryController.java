package com.example.plantbot.controller;

import com.example.plantbot.controller.dto.GrowthEntryRequest;
import com.example.plantbot.controller.dto.GrowthEntryResponse;
import com.example.plantbot.controller.dto.PhotoUploadResponse;
import com.example.plantbot.domain.Plant;
import com.example.plantbot.domain.PlantGrowthEntry;
import com.example.plantbot.domain.User;
import com.example.plantbot.repository.PlantGrowthEntryRepository;
import com.example.plantbot.repository.PlantRepository;
import com.example.plantbot.service.CurrentUserService;
import com.example.plantbot.service.OpenRouterVisionService;
import com.example.plantbot.service.PhotoUrlSignerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/plants/{plantId}/growth")
@RequiredArgsConstructor
@Slf4j
public class GrowthEntryController {

    private final PlantGrowthEntryRepository growthEntryRepository;
    private final PlantRepository plantRepository;
    private final CurrentUserService currentUserService;
    private final PhotoUrlSignerService photoUrlSignerService;
    private final OpenRouterVisionService openRouterVisionService;

    @org.springframework.beans.factory.annotation.Value("${app.photo-upload.max-long-side-px:1600}")
    private int photoMaxLongSidePx;

    @org.springframework.beans.factory.annotation.Value("${app.photo-upload.jpeg-quality:0.82}")
    private float photoJpegQuality;

    @org.springframework.beans.factory.annotation.Value("${app.photo-upload.max-file-bytes:900000}")
    private int photoMaxFileBytes;

    @GetMapping
    public List<GrowthEntryResponse> getGrowthEntries(
            @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
            Authentication authentication,
            @PathVariable Long plantId,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            @RequestParam(name = "before", required = false) String beforeIso
    ) {
        User user = currentUserService.resolve(authentication, initData);
        Plant plant = requireOwnedPlant(user, plantId);

        List<PlantGrowthEntry> entries;
        if (beforeIso != null && !beforeIso.isBlank()) {
            try {
                var before = java.time.Instant.parse(beforeIso);
                entries = growthEntryRepository.findByPlantIdAndCreatedAtBeforeOrderByCreatedAtDesc(
                        plantId, before, PageRequest.of(0, limit));
            } catch (Exception e) {
                entries = growthEntryRepository.findByPlantIdOrderByCreatedAtDesc(plantId, PageRequest.of(0, limit));
            }
        } else {
            entries = growthEntryRepository.findByPlantIdOrderByCreatedAtDesc(plantId, PageRequest.of(0, limit));
        }

        return entries.stream()
                .map(this::toResponse)
                .toList();
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public GrowthEntryResponse addGrowthEntry(
            @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
            Authentication authentication,
            @PathVariable Long plantId,
            @Valid @RequestBody GrowthEntryRequest request
    ) {
        User user = currentUserService.resolve(authentication, initData);
        Plant plant = requireOwnedPlant(user, plantId);

        if (request.photoBase64() == null || request.photoBase64().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "photoBase64 обязателен");
        }

        String imageUrl = savePhoto(user, plant, request.photoBase64());

        PlantGrowthEntry entry = new PlantGrowthEntry();
        entry.setPlant(plant);
        entry.setImageUrl(imageUrl);
        entry.setNote(request.note());
        entry.setSource(request.source() != null 
                ? PlantGrowthEntry.GrowthEntrySource.valueOf(request.source().name()) 
                : PlantGrowthEntry.GrowthEntrySource.MANUAL);

        entry = growthEntryRepository.save(entry);

        try {
            String aiSummary = openRouterVisionService.generateGrowthSummary(user, request.photoBase64(), plant.getName());
            if (aiSummary != null && !aiSummary.isBlank()) {
                entry.setAiSummary(aiSummary);
                entry = growthEntryRepository.save(entry);
            }
        } catch (Exception e) {
            log.warn("Failed to generate AI summary for growth entry: {}", e.getMessage());
        }

        return toResponse(entry);
    }

    @PutMapping(value = "/{entryId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public GrowthEntryResponse updateGrowthEntry(
            @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
            Authentication authentication,
            @PathVariable Long plantId,
            @PathVariable Long entryId,
            @RequestBody GrowthEntryRequest request
    ) {
        User user = currentUserService.resolve(authentication, initData);
        requireOwnedPlant(user, plantId);

        PlantGrowthEntry entry = growthEntryRepository.findByIdAndPlantId(entryId, plantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Запись не найдена"));

        if (request.note() != null) {
            entry.setNote(request.note());
        }

        entry = growthEntryRepository.save(entry);
        return toResponse(entry);
    }

    @DeleteMapping("/{entryId}")
    public void deleteGrowthEntry(
            @RequestHeader(name = "X-Telegram-Init-Data", required = false) String initData,
            Authentication authentication,
            @PathVariable Long plantId,
            @PathVariable Long entryId
    ) {
        User user = currentUserService.resolve(authentication, initData);
        requireOwnedPlant(user, plantId);

        PlantGrowthEntry entry = growthEntryRepository.findByIdAndPlantId(entryId, plantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Запись не найдена"));

        growthEntryRepository.delete(entry);
    }

    @GetMapping(value = "/{entryId}/photo")
    public ResponseEntity<byte[]> getEntryPhoto(
            @PathVariable Long plantId,
            @PathVariable Long entryId,
            @RequestParam(name = "exp", required = false) Long exp,
            @RequestParam(name = "sig", required = false) String sig
    ) {
        PlantGrowthEntry entry = growthEntryRepository.findByIdAndPlantId(entryId, plantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Запись не найдена"));

        if (!photoUrlSignerService.isValid(plantId, entry.getImageUrl(), exp, sig)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к фото");
        }

        Path photoFile = resolvePhotoPath(entry.getImageUrl());
        if (photoFile == null || !Files.exists(photoFile)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Фото не найдено");
        }

        try {
            byte[] bytes = Files.readAllBytes(photoFile);
            return ResponseEntity.ok()
                    .contentType(MediaType.IMAGE_JPEG)
                    .body(bytes);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось прочитать фото");
        }
    }

    private Plant requireOwnedPlant(User user, Long plantId) {
        Plant plant = plantRepository.findById(plantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Растение не найдено"));

        if (!plant.getUser().getId().equals(user.getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к растению");
        }

        return plant;
    }

    private GrowthEntryResponse toResponse(PlantGrowthEntry entry) {
        return new GrowthEntryResponse(
                entry.getId(),
                entry.getPlant().getId(),
                buildEntryPhotoUrl(entry),
                entry.getCreatedAt(),
                entry.getNote(),
                entry.getSource() != null ? entry.getSource().name() : "MANUAL",
                entry.getAiSummary(),
                entry.getMetadataJson()
        );
    }

    private String buildEntryPhotoUrl(PlantGrowthEntry entry) {
        return photoUrlSignerService.buildSignedPhotoUrl(entry.getPlant().getId(), entry.getImageUrl());
    }

    private String savePhoto(User user, Plant plant, String photoBase64) {
        try {
            String raw = photoBase64.trim();
            if (raw.contains(",")) {
                raw = raw.substring(raw.indexOf(',') + 1);
            }
            byte[] bytes = Base64.getDecoder().decode(raw);
            byte[] processedBytes = compressPhoto(bytes);

            Path dir = Path.of("./data/photos/" + user.getTelegramId() + "/growth");
            Files.createDirectories(dir);
            String fileName = String.format(Locale.ROOT, "growth-%d-%d.jpg", plant.getId(), System.currentTimeMillis());
            Path file = dir.resolve(fileName);
            Files.write(file, processedBytes);
            return user.getTelegramId() + "/growth/" + fileName;
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "photoBase64 невалидный");
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось сохранить фото");
        }
    }

    private byte[] compressPhoto(byte[] originalBytes) {
        try {
            BufferedImage src = ImageIO.read(new ByteArrayInputStream(originalBytes));
            if (src == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Не удалось прочитать изображение");
            }

            BufferedImage rgb = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = rgb.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(src, 0, 0, null);
            g.dispose();

            BufferedImage scaled = scaleDown(rgb, Math.max(320, photoMaxLongSidePx));
            float quality = Math.min(0.95f, Math.max(0.55f, photoJpegQuality));
            byte[] jpeg = writeJpeg(scaled, quality);

            int maxBytes = Math.max(200_000, photoMaxFileBytes);
            while (jpeg.length > maxBytes && quality > 0.56f) {
                quality -= 0.08f;
                jpeg = writeJpeg(scaled, quality);
            }
            return jpeg;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось обработать фото");
        }
    }

    private BufferedImage scaleDown(BufferedImage src, int maxLongSide) {
        int width = src.getWidth();
        int height = src.getHeight();
        int longest = Math.max(width, height);
        if (longest <= maxLongSide) {
            return src;
        }

        double ratio = maxLongSide / (double) longest;
        int targetW = Math.max(1, (int) Math.round(width * ratio));
        int targetH = Math.max(1, (int) Math.round(height * ratio));

        BufferedImage out = new BufferedImage(targetW, targetH, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.drawImage(src, 0, 0, targetW, targetH, null);
        g.dispose();
        return out;
    }

    private byte[] writeJpeg(BufferedImage image, float quality) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
        if (!writers.hasNext()) {
            throw new IOException("JPEG writer is unavailable");
        }
        ImageWriter writer = writers.next();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            ImageWriteParam params = writer.getDefaultWriteParam();
            if (params.canWriteCompressed()) {
                params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                params.setCompressionQuality(Math.min(0.98f, Math.max(0.5f, quality)));
            }
            writer.write(null, new IIOImage(image, null, null), params);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    private Path resolvePhotoPath(String photoRef) {
        if (photoRef == null || photoRef.isBlank()) {
            return null;
        }

        if (photoRef.startsWith("./") || photoRef.startsWith("/")) {
            return Paths.get(photoRef).normalize();
        }

        String[] parts = photoRef.split("/", 2);
        if (parts.length != 2) {
            return null;
        }

        return Path.of("./data/photos/" + parts[0]).resolve(parts[1]).normalize();
    }
}
