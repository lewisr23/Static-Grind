// Small line-icon set for the transport/console buttons. Plain SVG rather
// than Unicode symbol characters (the buttons used to lead with things like
// dice or die-face glyphs, which render as full-colour platform emoji on iOS)
// so every icon reliably inherits the button's own colour via currentColor.
const base = { viewBox: '0 0 14 14', width: 12, height: 12, 'aria-hidden': true }

export function IconShuffle() {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <path d="M7 2v10M2.5 4.5l9 5M11.5 4.5l-9 5" />
    </svg>
  )
}

export function IconDie() {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="2" y="2" width="10" height="10" rx="2" />
      <circle cx="4.3" cy="4.3" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.7" cy="4.3" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="4.3" cy="9.7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.7" cy="9.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconUndo() {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 7A4.5 4.5 0 1 1 9.5 3.4" />
      <path d="M9.3 1.4l0.5 2.3-2.3 0.4" />
    </svg>
  )
}

export function IconEject() {
  return (
    <svg {...base} fill="currentColor" stroke="none">
      <path d="M7 2l4.5 5h-9z" />
      <rect x="2.5" y="10" width="9" height="1.6" rx="0.3" />
    </svg>
  )
}

export function IconCamera() {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M2 4.5h2l1-1.5h4l1 1.5h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" />
      <circle cx="7" cy="8" r="2.1" />
    </svg>
  )
}

export function IconRecordDot() {
  return (
    <svg {...base} fill="currentColor" stroke="none">
      <circle cx="7" cy="7" r="4" />
    </svg>
  )
}

export function IconDownload() {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2v7M4 6.3L7 9.3L10 6.3" />
      <path d="M2.5 11.5h9" />
    </svg>
  )
}

export function IconPlay() {
  return (
    <svg {...base} fill="currentColor" stroke="none">
      <path d="M3.5 2.5v9l7-4.5z" />
    </svg>
  )
}

export function IconPause() {
  return (
    <svg {...base} fill="currentColor" stroke="none">
      <rect x="3.5" y="2.5" width="2.2" height="9" rx="0.4" />
      <rect x="8.3" y="2.5" width="2.2" height="9" rx="0.4" />
    </svg>
  )
}

// Bigger by default — this one stands alone as the drop zone's empty state.
export function IconUpload({ size = 40 }) {
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 12V2M3 6l4-4 4 4" />
    </svg>
  )
}
