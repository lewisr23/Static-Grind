//! CPU destructive glitch effects — a direct port of `frontend/src/effects/cpu.js`.
//!
//! Runs off the main thread in a Web Worker (see `frontend/src/effects/worker.js`),
//! behind the same JS fallback, so a WASM failure never takes the tool down.
//!
//! Every function here mirrors its JS counterpart line for line, including the
//! xorshift32 PRNG, so the two backends produce the same frame for the same
//! seed. Parity is checked from the browser console (both modules imported
//! directly, compared byte for byte across sizes/seeds/params) rather than a
//! wasm-bindgen-test harness — see the repo README for the results and the one
//! bug that check caught (a truncate-before-compare in the pixel sort).

use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;

// ── PRNG ─────────────────────────────────────────────────────────────────────

/// xorshift32, matching `makeRng` in cpu.js exactly: the same three shifts with
/// wrapping u32 arithmetic produce an identical stream in any language.
struct Rng(u32);

impl Rng {
    fn new(seed: u32) -> Self {
        Rng(if seed == 0 { 0x9e3779b9 } else { seed })
    }

    /// Next value in [0, 1), matching `s / 4294967296` in the JS version.
    fn next(&mut self) -> f64 {
        let mut s = self.0;
        s ^= s << 13;
        s ^= s >> 17;
        s ^= s << 5;
        self.0 = s;
        s as f64 / 4294967296.0
    }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

const RGB_SPAN: u32 = 0x1000000; // 2^24 — width of the packed RGB payload in a sort key

/// Returns the 0-255 cutoff above which roughly `fraction` of the frame's
/// pixels sit. `channel` is -1 for luma, or 0/1/2 for R/G/B. See the JS
/// version for why this replaced a flat threshold.
fn percentile_cutoff(d: &[u8], width: usize, height: usize, fraction: f64, channel: i32) -> i32 {
    if fraction >= 0.999 {
        return -1; // everything qualifies
    }
    if fraction <= 0.0 {
        return 256; // nothing does
    }
    let mut hist = [0u32; 64];
    let n = width * height;
    let stride = if n > 400_000 { 4 } else { 1 };
    let mut total: u32 = 0;
    let mut i = 0;
    while i < n {
        let p = i * 4;
        let v = if channel < 0 {
            ((d[p] as i32 + d[p + 1] as i32 + d[p + 2] as i32) as f64 / 3.0) as i32
        } else {
            d[p + channel as usize] as i32
        };
        hist[((v >> 2) as usize).min(63)] += 1;
        total += 1;
        i += stride;
    }
    let mut want = total as f64 * fraction;
    for b in (0..64).rev() {
        want -= hist[b] as f64;
        if want <= 0.0 {
            return (b * 4) as i32;
        }
    }
    0
}

/// Sort one contiguous run of pixels by brightness, in place. `stride` is 1 for
/// a horizontal run and `width` for a vertical one. Luma and RGB are packed
/// into a single u32 per pixel — this fits exactly (255 * 2^24 + 0xFFFFFF ==
/// u32::MAX) — so the run sorts with a plain numeric compare.
fn sort_run(d: &mut [u8], lum: &[f32], base: usize, from: usize, to: usize, stride: usize, scratch: &mut Vec<u32>) {
    if to - from < 2 {
        return;
    }
    scratch.clear();
    for k in from..to {
        let i = (base + k * stride) * 4;
        let packed = (lum[k].round() as u32) * RGB_SPAN
            + ((d[i] as u32) << 16 | (d[i + 1] as u32) << 8 | d[i + 2] as u32);
        scratch.push(packed);
    }
    scratch.sort(); // stable, matching JS Array.prototype.sort's guaranteed stability
    for k in from..to {
        let i = (base + k * stride) * 4;
        let rgb = scratch[k - from] % RGB_SPAN;
        d[i] = (rgb >> 16) as u8;
        d[i + 1] = ((rgb >> 8) & 255) as u8;
        d[i + 2] = (rgb & 255) as u8;
    }
}

// ── Sort effects ─────────────────────────────────────────────────────────────

/// Sort runs of bright pixels along each row — the classic horizontal streak.
fn apply_pixel_sort(d: &mut [u8], intensity: f64, width: usize, height: usize) {
    let cut = percentile_cutoff(d, width, height, intensity, -1);
    let mut lum = vec![0f32; width];
    let mut scratch = Vec::new();
    for y in 0..height {
        let row = y * width;
        for x in 0..width {
            let i = (row + x) * 4;
            lum[x] = (d[i] as f32 + d[i + 1] as f32 + d[i + 2] as f32) / 3.0;
        }
        let mut start: i64 = -1;
        for x in 0..=width {
            let inside = x < width && lum[x] > cut as f32;
            if inside && start == -1 {
                start = x as i64;
            }
            if !inside && start != -1 {
                sort_run(d, &lum, row, start as usize, x, 1, &mut scratch);
                start = -1;
            }
        }
    }
}

/// The same sort running on columns — vertical streaks instead of horizontal.
fn apply_pixel_sort_vertical(d: &mut [u8], intensity: f64, width: usize, height: usize) {
    let cut = percentile_cutoff(d, width, height, intensity, -1);
    let mut lum = vec![0f32; height];
    let mut scratch = Vec::new();
    for x in 0..width {
        for y in 0..height {
            let i = (y * width + x) * 4;
            lum[y] = (d[i] as f32 + d[i + 1] as f32 + d[i + 2] as f32) / 3.0;
        }
        let mut start: i64 = -1;
        for y in 0..=height {
            let inside = y < height && lum[y] > cut as f32;
            if inside && start == -1 {
                start = y as i64;
            }
            if !inside && start != -1 {
                sort_run(d, &lum, x, start as usize, y, width, &mut scratch);
                start = -1;
            }
        }
    }
}

/// Sort each RGB channel independently by its own value — destroys colour coherence.
fn apply_channel_sort(d: &mut [u8], intensity: f64, width: usize, height: usize) {
    let mut scratch: Vec<u8> = Vec::new();
    for ch in 0..3usize {
        let cut = percentile_cutoff(d, width, height, intensity, ch as i32);
        for y in 0..height {
            let row = y * width;
            let mut start: i64 = -1;
            for x in 0..=width {
                let inside = x < width && d[(row + x) * 4 + ch] as i32 > cut;
                if inside && start == -1 {
                    start = x as i64;
                }
                if !inside && start != -1 {
                    let s = start as usize;
                    if x - s > 1 {
                        scratch.clear();
                        for k in s..x {
                            scratch.push(d[(row + k) * 4 + ch]);
                        }
                        scratch.sort();
                        for k in s..x {
                            d[(row + k) * 4 + ch] = scratch[k - s];
                        }
                    }
                    start = -1;
                }
            }
        }
    }
}

// ── Randomised effects ───────────────────────────────────────────────────────

/// Displaced rectangular blocks, like corrupted macroblocks in a video stream.
fn apply_block_glitch(d: &mut [u8], intensity: f64, width: usize, height: usize, rng: &mut Rng) {
    let copy = d.to_vec();
    let count = (intensity.sqrt() * 40.0).round().max(1.0) as usize;
    let max_w = width as f64 * (0.06 + intensity * 0.44);
    let max_h = height as f64 * (0.012 + intensity * 0.085);
    let max_off = width as f64 * (0.04 + intensity * 0.26);
    let min_w = width as f64 * 0.02;
    let min_h = height as f64 * 0.006;

    for _ in 0..count {
        let bw = ((min_w + rng.next() * max_w).round() as usize).max(2);
        let bh = ((min_h + rng.next() * max_h).round() as usize).max(1);
        let bx = (rng.next() * width as f64).floor() as usize;
        let by = (rng.next() * height as f64).floor() as usize;
        // a displacement floor, so a block that fires always visibly moves
        let sign = if rng.next() < 0.5 { -1.0 } else { 1.0 };
        let off = (sign * (0.25 + 0.75 * rng.next()) * max_off).round() as i64;
        let y_end = (by + bh).min(height);
        let x_end = (bx + bw).min(width);
        for y in by..y_end {
            let row = y * width;
            for x in bx..x_end {
                let src_x = (((x as i64 + off) % width as i64 + width as i64) % width as i64) as usize;
                let dst = (row + x) * 4;
                let src = (row + src_x) * 4;
                d[dst] = copy[src];
                d[dst + 1] = copy[src + 1];
                d[dst + 2] = copy[src + 2];
            }
        }
    }
}

/// Hold one pixel colour across part of a row — a stuck sample-and-hold.
fn apply_smear(d: &mut [u8], intensity: f64, width: usize, height: usize, rng: &mut Rng) {
    let copy = d.to_vec();
    let max_len = width as f64 * (0.06 + intensity * 0.75);
    let rate = intensity.sqrt() * 0.8;
    for y in 0..height {
        if rng.next() >= rate {
            continue;
        }
        let len = ((0.2 + 0.8 * rng.next()) * max_len).round() as usize;
        if len < 2 {
            continue;
        }
        let start_x = (rng.next() * (width.saturating_sub(len)).max(1) as f64).floor() as usize;
        let s = (y * width + start_x) * 4;
        let (r, g, b) = (copy[s], copy[s + 1], copy[s + 2]);
        let end = (start_x + len).min(width);
        for x in start_x..end {
            let dst = (y * width + x) * 4;
            d[dst] = r;
            d[dst + 1] = g;
            d[dst + 2] = b;
        }
    }
}

/// Run a pixel colour down the column below it, like wet emulsion.
fn apply_melt(d: &mut [u8], intensity: f64, width: usize, height: usize, rng: &mut Rng) {
    let rate = intensity.sqrt() * 0.85;
    for x in 0..width {
        if rng.next() >= rate {
            continue;
        }
        let start_y = (rng.next() * height as f64 * 0.7).floor() as usize;
        let len = ((0.2 + 0.8 * rng.next()) * height as f64 * (0.08 + intensity * 0.72)).round() as usize;
        if len < 2 {
            continue;
        }
        let s = (start_y * width + x) * 4;
        let (r, g, b) = (d[s], d[s + 1], d[s + 2]);
        let end = (start_y + len).min(height);
        for y in (start_y + 1)..end {
            let dst = (y * width + x) * 4;
            d[dst] = r;
            d[dst + 1] = g;
            d[dst + 2] = b;
        }
    }
}

/// Horizontal tearing, in bands rather than per-row — real signal dropout
/// moves a block of scanlines together.
fn apply_row_shift(d: &mut [u8], intensity: f64, width: usize, height: usize, rng: &mut Rng) {
    let copy = d.to_vec();
    let max_shift = intensity * width as f64 * 0.6;
    let max_band = ((height as f64 * 0.12).round() as usize).max(2);
    let mut y = 0usize;
    while y < height {
        let y_end = (y + 1 + (rng.next() * max_band as f64).floor() as usize).min(height);
        if rng.next() < 0.2 + intensity * 0.75 {
            // square the magnitude so most bands only nudge and a few tear right across
            let m = rng.next();
            let sign = if rng.next() < 0.5 { -1.0 } else { 1.0 };
            let shift = (sign * m * m * max_shift).round() as i64;
            if shift != 0 {
                for yy in y..y_end {
                    let row = yy * width;
                    for x in 0..width {
                        let src_x = (((x as i64 - shift) % width as i64 + width as i64) % width as i64) as usize;
                        let dst = (row + x) * 4;
                        let src = (row + src_x) * 4;
                        d[dst] = copy[src];
                        d[dst + 1] = copy[src + 1];
                        d[dst + 2] = copy[src + 2];
                    }
                }
            }
        }
        y = y_end;
    }
}

// ── Kaleidoscope, with its LUT cached across calls ───────────────────────────

struct KaleidoCache {
    lut: Vec<i32>,
    segments: i32,
    w: usize,
    h: usize,
}

thread_local! {
    static KALEIDO_CACHE: std::cell::RefCell<Option<KaleidoCache>> = std::cell::RefCell::new(None);
}

fn build_kaleido_lut(segments: i32, width: usize, height: usize) -> Vec<i32> {
    let mut lut = vec![-1i32; width * height];
    let cx = width as f64 / 2.0;
    let cy = height as f64 / 2.0;
    let seg_angle = std::f64::consts::TAU / segments as f64;
    for y in 0..height {
        for x in 0..width {
            let dx = x as f64 - cx;
            let dy = y as f64 - cy;
            let radius = (dx * dx + dy * dy).sqrt();
            let mut angle = (dy.atan2(dx).rem_euclid(seg_angle) + seg_angle).rem_euclid(seg_angle);
            if angle > seg_angle / 2.0 {
                angle = seg_angle - angle;
            }
            let src_x = (cx + radius * angle.cos()).round();
            let src_y = (cy + radius * angle.sin()).round();
            lut[y * width + x] = if src_x >= 0.0 && src_x < width as f64 && src_y >= 0.0 && src_y < height as f64 {
                (src_y as i32) * width as i32 + src_x as i32
            } else {
                -1
            };
        }
    }
    lut
}

/// Mirror the frame into `segments` wedges. The source-index map depends only
/// on the segment count and frame size, so it is built once and cached.
fn apply_kaleidoscope(d: &mut [u8], segments: f64, width: usize, height: usize) {
    let segments = segments.floor() as i32;
    if segments < 2 {
        return;
    }
    KALEIDO_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let needs_rebuild = match &*cache {
            Some(c) => c.segments != segments || c.w != width || c.h != height,
            None => true,
        };
        if needs_rebuild {
            *cache = Some(KaleidoCache { lut: build_kaleido_lut(segments, width, height), segments, w: width, h: height });
        }
        let lut = &cache.as_ref().unwrap().lut;
        let copy = d.to_vec();
        for i in 0..lut.len() {
            let src = lut[i];
            if src >= 0 {
                let dst = i * 4;
                let s = src as usize * 4;
                d[dst] = copy[s];
                d[dst + 1] = copy[s + 1];
                d[dst + 2] = copy[s + 2];
            }
        }
    });
}

// ── The chain ─────────────────────────────────────────────────────────────

/// Params, in the fixed order `packParams` in worker.js writes them.
struct Params {
    kaleidoscope: f64,
    row_shift: f64,
    block_glitch: f64,
    smear: f64,
    channel_sort: f64,
    sort_vertical: f64,
    pixel_sort: f64,
    melt: f64,
}

impl Params {
    fn from_slice(p: &[f32]) -> Self {
        Params {
            kaleidoscope: p[0] as f64,
            row_shift: p[1] as f64,
            block_glitch: p[2] as f64,
            smear: p[3] as f64,
            channel_sort: p[4] as f64,
            sort_vertical: p[5] as f64,
            pixel_sort: p[6] as f64,
            melt: p[7] as f64,
        }
    }
}

/// The whole CPU pass, in the same fixed order as `applyCpuChain` in cpu.js.
///
/// `bytes` is a Uint8ClampedArray's contents, copied in and back out by
/// wasm-bindgen's glue — see the `apply_chain` binding below.
fn apply_chain_impl(d: &mut [u8], width: usize, height: usize, p: &Params, seed: u32) {
    let mut rng = Rng::new(seed);
    if p.kaleidoscope > 0.0 {
        apply_kaleidoscope(d, p.kaleidoscope, width, height);
    }
    if p.row_shift > 0.0 {
        apply_row_shift(d, p.row_shift, width, height, &mut rng);
    }
    if p.block_glitch > 0.0 {
        apply_block_glitch(d, p.block_glitch, width, height, &mut rng);
    }
    if p.smear > 0.0 {
        apply_smear(d, p.smear, width, height, &mut rng);
    }
    if p.channel_sort > 0.0 {
        apply_channel_sort(d, p.channel_sort, width, height);
    }
    if p.sort_vertical > 0.0 {
        apply_pixel_sort_vertical(d, p.sort_vertical, width, height);
    }
    if p.pixel_sort > 0.0 {
        apply_pixel_sort(d, p.pixel_sort, width, height);
    }
    if p.melt > 0.0 {
        apply_melt(d, p.melt, width, height, &mut rng);
    }
}

// ── WASM boundary ────────────────────────────────────────────────────────────

/// Entry point called from `frontend/src/effects/worker.js`.
///
/// `bytes` is a Uint8ClampedArray (RGBA, length `width * height * 4`). `params`
/// is a Float32Array of 8 values in CPU_KEYS order: kaleidoscope, rowShift,
/// blockGlitch, smear, channelSort, sortVertical, pixelSort, melt.
///
/// `Clamped<Vec<u8>>` in and out: wasm-bindgen copies the JS array into wasm
/// memory, we mutate the copy, and the return value becomes a fresh
/// Uint8ClampedArray on the JS side. The buffer identity changes, which is why
/// the worker reassigns `bytes` to the return value rather than assuming the
/// original buffer was mutated in place.
#[wasm_bindgen]
pub fn apply_chain(
    bytes: Clamped<Vec<u8>>,
    width: u32,
    height: u32,
    seed: u32,
    params: Vec<f32>,
) -> Result<Clamped<Vec<u8>>, JsValue> {
    let width = width as usize;
    let height = height as usize;
    let mut data = bytes.0;

    if params.len() != 8 {
        return Err(JsValue::from_str("apply_chain: expected 8 params"));
    }
    if data.len() != width * height * 4 {
        return Err(JsValue::from_str("apply_chain: buffer length does not match width*height*4"));
    }

    let p = Params::from_slice(&params);
    apply_chain_impl(&mut data, width, height, &p, seed);

    Ok(Clamped(data))
}
