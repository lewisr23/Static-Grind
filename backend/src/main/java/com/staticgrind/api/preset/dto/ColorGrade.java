package com.staticgrind.api.preset.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Mirrors GRADES in frontend/src/components/GlitchCanvas.jsx. */
public enum ColorGrade {
    NONE("none"),
    VHS("vhs"),
    NEON("neon"),
    INFRARED("infrared"),
    GRAYSCALE("grayscale");

    private final String wire;

    ColorGrade(String wire) { this.wire = wire; }

    @JsonValue
    public String wire() { return wire; }

    @JsonCreator
    public static ColorGrade of(String value) {
        if (value == null) return NONE;
        for (ColorGrade g : values()) {
            if (g.wire.equalsIgnoreCase(value)) return g;
        }
        throw new IllegalArgumentException("Unknown colorGrade: " + value);
    }
}
