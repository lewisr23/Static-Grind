package com.staticgrind.api.preset;

import com.staticgrind.api.config.AppProperties;
import com.staticgrind.api.error.ApiExceptions;
import com.staticgrind.api.preset.dto.PresetRequest;
import com.staticgrind.api.preset.dto.PresetResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class PresetService {

    private final PresetRepository presets;
    private final AppProperties props;

    public PresetService(PresetRepository presets, AppProperties props) {
        this.presets = presets;
        this.props = props;
    }

    @Transactional(readOnly = true)
    public List<PresetResponse> list(UUID userId) {
        return presets.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(PresetResponse::from)
                .toList();
    }

    @Transactional
    public PresetResponse create(UUID userId, PresetRequest request) {
        if (presets.countByUserId(userId) >= props.maxPresetsPerUser()) {
            throw new ApiExceptions.Unprocessable(
                    "You have reached the limit of " + props.maxPresetsPerUser() + " saved presets.");
        }
        requireNameFree(userId, request.name(), null);

        Preset preset = new Preset(userId, request.name().trim(), request.params(), request.seed());
        return PresetResponse.from(presets.save(preset));
    }

    @Transactional
    public PresetResponse update(UUID userId, UUID presetId, PresetRequest request) {
        Preset preset = presets.findByIdAndUserId(presetId, userId)
                .orElseThrow(() -> new ApiExceptions.NotFound("No such preset."));

        requireNameFree(userId, request.name(), presetId);

        preset.update(request.name().trim(), request.params(), request.seed());
        return PresetResponse.from(presets.save(preset));
    }

    @Transactional
    public void delete(UUID userId, UUID presetId) {
        Preset preset = presets.findByIdAndUserId(presetId, userId)
                .orElseThrow(() -> new ApiExceptions.NotFound("No such preset."));
        presets.delete(preset);
    }

    /**
     * The unique index on (user_id, lower(name)) is the real guarantee. This
     * check exists so the user gets a useful 409 instead of a constraint
     * violation surfacing as a 500.
     */
    private void requireNameFree(UUID userId, String name, UUID allowedId) {
        Optional<Preset> clash = presets.findByUserIdAndNameIgnoreCase(userId, name.trim());
        if (clash.isPresent() && !clash.get().getId().equals(allowedId)) {
            throw new ApiExceptions.Conflict("You already have a preset called \"" + name.trim() + "\".");
        }
    }
}
