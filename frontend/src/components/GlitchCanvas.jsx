import { useEffect, useRef, useState } from 'react'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { WebGLRenderer } from '../webgl/renderer'
import { CPU_KEYS, hasCpuWork } from '../effects/cpu'
import { CpuPass } from '../effects/client'
import { IconShuffle, IconDie, IconUndo, IconEject, IconCamera, IconRecordDot, IconDownload, IconPlay, IconPause } from './icons'

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
    melt: 0.72, smear: 0.55, blockGlitch: 0.3, noise: 0.06,
    colorGrade: 'none', hueShift: 0, waveWarp: 8,
  },
  glitchcore: {
    blockGlitch: 0.75, pixelSort: 0.65, chromaShift: 32, noise: 0.22,
    smear: 0.35, interlace: 14, bitCrush: 0.3, colorGrade: 'neon',
  },
  cathedral: {
    feedback: 0.38, colorGrade: 'neon', hueShift: 130,
    noise: 0.04, chromaShift: 6, waveWarp: 10,
  },
  datamosh: {
    smear: 0.8, interlace: 10, colorGrade: 'vhs', chromaShift: 14,
    noise: 0.07, blockGlitch: 0.25, displace: 18,
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
  { key: 'hueShift',          label: 'Hue Shift',     min: 0,  max: 360, step: 1,    def: 0, display: deg,      cat: 'tone' },
  { key: 'saturation',        label: 'Saturation',    min: -1, max: 1,   step: 0.01, def: 0, display: signedPct, cat: 'tone' },
  { key: 'vignette',          label: 'Vignette',      min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'tone' },
  { key: 'noise',             label: 'Noise',         min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'warp' },
  { key: 'chromaShift',       label: 'Chroma Shift',  min: 0,  max: 50,  step: 1,    def: 0, display: px,       cat: 'warp' },
  { key: 'interlace',         label: 'Interlace',     min: 0,  max: 30,  step: 1,    def: 0, display: px,       cat: 'warp' },
  { key: 'waveWarp',          label: 'Wave Warp',     min: 0,  max: 40,  step: 1,    def: 0, display: px,       cat: 'warp' },
  { key: 'bitCrush',          label: 'Bit Crush',     min: 0,  max: 1,   step: 0.01, def: 0, display: bits,     cat: 'warp' },
  { key: 'displace',          label: 'Displace',      min: 0,  max: 100, step: 1,    def: 0, display: px,       cat: 'warp' },
  { key: 'feedback',          label: 'Feedback',      min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'warp' },
  { key: 'scanlineIntensity', label: 'Scanlines',     min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'warp' },
  { key: 'pixelSort',         label: 'Pixel Sort',    min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'corrupt' },
  { key: 'sortVertical',      label: 'Sort Vertical', min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'corrupt' },
  { key: 'channelSort',       label: 'Channel Sort',  min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'corrupt' },
  { key: 'rowShift',          label: 'Row Shift',     min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'corrupt' },
  { key: 'blockGlitch',       label: 'Block Glitch',  min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'corrupt' },
  { key: 'smear',             label: 'Smear',         min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'corrupt' },
  { key: 'melt',              label: 'Melt',          min: 0,  max: 1,   step: 0.01, def: 0, display: pct,      cat: 'corrupt' },
  { key: 'kaleidoscope',      label: 'Kaleidoscope',  min: 0,  max: 8,   step: 1,    def: 0, display: segs,     cat: 'corrupt' },
]

// Every param the render loop reads, in a stable order — used to tell whether
// anything actually changed since the last drawn frame.
const PARAM_KEYS = ['colorGrade', ...MOD_CONFIG.map(c => c.key)]

/**
 * Gets a generated file onto the user's device. `<a download>` is what desktop
 * browsers want, but iOS Safari doesn't reliably honour it, especially for
 * video: the tab just sits there with nothing visibly happening, which is
 * exactly the "did it even work?" experience this replaces. The share sheet
 * (Save Video / Save Image / Save to Files) is the path iOS actually supports
 * for getting a blob a page generated onto the device, so that's tried first
 * wherever the browser claims to support sharing this file, and only falls
 * back to the plain download link where it doesn't.
 */
async function saveFile(blob, filename, mimeType) {
  const file = new File([blob], filename, { type: mimeType })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if (err.name === 'AbortError') return // user dismissed the share sheet
      console.warn('Share failed, falling back to direct download:', err)
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = filename
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
}

export default function GlitchCanvas({ sourceUrl, sourceType, onReset }) {
  // Two canvases: WebGL renders offscreen, 2D canvas is visible + handles CPU effects
  const canvasRef   = useRef()   // visible 2D canvas (exported, displayed)
  const glCanvasRef = useRef()   // hidden WebGL canvas
  const rendererRef  = useRef()
  const videoRef     = useRef()
  const rafRef       = useRef()
  const paramsRef    = useRef(DEFAULT_PARAMS)
  const startTimeRef   = useRef(performance.now())
  const seedRef        = useRef(0)
  const frameRef       = useRef(0)
  const cpuPassRef     = useRef(null)   // worker handle for the destructive pass
  const scratchRef     = useRef(null)   // offscreen 2D canvas the GPU output lands on
  const dirtyRef       = useRef(true)   // a frame is owed, e.g. the worker was busy
  const lastParamKeyRef = useRef('')
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
  const [fullscreenSupported] = useState(() => !!document.fullscreenEnabled)
  // Seeding the destructive pass is what lets a still hold still while you dial
  // a knob in. With Math.random the block and tear placement reshuffled on every
  // single nudge, so there was no way to converge on a look.
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)

  useEffect(() => { paramsRef.current = params }, [params])
  useEffect(() => { seedRef.current = seed; dirtyRef.current = true }, [seed])

  // One worker for the lifetime of the workspace. Results land straight on the
  // visible canvas, so the un-glitched intermediate is never shown.
  useEffect(() => {
    const pass = new CpuPass((bytes, w, h) => {
      const canvas = canvasRef.current
      if (!canvas || canvas.width !== w || canvas.height !== h) return
      canvas.getContext('2d').putImageData(new ImageData(bytes, w, h), 0, 0)
    })
    cpuPassRef.current = pass
    return () => { pass.destroy(); cpuPassRef.current = null }
  }, [])

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
    lastParamKeyRef.current = ''

    const time = () => (performance.now() - startTimeRef.current) / 1000

    function setSizes(w, h) {
      canvasRef.current.width = w
      canvasRef.current.height = h
      rendererRef.current?.setSize(w, h)
    }

    // Composite: WebGL output -> CPU destructive pass -> visible canvas.
    // `source` is null when the GPU texture is already current.
    //
    // Returns false if the destructive pass could not be started because the
    // worker was still busy; the caller keeps its dirty flag and retries.
    function composite(source, p, w, h, animating) {
      const renderer = rendererRef.current
      const canvas = canvasRef.current
      if (!renderer || !canvas) return true

      // GPU pass
      if (source) renderer.uploadSource(source)
      renderer.render(p, time())

      if (!hasCpuWork(p)) {
        canvas.getContext('2d').drawImage(glCanvasRef.current, 0, 0)
        return true
      }

      const pass = cpuPassRef.current
      if (!pass) return true
      if (pass.busy) return false

      // Stage the GPU output offscreen. Drawing it to the visible canvas first
      // would flash the un-glitched frame every time the worker turns one round.
      let scratch = scratchRef.current
      if (!scratch) { scratch = document.createElement('canvas'); scratchRef.current = scratch }
      if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h }
      const sctx = scratch.getContext('2d', { willReadFrequently: true })
      sctx.drawImage(glCanvasRef.current, 0, 0)

      // A still keeps one fixed seed so it is stable under knob moves; moving
      // sources advance it per frame so the corruption stays alive.
      const frameSeed = animating
        ? (seedRef.current + frameRef.current++) >>> 0
        : seedRef.current
      return pass.submit(sctx.getImageData(0, 0, w, h).data, w, h, p, frameSeed)
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
            if (video.readyState >= 2) composite(video, paramsRef.current, w, h, true)
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
          if (video.readyState >= 2) composite(video, paramsRef.current, w, h, true)
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      })

      video.load()
    } else {
      const img = new Image()
      img.onload = () => {
        // Cap stills too. A 6000px phone photo means the CPU pass chews through
        // 24M pixels a frame, which locks the tab solid.
        const MAX_W = 2048
        let w = img.naturalWidth, h = img.naturalHeight
        if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W }
        setSizes(w, h)
        startTimeRef.current = performance.now()

        // Downscale once into an offscreen canvas rather than letting the GPU
        // resample the full-size image on every upload
        let texSource = img
        if (w !== img.naturalWidth) {
          const scaler = document.createElement('canvas')
          scaler.width = w; scaler.height = h
          scaler.getContext('2d').drawImage(img, 0, 0, w, h)
          texSource = scaler
        }
        rendererRef.current?.uploadSource(texSource)
        dirtyRef.current = true

        const tick = () => {
          const p = paramsRef.current
          const key = PARAM_KEYS.map(k => p[k]).join(',')
          if (key !== lastParamKeyRef.current) {
            lastParamKeyRef.current = key
            dirtyRef.current = true
          }
          // Feedback needs successive frames to build a trail, so it keeps the
          // loop live. Everything else on a still is settled after one draw.
          if (dirtyRef.current || p.feedback > 0) {
            // Re-upload on a real change rather than once at load: it costs one
            // texImage2D per knob move, and it means the still survives the
            // renderer being rebuilt under it.
            const done = composite(dirtyRef.current ? texSource : null, p, w, h, false)
            // if the worker was busy this stays dirty and we retry next frame
            if (done) dirtyRef.current = false
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
    setSeed((Math.random() * 0xffffffff) >>> 0)
    setParams({
      colorGrade:       grades[Math.floor(Math.random() * grades.length)],
      hueShift:         maybe(0.6, 0, 340, true),
      saturation:       Math.random() < 0.5 ? rnd(-0.8, 0.8) : 0,
      vignette:         maybe(0.4, 0.1, 0.5),
      noise:            maybe(0.5, 0.02, 0.4),
      chromaShift:      maybe(0.5, 2, 40, true),
      pixelSort:        maybe(0.5, 0.1, 0.9),
      sortVertical:     maybe(0.4, 0.1, 0.9),
      channelSort:      maybe(0.4, 0.1, 0.85),
      rowShift:         maybe(0.4, 0.05, 0.7),
      blockGlitch:      maybe(0.4, 0.08, 0.8),
      smear:            maybe(0.4, 0.1, 0.8),
      interlace:        maybe(0.5, 2, 24, true),
      waveWarp:         maybe(0.5, 2, 30, true),
      bitCrush:         maybe(0.35, 0.1, 0.7),
      displace:         maybe(0.4, 5, 60, true),
      melt:             maybe(0.35, 0.1, 0.8),
      kaleidoscope:     Math.random() < 0.25 ? rnd(2, 8, true) : 0,
      feedback:         maybe(0.35, 0.05, 0.5),
      scanlineIntensity: maybe(0.4, 0.1, 0.7),
    })
  }

  function handleDownload() {
    canvasRef.current?.toBlob(blob => {
      if (blob) saveFile(blob, 'staticgrind-output.png', 'image/png')
    }, 'image/png')
  }

  // Grabs whatever's currently on the visible canvas (post-WebGL, post-CPU
  // glitch pass) as a still PNG — works for webcam and video sources, where
  // the transport only otherwise offers video recording.
  function handleSnapshot() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (blob) saveFile(blob, `staticgrind-snapshot-${Date.now()}.png`, 'image/png')
    }, 'image/png')
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
      saveFile(blob, 'staticgrind-output.webm', 'video/webm')
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

  async function startMp4() {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!('VideoEncoder' in window)) {
      alert('MP4 export needs a browser with WebCodecs support (Chrome, Edge, or Safari 16.4+). Try the WEBM format instead, it works everywhere.')
      return
    }
    const config = {
      codec: 'avc1.42001f', width: canvas.width, height: canvas.height,
      bitrate: 8_000_000, framerate: 30,
    }
    // isConfigSupported catches "the API exists but won't take this codec/
    // resolution" up front — this is exactly the gap that let the record
    // button silently do nothing on Safari before: VideoEncoder existing
    // isn't the same as this specific config being encodable.
    try {
      const support = await VideoEncoder.isConfigSupported(config)
      if (!support.supported) {
        alert('This browser can\'t encode MP4 at this resolution. Try the WEBM format instead.')
        return
      }
    } catch (err) {
      console.warn('isConfigSupported check failed, trying anyway:', err)
    }

    const target = new ArrayBufferTarget()
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: canvas.width, height: canvas.height },
      fastStart: 'in-memory',
    })
    let encoderBroken = false
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => {
        console.error('MP4 encoder:', e)
        encoderBroken = true
      },
    })
    try {
      encoder.configure(config)
    } catch (err) {
      alert('MP4 encoding failed to start on this browser. Try the WEBM format instead.')
      return
    }
    mp4EncoderRef.current = encoder
    mp4MuxerRef.current = muxer
    mp4TargetRef.current = target
    mp4FrameRef.current = 0
    mp4ActiveRef.current = true
    setRecording(true)
    const fps = 30
    let consecutiveFailures = 0
    const loop = () => {
      if (!mp4ActiveRef.current) return
      if (encoderBroken) {
        alert('MP4 recording failed partway through on this browser. Try the WEBM format instead.')
        mp4ActiveRef.current = false
        setRecording(false)
        return
      }
      const ts = Math.round((mp4FrameRef.current / fps) * 1_000_000)
      try {
        const frame = new VideoFrame(canvas, { timestamp: ts })
        encoder.encode(frame, { keyFrame: mp4FrameRef.current % 60 === 0 })
        frame.close()
        mp4FrameRef.current++
        consecutiveFailures = 0
      } catch (err) {
        // one bad frame isn't fatal, but a run of them means the encoder
        // has stopped working - that used to fail totally silently
        consecutiveFailures++
        if (consecutiveFailures === 1) console.error('MP4 frame encode failed:', err)
        if (consecutiveFailures >= 30) {
          alert('MP4 recording stopped working partway through on this browser. Try the WEBM format instead.')
          mp4ActiveRef.current = false
          setRecording(false)
          return
        }
      }
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
      if (e.target instanceof HTMLInputElement) return
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
    mp4ActiveRef.current = false
    // Recording state stays on through the flush/save below, rather than
    // clearing immediately: the button used to flip back to "Record" the
    // instant this ran, so a failure a moment later looked identical to
    // success - nothing to tell you it hadn't actually saved anything.
    try {
      await mp4EncoderRef.current.flush()
      mp4MuxerRef.current.finalize()
      const { buffer } = mp4TargetRef.current
      if (!buffer || buffer.byteLength === 0) throw new Error('empty output buffer')
      const blob = new Blob([buffer], { type: 'video/mp4' })
      await saveFile(blob, 'staticgrind-output.mp4', 'video/mp4')
    } catch (err) {
      console.error('MP4 finalize/save failed:', err)
      alert('MP4 export failed on this browser. Try the WEBM format instead, it works everywhere.')
    } finally {
      setRecording(false)
    }
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
          <span className="console-title">MOD CONSOLE</span>
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
            <button className="console-btn" onClick={handleRandomize}><IconShuffle /> Random</button>
            <button className="console-btn" onClick={() => setSeed((Math.random() * 0xffffffff) >>> 0)} title="Reroll the random placement without touching the knobs"><IconDie /> Reseed</button>
            <button className="console-btn" onClick={() => { setParams(DEFAULT_PARAMS); setSelectedPreset('') }}><IconUndo /> Clear</button>
            <button className="console-btn" onClick={onReset} title="Load different media"><IconEject /> Eject</button>
          </div>
        </div>

        <div className="console-display">
          <div className="canvas-wrapper" ref={canvasWrapperRef}>
          <canvas ref={canvasRef} className="result-img" />
          {/* iOS Safari has never implemented the Fullscreen API for anything
              but a bare <video>, so document.fullscreenEnabled is false there
              — a button that visibly does nothing on tap is worse than no
              button, so it just doesn't render rather than fake support. */}
          {fullscreenSupported && (
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
          )}
        </div>
          <div className="transport">
            <div className="download-wrap">
              {sourceType === 'video' || sourceType === 'webcam' ? (
                <>
                  {sourceType === 'webcam' && (
                    <button className="console-btn" onClick={handleSnapshot} title="Save current frame as PNG"><IconCamera /> Snap</button>
                  )}
                  {recording ? (
                    <button className="console-btn primary recording" onClick={handleRecordStop}>■ Stop &amp; Save</button>
                  ) : (
                    <>
                      <button className="console-btn primary" onClick={() => setShowFormatPicker(p => !p)}><IconRecordDot /> Record ▾</button>
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
                <button className="console-btn primary" onClick={handleDownload}><IconDownload /> Download</button>
              )}
            </div>
            {sourceType === 'video' && (
              <button className="console-btn" onClick={togglePlay}>{playing ? <><IconPause /> Pause</> : <><IconPlay /> Play</>}</button>
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
                <Knob key={cfg.key} label={cfg.label} cat={cfg.cat} min={cfg.min} max={cfg.max} def={cfg.def}
                  step={cfg.step} display={cfg.display} value={params[cfg.key]} onChange={v => set(cfg.key, v)} />
              ))}
            </div>
          </section>

          <section className="console-section sec-warp">
            <h3 className="console-section-title">Warp</h3>
            <div className="knob-row">
              {MOD_CONFIG.filter(c => c.cat === 'warp').map(cfg => (
                <Knob key={cfg.key} label={cfg.label} cat={cfg.cat} min={cfg.min} max={cfg.max} def={cfg.def}
                  step={cfg.step} display={cfg.display} value={params[cfg.key]} onChange={v => set(cfg.key, v)} />
              ))}
            </div>
          </section>

          <section className="console-section sec-corrupt">
            <h3 className="console-section-title">Corrupt</h3>
            <div className="knob-row">
              {MOD_CONFIG.filter(c => c.cat === 'corrupt').map(cfg => (
                <Knob key={cfg.key} label={cfg.label} cat={cfg.cat} min={cfg.min} max={cfg.max} def={cfg.def}
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
  // ordered, so an arc drawn backwards from a bipolar centre still renders
  const [x0, y0] = knobPoint(cx, cy, r, Math.min(a0, a1))
  const [x1, y1] = knobPoint(cx, cy, r, Math.max(a0, a1))
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

// Static calibration marks around the bezel, like the graduations on a scope
// dial. Purely decorative — evenly spaced across the sweep, independent of
// the knob's actual step size.
const KNOB_TICK_ANGLES = Array.from({ length: 11 }, (_, i) => -135 + i * (KNOB_SWEEP / 10))

function Knob({ label, value, min, max, step, def = min, display, cat, onChange }) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const dialRef = useRef(null)
  const dragRef = useRef(null)
  const active = value !== def
  const bipolar = min < 0 && max > 0

  const angle = -135 + ((value - min) / (max - min)) * KNOB_SWEEP
  const defAngle = -135 + ((def - min) / (max - min)) * KNOB_SWEEP

  function quantize(v) {
    const q = Math.round((v - min) / step) * step + min
    const clamped = Math.min(max, Math.max(min, q))
    return Math.round(clamped * 100) / 100
  }

  function onPointerDown(e) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dialRef.current?.focus()
    dragRef.current = { y: e.clientY, raw: value }
  }

  // Track an unquantised accumulator and rebase every move, so holding Shift
  // partway through a drag changes the gearing without the value jumping.
  function onPointerMove(e) {
    const st = dragRef.current
    if (!st) return
    const dy = st.y - e.clientY
    const gearing = e.shiftKey ? 0.15 : 1
    st.raw = Math.min(max, Math.max(min, st.raw + (dy / 180) * (max - min) * gearing))
    st.y = e.clientY
    onChange(quantize(st.raw))
  }

  function onPointerUp(e) {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  function onKeyDown(e) {
    const coarse = Math.max(step, (max - min) / 40)
    const inc = e.shiftKey ? step : coarse
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onChange(quantize(value + inc)) }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(quantize(value - inc)) }
    else if (e.key === 'Home' || e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onChange(def) }
    else if (e.key === 'PageUp') { e.preventDefault(); onChange(quantize(value + (max - min) / 8)) }
    else if (e.key === 'PageDown') { e.preventDefault(); onChange(quantize(value - (max - min) / 8)) }
  }

  // Wheel has to be bound natively: React routes wheel through a passive
  // listener at the root, where preventDefault is a no-op.
  //
  // Only a focused knob takes the wheel. Acting on hover alone means anyone
  // scrolling the page past the deck silently rewrites their patch.
  useEffect(() => {
    const el = dialRef.current
    if (!el) return
    const onWheel = e => {
      if (document.activeElement !== el) return
      e.preventDefault()
      const inc = (e.shiftKey ? step : Math.max(step, (max - min) / 40)) * (e.deltaY < 0 ? 1 : -1)
      onChange(quantize(value + inc))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [value, min, max, step, onChange])

  function handleValueClick() {
    setInputVal(String(max <= 1 ? Math.round(value * 100) : value))
    setEditing(true)
  }

  function commit(raw) {
    const num = parseFloat(raw)
    if (!isNaN(num)) onChange(quantize(max <= 1 ? num / 100 : num))
    setEditing(false)
  }

  const valueText = display(value)

  return (
    <div className={`knob-unit cat-${cat}${active ? ' active' : ''}`}>
      <div
        ref={dialRef}
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => onChange(def)}
        title="Drag or scroll to turn · hold Shift for fine · double-click to reset"
      >
        <svg className="knob-svg" viewBox="0 0 64 64">
          {/* calibration ticks — a static scope-dial bezel, not tied to value */}
          {KNOB_TICK_ANGLES.map(a => {
            const [x0, y0] = knobPoint(32, 32, 29, a)
            const [x1, y1] = knobPoint(32, 32, 25.5, a)
            return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} className="knob-tick" />
          })}
          {/* track */}
          <path d={knobArc(32, 32, 22, -135, 135)} className="knob-track" fill="none" />
          {/* value arc — grows from the knob's default, so a bipolar control
              reads outward from centre rather than always from the left stop */}
          {Math.abs(angle - defAngle) > 0.5 && (
            <path d={knobArc(32, 32, 22, defAngle, angle)} className="knob-value-arc" fill="none" />
          )}
          {/* centre detent marker on bipolar knobs */}
          {bipolar && (() => {
            const [dx0, dy0] = knobPoint(32, 32, 25, defAngle)
            const [dx1, dy1] = knobPoint(32, 32, 18.5, defAngle)
            return <line x1={dx0} y1={dy0} x2={dx1} y2={dy1} className="knob-detent" />
          })()}
          {/* needle — a full gauge pointer instead of a cap with a short tick */}
          {(() => {
            const [ix0, iy0] = knobPoint(32, 32, 4, angle)
            const [ix1, iy1] = knobPoint(32, 32, 20.5, angle)
            return <line x1={ix0} y1={iy0} x2={ix1} y2={iy1} className="knob-indicator" />
          })()}
          {/* pivot — open, not a filled cap, so the dial reads as a gauge, not a knob */}
          <circle cx="32" cy="32" r="2.4" className="knob-pivot" />
        </svg>
      </div>
      <span className="knob-label">{label}</span>
      {editing ? (
        <input type="number" className="ctrl-value-input knob-input" value={inputVal} autoFocus
          onChange={e => setInputVal(e.target.value)}
          onBlur={() => commit(inputVal)}
          onKeyDown={e => { if (e.key === 'Enter') commit(inputVal); if (e.key === 'Escape') setEditing(false) }} />
      ) : (
        <span className="knob-value" onClick={handleValueClick} title="Click to type">{valueText}</span>
      )}
    </div>
  )
}

function pct(v) { return v === 0 ? 'Off' : `${Math.round(v * 100)}%` }
function signedPct(v) {
  if (v === 0) return 'Off'
  return `${v > 0 ? '+' : '\u2212'}${Math.abs(Math.round(v * 100))}%`
}
function deg(v) { return v === 0 ? 'Off' : `${Math.round(v)}\u00B0` }
function px(v) { return v === 0 ? 'Off' : `${v}px` }
function segs(v) { return v < 2 ? 'Off' : `${v}\u00D7` }
// Bit Crush reads out in bits of depth, which is what the knob actually controls
function bits(v) {
  if (v === 0) return 'Off'
  return `${(8 - v * 7).toFixed(1)} bit`
}
