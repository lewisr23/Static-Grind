import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, OfflineError } from '../api/client'

const KEY = 'staticgrind.presets.v1'
export const MAX_NAME = 40

// Versioned so the stored shape can change later without having to guess what
// an old blob meant.
function readLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Private mode, blocked site data, corrupt JSON. An empty bank is a fine
    // answer; throwing here would take the whole tool down with it.
    return []
  }
}

function writeLocal(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* nothing to do */ }
}

function localId() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random()}`
}

/**
 * The saved-preset bank, local first.
 *
 * Signed out, presets live in localStorage and everything works. Signed in, the
 * server is the source of truth and anything saved locally is migrated up on
 * the way in. If the server is unreachable at any point it falls back to local
 * rather than failing — saving a look you like must never depend on a network.
 */
export function usePresetBank(authStatus, userId) {
  const [presets, setPresets] = useState(readLocal)
  const [remote, setRemote] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (authStatus === 'loading') return

    if (authStatus !== 'authed') {
      setRemote(false)
      setPresets(readLocal())
      return
    }

    let cancelled = false
    ;(async () => {
      setBusy(true)
      try {
        // Anything saved before signing in comes with you. A name that already
        // exists on the server wins, so signing in never overwrites what is
        // already up there.
        const local = readLocal()
        let migrated = 0
        for (const preset of local) {
          try {
            await api.createPreset({ name: preset.name, params: preset.params, seed: preset.seed ?? null })
            migrated++
          } catch (err) {
            if (!(err instanceof ApiError && (err.status === 409 || err.status === 422))) throw err
          }
        }
        if (local.length) writeLocal([])

        const server = await api.listPresets()
        if (cancelled) return
        setPresets(server)
        setRemote(true)
        setNotice(migrated ? `${migrated} local preset${migrated === 1 ? '' : 's'} moved to your account.` : null)
      } catch (err) {
        if (cancelled) return
        setRemote(false)
        setPresets(readLocal())
        setNotice(err instanceof OfflineError ? 'Saved presets are offline. Still saving to this device.' : null)
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()

    return () => { cancelled = true }
  }, [authStatus, userId])

  const save = useCallback(async (name, params, seed) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Give the preset a name.')
    if (trimmed.length > MAX_NAME) throw new Error(`Names are limited to ${MAX_NAME} characters.`)

    const payload = { name: trimmed, params, seed: seed ?? null }

    if (remote) {
      try {
        const existing = presets.find(p => p.name.toLowerCase() === trimmed.toLowerCase())
        const saved = existing
          ? await api.updatePreset(existing.id, payload)
          : await api.createPreset(payload)
        setPresets(list => {
          const rest = list.filter(p => p.id !== saved.id)
          return [saved, ...rest]
        })
        return saved
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err
        // Dropped to local rather than losing the save. It goes up on the next
        // successful sign-in.
        setRemote(false)
        setNotice('Server unreachable. Saved to this device instead.')
      }
    }

    const local = readLocal()
    const now = new Date().toISOString()
    const existing = local.find(p => p.name.toLowerCase() === trimmed.toLowerCase())
    const saved = {
      id: existing?.id ?? localId(),
      name: trimmed,
      params,
      seed: seed ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    // localStorage holds only what is genuinely local...
    writeLocal([saved, ...local.filter(p => p.id !== saved.id)])

    // ...but the rail keeps showing whatever was already on screen. Dropping
    // to local mode mid-session must not look like the presets already loaded
    // from the server have been deleted. They are still there; this browser
    // just cannot reach them for the moment.
    setPresets(list => [
      saved,
      ...list.filter(p => p.id !== saved.id && p.name.toLowerCase() !== trimmed.toLowerCase()),
    ])
    return saved
  }, [remote, presets])

  const remove = useCallback(async (id) => {
    if (remote) {
      try {
        await api.deletePreset(id)
        setPresets(list => list.filter(p => p.id !== id))
        return
      } catch (err) {
        // Already gone server-side is the outcome we wanted anyway.
        if (err instanceof ApiError && err.status === 404) {
          setPresets(list => list.filter(p => p.id !== id))
          return
        }
        if (!(err instanceof OfflineError)) throw err
        setNotice('Server unreachable. Try again in a moment.')
        return
      }
    }
    const next = readLocal().filter(p => p.id !== id)
    writeLocal(next)
    setPresets(next)
  }, [remote])

  return { presets, save, remove, remote, busy, notice, clearNotice: () => setNotice(null) }
}
