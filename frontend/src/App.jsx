import { useState, useEffect } from 'react'
import UploadForm from './components/UploadForm'
import GlitchCanvas from './components/GlitchCanvas'
import NoiseBackground from './components/NoiseBackground'
import AuthPanel from './auth/AuthPanel'
import { useAuth } from './auth/AuthProvider'
import { useLocalPresetCount } from './presets/usePresetBank'
import { EASTER_EGG_EVENT } from './easterEgg'

/**
 * Where the clock used to be: how many looks are saved in this browser.
 * A live readout the same as the clock was, but one that is actually about
 * this tool. Hidden once signed in, because the bank lives on the server then.
 */
function PresetReadout() {
  const { status } = useAuth()
  const count = useLocalPresetCount()
  if (status === 'authed' || status === 'loading') return null
  const label = count === 0 ? 'NO PRESETS' : count === 1 ? '1 PRESET' : `${count} PRESETS`
  return <span className="preset-readout">{label} SAVED ON THIS DEVICE</span>
}

function Typewriter({ text }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (count >= text.length) return
    const id = setTimeout(() => setCount(c => c + 1), 110)
    return () => clearTimeout(id)
  }, [count, text])
  return <span>{text.slice(0, count)}</span>
}

// Two ways in, since a phone has no keyboard to type "pen15" into: typing it
// anywhere outside a text field, or slamming the Pixel Sort knob from 0 to 100
// and back three times inside five seconds (wired up in GlitchCanvas).

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

/**
 * Account state, top right. Sign-in is optional everywhere in this app, so this
 * is a quiet strip rather than a call to action — and it says "offline" instead
 * of an error when the API is unreachable, because nothing is actually broken
 * when that happens.
 */
function AccountRail({ onOpenAuth }) {
  const { user, status, signOut, refresh } = useAuth()

  if (status === 'loading') return <div className="account-rail" aria-hidden="true" />

  return (
    <div className="account-rail">
      {status === 'authed' && (
        <>
          <span className="account-name" title={user.email}>{user.displayName}</span>
          <button className="account-btn" onClick={signOut}>Sign out</button>
        </>
      )}
      {status === 'anon' && (
        <button className="account-btn" onClick={onOpenAuth}>Sign in</button>
      )}
      {status === 'offline' && (
        <button
          className="account-btn account-offline"
          onClick={refresh}
          title="Saved presets are stored on this device until the server is back. Click to retry."
        >
          Presets offline
        </button>
      )}
    </div>
  )
}

export default function App() {
  const [source, setSource] = useState(null) // { url, type: 'image' | 'video' }
  const [authOpen, setAuthOpen] = useState(false)

  // The wordmark doubles as the way home once media is loaded — same thing
  // Eject does, in the place every other site puts its logo.
  const logoContent = (
    <>
      <img src="/logo_mark.png" alt="" className="logo-mark" />
      <span className="glitch-text" data-text="STATICGRIND">
        STATIC<span>GRIND</span>
      </span>
      {!source && <img src="/logo_mark.png" alt="" className="logo-mark" />}
    </>
  )

  return (
    <>
      <EasterEgg />
      {authOpen && <AuthPanel onClose={() => setAuthOpen(false)} />}
      {!source && (
        <>
          <NoiseBackground />
          <div className="crt-overlay" aria-hidden="true" />
          <a className="hud hud-tl hud-link" href="/privacy.html">
            PRIVACY
          </a>
          <div className="hud hud-tr" aria-hidden="true">
            <PresetReadout />
          </div>
          <div className="hud hud-bl" aria-hidden="true">
            SRC 01 · NO SIGNAL
          </div>
          <div className="hud hud-br" aria-hidden="true">
            AWAITING INPUT
          </div>
        </>
      )}

      <div className={source ? 'app workspace' : 'app landing'}>
        {!source && <AccountRail onOpenAuth={() => setAuthOpen(true)} />}
        <header className="app-header">
          <h1 className="logo">
            {source ? (
              <button
                type="button"
                className="logo-home"
                onClick={() => setSource(null)}
                title="Back to the start"
                aria-label="StaticGrind — back to the start"
              >
                {logoContent}
              </button>
            ) : logoContent}
          </h1>
          <p className="tagline">
            {source ? 'digital lathe' : <Typewriter text="digital lathe" />}
          </p>
          {/* Once media is loaded the header collapses to a single strip so the
              display and both control rails fit on one screen; the readout and
              account controls ride along on its right. */}
          {source && (
            <div className="header-right">
              <PresetReadout />
              <AccountRail onOpenAuth={() => setAuthOpen(true)} />
            </div>
          )}
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
