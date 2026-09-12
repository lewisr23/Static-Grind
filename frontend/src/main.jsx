import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthProvider'
import { initNativeShell } from './platform/native'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)

// Android only — a no-op in the browser. Deliberately after render rather than
// before it: this is what hides the splash screen, and hiding it before React
// has painted would show a black gap instead of the app.
initNativeShell()
