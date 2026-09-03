import { useRef, useState } from 'react'
import { IconUpload } from './icons'

export default function UploadForm({ onReady }) {
  const fileInputRef = useRef()
  const [isDragging, setIsDragging] = useState(false)

  function handleFile(file) {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) return
    onReady({ url: URL.createObjectURL(file), type: isVideo ? 'video' : 'image' })
  }

  async function handleCamera(e) {
    e.stopPropagation()
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      onReady({ url: null, type: 'webcam' })
    } catch (err) {
      alert('Camera access denied or unavailable.')
    }
  }

  return (
    <div className="upload-form">
      <div
        className={`drop-zone${isDragging ? ' dragging' : ''}`}
        onDrop={e => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]) }}
        onDragOver={e => e.preventDefault()}
        onDragEnter={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={e => { e.preventDefault(); setIsDragging(false) }}
        onClick={() => fileInputRef.current.click()}
      >
        <span className="corner c-tl" aria-hidden="true" />
        <span className="corner c-tr" aria-hidden="true" />
        <span className="corner c-bl" aria-hidden="true" />
        <span className="corner c-br" aria-hidden="true" />
        <div className="drop-hint">
          <span className="drop-icon"><IconUpload /></span>
          <p className="drop-main">DROP AN IMAGE OR VIDEO</p>
          <p className="drop-sub">JPG · PNG · WEBP · MP4 · WEBM — up to 10MB</p>
          <p className="awaiting">
            AWAITING SIGNAL<span className="blink">_</span>
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={e => handleFile(e.target.files[0])}
          hidden
        />
      </div>
      <button className="camera-btn" onClick={handleCamera}>
        Use Camera
      </button>
    </div>
  )
}
