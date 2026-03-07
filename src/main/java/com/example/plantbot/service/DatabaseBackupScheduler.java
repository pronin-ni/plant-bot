package com.example.plantbot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.stream.Stream;

@Service
@ConditionalOnProperty(value = "app.backup.enabled", havingValue = "true", matchIfMissing = true)
public class DatabaseBackupScheduler {
  private static final Logger log = LoggerFactory.getLogger(DatabaseBackupScheduler.class);
  private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
  private static final String JDBC_SQLITE_PREFIX = "jdbc:sqlite:";

  @Value("${spring.datasource.url}")
  private String datasourceUrl;

  @Value("${app.backup.path:./data/backups}")
  private String backupPath;

  @Value("${app.backup.retention-days:7}")
  private int retentionDays;

  @Value("${app.backup.file-prefix:plantbot-backup}")
  private String filePrefix;

  @Value("${app.backup.zone:Europe/Moscow}")
  private String zone;

  @Scheduled(cron = "${app.backup.cron:0 10 3 * * *}", zone = "${app.backup.zone:Europe/Moscow}")
  public void backupNightly() {
    try {
      Path sourceDb = resolveSourceDbPath(datasourceUrl);
      if (sourceDb == null || !Files.exists(sourceDb)) {
        log.warn("DB backup skipped: source DB file not found. datasourceUrl='{}'", datasourceUrl);
        return;
      }

      Path backupDir = resolvePath(backupPath);
      Files.createDirectories(backupDir);

      LocalDateTime now = LocalDateTime.now(ZoneId.of(zone));
      String fileName = filePrefix + "-" + now.format(TS) + ".db";
      Path target = backupDir.resolve(fileName);
      Path tmp = backupDir.resolve(fileName + ".tmp");

      createSqliteBackup(tmp);
      Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      cleanupOldBackups(backupDir);

      log.info("DB backup completed: source='{}', backup='{}'", sourceDb, target);
    } catch (Exception ex) {
      log.warn("DB backup failed: {}", ex.getMessage(), ex);
    }
  }

  private void createSqliteBackup(Path targetFile) throws Exception {
    String backupFile = targetFile.toAbsolutePath().toString().replace("'", "''");
    String sql = "VACUUM INTO '" + backupFile + "'";
    try (Connection connection = DriverManager.getConnection(datasourceUrl);
         Statement statement = connection.createStatement()) {
      statement.execute(sql);
    }
  }

  private void cleanupOldBackups(Path backupDir) {
    if (retentionDays <= 0) {
      return;
    }
    Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
    try (Stream<Path> stream = Files.list(backupDir)) {
      stream
          .filter(path -> Files.isRegularFile(path) && path.getFileName().toString().startsWith(filePrefix) && path.getFileName().toString().endsWith(".db"))
          .forEach(path -> {
            try {
              Instant modified = Files.getLastModifiedTime(path).toInstant();
              if (modified.isBefore(cutoff)) {
                Files.deleteIfExists(path);
              }
            } catch (Exception e) {
              log.warn("Cannot cleanup old backup '{}': {}", path, e.getMessage());
            }
          });
    } catch (Exception ex) {
      log.warn("Backup cleanup failed: {}", ex.getMessage());
    }
  }

  private Path resolveSourceDbPath(String jdbcUrl) {
    if (jdbcUrl == null || !jdbcUrl.startsWith(JDBC_SQLITE_PREFIX)) {
      return null;
    }
    String raw = jdbcUrl.substring(JDBC_SQLITE_PREFIX.length());
    int q = raw.indexOf('?');
    if (q >= 0) {
      raw = raw.substring(0, q);
    }
    if (raw.isBlank() || ":memory:".equals(raw)) {
      return null;
    }
    return resolvePath(raw);
  }

  private Path resolvePath(String value) {
    Path path = Paths.get(value);
    if (path.isAbsolute()) {
      return path.normalize();
    }
    return Paths.get(System.getProperty("user.dir")).resolve(path).normalize();
  }
}
