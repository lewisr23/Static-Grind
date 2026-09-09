package com.staticgrind.api.preset;

import com.staticgrind.api.preset.dto.ColorGrade;
import com.staticgrind.api.preset.dto.PresetParams;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.function.DoubleFunction;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Pins every bound in PresetParams against MOD_CONFIG in
 * frontend/src/components/GlitchCanvas.jsx.
 *
 * The two live in different languages and different build systems, so nothing
 * but this test stops them drifting apart. If a knob's range changes in the
 * frontend and not here, the backend starts rejecting presets the UI can
 * legitimately produce — silently, and only for the users who turn that knob
 * far enough.
 */
class PresetParamsValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setUp() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            validator = factory.getValidator();
        }
    }

    private static PresetParams withAllZero() {
        return new PresetParams(ColorGrade.NONE,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    @Test
    @DisplayName("all knobs at zero is valid — that is DEFAULT_PARAMS")
    void allZeroIsValid() {
        assertThat(validator.validate(withAllZero())).isEmpty();
    }

    @Test
    @DisplayName("every knob at its documented maximum is valid")
    void allMaximaAreValid() {
        PresetParams maxed = new PresetParams(ColorGrade.GRAYSCALE,
                360,   // hueShift
                1,     // saturation
                1,     // vignette
                1,     // noise
                50,    // chromaShift
                30,    // interlace
                40,    // waveWarp
                1,     // bitCrush
                100,   // displace
                1,     // feedback
                1,     // scanlineIntensity
                1, 1, 1, 1, 1, 1, 1, // pixelSort..melt
                8);    // kaleidoscope
        assertThat(validator.validate(maxed)).isEmpty();
    }

    @ParameterizedTest(name = "{0} rejects {1}")
    @CsvSource({
            "hueShift,          361",
            "hueShift,          -1",
            "saturation,        1.01",
            "saturation,        -1.01",
            "vignette,          1.5",
            "noise,             2",
            "chromaShift,       51",
            "interlace,         31",
            "waveWarp,          41",
            "bitCrush,          1.2",
            "displace,          101",
            "feedback,          1.1",
            "scanlineIntensity, 1.1",
            "pixelSort,         1.1",
            "sortVertical,      1.1",
            "channelSort,       1.1",
            "rowShift,          1.1",
            "blockGlitch,       1.1",
            "smear,             1.1",
            "melt,              1.1",
            "kaleidoscope,      9"
    })
    void rejectsOutOfRange(String field, double value) {
        PresetParams params = withField(field, value);
        assertThat(validator.validate(params))
                .as("%s = %s should be rejected", field, value)
                .isNotEmpty();
    }

    @Test
    @DisplayName("a missing colour grade means none, not a validation failure")
    void nullColorGradeDefaultsToNone() {
        PresetParams params = new PresetParams(null,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        assertThat(params.colorGrade()).isEqualTo(ColorGrade.NONE);
        assertThat(validator.validate(params)).isEmpty();
    }

    @Test
    @DisplayName("colour grades match the GRADES list in the frontend")
    void colorGradeWireValues() {
        assertThat(ColorGrade.values())
                .extracting(ColorGrade::wire)
                .containsExactly("none", "vhs", "neon", "infrared", "grayscale");
        assertThatThrownBy(() -> ColorGrade.of("sepia"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    /** Builds an otherwise-zero params with one field set. */
    private static PresetParams withField(String field, double v) {
        DoubleFunction<PresetParams> f = switch (field.trim()) {
            case "hueShift"          -> x -> new PresetParams(ColorGrade.NONE, x,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
            case "saturation"        -> x -> new PresetParams(ColorGrade.NONE, 0,x,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
            case "vignette"          -> x -> new PresetParams(ColorGrade.NONE, 0,0,x,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
            case "noise"             -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,x,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
            case "chromaShift"       -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,x,0,0,0,0,0,0,0,0,0,0,0,0,0,0);
            case "interlace"         -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,x,0,0,0,0,0,0,0,0,0,0,0,0,0);
            case "waveWarp"          -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,x,0,0,0,0,0,0,0,0,0,0,0,0);
            case "bitCrush"          -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,x,0,0,0,0,0,0,0,0,0,0,0);
            case "displace"          -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,x,0,0,0,0,0,0,0,0,0,0);
            case "feedback"          -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,x,0,0,0,0,0,0,0,0,0);
            case "scanlineIntensity" -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,x,0,0,0,0,0,0,0,0);
            case "pixelSort"         -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,x,0,0,0,0,0,0,0);
            case "sortVertical"      -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,0,x,0,0,0,0,0,0);
            case "channelSort"       -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,0,0,x,0,0,0,0,0);
            case "rowShift"          -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,x,0,0,0,0);
            case "blockGlitch"       -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,x,0,0,0);
            case "smear"             -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,x,0,0);
            case "melt"              -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,x,0);
            case "kaleidoscope"      -> x -> new PresetParams(ColorGrade.NONE, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,x);
            default -> throw new IllegalArgumentException("Unknown field: " + field);
        };
        return f.apply(v);
    }
}
