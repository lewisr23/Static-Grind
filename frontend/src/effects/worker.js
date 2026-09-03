// Runs the CPU destructive pass off the main thread.
//
// The pixel sorts are O(n log n) over every bright run in the frame, which on a
// 2048px still is tens of milliseconds — long enough to visibly stall the UI and
// drop video frames. The main thread ships the frame's bytes here as a
// transferable, so neither side ever copies the buffer.
//
// When the WASM backend is present it does the work; otherwise this falls back
// to the JS implementation. Both come from the same module, so there is only
// ever one definition of the effect chain.
import { applyCpuChain } from './cpu.js'

let wasm = null

// Optional backend, absent until the Rust crate is built.
//
// import.meta.glob rather than a bare dynamic import: Vite resolves dynamic
// imports statically even inside a try/catch, so a plain import of a file that
// may not exist yet fails the build. A glob with no matches is simply empty.
async function loadWasm() {
  const found = import.meta.glob('../../wasm/pkg/staticgrind_effects.js')
  const load = Object.values(found)[0]
  if (!load) return null // no WASM build present — the JS path is the fallback
  try {
    const mod = await load()
    await mod.default()
    return mod
  } catch (err) {
    console.warn('WASM backend present but failed to initialise:', err)
    return null
  }
}

const ready = loadWasm().then(m => { wasm = m })

self.onmessage = async (e) => {
  const { id, buffer, width, height, params, seed } = e.data
  await ready

  let bytes = new Uint8ClampedArray(buffer)
  let backend = 'js'
  const t0 = performance.now()

  if (wasm) {
    try {
      // apply_chain's Clamped<Vec<u8>> in/out means wasm-bindgen copies the
      // buffer into wasm memory and hands back a *new* Uint8ClampedArray — it
      // cannot mutate JS-owned memory in place. Reassign rather than assume
      // the original bytes changed.
      bytes = wasm.apply_chain(bytes, width, height, seed, packParams(params))
      backend = 'wasm'
    } catch (err) {
      // A WASM failure must never take the tool down — fall back and say so.
      // The original bytes are untouched here: a thrown Err means the copy-in
      // succeeded but the Rust side rejected the input before mutating anything.
      console.warn('WASM pass failed, falling back to JS:', err)
      applyCpuChain(bytes, width, height, params, seed)
    }
  } else {
    applyCpuChain(bytes, width, height, params, seed)
  }

  const ms = performance.now() - t0
  // hand the buffer back rather than copying it
  self.postMessage({ id, buffer: bytes.buffer, width, height, ms, backend }, [bytes.buffer])
}

// Flat Float32Array keeps the JS/WASM boundary cheap and the ordering explicit
function packParams(p) {
  return new Float32Array([
    p.kaleidoscope, p.rowShift, p.blockGlitch, p.smear,
    p.channelSort, p.sortVertical, p.pixelSort, p.melt,
  ])
}
