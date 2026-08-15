package com.glitchlab.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "glitch_jobs")
@Data
@NoArgsConstructor
public class GlitchJob {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String prompt;

    // The effect parameters JSON returned by Ollama
    // e.g. {"chromaShift":0.8,"scanlines":true,"pixelSort":0.4,"colorGrade":"vhs","noise":0.2}
    @Column(name = "effect_params", columnDefinition = "TEXT")
    private String effectParams;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private JobStatus status = JobStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = Instant.now();
    }

    public enum JobStatus {
        PENDING,
        COMPLETED,
        FAILED
    }
}
