package com.example.plantbot.repository;

import com.example.plantbot.domain.AuthIdentity;
import com.example.plantbot.domain.AuthProviderType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentity, Long> {
  Optional<AuthIdentity> findByProviderAndProviderSubject(AuthProviderType provider, String providerSubject);

  Optional<AuthIdentity> findFirstByEmailIgnoreCase(String email);
}
