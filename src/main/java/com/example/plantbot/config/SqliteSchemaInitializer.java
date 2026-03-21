package com.example.plantbot.config;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component("sqliteSchemaInitializer")
@RequiredArgsConstructor
@Slf4j
public class SqliteSchemaInitializer {
  private static final Map<String, String> PLANTS_COLUMNS = buildPlantsColumns();
  private static final String WATERING_PROFILE_CHECK =
      "CHECK (watering_profile IN ('INDOOR','OUTDOOR_ORNAMENTAL','OUTDOOR_GARDEN','SEED_START'))";
  private static final String WATERING_PROFILE_TYPE_CHECK =
      "CHECK (watering_profile_type IN ('INDOOR','OUTDOOR_ORNAMENTAL','OUTDOOR_GARDEN','SEED_START'))";

  private final DataSource dataSource;

  @PostConstruct
  public void ensurePlantsColumns() {
    try (Connection connection = dataSource.getConnection();
         Statement statement = connection.createStatement()) {
      if (!isSqlite(connection)) {
        return;
      }

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
      if (!columns.isEmpty()) {
        for (Map.Entry<String, String> column : PLANTS_COLUMNS.entrySet()) {
          if (!columns.contains(column.getKey())) {
            statement.execute("ALTER TABLE plants ADD COLUMN " + column.getValue());
            columns.add(column.getKey());
            log.info("SQLite schema init: added plants.{}", column.getKey());
          }
        }

        if (requiresPlantsTableRebuild(statement)) {
          rebuildPlantsTable(connection, statement, columns);
          log.info("SQLite schema init: rebuilt plants table to refresh watering profile constraints");
        }
      }

      ensureGlobalSettingsColumns(statement);
      ensurePerformanceIndexes(statement);
    } catch (Exception ex) {
      log.warn("SQLite schema init failed: {}", ex.getMessage());
    }
  }

  private boolean isSqlite(Connection connection) {
    try {
      DatabaseMetaData metaData = connection.getMetaData();
      return metaData != null
          && metaData.getDatabaseProductName() != null
          && metaData.getDatabaseProductName().toLowerCase(Locale.ROOT).contains("sqlite");
    } catch (Exception ex) {
      return true;
    }
  }

  private boolean requiresPlantsTableRebuild(Statement statement) throws Exception {
    try (ResultSet rs = statement.executeQuery("SELECT sql FROM sqlite_master WHERE type='table' AND name='plants'")) {
      if (!rs.next()) {
        return false;
      }
      String createSql = rs.getString(1);
      if (createSql == null) {
        return false;
      }
      String normalized = createSql.toUpperCase(Locale.ROOT);
      return normalized.contains("WATERING_PROFILE")
          && (!normalized.contains(WATERING_PROFILE_CHECK.toUpperCase(Locale.ROOT))
          || !normalized.contains(WATERING_PROFILE_TYPE_CHECK.toUpperCase(Locale.ROOT)));
    }
  }

  private void rebuildPlantsTable(Connection connection, Statement statement, Set<String> existingColumns) throws Exception {
    boolean autoCommit = connection.getAutoCommit();
    connection.setAutoCommit(false);
    try {
      statement.execute("ALTER TABLE plants RENAME TO plants_legacy");
      statement.execute(buildCreatePlantsTableSql());

      List<String> copyColumns = PLANTS_COLUMNS.keySet().stream()
          .filter(existingColumns::contains)
          .toList();
      String joinedColumns = String.join(", ", copyColumns);
      statement.execute("INSERT INTO plants (" + joinedColumns + ") SELECT " + joinedColumns + " FROM plants_legacy");
      statement.execute("DROP TABLE plants_legacy");

      connection.commit();
    } catch (Exception ex) {
      connection.rollback();
      throw ex;
    } finally {
      connection.setAutoCommit(autoCommit);
    }
  }

  private String buildCreatePlantsTableSql() {
    StringBuilder sql = new StringBuilder("CREATE TABLE plants (");
    boolean first = true;
    for (String definition : PLANTS_COLUMNS.values()) {
      if (!first) {
        sql.append(", ");
      }
      sql.append(definition);
      first = false;
    }
    sql.append(")");
    return sql.toString();
  }

  private void ensurePerformanceIndexes(Statement statement) throws Exception {
    createIndexIfTableExists(statement, "idx_plants_user_id", "plants", "user_id");
    createIndexIfTableExists(statement, "idx_plants_user_category", "plants", "user_id, category");
    createIndexIfTableExists(statement, "idx_plants_user_name", "plants", "user_id, name");
    createIndexIfTableExists(statement, "idx_plants_last_watered", "plants", "last_watered_date");
    createIndexIfTableExists(statement, "idx_plants_created_at", "plants", "created_at");

    createIndexIfTableExists(statement, "idx_rec_snapshot_plant_created", "recommendation_snapshots", "plant_id, created_at");
    createIndexIfTableExists(statement, "idx_rec_snapshot_created", "recommendation_snapshots", "created_at");

    createIndexIfTableExists(statement, "idx_openrouter_cache_namespace", "openrouter_cache", "namespace");
    createIndexIfTableExists(statement, "idx_openrouter_cache_expires", "openrouter_cache", "expires_at");
    createIndexIfTableExists(statement, "idx_openrouter_cache_updated", "openrouter_cache", "updated_at");

    createIndexIfTableExists(statement, "idx_watering_log_plant_watered", "watering_log", "plant_id, watered_at");
    createIndexIfTableExists(statement, "idx_watering_log_created", "watering_log", "created_at");
  }

  private void ensureGlobalSettingsColumns(Statement statement) throws Exception {
    Set<String> columns = new HashSet<>();
    try (ResultSet rs = statement.executeQuery("PRAGMA table_info(global_settings)")) {
      while (rs.next()) {
        String name = rs.getString("name");
        if (name != null) {
          columns.add(name.toLowerCase(Locale.ROOT));
        }
      }
    }
    if (columns.isEmpty()) {
      return;
    }
    addGlobalSettingsColumnIfMissing(statement, columns, "text_model_availability_status", "text_model_availability_status TEXT");
    addGlobalSettingsColumnIfMissing(statement, columns, "text_model_last_checked_at", "text_model_last_checked_at TIMESTAMP");
    addGlobalSettingsColumnIfMissing(statement, columns, "text_model_last_successful_at", "text_model_last_successful_at TIMESTAMP");
    addGlobalSettingsColumnIfMissing(statement, columns, "text_model_last_error_message", "text_model_last_error_message VARCHAR(1024)");
    addGlobalSettingsColumnIfMissing(statement, columns, "text_model_last_notified_unavailable_at", "text_model_last_notified_unavailable_at TIMESTAMP");
    addGlobalSettingsColumnIfMissing(statement, columns, "photo_model_availability_status", "photo_model_availability_status TEXT");
    addGlobalSettingsColumnIfMissing(statement, columns, "photo_model_last_checked_at", "photo_model_last_checked_at TIMESTAMP");
    addGlobalSettingsColumnIfMissing(statement, columns, "photo_model_last_successful_at", "photo_model_last_successful_at TIMESTAMP");
    addGlobalSettingsColumnIfMissing(statement, columns, "photo_model_last_error_message", "photo_model_last_error_message VARCHAR(1024)");
    addGlobalSettingsColumnIfMissing(statement, columns, "photo_model_last_notified_unavailable_at", "photo_model_last_notified_unavailable_at TIMESTAMP");
    addGlobalSettingsColumnIfMissing(statement, columns, "text_model_check_interval_minutes", "text_model_check_interval_minutes INTEGER");
    addGlobalSettingsColumnIfMissing(statement, columns, "photo_model_check_interval_minutes", "photo_model_check_interval_minutes INTEGER");
  }

  private void addGlobalSettingsColumnIfMissing(Statement statement, Set<String> columns, String columnName, String ddl) throws Exception {
    if (!columns.contains(columnName)) {
      statement.execute("ALTER TABLE global_settings ADD COLUMN " + ddl);
      columns.add(columnName);
      log.info("SQLite schema init: added global_settings.{}", columnName);
    }
  }

  private void createIndexIfTableExists(Statement statement, String indexName, String tableName, String columns) throws Exception {
    if (!tableExists(statement, tableName)) {
      return;
    }
    statement.execute("CREATE INDEX IF NOT EXISTS " + indexName + " ON " + tableName + " (" + columns + ")");
  }

  private boolean tableExists(Statement statement, String tableName) throws Exception {
    try (ResultSet rs = statement.executeQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='" + tableName + "'")) {
      return rs.next();
    }
  }

  private static Map<String, String> buildPlantsColumns() {
    Map<String, String> columns = new LinkedHashMap<>();
    columns.put("id", "id INTEGER PRIMARY KEY");
    columns.put("base_interval_days", "base_interval_days INTEGER NOT NULL");
    columns.put("created_at", "created_at TIMESTAMP");
    columns.put("last_reminder_date", "last_reminder_date DATE");
    columns.put("last_watered_date", "last_watered_date DATE NOT NULL");
    columns.put("name", "name VARCHAR(255) NOT NULL");
    columns.put("pot_volume_liters", "pot_volume_liters FLOAT NOT NULL");
    columns.put("type", "type VARCHAR(255) NOT NULL");
    columns.put("user_id", "user_id BIGINT NOT NULL");
    columns.put("lookup_at", "lookup_at TIMESTAMP");
    columns.put("lookup_source", "lookup_source VARCHAR(255)");
    columns.put("mulched", "mulched BOOLEAN");
    columns.put("outdoor_aream2", "outdoor_aream2 FLOAT");
    columns.put("outdoor_soil_type", "outdoor_soil_type VARCHAR(255)");
    columns.put("perennial", "perennial BOOLEAN");
    columns.put("photo_url", "photo_url VARCHAR(255)");
    columns.put("placement", "placement VARCHAR(255)");
    columns.put("sun_exposure", "sun_exposure VARCHAR(255)");
    columns.put("winter_dormancy_enabled", "winter_dormancy_enabled BOOLEAN");
    columns.put("preferred_water_ml", "preferred_water_ml INTEGER");
    columns.put("category", "category TEXT");
    columns.put("ai_watering_enabled", "ai_watering_enabled BOOLEAN");
    columns.put("city", "city VARCHAR(255)");
    columns.put("confidence_score", "confidence_score FLOAT");
    columns.put("container_type", "container_type VARCHAR(255)");
    columns.put("container_volume_liters", "container_volume_liters FLOAT");
    columns.put("crop_type", "crop_type VARCHAR(255)");
    columns.put("drip_irrigation", "drip_irrigation BOOLEAN");
    columns.put("generated_at", "generated_at TIMESTAMP");
    columns.put("greenhouse", "greenhouse BOOLEAN");
    columns.put("growth_stage", "growth_stage VARCHAR(255)");
    columns.put("growth_stagev2", "growth_stagev2 VARCHAR(255)");
    columns.put("seed_stage", "seed_stage VARCHAR(255)");
    columns.put("target_environment_type", "target_environment_type VARCHAR(255)");
    columns.put("seed_container_type", "seed_container_type VARCHAR(255)");
    columns.put("seed_substrate_type", "seed_substrate_type VARCHAR(255)");
    columns.put("sowing_date", "sowing_date DATE");
    columns.put("under_cover", "under_cover BOOLEAN");
    columns.put("grow_light", "grow_light BOOLEAN");
    columns.put("germination_temperaturec", "germination_temperaturec DOUBLE");
    columns.put("expected_germination_days_min", "expected_germination_days_min INTEGER");
    columns.put("expected_germination_days_max", "expected_germination_days_max INTEGER");
    columns.put("recommended_check_interval_hours", "recommended_check_interval_hours INTEGER");
    columns.put("recommended_watering_mode", "recommended_watering_mode VARCHAR(255)");
    columns.put("seed_care_mode", "seed_care_mode VARCHAR(255)");
    columns.put("seed_summary", "seed_summary VARCHAR(1024)");
    columns.put("seed_reasoning_json", "seed_reasoning_json VARCHAR(4000)");
    columns.put("seed_warnings_json", "seed_warnings_json VARCHAR(4000)");
    columns.put("seed_care_source", "seed_care_source VARCHAR(255)");
    columns.put("seed_action_history_json", "seed_action_history_json VARCHAR(4000)");
    columns.put("last_recommendation_source", "last_recommendation_source VARCHAR(255)");
    columns.put("last_recommendation_summary", "last_recommendation_summary VARCHAR(1024)");
    columns.put("last_recommendation_updated_at", "last_recommendation_updated_at TIMESTAMP");
    columns.put("last_recommended_interval_days", "last_recommended_interval_days INTEGER");
    columns.put("last_recommended_water_ml", "last_recommended_water_ml INTEGER");
    columns.put("manual_water_volume_ml", "manual_water_volume_ml INTEGER");
    columns.put("plant_placement_type", "plant_placement_type VARCHAR(255)");
    columns.put("recommendation_reasoning_json", "recommendation_reasoning_json VARCHAR(4000)");
    columns.put("recommendation_source", "recommendation_source VARCHAR(255)");
    columns.put("recommendation_summary", "recommendation_summary VARCHAR(1024)");
    columns.put("recommendation_warnings_json", "recommendation_warnings_json VARCHAR(4000)");
    columns.put("recommended_interval_days", "recommended_interval_days INTEGER");
    columns.put("recommended_water_volume_ml", "recommended_water_volume_ml INTEGER");
    columns.put("region", "region VARCHAR(255)");
    columns.put("soil_type", "soil_type VARCHAR(255)");
    columns.put("sunlight_exposure", "sunlight_exposure VARCHAR(255)");
    columns.put("watering_profile", "watering_profile VARCHAR(255) " + WATERING_PROFILE_CHECK);
    columns.put("watering_profile_type", "watering_profile_type VARCHAR(255) " + WATERING_PROFILE_TYPE_CHECK);
    columns.put("weather_adjustment_enabled", "weather_adjustment_enabled BOOLEAN");
    return columns;
  }
}
