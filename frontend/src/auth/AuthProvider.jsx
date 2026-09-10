import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, OfflineError } from '../api/client'

const AuthContext = createContext(null)

/**
 * Who is signed in, if anyone.
 *
 * status is one of:
 *   loading  — the initial /me call is in flight
 *   authed   — signed in, `user` is populated
 *   anon     — server reachable, nobody signed in
 *   offline  — server unreachable; the tool works, accounts don't
 *
 * offline is a first-class state rather than an error because Static Grind's
 * actual job runs entirely in the browser. A backend that is down should cost
 * you your saved presets syncing, nothing else.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')

  const refresh = useCallback(async () => {
    try {
      const me = await api.me()
      setUser(me)
      setStatus('authed')
    } catch (err) {
      setUser(null)
      setStatus(err instanceof OfflineError ? 'offline' : 'anon')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Without this, loading the page while the API is down is a dead end: there
  // is no sign-in button in the offline state, so the only way back is knowing
  // to reload. Coming back to the tab is the cheapest moment to re-check.
  useEffect(() => {
    if (status !== 'offline') return
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [status, refresh])

  const signIn = useCallback(async (email, password) => {
    const me = await api.login({ email, password })
    setUser(me)
    setStatus('authed')
    return me
  }, [])

  const register = useCallback(async (email, password, displayName) => {
    const me = await api.register({ email, password, displayName })
    setUser(me)
    setStatus('authed')
    return me
  }, [])

  const signOut = useCallback(async () => {
    // If the call fails the session is still gone as far as this browser is
    // concerned. Refusing to sign someone out because the network blipped
    // would be worse than the stale row the server cleans up on expiry.
    try { await api.logout() } catch { /* intentionally ignored */ }
    setUser(null)
    setStatus('anon')
  }, [])

  return (
    <AuthContext.Provider value={{ user, status, signIn, register, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
