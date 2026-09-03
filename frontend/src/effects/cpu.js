// ── CPU destructive effects ───────────────────────────────────────────────────
// These run on raw RGBA bytes after the WebGL pass. They are the effects that
// need to reorder or copy pixels non-locally, which a fragment shader cannot do.
//
// Everything here is deterministic given a seed. That matters for three reasons:
// a still image holds still while you dial a knob in, instead of reshuffling on
// every nudge; an export can be reproduced exactly; and this implementation can
// be checked against a port in another language byte for byte.

/**
 * xorshift32. Chosen because it is trivially portable — the same three shifts
 * with wrapping u32 arithmetic produce an identical stream in any language, so
 * a WASM port can be diffed against this one exactly.
 */
export function makeRng(seed) {
  let s = seed >>> 0
  if (s === 0) s = 0x9e3779b9
  return () => {
    s ^= (s << 13) >>> 0; s >>>= 0
    s ^= s >>> 17
    s ^= (s << 5) >>> 0; s >>>= 0
    return s / 4294967296
  }
}

const numeric = (a, b) => a - b
const RGB_SPAN = 0x1000000 // 2^24 — width of the packed RGB payload in a sort key

/**
 * Returns the 0–255 cutoff above which roughly `fraction` of the frame's pixels
 * sit. Pass channel -1 for luma, or 0/1/2 for R/G/B.
 *
 * The sort effects used to test against a flat `1 - intensity` cutoff, which is
 * why they looked dead below ~90%: on a dark frame almost no pixel ever cleared
 * the bar, and on a bright one everything cleared it at once. Deriving the
 * cutoff from the frame's own histogram makes the knob mean "sort this share of
 * the image", which behaves the same way on any source.
 */
function percentileCutoff(d, width, height, fraction, channel) {
  if (fraction >= 0.999) return -1 // everything qualifies
  if (fraction <= 0) return 256 // nothing does
  const hist = new Uint32Array(64)
  const n = width * height
  const stride = n > 400000 ? 4 : 1 // a 64-bin estimate does not need every pixel
  let total = 0
  for (let i = 0; i < n; i += stride) {
    const p = i * 4
    const v = channel < 0 ? (d[p] + d[p + 1] + d[p + 2]) / 3 : d[p + channel]
    hist[v >> 2]++
    total++
  }
  let want = total * fraction
  for (let b = 63; b >= 0; b--) {
    want -= hist[b]
    if (want <= 0) return b * 4
  }
  return 0
}

/**
 * Sort one contiguous run of pixels by brightness, in place. `stride` is 1 for a
 * horizontal run and `width` for a vertical one, so both sort directions share
 * this. Luma and RGB are packed into a single number per pixel so the run sorts
 * with a plain numeric compare instead of allocating a tuple per pixel.
 */
function sortRun(d, lum, base, from, to, stride, scratch) {
  if (to - from < 2) return
  scratch.length = 0
  for (let k = from; k < to; k++) {
    const i = (base + k * stride) * 4
    scratch.push(Math.round(lum[k]) * RGB_SPAN + (d[i] << 16 | d[i + 1] << 8 | d[i + 2]))
  }
  scratch.sort(numeric)
  for (let k = from; k < to; k++) {
    const i = (base + k * stride) * 4
    const rgb = scratch[k - from] % RGB_SPAN
    d[i] = rgb >> 16; d[i + 1] = (rgb >> 8) & 255; d[i + 2] = rgb & 255
  }
}

// Sort runs of bright pixels along each row — the classic horizontal streak
export function applyPixelSort(d, intensity, width, height) {
  const cut = percentileCutoff(d, width, height, intensity, -1)
  const lum = new Float32Array(width)
  const scratch = []
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4
      lum[x] = (d[i] + d[i + 1] + d[i + 2]) / 3
    }
    let start = -1
    for (let x = 0; x <= width; x++) {
      const inside = x < width && lum[x] > cut
      if (inside && start === -1) start = x
      if (!inside && start !== -1) { sortRun(d, lum, row, start, x, 1, scratch); start = -1 }
    }
  }
}

// The same sort running on columns — vertical streaks instead of horizontal
export function applyPixelSortVertical(d, intensity, width, height) {
  const cut = percentileCutoff(d, width, height, intensity, -1)
  const lum = new Float32Array(height)
  const scratch = []
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4
      lum[y] = (d[i] + d[i + 1] + d[i + 2]) / 3
    }
    let start = -1
    for (let y = 0; y <= height; y++) {
      const inside = y < height && lum[y] > cut
      if (inside && start === -1) start = y
      if (!inside && start !== -1) { sortRun(d, lum, x, start, y, width, scratch); start = -1 }
    }
  }
}

// Sort each RGB channel independently by its own value — destroys colour coherence
export function applyChannelSort(d, intensity, width, height) {
  const scratch = []
  for (const ch of [0, 1, 2]) {
    const cut = percentileCutoff(d, width, height, intensity, ch)
    for (let y = 0; y < height; y++) {
      const row = y * width
      let start = -1
      for (let x = 0; x <= width; x++) {
        const inside = x < width && d[(row + x) * 4 + ch] > cut
        if (inside && start === -1) start = x
        if (!inside && start !== -1) {
          if (x - start > 1) {
            scratch.length = 0
            for (let k = start; k < x; k++) scratch.push(d[(row + k) * 4 + ch])
            scratch.sort(numeric)
            for (let k = start; k < x; k++) d[(row + k) * 4 + ch] = scratch[k - start]
          }
          start = -1
        }
      }
    }
  }
}

/**
 * Displaced rectangular blocks, like corrupted macroblocks in a video stream.
 * Intensity drives count, size and displacement together, and every dimension is
 * a fraction of the frame, so a block covers the same share of any source.
 */
export function applyBlockGlitch(d, intensity, width, height, rng) {
  const copy = new Uint8ClampedArray(d)
  const count = Math.max(1, Math.round(Math.sqrt(intensity) * 40))
  const maxW = width * (0.06 + intensity * 0.44)
  const maxH = height * (0.012 + intensity * 0.085)
  const maxOff = width * (0.04 + intensity * 0.26)
  const minW = width * 0.02, minH = height * 0.006
  for (let b = 0; b < count; b++) {
    const bw = Math.max(2, Math.round(minW + rng() * maxW))
    const bh = Math.max(1, Math.round(minH + rng() * maxH))
    const bx = Math.floor(rng() * width)
    const by = Math.floor(rng() * height)
    // a displacement floor, so a block that fires always visibly moves
    const off = Math.round((rng() < 0.5 ? -1 : 1) * (0.25 + 0.75 * rng()) * maxOff)
    const yEnd = Math.min(by + bh, height)
    const xEnd = Math.min(bx + bw, width)
    for (let y = by; y < yEnd; y++) {
      const row = y * width
      for (let x = bx; x < xEnd; x++) {
        const srcX = ((x + off) % width + width) % width
        const dst = (row + x) * 4
        const src = (row + srcX) * 4
        d[dst] = copy[src]; d[dst + 1] = copy[src + 1]; d[dst + 2] = copy[src + 2]
      }
    }
  }
}

// Hold one pixel colour across part of a row — a stuck sample-and-hold
export function applySmear(d, intensity, width, height, rng) {
  const copy = new Uint8ClampedArray(d)
  // intensity is already baked into maxLen; multiplying by it again here was
  // what kept the bottom of this knob invisible
  const maxLen = width * (0.06 + intensity * 0.75)
  const rate = Math.sqrt(intensity) * 0.8
  for (let y = 0; y < height; y++) {
    if (rng() >= rate) continue
    const len = Math.round((0.2 + 0.8 * rng()) * maxLen)
    if (len < 2) continue
    const startX = Math.floor(rng() * Math.max(1, width - len))
    const s = (y * width + startX) * 4
    const r = copy[s], g = copy[s + 1], b = copy[s + 2]
    const end = Math.min(startX + len, width)
    for (let x = startX; x < end; x++) {
      const dst = (y * width + x) * 4
      d[dst] = r; d[dst + 1] = g; d[dst + 2] = b
    }
  }
}

let kaleidoCache = { lut: null, segments: -1, w: -1, h: -1 }

function buildKaleidoLUT(segments, width, height) {
  const lut = new Int32Array(width * height)
  const cx = width / 2, cy = height / 2
  const segAngle = (Math.PI * 2) / segments
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy
      const radius = Math.sqrt(dx * dx + dy * dy)
      let angle = ((Math.atan2(dy, dx) % segAngle) + segAngle) % segAngle
      if (angle > segAngle / 2) angle = segAngle - angle
      const srcX = Math.round(cx + radius * Math.cos(angle))
      const srcY = Math.round(cy + radius * Math.sin(angle))
      lut[y * width + x] = (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height)
        ? srcY * width + srcX : -1
    }
  }
  return lut
}

// Mirror the frame into `segments` wedges. The source-index map depends only on
// the segment count and frame size, so it is built once and cached.
export function applyKaleidoscope(d, segments, width, height) {
  segments = Math.floor(segments)
  if (segments < 2) return
  if (kaleidoCache.segments !== segments || kaleidoCache.w !== width || kaleidoCache.h !== height) {
    kaleidoCache = { lut: buildKaleidoLUT(segments, width, height), segments, w: width, h: height }
  }
  const lut = kaleidoCache.lut
  const copy = new Uint8ClampedArray(d)
  for (let i = 0; i < lut.length; i++) {
    const src = lut[i]
    if (src >= 0) {
      const dst = i * 4, s = src * 4
      d[dst] = copy[s]; d[dst + 1] = copy[s + 1]; d[dst + 2] = copy[s + 2]
    }
  }
}

// Run a pixel colour down the column below it, like wet emulsion
export function applyMelt(d, intensity, width, height, rng) {
  const rate = Math.sqrt(intensity) * 0.85
  for (let x = 0; x < width; x++) {
    if (rng() >= rate) continue
    const startY = Math.floor(rng() * height * 0.7)
    const len = Math.round((0.2 + 0.8 * rng()) * height * (0.08 + intensity * 0.72))
    if (len < 2) continue
    const s = (startY * width + x) * 4
    const r = d[s], g = d[s + 1], b = d[s + 2]
    const end = Math.min(startY + len, height)
    for (let y = startY + 1; y < end; y++) {
      const dst = (y * width + x) * 4
      d[dst] = r; d[dst + 1] = g; d[dst + 2] = b
    }
  }
}

/**
 * Horizontal tearing, in bands rather than per-row. Real signal dropout moves a
 * block of scanlines together; shifting every row independently just reads as
 * mush at any setting, which left the knob with nothing useful to say.
 */
export function applyRowShift(d, intensity, width, height, rng) {
  const copy = new Uint8ClampedArray(d)
  const maxShift = intensity * width * 0.6
  const maxBand = Math.max(2, Math.round(height * 0.12))
  let y = 0
  while (y < height) {
    const yEnd = Math.min(y + 1 + Math.floor(rng() * maxBand), height)
    if (rng() < 0.2 + intensity * 0.75) {
      // square the magnitude so most bands only nudge and a few tear right across
      const m = rng()
      const shift = Math.round((rng() < 0.5 ? -1 : 1) * m * m * maxShift)
      if (shift !== 0) {
        for (let yy = y; yy < yEnd; yy++) {
          const row = yy * width
          for (let x = 0; x < width; x++) {
            const srcX = ((x - shift) % width + width) % width
            const dst = (row + x) * 4
            const src = (row + srcX) * 4
            d[dst] = copy[src]; d[dst + 1] = copy[src + 1]; d[dst + 2] = copy[src + 2]
          }
        }
      }
    }
    y = yEnd
  }
}

/** The params this pass consumes, in the order they are applied. */
export const CPU_KEYS = ['kaleidoscope', 'rowShift', 'blockGlitch', 'smear',
  'channelSort', 'sortVertical', 'pixelSort', 'melt']

export function hasCpuWork(p) {
  for (const k of CPU_KEYS) if (p[k] > 0) return true
  return false
}

/**
 * The whole CPU pass, in one fixed order. Both the worker and the main-thread
 * fallback call this, so there is a single definition of what the chain is.
 * Mutates `d` in place and returns it.
 */
export function applyCpuChain(d, width, height, p, seed) {
  const rng = makeRng(seed)
  if (p.kaleidoscope > 0) applyKaleidoscope(d, p.kaleidoscope, width, height)
  if (p.rowShift > 0)     applyRowShift(d, p.rowShift, width, height, rng)
  if (p.blockGlitch > 0)  applyBlockGlitch(d, p.blockGlitch, width, height, rng)
  if (p.smear > 0)        applySmear(d, p.smear, width, height, rng)
  if (p.channelSort > 0)  applyChannelSort(d, p.channelSort, width, height)
  if (p.sortVertical > 0) applyPixelSortVertical(d, p.sortVertical, width, height)
  if (p.pixelSort > 0)    applyPixelSort(d, p.pixelSort, width, height)
  if (p.melt > 0)         applyMelt(d, p.melt, width, height, rng)
  return d
}
