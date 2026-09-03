/**
 * Response-curve probe for the CPU effects.
 *
 * Renders a synthetic frame, runs each effect across its full knob travel, and
 * reports how far the output moved from the untouched frame. A healthy knob
 * climbs steadily from its first few percent. A knob that reads 0.0 until 0.9
 * and then slams to 40 is the "nothing happens until 95%" bug this exists to
 * catch coming back.
 *
 * Two frames are used because the original bug was invisible on a bright test
 * image and catastrophic on a dark one.
 *
 *   npm run curve-check
 */
import {
  applyPixelSort, applyPixelSortVertical, applyChannelSort, applyBlockGlitch,
  applySmear, applyMelt, applyRowShift, makeRng,
} from '../src/effects/cpu.js'

const W = 400, H = 300
const STEPS = [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
const SEED = 0xC0FFEE

function makeFrame(bias) {
  const d = new Uint8ClampedArray(W * H * 4)
  const rnd = makeRng(12345)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const base = (x / W) * 160 + Math.sin(y * 0.07) * 40 + rnd() * 50
      d[i] = base * bias
      d[i + 1] = (base * 0.7 + (y / H) * 90) * bias
      d[i + 2] = (200 - base * 0.6) * bias
      d[i + 3] = 255
    }
  }
  return d
}

// Mean absolute per-channel difference, 0–255
function diff(a, b) {
  let sum = 0
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
  }
  return sum / (a.length / 4 * 3)
}

// Share of the travel producing under 10% of the effect's own full-scale output
function deadZone(curve) {
  const full = curve[curve.length - 1]
  if (full <= 0.01) return 1
  return curve.filter(v => v < full * 0.1).length / curve.length
}

const EFFECTS = {
  'Pixel Sort': applyPixelSort,
  'Sort Vertical': applyPixelSortVertical,
  'Channel Sort': applyChannelSort,
  'Row Shift': applyRowShift,
  'Block Glitch': applyBlockGlitch,
  'Smear': applySmear,
  'Melt': applyMelt,
}

let worst = 0
for (const [name, bias] of [['normal', 1], ['dark', 0.35]]) {
  const src = makeFrame(bias)
  console.log(`\n── ${name} frame ${'─'.repeat(56)}`)
  console.log('effect'.padEnd(15) + STEPS.map(s => String(s).padStart(6)).join('') + '    dead')
  for (const [label, fn] of Object.entries(EFFECTS)) {
    const curve = STEPS.map(v => {
      let total = 0
      const runs = 3
      for (let r = 0; r < runs; r++) {
        const work = new Uint8ClampedArray(src)
        fn(work, v, W, H, makeRng(SEED + r))
        total += diff(src, work)
      }
      return total / runs
    })
    const dz = deadZone(curve)
    worst = Math.max(worst, dz)
    console.log(
      label.padEnd(15) + curve.map(v => v.toFixed(1).padStart(6)).join('') +
      '   ' + (dz * 100).toFixed(0).padStart(3) + '%'
    )
  }
}
console.log('\nmean absolute channel difference from the untouched frame (0-255).')
console.log(`worst dead zone: ${(worst * 100).toFixed(0)}% of travel`)

// Determinism is what makes a still hold still under a knob move, so assert it
const src = makeFrame(1)
const a = new Uint8ClampedArray(src), b = new Uint8ClampedArray(src)
applyBlockGlitch(a, 0.5, W, H, makeRng(SEED))
applyBlockGlitch(b, 0.5, W, H, makeRng(SEED))
const identical = a.every((v, i) => v === b[i])
console.log(`same seed reproduces the same frame: ${identical ? 'yes' : 'NO — determinism broken'}`)
if (!identical) process.exitCode = 1
