package com.example.plantbot.config;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.sql.Statement;
import java.util.Locale;
import java.util.logging.Logger;

import static org.junit.jupiter.api.Assertions.*;

class SqliteSchemaInitializerTest {

  @Test
  void rebuildsLegacyPlantsTableAndAllowsSeedStartProfile() throws Exception {
    Path dbPath = Files.createTempFile("plantbot-schema-init-", ".db");
    try {
      DataSource dataSource = sqliteDataSource(dbPath);
      createLegacyPlantsTable(dataSource);

      SqliteSchemaInitializer initializer = new SqliteSchemaInitializer(dataSource);
      initializer.ensurePlantsColumns();

      try (Connection connection = dataSource.getConnection();
           Statement statement = connection.createStatement()) {
        String createSql;
        try (ResultSet rs = statement.executeQuery("SELECT sql FROM sqlite_master WHERE type='table' AND name='plants'")) {
          assertTrue(rs.next());
          createSql = rs.getString(1);
        }

        assertTrue(createSql.contains("SEED_START"));
        assertHasColumn(statement, "seed_stage");
        assertHasColumn(statement, "seed_summary");

        try (ResultSet rs = statement.executeQuery("SELECT COUNT(*) FROM plants WHERE name='Legacy plant'")) {
          assertTrue(rs.next());
          assertEquals(1, rs.getInt(1));
        }

        statement.executeUpdate("""
            INSERT INTO plants (
              base_interval_days,
              last_watered_date,
              name,
              pot_volume_liters,
              type,
              user_id,
              watering_profile,
              watering_profile_type
            ) VALUES (
              1,
              '2026-03-21',
              'Seed tray',
              0.2,
              'DEFAULT',
              1,
              'SEED_START',
              'SEED_START'
            )
            """);
      }
    } finally {
      Files.deleteIfExists(dbPath);
    }
  }

  @Test
  void addsGlobalSettingsMonitoringColumnsAndPerformanceIndexesOnLegacySqliteSchema() throws Exception {
    Path dbPath = Files.createTempFile("plantbot-schema-init-settings-", ".db");
    try {
      DataSource dataSource = sqliteDataSource(dbPath);
      createLegacyPlantsTable(dataSource);
      createLegacyGlobalSettingsTable(dataSource);
      createSupportingTablesWithoutIndexes(dataSource);

      SqliteSchemaInitializer initializer = new SqliteSchemaInitializer(dataSource);
      initializer.ensurePlantsColumns();

      try (Connection connection = dataSource.getConnection();
           Statement statement = connection.createStatement()) {
        assertHasGlobalSettingsColumn(statement, "text_model_availability_status");
        assertHasGlobalSettingsColumn(statement, "text_model_last_checked_at");
        assertHasGlobalSettingsColumn(statement, "text_model_last_successful_at");
        assertHasGlobalSettingsColumn(statement, "text_model_last_error_message");
        assertHasGlobalSettingsColumn(statement, "text_model_last_notified_unavailable_at");
        assertHasGlobalSettingsColumn(statement, "photo_model_availability_status");
        assertHasGlobalSettingsColumn(statement, "photo_model_last_checked_at");
        assertHasGlobalSettingsColumn(statement, "photo_model_last_successful_at");
        assertHasGlobalSettingsColumn(statement, "photo_model_last_error_message");
        assertHasGlobalSettingsColumn(statement, "photo_model_last_notified_unavailable_at");
        assertHasGlobalSettingsColumn(statement, "text_model_check_interval_minutes");
        assertHasGlobalSettingsColumn(statement, "photo_model_check_interval_minutes");

        assertHasIndex(statement, "idx_plants_user_id", "plants");
        assertHasIndex(statement, "idx_plants_user_category", "plants");
        assertHasIndex(statement, "idx_plants_user_name", "plants");
        assertHasIndex(statement, "idx_plants_last_watered", "plants");
        assertHasIndex(statement, "idx_plants_created_at", "plants");
        assertHasIndex(statement, "idx_rec_snapshot_plant_created", "recommendation_snapshots");
        assertHasIndex(statement, "idx_rec_snapshot_created", "recommendation_snapshots");
        assertHasIndex(statement, "idx_openrouter_cache_namespace", "openrouter_cache");
        assertHasIndex(statement, "idx_openrouter_cache_expires", "openrouter_cache");
        assertHasIndex(statement, "idx_openrouter_cache_updated", "openrouter_cache");
        assertHasIndex(statement, "idx_watering_log_plant_watered", "watering_log");
        assertHasIndex(statement, "idx_watering_log_created", "watering_log");
      }
    } finally {
      Files.deleteIfExists(dbPath);
    }
  }

  private void createLegacyPlantsTable(DataSource dataSource) throws Exception {
    try (Connection connection = dataSource.getConnection();
         Statement statement = connection.createStatement()) {
      statement.execute("""
          CREATE TABLE plants (
            id INTEGER PRIMARY KEY,
            base_interval_days INTEGER NOT NULL,
            created_at TIMESTAMP,
            last_reminder_date DATE,
            last_watered_date DATE NOT NULL,
            name VARCHAR(255) NOT NULL,
            pot_volume_liters FLOAT NOT NULL,
            type VARCHAR(255) NOT NULL,
            user_id BIGINT NOT NULL,
            preferred_water_ml INTEGER,
            category TEXT,
            watering_profile VARCHAR(255) CHECK (watering_profile IN ('INDOOR','OUTDOOR_ORNAMENTAL','OUTDOOR_GARDEN')),
            watering_profile_type VARCHAR(255) CHECK (watering_profile_type IN ('INDOOR','OUTDOOR_ORNAMENTAL','OUTDOOR_GARDEN'))
          )
          """);
      statement.executeUpdate("""
          INSERT INTO plants (
            id,
            base_interval_days,
            last_watered_date,
            name,
            pot_volume_liters,
            type,
            user_id,
            watering_profile,
            watering_profile_type
          ) VALUES (
            7,
            3,
            '2026-03-20',
            'Legacy plant',
            2.5,
            'DEFAULT',
            1,
            'INDOOR',
            'INDOOR'
          )
          """);
    }
  }

  private void createLegacyGlobalSettingsTable(DataSource dataSource) throws Exception {
    try (Connection connection = dataSource.getConnection();
         Statement statement = connection.createStatement()) {
      statement.execute("""
          CREATE TABLE global_settings (
            id INTEGER PRIMARY KEY,
            openrouter_api_key VARCHAR(4096),
            openrouter_text_model VARCHAR(255),
            openrouter_photo_model VARCHAR(255)
          )
          """);
      statement.executeUpdate("""
          INSERT INTO global_settings (
            id,
            openrouter_api_key,
            openrouter_text_model,
            openrouter_photo_model
          ) VALUES (
            1,
            'encrypted',
            'openai/gpt-4o-mini',
            'openai/gpt-4o-mini'
          )
          """);
    }
  }

  private void createSupportingTablesWithoutIndexes(DataSource dataSource) throws Exception {
    try (Connection connection = dataSource.getConnection();
         Statement statement = connection.createStatement()) {
      statement.execute("""
          CREATE TABLE recommendation_snapshots (
            id INTEGER PRIMARY KEY,
            plant_id BIGINT NOT NULL,
            created_at TIMESTAMP
          )
          """);
      statement.execute("""
          CREATE TABLE openrouter_cache (
            id INTEGER PRIMARY KEY,
            namespace VARCHAR(255),
            expires_at TIMESTAMP,
            updated_at TIMESTAMP
          )
          """);
      statement.execute("""
          CREATE TABLE watering_log (
            id INTEGER PRIMARY KEY,
            plant_id BIGINT NOT NULL,
            watered_at TIMESTAMP,
            created_at TIMESTAMP
          )
          """);
    }
  }

  private void assertHasColumn(Statement statement, String expectedColumn) throws Exception {
    try (ResultSet rs = statement.executeQuery("PRAGMA table_info(plants)")) {
      while (rs.next()) {
        String name = rs.getString("name");
        if (expectedColumn.equalsIgnoreCase(name)) {
          return;
        }
      }
    }
    fail("Expected column " + expectedColumn + " to exist after migration");
  }

  private void assertHasGlobalSettingsColumn(Statement statement, String expectedColumn) throws Exception {
    try (ResultSet rs = statement.executeQuery("PRAGMA table_info(global_settings)")) {
      while (rs.next()) {
        String name = rs.getString("name");
        if (expectedColumn.equalsIgnoreCase(name)) {
          return;
        }
      }
    }
    fail("Expected global_settings column " + expectedColumn + " to exist after migration");
  }

  private void assertHasIndex(Statement statement, String expectedIndex, String expectedTable) throws Exception {
    try (ResultSet rs = statement.executeQuery("PRAGMA index_list(" + expectedTable + ")")) {
      while (rs.next()) {
        String name = rs.getString("name");
        if (expectedIndex.equalsIgnoreCase(name)) {
          return;
        }
      }
    }
    fail("Expected index " + expectedIndex + " to exist on " + expectedTable);
  }

  private DataSource sqliteDataSource(Path dbPath) {
    String url = "jdbc:sqlite:" + dbPath.toAbsolutePath();
    return new DataSource() {
      @Override
      public Connection getConnection() throws SQLException {
        return DriverManager.getConnection(url);
      }

      @Override
      public Connection getConnection(String username, String password) throws SQLException {
        return getConnection();
      }

      @Override
      public <T> T unwrap(Class<T> iface) throws SQLException {
        throw new SQLException("Not a wrapper");
      }

      @Override
      public boolean isWrapperFor(Class<?> iface) {
        return false;
      }

      @Override
      public PrintWriter getLogWriter() {
        return null;
      }

      @Override
      public void setLogWriter(PrintWriter out) {
      }

      @Override
      public void setLoginTimeout(int seconds) {
      }

      @Override
      public int getLoginTimeout() {
        return 0;
      }

      @Override
      public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        return Logger.getLogger(Locale.ROOT.toLanguageTag());
      }
    };
  }
}
