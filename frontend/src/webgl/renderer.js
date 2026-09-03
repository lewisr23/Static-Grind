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

// Every pixel-denominated parameter is authored against a 1000px-wide frame and
// then scaled to the real canvas. Without this a 12px chroma shift is a shout on
// a 600px thumbnail and invisible on a 4000px photo.
const float REF_WIDTH = 1000.0;

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

void main() {
  vec2 uv = v_uv;
  vec2 px = 1.0 / u_res;
  float rscale = u_res.x / REF_WIDTH;
  vec2 spx = px * rscale;          // one "reference pixel", in UV units

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

  // Bit Crush — exponential in bit depth, not linear in level count. Linear
  // interpolation from 255 levels spends the whole first half of the knob
  // between 255 and 128 levels, which no eye can tell apart.
  // 0 -> 8 bits (identity) · 0.5 -> ~4.5 bits · 1.0 -> 1 bit
  if (u_bitCrush > 0.0) {
    float levels = exp2(mix(8.0, 1.0, u_bitCrush));
    c.rgb = floor(c.rgb * levels + 0.5) / levels;
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
    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = mix(c.rgb, vec3(luma), 0.15);
    c.rgb = clamp(c.rgb * 1.1 - 0.05, 0.0, 1.0);
  } else if (u_colorGrade == 2) { // Neon
    c.r = clamp(pow(max(c.r, 0.0), 0.7) * 1.2,  0.0, 1.0);
    c.g = clamp(pow(max(c.g, 0.0), 0.8) * 0.85, 0.0, 1.0);
    c.b = clamp(pow(max(c.b, 0.0), 0.6) * 1.4,  0.0, 1.0);
  } else if (u_colorGrade == 3) { // Infrared
    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = vec3(
      clamp(1.0 - luma * 0.5 + c.b * 0.5, 0.0, 1.0),
      clamp(c.g * 0.7 + luma * 0.1,        0.0, 1.0),
      clamp(luma * 0.8,                     0.0, 1.0)
    );
  } else if (u_colorGrade == 4) { // Grayscale
    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    c.rgb = vec3(luma);
  }

  // Saturation — bipolar. -100% is fully grey, +100% is a hard push. The old
  // one-sided version could only ever add, so half a knob did nothing.
  if (abs(u_saturation) > 0.001) {
    float luma = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    float amt = u_saturation < 0.0 ? 1.0 + u_saturation : 1.0 + u_saturation * 1.6;
    c.rgb = clamp(mix(vec3(luma), c.rgb, amt), 0.0, 1.0);
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
