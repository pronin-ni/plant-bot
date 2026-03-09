package com.example.plantbot.repository;

import com.example.plantbot.domain.GlobalSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GlobalSettingsRepository extends JpaRepository<GlobalSettings, Long> {
}
