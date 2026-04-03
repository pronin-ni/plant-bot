package com.example.plantbot.service;

public class OpenRouterExecutionException extends RuntimeException {
  private final OpenRouterFailureType failureType;
  private final boolean retryable;

  public OpenRouterExecutionException(OpenRouterFailureType failureType, boolean retryable, String message) {
    super(message);
    this.failureType = failureType;
    this.retryable = retryable;
  }

  public OpenRouterExecutionException(OpenRouterFailureType failureType, boolean retryable, String message, Throwable cause) {
    super(message, cause);
    this.failureType = failureType;
    this.retryable = retryable;
  }

  public OpenRouterFailureType getFailureType() {
    return failureType;
  }

  public boolean isRetryable() {
    return retryable;
  }
}
