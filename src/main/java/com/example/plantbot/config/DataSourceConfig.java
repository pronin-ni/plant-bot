package com.example.plantbot.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;

@Configuration
public class DataSourceConfig {
  @Bean
  @Primary
  public DataSource dataSource(@Value("${spring.datasource.url}") String url,
                               @Value("${spring.datasource.driver-class-name}") String driver) {
    ensureSqliteDir(url);
    HikariDataSource ds = new HikariDataSource();
    ds.setJdbcUrl(url);
    ds.setDriverClassName(driver);
    return ds;
  }

  private void ensureSqliteDir(String url) {
    if (url == null || !url.startsWith("jdbc:sqlite:")) {
      return;
    }
    String path = url.substring("jdbc:sqlite:".length());
    if (path.startsWith("./")) {
      path = path.substring(2);
    }
    Path dbPath = Path.of(path).toAbsolutePath();
    Path parent = dbPath.getParent();
    if (parent == null) {
      return;
    }
    try {
      Files.createDirectories(parent);
    } catch (Exception ignored) {
    }
  }
}
