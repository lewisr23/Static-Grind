import { useEffect, useRef, useState } from 'react'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { WebGLRenderer } from '../webgl/renderer'
import { CPU_KEYS, hasCpuWork } from '../effects/cpu'
import { CpuPass } from '../effects/client'
import { IconShuffle, IconDie, IconUndo, IconEject, IconCamera, IconRecordDot, IconDownload, IconPlay, IconPause, IconSave } from './icons'
import { useAuth } from '../auth/AuthProvider'
import { usePresetBank, MAX_NAME } from '../presets/usePresetBank'
import { fireEasterEgg, createStopToStopWatcher } from '../easterEgg'
import { saveFileNative } from '../platform/native'

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
  glitchcore: {
    blockGlitch: 0.75, pixelSort: 0.65, chromaShift: 32, noise: 0.22,
    smear: 0.35, interlace: 14, bitCrush: 0.3, colorGrade: 'neon',
  },
  neonRot: {
    colorGrade: 'neon', chromaShift: 22, waveWarp: 16, hueShift: 48,
    noise: 0.1, feedback: 0.12, pixelSort: 0.3,
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
  glitchcore: 'Calcium', neonRot: 'Nerve', staticField: 'Mold', prismBreak: 'Seam',
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
// Every browser on iOS is WebKit under the hood, Apple requires it, so this
// catches Chrome/Firefox/Edge on iPhone too, not just Safari by name. WebCodecs
// there can pass every capability check (VideoEncoder exists, isConfigSupported
// says yes, individual frames encode fine) and still fail once flush/finalize
// runs, a real device confirmed exactly that failure mode. Feature detection
// can't catch a break that deep in the pipeline, so this is a deliberate
// platform check rather than the usual feature-detection-only approach: MP4
// simply isn't offered there, only the WEBM path, which does work everywhere.
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const RECORD_FORMATS = IS_IOS ? ['webm'] : ['webm', 'mp4']

async function saveFile(blob, filename, mimeType) {
  // Android app first. Neither branch below works inside a WebView: Web Share
  // isn't implemented there, so canShare is undefined, and `<a download>` is
  // silently inert. Returns false in a browser, so the web path is unchanged.
  try {
    if (await saveFileNative(blob, filename, mimeType)) return
  } catch (err) {
    console.warn('Native save failed, falling back:', err)
  }

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
  const [saving, setSaving]               = useState(false)
  // Narrow screens show one control group at a time under the picture so the
  // picture and the knobs share the screen without scrolling. Ignored on wide
  // screens, where both rails are always visible.
  const [mobileTab, setMobileTab]         = useState('tone')
  const [saveName, setSaveName]           = useState('')
  const [saveError, setSaveError]         = useState(null)
  const [selectedSavedId, setSelectedSavedId] = useState('')
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
  // Knobs the user has pinned. A locked knob won't move for a drag, and
  // nothing that rewrites the whole patch — Random, Clear, a preset — is
  // allowed to touch it either. That's the point: keep the one setting you
  // like and go on rolling the rest.
  const [lockedKeys, setLockedKeys] = useState([])
  const lockTargetRef = useRef(null)  // knob under the pointer, or focused

  // Ctrl on its own — pressed and released with nothing in between — locks
  // whichever knob is under the pointer or focused. Watching keyup rather than
  // keydown is what keeps Ctrl+C, Ctrl+Z and every other shortcut working:
  // anything pressed while Ctrl is held disarms it.
  useEffect(() => {
    let armed = false
    const disarm = () => { armed = false }
    function onKeyDown(e) {
      if (e.key === 'Control') { if (!e.repeat) armed = true; return }
      armed = false
    }
    function onKeyUp(e) {
      if (e.key !== 'Control') return
      const fire = armed && lockTargetRef.current
      armed = false
      if (!fire) return
      const key = lockTargetRef.current
      setLockedKeys(keys => keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key])
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', disarm)
    window.addEventListener('pointerdown', disarm)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', disarm)
      window.removeEventListener('pointerdown', disarm)
    }
  }, [])

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

  // Slamming Pixel Sort from 0 to 100 and back three times inside five
  // seconds is the way into the egg that works without a keyboard.
  const sortWatcherRef = useRef(null)
  if (!sortWatcherRef.current) {
    sortWatcherRef.current = createStopToStopWatcher(0, 1, fireEasterEgg)
  }

  const { status: authStatus, user } = useAuth()
  const bank = usePresetBank(authStatus, user?.id)

  function loadSaved(preset) {
    setSelectedPreset('')
    setSelectedSavedId(preset.id)
    applyParams({ ...DEFAULT_PARAMS, ...preset.params })
    // A saved preset carries the seed it was saved with, so the corruption
    // lands exactly where it did when you liked it. Without this the knobs
    // come back but the look doesn't.
    if (preset.seed != null) setSeed(preset.seed >>> 0)
  }

  async function deleteSaved(event, preset) {
    event.stopPropagation()
    if (selectedSavedId === preset.id) setSelectedSavedId('')
    try { await bank.remove(preset.id) } catch { /* surfaced via bank.notice */ }
  }

  function openSave() {
    const current = bank.presets.find(p => p.id === selectedSavedId)
    setSaveName(current ? current.name : '')
    setSaveError(null)
    setSaving(true)
  }

  async function submitSave(event) {
    event.preventDefault()
    try {
      const saved = await bank.save(saveName, params, seed)
      setSelectedSavedId(saved.id)
      setSelectedPreset('')
      setSaving(false)
    } catch (err) {
      setSaveError(err.message || 'Could not save that.')
    }
  }

  // Only four effects draw from the seeded RNG (see applyCpuChain in
  // effects/cpu.js): row shift, block glitch, smear and melt. Everything else
  // is deterministic, pixel sorts included — they look random but aren't. So
  // with none of these four engaged, reseeding changes a number nothing reads,
  // and the button sits there looking broken. It disables itself instead.
  const RESEEDABLE = ['rowShift', 'blockGlitch', 'smear', 'melt']
  const canReseed = RESEEDABLE.some(key => params[key] > 0)

  function set(key, value) {
    if (lockedKeys.includes(key)) return
    if (key === 'pixelSort') sortWatcherRef.current(value)
    setParams(p => ({ ...p, [key]: value }))
  }

  // Whole-patch changes — Random, Clear, any preset — go through here so a
  // locked knob holds its value instead of being overwritten.
  function applyParams(next) {
    setParams(prev => {
      if (lockedKeys.length === 0) return next
      const merged = { ...next }
      for (const key of lockedKeys) merged[key] = prev[key]
      return merged
    })
  }

  function handleRandomize() {
    const rnd = (min, max, int = false) => {
      const v = min + Math.random() * (max - min)
      return int ? Math.round(v) : Math.round(v * 100) / 100
    }
    const maybe = (prob, min, max, int = false) => Math.random() < prob ? rnd(min, max, int) : 0
    const grades = ['none', 'vhs', 'neon', 'grayscale', 'infrared']
    setSelectedPreset('')
    setSeed((Math.random() * 0xffffffff) >>> 0)
    applyParams({
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
    // Safari's MediaRecorder has never supported WebM output at all - VP8/VP9
    // decode doesn't exist anywhere in iOS, not in Safari, not in Photos, not
    // in Files, so a WebM ever landing on that device is unplayable no matter
    // how it gets there. What Safari's MediaRecorder does support directly is
    // MP4/H.264, so this asks the browser what it can actually produce rather
    // than assuming WebM and letting Safari silently do something else with it.
    //
    // isTypeSupported('video/webm') itself can't be trusted to answer that on
    // iOS: WebKit reports true for the bare 'video/webm' string (no codecs)
    // despite having no encoder behind it, so a naive capability check still
    // picks WebM and produces the same unplayable file. Skip WebM outright on
    // iOS instead of asking a capability check known to lie about it there.
    const candidates = IS_IOS
      ? [
          { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4' },
          { mimeType: 'video/mp4', ext: 'mp4' },
        ]
      : [
          { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
          { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
          { mimeType: 'video/webm', ext: 'webm' },
          { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4' },
          { mimeType: 'video/mp4', ext: 'mp4' },
        ]
    const picked = candidates.find(c => MediaRecorder.isTypeSupported(c.mimeType))
    if (!picked) {
      alert('This browser can\'t record video.')
      return
    }
    const recorder = new MediaRecorder(stream, { mimeType: picked.mimeType })
    const chunks = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      // The saved file's type and extension follow whatever was actually
      // negotiated above, not a hardcoded guess - a real MP4 labelled .webm
      // (or the reverse) is exactly the kind of mismatch that leaves Photos
      // and Files unable to make sense of a file that's otherwise perfectly fine.
      const mimeType = picked.mimeType.split(';')[0]
      const blob = new Blob(chunks, { type: mimeType })
      saveFile(blob, `staticgrind-output.${picked.ext}`, mimeType)
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

  // The knobs for one category. Each rail stacks its categories vertically,
  // so this is the only thing that changes between the sections.
  const knobsFor = cat => MOD_CONFIG.filter(c => c.cat === cat).map(cfg => (
    <Knob key={cfg.key} label={cfg.label} cat={cfg.cat} min={cfg.min} max={cfg.max} def={cfg.def}
      step={cfg.step} display={cfg.display} value={params[cfg.key]} onChange={v => set(cfg.key, v)}
      locked={lockedKeys.includes(cfg.key)}
      onAim={on => {
        if (on) lockTargetRef.current = cfg.key
        else if (lockTargetRef.current === cfg.key) lockTargetRef.current = null
      }} />
  ))

  return (
    <div className="glitch-workspace" data-tab={mobileTab}>
      {/* Hidden WebGL canvas */}
      <canvas ref={glCanvasRef} style={{ display: 'none' }} />

      {/* ── Left rail: Tone + Warp ──
          Three categories don't split evenly across two sides, so the split is
          by height instead: Tone (small) + Warp on the left, Corrupt + the two
          preset banks on the right come out roughly level. */}
      <aside className="rail rail-left">
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
          <div className="knob-row">{knobsFor('tone')}</div>
        </section>

        <section className="console-section sec-warp">
          <h3 className="console-section-title">Warp</h3>
          <div className="knob-row">{knobsFor('warp')}</div>
        </section>
      </aside>

      {/* ── Display: the canvas, with export on one side of the transport and
          the mod actions on the other. Sticky, so if the rails ever run longer
          than the screen the picture stays put while they scroll past. ── */}
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
          <div className="transport-group">
            <div className="download-wrap">
              {sourceType === 'video' || sourceType === 'webcam' ? (
                <>
                  {sourceType === 'webcam' && (
                    <button className="console-btn" onClick={handleSnapshot} title="Save current frame as PNG"><IconCamera /> Snap</button>
                  )}
                  {recording ? (
                    <button className="console-btn primary recording" onClick={handleRecordStop}>■ Stop &amp; Save</button>
                  ) : RECORD_FORMATS.length === 1 ? (
                    // Only one working format on this platform — recording
                    // straight into it beats showing a dropdown with one item.
                    <button className="console-btn primary" onClick={() => handleRecordStartWith(RECORD_FORMATS[0])}>
                      <IconRecordDot /> Record
                    </button>
                  ) : (
                    <>
                      <button className="console-btn primary" onClick={() => setShowFormatPicker(p => !p)}><IconRecordDot /> Record ▾</button>
                      {showFormatPicker && (
                        <div className="format-picker">
                          {RECORD_FORMATS.map(fmt => (
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

          <div className="transport-group transport-actions">
            <button className="console-btn" onClick={handleRandomize} title="Roll every knob that isn't locked"><IconShuffle /> Random</button>
            <button
              className="console-btn"
              onClick={() => setSeed((Math.random() * 0xffffffff) >>> 0)}
              disabled={!canReseed}
              title={canReseed
                ? 'Reroll the random placement without touching the knobs'
                : 'Needs Row Shift, Block Glitch, Smear or Melt above zero — nothing else uses the seed'}
            >
              <IconDie /> Reseed
            </button>
            <button className="console-btn" onClick={() => { applyParams(DEFAULT_PARAMS); setSelectedPreset(''); setSelectedSavedId('') }}><IconUndo /> Clear</button>
            <button className="console-btn" onClick={onReset} title="Load different media"><IconEject /> Eject</button>
          </div>
        </div>

        {/* Only rendered visibly below three-column width (CSS) */}
        <div className="mobile-tabs" role="tablist" aria-label="Control group">
          {[['tone', 'Tone'], ['warp', 'Warp'], ['corrupt', 'Corrupt'], ['presets', 'Presets']].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mobileTab === key}
              className={`chip${mobileTab === key ? ' active' : ''}`}
              onClick={() => setMobileTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right rail: Corrupt + presets ── */}
      <aside className="rail rail-right">
        <section className="console-section sec-corrupt">
          <h3 className="console-section-title">Corrupt</h3>
          <div className="knob-row">{knobsFor('corrupt')}</div>
        </section>

        <section className="console-section sec-presets">
          <h3 className="console-section-title">Presets</h3>
          <div className="chip-row chip-row-tight">
            <button
              className={`chip${selectedPreset === '' ? ' active' : ''}`}
              onClick={() => { setSelectedPreset(''); setSelectedSavedId(''); applyParams(DEFAULT_PARAMS) }}
            >
              None
            </button>
            {Object.keys(PRESETS).map(key => (
              <button
                key={key}
                className={`chip${selectedPreset === key ? ' active' : ''}`}
                onClick={() => { setSelectedPreset(key); setSelectedSavedId(''); applyParams({ ...DEFAULT_PARAMS, ...PRESETS[key] }) }}
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
        </section>

        {/* Saved presets: same chip styling as the built-ins above. Works
            signed out (localStorage) and signed in (server); the section only
            says which when it has something to say. */}
        <section className="console-section sec-saved">
          <div className="section-head">
            <h3 className="console-section-title">My Presets</h3>
            {!saving && (
              <button className="chip saved-save" onClick={openSave}><IconSave /> Save</button>
            )}
          </div>

          {saving ? (
            <form className="save-form" onSubmit={submitSave}>
              <input
                className="save-input"
                value={saveName}
                onChange={e => { setSaveName(e.target.value); setSaveError(null) }}
                placeholder="Name this look"
                maxLength={MAX_NAME}
                autoFocus
                onKeyDown={e => { if (e.key === 'Escape') setSaving(false) }}
              />
              <button type="submit" className="chip" disabled={bank.busy}>Save</button>
              <button type="button" className="chip" onClick={() => setSaving(false)}>Cancel</button>
              {saveError && <span className="save-error">{saveError}</span>}
            </form>
          ) : bank.presets.length === 0 ? (
            <span className="saved-empty">
              Dial in a look and hit Save. {authStatus === 'anon' && 'Sign in to keep them across devices.'}
            </span>
          ) : (
            <div className="chip-row chip-row-tight saved-chips">
              {bank.presets.map(preset => (
                <span key={preset.id} className="saved-chip">
                  <button
                    className={`chip${selectedSavedId === preset.id ? ' active' : ''}`}
                    onClick={() => loadSaved(preset)}
                    // Without an explicit label the title wins the accessible
                    // name, so every saved preset announces as "Restores knobs
                    // and seed" and they become indistinguishable by ear.
                    aria-label={`Load ${preset.name}`}
                    title={preset.seed != null ? 'Restores knobs and seed' : 'Restores knobs'}
                  >
                    {preset.name}
                  </button>
                  <button
                    className="saved-del"
                    onClick={e => deleteSaved(e, preset)}
                    aria-label={`Delete ${preset.name}`}
                    title="Delete"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {bank.notice && (
            <button className="saved-notice" onClick={bank.clearNotice} title="Dismiss">
              {bank.notice}
            </button>
          )}
        </section>
      </aside>
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

// 23 segments across the 270° sweep, evenly spaced from stop to stop.
const KNOB_SEG_ANGLES = Array.from({ length: 23 }, (_, i) => -135 + (i * KNOB_SWEEP) / 22)

function Knob({ label, value, min, max, step, def = min, display, cat, onChange, locked = false, onAim }) {
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
    // A locked knob still takes focus — you need it focused to Ctrl it back
    // open — it just doesn't start a drag.
    if (locked) return
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
    if (locked) return
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
      // A locked knob doesn't swallow the wheel — let the rail scroll past it.
      if (locked) return
      e.preventDefault()
      const inc = (e.shiftKey ? step : Math.max(step, (max - min) / 40)) * (e.deltaY < 0 ? 1 : -1)
      onChange(quantize(value + inc))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [value, min, max, step, onChange, locked])

  function handleValueClick() {
    if (locked) return
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
    <div className={`knob-unit cat-${cat}${active ? ' active' : ''}${locked ? ' locked' : ''}`}>
      <div
        ref={dialRef}
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={locked ? `${label} (locked)` : label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-readonly={locked || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerEnter={() => onAim?.(true)}
        // Focus outlives the pointer: a knob you tabbed to stays the Ctrl
        // target after the mouse wanders off it.
        onPointerLeave={() => { if (document.activeElement !== dialRef.current) onAim?.(false) }}
        onFocus={() => onAim?.(true)}
        onBlur={() => onAim?.(false)}
        onKeyDown={onKeyDown}
        onDoubleClick={() => { if (!locked) onChange(def) }}
        title={locked
          ? 'Locked — Random, Clear and presets leave it alone · press Ctrl to unlock'
          : 'Drag or scroll to turn · hold Shift for fine · double-click to reset · press Ctrl to lock'}
      >
        <svg className="knob-svg" viewBox="0 0 64 64">
          {/* Segment ring: a bar-graph meter wrapped around the cap. Segments
              light from the knob's default outward, so a bipolar control fills
              from the centre rather than always from the left stop. */}
          {KNOB_SEG_ANGLES.map(a => {
            const [x0, y0] = knobPoint(32, 32, 30, a)
            const [x1, y1] = knobPoint(32, 32, 24, a)
            const lo = Math.min(defAngle, angle) - 0.5
            const hi = Math.max(defAngle, angle) + 0.5
            const lit = a >= lo && a <= hi && Math.abs(angle - defAngle) > 0.5
            return <line key={a} x1={x0} y1={y0} x2={x1} y2={y1} className={lit ? 'knob-seg lit' : 'knob-seg'} />
          })}
          {/* centre detent marker on bipolar knobs, just outside the ring */}
          {bipolar && (() => {
            const [dx0, dy0] = knobPoint(32, 32, 33, defAngle)
            const [dx1, dy1] = knobPoint(32, 32, 31.5, defAngle)
            return <line x1={dx0} y1={dy0} x2={dx1} y2={dy1} className="knob-detent" />
          })()}
          {/* the cap you'd actually grab, with a notch showing where it's turned to */}
          <circle cx="32" cy="32" r="18" className="knob-cap" />
          {(() => {
            const [ix0, iy0] = knobPoint(32, 32, 9, angle)
            const [ix1, iy1] = knobPoint(32, 32, 16, angle)
            return <line x1={ix0} y1={iy0} x2={ix1} y2={iy1} className="knob-notch" />
          })()}
        </svg>
        {/* Lock badge rides outside the ring rather than over the cap, so it
            never sits on top of the notch you're trying to read. */}
        {locked && (
          <svg className="knob-lock" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2.5" y="5.5" width="7" height="5.5" rx="1" />
            <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" />
          </svg>
        )}
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
