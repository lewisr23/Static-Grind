import { useState } from 'react'
import { ApiError, OfflineError } from '../api/client'
import { useAuth } from './AuthProvider'

/**
 * Sign in / create account, as an overlay over the workspace.
 *
 * Nothing in the tool is gated behind this — it exists only to make saved
 * presets follow you between devices. The copy says so, because a sign-in wall
 * on a toy people are trying out for thirty seconds is how you lose them.
 */
export default function AuthPanel({ onClose }) {
  const { signIn, register } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      if (isRegister) await register(email, password, displayName)
      else await signIn(email, password)
      onClose()
    } catch (err) {
      if (err instanceof OfflineError) {
        setError("Can't reach the server. Your presets still save to this device.")
      } else if (err instanceof ApiError) {
        setError(err.message)
        setFieldErrors(err.fields || {})
      } else {
        setError('Something went wrong.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="auth-box" onSubmit={handleSubmit}>
        <span className="screw s-tl" aria-hidden="true" />
        <span className="screw s-tr" aria-hidden="true" />
        <span className="screw s-bl" aria-hidden="true" />
        <span className="screw s-br" aria-hidden="true" />

        <div className="auth-head">
          <span className="auth-title">{isRegister ? 'NEW ACCOUNT' : 'SIGN IN'}</span>
          <button type="button" className="auth-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p className="auth-blurb">
          Only for keeping presets across devices. Your images and video never leave the browser
          either way.
        </p>

        {isRegister && (
          <label className="auth-field">
            <span>Name</span>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={40}
              autoComplete="nickname"
              required
            />
            {fieldErrors.displayName && <em>{fieldErrors.displayName}</em>}
          </label>
        )}

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {fieldErrors.email && <em>{fieldErrors.email}</em>}
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
          />
          {fieldErrors.password && <em>{fieldErrors.password}</em>}
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="console-btn auth-submit" disabled={busy}>
          {busy ? 'Working' : isRegister ? 'Create account' : 'Sign in'}
        </button>

        <button
          type="button"
          className="auth-switch"
          onClick={() => { setMode(isRegister ? 'signin' : 'register'); setError(null); setFieldErrors({}) }}
        >
          {isRegister ? 'Already have an account? Sign in' : 'No account? Create one'}
        </button>
      </form>
    </div>
  )
}
