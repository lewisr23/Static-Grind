// Thin wrapper over fetch for the accounts/presets API.
//
// Two things every call needs and neither is a default: credentials so the
// session cookie rides along cross-origin, and the CSRF token echoed back in a
// header. Everything else here is turning responses into either data or a typed
// error the UI can branch on.

import { isNative } from '../platform/native'

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

/**
 * Whether an accounts API exists to talk to.
 *
 * With no VITE_API_URL set, BASE falls back to localhost, which is right for
 * development and meaningless anywhere else — the deployed site would fire a
 * request at the visitor's own machine, get blocked as mixed content, and then
 * report itself "offline" as though a server were having a bad day. There is no
 * server. Better to know that up front and not ask.
 *
 * The localhost half of that test has to exclude the Android app. Capacitor
 * serves the WebView from https://localhost, so the hostname check would pass
 * there on every device — and "localhost" on a phone is the phone, not a dev
 * machine with a Spring server on :8080. Without the guard the app fires auth
 * requests at itself on launch. In the app, accounts exist only when
 * VITE_API_URL was actually set at build time.
 */
export const accountsAvailable =
  Boolean(import.meta.env.VITE_API_URL) ||
  (!isNative() && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname))

/** The server answered, and said no. `fields` is populated for validation failures. */
export class ApiError extends Error {
  constructor(status, message, fields = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

/**
 * The server could not be reached at all. Distinct from ApiError on purpose:
 * this one must never surface as a blocking error, because the tool itself
 * doesn't need the server. It falls back to local storage and carries on.
 */
export class OfflineError extends Error {
  constructor(cause) {
    super('Could not reach the server.')
    this.name = 'OfflineError'
    this.cause = cause
  }
}

// Set by the backend, deliberately readable by script — that is what makes the
// double-submit work. Absent until the first response comes back, which is fine
// because GETs don't need it and the app opens with one.
function csrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

function parse(text) {
  try { return JSON.parse(text) } catch { return null }
}

async function request(method, path, body) {
  let response
  try {
    response = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'X-XSRF-TOKEN': csrfToken(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    // fetch rejects only when the request never completed — DNS failure, the
    // server being down, the machine being offline. An HTTP 500 resolves.
    throw new OfflineError(cause)
  }

  if (response.status === 204) return null

  const text = await response.text()
  const data = text ? parse(text) : null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.message || 'Something went wrong.',
      data?.fields || {},
    )
  }
  return data
}

export const api = {
  me:       ()               => request('GET',    '/api/auth/me'),
  register: (payload)        => request('POST',   '/api/auth/register', payload),
  login:    (payload)        => request('POST',   '/api/auth/login', payload),
  logout:   ()               => request('POST',   '/api/auth/logout'),

  listPresets:  ()           => request('GET',    '/api/presets'),
  createPreset: (payload)    => request('POST',   '/api/presets', payload),
  updatePreset: (id, payload) => request('PUT',   `/api/presets/${id}`, payload),
  deletePreset: (id)         => request('DELETE', `/api/presets/${id}`),
}
