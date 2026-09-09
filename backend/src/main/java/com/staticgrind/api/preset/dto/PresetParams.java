package com.staticgrind.api.preset.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

/**
 * One saved knob position per effect.
 *
 * The bounds below mirror MOD_CONFIG in frontend/src/components/GlitchCanvas.jsx
 * (min/max per knob) and must be kept in step with it. That duplication is
 * deliberate: generating one from the other would couple the Maven build to the
 * npm build for very little gain. PresetParamsValidationTest pins every bound
 * here so a drift shows up as a failing test rather than as data the UI cannot
 * render.
 *
 * Fields are primitive doubles, so a param missing from the request body lands
 * at 0.0 — which is exactly DEFAULT_PARAMS, i.e. the effect switched off.
 */
public record PresetParams(

        ColorGrade colorGrade,

        @DecimalMin("0")  @DecimalMax("360") double hueShift,
        @DecimalMin("-1") @DecimalMax("1")   double saturation,
        @DecimalMin("0")  @DecimalMax("1")   double vignette,
        @DecimalMin("0")  @DecimalMax("1")   double noise,
        @DecimalMin("0")  @DecimalMax("50")  double chromaShift,
        @DecimalMin("0")  @DecimalMax("30")  double interlace,
        @DecimalMin("0")  @DecimalMax("40")  double waveWarp,
        @DecimalMin("0")  @DecimalMax("1")   double bitCrush,
        @DecimalMin("0")  @DecimalMax("100") double displace,
        @DecimalMin("0")  @DecimalMax("1")   double feedback,
        @DecimalMin("0")  @DecimalMax("1")   double scanlineIntensity,
        @DecimalMin("0")  @DecimalMax("1")   double pixelSort,
        @DecimalMin("0")  @DecimalMax("1")   double sortVertical,
        @DecimalMin("0")  @DecimalMax("1")   double channelSort,
        @DecimalMin("0")  @DecimalMax("1")   double rowShift,
        @DecimalMin("0")  @DecimalMax("1")   double blockGlitch,
        @DecimalMin("0")  @DecimalMax("1")   double smear,
        @DecimalMin("0")  @DecimalMax("1")   double melt,
        @DecimalMin("0")  @DecimalMax("8")   double kaleidoscope
) {
    public PresetParams {
        // An absent colorGrade means "none", same as the frontend default,
        // rather than a validation failure.
        if (colorGrade == null) colorGrade = ColorGrade.NONE;
    }
}
