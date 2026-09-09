package com.staticgrind.api.preset;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PresetRepository extends JpaRepository<Preset, UUID> {

    List<Preset> findByUserIdOrderByCreatedAtDesc(UUID userId);

    // Every lookup is scoped by user id as well as preset id. A preset that
    // belongs to someone else is simply not found, which is what lets the
    // controller answer 404 rather than 403 and avoid confirming it exists.
    Optional<Preset> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);

    @Query("select p from Preset p where p.userId = :userId and lower(p.name) = lower(:name)")
    Optional<Preset> findByUserIdAndNameIgnoreCase(UUID userId, String name);
}
