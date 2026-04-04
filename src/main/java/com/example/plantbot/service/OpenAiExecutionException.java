package com.example.plantbot.service;

public class OpenAiExecutionException extends RuntimeException {
  private final boolean retryable;

  public OpenAiExecutionException(boolean retryable, String message) {
    super(message);
    this.retryable = retryable;
  }

  public OpenAiExecutionException(boolean retryable, String message, Throwable cause) {
    super(message, cause);
    this.retryable = retryable;
  }

  public boolean isRetryable() {
    return retryable;
  }
}
