package com.staticgrind.api.preset.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PresetRequest(
        @NotBlank @Size(max = 40) String name,
        @NotNull @Valid PresetParams params,
        Long seed
) {}
