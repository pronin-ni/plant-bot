package com.example.plantbot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.example.plantbot.controller.dto.admin.AdminBackupItemResponse;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Stream;

@Service
public class DatabaseBackupScheduler {
  private static final Logger log = LoggerFactory.getLogger(DatabaseBackupScheduler.class);
  private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
  private static final String JDBC_SQLITE_PREFIX = "jdbc:sqlite:";
  private final ReentrantLock restoreLock = new ReentrantLock();

  @Value("${spring.datasource.url}")
  private String datasourceUrl;

  @Value("${app.backup.enabled:true}")
  private boolean backupEnabled;

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
    if (!backupEnabled) {
      return;
    }
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

  public List<AdminBackupItemResponse> listBackups() {
    Path backupDir = resolvePath(backupPath);
    if (!Files.exists(backupDir)) {
      return List.of();
    }
    try (Stream<Path> stream = Files.list(backupDir)) {
      return stream
          .filter(path -> Files.isRegularFile(path)
              && path.getFileName().toString().startsWith(filePrefix)
              && path.getFileName().toString().endsWith(".db"))
          .sorted((a, b) -> b.getFileName().toString().compareToIgnoreCase(a.getFileName().toString()))
          .map(path -> {
            try {
              return new AdminBackupItemResponse(
                  path.getFileName().toString(),
                  Files.size(path),
                  Files.getLastModifiedTime(path).toMillis()
              );
            } catch (Exception e) {
              return null;
            }
          })
          .filter(item -> item != null)
          .toList();
    } catch (Exception ex) {
      log.warn("Backup list failed: {}", ex.getMessage());
      return List.of();
    }
  }

  public void restoreFromBackup(String fileName) {
    if (!restoreLock.tryLock()) {
      throw new IllegalStateException("Операция восстановления уже выполняется");
    }
    try {
      Path backup = resolveBackupFile(fileName);
      restoreOnlineFromBackup(backup);
      log.warn("DB restore completed from backup: {}", backup.getFileName());
    } catch (IllegalStateException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException("Не удалось восстановить базу из backup: " + ex.getMessage(), ex);
    } finally {
      restoreLock.unlock();
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

  private Path resolveBackupFile(String fileName) {
    String normalized = fileName == null ? "" : fileName.trim();
    if (normalized.isEmpty() || normalized.contains("/") || normalized.contains("\\") || !normalized.endsWith(".db")) {
      throw new IllegalStateException("Некорректное имя backup-файла");
    }
    Path backupDir = resolvePath(backupPath);
    Path candidate = backupDir.resolve(normalized).normalize();
    if (!candidate.startsWith(backupDir) || !Files.exists(candidate) || !Files.isRegularFile(candidate)) {
      throw new IllegalStateException("Backup-файл не найден");
    }
    return candidate;
  }

  private void restoreOnlineFromBackup(Path backupFile) throws Exception {
    String backupPathEscaped = backupFile.toAbsolutePath().toString().replace("'", "''");
    Path sourceDb = resolveSourceDbPath(datasourceUrl);
    if (sourceDb == null || !Files.exists(sourceDb)) {
      throw new IllegalStateException("Файл основной БД не найден");
    }

    String preRestoreName = filePrefix + "-pre-restore-" + LocalDateTime.now(ZoneId.of(zone)).format(TS) + ".db";
    Path preRestorePath = resolvePath(backupPath).resolve(preRestoreName);
    Files.createDirectories(preRestorePath.getParent());
    createSqliteBackup(preRestorePath);

    try (Connection connection = DriverManager.getConnection(datasourceUrl);
         Statement statement = connection.createStatement()) {
      connection.setAutoCommit(false);
      statement.execute("PRAGMA foreign_keys = OFF");
      statement.execute("ATTACH DATABASE '" + backupPathEscaped + "' AS backup_db");

      List<String> mainTables = listTables(connection, "main");
      Set<String> backupTables = new HashSet<>(listTables(connection, "backup_db"));

      for (String table : mainTables) {
        statement.execute("DELETE FROM " + quoteIdentifier(table));
      }

      for (String table : mainTables) {
        if (!backupTables.contains(table)) {
          continue;
        }
        List<String> columns = commonColumns(connection, table);
        if (columns.isEmpty()) {
          continue;
        }
        String cols = columns.stream().map(this::quoteIdentifier).collect(java.util.stream.Collectors.joining(", "));
        statement.execute(
            "INSERT INTO " + quoteIdentifier(table) + " (" + cols + ") SELECT " + cols + " FROM backup_db." + quoteIdentifier(table)
        );
      }

      if (mainTables.contains("sqlite_sequence") && backupTables.contains("sqlite_sequence")) {
        statement.execute("DELETE FROM sqlite_sequence");
        statement.execute("INSERT INTO sqlite_sequence(name,seq) SELECT name,seq FROM backup_db.sqlite_sequence");
      }

      statement.execute("DETACH DATABASE backup_db");
      statement.execute("PRAGMA foreign_keys = ON");
      connection.commit();
    }
  }

  private List<String> listTables(Connection connection, String db) throws Exception {
    List<String> result = new ArrayList<>();
    String sql = "SELECT name FROM " + db + ".sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
    try (Statement statement = connection.createStatement();
         ResultSet rs = statement.executeQuery(sql)) {
      while (rs.next()) {
        String name = rs.getString(1);
        if (name != null && !name.isBlank()) {
          result.add(name);
        }
      }
    }
    return result;
  }

  private List<String> commonColumns(Connection connection, String table) throws Exception {
    Set<String> backupColumns = new HashSet<>(readColumns(connection, "backup_db", table));
    List<String> mainColumns = readColumns(connection, "main", table);
    return mainColumns.stream()
        .filter(col -> backupColumns.contains(col))
        .toList();
  }

  private List<String> readColumns(Connection connection, String db, String table) throws Exception {
    List<String> columns = new ArrayList<>();
    String sql = "PRAGMA " + db + ".table_info(" + quoteIdentifierForPragma(table) + ")";
    try (Statement statement = connection.createStatement();
         ResultSet rs = statement.executeQuery(sql)) {
      while (rs.next()) {
        String col = rs.getString("name");
        if (col != null && !col.isBlank()) {
          columns.add(col);
        }
      }
    }
    return columns;
  }

  private String quoteIdentifier(String identifier) {
    return "\"" + identifier.replace("\"", "\"\"") + "\"";
  }

  private String quoteIdentifierForPragma(String identifier) {
    return "'" + identifier.replace("'", "''") + "'";
  }

  private Path resolvePath(String value) {
    Path path = Paths.get(value);
    if (path.isAbsolute()) {
      return path.normalize();
    }
    return Paths.get(System.getProperty("user.dir")).resolve(path).normalize();
  }
}
