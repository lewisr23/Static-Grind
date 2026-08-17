import { useEffect, useRef, useState } from 'react'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { WebGLRenderer } from '../webgl/renderer'

const DEFAULT_PARAMS = {
  colorGrade: 'none',
  hueShift: 0,
  saturation: 0,
  vignette: 0,
  noise: 0,
  chromaShift: 0,
  pixelSort: 0,
  sortVertical: 0,
  channelSort: 0,
  rowShift: 0,
  blockGlitch: 0,
  smear: 0,
  interlace: 0,
  waveWarp: 0,
  bitCrush: 0,
  displace: 0,
  melt: 0,
  kaleidoscope: 0,
  feedback: 0,
  scanlineIntensity: 0,
}

const PRESETS = {
  vhsDecay: {
    colorGrade: 'vhs', chromaShift: 12, noise: 0.08, interlace: 6,
    scanlineIntensity: 0.35, waveWarp: 4, hueShift: 10,
  },
  meltdown: {
    melt: 0.72, smear: 0.55, blockGlitch: 6, noise: 0.06,
    colorGrade: 'none', hueShift: 0, waveWarp: 8,
  },
  glitchcore: {
    blockGlitch: 16, pixelSort: 0.65, chromaShift: 32, noise: 0.22,
    smear: 0.35, interlace: 14, bitCrush: 0.3, colorGrade: 'neon',
  },
  cathedral: {
    feedback: 0.38, colorGrade: 'neon', hueShift: 130,
    noise: 0.04, chromaShift: 6, waveWarp: 10,
  },
  datamosh: {
    smear: 0.8, interlace: 10, colorGrade: 'vhs', chromaShift: 14,
    noise: 0.07, blockGlitch: 5, displace: 18,
  },
  neonRot: {
    colorGrade: 'neon', chromaShift: 22, waveWarp: 16, hueShift: 48,
    noise: 0.1, feedback: 0.12, pixelSort: 0.3,
  },
  voidDrift: {
    feedback: 0.62, displace: 45, bitCrush: 0.42, hueShift: 185,
    colorGrade: 'grayscale', noise: 0.05, waveWarp: 6,
  },
  infrableed: {
    colorGrade: 'infrared', chromaShift: 18, hueShift: 0, noise: 0.12,
    displace: 28, pixelSort: 0.25, interlace: 4,
  },
  staticField: {
    noise: 0.45, scanlineIntensity: 0.55, interlace: 18,
    colorGrade: 'grayscale', chromaShift: 4, waveWarp: 2,
  },
  prismBreak: {
    bitCrush: 0.55, chromaShift: 28, hueShift: 220, displace: 20,
    colorGrade: 'neon', noise: 0.08, pixelSort: 0.45,
  },
}

const PRESET_LABELS = {
  vhsDecay: 'Vessel', meltdown: 'Tallow', glitchcore: 'Calcium', cathedral: 'Kelp',
  datamosh: 'Silt', neonRot: 'Nerve', voidDrift: 'Marrow', infrableed: 'Amber',
  staticField: 'Mold', prismBreak: 'Seam',
}

const GRADES = [
  { value: 'none', label: 'None' },
  { value: 'vhs', label: 'VHS' },
  { value: 'neon', label: 'Neon' },
  { value: 'infrared', label: 'Infrared' },
  { value: 'grayscale', label: 'Grayscale' },
]

// Each mod's category drives its accent color in the deck:
// tone = hue/color · warp = continuous GPU distortion · corrupt = destructive CPU glitch
const MOD_CONFIG = [
  { key: 'hueShift',          label: 'Hue Shift',      min: 0, max: 360, step: 1,    display: v => `${Math.round(v)}°`,        cat: 'tone' },
  { key: 'saturation',        label: 'Saturation',     min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'tone' },
  { key: 'vignette',          label: 'Vignette',       min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'tone' },
  { key: 'noise',              label: 'Noise',           min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'warp' },
  { key: 'chromaShift',        label: 'Chroma Shift',   min: 0, max: 50,  step: 1,    display: v => v === 0 ? 'Off' : `${v}px`, cat: 'warp' },
  { key: 'interlace',          label: 'Interlace',      min: 0, max: 30,  step: 1,    display: v => v === 0 ? 'Off' : `${v}px`, cat: 'warp' },
  { key: 'waveWarp',           label: 'Wave Warp',      min: 0, max: 40,  step: 1,    display: v => v === 0 ? 'Off' : `${v}px`, cat: 'warp' },
  { key: 'bitCrush',           label: 'Bit Crush',      min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'warp' },
  { key: 'displace',           label: 'Displace',       min: 0, max: 100, step: 1,    display: v => v === 0 ? 'Off' : `${v}px`, cat: 'warp' },
  { key: 'feedback',           label: 'Feedback',       min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'warp' },
  { key: 'scanlineIntensity',  label: 'Scanlines',      min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'warp' },
  { key: 'pixelSort',          label: 'Pixel Sort',     min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'corrupt' },
  { key: 'sortVertical',       label: 'Sort Vertical',  min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'corrupt' },
  { key: 'channelSort',        label: 'Channel Sort',   min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'corrupt' },
  { key: 'rowShift',           label: 'Row Shift',      min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'corrupt' },
  { key: 'blockGlitch',        label: 'Block Glitch',   min: 0, max: 20,  step: 1,    display: v => v === 0 ? 'Off' : `${v}`,   cat: 'corrupt' },
  { key: 'smear',               label: 'Smear',          min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'corrupt' },
  { key: 'melt',                label: 'Melt',           min: 0, max: 1,   step: 0.01, display: pct,                              cat: 'corrupt' },
  { key: 'kaleidoscope',       label: 'Kaleidoscope',   min: 0, max: 8,   step: 1,    display: v => v === 0 ? 'Off' : `${v}`,   cat: 'corrupt' },
]

export default function GlitchCanvas({ sourceUrl, sourceType, onReset }) {
  // Two canvases: WebGL renders offscreen, 2D canvas is visible + handles CPU effects
  const canvasRef   = useRef()   // visible 2D canvas (exported, displayed)
  const glCanvasRef = useRef()   // hidden WebGL canvas
  const rendererRef  = useRef()
  const videoRef     = useRef()
  const rafRef       = useRef()
  const paramsRef    = useRef(DEFAULT_PARAMS)
  const startTimeRef   = useRef(performance.now())
  const kaleidoLUTRef  = useRef({ lut: null, segments: -1, w: -1, h: -1 })
  const lastCpuKeyRef  = useRef('')
  const webcamStreamRef  = useRef(null)
  const canvasWrapperRef = useRef()
  const recorderRef    = useRef()
  const mp4EncoderRef = useRef()
  const mp4MuxerRef   = useRef()
  const mp4TargetRef  = useRef()
  const mp4ActiveRef  = useRef(false)
  const mp4FrameRef   = useRef(0)

  const [params, setParams]               = useState(DEFAULT_PARAMS)
  const [selectedPreset, setSelectedPreset] = useState('')
  const [playing, setPlaying]             = useState(true)
  const [recording, setRecording]         = useState(false)
  const [exportFormat, setExportFormat]   = useState('webm')
  const [showFormatPicker, setShowFormatPicker] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => { paramsRef.current = params }, [params])

  // Init WebGL renderer on the hidden canvas
  useEffect(() => {
    const glCanvas = glCanvasRef.current
    if (!glCanvas) return
    try {
      rendererRef.current = new WebGLRenderer(glCanvas)
    } catch (e) {
      console.error('WebGL init failed:', e)
    }
    return () => { rendererRef.current?.destroy(); rendererRef.current = null }
  }, [])

  // Load source → size both canvases → start RAF loop
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
    lastCpuKeyRef.current = ''

    const time = () => (performance.now() - startTimeRef.current) / 1000

    function setSizes(w, h) {
      canvasRef.current.width = w
      canvasRef.current.height = h
      rendererRef.current?.setSize(w, h)
    }

    // Composite: WebGL output → 2D canvas → CPU destructive effects
    function composite(source, p, w, h) {
      const renderer = rendererRef.current
      const canvas = canvasRef.current
      if (!renderer || !canvas) return

      // GPU pass
      if (source) renderer.uploadSource(source)
      renderer.render(p, time())

      // Copy WebGL result to visible 2D canvas
      const ctx = canvas.getContext('2d')
      ctx.drawImage(glCanvasRef.current, 0, 0)

      // CPU pass — destructive effects
      if (p.pixelSort > 0 || p.sortVertical > 0 || p.channelSort > 0 || p.rowShift > 0 ||
          p.blockGlitch > 0 || p.smear > 0 || p.melt > 0 || p.kaleidoscope > 0) {
        const imageData = ctx.getImageData(0, 0, w, h)
        if (p.kaleidoscope > 0) applyKaleidoscope(imageData, p.kaleidoscope, w, h, kaleidoLUTRef)
        if (p.rowShift > 0)     applyRowShift(imageData, p.rowShift, w, h)
        if (p.blockGlitch > 0)  applyBlockGlitch(imageData, p.blockGlitch, w, h)
        if (p.smear > 0)        applySmear(imageData, p.smear, w, h)
        if (p.channelSort > 0)  applyChannelSort(imageData, p.channelSort, w, h)
        if (p.sortVertical > 0) applyPixelSortVertical(imageData, p.sortVertical, w, h)
        if (p.pixelSort > 0)    applyPixelSort(imageData, p.pixelSort, w, h)
        if (p.melt > 0)         applyMelt(imageData, p.melt, w, h)
        ctx.putImageData(imageData, 0, 0)
      }
    }

    if (sourceType === 'webcam') {
      const video = document.createElement('video')
      video.muted = true; video.playsInline = true
      videoRef.current = video

      navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(stream => {
        webcamStreamRef.current = stream
        video.srcObject = stream

        video.addEventListener('loadedmetadata', () => {
          const MAX_W = 1280
          let w = video.videoWidth, h = video.videoHeight
          if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }
          setSizes(w, h)
          video.play(); setPlaying(true)
          startTimeRef.current = performance.now()
          const tick = () => {
            if (video.readyState >= 2) composite(video, paramsRef.current, w, h)
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        })
      }).catch(err => {
        console.error('Camera error:', err)
      })
    } else if (sourceType === 'video') {
      const video = document.createElement('video')
      video.src = sourceUrl; video.loop = true; video.muted = true; video.playsInline = true
      videoRef.current = video

      video.addEventListener('loadedmetadata', () => {
        const MAX_W = 1280
        let w = video.videoWidth, h = video.videoHeight
        if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }
        setSizes(w, h)
      })

      video.addEventListener('loadeddata', () => {
        video.play(); setPlaying(true)
        startTimeRef.current = performance.now()
        const w = canvasRef.current.width, h = canvasRef.current.height
        const tick = () => {
          if (video.readyState >= 2) composite(video, paramsRef.current, w, h)
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      })

      video.load()
    } else {
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight
        setSizes(w, h)
        rendererRef.current?.uploadSource(img)
        startTimeRef.current = performance.now()
        const tick = () => {
          const p = paramsRef.current
          const renderer = rendererRef.current
          const canvas = canvasRef.current
          if (!renderer || !canvas) { rafRef.current = requestAnimationFrame(tick); return }

          renderer.render(p, time())

          const hasCpu = p.pixelSort > 0 || p.sortVertical > 0 || p.channelSort > 0 || p.rowShift > 0 ||
                         p.blockGlitch > 0 || p.smear > 0 || p.melt > 0 || p.kaleidoscope > 0
          const cpuKey = `${p.pixelSort},${p.sortVertical},${p.channelSort},${p.rowShift},${p.blockGlitch},${p.smear},${p.melt},${p.kaleidoscope}`
          const cpuChanged = cpuKey !== lastCpuKeyRef.current

          if (!hasCpu || cpuChanged) {
            // Draw fresh WebGL output to visible canvas
            const ctx = canvas.getContext('2d')
            ctx.drawImage(glCanvasRef.current, 0, 0)

            if (hasCpu) {
              // Apply CPU effects on top
              lastCpuKeyRef.current = cpuKey
              const imageData = ctx.getImageData(0, 0, w, h)
              if (p.kaleidoscope > 0) applyKaleidoscope(imageData, p.kaleidoscope, w, h, kaleidoLUTRef)
              if (p.rowShift > 0)     applyRowShift(imageData, p.rowShift, w, h)
              if (p.blockGlitch > 0)  applyBlockGlitch(imageData, p.blockGlitch, w, h)
              if (p.smear > 0)        applySmear(imageData, p.smear, w, h)
              if (p.channelSort > 0)  applyChannelSort(imageData, p.channelSort, w, h)
              if (p.sortVertical > 0) applyPixelSortVertical(imageData, p.sortVertical, w, h)
              if (p.pixelSort > 0)    applyPixelSort(imageData, p.pixelSort, w, h)
              if (p.melt > 0)         applyMelt(imageData, p.melt, w, h)
              ctx.putImageData(imageData, 0, 0)
            }
            // If hasCpu && !cpuChanged: skip entirely — canvas retains last CPU result
          }

          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      img.src = sourceUrl
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(t => t.stop())
        webcamStreamRef.current = null
      }
    }
  }, [sourceUrl, sourceType])

  function set(key, value) { setParams(p => ({ ...p, [key]: value })) }

  function handleRandomize() {
    const rnd = (min, max, int = false) => {
      const v = min + Math.random() * (max - min)
      return int ? Math.round(v) : Math.round(v * 100) / 100
    }
    const maybe = (prob, min, max, int = false) => Math.random() < prob ? rnd(min, max, int) : 0
    const grades = ['none', 'vhs', 'neon', 'grayscale', 'infrared']
    setSelectedPreset('')
    setParams({
      colorGrade:       grades[Math.floor(Math.random() * grades.length)],
      hueShift:         maybe(0.6, 0, 340, true),
      saturation:       maybe(0.5, 0.1, 0.6),
      vignette:         maybe(0.4, 0.1, 0.5),
      noise:            maybe(0.5, 0.02, 0.4),
      chromaShift:      maybe(0.5, 2, 40, true),
      pixelSort:        maybe(0.5, 0.1, 0.9),
      sortVertical:     maybe(0.4, 0.1, 0.9),
      channelSort:      maybe(0.4, 0.1, 0.85),
      rowShift:         maybe(0.4, 0.05, 0.7),
      blockGlitch:      maybe(0.4, 1, 16, true),
      smear:            maybe(0.4, 0.1, 0.8),
      interlace:        maybe(0.5, 2, 24, true),
      waveWarp:         maybe(0.5, 2, 30, true),
      bitCrush:         maybe(0.35, 0.1, 0.7),
      displace:         maybe(0.4, 5, 60, true),
      melt:             maybe(0.35, 0.1, 0.8),
      kaleidoscope:     maybe(0.25, 1, 8, true),
      feedback:         maybe(0.35, 0.05, 0.5),
      scanlineIntensity: maybe(0.4, 0.1, 0.7),
    })
  }

  function handleDownload() {
    const link = document.createElement('a')
    link.download = 'staticgrind-output.png'
    link.href = canvasRef.current.toDataURL()
    link.click()
  }

  // Grabs whatever's currently on the visible canvas (post-WebGL, post-CPU
  // glitch pass) as a still PNG — works for webcam and video sources, where
  // the transport only otherwise offers video recording.
  function handleSnapshot() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `staticgrind-snapshot-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  function handleRecordStartWith(fmt) {
    if (fmt === 'mp4') { startMp4(); return }
    startWebm()
  }

  function startWebm() {
    const canvas = canvasRef.current
    if (!canvas) return
    const stream = canvas.captureStream(30)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.download = 'staticgrind-output.webm'; a.href = url; a.click()
      URL.revokeObjectURL(url)
    }
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
  }

  function handleRecordStop() {
    if (exportFormat === 'mp4') { stopMp4(); return }
    recorderRef.current?.stop()
    setRecording(false)
  }

  function startMp4() {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!('VideoEncoder' in window)) { alert('MP4 export requires Chrome or Edge 94+'); return }
    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: canvas.width, height: canvas.height },
      fastStart: 'in-memory',
    })
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => console.error('MP4 encoder:', e),
    })
    encoder.configure({
      codec: 'avc1.42001f', width: canvas.width, height: canvas.height,
      bitrate: 8_000_000, framerate: 30,
    })
    mp4EncoderRef.current = encoder
    mp4MuxerRef.current = muxer
    mp4TargetRef.current = target
    mp4FrameRef.current = 0
    mp4ActiveRef.current = true
    setRecording(true)
    const fps = 30
    const loop = () => {
      if (!mp4ActiveRef.current) return
      const ts = Math.round((mp4FrameRef.current / fps) * 1_000_000)
      try {
        const frame = new VideoFrame(canvas, { timestamp: ts })
        encoder.encode(frame, { keyFrame: mp4FrameRef.current % 60 === 0 })
        frame.close()
        mp4FrameRef.current++
      } catch (_) {}
      setTimeout(loop, 1000 / fps)
    }
    loop()
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '1') setParams(p => ({ ...p, pixelSort: Math.max(0, parseFloat((p.pixelSort - 0.05).toFixed(2))) }))
      if (e.key === '2') setParams(p => ({ ...p, pixelSort: Math.min(1, parseFloat((p.pixelSort + 0.05).toFixed(2))) }))
      if (e.key === '3') handleRandomize()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // CSS handles sizing in both modes via .canvas-wrapper canvas and :fullscreen canvas
    canvas.style.width = ''
    canvas.style.height = ''
  }, [isFullscreen])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      canvasWrapperRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  async function stopMp4() {
    mp4ActiveRef.current = false; setRecording(false)
    await mp4EncoderRef.current.flush()
    mp4MuxerRef.current.finalize()
    const { buffer } = mp4TargetRef.current
    const blob = new Blob([buffer], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = 'staticgrind-output.mp4'; a.href = url; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="glitch-workspace">
      {/* Hidden WebGL canvas */}
      <canvas ref={glCanvasRef} style={{ display: 'none' }} />

      {/* ── SG-01 Console: display + transport + mod sections in one unit ── */}
      <div className="mod-console">
        <span className="screw s-tl" aria-hidden="true" />
        <span className="screw s-tr" aria-hidden="true" />
        <span className="screw s-bl" aria-hidden="true" />
        <span className="screw s-br" aria-hidden="true" />

        <div className="console-header">
          <span className="console-title">SG-01 · MOD CONSOLE</span>
          <div className="chip-row">
            <button
              className={`chip${selectedPreset === '' ? ' active' : ''}`}
              onClick={() => { setSelectedPreset(''); setParams(DEFAULT_PARAMS) }}
            >
              None
            </button>
            {Object.keys(PRESETS).map(key => (
              <button
                key={key}
                className={`chip${selectedPreset === key ? ' active' : ''}`}
                onClick={() => { setSelectedPreset(key); setParams({ ...DEFAULT_PARAMS, ...PRESETS[key] }) }}
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          <div className="console-actions">
            <button className="console-btn" onClick={handleRandomize}>✦ Random</button>
            <button className="console-btn" onClick={() => { setParams(DEFAULT_PARAMS); setSelectedPreset('') }}>⟲ Clear</button>
            <button className="console-btn" onClick={onReset} title="Load different media">⏏ Eject</button>
          </div>
        </div>

        <div className="console-display">
          <div className="canvas-wrapper" ref={canvasWrapperRef}>
          <canvas ref={canvasRef} className="result-img" />
          <button className="fullscreen-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M5 1v4H1M8 1h4v4M8 12h4V8M5 12H1V8"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 5V1h4M8 1h4v4M12 8v4H8M5 12H1V8"/>
              </svg>
            )}
          </button>
        </div>
          <div className="transport">
            <div className="download-wrap">
              {sourceType === 'video' || sourceType === 'webcam' ? (
                <>
                  {sourceType === 'webcam' && (
                    <button className="console-btn" onClick={handleSnapshot} title="Save current frame as PNG">📷 Snap</button>
                  )}
                  {recording ? (
                    <button className="console-btn primary recording" onClick={handleRecordStop}>■ Stop &amp; Save</button>
                  ) : (
                    <>
                      <button className="console-btn primary" onClick={() => setShowFormatPicker(p => !p)}>● Record ▾</button>
                      {showFormatPicker && (
                        <div className="format-picker">
                          {['webm', 'mp4'].map(fmt => (
                            <button key={fmt} className="fmt-option" onClick={() => {
                              setExportFormat(fmt); setShowFormatPicker(false); handleRecordStartWith(fmt)
                            }}>{fmt.toUpperCase()}</button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <button className="console-btn primary" onClick={handleDownload}>↓ Download</button>
              )}
            </div>
            {sourceType === 'video' && (
              <button className="console-btn" onClick={togglePlay}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
            )}
          </div>
        </div>

        <div className="console-body">
          <section className="console-section sec-tone">
            <h3 className="console-section-title">Tone</h3>
            <div className="chip-row chip-row-tight">
              {GRADES.map(g => (
                <button
                  key={g.value}
                  className={`chip${params.colorGrade === g.value ? ' active' : ''}`}
                  onClick={() => set('colorGrade', g.value)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="knob-row">
              {MOD_CONFIG.filter(c => c.cat === 'tone').map(cfg => (
                <Knob key={cfg.key} label={cfg.label} cat={cfg.cat} min={cfg.min} max={cfg.max}
                  step={cfg.step} display={cfg.display} value={params[cfg.key]} onChange={v => set(cfg.key, v)} />
              ))}
            </div>
          </section>

          <section className="console-section sec-warp">
            <h3 className="console-section-title">Warp</h3>
            <div className="knob-row">
              {MOD_CONFIG.filter(c => c.cat === 'warp').map(cfg => (
                <Knob key={cfg.key} label={cfg.label} cat={cfg.cat} min={cfg.min} max={cfg.max}
                  step={cfg.step} display={cfg.display} value={params[cfg.key]} onChange={v => set(cfg.key, v)} />
              ))}
            </div>
          </section>

          <section className="console-section sec-corrupt">
            <h3 className="console-section-title">Corrupt</h3>
            <div className="knob-row">
              {MOD_CONFIG.filter(c => c.cat === 'corrupt').map(cfg => (
                <Knob key={cfg.key} label={cfg.label} cat={cfg.cat} min={cfg.min} max={cfg.max}
                  step={cfg.step} display={cfg.display} value={params[cfg.key]} onChange={v => set(cfg.key, v)} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── SliderRow ──────────────────────────────────────────────────────────────────
// ── Rotary knob control ────────────────────────────────────────────────────
// Hardware-style dial: drag up/down to turn, double-click to reset,
// click the value readout to type an exact number.
const KNOB_SWEEP = 270 // degrees, from -135° to +135°

function knobPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)]
}

function knobArc(cx, cy, r, a0, a1) {
  const [x0, y0] = knobPoint(cx, cy, r, a0)
  const [x1, y1] = knobPoint(cx, cy, r, a1)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

function Knob({ label, value, min, max, step, display, cat, onChange }) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const dragRef = useRef(null)
  const active = value > min

  const t = (value - min) / (max - min)
  const angle = -135 + t * KNOB_SWEEP

  function quantize(v) {
    const q = Math.round((v - min) / step) * step + min
    const clamped = Math.min(max, Math.max(min, q))
    return Math.round(clamped * 100) / 100
  }

  function onPointerDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { y: e.clientY, v: value }
  }

  function onPointerMove(e) {
    if (!dragRef.current) return
    const dy = dragRef.current.y - e.clientY
    onChange(quantize(dragRef.current.v + (dy / 150) * (max - min)))
  }

  function onPointerUp(e) {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  function handleValueClick() {
    setInputVal(String(max <= 1 ? Math.round(value * 100) : value))
    setEditing(true)
  }

  function commit(raw) {
    const num = parseFloat(raw)
    if (!isNaN(num)) onChange(quantize(max <= 1 ? num / 100 : num))
    setEditing(false)
  }

  return (
    <div className={`knob-unit cat-${cat}${active ? ' active' : ''}`}>
      <div
        className="knob-dial"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(min)}
        title="Drag up/down · double-click to reset"
      >
        <svg className="knob-svg" viewBox="0 0 64 64">
          {/* track */}
          <path d={knobArc(32, 32, 24, -135, 135)} className="knob-track" fill="none" />
          {/* value arc */}
          {t > 0.001 && (
            <path d={knobArc(32, 32, 24, -135, angle)} className="knob-value-arc" fill="none" />
          )}
          {/* cap */}
          <circle cx="32" cy="32" r="17" className="knob-cap" />
          <circle cx="32" cy="32" r="17" className="knob-cap-rim" fill="none" />
          {/* indicator */}
          {(() => {
            const [ix0, iy0] = knobPoint(32, 32, 7, angle)
            const [ix1, iy1] = knobPoint(32, 32, 14, angle)
            return <line x1={ix0} y1={iy0} x2={ix1} y2={iy1} className="knob-indicator" />
          })()}
        </svg>
      </div>
      <span className="knob-label">{label}</span>
      {editing ? (
        <input type="number" className="ctrl-value-input knob-input" value={inputVal} autoFocus
          onChange={e => setInputVal(e.target.value)}
          onBlur={() => commit(inputVal)}
          onKeyDown={e => { if (e.key === 'Enter') commit(inputVal); if (e.key === 'Escape') setEditing(false) }} />
      ) : (
        <span className="knob-value" onClick={handleValueClick} title="Click to type">{display(value)}</span>
      )}
    </div>
  )
}

function pct(v) { return `${Math.round(v * 100)}%` }

// ── CPU destructive effects (original quality) ────────────────────────────────

function applyPixelSort(imageData, intensity, width, height) {
  const d = imageData.data
  const threshold = 1 - intensity
  for (let y = 0; y < height; y++) {
    const brightness = x => {
      const idx = (y * width + x) * 4
      return (d[idx] + d[idx+1] + d[idx+2]) / 765
    }
    let start = -1
    for (let x = 0; x < width; x++) {
      if (brightness(x) > threshold && start === -1) start = x
      if ((brightness(x) <= threshold || x === width - 1) && start !== -1) {
        const segment = []
        for (let sx = start; sx < x; sx++) {
          const idx = (y * width + sx) * 4
          segment.push([d[idx], d[idx+1], d[idx+2], d[idx+3], brightness(sx)])
        }
        segment.sort((a, b) => a[4] - b[4])
        for (let sx = start; sx < x; sx++) {
          const idx = (y * width + sx) * 4
          const s = segment[sx - start]
          d[idx] = s[0]; d[idx+1] = s[1]; d[idx+2] = s[2]
        }
        start = -1
      }
    }
  }
  return imageData
}

function applyBlockGlitch(imageData, numBlocks, width, height) {
  numBlocks = Math.floor(numBlocks)
  const d = imageData.data
  for (let b = 0; b < numBlocks; b++) {
    const bx = Math.floor(Math.random() * width)
    const by = Math.floor(Math.random() * height)
    const bw = Math.floor(Math.random() * 80 + 10)
    const bh = Math.floor(Math.random() * 15 + 3)
    const offsetX = Math.floor((Math.random() - 0.5) * 40)
    for (let y = by; y < Math.min(by + bh, height); y++) {
      for (let x = bx; x < Math.min(bx + bw, width); x++) {
        const srcX = Math.min(width - 1, Math.max(0, x + offsetX))
        const dst = (y * width + x) * 4
        const src = (y * width + srcX) * 4
        d[dst] = d[src]; d[dst+1] = d[src+1]; d[dst+2] = d[src+2]
      }
    }
  }
  return imageData
}

function applySmear(imageData, intensity, width, height) {
  const d = imageData.data
  const copy = new Uint8ClampedArray(d)
  const maxSmear = Math.floor(intensity * width * 0.6)
  for (let y = 0; y < height; y++) {
    if (Math.random() < intensity * 0.6) {
      const smearLen = Math.floor(Math.random() * maxSmear + 10)
      const startX = Math.floor(Math.random() * (width - smearLen))
      const srcIdx = (y * width + startX) * 4
      for (let x = startX; x < Math.min(startX + smearLen, width); x++) {
        const dst = (y * width + x) * 4
        d[dst] = copy[srcIdx]; d[dst+1] = copy[srcIdx+1]; d[dst+2] = copy[srcIdx+2]
      }
    }
  }
  return imageData
}

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

function applyKaleidoscope(imageData, segments, width, height, lutRef) {
  segments = Math.floor(segments)
  if (segments < 2) return imageData
  const cached = lutRef.current
  if (cached.segments !== segments || cached.w !== width || cached.h !== height) {
    cached.lut = buildKaleidoLUT(segments, width, height)
    cached.segments = segments; cached.w = width; cached.h = height
  }
  const lut = cached.lut
  const d = imageData.data
  const copy = new Uint8ClampedArray(d)
  for (let i = 0; i < lut.length; i++) {
    const src = lut[i]
    if (src >= 0) {
      const dst = i * 4, s = src * 4
      d[dst] = copy[s]; d[dst+1] = copy[s+1]; d[dst+2] = copy[s+2]
    }
  }
  return imageData
}

function applyMelt(imageData, intensity, width, height) {
  const d = imageData.data
  for (let x = 0; x < width; x++) {
    if (Math.random() < intensity * 0.9) {
      const startY = Math.floor(Math.random() * height * 0.6)
      const len = Math.floor(Math.random() * height * intensity * 0.5 + 5)
      const srcIdx = (startY * width + x) * 4
      for (let y = startY + 1; y < Math.min(startY + len, height); y++) {
        const dst = (y * width + x) * 4
        d[dst] = d[srcIdx]; d[dst+1] = d[srcIdx+1]; d[dst+2] = d[srcIdx+2]
      }
    }
  }
  return imageData
}

// ── New destructive effects ───────────────────────────────────────────────────

// Shift each row left/right by a random amount — scrambles horizontal structure
function applyRowShift(imageData, intensity, width, height) {
  const d = imageData.data
  const copy = new Uint8ClampedArray(d)
  const maxShift = Math.floor(intensity * width)
  for (let y = 0; y < height; y++) {
    const shift = Math.floor((Math.random() * 2 - 1) * maxShift)
    for (let x = 0; x < width; x++) {
      const srcX = ((x - shift) % width + width) % width
      const dst = (y * width + x) * 4
      const src = (y * width + srcX) * 4
      d[dst] = copy[src]; d[dst+1] = copy[src+1]; d[dst+2] = copy[src+2]; d[dst+3] = copy[src+3]
    }
  }
  return imageData
}

// Pixel sort running on columns — creates vertical streaks instead of horizontal
function applyPixelSortVertical(imageData, intensity, width, height) {
  const d = imageData.data
  const threshold = 1 - intensity
  for (let x = 0; x < width; x++) {
    const lum = y => { const i = (y * width + x) * 4; return (d[i] + d[i+1] + d[i+2]) / 765 }
    let start = -1
    for (let y = 0; y < height; y++) {
      if (lum(y) > threshold && start === -1) start = y
      if ((lum(y) <= threshold || y === height - 1) && start !== -1) {
        const seg = []
        for (let sy = start; sy < y; sy++) {
          const i = (sy * width + x) * 4
          seg.push([d[i], d[i+1], d[i+2], lum(sy)])
        }
        seg.sort((a, b) => a[3] - b[3])
        for (let sy = start; sy < y; sy++) {
          const i = (sy * width + x) * 4
          const s = seg[sy - start]
          d[i] = s[0]; d[i+1] = s[1]; d[i+2] = s[2]
        }
        start = -1
      }
    }
  }
  return imageData
}

// Sort each RGB channel independently by its own value — destroys colour coherence
function applyChannelSort(imageData, intensity, width, height) {
  const d = imageData.data
  const thr = 1 - intensity
  for (let y = 0; y < height; y++) {
    for (const ch of [0, 1, 2]) {
      let start = -1
      for (let x = 0; x < width; x++) {
        const val = d[(y * width + x) * 4 + ch] / 255
        if (val > thr && start === -1) start = x
        if ((val <= thr || x === width - 1) && start !== -1) {
          const seg = []
          for (let sx = start; sx < x; sx++) seg.push(d[(y * width + sx) * 4 + ch])
          seg.sort((a, b) => a - b)
          for (let sx = start; sx < x; sx++) d[(y * width + sx) * 4 + ch] = seg[sx - start]
          start = -1
        }
      }
    }
  }
  return imageData
}
