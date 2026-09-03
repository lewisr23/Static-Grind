import { applyCpuChain } from './cpu.js'

/**
 * Main-thread handle on the CPU effect worker.
 *
 * Policy is one job in flight, newest wins. If a frame arrives while the worker
 * is busy the caller is told so and simply tries again on the next tick — for
 * video that drops stale frames instead of queueing a backlog you would see as
 * lag, and for a still it just means the redraw lands a frame later.
 *
 * Falls back to running on the main thread if workers are unavailable, so the
 * tool degrades in quality of experience rather than breaking.
 */
export class CpuPass {
  constructor(onResult) {
    this.onResult = onResult
    this.busy = false
    this.lastMs = 0
    this.backend = 'js'
    this._seq = 0
    this._worker = null

    try {
      this._worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
      this._worker.onmessage = e => {
        const { buffer, width, height, ms, backend } = e.data
        this.busy = false
        this.lastMs = ms
        this.backend = backend
        this.onResult(new Uint8ClampedArray(buffer), width, height)
      }
      this._worker.onerror = err => {
        console.warn('CPU worker failed, falling back to the main thread:', err.message)
        this._worker.terminate()
        this._worker = null
        this.busy = false
      }
    } catch {
      this._worker = null // no module-worker support
    }
  }

  /**
   * Hand a frame to the worker. Returns false if a job is already in flight, in
   * which case the caller should keep its dirty flag set and retry.
   */
  submit(bytes, width, height, params, seed) {
    if (!this._worker) {
      // synchronous fallback
      const t0 = performance.now()
      applyCpuChain(bytes, width, height, params, seed)
      this.lastMs = performance.now() - t0
      this.backend = 'js-main'
      this.onResult(bytes, width, height)
      return true
    }
    if (this.busy) return false
    this.busy = true
    const buffer = bytes.buffer
    this._worker.postMessage(
      { id: ++this._seq, buffer, width, height, params, seed },
      [buffer] // transferred, not copied
    )
    return true
  }

  destroy() {
    this._worker?.terminate()
    this._worker = null
  }
}
