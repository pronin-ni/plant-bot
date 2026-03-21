package com.example.plantbot.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestControllerAdvice
@Slf4j
public class ApiExceptionHandler {
  @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
  public ResponseEntity<Void> handleNotAcceptable(HttpMediaTypeNotAcceptableException ex) {
    return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).build();
  }

  @ExceptionHandler(ResponseStatusException.class)
  public ResponseEntity<?> handleResponseStatus(ResponseStatusException ex, HttpServletRequest request) {
    HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
    if (!acceptsJson(request)) {
      return ResponseEntity.status(status).build();
    }
    return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Map.of(
        "message", ex.getReason() == null ? "Ошибка запроса" : ex.getReason(),
        "status", status.value()
    ));
  }

  @ExceptionHandler(IllegalStateException.class)
  public ResponseEntity<?> handleIllegalState(IllegalStateException ex, HttpServletRequest request) {
    if (!acceptsJson(request)) {
      return ResponseEntity.badRequest().build();
    }
    return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(Map.of(
        "message", ex.getMessage() == null ? "Некорректная операция" : ex.getMessage(),
        "status", HttpStatus.BAD_REQUEST.value()
    ));
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<?> handleNoResource(NoResourceFoundException ex, HttpServletRequest request) {
    if (!acceptsJson(request)) {
      return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
    return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON).body(Map.of(
        "message", ex.getMessage() == null ? "Ресурс не найден" : ex.getMessage(),
        "status", HttpStatus.NOT_FOUND.value()
    ));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<?> handleUnexpected(Exception ex, HttpServletRequest request) {
    log.error("Unhandled API exception: {}", ex.getMessage(), ex);
    if (!acceptsJson(request)) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.APPLICATION_JSON).body(Map.of(
        "message", "Внутренняя ошибка сервера",
        "status", HttpStatus.INTERNAL_SERVER_ERROR.value()
    ));
  }

  private boolean acceptsJson(HttpServletRequest request) {
    String accept = request == null ? null : request.getHeader("Accept");
    if (accept == null || accept.isBlank() || accept.contains("*/*")) {
      return true;
    }
    return accept.contains(MediaType.APPLICATION_JSON_VALUE) || accept.contains("+json");
  }
}
