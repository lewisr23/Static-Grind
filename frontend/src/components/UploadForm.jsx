import { useRef } from 'react'

export default function UploadForm({ onReady }) {
  const fileInputRef = useRef()

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
        className="drop-zone"
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current.click()}
      >
        <div className="drop-hint">
          <span className="drop-icon">⬆</span>
          <p>Drop an image or video to upload</p>
          <p className="drop-sub">JPG, PNG, WEBP, MP4, WEBM up to 10MB</p>
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
