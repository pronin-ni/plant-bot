package com.example.plantbot.config;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@Component("sqliteSchemaInitializer")
@RequiredArgsConstructor
@Slf4j
public class SqliteSchemaInitializer {
  private final DataSource dataSource;

  @PostConstruct
  public void ensurePlantsColumns() {
    try (Connection connection = dataSource.getConnection();
         Statement statement = connection.createStatement()) {
      Set<String> columns = new HashSet<>();
      try (ResultSet rs = statement.executeQuery("PRAGMA table_info(plants)")) {
        while (rs.next()) {
          String name = rs.getString("name");
          if (name != null) {
            columns.add(name.toLowerCase(Locale.ROOT));
          }
        }
      }

      // Если таблицы plants пока нет (первый запуск), Hibernate создаст ее сам.
      if (columns.isEmpty()) {
        return;
      }

      if (!columns.contains("category")) {
        statement.execute("ALTER TABLE plants ADD COLUMN category TEXT");
        log.info("SQLite schema init: added plants.category");
      }

      if (!columns.contains("preferred_water_ml")) {
        statement.execute("ALTER TABLE plants ADD COLUMN preferred_water_ml INTEGER");
        log.info("SQLite schema init: added plants.preferred_water_ml");
      }
    } catch (Exception ex) {
      log.warn("SQLite schema init failed: {}", ex.getMessage());
    }
  }
}
