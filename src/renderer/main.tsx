// ============================================================================
//  Postie POS - Renderer entry
// ----------------------------------------------------------------------------
//  Mounts the React app. The App component wraps everything in AuthProvider
//  and handles routing between Login -> ShiftOpen -> Register.
// ============================================================================

import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
