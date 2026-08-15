import { useState, useEffect } from 'react'
import { getJobStatus } from '../api/glitch'

const POLL_INTERVAL = 3000 // ms

export default function JobStatus({ jobId, onReset }) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let timer

    async function poll() {
      try {
        const data = await getJobStatus(jobId)
        setJob(data)

        // Keep polling until terminal state
        if (data.status === 'PENDING' || data.status === 'PROCESSING') {
          timer = setTimeout(poll, POLL_INTERVAL)
        }
      } catch (err) {
        setError('Lost contact with backend.')
      }
    }

    poll()
    return () => clearTimeout(timer)
  }, [jobId])

  if (error) {
    return (
      <div className="status-panel">
        <p className="error-msg">{error}</p>
        <button className="reset-btn" onClick={onReset}>Try Again</button>
      </div>
    )
  }

  if (!job) {
    return <div className="status-panel"><p className="status-text">Connecting...</p></div>
  }

  return (
    <div className="status-panel">
      <StatusIndicator status={job.status} />

      {job.status === 'COMPLETED' && job.outputImageUrl && (
        <div className="result">
          <img src={job.outputImageUrl} alt="Glitched result" className="result-img" />
          <div className="result-actions">
            <a href={job.outputImageUrl} download className="download-btn">Download</a>
            <button className="reset-btn" onClick={onReset}>Make Another</button>
          </div>
        </div>
      )}

      {job.status === 'FAILED' && (
        <div>
          <p className="error-msg">Job failed: {job.errorMessage || 'Unknown error'}</p>
          <button className="reset-btn" onClick={onReset}>Try Again</button>
        </div>
      )}
    </div>
  )
}

function StatusIndicator({ status }) {
  const labels = {
    PENDING: '⏳ Queued...',
    PROCESSING: '⚡ Glitching your image...',
    COMPLETED: '✓ Done',
    FAILED: '✗ Failed',
  }

  return (
    <div className={`status-badge status-${status.toLowerCase()}`}>
      {labels[status] || status}
    </div>
  )
}
