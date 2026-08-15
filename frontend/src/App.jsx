import { useState, useEffect } from 'react'
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

export default function App() {
  const [source, setSource] = useState(null) // { url, type: 'image' | 'video' }

  return (
    <>
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
          <h1 className="logo">
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
