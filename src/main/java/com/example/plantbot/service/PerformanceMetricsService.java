package com.example.plantbot.service;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class PerformanceMetricsService {
  private final MeterRegistry meterRegistry;

  public void recordHttpRequest(String method, String path, int status, long durationNanos) {
    Timer.builder("plantbot.http.server.requests")
        .tag("method", safe(method))
        .tag("path", safe(path))
        .tag("status", String.valueOf(status))
        .tag("outcome", classifyStatus(status))
        .register(meterRegistry)
        .record(durationNanos, TimeUnit.NANOSECONDS);
  }

  public void recordExternalCall(String system,
                                 String operation,
                                 String target,
                                 String outcome,
                                 long durationNanos) {
    Timer.builder("plantbot.external.calls")
        .tag("system", safe(system))
        .tag("operation", safe(operation))
        .tag("target", safe(target))
        .tag("outcome", safe(outcome))
        .register(meterRegistry)
        .record(durationNanos, TimeUnit.NANOSECONDS);
  }

  public void incrementExternalFailure(String system, String operation, String reason) {
    meterRegistry.counter(
        "plantbot.external.failures",
        "system", safe(system),
        "operation", safe(operation),
        "reason", safe(reason)
    ).increment();
  }

  public void recordSchedulerRun(String scheduler, long durationNanos, String outcome) {
    Timer.builder("plantbot.scheduler.runs")
        .tag("scheduler", safe(scheduler))
        .tag("outcome", safe(outcome))
        .register(meterRegistry)
        .record(durationNanos, TimeUnit.NANOSECONDS);
  }

  public void incrementSchedulerOverlap(String scheduler) {
    meterRegistry.counter(
        "plantbot.scheduler.overlaps",
        "scheduler", safe(scheduler)
    ).increment();
  }

  private String classifyStatus(int status) {
    if (status >= 500) return "server_error";
    if (status >= 400) return "client_error";
    if (status >= 300) return "redirection";
    if (status >= 200) return "success";
    return "unknown";
  }

  private String safe(String value) {
    if (value == null || value.isBlank()) {
      return "unknown";
    }
    return value.trim().toLowerCase(Locale.ROOT);
  }
}
