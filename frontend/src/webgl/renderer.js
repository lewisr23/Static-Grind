// ── Vertex shader (shared) ─────────────────────────────────────────────────────
const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

// ── Effects fragment shader ────────────────────────────────────────────────────
const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_prev;
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform int u_colorGrade;
uniform float u_hueShift;
uniform float u_saturation;
uniform float u_vignette;
uniform float u_noise;
uniform float u_chromaShift;
uniform float u_interlace;
uniform float u_waveWarp;
uniform float u_bitCrush;
uniform float u_displace;
uniform float u_feedback;
uniform float u_scanlines;
uniform float u_twirl;
uniform float u_mosaic;
uniform float u_depthPop;
uniform float u_depthSlice;
uniform float u_depthLight;
uniform float u_depthFog;
uniform float u_edgeGlow;
uniform float u_bloom;
uniform float u_solarize;
uniform float u_lens;
uniform float u_ripple;
uniform float u_zoomBlur;
uniform float u_halftone;
uniform float u_paint;
uniform float u_dither;
uniform float u_duotone;
uniform float u_depthBlur;

// Every pixel-denominated parameter is authored against a 1000px-wide frame and
// then scaled to the real canvas. Without this a 12px chroma shift is a shout on
// a 600px thumbnail and invisible on a 4000px photo.
const float REF_WIDTH = 1000.0;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 17.5);
  return fract(p.x * p.y);
}
float hash1(float n) { return fract(sin(n) * 43758.5453); }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0*d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float lumaAt(vec2 p) {
  return dot(texture2D(u_tex, clamp(p, 0.0, 1.0)).rgb, LUMA);
}

/**
 * Stand-in depth map: a blurred luma field, leaning on the usual monocular cue
 * that the lit part of a thing is the part facing you. It is not metric depth
 * and it will happily read a white wall as near, but it tracks shape closely
 * enough that displacing and relighting by it looks like relief rather than
 * noise. The blur is what makes it usable at all: raw luma follows every speck
 * of grain, and a depth field has to be smooth or everything driven by it
 * crawls.
 */
float depthAt(vec2 p, vec2 r) {
  float s = lumaAt(p) * 2.0;
  s += lumaAt(p + vec2(r.x, 0.0)) + lumaAt(p - vec2(r.x, 0.0));
  s += lumaAt(p + vec2(0.0, r.y)) + lumaAt(p - vec2(0.0, r.y));
  s += lumaAt(p + r) + lumaAt(p - r);
  return s * 0.125;
}

/**
 * Ordered-dither threshold. WebGL1 has no integer bitwise operators and no
 * dynamic indexing of a constant array, so the usual 4x4 Bayer matrix is built
 * arithmetically instead of looked up: bayer2 gives the 2x2 pattern, and
 * nesting it at half scale gives the 4x4 one.
 */
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) { return bayer2(a * 0.5) * 0.25 + bayer2(a); }

/**
 * One quadrant of a Kuwahara window: the mean colour of a 3x3 block reaching
 * out from the pixel in the direction sgn, with the luma variance of that block
 * in .w. Painting each pixel with whichever quadrant is flattest is what turns
 * a photograph into brush strokes: detail inside a region gets averaged away
 * while an edge between two regions stays put, because the quadrant that
 * straddles the edge is never the calmest one.
 */
vec4 kuwaQuad(vec2 p, vec2 r, vec2 sgn) {
  vec3 sum = vec3(0.0);
  float s1 = 0.0, s2 = 0.0;
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 3; j++) {
      vec3 s = texture2D(u_tex, clamp(p + vec2(float(i), float(j)) * r * sgn, 0.0, 1.0)).rgb;
      sum += s;
      float l = dot(s, LUMA);
      s1 += l;
      s2 += l * l;
    }
  }
  float mean = s1 / 9.0;
  return vec4(sum / 9.0, s2 / 9.0 - mean * mean);
}

void main() {
  vec2 uv = v_uv;
  vec2 px = 1.0 / u_res;
  float rscale = u_res.x / REF_WIDTH;
  vec2 spx = px * rscale;          // one "reference pixel", in UV units
  float aspect = u_res.x / u_res.y;

  // Twirl — a vortex about the centre, strongest in the middle and unwound to
  // nothing by the edge, so the corners stay put and the frame keeps its shape.
  // Aspect-corrected, or it shears into an ellipse on a wide picture.
  if (abs(u_twirl) > 0.001) {
    vec2 d = uv - 0.5;
    d.x *= aspect;
    float a = (1.0 - smoothstep(0.0, 0.72, length(d))) * u_twirl * 3.14159265;
    float si = sin(a), co = cos(a);
    d = vec2(d.x * co - d.y * si, d.x * si + d.y * co);
    d.x /= aspect;
    uv = d + 0.5;
  }

  // Lens — bipolar barrel and pincushion. Positive magnifies the middle and
  // packs the edges in, the way a wide lens does; negative stretches the edges
  // out instead. Aspect-corrected so the distortion stays radial.
  if (abs(u_lens) > 0.001) {
    vec2 d = uv - 0.5;
    d.x *= aspect;
    d *= 1.0 + u_lens * dot(d, d) * 1.1;
    d.x /= aspect;
    uv = d + 0.5;
  }

  // Ripple — concentric waves out from the centre. Static, not animated: a
  // still only redraws when a knob moves, so anything keyed to time would sit
  // frozen at whatever phase the last redraw caught.
  if (u_ripple > 0.0) {
    vec2 d = uv - 0.5;
    float rad = length(vec2(d.x * aspect, d.y));
    vec2 dir = rad > 1e-5 ? d / rad : vec2(0.0);
    uv += dir * sin(rad * mix(18.0, 90.0, u_ripple)) * u_ripple * spx.x * 22.0;
  }

  // Wave Warp — two harmonics so the distortion reads as a warped signal rather
  // than a clean lens bulge
  if (u_waveWarp > 0.0) {
    float w = sin(uv.y * 25.0) * 0.75 + sin(uv.y * 61.0 + 1.7) * 0.25;
    uv.x += w * u_waveWarp * spx.x;
  }

  // Interlace — alternate-row horizontal shift
  if (u_interlace > 0.0) {
    float row = floor(v_uv.y * u_res.y);
    float dir = mod(row, 2.0) * 2.0 - 1.0;
    float amt = hash1(floor(row / 2.0) + u_seed * 99.1) * u_interlace * spx.x;
    uv.x += dir * amt;
  }

  // Displace — noise-based spatial displacement
  if (u_displace > 0.0) {
    float n1 = hash(uv * 5.1 + vec2(u_seed + 0.1));
    float n2 = hash(uv * 5.1 + vec2(u_seed + 1.1));
    uv += (vec2(n1, n2) - 0.5) * 2.0 * u_displace * spx;
  }

  // Depth, the geometric half. Both of these move pixels by the depth field, so
  // they read it once between them and run before anything samples colour.
  if (u_depthPop > 0.0 || u_depthSlice > 0.0) {
    float d = depthAt(uv, spx * 6.0) - 0.5;

    // Depth Pop — push near pixels out from the centre and pull far ones in.
    // Radial rather than lateral: that is the parallax you get walking toward a
    // scene, and it reads as depth instead of a sideways smear.
    if (u_depthPop > 0.0) {
      uv += (uv - 0.5) * (d * 2.0) * u_depthPop * spx.x;
    }

    // Depth Slice — quantise the field into planes and shear them apart, so the
    // picture comes apart into stacked cut-outs instead of stretching smoothly
    // the way Depth Pop does.
    if (u_depthSlice > 0.0) {
      float plane = floor((d + 0.5) * 7.0) / 7.0 - 0.5;
      uv.x += plane * u_depthSlice * 0.16;
    }
  }

  // Mosaic — last of the geometry, so the cells stay square and axis-aligned
  // however much warping happened above. Squared, because the interesting half
  // of this knob is the fine end.
  if (u_mosaic > 0.0) {
    vec2 cell = spx * mix(2.0, 90.0, u_mosaic * u_mosaic);
    uv = (floor(uv / cell) + 0.5) * cell;
  }

  uv = clamp(uv, 0.0, 1.0);

  // Chroma Shift — RGB channel lateral separation
  vec4 c;
  if (u_chromaShift > 0.0) {
    float sh = u_chromaShift * spx.x;
    float r = texture2D(u_tex, clamp(uv + vec2(sh,  0.0), 0.0, 1.0)).r;
    float g = texture2D(u_tex, uv).g;
    float b = texture2D(u_tex, clamp(uv - vec2(sh,  0.0), 0.0, 1.0)).b;
    c = vec4(r, g, b, 1.0);
  } else {
    c = texture2D(u_tex, uv);
  }

  // Paint — Kuwahara. Four overlapping quadrants, and the pixel takes the mean
  // of whichever one has the least variation in it. Flat areas smooth into
  // blocks of colour while edges stay hard, which is why this reads as brush
  // work rather than as a blur.
  if (u_paint > 0.0) {
    vec2 r = spx * mix(1.5, 9.0, u_paint);
    vec4 q0 = kuwaQuad(uv, r, vec2( 1.0,  1.0));
    vec4 q1 = kuwaQuad(uv, r, vec2(-1.0,  1.0));
    vec4 q2 = kuwaQuad(uv, r, vec2( 1.0, -1.0));
    vec4 q3 = kuwaQuad(uv, r, vec2(-1.0, -1.0));
    vec4 best = q0;
    if (q1.w < best.w) best = q1;
    if (q2.w < best.w) best = q2;
    if (q3.w < best.w) best = q3;
    c.rgb = mix(c.rgb, best.rgb, u_paint);
  }

  // Depth Blur — depth of field off the same stand-in field. Far parts of the
  // frame go soft and near parts stay sharp, so the picture gains a focal plane
  // it never had. Eight taps in a double ring, same trick as Bloom.
  if (u_depthBlur > 0.0) {
    float coc = pow(1.0 - depthAt(uv, spx * 6.0), 1.4) * u_depthBlur;
    if (coc > 0.01) {
      vec2 r = spx * coc * 26.0;
      vec3 sum = texture2D(u_tex, uv).rgb;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        float ring = mod(float(i), 2.0) < 0.5 ? 1.0 : 0.6;
        sum += texture2D(u_tex, clamp(uv + vec2(cos(a), sin(a)) * r * ring, 0.0, 1.0)).rgb;
      }
      c.rgb = mix(c.rgb, sum / 9.0, min(1.0, coc * 2.0));
    }
  }

  // Zoom Blur — smear each pixel along the line back to the centre, so the
  // frame reads as a lunge toward whatever is in the middle of it.
  if (u_zoomBlur > 0.0) {
    vec2 d = (uv - 0.5) * u_zoomBlur * 0.16;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 10; i++) {
      sum += texture2D(u_tex, clamp(uv - d * (float(i) / 9.0), 0.0, 1.0)).rgb;
    }
    c.rgb = mix(c.rgb, sum * 0.1, min(1.0, u_zoomBlur * 1.3));
  }

  // Relight — take the depth field as a heightfield, its gradient as a surface
  // normal, and light that from the top left. The picture keeps its own colour
  // and gains shading, which is what makes a flat photo look moulded. It sits
  // ahead of the grade so everything downstream treats the result as the
  // picture.
  if (u_depthLight > 0.0) {
    vec2 r = spx * 4.0;
    float hx = depthAt(uv + vec2(r.x, 0.0), r) - depthAt(uv - vec2(r.x, 0.0), r);
    float hy = depthAt(uv + vec2(0.0, r.y), r) - depthAt(uv - vec2(0.0, r.y), r);
    vec3 n = normalize(vec3(-hx * 18.0, -hy * 18.0, 1.0));
    vec3 lightDir = normalize(vec3(-0.55, 0.62, 0.56));
    float diff = clamp(dot(n, lightDir), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 22.0);
    vec3 lit = clamp(c.rgb * (0.28 + 1.55 * diff) + vec3(spec * 0.55), 0.0, 1.0);
    c.rgb = mix(c.rgb, lit, u_depthLight);
  }

  // Bit Crush — exponential in bit depth, not linear in level count. Linear
  // interpolation from 255 levels spends the whole first half of the knob
  // between 255 and 128 levels, which no eye can tell apart.
  // 0 -> 8 bits (identity) · 0.5 -> ~4.5 bits · 1.0 -> 1 bit
  if (u_bitCrush > 0.0) {
    float levels = exp2(mix(8.0, 1.0, u_bitCrush));
    c.rgb = floor(c.rgb * levels + 0.5) / levels;
  }

  // Solarize — the Sabattier flip. The threshold walks down from 1 as the knob
  // climbs, so channels roll over into their inverse a few at a time instead of
  // the whole picture turning inside out the moment the knob leaves zero.
  if (u_solarize > 0.0) {
    float t = mix(1.0, 0.22, u_solarize);
    c.rgb = mix(c.rgb, 1.0 - c.rgb, step(vec3(t), c.rgb));
  }

  // Contour — Sobel on luma. Low settings lay linework over the picture; past
  // halfway the picture itself drops away and leaves the lines on black. Ahead
  // of the grade, so Neon and Infrared colour the linework too.
  if (u_edgeGlow > 0.0) {
    vec2 r = spx * 1.6;
    float tl = lumaAt(uv + vec2(-r.x,  r.y));
    float tt = lumaAt(uv + vec2( 0.0,  r.y));
    float tr = lumaAt(uv + vec2( r.x,  r.y));
    float ll = lumaAt(uv + vec2(-r.x,  0.0));
    float rr = lumaAt(uv + vec2( r.x,  0.0));
    float bl = lumaAt(uv + vec2(-r.x, -r.y));
    float bb = lumaAt(uv + vec2( 0.0, -r.y));
    float br = lumaAt(uv + vec2( r.x, -r.y));
    float gx = (tr + 2.0 * rr + br) - (tl + 2.0 * ll + bl);
    float gy = (tl + 2.0 * tt + tr) - (bl + 2.0 * bb + br);
    float e = clamp(length(vec2(gx, gy)) * (0.8 + 3.2 * u_edgeGlow), 0.0, 1.0);
    vec3 lines = vec3(e);
    c.rgb = mix(clamp(c.rgb + lines * u_edgeGlow, 0.0, 1.0), lines,
                smoothstep(0.5, 1.0, u_edgeGlow));
  }

  // Halftone — a rotated dot screen, the way print reproduces a continuous
  // tone. The grid is turned 25 degrees off square because a screen laid
  // straight beats against the pixel grid and moires. Dot area follows the tone
  // read at the cell's own centre, so a bright cell fills solid and a dark one
  // shrinks to nothing.
  if (u_halftone > 0.0) {
    float cellPx = mix(3.0, 22.0, u_halftone) * max(rscale, 0.25);
    float sa = sin(0.4363323), ca = cos(0.4363323);
    vec2 P = uv * u_res;
    vec2 R = vec2(P.x * ca - P.y * sa, P.x * sa + P.y * ca);
    vec2 centerR = (floor(R / cellPx) + 0.5) * cellPx;
    vec2 centerP = vec2(centerR.x * ca + centerR.y * sa, centerR.y * ca - centerR.x * sa);
    float tone = dot(texture2D(u_tex, clamp(centerP / u_res, 0.0, 1.0)).rgb, LUMA);
    // radius from the square root of tone, so it is the dot's area that tracks
    // brightness rather than its width
    float dist = length(R - centerR) / (cellPx * 0.5);
    float ink = 1.0 - smoothstep(sqrt(tone) - 0.12, sqrt(tone) + 0.12, dist);
    c.rgb = mix(c.rgb, c.rgb * ink, u_halftone);
  }

  // Duotone — a gradient map. Throw away the original hues, keep the
  // brightness, and read the colour back out of a fixed three-stop ramp from
  // cold shadows through a warm midtone to a pale highlight. Sits ahead of Hue
  // Shift, so that knob turns the whole ramp to wherever you want it.
  if (u_duotone > 0.0) {
    float l = dot(c.rgb, LUMA);
    vec3 ramp = l < 0.5
      ? mix(vec3(0.04, 0.10, 0.20), vec3(0.55, 0.22, 0.35), l * 2.0)
      : mix(vec3(0.55, 0.22, 0.35), vec3(1.00, 0.86, 0.55), (l - 0.5) * 2.0);
    c.rgb = mix(c.rgb, ramp, u_duotone);
  }

  // Noise — eased so the bottom half is usable grain. Straight linear amplitude
  // is already full static by 50%, which wastes the top half of the travel.
  if (u_noise > 0.0) {
    float amt = u_noise * (0.15 + 0.85 * u_noise);
    float nr = hash(v_uv + vec2(u_seed * 0.37, u_seed * 1.13)) * 2.0 - 1.0;
    float ng = hash(v_uv + vec2(u_seed * 2.11, u_seed * 0.53)) * 2.0 - 1.0;
    float nb = hash(v_uv + vec2(u_seed * 1.77, u_seed * 3.19)) * 2.0 - 1.0;
    // mostly luma grain with a little chroma speckle, like tape noise
    c.rgb += mix(vec3(ng), vec3(nr, ng, nb), 0.4) * amt;
  }

  // Hue Shift
  if (u_hueShift > 0.0) {
    vec3 hsv = rgb2hsv(c.rgb);
    hsv.x = fract(hsv.x + u_hueShift / 360.0);
    c.rgb = hsv2rgb(hsv);
  }

  // Color Grade
  if (u_colorGrade == 1) {       // VHS
    c.r = clamp(c.r * 1.1 + 0.04, 0.0, 1.0);
    c.g = clamp(c.g * 0.95, 0.0, 1.0);
    c.b = clamp(c.b * 0.8 + 0.05, 0.0, 1.0);
    float luma = dot(c.rgb, LUMA);
    c.rgb = mix(c.rgb, vec3(luma), 0.15);
    c.rgb = clamp(c.rgb * 1.1 - 0.05, 0.0, 1.0);
  } else if (u_colorGrade == 2) { // Neon
    c.r = clamp(pow(max(c.r, 0.0), 0.7) * 1.2,  0.0, 1.0);
    c.g = clamp(pow(max(c.g, 0.0), 0.8) * 0.85, 0.0, 1.0);
    c.b = clamp(pow(max(c.b, 0.0), 0.6) * 1.4,  0.0, 1.0);
  } else if (u_colorGrade == 3) { // Infrared
    float luma = dot(c.rgb, LUMA);
    c.rgb = vec3(
      clamp(1.0 - luma * 0.5 + c.b * 0.5, 0.0, 1.0),
      clamp(c.g * 0.7 + luma * 0.1,        0.0, 1.0),
      clamp(luma * 0.8,                     0.0, 1.0)
    );
  } else if (u_colorGrade == 4) { // Grayscale
    float luma = dot(c.rgb, LUMA);
    c.rgb = vec3(luma);
  }

  // Saturation — bipolar. -100% is fully grey, +100% is a hard push. The old
  // one-sided version could only ever add, so half a knob did nothing.
  if (abs(u_saturation) > 0.001) {
    float luma = dot(c.rgb, LUMA);
    float amt = u_saturation < 0.0 ? 1.0 + u_saturation : 1.0 + u_saturation * 1.6;
    c.rgb = clamp(mix(vec3(luma), c.rgb, amt), 0.0, 1.0);
  }

  // Bloom — highlights bleed into what is around them. Twelve taps in a double
  // ring: a single ring at one radius leaves a visible polygon edge around a
  // bright spot, and alternating the radius breaks that up for free. Read from
  // the source rather than from c, so the glow stays clean when the picture
  // above it has been crushed or torn.
  if (u_bloom > 0.0) {
    vec2 r = spx * (7.0 + 26.0 * u_bloom);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      float ring = mod(float(i), 2.0) < 0.5 ? 1.0 : 0.55;
      vec3 s = texture2D(u_tex, clamp(uv + vec2(cos(a), sin(a)) * r * ring, 0.0, 1.0)).rgb;
      sum += s * smoothstep(0.55, 0.95, dot(s, LUMA));
    }
    c.rgb = clamp(c.rgb + sum * (1.0 / 12.0) * u_bloom * 3.2, 0.0, 1.0);
  }

  // Dither — cut the number of levels, but push each pixel over the line by a
  // threshold from an ordered grid first, so what is lost comes back as a weave
  // instead of as flat bands. Exponential in level count for the same reason
  // Bit Crush is: nobody can see the difference between 64 levels and 60.
  if (u_dither > 0.0) {
    float levels = exp2(mix(6.0, 1.0, u_dither));
    float t = (bayer4(v_uv * u_res / max(rscale, 0.25)) - 0.5) / levels;
    c.rgb = floor(clamp(c.rgb + t, 0.0, 1.0) * (levels - 1.0) + 0.5) / (levels - 1.0);
  }

  // Depth Fog — aerial perspective. Far parts of the field wash out toward a
  // cool haze and lose their contrast, which is what distance does to a real
  // view. After the grade, so the haze is the last colour in, the way it sits
  // in front of everything in life.
  if (u_depthFog > 0.0) {
    float d = depthAt(uv, spx * 6.0);
    float fog = clamp(pow(1.0 - d, 1.6) * u_depthFog, 0.0, 1.0);
    c.rgb = mix(c.rgb, vec3(0.60, 0.65, 0.74), fog);
  }

  // Feedback — blend current output with previous frame texture. u_feedback
  // arrives pre-shaped from JS (see the half-life comment where it's set) so
  // this is already the correct per-frame blend weight, used as-is.
  if (u_feedback > 0.0) {
    vec4 prev = texture2D(u_prev, v_uv);
    c.rgb = mix(c.rgb, prev.rgb, u_feedback);
  }

  // Scanlines — fixed pitch in reference space (a band every ~3 reference rows).
  // Keying the frequency to the raw pixel height put one line on every physical
  // row, which aliases into moire the moment the canvas is scaled to fit.
  if (u_scanlines > 0.0) {
    float rows = max(1.0, u_res.y / rscale / 3.0);
    float line = 0.5 + 0.5 * sin(v_uv.y * rows * 6.28318531);
    c.rgb *= mix(1.0, 0.2 + 0.8 * line, u_scanlines);
  }

  // Vignette — reaches true black in the corners at 100%
  if (u_vignette > 0.0) {
    float dist = length(v_uv - 0.5) * 1.4142136;
    float falloff = smoothstep(0.2, 0.98, dist);
    c.rgb *= 1.0 - falloff * u_vignette;
  }

  gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
}
`

// ── Blit fragment shader (passthrough FBO → screen) ───────────────────────────
const BLIT_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() { gl_FragColor = texture2D(u_tex, v_uv); }
`

// ── Helpers ───────────────────────────────────────────────────────────────────
function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error('Shader: ' + gl.getShaderInfoLog(s))
  return s
}

function linkProg(gl, vertSrc, fragSrc) {
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vertSrc))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragSrc))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error('Link: ' + gl.getProgramInfoLog(p))
  return p
}

function makeTex(gl) {
  const t = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return t
}

/**
 * Feedback isn't a "how much" knob, it's a "how long" knob, and those two
 * don't map onto the shader's blend weight the same way.
 *
 * A per-frame blend of `w` toward the previous frame decays a trail's
 * strength to half after roughly log(0.5) / log(w) frames. That function is
 * flat for almost the whole 0-1 range and only takes off in the last few
 * percent: w=0.9 half-lives in about 7 frames, w=0.99 takes about 70, and the
 * knob used to hand the shader `feedback * 0.96` directly as w. So turning
 * the dial from 0 to 90 barely changed the trail length at all, then the
 * last stretch of travel took it from "gone in a blink" to "lingers for
 * seconds", which is exactly the dead-then-a-cliff behaviour a linear dial
 * shouldn't have.
 *
 * This inverts that: pick the half-life in frames as the thing that scales
 * with the knob, then solve for the blend weight that produces it. `t` now
 * spends its whole range doing something.
 */
function feedbackBlend(t) {
  if (t <= 0) return 0
  const MAX_HALF_LIFE_FRAMES = 40 // roughly 1.3s of trail at 30fps, at full turn
  const halfLife = t * MAX_HALF_LIFE_FRAMES
  return Math.pow(0.5, 1 / halfLife)
}

// ── WebGLRenderer ─────────────────────────────────────────────────────────────
const GRADE_MAP = { none: 0, vhs: 1, neon: 2, infrared: 3, grayscale: 4 }
const EFFECT_UNIFORMS = [
  'u_colorGrade','u_hueShift','u_saturation','u_vignette','u_noise','u_chromaShift',
  'u_interlace','u_waveWarp','u_bitCrush',
  'u_displace','u_feedback','u_scanlines',
  'u_twirl','u_mosaic','u_depthPop','u_depthSlice','u_depthLight','u_depthFog',
  'u_edgeGlow','u_bloom','u_solarize',
  'u_lens','u_ripple','u_zoomBlur','u_halftone','u_paint','u_dither','u_duotone',
  'u_depthBlur',
]

export class WebGLRenderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false })
    if (!gl) throw new Error('WebGL not supported')
    this.gl = gl
    this.canvas = canvas
    this._initQuad()
    this._efxProg = linkProg(gl, VERT, FRAG)
    this._blitProg = linkProg(gl, VERT, BLIT_FRAG)
    this._cacheUniforms()
    this._initSrcTex()
    this._fbos = null
    this._fboSize = { w: 0, h: 0 }
    this._fboIdx = 0
  }

  _initQuad() {
    const gl = this.gl
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    this._quad = buf
  }

  _bindQuad(prog) {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  }

  _cacheUniforms() {
    const gl = this.gl
    this._u = {}
    for (const n of ['u_tex','u_prev','u_res','u_time','u_seed', ...EFFECT_UNIFORMS]) {
      this._u[n] = gl.getUniformLocation(this._efxProg, n)
    }
    this._blitU = gl.getUniformLocation(this._blitProg, 'u_tex')
  }

  _initSrcTex() {
    const gl = this.gl
    this._srcTex = makeTex(gl)
    // 1×1 black placeholder so texture is valid before source uploads
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0,0,0,255]))
  }

  _initFBOs(w, h) {
    const gl = this.gl
    if (this._fbos) {
      this._fbos.forEach(f => { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex) })
    }
    this._fbos = [0, 1].map(() => {
      const tex = makeTex(gl)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { fbo, tex }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this._fboSize = { w, h }
    this._fboIdx = 0
  }

  setSize(w, h) {
    this.canvas.width = w
    this.canvas.height = h
    this.gl.viewport(0, 0, w, h)
    if (this._fboSize.w !== w || this._fboSize.h !== h) this._initFBOs(w, h)
  }

  uploadSource(src) {
    const gl = this.gl
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.bindTexture(gl.TEXTURE_2D, this._srcTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  render(p, time) {
    const gl = this.gl
    if (!this._fbos) return
    const w = this.canvas.width, h = this.canvas.height
    const curr = this._fbos[this._fboIdx]
    const prev = this._fbos[1 - this._fboIdx]

    // Pass 1 — effects → curr FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, curr.fbo)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this._efxProg)
    this._bindQuad(this._efxProg)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._srcTex)
    gl.uniform1i(this._u['u_tex'], 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, prev.tex)
    gl.uniform1i(this._u['u_prev'], 1)

    gl.uniform2f(this._u['u_res'], w, h)
    gl.uniform1f(this._u['u_time'], time)
    gl.uniform1f(this._u['u_seed'], Math.random())

    gl.uniform1i(this._u['u_colorGrade'],  GRADE_MAP[p.colorGrade] ?? 0)
    gl.uniform1f(this._u['u_hueShift'],    p.hueShift)
    gl.uniform1f(this._u['u_saturation'],  p.saturation)
    gl.uniform1f(this._u['u_vignette'],    p.vignette)
    gl.uniform1f(this._u['u_noise'],       p.noise)
    gl.uniform1f(this._u['u_chromaShift'], p.chromaShift)
    gl.uniform1f(this._u['u_interlace'],   p.interlace)
    gl.uniform1f(this._u['u_waveWarp'],    p.waveWarp)
    gl.uniform1f(this._u['u_bitCrush'],    p.bitCrush)
    gl.uniform1f(this._u['u_displace'],    p.displace)
    gl.uniform1f(this._u['u_feedback'],    feedbackBlend(p.feedback))
    gl.uniform1f(this._u['u_scanlines'],   p.scanlineIntensity)
    gl.uniform1f(this._u['u_twirl'],       p.twirl)
    gl.uniform1f(this._u['u_mosaic'],      p.mosaic)
    gl.uniform1f(this._u['u_depthPop'],    p.depthPop)
    gl.uniform1f(this._u['u_depthSlice'],  p.depthSlice)
    gl.uniform1f(this._u['u_depthLight'],  p.depthLight)
    gl.uniform1f(this._u['u_depthFog'],    p.depthFog)
    gl.uniform1f(this._u['u_edgeGlow'],    p.edgeGlow)
    gl.uniform1f(this._u['u_bloom'],       p.bloom)
    gl.uniform1f(this._u['u_solarize'],    p.solarize)
    gl.uniform1f(this._u['u_lens'],        p.lens)
    gl.uniform1f(this._u['u_ripple'],      p.ripple)
    gl.uniform1f(this._u['u_zoomBlur'],    p.zoomBlur)
    gl.uniform1f(this._u['u_halftone'],    p.halftone)
    gl.uniform1f(this._u['u_paint'],       p.paint)
    gl.uniform1f(this._u['u_dither'],      p.dither)
    gl.uniform1f(this._u['u_duotone'],     p.duotone)
    gl.uniform1f(this._u['u_depthBlur'],   p.depthBlur)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // Pass 2 — blit curr FBO → screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this._blitProg)
    this._bindQuad(this._blitProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, curr.tex)
    gl.uniform1i(this._blitU, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    this._fboIdx = 1 - this._fboIdx
  }

  destroy() {
    const gl = this.gl
    gl.deleteProgram(this._efxProg)
    gl.deleteProgram(this._blitProg)
    gl.deleteTexture(this._srcTex)
    if (this._fbos) {
      this._fbos.forEach(f => { gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex) })
    }
  }
}
