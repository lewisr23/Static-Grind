import { useState, useEffect, useRef } from 'react'
import UploadForm from './components/UploadForm'
import GlitchCanvas from './components/GlitchCanvas'
import NoiseBackground from './components/NoiseBackground'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const pad = n => String(n).padStart(2, '0')
  return (
    <span>
      {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
    </span>
  )
}

function Typewriter({ text }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (count >= text.length) return
    const id = setTimeout(() => setCount(c => c + 1), 110)
    return () => clearTimeout(id)
  }, [count, text])
  return (
    <span>
      {text.slice(0, count)}
      <span className="blink">_</span>
    </span>
  )
}

// Two ways in, since a phone has no keyboard to type "pen15" into: typing it
// anywhere outside a text field, or five quick taps on the logo. Neither is
// surfaced in the UI — it's only for people who already know to try it.
const EASTER_EGG_EVENT = 'staticgrind-easter-egg'

function EasterEgg() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let buffer = ''
    let hideTimer
    function reveal() {
      setShow(true)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setShow(false), 2600)
    }
    function onKeyDown(e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      buffer = (buffer + e.key).slice(-5).toLowerCase()
      if (buffer === 'pen15') reveal()
    }
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener(EASTER_EGG_EVENT, reveal)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(EASTER_EGG_EVENT, reveal)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!show) return null
  return (
    <div className="egg-overlay" aria-hidden="true">
      <div className="egg-box">
        <span className="screw s-tl" /><span className="screw s-tr" />
        <span className="screw s-bl" /><span className="screw s-br" />
        <span className="egg-line">PEN15 CLUB</span>
        <span className="egg-sub">MEMBERSHIP VERIFIED</span>
      </div>
    </div>
  )
}

// Five taps within 1.5s on whatever this is attached to fires the egg —
// works for a mouse click same as a touch tap, no separate mobile path needed.
function useTapTrigger(count = 5, windowMs = 1500) {
  const taps = useRef([])
  return () => {
    const now = Date.now()
    taps.current = [...taps.current, now].filter(t => now - t < windowMs)
    if (taps.current.length >= count) {
      taps.current = []
      window.dispatchEvent(new Event(EASTER_EGG_EVENT))
    }
  }
}

export default function App() {
  const [source, setSource] = useState(null) // { url, type: 'image' | 'video' }
  const onLogoTap = useTapTrigger()

  return (
    <>
      <EasterEgg />
      {!source && (
        <>
          <NoiseBackground />
          <div className="crt-overlay" aria-hidden="true" />
          <div className="hud hud-tr" aria-hidden="true">
            <Clock />
          </div>
          <div className="hud hud-bl" aria-hidden="true">
            SRC 01 · NO SIGNAL
          </div>
          <div className="hud hud-br" aria-hidden="true">
            AWAITING INPUT
          </div>
        </>
      )}

      <div className={source ? 'app' : 'app landing'}>
        <header className="app-header">
          <h1 className="logo" onClick={onLogoTap}>
            <img src="/logo_mark.png" alt="" className="logo-mark" />
            <span className="glitch-text" data-text="STATICGRIND">
              STATIC<span>GRIND</span>
            </span>
            <img src="/logo_mark.png" alt="" className="logo-mark" />
          </h1>
          <p className="tagline">
            {source ? 'digital lathe' : <Typewriter text="digital lathe" />}
          </p>
        </header>

        <main className="app-main">
          {!source ? (
            <UploadForm onReady={setSource} />
          ) : (
            <GlitchCanvas
              sourceUrl={source.url}
              sourceType={source.type}
              onReset={() => setSource(null)}
            />
          )}
        </main>
      </div>
    </>
  )
}
