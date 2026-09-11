/**
 * The PEN15 egg. It has no UI of its own and never will — the only ways in are
 * typing "pen15" anywhere outside a text field (App.jsx) and the knob gesture
 * below, which is the one a phone can actually perform.
 */
export const EASTER_EGG_EVENT = 'staticgrind-easter-egg'

export function fireEasterEgg() {
  window.dispatchEvent(new Event(EASTER_EGG_EVENT))
}

const WINDOW_MS = 5000
const TRIPS = 3

/**
 * Watches a single knob for someone slamming it stop to stop. Feed it every
 * value the knob takes; three trips to each end inside five seconds fires.
 *
 * Only the ends count, and only when the knob was last parked at the other
 * one — so resting at a stop, or wobbling around the middle, records nothing,
 * and no amount of ordinary dialling can trip this by accident.
 */
export function createStopToStopWatcher(min, max, onFire, windowMs = WINDOW_MS) {
  let hits = []   // { t, end: 'lo' | 'hi' }, alternating
  let last = null

  return function note(value) {
    const end = value >= max ? 'hi' : value <= min ? 'lo' : null
    if (!end || end === last) return
    last = end
    const now = Date.now()
    hits = [...hits, { t: now, end }].filter(h => now - h.t < windowMs)
    if (hits.filter(h => h.end === 'hi').length >= TRIPS
      && hits.filter(h => h.end === 'lo').length >= TRIPS) {
      hits = []
      last = null
      onFire()
    }
  }
}
