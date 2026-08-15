import { useState } from 'react'
import UploadForm from './components/UploadForm'
import GlitchCanvas from './components/GlitchCanvas'

export default function App() {
  const [source, setSource] = useState(null) // { url, type: 'image' | 'video' }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="logo">
          <img src="/logo_mark.png" alt="" className="logo-mark" />
          STATIC<span>GRIND</span>
          <img src="/logo_mark.png" alt="" className="logo-mark" />
        </h1>
        <p className="tagline">digital lathe</p>
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
  )
}
