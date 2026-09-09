package com.staticgrind.api.preset.dto;

import com.staticgrind.api.preset.Preset;

import java.time.Instant;
import java.util.UUID;

public record PresetResponse(
        UUID id,
        String name,
        PresetParams params,
        Long seed,
        Instant createdAt,
        Instant updatedAt
) {
    public static PresetResponse from(Preset p) {
        return new PresetResponse(p.getId(), p.getName(), p.getParams(), p.getSeed(),
                p.getCreatedAt(), p.getUpdatedAt());
    }
}
