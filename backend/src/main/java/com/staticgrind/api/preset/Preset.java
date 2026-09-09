package com.staticgrind.api.preset;

import com.staticgrind.api.preset.dto.PresetParams;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "presets")
public class Preset {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String name;

    // Stored as jsonb. Validated against PresetParams on the way in, so the
    // column never holds a shape the frontend cannot load back.
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private PresetParams params;

    // Nullable: the seed is what makes the destructive pass reproducible, but a
    // preset saved from a still that was never reseeded does not need one.
    @Column
    private Long seed;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Preset() {}

    public Preset(UUID userId, String name, PresetParams params, Long seed) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.name = name;
        this.params = params;
        this.seed = seed;
        this.updatedAt = Instant.now();
    }

    public void update(String name, PresetParams params, Long seed) {
        this.name = name;
        this.params = params;
        this.seed = seed;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getName() { return name; }
    public PresetParams getParams() { return params; }
    public Long getSeed() { return seed; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
